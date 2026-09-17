import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray, sql, desc, asc, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  assignments, assignmentTemplates, submissions, documents, documentVersions, classes, courses, sessions, enrollments, students, centers,
  studentGuardians, parentNotifications, users, lessons, type Database,
} from "@satarobo/db";
import {
  authorize, visibleCenterIds, hasPermission,
  validateAssignment, submissionTransition, validateGrade, validateSubmission, assignmentStats, earnsCoin,
  ASSIGNMENT_STATUS_VI, SUBMISSION_STATUS_VI, SUBMISSION_TYPE_VI, SUBMISSION_MIME,
  type Permission, type AssignmentStatus, type SubmissionStatus, type SubmissionType, type SubmissionAction,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { getOps } from "./opsSettings";
import { writeAudit } from "./audit";
import { putObject, signedFileUrl } from "../storage";
import { awardCoins } from "./rewards";

type Db = ProtectedContext["db"];
const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });
const pre = (m: string | string[]) => new TRPCError({ code: "PRECONDITION_FAILED", message: Array.isArray(m) ? m.join("; ") : m });
const notFound = (m: string) => new TRPCError({ code: "NOT_FOUND", message: m });
const forbid = (m: string) => new TRPCError({ code: "FORBIDDEN", message: m });
const asDb = (d: Database) => d as unknown as Db;
const PAGE = 50;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

function rule<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if ((e as Error)?.name === "ContentRuleError") throw pre((e as Error).message);
    throw e;
  }
}

type ClassRef = { id: string; code: string; name: string; centerId: string; courseId: string; status: string; leadTeacherId: string | null; assistantTeacherId: string | null };
const owners = (c: ClassRef) => [c.leadTeacherId, c.assistantTeacherId].filter((x): x is string => !!x);
const canOn = (ctx: ProtectedContext, p: Permission, c: ClassRef) => authorize(ctx.actor, p, { centerId: c.centerId, ownerIds: owners(c) }).allowed;

async function loadClass(db: Db, id: string): Promise<ClassRef> {
  const c = await db.query.classes.findFirst({ where: eq(classes.id, id), columns: { id: true, code: true, name: true, centerId: true, courseId: true, status: true, leadTeacherId: true, assistantTeacherId: true } });
  if (!c) throw notFound("Không tìm thấy lớp");
  return c;
}
async function loadAssignment(ctx: ProtectedContext, id: string, perm: Permission) {
  const a = await ctx.db.query.assignments.findFirst({ where: eq(assignments.id, id) });
  if (!a) throw notFound("Không tìm thấy bài tập");
  const c = await loadClass(ctx.db, a.classId);
  if (!canOn(ctx, perm, c)) throw forbid(perm === "assignment:read" ? "Không xem được bài tập của lớp này" : "Chỉ giáo viên của lớp / giáo vụ / quản lý được thao tác");
  return { a, c };
}
/** Lọc lớp theo quyền: GV → lớp mình dạy; còn lại → theo cơ sở */
function classScope(ctx: ProtectedContext): SQL {
  const wide = ctx.actor.assignments.some((x) => authorize({ userId: ctx.actor.userId, assignments: [x] }, "assignment:read", {}).allowed);
  if (wide) {
    const v = visibleCenterIds(ctx.actor);
    return v === null ? sql`true` : v.length ? (inArray(classes.centerId, v) as SQL) : sql`false`;
  }
  const tid = ctx.actor.personId ?? "00000000-0000-0000-0000-000000000000";
  return sql`(${classes.leadTeacherId} = ${tid} or ${classes.assistantTeacherId} = ${tid})`;
}
const newToken = () => randomBytes(18).toString("base64url");

/* ------------------------------------------------------------------ */
/* Mẫu bài tập                                                          */
/* ------------------------------------------------------------------ */

