import { and, eq, inArray, sql, asc, desc, gte, lte, isNull, ilike, or, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  trialBookings, leads, leadChildren, leadActivities, sessions, classes, courses, centers, rooms, teachers, users, userNotifications, enrollments,
  trialClasses, trialClassSessions, trialClassEnrollments, trialAttendance,
} from "@satarobo/db";
import {
  validateTrialBooking, trialTransition, canRecordTrialResult, leadEventForTrial, leadTransition, requireReason, seatsLeft, visibleCenterIds, addDays,
  TRIAL_SEAT_STATUSES, TRIAL_COUNTED_STATUSES, OPEN_LEAD_STATUSES, authorize, hasPermission,
  canAddTrialSession, canEnrollTrial, validateTrialSessionChange, trialSeatsLeft, trialClassCode, trialClassName, nextTrialClassSeq,
  TRIAL_CLASS_DEFAULT_CAPACITY, TRIAL_CLASS_MAX_SESSIONS,
  type TrialStatus, type LeadStatus, type LeadEvent, type TrialClassStatus, type TrialAttendanceStatus,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { emit } from "./outbox";
import { todayISO } from "./sessions";
import { resolveAdmissionsPolicy } from "./admissionsAdmin";

type Db = ProtectedContext["db"];

/** Giờ hiện tại theo múi vận hành, dạng YYYY-MM-DDTHH:MM */
function nowLocal() {
  return new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16);
}

function badRequest(errs: string[]) {
  return new TRPCError({ code: "PRECONDITION_FAILED", message: errs.join("; ") });
}

function reasonOrThrow(reason: string | null | undefined) {
  try {
    return requireReason(reason);
  } catch (e) {
    throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
  }
}

const seatSql = (sessionIdCol: unknown) =>
  sql<number>`(select count(*)::int from ${trialBookings} tb where tb.session_id = ${sessionIdCol} and tb.status in ('booked','attended','no_show'))`;

async function loadSession(db: Db, sessionId: string) {
  const [r] = await db
    .select({
      id: sessions.id, date: sessions.date, startTime: sessions.startTime, endTime: sessions.endTime, status: sessions.status, sequenceNo: sessions.sequenceNo,
      classId: classes.id, classCode: classes.code, centerId: classes.centerId, capacity: classes.capacity, courseId: classes.courseId,
      teacherId: sessions.teacherId, leadTeacherId: classes.leadTeacherId, assistantTeacherId: classes.assistantTeacherId,
      enrolled: sql<number>`(select count(*)::int from ${enrollments} e where e.class_id = ${sessions.classId} and e.status in ('active','trial') and e.start_sequence_no <= ${sessions.sequenceNo})`,
    })
    .from(sessions).innerJoin(classes, eq(classes.id, sessions.classId))
    .where(eq(sessions.id, sessionId)).limit(1);
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy buổi học" });
  return r;
}

/** Tài khoản đăng nhập của GV đứng buổi (để báo tin) */
async function teacherUserIds(db: Db, ids: (string | null)[]) {
  const list = ids.filter((x): x is string => !!x);
  if (!list.length) return [];
  const rows = await db.select({ userId: teachers.userId }).from(teachers).where(inArray(teachers.id, list));
  return [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))];
}

async function notifyTeachers(db: Db, s: { teacherId: string | null; leadTeacherId: string | null; date: string; startTime: string; classCode: string; id: string }, title: string, body: string) {
  const uids = await teacherUserIds(db, [s.teacherId ?? s.leadTeacherId]);
  if (!uids.length) return;
  await db.insert(userNotifications).values(uids.map((userId) => ({ userId, title, body: `${body} — ${s.classCode}, ${s.date.split("-").reverse().join("/")} ${s.startTime.slice(0, 5)}`, link: `/teacher/sessions/${s.id}`, priority: 2 })));
}

async function loadLeadForWrite(ctx: ProtectedContext, leadId: string) {
  const lead = await ctx.db.query.leads.findFirst({ where: and(eq(leads.id, leadId), isNull(leads.deletedAt)) });
  if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy lead" });
  requirePermission(ctx, "lead:update", { centerId: lead.centerId, ownerIds: [lead.assignedToId ?? ""].filter(Boolean) });
  return lead;
}

/** Số lượt học thử đã dùng của lead (đổi lịch / huỷ không tính) */
export async function countLeadTrials(db: Db, leadId: string, excludeId?: string) {
  const conds = [eq(trialBookings.leadId, leadId), inArray(trialBookings.status, [...TRIAL_COUNTED_STATUSES])];
  if (excludeId) conds.push(ne(trialBookings.id, excludeId));
  const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(trialBookings).where(and(...conds));
  return c?.n ?? 0;
}

