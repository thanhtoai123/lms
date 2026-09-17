import { createHash } from "node:crypto";
import { and, eq, inArray, sql, desc, asc, or, ilike, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  documents, documentVersions, documentAccessLogs, scormAttempts, lessonProposals, proposalComments,
  courses, curricula, lessons, classes, sessions, teacherCourses, users, userNotifications, userRoles,
} from "@satarobo/db";
import {
  authorize, hasPermission,
  validateDocFile, validateDocument, docTransition, safeFileName, fileExt, embedUrl, parseScormManifest, normalizeZipPath, scormStatusFromCmi, mergeScormStatus,
  DOC_FILE_TYPES, DOC_KIND_VI, DOC_CATEGORY_VI, DOC_STATUS_VI, SCORM_MAX_FILES, SCORM_STATUS_VI,
  proposalTransition, validateProposal, changedFields, proposalConflict, PROPOSAL_STATUS_VI, PROPOSAL_TYPE_VI,
  type DocKind, type DocAudience, type DocStatus, type DocCategory, type ScormStatus, type ProposalType, type ProposalStatus, type ProposalAction, type LessonPatch,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { putObject, signedFileUrl, signedScormBase } from "../storage";
import { listZip, readZipEntry } from "../zip";

type Db = ProtectedContext["db"];
const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });
const pre = (m: string | string[]) => new TRPCError({ code: "PRECONDITION_FAILED", message: Array.isArray(m) ? m.join("; ") : m });
const notFound = (m: string) => new TRPCError({ code: "NOT_FOUND", message: m });
const forbid = (m: string) => new TRPCError({ code: "FORBIDDEN", message: m });
const PAGE = 50;

function rule<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if ((e as Error)?.name === "ContentRuleError") throw pre((e as Error).message);
    throw e;
  }
}

/** Có quyền đọc toàn bộ kho tài liệu (Đào tạo, quản lý, giáo vụ, kiểm soát) */
function readsAll(ctx: ProtectedContext) {
  return ctx.actor.assignments.some((a) => authorize({ userId: ctx.actor.userId, assignments: [a] }, "document:read", {}).allowed);
}
function canEditDocs(ctx: ProtectedContext) {
  return authorize(ctx.actor, "document:update", {}).allowed;
}
/** Khoá GV được xem tài liệu: khoá được dạy + khoá của lớp đang dạy */
async function teacherCourseIds(db: Db, teacherId: string | null | undefined): Promise<string[]> {
  if (!teacherId) return [];
  const a = await db.select({ c: teacherCourses.courseId }).from(teacherCourses).where(eq(teacherCourses.teacherId, teacherId));
  const b = await db.select({ c: classes.courseId }).from(classes).where(sql`(${classes.leadTeacherId} = ${teacherId} or ${classes.assistantTeacherId} = ${teacherId})`);
  return [...new Set([...a, ...b].map((x) => x.c))];
}
async function docReadScope(ctx: ProtectedContext): Promise<SQL> {
  if (readsAll(ctx)) return sql`true`;
  if (!hasPermission(ctx.actor, "document:read")) throw forbid("Không có quyền xem tài liệu");
  const ids = await teacherCourseIds(ctx.db, ctx.actor.personId);
  return ids.length ? and(inArray(documents.courseId, ids), eq(documents.status, "published"))! : sql`false`;
}
async function loadDocForRead(ctx: ProtectedContext, id: string) {
  const d = await ctx.db.query.documents.findFirst({ where: eq(documents.id, id) });
  if (!d) throw notFound("Không tìm thấy tài liệu");
  if (readsAll(ctx)) return d;
  const ids = await teacherCourseIds(ctx.db, ctx.actor.personId);
  if (!hasPermission(ctx.actor, "document:read") || !ids.includes(d.courseId) || d.status !== "published") throw forbid("Tài liệu không thuộc khoá bạn dạy");
  return d;
}

/* ------------------------------------------------------------------ */
/* Tài liệu                                                             */
/* ------------------------------------------------------------------ */