export async function listTemplates(ctx: ProtectedContext, input: { courseId?: string; includeInactive?: boolean }) {
  if (!hasPermission(ctx.actor, "assignment:read") && !hasPermission(ctx.actor, "assignment:configure")) throw forbid("Không có quyền xem mẫu bài tập");
  const conds: SQL[] = [];
  if (input.courseId) conds.push(eq(assignmentTemplates.courseId, input.courseId));
  if (!input.includeInactive) conds.push(eq(assignmentTemplates.isActive, true));
  const rows = await ctx.db.select({ t: assignmentTemplates, courseCode: courses.code, lessonSeq: lessons.sequenceNo, lessonTitle: lessons.title,
    used: sql<number>`(select count(*)::int from ${assignments} a where a.template_id = ${assignmentTemplates.id})` })
    .from(assignmentTemplates).innerJoin(courses, eq(courses.id, assignmentTemplates.courseId)).leftJoin(lessons, eq(lessons.id, assignmentTemplates.lessonId))
    .where(conds.length ? and(...conds) : undefined).orderBy(asc(courses.code), sql`${lessons.sequenceNo} nulls last`, asc(assignmentTemplates.title));
  return { canEdit: authorize(ctx.actor, "assignment:configure", {}).allowed, items: rows.map((r) => ({ ...r.t, courseCode: r.courseCode, lessonSeq: r.lessonSeq, lessonTitle: r.lessonTitle, used: r.used, typeLabel: SUBMISSION_TYPE_VI[r.t.submissionType as SubmissionType] })) };
}

export async function upsertTemplate(ctx: ProtectedContext, input: { id?: string; courseId: string; lessonId?: string | null; title: string; instructions: string; submissionType: SubmissionType; maxScore: number; documentIds?: string[]; isActive?: boolean }) {
  requirePermission(ctx, "assignment:configure");
  if (input.title.trim().length < 3) throw bad("Tiêu đề tối thiểu 3 ký tự");
  if (input.instructions.trim().length < 10) throw bad("Hướng dẫn tối thiểu 10 ký tự");
  if (![10, 100].includes(input.maxScore)) throw bad("Thang điểm 10 hoặc 100");
  const docIds = await checkDocs(ctx.db, input.courseId, input.documentIds ?? [], false);
  const v = { courseId: input.courseId, lessonId: input.lessonId ?? null, title: input.title.trim(), instructions: input.instructions.trim(), submissionType: input.submissionType, maxScore: input.maxScore, documentIds: docIds, isActive: input.isActive ?? true };
  if (input.id) {
    const up = await ctx.db.update(assignmentTemplates).set(v).where(eq(assignmentTemplates.id, input.id)).returning({ id: assignmentTemplates.id });
    if (!up.length) throw notFound("Không tìm thấy mẫu");
    await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "content", entity: "assignment_templates", entityId: input.id, after: v, ip: ctx.ip });
    return { id: input.id };
  }
  const [r] = await ctx.db.insert(assignmentTemplates).values({ ...v, createdBy: ctx.user.id }).returning({ id: assignmentTemplates.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "content", entity: "assignment_templates", entityId: r!.id, after: v, ip: ctx.ip });
  return { id: r!.id };
}

/** Tài liệu đính kèm phải thuộc khoá, đã phát hành; bài giao cho HV chỉ đính tài liệu dành cho HV */
async function checkDocs(db: Db, courseId: string, ids: string[], forStudents: boolean) {
  const uniq = [...new Set(ids)].slice(0, 10);
  if (!uniq.length) return [];
  const rows = await db.select({ id: documents.id, courseId: documents.courseId, status: documents.status, audience: documents.audience }).from(documents).where(inArray(documents.id, uniq));
  if (rows.length !== uniq.length || rows.some((r) => r.courseId !== courseId)) throw bad("Tài liệu đính kèm không thuộc khoá học");
  if (rows.some((r) => r.status !== "published")) throw bad("Chỉ đính kèm tài liệu đang dùng");
  if (forStudents && rows.some((r) => r.audience !== "student")) throw bad("Chỉ đính kèm tài liệu dành cho học viên / phụ huynh");
  return uniq;
}

/* ------------------------------------------------------------------ */
/* Bài tập                                                              */
/* ------------------------------------------------------------------ */

