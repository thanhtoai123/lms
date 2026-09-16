import { and, eq, inArray, sql, asc, desc, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { classes, classSchedules, sessions, enrollments, courses, centers, rooms, teachers, holidays, lessons, curricula, students, attendance } from "@satarobo/db";
import {
  generateSessions, expectedEndDate, findConflicts, buildClassCode, visibleCenterIds, summarize, detectRisks,
  type ScheduleRule, type Weekday, type ClassStatus, type AttendanceRecord,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";

export async function listClasses(ctx: ProtectedContext, input: { centerId?: string; status?: ClassStatus; q?: string; teacherId?: string }) {
  const conds = [sql`${classes.deletedAt} is null`];
  if (input.centerId) conds.push(eq(classes.centerId, input.centerId));
  if (input.status) conds.push(eq(classes.status, input.status));
  if (input.teacherId) conds.push(or(eq(classes.leadTeacherId, input.teacherId), eq(classes.assistantTeacherId, input.teacherId))!);
  if (input.q) conds.push(or(ilike(classes.code, `%${input.q}%`), ilike(classes.name, `%${input.q}%`))!);
  const visible = visibleCenterIds(ctx.actor);
  if (visible !== null) conds.push(visible.length ? inArray(classes.centerId, visible) : sql`false`);

  return ctx.db
    .select({
      id: classes.id, code: classes.code, name: classes.name, status: classes.status, capacity: classes.capacity,
      startDate: classes.startDate, expectedEndDate: classes.expectedEndDate,
      courseCode: courses.code, courseName: courses.name, centerCode: centers.code, centerId: classes.centerId,
      roomCode: rooms.code, leadTeacherId: classes.leadTeacherId, leadTeacherName: teachers.fullName,
      enrolled: sql<number>`(select count(*)::int from ${enrollments} e where e.class_id = ${classes.id} and e.status in ('active','trial'))`,
      sessionsDone: sql<number>`(select count(*)::int from ${sessions} s where s.class_id = ${classes.id} and s.status = 'completed')`,
      sessionsTotal: sql<number>`(select count(*)::int from ${sessions} s where s.class_id = ${classes.id} and s.status not in ('cancelled','rescheduled'))`,
      sessionsOverdue: sql<number>`(select count(*)::int from ${sessions} s where s.class_id = ${classes.id} and s.status in ('scheduled','in_progress','attendance_done','notes_done') and s.date < current_date)`,
      schedule: sql<string>`(select string_agg((case when cs.weekday = 7 then 'CN' else 'T' || (cs.weekday + 1) end) || ' ' || to_char(cs.start_time,'HH24:MI'), ', ' order by cs.weekday) from ${classSchedules} cs where cs.class_id = ${classes.id} and cs.effective_to is null)`,
    })
    .from(classes)
    .innerJoin(courses, eq(courses.id, classes.courseId))
    .innerJoin(centers, eq(centers.id, classes.centerId))
    .leftJoin(rooms, eq(rooms.id, classes.homeRoomId))
    .leftJoin(teachers, eq(teachers.id, classes.leadTeacherId))
    .where(and(...conds))
    .orderBy(desc(classes.createdAt));
}

export async function getClass(ctx: ProtectedContext, id: string) {
  const c = await ctx.db.query.classes.findFirst({
    where: eq(classes.id, id),
    with: { course: true, center: true, homeRoom: true, leadTeacher: true, schedules: true, curriculum: true },
  });
  if (!c) throw new TRPCError({ code: "NOT_FOUND" });
  requirePermission(ctx, "class:read", { centerId: c.centerId, ownerIds: [c.leadTeacherId ?? "", c.assistantTeacherId ?? ""].filter(Boolean) });

  const sessionRows = await ctx.db.select().from(sessions).where(eq(sessions.classId, id)).orderBy(asc(sessions.sequenceNo));
  const roster = await ctx.db
    .select({ enrollmentId: enrollments.id, status: enrollments.status, packageSessions: enrollments.packageSessions, studentId: students.id, fullName: students.fullName, code: students.code })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(eq(enrollments.classId, id))
    .orderBy(asc(students.fullName));

  // Chuyên cần + rủi ro mỗi HV, tính từ core rules
  const att = await ctx.db
    .select({ enrollmentId: attendance.enrollmentId, status: attendance.status, date: sessions.date, seq: sessions.sequenceNo })
    .from(attendance)
    .innerJoin(sessions, eq(sessions.id, attendance.sessionId))
    .where(eq(sessions.classId, id));
  const byEnrollment = new Map<string, AttendanceRecord[]>();
  for (const a of att) {
    const arr = byEnrollment.get(a.enrollmentId) ?? [];
    arr.push({ sessionDate: a.date, sequenceNo: a.seq, status: a.status });
    byEnrollment.set(a.enrollmentId, arr);
  }
  const rosterWithStats = roster.map((r) => {
    const recs = byEnrollment.get(r.enrollmentId) ?? [];
    return { ...r, attendance: summarize(recs), risks: detectRisks(recs) };
  });

  return { ...c, sessions: sessionRows, roster: rosterWithStats };
}

export interface CreateClassInput {
  name: string;
  courseId: string;
  curriculumId?: string | null;
  centerId: string;
  homeRoomId?: string | null;
  leadTeacherId?: string | null;
  capacity?: number;
  startDate: string;
  totalSessions?: number;
  schedules: { weekday: number; startTime: string; endTime: string; roomId?: string | null; teacherId?: string | null }[];
}

/**
 * Tạo lớp + lịch + sinh toàn bộ buổi học trong một transaction.
 * Kiểm tra trùng phòng/GV với các buổi đang có trước khi ghi; DB EXCLUDE là lớp chặn cuối.
 */
export async function createClass(ctx: ProtectedContext, input: CreateClassInput) {
  requirePermission(ctx, "class:create", { centerId: input.centerId });
  const course = await ctx.db.query.courses.findFirst({ where: eq(courses.id, input.courseId) });
  const center = await ctx.db.query.centers.findFirst({ where: eq(centers.id, input.centerId) });
  if (!course || !center) throw new TRPCError({ code: "BAD_REQUEST", message: "Khoá học / cơ sở không hợp lệ" });
  const total = input.totalSessions ?? course.totalSessions;

  const curriculumId = input.curriculumId ?? (await ctx.db.query.curricula.findFirst({ where: and(eq(curricula.courseId, course.id), eq(curricula.isActive, true)) }))?.id ?? null;
  const lessonIds = curriculumId
    ? (await ctx.db.select({ id: lessons.id }).from(lessons).where(eq(lessons.curriculumId, curriculumId)).orderBy(asc(lessons.sequenceNo))).map((l) => l.id)
    : [];

  const holidayRows = await ctx.db.select({ date: holidays.date }).from(holidays).where(or(eq(holidays.centerId, input.centerId), sql`${holidays.centerId} is null`)!);

  const rules: ScheduleRule[] = input.schedules.map((s) => ({
    weekday: s.weekday as Weekday, startTime: s.startTime, endTime: s.endTime,
    roomId: s.roomId ?? input.homeRoomId ?? null, teacherId: s.teacherId ?? input.leadTeacherId ?? null,
    effectiveFrom: input.startDate, effectiveTo: null,
  }));
  const planned = generateSessions({ classId: "pending", startDate: input.startDate, totalSessions: total, rules, holidays: holidayRows.map((h) => h.date), lessonIds });

  // Kiểm tra xung đột với buổi hiện có trong khoảng ngày
  const existing = await ctx.db
    .select({ id: sessions.id, date: sessions.date, startTime: sessions.startTime, endTime: sessions.endTime, roomId: sessions.roomId, teacherId: sessions.teacherId })
    .from(sessions)
    .where(and(inArray(sessions.date, planned.map((p) => p.date)), sql`${sessions.status} not in ('cancelled','rescheduled')`));
  const conflicts = findConflicts([
    ...existing.map((e) => ({ ...e, startTime: e.startTime.slice(0, 5), endTime: e.endTime.slice(0, 5) })),
    ...planned.map((p, i) => ({ id: `new-${i + 1}`, date: p.date, startTime: p.startTime, endTime: p.endTime, roomId: p.roomId, teacherId: p.teacherId })),
  ]).filter((c) => c.a.startsWith("new-") || c.b.startsWith("new-")); // bỏ qua xung đột giữa các buổi đã tồn tại
  if (conflicts.length) {
    throw new TRPCError({ code: "CONFLICT", message: `Trùng ${conflicts[0]!.kind === "room" ? "phòng" : "giáo viên"} ngày ${conflicts[0]!.date} (${conflicts.length} xung đột)`, cause: conflicts });
  }

  const year = Number(input.startDate.slice(0, 4));
  return ctx.db.transaction(async (tx) => {
    const [cnt] = await tx.select({ n: sql<number>`count(*)::int` }).from(classes).where(and(eq(classes.centerId, input.centerId), eq(classes.courseId, input.courseId)));
    const code = buildClassCode(center.code, course.code, year, (cnt?.n ?? 0) + 1);
    const [cls] = await tx
      .insert(classes)
      .values({
        code, name: input.name, courseId: input.courseId, curriculumId, centerId: input.centerId, homeRoomId: input.homeRoomId ?? null,
        leadTeacherId: input.leadTeacherId ?? null, capacity: input.capacity ?? 12, startDate: input.startDate, expectedEndDate: expectedEndDate(planned), status: "recruiting",
      })
      .returning();
    await tx.insert(classSchedules).values(rules.map((r) => ({ classId: cls!.id, ...r })));
    await tx.insert(sessions).values(planned.map((p) => ({ ...p, classId: cls!.id })));
    await writeAudit(tx as unknown as typeof ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "academics", entity: "classes", entityId: cls!.id, after: { code, sessions: planned.length }, ip: ctx.ip });
    return cls!;
  });
}

/** Ghi danh HV vào lớp (kiểm tra sức chứa) */
export async function enrollStudent(ctx: ProtectedContext, input: { classId: string; studentId: string; packageSessions: number; startSequenceNo?: number; status?: "active" | "trial" }) {
  const cls = await ctx.db.query.classes.findFirst({ where: eq(classes.id, input.classId) });
  if (!cls) throw new TRPCError({ code: "NOT_FOUND" });
  requirePermission(ctx, "enrollment:create", { centerId: cls.centerId });
  const [cnt] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(enrollments).where(and(eq(enrollments.classId, input.classId), inArray(enrollments.status, ["active", "trial"])));
  if ((cnt?.n ?? 0) >= cls.capacity) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Lớp đã đủ ${cls.capacity} học viên` });
  const [row] = await ctx.db
    .insert(enrollments)
    .values({ classId: input.classId, studentId: input.studentId, packageSessions: input.packageSessions, startSequenceNo: input.startSequenceNo ?? 1, status: input.status ?? "active", createdBy: ctx.user.id })
    .returning();
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "academics", entity: "enrollments", entityId: row!.id, after: input, ip: ctx.ip });
  return row!;
}

/** Dữ liệu tham chiếu cho form (cache được ở client) */
export async function referenceData(ctx: ProtectedContext) {
  const visible = visibleCenterIds(ctx.actor);
  const centerRows = await ctx.db.select().from(centers).where(visible === null ? sql`true` : visible.length ? inArray(centers.id, visible) : sql`false`).orderBy(asc(centers.code));
  const ids = centerRows.map((c) => c.id);
  return {
    centers: centerRows,
    rooms: ids.length ? await ctx.db.select().from(rooms).where(inArray(rooms.centerId, ids)).orderBy(asc(rooms.code)) : [],
    teachers: ids.length ? await ctx.db.select({ id: teachers.id, fullName: teachers.fullName, centerId: teachers.centerId }).from(teachers).where(and(eq(teachers.isActive, true), inArray(teachers.centerId, ids))).orderBy(asc(teachers.fullName)) : [],
    courses: await ctx.db.select().from(courses).where(eq(courses.isActive, true)).orderBy(asc(courses.code)),
  };
}
