import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { students, enrollments, classes, studentPauses, makeupRequests, careTasks, type Database } from "@satarobo/db";
import {
  checkStudentLifecycle, validatePause, pauseReminder, DEFAULT_STUDENT_POLICY, STUDENT_LIFECYCLE_VI,
  type StudentLifecycleEvent, type StudentLifecycleState,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { getOps, opsForCenters } from "./opsSettings";
import { todayISO } from "./sessions";
import { logEvent, syncStudentStatus, afterEnrollmentEnded } from "./enrollments";

type Db = ProtectedContext["db"];

async function loadState(db: Db, studentId: string) {
  const s = await db.query.students.findFirst({ where: and(eq(students.id, studentId), isNull(students.deletedAt)) });
  if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy học viên" });
  const enrs = await db.select({ id: enrollments.id, status: enrollments.status, classId: enrollments.classId, centerId: classes.centerId, classCode: classes.code })
    .from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId))
    .where(and(eq(enrollments.studentId, studentId), inArray(enrollments.status, ["trial", "active", "paused"])));
  const openPause = await db.query.studentPauses.findFirst({ where: and(eq(studentPauses.studentId, studentId), isNull(studentPauses.endedAt)) });
  const state: StudentLifecycleState = {
    status: s.status,
    studying: enrs.filter((e) => e.status === "active").length,
    paused: enrs.filter((e) => e.status === "paused").length,
    openPause: !!openPause,
  };
  return { s, enrs, openPause: openPause ?? null, state };
}

function authorizeFor(ctx: ProtectedContext, s: { homeCenterId: string | null }, enrs: { centerId: string }[]) {
  requirePermission(ctx, "enrollment:update", { centerId: s.homeCenterId });
  for (const c of new Set(enrs.map((e) => e.centerId))) requirePermission(ctx, "enrollment:update", { centerId: c });
}

function check(state: StudentLifecycleState, event: StudentLifecycleEvent, reason?: string | null) {
  return checkStudentLifecycle(state, event, reason);
}

/** Bảo lưu: tất cả lớp đang học (enrollmentId trống) hoặc một lớp; ngày trở lại tuỳ chọn */
export async function reserveStudent(ctx: ProtectedContext, input: { studentId: string; enrollmentId?: string | null; reason: string; from?: string | null; expectedReturn?: string | null }) {
  const { s, enrs, openPause, state } = await loadState(ctx.db, input.studentId);
  authorizeFor(ctx, s, enrs);
  const reason = check(state, "reserve", input.reason)!;
  const active = enrs.filter((e) => e.status === "active");
  const targets = input.enrollmentId ? active.filter((e) => e.id === input.enrollmentId) : active;
  if (!targets.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: input.enrollmentId ? "Lớp đã chọn không ở trạng thái đang học" : "Không có lớp đang học để bảo lưu" });
  const from = input.from || todayISO();
  const ops = await getOps(ctx.db, s.homeCenterId ?? targets[0]!.centerId);
  const err = validatePause(from, input.expectedReturn || null, { ...DEFAULT_STUDENT_POLICY, maxPauseMonths: ops.maxPauseMonths });
  if (err) throw new TRPCError({ code: "BAD_REQUEST", message: err });
  const until = input.expectedReturn || null;

  await ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    for (const e of targets) {
      const up = await tx.update(enrollments).set({ status: "paused", pausedAt: from, pauseUntil: until, updatedAt: new Date() })
        .where(and(eq(enrollments.id, e.id), eq(enrollments.status, "active"))).returning({ id: enrollments.id });
      if (!up.length) throw new TRPCError({ code: "CONFLICT", message: `Đăng ký ${e.classCode} vừa thay đổi — tải lại trang` });
      await logEvent(db, { enrollmentId: e.id, type: "pause", from: "active", to: "paused", reason, meta: { pausedAt: from, pauseUntil: until, scope: input.enrollmentId ? "one" : "all" }, actorId: ctx.user.id });
    }
    let pauseId: string;
    if (openPause) {
      pauseId = openPause.id;
      const ids = [...new Set([...(openPause.enrollmentIds ?? []), ...targets.map((t) => t.id)])];
      await tx.update(studentPauses).set({ enrollmentIds: ids, ...(until ? { expectedReturn: until } : {}) }).where(eq(studentPauses.id, openPause.id));
    } else {
      const [p] = await tx.insert(studentPauses).values({ studentId: s.id, enrollmentIds: targets.map((t) => t.id), fromDate: from, expectedReturn: until, reason, createdBy: ctx.user.id }).returning({ id: studentPauses.id });
      pauseId = p!.id;
    }
    await syncStudentStatus(db, s.id);
    await writeAudit(db, { actorId: ctx.user.id, action: "TRANSITION", module: "students", entity: "student_pauses", entityId: s.id, before: { status: s.status }, after: { event: "reserve", pauseId, enrollments: targets.map((t) => t.classCode), from, expectedReturn: until }, reason, ip: ctx.ip });
  });
  return { paused: targets.length };
}