async function checkBookable(db: Db, input: { lead: typeof leads.$inferSelect; sessionId: string; excludeBookingId?: string }) {
  const s = await loadSession(db, input.sessionId);
  // khoá theo buổi để 2 người không cùng lấy chỗ cuối
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${"trial:" + input.sessionId}))`);
  const [inSession] = await db.select({ n: sql<number>`count(*)::int` }).from(trialBookings)
    .where(and(eq(trialBookings.sessionId, input.sessionId), inArray(trialBookings.status, [...TRIAL_SEAT_STATUSES])));
  const [dup] = await db.select({ n: sql<number>`count(*)::int` }).from(trialBookings)
    .where(and(eq(trialBookings.sessionId, input.sessionId), eq(trialBookings.leadId, input.lead.id), inArray(trialBookings.status, [...TRIAL_SEAT_STATUSES])));
  const policy = await resolveAdmissionsPolicy(db, input.lead.centerId);
  const used = await countLeadTrials(db, input.lead.id, input.excludeBookingId);
  const errs = validateTrialBooking({
    capacity: s.capacity, enrolled: s.enrolled, trialsInSession: inSession?.n ?? 0, trialsUsedByLead: used, maxTrialsPerLead: policy.maxTrialsPerLead,
    sessionStatus: s.status, sessionDate: s.date, sessionStart: s.startTime, nowLocal: nowLocal(), leadStatus: input.lead.status, alreadyBookedInSession: (dup?.n ?? 0) > 0,
  });
  if (errs.length) throw badRequest(errs);
  return s;
}

function sessionStartDate(s: { date: string; startTime: string }) {
  return new Date(`${s.date}T${s.startTime.slice(0, 8).padEnd(8, ":00")}+07:00`);
}

/* ------------------------------------------------------------------ */
/* Truy vấn                                                            */
/* ------------------------------------------------------------------ */

/** Quyền đọc: đủ (theo cơ sở) hoặc chỉ lead của mình (tư vấn Hội sở) → trả về onlyMine */
function readScope(ctx: ProtectedContext, centerId?: string) {
  if (authorize(ctx.actor, "lead:read", { centerId: centerId ?? null }).allowed) return { onlyMine: false };
  if (hasPermission(ctx.actor, "lead:read_own")) return { onlyMine: true };
  requirePermission(ctx, "lead:read", { centerId: centerId ?? null });
  return { onlyMine: false };
}

/** Buổi còn nhận học thử trong N ngày tới */
export async function trialSlots(ctx: ProtectedContext, input: { centerId?: string; courseId?: string; days?: number; leadId?: string }) {
  readScope(ctx, input.centerId);
  const today = todayISO();
  const to = addDays(today, Math.min(60, input.days ?? 21));
  const conds = [gte(sessions.date, today), lte(sessions.date, to), eq(sessions.status, "scheduled"), isNull(classes.deletedAt), inArray(classes.status, ["recruiting", "running"])];
  if (input.centerId) conds.push(eq(classes.centerId, input.centerId));
  if (input.courseId) conds.push(eq(classes.courseId, input.courseId));
  const visible = visibleCenterIds(ctx.actor);
  if (visible !== null) conds.push(visible.length ? inArray(classes.centerId, visible) : sql`false`);
  const rows = await ctx.db
    .select({
      sessionId: sessions.id, date: sessions.date, startTime: sessions.startTime, endTime: sessions.endTime, sequenceNo: sessions.sequenceNo,
      classId: classes.id, classCode: classes.code, className: classes.name, capacity: classes.capacity, centerId: classes.centerId, centerCode: centers.code,
      courseId: courses.id, courseCode: courses.code, roomCode: rooms.code, teacherName: teachers.fullName,
      enrolled: sql<number>`(select count(*)::int from ${enrollments} e where e.class_id = ${sessions.classId} and e.status in ('active','trial') and e.start_sequence_no <= ${sessions.sequenceNo})`,
      trials: seatSql(sessions.id),
    })
    .from(sessions)
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .innerJoin(centers, eq(centers.id, classes.centerId))
    .innerJoin(courses, eq(courses.id, classes.courseId))
    .leftJoin(rooms, eq(rooms.id, sessions.roomId))
    .leftJoin(teachers, eq(teachers.id, sessions.teacherId))
    .where(and(...conds))
    .orderBy(asc(sessions.date), asc(sessions.startTime))
    .limit(300);
  const now = nowLocal();
  const booked = input.leadId
    ? new Set((await ctx.db.select({ s: trialBookings.sessionId }).from(trialBookings).where(and(eq(trialBookings.leadId, input.leadId), inArray(trialBookings.status, [...TRIAL_SEAT_STATUSES])))).map((r) => r.s))
    : new Set<string>();
  return rows
    .filter((r) => `${r.date}T${r.startTime.slice(0, 5)}` > now)
    .map((r) => ({ ...r, seatsLeft: seatsLeft({ capacity: r.capacity, enrolled: r.enrolled, trialsInSession: r.trials }), alreadyBooked: booked.has(r.sessionId) }));
}

export interface TrialListInput { from?: string; to?: string; centerId?: string; status?: TrialStatus; q?: string; mine?: boolean }

export async function listTrials(ctx: ProtectedContext, input: TrialListInput) {
  const { onlyMine } = readScope(ctx, input.centerId);
  const today = todayISO();
  const from = input.from ?? addDays(today, -14);
  const to = input.to ?? addDays(today, 30);
  const conds = [gte(sessions.date, from), lte(sessions.date, to)];
  if (input.centerId) conds.push(eq(classes.centerId, input.centerId));
  if (input.status) conds.push(eq(trialBookings.status, input.status));
  if (input.mine || onlyMine) conds.push(eq(leads.assignedToId, ctx.user.id));
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`;
    conds.push(or(ilike(leads.parentName, q), ilike(trialBookings.childName, q), ilike(leads.phoneNormalized, `%${input.q.replace(/\D/g, "").replace(/^0/, "") || "~"}%`), ilike(classes.code, q))!);
  }
  const visible = visibleCenterIds(ctx.actor);
  if (visible !== null) conds.push(visible.length ? inArray(classes.centerId, visible) : sql`false`);
  const booker = sql`(select full_name from ${users} u where u.id = ${trialBookings.bookedBy})`;
  const rows = await ctx.db
    .select({
      id: trialBookings.id, status: trialBookings.status, childName: trialBookings.childName, note: trialBookings.note, reason: trialBookings.reason, resultNote: trialBookings.resultNote,
      rescheduledFromId: trialBookings.rescheduledFromId, createdAt: trialBookings.createdAt, resultAt: trialBookings.resultAt,
      leadId: leads.id, parentName: leads.parentName, leadStatus: leads.status, assignedToId: leads.assignedToId,
      sessionId: sessions.id, date: sessions.date, startTime: sessions.startTime, endTime: sessions.endTime, sessionStatus: sessions.status, sequenceNo: sessions.sequenceNo,
      classId: classes.id, classCode: classes.code, centerCode: centers.code, courseCode: courses.code, teacherName: teachers.fullName, roomCode: rooms.code,
      bookedByName: sql<string | null>`${booker}`,
      assigneeName: sql<string | null>`(select full_name from ${users} u2 where u2.id = ${leads.assignedToId})`,
    })
    .from(trialBookings)
    .innerJoin(leads, eq(leads.id, trialBookings.leadId))
    .innerJoin(sessions, eq(sessions.id, trialBookings.sessionId))
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .innerJoin(centers, eq(centers.id, classes.centerId))
    .innerJoin(courses, eq(courses.id, classes.courseId))
    .leftJoin(teachers, eq(teachers.id, sessions.teacherId))
    .leftJoin(rooms, eq(rooms.id, sessions.roomId))
    .where(and(...conds))
    .orderBy(asc(sessions.date), asc(sessions.startTime))
    .limit(500);
  const items = rows.map((r) => ({
    ...r,
    canRecord: r.status === "booked" && canRecordTrialResult(r.date, today),
    needsResult: r.status === "booked" && r.date < today,
  }));
  const count = (s: TrialStatus) => items.filter((i) => i.status === s).length;
  return {
    from, to, today,
    items,
    stats: {
      upcoming: items.filter((i) => i.status === "booked" && i.date >= today).length,
      needsResult: items.filter((i) => i.needsResult).length,
      attended: count("attended"), noShow: count("no_show"), cancelled: count("cancelled"), rescheduled: count("rescheduled"),
    },
  };
}

