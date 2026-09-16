import { and, eq, inArray, sql, asc, desc, or, isNull, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  classes, classSchedules, classEvents, sessions, enrollments, courses, centers, rooms, teachers, holidays, lessons, curricula,
  attendance, userRoles, userNotifications, users, trialBookings, studentGuardians, parentNotifications,
} from "@satarobo/db";
import {
  generateSessions, expectedEndDate, findConflicts, buildClassCode, authorize, addDays,
  classTransition, classEventsFor, classReadiness, canFinishClass, CLASS_APPROVAL_EVENTS, CLASS_REASON_EVENTS, CLASS_EVENT_VI,
  planScheduleChange, checkScheduleDrift, validateWeeklySlots, nextExtraSequence, sessionLabel, requireReason,
  type ScheduleRule, type Weekday, type ClassEvent, type WeeklySlot, type ExistingSession, type SessionKind, type ClassStatus,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { todayISO } from "./sessions";

type Db = ProtectedContext["db"];

function precondition(msg: string | string[]) {
  const m = Array.isArray(msg) ? msg.join("; ") : msg;
  return new TRPCError({ code: "PRECONDITION_FAILED", message: m });
}

function reasonOrThrow(reason: string | null | undefined) {
  try {
    return requireReason(reason);
  } catch (e) {
    throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
  }
}

const fmt = (d: string) => d.split("-").reverse().join("/");

/** Lỗi ràng buộc trùng phòng/GV của Postgres → thông báo dễ hiểu */
function mapExclusion(e: unknown): never {
  const msg = String((e as { message?: string })?.message ?? "");
  const code = (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  if (code === "23P01" || msg.includes("sessions_no_room_overlap") || msg.includes("sessions_no_teacher_overlap")) {
    throw new TRPCError({ code: "CONFLICT", message: msg.includes("teacher") ? "Trùng lịch giáo viên với buổi khác" : "Trùng phòng với buổi khác" });
  }
  throw e;
}

async function loadClass(db: Db, id: string) {
  const c = await db.query.classes.findFirst({ where: and(eq(classes.id, id), isNull(classes.deletedAt)) });
  if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy lớp" });
  return c;
}

async function holidayDates(db: Db, centerId: string) {
  const rows = await db.select({ date: holidays.date }).from(holidays).where(or(eq(holidays.centerId, centerId), isNull(holidays.centerId))!);
  return rows.map((h) => h.date);
}

async function notifyUsers(db: Db, userIds: (string | null | undefined)[], title: string, body: string, link: string, priority = 2) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (ids.length) await db.insert(userNotifications).values(ids.map((userId) => ({ userId, title, body, link, priority })));
}

async function teacherUserIds(db: Db, teacherIds: (string | null | undefined)[]) {
  const ids = [...new Set(teacherIds.filter((x): x is string => !!x))];
  if (!ids.length) return [];
  return (await db.select({ u: teachers.userId }).from(teachers).where(inArray(teachers.id, ids))).map((r) => r.u);
}

async function centerManagers(db: Db, centerId: string) {
  return (await db.select({ u: userRoles.userId }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.role, "CENTER_MANAGER"), eq(userRoles.centerId, centerId), eq(users.isActive, true)))).map((r) => r.u);
}

/** Buổi hiện có (lớp khác) trùng ngày với danh sách dự kiến → xung đột phòng/GV */
async function conflictsWith(db: Db, planned: { id: string; date: string; startTime: string; endTime: string; roomId: string | null; teacherId: string | null }[], excludeClassId: string | null, excludeSessionIds: string[] = []) {
  if (!planned.length) return [];
  const conds = [inArray(sessions.date, [...new Set(planned.map((p) => p.date))]), sql`${sessions.status} not in ('cancelled','rescheduled')`];
  if (excludeSessionIds.length) conds.push(sql`${sessions.id} not in (${sql.join(excludeSessionIds.map((i) => sql`${i}`), sql`, `)})`);
  const existing = await db
    .select({ id: sessions.id, date: sessions.date, startTime: sessions.startTime, endTime: sessions.endTime, roomId: sessions.roomId, teacherId: sessions.teacherId, classId: sessions.classId, classCode: classes.code })
    .from(sessions).innerJoin(classes, eq(classes.id, sessions.classId))
    .where(and(...conds));
  void excludeClassId; // buổi còn lại của chính lớp cũng phải được kiểm tra
  const others = existing;
  const all = [
    ...others.map((e) => ({ id: `old:${e.id}`, date: e.date, startTime: e.startTime.slice(0, 5), endTime: e.endTime.slice(0, 5), roomId: e.roomId, teacherId: e.teacherId })),
    ...planned.map((p) => ({ ...p, id: `new:${p.id}` })),
  ];
  const byId = new Map(others.map((e) => [`old:${e.id}`, e.classCode]));
  return findConflicts(all)
    .filter((c) => c.a.startsWith("new:") || c.b.startsWith("new:"))
    .map((c) => ({ kind: c.kind, date: c.date, with: byId.get(c.a) ?? byId.get(c.b) ?? "buổi khác trong đợt này" }));
}

function conflictMessage(list: { kind: string; date: string; with: string }[]) {
  const c = list[0]!;
  return `Trùng ${c.kind === "room" ? "phòng" : "giáo viên"} ngày ${fmt(c.date)} với ${c.with}${list.length > 1 ? ` (+${list.length - 1} xung đột khác)` : ""}`;
}

/* ------------------------------------------------------------------ */
/* Sinh buổi khi mở lớp                                                */
/* ------------------------------------------------------------------ */

