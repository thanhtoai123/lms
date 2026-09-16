import { and, eq, inArray, sql, asc, desc, ilike, or, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { enrollments, enrollmentEvents, students, classes, courses, centers, parents, studentGuardians } from "@satarobo/db";
import {
  enrollmentTransition, planTransfer, remainingSessions, isNearingEnd, validatePause, EVENTS_REQUIRING_REASON, DEFAULT_STUDENT_POLICY, maskPhone,
  type EnrollmentEvent, type EnrollmentStatus,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { enforcePrerequisites } from "./catalog";
import { emit } from "./outbox";
import { consumedSql, centerScope, canSeeFullPhone } from "./students";

type Db = ProtectedContext["db"];

const baseSelect = {
  id: enrollments.id, status: enrollments.status, packageSessions: enrollments.packageSessions, startSequenceNo: enrollments.startSequenceNo,
  enrolledAt: enrollments.enrolledAt, endedAt: enrollments.endedAt, endReason: enrollments.endReason, pausedAt: enrollments.pausedAt, pauseUntil: enrollments.pauseUntil,
  studentId: students.id, studentCode: students.code, studentName: students.fullName,
  classId: classes.id, classCode: classes.code, className: classes.name, courseId: classes.courseId, courseCode: courses.code,
  centerId: classes.centerId, centerCode: centers.code, consumed: consumedSql,
};

export async function listEnrollments(ctx: ProtectedContext, input: { q?: string; centerId?: string; classId?: string; status?: EnrollmentStatus; page?: number; pageSize?: number }) {
  requirePermission(ctx, "enrollment:read", { centerId: input.centerId ?? null });
  const conds = [centerScope(ctx, classes.centerId), isNull(students.deletedAt)];
  if (input.centerId) conds.push(eq(classes.centerId, input.centerId));
  if (input.classId) conds.push(eq(enrollments.classId, input.classId));
  if (input.status) conds.push(eq(enrollments.status, input.status));
  if (input.q) conds.push(or(ilike(students.fullName, `%${input.q}%`), ilike(students.code, `%${input.q}%`), ilike(classes.code, `%${input.q}%`))!);
  const pageSize = Math.min(input.pageSize ?? 20, 100);
  const page = Math.max(1, input.page ?? 1);
  const from = ctx.db.select(baseSelect).from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId)).innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(courses, eq(courses.id, classes.courseId)).innerJoin(centers, eq(centers.id, classes.centerId));
  const [total] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId)).innerJoin(classes, eq(classes.id, enrollments.classId)).where(and(...conds));
  const [counts] = await ctx.db
    .select({
      trial: sql<number>`count(*) filter (where ${enrollments.status} = 'trial')::int`,
      active: sql<number>`count(*) filter (where ${enrollments.status} = 'active')::int`,
      paused: sql<number>`count(*) filter (where ${enrollments.status} = 'paused')::int`,
      completed: sql<number>`count(*) filter (where ${enrollments.status} = 'completed')::int`,
      withdrawn: sql<number>`count(*) filter (where ${enrollments.status} = 'withdrawn')::int`,
    })
    .from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).where(centerScope(ctx, classes.centerId));
  const rows = await from.where(and(...conds)).orderBy(desc(enrollments.enrolledAt)).limit(pageSize).offset((page - 1) * pageSize);
  return { total: total?.n ?? 0, page, pageSize, counts, items: rows.map((r) => ({ ...r, remaining: remainingSessions(r.packageSessions, r.consumed) })) };
}

async function loadEnrollment(ctx: ProtectedContext, id: string) {
  const [row] = await ctx.db.select(baseSelect).from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId)).innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(courses, eq(courses.id, classes.courseId)).innerJoin(centers, eq(centers.id, classes.centerId))
    .where(eq(enrollments.id, id)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy đăng ký học" });
  return row;
}

async function logEvent(db: Db, e: { enrollmentId: string; type: typeof enrollmentEvents.$inferInsert.type; from?: EnrollmentStatus | null; to?: EnrollmentStatus | null; reason?: string | null; meta?: Record<string, unknown>; actorId: string }) {
  await db.insert(enrollmentEvents).values({ enrollmentId: e.enrollmentId, type: e.type, fromStatus: e.from ?? null, toStatus: e.to ?? null, reason: e.reason ?? null, meta: e.meta ?? null, actorId: e.actorId });
}

