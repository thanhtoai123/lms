import { and, eq, inArray, sql, asc, isNull, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { sessions, classes, enrollments, attendance, students, careTasks, courses, centers } from "@satarobo/db";
import {
  weekStart, weekDays, addDays, isRetroactiveEdit, detectRisks, summarize, visibleCenterIds,
  type AttendanceStatus, type AttendanceRecord,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { emit } from "./outbox";
import { listSessions, loadSessionForAuth, todayISO } from "./sessions";
import { processOutbox } from "./engagement";

type Db = ProtectedContext["db"];

/* ------------------------------------------------------------------ */
/* Lịch tổng                                                           */
/* ------------------------------------------------------------------ */

export async function weekCalendar(ctx: ProtectedContext, input: { date?: string; centerId?: string; teacherId?: string; roomId?: string }) {
  requirePermission(ctx, "session:read", { centerId: input.centerId ?? null });
  const start = weekStart(input.date ?? todayISO());
  const days = weekDays(start);
  const rows = await listSessions(ctx, { from: days[0]!, to: days[6]!, centerId: input.centerId, teacherId: input.teacherId, roomId: input.roomId });
  const today = todayISO();
  return {
    start,
    prev: addDays(start, -7),
    next: addDays(start, 7),
    today,
    days: days.map((d) => ({ date: d, sessions: rows.filter((r) => r.date === d) })),
    total: rows.length,
    cancelled: rows.filter((r) => r.status === "cancelled" || r.status === "rescheduled").length,
  };
}

/* ------------------------------------------------------------------ */
/* Điểm danh: bảng theo lớp + sửa hồi tố                              */
/* ------------------------------------------------------------------ */

export async function attendanceGrid(ctx: ProtectedContext, classId: string) {
  const cls = await ctx.db.query.classes.findFirst({ where: and(eq(classes.id, classId), isNull(classes.deletedAt)) });
  if (!cls) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy lớp" });
  requirePermission(ctx, "attendance:read", { centerId: cls.centerId, ownerIds: [cls.leadTeacherId ?? "", cls.assistantTeacherId ?? ""].filter(Boolean) });
  const today = todayISO();
  const ss = await ctx.db
    .select({ id: sessions.id, sequenceNo: sessions.sequenceNo, date: sessions.date, status: sessions.status })
    .from(sessions)
    .where(and(eq(sessions.classId, classId), lte(sessions.date, today), sql`${sessions.status} not in ('cancelled','rescheduled')`))
    .orderBy(asc(sessions.sequenceNo));
  const roster = await ctx.db
    .select({ enrollmentId: enrollments.id, studentId: students.id, fullName: students.fullName, code: students.code, status: enrollments.status, startSequenceNo: enrollments.startSequenceNo })
    .from(enrollments).innerJoin(students, eq(students.id, enrollments.studentId))
    .where(and(eq(enrollments.classId, classId), inArray(enrollments.status, ["trial", "active", "paused", "completed", "withdrawn"])))
    .orderBy(asc(students.fullName));
  const ids = roster.map((r) => r.enrollmentId);
  const marks = ids.length && ss.length
    ? await ctx.db.select({ enrollmentId: attendance.enrollmentId, sessionId: attendance.sessionId, status: attendance.status, note: attendance.note }).from(attendance)
        .where(and(inArray(attendance.enrollmentId, ids), inArray(attendance.sessionId, ss.map((s) => s.id))))
    : [];
  const key = (e: string, s: string) => `${e}:${s}`;
  const map = new Map(marks.map((m) => [key(m.enrollmentId, m.sessionId), m]));
  return {
    class: { id: cls.id, code: cls.code, name: cls.name, centerId: cls.centerId },
    today,
    sessions: ss,
    rows: roster.map((r) => {
      const cells = ss.map((s) => {
        const m = map.get(key(r.enrollmentId, s.id));
        return { sessionId: s.id, status: (m?.status ?? null) as AttendanceStatus | null, note: m?.note ?? null, applicable: s.sequenceNo >= r.startSequenceNo };
      });
      const recs: AttendanceRecord[] = cells.flatMap((c, i) => (c.status ? [{ sessionDate: ss[i]!.date, sequenceNo: ss[i]!.sequenceNo, status: c.status }] : []));
      return { ...r, cells, summary: summarize(recs) };
    }),
  };
}

/**
 * Sửa/ghi điểm danh một ô từ màn quản trị.
 * Hồi tố (buổi đã hoàn tất hoặc đã qua ngày) → bắt buộc lý do, ghi audit trước/sau, báo GV phụ trách buổi.
 */
export async function correctAttendance(ctx: ProtectedContext, input: { sessionId: string; enrollmentId: string; status: AttendanceStatus; reason?: string }) {
  const s = await loadSessionForAuth(ctx, input.sessionId);
  requirePermission(ctx, "attendance:update", { centerId: s.centerId });
  const today = todayISO();
  if (s.session.date > today) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Buổi học chưa diễn ra" });
  if (s.session.status === "cancelled" || s.session.status === "rescheduled") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Buổi học đã huỷ/dời" });
  const retro = isRetroactiveEdit(s.session.status, s.session.date, today);
  if (retro && !input.reason?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Sửa điểm danh hồi tố cần nhập lý do" });
  const enr = await ctx.db.query.enrollments.findFirst({ where: eq(enrollments.id, input.enrollmentId) });
  if (!enr || enr.classId !== s.session.classId) throw new TRPCError({ code: "BAD_REQUEST", message: "Học viên không thuộc lớp của buổi này" });
  const before = await ctx.db.query.attendance.findFirst({ where: and(eq(attendance.sessionId, input.sessionId), eq(attendance.enrollmentId, input.enrollmentId)) });
  if (before?.status === input.status) return { changed: false };

  await ctx.db.transaction(async (tx) => {
    await tx
      .insert(attendance)
      .values({ sessionId: input.sessionId, enrollmentId: input.enrollmentId, status: input.status, note: input.reason ?? null, recordedBy: ctx.user.id, recordedAt: new Date() })
      .onConflictDoUpdate({ target: [attendance.sessionId, attendance.enrollmentId], set: { status: input.status, note: input.reason ?? null, recordedBy: ctx.user.id, recordedAt: new Date(), updatedAt: new Date() } });
    await writeAudit(tx as unknown as Db, {
      actorId: ctx.user.id, action: "UPDATE", module: "academics", entity: "attendance", entityId: input.enrollmentId,
      before: { sessionId: input.sessionId, status: before?.status ?? null }, after: { sessionId: input.sessionId, status: input.status, retroactive: retro }, reason: input.reason ?? null, ip: ctx.ip,
    });
    if (retro) {
      await emit(tx as unknown as Db, { type: "attendance.corrected", sessionId: input.sessionId, enrollmentId: input.enrollmentId, studentId: enr.studentId, from: before?.status ?? null, to: input.status, reason: input.reason!, actorId: ctx.user.id });
    }
    // chấm lại rủi ro của HV trong lớp
    const hist = await tx
      .select({ status: attendance.status, date: sessions.date, seq: sessions.sequenceNo })
      .from(attendance).innerJoin(sessions, eq(sessions.id, attendance.sessionId))
      .where(and(eq(attendance.enrollmentId, enr.id), eq(sessions.classId, s.session.classId)));
    for (const risk of detectRisks(hist.map((h) => ({ sessionDate: h.date, sequenceNo: h.seq, status: h.status })))) {
      await emit(tx as unknown as Db, { type: "risk.detected", studentId: enr.studentId, enrollmentId: enr.id, code: risk.code, severity: risk.severity, detail: risk.detail });
    }
  });
  return { changed: true, retroactive: retro };
}

/* ------------------------------------------------------------------ */
/* Cảnh báo rủi ro                                                     */
/* ------------------------------------------------------------------ */

export async function riskOverview(ctx: ProtectedContext, input: { centerId?: string }) {
  requirePermission(ctx, "care:read", { centerId: input.centerId ?? null });
  const visible = visibleCenterIds(ctx.actor);
  const conds = [inArray(careTasks.code, ["CONSECUTIVE_ABSENCE", "LOW_ATTENDANCE", "PENDING_MAKEUP"]), inArray(careTasks.status, ["open", "in_progress", "escalated"])];
  if (input.centerId) conds.push(eq(careTasks.centerId, input.centerId));
  if (visible !== null) conds.push(visible.length ? inArray(careTasks.centerId, visible) : sql`false`);
  const rows = await ctx.db
    .select({
      id: careTasks.id, code: careTasks.code, title: careTasks.title, severity: careTasks.severity, status: careTasks.status, dueAt: careTasks.dueAt, createdAt: careTasks.createdAt,
      studentId: students.id, studentName: students.fullName, studentCode: students.code, classId: classes.id, classCode: classes.code, centerCode: centers.code,
    })
    .from(careTasks)
    .innerJoin(students, eq(students.id, careTasks.studentId))
    .leftJoin(enrollments, eq(enrollments.id, careTasks.enrollmentId))
    .leftJoin(classes, eq(classes.id, enrollments.classId))
    .leftJoin(centers, eq(centers.id, careTasks.centerId))
    .where(and(...conds))
    .orderBy(asc(careTasks.severity), asc(careTasks.dueAt));
  const now = Date.now();
  const items = rows.map((r) => ({ ...r, overdue: r.dueAt.getTime() < now }));
  return {
    items,
    byCode: {
      CONSECUTIVE_ABSENCE: items.filter((i) => i.code === "CONSECUTIVE_ABSENCE").length,
      LOW_ATTENDANCE: items.filter((i) => i.code === "LOW_ATTENDANCE").length,
      PENDING_MAKEUP: items.filter((i) => i.code === "PENDING_MAKEUP").length,
    },
  };
}

/** Quét lại toàn bộ ghi danh đang học trong phạm vi → phát risk.detected → automation tạo việc (không trùng) */
export async function rescanRisks(ctx: ProtectedContext, input: { centerId?: string }) {
  requirePermission(ctx, "care:update", { centerId: input.centerId ?? null });
  const visible = visibleCenterIds(ctx.actor);
  const conds = [inArray(enrollments.status, ["active", "trial"])];
  if (input.centerId) conds.push(eq(classes.centerId, input.centerId));
  if (visible !== null) conds.push(visible.length ? inArray(classes.centerId, visible) : sql`false`);
  const hist = await ctx.db
    .select({ enrollmentId: enrollments.id, studentId: enrollments.studentId, status: attendance.status, date: sessions.date, seq: sessions.sequenceNo })
    .from(enrollments)
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(attendance, eq(attendance.enrollmentId, enrollments.id))
    .innerJoin(sessions, eq(sessions.id, attendance.sessionId))
    .where(and(...conds));
  const by = new Map<string, { studentId: string; recs: AttendanceRecord[] }>();
  for (const h of hist) {
    const e = by.get(h.enrollmentId) ?? { studentId: h.studentId, recs: [] };
    e.recs.push({ sessionDate: h.date, sequenceNo: h.seq, status: h.status });
    by.set(h.enrollmentId, e);
  }
  let signals = 0;
  await ctx.db.transaction(async (tx) => {
    for (const [enrollmentId, e] of by) {
      for (const risk of detectRisks(e.recs)) {
        signals++;
        await emit(tx as unknown as Db, { type: "risk.detected", studentId: e.studentId, enrollmentId, code: risk.code, severity: risk.severity, detail: risk.detail });
      }
    }
  });
  const r = await processOutbox(ctx.db);
  return { scanned: by.size, signals, processed: r.processed };
}

/** Danh sách lớp gọn cho bộ chọn (điểm danh, học bù) */
export async function classOptions(ctx: ProtectedContext) {
  const visible = visibleCenterIds(ctx.actor);
  return ctx.db
    .select({ id: classes.id, code: classes.code, name: classes.name, status: classes.status, centerCode: centers.code, courseCode: courses.code })
    .from(classes).innerJoin(centers, eq(centers.id, classes.centerId)).innerJoin(courses, eq(courses.id, classes.courseId))
    .where(and(isNull(classes.deletedAt), visible === null ? sql`true` : visible.length ? inArray(classes.centerId, visible) : sql`false`))
    .orderBy(asc(centers.code), asc(classes.code));
}