/** Kết thúc bảo lưu: mọi lớp đang bảo lưu học lại, đóng đợt bảo lưu */
export async function endStudentReserve(ctx: ProtectedContext, input: { studentId: string; note?: string | null }) {
  const { s, enrs, openPause, state } = await loadState(ctx.db, input.studentId);
  authorizeFor(ctx, s, enrs);
  check(state, "end_reserve");
  const paused = enrs.filter((e) => e.status === "paused");
  const note = input.note?.trim() || null;
  await ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    for (const e of paused) {
      await tx.update(enrollments).set({ status: "active", pausedAt: null, pauseUntil: null, updatedAt: new Date() }).where(and(eq(enrollments.id, e.id), eq(enrollments.status, "paused")));
      await logEvent(db, { enrollmentId: e.id, type: "resume", from: "paused", to: "active", reason: note ?? "Kết thúc bảo lưu", actorId: ctx.user.id });
    }
    if (openPause) await tx.update(studentPauses).set({ endedAt: new Date(), endedBy: ctx.user.id, endKind: "reserve_end", endNote: note }).where(eq(studentPauses.id, openPause.id));
    await syncStudentStatus(db, s.id);
    await writeAudit(db, { actorId: ctx.user.id, action: "TRANSITION", module: "students", entity: "student_pauses", entityId: s.id, before: { status: s.status }, after: { event: "end_reserve", resumed: paused.map((e) => e.classCode) }, reason: note, ip: ctx.ip });
  });
  return { resumed: paused.length };
}

/** Nghỉ học hẳn: kết thúc bảo lưu, mọi ghi danh chưa xong → nghỉ học (đề xuất hoàn tiền nếu còn tiền), huỷ học bù đang chờ */
export async function withdrawStudent(ctx: ProtectedContext, input: { studentId: string; reason: string }) {
  const { s, enrs, openPause, state } = await loadState(ctx.db, input.studentId);
  authorizeFor(ctx, s, enrs);
  const reason = check(state, "withdraw", input.reason)!;
  const refunds: { enrollmentId: string; classCode: string; amount: number }[] = [];
  let makeupCancelled = 0;
  await ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    for (const e of enrs) {
      await tx.update(enrollments).set({ status: "withdrawn", endedAt: new Date(), endReason: `Nghỉ học hẳn: ${reason}`, pausedAt: null, pauseUntil: null, updatedAt: new Date() }).where(eq(enrollments.id, e.id));
      await logEvent(db, { enrollmentId: e.id, type: "withdraw", from: e.status, to: "withdrawn", reason, meta: { scope: "student" }, actorId: ctx.user.id });
      const r = await afterEnrollmentEnded(db, { enrollmentId: e.id, classId: e.classId, reason, actorId: ctx.user.id, trigger: "withdraw" });
      if (r.amount) refunds.push({ enrollmentId: e.id, classCode: e.classCode, amount: r.amount });
    }
    if (enrs.length) {
      const mk = await tx.update(makeupRequests).set({ status: "rejected", note: `Học viên nghỉ học: ${reason}`.slice(0, 500), decidedBy: ctx.user.id, decidedAt: new Date(), updatedAt: new Date() })
        .where(and(inArray(makeupRequests.enrollmentId, enrs.map((e) => e.id)), inArray(makeupRequests.status, ["requested", "approved"]))).returning({ id: makeupRequests.id });
      makeupCancelled = mk.length;
    }
    if (openPause) await tx.update(studentPauses).set({ endedAt: new Date(), endedBy: ctx.user.id, endKind: "withdraw", endNote: reason }).where(eq(studentPauses.id, openPause.id));
    await tx.update(students).set({ status: "withdrawn", updatedAt: new Date() }).where(eq(students.id, s.id));
    await tx.update(careTasks).set({ status: "done", outcome: `Học viên nghỉ học: ${reason}`.slice(0, 500), resolvedAt: new Date(), resolvedBy: ctx.user.id })
      .where(and(eq(careTasks.studentId, s.id), inArray(careTasks.status, ["open", "in_progress", "escalated"]), sql`${careTasks.code} like 'PAUSE_%'`));
    await writeAudit(db, {
      actorId: ctx.user.id, action: "TRANSITION", module: "students", entity: "students", entityId: s.id,
      before: { status: s.status }, after: { event: "withdraw", withdrawn: enrs.map((e) => e.classCode), refunds, makeupCancelled }, reason, ip: ctx.ip,
    });
  });
  return { withdrawn: enrs.length, refunds, makeupCancelled };
}