export async function listDocuments(ctx: ProtectedContext, input: { courseId?: string; lessonId?: string; kind?: DocKind; status?: DocStatus; category?: DocCategory; q?: string; page?: number }) {
  const scope = await docReadScope(ctx);
  const conds: SQL[] = [scope];
  if (input.courseId) conds.push(eq(documents.courseId, input.courseId));
  if (input.lessonId) conds.push(eq(documents.lessonId, input.lessonId));
  if (input.kind) conds.push(eq(documents.kind, input.kind));
  if (input.status) conds.push(eq(documents.status, input.status));
  else if (!canEditDocs(ctx)) conds.push(eq(documents.status, "published"));
  if (input.category) conds.push(eq(documents.category, input.category));
  if (input.q?.trim()) conds.push(or(ilike(documents.title, `%${input.q.trim()}%`), sql`${documents.tags}::text ilike ${`%${input.q.trim()}%`}`)!);
  const page = input.page ?? 1;
  const where = and(...conds);
  const rows = await ctx.db.select({
    d: documents, courseCode: courses.code, lessonSeq: lessons.sequenceNo, lessonTitle: lessons.title,
    fileName: documentVersions.fileName, sizeBytes: documentVersions.sizeBytes, mimeType: documentVersions.mimeType, versionAt: documentVersions.createdAt,
    opens: sql<number>`(select count(*)::int from ${documentAccessLogs} l where l.document_id = ${documents.id})`,
  }).from(documents).innerJoin(courses, eq(courses.id, documents.courseId)).leftJoin(lessons, eq(lessons.id, documents.lessonId))
    .leftJoin(documentVersions, and(eq(documentVersions.documentId, documents.id), eq(documentVersions.version, documents.currentVersion)))
    .where(where).orderBy(asc(courses.code), sql`${lessons.sequenceNo} nulls first`, asc(documents.title)).limit(PAGE).offset((page - 1) * PAGE);
  const [c] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(documents).where(where);
  const courseOpts = await ctx.db.select({ id: courses.id, code: courses.code, name: courses.name }).from(courses).where(eq(courses.isActive, true)).orderBy(asc(courses.code));
  return {
    page, pageSize: PAGE, total: c?.n ?? 0, canEdit: canEditDocs(ctx), courses: courseOpts,
    items: rows.map((r) => ({
      ...r.d, kindLabel: DOC_KIND_VI[r.d.kind as DocKind], categoryLabel: DOC_CATEGORY_VI[r.d.category as DocCategory], statusLabel: DOC_STATUS_VI[r.d.status as DocStatus],
      courseCode: r.courseCode, lessonSeq: r.lessonSeq, lessonTitle: r.lessonTitle, fileName: r.fileName, sizeBytes: r.sizeBytes, mimeType: r.mimeType, versionAt: r.versionAt, opens: r.opens,
      hasContent: r.d.kind === "link" ? !!r.d.url : r.d.currentVersion > 0,
    })),
  };
}

export async function lessonOptions(ctx: ProtectedContext, courseId: string) {
  requirePermission(ctx, "course:read");
  return ctx.db.select({ id: lessons.id, sequenceNo: lessons.sequenceNo, title: lessons.title, curriculumName: curricula.name, curriculumStatus: curricula.status })
    .from(lessons).innerJoin(curricula, eq(curricula.id, lessons.curriculumId))
    .where(and(eq(curricula.courseId, courseId), inArray(curricula.status, ["active", "draft"]))).orderBy(desc(curricula.status), asc(lessons.sequenceNo));
}

export async function getDocument(ctx: ProtectedContext, id: string) {
  const d = await loadDocForRead(ctx, id);
  const [course] = await ctx.db.select({ code: courses.code, name: courses.name }).from(courses).where(eq(courses.id, d.courseId));
  const lesson = d.lessonId ? await ctx.db.query.lessons.findFirst({ where: eq(lessons.id, d.lessonId) }) : null;
  const versions = await ctx.db.select({ v: documentVersions, byName: users.fullName }).from(documentVersions).leftJoin(users, eq(users.id, documentVersions.uploadedBy))
    .where(eq(documentVersions.documentId, d.id)).orderBy(desc(documentVersions.version));
  const edit = canEditDocs(ctx);
  const access = edit || readsAll(ctx)
    ? await ctx.db.select({ action: documentAccessLogs.action, version: documentAccessLogs.version, createdAt: documentAccessLogs.createdAt, byName: users.fullName })
      .from(documentAccessLogs).leftJoin(users, eq(users.id, documentAccessLogs.userId)).where(eq(documentAccessLogs.documentId, d.id)).orderBy(desc(documentAccessLogs.createdAt)).limit(30)
    : [];
  const [stats] = await ctx.db.select({
    opens: sql<number>`count(*)::int`, users: sql<number>`count(distinct ${documentAccessLogs.userId})::int`,
  }).from(documentAccessLogs).where(eq(documentAccessLogs.documentId, d.id));
  const myAttempt = d.kind === "scorm" && d.currentVersion
    ? await ctx.db.query.scormAttempts.findFirst({ where: and(eq(scormAttempts.documentId, d.id), eq(scormAttempts.version, d.currentVersion), eq(scormAttempts.userId, ctx.user.id)) })
    : null;
  return {
    ...d, kindLabel: DOC_KIND_VI[d.kind as DocKind], categoryLabel: DOC_CATEGORY_VI[d.category as DocCategory], statusLabel: DOC_STATUS_VI[d.status as DocStatus],
    courseCode: course?.code ?? "", courseName: course?.name ?? "", lessonSeq: lesson?.sequenceNo ?? null, lessonTitle: lesson?.title ?? null,
    embed: d.kind === "link" && d.url ? embedUrl(d.url) : null,
    versions: versions.map((x) => ({ ...x.v, byName: x.byName, url: edit ? signedFileUrl(x.v.objectKey, x.v.fileName) : null })),
    access, stats: stats ?? { opens: 0, users: 0 }, canEdit: edit,
    myAttempt: myAttempt ? { status: myAttempt.status as ScormStatus, statusLabel: SCORM_STATUS_VI[myAttempt.status as ScormStatus], score: myAttempt.score, totalSeconds: myAttempt.totalSeconds, launches: myAttempt.launches } : null,
  };
}