/** Lead còn mở để chọn khi xếp học thử */
export async function trialLeadOptions(ctx: ProtectedContext, input: { q?: string; centerId?: string; id?: string }) {
  const { onlyMine } = readScope(ctx, input.centerId);
  const conds = [isNull(leads.deletedAt), inArray(leads.status, [...OPEN_LEAD_STATUSES])];
  if (onlyMine) conds.push(eq(leads.assignedToId, ctx.user.id));
  if (input.centerId) conds.push(eq(leads.centerId, input.centerId));
  if (input.id) conds.push(eq(leads.id, input.id));
  const visible = visibleCenterIds(ctx.actor);
  if (visible !== null) conds.push(visible.length ? inArray(leads.centerId, visible) : sql`false`);
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`;
    const digits = input.q.replace(/\D/g, "").replace(/^0/, "");
    conds.push(or(ilike(leads.parentName, q), ilike(leads.childName, q), ...(digits.length >= 3 ? [ilike(leads.phoneNormalized, `%${digits}%`)] : []))!);
  }
  const rows = await ctx.db
    .select({ id: leads.id, parentName: leads.parentName, childName: leads.childName, status: leads.status, centerId: leads.centerId, interestedCourseId: leads.interestedCourseId, assignedToId: leads.assignedToId,
      trialsUsed: sql<number>`(select count(*)::int from ${trialBookings} tb where tb.lead_id = ${sql.raw('"leads"."id"')} and tb.status in ('booked','attended','no_show'))` })
    .from(leads).where(and(...conds)).orderBy(desc(leads.lastTouchAt)).limit(30);
  const ids = rows.map((r) => r.id);
  const kids = ids.length ? await ctx.db.select({ id: leadChildren.id, leadId: leadChildren.leadId, fullName: leadChildren.fullName, interestedCourseId: leadChildren.interestedCourseId }).from(leadChildren).where(inArray(leadChildren.leadId, ids)) : [];
  // Chỉ trả lead mà actor được sửa (sale chỉ thấy lead của mình nếu chỉ có quyền _own)
  return rows
    .filter((r) => authorize(ctx.actor, "lead:update", { centerId: r.centerId, ownerIds: [r.assignedToId ?? ""].filter(Boolean) }).allowed)
    .map((r) => ({ ...r, children: kids.filter((k) => k.leadId === r.id) }));
}

/* ------------------------------------------------------------------ */
/* Ghi                                                                 */
/* ------------------------------------------------------------------ */

async function applyLeadEvent(tx: Db, ctx: ProtectedContext, lead: { id: string; status: LeadStatus }, event: LeadEvent, content: string, meta: Record<string, unknown>, activityType: "trial_booked" | "status_change" | "note" = "status_change") {
  let to: LeadStatus = lead.status;
  try {
    to = leadTransition(lead.status, event);
  } catch {
    to = lead.status; // không đổi trạng thái (vd đang học thử nhiều buổi)
  }
  await tx.update(leads).set({ status: to, lastTouchAt: new Date() }).where(eq(leads.id, lead.id));
  await tx.insert(leadActivities).values({ leadId: lead.id, type: activityType, actorId: ctx.user.id, content, meta: { ...meta, from: lead.status, to, event } });
  if (to !== lead.status) {
    await emit(tx, { type: "lead.status_changed", leadId: lead.id, from: lead.status, to, actorId: ctx.user.id });
  }
  return to;
}

export async function bookTrial(ctx: ProtectedContext, input: { leadId: string; childId?: string | null; sessionId: string; note?: string | null }) {
  const lead = await loadLeadForWrite(ctx, input.leadId);
  const child = input.childId ? await ctx.db.query.leadChildren.findFirst({ where: and(eq(leadChildren.id, input.childId), eq(leadChildren.leadId, lead.id)) }) : null;
  if (input.childId && !child) throw new TRPCError({ code: "BAD_REQUEST", message: "Bé không thuộc lead này" });
  const id = await ctx.db.transaction(async (tx) => {
    const s = await checkBookable(tx as unknown as Db, { lead, sessionId: input.sessionId });
    requirePermission(ctx, "lead:update", { centerId: s.centerId, ownerIds: lead.centerId === s.centerId ? [lead.assignedToId ?? ""].filter(Boolean) : [] });
    const childName = child?.fullName ?? lead.childName ?? null;
    const [b] = await tx.insert(trialBookings).values({
      leadId: lead.id, childId: child?.id ?? null, sessionId: s.id, centerId: s.centerId, status: "booked", childName, note: input.note ?? null, bookedBy: ctx.user.id,
    }).returning({ id: trialBookings.id });
    const event: LeadEvent = lead.status === "trial_in_progress" ? "start_trial" : "schedule_trial";
    await applyLeadEvent(tx as unknown as Db, ctx, lead, event, `Xếp học thử ${s.classCode} buổi ${s.sequenceNo} (${s.date.split("-").reverse().join("/")} ${s.startTime.slice(0, 5)})`, { trialBookingId: b!.id, sessionId: s.id, trialAt: sessionStartDate(s).toISOString() }, "trial_booked");
    await tx.update(leads).set({ nextActionAt: sessionStartDate(s) }).where(eq(leads.id, lead.id));
    await notifyTeachers(tx as unknown as Db, s, "Có học viên học thử", `${childName ?? "Học viên"} học thử`);
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "admissions", entity: "trial_bookings", entityId: b!.id, after: { leadId: lead.id, sessionId: s.id, childName }, ip: ctx.ip });
    return b!.id;
  });
  return { id };
}

async function loadBooking(ctx: ProtectedContext, bookingId: string) {
  const b = await ctx.db.query.trialBookings.findFirst({ where: eq(trialBookings.id, bookingId) });
  if (!b) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy lượt học thử" });
  const lead = await ctx.db.query.leads.findFirst({ where: eq(leads.id, b.leadId) });
  if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy lead" });
  const s = await loadSession(ctx.db, b.sessionId);
  return { b, lead, s };
}

export async function rescheduleTrial(ctx: ProtectedContext, input: { bookingId: string; newSessionId: string; reason: string }) {
  const reason = reasonOrThrow(input.reason);
  const { b, lead, s: oldS } = await loadBooking(ctx, input.bookingId);
  requirePermission(ctx, "lead:update", { centerId: lead.centerId, ownerIds: [lead.assignedToId ?? ""].filter(Boolean) });
  trialTransition(b.status, "reschedule");
  if (input.newSessionId === b.sessionId) throw new TRPCError({ code: "BAD_REQUEST", message: "Chọn buổi khác buổi hiện tại" });
  const newId = await ctx.db.transaction(async (tx) => {
    const s = await checkBookable(tx as unknown as Db, { lead, sessionId: input.newSessionId, excludeBookingId: b.id });
    const upd = await tx.update(trialBookings).set({ status: "rescheduled", reason }).where(and(eq(trialBookings.id, b.id), eq(trialBookings.status, "booked"))).returning({ id: trialBookings.id });
    if (!upd.length) throw new TRPCError({ code: "CONFLICT", message: "Lượt học thử vừa được cập nhật bởi người khác" });
    const [nb] = await tx.insert(trialBookings).values({
      leadId: lead.id, childId: b.childId, sessionId: s.id, centerId: s.centerId, status: "booked", childName: b.childName, note: b.note, rescheduledFromId: b.id, reason, bookedBy: ctx.user.id,
    }).returning({ id: trialBookings.id });
    await tx.insert(leadActivities).values({ leadId: lead.id, type: "trial_booked", actorId: ctx.user.id, content: `Đổi lịch học thử sang ${s.classCode} ${s.date.split("-").reverse().join("/")} ${s.startTime.slice(0, 5)} — ${reason}`, meta: { event: "reschedule_trial", from: lead.status, to: lead.status, oldSessionId: oldS.id, sessionId: s.id, trialBookingId: nb!.id } });
    await tx.update(leads).set({ nextActionAt: sessionStartDate(s), lastTouchAt: new Date() }).where(eq(leads.id, lead.id));
    await notifyTeachers(tx as unknown as Db, oldS, "Học thử đã đổi lịch", `${b.childName ?? "Học viên"} không còn học thử buổi này (${reason})`);
    await notifyTeachers(tx as unknown as Db, s, "Có học viên học thử", `${b.childName ?? "Học viên"} học thử (đổi lịch)`);
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "admissions", entity: "trial_bookings", entityId: b.id, before: { sessionId: oldS.id, status: "booked" }, after: { sessionId: s.id, newBookingId: nb!.id, status: "rescheduled" }, reason, ip: ctx.ip });
    return nb!.id;
  });
  return { id: newId };
}

export async function cancelTrial(ctx: ProtectedContext, input: { bookingId: string; reason: string }) {
  const reason = reasonOrThrow(input.reason);
  const { b, lead, s } = await loadBooking(ctx, input.bookingId);
  requirePermission(ctx, "lead:update", { centerId: lead.centerId, ownerIds: [lead.assignedToId ?? ""].filter(Boolean) });
  trialTransition(b.status, "cancel");
  await ctx.db.transaction(async (tx) => {
    const upd = await tx.update(trialBookings).set({ status: "cancelled", reason }).where(and(eq(trialBookings.id, b.id), eq(trialBookings.status, "booked"))).returning({ id: trialBookings.id });
    if (!upd.length) throw new TRPCError({ code: "CONFLICT", message: "Lượt học thử vừa được cập nhật bởi người khác" });
    await tx.insert(leadActivities).values({ leadId: lead.id, type: "note", actorId: ctx.user.id, content: `Huỷ học thử ${s.classCode} ${s.date.split("-").reverse().join("/")} — ${reason}`, meta: { event: "cancel_trial", trialBookingId: b.id } });
    await tx.update(leads).set({ lastTouchAt: new Date() }).where(eq(leads.id, lead.id));
    await notifyTeachers(tx as unknown as Db, s, "Học thử đã huỷ", `${b.childName ?? "Học viên"} huỷ học thử (${reason})`);
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "admissions", entity: "trial_bookings", entityId: b.id, before: { status: b.status }, after: { status: "cancelled" }, reason, ip: ctx.ip });
  });
  return { ok: true };
}

/** Ghi kết quả buổi thử: Sale/Quản lý cơ sở hoặc GV đứng buổi */
export async function recordTrialResult(ctx: ProtectedContext, input: { bookingId: string; result: "attend" | "no_show"; note?: string | null }) {
  const { b, lead, s } = await loadBooking(ctx, input.bookingId);
  const asStaff = authorize(ctx.actor, "lead:update", { centerId: s.centerId }).allowed || authorize(ctx.actor, "lead:update", { centerId: lead.centerId, ownerIds: [lead.assignedToId ?? ""].filter(Boolean) }).allowed;
  if (!asStaff) requirePermission(ctx, "session:update", { centerId: s.centerId, ownerIds: [s.teacherId, s.leadTeacherId, s.assistantTeacherId].filter((x): x is string => !!x) });
  if (!canRecordTrialResult(s.date, todayISO())) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Buổi học thử chưa diễn ra" });
  const to = trialTransition(b.status, input.result);
  await ctx.db.transaction(async (tx) => {
    const upd = await tx.update(trialBookings).set({ status: to, resultNote: input.note ?? null, resultBy: ctx.user.id, resultAt: new Date() })
      .where(and(eq(trialBookings.id, b.id), eq(trialBookings.status, "booked"))).returning({ id: trialBookings.id });
    if (!upd.length) throw new TRPCError({ code: "CONFLICT", message: "Lượt học thử vừa được cập nhật bởi người khác" });
    const ev = leadEventForTrial(input.result, lead.status);
    const text = `${input.result === "attend" ? "Đã học thử" : "Không đến học thử"} ${s.classCode} ${s.date.split("-").reverse().join("/")}${input.note ? ` — ${input.note}` : ""}`;
    if (ev) {
      // Còn buổi thử khác sắp tới thì chỉ ghi nhận "đang học thử"
      const [other] = await tx.select({ n: sql<number>`count(*)::int` }).from(trialBookings).where(and(eq(trialBookings.leadId, lead.id), eq(trialBookings.status, "booked"), ne(trialBookings.id, b.id)));
      const event: LeadEvent = input.result === "attend" && (other?.n ?? 0) > 0 && lead.status === "trial_scheduled" ? "start_trial" : ev;
      await applyLeadEvent(tx as unknown as Db, ctx, lead, event, text, { trialBookingId: b.id, sessionId: s.id });
    } else {
      await tx.insert(leadActivities).values({ leadId: lead.id, type: "note", actorId: ctx.user.id, content: text, meta: { event: "trial_result", trialBookingId: b.id } });
    }
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "admissions", entity: "trial_bookings", entityId: b.id, before: { status: b.status }, after: { status: to }, reason: input.note ?? null, ip: ctx.ip });
  });
  return { status: to };
}

/** Hoàn tác kết quả (ghi nhầm) — chỉ người có quyền sửa lead ở cơ sở, bắt buộc lý do */
export async function undoTrialResult(ctx: ProtectedContext, input: { bookingId: string; reason: string }) {
  const reason = reasonOrThrow(input.reason);
  const { b, lead, s } = await loadBooking(ctx, input.bookingId);
  requirePermission(ctx, "lead:update", { centerId: s.centerId });
  const to = trialTransition(b.status, "undo");
  await ctx.db.transaction(async (tx) => {
    await tx.update(trialBookings).set({ status: to, resultNote: null, resultBy: null, resultAt: null, reason }).where(eq(trialBookings.id, b.id));
    await tx.insert(leadActivities).values({ leadId: lead.id, type: "note", actorId: ctx.user.id, content: `Hoàn tác kết quả học thử ${s.classCode} — ${reason}`, meta: { event: "undo_trial_result", trialBookingId: b.id } });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "admissions", entity: "trial_bookings", entityId: b.id, before: { status: b.status }, after: { status: to }, reason, ip: ctx.ip });
  });
  return { status: to };
}

/** Khách học thử trong một buổi (hiển thị ở màn buổi học của GV) */
export async function trialGuestsForSession(db: Db, sessionId: string) {
  return db
    .select({ id: trialBookings.id, childName: trialBookings.childName, status: trialBookings.status, note: trialBookings.note, resultNote: trialBookings.resultNote, parentName: leads.parentName })
    .from(trialBookings).innerJoin(leads, eq(leads.id, trialBookings.leadId))
    .where(and(eq(trialBookings.sessionId, sessionId), inArray(trialBookings.status, [...TRIAL_SEAT_STATUSES])))
    .orderBy(asc(trialBookings.createdAt));
}

/* ================================================================== */
/* LỚP TRẢI NGHIỆM NHIỀU BUỔI (bản gốc "Lớp Trial")                    */
/* Tạo lớp → thêm buổi → xếp học viên → điểm danh.                     */
/* Quyền: trials:view / manage / attendance / assign-teacher /         */
/*        override-capacity.                                           */
/* ================================================================== */

const enrolledCountSql = sql<number>`(select count(*)::int from ${trialClassEnrollments} tce where tce.trial_class_id = ${trialClasses.id} and tce.status = 'enrolled')`;
const sessionCountSql = sql<number>`(select count(*)::int from ${trialClassSessions} tcs where tcs.trial_class_id = ${trialClasses.id} and tcs.status <> 'cancelled')`;
const nextSessionSql = sql<string | null>`(select min(tcs.date)::text from ${trialClassSessions} tcs where tcs.trial_class_id = ${trialClasses.id} and tcs.status = 'scheduled' and tcs.date >= current_date)`;

function trialError(message: string) {
  return new TRPCError({ code: "PRECONDITION_FAILED", message });
}

/** Báo giáo viên phụ trách buổi trải nghiệm — lý do đổi lịch / huỷ gửi thẳng cho GV */
async function notifyTrialTeacher(
  db: Db,
  s: { teacherId: string | null; date: string; startTime: string; className: string; trialClassId: string; seq: number },
  title: string,
  body: string,
) {
  const uids = await teacherUserIds(db, [s.teacherId]);
  if (!uids.length) return;
  await db.insert(userNotifications).values(
    uids.map((userId) => ({
      userId,
      title,
      body: `${body} — ${s.className} buổi ${s.seq}, ${s.date.split("-").reverse().join("/")} ${s.startTime.slice(0, 5)}`,
      link: `/lop-trial/${s.trialClassId}`,
      priority: 2,
    })),
  );
}

async function loadTrialClass(db: Db, id: string) {
  const [c] = await db
    .select({
      id: trialClasses.id, code: trialClasses.code, name: trialClasses.name, status: trialClasses.status, capacity: trialClasses.capacity,
      centerId: trialClasses.centerId, courseId: trialClasses.courseId, note: trialClasses.note, createdAt: trialClasses.createdAt,
      cancelledAt: trialClasses.cancelledAt, cancelReason: trialClasses.cancelReason,
      centerCode: centers.code, centerName: centers.name, courseCode: courses.code, courseName: courses.name,
      enrolled: enrolledCountSql, sessionCount: sessionCountSql,
    })
    .from(trialClasses)
    .innerJoin(centers, eq(centers.id, trialClasses.centerId))
    .leftJoin(courses, eq(courses.id, trialClasses.courseId))
    .where(and(eq(trialClasses.id, id), isNull(trialClasses.deletedAt)))
    .limit(1);
  if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy lớp trải nghiệm" });
  return c;
}

async function loadTrialSession(db: Db, sessionId: string) {
  const [s] = await db
    .select({
      id: trialClassSessions.id, trialClassId: trialClassSessions.trialClassId, seq: trialClassSessions.seq,
      date: trialClassSessions.date, startTime: trialClassSessions.startTime, endTime: trialClassSessions.endTime,
      roomId: trialClassSessions.roomId, teacherId: trialClassSessions.teacherId, status: trialClassSessions.status, topic: trialClassSessions.topic,
      centerId: trialClasses.centerId, className: trialClasses.name, classCode: trialClasses.code, classStatus: trialClasses.status,
    })
    .from(trialClassSessions)
    .innerJoin(trialClasses, eq(trialClasses.id, trialClassSessions.trialClassId))
    .where(eq(trialClassSessions.id, sessionId))
    .limit(1);
  if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy buổi trải nghiệm" });
  return s;
}

/** Ngày hôm nay theo giờ vận hành, dạng YYYY-MM-DD */
function todayLocal() {
  return nowLocal().slice(0, 10);
}

export interface TrialClassListInput { scope?: "open" | "all"; centerId?: string; q?: string }

/** Danh sách lớp trải nghiệm — lọc "Đang mở" (mặc định) / "Tất cả" */
export async function listTrialClasses(ctx: ProtectedContext, input: TrialClassListInput) {
  requirePermission(ctx, "trials:view", { centerId: input.centerId ?? null });
  const scope = input.scope ?? "open";
  const conds = [isNull(trialClasses.deletedAt)];
  if (scope === "open") conds.push(eq(trialClasses.status, "open"));
  if (input.centerId) conds.push(eq(trialClasses.centerId, input.centerId));
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`;
    conds.push(or(ilike(trialClasses.name, q), ilike(trialClasses.code, q))!);
  }
  const visible = visibleCenterIds(ctx.actor);
  if (visible !== null) conds.push(visible.length ? inArray(trialClasses.centerId, visible) : sql`false`);
  const rows = await ctx.db
    .select({
      id: trialClasses.id, code: trialClasses.code, name: trialClasses.name, status: trialClasses.status, capacity: trialClasses.capacity,
      centerId: trialClasses.centerId, centerCode: centers.code, courseCode: courses.code, note: trialClasses.note, createdAt: trialClasses.createdAt,
      enrolled: enrolledCountSql, sessionCount: sessionCountSql, nextSessionDate: nextSessionSql,
    })
    .from(trialClasses)
    .innerJoin(centers, eq(centers.id, trialClasses.centerId))
    .leftJoin(courses, eq(courses.id, trialClasses.courseId))
    .where(and(...conds))
    .orderBy(desc(trialClasses.createdAt))
    .limit(300);
  const items = rows.map((r) => ({ ...r, seatsLeft: trialSeatsLeft({ capacity: r.capacity, enrolled: r.enrolled }) }));
  return {
    scope,
    items,
    stats: {
      open: items.filter((i) => i.status === "open").length,
      total: items.length,
      students: items.reduce((s, i) => s + i.enrolled, 0),
      noSession: items.filter((i) => i.sessionCount === 0).length,
    },
    perms: {
      manage: hasPermission(ctx.actor, "trials:manage"),
      overrideCapacity: hasPermission(ctx.actor, "trials:override-capacity"),
    },
  };
}

