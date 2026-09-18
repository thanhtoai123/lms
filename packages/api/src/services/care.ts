import { randomBytes } from "node:crypto";
import { and, eq, inArray, sql, desc, asc, isNull, or, gte, lte, ilike, ne, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";
import {
  parentRequests, parentRequestEvents, parentFeedback, surveys, surveyInvites, surveyResponses, notificationBroadcasts, birthdayGreetings,
  parentNotifications, careTasks, userNotifications, userRoles, users, centers, students, parents, studentGuardians, enrollments, classes, courses,
  sessions, attendance, makeupRequests, teachers,
} from "@satarobo/db";
import {
  authorize, visibleCenterIds, addDays,
  parentRequestTransition, validateParentRequest, slaDue, slaState, requestCode, PARENT_REQUEST_TYPE_VI, REQUEST_NEEDS_DECISION, OPEN_REQUEST_STATUSES,
  feedbackPriority, validateFeedback, ratingStats, FEEDBACK_TAG_VI,
  validateSurvey, validateAnswers, npsScore, npsGroup, INVITE_TTL_DAYS,
  renderTemplate, unknownVars, nextBirthday, DEFAULT_BIRTHDAY_TEMPLATE, withinMakeupWindow,
  type Permission, type ParentRequestType, type ParentRequestStatus, type ContactChannel, type FeedbackStatus, type SurveyQuestion, type SurveyTrigger,
  type SurveyStatus, type SurveyAnswers, type RequestAction, type BroadcastChannel, type FeedbackTag,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { deliverySettings } from "./delivery";
import { writeAudit } from "./audit";
import { todayISO } from "./sessions";
import type { Database } from "@satarobo/db";

type Db = ProtectedContext["db"];
const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });
const pre = (m: string | string[]) => new TRPCError({ code: "PRECONDITION_FAILED", message: Array.isArray(m) ? m.join("; ") : m });
const notFound = (m: string) => new TRPCError({ code: "NOT_FOUND", message: m });
const can = (ctx: ProtectedContext, p: Permission, centerId: string | null) => authorize(ctx.actor, p, { centerId }).allowed;
function rule<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if ((e as Error)?.name === "CareRuleError") throw pre((e as Error).message);
    throw e;
  }
}
const reasonOf = (r: string | null | undefined, min = 5) => {
  const t = (r ?? "").trim();
  if (t.length < min) throw bad(`Cần nhập nội dung (tối thiểu ${min} ký tự)`);
  return t;
};
function scopeOn(ctx: ProtectedContext, col: AnyPgColumn): SQL {
  const v = visibleCenterIds(ctx.actor);
  if (v === null) return sql`true`;
  return v.length ? (inArray(col, v) as SQL) : sql`false`;
}
const dmy = (d: string) => d.split("-").reverse().join("/");

async function notifyUsers(db: Db, ids: (string | null | undefined)[], title: string, body: string, link: string, priority = 2) {
  const u = [...new Set(ids.filter((x): x is string => !!x))];
  if (u.length) await db.insert(userNotifications).values(u.map((userId) => ({ userId, title, body, link, priority })));
}
async function careStaffOf(db: Db, centerId: string) {
  return (await db.select({ u: userRoles.userId }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(users.isActive, true), eq(userRoles.centerId, centerId), inArray(userRoles.role, ["CENTER_MANAGER", "CENTER_SALES_CSM"])))).map((r) => r.u);
}
async function primaryParent(db: Db, studentId: string) {
  const [g] = await db.select({ id: parents.id, fullName: parents.fullName }).from(studentGuardians).innerJoin(parents, eq(parents.id, studentGuardians.parentId))
    .where(eq(studentGuardians.studentId, studentId)).orderBy(desc(studentGuardians.isPrimary)).limit(1);
  return g ?? null;
}
async function notifyParent(db: Db, x: { parentId: string | null; studentId: string; template: string; title: string; body: string; link?: string | null; actorId?: string | null }) {
  if (!x.parentId) return;
  await db.insert(parentNotifications).values({ parentId: x.parentId, studentId: x.studentId, channel: "in_app", template: x.template, title: x.title, body: x.body, link: x.link ?? null, status: "sent", sentAt: new Date(), createdBy: x.actorId ?? null });
}
async function openCareTask(db: Db, x: { studentId: string; enrollmentId?: string | null; centerId: string; code: string; title: string; dedupeKey: string; hours: number }) {
  const ex = await db.query.careTasks.findFirst({ where: and(eq(careTasks.dedupeKey, x.dedupeKey), inArray(careTasks.status, ["open", "in_progress", "escalated"])) });
  if (ex) return ex.id;
  const [t] = await db.insert(careTasks).values({ studentId: x.studentId, enrollmentId: x.enrollmentId ?? null, centerId: x.centerId, code: x.code, title: x.title, severity: 2, dueAt: new Date(Date.now() + x.hours * 3600e3), dedupeKey: x.dedupeKey }).returning({ id: careTasks.id });
  return t!.id;
}

/* ------------------------------------------------------------------ */
/* Yêu cầu phụ huynh                                                   */
/* ------------------------------------------------------------------ */

