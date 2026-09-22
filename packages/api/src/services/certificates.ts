/**
 * GIẤY CHỨNG NHẬN & LỘ TRÌNH HỌC — docs/CHUNG-NHAN-LO-TRINH.md.
 *
 *  - Lộ trình (`learning_paths` + `learning_path_courses`): chuỗi khoá có thứ tự, đánh dấu bắt buộc,
 *    "Điều kiện đạt" in lên chứng nhận. Học viên hoàn thành (đã duyệt) mọi khoá bắt buộc → đủ điều kiện.
 *  - Mẫu chứng nhận (`certificate_templates`): ảnh nền PNG/JPG thiết kế trên Canva + ô trường theo % khung.
 *  - Chứng nhận đã cấp (`certificates`): số CN-<cơ sở>-<yy>-<6 số>, token QR ngẫu nhiên, bản chụp chữ đã in.
 *
 * Quyền: quản lý lộ trình / mẫu dùng `course:*`; xem danh sách học viên, cấp, thu hồi dùng `completion:*`
 * (xem: `completion:read` hoặc `enrollment:read`; cấp / thu hồi: `completion:approve` tại cơ sở của chứng nhận).
 * Mọi truy vấn lọc `tenantCond`, nạp theo id thì `assertTenant`, mọi ghi kèm `writeAudit` trong cùng transaction.
 *
 * "Chứng nhận" — KHÔNG phải "chứng chỉ" (văn bằng thuộc hệ thống giáo dục quốc dân).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  certificates, certificateTemplates, learningPaths, learningPathCourses, courses, courseCompletions, enrollments, classes,
  students, centers, tenants, portfolioShares, users, type Database,
} from "@satarobo/db";
import {
  authorize, centersWith, visibleCenterIds, qrSvg, gradeFromAverage,
  pathProgress, validatePathCourses, normalizePathCode, PATH_CODE_RE,
  certificatePrefix, pathCertificateNumber, nextCertificateSeq, certificateVerifyPath, validateRevokeReason, CERTIFICATE_TOKEN_RE,
  normalizeTemplateFields, defaultTemplateFields, validateTemplateFields, buildCertificateSnapshot, isCertificateSnapshot,
  sampleCertificateSnapshot, formatIssuedDate, checkImageUpload, readImageSize, backgroundWarnings, builtinBackgroundPath,
  CERTIFICATE_BG_KEY_RE, CERTIFICATE_BG_MAX_BYTES, CERTIFICATE_BG_MIME, CERTIFICATE_STATUS_VI, CERTIFICATE_KIND_VI, PATH_COURSE_STATE_VI,
  type TemplateField, type TemplateOrientation, type CertificateSnapshot, type CertificateKind, type CertificateStatus, type PathCourseState,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { assertTenant, tenantCond } from "./tenantScope";
import { writeAudit } from "./audit";
import { putObject, signedMediaUrl } from "../storage";

type Db = ProtectedContext["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const asDb = (d: unknown) => d as Db;
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
/** Nền dựng sẵn khi trung tâm chưa có mẫu nào */
const BUILTIN_BG = "builtin/sata-mac-dinh.svg";
const OPEN_ENROLLMENT = ["trial", "active", "paused"];

/* ------------------------------------------------------------------ */
/* Quyền                                                                */
/* ------------------------------------------------------------------ */

/** Xem cấu hình lộ trình / mẫu: `course:read` (hoặc người có quyền xem hoàn thành khoá) */
function requireConfigRead(ctx: ProtectedContext) {
  if (authorize(ctx.actor, "completion:read", {}).allowed || authorize(ctx.actor, "enrollment:read", {}).allowed) return;
  requirePermission(ctx, "course:read", {});
}
/** Xem học viên / chứng nhận tại một cơ sở: `enrollment:read` hoặc `completion:read` */
function requireCertRead(ctx: ProtectedContext, centerId: string | null) {
  if (authorize(ctx.actor, "enrollment:read", { centerId }).allowed) return;
  requirePermission(ctx, "completion:read", { centerId });
}
function centerVisible(ctx: ProtectedContext, centerId: string | null): boolean {
  const v = visibleCenterIds(ctx.actor);
  return v === null || centerId === null || v.includes(centerId);
}

/* ------------------------------------------------------------------ */
/* Mẫu chứng nhận                                                       */
/* ------------------------------------------------------------------ */

type TemplateRow = typeof certificateTemplates.$inferSelect;

/** Trường của mẫu đã chuẩn hoá; mẫu chưa cấu hình (mảng rỗng) dùng bố cục mặc định */
export function templateFieldsOf(t: { fields: unknown; orientation: TemplateOrientation }): TemplateField[] {
  const arr = Array.isArray(t.fields) ? t.fields : [];
  return arr.length ? normalizeTemplateFields(arr, t.orientation) : defaultTemplateFields(t.orientation);
}

/** URL ảnh nền: nền dựng sẵn là tệp tĩnh; ảnh tải lên phát qua URL có chữ ký, có hạn */
export function backgroundUrlOf(key: string | null | undefined, ttlSeconds = 3 * 3600): string | null {
  if (!key) return null;
  const builtin = builtinBackgroundPath(key);
  if (builtin) return builtin;
  return CERTIFICATE_BG_KEY_RE.test(key) ? signedMediaUrl(key, ttlSeconds) : null;
}

function templateView(t: TemplateRow) {
  return {
    id: t.id, name: t.name, orientation: t.orientation, backgroundKey: t.backgroundKey, backgroundUrl: backgroundUrlOf(t.backgroundKey),
    widthPx: t.widthPx, heightPx: t.heightPx, fields: templateFieldsOf(t), isDefault: t.isDefault, isActive: t.isActive,
    updatedAt: iso(t.updatedAt),
  };
}
export type CertificateTemplateView = ReturnType<typeof templateView>;