async function plannedForClass(db: Db, cls: typeof classes.$inferSelect) {
  const course = await db.query.courses.findFirst({ where: eq(courses.id, cls.courseId) });
  const total = cls.plannedSessions ?? course?.totalSessions ?? 0;
  const phases = await db.select().from(classSchedules).where(eq(classSchedules.classId, cls.id));
  const curriculumId = cls.curriculumId ?? (await db.query.curricula.findFirst({ where: and(eq(curricula.courseId, cls.courseId), eq(curricula.isActive, true)) }))?.id ?? null;
  const lessonRows = curriculumId ? await db.select({ id: lessons.id, title: lessons.title }).from(lessons).where(eq(lessons.curriculumId, curriculumId)).orderBy(asc(lessons.sequenceNo)) : [];
  const errs = classReadiness({ scheduleCount: phases.length, startDate: cls.startDate, leadTeacherId: cls.leadTeacherId, capacity: cls.capacity, minCapacity: cls.minCapacity, totalSessions: total });
  if (errs.length) throw precondition(errs);
  const rules: ScheduleRule[] = phases.map((p) => ({
    weekday: p.weekday as Weekday, startTime: p.startTime.slice(0, 5), endTime: p.endTime.slice(0, 5),
    roomId: p.roomId ?? cls.homeRoomId ?? null, teacherId: p.teacherId ?? cls.leadTeacherId ?? null, effectiveFrom: p.effectiveFrom, effectiveTo: p.effectiveTo,
  }));
  let planned;
  try {
    planned = generateSessions({ classId: cls.id, startDate: cls.startDate!, totalSessions: total, rules, holidays: await holidayDates(db, cls.centerId), lessonIds: lessonRows.map((l) => l.id) });
  } catch (e) {
    throw precondition((e as Error).message);
  }
  return { planned, curriculumId, lessonTitles: new Map(lessonRows.map((l) => [l.id, l.title])) };
}

async function generateSessionsFor(tx: Db, cls: typeof classes.$inferSelect, actorId: string) {
  const [existing] = await tx.select({ n: sql<number>`count(*)::int` }).from(sessions).where(and(eq(sessions.classId, cls.id), eq(sessions.kind, "regular")));
  if ((existing?.n ?? 0) > 0) return { created: 0, endDate: cls.expectedEndDate };
  const { planned, curriculumId, lessonTitles } = await plannedForClass(tx, cls);
  const conflicts = await conflictsWith(tx, planned.map((p, i) => ({ id: String(i), date: p.date, startTime: p.startTime, endTime: p.endTime, roomId: p.roomId, teacherId: p.teacherId })), cls.id);
  if (conflicts.length) throw new TRPCError({ code: "CONFLICT", message: conflictMessage(conflicts) });
  await tx.insert(sessions).values(planned.map((p) => ({ ...p, classId: cls.id, kind: "regular" as const, topic: p.lessonId ? lessonTitles.get(p.lessonId) ?? null : null, createdBy: actorId })));
  const endDate = expectedEndDate(planned);
  await tx.update(classes).set({ expectedEndDate: endDate, curriculumId }).where(eq(classes.id, cls.id));
  return { created: planned.length, endDate };
}

/* ------------------------------------------------------------------ */
/* Tạo lớp                                                             */
/* ------------------------------------------------------------------ */

export interface CreateClassInput {
  name: string;
  courseId: string;
  curriculumId?: string | null;
  centerId: string;
  homeRoomId?: string | null;
  leadTeacherId?: string | null;
  assistantTeacherId?: string | null;
  capacity?: number;
  minCapacity?: number;
  description?: string | null;
  startDate: string;
  totalSessions?: number;
  schedules: { weekday: number; startTime: string; endTime: string; roomId?: string | null; teacherId?: string | null }[];
  /** draft = lưu nháp; submit = gửi duyệt; open = mở lớp ngay (cần quyền duyệt). Mặc định: open nếu có quyền duyệt, ngược lại submit */
  mode?: "draft" | "submit" | "open";
}

