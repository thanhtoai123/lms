import { and, eq, inArray, sql, asc, desc, isNull, or, ne, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";
import { classTransferRequests, enrollments, classes, courses, centers, students, classSchedules, userRoles, users, userNotifications } from "@satarobo/db";
import {
  authorize, planTransfer, requireReason, nextWaitlistRank, visibleCenterIds, TRANSFER_REQUEST_VI,
  type TransferRequestStatus,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { assertCenterTransferAllowed } from "./tenantScope";
import { writeAudit } from "./audit";
import { deliverNotifications } from "./notify";
import { enforcePrerequisites } from "./catalog";
import { previewTransfer, executeTransfer, loadEnrollment, classProgress } from "./enrollments";

type Db = ProtectedContext["db"];

function reasonOf(r: string | null | undefined) {
  try {
    return requireReason(r);
  } catch (e) {
    throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
  }
}

async function notify(db: Db, userIds: (string | null | undefined)[], title: string, body: string, link = "/chuyen-lop", type: string | null = "class.transfer_decided") {
  await deliverNotifications(db, userIds, { title, body, link, priority: 2, type });
}

async function managersOf(db: Db, centerIds: string[]) {
  if (!centerIds.length) return [];
  return (await db.select({ u: userRoles.userId }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.role, "CENTER_MANAGER"), inArray(userRoles.centerId, centerIds), eq(users.isActive, true)))).map((r) => r.u);
}

/** Lớp đích phù hợp: cùng khoá (hoặc khác khoá khi quản lý miễn), đang tuyển sinh / đang chạy, kèm tiến độ và số chỗ */
export async function listEligibleClasses(ctx: ProtectedContext, input: { enrollmentId: string; toCenterId?: string | null; includeOtherCourses?: boolean }) {
  const e = await loadEnrollment(ctx.db, input.enrollmentId, ctx);
  requirePermission(ctx, "enrollment:update", { centerId: e.centerId });
  const canWaive = authorize(ctx.actor, "class:approve", { centerId: e.centerId }).allowed;
  const conds: SQL[] = [
    isNull(classes.deletedAt), inArray(classes.status, ["recruiting", "running"]), ne(classes.id, e.classId),
    input.includeOtherCourses && canWaive ? sql`true` : eq(classes.courseId, e.courseId),
  ];
  if (input.toCenterId) conds.push(eq(classes.centerId, input.toCenterId));
  const rows = await ctx.db
    .select({
      id: classes.id, code: classes.code, name: classes.name, status: classes.status, capacity: classes.capacity, courseId: classes.courseId, courseCode: courses.code,
      centerId: classes.centerId, centerCode: centers.code, startDate: classes.startDate,
      enrolled: sql<number>`(select count(*)::int from ${enrollments} x where x.class_id = ${classes.id} and x.status in ('active','trial','paused'))`,
      waitlisted: sql<number>`(select count(*)::int from ${classTransferRequests} r where r.to_class_id = ${classes.id} and r.status = 'waitlisted')`,
      schedule: sql<string | null>`(select string_agg((case when cs.weekday = 7 then 'CN' else 'T' || (cs.weekday + 1) end) || ' ' || to_char(cs.start_time,'HH24:MI'), ', ' order by cs.weekday) from ${classSchedules} cs where cs.class_id = ${classes.id} and cs.effective_to is null)`,
    })
    .from(classes).innerJoin(courses, eq(courses.id, classes.courseId)).innerJoin(centers, eq(centers.id, classes.centerId))
    .where(and(...conds)).orderBy(asc(centers.code), asc(classes.code)).limit(200);
  const progress = await classProgress(ctx.db, [e.classId, ...rows.map((r) => r.id)]);
  const sourceProgress = progress.get(e.classId) ?? 0;
  const items = rows.map((r) => {
    const lessonsDone = progress.get(r.id) ?? 0;
    const plan = planTransfer({
      packageSessions: e.packageSessions, consumed: e.consumed, sourceClassId: e.classId, sourceCourseId: e.courseId, sourceProgress, allowWaitlist: true,
      waiverReason: r.courseId !== e.courseId ? "(cần quản lý miễn)" : null,
      target: { classId: r.id, courseId: r.courseId, capacity: r.capacity, enrolled: r.enrolled, status: r.status, lessonsDone },
    });
    const seatsLeft = Math.max(0, r.capacity - r.enrolled);
    return {
      ...r, lessonsDone, seatsLeft, sameCourse: r.courseId === e.courseId, crossCenter: r.centerId !== e.centerId,
      label: `${lessonsDone} bài · ${seatsLeft ? `còn ${seatsLeft} chỗ` : `hết chỗ${r.waitlisted ? ` (${r.waitlisted} đang chờ)` : ""}`}`,
      eligible: plan.ok, waitlist: plan.waitlist, errors: plan.errors, startSequenceNo: plan.startSequenceNo,
    };
  });
  return { source: { ...e, progress: sourceProgress }, canWaive, items: items.sort((a, b) => Number(b.eligible) - Number(a.eligible) || Number(a.waitlist) - Number(b.waitlist) || Math.abs(a.lessonsDone - sourceProgress) - Math.abs(b.lessonsDone - sourceProgress)) };
}