/**
 * Tạo lớp trải nghiệm: chỉ cần cơ sở + khoá trải nghiệm — tên lớp và mã lớp hệ thống tự đặt.
 * Lớp chưa có buổi thì chưa xếp được học viên (thêm buổi ở trang chi tiết).
 */
export async function createTrialClass(ctx: ProtectedContext, input: { centerId: string; courseId?: string | null; capacity?: number | null; note?: string | null }) {
  requirePermission(ctx, "trials:manage", { centerId: input.centerId });
  const center = await ctx.db.query.centers.findFirst({ where: eq(centers.id, input.centerId) });
  if (!center) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy cơ sở" });
  const course = input.courseId ? await ctx.db.query.courses.findFirst({ where: eq(courses.id, input.courseId) }) : null;
  if (input.courseId && !course) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy khoá trải nghiệm" });
  const year = Number(todayLocal().slice(0, 4));
  const created = await ctx.db.transaction(async (tx) => {
    // Khoá theo cơ sở để 2 người tạo cùng lúc không trùng mã / số thứ tự
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"trial-class:" + input.centerId}))`);
    const codes = await tx.select({ code: trialClasses.code }).from(trialClasses).where(eq(trialClasses.centerId, input.centerId));
    const seq = nextTrialClassSeq(codes.map((c) => c.code), center.code, year);
    const [row] = await tx
      .insert(trialClasses)
      .values({
        code: trialClassCode(center.code, year, seq),
        name: trialClassName({ centerCode: center.code, courseCode: course?.code ?? null, seq }),
        centerId: input.centerId,
        courseId: course?.id ?? null,
        capacity: Math.min(60, Math.max(1, input.capacity ?? TRIAL_CLASS_DEFAULT_CAPACITY)),
        note: input.note?.trim() || null,
        createdBy: ctx.user.id,
      })
      .returning({ id: trialClasses.id, code: trialClasses.code, name: trialClasses.name });
    await writeAudit(tx as unknown as Db, {
      actorId: ctx.user.id, action: "CREATE", module: "admissions", entity: "trial_classes", entityId: row!.id,
      after: { code: row!.code, name: row!.name, centerId: input.centerId, courseId: course?.id ?? null }, ip: ctx.ip,
    });
    return row!;
  });
  return created;
}

/** Huỷ lớp trải nghiệm (UI bấm xác nhận 2 lần) — huỷ luôn các buổi chưa dạy và rút học viên */
export async function cancelTrialClass(ctx: ProtectedContext, input: { id: string; reason: string }) {
  const reason = reasonOrThrow(input.reason);
  const c = await loadTrialClass(ctx.db, input.id);
  requirePermission(ctx, "trials:manage", { centerId: c.centerId });
  if (c.status === "cancelled") throw trialError("Lớp trải nghiệm đã huỷ trước đó");
  await ctx.db.transaction(async (tx) => {
    const upd = await tx.update(trialClasses)
      .set({ status: "cancelled", cancelledAt: new Date(), cancelReason: reason })
      .where(and(eq(trialClasses.id, c.id), ne(trialClasses.status, "cancelled")))
      .returning({ id: trialClasses.id });
    if (!upd.length) throw new TRPCError({ code: "CONFLICT", message: "Lớp trải nghiệm vừa được cập nhật bởi người khác" });
    const sessionsToCancel = await tx
      .select({ id: trialClassSessions.id, seq: trialClassSessions.seq, date: trialClassSessions.date, startTime: trialClassSessions.startTime, teacherId: trialClassSessions.teacherId })
      .from(trialClassSessions)
      .where(and(eq(trialClassSessions.trialClassId, c.id), eq(trialClassSessions.status, "scheduled")));
    if (sessionsToCancel.length) {
      await tx.update(trialClassSessions)
        .set({ status: "cancelled", cancelReason: reason })
        .where(and(eq(trialClassSessions.trialClassId, c.id), eq(trialClassSessions.status, "scheduled")));
      for (const s of sessionsToCancel) {
        await notifyTrialTeacher(
          tx as unknown as Db,
          { teacherId: s.teacherId, date: s.date, startTime: s.startTime, seq: s.seq, className: c.name, trialClassId: c.id },
          "Lớp trải nghiệm đã huỷ",
          `Buổi không còn diễn ra (${reason})`,
        );
      }
    }
    await tx.update(trialClassEnrollments)
      .set({ status: "withdrawn", withdrawReason: `Huỷ lớp: ${reason}` })
      .where(and(eq(trialClassEnrollments.trialClassId, c.id), eq(trialClassEnrollments.status, "enrolled")));
    await writeAudit(tx as unknown as Db, {
      actorId: ctx.user.id, action: "TRANSITION", module: "admissions", entity: "trial_classes", entityId: c.id,
      before: { status: c.status }, after: { status: "cancelled", cancelledSessions: sessionsToCancel.length }, reason, ip: ctx.ip,
    });
  });
  return { ok: true };
}

/** Thêm buổi cho lớp trải nghiệm — ngày / giờ / phòng / giáo viên chọn theo từng buổi */
export async function addTrialSession(
  ctx: ProtectedContext,
  input: { trialClassId: string; date: string; startTime: string; endTime: string; roomId?: string | null; teacherId?: string | null; topic?: string | null },
) {
  const c = await loadTrialClass(ctx.db, input.trialClassId);
  requirePermission(ctx, "trials:manage", { centerId: c.centerId });
  if (input.teacherId) requirePermission(ctx, "trials:assign-teacher", { centerId: c.centerId });
  const rule = canAddTrialSession({ status: c.status as TrialClassStatus, sessionCount: c.sessionCount, maxSessions: TRIAL_CLASS_MAX_SESSIONS });
  if (!rule.ok) throw trialError(rule.reason);
  if (input.date < todayLocal()) throw trialError("Không xếp buổi vào ngày đã qua");
  if (input.endTime <= input.startTime) throw trialError("Giờ kết thúc phải sau giờ bắt đầu");
  const id = await ctx.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"trial-session:" + c.id}))`);
    const [m] = await tx.select({ maxSeq: sql<number>`coalesce(max(${trialClassSessions.seq}), 0)::int` }).from(trialClassSessions).where(eq(trialClassSessions.trialClassId, c.id));
    const seq = (m?.maxSeq ?? 0) + 1;
    const [row] = await tx
      .insert(trialClassSessions)
      .values({
        trialClassId: c.id, seq, date: input.date, startTime: input.startTime, endTime: input.endTime,
        roomId: input.roomId ?? null, teacherId: input.teacherId ?? null, topic: input.topic?.trim() || null, createdBy: ctx.user.id,
      })
      .returning({ id: trialClassSessions.id });
    await notifyTrialTeacher(
      tx as unknown as Db,
      { teacherId: input.teacherId ?? null, date: input.date, startTime: input.startTime, className: c.name, trialClassId: c.id, seq },
      "Có buổi trải nghiệm mới",
      "Bạn được xếp dạy buổi trải nghiệm",
    );
    await writeAudit(tx as unknown as Db, {
      actorId: ctx.user.id, action: "CREATE", module: "admissions", entity: "trial_class_sessions", entityId: row!.id,
      after: { trialClassId: c.id, seq, date: input.date, startTime: input.startTime, endTime: input.endTime, teacherId: input.teacherId ?? null, roomId: input.roomId ?? null }, ip: ctx.ip,
    });
    return row!.id;
  });
  return { id };
}

