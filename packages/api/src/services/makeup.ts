import { and, eq, inArray, sql, asc, desc, isNull, gte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";
import { makeupRequests, enrollments, sessions, classes, students, attendance, centers, courses } from "@satarobo/db";
import { makeupTransition, makeupCandidates, withinMakeupWindow, visibleCenterIds, addDays, DEFAULT_MAKEUP_POLICY, type MakeupStatus } from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { todayISO } from "./sessions";
import { getOps, opsForCenters } from "./opsSettings";

type Db = ProtectedContext["db"];

function scope(ctx: ProtectedContext) {
  const v = visibleCenterIds(ctx.actor);
  return v === null ? sql`true` : v.length ? inArray(classes.centerId, v) : sql`false`;
}

const missed = alias(sessions, "missed");
const target = alias(sessions, "target");
const targetClass = alias(classes, "target_class");

/**
 * Buổi vắng chờ xếp bù: chưa có yêu cầu học bù, chưa được bù, còn trong hạn xin bù
 * và GV chưa đánh dấu "Không bù" ở màn điểm danh (`needs_makeup = false`).
 * Dòng cũ chưa có quyết định (`null`) vẫn được suy diễn như trước — xem `needsMakeupFor`.
 */
export async function pendingAbsences(ctx: ProtectedContext, input: { centerId?: string }) {
  requirePermission(ctx, "makeup:read", { centerId: input.centerId ?? null });
  const today = todayISO();
  const ops = await opsForCenters(ctx.db, (await ctx.db.select({ id: centers.id }).from(centers)).map((c) => c.id));
  const win = Math.max(...[...ops.values()].map((o) => o.makeupWindowDays), DEFAULT_MAKEUP_POLICY.requestWindowDays);
  const from = addDays(today, -win);
  const conds = [
    inArray(attendance.status, ["absent_excused", "absent_unexcused"]),
    inArray(enrollments.status, ["active", "trial"]),
    gte(sessions.date, from),
    sql`(${attendance.needsMakeup} is null or ${attendance.needsMakeup} = true)`,
    scope(ctx),
    sql`not exists (select 1 from ${makeupRequests} mr where mr.enrollment_id = ${attendance.enrollmentId} and mr.missed_session_id = ${attendance.sessionId} and mr.status <> 'rejected')`,
    sql`not exists (select 1 from ${attendance} a2 where a2.enrollment_id = ${attendance.enrollmentId} and a2.makeup_for_session_id = ${attendance.sessionId})`,
  ];
  if (input.centerId) conds.push(eq(classes.centerId, input.centerId));
  const rows = await ctx.db
    .select({
      enrollmentId: enrollments.id, sessionId: sessions.id, date: sessions.date, sequenceNo: sessions.sequenceNo, status: attendance.status,
      needsMakeup: attendance.needsMakeup, absenceReason: attendance.absenceReason,
      studentId: students.id, studentName: students.fullName, studentCode: students.code, classId: classes.id, classCode: classes.code, centerCode: centers.code, centerId: classes.centerId,
    })
    .from(attendance)
    .innerJoin(enrollments, eq(enrollments.id, attendance.enrollmentId))
    .innerJoin(sessions, eq(sessions.id, attendance.sessionId))
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .innerJoin(centers, eq(centers.id, classes.centerId))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(and(...conds))
    .orderBy(desc(sessions.date));
  return rows.filter((r) => r.date >= addDays(today, -(ops.get(r.centerId)?.makeupWindowDays ?? DEFAULT_MAKEUP_POLICY.requestWindowDays)));
}

export async function listMakeup(ctx: ProtectedContext, input: { status?: MakeupStatus; centerId?: string; classId?: string }) {
  requirePermission(ctx, "makeup:read", { centerId: input.centerId ?? null });
  const conds = [scope(ctx)];
  if (input.status) conds.push(eq(makeupRequests.status, input.status));
  if (input.centerId) conds.push(eq(classes.centerId, input.centerId));
  if (input.classId) conds.push(eq(classes.id, input.classId));
  const rows = await ctx.db
    .select({
      id: makeupRequests.id, status: makeupRequests.status, note: makeupRequests.note, createdAt: makeupRequests.createdAt, decidedAt: makeupRequests.decidedAt,
      enrollmentId: enrollments.id, studentId: students.id, studentName: students.fullName, studentCode: students.code,
      classId: classes.id, classCode: classes.code, centerCode: centers.code,
      missedSessionId: missed.id, missedDate: missed.date, missedSeq: missed.sequenceNo,
      targetSessionId: target.id, targetDate: target.date, targetStart: target.startTime, targetClassCode: targetClass.code,
      done: sql<boolean>`exists (select 1 from ${attendance} a where a.enrollment_id = ${makeupRequests.enrollmentId} and a.makeup_for_session_id = ${makeupRequests.missedSessionId})`,
    })
    .from(makeupRequests)
    .innerJoin(enrollments, eq(enrollments.id, makeupRequests.enrollmentId))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(centers, eq(centers.id, classes.centerId))
    .innerJoin(missed, eq(missed.id, makeupRequests.missedSessionId))
    .leftJoin(target, eq(target.id, makeupRequests.targetSessionId))
    .leftJoin(targetClass, eq(targetClass.id, target.classId))
    .where(and(...conds))
    .orderBy(asc(makeupRequests.status), desc(makeupRequests.createdAt))
    .limit(300);
  const [counts] = await ctx.db
    .select({
      requested: sql<number>`count(*) filter (where ${makeupRequests.status} = 'requested')::int`,
      approved: sql<number>`count(*) filter (where ${makeupRequests.status} = 'approved')::int`,
      done: sql<number>`count(*) filter (where ${makeupRequests.status} = 'done')::int`,
      rejected: sql<number>`count(*) filter (where ${makeupRequests.status} = 'rejected')::int`,
    })
    .from(makeupRequests).innerJoin(enrollments, eq(enrollments.id, makeupRequests.enrollmentId)).innerJoin(classes, eq(classes.id, enrollments.classId))
    .where(scope(ctx));
  return { items: rows, counts };
}

async function loadRequest(ctx: ProtectedContext, id: string) {
  const [r] = await ctx.db
    .select({ req: makeupRequests, centerId: classes.centerId, classId: classes.id, courseId: classes.courseId, studentId: enrollments.studentId, missedSeq: missed.sequenceNo, missedDate: missed.date })
    .from(makeupRequests)
    .innerJoin(enrollments, eq(enrollments.id, makeupRequests.enrollmentId))
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(missed, eq(missed.id, makeupRequests.missedSessionId))
    .where(eq(makeupRequests.id, id)).limit(1);
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy yêu cầu học bù" });
  return r;
}

export async function createMakeupRequest(ctx: ProtectedContext, input: { enrollmentId: string; missedSessionId: string; note?: string | null }) {
  const [row] = await ctx.db
    .select({ centerId: classes.centerId, classId: classes.id, date: sessions.date, status: attendance.status })
    .from(enrollments)
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(sessions, and(eq(sessions.id, input.missedSessionId), eq(sessions.classId, classes.id)))
    .leftJoin(attendance, and(eq(attendance.sessionId, sessions.id), eq(attendance.enrollmentId, enrollments.id)))
    .where(eq(enrollments.id, input.enrollmentId)).limit(1);
  if (!row) throw new TRPCError({ code: "BAD_REQUEST", message: "Buổi vắng không thuộc lớp của học viên" });
  requirePermission(ctx, "makeup:create", { centerId: row.centerId });
  if (row.status !== "absent_excused" && row.status !== "absent_unexcused") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Học viên không vắng buổi này" });
  const mw = (await getOps(ctx.db, row.centerId)).makeupWindowDays;
  if (!withinMakeupWindow(row.date, todayISO(), { ...DEFAULT_MAKEUP_POLICY, requestWindowDays: mw })) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Đã quá ${mw} ngày kể từ buổi vắng` });
  const dup = await ctx.db.query.makeupRequests.findFirst({ where: and(eq(makeupRequests.enrollmentId, input.enrollmentId), eq(makeupRequests.missedSessionId, input.missedSessionId), sql`${makeupRequests.status} <> 'rejected'`) });
  if (dup) throw new TRPCError({ code: "CONFLICT", message: "Buổi vắng này đã có yêu cầu học bù" });
  const [r] = await ctx.db.insert(makeupRequests).values({ enrollmentId: input.enrollmentId, missedSessionId: input.missedSessionId, note: input.note ?? null }).returning();
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "academics", entity: "makeup_requests", entityId: r!.id, after: input, ip: ctx.ip });
  return r!;
}

/** Buổi có thể xếp học bù cho yêu cầu */
export async function candidatesFor(ctx: ProtectedContext, requestId: string) {
  const r = await loadRequest(ctx, requestId);
  requirePermission(ctx, "makeup:read", { centerId: r.centerId });
  const today = todayISO();
  const rows = await ctx.db
    .select({
      id: sessions.id, classId: classes.id, courseId: classes.courseId, centerId: classes.centerId, sequenceNo: sessions.sequenceNo, date: sessions.date, status: sessions.status,
      startTime: sessions.startTime, endTime: sessions.endTime, classCode: classes.code, centerCode: centers.code, capacity: classes.capacity,
      enrolled: sql<number>`(select count(*)::int from ${enrollments} e where e.class_id = ${classes.id} and e.status in ('active','trial'))
        + (select count(*)::int from ${makeupRequests} m where m.target_session_id = ${sessions.id} and m.status = 'approved')`,
    })
    .from(sessions)
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .innerJoin(centers, eq(centers.id, classes.centerId))
    .innerJoin(courses, eq(courses.id, classes.courseId))
    .where(and(eq(classes.courseId, r.courseId), eq(sessions.sequenceNo, r.missedSeq), gte(sessions.date, today), isNull(classes.deletedAt)))
    .orderBy(asc(sessions.date));
  const ok = makeupCandidates({ classId: r.classId, courseId: r.courseId, centerId: r.centerId, sequenceNo: r.missedSeq }, rows, today);
  const ids = new Set(ok.map((x) => x.id));
  return rows.filter((x) => ids.has(x.id)).sort((a, b) => ok.findIndex((x) => x.id === a.id) - ok.findIndex((x) => x.id === b.id));
}

export async function decideMakeup(ctx: ProtectedContext, input: { requestId: string; action: "approve" | "reject" | "reschedule"; targetSessionId?: string; note?: string }) {
  const r = await loadRequest(ctx, input.requestId);
  requirePermission(ctx, "makeup:update", { centerId: r.centerId });
  const to = makeupTransition(r.req.status, input.action);
  if (input.action !== "reject") {
    if (!input.targetSessionId) throw new TRPCError({ code: "BAD_REQUEST", message: "Chọn buổi học bù" });
    const cands = await candidatesFor(ctx, input.requestId);
    if (!cands.some((c) => c.id === input.targetSessionId)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Buổi đã chọn không phù hợp (khác bài, đã diễn ra hoặc hết chỗ)" });
  } else if (!input.note?.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Cần nhập lý do từ chối" });
  }
  await ctx.db.transaction(async (tx) => {
    await tx.update(makeupRequests).set({
      status: to, targetSessionId: input.action === "reject" ? r.req.targetSessionId : input.targetSessionId!, decidedBy: ctx.user.id, decidedAt: new Date(),
      note: input.note ?? r.req.note, updatedAt: new Date(),
    }).where(eq(makeupRequests.id, r.req.id));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "academics", entity: "makeup_requests", entityId: r.req.id, before: { status: r.req.status }, after: { status: to, targetSessionId: input.targetSessionId ?? null }, reason: input.note ?? null, ip: ctx.ip });
  });
  return { status: to };
}

/** Ghi nhận HV đã học bù ở buổi đích: điểm danh "makeup" trỏ về buổi vắng */
export async function completeMakeup(ctx: ProtectedContext, input: { requestId: string }) {
  const r = await loadRequest(ctx, input.requestId);
  requirePermission(ctx, "makeup:update", { centerId: r.centerId });
  const to = makeupTransition(r.req.status, "complete");
  const t = r.req.targetSessionId ? await ctx.db.query.sessions.findFirst({ where: eq(sessions.id, r.req.targetSessionId) }) : null;
  if (!t) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Chưa xếp buổi học bù" });
  if (t.date > todayISO()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Buổi học bù chưa diễn ra" });
  await ctx.db.transaction(async (tx) => {
    await tx
      .insert(attendance)
      .values({ sessionId: t.id, enrollmentId: r.req.enrollmentId, status: "makeup", makeupForSessionId: r.req.missedSessionId, recordedBy: ctx.user.id, recordedAt: new Date(), note: "Học bù" })
      .onConflictDoUpdate({ target: [attendance.sessionId, attendance.enrollmentId], set: { status: "makeup", makeupForSessionId: r.req.missedSessionId, recordedBy: ctx.user.id, recordedAt: new Date() } });
    await tx.update(makeupRequests).set({ status: to, updatedAt: new Date() }).where(eq(makeupRequests.id, r.req.id));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "academics", entity: "makeup_requests", entityId: r.req.id, before: { status: r.req.status }, after: { status: to }, ip: ctx.ip });
  });
  return { status: to };
}
