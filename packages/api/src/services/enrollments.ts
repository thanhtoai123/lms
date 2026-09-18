import { and, eq, inArray, sql, asc, desc, ilike, or, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";
import {
  enrollments, enrollmentEvents, students, classes, courses, centers, parents, studentGuardians, sessions, studentPauses, classTransferRequests,
  orders, orderItems, payments, userRoles, users, userNotifications,
} from "@satarobo/db";
import {
  enrollmentTransition, planTransfer, remainingSessions, isNearingEnd, validatePause, requireReason, EVENTS_REQUIRING_REASON, DEFAULT_STUDENT_POLICY, maskPhone, authorize,
  type EnrollmentEvent, type EnrollmentStatus,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { enforcePrerequisites } from "./catalog";
import { emit } from "./outbox";
import { consumedSql, centerScope, canSeeFullPhone } from "./students";
import { getOps, opsForCenters } from "./opsSettings";
import { todayISO } from "./sessions";
import { proposeRefundIfPaid } from "./refundHooks";

type Db = ProtectedContext["db"];
const OPEN = ["active", "trial", "paused"] as const;

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

export async function loadEnrollment(db: Db, id: string) {
  const [row] = await db.select(baseSelect).from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId)).innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(courses, eq(courses.id, classes.courseId)).innerJoin(centers, eq(centers.id, classes.centerId))
    .where(eq(enrollments.id, id)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy đăng ký học" });
  return row;
}

export async function logEvent(db: Db, e: { enrollmentId: string; type: typeof enrollmentEvents.$inferInsert.type; from?: EnrollmentStatus | null; to?: EnrollmentStatus | null; reason?: string | null; meta?: Record<string, unknown>; actorId: string }) {
  await db.insert(enrollmentEvents).values({ enrollmentId: e.enrollmentId, type: e.type, fromStatus: e.from ?? null, toStatus: e.to ?? null, reason: e.reason ?? null, meta: e.meta ?? null, actorId: e.actorId });
}

function reasonOf(reason: string | null | undefined) {
  try {
    return requireReason(reason);
  } catch (e) {
    throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
  }
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
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"class-seats:" + cls.id}))`);
    const [cnt] = await tx.select({ n: sql<number>`count(*)::int` }).from(enrollments).where(and(eq(enrollments.classId, cls.id), inArray(enrollments.status, [...OPEN])));
    if ((cnt?.n ?? 0) >= cls.capacity) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Lớp đã đủ ${cls.capacity} học viên` });
    const dup = await tx.query.enrollments.findFirst({ where: and(eq(enrollments.studentId, st.id), eq(enrollments.classId, cls.id), inArray(enrollments.status, [...OPEN])) });
    if (dup) throw new TRPCError({ code: "CONFLICT", message: "Học viên đã có đăng ký đang mở ở lớp này" });
    const status = input.status ?? "active";
    const [row] = await tx.insert(enrollments).values({ studentId: st.id, classId: cls.id, packageSessions: input.packageSessions, startSequenceNo: input.startSequenceNo ?? 1, status, createdBy: ctx.user.id }).returning();
    await logEvent(tx as unknown as Db, { enrollmentId: row!.id, type: "created", to: status, reason: [input.note, waiver].filter(Boolean).join(" · ") || null, meta: { packageSessions: input.packageSessions, prerequisiteWaived: !!waiver }, actorId: ctx.user.id });
    const reactivate = st.status === "prospect" || st.status === "alumni" || st.status === "withdrawn" || (st.status === "trial" && status === "active");
    await tx.update(students).set({
      ...(reactivate ? { status: status === "trial" ? "trial" as const : "active" as const } : {}),
      homeCenterId: st.homeCenterId ?? cls.centerId,
      // Ngày đăng ký lần đầu (trigger SQL cũng điền — giữ ở đây để không phụ thuộc thứ tự áp SQL)
      firstEnrolledOn: st.firstEnrolledOn ?? todayISO(),
    }).where(eq(students.id, st.id));
    await emit(tx as unknown as Db, { type: "enrollment.created", enrollmentId: row!.id, studentId: st.id, classId: cls.id });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "enrollments", entity: "enrollments", entityId: row!.id, after: input, ip: ctx.ip });
    return row!;
  });
}