export async function createTransferRequest(ctx: ProtectedContext, input: { enrollmentId: string; toClassId: string; reason: string; waiverReason?: string | null; startSequenceNo?: number | null }) {
  const reason = reasonOf(input.reason);
  const waiverReason = input.waiverReason?.trim() || null;
  const p = await previewTransfer(ctx, { enrollmentId: input.enrollmentId, targetClassId: input.toClassId, waiverReason, allowWaitlist: true });
  if (waiverReason && !p.canApprove) throw new TRPCError({ code: "FORBIDDEN", message: "Chỉ quản lý cơ sở được miễn điều kiện cùng khoá" });
  if (!p.ok) throw new TRPCError({ code: "PRECONDITION_FAILED", message: p.errors.join("; ") });
  // Cách ly trung tâm: chuyển sang cơ sở của trung tâm khác phải được cả hai bên cho phép
  await assertCenterTransferAllowed(ctx, { fromCenterId: p.source.centerId, toCenterId: p.target.centerId, what: "học viên" });
  const dup = await ctx.db.query.classTransferRequests.findFirst({ where: and(eq(classTransferRequests.enrollmentId, p.source.id), inArray(classTransferRequests.status, ["pending", "waitlisted"])) });
  if (dup) throw new TRPCError({ code: "CONFLICT", message: "Đăng ký này đã có yêu cầu chuyển lớp đang chờ" });
  const status: TransferRequestStatus = p.waitlist ? "waitlisted" : "pending";
  const row = await ctx.db.transaction(async (tx) => {
    let rank: number | null = null;
    if (status === "waitlisted") {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"waitlist:" + p.target.id}))`);
      const ranks = await tx.select({ r: classTransferRequests.waitlistRank }).from(classTransferRequests).where(and(eq(classTransferRequests.toClassId, p.target.id), eq(classTransferRequests.status, "waitlisted")));
      rank = nextWaitlistRank(ranks.map((x) => x.r ?? 0));
    }
    const [r] = await tx.insert(classTransferRequests).values({
      enrollmentId: p.source.id, studentId: p.source.studentId, fromClassId: p.source.classId, toClassId: p.target.id, toCenterId: p.target.centerId,
      status, reason, waiverReason, startSequenceNo: input.startSequenceNo ?? p.startSequenceNo, waitlistRank: rank, createdBy: ctx.user.id,
    }).returning();
    await notify(tx as unknown as Db, await managersOf(tx as unknown as Db, [...new Set([p.source.centerId, p.target.centerId])]),
      status === "waitlisted" ? "Yêu cầu chuyển lớp — danh sách chờ" : "Yêu cầu chuyển lớp chờ duyệt",
      `${p.source.studentName}: ${p.source.classCode} → ${p.target.code}${rank ? ` (thứ ${rank} trong danh sách chờ)` : ""}`);
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "enrollments", entity: "class_transfer_requests", entityId: r!.id, after: { enrollmentId: p.source.id, from: p.source.classCode, to: p.target.code, status, rank, waiver: !!waiverReason }, reason, ip: ctx.ip });
    return r!;
  });
  return { id: row.id, status, waitlistRank: row.waitlistRank, warnings: p.warnings };
}

const fromClass = alias(classes, "from_class");
const toClass = alias(classes, "to_class");
const fromCenter = alias(centers, "from_center");
const toCenter = alias(centers, "to_center");
const requester = alias(users, "requester");

export async function listTransferRequests(ctx: ProtectedContext, input: { status?: TransferRequestStatus | "open"; centerId?: string | null }) {
  requirePermission(ctx, "enrollment:read", { centerId: input.centerId ?? null });
  const visible = visibleCenterIds(ctx.actor);
  const conds: SQL[] = [];
  if (visible !== null) conds.push(visible.length ? or(inArray(fromClass.centerId, visible), inArray(toClass.centerId, visible))! : sql`false`);
  if (input.centerId) conds.push(or(eq(fromClass.centerId, input.centerId), eq(toClass.centerId, input.centerId))!);
  if (input.status === "open" || !input.status) conds.push(inArray(classTransferRequests.status, ["pending", "waitlisted"]));
  else conds.push(eq(classTransferRequests.status, input.status));
  const rows = await ctx.db
    .select({
      id: classTransferRequests.id, status: classTransferRequests.status, reason: classTransferRequests.reason, waiverReason: classTransferRequests.waiverReason,
      waitlistRank: classTransferRequests.waitlistRank, startSequenceNo: classTransferRequests.startSequenceNo, createdAt: classTransferRequests.createdAt,
      decidedAt: classTransferRequests.decidedAt, decisionNote: classTransferRequests.decisionNote, enrollmentId: classTransferRequests.enrollmentId,
      studentId: students.id, studentName: students.fullName, studentCode: students.code,
      fromClassId: fromClass.id, fromClassCode: fromClass.code, fromCenterId: fromClass.centerId, fromCenterCode: fromCenter.code,
      toClassId: toClass.id, toClassCode: toClass.code, toClassName: toClass.name, toCapacity: toClass.capacity, toCenterCode: toCenter.code,
      toEnrolled: sql<number>`(select count(*)::int from ${enrollments} x where x.class_id = ${toClass.id} and x.status in ('active','trial','paused'))`,
      requesterName: requester.fullName,
    })
    .from(classTransferRequests)
    .innerJoin(students, eq(students.id, classTransferRequests.studentId))
    .innerJoin(fromClass, eq(fromClass.id, classTransferRequests.fromClassId))
    .innerJoin(fromCenter, eq(fromCenter.id, fromClass.centerId))
    .innerJoin(toClass, eq(toClass.id, classTransferRequests.toClassId))
    .innerJoin(toCenter, eq(toCenter.id, toClass.centerId))
    .leftJoin(requester, eq(requester.id, classTransferRequests.createdBy))
    .where(and(...conds))
    .orderBy(asc(classTransferRequests.status), asc(classTransferRequests.waitlistRank), desc(classTransferRequests.createdAt))
    .limit(300);
  return rows.map((r) => ({
    ...r,
    statusLabel: TRANSFER_REQUEST_VI[r.status],
    seatsLeft: Math.max(0, r.toCapacity - r.toEnrolled),
    canDecide: (r.status === "pending" || r.status === "waitlisted") && authorize(ctx.actor, "class:approve", { centerId: r.fromCenterId }).allowed,
  }));
}

async function loadRequest(ctx: ProtectedContext, id: string) {
  const r = await ctx.db.query.classTransferRequests.findFirst({ where: eq(classTransferRequests.id, id) });
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy yêu cầu chuyển lớp" });
  const from = await ctx.db.query.classes.findFirst({ where: eq(classes.id, r.fromClassId), columns: { centerId: true, code: true } });
  if (r.status !== "pending" && r.status !== "waitlisted") throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Yêu cầu đã ở trạng thái "${TRANSFER_REQUEST_VI[r.status]}"` });
  return { r, fromCenterId: from!.centerId, fromCode: from!.code };
}