export async function upsertDocument(ctx: ProtectedContext, input: {
  id?: string; title: string; description?: string | null; kind: DocKind; category: DocCategory; audience: DocAudience; courseId: string; lessonId?: string | null; url?: string | null; tags?: string[];
}) {
  requirePermission(ctx, input.id ? "document:update" : "document:create");
  const errs = validateDocument(input);
  if (errs.length) throw bad(errs);
  const course = await ctx.db.query.courses.findFirst({ where: eq(courses.id, input.courseId) });
  if (!course) throw notFound("Không tìm thấy khoá học");
  if (input.lessonId) {
    const [l] = await ctx.db.select({ courseId: curricula.courseId }).from(lessons).innerJoin(curricula, eq(curricula.id, lessons.curriculumId)).where(eq(lessons.id, input.lessonId));
    if (!l || l.courseId !== course.id) throw bad("Bài học không thuộc khoá đã chọn");
  }
  const tags = [...new Set((input.tags ?? []).map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 2 && t.length <= 30))].slice(0, 10);
  const v = {
    title: input.title.trim(), description: input.description?.trim() || null, category: input.category, audience: input.audience,
    courseId: course.id, lessonId: input.lessonId ?? null, url: input.kind === "link" ? input.url!.trim() : null, tags, updatedBy: ctx.user.id,
  };
  if (input.id) {
    const old = await ctx.db.query.documents.findFirst({ where: eq(documents.id, input.id) });
    if (!old) throw notFound("Không tìm thấy tài liệu");
    if (old.kind !== input.kind) throw pre("Không đổi loại tài liệu — tạo tài liệu mới");
    if (old.courseId !== course.id && old.currentVersion > 0) {
      const [p] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(documentAccessLogs).where(eq(documentAccessLogs.documentId, old.id));
      if ((p?.n ?? 0) > 0) throw pre("Tài liệu đã được sử dụng — không chuyển sang khoá khác");
    }
    await ctx.db.update(documents).set(v).where(eq(documents.id, old.id));
    await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "content", entity: "documents", entityId: old.id, before: { title: old.title, courseId: old.courseId, lessonId: old.lessonId, audience: old.audience }, after: v, ip: ctx.ip });
    return { id: old.id };
  }
  const [r] = await ctx.db.insert(documents).values({ ...v, kind: input.kind, createdBy: ctx.user.id }).returning({ id: documents.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "content", entity: "documents", entityId: r!.id, after: { ...v, kind: input.kind }, ip: ctx.ip });
  return { id: r!.id };
}

export async function addDocumentVersion(ctx: ProtectedContext, input: { documentId: string; fileName: string; bytes: Uint8Array; note?: string | null }) {
  requirePermission(ctx, "document:update");
  const d = await ctx.db.query.documents.findFirst({ where: eq(documents.id, input.documentId) });
  if (!d) throw notFound("Không tìm thấy tài liệu");
  if (d.kind === "link") throw pre("Tài liệu dạng liên kết không có tệp");
  if (d.status === "archived") throw pre("Tài liệu đã lưu trữ — phát hành lại trước khi tải bản mới");
  const err = validateDocFile(input.fileName, input.bytes.byteLength, d.kind as DocKind);
  if (err) throw bad(err);
  const sha = createHash("sha256").update(input.bytes).digest("hex");
  if (d.currentVersion) {
    const cur = await ctx.db.query.documentVersions.findFirst({ where: and(eq(documentVersions.documentId, d.id), eq(documentVersions.version, d.currentVersion)) });
    if (cur?.sha256 === sha) throw pre("Tệp giống hệt phiên bản hiện tại");
  }
  const version = d.currentVersion + 1;
  const name = safeFileName(input.fileName);
  const ext = fileExt(name);
  let scorm: { version: string; launch: string; files: number; title: string } | null = null;
  if (d.kind === "scorm") {
    const buf = Buffer.from(input.bytes);
    let entries;
    try {
      entries = listZip(buf);
    } catch (e) {
      throw bad((e as Error).message);
    }
    const files = entries.filter((e) => !e.isDir);
    if (files.length > SCORM_MAX_FILES) throw bad(`Gói có quá nhiều tệp (${files.length} > ${SCORM_MAX_FILES})`);
    const manifest = files.find((e) => /^([^/]+\/)?imsmanifest\.xml$/i.test(e.name));
    if (!manifest) throw bad("Không phải gói SCORM: thiếu imsmanifest.xml");
    const root = manifest.name.slice(0, manifest.name.length - "imsmanifest.xml".length);
    let m;
    try {
      m = rule(() => parseScormManifest(readZipEntry(buf, manifest).toString("utf8")));
    } catch (e) {
      if (e instanceof TRPCError) throw e;
      throw bad(`Không đọc được imsmanifest.xml: ${(e as Error).message}`);
    }
    const paths = new Set<string>();
    for (const f of files) {
      if (!f.name.startsWith(root)) continue;
      const rel = normalizeZipPath(f.name.slice(root.length));
      if (!rel) throw bad(`Đường dẫn không hợp lệ trong gói: ${f.name}`);
      if (/\.(exe|bat|cmd|sh|ps1|php|jsp|asp)$/i.test(rel)) throw bad(`Gói chứa tệp không cho phép: ${rel}`);
      paths.add(rel);
      await putObject(`scorm/${d.id}/v${version}/${rel}`, readZipEntry(buf, f));
    }
    if (!paths.has(m.launch)) throw bad(`Trang khởi chạy ${m.launch} không có trong gói`);
    scorm = { version: m.version, launch: m.launch, files: paths.size, title: m.title };
  }
  const key = `docs/${d.id}/v${version}/${name}`;
  await putObject(key, input.bytes);
  await ctx.db.transaction(async (tx) => {
    await tx.insert(documentVersions).values({
      documentId: d.id, version, objectKey: key, fileName: name, mimeType: d.kind === "scorm" ? "application/zip" : DOC_FILE_TYPES[ext] ?? "application/octet-stream",
      sizeBytes: input.bytes.byteLength, sha256: sha, note: input.note?.trim() || null, uploadedBy: ctx.user.id,
      scormVersion: scorm?.version ?? null, launchPath: scorm?.launch ?? null, fileCount: scorm?.files ?? null,
    });
    await tx.update(documents).set({ currentVersion: version, updatedBy: ctx.user.id }).where(eq(documents.id, d.id));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "content", entity: "document_versions", entityId: d.id, after: { version, name, size: input.bytes.byteLength, scorm }, ip: ctx.ip });
  });
  return { version, fileName: name, scorm };
}