/** Đồng bộ trạng thái học viên theo các ghi danh còn mở */
export async function syncStudentStatus(db: Db, studentId: string) {
  const rows = await db.select({ status: enrollments.status }).from(enrollments).where(eq(enrollments.studentId, studentId));
  const s = rows.map((r) => r.status);
  const next = s.includes("active") ? "active" : s.includes("trial") ? "trial" : s.includes("paused") ? "paused" : s.includes("completed") ? "alumni" : s.length ? "withdrawn" : null;
  if (next) await db.update(students).set({ status: next }).where(eq(students.id, studentId));
}

/** Gắn / gỡ ghi danh khỏi đợt bảo lưu đang mở của học viên (lịch sử bảo lưu dùng chung cho bảo lưu từng lớp và cả hồ sơ) */
export async function trackPause(db: Db, x: { studentId: string; enrollmentId: string; action: "pause" | "resume" | "end"; from?: string; until?: string | null; reason?: string | null; actorId: string; note?: string | null }) {
  const open = await db.query.studentPauses.findFirst({ where: and(eq(studentPauses.studentId, x.studentId), isNull(studentPauses.endedAt)) });
  if (x.action === "pause") {
    if (open) {
      const ids = [...new Set([...(open.enrollmentIds ?? []), x.enrollmentId])];
      await db.update(studentPauses).set({ enrollmentIds: ids }).where(eq(studentPauses.id, open.id));
    } else {
      await db.insert(studentPauses).values({ studentId: x.studentId, enrollmentIds: [x.enrollmentId], fromDate: x.from ?? todayISO(), expectedReturn: x.until ?? null, reason: x.reason ?? "Bảo lưu", createdBy: x.actorId });
    }
    return;
  }
  if (!open || !(open.enrollmentIds ?? []).includes(x.enrollmentId)) return;
  const [left] = await db.select({ n: sql<number>`count(*)::int` }).from(enrollments)
    .where(and(inArray(enrollments.id, open.enrollmentIds), eq(enrollments.status, "paused")));
  if ((left?.n ?? 0) === 0) {
    await db.update(studentPauses).set({ endedAt: new Date(), endedBy: x.actorId, endKind: x.action === "end" ? "withdraw" : "reserve_end", endNote: x.note ?? null }).where(eq(studentPauses.id, open.id));
  }
}

/** Lớp vừa có chỗ trống → báo yêu cầu chuyển lớp đứng đầu danh sách chờ */
export async function notifyWaitlist(db: Db, classId: string) {
  const cls = await db.query.classes.findFirst({ where: eq(classes.id, classId) });
  if (!cls || cls.status === "finished" || cls.status === "cancelled") return;
  const [cnt] = await db.select({ n: sql<number>`count(*)::int` }).from(enrollments).where(and(eq(enrollments.classId, classId), inArray(enrollments.status, [...OPEN])));
  if ((cnt?.n ?? 0) >= cls.capacity) return;
  const [head] = await db.select({ id: classTransferRequests.id, createdBy: classTransferRequests.createdBy, studentName: students.fullName })
    .from(classTransferRequests).innerJoin(students, eq(students.id, classTransferRequests.studentId))
    .where(and(eq(classTransferRequests.toClassId, classId), eq(classTransferRequests.status, "waitlisted")))
    .orderBy(asc(classTransferRequests.waitlistRank), asc(classTransferRequests.createdAt)).limit(1);
  if (!head) return;
  const managers = (await db.select({ u: userRoles.userId }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.role, "CENTER_MANAGER"), eq(userRoles.centerId, cls.centerId), eq(users.isActive, true)))).map((r) => r.u);
  const ids = [...new Set([head.createdBy, ...managers].filter((x): x is string => !!x))];
  if (ids.length) await db.insert(userNotifications).values(ids.map((userId) => ({ userId, title: "Lớp có chỗ trống — danh sách chờ", body: `${cls.code} còn chỗ: yêu cầu chuyển lớp của ${head.studentName} đang đứng đầu danh sách chờ`, link: "/chuyen-lop", priority: 2 })));
}