export async function listAssignments(ctx: ProtectedContext, input: { classId?: string; status?: AssignmentStatus; page?: number }) {
  if (!hasPermission(ctx.actor, "assignment:read")) throw forbid("Không có quyền xem bài tập");
  const conds: SQL[] = [classScope(ctx)];
  if (input.classId) conds.push(eq(assignments.classId, input.classId));
  if (input.status) conds.push(eq(assignments.status, input.status));
  const page = input.page ?? 1;
  const cnt = (st: string) => sql<number>`(select count(*)::int from ${submissions} s where s.assignment_id = ${assignments.id} and s.status = ${st})`;
  const rows = await ctx.db.select({
    a: assignments, classCode: classes.code, className: classes.name, centerId: classes.centerId, sessionSeq: sessions.sequenceNo, byName: users.fullName,
    total: sql<number>`(select count(*)::int from ${submissions} s where s.assignment_id = ${assignments.id} and s.status <> 'excused')`,
    submitted: cnt("submitted"), graded: cnt("graded"), missing: cnt("missing"), returned: cnt("returned"),
  }).from(assignments).innerJoin(classes, eq(classes.id, assignments.classId)).leftJoin(sessions, eq(sessions.id, assignments.sessionId)).leftJoin(users, eq(users.id, assignments.createdBy))
    .where(and(...conds)).orderBy(sql`case ${assignments.status} when 'published' then 0 when 'draft' then 1 else 2 end`, desc(assignments.dueAt)).limit(PAGE).offset((page - 1) * PAGE);
  const [c] = await ctx.db.select({
    total: sql<number>`count(*)::int`,
    toGrade: sql<number>`coalesce(sum((select count(*) from ${submissions} s where s.assignment_id = ${assignments.id} and s.status = 'submitted')), 0)::int`,
    overdue: sql<number>`count(*) filter (where ${assignments.status} = 'published' and ${assignments.dueAt} < now())::int`,
  }).from(assignments).innerJoin(classes, eq(classes.id, assignments.classId)).where(and(...conds));
  const cls = await ctx.db.select({ id: classes.id, code: classes.code, name: classes.name, centerId: classes.centerId, courseId: classes.courseId, status: classes.status, leadTeacherId: classes.leadTeacherId, assistantTeacherId: classes.assistantTeacherId })
    .from(classes).where(and(classScope(ctx), inArray(classes.status, ["running", "recruiting"]))).orderBy(asc(classes.code));
  const now = Date.now();
  return {
    page, pageSize: PAGE, total: c?.total ?? 0, toGrade: c?.toGrade ?? 0, overdue: c?.overdue ?? 0,
    classes: cls.map((x) => ({ id: x.id, code: x.code, name: x.name, courseId: x.courseId, canCreate: canOn(ctx, "assignment:create", x) })),
    items: rows.map((r) => ({
      ...r.a, statusLabel: ASSIGNMENT_STATUS_VI[r.a.status as AssignmentStatus], typeLabel: SUBMISSION_TYPE_VI[r.a.submissionType as SubmissionType],
      classCode: r.classCode, className: r.className, sessionSeq: r.sessionSeq, byName: r.byName,
      counts: { total: r.total, submitted: r.submitted, graded: r.graded, missing: r.missing, returned: r.returned },
      overdue: r.a.status === "published" && r.a.dueAt.getTime() < now,
    })),
  };
}

export async function getAssignment(ctx: ProtectedContext, id: string) {
  const { a, c } = await loadAssignment(ctx, id, "assignment:read");
  const rows = await ctx.db.select({ s: submissions, fullName: students.fullName, code: students.code, gradedByName: users.fullName })
    .from(submissions).innerJoin(students, eq(students.id, submissions.studentId)).leftJoin(users, eq(users.id, submissions.gradedBy))
    .where(eq(submissions.assignmentId, a.id)).orderBy(asc(students.fullName));
  const docs = a.documentIds.length
    ? await ctx.db.select({ id: documents.id, title: documents.title, kind: documents.kind }).from(documents).where(inArray(documents.id, a.documentIds))
    : [];
  const session = a.sessionId ? await ctx.db.query.sessions.findFirst({ where: eq(sessions.id, a.sessionId) }) : null;
  const canEdit = canOn(ctx, "assignment:update", c);
  const canGrade = canOn(ctx, "assignment:grade", c);
  const roster = await rosterIds(ctx.db, c.id);
  const missingFromRoster = a.status === "draft" ? 0 : roster.filter((sid) => !rows.some((r) => r.s.studentId === sid)).length;
  return {
    ...a, statusLabel: ASSIGNMENT_STATUS_VI[a.status as AssignmentStatus], typeLabel: SUBMISSION_TYPE_VI[a.submissionType as SubmissionType],
    class: { id: c.id, code: c.code, name: c.name, courseId: c.courseId }, sessionSeq: session?.sequenceNo ?? null, sessionDate: session?.date ?? null,
    docs, canEdit, canGrade, missingFromRoster, rosterSize: roster.length,
    stats: assignmentStats(rows.map((r) => ({ status: r.s.status as SubmissionStatus, score: r.s.score, late: r.s.late })), a.maxScore),
    submissions: rows.map((r) => ({
      id: r.s.id, studentId: r.s.studentId, fullName: r.fullName, code: r.code, status: r.s.status as SubmissionStatus, statusLabel: SUBMISSION_STATUS_VI[r.s.status as SubmissionStatus],
      answerText: r.s.answerText, link: r.s.link, submittedAt: r.s.submittedAt, submittedVia: r.s.submittedVia, late: r.s.late, attempts: r.s.attempts,
      score: r.s.score, feedback: r.s.feedback, gradedAt: r.s.gradedAt, gradedByName: r.gradedByName, coinAwarded: !!r.s.coinTxId, note: r.s.note,
      files: r.s.files.map((f) => ({ name: f.name, mime: f.mime, size: f.size, url: signedFileUrl(f.key, f.name, 900, true) })),
      parentLink: canEdit ? `/bt/${r.s.token}` : null,
    })),
  };
}