/** Mẫu ảo khi trung tâm chưa có mẫu nào (không lưu) */
function virtualTemplate(): CertificateTemplateView {
  return {
    id: "", name: "Mẫu mặc định Sata Robo (A4 ngang)", orientation: "landscape", backgroundKey: BUILTIN_BG, backgroundUrl: backgroundUrlOf(BUILTIN_BG),
    widthPx: 3508, heightPx: 2480, fields: defaultTemplateFields("landscape"), isDefault: true, isActive: true, updatedAt: null,
  };
}

async function loadTemplate(ctx: ProtectedContext, id: string): Promise<TemplateRow> {
  const [t] = await ctx.db.select().from(certificateTemplates).where(eq(certificateTemplates.id, id)).limit(1);
  if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy mẫu chứng nhận" });
  assertTenant(ctx, t, "Mẫu chứng nhận");
  return t;
}

/** Mã QR mẫu cho nút "Xem thử với dữ liệu mẫu" (sinh ở máy chủ như bản in thật) */
function qrFor(url: string): string {
  return qrSvg(url, { scale: 4, border: 1 }).replace(/ width="\d+" height="\d+"/, ' width="100%" height="100%"');
}

export async function listTemplates(ctx: ProtectedContext, input: { includeInactive?: boolean } = {}) {
  requireConfigRead(ctx);
  const rows = await ctx.db.select().from(certificateTemplates)
    .where(and(tenantCond(ctx, certificateTemplates), input.includeInactive ? sql`true` : eq(certificateTemplates.isActive, true)))
    .orderBy(desc(certificateTemplates.isDefault), asc(certificateTemplates.name));
  return rows.map(templateView);
}

export async function getTemplate(ctx: ProtectedContext, id: string) {
  requireConfigRead(ctx);
  const t = await loadTemplate(ctx, id);
  const fields = templateFieldsOf(t);
  return {
    ...templateView(t),
    sample: sampleCertificateSnapshot(fields),
    sampleQrSvg: qrFor(`${appUrl()}${certificateVerifyPath("xem-thu-ma-qr-mau-chung-nhan-sata-robo")}`),
  };
}

export async function createTemplate(ctx: ProtectedContext, input: { name: string; orientation: TemplateOrientation; copyFromId?: string | null }) {
  requirePermission(ctx, "course:update", {});
  const name = input.name.trim();
  if (name.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Tên mẫu tối thiểu 2 ký tự" });
  const src = input.copyFromId ? await loadTemplate(ctx, input.copyFromId) : null;
  return ctx.db.transaction(async (tx) => {
    const [hasDefault] = await tx.select({ id: certificateTemplates.id }).from(certificateTemplates)
      .where(and(eq(certificateTemplates.isDefault, true), ctx.tenantId ? eq(certificateTemplates.tenantId, ctx.tenantId) : isNull(certificateTemplates.tenantId))).limit(1);
    const orientation = src?.orientation ?? input.orientation;
    const [row] = await tx.insert(certificateTemplates).values({
      tenantId: ctx.tenantId, name, orientation,
      backgroundKey: src?.backgroundKey ?? null, widthPx: src?.widthPx ?? null, heightPx: src?.heightPx ?? null,
      fields: src ? templateFieldsOf(src) : defaultTemplateFields(orientation),
      isDefault: !hasDefault, createdBy: ctx.user.id, updatedBy: ctx.user.id,
    }).returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await writeAudit(asDb(tx), { actorId: ctx.user.id, action: "CREATE", module: "certificates", entity: "certificate_templates", entityId: row.id, after: { name, orientation, copyFromId: input.copyFromId ?? null }, ip: ctx.ip });
    return templateView(row);
  });
}

export async function updateTemplate(
  ctx: ProtectedContext,
  input: { id: string; name?: string; orientation?: TemplateOrientation; fields?: unknown[]; isActive?: boolean },
) {
  requirePermission(ctx, "course:update", {});
  const before = await loadTemplate(ctx, input.id);
  const orientation = input.orientation ?? before.orientation;
  const patch: Partial<typeof certificateTemplates.$inferInsert> = { updatedBy: ctx.user.id, updatedAt: new Date() };
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (n.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Tên mẫu tối thiểu 2 ký tự" });
    patch.name = n;
  }
  if (input.orientation !== undefined) patch.orientation = input.orientation;
  if (input.fields !== undefined) {
    const fields = normalizeTemplateFields(input.fields, orientation);
    const errs = validateTemplateFields(fields);
    if (errs.length) throw new TRPCError({ code: "BAD_REQUEST", message: errs.slice(0, 5).join("; ") });
    patch.fields = fields;
  }
  if (input.isActive !== undefined) {
    if (!input.isActive && before.isDefault) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Đặt mẫu khác làm mặc định trước khi ngừng dùng mẫu này" });
    patch.isActive = input.isActive;
  }
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx.update(certificateTemplates).set(patch).where(eq(certificateTemplates.id, before.id)).returning();
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    await writeAudit(asDb(tx), {
      actorId: ctx.user.id, action: "UPDATE", module: "certificates", entity: "certificate_templates", entityId: row.id,
      before: { name: before.name, orientation: before.orientation, isActive: before.isActive, fieldCount: Array.isArray(before.fields) ? before.fields.length : 0 },
      after: { name: row.name, orientation: row.orientation, isActive: row.isActive, fieldsChanged: input.fields !== undefined }, ip: ctx.ip,
    });
    return templateView(row);
  });
}

export async function setDefaultTemplate(ctx: ProtectedContext, id: string) {
  requirePermission(ctx, "course:update", {});
  const t = await loadTemplate(ctx, id);
  if (!t.isActive) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Mẫu đang ngừng dùng — bật lại trước khi đặt làm mặc định" });
  await ctx.db.transaction(async (tx) => {
    await tx.update(certificateTemplates).set({ isDefault: false, updatedAt: new Date() })
      .where(and(eq(certificateTemplates.isDefault, true), t.tenantId ? eq(certificateTemplates.tenantId, t.tenantId) : isNull(certificateTemplates.tenantId)));
    await tx.update(certificateTemplates).set({ isDefault: true, updatedBy: ctx.user.id, updatedAt: new Date() }).where(eq(certificateTemplates.id, t.id));
    await writeAudit(asDb(tx), { actorId: ctx.user.id, action: "UPDATE", module: "certificates", entity: "certificate_templates", entityId: t.id, after: { isDefault: true }, ip: ctx.ip });
  });
  return { ok: true };
}