/** Ghi danh kết thúc (nghỉ học): đề xuất hoàn tiền nếu còn tiền, huỷ yêu cầu chuyển lớp đang mở, báo danh sách chờ */
export async function afterEnrollmentEnded(db: Db, x: { enrollmentId: string; classId: string; reason: string; actorId: string; trigger: "withdraw" | "class_cancel" }) {
  const refund = await proposeRefundIfPaid(db, { enrollmentId: x.enrollmentId, reason: x.reason, trigger: x.trigger, actorId: x.actorId });
  await db.update(classTransferRequests).set({ status: "cancelled", decisionNote: `Tự huỷ: ${x.reason}`.slice(0, 300), decidedAt: new Date(), decidedBy: x.actorId })
    .where(and(eq(classTransferRequests.enrollmentId, x.enrollmentId), inArray(classTransferRequests.status, ["pending", "waitlisted"])));
  if (x.trigger !== "class_cancel") await notifyWaitlist(db, x.classId);
  return refund;
}

export async function transitionEnrollment(
  ctx: ProtectedContext,
  input: { enrollmentId: string; event: Exclude<EnrollmentEvent, "transfer_out">; reason?: string; pauseFrom?: string; pauseUntil?: string | null },
) {
  const e = await loadEnrollment(ctx.db, input.enrollmentId);
  requirePermission(ctx, "enrollment:update", { centerId: e.centerId });
  const to = enrollmentTransition(e.status, input.event);
  const reason = EVENTS_REQUIRING_REASON.includes(input.event) ? reasonOf(input.reason) : input.reason?.trim() || null;
  let pausePatch: { pausedAt?: string | null; pauseUntil?: string | null } = {};
  if (input.event === "pause") {
    if (!input.pauseFrom) throw new TRPCError({ code: "BAD_REQUEST", message: "Chọn ngày bắt đầu bảo lưu" });
    const o = await getOps(ctx.db, e.centerId);
    const err = validatePause(input.pauseFrom, input.pauseUntil ?? null, { ...DEFAULT_STUDENT_POLICY, nearingEndSessions: o.nearingEndSessions, maxPauseMonths: o.maxPauseMonths });
    if (err) throw new TRPCError({ code: "BAD_REQUEST", message: err });
    pausePatch = { pausedAt: input.pauseFrom, pauseUntil: input.pauseUntil ?? null };
  }
  if (input.event === "resume") pausePatch = { pausedAt: null, pauseUntil: null };
  const ending = to === "withdrawn" || to === "completed";

  let refundAmount = 0;
  await ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    await tx.update(enrollments).set({ status: to, ...pausePatch, ...(ending ? { endedAt: new Date(), endReason: reason ?? input.event } : {}), updatedAt: new Date() }).where(eq(enrollments.id, e.id));
    await logEvent(db, { enrollmentId: e.id, type: input.event, from: e.status, to, reason, meta: pausePatch, actorId: ctx.user.id });
    if (input.event === "pause") await trackPause(db, { studentId: e.studentId, enrollmentId: e.id, action: "pause", from: input.pauseFrom, until: input.pauseUntil ?? null, reason, actorId: ctx.user.id });
    if (input.event === "resume") await trackPause(db, { studentId: e.studentId, enrollmentId: e.id, action: "resume", actorId: ctx.user.id });
    if (to === "withdrawn") {
      if (e.status === "paused") await trackPause(db, { studentId: e.studentId, enrollmentId: e.id, action: "end", actorId: ctx.user.id, note: reason });
      refundAmount = (await afterEnrollmentEnded(db, { enrollmentId: e.id, classId: e.classId, reason: reason ?? "Nghỉ học", actorId: ctx.user.id, trigger: "withdraw" })).amount;
    }
    await syncStudentStatus(db, e.studentId);
    await writeAudit(db, { actorId: ctx.user.id, action: "TRANSITION", module: "enrollments", entity: "enrollments", entityId: e.id, before: { status: e.status }, after: { status: to, ...pausePatch, refundProposed: refundAmount || undefined }, reason, ip: ctx.ip });
  });
  return { ...(await loadEnrollment(ctx.db, e.id)), refundProposed: refundAmount };
}