export async function listParentRequests(ctx: ProtectedContext, input: { status?: ParentRequestStatus | "open" | "overdue"; type?: ParentRequestType; centerId?: string; q?: string; mine?: boolean }) {
  requirePermission(ctx, "care:read", { centerId: input.centerId ?? null });
  const base: SQL[] = [scopeOn(ctx, parentRequests.centerId)];
  if (input.centerId) base.push(eq(parentRequests.centerId, input.centerId));
  if (input.type) base.push(eq(parentRequests.type, input.type));
  if (input.mine) base.push(eq(parentRequests.assigneeId, ctx.user.id));
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`;
    base.push(or(ilike(students.fullName, q), ilike(parentRequests.code, q), ilike(parents.fullName, q), ilike(parentRequests.content, q))!);
  }
  const where: SQL[] = [...base];
  if (input.status === "open") where.push(inArray(parentRequests.status, [...OPEN_REQUEST_STATUSES]));
  else if (input.status === "overdue") where.push(inArray(parentRequests.status, ["new", "in_progress"]), sql`${parentRequests.dueAt} < now()`);
  else if (input.status) where.push(eq(parentRequests.status, input.status));
  const rows = await ctx.db.select({
    r: parentRequests, studentName: students.fullName, studentCode: students.code, parentName: parents.fullName, centerCode: centers.code, classCode: classes.code,
    assigneeName: sql<string | null>`(select full_name from ${users} u where u.id = ${parentRequests.assigneeId})`,
    sessionDate: sql<string | null>`(select s.date::text from ${sessions} s where s.id = ${parentRequests.sessionId})`,
  }).from(parentRequests).innerJoin(students, eq(students.id, parentRequests.studentId)).innerJoin(centers, eq(centers.id, parentRequests.centerId))
    .leftJoin(parents, eq(parents.id, parentRequests.parentId)).leftJoin(enrollments, eq(enrollments.id, parentRequests.enrollmentId)).leftJoin(classes, eq(classes.id, enrollments.classId))
    .where(and(...where)).orderBy(sql`case when ${parentRequests.status} in ('new','in_progress') then 0 when ${parentRequests.status} = 'approved' then 1 else 2 end`, asc(parentRequests.dueAt)).limit(300);
  const [c] = await ctx.db.select({
    open: sql<number>`count(*) filter (where ${parentRequests.status} in ('new','in_progress','approved'))::int`,
    overdue: sql<number>`count(*) filter (where ${parentRequests.status} in ('new','in_progress') and ${parentRequests.dueAt} < now())::int`,
    new: sql<number>`count(*) filter (where ${parentRequests.status} = 'new')::int`,
    in_progress: sql<number>`count(*) filter (where ${parentRequests.status} = 'in_progress')::int`,
    approved: sql<number>`count(*) filter (where ${parentRequests.status} = 'approved')::int`,
    done: sql<number>`count(*) filter (where ${parentRequests.status} = 'done')::int`,
    rejected: sql<number>`count(*) filter (where ${parentRequests.status} = 'rejected')::int`,
    cancelled: sql<number>`count(*) filter (where ${parentRequests.status} = 'cancelled')::int`,
  }).from(parentRequests).innerJoin(students, eq(students.id, parentRequests.studentId)).leftJoin(parents, eq(parents.id, parentRequests.parentId)).where(and(...base));
  const now = new Date();
  return {
    counts: c,
    canCreate: ctx.actor.assignments.some((a) => can(ctx, "care:create", a.centerId)),
    items: rows.map((x) => ({ ...x.r, studentName: x.studentName, studentCode: x.studentCode, parentName: x.parentName, centerCode: x.centerCode, classCode: x.classCode, assigneeName: x.assigneeName, sessionDate: x.sessionDate, sla: slaState(x.r.dueAt, now, x.r.status) })),
  };
}

export async function requestContext(ctx: ProtectedContext, input: { studentId: string; enrollmentId?: string | null }) {
  const st = await ctx.db.query.students.findFirst({ where: eq(students.id, input.studentId), columns: { id: true, fullName: true, code: true, homeCenterId: true } });
  if (!st) throw notFound("Không tìm thấy học viên");
  requirePermission(ctx, "care:read", { centerId: st.homeCenterId });
  const guardians = await ctx.db.select({ id: parents.id, fullName: parents.fullName, phone: parents.phone, isPrimary: studentGuardians.isPrimary }).from(studentGuardians)
    .innerJoin(parents, eq(parents.id, studentGuardians.parentId)).where(eq(studentGuardians.studentId, st.id)).orderBy(desc(studentGuardians.isPrimary));
  const enr = await ctx.db.select({ id: enrollments.id, status: enrollments.status, classId: classes.id, classCode: classes.code, centerId: classes.centerId, courseCode: courses.code })
    .from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).innerJoin(courses, eq(courses.id, classes.courseId))
    .where(and(eq(enrollments.studentId, st.id), inArray(enrollments.status, ["trial", "active", "paused"])));
  const e = input.enrollmentId ? enr.find((x) => x.id === input.enrollmentId) : undefined;
  const today = todayISO();
  const upcoming = e ? await ctx.db.select({ id: sessions.id, date: sessions.date, startTime: sessions.startTime, sequenceNo: sessions.sequenceNo, status: sessions.status })
    .from(sessions).where(and(eq(sessions.classId, e.classId), gte(sessions.date, today), eq(sessions.status, "scheduled"))).orderBy(asc(sessions.date)).limit(10) : [];
  const absences = e ? await ctx.db.select({ id: sessions.id, date: sessions.date, sequenceNo: sessions.sequenceNo, status: attendance.status })
    .from(attendance).innerJoin(sessions, eq(sessions.id, attendance.sessionId))
    .where(and(eq(attendance.enrollmentId, e.id), inArray(attendance.status, ["absent_excused", "absent_unexcused"]), gte(sessions.date, addDays(today, -30)))).orderBy(desc(sessions.date)) : [];
  const recent = await ctx.db.select({ id: parentRequests.id, code: parentRequests.code, type: parentRequests.type, status: parentRequests.status, createdAt: parentRequests.createdAt })
    .from(parentRequests).where(eq(parentRequests.studentId, st.id)).orderBy(desc(parentRequests.createdAt)).limit(5);
  return { student: st, guardians, enrollments: enr, upcoming, absences, recent };
}

export interface CreateParentRequestInput {
  type: ParentRequestType; channel: ContactChannel; studentId: string; parentId?: string | null; enrollmentId?: string | null;
  sessionId?: string | null; missedSessionId?: string | null; dateFrom?: string | null; dateTo?: string | null; content: string; assigneeId?: string | null;
}

export async function createParentRequest(ctx: ProtectedContext, input: CreateParentRequestInput) {
  const today = todayISO();
  const errs = validateParentRequest(input, today);
  if (errs.length) throw bad(errs);
  const st = await ctx.db.query.students.findFirst({ where: eq(students.id, input.studentId), columns: { id: true, fullName: true, homeCenterId: true } });
  if (!st) throw notFound("Không tìm thấy học viên");
  let centerId = st.homeCenterId;
  if (input.enrollmentId) {
    const [e] = await ctx.db.select({ id: enrollments.id, studentId: enrollments.studentId, classId: enrollments.classId, centerId: classes.centerId, status: enrollments.status })
      .from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).where(eq(enrollments.id, input.enrollmentId));
    if (!e || e.studentId !== st.id) throw bad("Ghi danh không thuộc học viên");
    centerId = e.centerId;
    const checkSession = async (sid: string, future: boolean) => {
      const s = await ctx.db.query.sessions.findFirst({ where: eq(sessions.id, sid) });
      if (!s || s.classId !== e.classId) throw bad("Buổi học không thuộc lớp đã chọn");
      if (future && (s.date < today || s.status !== "scheduled")) throw pre("Chỉ xin nghỉ cho buổi sắp tới chưa diễn ra");
      return s;
    };
    if (input.type === "absence") {
      await checkSession(input.sessionId!, true);
      const dup = await ctx.db.query.parentRequests.findFirst({ where: and(eq(parentRequests.enrollmentId, e.id), eq(parentRequests.sessionId, input.sessionId!), ne(parentRequests.status, "cancelled"), ne(parentRequests.status, "rejected")) });
      if (dup) throw pre(`Buổi này đã có yêu cầu ${dup.code}`);
    }
    if (input.type === "makeup") {
      const s = await checkSession(input.missedSessionId!, false);
      const att = await ctx.db.query.attendance.findFirst({ where: and(eq(attendance.sessionId, s.id), eq(attendance.enrollmentId, e.id)) });
      if (!att || (att.status !== "absent_excused" && att.status !== "absent_unexcused")) throw pre("Học viên không vắng buổi đã chọn");
      if (!withinMakeupWindow(s.date, today)) throw pre("Buổi vắng đã quá hạn xin học bù");
    }
  }
  if (!centerId) throw bad("Học viên chưa có cơ sở");
  requirePermission(ctx, "care:create", { centerId });
  if (input.parentId) {
    const g = await ctx.db.query.studentGuardians.findFirst({ where: and(eq(studentGuardians.studentId, st.id), eq(studentGuardians.parentId, input.parentId)) });
    if (!g) throw bad("Phụ huynh không gắn với học viên");
  }
  const parentId = input.parentId ?? (await primaryParent(ctx.db, st.id))?.id ?? null;
  const now = new Date();
  return ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    const yr = Number(today.slice(0, 4));
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"preq:" + yr}))`);
    const prefix = requestCode(yr, 0).slice(0, 5);
    const [m] = await tx.select({ n: sql<number>`coalesce(max(substring(${parentRequests.code} from 6)::int), 0)::int` }).from(parentRequests).where(ilike(parentRequests.code, `${prefix}%`));
    const code = requestCode(yr, (m?.n ?? 0) + 1);
    const [r] = await tx.insert(parentRequests).values({
      code, type: input.type, status: input.assigneeId ? "in_progress" : "new", channel: input.channel, centerId, studentId: st.id, parentId,
      enrollmentId: input.enrollmentId ?? null, sessionId: input.type === "absence" ? input.sessionId ?? null : null, missedSessionId: input.type === "makeup" ? input.missedSessionId ?? null : null,
      dateFrom: input.type === "pause" ? input.dateFrom ?? null : null, dateTo: input.type === "pause" ? input.dateTo ?? null : null,
      content: input.content.trim(), assigneeId: input.assigneeId ?? null, dueAt: slaDue(now, input.type), createdBy: ctx.user.id,
    }).returning({ id: parentRequests.id });
    await tx.insert(parentRequestEvents).values({ requestId: r!.id, action: "create", toStatus: input.assigneeId ? "in_progress" : "new", note: input.content.trim(), actorId: ctx.user.id });
    const targets = input.assigneeId ? [input.assigneeId] : (await careStaffOf(tx, centerId)).filter((u) => u !== ctx.user.id);
    await notifyUsers(tx, targets, `Yêu cầu PH: ${PARENT_REQUEST_TYPE_VI[input.type]}`, `${code} · ${st.fullName}`, `/parent-requests/${r!.id}`, input.type === "absence" || input.type === "complaint" ? 1 : 2);
    await notifyParent(tx, { parentId, studentId: st.id, template: "REQUEST_RECEIVED", title: "Trung tâm đã nhận yêu cầu", body: `${PARENT_REQUEST_TYPE_VI[input.type]} (${code}) — chúng tôi sẽ phản hồi sớm`, actorId: ctx.user.id });
    await writeAudit(tx, { actorId: ctx.user.id, action: "CREATE", module: "care", entity: "parent_requests", entityId: r!.id, after: { code, type: input.type, studentId: st.id }, ip: ctx.ip });
    return { id: r!.id, code };
  });
}