export async function setDocumentStatus(ctx: ProtectedContext, input: { id: string; status: DocStatus }) {
  requirePermission(ctx, "document:update");
  const d = await ctx.db.query.documents.findFirst({ where: eq(documents.id, input.id) });
  if (!d) throw notFound("Không tìm thấy tài liệu");
  const to = rule(() => docTransition(d.status as DocStatus, input.status, d.kind === "link" ? !!d.url : d.currentVersion > 0));
  await ctx.db.update(documents).set({ status: to, updatedBy: ctx.user.id, ...(to === "published" ? { publishedAt: new Date() } : {}) }).where(eq(documents.id, d.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "TRANSITION", module: "content", entity: "documents", entityId: d.id, before: { status: d.status }, after: { status: to }, ip: ctx.ip });
  return { status: to };
}

/** Mở / tải tài liệu (ghi nhật ký) */
export async function openDocument(ctx: ProtectedContext, input: { id: string; version?: number }) {
  const d = await loadDocForRead(ctx, input.id);
  if (d.kind === "link") {
    await ctx.db.insert(documentAccessLogs).values({ documentId: d.id, userId: ctx.user.id, action: "view" });
    return { kind: "link" as const, url: d.url! };
  }
  if (input.version && input.version !== d.currentVersion && !canEditDocs(ctx)) throw forbid("Chỉ xem được phiên bản hiện hành");
  const version = input.version ?? d.currentVersion;
  if (!version) throw pre("Tài liệu chưa có tệp");
  const v = await ctx.db.query.documentVersions.findFirst({ where: and(eq(documentVersions.documentId, d.id), eq(documentVersions.version, version)) });
  if (!v) throw notFound("Không tìm thấy phiên bản");
  await ctx.db.insert(documentAccessLogs).values({ documentId: d.id, version, userId: ctx.user.id, action: d.kind === "scorm" ? "download_package" : "download" });
  const inline = /^(application\/pdf|image\/|video\/)/.test(v.mimeType);
  return { kind: d.kind as "file" | "scorm", url: signedFileUrl(v.objectKey, v.fileName, 900, inline), fileName: v.fileName, inline };
}

/* ------------------------------------------------------------------ */
/* SCORM runtime                                                        */
/* ------------------------------------------------------------------ */

export async function scormLaunch(ctx: ProtectedContext, input: { id: string }) {
  const d = await loadDocForRead(ctx, input.id);
  if (d.kind !== "scorm") throw pre("Tài liệu không phải bài giảng SCORM");
  if (!d.currentVersion) throw pre("Chưa tải gói SCORM");
  const v = await ctx.db.query.documentVersions.findFirst({ where: and(eq(documentVersions.documentId, d.id), eq(documentVersions.version, d.currentVersion)) });
  if (!v?.launchPath) throw pre("Gói SCORM thiếu trang khởi chạy");
  const [att] = await ctx.db.insert(scormAttempts).values({ documentId: d.id, version: v.version, userId: ctx.user.id, status: "incomplete", launches: 1 })
    .onConflictDoUpdate({ target: [scormAttempts.documentId, scormAttempts.version, scormAttempts.userId], set: { launches: sql`${scormAttempts.launches} + 1`, updatedAt: new Date() } })
    .returning();
  await ctx.db.insert(documentAccessLogs).values({ documentId: d.id, version: v.version, userId: ctx.user.id, action: "launch" });
  const [me] = await ctx.db.select({ fullName: users.fullName }).from(users).where(eq(users.id, ctx.user.id));
  return {
    title: d.title, version: v.version, scormVersion: (v.scormVersion ?? "1.2") as "1.2" | "2004",
    launchUrl: `${signedScormBase(d.id, v.version)}${v.launchPath.split("/").map(encodeURIComponent).join("/")}`,
    learner: { id: ctx.user.id, name: me?.fullName ?? "" },
    state: { status: att!.status as ScormStatus, location: att!.location, suspendData: att!.suspendData, entry: att!.launches > 1 && att!.suspendData ? "resume" : "ab-initio", score: att!.score },
  };
}

