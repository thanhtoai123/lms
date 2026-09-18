import { and, eq, inArray, sql, asc, desc, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { classes, classGroups, classSchedules, sessions, enrollments, courses, centers, regions, rooms, teachers, students, attendance, trialBookings } from "@satarobo/db";
import {
  visibleCenterIds, summarize, detectRisks, riskFrom, sessionLabel,
  type ClassStatus, type AttendanceRecord,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { getOps } from "./opsSettings";
import { createEnrollment } from "./enrollments";
import { tenantCond, assertTenant } from "./tenantScope";

export async function listClasses(ctx: ProtectedContext, input: { centerId?: string; status?: ClassStatus; q?: string; teacherId?: string; courseId?: string; classGroupId?: string }) {
  const conds = [sql`${classes.deletedAt} is null`];
  if (input.courseId) conds.push(eq(classes.courseId, input.courseId));
  if (input.classGroupId) conds.push(eq(classes.classGroupId, input.classGroupId));
  if (input.centerId) conds.push(eq(classes.centerId, input.centerId));
  if (input.status) conds.push(eq(classes.status, input.status));
  if (input.teacherId) conds.push(or(eq(classes.leadTeacherId, input.teacherId), eq(classes.assistantTeacherId, input.teacherId))!);
  if (input.q) conds.push(or(ilike(classes.code, `%${input.q}%`), ilike(classes.name, `%${input.q}%`))!);
  const visible = visibleCenterIds(ctx.actor);
  if (visible !== null) conds.push(visible.length ? inArray(classes.centerId, visible) : sql`false`);
  conds.push(tenantCond(ctx, classes));

  return ctx.db
    .select({
      id: classes.id, code: classes.code, name: classes.name, status: classes.status, capacity: classes.capacity,
      startDate: classes.startDate, expectedEndDate: classes.expectedEndDate,
      courseCode: courses.code, courseName: courses.name, centerCode: centers.code, centerId: classes.centerId,
      roomCode: rooms.code, leadTeacherId: classes.leadTeacherId, leadTeacherName: teachers.fullName,
      classGroupId: classes.classGroupId,
      classGroupName: sql<string | null>`(select g.name from ${classGroups} g where g.id = ${classes.classGroupId})`,
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
  assertTenant(ctx, c, "Lớp học");
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
  const riskT = riskFrom(await getOps(ctx.db, c.centerId));
  const rosterWithStats = roster.map((r) => {
    const recs = byEnrollment.get(r.enrollmentId) ?? [];
    return { ...r, attendance: summarize(recs), risks: detectRisks(recs, riskT) };
  });

  // Số điểm danh / nhận xét / học thử từng buổi (danh sách buổi ở trang lớp)
  const perSession = await ctx.db
    .select({
      sessionId: sessions.id,
      marked: sql<number>`(select count(*)::int from ${attendance} a where a.session_id = ${sql.raw('"sessions"."id"')})`,
      remarks: sql<number>`(select count(*)::int from ${attendance} a where a.session_id = ${sql.raw('"sessions"."id"')} and coalesce(trim(a.student_remark), '') <> '')`,
      trials: sql<number>`(select count(*)::int from ${trialBookings} tb where tb.session_id = ${sql.raw('"sessions"."id"')} and tb.status = 'booked')`,
    })
    .from(sessions).where(eq(sessions.classId, id));
  const stat = new Map(perSession.map((p) => [p.sessionId, p]));

  return {
    ...c,
    sessions: sessionRows.map((x) => ({
      ...x,
      label: sessionLabel(x.sequenceNo, x.kind, x.originalSequenceNo),
      marked: stat.get(x.id)?.marked ?? 0,
      remarks: stat.get(x.id)?.remarks ?? 0,
      trials: stat.get(x.id)?.trials ?? 0,
    })),
    roster: rosterWithStats,
  };
}

export { createClass, type CreateClassInput } from "./classOps";

/** Ghi danh HV vào lớp — dùng chung luồng ghi danh (sức chứa gồm cả bảo lưu, chặn trùng, lịch sử, ngày đăng ký đầu) */
export async function enrollStudent(ctx: ProtectedContext, input: { classId: string; studentId: string; packageSessions: number; startSequenceNo?: number; status?: "active" | "trial" }) {
  return createEnrollment(ctx, input);
}

/** Dữ liệu tham chiếu cho form (cache được ở client) */
export async function referenceData(ctx: ProtectedContext) {
  const visible = visibleCenterIds(ctx.actor);
  const centerRows = await ctx.db.select().from(centers)
    .where(and(tenantCond(ctx, centers), visible === null ? sql`true` : visible.length ? inArray(centers.id, visible) : sql`false`))
    .orderBy(asc(centers.code));
  const ids = centerRows.map((c) => c.id);
  const regionIds = [...new Set(centerRows.map((c) => c.regionId).filter((x): x is string => !!x))];
  return {
    centers: centerRows,
    /** Khu vực của các cơ sở đang thấy — dùng cho bộ lọc "Khu vực" */
    regions: regionIds.length ? await ctx.db.select({ id: regions.id, code: regions.code, name: regions.name }).from(regions).where(inArray(regions.id, regionIds)).orderBy(asc(regions.sortOrder), asc(regions.code)) : [],
    rooms: ids.length ? await ctx.db.select().from(rooms).where(inArray(rooms.centerId, ids)).orderBy(asc(rooms.code)) : [],
    teachers: ids.length ? await ctx.db.select({ id: teachers.id, fullName: teachers.fullName, centerId: teachers.centerId }).from(teachers).where(and(eq(teachers.isActive, true), inArray(teachers.centerId, ids))).orderBy(asc(teachers.fullName)) : [],
    courses: await ctx.db.select().from(courses).where(and(eq(courses.isActive, true), tenantCond(ctx, courses))).orderBy(asc(courses.code)),
    classGroups: await ctx.db
      .select({ id: classGroups.id, code: classGroups.code, name: classGroups.name, centerId: classGroups.centerId })
      .from(classGroups)
      .where(and(sql`${classGroups.deletedAt} is null`, eq(classGroups.isActive, true), visible === null ? sql`true` : ids.length ? sql`(${classGroups.centerId} is null or ${inArray(classGroups.centerId, ids)})` : sql`${classGroups.centerId} is null`))
      .orderBy(asc(classGroups.code)),
  };
}