export async function getParentRequest(ctx: ProtectedContext, id: string) {
  const [x] = await ctx.db.select({
    r: parentRequests, studentName: students.fullName, studentCode: students.code, parentName: parents.fullName, parentPhone: parents.phone, centerCode: centers.code,
    classCode: classes.code, classId: classes.id,
  }).from(parentRequests).innerJoin(students, eq(students.id, parentRequests.studentId)).innerJoin(centers, eq(centers.id, parentRequests.centerId))
    .leftJoin(parents, eq(parents.id, parentRequests.parentId)).leftJoin(enrollments, eq(enrollments.id, parentRequests.enrollmentId)).leftJoin(classes, eq(classes.id, enrollments.classId))
    .where(eq(parentRequests.id, id));
  if (!x) throw notFound("Không tìm thấy yêu cầu");
  requirePermission(ctx, "care:read", { centerId: x.r.centerId });
  const events = await ctx.db.select({ e: parentRequestEvents, actorName: users.fullName }).from(parentRequestEvents).leftJoin(users, eq(users.id, parentRequestEvents.actorId))
    .where(eq(parentRequestEvents.requestId, id)).orderBy(asc(parentRequestEvents.createdAt));
  const sess = (sid: string | null) => (sid ? ctx.db.query.sessions.findFirst({ where: eq(sessions.id, sid), columns: { id: true, date: true, startTime: true, sequenceNo: true, status: true } }) : null);
  const [session, missed] = await Promise.all([sess(x.r.sessionId), sess(x.r.missedSessionId)]);
  const assignees = await ctx.db.select({ id: users.id, fullName: users.fullName }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(users.isActive, true), eq(userRoles.centerId, x.r.centerId), inArray(userRoles.role, ["CENTER_MANAGER", "CENTER_SALES_CSM", "CENTER_CLASS_MANAGER"]))).orderBy(asc(users.fullName));
  const needs = REQUEST_NEEDS_DECISION.includes(x.r.type);
  const open = x.r.status === "new" || x.r.status === "in_progress";
  const upd = can(ctx, "care:update", x.r.centerId);
  const hint: Record<ParentRequestType, string | null> = {
    absence: "Duyệt → buổi học được ghi 'vắng có phép' sẵn cho GV",
    pause: x.r.enrollmentId ? `Duyệt rồi thực hiện bảo lưu ở hồ sơ học viên (ghi danh), sau đó Hoàn tất` : null,
    schedule_change: "Duyệt rồi thực hiện ở Chuyển lớp, sau đó Hoàn tất",
    makeup: "Duyệt → tạo yêu cầu học bù chờ xếp buổi",
    refund: "Duyệt rồi lập đề xuất ở Hoàn tiền, sau đó Hoàn tất",
    complaint: null, other: null,
  };
  return {
    ...x.r, studentName: x.studentName, studentCode: x.studentCode, parentName: x.parentName, parentPhone: x.parentPhone ? x.parentPhone.replace(/\d(?=\d{3})/g, "•") : null,
    centerCode: x.centerCode, classCode: x.classCode, classId: x.classId, session, missed,
    events: events.map((e) => ({ ...e.e, actorName: e.actorName })),
    assignees, sla: slaState(x.r.dueAt, new Date(), x.r.status), hint: hint[x.r.type],
    actions: {
      assign: upd && open, approve: upd && open && needs, reject: upd && open && needs,
      complete: upd && (needs ? x.r.status === "approved" : open), cancel: upd && open,
    },
  };
}

export async function actOnParentRequest(ctx: ProtectedContext, input: { id: string; action: RequestAction; note?: string | null; assigneeId?: string | null }) {
  const r = await ctx.db.query.parentRequests.findFirst({ where: eq(parentRequests.id, input.id) });
  if (!r) throw notFound("Không tìm thấy yêu cầu");
  requirePermission(ctx, "care:update", { centerId: r.centerId });
  const to = rule(() => parentRequestTransition(r.type, r.status, input.action));
  const note = input.action === "reject" || input.action === "complete" || input.action === "cancel" ? reasonOf(input.note) : input.note?.trim() || null;
  let assignee = r.assigneeId;
  if (input.action === "assign") {
    assignee = input.assigneeId ?? ctx.user.id;
    const ok = await ctx.db.select({ u: userRoles.userId }).from(userRoles).where(and(eq(userRoles.userId, assignee), or(eq(userRoles.centerId, r.centerId), isNull(userRoles.centerId))!)).limit(1);
    if (!ok.length) throw bad("Người nhận không thuộc cơ sở");
  }
  const result = await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    let linked = r.linked;
    const extra: string[] = [];
    if (input.action === "approve") {
      if (r.type === "absence" && r.sessionId && r.enrollmentId) {
        const s = await tx.query.sessions.findFirst({ where: eq(sessions.id, r.sessionId) });
        if (!s || s.status !== "scheduled") throw pre("Buổi học đã diễn ra / đã huỷ — không ghi phép trước được");
        await tx.insert(attendance).values({ sessionId: s.id, enrollmentId: r.enrollmentId, status: "absent_excused", note: `Xin nghỉ ${r.code}`, recordedBy: ctx.user.id, recordedAt: new Date() })
          .onConflictDoUpdate({ target: [attendance.sessionId, attendance.enrollmentId], set: { status: "absent_excused", note: `Xin nghỉ ${r.code}`, recordedBy: ctx.user.id, recordedAt: new Date() } });
        extra.push(`Đã ghi vắng có phép buổi ${s.sequenceNo} (${dmy(s.date)})`);
      }
      if (r.type === "makeup" && r.missedSessionId && r.enrollmentId) {
        const dup = await tx.query.makeupRequests.findFirst({ where: and(eq(makeupRequests.enrollmentId, r.enrollmentId), eq(makeupRequests.missedSessionId, r.missedSessionId), sql`${makeupRequests.status} <> 'rejected'`) });
        const mk = dup ?? (await tx.insert(makeupRequests).values({ enrollmentId: r.enrollmentId, missedSessionId: r.missedSessionId, requestedByParentId: r.parentId, note: `Từ yêu cầu PH ${r.code}` }).returning())[0]!;
        linked = { kind: "makeup_request", id: mk.id, href: "/hoc-bu?status=requested" };
        extra.push(dup ? "Đã có yêu cầu học bù trước đó" : "Đã tạo yêu cầu học bù — chờ xếp buổi");
      }
      if (r.type === "pause" && r.enrollmentId) linked = { kind: "enrollment", id: r.enrollmentId, href: `/students/${r.studentId}` };
      if (r.type === "schedule_change" && r.enrollmentId) linked = { kind: "transfer", id: r.enrollmentId, href: `/chuyen-lop?enrollmentId=${r.enrollmentId}` };
      if (r.type === "refund" && r.enrollmentId) linked = { kind: "refund", id: r.enrollmentId, href: `/hoan-tien?enrollment=${r.enrollmentId}` };
    }
    const up = await tx.update(parentRequests).set({
      status: to, assigneeId: assignee, linked,
      ...(input.action === "approve" || input.action === "reject" ? { decidedBy: ctx.user.id, decidedAt: new Date() } : {}),
      ...(input.action === "complete" || input.action === "reject" || input.action === "cancel" ? { resolution: note, completedAt: new Date() } : {}),
    }).where(and(eq(parentRequests.id, r.id), eq(parentRequests.status, r.status))).returning({ id: parentRequests.id });
    if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Yêu cầu vừa được xử lý" });
    const evNote = [note, ...extra].filter(Boolean).join(" · ") || null;
    await tx.insert(parentRequestEvents).values({ requestId: r.id, action: input.action, fromStatus: r.status, toStatus: to, note: input.action === "assign" ? `Giao cho ${(await tx.query.users.findFirst({ where: eq(users.id, assignee!), columns: { fullName: true } }))?.fullName ?? ""}${evNote ? ` — ${evNote}` : ""}` : evNote, actorId: ctx.user.id });
    if (input.action === "assign" && assignee !== ctx.user.id) await notifyUsers(tx, [assignee], "Bạn được giao yêu cầu PH", `${r.code} · ${PARENT_REQUEST_TYPE_VI[r.type]}`, `/parent-requests/${r.id}`, 1);
    if (input.action === "approve" || input.action === "reject" || input.action === "complete") {
      const title = input.action === "approve" ? "Yêu cầu đã được chấp thuận" : input.action === "reject" ? "Yêu cầu chưa được chấp thuận" : "Yêu cầu đã xử lý xong";
      await notifyParent(tx, { parentId: r.parentId, studentId: r.studentId, template: "REQUEST_UPDATE", title, body: `${PARENT_REQUEST_TYPE_VI[r.type]} (${r.code})${note ? `: ${note}` : ""}`, actorId: ctx.user.id });
    }
    await writeAudit(tx, { actorId: ctx.user.id, action: "TRANSITION", module: "care", entity: "parent_requests", entityId: r.id, before: { status: r.status }, after: { status: to, assigneeId: assignee, linked }, reason: note, ip: ctx.ip });
    return { status: to, notes: extra, linked };
  });
  return result;
}

/* ------------------------------------------------------------------ */
/* Đánh giá phụ huynh                                                  */
/* ------------------------------------------------------------------ */