/** Kích hoạt lại học viên đã nghỉ: về "tiềm năng" (hoặc "đã học xong" nếu từng hoàn thành khoá) — ghi danh lớp mới để học tiếp */
export async function reactivateStudent(ctx: ProtectedContext, input: { studentId: string; reason: string }) {
  const { s, enrs, state } = await loadState(ctx.db, input.studentId);
  authorizeFor(ctx, s, enrs);
  const reason = check(state, "reactivate", input.reason)!;
  const [done] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(enrollments).where(and(eq(enrollments.studentId, s.id), eq(enrollments.status, "completed")));
  const next = (done?.n ?? 0) > 0 ? ("alumni" as const) : ("prospect" as const);
  await ctx.db.transaction(async (tx) => {
    await tx.update(students).set({ status: next, updatedAt: new Date() }).where(eq(students.id, s.id));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "students", entity: "students", entityId: s.id, before: { status: s.status }, after: { event: "reactivate", status: next }, reason, ip: ctx.ip });
  });
  return { status: next, label: STUDENT_LIFECYCLE_VI.reactivate };
}

/**
 * Job hằng ngày: đợt bảo lưu sắp đến / quá ngày trở lại, hoặc chưa hẹn ngày mà quá hạn bảo lưu tối đa → việc chăm sóc (không tạo trùng).
 */
export async function remindPauseEnding(database: Database | Db, opts: { leadDays?: number } = {}) {
  const db = database as unknown as Db;
  const today = todayISO();
  const open = await db.select({ id: studentPauses.id, studentId: studentPauses.studentId, fromDate: studentPauses.fromDate, expectedReturn: studentPauses.expectedReturn, enrollmentIds: studentPauses.enrollmentIds, centerId: students.homeCenterId, name: students.fullName })
    .from(studentPauses).innerJoin(students, eq(students.id, studentPauses.studentId))
    .where(and(isNull(studentPauses.endedAt), isNull(students.deletedAt)));
  if (!open.length) return 0;
  const ops = await opsForCenters(db, open.map((p) => p.centerId).filter((x): x is string => !!x));
  let created = 0;
  for (const p of open) {
    if (!p.centerId) continue;
    const max = ops.get(p.centerId)?.maxPauseMonths ?? DEFAULT_STUDENT_POLICY.maxPauseMonths;
    const r = pauseReminder({ id: p.id, fromDate: p.fromDate, expectedReturn: p.expectedReturn, today, leadDays: opts.leadDays }, { ...DEFAULT_STUDENT_POLICY, maxPauseMonths: max });
    if (!r) continue;
    const ex = await db.query.careTasks.findFirst({ where: eq(careTasks.dedupeKey, r.dedupeKey), columns: { id: true } });
    if (ex) continue;
    await db.insert(careTasks).values({
      studentId: p.studentId, enrollmentId: p.enrollmentIds?.[0] ?? null, centerId: p.centerId,
      code: r.kind === "over_max" ? "PAUSE_OVER_MAX" : "PAUSE_RETURN", title: `${p.name}: ${r.message}`, severity: r.kind === "return_soon" ? 3 : 2,
      dueAt: new Date(Date.now() + 48 * 3600e3), dedupeKey: r.dedupeKey,
    });
    created++;
  }
  return created;
}