export async function scormCommit(ctx: ProtectedContext, input: { id: string; version: number; cmi: Record<string, string>; terminate: boolean }) {
  const d = await loadDocForRead(ctx, input.id);
  const att = await ctx.db.query.scormAttempts.findFirst({ where: and(eq(scormAttempts.documentId, d.id), eq(scormAttempts.version, input.version), eq(scormAttempts.userId, ctx.user.id)) });
  if (!att) throw pre("Chưa mở bài giảng");
  const cmi: Record<string, string> = {};
  let size = 0;
  for (const [k, v] of Object.entries(input.cmi).slice(0, 300)) {
    if (!/^cmi\.[A-Za-z0-9_.]{1,120}$/.test(k)) continue;
    const val = String(v ?? "").slice(0, 64_000);
    size += val.length;
    if (size > 200_000) break;
    cmi[k] = val;
  }
  const s = scormStatusFromCmi({ ...(att.cmi ?? {}), ...cmi });
  const status = mergeScormStatus(att.status as ScormStatus, s.status);
  const done = (status === "completed" || status === "passed") && !att.completedAt;
  await ctx.db.update(scormAttempts).set({
    status, score: s.score ?? att.score, location: s.location ?? att.location, suspendData: s.suspend ?? att.suspendData,
    cmi: { ...(att.cmi ?? {}), ...cmi }, totalSeconds: att.totalSeconds + (input.terminate ? Math.min(s.seconds, 12 * 3600) : 0),
    ...(done ? { completedAt: new Date() } : {}), updatedAt: new Date(),
  }).where(eq(scormAttempts.id, att.id));
  return { status, score: s.score ?? att.score };
}

export async function scormReport(ctx: ProtectedContext, input: { id: string }) {
  if (!readsAll(ctx)) throw forbid("Chỉ Đào tạo / quản lý xem báo cáo học SCORM");
  const d = await ctx.db.query.documents.findFirst({ where: eq(documents.id, input.id) });
  if (!d || d.kind !== "scorm") throw notFound("Không tìm thấy bài giảng SCORM");
  const rows = await ctx.db.select({ a: scormAttempts, fullName: users.fullName, email: users.email }).from(scormAttempts).innerJoin(users, eq(users.id, scormAttempts.userId))
    .where(eq(scormAttempts.documentId, d.id)).orderBy(desc(scormAttempts.updatedAt));
  const items = rows.map((r) => ({ id: r.a.id, version: r.a.version, userName: r.fullName, email: r.email, status: r.a.status as ScormStatus, statusLabel: SCORM_STATUS_VI[r.a.status as ScormStatus], score: r.a.score, totalSeconds: r.a.totalSeconds, launches: r.a.launches, completedAt: r.a.completedAt, updatedAt: r.a.updatedAt }));
  const done = items.filter((i) => i.status === "completed" || i.status === "passed").length;
  const scored = items.filter((i) => i.score !== null);
  return {
    items,
    summary: { learners: items.length, completed: done, rate: items.length ? Math.round((done / items.length) * 100) : 0, avgScore: scored.length ? Math.round(scored.reduce((a, i) => a + (i.score ?? 0), 0) / scored.length) : null, avgMinutes: items.length ? Math.round(items.reduce((a, i) => a + i.totalSeconds, 0) / items.length / 60) : 0 },
  };
}

/* ------------------------------------------------------------------ */
/* Tài liệu lớp tôi                                                     */
/* ------------------------------------------------------------------ */

export async function myMaterials(ctx: ProtectedContext, input: { classId?: string }) {
  const all = ctx.actor.assignments.some((a) => authorize({ userId: ctx.actor.userId, assignments: [a] }, "class:read", {}).allowed);
  if (!all && !hasPermission(ctx.actor, "class:read")) throw forbid("Không có quyền xem lớp");
  const tid = ctx.actor.personId ?? "00000000-0000-0000-0000-000000000000";
  const vis = ctx.actor.assignments.some((a) => a.centerId === null) ? null : [...new Set(ctx.actor.assignments.map((a) => a.centerId).filter((x): x is string => !!x))];
  const classScope = all
    ? (vis === null ? sql`true` : vis.length ? inArray(classes.centerId, vis) : sql`false`)
    : sql`(${classes.leadTeacherId} = ${tid} or ${classes.assistantTeacherId} = ${tid})`;
  const cls = await ctx.db.select({ id: classes.id, code: classes.code, name: classes.name, courseId: classes.courseId, curriculumId: classes.curriculumId, courseCode: courses.code, status: classes.status })
    .from(classes).innerJoin(courses, eq(courses.id, classes.courseId))
    .where(and(classScope, inArray(classes.status, ["running", "recruiting", "pending_approval"]))).orderBy(asc(classes.code));
  const sel = cls.find((c) => c.id === input.classId) ?? cls[0] ?? null;
  if (!sel) return { classes: cls, selected: null, lessons: [], general: [], upcoming: [] };
  const docs = await ctx.db.select({ d: documents, fileName: documentVersions.fileName, sizeBytes: documentVersions.sizeBytes })
    .from(documents).leftJoin(documentVersions, and(eq(documentVersions.documentId, documents.id), eq(documentVersions.version, documents.currentVersion)))
    .where(and(eq(documents.courseId, sel.courseId), eq(documents.status, "published"))).orderBy(asc(documents.title));
  const ls = sel.curriculumId
    ? await ctx.db.select({ id: lessons.id, sequenceNo: lessons.sequenceNo, title: lessons.title, objectives: lessons.objectives, materials: lessons.materials }).from(lessons).where(eq(lessons.curriculumId, sel.curriculumId)).orderBy(asc(lessons.sequenceNo))
    : [];
  const up = await ctx.db.select({ id: sessions.id, date: sessions.date, startTime: sessions.startTime, sequenceNo: sessions.sequenceNo, lessonId: sessions.lessonId, topic: sessions.topic })
    .from(sessions).where(and(eq(sessions.classId, sel.id), eq(sessions.status, "scheduled"), sql`${sessions.date} >= (now() at time zone 'Asia/Ho_Chi_Minh')::date`)).orderBy(asc(sessions.date)).limit(3);
  const mapDoc = (x: (typeof docs)[number]) => ({ id: x.d.id, title: x.d.title, kind: x.d.kind as DocKind, kindLabel: DOC_KIND_VI[x.d.kind as DocKind], category: DOC_CATEGORY_VI[x.d.category as DocCategory], audience: x.d.audience, fileName: x.fileName, sizeBytes: x.sizeBytes, lessonId: x.d.lessonId });
  const lessonDocs = ls.map((l) => ({ ...l, docs: docs.filter((x) => x.d.lessonId === l.id).map(mapDoc), next: up.find((u) => u.lessonId === l.id) ?? null }));
  return {
    classes: cls, selected: sel,
    lessons: lessonDocs,
    general: docs.filter((x) => !x.d.lessonId || !ls.some((l) => l.id === x.d.lessonId)).map(mapDoc),
    upcoming: up.map((u) => ({ ...u, lesson: ls.find((l) => l.id === u.lessonId)?.title ?? u.topic, docCount: docs.filter((x) => x.d.lessonId === u.lessonId).length })),
  };
}