export async function listFeedback(ctx: ProtectedContext, input: { status?: FeedbackStatus; low?: boolean; teacherId?: string; from?: string; to?: string; centerId?: string; classId?: string }) {
  requirePermission(ctx, "care:read", { centerId: input.centerId ?? null });
  const base: SQL[] = [scopeOn(ctx, parentFeedback.centerId)];
  if (input.centerId) base.push(eq(parentFeedback.centerId, input.centerId));
  if (input.classId) base.push(eq(parentFeedback.classId, input.classId));
  if (input.teacherId) base.push(eq(parentFeedback.teacherId, input.teacherId));
  if (input.from) base.push(gte(parentFeedback.createdAt, new Date(`${input.from}T00:00:00+07:00`)));
  if (input.to) base.push(lte(parentFeedback.createdAt, new Date(`${input.to}T23:59:59+07:00`)));
  const where = [...base];
  if (input.status) where.push(eq(parentFeedback.status, input.status));
  if (input.low) where.push(sql`least(${parentFeedback.rating}, coalesce(${parentFeedback.teacherRating}, 5)) <= 3`);
  const rows = await ctx.db.select({
    f: parentFeedback, studentName: students.fullName, parentName: parents.fullName, classCode: classes.code, teacherName: teachers.fullName, centerCode: centers.code,
    sessionNo: sql<number | null>`(select s.sequence_no from ${sessions} s where s.id = ${parentFeedback.sessionId})`,
    sessionDate: sql<string | null>`(select s.date::text from ${sessions} s where s.id = ${parentFeedback.sessionId})`,
    responderName: sql<string | null>`(select full_name from ${users} u where u.id = ${parentFeedback.respondedBy})`,
  }).from(parentFeedback).innerJoin(students, eq(students.id, parentFeedback.studentId)).innerJoin(centers, eq(centers.id, parentFeedback.centerId))
    .leftJoin(parents, eq(parents.id, parentFeedback.parentId)).leftJoin(classes, eq(classes.id, parentFeedback.classId)).leftJoin(teachers, eq(teachers.id, parentFeedback.teacherId))
    .where(and(...where)).orderBy(sql`case when ${parentFeedback.status} = 'resolved' then 1 else 0 end`, desc(parentFeedback.createdAt)).limit(500);
  const all = await ctx.db.select({ rating: parentFeedback.rating, teacherRating: parentFeedback.teacherRating, teacherId: parentFeedback.teacherId, teacherName: teachers.fullName, status: parentFeedback.status, tags: parentFeedback.tags })
    .from(parentFeedback).leftJoin(teachers, eq(teachers.id, parentFeedback.teacherId)).where(and(...base));
  const byTeacher = [...new Map(all.filter((a) => a.teacherId).map((a) => [a.teacherId!, a.teacherName ?? ""])).entries()].map(([id, name]) => {
    const xs = all.filter((a) => a.teacherId === id);
    return { teacherId: id, teacherName: name, overall: ratingStats(xs.map((x) => x.rating)), teacher: ratingStats(xs.map((x) => x.teacherRating).filter((x): x is number => x != null)) };
  }).sort((a, b) => (a.teacher.avg ?? 9) - (b.teacher.avg ?? 9));
  const tagCounts = Object.entries(all.flatMap((a) => a.tags).reduce<Record<string, number>>((m, t) => ({ ...m, [t]: (m[t] ?? 0) + 1 }), {}))
    .map(([tag, n]) => ({ tag, label: FEEDBACK_TAG_VI[tag as FeedbackTag] ?? tag, n })).sort((a, b) => b.n - a.n);
  return {
    stats: {
      overall: ratingStats(all.map((a) => a.rating)),
      teacher: ratingStats(all.map((a) => a.teacherRating).filter((x): x is number => x != null)),
      pending: all.filter((a) => a.status !== "resolved").length,
      lowPending: all.filter((a) => a.status !== "resolved" && feedbackPriority(a.rating, a.teacherRating) !== "normal").length,
    },
    byTeacher, tagCounts,
    items: rows.map((x) => ({
      ...x.f, studentName: x.studentName, parentName: x.parentName, classCode: x.classCode, teacherName: x.teacherName, centerCode: x.centerCode,
      sessionNo: x.sessionNo, sessionDate: x.sessionDate, responderName: x.responderName, priority: feedbackPriority(x.f.rating, x.f.teacherRating),
      canRespond: x.f.status !== "resolved" && can(ctx, "care:update", x.f.centerId),
    })),
  };
}

/** Buổi đã học gần đây của một ghi danh (để gắn đánh giá) */
export async function recentSessionsFor(ctx: ProtectedContext, input: { enrollmentId: string }) {
  const [e] = await ctx.db.select({ classId: enrollments.classId, centerId: classes.centerId }).from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).where(eq(enrollments.id, input.enrollmentId));
  if (!e) throw notFound("Không tìm thấy ghi danh");
  requirePermission(ctx, "care:read", { centerId: e.centerId });
  return ctx.db.select({ id: sessions.id, date: sessions.date, sequenceNo: sessions.sequenceNo, teacherId: sessions.teacherId, teacherName: teachers.fullName })
    .from(sessions).leftJoin(teachers, eq(teachers.id, sessions.teacherId))
    .where(and(eq(sessions.classId, e.classId), lte(sessions.date, todayISO()), gte(sessions.date, addDays(todayISO(), -60)))).orderBy(desc(sessions.date)).limit(12);
}

export async function createFeedback(ctx: ProtectedContext, input: { studentId: string; enrollmentId: string; sessionId?: string | null; rating: number; teacherRating?: number | null; tags: string[]; comment?: string | null; channel: ContactChannel }) {
  const errs = validateFeedback(input);
  if (errs.length) throw bad(errs);
  const [e] = await ctx.db.select({ id: enrollments.id, studentId: enrollments.studentId, classId: enrollments.classId, centerId: classes.centerId, teacherId: classes.leadTeacherId })
    .from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).where(eq(enrollments.id, input.enrollmentId));
  if (!e || e.studentId !== input.studentId) throw bad("Ghi danh không thuộc học viên");
  requirePermission(ctx, "care:create", { centerId: e.centerId });
  let teacherId = e.teacherId;
  if (input.sessionId) {
    const s = await ctx.db.query.sessions.findFirst({ where: eq(sessions.id, input.sessionId) });
    if (!s || s.classId !== e.classId) throw bad("Buổi học không thuộc lớp");
    if (s.date > todayISO()) throw pre("Chưa thể đánh giá buổi chưa diễn ra");
    teacherId = s.teacherId ?? teacherId;
    const dup = await ctx.db.query.parentFeedback.findFirst({ where: and(eq(parentFeedback.sessionId, s.id), eq(parentFeedback.studentId, input.studentId)) });
    if (dup) throw pre("Buổi này đã có đánh giá của học viên");
  }
  const parent = await primaryParent(ctx.db, input.studentId);
  const pri = feedbackPriority(input.rating, input.teacherRating);
  return ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    const [f] = await tx.insert(parentFeedback).values({
      centerId: e.centerId, studentId: input.studentId, parentId: parent?.id ?? null, classId: e.classId, sessionId: input.sessionId ?? null, teacherId,
      rating: input.rating, teacherRating: input.teacherRating ?? null, tags: input.tags, comment: input.comment?.trim() || null, channel: input.channel, createdBy: ctx.user.id,
    }).returning({ id: parentFeedback.id });
    let taskId: string | null = null;
    if (pri === "urgent") {
      taskId = await openCareTask(tx, { studentId: input.studentId, enrollmentId: e.id, centerId: e.centerId, code: "LOW_FEEDBACK", title: `PH đánh giá thấp (${Math.min(input.rating, input.teacherRating ?? 5)}★) — gọi lại trong 24h`, dedupeKey: `feedback:${f!.id}`, hours: 24 });
      await tx.update(parentFeedback).set({ careTaskId: taskId }).where(eq(parentFeedback.id, f!.id));
      await notifyUsers(tx, (await careStaffOf(tx, e.centerId)).filter((u) => u !== ctx.user.id), "Đánh giá thấp từ phụ huynh", `${Math.min(input.rating, input.teacherRating ?? 5)}★ — ${input.comment ?? ""}`.slice(0, 200), "/parent-feedback?low=1", 1);
    }
    await writeAudit(tx, { actorId: ctx.user.id, action: "CREATE", module: "care", entity: "parent_feedback", entityId: f!.id, after: { rating: input.rating, teacherRating: input.teacherRating, priority: pri }, ip: ctx.ip });
    return { id: f!.id, priority: pri, careTaskId: taskId };
  });
}