async function rosterIds(db: Db, classId: string) {
  return (await db.select({ s: enrollments.studentId }).from(enrollments).where(and(eq(enrollments.classId, classId), inArray(enrollments.status, ["active", "trial"])))).map((r) => r.s);
}

export interface AssignmentInput {
  id?: string; classId: string; sessionId?: string | null; templateId?: string | null; title: string; instructions: string; submissionType: SubmissionType;
  maxScore: number; dueAt: string; allowLate: boolean; coinReward: number; documentIds?: string[];
}

export async function upsertAssignment(ctx: ProtectedContext, input: AssignmentInput) {
  const c = await loadClass(ctx.db, input.classId);
  if (!canOn(ctx, input.id ? "assignment:update" : "assignment:create", c)) throw forbid("Chỉ giáo viên của lớp / giáo vụ / quản lý được giao bài");
  if (!["running", "recruiting"].includes(c.status)) throw pre("Lớp không còn hoạt động");
  const dueAt = new Date(input.dueAt);
  const old = input.id ? await ctx.db.query.assignments.findFirst({ where: eq(assignments.id, input.id) }) : null;
  if (input.id && !old) throw notFound("Không tìm thấy bài tập");
  if (old && old.classId !== c.id) throw bad("Không chuyển bài tập sang lớp khác");
  if (old?.status === "closed") throw pre("Bài tập đã đóng — mở lại trước khi sửa");
  const errs = validateAssignment({ ...input, dueAt, now: new Date(), isNew: !old || old.dueAt.getTime() !== dueAt.getTime() });
  if (errs.length) throw bad(errs);
  if (input.sessionId) {
    const se = await ctx.db.query.sessions.findFirst({ where: eq(sessions.id, input.sessionId) });
    if (!se || se.classId !== c.id) throw bad("Buổi học không thuộc lớp");
  }
  if (input.templateId) {
    const t = await ctx.db.query.assignmentTemplates.findFirst({ where: eq(assignmentTemplates.id, input.templateId) });
    if (!t || t.courseId !== c.courseId) throw bad("Mẫu bài tập không thuộc khoá của lớp");
  }
  const docIds = await checkDocs(ctx.db, c.courseId, input.documentIds ?? [], true);
  if (old && old.status === "published") {
    const [g] = await ctx.db.select({ graded: sql<number>`count(*) filter (where ${submissions.status} = 'graded')::int`, turned: sql<number>`count(*) filter (where ${submissions.submittedAt} is not null)::int` })
      .from(submissions).where(eq(submissions.assignmentId, old.id));
    if ((g?.graded ?? 0) > 0 && old.maxScore !== input.maxScore) throw pre("Đã có bài chấm — không đổi thang điểm");
    if ((g?.turned ?? 0) > 0 && old.submissionType !== input.submissionType) throw pre("Đã có bài nộp — không đổi hình thức nộp");
  }
  const v = {
    classId: c.id, sessionId: input.sessionId ?? null, templateId: input.templateId ?? null, title: input.title.trim(), instructions: input.instructions.trim(),
    submissionType: input.submissionType, maxScore: input.maxScore, dueAt, allowLate: input.allowLate, coinReward: input.coinReward, documentIds: docIds,
  };
  if (old) {
    await ctx.db.update(assignments).set(v).where(eq(assignments.id, old.id));
    await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "content", entity: "assignments", entityId: old.id, before: { title: old.title, dueAt: old.dueAt, maxScore: old.maxScore }, after: v, ip: ctx.ip });
    return { id: old.id };
  }
  const [r] = await ctx.db.insert(assignments).values({ ...v, createdBy: ctx.user.id }).returning({ id: assignments.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "content", entity: "assignments", entityId: r!.id, after: { ...v, classCode: c.code }, ip: ctx.ip });
  return { id: r!.id };
}

