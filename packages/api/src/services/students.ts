import { and, eq, inArray, sql, asc, desc, ilike, or, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { students, parents, studentGuardians, enrollments, classes, courses, centers, attendance, sessions, careTasks, enrollmentEvents } from "@satarobo/db";
import { buildStudentCode, hasRole, maskPhone, normalizeVnPhone, remainingSessions, summarize, visibleCenterIds, type AttendanceRecord } from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";

type Db = ProtectedContext["db"];
const STUDENT_ID = sql.raw('"students"."id"');

/** Số buổi đã tiêu thụ của một ghi danh (có mặt, muộn, vắng không phép) — dùng chung cho mọi màn */
export const consumedSql = sql<number>`((select count(*)::int from ${attendance} a where a.enrollment_id = ${enrollments.id} and a.status in ('present','late','absent_unexcused')) + ${enrollments.carriedSessions})`;

export function canSeeFullPhone(ctx: ProtectedContext) {
  return hasRole(ctx.actor, "SUPER_ADMIN", "CENTER_MANAGER", "CENTER_SALES_CSM", "CENTER_CLASS_MANAGER", "HO_SALE");
}

export function centerScope(ctx: ProtectedContext, col: typeof students.homeCenterId | typeof classes.centerId) {
  const visible = visibleCenterIds(ctx.actor);
  if (visible === null) return sql`true`;
  return visible.length ? inArray(col, visible) : sql`false`;
}

export const STUDENT_STATUSES = ["prospect", "trial", "active", "paused", "alumni", "withdrawn"] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export async function listStudents(ctx: ProtectedContext, input: { q?: string; centerId?: string; status?: StudentStatus; page?: number; pageSize?: number }) {
  requirePermission(ctx, "student:read", { centerId: input.centerId ?? null });
  const conds = [isNull(students.deletedAt), centerScope(ctx, students.homeCenterId)];
  if (input.centerId) conds.push(eq(students.homeCenterId, input.centerId));
  if (input.status) conds.push(eq(students.status, input.status));
  if (input.q) {
    const pn = normalizeVnPhone(input.q);
    conds.push(
      or(
        ilike(students.fullName, `%${input.q}%`),
        ilike(students.code, `%${input.q}%`),
        pn ? sql`exists (select 1 from ${studentGuardians} g join ${parents} p on p.id = g.parent_id where g.student_id = ${STUDENT_ID} and p.phone = ${pn})` : sql`false`,
      )!,
    );
  }
  const pageSize = Math.min(input.pageSize ?? 20, 100);
  const page = Math.max(1, input.page ?? 1);
  const where = and(...conds);
  const [total] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(students).where(where);
  const rows = await ctx.db
    .select({
      id: students.id, code: students.code, fullName: students.fullName, grade: students.grade, school: students.school, status: students.status,
      dateOfBirth: students.dateOfBirth, centerCode: centers.code, createdAt: students.createdAt,
      parentName: sql<string | null>`(select p.full_name from ${studentGuardians} g join ${parents} p on p.id = g.parent_id where g.student_id = ${students.id} order by g.is_primary desc limit 1)`,
      parentPhone: sql<string | null>`(select p.phone from ${studentGuardians} g join ${parents} p on p.id = g.parent_id where g.student_id = ${students.id} order by g.is_primary desc limit 1)`,
      classes: sql<string | null>`(select string_agg(c.code, ', ') from ${enrollments} e join ${classes} c on c.id = e.class_id where e.student_id = ${students.id} and e.status in ('trial','active','paused'))`,
    })
    .from(students)
    .leftJoin(centers, eq(centers.id, students.homeCenterId))
    .where(where)
    .orderBy(desc(students.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const full = canSeeFullPhone(ctx);
  return { total: total?.n ?? 0, page, pageSize, items: rows.map((r) => ({ ...r, parentPhone: r.parentPhone ? (full ? r.parentPhone : maskPhone(r.parentPhone)) : null })) };
}

export async function getStudent(ctx: ProtectedContext, id: string) {
  const s = await ctx.db.query.students.findFirst({ where: and(eq(students.id, id), isNull(students.deletedAt)) });
  if (!s) throw new TRPCError({ code: "NOT_FOUND" });
  requirePermission(ctx, "student:read", { centerId: s.homeCenterId });
  const full = canSeeFullPhone(ctx);

  const [center, guardians, enrs, care] = await Promise.all([
    s.homeCenterId ? ctx.db.query.centers.findFirst({ where: eq(centers.id, s.homeCenterId), columns: { id: true, code: true, name: true } }) : null,
    ctx.db
      .select({ parentId: parents.id, fullName: parents.fullName, phone: parents.phone, email: parents.email, relation: studentGuardians.relation, isPrimary: studentGuardians.isPrimary, accountStatus: parents.accountStatus, mediaConsent: parents.mediaConsent })
      .from(studentGuardians).innerJoin(parents, eq(parents.id, studentGuardians.parentId))
      .where(eq(studentGuardians.studentId, id)).orderBy(desc(studentGuardians.isPrimary)),
    ctx.db
      .select({
        id: enrollments.id, status: enrollments.status, packageSessions: enrollments.packageSessions, startSequenceNo: enrollments.startSequenceNo,
        enrolledAt: enrollments.enrolledAt, endedAt: enrollments.endedAt, endReason: enrollments.endReason, pausedAt: enrollments.pausedAt, pauseUntil: enrollments.pauseUntil,
        classId: classes.id, classCode: classes.code, className: classes.name, courseCode: courses.code, centerCode: centers.code, consumed: consumedSql,
      })
      .from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).innerJoin(courses, eq(courses.id, classes.courseId)).innerJoin(centers, eq(centers.id, classes.centerId))
      .where(eq(enrollments.studentId, id)).orderBy(desc(enrollments.enrolledAt)),
    ctx.db.select({ id: careTasks.id, title: careTasks.title, status: careTasks.status, dueAt: careTasks.dueAt, severity: careTasks.severity }).from(careTasks).where(eq(careTasks.studentId, id)).orderBy(desc(careTasks.createdAt)).limit(10),
  ]);

  const ids = enrs.map((e) => e.id);
  const att = ids.length
    ? await ctx.db
        .select({ enrollmentId: attendance.enrollmentId, status: attendance.status, date: sessions.date, seq: sessions.sequenceNo, classCode: classes.code, remark: attendance.studentRemark })
        .from(attendance).innerJoin(sessions, eq(sessions.id, attendance.sessionId)).innerJoin(classes, eq(classes.id, sessions.classId))
        .where(inArray(attendance.enrollmentId, ids)).orderBy(desc(sessions.date))
    : [];
  const events = ids.length
    ? await ctx.db.select().from(enrollmentEvents).where(inArray(enrollmentEvents.enrollmentId, ids)).orderBy(desc(enrollmentEvents.createdAt)).limit(50)
    : [];

  return {
    ...s,
    center: center ?? null,
    guardians: guardians.map((g) => ({ ...g, phone: full ? g.phone : maskPhone(g.phone) })),
    enrollments: enrs.map((e) => {
      const recs: AttendanceRecord[] = att.filter((a) => a.enrollmentId === e.id).map((a) => ({ sessionDate: a.date, sequenceNo: a.seq, status: a.status }));
      return { ...e, remaining: remainingSessions(e.packageSessions, e.consumed), summary: summarize(recs) };
    }),
    recentAttendance: att.slice(0, 20),
    events,
    care,
  };
}

export interface StudentInput {
  fullName: string;
  nickname?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  grade?: number | null;
  school?: string | null;
  homeCenterId: string;
  status?: StudentStatus;
  healthNotes?: string | null;
  interests?: string | null;
  notes?: string | null;
}

export async function createStudent(
  ctx: ProtectedContext,
  input: StudentInput & { guardians: { fullName: string; phone: string; email?: string | null; relation?: string; mediaConsent?: boolean }[] },
) {
  requirePermission(ctx, "student:create", { centerId: input.homeCenterId });
  const center = await ctx.db.query.centers.findFirst({ where: eq(centers.id, input.homeCenterId) });
  if (!center) throw new TRPCError({ code: "BAD_REQUEST", message: "Cơ sở không tồn tại" });
  const guardians = input.guardians.map((g) => ({ ...g, phoneN: normalizeVnPhone(g.phone) }));
  if (guardians.some((g) => !g.phoneN)) throw new TRPCError({ code: "BAD_REQUEST", message: "Số điện thoại phụ huynh không hợp lệ" });

  return ctx.db.transaction(async (tx) => {
    const code = await nextStudentCode(tx as unknown as Db, center.id, center.code);
    const { guardians: _g, ...data } = input;
    const [st] = await tx.insert(students).values({ ...data, code, status: input.status ?? "prospect" }).returning();
    for (const [i, g] of guardians.entries()) {
      const parentId = await upsertParent(tx as unknown as Db, { fullName: g.fullName, phone: g.phoneN!, email: g.email ?? null, mediaConsent: !!g.mediaConsent });
      await tx.insert(studentGuardians).values({ studentId: st!.id, parentId, relation: g.relation ?? "parent", isPrimary: i === 0 });
    }
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "students", entity: "students", entityId: st!.id, after: { code, fullName: st!.fullName }, ip: ctx.ip });
    return st!;
  });
}