export async function changePackage(ctx: ProtectedContext, input: { enrollmentId: string; packageSessions: number; reason: string }) {
  const e = await loadEnrollment(ctx.db, input.enrollmentId);
  requirePermission(ctx, "enrollment:update", { centerId: e.centerId });
  if (input.packageSessions < e.consumed) throw new TRPCError({ code: "BAD_REQUEST", message: `Không thể nhỏ hơn số buổi đã học (${e.consumed})` });
  await ctx.db.transaction(async (tx) => {
    await tx.update(enrollments).set({ packageSessions: input.packageSessions, updatedAt: new Date() }).where(eq(enrollments.id, e.id));
    await logEvent(tx as unknown as Db, { enrollmentId: e.id, type: "package_change", from: e.status, to: e.status, reason: input.reason, meta: { from: e.packageSessions, to: input.packageSessions }, actorId: ctx.user.id });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "enrollments", entity: "enrollments", entityId: e.id, before: { packageSessions: e.packageSessions }, after: { packageSessions: input.packageSessions }, reason: input.reason, ip: ctx.ip });
  });
  return loadEnrollment(ctx.db, e.id);
}

/** "Sắp hết khoá": ghi danh đang học còn ≤ N buổi */
export async function nearingEnd(ctx: ProtectedContext, input: { threshold?: number; centerId?: string }) {
  requirePermission(ctx, "enrollment:read", { centerId: input.centerId ?? null });
  const allCenters = (await ctx.db.select({ id: centers.id }).from(centers)).map((c) => c.id);
  const ops = await opsForCenters(ctx.db, allCenters);
  const perCenter = (id: string) => input.threshold ?? ops.get(id)?.nearingEndSessions ?? DEFAULT_STUDENT_POLICY.nearingEndSessions;
  const threshold = input.centerId ? perCenter(input.centerId) : Math.max(input.threshold ?? 0, ...allCenters.map(perCenter), DEFAULT_STUDENT_POLICY.nearingEndSessions);
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
      .filter((r) => isNearingEnd(r.remaining, r.status, { ...DEFAULT_STUDENT_POLICY, nearingEndSessions: perCenter(r.centerId) })),
  };
}

/** Tiến độ lớp = số buổi chính thức đã hoàn tất (buổi lớn nhất đã học) */
export async function classProgress(db: Db, classIds: string[]) {
  if (!classIds.length) return new Map<string, number>();
  const rows = await db.select({ classId: sessions.classId, n: sql<number>`coalesce(max(${sessions.sequenceNo}), 0)::int` })
    .from(sessions)
    .where(and(inArray(sessions.classId, classIds), eq(sessions.kind, "regular"), eq(sessions.status, "completed"), sql`${sessions.sequenceNo} <= 1000`))
    .groupBy(sessions.classId);
  return new Map(rows.map((r) => [r.classId, r.n]));
}

/** Xem trước chuyển lớp — dùng cho wizard, yêu cầu chuyển lớp và duyệt */
export async function previewTransfer(ctx: ProtectedContext, input: { enrollmentId: string; targetClassId: string; waiverReason?: string | null; allowWaitlist?: boolean }) {
  const e = await loadEnrollment(ctx.db, input.enrollmentId);
  requirePermission(ctx, "enrollment:update", { centerId: e.centerId });
  const t = await ctx.db.query.classes.findFirst({ where: and(eq(classes.id, input.targetClassId), isNull(classes.deletedAt)) });
  if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "Lớp đích không tồn tại" });
  // Lớp đích có thể thuộc cơ sở khác: việc chuyển được kiểm soát bởi quyền duyệt ở cơ sở nguồn (class:approve)
  const canApprove = authorize(ctx.actor, "class:approve", { centerId: e.centerId }).allowed;
  const [cnt] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(enrollments).where(and(eq(enrollments.classId, t.id), inArray(enrollments.status, [...OPEN])));
  const crossCenter = t.centerId !== e.centerId;
  if (e.status === "completed" || e.status === "withdrawn") {
    return { ok: false, carrySessions: 0, errors: ["Đăng ký đã kết thúc — không thể chuyển"], warnings: [] as string[], waitlist: false, startSequenceNo: null as number | null, source: e, target: t, crossCenter, targetEnrolled: cnt?.n ?? 0, canApprove, sourceProgress: 0, targetProgress: 0 };
  }
  const progress = await classProgress(ctx.db, [e.classId, t.id]);
  const plan = planTransfer({
    packageSessions: e.packageSessions, consumed: e.consumed, sourceClassId: e.classId, sourceCourseId: e.courseId,
    sourceProgress: progress.get(e.classId) ?? 0, waiverReason: input.waiverReason, allowWaitlist: input.allowWaitlist,
    target: { classId: t.id, courseId: t.courseId, capacity: t.capacity, enrolled: cnt?.n ?? 0, status: t.status, lessonsDone: progress.get(t.id) ?? 0 },
  });
  if (crossCenter) plan.warnings.push("Chuyển sang cơ sở khác — cơ sở chính của học viên sẽ đổi theo");
  return { ...plan, source: e, target: t, crossCenter, targetEnrolled: cnt?.n ?? 0, canApprove, sourceProgress: progress.get(e.classId) ?? 0, targetProgress: progress.get(t.id) ?? 0 };
}