/** Ghi danh mới (kiểm tra sức chứa, trùng ghi danh mở) */
export async function createEnrollment(ctx: ProtectedContext, input: { studentId: string; classId: string; packageSessions: number; startSequenceNo?: number; status?: "active" | "trial"; note?: string | null; waiverReason?: string | null }) {
  const cls = await ctx.db.query.classes.findFirst({ where: eq(classes.id, input.classId) });
  if (!cls) throw new TRPCError({ code: "NOT_FOUND", message: "Lớp không tồn tại" });
  requirePermission(ctx, "enrollment:create", { centerId: cls.centerId });
  if (cls.status === "finished" || cls.status === "cancelled") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Lớp đã kết thúc hoặc bị huỷ" });
  const st = await ctx.db.query.students.findFirst({ where: and(eq(students.id, input.studentId), isNull(students.deletedAt)) });
  if (!st) throw new TRPCError({ code: "NOT_FOUND", message: "Học viên không tồn tại" });
  const waiver = await enforcePrerequisites(ctx, { studentId: st.id, courseId: cls.courseId, centerId: cls.centerId, waiverReason: input.waiverReason });

  return ctx.db.transaction(async (tx) => {
    const [cnt] = await tx.select({ n: sql<number>`count(*)::int` }).from(enrollments).where(and(eq(enrollments.classId, cls.id), inArray(enrollments.status, ["active", "trial", "paused"])));
    if ((cnt?.n ?? 0) >= cls.capacity) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Lớp đã đủ ${cls.capacity} học viên` });
    const dup = await tx.query.enrollments.findFirst({ where: and(eq(enrollments.studentId, st.id), eq(enrollments.classId, cls.id), inArray(enrollments.status, ["active", "trial", "paused"])) });
    if (dup) throw new TRPCError({ code: "CONFLICT", message: "Học viên đã có đăng ký đang mở ở lớp này" });
    const status = input.status ?? "active";
    const [row] = await tx.insert(enrollments).values({ studentId: st.id, classId: cls.id, packageSessions: input.packageSessions, startSequenceNo: input.startSequenceNo ?? 1, status, createdBy: ctx.user.id }).returning();
    await logEvent(tx as unknown as Db, { enrollmentId: row!.id, type: "created", to: status, reason: [input.note, waiver].filter(Boolean).join(" · ") || null, meta: { packageSessions: input.packageSessions, prerequisiteWaived: !!waiver }, actorId: ctx.user.id });
    if (st.status === "prospect" || st.status === "alumni" || st.status === "withdrawn" || (st.status === "trial" && status === "active")) {
      await tx.update(students).set({ status: status === "trial" ? "trial" : "active", homeCenterId: st.homeCenterId ?? cls.centerId }).where(eq(students.id, st.id));
    }
    await emit(tx as unknown as Db, { type: "enrollment.created", enrollmentId: row!.id, studentId: st.id, classId: cls.id });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "enrollments", entity: "enrollments", entityId: row!.id, after: input, ip: ctx.ip });
    return row!;
  });
}

/** Đồng bộ trạng thái học viên theo các ghi danh còn mở */
async function syncStudentStatus(db: Db, studentId: string) {
  const rows = await db.select({ status: enrollments.status }).from(enrollments).where(eq(enrollments.studentId, studentId));
  const s = rows.map((r) => r.status);
  const next = s.includes("active") ? "active" : s.includes("trial") ? "trial" : s.includes("paused") ? "paused" : s.includes("completed") ? "alumni" : s.length ? "withdrawn" : null;
  if (next) await db.update(students).set({ status: next }).where(eq(students.id, studentId));
}

export async function transitionEnrollment(
  ctx: ProtectedContext,
  input: { enrollmentId: string; event: Exclude<EnrollmentEvent, "transfer_out">; reason?: string; pauseFrom?: string; pauseUntil?: string },
) {
  const e = await loadEnrollment(ctx, input.enrollmentId);
  requirePermission(ctx, "enrollment:update", { centerId: e.centerId });
  const to = enrollmentTransition(e.status, input.event);
  if (EVENTS_REQUIRING_REASON.includes(input.event) && !input.reason?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Cần nhập lý do" });
  let pausePatch = {};
  if (input.event === "pause") {
    if (!input.pauseFrom || !input.pauseUntil) throw new TRPCError({ code: "BAD_REQUEST", message: "Chọn ngày bắt đầu và ngày học lại" });
    const err = validatePause(input.pauseFrom, input.pauseUntil, DEFAULT_STUDENT_POLICY);
    if (err) throw new TRPCError({ code: "BAD_REQUEST", message: err });
    pausePatch = { pausedAt: input.pauseFrom, pauseUntil: input.pauseUntil };
  }
  if (input.event === "resume") pausePatch = { pausedAt: null, pauseUntil: null };
  const ending = to === "withdrawn" || to === "completed";

  await ctx.db.transaction(async (tx) => {
    await tx.update(enrollments).set({ status: to, ...pausePatch, ...(ending ? { endedAt: new Date(), endReason: input.reason ?? input.event } : {}), updatedAt: new Date() }).where(eq(enrollments.id, e.id));
    await logEvent(tx as unknown as Db, { enrollmentId: e.id, type: input.event, from: e.status, to, reason: input.reason ?? null, meta: pausePatch, actorId: ctx.user.id });
    await syncStudentStatus(tx as unknown as Db, e.studentId);
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "enrollments", entity: "enrollments", entityId: e.id, before: { status: e.status }, after: { status: to, ...pausePatch }, reason: input.reason ?? null, ip: ctx.ip });
  });
  return loadEnrollment(ctx, e.id);
}

export async function changePackage(ctx: ProtectedContext, input: { enrollmentId: string; packageSessions: number; reason: string }) {
  const e = await loadEnrollment(ctx, input.enrollmentId);
  requirePermission(ctx, "enrollment:update", { centerId: e.centerId });
  if (input.packageSessions < e.consumed) throw new TRPCError({ code: "BAD_REQUEST", message: `Không thể nhỏ hơn số buổi đã học (${e.consumed})` });
  await ctx.db.transaction(async (tx) => {
    await tx.update(enrollments).set({ packageSessions: input.packageSessions, updatedAt: new Date() }).where(eq(enrollments.id, e.id));
    await logEvent(tx as unknown as Db, { enrollmentId: e.id, type: "package_change", from: e.status, to: e.status, reason: input.reason, meta: { from: e.packageSessions, to: input.packageSessions }, actorId: ctx.user.id });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "enrollments", entity: "enrollments", entityId: e.id, before: { packageSessions: e.packageSessions }, after: { packageSessions: input.packageSessions }, reason: input.reason, ip: ctx.ip });
  });
  return loadEnrollment(ctx, e.id);
}

/** "Sắp hết khoá": ghi danh đang học còn ≤ N buổi */
export async function nearingEnd(ctx: ProtectedContext, input: { threshold?: number; centerId?: string }) {
  requirePermission(ctx, "enrollment:read", { centerId: input.centerId ?? null });
  const threshold = input.threshold ?? DEFAULT_STUDENT_POLICY.nearingEndSessions;
  const conds = [eq(enrollments.status, "active"), centerScope(ctx, classes.centerId), sql`${enrollments.packageSessions} - ${consumedSql} <= ${threshold}`];
  if (input.centerId) conds.push(eq(classes.centerId, input.centerId));
  const rows = await ctx.db
    .select({
      ...baseSelect,
      parentName: sql<string | null>`(select p.full_name from ${studentGuardians} g join ${parents} p on p.id = g.parent_id where g.student_id = ${students.id} order by g.is_primary desc limit 1)`,
      parentPhone: sql<string | null>`(select p.phone from ${studentGuardians} g join ${parents} p on p.id = g.parent_id where g.student_id = ${students.id} order by g.is_primary desc limit 1)`,
      renewed: sql<boolean>`exists (select 1 from ${enrollments} e2 where e2.student_id = ${students.id} and e2.id <> ${enrollments.id} and e2.enrolled_at > ${enrollments.enrolledAt})`,
    })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId)).innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(courses, eq(courses.id, classes.courseId)).innerJoin(centers, eq(centers.id, classes.centerId))
    .where(and(...conds))
    .orderBy(asc(sql`${enrollments.packageSessions} - ${consumedSql}`));
  const full = canSeeFullPhone(ctx);
  return {
    threshold,
    items: rows
      .map((r) => ({ ...r, remaining: remainingSessions(r.packageSessions, r.consumed), parentPhone: r.parentPhone ? (full ? r.parentPhone : maskPhone(r.parentPhone)) : null }))
      .filter((r) => isNearingEnd(r.remaining, r.status, { ...DEFAULT_STUDENT_POLICY, nearingEndSessions: threshold })),
  };
}

/** Xem trước chuyển lớp — dùng cho wizard */
export async function previewTransfer(ctx: ProtectedContext, input: { enrollmentId: string; targetClassId: string }) {
  const e = await loadEnrollment(ctx, input.enrollmentId);
  requirePermission(ctx, "enrollment:update", { centerId: e.centerId });
  const t = await ctx.db.query.classes.findFirst({ where: and(eq(classes.id, input.targetClassId), isNull(classes.deletedAt)) });
  if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "Lớp đích không tồn tại" });
  requirePermission(ctx, "enrollment:create", { centerId: t.centerId });
  const [cnt] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(enrollments).where(and(eq(enrollments.classId, t.id), inArray(enrollments.status, ["active", "trial", "paused"])));
  if (e.status === "completed" || e.status === "withdrawn") return { ok: false, carrySessions: 0, errors: ["Đăng ký đã kết thúc — không thể chuyển"], warnings: [], source: e, target: t, crossCenter: false };
  const plan = planTransfer({ packageSessions: e.packageSessions, consumed: e.consumed, sourceClassId: e.classId, sourceCourseId: e.courseId, target: { classId: t.id, courseId: t.courseId, capacity: t.capacity, enrolled: cnt?.n ?? 0, status: t.status } });
  const crossCenter = t.centerId !== e.centerId;
  if (crossCenter) plan.warnings.push("Chuyển sang cơ sở khác — cơ sở chính của học viên sẽ đổi theo");
  return { ...plan, source: e, target: t, crossCenter };
}

/** Chuyển lớp / cơ sở: đóng ghi danh cũ (transfer_out) + mở ghi danh mới mang số buổi còn lại */
export async function transferEnrollment(ctx: ProtectedContext, input: { enrollmentId: string; targetClassId: string; reason: string; startSequenceNo?: number; waiverReason?: string | null }) {
  const p = await previewTransfer(ctx, input);
  if (!p.ok) throw new TRPCError({ code: "PRECONDITION_FAILED", message: p.errors.join("; ") });
  const waiver = p.target.courseId !== p.source.courseId
    ? await enforcePrerequisites(ctx, { studentId: p.source.studentId, courseId: p.target.courseId, centerId: p.target.centerId, waiverReason: input.waiverReason })
    : null;
  if (!input.reason.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Cần nhập lý do chuyển" });
  const e = p.source;
  return ctx.db.transaction(async (tx) => {
    await tx.update(enrollments).set({ status: "withdrawn", endedAt: new Date(), endReason: `Chuyển sang ${p.target.code}: ${input.reason}`, updatedAt: new Date() }).where(eq(enrollments.id, e.id));
    await logEvent(tx as unknown as Db, { enrollmentId: e.id, type: "transfer_out", from: e.status, to: "withdrawn", reason: input.reason, meta: { toClassId: p.target.id, carry: p.carrySessions }, actorId: ctx.user.id });
    const [n] = await tx.insert(enrollments).values({
      studentId: e.studentId, classId: p.target.id, packageSessions: p.carrySessions, startSequenceNo: input.startSequenceNo ?? 1,
      status: e.status === "trial" ? "trial" : "active", transferredFromId: e.id, createdBy: ctx.user.id,
    }).returning();
    await logEvent(tx as unknown as Db, { enrollmentId: n!.id, type: "transfer_in", to: n!.status, reason: waiver ? `${input.reason} · ${waiver}` : input.reason, meta: { fromClassId: e.classId, fromEnrollmentId: e.id, carry: p.carrySessions, prerequisiteWaived: !!waiver }, actorId: ctx.user.id });
    if (p.crossCenter) await tx.update(students).set({ homeCenterId: p.target.centerId }).where(eq(students.id, e.studentId));
    await syncStudentStatus(tx as unknown as Db, e.studentId);
    await emit(tx as unknown as Db, { type: "enrollment.created", enrollmentId: n!.id, studentId: e.studentId, classId: p.target.id });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "enrollments", entity: "transfer", entityId: e.id, before: { classId: e.classId }, after: { classId: p.target.id, enrollmentId: n!.id, carry: p.carrySessions }, reason: input.reason, ip: ctx.ip });
    return { newEnrollmentId: n!.id, carrySessions: p.carrySessions };
  });
}

/** Ghi danh mở của một HV (cho wizard chuyển lớp) */
export async function openEnrollmentsOf(ctx: ProtectedContext, studentId: string) {
  requirePermission(ctx, "enrollment:read", {});
  const rows = await ctx.db.select(baseSelect).from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId)).innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(courses, eq(courses.id, classes.courseId)).innerJoin(centers, eq(centers.id, classes.centerId))
    .where(and(eq(enrollments.studentId, studentId), inArray(enrollments.status, ["trial", "active", "paused"]), centerScope(ctx, classes.centerId)));
  return rows.map((r) => ({ ...r, remaining: remainingSessions(r.packageSessions, r.consumed) }));
}