async function nextStudentCode(db: Db, centerId: string, centerCode: string) {
  const year = new Date().getFullYear();
  const prefix = `${centerCode.toUpperCase()}-${String(year).slice(-2)}-`;
  const [row] = await db.select({ max: sql<string | null>`max(${students.code})` }).from(students).where(sql`${students.code} like ${prefix + "%"}`);
  const seq = row?.max ? Number(row.max.slice(prefix.length)) + 1 : 1;
  void centerId;
  return buildStudentCode(centerCode, year, seq);
}

/** Ghép phụ huynh theo SĐT chuẩn hoá; tạo mới nếu chưa có */
export async function upsertParent(db: Db, p: { fullName: string; phone: string; email: string | null; mediaConsent: boolean }) {
  const existing = await db.query.parents.findFirst({ where: and(eq(parents.phone, p.phone), isNull(parents.deletedAt)) });
  if (existing) {
    if (p.mediaConsent && !existing.mediaConsent) await db.update(parents).set({ mediaConsent: true, mediaConsentAt: new Date() }).where(eq(parents.id, existing.id));
    return existing.id;
  }
  const [row] = await db.insert(parents).values({ fullName: p.fullName, phone: p.phone, email: p.email, mediaConsent: p.mediaConsent, mediaConsentAt: p.mediaConsent ? new Date() : null }).returning({ id: parents.id });
  return row!.id;
}