/**
 * Tải ảnh nền (PNG / JPG ≤ 15 MB). Không tin Content-Type: soi magic bytes (chặn SVG / HTML đội lốt ảnh),
 * đọc kích thước để cảnh báo lệch khổ A4 / độ phân giải thấp. Lưu vào kho tệp, phát lại qua URL có chữ ký.
 * Gọi từ route multipart `/api/chung-nhan/nen` (tRPC không hợp để gửi tệp 15 MB).
 */
export async function uploadTemplateBackground(ctx: ProtectedContext, input: { templateId: string; mime: string; bytes: Uint8Array }) {
  requirePermission(ctx, "course:update", {});
  const t = await loadTemplate(ctx, input.templateId);
  const check = checkImageUpload({ mime: input.mime, bytes: input.bytes, maxBytes: CERTIFICATE_BG_MAX_BYTES, allowedMimes: CERTIFICATE_BG_MIME });
  if (!check.ok) throw new TRPCError({ code: "BAD_REQUEST", message: check.error ?? "Ảnh không hợp lệ" });
  const size = readImageSize(input.bytes);
  if (!size) throw new TRPCError({ code: "BAD_REQUEST", message: "Không đọc được kích thước ảnh — xuất lại PNG từ Canva rồi thử lại" });
  const ext = input.mime.toLowerCase().includes("png") ? "png" : "jpg";
  const key = `certificates/${t.tenantId ?? "chung"}/${t.id}/${randomUUID()}.${ext}`;
  await putObject(key, input.bytes);
  const row = await ctx.db.transaction(async (tx) => {
    const [r] = await tx.update(certificateTemplates)
      .set({ backgroundKey: key, widthPx: size.width, heightPx: size.height, updatedBy: ctx.user.id, updatedAt: new Date() })
      .where(eq(certificateTemplates.id, t.id)).returning();
    await writeAudit(asDb(tx), {
      actorId: ctx.user.id, action: "UPDATE", module: "certificates", entity: "certificate_templates", entityId: t.id,
      before: { backgroundKey: t.backgroundKey }, after: { backgroundKey: key, widthPx: size.width, heightPx: size.height, bytes: input.bytes.byteLength }, ip: ctx.ip,
    });
    return r;
  });
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  return { template: templateView(row), warnings: backgroundWarnings(size, row.orientation) };
}

/** Mẫu mặc định (còn dùng) của một trung tâm; không có thì mẫu còn dùng bất kỳ */
async function defaultTemplateRow(db: Db, tenantId: string | null): Promise<TemplateRow | null> {
  const where = and(eq(certificateTemplates.isActive, true), tenantId ? eq(certificateTemplates.tenantId, tenantId) : isNull(certificateTemplates.tenantId));
  const [t] = await db.select().from(certificateTemplates).where(where).orderBy(desc(certificateTemplates.isDefault), asc(certificateTemplates.createdAt)).limit(1);
  return t ?? null;
}

/* ------------------------------------------------------------------ */
/* Lộ trình                                                             */
/* ------------------------------------------------------------------ */

type PathRow = typeof learningPaths.$inferSelect;

async function loadPath(ctx: ProtectedContext, id: string): Promise<PathRow> {
  const [p] = await ctx.db.select().from(learningPaths).where(eq(learningPaths.id, id)).limit(1);
  if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy lộ trình" });
  assertTenant(ctx, p, "Lộ trình");
  return p;
}

async function pathCoursesOf(db: Db, pathIds: string[]) {
  if (!pathIds.length) return [];
  return db
    .select({ pathId: learningPathCourses.pathId, courseId: learningPathCourses.courseId, seq: learningPathCourses.seq, required: learningPathCourses.required, code: courses.code, name: courses.name, totalSessions: courses.totalSessions })
    .from(learningPathCourses).innerJoin(courses, eq(courses.id, learningPathCourses.courseId))
    .where(inArray(learningPathCourses.pathId, pathIds))
    .orderBy(asc(learningPathCourses.seq));
}

export async function listPaths(ctx: ProtectedContext, input: { includeInactive?: boolean } = {}) {
  requireConfigRead(ctx);
  const rows = await ctx.db
    .select({
      id: learningPaths.id, code: learningPaths.code, name: learningPaths.name, description: learningPaths.description, criteriaText: learningPaths.criteriaText,
      certificateTemplateId: learningPaths.certificateTemplateId, isActive: learningPaths.isActive, templateName: certificateTemplates.name, updatedAt: learningPaths.updatedAt,
      issuedCount: sql<number>`(select count(*)::int from ${certificates} c where c.learning_path_id = ${learningPaths.id} and c.status = 'valid')`,
    })
    .from(learningPaths)
    .leftJoin(certificateTemplates, eq(certificateTemplates.id, learningPaths.certificateTemplateId))
    .where(and(tenantCond(ctx, learningPaths), input.includeInactive ? sql`true` : eq(learningPaths.isActive, true)))
    .orderBy(asc(learningPaths.code));
  const pcs = await pathCoursesOf(ctx.db, rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, courses: pcs.filter((c) => c.pathId === r.id) }));
}

export async function getPath(ctx: ProtectedContext, id: string) {
  requireConfigRead(ctx);
  const p = await loadPath(ctx, id);
  return { ...p, courses: await pathCoursesOf(ctx.db, [p.id]) };
}

