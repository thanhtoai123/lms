import { and, eq, inArray, sql, asc, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { sessions, classes, enrollments, attendance, students, teachers, rooms, centers, lessons, curricula, trialBookings, leads, sessionMedia, assignments, users } from "@satarobo/db";
import {
  transition, nextStep, isOverdue, OPEN_STATUSES, toISODate, addDays, clampPageSize, visibleCenterIds, detectRisks, riskFrom, missingRequiredChecklist, sessionLabel, SESSION_CHECKLIST,
  completionBlockers, completionChecklist,
  type ChecklistState,
  type SessionEvent, type SessionStatus, type AttendanceStatus, type AttendanceRecord,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { getOps } from "./opsSettings";
import { writeAudit } from "./audit";
import { emit } from "./outbox";
import { tenantCond, assertTenant } from "./tenantScope";
import { sessionEvaluationStatus, publishSessionEvaluations, syncRemarksFromAttendance } from "./sessionEvaluations";

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
  assertTenant(ctx, r.session, "Buổi học");
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
      rating: attendance.rating,
      needsMakeup: attendance.needsMakeup,
      absenceReason: attendance.absenceReason,
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

  const trialGuests = await ctx.db
    .select({ id: trialBookings.id, childName: trialBookings.childName, status: trialBookings.status, note: trialBookings.note, resultNote: trialBookings.resultNote, parentName: leads.parentName })
    .from(trialBookings).innerJoin(leads, eq(leads.id, trialBookings.leadId))
    .where(and(eq(trialBookings.sessionId, sessionId), inArray(trialBookings.status, ["booked", "attended", "no_show"])))
    .orderBy(asc(trialBookings.createdAt));

  const [[media], [hw], ops, [confirmer], evals] = await Promise.all([
    ctx.db.select({ n: sql<number>`count(*)::int` }).from(sessionMedia).where(and(eq(sessionMedia.sessionId, sessionId), sql`${sessionMedia.status} <> 'rejected'`)),
    ctx.db.select({ n: sql<number>`count(*)::int` }).from(assignments).where(and(eq(assignments.sessionId, sessionId), sql`${assignments.status} <> 'draft'`)),
    getOps(ctx.db, s.centerId),
    s.session.lessonConfirmedBy ? ctx.db.select({ name: users.fullName }).from(users).where(eq(users.id, s.session.lessonConfirmedBy)) : Promise.resolve([] as { name: string }[]),
    // Phiếu nhận xét buổi (hồ sơ học tập): HV có mặt phải có phiếu đủ tiêu chí trước khi hoàn tất
    sessionEvaluationStatus(ctx.db, sessionId),
  ]);
  const missing = missingRequiredChecklist(s.session.checklist);
  const completionInput = {
    enrolledCount: roster.length,
    attendanceCount: roster.filter((r) => r.attendanceStatus).length,
    lessonConfirmed: !!s.session.lessonConfirmedAt,
    hasSessionNote: !!s.session.sessionNote?.trim(),
    presentWithoutRemark: roster.filter((r) => (r.attendanceStatus === "present" || r.attendanceStatus === "late" || r.attendanceStatus === "makeup") && !r.studentRemark?.trim()).length,
    requireRemarks: ops.sessionRequireStudentRemarks,
    mediaCount: media?.n ?? 0,
    requireMedia: ops.sessionRequireMedia,
    checklistMissing: missing.map((m) => m.label),
    assignmentCount: hw?.n ?? 0,
    // Buổi đã hoàn tất: phiếu đã phát hành cùng lúc hoàn tất; không nhắc lại ở danh sách bước
    evaluationsMissing: s.session.status === "completed" ? null : evals.message,
    evaluationsReady: { ready: evals.ready, required: evals.required },
    requireEvaluations: ops.sessionRequireEvaluations,
  };

  const today = todayISO();
  return {
    ...s.session,
    trialGuests,
    classCode: s.classCode,
    className: s.className,
    centerId: s.centerId,
    room: room ?? null,
    teacher: teacher ?? null,
    lesson: lesson ?? null,
    roster,
    enrolledCount: roster.length,
    attendanceCount: completionInput.attendanceCount,
    nextStep: nextStep(s.session.status),
    isOverdue: isOverdue(s.session.status, s.session.date, today),
    label: sessionLabel(s.session.sequenceNo, s.session.kind, s.session.originalSequenceNo),
    checklistTemplate: SESSION_CHECKLIST,
    checklistMissing: missing.map((m) => m.key),
    completion: completionChecklist(completionInput),
    completionBlockers: completionBlockers(completionInput),
    evaluations: { required: evals.required, ready: evals.ready, missing: evals.missing, message: evals.message, enforced: ops.sessionRequireEvaluations },
    lessonConfirmedByName: confirmer?.name ?? null,
    today,
  };
}

/** Bài học có thể xác nhận cho buổi: bài của giáo trình lớp (hoặc giáo trình đang dùng của khoá) */
export async function lessonOptions(ctx: ProtectedContext, sessionId: string) {
  const s = await loadSessionForAuth(ctx, sessionId);
  requirePermission(ctx, "session:read", { centerId: s.centerId, ownerIds: s.ownerIds });
  const cls = await ctx.db.query.classes.findFirst({ where: eq(classes.id, s.session.classId), columns: { curriculumId: true, courseId: true } });
  const curriculumId = cls?.curriculumId ?? (cls ? (await ctx.db.query.curricula.findFirst({ where: and(eq(curricula.courseId, cls.courseId), eq(curricula.isActive, true)) }))?.id : null) ?? null;
  if (!curriculumId) return [];
  return ctx.db.select({ id: lessons.id, sequenceNo: lessons.sequenceNo, title: lessons.title }).from(lessons).where(eq(lessons.curriculumId, curriculumId)).orderBy(asc(lessons.sequenceNo));
}

/** GV xác nhận bài đã dạy (có thể đổi sang bài khác của giáo trình, hoặc ghi chủ đề khi lớp chưa có giáo trình) */
export async function confirmLesson(ctx: ProtectedContext, input: { sessionId: string; lessonId?: string | null; topic?: string | null }) {
  const s = await loadSessionForAuth(ctx, input.sessionId);
  requirePermission(ctx, "session:update", { centerId: s.centerId, ownerIds: s.ownerIds });
  if (["cancelled", "rescheduled", "completed"].includes(s.session.status)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Buổi đã hoàn tất / huỷ — không xác nhận lại bài" });
  if (s.session.date > todayISO()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Buổi học chưa diễn ra" });
  let lessonId = s.session.lessonId;
  let topic = input.topic?.trim() || s.session.topic;
  if (input.lessonId && input.lessonId !== s.session.lessonId) {
    const opts = await lessonOptions(ctx, input.sessionId);
    const l = opts.find((o) => o.id === input.lessonId);
    if (!l) throw new TRPCError({ code: "BAD_REQUEST", message: "Bài học không thuộc giáo trình của lớp" });
    lessonId = l.id;
    topic = input.topic?.trim() || l.title;
  }
  if (!lessonId && !topic) throw new TRPCError({ code: "BAD_REQUEST", message: "Chọn bài học hoặc ghi chủ đề đã dạy" });
  await ctx.db.transaction(async (tx) => {
    await tx.update(sessions).set({ lessonId, topic, lessonConfirmedAt: new Date(), lessonConfirmedBy: ctx.user.id }).where(eq(sessions.id, input.sessionId));
    await writeAudit(tx as unknown as typeof ctx.db, {
      actorId: ctx.user.id, action: "UPDATE", module: "academics", entity: "sessions", entityId: input.sessionId,
      before: { lessonId: s.session.lessonId, topic: s.session.topic, lessonConfirmedAt: s.session.lessonConfirmedAt }, after: { lessonId, topic, lessonConfirmed: true }, ip: ctx.ip,
    });
  });
  return getSessionDetail(ctx, input.sessionId);
}

/**
 * Ghi điểm danh cho nhiều HV trong một lần (upsert) rồi thử chuyển trạng thái buổi.
 * Idempotent: gọi lại với cùng dữ liệu không tạo bản ghi trùng.
 */
export async function recordAttendance(
  ctx: ProtectedContext,
  input: { sessionId: string; records: { enrollmentId: string; status: AttendanceStatus; studentRemark?: string | null; makeupForSessionId?: string | null; rating?: number | null; needsMakeup?: boolean | null; absenceReason?: string | null }[] },
) {
  const s = await loadSessionForAuth(ctx, input.sessionId);
  requirePermission(ctx, "attendance:write", { centerId: s.centerId, ownerIds: s.ownerIds });
  if (s.session.date > todayISO()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Buổi học chưa diễn ra" });
  if (["cancelled", "rescheduled"].includes(s.session.status)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Buổi học đã huỷ/dời" });

  await ctx.db.transaction(async (tx) => {
    for (const r of input.records) {
      // Chỉ Vắng / Phép mới giữ quyết định học bù + lý do PH xin vắng
      const absent = r.status === "absent_excused" || r.status === "absent_unexcused";
      const needsMakeup = absent ? r.needsMakeup ?? null : null;
      const absenceReason = absent ? r.absenceReason?.trim() || null : null;
      await tx
        .insert(attendance)
        .values({
          sessionId: input.sessionId,
          enrollmentId: r.enrollmentId,
          status: r.status,
          studentRemark: r.studentRemark ?? null,
          rating: r.rating ?? null,
          needsMakeup,
          absenceReason,
          makeupForSessionId: r.makeupForSessionId ?? null,
          recordedBy: ctx.user.id,
          recordedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [attendance.sessionId, attendance.enrollmentId],
          // Nhận xét không gửi kèm (undefined) = giữ nguyên: ô nhận xét do phiếu nhận xét buổi quản lý
          set: { status: r.status, ...(r.studentRemark !== undefined ? { studentRemark: r.studentRemark } : {}), rating: r.rating ?? null, needsMakeup, absenceReason, makeupForSessionId: r.makeupForSessionId ?? null, recordedBy: ctx.user.id, recordedAt: new Date() },
        });
    }
    await writeAudit(tx as unknown as typeof ctx.db, {
      actorId: ctx.user.id, action: "UPDATE", module: "academics", entity: "attendance", entityId: input.sessionId,
      after: { count: input.records.length }, ip: ctx.ip,
    });
    // Nhận xét nhanh ở màn điểm danh = ô nhận xét của phiếu nhận xét buổi (nháp) — không nhập hai lần
    await syncRemarksFromAttendance(tx as unknown as typeof ctx.db, input.sessionId, input.records);

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
    const risk = riskFrom(await getOps(ctx.db, s.centerId));
    for (const r of input.records) {
      const e = byEnrollment.get(r.enrollmentId);
      if (!e) continue;
      await emit(tx as unknown as typeof ctx.db, { type: "attendance.recorded", sessionId: input.sessionId, enrollmentId: r.enrollmentId, studentId: e.studentId, status: r.status, sequenceNo: s.session.sequenceNo });
      for (const rk of detectRisks(e.recs, risk)) {
        const risk2 = rk;
        await emit(tx as unknown as typeof ctx.db, { type: "risk.detected", studentId: e.studentId, enrollmentId: r.enrollmentId, code: risk2.code, severity: risk2.severity, detail: risk2.detail });
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

/** Lưu checklist chuẩn bị / sau buổi và ghi chú nội bộ */
export async function saveSessionChecklist(ctx: ProtectedContext, input: { sessionId: string; checklist: ChecklistState; privateNote?: string | null }) {
  const s = await loadSessionForAuth(ctx, input.sessionId);
  requirePermission(ctx, "session:update", { centerId: s.centerId, ownerIds: s.ownerIds });
  if (["cancelled", "rescheduled"].includes(s.session.status)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Buổi học đã huỷ/dời" });
  const pick = (items: { key: string }[], v?: Record<string, boolean>) => Object.fromEntries(items.map((i) => [i.key, !!v?.[i.key]]));
  const checklist: ChecklistState = { pre: pick(SESSION_CHECKLIST.pre, input.checklist.pre), post: pick(SESSION_CHECKLIST.post, input.checklist.post) };
  await ctx.db.update(sessions).set({ checklist, ...(input.privateNote !== undefined ? { privateNote: input.privateNote } : {}) }).where(eq(sessions.id, input.sessionId));
  return getSessionDetail(ctx, input.sessionId);
}

/** Sự kiện đổi trạng thái thường; huỷ / điều chỉnh buổi đi qua luồng riêng (lý do, dời bù, thông báo) */
export type RoutineSessionEvent = Exclude<SessionEvent, "cancel" | "reschedule">;

/** Chuyển trạng thái theo state machine — mọi guard ở @satarobo/core */
export async function transitionSession(ctx: ProtectedContext, input: { sessionId: string; event: RoutineSessionEvent; reason?: string }) {
  if ((input.event as SessionEvent) === "cancel" || (input.event as SessionEvent) === "reschedule") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Dùng chức năng Huỷ buổi / Điều chỉnh buổi" });
  }
  const s = await loadSessionForAuth(ctx, input.sessionId);
  requirePermission(ctx, "session:update", { centerId: s.centerId, ownerIds: s.ownerIds });
  const detail = await getSessionDetail(ctx, input.sessionId);

  const to: SessionStatus = transition(detail.status, input.event, {
    enrolledCount: detail.enrolledCount,
    attendanceCount: detail.attendanceCount,
    hasSessionNote: !!detail.sessionNote?.trim(),
    completionBlockers: input.event === "complete" ? detail.completionBlockers : undefined,
    today: detail.today,
    sessionDate: detail.date,
  });

  await ctx.db.transaction(async (tx) => {
    await tx
      .update(sessions)
      .set({ status: to, ...(to === "completed" ? { completedAt: new Date(), completedBy: ctx.user.id } : {}), ...(input.event === "start" ? { startedAt: new Date() } : {}) })
      .where(eq(sessions.id, input.sessionId));
    await writeAudit(tx as unknown as typeof ctx.db, {
      actorId: ctx.user.id, action: "TRANSITION", module: "academics", entity: "sessions", entityId: input.sessionId,
      before: { status: detail.status }, after: { status: to, event: input.event }, reason: input.reason ?? null, ip: ctx.ip,
    });
    if (to === "completed") {
      // Phát hành mọi phiếu nhận xét nháp đủ điều kiện của buổi — cùng transaction, có nhật ký
      await publishSessionEvaluations(tx as unknown as typeof ctx.db, { sessionId: input.sessionId, actorId: ctx.user.id, ip: ctx.ip });
      await emit(tx as unknown as typeof ctx.db, { type: "session.completed", sessionId: input.sessionId, classId: detail.classId, date: detail.date, teacherId: detail.teacherId });
      if (detail.lesson?.isReportCardMilestone) {
        for (const r of detail.roster) await emit(tx as unknown as typeof ctx.db, { type: "report_card.due", enrollmentId: r.enrollmentId, sessionId: input.sessionId, sequenceNo: detail.sequenceNo });
      }
    }
  });
  return getSessionDetail(ctx, input.sessionId);
}

export interface SessionListInput {
  from: string;
  to: string;
  teacherId?: string;
  centerId?: string;
  onlyOpen?: boolean;
  /** Lọc đúng vài trạng thái (hẹp hơn `onlyOpen`) — để hộp việc không phải lọc lại trong JS */
  statuses?: SessionStatus[];
  classId?: string;
  roomId?: string;
  /** Trần cứng số dòng trả về (mặc định 1000, tối đa 2000) */
  limit?: number;
}

/** Trần cứng cho danh sách buổi học — trước đây KHÔNG có `limit` nào */
const SESSION_LIST_DEFAULT = 1000;
const SESSION_LIST_MAX = 2000;

/** Điều kiện lọc dùng chung cho danh sách buổi và cho phép đếm — một nguồn sự thật */
function sessionListConds(ctx: ProtectedContext, input: SessionListInput) {
  const conds = [gte(sessions.date, input.from), lte(sessions.date, input.to)];
  if (input.roomId) conds.push(eq(sessions.roomId, input.roomId));
  if (input.teacherId) conds.push(eq(sessions.teacherId, input.teacherId));
  if (input.classId) conds.push(eq(sessions.classId, input.classId));
  if (input.centerId) conds.push(eq(classes.centerId, input.centerId));
  if (input.onlyOpen) conds.push(inArray(sessions.status, [...OPEN_STATUSES]));
  if (input.statuses?.length) conds.push(inArray(sessions.status, input.statuses));

  // Giới hạn theo cơ sở được thấy và theo trung tâm (tenant)
  const visible = visibleCenterIds(ctx.actor);
  if (visible !== null) conds.push(visible.length ? inArray(classes.centerId, visible) : sql`false`);
  conds.push(tenantCond(ctx, sessions));
  return conds;
}

/**
 * Đếm buổi học khớp bộ lọc bằng `count(*)` — KHÔNG tải dòng về rồi lấy `.length`.
 * Truy vấn nhẹ hơn hẳn danh sách vì bỏ hết join phụ (phòng, giáo viên) và hai truy vấn con đếm sĩ số.
 */
export async function countSessions(ctx: ProtectedContext, input: SessionListInput): Promise<number> {
  const [r] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(sessions)
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .where(and(...sessionListConds(ctx, input)));
  return r?.n ?? 0;
}

/** Danh sách buổi trong một khoảng ngày, theo GV hoặc cơ sở (dùng cho Teacher "Hôm nay" và Ops "Buổi học") */
export async function listSessions(ctx: ProtectedContext, input: SessionListInput) {
  const rows = await ctx.db
    .select({
      id: sessions.id, classId: sessions.classId, classCode: classes.code, className: classes.name, centerId: classes.centerId, centerCode: centers.code,
      sequenceNo: sessions.sequenceNo, kind: sessions.kind, date: sessions.date, startTime: sessions.startTime, endTime: sessions.endTime, status: sessions.status, topic: sessions.topic,
      roomId: sessions.roomId, roomCode: rooms.code, teacherId: sessions.teacherId, teacherName: teachers.fullName, courseId: classes.courseId, capacity: classes.capacity,
      originalSequenceNo: sessions.originalSequenceNo, cancelReason: sessions.cancelReason, rescheduledFromDate: sessions.rescheduledFromDate,
      enrolled: sql<number>`(select count(*)::int from ${enrollments} e where e.class_id = ${sessions.classId} and e.status in ('active','trial') and e.start_sequence_no <= ${sessions.sequenceNo})`,
      attended: sql<number>`(select count(*)::int from ${attendance} a where a.session_id = ${sessions.id})`,
    })
    .from(sessions)
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .innerJoin(centers, eq(centers.id, classes.centerId))
    .leftJoin(rooms, eq(rooms.id, sessions.roomId))
    .leftJoin(teachers, eq(teachers.id, sessions.teacherId))
    .where(and(...sessionListConds(ctx, input)))
    .orderBy(asc(sessions.date), asc(sessions.startTime))
    .limit(clampPageSize(input.limit, SESSION_LIST_DEFAULT, SESSION_LIST_MAX));

  const today = todayISO();
  return rows.map((r) => ({ ...r, label: sessionLabel(r.sequenceNo, r.kind, r.originalSequenceNo), nextStep: nextStep(r.status), isOverdue: isOverdue(r.status, r.date, today) }));
}

/**
 * Hàng đợi "buổi chưa hoàn tất đã qua ngày" theo cơ sở — thay cho card trên dashboard cũ.
 *
 * Trước: gọi `listSessions` với `from: "2000-01-01"` và KHÔNG có `limit` — tải về MỌI buổi
 *        chưa hoàn tất từ trước tới nay (kèm 2 truy vấn con đếm sĩ số cho từng dòng), rồi lọc
 *        `date < today` và đếm bằng `.length` trong JavaScript. Ở quy mô một chuỗi, đây là
 *        truy vấn nặng nhất của trang chủ.
 * Sau:  `to = hôm qua` đẩy phép lọc xuống SQL (đúng định nghĩa `isOverdue`), `total` lấy bằng
 *        `count(*)`, và chỉ tải đúng số dòng cần hiển thị.
 * Truy vấn: 1 (tải N dòng) → 2 (1 count + 1 tải ≤ limit dòng).
 */
export async function overdueQueue(ctx: ProtectedContext, input: { centerId?: string; limit?: number }) {
  const today = todayISO();
  const limit = clampPageSize(input.limit, 50, 200);
  const filter: SessionListInput = { from: "2000-01-01", to: addDays(today, -1), centerId: input.centerId, onlyOpen: true };
  const [total, items] = await Promise.all([
    countSessions(ctx, filter),
    listSessions(ctx, { ...filter, limit }),
  ]);
  return { total, items };
}