/** Đổi lịch một buổi trải nghiệm — BẮT BUỘC ghi lý do, lý do gửi thẳng cho giáo viên phụ trách buổi */
export async function rescheduleTrialSession(
  ctx: ProtectedContext,
  input: { sessionId: string; date: string; startTime: string; endTime: string; roomId?: string | null; teacherId?: string | null; topic?: string | null; reason: string },
) {
  const reason = reasonOrThrow(input.reason);
  const s = await loadTrialSession(ctx.db, input.sessionId);
  requirePermission(ctx, "trials:manage", { centerId: s.centerId });
  if ((input.teacherId ?? null) !== s.teacherId) requirePermission(ctx, "trials:assign-teacher", { centerId: s.centerId });
  const errs = validateTrialSessionChange({ date: s.date, now: nowLocal(), status: s.status, newDate: input.date });
  if (errs.length) throw badRequest(errs);
  if (input.endTime <= input.startTime) throw trialError("Giờ kết thúc phải sau giờ bắt đầu");
  await ctx.db.transaction(async (tx) => {
    const upd = await tx.update(trialClassSessions)
      .set({
        date: input.date, startTime: input.startTime, endTime: input.endTime,
        roomId: input.roomId ?? null, teacherId: input.teacherId ?? null, topic: input.topic?.trim() || null, rescheduleReason: reason,
      })
      .where(and(eq(trialClassSessions.id, s.id), eq(trialClassSessions.status, "scheduled")))
      .returning({ id: trialClassSessions.id });
    if (!upd.length) throw new TRPCError({ code: "CONFLICT", message: "Buổi trải nghiệm vừa được cập nhật bởi người khác" });
    // Báo GV cũ (buổi không còn như trước) và GV mới (nhận buổi)
    await notifyTrialTeacher(tx as unknown as Db, { teacherId: s.teacherId, date: s.date, startTime: s.startTime, className: s.className, trialClassId: s.trialClassId, seq: s.seq }, "Buổi trải nghiệm đổi lịch", `Lý do: ${reason}`);
    if ((input.teacherId ?? null) !== s.teacherId) {
      await notifyTrialTeacher(tx as unknown as Db, { teacherId: input.teacherId ?? null, date: input.date, startTime: input.startTime, className: s.className, trialClassId: s.trialClassId, seq: s.seq }, "Bạn nhận buổi trải nghiệm", `Lý do đổi lịch: ${reason}`);
    } else {
      await notifyTrialTeacher(tx as unknown as Db, { teacherId: input.teacherId ?? null, date: input.date, startTime: input.startTime, className: s.className, trialClassId: s.trialClassId, seq: s.seq }, "Lịch mới của buổi trải nghiệm", `Lý do: ${reason}`);
    }
    await writeAudit(tx as unknown as Db, {
      actorId: ctx.user.id, action: "UPDATE", module: "admissions", entity: "trial_class_sessions", entityId: s.id,
      before: { date: s.date, startTime: s.startTime, endTime: s.endTime, roomId: s.roomId, teacherId: s.teacherId },
      after: { date: input.date, startTime: input.startTime, endTime: input.endTime, roomId: input.roomId ?? null, teacherId: input.teacherId ?? null },
      reason, ip: ctx.ip,
    });
  });
  return { ok: true };
}