export async function respondFeedback(ctx: ProtectedContext, input: { id: string; status: "acknowledged" | "resolved"; response?: string | null }) {
  const f = await ctx.db.query.parentFeedback.findFirst({ where: eq(parentFeedback.id, input.id) });
  if (!f) throw notFound("Không tìm thấy đánh giá");
  requirePermission(ctx, "care:update", { centerId: f.centerId });
  if (f.status === "resolved") throw pre("Đánh giá đã phản hồi");
  if (input.status === "acknowledged" && f.status !== "new") throw pre("Đã tiếp nhận");
  const response = input.status === "resolved" ? reasonOf(input.response) : null;
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.update(parentFeedback).set({ status: input.status, ...(response ? { response, respondedBy: ctx.user.id, respondedAt: new Date() } : {}) }).where(eq(parentFeedback.id, f.id));
    if (input.status === "resolved") {
      if (f.careTaskId) await tx.update(careTasks).set({ status: "done", outcome: response, resolvedAt: new Date(), resolvedBy: ctx.user.id }).where(and(eq(careTasks.id, f.careTaskId), inArray(careTasks.status, ["open", "in_progress", "escalated"])));
      await notifyParent(tx, { parentId: f.parentId, studentId: f.studentId, template: "FEEDBACK_REPLY", title: "Trung tâm phản hồi góp ý của anh/chị", body: response!, actorId: ctx.user.id });
    }
    await writeAudit(tx, { actorId: ctx.user.id, action: "TRANSITION", module: "care", entity: "parent_feedback", entityId: f.id, before: { status: f.status }, after: { status: input.status }, reason: response, ip: ctx.ip });
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Khảo sát                                                            */
/* ------------------------------------------------------------------ */

function surveyEditable(ctx: ProtectedContext, centerId: string | null) {
  return centerId ? can(ctx, "care:update", centerId) : ctx.actor.assignments.some((a) => a.centerId === null && can(ctx, "care:update", null)) || ctx.actor.assignments.some((a) => a.role === "SUPER_ADMIN");
}

export async function listSurveys(ctx: ProtectedContext) {
  requirePermission(ctx, "care:read", { centerId: null });
  const v = visibleCenterIds(ctx.actor);
  const rows = await ctx.db.select({ s: surveys, centerCode: centers.code }).from(surveys).leftJoin(centers, eq(centers.id, surveys.centerId))
    .where(v === null ? sql`true` : or(isNull(surveys.centerId), v.length ? inArray(surveys.centerId, v) : sql`false`)).orderBy(asc(surveys.status), desc(surveys.createdAt));
  const ids = rows.map((r) => r.s.id);
  const inv = ids.length ? await ctx.db.select({ surveyId: surveyInvites.surveyId, status: surveyInvites.status, n: sql<number>`count(*)::int` }).from(surveyInvites)
    .where(and(inArray(surveyInvites.surveyId, ids), scopeOn(ctx, surveyInvites.centerId))).groupBy(surveyInvites.surveyId, surveyInvites.status) : [];
  const nps = ids.length ? await ctx.db.select({ surveyId: surveyResponses.surveyId, score: surveyResponses.npsScore }).from(surveyResponses)
    .innerJoin(surveyInvites, eq(surveyInvites.id, surveyResponses.inviteId)).where(and(inArray(surveyResponses.surveyId, ids), scopeOn(ctx, surveyInvites.centerId))) : [];
  return {
    canCreate: ctx.actor.assignments.some((a) => can(ctx, "care:create", a.centerId)),
    items: rows.map((r) => {
      const my = inv.filter((i) => i.surveyId === r.s.id);
      const sent = my.reduce((s, i) => s + i.n, 0);
      const answered = my.filter((i) => i.status === "answered").reduce((s, i) => s + i.n, 0);
      return {
        ...r.s, centerCode: r.centerCode, sent, answered, rate: sent ? Math.round((answered / sent) * 100) : null,
        nps: npsScore(nps.filter((x) => x.surveyId === r.s.id && x.score != null).map((x) => x.score!)),
        canEdit: surveyEditable(ctx, r.s.centerId),
      };
    }),
  };
}

export async function getSurvey(ctx: ProtectedContext, id: string) {
  const s = await ctx.db.query.surveys.findFirst({ where: eq(surveys.id, id) });
  if (!s) throw notFound("Không tìm thấy khảo sát");
  requirePermission(ctx, "care:read", { centerId: s.centerId });
  const inv = await ctx.db.select({ i: surveyInvites, studentName: students.fullName, parentName: parents.fullName, centerCode: centers.code, classCode: classes.code })
    .from(surveyInvites).innerJoin(students, eq(students.id, surveyInvites.studentId)).innerJoin(parents, eq(parents.id, surveyInvites.parentId)).innerJoin(centers, eq(centers.id, surveyInvites.centerId))
    .leftJoin(enrollments, eq(enrollments.id, surveyInvites.enrollmentId)).leftJoin(classes, eq(classes.id, enrollments.classId))
    .where(and(eq(surveyInvites.surveyId, id), scopeOn(ctx, surveyInvites.centerId))).orderBy(desc(surveyInvites.sentAt)).limit(1000);
  const resp = inv.length ? await ctx.db.select().from(surveyResponses).where(inArray(surveyResponses.inviteId, inv.map((x) => x.i.id))) : [];
  const now = Date.now();
  const results = s.questions.map((q) => {
    const vals = resp.map((r) => r.answers[q.id]).filter((v) => v !== null && v !== undefined);
    if (q.type === "nps") return { q, nps: npsScore(vals.map(Number)) };
    if (q.type === "rating") return { q, rating: ratingStats(vals.map(Number)) };
    if (q.type === "choice") return { q, choices: (q.options ?? []).map((o) => ({ option: o, n: vals.filter((v) => v === o).length })) };
    return { q, texts: resp.filter((r) => r.answers[q.id]).map((r) => ({ text: String(r.answers[q.id]), inviteId: r.inviteId })).slice(0, 100) };
  });
  return {
    ...s, canEdit: surveyEditable(ctx, s.centerId), canSend: s.status === "active" && ctx.actor.assignments.some((a) => can(ctx, "care:create", a.centerId)),
    results,
    invites: inv.map((x) => {
      const r = resp.find((y) => y.inviteId === x.i.id);
      const expired = x.i.status !== "answered" && x.i.expiresAt.getTime() < now;
      return { ...x.i, status: expired ? "expired" : x.i.status, studentName: x.studentName, parentName: x.parentName, centerCode: x.centerCode, classCode: x.classCode, npsScore: r?.npsScore ?? null, group: r?.npsScore != null ? npsGroup(r.npsScore) : null, answers: r?.answers ?? null };
    }),
  };
}

export async function upsertSurvey(ctx: ProtectedContext, input: { id?: string; title: string; description?: string | null; centerId: string | null; trigger: SurveyTrigger; triggerValue?: number | null; questions: SurveyQuestion[] }) {
  if (!surveyEditable(ctx, input.centerId)) throw new TRPCError({ code: "FORBIDDEN", message: input.centerId ? "Không có quyền care:update" : "Chỉ Hội sở tạo khảo sát dùng chung — hãy chọn cơ sở" });
  const questions = input.questions.map((q) => ({ ...q, label: q.label.trim(), options: q.type === "choice" ? (q.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined }));
  const errs = validateSurvey({ ...input, questions });
  if (errs.length) throw bad(errs);
  const v = { title: input.title.trim(), description: input.description?.trim() || null, centerId: input.centerId, trigger: input.trigger, triggerValue: input.trigger === "session_n" ? input.triggerValue ?? null : null, questions };
  if (input.id) {
    const s = await ctx.db.query.surveys.findFirst({ where: eq(surveys.id, input.id) });
    if (!s) throw notFound("Không tìm thấy khảo sát");
    if (s.centerId !== input.centerId) throw bad("Không đổi phạm vi khảo sát");
    if (s.status !== "draft") {
      const same = JSON.stringify(s.questions.map((q) => [q.id, q.type, q.options ?? []])) === JSON.stringify(questions.map((q) => [q.id, q.type, q.options ?? []]));
      if (!same) throw pre("Khảo sát đã chạy — chỉ sửa tiêu đề / nội dung câu hỏi, không đổi loại / lựa chọn");
    }
    await ctx.db.update(surveys).set(v).where(eq(surveys.id, s.id));
    await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "care", entity: "surveys", entityId: s.id, after: { title: v.title }, ip: ctx.ip });
    return { id: s.id };
  }
  const [row] = await ctx.db.insert(surveys).values({ ...v, status: "draft", createdBy: ctx.user.id }).returning({ id: surveys.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "care", entity: "surveys", entityId: row!.id, after: { title: v.title, trigger: v.trigger }, ip: ctx.ip });
  return { id: row!.id };
}

export async function setSurveyStatus(ctx: ProtectedContext, input: { id: string; status: SurveyStatus }) {
  const s = await ctx.db.query.surveys.findFirst({ where: eq(surveys.id, input.id) });
  if (!s) throw notFound("Không tìm thấy khảo sát");
  if (!surveyEditable(ctx, s.centerId)) throw new TRPCError({ code: "FORBIDDEN", message: "Không có quyền sửa khảo sát" });
  const ok = (s.status === "draft" && input.status === "active") || (s.status === "active" && input.status === "closed") || (s.status === "closed" && input.status === "active");
  if (!ok) throw pre(`Không chuyển từ "${s.status}" sang "${input.status}"`);
  await ctx.db.update(surveys).set({ status: input.status }).where(eq(surveys.id, s.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "TRANSITION", module: "care", entity: "surveys", entityId: s.id, before: { status: s.status }, after: { status: input.status }, ip: ctx.ip });
  return { ok: true };
}