/** Tạo bài nộp cho HV đang học chưa có trong danh sách + báo phụ huynh */
async function syncRoster(db: Db, a: { id: string; title: string; dueAt: Date }, classId: string, userId: string) {
  const roster = await rosterIds(db, classId);
  const have = (await db.select({ s: submissions.studentId }).from(submissions).where(eq(submissions.assignmentId, a.id))).map((r) => r.s);
  const add = roster.filter((s) => !have.includes(s));
  if (!add.length) return 0;
  const rows = await db.insert(submissions).values(add.map((studentId) => ({ assignmentId: a.id, studentId, token: newToken() }))).returning({ studentId: submissions.studentId, token: submissions.token });
  const guardians = await db.select({ studentId: studentGuardians.studentId, parentId: studentGuardians.parentId, isPrimary: studentGuardians.isPrimary })
    .from(studentGuardians).where(inArray(studentGuardians.studentId, add)).orderBy(desc(studentGuardians.isPrimary));
  const due = a.dueAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const notes = rows.map((r) => {
    const g = guardians.find((x) => x.studentId === r.studentId);
    return g ? { parentId: g.parentId, studentId: r.studentId, channel: "in_app" as const, template: "HOMEWORK_ASSIGNED", title: `Bài tập mới: ${a.title}`, body: `Hạn nộp ${due}. Anh/chị bấm vào liên kết để xem hướng dẫn và nộp bài cho con.`, link: `/bt/${r.token}`, status: "sent" as const, sentAt: new Date(), createdBy: userId } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x);
  if (notes.length) await db.insert(parentNotifications).values(notes);
  return add.length;
}

export async function assignmentAction(ctx: ProtectedContext, input: { id: string; action: "publish" | "close" | "reopen" | "sync" | "delete" }) {
  const { a, c } = await loadAssignment(ctx, input.id, "assignment:update");
  let added = 0;
  let marked = 0;
  if (input.action === "delete") {
    if (a.status !== "draft") throw pre("Chỉ xoá bài tập nháp");
    await ctx.db.delete(assignments).where(eq(assignments.id, a.id));
  } else if (input.action === "publish") {
    if (a.status !== "draft") throw pre("Bài tập đã giao");
    if (a.dueAt.getTime() < Date.now() + 30 * 60_000) throw pre("Hạn nộp đã qua / quá gần — sửa hạn nộp trước khi giao");
    await ctx.db.transaction(async (tx) => {
      await tx.update(assignments).set({ status: "published", publishedAt: new Date() }).where(eq(assignments.id, a.id));
      added = await syncRoster(tx as unknown as Db, a, c.id, ctx.user.id);
    });
    if (!added) throw pre("Lớp chưa có học viên đang học");
  } else if (input.action === "sync") {
    if (a.status !== "published") throw pre("Chỉ cập nhật danh sách cho bài đang giao");
    added = await syncRoster(ctx.db, a, c.id, ctx.user.id);
  } else if (input.action === "close") {
    if (a.status !== "published") throw pre("Chỉ đóng bài đang giao");
    await ctx.db.transaction(async (tx) => {
      const r = await tx.update(submissions).set({ status: "missing" }).where(and(eq(submissions.assignmentId, a.id), inArray(submissions.status, ["assigned", "returned"]))).returning({ id: submissions.id });
      marked = r.length;
      await tx.update(assignments).set({ status: "closed", closedAt: new Date() }).where(eq(assignments.id, a.id));
    });
  } else {
    if (a.status !== "closed") throw pre("Chỉ mở lại bài đã đóng");
    await ctx.db.update(assignments).set({ status: "published", closedAt: null }).where(eq(assignments.id, a.id));
  }
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: input.action === "delete" ? "DELETE" : "TRANSITION", module: "content", entity: "assignments", entityId: a.id, before: { status: a.status }, after: { action: input.action, added, marked }, ip: ctx.ip });
  return { ok: true, added, marked };
}