/* ------------------------------------------------------------------ */
/* Đề xuất sửa giáo án                                                  */
/* ------------------------------------------------------------------ */

const isReviewer = (ctx: ProtectedContext) => authorize(ctx.actor, "curriculum:approve", {}).allowed;

export async function proposalLessonOptions(ctx: ProtectedContext) {
  if (!hasPermission(ctx.actor, "curriculum:propose") && !isReviewer(ctx)) throw forbid("Không có quyền đề xuất");
  const tid = ctx.actor.personId;
  const currIds = isReviewer(ctx) || !tid
    ? null
    : (await ctx.db.select({ c: classes.curriculumId }).from(classes).where(sql`(${classes.leadTeacherId} = ${tid} or ${classes.assistantTeacherId} = ${tid}) and ${classes.curriculumId} is not null`)).map((r) => r.c!);
  if (currIds && !currIds.length) return [];
  return ctx.db.select({ id: lessons.id, sequenceNo: lessons.sequenceNo, title: lessons.title, objectives: lessons.objectives, materials: lessons.materials, curriculumId: curricula.id, curriculumName: curricula.name, courseCode: courses.code })
    .from(lessons).innerJoin(curricula, eq(curricula.id, lessons.curriculumId)).innerJoin(courses, eq(courses.id, curricula.courseId))
    .where(and(inArray(curricula.status, ["active", "draft"]), currIds ? inArray(curricula.id, [...new Set(currIds)]) : sql`true`))
    .orderBy(asc(courses.code), asc(curricula.name), asc(lessons.sequenceNo));
}

export async function listProposals(ctx: ProtectedContext, input: { status?: ProposalStatus; mine?: boolean }) {
  const reviewer = isReviewer(ctx);
  if (!reviewer && !hasPermission(ctx.actor, "curriculum:propose") && !hasPermission(ctx.actor, "curriculum:read")) throw forbid("Không có quyền xem đề xuất");
  const conds: SQL[] = [];
  if (!reviewer || input.mine) conds.push(eq(lessonProposals.proposedBy, ctx.user.id));
  if (input.status) conds.push(eq(lessonProposals.status, input.status));
  else conds.push(inArray(lessonProposals.status, ["submitted", "in_review", "approved"]));
  const rows = await ctx.db.select({ p: lessonProposals, lessonSeq: lessons.sequenceNo, lessonTitle: lessons.title, curriculumName: curricula.name, courseCode: courses.code, byName: users.fullName,
    comments: sql<number>`(select count(*)::int from ${proposalComments} c where c.proposal_id = ${lessonProposals.id})` })
    .from(lessonProposals).innerJoin(lessons, eq(lessons.id, lessonProposals.lessonId)).innerJoin(curricula, eq(curricula.id, lessonProposals.curriculumId))
    .innerJoin(courses, eq(courses.id, curricula.courseId)).innerJoin(users, eq(users.id, lessonProposals.proposedBy))
    .where(conds.length ? and(...conds) : undefined).orderBy(desc(lessonProposals.createdAt)).limit(200);
  const [c] = await ctx.db.select({
    submitted: sql<number>`count(*) filter (where ${lessonProposals.status} = 'submitted')::int`,
    in_review: sql<number>`count(*) filter (where ${lessonProposals.status} = 'in_review')::int`,
    approved: sql<number>`count(*) filter (where ${lessonProposals.status} = 'approved')::int`,
  }).from(lessonProposals).where(reviewer && !input.mine ? undefined : eq(lessonProposals.proposedBy, ctx.user.id));
  return {
    reviewer, canPropose: hasPermission(ctx.actor, "curriculum:propose"), counts: c,
    items: rows.map((r) => ({ ...r.p, typeLabel: PROPOSAL_TYPE_VI[r.p.type as ProposalType], statusLabel: PROPOSAL_STATUS_VI[r.p.status as ProposalStatus], lessonSeq: r.lessonSeq, lessonTitle: r.lessonTitle, curriculumName: r.curriculumName, courseCode: r.courseCode, byName: r.byName, comments: r.comments, fields: changedFields(r.p.patch, r.p.snapshot) })),
  };
}