/** Lựa chọn cho form lộ trình: khoá đang mở bán + mẫu chứng nhận còn dùng */
export async function pathFormOptions(ctx: ProtectedContext) {
  requireConfigRead(ctx);
  const [cs, ts] = await Promise.all([
    ctx.db.select({ id: courses.id, code: courses.code, name: courses.name, totalSessions: courses.totalSessions, isActive: courses.isActive })
      .from(courses).where(tenantCond(ctx, courses)).orderBy(asc(courses.code)),
    ctx.db.select({ id: certificateTemplates.id, name: certificateTemplates.name, isDefault: certificateTemplates.isDefault })
      .from(certificateTemplates).where(and(tenantCond(ctx, certificateTemplates), eq(certificateTemplates.isActive, true))).orderBy(desc(certificateTemplates.isDefault), asc(certificateTemplates.name)),
  ]);
  return { courses: cs, templates: ts, canManage: authorize(ctx.actor, "course:update", {}).allowed };
}

export async function upsertPath(
  ctx: ProtectedContext,
  input: {
    id?: string; code: string; name: string; description?: string | null; criteriaText?: string | null;
    certificateTemplateId?: string | null; isActive?: boolean; courses: { courseId: string; required: boolean }[];
  },
) {
  requirePermission(ctx, "course:update", {});
  const code = normalizePathCode(input.code);
  if (!PATH_CODE_RE.test(code)) throw new TRPCError({ code: "BAD_REQUEST", message: "Mã lộ trình 2–30 ký tự: chữ IN HOA, số, gạch ngang" });
  const name = input.name.trim();
  if (name.length < 3) throw new TRPCError({ code: "BAD_REQUEST", message: "Tên lộ trình tối thiểu 3 ký tự" });
  const errs = validatePathCourses(input.courses);
  if (errs.length) throw new TRPCError({ code: "BAD_REQUEST", message: errs.join("; ") });

  const before = input.id ? await loadPath(ctx, input.id) : null;
  const tenantId = before ? before.tenantId : ctx.tenantId;
  // Khoá phải thuộc cùng trung tâm
  const ids = input.courses.map((c) => c.courseId);
  const found = await ctx.db.select({ id: courses.id, tenantId: courses.tenantId }).from(courses).where(and(inArray(courses.id, ids), tenantCond(ctx, courses)));
  if (found.length !== ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Có khoá không tồn tại hoặc thuộc trung tâm khác" });
  if (tenantId && found.some((c) => c.tenantId && c.tenantId !== tenantId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Có khoá thuộc trung tâm khác" });
  if (input.certificateTemplateId) {
    const t = await loadTemplate(ctx, input.certificateTemplateId);
    if (!t.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Mẫu chứng nhận đang ngừng dùng" });
  }

  return ctx.db.transaction(async (tx) => {
    const [dup] = await tx.select({ id: learningPaths.id }).from(learningPaths)
      .where(and(eq(learningPaths.code, code), tenantId ? eq(learningPaths.tenantId, tenantId) : isNull(learningPaths.tenantId))).limit(1);
    if (dup && dup.id !== input.id) throw new TRPCError({ code: "CONFLICT", message: `Mã lộ trình ${code} đã tồn tại` });
    const data = {
      code, name, description: input.description?.trim() || null, criteriaText: input.criteriaText?.trim() || null,
      certificateTemplateId: input.certificateTemplateId ?? null, isActive: input.isActive ?? before?.isActive ?? true, updatedBy: ctx.user.id,
    };
    const [row] = before
      ? await tx.update(learningPaths).set({ ...data, updatedAt: new Date() }).where(eq(learningPaths.id, before.id)).returning()
      : await tx.insert(learningPaths).values({ ...data, tenantId, createdBy: ctx.user.id }).returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const oldCourses = before ? await tx.select({ courseId: learningPathCourses.courseId, seq: learningPathCourses.seq, required: learningPathCourses.required }).from(learningPathCourses).where(eq(learningPathCourses.pathId, row.id)).orderBy(asc(learningPathCourses.seq)) : [];
    await tx.delete(learningPathCourses).where(eq(learningPathCourses.pathId, row.id));
    await tx.insert(learningPathCourses).values(input.courses.map((c, i) => ({ pathId: row.id, courseId: c.courseId, seq: i + 1, required: c.required })));
    await writeAudit(asDb(tx), {
      actorId: ctx.user.id, action: before ? "UPDATE" : "CREATE", module: "certificates", entity: "learning_paths", entityId: row.id,
      before: before ? { code: before.code, name: before.name, criteriaText: before.criteriaText, isActive: before.isActive, courses: oldCourses } : undefined,
      after: { ...data, courses: input.courses.map((c, i) => ({ ...c, seq: i + 1 })) }, ip: ctx.ip,
    });
    return row;
  });
}

/* ------------------------------------------------------------------ */
/* Học viên theo lộ trình                                               */
/* ------------------------------------------------------------------ */

export interface PathStudentRow {
  studentId: string;
  fullName: string;
  code: string | null;
  centerId: string | null;
  centerCode: string | null;
  completed: number;
  requiredCompleted: number;
  requiredTotal: number;
  total: number;
  percent: number;
  eligible: boolean;
  courses: { courseId: string; code: string; name: string; required: boolean; state: PathCourseState; stateLabel: string }[];
  certificate: { id: string; number: string; issuedAt: string | null; verifyPath: string } | null;
}

/**
 * Học viên có liên quan tới lộ trình (có ghi danh hoặc hoàn thành ít nhất một khoá của lộ trình),
 * chia ba nhóm: **Đủ điều kiện – chưa cấp** / **Đã cấp** / **Đang học (x/y khoá)**.
 */
export async function pathStudents(ctx: ProtectedContext, pathId: string) {
  const p = await loadPath(ctx, pathId);
  requireCertRead(ctx, null);
  const pcs = await pathCoursesOf(ctx.db, [p.id]);
  const courseIds = pcs.map((c) => c.courseId);
  const empty = { path: { id: p.id, code: p.code, name: p.name }, eligible: [] as PathStudentRow[], issued: [] as PathStudentRow[], inProgress: [] as PathStudentRow[], canIssue: false };
  if (!courseIds.length) return empty;
  const visible = visibleCenterIds(ctx.actor);

  const enr = await ctx.db
    .select({ studentId: enrollments.studentId, status: enrollments.status, courseId: classes.courseId, classCenterId: classes.centerId, enrollmentId: enrollments.id })
    .from(enrollments)
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(and(inArray(classes.courseId, courseIds), isNull(students.deletedAt), tenantCond(ctx, students)))
    .limit(20_000);
  const studentIds = [...new Set(enr.map((e) => e.studentId))];
  if (!studentIds.length) return empty;

  const [studs, comps, certs] = await Promise.all([
    ctx.db.select({ id: students.id, fullName: students.fullName, code: students.code, homeCenterId: students.homeCenterId, centerCode: centers.code })
      .from(students).leftJoin(centers, eq(centers.id, students.homeCenterId)).where(inArray(students.id, studentIds)),
    ctx.db.select({ enrollmentId: courseCompletions.enrollmentId, courseId: courseCompletions.courseId, status: courseCompletions.status, revokedAt: courseCompletions.revokedAt })
      .from(courseCompletions).where(and(inArray(courseCompletions.courseId, courseIds), inArray(courseCompletions.enrollmentId, enr.map((e) => e.enrollmentId)))),
    ctx.db.select({ id: certificates.id, studentId: certificates.studentId, number: certificates.number, issuedAt: certificates.issuedAt, verifyToken: certificates.verifyToken })
      .from(certificates).where(and(eq(certificates.learningPathId, p.id), eq(certificates.status, "valid"), inArray(certificates.studentId, studentIds))),
  ]);
  const enrToStudent = new Map(enr.map((e) => [e.enrollmentId, e.studentId]));
  const out: PathStudentRow[] = [];
  for (const s of studs) {
    const mine = enr.filter((e) => e.studentId === s.id);
    const centerId = s.homeCenterId ?? mine[mine.length - 1]?.classCenterId ?? null;
    // Phạm vi cơ sở: chỉ học viên thuộc cơ sở mình thấy (theo cơ sở chính hoặc lớp đã học)
    if (visible !== null) {
      const vis: string[] = visible;
      if (!mine.some((e) => vis.includes(e.classCenterId)) && !(centerId && vis.includes(centerId))) continue;
    }
    const prog = pathProgress(
      pcs.map((c) => ({ courseId: c.courseId, seq: c.seq, required: c.required, code: c.code, name: c.name })),
      comps.filter((c) => enrToStudent.get(c.enrollmentId) === s.id),
      mine.filter((e) => OPEN_ENROLLMENT.includes(e.status)).map((e) => e.courseId),
    );
    const cert = certs.find((c) => c.studentId === s.id);
    out.push({
      studentId: s.id, fullName: s.fullName, code: s.code, centerId, centerCode: s.centerCode ?? null,
      completed: prog.completed, requiredCompleted: prog.requiredCompleted, requiredTotal: prog.requiredTotal, total: prog.total, percent: prog.percent, eligible: prog.eligible,
      courses: prog.courses.map((c) => ({ courseId: c.courseId, code: c.code ?? "", name: c.name ?? "", required: c.required, state: c.state, stateLabel: PATH_COURSE_STATE_VI[c.state] })),
      certificate: cert ? { id: cert.id, number: cert.number, issuedAt: iso(cert.issuedAt), verifyPath: certificateVerifyPath(cert.verifyToken) } : null,
    });
  }
  const byName = (a: PathStudentRow, b: PathStudentRow) => a.fullName.localeCompare(b.fullName, "vi");
  return {
    path: { id: p.id, code: p.code, name: p.name },
    eligible: out.filter((r) => r.eligible && !r.certificate).sort(byName),
    issued: out.filter((r) => r.certificate).sort(byName),
    inProgress: out.filter((r) => !r.eligible && !r.certificate && r.completed + r.courses.filter((c) => c.state === "in_progress").length > 0)
      .sort((a, b) => b.percent - a.percent || byName(a, b)),
    canIssue: canIssueAnywhere(ctx),
  };
}

function canIssueAnywhere(ctx: ProtectedContext): boolean {
  const where = centersWith(ctx.actor, "completion:approve");
  return where === null || where.length > 0;
}

/** Học viên đủ điều kiện nhận chứng nhận của lộ trình nhưng chưa được cấp */
export async function listEligible(ctx: ProtectedContext, pathId: string) {
  return (await pathStudents(ctx, pathId)).eligible;
}

/* ------------------------------------------------------------------ */
/* Cấp / thu hồi                                                        */
/* ------------------------------------------------------------------ */

function newVerifyToken(): string {
  // 32 byte ngẫu nhiên → 43 ký tự base64url (≥ 24 byte theo yêu cầu, khớp CERTIFICATE_TOKEN_RE)
  return randomBytes(32).toString("base64url");
}

async function issuerNameOf(db: Db, tenantId: string | null): Promise<string> {
  if (!tenantId) return "Sata Robo";
  const [t] = await db.select({ name: tenants.name, legalName: tenants.legalName, isDefault: tenants.isDefault }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!t) return "Sata Robo";
  return t.legalName?.trim() || (t.isDefault ? "Sata Robo" : t.name);
}

/** Sinh số chứng nhận tiếp theo cho (cơ sở, năm) — gọi TRONG transaction, có khoá tư vấn chống trùng */
async function nextPathNumber(tx: Tx, centerCode: string, year: number): Promise<string> {
  const prefix = certificatePrefix(centerCode, year);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${prefix}))`);
  const [mx] = await tx.select({ m: sql<string | null>`max(${certificates.number})` }).from(certificates).where(sql`${certificates.number} like ${prefix + "%"}`);
  return pathCertificateNumber(centerCode, year, nextCertificateSeq(mx?.m ?? null, prefix));
}

/**
 * Cấp chứng nhận lộ trình hàng loạt trong MỘT transaction. Máy chủ tự tính lại điều kiện:
 * học viên chưa đủ điều kiện hoặc đã có chứng nhận còn hiệu lực cho lộ trình → bỏ qua (kèm lý do).
 * Quyền `completion:approve` tại cơ sở của từng học viên.
 */
export async function issuePathCertificates(ctx: ProtectedContext, input: { pathId: string; studentIds: string[]; templateId?: string | null }) {
  const p = await loadPath(ctx, input.pathId);
  if (!p.isActive) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Lộ trình đang ngừng dùng" });
  const wanted = [...new Set(input.studentIds)];
  if (!wanted.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Chọn ít nhất một học viên" });
  const state = await pathStudents(ctx, p.id);
  const eligible = new Map(state.eligible.map((r) => [r.studentId, r]));
  const issuedIds = new Set(state.issued.map((r) => r.studentId));

  const templateRow = input.templateId ? await loadTemplate(ctx, input.templateId)
    : p.certificateTemplateId ? await loadTemplate(ctx, p.certificateTemplateId).catch(() => null)
    : await defaultTemplateRow(ctx.db, p.tenantId);
  const fields = templateRow ? templateFieldsOf(templateRow) : defaultTemplateFields("landscape");
  const pcs = await pathCoursesOf(ctx.db, [p.id]);

  const skipped: { studentId: string; reason: string }[] = [];
  const targets: PathStudentRow[] = [];
  for (const id of wanted) {
    if (issuedIds.has(id)) { skipped.push({ studentId: id, reason: "Đã có chứng nhận còn hiệu lực cho lộ trình này" }); continue; }
    const r = eligible.get(id);
    if (!r) { skipped.push({ studentId: id, reason: "Chưa đủ điều kiện (chưa hoàn thành đủ khoá bắt buộc) hoặc ngoài phạm vi cơ sở" }); continue; }
    if (!authorize(ctx.actor, "completion:approve", { centerId: r.centerId }).allowed) { skipped.push({ studentId: id, reason: "Không có quyền cấp chứng nhận tại cơ sở của học viên" }); continue; }
    targets.push(r);
  }
  if (!targets.length) return { issued: [] as { id: string; studentId: string; number: string }[], skipped };

  const centerIds = [...new Set(targets.map((t) => t.centerId).filter((x): x is string => !!x))];
  const centerRows = centerIds.length ? await ctx.db.select({ id: centers.id, code: centers.code, name: centers.name, address: centers.address, phone: centers.phone }).from(centers).where(inArray(centers.id, centerIds)) : [];
  const avgRows = await ctx.db
    .select({ studentId: enrollments.studentId, avg: sql<string | null>`avg(${courseCompletions.averageScore})::text` })
    .from(courseCompletions).innerJoin(enrollments, eq(enrollments.id, courseCompletions.enrollmentId))
    .where(and(inArray(enrollments.studentId, targets.map((t) => t.studentId)), inArray(courseCompletions.courseId, pcs.map((c) => c.courseId)), eq(courseCompletions.status, "approved"), isNull(courseCompletions.revokedAt)))
    .groupBy(enrollments.studentId);
  const issuerName = await issuerNameOf(ctx.db, p.tenantId);

  const issued = await ctx.db.transaction(async (tx) => {
    const done: { id: string; studentId: string; number: string }[] = [];
    const now = new Date();
    const year = Number(new Date(now.getTime() + 7 * 3600e3).toISOString().slice(0, 4));
    for (const t of targets) {
      const center = centerRows.find((c) => c.id === t.centerId) ?? null;
      const number = await nextPathNumber(tx, center?.code ?? "SR", year);
      const avgRaw = avgRows.find((a) => a.studentId === t.studentId)?.avg ?? null;
      const avg = avgRaw === null ? null : Math.round(Number(avgRaw) * 10) / 10;
      const snapshot = buildCertificateSnapshot({
        kind: "path", certificateNo: number,
        student: { fullName: t.fullName, code: t.code },
        achievement: { name: p.name, description: p.description, criteriaText: p.criteriaText },
        courses: t.courses.filter((c) => c.state === "completed").map((c) => ({ code: c.code, name: c.name })),
        issuedAt: now, grade: avg === null || !Number.isFinite(avg) ? null : gradeFromAverage(avg),
        center: { name: center?.name ?? "Sata Robo", address: center?.address ?? null, phone: center?.phone ?? null },
        issuerName, template: { fields },
      });
      const [row] = await tx.insert(certificates).values({
        tenantId: p.tenantId, kind: "path", learningPathId: p.id, studentId: t.studentId, centerId: t.centerId,
        templateId: templateRow?.id ?? null, number, verifyToken: newVerifyToken(), issuedAt: now, issuedBy: ctx.user.id,
        status: "valid", snapshot,
      }).returning({ id: certificates.id });
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      done.push({ id: row.id, studentId: t.studentId, number });
    }
    await writeAudit(asDb(tx), {
      actorId: ctx.user.id, action: "CREATE", module: "certificates", entity: "certificates", entityId: p.id,
      after: { kind: "path", pathCode: p.code, count: done.length, items: done.map((d) => ({ id: d.id, number: d.number })) }, ip: ctx.ip,
    });
    return done;
  });
  return { issued, skipped };
}

/**
 * Tạo chứng nhận kind='course' cho một hoàn thành khoá vừa được duyệt — gọi TRONG transaction cấp hoàn thành khoá
 * (`reportCards.issueCompletion`) để hoàn thành khoá mới cũng có QR xác thực. Giữ nguyên số SR-… đã sinh.
 */
export async function createCourseCertificate(tx: Db, input: { completionId: string; number: string; issuedAt: Date; issuedBy: string }) {
  const [r] = await tx
    .select({
      studentId: students.id, fullName: students.fullName, code: students.code, grade: courseCompletions.grade,
      courseCode: courses.code, courseName: courses.name, totalSessions: courses.totalSessions,
      centerId: centers.id, centerName: centers.name, centerAddress: centers.address, centerPhone: centers.phone, tenantId: centers.tenantId,
    })
    .from(courseCompletions)
    .innerJoin(enrollments, eq(enrollments.id, courseCompletions.enrollmentId))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(centers, eq(centers.id, classes.centerId))
    .innerJoin(courses, eq(courses.id, courseCompletions.courseId))
    .where(eq(courseCompletions.id, input.completionId)).limit(1);
  if (!r) return null;
  const [exists] = await tx.select({ id: certificates.id }).from(certificates).where(and(eq(certificates.courseCompletionId, input.completionId), eq(certificates.status, "valid"))).limit(1);
  if (exists) return exists.id;
  const template = await defaultTemplateRow(tx, r.tenantId);
  const fields = template ? templateFieldsOf(template) : defaultTemplateFields("landscape");
  const snapshot = buildCertificateSnapshot({
    kind: "course", certificateNo: input.number,
    student: { fullName: r.fullName, code: r.code },
    achievement: { name: r.courseName, criteriaText: `Hoàn thành chương trình khoá học ${r.courseName} (${r.totalSessions} buổi)` },
    courses: [{ code: r.courseCode, name: r.courseName }],
    issuedAt: input.issuedAt, grade: r.grade,
    center: { name: r.centerName, address: r.centerAddress, phone: r.centerPhone },
    issuerName: await issuerNameOf(tx, r.tenantId), template: { fields },
  });
  const [row] = await tx.insert(certificates).values({
    tenantId: r.tenantId, kind: "course", courseCompletionId: input.completionId, studentId: r.studentId, centerId: r.centerId,
    templateId: template?.id ?? null, number: input.number, verifyToken: newVerifyToken(), issuedAt: input.issuedAt, issuedBy: input.issuedBy,
    status: "valid", snapshot,
  }).returning({ id: certificates.id });
  return row?.id ?? null;
}

type CertRow = typeof certificates.$inferSelect;

async function loadCert(ctx: ProtectedContext, id: string): Promise<CertRow> {
  const [c] = await ctx.db.select().from(certificates).where(eq(certificates.id, id)).limit(1);
  if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy giấy chứng nhận" });
  assertTenant(ctx, c, "Giấy chứng nhận");
  return c;
}

/** Thu hồi (bắt buộc lý do). Chứng nhận khoá thu hồi thì bản ghi hoàn thành khoá cũng đánh dấu thu hồi. */
export async function revokeCertificate(ctx: ProtectedContext, input: { id: string; reason: string }) {
  const c = await loadCert(ctx, input.id);
  requirePermission(ctx, "completion:approve", { centerId: c.centerId });
  const err = validateRevokeReason(input.reason);
  if (err) throw new TRPCError({ code: "BAD_REQUEST", message: err });
  if (c.status === "revoked") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Giấy chứng nhận đã bị thu hồi trước đó" });
  const now = new Date();
  await ctx.db.transaction(async (tx) => {
    await tx.update(certificates).set({ status: "revoked", revokedAt: now, revokedBy: ctx.user.id, revokeReason: input.reason.trim(), updatedAt: now }).where(eq(certificates.id, c.id));
    if (c.courseCompletionId) await tx.update(courseCompletions).set({ revokedAt: now, updatedAt: now }).where(eq(courseCompletions.id, c.courseCompletionId));
    await writeAudit(asDb(tx), {
      actorId: ctx.user.id, action: "TRANSITION", module: "certificates", entity: "certificates", entityId: c.id,
      before: { status: "valid", number: c.number }, after: { status: "revoked" }, reason: input.reason.trim(), ip: ctx.ip,
    });
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Đọc / in                                                             */
/* ------------------------------------------------------------------ */

function snapshotOf(c: CertRow): CertificateSnapshot {
  if (isCertificateSnapshot(c.snapshot)) return c.snapshot;
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Bản chụp chứng nhận hỏng — liên hệ quản trị" });
}

export interface PrintableCertificate {
  id: string;
  kind: CertificateKind;
  kindLabel: string;
  number: string;
  status: CertificateStatus;
  statusLabel: string;
  revokedAt: string | null;
  revokeReason: string | null;
  studentId: string;
  issuedAt: string | null;
  verifyUrl: string;
  qrSvg: string;
  snapshot: CertificateSnapshot;
  template: CertificateTemplateView;
}

async function toPrintable(ctx: ProtectedContext, rows: CertRow[]): Promise<PrintableCertificate[]> {
  const pathIds = [...new Set(rows.map((r) => r.learningPathId).filter((x): x is string => !!x))];
  const paths = pathIds.length ? await ctx.db.select({ id: learningPaths.id, templateId: learningPaths.certificateTemplateId }).from(learningPaths).where(inArray(learningPaths.id, pathIds)) : [];
  const tplIds = [...new Set([...rows.map((r) => r.templateId), ...paths.map((p) => p.templateId)].filter((x): x is string => !!x))];
  const tpls = tplIds.length ? await ctx.db.select().from(certificateTemplates).where(inArray(certificateTemplates.id, tplIds)) : [];
  const defaults = new Map<string, TemplateRow | null>();
  const out: PrintableCertificate[] = [];
  for (const r of rows) {
    const pathTpl = paths.find((p) => p.id === r.learningPathId)?.templateId ?? null;
    let t = tpls.find((x) => x.id === r.templateId) ?? tpls.find((x) => x.id === pathTpl) ?? null;
    if (!t) {
      const k = r.tenantId ?? "";
      if (!defaults.has(k)) defaults.set(k, await defaultTemplateRow(ctx.db, r.tenantId));
      t = defaults.get(k) ?? null;
    }
    const verifyUrl = `${appUrl()}${certificateVerifyPath(r.verifyToken)}`;
    out.push({
      id: r.id, kind: r.kind, kindLabel: CERTIFICATE_KIND_VI[r.kind], number: r.number, status: r.status, statusLabel: CERTIFICATE_STATUS_VI[r.status],
      revokedAt: iso(r.revokedAt), revokeReason: r.revokeReason, studentId: r.studentId, issuedAt: iso(r.issuedAt),
      verifyUrl, qrSvg: qrFor(verifyUrl), snapshot: snapshotOf(r), template: t ? templateView(t) : virtualTemplate(),
    });
  }
  return out;
}

export async function getCertificate(ctx: ProtectedContext, id: string) {
  const c = await loadCert(ctx, id);
  requireCertRead(ctx, c.centerId);
  const [p] = await toPrintable(ctx, [c]);
  return p!;
}

/** Dữ liệu trang in hàng loạt (mỗi chứng nhận một trang A4). Bỏ qua bản ghi không có quyền xem. */
export async function printCertificates(ctx: ProtectedContext, ids: string[]) {
  const uniq = [...new Set(ids)].slice(0, 200);
  if (!uniq.length) return [];
  const rows = await ctx.db.select().from(certificates).where(and(inArray(certificates.id, uniq), tenantCond(ctx, certificates)));
  const allowed = rows.filter((r) => authorize(ctx.actor, "enrollment:read", { centerId: r.centerId }).allowed || authorize(ctx.actor, "completion:read", { centerId: r.centerId }).allowed);
  if (rows.length && !allowed.length) requireCertRead(ctx, rows[0]!.centerId);
  const order = new Map(uniq.map((id, i) => [id, i]));
  allowed.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return toPrintable(ctx, allowed);
}

export async function listForStudent(ctx: ProtectedContext, studentId: string) {
  const [st] = await ctx.db.select({ id: students.id, tenantId: students.tenantId, homeCenterId: students.homeCenterId }).from(students).where(eq(students.id, studentId)).limit(1);
  if (!st) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy học viên" });
  assertTenant(ctx, st, "Học viên");
  requireCertRead(ctx, st.homeCenterId);
  const rows = await ctx.db
    .select({ id: certificates.id, kind: certificates.kind, number: certificates.number, status: certificates.status, issuedAt: certificates.issuedAt, revokedAt: certificates.revokedAt, snapshot: certificates.snapshot, verifyToken: certificates.verifyToken, centerId: certificates.centerId, issuedByName: users.fullName })
    .from(certificates).leftJoin(users, eq(users.id, certificates.issuedBy))
    .where(and(eq(certificates.studentId, studentId), tenantCond(ctx, certificates)))
    .orderBy(desc(certificates.issuedAt));
  return rows.filter((r) => centerVisible(ctx, r.centerId)).map((r) => ({
    id: r.id, kind: r.kind, kindLabel: CERTIFICATE_KIND_VI[r.kind], number: r.number, status: r.status, statusLabel: CERTIFICATE_STATUS_VI[r.status],
    issuedAt: iso(r.issuedAt), revokedAt: iso(r.revokedAt), title: isCertificateSnapshot(r.snapshot) ? r.snapshot.pathName : "", issuedByName: r.issuedByName ?? null,
    verifyPath: certificateVerifyPath(r.verifyToken),
  }));
}

/* ------------------------------------------------------------------ */
/* Trang xác thực công khai /cn/<token>                                 */
/* ------------------------------------------------------------------ */

export interface PublicCertificateView {
  status: CertificateStatus;
  statusLabel: string;
  revokedDate: string | null;
  kind: CertificateKind;
  kindLabel: string;
  achievement: string;
  description: string | null;
  criteriaText: string;
  courses: { code: string; name: string }[];
  recipient: string;
  issuedDate: string;
  issuedDateLong: string;
  number: string;
  issuer: { name: string; centerName: string; address: string | null; phone: string | null };
  /** Chỉ có khi học viên đang có link chia sẻ hồ sơ học tập còn hiệu lực */
  portfolioPath: string | null;
}
export type PublicCertificateResult = { state: "not_found" } | { state: "ok"; cert: PublicCertificateView };

/**
 * Xác thực công khai: token là quyền. KHÔNG trả SĐT / email phụ huynh, ngày sinh, mã học viên,
 * lý do thu hồi hay người cấp — chỉ đủ để đối chiếu giấy in (Open Badges: name, criteria, issuer, recipient, validFrom, evidence).
 */
export async function publicCertificate(db: Database, token: string): Promise<PublicCertificateResult> {
  if (!CERTIFICATE_TOKEN_RE.test(token)) return { state: "not_found" };
  const d = asDb(db);
  const [c] = await d.select().from(certificates).where(eq(certificates.verifyToken, token)).limit(1);
  if (!c || !isCertificateSnapshot(c.snapshot)) return { state: "not_found" };
  const s = c.snapshot;
  const [center] = c.centerId ? await d.select({ name: centers.name, address: centers.address, phone: centers.phone }).from(centers).where(eq(centers.id, c.centerId)).limit(1) : [];
  let portfolioPath: string | null = null;
  if (c.status === "valid") {
    const [share] = await d.select({ token: portfolioShares.token })
      .from(portfolioShares)
      .where(and(eq(portfolioShares.studentId, c.studentId), isNull(portfolioShares.revokedAt), sql`${portfolioShares.expiresAt} > now()`))
      .orderBy(sql`case when ${portfolioShares.scope} = 'all' then 0 else 1 end`, desc(portfolioShares.createdAt))
      .limit(1);
    portfolioPath = share ? `/hs/${share.token}` : null;
  }
  return {
    state: "ok",
    cert: {
      status: c.status, statusLabel: CERTIFICATE_STATUS_VI[c.status],
      revokedDate: c.revokedAt ? formatIssuedDate(new Date(c.revokedAt.getTime() + 7 * 3600e3).toISOString().slice(0, 10), "dmy") : null,
      kind: c.kind, kindLabel: CERTIFICATE_KIND_VI[c.kind],
      achievement: s.pathName, description: s.description, criteriaText: s.criteriaText, courses: s.courses ?? [],
      recipient: s.studentName,
      issuedDate: formatIssuedDate(s.issuedDate, "dmy"), issuedDateLong: formatIssuedDate(s.issuedDate, "long"),
      number: c.number,
      issuer: { name: s.issuerName, centerName: center?.name ?? s.centerName, address: center?.address ?? s.centerAddress, phone: center?.phone ?? s.centerPhone },
      portfolioPath,
    },
  };
}