/* ------------------------------------------------------------------ */
/* Nộp bài                                                              */
/* ------------------------------------------------------------------ */

export interface WorkInput { text?: string | null; link?: string | null; files: { name: string; mime: string; bytes: Uint8Array }[] }

async function submitWork(db: Db, s: typeof submissions.$inferSelect, a: typeof assignments.$inferSelect, via: "parent_link" | "staff", work: WorkInput, userId: string | null) {
  const late = Date.now() > a.dueAt.getTime();
  const to = rule(() => submissionTransition(s.status as SubmissionStatus, "submit", { assignmentStatus: a.status as AssignmentStatus, allowLate: a.allowLate, late }));
  const errs = validateSubmission({ type: a.submissionType as SubmissionType, text: work.text, link: work.link, files: work.files.map((f) => ({ mime: f.mime, size: f.bytes.byteLength })) });
  if (errs.length) throw bad(errs);
  const stored: { key: string; name: string; mime: string; size: number }[] = [];
  for (const f of work.files) {
    const ext = EXT[f.mime] ?? "bin";
    const key = `homework/${a.id}/${s.id}/${s.attempts + 1}-${randomUUID()}.${ext}`;
    await putObject(key, f.bytes);
    stored.push({ key, name: (f.name || `bai-nop.${ext}`).replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 80), mime: f.mime, size: f.bytes.byteLength });
  }
  await db.update(submissions).set({
    status: to, answerText: work.text?.trim() || null, link: work.link?.trim() || null, files: stored, submittedAt: new Date(), submittedVia: via, late, attempts: s.attempts + 1,
  }).where(eq(submissions.id, s.id));
  await writeAudit(db, { actorId: userId, action: "TRANSITION", module: "content", entity: "submissions", entityId: s.id, before: { status: s.status }, after: { status: to, via, late, files: stored.length } });
  return { status: to, late };
}

export async function staffSubmit(ctx: ProtectedContext, input: { submissionId: string } & WorkInput) {
  const s = await ctx.db.query.submissions.findFirst({ where: eq(submissions.id, input.submissionId) });
  if (!s) throw notFound("Không tìm thấy bài nộp");
  const { a } = await loadAssignment(ctx, s.assignmentId, "assignment:grade");
  return submitWork(ctx.db, s, a, "staff", input, ctx.user.id);
}

/** Trang nộp bài cho phụ huynh (token) */
export async function publicHomework(db: Database, token: string) {
  const d = asDb(db);
  const s = await d.query.submissions.findFirst({ where: eq(submissions.token, token) });
  if (!s) return { state: "not_found" as const };
  const a = await d.query.assignments.findFirst({ where: eq(assignments.id, s.assignmentId) });
  if (!a || a.status === "draft") return { state: "not_found" as const };
  const [info] = await d.select({ fullName: students.fullName, classCode: classes.code, className: classes.name, centerName: centers.name })
    .from(students).innerJoin(classes, eq(classes.id, a.classId)).innerJoin(centers, eq(centers.id, classes.centerId)).where(eq(students.id, s.studentId));
  const docs = a.documentIds.length
    ? await d.select({ id: documents.id, title: documents.title, kind: documents.kind, url: documents.url, key: documentVersions.objectKey, fileName: documentVersions.fileName })
      .from(documents).leftJoin(documentVersions, and(eq(documentVersions.documentId, documents.id), eq(documentVersions.version, documents.currentVersion)))
      .where(and(inArray(documents.id, a.documentIds), eq(documents.status, "published"), eq(documents.audience, "student")))
    : [];
  const late = Date.now() > a.dueAt.getTime();
  const canSubmit = a.status === "published" && a.submissionType !== "offline" && (s.status === "assigned" || s.status === "returned") && (!late || a.allowLate);
  const firstName = (info?.fullName ?? "").trim().split(/\s+/).pop() ?? "";
  return {
    state: "open" as const,
    title: a.title, instructions: a.instructions, dueAt: a.dueAt.toISOString(), late, allowLate: a.allowLate, closed: a.status === "closed",
    submissionType: a.submissionType as SubmissionType, typeLabel: SUBMISSION_TYPE_VI[a.submissionType as SubmissionType], maxScore: a.maxScore,
    studentFirstName: firstName, classLabel: info?.className ?? "", centerName: info?.centerName ?? "",
    status: s.status as SubmissionStatus, statusLabel: SUBMISSION_STATUS_VI[s.status as SubmissionStatus], canSubmit,
    submittedAt: s.submittedAt?.toISOString() ?? null, answerText: s.answerText, link: s.link, fileNames: s.files.map((f) => f.name),
    score: s.status === "graded" ? s.score : null, feedback: s.status === "graded" || s.status === "returned" ? s.feedback : null,
    docs: docs.map((x) => ({ title: x.title, url: x.kind === "link" ? x.url : x.key ? signedFileUrl(x.key, x.fileName ?? "tai-lieu", 3600, true) : null })).filter((x) => x.url),
    accept: SUBMISSION_MIME.join(","),
  };
}