export async function createClass(ctx: ProtectedContext, input: CreateClassInput) {
  requirePermission(ctx, "class:create", { centerId: input.centerId });
  const canApprove = authorize(ctx.actor, "class:approve", { centerId: input.centerId }).allowed;
  const mode = input.mode ?? (canApprove ? "open" : "submit");
  if (mode === "open" && !canApprove) throw new TRPCError({ code: "FORBIDDEN", message: "Chỉ người có quyền duyệt lớp mới mở lớp ngay — hãy gửi duyệt" });
  const course = await ctx.db.query.courses.findFirst({ where: eq(courses.id, input.courseId) });
  const center = await ctx.db.query.centers.findFirst({ where: eq(centers.id, input.centerId) });
  if (!course || !center) throw new TRPCError({ code: "BAD_REQUEST", message: "Khoá học / cơ sở không hợp lệ" });
  const slotErrs = validateWeeklySlots(input.schedules.map((s) => ({ weekday: s.weekday as Weekday, startTime: s.startTime, endTime: s.endTime, roomId: null, teacherId: null })));
  if (slotErrs.length) throw new TRPCError({ code: "BAD_REQUEST", message: slotErrs.join("; ") });
  const year = Number(input.startDate.slice(0, 4));

  try {
    return await ctx.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"classcode:" + input.centerId + ":" + input.courseId}))`);
      const [cnt] = await tx.select({ n: sql<number>`count(*)::int` }).from(classes).where(and(eq(classes.centerId, input.centerId), eq(classes.courseId, input.courseId)));
      const code = buildClassCode(center.code, course.code, year, (cnt?.n ?? 0) + 1);
      const status: ClassStatus = mode === "draft" ? "draft" : "pending_approval";
      const [cls] = await tx.insert(classes).values({
        code, name: input.name, courseId: input.courseId, curriculumId: input.curriculumId ?? null, centerId: input.centerId, homeRoomId: input.homeRoomId ?? null,
        leadTeacherId: input.leadTeacherId ?? null, assistantTeacherId: input.assistantTeacherId ?? null, capacity: input.capacity ?? 12, minCapacity: input.minCapacity ?? 1,
        description: input.description ?? null, plannedSessions: input.totalSessions ?? course.totalSessions, startDate: input.startDate, status,
        ...(mode !== "draft" ? { submittedAt: new Date(), submittedBy: ctx.user.id } : {}),
      }).returning();
      await tx.insert(classSchedules).values(input.schedules.map((s) => ({
        classId: cls!.id, weekday: s.weekday, startTime: s.startTime, endTime: s.endTime,
        roomId: s.roomId ?? input.homeRoomId ?? null, teacherId: s.teacherId ?? input.leadTeacherId ?? null, effectiveFrom: input.startDate, effectiveTo: null, createdBy: ctx.user.id,
      })));
      await tx.insert(classEvents).values({ classId: cls!.id, event: "create", toStatus: status, actorId: ctx.user.id, meta: { mode } });
      let created = 0;
      let final = cls!;
      if (mode === "submit") {
        const errs = classReadiness({ scheduleCount: input.schedules.length, startDate: input.startDate, leadTeacherId: input.leadTeacherId ?? null, capacity: cls!.capacity, minCapacity: cls!.minCapacity, totalSessions: cls!.plannedSessions ?? 0 });
        if (errs.length) throw precondition(errs);
        await tx.insert(classEvents).values({ classId: cls!.id, event: "submit", fromStatus: "draft", toStatus: "pending_approval", actorId: ctx.user.id });
        await notifyUsers(tx as unknown as Db, await centerManagers(tx as unknown as Db, cls!.centerId), "Lớp mới chờ duyệt", `${code} — ${input.name}`, `/classes/${cls!.id}`);
      }
      if (mode === "open") {
        const r = await generateSessionsFor(tx as unknown as Db, cls!, ctx.user.id);
        created = r.created;
        const up = await tx.update(classes).set({ status: "recruiting", approvedAt: new Date(), approvedBy: ctx.user.id }).where(eq(classes.id, cls!.id)).returning();
        final = up[0]!;
        await tx.insert(classEvents).values({ classId: cls!.id, event: "approve", fromStatus: "pending_approval", toStatus: "recruiting", actorId: ctx.user.id, meta: { sessions: created, direct: true } });
      }
      await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "academics", entity: "classes", entityId: cls!.id, after: { code, mode, sessions: created }, ip: ctx.ip });
      return { ...final, sessionsCreated: created };
    });
  } catch (e) {
    mapExclusion(e);
  }
}

/* ------------------------------------------------------------------ */
/* Vòng đời lớp                                                        */
/* ------------------------------------------------------------------ */

export async function transitionClass(ctx: ProtectedContext, input: { classId: string; event: ClassEvent; reason?: string | null }) {
  const cls = await loadClass(ctx.db, input.classId);
  const perm = CLASS_APPROVAL_EVENTS.includes(input.event) || (input.event === "cancel" && cls.status !== "draft") ? "class:approve" : "class:update";
  requirePermission(ctx, perm, { centerId: cls.centerId });
  const to = classTransition(cls.status, input.event);
  const reason = CLASS_REASON_EVENTS.includes(input.event) ? reasonOrThrow(input.reason) : input.reason?.trim() || null;
  const [act] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(enrollments).where(and(eq(enrollments.classId, cls.id), inArray(enrollments.status, ["active", "trial", "paused"])));
  const activeEnrollments = act?.n ?? 0;

  if (input.event === "cancel" && activeEnrollments > 0) throw precondition(`Lớp còn ${activeEnrollments} học viên đang ghi danh — chuyển lớp cho các em trước khi huỷ`);
  if (input.event === "start") {
    const [n] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(sessions).where(eq(sessions.classId, cls.id));
    if (!n?.n) throw precondition("Lớp chưa có buổi học");
    if (activeEnrollments < cls.minCapacity && !reason) throw precondition(`Lớp mới có ${activeEnrollments}/${cls.minCapacity} học viên tối thiểu — nhập lý do để vẫn bắt đầu`);
  }
  if (input.event === "finish") {
    const [open] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(sessions)
      .where(and(eq(sessions.classId, cls.id), eq(sessions.kind, "regular"), inArray(sessions.status, ["scheduled", "in_progress", "attendance_done", "notes_done"])));
    const m = canFinishClass(open?.n ?? 0);
    if (m) throw precondition(m);
  }
  if (input.event === "submit") {
    const [ph] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(classSchedules).where(eq(classSchedules.classId, cls.id));
    const course = await ctx.db.query.courses.findFirst({ where: eq(courses.id, cls.courseId) });
    const errs = classReadiness({ scheduleCount: ph?.n ?? 0, startDate: cls.startDate, leadTeacherId: cls.leadTeacherId, capacity: cls.capacity, minCapacity: cls.minCapacity, totalSessions: cls.plannedSessions ?? course?.totalSessions ?? 0 });
    if (errs.length) throw precondition(errs);
  }

  let created = 0;
  try {
    await ctx.db.transaction(async (tx) => {
      const upd = await tx.update(classes).set({
        status: to,
        statusReason: reason,
        ...(input.event === "submit" ? { submittedAt: new Date(), submittedBy: ctx.user.id } : {}),
        ...(input.event === "approve" ? { approvedAt: new Date(), approvedBy: ctx.user.id } : {}),
      }).where(and(eq(classes.id, cls.id), eq(classes.status, cls.status))).returning({ id: classes.id });
      if (!upd.length) throw new TRPCError({ code: "CONFLICT", message: "Lớp vừa được cập nhật bởi người khác — tải lại trang" });
      if (input.event === "approve") created = (await generateSessionsFor(tx as unknown as Db, { ...cls, status: to }, ctx.user.id)).created;
      if (input.event === "cancel") {
        await tx.update(sessions).set({ status: "cancelled" }).where(and(eq(sessions.classId, cls.id), eq(sessions.status, "scheduled")));
      }
      await tx.insert(classEvents).values({ classId: cls.id, event: input.event, fromStatus: cls.status, toStatus: to, reason, actorId: ctx.user.id, meta: created ? { sessions: created } : null });
      await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "academics", entity: "classes", entityId: cls.id, before: { status: cls.status }, after: { status: to, event: input.event, sessions: created || undefined }, reason, ip: ctx.ip });
      const link = `/classes/${cls.id}`;
      if (input.event === "submit") await notifyUsers(tx as unknown as Db, await centerManagers(tx as unknown as Db, cls.centerId), "Lớp mới chờ duyệt", `${cls.code} — ${cls.name}`, link);
      if (input.event === "approve") await notifyUsers(tx as unknown as Db, [cls.submittedBy, ...(await teacherUserIds(tx as unknown as Db, [cls.leadTeacherId, cls.assistantTeacherId]))], "Lớp đã được duyệt mở", `${cls.code} — đã sinh ${created} buổi học`, link);
      if (input.event === "reject") await notifyUsers(tx as unknown as Db, [cls.submittedBy], "Lớp bị trả về nháp", `${cls.code}: ${reason}`, link, 1);
      if (input.event === "cancel") await notifyUsers(tx as unknown as Db, await teacherUserIds(tx as unknown as Db, [cls.leadTeacherId, cls.assistantTeacherId]), "Lớp đã huỷ", `${cls.code}: ${reason}`, link);
    });
  } catch (e) {
    mapExclusion(e);
  }
  return { status: to, sessionsCreated: created };
}

/* ------------------------------------------------------------------ */
/* Thông tin lớp                                                       */
/* ------------------------------------------------------------------ */

export interface UpdateClassInfo {
  id: string;
  name: string;
  description?: string | null;
  homeRoomId?: string | null;
  leadTeacherId?: string | null;
  assistantTeacherId?: string | null;
  capacity: number;
  minCapacity: number;
  startDate?: string | null;
  plannedSessions?: number | null;
  /** Đổi GV chính: áp cho các buổi chưa diễn ra đang do GV cũ đứng */
  applyTeacherToFuture?: boolean;
}

export async function updateClassInfo(ctx: ProtectedContext, input: UpdateClassInfo) {
  const cls = await loadClass(ctx.db, input.id);
  requirePermission(ctx, "class:update", { centerId: cls.centerId });
  if (cls.status === "finished" || cls.status === "cancelled") throw precondition("Lớp đã kết thúc / huỷ — không sửa thông tin");
  if (input.minCapacity > input.capacity) throw new TRPCError({ code: "BAD_REQUEST", message: "Sĩ số tối thiểu không được lớn hơn tối đa" });
  if (input.leadTeacherId && input.leadTeacherId === input.assistantTeacherId) throw new TRPCError({ code: "BAD_REQUEST", message: "Trợ giảng phải khác giáo viên chính" });
  const [act] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(enrollments).where(and(eq(enrollments.classId, cls.id), inArray(enrollments.status, ["active", "trial"])));
  if (input.capacity < (act?.n ?? 0)) throw precondition(`Lớp đang có ${act?.n} học viên — sĩ số tối đa không thể nhỏ hơn`);
  const planning = cls.status === "draft" || cls.status === "pending_approval";
  if (!planning && ((input.startDate && input.startDate !== cls.startDate) || (input.plannedSessions && input.plannedSessions !== cls.plannedSessions))) {
    throw precondition("Lớp đã mở — đổi ngày khai giảng / số buổi bằng 'Áp lịch mới' hoặc thêm buổi");
  }
  // phòng / GV phải thuộc cơ sở của lớp
  const tIds = [input.leadTeacherId, input.assistantTeacherId].filter((x): x is string => !!x);
  if (tIds.length) {
    const ts = await ctx.db.select({ id: teachers.id, centerId: teachers.centerId, isActive: teachers.isActive }).from(teachers).where(inArray(teachers.id, tIds));
    if (ts.length !== new Set(tIds).size || ts.some((t) => !t.isActive)) throw new TRPCError({ code: "BAD_REQUEST", message: "Giáo viên không hợp lệ hoặc đã ngưng" });
  }
  if (input.homeRoomId) {
    const r = await ctx.db.query.rooms.findFirst({ where: eq(rooms.id, input.homeRoomId) });
    if (!r || r.centerId !== cls.centerId) throw new TRPCError({ code: "BAD_REQUEST", message: "Phòng không thuộc cơ sở của lớp" });
  }
  const today = todayISO();
  const teacherChanged = (input.leadTeacherId ?? null) !== cls.leadTeacherId;
  let movedSessions = 0;
  const after = {
    name: input.name.trim(), description: input.description?.trim() || null, homeRoomId: input.homeRoomId ?? null,
    leadTeacherId: input.leadTeacherId ?? null, assistantTeacherId: input.assistantTeacherId ?? null, capacity: input.capacity, minCapacity: input.minCapacity,
    ...(planning ? { startDate: input.startDate ?? cls.startDate, plannedSessions: input.plannedSessions ?? cls.plannedSessions } : {}),
  };
  try {
    await ctx.db.transaction(async (tx) => {
      await tx.update(classes).set(after).where(eq(classes.id, cls.id));
      if (planning && input.startDate && input.startDate !== cls.startDate) {
        // lịch nháp: dời mốc hiệu lực giai đoạn đầu theo khai giảng mới
        await tx.update(classSchedules).set({ effectiveFrom: input.startDate }).where(and(eq(classSchedules.classId, cls.id), eq(classSchedules.effectiveFrom, cls.startDate ?? input.startDate)));
      }
      if (teacherChanged && input.applyTeacherToFuture && input.leadTeacherId) {
        await tx.execute(sql`set constraints sessions_no_teacher_overlap deferred`);
        const conds = [eq(sessions.classId, cls.id), eq(sessions.status, "scheduled"), sql`${sessions.date} > ${today}::date`];
        conds.push(cls.leadTeacherId ? or(eq(sessions.teacherId, cls.leadTeacherId), isNull(sessions.teacherId))! : isNull(sessions.teacherId));
        const future = await tx.select({ id: sessions.id, date: sessions.date, startTime: sessions.startTime, endTime: sessions.endTime }).from(sessions).where(and(...conds));
        const conflicts = await conflictsWith(tx as unknown as Db, future.map((f) => ({ id: f.id, date: f.date, startTime: f.startTime.slice(0, 5), endTime: f.endTime.slice(0, 5), roomId: null, teacherId: input.leadTeacherId! })), cls.id, future.map((f) => f.id));
        if (conflicts.length) throw new TRPCError({ code: "CONFLICT", message: `Giáo viên mới bận: ${conflictMessage(conflicts)}` });
        if (future.length) await tx.update(sessions).set({ teacherId: input.leadTeacherId }).where(inArray(sessions.id, future.map((f) => f.id)));
        await tx.update(classSchedules).set({ teacherId: input.leadTeacherId }).where(and(eq(classSchedules.classId, cls.id), or(isNull(classSchedules.effectiveTo), gte(classSchedules.effectiveTo, today))!));
        movedSessions = future.length;
        await notifyUsers(tx as unknown as Db, await teacherUserIds(tx as unknown as Db, [input.leadTeacherId]), "Bạn được phân dạy lớp", `${cls.code} — ${movedSessions} buổi sắp tới`, `/teacher/classes`);
        await notifyUsers(tx as unknown as Db, await teacherUserIds(tx as unknown as Db, [cls.leadTeacherId]), "Bàn giao lớp", `${cls.code} đã chuyển cho giáo viên khác từ buổi tới`, `/teacher/classes`);
      }
      if (teacherChanged || (input.assistantTeacherId ?? null) !== cls.assistantTeacherId) {
        await tx.insert(classEvents).values({ classId: cls.id, event: "teacher_change", actorId: ctx.user.id, meta: { lead: [cls.leadTeacherId, input.leadTeacherId ?? null], assistant: [cls.assistantTeacherId, input.assistantTeacherId ?? null], movedSessions } });
      }
      await writeAudit(tx as unknown as Db, {
        actorId: ctx.user.id, action: "UPDATE", module: "academics", entity: "classes", entityId: cls.id,
        before: { name: cls.name, description: cls.description, homeRoomId: cls.homeRoomId, leadTeacherId: cls.leadTeacherId, assistantTeacherId: cls.assistantTeacherId, capacity: cls.capacity, minCapacity: cls.minCapacity, startDate: cls.startDate, plannedSessions: cls.plannedSessions },
        after: { ...after, movedSessions }, ip: ctx.ip,
      });
    });
  } catch (e) {
    mapExclusion(e);
  }
  return { ok: true, movedSessions };
}

/** Lịch nháp (lớp chưa mở): thay toàn bộ ca học */
export async function saveDraftSchedule(ctx: ProtectedContext, input: { classId: string; slots: WeeklySlot[] }) {
  const cls = await loadClass(ctx.db, input.classId);
  requirePermission(ctx, "class:update", { centerId: cls.centerId });
  if (cls.status !== "draft" && cls.status !== "pending_approval") throw precondition("Lớp đã mở — dùng 'Áp lịch mới' để đổi lịch");
  const errs = validateWeeklySlots(input.slots);
  if (errs.length) throw new TRPCError({ code: "BAD_REQUEST", message: errs.join("; ") });
  if (!cls.startDate) throw precondition("Nhập ngày khai giảng trước");
  const before = await ctx.db.select().from(classSchedules).where(eq(classSchedules.classId, cls.id));
  await ctx.db.transaction(async (tx) => {
    await tx.delete(classSchedules).where(eq(classSchedules.classId, cls.id));
    await tx.insert(classSchedules).values(input.slots.map((s) => ({ classId: cls.id, ...s, roomId: s.roomId ?? cls.homeRoomId, teacherId: s.teacherId ?? cls.leadTeacherId, effectiveFrom: cls.startDate!, effectiveTo: null, createdBy: ctx.user.id })));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "academics", entity: "class_schedules", entityId: cls.id, before: { slots: before.map((b) => `${b.weekday} ${b.startTime}`) }, after: { slots: input.slots.map((b) => `${b.weekday} ${b.startTime}`) }, ip: ctx.ip });
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Áp lịch mới / kiểm tra lệch lịch                                    */
/* ------------------------------------------------------------------ */

async function existingForPlan(db: Db, classId: string): Promise<(ExistingSession & { trials: number })[]> {
  const rows = await db
    .select({
      id: sessions.id, sequenceNo: sessions.sequenceNo, date: sessions.date, startTime: sessions.startTime, endTime: sessions.endTime, status: sessions.status, kind: sessions.kind,
      roomId: sessions.roomId, teacherId: sessions.teacherId, rescheduledFromId: sessions.rescheduledFromId,
      marks: sql<number>`(select count(*)::int from ${attendance} a where a.session_id = ${sql.raw('"sessions"."id"')})`,
      trials: sql<number>`(select count(*)::int from ${trialBookings} tb where tb.session_id = ${sql.raw('"sessions"."id"')} and tb.status = 'booked')`,
    })
    .from(sessions).where(eq(sessions.classId, classId)).orderBy(asc(sessions.sequenceNo));
  return rows.map((r) => ({ ...r, startTime: r.startTime.slice(0, 5), endTime: r.endTime.slice(0, 5), hasAttendance: r.marks > 0, moved: !!r.rescheduledFromId }));
}

async function namesFor(db: Db, roomIds: (string | null)[], teacherIds: (string | null)[]) {
  const r = [...new Set(roomIds.filter((x): x is string => !!x))];
  const t = [...new Set(teacherIds.filter((x): x is string => !!x))];
  const [rs, ts] = await Promise.all([
    r.length ? db.select({ id: rooms.id, code: rooms.code }).from(rooms).where(inArray(rooms.id, r)) : [],
    t.length ? db.select({ id: teachers.id, name: teachers.fullName }).from(teachers).where(inArray(teachers.id, t)) : [],
  ]);
  return { room: new Map(rs.map((x) => [x.id, x.code])), teacher: new Map(ts.map((x) => [x.id, x.name])) };
}

async function buildPlan(ctx: ProtectedContext, input: { classId: string; slots: WeeklySlot[]; fromDate: string }) {
  const cls = await loadClass(ctx.db, input.classId);
  requirePermission(ctx, "class:update", { centerId: cls.centerId });
  if (cls.status !== "recruiting" && cls.status !== "running") throw precondition("Chỉ áp lịch mới cho lớp đang tuyển sinh / đang chạy");
  const slots = input.slots.map((s) => ({ ...s, roomId: s.roomId ?? cls.homeRoomId, teacherId: s.teacherId ?? cls.leadTeacherId }));
  const existing = await existingForPlan(ctx.db, cls.id);
  const plan = planScheduleChange({ sessions: existing, slots, fromDate: input.fromDate, today: todayISO(), holidays: await holidayDates(ctx.db, cls.centerId) });
  const changed = plan.changes.filter((c) => c.changed);
  const conflicts = plan.errors.length ? [] : await conflictsWith(ctx.db, changed.map((c) => ({ id: c.sessionId, ...c.to })), cls.id, plan.changes.map((c) => c.sessionId));
  const names = await namesFor(ctx.db, [...plan.changes.flatMap((c) => [c.from.roomId, c.to.roomId])], [...plan.changes.flatMap((c) => [c.from.teacherId, c.to.teacherId])]);
  const trialsById = new Map(existing.map((e) => [e.id, e.trials]));
  return {
    cls,
    slots,
    plan,
    conflicts,
    view: {
      errors: plan.errors,
      warnings: [
        ...plan.warnings,
        ...(changed.some((c) => (trialsById.get(c.sessionId) ?? 0) > 0) ? [`${changed.filter((c) => (trialsById.get(c.sessionId) ?? 0) > 0).length} buổi thay đổi đang có khách học thử — nhớ báo lại phụ huynh`] : []),
      ],
      conflicts,
      movable: plan.movable,
      changedCount: changed.length,
      oldEndDate: cls.expectedEndDate,
      newEndDate: plan.newEndDate,
      changes: plan.changes.map((c) => ({
        ...c,
        trials: trialsById.get(c.sessionId) ?? 0,
        fromRoom: c.from.roomId ? names.room.get(c.from.roomId) ?? null : null,
        toRoom: c.to.roomId ? names.room.get(c.to.roomId) ?? null : null,
        fromTeacher: c.from.teacherId ? names.teacher.get(c.from.teacherId) ?? null : null,
        toTeacher: c.to.teacherId ? names.teacher.get(c.to.teacherId) ?? null : null,
      })),
    },
  };
}

export async function previewScheduleChange(ctx: ProtectedContext, input: { classId: string; slots: WeeklySlot[]; fromDate: string }) {
  return (await buildPlan(ctx, input)).view;
}

export async function applyScheduleChange(ctx: ProtectedContext, input: { classId: string; slots: WeeklySlot[]; fromDate: string; reason: string; notifyParents?: boolean }) {
  const reason = reasonOrThrow(input.reason);
  const { cls, slots, plan, conflicts } = await buildPlan(ctx, input);
  if (plan.errors.length) throw precondition(plan.errors);
  if (conflicts.length) throw new TRPCError({ code: "CONFLICT", message: conflictMessage(conflicts) });
  const changed = plan.changes.filter((c) => c.changed);
  const closeTo = addDays(input.fromDate, -1);
  try {
    await ctx.db.transaction(async (tx) => {
      await tx.execute(sql`set constraints sessions_no_room_overlap, sessions_no_teacher_overlap deferred`);
      // Giai đoạn bắt đầu từ ngày áp dụng trở đi bị thay thế; giai đoạn đang mở được đóng lại
      await tx.delete(classSchedules).where(and(eq(classSchedules.classId, cls.id), gte(classSchedules.effectiveFrom, input.fromDate)));
      await tx.update(classSchedules).set({ effectiveTo: closeTo })
        .where(and(eq(classSchedules.classId, cls.id), or(isNull(classSchedules.effectiveTo), gte(classSchedules.effectiveTo, input.fromDate))!));
      await tx.insert(classSchedules).values(slots.map((s) => ({ classId: cls.id, weekday: s.weekday, startTime: s.startTime, endTime: s.endTime, roomId: s.roomId, teacherId: s.teacherId, effectiveFrom: input.fromDate, effectiveTo: null, changeReason: reason, createdBy: ctx.user.id })));
      for (const c of changed) {
        const upd = await tx.update(sessions).set({ date: c.to.date, startTime: c.to.startTime, endTime: c.to.endTime, roomId: c.to.roomId, teacherId: c.to.teacherId })
          .where(and(eq(sessions.id, c.sessionId), eq(sessions.status, "scheduled"))).returning({ id: sessions.id });
        if (!upd.length) throw new TRPCError({ code: "CONFLICT", message: `Buổi ${c.sequenceNo} vừa thay đổi trạng thái — xem trước lại` });
      }
      await tx.update(classes).set({ expectedEndDate: plan.newEndDate }).where(eq(classes.id, cls.id));
      await tx.insert(classEvents).values({ classId: cls.id, event: "reschedule", fromStatus: cls.status, toStatus: cls.status, reason, actorId: ctx.user.id, meta: { fromDate: input.fromDate, changed: changed.length, movable: plan.movable, newEndDate: plan.newEndDate } });
      await writeAudit(tx as unknown as Db, {
        actorId: ctx.user.id, action: "UPDATE", module: "academics", entity: "class_schedules", entityId: cls.id,
        before: { expectedEndDate: cls.expectedEndDate }, after: { fromDate: input.fromDate, changed: changed.length, expectedEndDate: plan.newEndDate, slots: slots.map((s) => `${s.weekday} ${s.startTime}-${s.endTime}`) }, reason, ip: ctx.ip,
      });
      const tUsers = await teacherUserIds(tx as unknown as Db, [cls.leadTeacherId, cls.assistantTeacherId, ...changed.flatMap((c) => [c.from.teacherId, c.to.teacherId])]);
      await notifyUsers(tx as unknown as Db, tUsers, "Lịch lớp thay đổi", `${cls.code}: ${changed.length} buổi từ ${fmt(input.fromDate)} — ${reason}`, `/teacher/classes`, 1);
      if (input.notifyParents && changed.length) {
        const g = await tx.select({ parentId: studentGuardians.parentId, studentId: studentGuardians.studentId }).from(studentGuardians)
          .innerJoin(enrollments, eq(enrollments.studentId, studentGuardians.studentId))
          .where(and(eq(enrollments.classId, cls.id), inArray(enrollments.status, ["active", "trial", "paused"])));
        const slotText = slots.map((s) => `${s.weekday === 7 ? "CN" : `T${s.weekday + 1}`} ${s.startTime}`).join(", ");
        for (const x of g) {
          await tx.insert(parentNotifications).values({ parentId: x.parentId, studentId: x.studentId, channel: "in_app", template: "SCHEDULE_CHANGED", title: `Lớp ${cls.name} đổi lịch`, body: `Từ ${fmt(input.fromDate)} lớp học vào ${slotText}. ${reason}`, link: "/parent/schedule", params: { classId: cls.id }, status: "sent", sentAt: new Date() });
        }
      }
    });
  } catch (e) {
    mapExclusion(e);
  }
  return { changed: changed.length, newEndDate: plan.newEndDate };
}

export async function scheduleCheck(ctx: ProtectedContext, classId: string) {
  const cls = await loadClass(ctx.db, classId);
  requirePermission(ctx, "class:read", { centerId: cls.centerId, ownerIds: [cls.leadTeacherId ?? "", cls.assistantTeacherId ?? ""].filter(Boolean) });
  const course = await ctx.db.query.courses.findFirst({ where: eq(courses.id, cls.courseId) });
  const phases = await ctx.db.select().from(classSchedules).where(eq(classSchedules.classId, cls.id));
  const existing = await existingForPlan(ctx.db, cls.id);
  const res = checkScheduleDrift({
    startDate: cls.startDate,
    totalSessions: cls.plannedSessions ?? course?.totalSessions ?? 0,
    rules: phases.map((p) => ({ weekday: p.weekday as Weekday, startTime: p.startTime.slice(0, 5), endTime: p.endTime.slice(0, 5), roomId: p.roomId, teacherId: p.teacherId, effectiveFrom: p.effectiveFrom, effectiveTo: p.effectiveTo })),
    holidays: await holidayDates(ctx.db, cls.centerId),
    sessions: existing,
  });
  const lastRegular = existing.filter((e) => e.kind === "regular" && e.status !== "cancelled" && e.status !== "rescheduled").map((e) => e.date).sort().pop() ?? null;
  return { ...res, expectedEndDate: cls.expectedEndDate, actualEndDate: lastRegular, endDateMismatch: !!lastRegular && lastRegular !== cls.expectedEndDate };
}

/** Đồng bộ ngày bế giảng dự kiến theo buổi cuối (sửa lệch nhỏ phát hiện khi kiểm tra) */
export async function syncExpectedEnd(ctx: ProtectedContext, classId: string) {
  const cls = await loadClass(ctx.db, classId);
  requirePermission(ctx, "class:update", { centerId: cls.centerId });
  const [r] = await ctx.db.select({ d: sql<string | null>`max(${sessions.date})::text` }).from(sessions)
    .where(and(eq(sessions.classId, cls.id), eq(sessions.kind, "regular"), sql`${sessions.status} not in ('cancelled','rescheduled')`));
  await ctx.db.update(classes).set({ expectedEndDate: r?.d ?? null }).where(eq(classes.id, cls.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "academics", entity: "classes", entityId: cls.id, before: { expectedEndDate: cls.expectedEndDate }, after: { expectedEndDate: r?.d ?? null }, ip: ctx.ip });
  return { expectedEndDate: r?.d ?? null };
}

/* ------------------------------------------------------------------ */
/* Buổi ngoài lộ trình (coach / bù / vượt / bổ sung)                   */
/* ------------------------------------------------------------------ */

export async function addExtraSession(ctx: ProtectedContext, input: { classId: string; kind: Exclude<SessionKind, "regular">; date: string; startTime: string; endTime: string; roomId?: string | null; teacherId?: string | null; topic?: string | null; privateNote?: string | null }) {
  const cls = await loadClass(ctx.db, input.classId);
  requirePermission(ctx, "session:create", { centerId: cls.centerId });
  if (cls.status !== "recruiting" && cls.status !== "running") throw precondition("Chỉ thêm buổi cho lớp đang tuyển sinh / đang chạy");
  if (input.date < todayISO()) throw new TRPCError({ code: "BAD_REQUEST", message: "Không thêm buổi vào ngày đã qua" });
  const slotErr = validateWeeklySlots([{ weekday: 1, startTime: input.startTime, endTime: input.endTime, roomId: null, teacherId: null }]);
  if (slotErr.length) throw new TRPCError({ code: "BAD_REQUEST", message: slotErr.join("; ") });
  const roomId = input.roomId ?? cls.homeRoomId;
  const teacherId = input.teacherId ?? cls.leadTeacherId;
  if (roomId) {
    const r = await ctx.db.query.rooms.findFirst({ where: eq(rooms.id, roomId) });
    if (!r || r.centerId !== cls.centerId) throw new TRPCError({ code: "BAD_REQUEST", message: "Phòng không thuộc cơ sở của lớp" });
  }
  const conflicts = await conflictsWith(ctx.db, [{ id: "x", date: input.date, startTime: input.startTime, endTime: input.endTime, roomId, teacherId }], cls.id);
  if (conflicts.length) throw new TRPCError({ code: "CONFLICT", message: conflictMessage(conflicts) });
  try {
    return await ctx.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"extra:" + cls.id}))`);
      const seqs = (await tx.select({ n: sessions.sequenceNo }).from(sessions).where(eq(sessions.classId, cls.id))).map((r) => r.n);
      const seq = nextExtraSequence(seqs);
      const [row] = await tx.insert(sessions).values({
        classId: cls.id, sequenceNo: seq, kind: input.kind, date: input.date, startTime: input.startTime, endTime: input.endTime, roomId, teacherId,
        topic: input.topic?.trim() || null, privateNote: input.privateNote?.trim() || null, createdBy: ctx.user.id,
      }).returning();
      await tx.insert(classEvents).values({ classId: cls.id, event: "add_session", actorId: ctx.user.id, meta: { sessionId: row!.id, kind: input.kind, date: input.date } });
      await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "academics", entity: "sessions", entityId: row!.id, after: { classId: cls.id, kind: input.kind, date: input.date, startTime: input.startTime }, ip: ctx.ip });
      await notifyUsers(tx as unknown as Db, await teacherUserIds(tx as unknown as Db, [teacherId]), "Buổi dạy mới", `${cls.code} · ${sessionLabel(seq, input.kind)} · ${fmt(input.date)} ${input.startTime}`, `/teacher/sessions/${row!.id}`);
      return { id: row!.id, sequenceNo: seq, label: sessionLabel(seq, input.kind) };
    });
  } catch (e) {
    mapExclusion(e);
  }
}