type TransferPreview = Awaited<ReturnType<typeof previewTransfer>>;

/** Thực hiện chuyển (trong transaction của người gọi): đóng ghi danh cũ (transfer_out) + mở ghi danh mới mang số buổi còn lại */
export async function executeTransfer(db: Db, ctx: ProtectedContext, p: TransferPreview, input: { reason: string; startSequenceNo?: number | null; waiverNote?: string | null; requestId?: string | null }) {
  const e = p.source;
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${"class-seats:" + p.target.id}))`);
  const [cnt] = await db.select({ n: sql<number>`count(*)::int` }).from(enrollments).where(and(eq(enrollments.classId, p.target.id), inArray(enrollments.status, [...OPEN])));
  if ((cnt?.n ?? 0) >= p.target.capacity) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Lớp đích đã đủ ${p.target.capacity} học viên — chờ có chỗ` });
  const upd = await db.update(enrollments).set({ status: "withdrawn", endedAt: new Date(), endReason: `Chuyển sang ${p.target.code}: ${input.reason}`, updatedAt: new Date() })
    .where(and(eq(enrollments.id, e.id), eq(enrollments.status, e.status))).returning({ id: enrollments.id });
  if (!upd.length) throw new TRPCError({ code: "CONFLICT", message: "Đăng ký vừa thay đổi — tải lại trang" });
  await logEvent(db, { enrollmentId: e.id, type: "transfer_out", from: e.status, to: "withdrawn", reason: input.reason, meta: { toClassId: p.target.id, carry: p.carrySessions, requestId: input.requestId ?? null }, actorId: ctx.user.id });
  if (e.status === "paused") await trackPause(db, { studentId: e.studentId, enrollmentId: e.id, action: "end", actorId: ctx.user.id, note: `Chuyển lớp ${p.target.code}` });
  const startSeq = input.startSequenceNo ?? p.startSequenceNo ?? 1;
  const [n] = await db.insert(enrollments).values({
    studentId: e.studentId, classId: p.target.id, packageSessions: p.carrySessions, startSequenceNo: startSeq,
    status: e.status === "trial" ? "trial" : "active", transferredFromId: e.id, createdBy: ctx.user.id,
  }).returning();
  await logEvent(db, { enrollmentId: n!.id, type: "transfer_in", to: n!.status, reason: input.waiverNote ? `${input.reason} · ${input.waiverNote}` : input.reason, meta: { fromClassId: e.classId, fromEnrollmentId: e.id, carry: p.carrySessions, prerequisiteWaived: !!input.waiverNote, requestId: input.requestId ?? null }, actorId: ctx.user.id });
  if (p.crossCenter) await db.update(students).set({ homeCenterId: p.target.centerId }).where(eq(students.id, e.studentId));
  await db.update(classTransferRequests).set({ status: "cancelled", decisionNote: "Đã chuyển lớp bằng yêu cầu khác", decidedAt: new Date(), decidedBy: ctx.user.id })
    .where(and(eq(classTransferRequests.enrollmentId, e.id), inArray(classTransferRequests.status, ["pending", "waitlisted"]), input.requestId ? sql`${classTransferRequests.id} <> ${input.requestId}` : sql`true`));
  await syncStudentStatus(db, e.studentId);
  await emit(db, { type: "enrollment.created", enrollmentId: n!.id, studentId: e.studentId, classId: p.target.id });
  await notifyWaitlist(db, e.classId);
  await writeAudit(db, { actorId: ctx.user.id, action: "TRANSITION", module: "enrollments", entity: "transfer", entityId: e.id, before: { classId: e.classId }, after: { classId: p.target.id, enrollmentId: n!.id, carry: p.carrySessions, requestId: input.requestId ?? null }, reason: input.reason, ip: ctx.ip });
  return { newEnrollmentId: n!.id, carrySessions: p.carrySessions };
}