export async function submitPublicHomework(db: Database, token: string, work: WorkInput) {
  const d = asDb(db);
  const s = await d.query.submissions.findFirst({ where: eq(submissions.token, token) });
  if (!s) return { ok: false as const, error: "Liên kết không đúng" };
  const a = await d.query.assignments.findFirst({ where: eq(assignments.id, s.assignmentId) });
  if (!a || a.status === "draft") return { ok: false as const, error: "Liên kết không đúng" };
  try {
    const r = await submitWork(d, s, a, "parent_link", work, null);
    return { ok: true as const, ...r };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/* ------------------------------------------------------------------ */
/* Chấm bài                                                             */
/* ------------------------------------------------------------------ */

async function notifyParent(db: Db, studentId: string, title: string, body: string, link: string, userId: string) {
  const [g] = await db.select({ parentId: studentGuardians.parentId }).from(studentGuardians).where(eq(studentGuardians.studentId, studentId)).orderBy(desc(studentGuardians.isPrimary)).limit(1);
  if (g) await db.insert(parentNotifications).values({ parentId: g.parentId, studentId, channel: "in_app", template: "HOMEWORK_RESULT", title, body, link, status: "sent", sentAt: new Date(), createdBy: userId });
}

export async function gradeSubmission(ctx: ProtectedContext, input: { id: string; score: number; feedback?: string | null }) {
  const s = await ctx.db.query.submissions.findFirst({ where: eq(submissions.id, input.id) });
  if (!s) throw notFound("Không tìm thấy bài nộp");
  const { a, c } = await loadAssignment(ctx, s.assignmentId, "assignment:grade");
  const to = rule(() => submissionTransition(s.status as SubmissionStatus, "grade", { assignmentStatus: a.status as AssignmentStatus, allowLate: a.allowLate, late: false }));
  if ((s.status === "assigned" || s.status === "missing") && a.submissionType !== "offline") throw pre("Học viên chưa nộp bài — nộp hộ trước khi chấm, hoặc chọn hình thức nộp tại lớp");
  const errs = validateGrade(input.score, a.maxScore, input.feedback);
  if (errs.length) throw bad(errs);
  const now = new Date();
  await ctx.db.update(submissions).set({ status: to, score: input.score, feedback: input.feedback?.trim() || null, gradedBy: ctx.user.id, gradedAt: now, ...(s.submittedAt ? {} : { submittedAt: now, submittedVia: "staff" }) }).where(eq(submissions.id, s.id));
  let coin: { awarded: number; error: string | null } = { awarded: 0, error: null };
  if (earnsCoin(input.score, a.maxScore, a.coinReward) && !s.coinTxId) {
    try {
      const r = await awardCoins(ctx, { studentIds: [s.studentId], amount: a.coinReward, reason: "homework", classId: c.id, note: `Bài tập: ${a.title}` });
      coin = { awarded: r.total, error: null };
      const [tx] = await ctx.db.execute(sql`select id from coin_transactions where student_id = ${s.studentId} and created_by = ${ctx.user.id} and reason = 'homework' order by created_at desc limit 1`) as unknown as { id: string }[];
      if (tx) await ctx.db.update(submissions).set({ coinTxId: tx.id }).where(eq(submissions.id, s.id));
    } catch (e) {
      coin = { awarded: 0, error: (e as Error).message };
    }
  }
  await notifyParent(ctx.db, s.studentId, `Bài tập "${a.title}" đã được chấm`, `Điểm ${input.score}/${a.maxScore}${input.feedback ? ` — ${input.feedback.trim().slice(0, 150)}` : ""}`, `/bt/${s.token}`, ctx.user.id);
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: s.status === "graded" ? "UPDATE" : "TRANSITION", module: "content", entity: "submissions", entityId: s.id, before: { status: s.status, score: s.score }, after: { status: to, score: input.score, coin: coin.awarded }, ip: ctx.ip });
  return { status: to, coin };
}

