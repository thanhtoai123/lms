import { and, eq, inArray, sql, asc, desc, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { classes, classSchedules, sessions, enrollments, courses, centers, rooms, teachers, students, attendance } from "@satarobo/db";
import {
  visibleCenterIds, summarize, detectRisks, sessionLabel,
  type ClassStatus, type AttendanceRecord,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { enforcePrerequisites } from "./catalog";

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
      sessionsDone: sql<number>`(select count(*)::int from ${sessions} s where s.class_id = ${classes.id} and s.status = 'completed' and s.kind = 'regular')`,
      sessionsTotal: sql<number>`(select count(*)::int from ${sessions} s where s.class_id = ${classes.id} and s.status not in ('cancelled','rescheduled') and s.kind = 'regular')`,
      minCapacity: classes.minCapacity,
      plannedSessions: classes.plannedSessions,
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
    with: { course: true, center: true, homeRoom: true, leadTeacher: true, assistantTeacher: true, schedules: true, curriculum: true },
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

  return { ...c, sessions: sessionRows.map((x) => ({ ...x, label: sessionLabel(x.sequenceNo, x.kind) })), roster: rosterWithStats };
}

export { createClass, type CreateClassInput } from "./classOps";

/** Ghi danh HV vào lớp (kiểm tra sức chứa) */
export async function enrollStudent(ctx: ProtectedContext, input: { classId: string; studentId: string; packageSessions: number; startSequenceNo?: number; status?: "active" | "trial" }) {
  const cls = await ctx.db.query.classes.findFirst({ where: eq(classes.id, input.classId) });
  if (!cls) throw new TRPCError({ code: "NOT_FOUND" });
  requirePermission(ctx, "enrollment:create", { centerId: cls.centerId });
  if (cls.status === "cancelled" || cls.status === "finished") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Lớp đã kết thúc / huỷ" });
  await enforcePrerequisites(ctx, { studentId: input.studentId, courseId: cls.courseId, centerId: cls.centerId });
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