type Target = { parentId: string; studentId: string; enrollmentId: string | null; centerId: string };

async function createInvites(db: Db, s: typeof surveys.$inferSelect, targets: Target[], source: string, actorId: string | null) {
  if (!targets.length) return { created: 0, skipped: 0 };
  const existing = await db.select({ studentId: surveyInvites.studentId }).from(surveyInvites).where(and(eq(surveyInvites.surveyId, s.id), inArray(surveyInvites.studentId, targets.map((t) => t.studentId))));
  const uniq = [...new Map(targets.map((t) => [t.studentId, t])).values()].filter((t) => !existing.some((e) => e.studentId === t.studentId));
  if (!uniq.length) return { created: 0, skipped: targets.length };
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400e3);
  const rows = await db.insert(surveyInvites).values(uniq.map((t) => ({ surveyId: s.id, ...t, token: randomBytes(18).toString("base64url"), source, expiresAt, createdBy: actorId })))
    .onConflictDoNothing().returning({ id: surveyInvites.id, parentId: surveyInvites.parentId, studentId: surveyInvites.studentId, token: surveyInvites.token });
  if (rows.length) {
    await db.insert(parentNotifications).values(rows.map((r) => ({
      parentId: r.parentId, studentId: r.studentId, channel: "in_app" as const, template: "SURVEY_INVITE", title: "Mời anh/chị góp ý", body: s.title, link: `/ks/${r.token}`, status: "sent" as const, sentAt: new Date(), createdBy: actorId,
    })));
  }
  return { created: rows.length, skipped: targets.length - rows.length };
}

export async function sendSurvey(ctx: ProtectedContext, input: { id: string; classId?: string | null; centerId?: string | null; studentIds?: string[] }) {
  const s = await ctx.db.query.surveys.findFirst({ where: eq(surveys.id, input.id) });
  if (!s) throw notFound("Không tìm thấy khảo sát");
  if (s.status !== "active") throw pre("Kích hoạt khảo sát trước khi gửi");
  const conds: SQL[] = [inArray(enrollments.status, ["active", "trial", "paused"]), scopeOn(ctx, classes.centerId)];
  if (input.classId) conds.push(eq(classes.id, input.classId));
  else if (input.centerId) conds.push(eq(classes.centerId, input.centerId));
  else if (input.studentIds?.length) conds.push(inArray(enrollments.studentId, input.studentIds));
  else throw bad("Chọn lớp, cơ sở hoặc học viên nhận khảo sát");
  if (s.centerId) conds.push(eq(classes.centerId, s.centerId));
  const rows = await ctx.db.select({ enrollmentId: enrollments.id, studentId: enrollments.studentId, centerId: classes.centerId }).from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).where(and(...conds)).limit(2000);
  for (const c of new Set(rows.map((r) => r.centerId))) requirePermission(ctx, "care:create", { centerId: c });
  const guardians = rows.length ? await ctx.db.select({ studentId: studentGuardians.studentId, parentId: studentGuardians.parentId, isPrimary: studentGuardians.isPrimary }).from(studentGuardians).where(inArray(studentGuardians.studentId, rows.map((r) => r.studentId))) : [];
  const targets: Target[] = [];
  let noParent = 0;
  for (const r of rows) {
    const g = guardians.filter((x) => x.studentId === r.studentId).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))[0];
    if (!g) { noParent++; continue; }
    targets.push({ parentId: g.parentId, studentId: r.studentId, enrollmentId: r.enrollmentId, centerId: r.centerId });
  }
  const res = await ctx.db.transaction((tx) => createInvites(tx as unknown as Db, s, targets, "manual", ctx.user.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "care", entity: "survey_invites", entityId: s.id, after: { ...res, noParent, audience: { classId: input.classId, centerId: input.centerId, students: input.studentIds?.length ?? 0 } }, ip: ctx.ip });
  return { ...res, noParent };
}

/** Gọi từ cron: gửi khảo sát theo mốc (sau buổi N, hoàn thành khoá) */
export async function runSurveyTriggers(db: Database): Promise<number> {
  const d = db as unknown as Db;
  const active = await d.select().from(surveys).where(and(eq(surveys.status, "active"), ne(surveys.trigger, "manual")));
  let total = 0;
  for (const s of active) {
    const centerCond = s.centerId ? sql`and c.center_id = ${s.centerId}` : sql``;
    const rows = s.trigger === "session_n"
      ? await d.execute<{ enrollment_id: string; student_id: string; center_id: string; parent_id: string }>(sql`
          select e.id as enrollment_id, e.student_id, c.center_id,
            (select g.parent_id from ${studentGuardians} g where g.student_id = e.student_id order by g.is_primary desc limit 1) as parent_id
          from ${enrollments} e join ${classes} c on c.id = e.class_id
          where e.status in ('active','trial') ${centerCond}
            and (select count(*) from ${attendance} a where a.enrollment_id = e.id and a.status in ('present','late','makeup')) >= ${s.triggerValue ?? 999}
            and not exists (select 1 from ${surveyInvites} i where i.survey_id = ${s.id} and i.student_id = e.student_id)
          limit 500`)
      : await d.execute<{ enrollment_id: string; student_id: string; center_id: string; parent_id: string }>(sql`
          select e.id as enrollment_id, e.student_id, c.center_id,
            (select g.parent_id from ${studentGuardians} g where g.student_id = e.student_id order by g.is_primary desc limit 1) as parent_id
          from ${enrollments} e join ${classes} c on c.id = e.class_id
          where e.status = 'completed' and e.ended_at > now() - interval '14 days' ${centerCond}
            and not exists (select 1 from ${surveyInvites} i where i.survey_id = ${s.id} and i.student_id = e.student_id)
          limit 500`);
    const list = (rows as unknown as { enrollment_id: string; student_id: string; center_id: string; parent_id: string | null }[]).filter((r) => r.parent_id);
    const r = await d.transaction((tx) => createInvites(tx as unknown as Db, s, list.map((x) => ({ parentId: x.parent_id!, studentId: x.student_id, enrollmentId: x.enrollment_id, centerId: x.center_id })), s.trigger, null));
    total += r.created;
  }
  return total;
}

/** Trang công khai /ks/[token] — không cần đăng nhập */
export async function publicSurvey(db: Database, token: string) {
  const d = db as unknown as Db;
  const [x] = await d.select({ i: surveyInvites, s: surveys, studentName: students.fullName, centerName: centers.name })
    .from(surveyInvites).innerJoin(surveys, eq(surveys.id, surveyInvites.surveyId)).innerJoin(students, eq(students.id, surveyInvites.studentId)).innerJoin(centers, eq(centers.id, surveyInvites.centerId))
    .where(eq(surveyInvites.token, token)).limit(1);
  if (!x) return { state: "not_found" as const };
  const firstName = x.studentName.trim().split(/\s+/).slice(-1)[0] ?? "";
  const base = { title: x.s.title, description: x.s.description, studentFirstName: firstName, centerName: x.centerName };
  if (x.i.status === "answered") return { state: "answered" as const, ...base };
  if (x.i.expiresAt.getTime() < Date.now() || x.s.status !== "active") return { state: "expired" as const, ...base };
  if (!x.i.openedAt) await d.update(surveyInvites).set({ openedAt: new Date(), status: "opened" }).where(and(eq(surveyInvites.id, x.i.id), eq(surveyInvites.status, "sent")));
  return { state: "open" as const, ...base, questions: x.s.questions };
}

export async function submitPublicSurvey(db: Database, token: string, answers: SurveyAnswers, ip: string | null) {
  const d = db as unknown as Db;
  const [x] = await d.select({ i: surveyInvites, s: surveys }).from(surveyInvites).innerJoin(surveys, eq(surveys.id, surveyInvites.surveyId)).where(eq(surveyInvites.token, token)).limit(1);
  if (!x) return { ok: false as const, error: "Liên kết không hợp lệ" };
  if (x.i.status === "answered") return { ok: false as const, error: "Anh/chị đã gửi khảo sát này rồi. Cảm ơn!" };
  if (x.i.expiresAt.getTime() < Date.now() || x.s.status !== "active") return { ok: false as const, error: "Khảo sát đã hết hạn" };
  const v = validateAnswers(x.s.questions, answers);
  if (v.errors.length) return { ok: false as const, error: v.errors.join("; ") };
  return d.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    const up = await tx.update(surveyInvites).set({ status: "answered", answeredAt: new Date() }).where(and(eq(surveyInvites.id, x.i.id), ne(surveyInvites.status, "answered"))).returning({ id: surveyInvites.id });
    if (!up.length) return { ok: false as const, error: "Anh/chị đã gửi khảo sát này rồi. Cảm ơn!" };
    const [resp] = await tx.insert(surveyResponses).values({ inviteId: x.i.id, surveyId: x.s.id, answers: v.clean, npsScore: v.nps, ip }).returning({ id: surveyResponses.id });
    if (v.nps != null && npsGroup(v.nps) === "detractor") {
      const taskId = await openCareTask(tx, { studentId: x.i.studentId, enrollmentId: x.i.enrollmentId, centerId: x.i.centerId, code: "LOW_NPS", title: `NPS thấp (${v.nps}/10) — gọi hỏi thăm`, dedupeKey: `nps:${x.i.id}`, hours: 24 });
      await tx.update(surveyResponses).set({ careTaskId: taskId }).where(eq(surveyResponses.id, resp!.id));
      await notifyUsers(tx, await careStaffOf(tx, x.i.centerId), "Phụ huynh chấm NPS thấp", `${x.s.title}: ${v.nps}/10`, `/khao-sat/${x.s.id}`, 1);
    }
    return { ok: true as const };
  });
}

