import { and, eq, inArray, sql, asc, desc, isNull, gte, lte, or, ilike, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { teachers, teacherCourses, teacherEvaluations, courses, centers, classes, sessions, users, userRoles, attendance } from "@satarobo/db";
import {
  visibleCenterIds, authorize, addDays, isoWeekStart, weeklyLoad, loadLevel, validateEvaluation, nextTeacherCode, validateTeacherStatusChange,
  canTeachCourse, attendanceRate, TEACHER_GRADES, TEACHER_STATUSES, sessionLabel,
  type TeacherGrade, type TeacherStatus, type ContractType,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { todayISO } from "./sessions";

type Db = ProtectedContext["db"];
const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });

function scopeCond(ctx: ProtectedContext) {
  const visible = visibleCenterIds(ctx.actor);
  if (visible === null) return undefined;
  return visible.length ? or(inArray(teachers.centerId, visible), isNull(teachers.centerId))! : sql`false`;
}

async function loadTeacher(ctx: ProtectedContext, id: string) {
  const t = await ctx.db.query.teachers.findFirst({ where: and(eq(teachers.id, id), isNull(teachers.deletedAt)) });
  if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy giáo viên" });
  return t;
}

/** Khoá được dạy của GV — dùng khi phân lớp */
export async function assertTeacherQualified(db: Db, teacherId: string | null | undefined, courseId: string) {
  if (!teacherId) return;
  const rows = await db.select({ courseId: teacherCourses.courseId }).from(teacherCourses).where(eq(teacherCourses.teacherId, teacherId));
  if (!canTeachCourse(rows.map((r) => r.courseId), courseId)) {
    const [t] = await db.select({ name: teachers.fullName }).from(teachers).where(eq(teachers.id, teacherId));
    const [c] = await db.select({ code: courses.code }).from(courses).where(eq(courses.id, courseId));
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${t?.name ?? "Giáo viên"} chưa được khai báo dạy khoá ${c?.code ?? ""} — cập nhật hồ sơ GV trước` });
  }
  const [st] = await db.select({ s: teachers.workStatus }).from(teachers).where(eq(teachers.id, teacherId));
  if (st && st.s !== "active") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Giáo viên đang tạm nghỉ / ngưng — không phân lớp được" });
}

/* ------------------------------------------------------------------ */
/* Danh sách                                                           */
/* ------------------------------------------------------------------ */

export async function listTeachers(ctx: ProtectedContext, input: { q?: string; centerId?: string; grade?: TeacherGrade; status?: TeacherStatus; courseId?: string }) {
  requirePermission(ctx, "teacher:read", { centerId: input.centerId ?? null });
  const conds = [isNull(teachers.deletedAt)];
  const sc = scopeCond(ctx);
  if (sc) conds.push(sc);
  if (input.centerId) conds.push(eq(teachers.centerId, input.centerId));
  if (input.grade) conds.push(eq(teachers.grade, input.grade));
  if (input.status) conds.push(eq(teachers.workStatus, input.status));
  if (input.courseId) conds.push(sql`exists (select 1 from ${teacherCourses} tc where tc.teacher_id = ${teachers.id} and tc.course_id = ${input.courseId})`);
  if (input.q?.trim()) conds.push(or(ilike(teachers.fullName, `%${input.q.trim()}%`), ilike(teachers.code, `%${input.q.trim()}%`), ilike(teachers.email, `%${input.q.trim()}%`))!);
  const today = todayISO();
  const wk = isoWeekStart(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const rows = await ctx.db
    .select({
      id: teachers.id, code: teachers.code, fullName: teachers.fullName, email: teachers.email, phone: teachers.phone, title: teachers.title,
      grade: teachers.grade, contractType: teachers.contractType, workStatus: teachers.workStatus, maxLoadPerWeek: teachers.maxLoadPerWeek,
      centerId: teachers.centerId, centerCode: centers.code, hasAccount: sql<boolean>`${teachers.userId} is not null`,
      classes: sql<number>`(select count(*)::int from ${classes} c where (c.lead_teacher_id = ${teachers.id} or c.assistant_teacher_id = ${teachers.id}) and c.deleted_at is null and c.status in ('recruiting','running'))`,
      weekLoad: sql<number>`(select count(*)::int from ${sessions} s where s.teacher_id = ${teachers.id} and s.date between ${wk}::date and ${addDays(wk, 6)}::date and s.status not in ('cancelled','rescheduled'))`,
      taughtMonth: sql<number>`(select count(*)::int from ${sessions} s where s.teacher_id = ${teachers.id} and s.date between ${monthStart}::date and ${today}::date and s.status = 'completed')`,
      avgScore: sql<string | null>`(select round(avg(e.score), 1)::text from ${teacherEvaluations} e where e.teacher_id = ${teachers.id})`,
      courseCodes: sql<string | null>`(select string_agg(co.code, ', ' order by co.code) from ${teacherCourses} tc join ${courses} co on co.id = tc.course_id where tc.teacher_id = ${teachers.id})`,
    })
    .from(teachers).leftJoin(centers, eq(centers.id, teachers.centerId))
    .where(and(...conds))
    .orderBy(asc(teachers.fullName));
  return rows.map((r) => ({ ...r, loadLevel: loadLevel(r.weekLoad, r.maxLoadPerWeek), avgScore: r.avgScore ? Number(r.avgScore) : null }));
}

/* ------------------------------------------------------------------ */
/* Hồ sơ                                                               */
/* ------------------------------------------------------------------ */

export async function getTeacher(ctx: ProtectedContext, id: string) {
  const t = await loadTeacher(ctx, id);
  requirePermission(ctx, "teacher:read", { centerId: t.centerId });
  const today = todayISO();
  const wk = isoWeekStart(today);
  const from = addDays(wk, -7 * 7);
  const to = addDays(wk, 7 * 5 - 1);
  const [center, account, courseRows, classRows, sessRows, evals, att] = await Promise.all([
    t.centerId ? ctx.db.query.centers.findFirst({ where: eq(centers.id, t.centerId), columns: { id: true, code: true, name: true } }) : null,
    t.userId ? ctx.db.query.users.findFirst({ where: eq(users.id, t.userId), columns: { id: true, email: true, isActive: true, lastLoginAt: true } }) : null,
    ctx.db.select({ id: courses.id, code: courses.code, name: courses.name }).from(teacherCourses).innerJoin(courses, eq(courses.id, teacherCourses.courseId)).where(eq(teacherCourses.teacherId, id)).orderBy(asc(courses.code)),
    ctx.db.select({
      id: classes.id, code: classes.code, name: classes.name, status: classes.status, courseCode: courses.code,
      role: sql<"lead" | "assistant">`case when ${classes.leadTeacherId} = ${id} then 'lead' else 'assistant' end`,
    }).from(classes).innerJoin(courses, eq(courses.id, classes.courseId))
      .where(and(isNull(classes.deletedAt), or(eq(classes.leadTeacherId, id), eq(classes.assistantTeacherId, id))!, inArray(classes.status, ["draft", "pending_approval", "recruiting", "running"])))
      .orderBy(asc(classes.code)),
    ctx.db.select({ id: sessions.id, date: sessions.date, startTime: sessions.startTime, endTime: sessions.endTime, status: sessions.status, kind: sessions.kind, sequenceNo: sessions.sequenceNo, classCode: classes.code })
      .from(sessions).innerJoin(classes, eq(classes.id, sessions.classId))
      .where(and(eq(sessions.teacherId, id), gte(sessions.date, from), lte(sessions.date, to), sql`${sessions.status} not in ('cancelled','rescheduled')`))
      .orderBy(asc(sessions.date), asc(sessions.startTime)),
    ctx.db.select({ id: teacherEvaluations.id, score: teacherEvaluations.score, comment: teacherEvaluations.comment, observedOn: teacherEvaluations.observedOn, createdAt: teacherEvaluations.createdAt, evaluatorName: users.fullName })
      .from(teacherEvaluations).leftJoin(users, eq(users.id, teacherEvaluations.evaluatorId)).where(eq(teacherEvaluations.teacherId, id)).orderBy(desc(teacherEvaluations.observedOn)).limit(30),
    ctx.db.select({ status: attendance.status, n: sql<number>`count(*)::int` }).from(attendance).innerJoin(sessions, eq(sessions.id, attendance.sessionId))
      .where(and(eq(sessions.teacherId, id), gte(sessions.date, addDays(today, -90)), lte(sessions.date, today))).groupBy(attendance.status),
  ]);
  const weeks = weeklyLoad(sessRows.map((s) => s.date));
  const weekList = Array.from({ length: 12 }, (_, i) => addDays(wk, (i - 7) * 7)).map((w) => ({ week: w, load: weeks.get(w) ?? 0, level: loadLevel(weeks.get(w) ?? 0, t.maxLoadPerWeek), current: w === wk }));
  const months = new Map<string, number>();
  for (const s of sessRows) if (s.status === "completed" && s.date <= today) months.set(s.date.slice(0, 7), (months.get(s.date.slice(0, 7)) ?? 0) + 1);
  const g = (k: string) => att.find((a) => a.status === k)?.n ?? 0;
  const tally = { present: g("present"), late: g("late"), absent: g("absent_unexcused"), excused: g("absent_excused"), makeup: g("makeup") };
  const upcoming = sessRows.filter((s) => s.date >= today && s.status === "scheduled");
  const { userId: _u, ...rest } = t;
  return {
    ...rest,
    center: center ?? null,
    account: account ?? null,
    courses: courseRows,
    classes: classRows,
    thisWeek: sessRows.filter((s) => s.date >= wk && s.date <= addDays(wk, 6)).map((s) => ({ ...s, label: sessionLabel(s.sequenceNo, s.kind) })),
    upcomingCount: upcoming.length,
    weeks: weekList,
    taughtByMonth: [...months.entries()].sort().map(([month, n]) => ({ month, n })),
    evaluations: evals,
    avgScore: evals.length ? Math.round((evals.reduce((a, b) => a + b.score, 0) / evals.length) * 10) / 10 : null,
    attendanceRate90: attendanceRate(tally),
    canEdit: authorize(ctx.actor, "teacher:update", { centerId: t.centerId }).allowed,
    canEvaluate: authorize(ctx.actor, "teacher:evaluate", { centerId: t.centerId }).allowed,
    today,
  };
}

export interface TeacherUpsert {
  id?: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  centerId?: string | null;
  grade?: TeacherGrade | null;
  contractType: ContractType;
  maxLoadPerWeek: number;
  hiredAt?: string | null;
  notes?: string | null;
  userId?: string | null;
  courseIds?: string[];
}

export async function upsertTeacher(ctx: ProtectedContext, input: TeacherUpsert) {
  requirePermission(ctx, input.id ? "teacher:update" : "teacher:create", { centerId: input.centerId ?? null });
  if (input.fullName.trim().length < 2) throw bad("Họ tên tối thiểu 2 ký tự");
  if (input.maxLoadPerWeek < 1 || input.maxLoadPerWeek > 60) throw bad("Tải tối đa/tuần từ 1 đến 60 buổi");
  if (input.grade && !TEACHER_GRADES.includes(input.grade)) throw bad("Ngạch không hợp lệ");
  const vis = visibleCenterIds(ctx.actor);
  if (!input.centerId && vis !== null) throw bad("Nhân sự cơ sở phải chọn cơ sở cho giáo viên");
  if (input.userId) {
    const u = await ctx.db.query.users.findFirst({ where: eq(users.id, input.userId), columns: { id: true } });
    if (!u) throw bad("Tài khoản đăng nhập không tồn tại");
    const taken = (await ctx.db.select({ id: teachers.id }).from(teachers).where(and(eq(teachers.userId, input.userId), input.id ? ne(teachers.id, input.id) : undefined)).limit(1))[0];
    if (taken) throw new TRPCError({ code: "CONFLICT", message: "Tài khoản này đã gắn với hồ sơ giáo viên khác" });
  }
  const values = {
    fullName: input.fullName.trim(), email: input.email?.trim().toLowerCase() || null, phone: input.phone?.trim() || null, title: input.title?.trim() || null,
    centerId: input.centerId ?? null, grade: input.grade ?? null, contractType: input.contractType, maxLoadPerWeek: input.maxLoadPerWeek,
    hiredAt: input.hiredAt || null, notes: input.notes?.trim() || null, userId: input.userId ?? null,
  };
  return ctx.db.transaction(async (tx) => {
    let id = input.id;
    if (!id) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('teacher-code'))`);
      const codes = (await tx.select({ c: teachers.code }).from(teachers)).map((r) => r.c);
      const [row] = await tx.insert(teachers).values({ ...values, code: nextTeacherCode(codes) }).returning({ id: teachers.id, code: teachers.code });
      id = row!.id;
      await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "people", entity: "teachers", entityId: id, after: { ...values, code: row!.code }, ip: ctx.ip });
    } else {
      const before = await tx.query.teachers.findFirst({ where: eq(teachers.id, id) });
      if (!before || before.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy giáo viên" });
      requirePermission(ctx, "teacher:update", { centerId: before.centerId });
      await tx.update(teachers).set(values).where(eq(teachers.id, id));
      await writeAudit(tx as unknown as Db, {
        actorId: ctx.user.id, action: "UPDATE", module: "people", entity: "teachers", entityId: id,
        before: { fullName: before.fullName, grade: before.grade, title: before.title, centerId: before.centerId, contractType: before.contractType, maxLoadPerWeek: before.maxLoadPerWeek, userId: before.userId },
        after: values, ip: ctx.ip,
      });
    }
    if (input.courseIds) {
      const cur = (await tx.select({ c: teacherCourses.courseId }).from(teacherCourses).where(eq(teacherCourses.teacherId, id))).map((r) => r.c);
      const want = [...new Set(input.courseIds)];
      const removed = cur.filter((c) => !want.includes(c));
      if (removed.length) {
        const [busy] = await tx.select({ code: classes.code }).from(classes)
          .where(and(inArray(classes.courseId, removed), or(eq(classes.leadTeacherId, id), eq(classes.assistantTeacherId, id))!, isNull(classes.deletedAt), inArray(classes.status, ["pending_approval", "recruiting", "running"]))).limit(1);
        if (busy) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Giáo viên đang phụ trách lớp ${busy.code} của khoá bị bỏ — bàn giao trước` });
        await tx.delete(teacherCourses).where(and(eq(teacherCourses.teacherId, id), inArray(teacherCourses.courseId, removed)));
      }
      const added = want.filter((c) => !cur.includes(c));
      if (added.length) await tx.insert(teacherCourses).values(added.map((courseId) => ({ teacherId: id!, courseId })));
      if (added.length || removed.length) await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "people", entity: "teacher_courses", entityId: id, before: { courses: cur }, after: { courses: want }, ip: ctx.ip });
    }
    return { id: id! };
  });
}

export async function setTeacherStatus(ctx: ProtectedContext, input: { id: string; status: TeacherStatus; reason?: string | null }) {
  const t = await loadTeacher(ctx, input.id);
  requirePermission(ctx, "teacher:update", { centerId: t.centerId });
  if (!TEACHER_STATUSES.includes(input.status)) throw bad("Trạng thái không hợp lệ");
  if (t.workStatus === input.status) return { changed: false };
  const [up] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(sessions)
    .where(and(eq(sessions.teacherId, t.id), eq(sessions.status, "scheduled"), gte(sessions.date, todayISO())));
  const err = validateTeacherStatusChange(input.status, up?.n ?? 0);
  if (err) throw new TRPCError({ code: "PRECONDITION_FAILED", message: err });
  if (input.status !== "active" && (input.reason ?? "").trim().length < 5) throw bad("Cần lý do (tối thiểu 5 ký tự)");
  await ctx.db.transaction(async (tx) => {
    await tx.update(teachers).set({ workStatus: input.status, isActive: input.status !== "stopped" }).where(eq(teachers.id, t.id));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "people", entity: "teachers", entityId: t.id, before: { workStatus: t.workStatus }, after: { workStatus: input.status }, reason: input.reason ?? null, ip: ctx.ip });
  });
  return { changed: true };
}

export async function addEvaluation(ctx: ProtectedContext, input: { teacherId: string; score: number; comment: string; observedOn: string; sessionId?: string | null }) {
  const t = await loadTeacher(ctx, input.teacherId);
  requirePermission(ctx, "teacher:evaluate", { centerId: t.centerId });
  const errs = validateEvaluation(input.score, input.comment);
  if (errs.length) throw bad(errs);
  if (input.observedOn > todayISO()) throw bad("Ngày dự giờ không được ở tương lai");
  if (t.userId && t.userId === ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Không tự đánh giá chính mình" });
  if (input.sessionId) {
    const s = await ctx.db.query.sessions.findFirst({ where: eq(sessions.id, input.sessionId), columns: { teacherId: true } });
    if (!s || s.teacherId !== t.id) throw bad("Buổi dự giờ không phải của giáo viên này");
  }
  const [row] = await ctx.db.insert(teacherEvaluations).values({ teacherId: t.id, score: input.score, comment: input.comment.trim(), observedOn: input.observedOn, sessionId: input.sessionId ?? null, evaluatorId: ctx.user.id }).returning({ id: teacherEvaluations.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "people", entity: "teacher_evaluations", entityId: row!.id, after: { teacherId: t.id, score: input.score, observedOn: input.observedOn }, ip: ctx.ip });
  return { id: row!.id };
}

/** Tài khoản có vai trò GV/trợ giảng chưa gắn hồ sơ — để liên kết */
export async function linkableAccounts(ctx: ProtectedContext, teacherId?: string) {
  requirePermission(ctx, "teacher:read");
  const rows = await ctx.db.selectDistinct({ id: users.id, email: users.email, fullName: users.fullName }).from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(inArray(userRoles.role, ["TEACHER", "ASSISTANT_TEACHER"]), eq(users.isActive, true),
      sql`not exists (select 1 from ${teachers} t where t.user_id = ${users.id} ${teacherId ? sql`and t.id <> ${teacherId}` : sql``})`))
    .orderBy(asc(users.fullName));
  return rows;
}
