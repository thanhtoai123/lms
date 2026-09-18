import { and, eq, inArray, sql, asc, desc, gte, lte, isNull, ilike, or, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  trialBookings, leads, leadChildren, leadActivities, sessions, classes, courses, centers, rooms, teachers, users, userNotifications, enrollments,
} from "@satarobo/db";
import {
  validateTrialBooking, trialTransition, canRecordTrialResult, leadEventForTrial, leadTransition, requireReason, seatsLeft, visibleCenterIds, addDays,
  TRIAL_SEAT_STATUSES, TRIAL_COUNTED_STATUSES, OPEN_LEAD_STATUSES, authorize, hasPermission,
  type TrialStatus, type LeadStatus, type LeadEvent,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { deliverNotifications } from "./notify";
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

async function notifyTeachers(db: Db, s: { teacherId: string | null; leadTeacherId: string | null; date: string; startTime: string; classCode: string; id: string }, title: string, body: string, type = "trial.assigned") {
  const uids = await teacherUserIds(db, [s.teacherId ?? s.leadTeacherId]);
  if (!uids.length) return;
  await deliverNotifications(db, uids, {
    title,
    body: `${body} — ${s.classCode}, ${s.date.split("-").reverse().join("/")} ${s.startTime.slice(0, 5)}`,
    link: `/teacher/sessions/${s.id}`,
    priority: 2,
    type,
  });
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