async function nextProposalCode(db: Db) {
  const year = new Date().getFullYear() % 100;
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(lessonProposals).where(sql`${lessonProposals.code} like ${`DX${year}-%`}`);
  return `DX${year}-${String((r?.n ?? 0) + 1).padStart(4, "0")}`;
}

export async function createProposal(ctx: ProtectedContext, input: { lessonId: string; type: ProposalType; reason: string; patch: LessonPatch; classId?: string | null }) {
  if (!authorize(ctx.actor, "curriculum:propose", {}).allowed && !isReviewer(ctx)) throw forbid("Không có quyền đề xuất sửa giáo án");
  const [l] = await ctx.db.select({ l: lessons, status: curricula.status }).from(lessons).innerJoin(curricula, eq(curricula.id, lessons.curriculumId)).where(eq(lessons.id, input.lessonId));
  if (!l) throw notFound("Không tìm thấy bài học");
  if (l.status === "archived") throw pre("Giáo trình đã lưu trữ");
  const opts = await proposalLessonOptions(ctx);
  if (!opts.some((o) => o.id === l.l.id)) throw forbid("Chỉ đề xuất cho giáo trình của lớp bạn dạy");
  const current = { title: l.l.title, objectives: l.l.objectives, materials: l.l.materials };
  const patch: LessonPatch = {};
  for (const k of ["title", "objectives", "materials"] as const) if (input.patch[k] !== undefined && input.patch[k] !== null) patch[k] = input.patch[k]!.trim();
  const errs = validateProposal({ type: input.type, reason: input.reason, patch, current });
  if (errs.length) throw bad(errs);
  const [dup] = await ctx.db.select({ code: lessonProposals.code }).from(lessonProposals)
    .where(and(eq(lessonProposals.lessonId, l.l.id), eq(lessonProposals.proposedBy, ctx.user.id), inArray(lessonProposals.status, ["submitted", "in_review"]))).limit(1);
  if (dup) throw pre(`Bạn đã có đề xuất ${dup.code} đang chờ cho bài này`);
  const code = await nextProposalCode(ctx.db);
  const [p] = await ctx.db.insert(lessonProposals).values({ code, lessonId: l.l.id, curriculumId: l.l.curriculumId, type: input.type, reason: input.reason.trim(), snapshot: current, patch, classId: input.classId ?? null, proposedBy: ctx.user.id }).returning({ id: lessonProposals.id });
  const reviewers = await ctx.db.select({ u: userRoles.userId }).from(userRoles).where(and(eq(userRoles.role, "TRAINING")));
  if (reviewers.length) await ctx.db.insert(userNotifications).values([...new Set(reviewers.map((r) => r.u))].map((userId) => ({ userId, title: `Đề xuất sửa giáo án ${code}`, body: `Bài ${l.l.sequenceNo}: ${l.l.title} — ${PROPOSAL_TYPE_VI[input.type]}`, link: `/de-xuat-giao-an?id=${p!.id}`, priority: 3 })));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "content", entity: "lesson_proposals", entityId: p!.id, after: { code, lessonId: l.l.id, type: input.type, fields: changedFields(patch, current) }, ip: ctx.ip });
  return { id: p!.id, code };
}

export async function getProposal(ctx: ProtectedContext, id: string) {
  const p = await ctx.db.query.lessonProposals.findFirst({ where: eq(lessonProposals.id, id) });
  if (!p) throw notFound("Không tìm thấy đề xuất");
  const reviewer = isReviewer(ctx);
  if (!reviewer && p.proposedBy !== ctx.user.id) throw forbid("Không xem được đề xuất của người khác");
  const lesson = await ctx.db.query.lessons.findFirst({ where: eq(lessons.id, p.lessonId) });
  const comments = await ctx.db.select({ id: proposalComments.id, body: proposalComments.body, createdAt: proposalComments.createdAt, byName: users.fullName, userId: proposalComments.userId })
    .from(proposalComments).innerJoin(users, eq(users.id, proposalComments.userId)).where(eq(proposalComments.proposalId, p.id)).orderBy(asc(proposalComments.createdAt));
  const names = await ctx.db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, [p.proposedBy, p.reviewerId, p.appliedBy].filter((x): x is string => !!x)));
  const current = lesson ? { title: lesson.title, objectives: lesson.objectives, materials: lesson.materials } : p.snapshot;
  const fields = changedFields(p.patch, p.snapshot);
  const status = p.status as ProposalStatus;
  const self = p.proposedBy === ctx.user.id;
  return {
    ...p, typeLabel: PROPOSAL_TYPE_VI[p.type as ProposalType], statusLabel: PROPOSAL_STATUS_VI[status], lessonSeq: lesson?.sequenceNo ?? null, current, fields,
    conflicts: status === "applied" ? [] : proposalConflict(p.snapshot, current, fields), comments,
    byName: names.find((n) => n.id === p.proposedBy)?.fullName ?? "", reviewerName: names.find((n) => n.id === p.reviewerId)?.fullName ?? null, appliedByName: names.find((n) => n.id === p.appliedBy)?.fullName ?? null,
    can: {
      withdraw: self && (status === "submitted" || status === "in_review"),
      review: reviewer && !self && status === "submitted",
      decide: reviewer && !self && (status === "submitted" || status === "in_review"),
      apply: reviewer && status === "approved" && fields.length > 0 && authorize(ctx.actor, "curriculum:update", {}).allowed,
      rejectApproved: reviewer && status === "approved",
      comment: reviewer || self,
    },
  };
}

