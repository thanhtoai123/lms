import { and, eq, inArray, sql, asc, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { sessions, classes, enrollments, attendance, students, teachers, rooms, centers, lessons } from "@satarobo/db";
import {
  transition, nextStep, isOverdue, OPEN_STATUSES, toISODate, visibleCenterIds, detectRisks,
  type SessionEvent, type SessionStatus, type AttendanceStatus, type AttendanceRecord,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { emit } from "./outbox";

export function todayISO() {
  // Múi giờ vận hành: Asia/Ho_Chi_Minh (UTC+7)
  const now = new Date();
  const local = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return toISODate(local);
}

/** Tải buổi học + thông tin lớp để kiểm tra quyền (centerId, ownerIds) */
export async function loadSessionForAuth(ctx: ProtectedContext, sessionId: string) {
  const row = await ctx.db
    .select({
      session: sessions,
      classCode: classes.code,
      className: classes.name,
      centerId: classes.centerId,
      leadTeacherId: classes.leadTeacherId,
      assistantTeacherId: classes.assistantTeacherId,
    })
    .from(sessions)
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const r = row[0];
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy buổi học" });
  const ownerIds = [r.session.teacherId, r.leadTeacherId, r.assistantTeacherId].filter((x): x is string => !!x);
  return { ...r, ownerIds };
}

/** Chi tiết buổi học kèm danh sách HV và điểm danh hiện có */
export async function getSessionDetail(ctx: ProtectedContext, sessionId: string) {
  const s = await loadSessionForAuth(ctx, sessionId);
  requirePermission(ctx, "session:read", { centerId: s.centerId, ownerIds: s.ownerIds });

  const roster = await ctx.db
    .select({
      enrollmentId: enrollments.id,
      studentId: students.id,
      studentCode: students.code,
      fullName: students.fullName,
      nickname: students.nickname,
      enrollmentStatus: enrollments.status,
      startSequenceNo: enrollments.startSequenceNo,
      attendanceStatus: attendance.status,
      studentRemark: attendance.studentRemark,
      attendanceId: attendance.id,
    })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .leftJoin(attendance, and(eq(attendance.enrollmentId, enrollments.id), eq(attendance.sessionId, sessionId)))
    .where(and(eq(enrollments.classId, s.session.classId), inArray(enrollments.status, ["active", "trial"]), lte(enrollments.startSequenceNo, s.session.sequenceNo)))
    .orderBy(asc(students.fullName));

  const [room] = s.session.roomId ? await ctx.db.select({ code: rooms.code, name: rooms.name }).from(rooms).where(eq(rooms.id, s.session.roomId)) : [null];
  const [teacher] = s.session.teacherId ? await ctx.db.select({ id: teachers.id, fullName: teachers.fullName }).from(teachers).where(eq(teachers.id, s.session.teacherId)) : [null];
  const [lesson] = s.session.lessonId ? await ctx.db.select({ title: lessons.title, objectives: lessons.objectives, isReportCardMilestone: lessons.isReportCardMilestone }).from(lessons).where(eq(lessons.id, s.session.lessonId)) : [null];

  const today = todayISO();
  return {
    ...s.session,
    classCode: s.classCode,
    className: s.className,
    centerId: s.centerId,
    room: room ?? null,
    teacher: teacher ?? null,
    lesson: lesson ?? null,
    roster,
    enrolledCount: roster.length,
    attendanceCount: roster.filter((r) => r.attendanceStatus).length,
    nextStep: nextStep(s.session.status),
    isOverdue: isOverdue(s.session.status, s.session.date, today),
    today,
  };
}

/**
 * Ghi điểm danh cho nhiều HV trong một lần (upsert) rồi thử chuyển trạng thái buổi.
 * Idempotent: gọi lại với cùng dữ liệu không tạo bản ghi trùng.
 */
export async function recordAttendance(
  ctx: ProtectedContext,
  input: { sessionId: string; records: { enrollmentId: string; status: AttendanceStatus; studentRemark?: string | null; makeupForSessionId?: string | null }[] },
) {
  const s = await loadSessionForAuth(ctx, input.sessionId);
  requirePermission(ctx, "attendance:write", { centerId: s.centerId, ownerIds: s.ownerIds });
  if (s.session.date > todayISO()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Buổi học chưa diễn ra" });
  if (["cancelled", "rescheduled"].includes(s.session.status)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Buổi học đã huỷ/dời" });

  await ctx.db.transaction(async (tx) => {
    for (const r of input.records) {
      await tx
        .insert(attendance)
        .values({
          sessionId: input.sessionId,
          enrollmentId: r.enrollmentId,
          status: r.status,
          studentRemark: r.studentRemark ?? null,
          makeupForSessionId: r.makeupForSessionId ?? null,
          recordedBy: ctx.user.id,
          recordedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [attendance.sessionId, attendance.enrollmentId],
          set: { status: r.status, studentRemark: r.studentRemark ?? null, makeupForSessionId: r.makeupForSessionId ?? null, recordedBy: ctx.user.id, recordedAt: new Date() },
        });
    }
    await writeAudit(tx as unknown as typeof ctx.db, {
      actorId: ctx.user.id, action: "UPDATE", module: "academics", entity: "attendance", entityId: input.sessionId,
      after: { count: input.records.length }, ip: ctx.ip,
    });

    // Phát hiện rủi ro cho từng HV từ toàn bộ lịch sử điểm danh trong lớp → event cho automation
    const enrollmentIds = input.records.map((r) => r.enrollmentId);
    const history = await tx
      .select({ enrollmentId: attendance.enrollmentId, studentId: enrollments.studentId, status: attendance.status, date: sessions.date, seq: sessions.sequenceNo })
      .from(attendance)
      .innerJoin(sessions, eq(sessions.id, attendance.sessionId))
      .innerJoin(enrollments, eq(enrollments.id, attendance.enrollmentId))
      .where(and(inArray(attendance.enrollmentId, enrollmentIds), eq(sessions.classId, s.session.classId)));
    const byEnrollment = new Map<string, { studentId: string; recs: AttendanceRecord[] }>();
    for (const h of history) {
      const e = byEnrollment.get(h.enrollmentId) ?? { studentId: h.studentId, recs: [] };
      e.recs.push({ sessionDate: h.date, sequenceNo: h.seq, status: h.status });
      byEnrollment.set(h.enrollmentId, e);
    }
    for (const r of input.records) {
      const e = byEnrollment.get(r.enrollmentId);
      if (!e) continue;
      await emit(tx as unknown as typeof ctx.db, { type: "attendance.recorded", sessionId: input.sessionId, enrollmentId: r.enrollmentId, studentId: e.studentId, status: r.status, sequenceNo: s.session.sequenceNo });
      for (const risk of detectRisks(e.recs)) {
        await emit(tx as unknown as typeof ctx.db, { type: "risk.detected", studentId: e.studentId, enrollmentId: r.enrollmentId, code: risk.code, severity: risk.severity, detail: risk.detail });
      }
    }
  });
  return getSessionDetail(ctx, input.sessionId);
}

/** Cập nhật nhận xét buổi (không đổi trạng thái; dùng transition để chốt) */
export async function saveSessionNote(ctx: ProtectedContext, input: { sessionId: string; note: string }) {
  const s = await loadSessionForAuth(ctx, input.sessionId);
  requirePermission(ctx, "session_note:write", { centerId: s.centerId, ownerIds: s.ownerIds });
  await ctx.db.update(sessions).set({ sessionNote: input.note }).where(eq(sessions.id, input.sessionId));
  return getSessionDetail(ctx, input.sessionId);
}

/** Chuyển trạng thái theo state machine — mọi guard ở @satarobo/core */
export async function transitionSession(ctx: ProtectedContext, input: { sessionId: string; event: SessionEvent; reason?: string }) {
  const s = await loadSessionForAuth(ctx, input.sessionId);
  requirePermission(ctx, "session:update", { centerId: s.centerId, ownerIds: s.ownerIds });
  const detail = await getSessionDetail(ctx, input.sessionId);

  const to: SessionStatus = transition(detail.status, input.event, {
    enrolledCount: detail.enrolledCount,
    attendanceCount: detail.attendanceCount,
    hasSessionNote: !!detail.sessionNote?.trim(),
    today: detail.today,
    sessionDate: detail.date,
  });

  await ctx.db.transaction(async (tx) => {
    await tx
      .update(sessions)
      .set({ status: to, ...(to === "completed" ? { completedAt: new Date(), completedBy: ctx.user.id } : {}) })
      .where(eq(sessions.id, input.sessionId));
    await writeAudit(tx as unknown as typeof ctx.db, {
      actorId: ctx.user.id, action: "TRANSITION", module: "academics", entity: "sessions", entityId: input.sessionId,
      before: { status: detail.status }, after: { status: to, event: input.event }, reason: input.reason ?? null, ip: ctx.ip,
    });
    if (to === "completed") {
      await emit(tx as unknown as typeof ctx.db, { type: "session.completed", sessionId: input.sessionId, classId: detail.classId, date: detail.date, teacherId: detail.teacherId });
      if (detail.lesson?.isReportCardMilestone) {
        for (const r of detail.roster) await emit(tx as unknown as typeof ctx.db, { type: "report_card.due", enrollmentId: r.enrollmentId, sessionId: input.sessionId, sequenceNo: detail.sequenceNo });
      }
    }
  });
  return getSessionDetail(ctx, input.sessionId);
}

/** Danh sách buổi trong một khoảng ngày, theo GV hoặc cơ sở (dùng cho Teacher "Hôm nay" và Ops "Buổi học") */
export async function listSessions(
  ctx: ProtectedContext,
  input: { from: string; to: string; teacherId?: string; centerId?: string; onlyOpen?: boolean; classId?: string; roomId?: string },
) {
  const conds = [gte(sessions.date, input.from), lte(sessions.date, input.to)];
  if (input.roomId) conds.push(eq(sessions.roomId, input.roomId));
  if (input.teacherId) conds.push(eq(sessions.teacherId, input.teacherId));
  if (input.classId) conds.push(eq(sessions.classId, input.classId));
  if (input.centerId) conds.push(eq(classes.centerId, input.centerId));
  if (input.onlyOpen) conds.push(inArray(sessions.status, [...OPEN_STATUSES]));

  // Giới hạn theo cơ sở được thấy
  const visible = visibleCenterIds(ctx.actor);
  if (visible !== null) conds.push(visible.length ? inArray(classes.centerId, visible) : sql`false`);

  const rows = await ctx.db
    .select({
      id: sessions.id, classId: sessions.classId, classCode: classes.code, className: classes.name, centerId: classes.centerId, centerCode: centers.code,
      sequenceNo: sessions.sequenceNo, date: sessions.date, startTime: sessions.startTime, endTime: sessions.endTime, status: sessions.status, topic: sessions.topic,
      roomId: sessions.roomId, roomCode: rooms.code, teacherId: sessions.teacherId, teacherName: teachers.fullName, courseId: classes.courseId, capacity: classes.capacity,
      enrolled: sql<number>`(select count(*)::int from ${enrollments} e where e.class_id = ${sessions.classId} and e.status in ('active','trial') and e.start_sequence_no <= ${sessions.sequenceNo})`,
      attended: sql<number>`(select count(*)::int from ${attendance} a where a.session_id = ${sessions.id})`,
    })
    .from(sessions)
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .innerJoin(centers, eq(centers.id, classes.centerId))
    .leftJoin(rooms, eq(rooms.id, sessions.roomId))
    .leftJoin(teachers, eq(teachers.id, sessions.teacherId))
    .where(and(...conds))
    .orderBy(asc(sessions.date), asc(sessions.startTime));

  const today = todayISO();
  return rows.map((r) => ({ ...r, nextStep: nextStep(r.status), isOverdue: isOverdue(r.status, r.date, today) }));
}

/** Hàng đợi "buổi chưa hoàn tất đã qua ngày" theo cơ sở — thay cho card trên dashboard cũ */
export async function overdueQueue(ctx: ProtectedContext, input: { centerId?: string; limit?: number }) {
  const today = todayISO();
  const rows = await listSessions(ctx, { from: "2000-01-01", to: today, centerId: input.centerId, onlyOpen: true });
  const overdue = rows.filter((r) => r.date < today);
  return { total: overdue.length, items: overdue.sort((a, b) => a.date.localeCompare(b.date)).slice(0, input.limit ?? 50) };
}