/** Huỷ một buổi trải nghiệm — BẮT BUỘC ghi lý do, lý do gửi thẳng cho giáo viên phụ trách buổi */
export async function cancelTrialSession(ctx: ProtectedContext, input: { sessionId: string; reason: string }) {
  const reason = reasonOrThrow(input.reason);
  const s = await loadTrialSession(ctx.db, input.sessionId);
  requirePermission(ctx, "trials:manage", { centerId: s.centerId });
  const errs = validateTrialSessionChange({ date: s.date, now: nowLocal(), status: s.status });
  if (errs.length) throw badRequest(errs);
  await ctx.db.transaction(async (tx) => {
    const upd = await tx.update(trialClassSessions)
      .set({ status: "cancelled", cancelReason: reason })
      .where(and(eq(trialClassSessions.id, s.id), eq(trialClassSessions.status, "scheduled")))
      .returning({ id: trialClassSessions.id });
    if (!upd.length) throw new TRPCError({ code: "CONFLICT", message: "Buổi trải nghiệm vừa được cập nhật bởi người khác" });
    await notifyTrialTeacher(tx as unknown as Db, { teacherId: s.teacherId, date: s.date, startTime: s.startTime, className: s.className, trialClassId: s.trialClassId, seq: s.seq }, "Buổi trải nghiệm đã huỷ", `Lý do: ${reason}`);
    await writeAudit(tx as unknown as Db, {
      actorId: ctx.user.id, action: "TRANSITION", module: "admissions", entity: "trial_class_sessions", entityId: s.id,
      before: { status: s.status }, after: { status: "cancelled" }, reason, ip: ctx.ip,
    });
  });
  return { ok: true };
}

/** Đánh dấu một buổi trải nghiệm đã dạy xong */
export async function completeTrialSession(ctx: ProtectedContext, input: { sessionId: string }) {
  const s = await loadTrialSession(ctx.db, input.sessionId);
  requirePermission(ctx, "trials:attendance", { centerId: s.centerId, ownerIds: [s.teacherId ?? ""].filter(Boolean) });
  if (s.status !== "scheduled") throw trialError("Buổi này không còn ở trạng thái đã xếp");
  if (s.date > todayLocal()) throw trialError("Buổi trải nghiệm chưa diễn ra");
  await ctx.db.transaction(async (tx) => {
    await tx.update(trialClassSessions).set({ status: "done" }).where(and(eq(trialClassSessions.id, s.id), eq(trialClassSessions.status, "scheduled")));
    await writeAudit(tx as unknown as Db, {
      actorId: ctx.user.id, action: "TRANSITION", module: "admissions", entity: "trial_class_sessions", entityId: s.id,
      before: { status: s.status }, after: { status: "done" }, ip: ctx.ip,
    });
  });
  return { ok: true };
}

/**
 * Xếp một học viên (lead / con trong lead) vào lớp trải nghiệm.
 * Em đó học TOÀN BỘ buổi của lớp, kể cả buổi tạo sau. Hết chỗ thì chặn,
 * trừ khi người dùng có quyền vượt sĩ số và chọn `override`.
 */