export async function proposalAction(ctx: ProtectedContext, input: { id: string; action: ProposalAction; note?: string | null; force?: boolean }) {
  const p = await getProposal(ctx, input.id);
  const to = rule(() => proposalTransition(p.status as ProposalStatus, input.action));
  const note = input.note?.trim() || null;
  if (input.action === "withdraw" && !p.can.withdraw) throw forbid("Chỉ người đề xuất được rút");
  if ((input.action === "review" || input.action === "approve") && !p.can.decide) throw forbid(p.proposedBy === ctx.user.id ? "Không tự duyệt đề xuất của mình" : "Chỉ Đào tạo duyệt đề xuất");
  if (input.action === "reject") {
    if (!p.can.decide && !p.can.rejectApproved) throw forbid("Chỉ Đào tạo từ chối đề xuất");
    if (!note || note.length < 10) throw bad("Từ chối cần lý do ≥ 10 ký tự");
  }
  if (input.action === "apply") {
    if (!p.can.apply) throw forbid(p.fields.length ? "Chỉ Đào tạo áp dụng thay đổi" : "Đề xuất không có thay đổi nội dung để áp dụng — đóng bằng từ chối kèm ghi chú đã xử lý");
    if (p.conflicts.length && !input.force) throw pre(`Giáo án đã thay đổi từ lúc đề xuất (${p.conflicts.join(", ")}) — xem lại rồi xác nhận áp dụng`);
  }
  await ctx.db.transaction(async (tx) => {
    const now = new Date();
    if (input.action === "apply") {
      const lesson = await tx.query.lessons.findFirst({ where: eq(lessons.id, p.lessonId) });
      if (!lesson) throw notFound("Bài học đã bị xoá");
      const set: Partial<{ title: string; objectives: string | null; materials: string | null }> = {};
      for (const f of p.fields) {
        const v = p.patch[f] ?? null;
        if (f === "title") set.title = (v ?? lesson.title).trim(); else set[f] = v?.trim() || null;
      }
      await tx.update(lessons).set(set).where(eq(lessons.id, lesson.id));
      if (set.title) await tx.update(sessions).set({ topic: set.title }).where(and(eq(sessions.lessonId, lesson.id), eq(sessions.status, "scheduled"), eq(sessions.topic, lesson.title)));
      await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "academics", entity: "lessons", entityId: lesson.id, before: { title: lesson.title, objectives: lesson.objectives, materials: lesson.materials }, after: set, reason: `Áp dụng đề xuất ${p.code}`, ip: ctx.ip });
    }
    await tx.update(lessonProposals).set({
      status: to,
      ...(input.action === "review" || input.action === "approve" || input.action === "reject" ? { reviewerId: ctx.user.id, decidedAt: now } : {}),
      ...(note && input.action !== "withdraw" ? { decisionNote: note } : {}),
      ...(input.action === "apply" ? { appliedBy: ctx.user.id, appliedAt: now } : {}),
    }).where(eq(lessonProposals.id, p.id));
    if (note) await tx.insert(proposalComments).values({ proposalId: p.id, userId: ctx.user.id, body: `[${PROPOSAL_STATUS_VI[to]}] ${note}` });
    if (p.proposedBy !== ctx.user.id) {
      await tx.insert(userNotifications).values({ userId: p.proposedBy, title: `Đề xuất ${p.code}: ${PROPOSAL_STATUS_VI[to]}`, body: note ?? `Bài ${p.lessonSeq ?? ""} — ${p.current.title}`, link: `/de-xuat-giao-an?id=${p.id}`, priority: 3 });
    }
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "content", entity: "lesson_proposals", entityId: p.id, before: { status: p.status }, after: { status: to }, reason: note, ip: ctx.ip });
  });
  return { status: to };
}

export async function addProposalComment(ctx: ProtectedContext, input: { id: string; body: string }) {
  const p = await getProposal(ctx, input.id);
  if (!p.can.comment) throw forbid("Không bình luận được");
  const body = input.body.trim();
  if (body.length < 2) throw bad("Nhập nội dung");
  await ctx.db.insert(proposalComments).values({ proposalId: p.id, userId: ctx.user.id, body });
  const target = p.proposedBy === ctx.user.id ? p.reviewerId : p.proposedBy;
  if (target) await ctx.db.insert(userNotifications).values({ userId: target, title: `Bình luận đề xuất ${p.code}`, body: body.slice(0, 200), link: `/de-xuat-giao-an?id=${p.id}`, priority: 3 });
  return { ok: true };
}