export async function submissionAction(ctx: ProtectedContext, input: { id: string; action: Exclude<SubmissionAction, "submit" | "grade">; note?: string | null }) {
  const s = await ctx.db.query.submissions.findFirst({ where: eq(submissions.id, input.id) });
  if (!s) throw notFound("Không tìm thấy bài nộp");
  const { a } = await loadAssignment(ctx, s.assignmentId, "assignment:grade");
  const to = rule(() => submissionTransition(s.status as SubmissionStatus, input.action, { assignmentStatus: a.status as AssignmentStatus, allowLate: a.allowLate, late: false }));
  const note = input.note?.trim() || null;
  if ((input.action === "return" || input.action === "excuse") && (!note || note.length < 5)) throw bad("Cần ghi lý do / hướng dẫn làm lại (≥ 5 ký tự)");
  await ctx.db.update(submissions).set({
    status: to,
    ...(input.action === "return" ? { feedback: note, score: null, gradedAt: null } : {}),
    ...(input.action === "excuse" || input.action === "mark_missing" ? { note } : {}),
  }).where(eq(submissions.id, s.id));
  if (input.action === "return") await notifyParent(ctx.db, s.studentId, `Bài tập "${a.title}" cần làm lại`, note ?? "", `/bt/${s.token}`, ctx.user.id);
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "TRANSITION", module: "content", entity: "submissions", entityId: s.id, before: { status: s.status }, after: { status: to }, reason: note, ip: ctx.ip });
  return { status: to };
}

/** Bài tập của một học viên (hồ sơ HV) */
export async function studentHomework(ctx: ProtectedContext, studentId: string) {
  if (!hasPermission(ctx.actor, "assignment:read")) throw forbid("Không có quyền xem bài tập");
  const rows = await ctx.db.select({ title: assignments.title, dueAt: assignments.dueAt, maxScore: assignments.maxScore, status: submissions.status, score: submissions.score, late: submissions.late, assignmentId: assignments.id, classCode: classes.code })
    .from(submissions).innerJoin(assignments, eq(assignments.id, submissions.assignmentId)).innerJoin(classes, eq(classes.id, assignments.classId))
    .where(and(eq(submissions.studentId, studentId), classScope(ctx))).orderBy(desc(assignments.dueAt)).limit(20);
  const st = assignmentStats(rows.map((r) => ({ status: r.status as SubmissionStatus, score: r.score === null ? null : (r.score / r.maxScore) * 10, late: r.late })), 10);
  return { stats: st, items: rows.map((r) => ({ ...r, statusLabel: SUBMISSION_STATUS_VI[r.status as SubmissionStatus] })) };
}

/** Nhắc hạn: bài còn ≤ N giờ (cấu hình) chưa nộp (worker gọi) — mỗi bài nộp nhắc 1 lần */
export async function remindDueHomework(db: Database) {
  const d = asDb(db);
  const hours = (await getOps(d)).homeworkReminderHours;
  const rows = await d.execute(sql`
    select s.id, s.student_id, s.token, a.title, a.due_at from submissions s join assignments a on a.id = s.assignment_id
    where a.status = 'published' and s.status in ('assigned','returned') and a.submission_type <> 'offline'
      and a.due_at between now() and now() + make_interval(hours => ${hours})
      and not exists (select 1 from parent_notifications n where n.template = 'HOMEWORK_DUE' and n.link = '/bt/' || s.token)
    limit 500`) as unknown as { id: string; student_id: string; token: string; title: string; due_at: Date }[];
  let n = 0;
  for (const r of rows) {
    const [g] = await d.select({ parentId: studentGuardians.parentId }).from(studentGuardians).where(eq(studentGuardians.studentId, r.student_id)).orderBy(desc(studentGuardians.isPrimary)).limit(1);
    if (!g) continue;
    await d.insert(parentNotifications).values({ parentId: g.parentId, studentId: r.student_id, channel: "in_app", template: "HOMEWORK_DUE", title: `Sắp hết hạn nộp: ${r.title}`, body: "Bài tập của con sắp đến hạn. Anh/chị nhắc con hoàn thành và nộp qua liên kết nhé.", link: `/bt/${r.token}`, status: "sent", sentAt: new Date() });
    n++;
  }
  return n;
}