/* ------------------------------------------------------------------ */
/* Thông báo phụ huynh                                                 */
/* ------------------------------------------------------------------ */

export async function listParentNotifications(ctx: ProtectedContext, input: { status?: "queued" | "sent" | "failed" | "read"; channel?: string; template?: string; q?: string; page?: number; hidden?: boolean }) {
  requirePermission(ctx, "care:read", { centerId: null });
  const v = visibleCenterIds(ctx.actor);
  const conds: SQL[] = [input.hidden ? (sql`${parentNotifications.hiddenAt} is not null` as SQL) : (isNull(parentNotifications.hiddenAt) as SQL)];
  if (v !== null) conds.push(v.length ? sql`exists (select 1 from ${students} s where s.id = ${parentNotifications.studentId} and s.home_center_id in ${v})` : sql`false`);
  if (input.status) conds.push(eq(parentNotifications.status, input.status));
  if (input.channel) conds.push(sql`${parentNotifications.channel} = ${input.channel}`);
  if (input.template) conds.push(eq(parentNotifications.template, input.template));
  if (input.q?.trim()) conds.push(or(ilike(parents.fullName, `%${input.q.trim()}%`), ilike(parentNotifications.title, `%${input.q.trim()}%`))!);
  const page = input.page ?? 1;
  const where = conds.length ? and(...conds) : sql`true`;
  const rows = await ctx.db.select({ n: parentNotifications, parentName: parents.fullName, studentName: students.fullName })
    .from(parentNotifications).innerJoin(parents, eq(parents.id, parentNotifications.parentId)).leftJoin(students, eq(students.id, parentNotifications.studentId))
    .where(where).orderBy(desc(parentNotifications.createdAt)).limit(50).offset((page - 1) * 50);
  const [c] = await ctx.db.select({
    total: sql<number>`count(*)::int`,
    queued: sql<number>`count(*) filter (where ${parentNotifications.status} = 'queued')::int`,
    sent: sql<number>`count(*) filter (where ${parentNotifications.status} = 'sent')::int`,
    read: sql<number>`count(*) filter (where ${parentNotifications.status} = 'read')::int`,
    failed: sql<number>`count(*) filter (where ${parentNotifications.status} = 'failed')::int`,
  }).from(parentNotifications).innerJoin(parents, eq(parents.id, parentNotifications.parentId)).where(where);
  const templates = await ctx.db.selectDistinct({ t: parentNotifications.template }).from(parentNotifications).orderBy(asc(parentNotifications.template));
  const [hiddenTotal] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(parentNotifications)
    .innerJoin(parents, eq(parents.id, parentNotifications.parentId))
    .where(and(sql`${parentNotifications.hiddenAt} is not null`, v === null ? sql`true` : v.length ? sql`exists (select 1 from ${students} s where s.id = ${parentNotifications.studentId} and s.home_center_id in ${v})` : sql`false`));
  const broadcasts = await ctx.db.select({ b: notificationBroadcasts, byName: users.fullName }).from(notificationBroadcasts).leftJoin(users, eq(users.id, notificationBroadcasts.createdBy)).orderBy(desc(notificationBroadcasts.createdAt)).limit(10);
  return {
    page, counts: c, templates: templates.map((t) => t.t),
    canSend: ctx.actor.assignments.some((a) => can(ctx, "care:create", a.centerId)),
    canHide: ctx.actor.assignments.some((a) => can(ctx, "care:update", a.centerId)),
    hiddenCount: hiddenTotal?.n ?? 0,
    zns: { configured: (await deliverySettings(ctx.db)).zns.mode !== "off" },
    items: rows.map((r) => ({ ...r.n, parentName: r.parentName, studentName: r.studentName })),
    broadcasts: broadcasts.map((b) => ({ ...b.b, byName: b.byName })),
  };
}

type Audience = { kind: "class"; classId: string } | { kind: "center"; centerId: string } | { kind: "course"; courseId: string; centerId?: string | null };