export async function enrollToTrialClass(ctx: ProtectedContext, input: { trialClassId: string; leadId: string; childId?: string | null; override?: boolean }) {
  const c = await loadTrialClass(ctx.db, input.trialClassId);
  requirePermission(ctx, "trials:manage", { centerId: c.centerId });
  if (input.override) requirePermission(ctx, "trials:override-capacity", { centerId: c.centerId });
  const lead = await ctx.db.query.leads.findFirst({ where: and(eq(leads.id, input.leadId), isNull(leads.deletedAt)) });
  if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy lead" });
  const child = input.childId ? await ctx.db.query.leadChildren.findFirst({ where: and(eq(leadChildren.id, input.childId), eq(leadChildren.leadId, lead.id)) }) : null;
  if (input.childId && !child) throw new TRPCError({ code: "BAD_REQUEST", message: "Bé không thuộc lead này" });
  const studentName = child?.fullName ?? lead.childName ?? lead.parentName;

  const id = await ctx.db.transaction(async (tx) => {
    // Khoá theo lớp để 2 người không cùng lấy chỗ cuối
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"trial-class-enroll:" + c.id}))`);
    const [n] = await tx.select({ enrolled: sql<number>`count(*)::int` }).from(trialClassEnrollments)
      .where(and(eq(trialClassEnrollments.trialClassId, c.id), eq(trialClassEnrollments.status, "enrolled")));
    const dupConds = [eq(trialClassEnrollments.trialClassId, c.id), eq(trialClassEnrollments.leadId, lead.id), eq(trialClassEnrollments.status, "enrolled")];
    dupConds.push(child ? eq(trialClassEnrollments.childId, child.id) : isNull(trialClassEnrollments.childId));
    const [dup] = await tx.select({ n: sql<number>`count(*)::int` }).from(trialClassEnrollments).where(and(...dupConds));
    if ((dup?.n ?? 0) > 0) throw trialError("Học viên này đã ở trong lớp trải nghiệm");
    const rule = canEnrollTrial({ capacity: c.capacity, enrolled: n?.enrolled ?? 0, override: input.override, status: c.status as TrialClassStatus, sessionCount: c.sessionCount });
    if (!rule.ok) throw trialError(rule.reason);
    // "Sửa lớp": em đang ở một lớp trải nghiệm khác thì rút khỏi lớp cũ rồi mới xếp sang lớp này
    const moveConds = [eq(trialClassEnrollments.leadId, lead.id), eq(trialClassEnrollments.status, "enrolled"), ne(trialClassEnrollments.trialClassId, c.id)];
    moveConds.push(child ? eq(trialClassEnrollments.childId, child.id) : isNull(trialClassEnrollments.childId));
    const moved = await tx.update(trialClassEnrollments)
      .set({ status: "withdrawn", withdrawReason: `Chuyển sang lớp ${c.name}` })
      .where(and(...moveConds))
      .returning({ id: trialClassEnrollments.id });
    const [row] = await tx
      .insert(trialClassEnrollments)
      .values({ trialClassId: c.id, leadId: lead.id, childId: child?.id ?? null, studentName, overCapacity: rule.overridden, createdBy: ctx.user.id })
      .returning({ id: trialClassEnrollments.id });
    await applyLeadEvent(
      tx as unknown as Db, ctx, lead,
      lead.status === "trial_in_progress" ? "start_trial" : "schedule_trial",
      `Xếp ${studentName} vào lớp trải nghiệm ${c.name} — học toàn bộ ${c.sessionCount} buổi của lớp${rule.overridden ? " (vượt sĩ số)" : ""}${moved.length ? " (chuyển từ lớp trải nghiệm khác)" : ""}`,
      { trialClassId: c.id, trialClassEnrollmentId: row!.id, overCapacity: rule.overridden, movedFrom: moved.length },
      "trial_booked",
    );
    await writeAudit(tx as unknown as Db, {
      actorId: ctx.user.id, action: "CREATE", module: "admissions", entity: "trial_class_enrollments", entityId: row!.id,
      after: { trialClassId: c.id, leadId: lead.id, childId: child?.id ?? null, studentName, overCapacity: rule.overridden, movedFrom: moved.length },
      reason: rule.overridden ? "Xếp vượt sĩ số" : null, ip: ctx.ip,
    });
    return row!.id;
  });
  return { id };
}

/** Rút một học viên khỏi lớp trải nghiệm (UI bấm xác nhận 2 lần) */
export async function withdrawFromTrialClass(ctx: ProtectedContext, input: { enrollmentId: string; reason?: string | null }) {
  const [e] = await ctx.db
    .select({
      id: trialClassEnrollments.id, status: trialClassEnrollments.status, studentName: trialClassEnrollments.studentName, leadId: trialClassEnrollments.leadId,
      trialClassId: trialClassEnrollments.trialClassId, className: trialClasses.name, centerId: trialClasses.centerId,
    })
    .from(trialClassEnrollments)
    .innerJoin(trialClasses, eq(trialClasses.id, trialClassEnrollments.trialClassId))
    .where(eq(trialClassEnrollments.id, input.enrollmentId))
    .limit(1);
  if (!e) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy học viên trong lớp trải nghiệm" });
  requirePermission(ctx, "trials:manage", { centerId: e.centerId });
  if (e.status !== "enrolled") throw trialError("Học viên đã rút khỏi lớp trước đó");
  const reason = input.reason?.trim() || null;
  await ctx.db.transaction(async (tx) => {
    const upd = await tx.update(trialClassEnrollments)
      .set({ status: "withdrawn", withdrawReason: reason })
      .where(and(eq(trialClassEnrollments.id, e.id), eq(trialClassEnrollments.status, "enrolled")))
      .returning({ id: trialClassEnrollments.id });
    if (!upd.length) throw new TRPCError({ code: "CONFLICT", message: "Ghi danh trải nghiệm vừa được cập nhật bởi người khác" });
    await tx.insert(leadActivities).values({
      leadId: e.leadId, type: "note", actorId: ctx.user.id,
      content: `Rút ${e.studentName} khỏi lớp trải nghiệm ${e.className}${reason ? ` — ${reason}` : ""}`,
      meta: { event: "trial_class_withdraw", trialClassId: e.trialClassId, trialClassEnrollmentId: e.id },
    });
    await writeAudit(tx as unknown as Db, {
      actorId: ctx.user.id, action: "UPDATE", module: "admissions", entity: "trial_class_enrollments", entityId: e.id,
      before: { status: "enrolled" }, after: { status: "withdrawn" }, reason, ip: ctx.ip,
    });
  });
  return { ok: true };
}

/** Chi tiết lớp trải nghiệm: thông tin lớp + danh sách buổi + danh sách học viên + điểm danh */
export async function trialClassDetail(ctx: ProtectedContext, input: { id: string }) {
  const c = await loadTrialClass(ctx.db, input.id);
  requirePermission(ctx, "trials:view", { centerId: c.centerId });
  const sessionRows = await ctx.db
    .select({
      id: trialClassSessions.id, seq: trialClassSessions.seq, date: trialClassSessions.date, startTime: trialClassSessions.startTime, endTime: trialClassSessions.endTime,
      status: trialClassSessions.status, topic: trialClassSessions.topic, rescheduleReason: trialClassSessions.rescheduleReason, cancelReason: trialClassSessions.cancelReason,
      roomId: trialClassSessions.roomId, roomCode: rooms.code, teacherId: trialClassSessions.teacherId, teacherName: teachers.fullName,
    })
    .from(trialClassSessions)
    .leftJoin(rooms, eq(rooms.id, trialClassSessions.roomId))
    .leftJoin(teachers, eq(teachers.id, trialClassSessions.teacherId))
    .where(eq(trialClassSessions.trialClassId, c.id))
    .orderBy(asc(trialClassSessions.seq));
  const enrollmentRows = await ctx.db
    .select({
      id: trialClassEnrollments.id, status: trialClassEnrollments.status, studentName: trialClassEnrollments.studentName, joinedAt: trialClassEnrollments.joinedAt,
      withdrawReason: trialClassEnrollments.withdrawReason, overCapacity: trialClassEnrollments.overCapacity,
      leadId: trialClassEnrollments.leadId, childId: trialClassEnrollments.childId, parentName: leads.parentName, phone: leads.phone, leadStatus: leads.status,
    })
    .from(trialClassEnrollments)
    .innerJoin(leads, eq(leads.id, trialClassEnrollments.leadId))
    .where(eq(trialClassEnrollments.trialClassId, c.id))
    .orderBy(asc(trialClassEnrollments.joinedAt));
  const sessionIds = sessionRows.map((s) => s.id);
  const attendanceRows = await ctx.db
    .select({ trialSessionId: trialAttendance.trialSessionId, enrollmentId: trialAttendance.enrollmentId, status: trialAttendance.status, note: trialAttendance.note, markedAt: trialAttendance.markedAt })
    .from(trialAttendance)
    .where(sessionIds.length ? inArray(trialAttendance.trialSessionId, sessionIds) : sql`false`);
  const roomOptions = await ctx.db.select({ id: rooms.id, code: rooms.code, name: rooms.name }).from(rooms).where(and(eq(rooms.centerId, c.centerId), eq(rooms.isActive, true))).orderBy(asc(rooms.code));
  const teacherOptions = await ctx.db.select({ id: teachers.id, fullName: teachers.fullName }).from(teachers).where(and(eq(teachers.centerId, c.centerId), eq(teachers.isActive, true))).orderBy(asc(teachers.fullName));
  return {
    class: { ...c, seatsLeft: trialSeatsLeft({ capacity: c.capacity, enrolled: c.enrolled }) },
    sessions: sessionRows,
    enrollments: enrollmentRows,
    attendance: attendanceRows,
    rooms: roomOptions,
    teachers: teacherOptions,
    today: todayLocal(),
    perms: {
      manage: authorize(ctx.actor, "trials:manage", { centerId: c.centerId }).allowed,
      attendance: authorize(ctx.actor, "trials:attendance", { centerId: c.centerId }).allowed,
      assignTeacher: authorize(ctx.actor, "trials:assign-teacher", { centerId: c.centerId }).allowed,
      overrideCapacity: authorize(ctx.actor, "trials:override-capacity", { centerId: c.centerId }).allowed,
    },
  };
}

/**
 * Ứng viên để thêm vào lớp trải nghiệm: lead còn mở cùng cơ sở với lớp.
 * Em đang ở một lớp trải nghiệm đang mở khác sẽ được đánh dấu để không xếp trùng.
 */
export async function trialClassCandidates(ctx: ProtectedContext, input: { trialClassId: string; q?: string }) {
  const c = await loadTrialClass(ctx.db, input.trialClassId);
  requirePermission(ctx, "trials:manage", { centerId: c.centerId });
  const conds = [isNull(leads.deletedAt), inArray(leads.status, [...OPEN_LEAD_STATUSES]), eq(leads.centerId, c.centerId)];
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`;
    const digits = input.q.replace(/\D/g, "").replace(/^0/, "");
    conds.push(or(ilike(leads.parentName, q), ilike(leads.childName, q), ...(digits.length >= 3 ? [ilike(leads.phoneNormalized, `%${digits}%`)] : []))!);
  }
  const rows = await ctx.db
    .select({ id: leads.id, parentName: leads.parentName, childName: leads.childName, phone: leads.phone, status: leads.status })
    .from(leads).where(and(...conds)).orderBy(desc(leads.lastTouchAt)).limit(20);
  const ids = rows.map((r) => r.id);
  const hasIds = ids.length > 0;
  const kids = await ctx.db
    .select({ id: leadChildren.id, leadId: leadChildren.leadId, fullName: leadChildren.fullName })
    .from(leadChildren)
    .where(hasIds ? inArray(leadChildren.leadId, ids) : sql`false`);
  const busy = await ctx.db
    .select({ leadId: trialClassEnrollments.leadId, childId: trialClassEnrollments.childId, className: trialClasses.name, trialClassId: trialClasses.id })
    .from(trialClassEnrollments)
    .innerJoin(trialClasses, eq(trialClasses.id, trialClassEnrollments.trialClassId))
    .where(and(hasIds ? inArray(trialClassEnrollments.leadId, ids) : sql`false`, eq(trialClassEnrollments.status, "enrolled"), ne(trialClasses.status, "cancelled")));
  const inClass = (leadId: string, childId: string | null) => busy.find((b) => b.leadId === leadId && b.childId === childId) ?? null;
  return rows.map((r) => {
    const children = kids.filter((k) => k.leadId === r.id).map((k) => ({ ...k, inClass: inClass(r.id, k.id) }));
    return { ...r, children, inClass: inClass(r.id, null) };
  });
}

