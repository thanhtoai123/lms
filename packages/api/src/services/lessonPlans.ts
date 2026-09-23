/**
 * GIÁO ÁN CỦA TỪNG BUỔI HỌC (trang /scorm).
 *
 * Một buổi học giữ ĐÚNG MỘT giáo án đang dùng — slide .pdf hoặc gói SCORM .zip — và cả hai
 * chiếu trong cùng một khung xem. Đẩy bản mới sẽ thay bản cũ SAU KHI xử lý xong (không bao giờ
 * để buổi dạy "trống giáo án" giữa chừng vì một gói hỏng).
 *
 * Khác bản gốc ở hai điểm có chủ đích:
 *  1) giữ lại bản liền trước để "Dùng lại bản cũ" một chạm khi bản mới sai (bản gốc xoá luôn);
 *  2) màn hình cho biết cả KHOÁ còn thiếu giáo án ở những buổi nào, thay vì phải mở từng buổi.
 *
 * Giáo án là tài liệu (`documents`) có `lessonId` + `category = lesson_plan`, nên vẫn dùng chung
 * kho tài liệu, nhật ký truy cập và trình chạy SCORM sẵn có.
 */
import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { documents, documentVersions, documentAccessLogs, courses, curricula, lessons, users } from "@satarobo/db";
import {
  parseScormManifest, normalizeZipPath, planFileKind, validatePlanFile, planVersionState, planCoverage, humanSize,
  SCORM_MAX_FILES, PLAN_STUCK_MINUTES, PLAN_FILE_KIND_VI, type PlanFileKind,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { tenantCond } from "./tenantScope";
import { readableCourseIds } from "./documents";
import { writeAudit } from "./audit";
import { putObject, deleteObject, deletePrefix, signedFileUrl } from "../storage";
import { listZip, readZipEntry } from "../zip";

const bad = (m: string) => new TRPCError({ code: "BAD_REQUEST", message: m });
const pre = (m: string) => new TRPCError({ code: "PRECONDITION_FAILED", message: m });
const notFound = (m: string) => new TRPCError({ code: "NOT_FOUND", message: m });
const forbid = (m: string) => new TRPCError({ code: "FORBIDDEN", message: m });

/** Giáo án buổi học là tài liệu có nhóm này */
const PLAN_CATEGORY = "lesson_plan" as const;

function canEdit(ctx: ProtectedContext) {
  try {
    requirePermission(ctx, "document:update");
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Chọn khoá học → buổi học                                            */
/* ------------------------------------------------------------------ */

/**
 * Khoá học để chọn ở ô đầu tiên.
 * Giáo viên chỉ có `document:read_own` nên chỉ thấy khoá mình dạy — KHÔNG dùng requirePermission
 * ("document:read") ở đây, vì nó từ chối thẳng biến thể `_own` và làm cả trang lỗi 500.
 */
export async function planCourses(ctx: ProtectedContext) {
  const mine = await readableCourseIds(ctx);
  if (mine !== null && !mine.length) return [];
  // Cách ly nhượng quyền: chỉ khoá của trung tâm mình (tenantCond) — xem services/tenantScope.ts
  return ctx.db.select({ id: courses.id, code: courses.code, name: courses.name })
    .from(courses)
    .where(and(eq(courses.isActive, true), tenantCond(ctx, courses), mine === null ? sql`true` : inArray(courses.id, mine)))
    .orderBy(asc(courses.code));
}

/** Chặn đọc giáo án của khoá không thuộc phạm vi (giáo viên mở nhầm link khoá khác) */
async function assertCourseReadable(ctx: ProtectedContext, courseId: string) {
  const mine = await readableCourseIds(ctx);
  if (mine !== null && !mine.includes(courseId)) throw forbid("Không có quyền xem học liệu của khoá này");
}

/**
 * Danh sách buổi của khoá + buổi nào đã có giáo án (một truy vấn, không N+1).
 * `curriculumName` để màn hình nói rõ đang xem khung chương trình nào.
 */
export async function planLessons(ctx: ProtectedContext, input: { courseId: string }) {
  await assertCourseReadable(ctx, input.courseId);
  const rows = await ctx.db.select({
    id: lessons.id,
    sequenceNo: lessons.sequenceNo,
    title: lessons.title,
    curriculumName: curricula.name,
    planKind: documents.kind,
    planVersion: documents.currentVersion,
  })
    .from(lessons)
    .innerJoin(curricula, eq(curricula.id, lessons.curriculumId))
    .leftJoin(documents, and(eq(documents.lessonId, lessons.id), eq(documents.category, PLAN_CATEGORY), ne(documents.status, "archived")))
    .innerJoin(courses, eq(courses.id, curricula.courseId))
    .where(and(eq(curricula.courseId, input.courseId), eq(curricula.status, "active"), tenantCond(ctx, courses)))
    .orderBy(asc(lessons.sequenceNo));
  const items = rows.map((r) => ({
    id: r.id,
    sequenceNo: r.sequenceNo,
    title: r.title,
    hasPlan: !!r.planKind && (r.planVersion ?? 0) > 0,
    planKind: (r.planKind === "scorm" ? "scorm" : r.planKind ? "pdf" : null) as PlanFileKind | null,
  }));
  return {
    curriculumName: rows[0]?.curriculumName ?? null,
    items,
    coverage: planCoverage(items),
    /** Buổi đầu tiên còn thiếu — nút "Tới buổi chưa có giáo án" một chạm */
    firstMissing: items.find((l) => !l.hasPlan)?.id ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Giáo án của một buổi                                                */
/* ------------------------------------------------------------------ */

async function loadLesson(ctx: ProtectedContext, lessonId: string) {
  const [l] = await ctx.db.select({
    id: lessons.id, sequenceNo: lessons.sequenceNo, title: lessons.title,
    curriculumId: curricula.id, curriculumName: curricula.name, courseId: curricula.courseId,
  }).from(lessons)
    .innerJoin(curricula, eq(curricula.id, lessons.curriculumId))
    .innerJoin(courses, eq(courses.id, curricula.courseId))
    .where(and(eq(lessons.id, lessonId), tenantCond(ctx, courses)));
  if (!l) throw notFound("Không tìm thấy buổi học");
  return l;
}

async function planDoc(ctx: ProtectedContext, lessonId: string) {
  return ctx.db.query.documents.findFirst({
    where: and(eq(documents.lessonId, lessonId), eq(documents.category, PLAN_CATEGORY), ne(documents.status, "archived")),
  });
}

export async function getPlan(ctx: ProtectedContext, input: { lessonId: string }) {
  const lesson = await loadLesson(ctx, input.lessonId);
  await assertCourseReadable(ctx, lesson.courseId);
  const doc = await planDoc(ctx, input.lessonId);
  const edit = canEdit(ctx);
  if (!doc) return { lesson, plan: null, problems: [], previous: null, canEdit: edit };

  const vs = await ctx.db.select({ v: documentVersions, byName: users.fullName })
    .from(documentVersions).leftJoin(users, eq(users.id, documentVersions.uploadedBy))
    .where(eq(documentVersions.documentId, doc.id)).orderBy(desc(documentVersions.version));
  const now = new Date();
  const kind: PlanFileKind = doc.kind === "scorm" ? "scorm" : "pdf";
  const cur = vs.find((x) => x.v.version === doc.currentVersion && x.v.status === "ready");
  const plan = cur
    ? {
      documentId: doc.id,
      title: doc.title,
      kind,
      kindLabel: PLAN_FILE_KIND_VI[kind],
      version: cur.v.version,
      scormVersion: cur.v.scormVersion,
      fileCount: cur.v.fileCount,
      sizeBytes: cur.v.sizeBytes,
      sizeLabel: humanSize(cur.v.sizeBytes),
      fileName: cur.v.fileName,
      uploadedAt: cur.v.createdAt,
      byName: cur.byName,
      /** Xem thử: SCORM chạy trong trình chạy, PDF mở thẳng tệp có chữ ký */
      fileUrl: kind === "pdf" ? signedFileUrl(cur.v.objectKey, cur.v.fileName, 4 * 3600, true) : null,
    }
    : null;

  // Bản hỏng / kẹt: hiện một dòng cảnh báo kèm nút dọn (đúng như bản gốc)
  const problems = vs
    .filter((x) => x.v.status !== "ready")
    .map((x) => ({ version: x.v.version, fileName: x.v.fileName, ...planVersionState({ status: x.v.status, createdAt: x.v.createdAt, errorText: x.v.errorText }, now) }))
    .filter((p) => p.state !== "ready");

  // Bản liền trước còn giữ để dùng lại một chạm
  const prev = vs.find((x) => x.v.status === "ready" && x.v.version < (doc.currentVersion ?? 0));
  return {
    lesson,
    plan,
    problems,
    previous: prev ? { version: prev.v.version, fileName: prev.v.fileName, uploadedAt: prev.v.createdAt, sizeLabel: humanSize(prev.v.sizeBytes) } : null,
    canEdit: edit,
  };
}

/* ------------------------------------------------------------------ */
/* Đẩy bản mới                                                         */
/* ------------------------------------------------------------------ */

/** Xoá tệp của một phiên bản (cả thư mục gói SCORM đã giải nén) */
async function dropVersionFiles(documentId: string, version: number, objectKey: string) {
  await deleteObject(objectKey);
  await deletePrefix(`scorm/${documentId}/v${version}`);
  await deletePrefix(`docs/${documentId}/v${version}`);
}

/** Giải nén gói SCORM vào kho; trả về thông tin manifest */
async function unpackScorm(documentId: string, version: number, bytes: Uint8Array) {
  const buf = Buffer.from(bytes);
  let entries;
  try {
    entries = listZip(buf);
  } catch (e) {
    throw bad(`Không đọc được tệp .zip: ${(e as Error).message}`);
  }
  const files = entries.filter((e) => !e.isDir);
  if (files.length > SCORM_MAX_FILES) throw bad(`Gói có quá nhiều tệp (${files.length} > ${SCORM_MAX_FILES})`);
  const manifest = files.find((e) => /^([^/]+\/)?imsmanifest\.xml$/i.test(e.name));
  if (!manifest) throw bad("Không phải gói SCORM: thiếu imsmanifest.xml");
  const root = manifest.name.slice(0, manifest.name.length - "imsmanifest.xml".length);
  let m;
  try {
    m = parseScormManifest(readZipEntry(buf, manifest).toString("utf8"));
  } catch (e) {
    throw bad(`Không đọc được imsmanifest.xml: ${(e as Error).message}`);
  }
  const paths = new Set<string>();
  for (const f of files) {
    if (!f.name.startsWith(root)) continue;
    const rel = normalizeZipPath(f.name.slice(root.length));
    if (!rel) throw bad(`Đường dẫn không hợp lệ trong gói: ${f.name}`);
    if (/\.(exe|bat|cmd|sh|ps1|php|jsp|asp)$/i.test(rel)) throw bad(`Gói chứa tệp không cho phép: ${rel}`);
    paths.add(rel);
    await putObject(`scorm/${documentId}/v${version}/${rel}`, readZipEntry(buf, f));
  }
  if (!paths.has(m.launch)) throw bad(`Trang khởi chạy ${m.launch} không có trong gói`);
  return { version: m.version, launch: m.launch, files: paths.size, title: m.title };
}

/**
 * Đẩy & thay giáo án. Trình tự cố ý: ghi bản "đang xử lý" TRƯỚC khi giải nén, để nếu tiến trình
 * chết giữa chừng thì lần mở trang sau vẫn thấy bản kẹt và dọn được — thay vì rác tệp không ai biết.
 */
export async function uploadPlan(ctx: ProtectedContext, input: { lessonId: string; fileName: string; bytes: Uint8Array }) {
  requirePermission(ctx, "document:update");
  const err = validatePlanFile(input.fileName, input.bytes.byteLength);
  if (err) throw bad(err);
  const kind = planFileKind(input.fileName)!;
  const lesson = await loadLesson(ctx, input.lessonId);

  let doc = await planDoc(ctx, input.lessonId);
  // Đổi loại giáo án (PDF ↔ SCORM): tài liệu không đổi loại được nên lưu trữ bản cũ, mở tài liệu mới
  if (doc && ((kind === "scorm") !== (doc.kind === "scorm"))) {
    await ctx.db.update(documents).set({ status: "archived", updatedBy: ctx.user.id }).where(eq(documents.id, doc.id));
    doc = undefined;
  }
  const title = `Buổi ${lesson.sequenceNo} — ${lesson.title}`;
  if (!doc) {
    const [r] = await ctx.db.insert(documents).values({
      title, kind: kind === "scorm" ? "scorm" : "file", category: PLAN_CATEGORY, audience: "teacher", status: "published",
      courseId: lesson.courseId, lessonId: lesson.id, createdBy: ctx.user.id, updatedBy: ctx.user.id, publishedAt: new Date(),
    }).returning();
    doc = r!;
  } else if (doc.title !== title) {
    await ctx.db.update(documents).set({ title, updatedBy: ctx.user.id }).where(eq(documents.id, doc.id));
  }

  const sha = createHash("sha256").update(input.bytes).digest("hex");
  const [lastRow] = await ctx.db.select({ v: sql<number>`coalesce(max(${documentVersions.version}), 0)::int` })
    .from(documentVersions).where(eq(documentVersions.documentId, doc.id));
  const version = (lastRow?.v ?? 0) + 1;
  const name = `buoi-${lesson.sequenceNo}-v${version}.${kind === "scorm" ? "zip" : "pdf"}`;
  const key = `docs/${doc.id}/v${version}/${name}`;

  await ctx.db.insert(documentVersions).values({
    documentId: doc.id, version, objectKey: key, fileName: name,
    mimeType: kind === "scorm" ? "application/zip" : "application/pdf",
    sizeBytes: input.bytes.byteLength, sha256: sha, uploadedBy: ctx.user.id, status: "processing",
  });

  const fail = async (message: string) => {
    await ctx.db.update(documentVersions).set({ status: "failed", errorText: message.slice(0, 500), processedAt: new Date() })
      .where(and(eq(documentVersions.documentId, doc!.id), eq(documentVersions.version, version)));
    await dropVersionFiles(doc!.id, version, key);
  };

  let scorm: { version: string; launch: string; files: number } | null = null;
  try {
    await putObject(key, input.bytes);
    if (kind === "scorm") scorm = await unpackScorm(doc.id, version, input.bytes);
  } catch (e) {
    const message = e instanceof TRPCError ? e.message : `Xử lý tệp lỗi: ${(e as Error).message}`;
    await fail(message);
    throw e instanceof TRPCError ? e : bad(message);
  }

  const previousVersion = doc.currentVersion;
  await ctx.db.transaction(async (tx) => {
    await tx.update(documentVersions)
      .set({ status: "ready", processedAt: new Date(), scormVersion: scorm?.version ?? null, launchPath: scorm?.launch ?? null, fileCount: scorm?.files ?? null })
      .where(and(eq(documentVersions.documentId, doc!.id), eq(documentVersions.version, version)));
    await tx.update(documents).set({ currentVersion: version, status: "published", updatedBy: ctx.user.id }).where(eq(documents.id, doc!.id));
    await writeAudit(tx as never, {
      actorId: ctx.user.id, action: "CREATE", module: "content", entity: "document_versions", entityId: doc!.id,
      after: { lessonId: lesson.id, version, kind, size: input.bytes.byteLength, scorm }, ip: ctx.ip,
    });
  });

  // Thay xong mới dọn: giữ bản liền trước để dùng lại, xoá các bản cũ hơn cho đỡ tốn ổ đĩa
  const stale = await ctx.db.select({ version: documentVersions.version, objectKey: documentVersions.objectKey })
    .from(documentVersions)
    .where(and(eq(documentVersions.documentId, doc.id), sql`${documentVersions.version} < ${previousVersion}`));
  for (const s of stale) {
    await dropVersionFiles(doc.id, s.version, s.objectKey);
    await ctx.db.delete(documentVersions).where(and(eq(documentVersions.documentId, doc.id), eq(documentVersions.version, s.version)));
  }
  return { documentId: doc.id, version, kind, scorm };
}

/* ------------------------------------------------------------------ */
/* Dọn bản lỗi / gỡ / dùng lại bản cũ                                  */
/* ------------------------------------------------------------------ */

/** Xoá mọi bản hỏng hoặc kẹt của buổi này (một chạm) */
export async function cleanFailedPlan(ctx: ProtectedContext, input: { lessonId: string }) {
  requirePermission(ctx, "document:update");
  const doc = await planDoc(ctx, input.lessonId);
  if (!doc) throw notFound("Buổi này chưa có giáo án");
  const stuckBefore = new Date(Date.now() - PLAN_STUCK_MINUTES * 60_000);
  const rows = await ctx.db.select().from(documentVersions).where(and(
    eq(documentVersions.documentId, doc.id),
    ne(documentVersions.version, doc.currentVersion),
    sql`(${documentVersions.status} = 'failed' or (${documentVersions.status} = 'processing' and ${documentVersions.createdAt} <= ${stuckBefore}))`,
  ));
  for (const r of rows) {
    await dropVersionFiles(doc.id, r.version, r.objectKey);
    await ctx.db.delete(documentVersions).where(and(eq(documentVersions.documentId, doc.id), eq(documentVersions.version, r.version)));
  }
  if (rows.length) {
    await writeAudit(ctx.db, { actorId: ctx.user.id, action: "DELETE", module: "content", entity: "document_versions", entityId: doc.id, before: { versions: rows.map((r) => r.version) }, ip: ctx.ip });
  }
  return { removed: rows.length };
}

/** Gỡ giáo án khỏi buổi (xoá tệp, lưu trữ tài liệu — nhật ký truy cập vẫn còn để đối soát) */
export async function removePlan(ctx: ProtectedContext, input: { lessonId: string }) {
  requirePermission(ctx, "document:update");
  const doc = await planDoc(ctx, input.lessonId);
  if (!doc) throw notFound("Buổi này chưa có giáo án");
  const vs = await ctx.db.select().from(documentVersions).where(eq(documentVersions.documentId, doc.id));
  for (const v of vs) await dropVersionFiles(doc.id, v.version, v.objectKey);
  await ctx.db.delete(documentVersions).where(eq(documentVersions.documentId, doc.id));
  await ctx.db.update(documents).set({ status: "archived", currentVersion: 0, updatedBy: ctx.user.id }).where(eq(documents.id, doc.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "DELETE", module: "content", entity: "documents", entityId: doc.id, before: { lessonId: input.lessonId, versions: vs.length }, ip: ctx.ip });
  return { ok: true };
}

/** Dùng lại bản liền trước (khi bản mới sai nội dung) — bản gốc không có, thêm cho an toàn */
export async function restorePlanVersion(ctx: ProtectedContext, input: { lessonId: string; version: number }) {
  requirePermission(ctx, "document:update");
  const doc = await planDoc(ctx, input.lessonId);
  if (!doc) throw notFound("Buổi này chưa có giáo án");
  const v = await ctx.db.query.documentVersions.findFirst({ where: and(eq(documentVersions.documentId, doc.id), eq(documentVersions.version, input.version)) });
  if (!v) throw notFound("Không tìm thấy phiên bản");
  if (v.status !== "ready") throw pre("Bản này chưa xử lý xong hoặc bị lỗi");
  await ctx.db.update(documents).set({ currentVersion: v.version, updatedBy: ctx.user.id }).where(eq(documents.id, doc.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "content", entity: "documents", entityId: doc.id, before: { currentVersion: doc.currentVersion }, after: { currentVersion: v.version }, ip: ctx.ip });
  return { version: v.version };
}

/* ------------------------------------------------------------------ */
/* Xem giáo án (ghi nhật ký mở)                                        */
/* ------------------------------------------------------------------ */

export async function openPlan(ctx: ProtectedContext, input: { lessonId: string }) {
  const lesson = await loadLesson(ctx, input.lessonId);
  await assertCourseReadable(ctx, lesson.courseId);
  const doc = await planDoc(ctx, input.lessonId);
  if (!doc || !doc.currentVersion) throw pre("Buổi này chưa có giáo án");
  await ctx.db.insert(documentAccessLogs).values({ documentId: doc.id, version: doc.currentVersion, userId: ctx.user.id, action: "view" });
  return { documentId: doc.id, kind: (doc.kind === "scorm" ? "scorm" : "pdf") as PlanFileKind };
}

/* ------------------------------------------------------------------ */
/* Việc nền: đánh dấu bản kẹt                                          */
/* ------------------------------------------------------------------ */

/**
 * Bản "đang xử lý" quá lâu = tiến trình đã chết. Worker đánh dấu hỏng để màn hình nói đúng sự thật
 * và nút "Dọn bản lỗi" xuất hiện, không phụ thuộc người dùng có mở trang hay không.
 */
export async function sweepStuckPlanVersions(db: ProtectedContext["db"], now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - PLAN_STUCK_MINUTES * 60_000);
  const rows = await db.update(documentVersions)
    .set({ status: "failed", errorText: `Kẹt xử lý quá ${PLAN_STUCK_MINUTES} phút — máy chủ dừng giữa chừng. Dọn bản này rồi đẩy lại tệp.`, processedAt: now })
    .where(and(eq(documentVersions.status, "processing"), sql`${documentVersions.createdAt} <= ${cutoff}`))
    .returning({ id: documentVersions.id });
  return rows.length;
}

/** Danh sách buổi có giáo án hỏng / kẹt — để trang "Việc hôm nay" nhắc người phụ trách học liệu */
export async function plansNeedingAttention(ctx: ProtectedContext, input: { courseId?: string } = {}) {
  const mine = await readableCourseIds(ctx);
  if (mine !== null && !mine.length) return [];
  const rows = await ctx.db.select({
    lessonId: documents.lessonId, sequenceNo: lessons.sequenceNo, lessonTitle: lessons.title,
    courseCode: courses.code, version: documentVersions.version, status: documentVersions.status,
    createdAt: documentVersions.createdAt, errorText: documentVersions.errorText,
  })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .innerJoin(lessons, eq(lessons.id, documents.lessonId))
    .innerJoin(courses, eq(courses.id, documents.courseId))
    .where(and(
      eq(documents.category, PLAN_CATEGORY),
      ne(documents.status, "archived"),
      inArray(documentVersions.status, ["failed", "processing"]),
      input.courseId ? eq(documents.courseId, input.courseId) : sql`true`,
      mine === null ? sql`true` : inArray(documents.courseId, mine),
    ))
    .orderBy(asc(courses.code), asc(lessons.sequenceNo))
    .limit(50);
  const now = new Date();
  return rows
    .map((r) => ({ ...r, ...planVersionState({ status: r.status, createdAt: r.createdAt, errorText: r.errorText }, now) }))
    .filter((r) => r.state !== "processing");
}