export async function updateStudent(ctx: ProtectedContext, id: string, input: Partial<StudentInput> & { reason?: string }) {
  const s = await ctx.db.query.students.findFirst({ where: and(eq(students.id, id), isNull(students.deletedAt)) });
  if (!s) throw new TRPCError({ code: "NOT_FOUND" });
  requirePermission(ctx, "student:update", { centerId: s.homeCenterId });
  if (input.homeCenterId && input.homeCenterId !== s.homeCenterId) requirePermission(ctx, "student:update", { centerId: input.homeCenterId });
  const { reason, ...patch } = input;
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, (s as Record<string, unknown>)[k]]));
  await ctx.db.transaction(async (tx) => {
    await tx.update(students).set({ ...patch, updatedAt: new Date() }).where(eq(students.id, id));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "students", entity: "students", entityId: id, before, after: patch, reason: reason ?? null, ip: ctx.ip });
  });
  return getStudent(ctx, id);
}

export async function addGuardian(ctx: ProtectedContext, input: { studentId: string; fullName: string; phone: string; email?: string | null; relation?: string; mediaConsent?: boolean }) {
  const s = await ctx.db.query.students.findFirst({ where: eq(students.id, input.studentId) });
  if (!s) throw new TRPCError({ code: "NOT_FOUND" });
  requirePermission(ctx, "student:update", { centerId: s.homeCenterId });
  const phone = normalizeVnPhone(input.phone);
  if (!phone) throw new TRPCError({ code: "BAD_REQUEST", message: "Số điện thoại không hợp lệ" });
  await ctx.db.transaction(async (tx) => {
    const parentId = await upsertParent(tx as unknown as Db, { fullName: input.fullName, phone, email: input.email ?? null, mediaConsent: !!input.mediaConsent });
    const exists = await tx.query.studentGuardians.findFirst({ where: and(eq(studentGuardians.studentId, s.id), eq(studentGuardians.parentId, parentId)) });
    if (exists) throw new TRPCError({ code: "CONFLICT", message: "Phụ huynh này đã gắn với học viên" });
    const [cnt] = await tx.select({ n: sql<number>`count(*)::int` }).from(studentGuardians).where(eq(studentGuardians.studentId, s.id));
    await tx.insert(studentGuardians).values({ studentId: s.id, parentId, relation: input.relation ?? "parent", isPrimary: (cnt?.n ?? 0) === 0 });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "students", entity: "student_guardians", entityId: s.id, after: { parentId }, ip: ctx.ip });
  });
  return getStudent(ctx, s.id);
}

/** Danh sách HV rút gọn cho ô chọn (ghi danh, chuyển lớp) */
export async function pickStudents(ctx: ProtectedContext, q: string) {
  requirePermission(ctx, "student:read", {});
  return ctx.db
    .select({ id: students.id, code: students.code, fullName: students.fullName, grade: students.grade, centerCode: centers.code })
    .from(students).leftJoin(centers, eq(centers.id, students.homeCenterId))
    .where(and(isNull(students.deletedAt), centerScope(ctx, students.homeCenterId), or(ilike(students.fullName, `%${q}%`), ilike(students.code, `%${q}%`))!))
    .orderBy(asc(students.fullName)).limit(20);
}