/** Chuyển lớp trực tiếp (không qua yêu cầu) — chỉ người có quyền duyệt lớp */
export async function transferEnrollment(ctx: ProtectedContext, input: { enrollmentId: string; targetClassId: string; reason: string; startSequenceNo?: number; waiverReason?: string | null }) {
  const reason = reasonOf(input.reason);
  const p = await previewTransfer(ctx, input);
  requirePermission(ctx, "class:approve", { centerId: p.source.centerId });
  if (!p.ok) throw new TRPCError({ code: "PRECONDITION_FAILED", message: p.errors.join("; ") });
  const waiver = p.target.courseId !== p.source.courseId
    ? await enforcePrerequisites(ctx, { studentId: p.source.studentId, courseId: p.target.courseId, centerId: p.target.centerId, waiverReason: input.waiverReason })
    : null;
  return ctx.db.transaction(async (tx) => executeTransfer(tx as unknown as Db, ctx, p, { reason, startSequenceNo: input.startSequenceNo, waiverNote: waiver }));
}

/** Ghi danh mở của một HV (cho wizard chuyển lớp) */
const ENROLLMENT_EVENT_VI: Record<string, string> = {
  created: "Tạo ghi danh", activate: "Kích hoạt", pause: "Bảo lưu", resume: "Học lại", withdraw: "Nghỉ học",
  complete: "Hoàn thành", transfer_out: "Chuyển đi", transfer_in: "Chuyển đến", package_change: "Đổi gói buổi",
};

/**
 * Chi tiết một ghi danh (/enrollments/:id): dòng thời gian (tạo, đổi trạng thái, chuyển lớp, bảo lưu),
 * đơn hàng & khoản thu liên quan, link học viên / lớp / đơn.
 */