/** Duyệt = thực hiện chuyển lớp (mang số buổi còn lại). Lớp đích phải còn chỗ. */
export async function approveTransfer(ctx: ProtectedContext, input: { requestId: string; note?: string | null; startSequenceNo?: number | null }) {
  const { r, fromCenterId } = await loadRequest(ctx, input.requestId);
  requirePermission(ctx, "class:approve", { centerId: fromCenterId });
  const p = await previewTransfer(ctx, { enrollmentId: r.enrollmentId, targetClassId: r.toClassId!, waiverReason: r.waiverReason, allowWaitlist: false });
  if (!p.ok) throw new TRPCError({ code: "PRECONDITION_FAILED", message: p.errors.join("; ") });
  const waiverNote = p.target.courseId !== p.source.courseId
    ? await enforcePrerequisites(ctx, { studentId: p.source.studentId, courseId: p.target.courseId, centerId: p.target.centerId, waiverReason: r.waiverReason })
    : null;
  const note = input.note?.trim() || null;
  const res = await ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const up = await tx.update(classTransferRequests).set({ status: "approved", decidedBy: ctx.user.id, decidedAt: new Date(), decisionNote: note })
      .where(and(eq(classTransferRequests.id, r.id), inArray(classTransferRequests.status, ["pending", "waitlisted"]))).returning({ id: classTransferRequests.id });
    if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Yêu cầu vừa được xử lý" });
    const done = await executeTransfer(db, ctx, p, {
      reason: r.waiverReason ? `${r.reason} (miễn cùng khoá: ${r.waiverReason})` : r.reason,
      startSequenceNo: input.startSequenceNo ?? r.startSequenceNo, waiverNote, requestId: r.id,
    });
    await tx.update(classTransferRequests).set({ newEnrollmentId: done.newEnrollmentId }).where(eq(classTransferRequests.id, r.id));
    await notify(db, [r.createdBy], "Yêu cầu chuyển lớp đã duyệt", `${p.source.studentName}: ${p.source.classCode} → ${p.target.code} (mang sang ${done.carrySessions} buổi)`, `/students/${p.source.studentId}`);
    await writeAudit(db, { actorId: ctx.user.id, action: "TRANSITION", module: "enrollments", entity: "class_transfer_requests", entityId: r.id, before: { status: r.status }, after: { status: "approved", newEnrollmentId: done.newEnrollmentId }, reason: note, ip: ctx.ip });
    return done;
  });
  return res;
}