async function audienceRows(ctx: ProtectedContext, a: Audience) {
  const conds: SQL[] = [inArray(enrollments.status, ["active", "trial", "paused"]), scopeOn(ctx, classes.centerId)];
  if (a.kind === "class") conds.push(eq(classes.id, a.classId));
  if (a.kind === "center") conds.push(eq(classes.centerId, a.centerId));
  if (a.kind === "course") { conds.push(eq(classes.courseId, a.courseId)); if (a.centerId) conds.push(eq(classes.centerId, a.centerId)); }
  const rows = await ctx.db.select({ studentId: students.id, studentName: students.fullName, classCode: classes.code, centerId: classes.centerId, centerName: centers.name })
    .from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).innerJoin(students, eq(students.id, enrollments.studentId)).innerJoin(centers, eq(centers.id, classes.centerId))
    .where(and(...conds)).limit(3000);
  const gs = rows.length ? await ctx.db.select({ studentId: studentGuardians.studentId, parentId: parents.id, parentName: parents.fullName, isPrimary: studentGuardians.isPrimary })
    .from(studentGuardians).innerJoin(parents, eq(parents.id, studentGuardians.parentId)).where(inArray(studentGuardians.studentId, rows.map((r) => r.studentId))) : [];
  const seen = new Set<string>();
  const out: { parentId: string; parentName: string; studentId: string; studentName: string; classCode: string; centerId: string; centerName: string }[] = [];
  let noParent = 0;
  for (const r of rows) {
    const g = gs.filter((x) => x.studentId === r.studentId).sort((x, y) => Number(y.isPrimary) - Number(x.isPrimary))[0];
    if (!g) { noParent++; continue; }
    const k = `${g.parentId}|${r.studentId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ parentId: g.parentId, parentName: g.parentName, ...r });
  }
  return { rows: out, noParent };
}

export async function previewBroadcast(ctx: ProtectedContext, input: { audience: Audience; title: string; body: string }) {
  const { rows, noParent } = await audienceRows(ctx, input.audience);
  const unknown = unknownVars(`${input.title} ${input.body}`);
  const sample = rows.slice(0, 3).map((r) => {
    const p = { ten_ph: r.parentName, ten_hv: r.studentName, lop: r.classCode, co_so: r.centerName };
    return { to: r.parentName, title: renderTemplate(input.title, p).text, body: renderTemplate(input.body, p).text };
  });
  return { recipients: rows.length, noParent, unknownVars: unknown, sample };
}

export async function sendBroadcast(ctx: ProtectedContext, input: { audience: Audience; title: string; body: string; channel: BroadcastChannel; link?: string | null }) {
  if (input.title.trim().length < 3 || input.body.trim().length < 10) throw bad("Tiêu đề ≥ 3 ký tự, nội dung ≥ 10 ký tự");
  const unknown = unknownVars(`${input.title} ${input.body}`);
  if (unknown.length) throw bad(`Biến không hỗ trợ: ${unknown.map((u) => `{${u}}`).join(", ")}`);
  const { rows } = await audienceRows(ctx, input.audience);
  if (!rows.length) throw pre("Không có phụ huynh nào trong đối tượng đã chọn");
  for (const c of new Set(rows.map((r) => r.centerId))) requirePermission(ctx, "care:create", { centerId: c });
  const zns = input.channel === "zns";
  return ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    const [b] = await tx.insert(notificationBroadcasts).values({ title: input.title.trim(), body: input.body.trim(), channel: input.channel, audience: input.audience, recipients: rows.length, createdBy: ctx.user.id }).returning({ id: notificationBroadcasts.id });
    for (let i = 0; i < rows.length; i += 500) {
      await tx.insert(parentNotifications).values(rows.slice(i, i + 500).map((r) => {
        const p = { ten_ph: r.parentName, ten_hv: r.studentName, lop: r.classCode, co_so: r.centerName };
        return {
          parentId: r.parentId, studentId: r.studentId, channel: input.channel, template: "BROADCAST", title: renderTemplate(input.title, p).text, body: renderTemplate(input.body, p).text,
          link: input.link?.trim() || null, params: p, status: (zns ? "queued" : "sent") as "queued" | "sent", sentAt: zns ? null : new Date(), broadcastId: b!.id, createdBy: ctx.user.id,
        };
      }));
    }
    await writeAudit(tx, { actorId: ctx.user.id, action: "CREATE", module: "care", entity: "notification_broadcasts", entityId: b!.id, after: { recipients: rows.length, channel: input.channel, audience: input.audience }, ip: ctx.ip });
    return { id: b!.id, recipients: rows.length, queued: zns ? rows.length : 0 };
  });
}

/**
 * Ẩn / xoá mềm một thông báo đã đăng: phụ huynh không còn thấy trên cổng /ph,
 * bản ghi vẫn giữ để đối chiếu. Bắt buộc lý do ≥5 ký tự, ghi nhật ký.
 * Tin đang "Chờ gửi" thì huỷ luôn (không gửi ra ngoài nữa).
 */
export async function hideNotification(ctx: ProtectedContext, input: { id: string; reason: string; hidden: boolean }) {
  const n = await ctx.db.query.parentNotifications.findFirst({ where: eq(parentNotifications.id, input.id) });
  if (!n) throw notFound("Không tìm thấy thông báo");
  const st = n.studentId ? await ctx.db.query.students.findFirst({ where: eq(students.id, n.studentId), columns: { homeCenterId: true } }) : null;
  requirePermission(ctx, "care:update", { centerId: st?.homeCenterId ?? null });
  const reason = reasonOf(input.reason, 5);
  if (input.hidden && n.hiddenAt) throw pre("Thông báo đã được ẩn");
  if (!input.hidden && !n.hiddenAt) throw pre("Thông báo đang hiển thị");
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.update(parentNotifications)
      .set(input.hidden
        ? { hiddenAt: new Date(), hiddenBy: ctx.user.id, hiddenReason: reason, ...(n.status === "queued" ? { status: "failed" as const, error: `Đã ẩn: ${reason}`, nextAttemptAt: null } : {}) }
        : { hiddenAt: null, hiddenBy: null, hiddenReason: null })
      .where(eq(parentNotifications.id, n.id));
    await writeAudit(tx, {
      actorId: ctx.user.id, action: input.hidden ? "DELETE" : "UPDATE", module: "care", entity: "parent_notifications", entityId: n.id,
      before: { hidden: !!n.hiddenAt, status: n.status, title: n.title }, after: { hidden: input.hidden }, reason, ip: ctx.ip,
    });
  });
  return { ok: true, hidden: input.hidden };
}

export async function retryNotification(ctx: ProtectedContext, input: { id: string }) {
  const n = await ctx.db.query.parentNotifications.findFirst({ where: eq(parentNotifications.id, input.id) });
  if (!n) throw notFound("Không tìm thấy thông báo");
  const st = n.studentId ? await ctx.db.query.students.findFirst({ where: eq(students.id, n.studentId), columns: { homeCenterId: true } }) : null;
  requirePermission(ctx, "care:update", { centerId: st?.homeCenterId ?? null });
  if (n.status !== "failed") throw pre("Chỉ gửi lại thông báo lỗi");
  await ctx.db.update(parentNotifications).set({ status: "queued", error: null }).where(eq(parentNotifications.id, n.id));
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Sinh nhật                                                           */
/* ------------------------------------------------------------------ */

export async function birthdays(ctx: ProtectedContext, input: { days: number; centerId?: string }) {
  requirePermission(ctx, "care:read", { centerId: input.centerId ?? null });
  const today = todayISO();
  const conds: SQL[] = [inArray(students.status, ["active", "trial", "paused"]), sql`${students.dateOfBirth} is not null`, scopeOn(ctx, students.homeCenterId), isNull(students.deletedAt)];
  if (input.centerId) conds.push(eq(students.homeCenterId, input.centerId));
  const rows = await ctx.db.select({ id: students.id, fullName: students.fullName, code: students.code, dob: students.dateOfBirth, centerCode: centers.code, centerId: students.homeCenterId,
    classCodes: sql<string | null>`(select string_agg(c.code, ', ') from ${enrollments} e join ${classes} c on c.id = e.class_id where e.student_id = ${students.id} and e.status in ('active','trial','paused'))`,
  }).from(students).leftJoin(centers, eq(centers.id, students.homeCenterId)).where(and(...conds));
  const items = rows.map((r) => ({ ...r, next: nextBirthday(r.dob!, today) })).filter((r) => r.next.daysUntil <= input.days).sort((a, b) => a.next.daysUntil - b.next.daysUntil);
  const ids = items.map((i) => i.id);
  const greeted = ids.length ? await ctx.db.select({ studentId: birthdayGreetings.studentId, year: birthdayGreetings.year, sentAt: birthdayGreetings.sentAt, byName: users.fullName })
    .from(birthdayGreetings).leftJoin(users, eq(users.id, birthdayGreetings.sentBy)).where(inArray(birthdayGreetings.studentId, ids)) : [];
  const parentsOf = ids.length ? await ctx.db.select({ studentId: studentGuardians.studentId, name: parents.fullName, isPrimary: studentGuardians.isPrimary }).from(studentGuardians).innerJoin(parents, eq(parents.id, studentGuardians.parentId)).where(inArray(studentGuardians.studentId, ids)) : [];
  return {
    today, template: DEFAULT_BIRTHDAY_TEMPLATE,
    items: items.map((i) => {
      const g = greeted.find((x) => x.studentId === i.id && x.year === Number(i.next.date.slice(0, 4)));
      const p = parentsOf.filter((x) => x.studentId === i.id).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))[0];
      return { ...i, parentName: p?.name ?? null, greetedAt: g?.sentAt ?? null, greetedBy: g?.byName ?? null, canGreet: !g && !!p && i.next.daysUntil <= 1 && can(ctx, "care:create", i.centerId) };
    }),
    counts: { today: items.filter((i) => i.next.daysUntil === 0).length, week: items.filter((i) => i.next.daysUntil <= 7).length },
  };
}

export async function sendBirthdayGreeting(ctx: ProtectedContext, input: { studentId: string; message?: string | null }) {
  const st = await ctx.db.query.students.findFirst({ where: eq(students.id, input.studentId) });
  if (!st || !st.dateOfBirth) throw notFound("Không tìm thấy học viên / chưa có ngày sinh");
  requirePermission(ctx, "care:create", { centerId: st.homeCenterId });
  const today = todayISO();
  const nb = nextBirthday(st.dateOfBirth, addDays(today, -1));
  if (nb.daysUntil > 2) throw pre("Chỉ gửi lời chúc vào hôm trước, trong ngày hoặc hôm sau sinh nhật");
  const parent = await primaryParent(ctx.db, st.id);
  if (!parent) throw pre("Học viên chưa có phụ huynh");
  const tpl = input.message?.trim() || DEFAULT_BIRTHDAY_TEMPLATE;
  const unknown = unknownVars(tpl);
  if (unknown.length) throw bad(`Biến không hỗ trợ: ${unknown.join(", ")}`);
  const text = renderTemplate(tpl, { ten_hv: st.nickname || st.fullName, ten_ph: parent.fullName }).text;
  const year = Number(nb.date.slice(0, 4));
  return ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    const ins = await tx.insert(birthdayGreetings).values({ studentId: st.id, year, message: text, sentBy: ctx.user.id }).onConflictDoNothing().returning({ id: birthdayGreetings.id });
    if (!ins.length) throw pre(`Đã gửi lời chúc sinh nhật năm ${year}`);
    await notifyParent(tx, { parentId: parent.id, studentId: st.id, template: "BIRTHDAY", title: `Chúc mừng sinh nhật ${st.nickname || st.fullName}! 🎂`, body: text, actorId: ctx.user.id });
    return { ok: true, message: text };
  });
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export async function careQueues(ctx: ProtectedContext) {
  const out: { key: string; title: string; count: number; overdue: number; href: string }[] = [];
  if (!ctx.actor.assignments.some((a) => can(ctx, "care:read", a.centerId))) return out;
  const [r] = await ctx.db.select({
    n: sql<number>`count(*) filter (where ${parentRequests.status} in ('new','in_progress'))::int`,
    late: sql<number>`count(*) filter (where ${parentRequests.status} in ('new','in_progress') and ${parentRequests.dueAt} < now())::int`,
  }).from(parentRequests).where(scopeOn(ctx, parentRequests.centerId));
  out.push({ key: "parent_requests", title: "Yêu cầu phụ huynh chưa xử lý", count: r?.n ?? 0, overdue: r?.late ?? 0, href: "/parent-requests?status=open" });
  const [f] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(parentFeedback)
    .where(and(scopeOn(ctx, parentFeedback.centerId), ne(parentFeedback.status, "resolved"), sql`least(${parentFeedback.rating}, coalesce(${parentFeedback.teacherRating}, 5)) <= 2`));
  out.push({ key: "low_feedback", title: "Đánh giá thấp chưa phản hồi", count: f?.n ?? 0, overdue: f?.n ?? 0, href: "/parent-feedback?low=1" });
  return out;
}