/* ------------------------------------------------------------------ */
/* Màn chi tiết lớp                                                    */
/* ------------------------------------------------------------------ */

export async function classWorkspace(ctx: ProtectedContext, classId: string) {
  const cls = await loadClass(ctx.db, classId);
  requirePermission(ctx, "class:read", { centerId: cls.centerId, ownerIds: [cls.leadTeacherId ?? "", cls.assistantTeacherId ?? ""].filter(Boolean) });
  const [phases, events, teacherOpts, roomOpts, course] = await Promise.all([
    ctx.db.select({
      id: classSchedules.id, weekday: classSchedules.weekday, startTime: classSchedules.startTime, endTime: classSchedules.endTime, effectiveFrom: classSchedules.effectiveFrom, effectiveTo: classSchedules.effectiveTo,
      roomId: classSchedules.roomId, roomCode: rooms.code, teacherId: classSchedules.teacherId, teacherName: teachers.fullName, changeReason: classSchedules.changeReason, note: classSchedules.note,
    }).from(classSchedules).leftJoin(rooms, eq(rooms.id, classSchedules.roomId)).leftJoin(teachers, eq(teachers.id, classSchedules.teacherId))
      .where(eq(classSchedules.classId, cls.id)).orderBy(asc(classSchedules.effectiveFrom), asc(classSchedules.weekday), asc(classSchedules.startTime)),
    ctx.db.select({ id: classEvents.id, event: classEvents.event, fromStatus: classEvents.fromStatus, toStatus: classEvents.toStatus, reason: classEvents.reason, meta: classEvents.meta, createdAt: classEvents.createdAt, actorName: users.fullName })
      .from(classEvents).leftJoin(users, eq(users.id, classEvents.actorId)).where(eq(classEvents.classId, cls.id)).orderBy(desc(classEvents.createdAt)).limit(50),
    ctx.db.select({ id: teachers.id, fullName: teachers.fullName, code: teachers.code, centerId: teachers.centerId }).from(teachers)
      .where(and(eq(teachers.isActive, true), isNull(teachers.deletedAt), or(eq(teachers.centerId, cls.centerId), isNull(teachers.centerId))!)).orderBy(asc(teachers.fullName)),
    ctx.db.select({ id: rooms.id, code: rooms.code, name: rooms.name, capacity: rooms.capacity }).from(rooms).where(and(eq(rooms.centerId, cls.centerId), eq(rooms.isActive, true))).orderBy(asc(rooms.code)),
    ctx.db.query.courses.findFirst({ where: eq(courses.id, cls.courseId) }),
  ]);
  const people = await ctx.db.select({ id: users.id, name: users.fullName }).from(users).where(inArray(users.id, [cls.submittedBy, cls.approvedBy].filter((x): x is string => !!x).concat(["00000000-0000-0000-0000-000000000000"])));
  const nameOf = (id: string | null) => (id ? people.find((p) => p.id === id)?.name ?? null : null);
  const today = todayISO();
  const canUpdate = authorize(ctx.actor, "class:update", { centerId: cls.centerId }).allowed;
  const canApprove = authorize(ctx.actor, "class:approve", { centerId: cls.centerId }).allowed;
  const actions = classEventsFor(cls.status)
    .filter((e) => (CLASS_APPROVAL_EVENTS.includes(e) || (e === "cancel" && cls.status !== "draft") ? canApprove : canUpdate))
    .map((e) => ({ event: e, label: CLASS_EVENT_VI[e], needsReason: CLASS_REASON_EVENTS.includes(e) }));
  const planning = cls.status === "draft" || cls.status === "pending_approval";
  const readiness = planning
    ? classReadiness({ scheduleCount: phases.length, startDate: cls.startDate, leadTeacherId: cls.leadTeacherId, capacity: cls.capacity, minCapacity: cls.minCapacity, totalSessions: cls.plannedSessions ?? course?.totalSessions ?? 0 })
    : [];
  let preview: { count: number; firstDate: string | null; lastDate: string | null; error: string | null } | null = null;
  if (planning && readiness.length === 0) {
    try {
      const { planned } = await plannedForClass(ctx.db, cls);
      preview = { count: planned.length, firstDate: planned[0]?.date ?? null, lastDate: expectedEndDate(planned), error: null };
    } catch (e) {
      preview = { count: 0, firstDate: null, lastDate: null, error: (e as Error).message };
    }
  }
  return {
    status: cls.status,
    statusReason: cls.statusReason,
    info: {
      name: cls.name, description: cls.description, homeRoomId: cls.homeRoomId, leadTeacherId: cls.leadTeacherId, assistantTeacherId: cls.assistantTeacherId,
      capacity: cls.capacity, minCapacity: cls.minCapacity, startDate: cls.startDate, plannedSessions: cls.plannedSessions ?? course?.totalSessions ?? null, expectedEndDate: cls.expectedEndDate,
    },
    submittedAt: cls.submittedAt, submittedByName: nameOf(cls.submittedBy), approvedAt: cls.approvedAt, approvedByName: nameOf(cls.approvedBy),
    phases: phases.map((p) => ({ ...p, startTime: p.startTime.slice(0, 5), endTime: p.endTime.slice(0, 5), current: p.effectiveFrom <= today && (!p.effectiveTo || p.effectiveTo >= today), future: p.effectiveFrom > today, past: !!p.effectiveTo && p.effectiveTo < today })),
    events,
    teacherOptions: teacherOpts,
    roomOptions: roomOpts,
    actions,
    readiness,
    preview,
    planning,
    canUpdate,
    canApprove,
    canAddSession: authorize(ctx.actor, "session:create", { centerId: cls.centerId }).allowed && (cls.status === "recruiting" || cls.status === "running"),
    today,
  };
}

/** Hàng đợi lớp chờ duyệt (dashboard + danh sách) */
export async function pendingApprovals(ctx: ProtectedContext) {
  const rows = await ctx.db
    .select({ id: classes.id, code: classes.code, name: classes.name, centerId: classes.centerId, submittedAt: classes.submittedAt, startDate: classes.startDate })
    .from(classes).where(and(eq(classes.status, "pending_approval"), isNull(classes.deletedAt))).orderBy(asc(classes.submittedAt));
  return rows.filter((r) => authorize(ctx.actor, "class:approve", { centerId: r.centerId }).allowed);
}