/** Điểm danh một buổi trải nghiệm (Có mặt / Vắng / Đi muộn) — GV đứng buổi hoặc giáo vụ/tư vấn cơ sở */
export async function markTrialAttendance(
  ctx: ProtectedContext,
  input: { sessionId: string; records: { enrollmentId: string; status: TrialAttendanceStatus; note?: string | null }[] },
) {
  const s = await loadTrialSession(ctx.db, input.sessionId);
  requirePermission(ctx, "trials:attendance", { centerId: s.centerId, ownerIds: [s.teacherId ?? ""].filter(Boolean) });
  if (s.status === "cancelled") throw trialError("Buổi trải nghiệm đã huỷ — không điểm danh được");
  if (s.date > todayLocal()) throw trialError("Buổi trải nghiệm chưa diễn ra");
  const ids = input.records.map((r) => r.enrollmentId);
  if (!ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Chưa chọn học viên nào để điểm danh" });
  const valid = await ctx.db.select({ id: trialClassEnrollments.id }).from(trialClassEnrollments)
    .where(and(eq(trialClassEnrollments.trialClassId, s.trialClassId), inArray(trialClassEnrollments.id, ids)));
  if (valid.length !== new Set(ids).size) throw new TRPCError({ code: "BAD_REQUEST", message: "Có học viên không thuộc lớp trải nghiệm này" });
  await ctx.db.transaction(async (tx) => {
    for (const r of input.records) {
      await tx
        .insert(trialAttendance)
        .values({ trialSessionId: s.id, enrollmentId: r.enrollmentId, status: r.status, note: r.note?.trim() || null, markedBy: ctx.user.id, markedAt: new Date() })
        .onConflictDoUpdate({
          target: [trialAttendance.trialSessionId, trialAttendance.enrollmentId],
          set: { status: r.status, note: r.note?.trim() || null, markedBy: ctx.user.id, markedAt: new Date() },
        });
    }
    await writeAudit(tx as unknown as Db, {
      actorId: ctx.user.id, action: "UPDATE", module: "admissions", entity: "trial_attendance", entityId: s.id,
      after: { count: input.records.length, trialClassId: s.trialClassId, seq: s.seq }, ip: ctx.ip,
    });
  });
  return { ok: true, count: input.records.length };
}

/**
 * Dữ liệu cho khối "Xếp vào lớp trải nghiệm" ở trang chi tiết lead:
 * các lớp đang mở cùng cơ sở (kèm số chỗ còn lại) + lịch sử học thử của từng con.
 */
export async function trialClassOptionsForLead(ctx: ProtectedContext, input: { leadId: string }) {
  const lead = await ctx.db.query.leads.findFirst({ where: and(eq(leads.id, input.leadId), isNull(leads.deletedAt)) });
  if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy lead" });
  requirePermission(ctx, "trials:view", { centerId: lead.centerId });
  const conds = [isNull(trialClasses.deletedAt), eq(trialClasses.status, "open")];
  if (lead.centerId) conds.push(eq(trialClasses.centerId, lead.centerId));
  const visible = visibleCenterIds(ctx.actor);
  if (visible !== null) conds.push(visible.length ? inArray(trialClasses.centerId, visible) : sql`false`);
  const classRows = await ctx.db
    .select({
      id: trialClasses.id, code: trialClasses.code, name: trialClasses.name, capacity: trialClasses.capacity, centerId: trialClasses.centerId,
      centerCode: centers.code, courseCode: courses.code, enrolled: enrolledCountSql, sessionCount: sessionCountSql, nextSessionDate: nextSessionSql,
    })
    .from(trialClasses)
    .innerJoin(centers, eq(centers.id, trialClasses.centerId))
    .leftJoin(courses, eq(courses.id, trialClasses.courseId))
    .where(and(...conds))
    .orderBy(desc(trialClasses.createdAt))
    .limit(50);
  const children = await ctx.db
    .select({ id: leadChildren.id, fullName: leadChildren.fullName, interestedCourseId: leadChildren.interestedCourseId })
    .from(leadChildren).where(eq(leadChildren.leadId, lead.id)).orderBy(asc(leadChildren.createdAt));
  // Lịch sử học thử của lead: lớp trải nghiệm nhiều buổi + buổi thử lẻ ở lớp chính quy
  const history = await ctx.db
    .select({
      enrollmentId: trialClassEnrollments.id, childId: trialClassEnrollments.childId, studentName: trialClassEnrollments.studentName,
      status: trialClassEnrollments.status, joinedAt: trialClassEnrollments.joinedAt, withdrawReason: trialClassEnrollments.withdrawReason,
      trialClassId: trialClasses.id, className: trialClasses.name, classCode: trialClasses.code, classStatus: trialClasses.status,
      sessionCount: sessionCountSql,
      attended: sql<number>`(select count(*)::int from ${trialAttendance} ta where ta.enrollment_id = ${trialClassEnrollments.id} and ta.status in ('present','late'))`,
      absent: sql<number>`(select count(*)::int from ${trialAttendance} ta2 where ta2.enrollment_id = ${trialClassEnrollments.id} and ta2.status = 'absent')`,
    })
    .from(trialClassEnrollments)
    .innerJoin(trialClasses, eq(trialClasses.id, trialClassEnrollments.trialClassId))
    .where(eq(trialClassEnrollments.leadId, lead.id))
    .orderBy(desc(trialClassEnrollments.joinedAt));
  return {
    leadId: lead.id,
    centerId: lead.centerId,
    childName: lead.childName,
    classes: classRows.map((r) => ({ ...r, seatsLeft: trialSeatsLeft({ capacity: r.capacity, enrolled: r.enrolled }) })),
    children,
    history,
    perms: {
      manage: authorize(ctx.actor, "trials:manage", { centerId: lead.centerId }).allowed,
      overrideCapacity: authorize(ctx.actor, "trials:override-capacity", { centerId: lead.centerId }).allowed,
    },
  };
}