export async function rejectTransfer(ctx: ProtectedContext, input: { requestId: string; reason: string }) {
  const { r, fromCenterId, fromCode } = await loadRequest(ctx, input.requestId);
  requirePermission(ctx, "class:approve", { centerId: fromCenterId });
  const reason = reasonOf(input.reason);
  await ctx.db.transaction(async (tx) => {
    const up = await tx.update(classTransferRequests).set({ status: "rejected", decidedBy: ctx.user.id, decidedAt: new Date(), decisionNote: reason })
      .where(and(eq(classTransferRequests.id, r.id), inArray(classTransferRequests.status, ["pending", "waitlisted"]))).returning({ id: classTransferRequests.id });
    if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Yêu cầu vừa được xử lý" });
    await notify(tx as unknown as Db, [r.createdBy], "Yêu cầu chuyển lớp bị từ chối", `${fromCode}: ${reason}`);
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "enrollments", entity: "class_transfer_requests", entityId: r.id, before: { status: r.status }, after: { status: "rejected" }, reason, ip: ctx.ip });
  });
  return { ok: true };
}

/** Người tạo (hoặc quản lý) rút yêu cầu */
export async function cancelTransferRequest(ctx: ProtectedContext, input: { requestId: string; reason?: string | null }) {
  const { r, fromCenterId } = await loadRequest(ctx, input.requestId);
  if (r.createdBy !== ctx.user.id) requirePermission(ctx, "class:approve", { centerId: fromCenterId });
  const note = input.reason?.trim() || "Người tạo rút yêu cầu";
  await ctx.db.transaction(async (tx) => {
    await tx.update(classTransferRequests).set({ status: "cancelled", decidedBy: ctx.user.id, decidedAt: new Date(), decisionNote: note }).where(eq(classTransferRequests.id, r.id));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "enrollments", entity: "class_transfer_requests", entityId: r.id, before: { status: r.status }, after: { status: "cancelled" }, reason: note, ip: ctx.ip });
  });
  return { ok: true };
}