export async function getEnrollmentDetail(ctx: ProtectedContext, id: string) {
  const e = await loadEnrollment(ctx.db, id);
  requirePermission(ctx, "enrollment:read", { centerId: e.centerId });
  const canUpdate = authorize(ctx.actor, "enrollment:update", { centerId: e.centerId }).allowed;
  const canFinance = authorize(ctx.actor, "finance:read", { centerId: e.centerId }).allowed;

  const evs = await ctx.db
    .select({ ev: enrollmentEvents, actorName: users.fullName })
    .from(enrollmentEvents).leftJoin(users, eq(users.id, enrollmentEvents.actorId))
    .where(eq(enrollmentEvents.enrollmentId, id)).orderBy(asc(enrollmentEvents.createdAt));

  const pauseRows = await ctx.db
    .select({ p: studentPauses, byName: users.fullName })
    .from(studentPauses).leftJoin(users, eq(users.id, studentPauses.createdBy))
    .where(eq(studentPauses.studentId, e.studentId)).orderBy(desc(studentPauses.createdAt));
  const pauses = pauseRows
    .filter((r) => (r.p.enrollmentIds ?? []).includes(id))
    .map((r) => ({ id: r.p.id, fromDate: r.p.fromDate, expectedReturn: r.p.expectedReturn, endedAt: r.p.endedAt, endKind: r.p.endKind, reason: r.p.reason, endNote: r.p.endNote, byName: r.byName }));

  const toClass = alias(classes, "to_class");
  const transfers = await ctx.db
    .select({
      id: classTransferRequests.id, status: classTransferRequests.status, reason: classTransferRequests.reason,
      decisionNote: classTransferRequests.decisionNote, decidedAt: classTransferRequests.decidedAt, createdAt: classTransferRequests.createdAt,
      toClassId: classTransferRequests.toClassId, toClassCode: toClass.code, newEnrollmentId: classTransferRequests.newEnrollmentId,
      byName: users.fullName,
    })
    .from(classTransferRequests)
    .leftJoin(toClass, eq(toClass.id, classTransferRequests.toClassId))
    .leftJoin(users, eq(users.id, classTransferRequests.createdBy))
    .where(eq(classTransferRequests.enrollmentId, id)).orderBy(desc(classTransferRequests.createdAt));

  // Đơn hàng liên quan: qua dòng đơn gắn ghi danh (mới) hoặc orders.enrollment_id (dữ liệu cũ)
  const orderRows = canFinance
    ? await ctx.db
        .select({
          orderId: orders.id, code: orders.code, status: orders.status, total: orders.total, createdAt: orders.createdAt,
          itemId: orderItems.id, itemDescription: orderItems.description, net: orderItems.netAmount, packageSessions: orderItems.packageSessions,
        })
        .from(orders).leftJoin(orderItems, eq(orderItems.orderId, orders.id))
        .where(or(eq(orderItems.enrollmentId, id), eq(orders.enrollmentId, id))!)
        .orderBy(desc(orders.createdAt))
    : [];
  const orderMap = new Map<string, { id: string; code: string; status: string; total: number; createdAt: Date; lines: { id: string; description: string; net: number; packageSessions: number | null }[] }>();
  for (const r of orderRows) {
    const cur = orderMap.get(r.orderId) ?? { id: r.orderId, code: r.code, status: r.status, total: r.total, createdAt: r.createdAt, lines: [] };
    if (r.itemId) cur.lines.push({ id: r.itemId, description: r.itemDescription ?? "", net: r.net ?? 0, packageSessions: r.packageSessions });
    orderMap.set(r.orderId, cur);
  }
  const orderIds = [...orderMap.keys()];
  const paymentRows = canFinance && orderIds.length
    ? await ctx.db
        .select({
          id: payments.id, amount: payments.amount, status: payments.status, paidAt: payments.paidAt, receiptNo: payments.receiptNo,
          orderId: payments.orderId, orderCode: orders.code, enrollmentId: payments.enrollmentId,
        })
        .from(payments).innerJoin(orders, eq(orders.id, payments.orderId))
        .where(and(inArray(payments.orderId, orderIds), sql`${payments.status} <> 'voided'`))
        .orderBy(desc(payments.paidAt))
    : [];
  const confirmed = paymentRows.filter((p) => p.status === "confirmed").reduce((a, b) => a + b.amount, 0);
  const recorded = paymentRows.filter((p) => p.status === "recorded").reduce((a, b) => a + b.amount, 0);
  const fee = [...orderMap.values()].reduce((a, o) => a + (o.lines.length ? o.lines.reduce((x, l) => x + l.net, 0) : o.total), 0);

  return {
    enrollment: { ...e, remaining: remainingSessions(e.packageSessions, e.consumed) },
    perms: { canUpdate, canFinance, canTransfer: authorize(ctx.actor, "enrollment:update", { centerId: e.centerId }).allowed },
    timeline: evs.map((r) => ({
      id: r.ev.id, type: r.ev.type, label: ENROLLMENT_EVENT_VI[r.ev.type] ?? r.ev.type, fromStatus: r.ev.fromStatus, toStatus: r.ev.toStatus,
      reason: r.ev.reason, meta: r.ev.meta, actorName: r.actorName, createdAt: r.ev.createdAt,
    })),
    pauses,
    transfers,
    orders: [...orderMap.values()],
    payments: paymentRows,
    money: { fee, confirmed, recorded, outstanding: Math.max(0, fee - confirmed) },
  };
}

export async function openEnrollmentsOf(ctx: ProtectedContext, studentId: string) {
  requirePermission(ctx, "enrollment:read", {});
  const rows = await ctx.db.select(baseSelect).from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId)).innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(courses, eq(courses.id, classes.courseId)).innerJoin(centers, eq(centers.id, classes.centerId))
    .where(and(eq(enrollments.studentId, studentId), inArray(enrollments.status, [...OPEN]), centerScope(ctx, classes.centerId)));
  return rows.map((r) => ({ ...r, remaining: remainingSessions(r.packageSessions, r.consumed) }));
}
