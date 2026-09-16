import { and, eq, inArray, sql, asc, desc, isNull, ne, or, ilike } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  courses, coursePrerequisites, curricula, lessons, classes, sessions, courseCompletions, enrollments, users, teacherCourses,
} from "@satarobo/db";
import {
  validateCourse, normalizeCourseCode, validatePrerequisite, missingPrerequisites, moveLesson, curriculumReadiness, authorize, requireReason,
  CURRICULUM_STATUS_VI, type CurriculumStatus,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";

type Db = ProtectedContext["db"];

const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });
const pre = (m: string | string[]) => new TRPCError({ code: "PRECONDITION_FAILED", message: Array.isArray(m) ? m.join("; ") : m });

/* ------------------------------------------------------------------ */
/* Khoá tiên quyết — kiểm tra khi ghi danh                             */
/* ------------------------------------------------------------------ */

/** Khoá đã hoàn thành của học viên: có chứng nhận (chưa thu hồi) hoặc ghi danh "completed" */
export async function completedCourseIds(db: Db, studentId: string): Promise<string[]> {
  const rows = await db
    .select({ courseId: classes.courseId })
    .from(enrollments)
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .leftJoin(courseCompletions, and(eq(courseCompletions.enrollmentId, enrollments.id), isNull(courseCompletions.revokedAt)))
    .where(and(eq(enrollments.studentId, studentId), or(eq(enrollments.status, "completed"), sql`${courseCompletions.id} is not null`)!));
  return [...new Set(rows.map((r) => r.courseId))];
}

/** Khoá tiên quyết còn thiếu (trả về mã khoá) */
export async function missingPrereqCodes(db: Db, studentId: string | null, courseId: string): Promise<{ id: string; code: string }[]> {
  const req = await db.select({ id: courses.id, code: courses.code }).from(coursePrerequisites)
    .innerJoin(courses, eq(courses.id, coursePrerequisites.requiredCourseId))
    .where(eq(coursePrerequisites.courseId, courseId));
  if (!req.length) return [];
  const done = studentId ? await completedCourseIds(db, studentId) : [];
  const miss = new Set(missingPrerequisites(req.map((r) => r.id), done));
  return req.filter((r) => miss.has(r.id));
}

/**
 * Chặn ghi danh nếu thiếu khoá tiên quyết. Miễn điều kiện (xếp lớp theo năng lực) cần quyền
 * enrollment:waive_prerequisite tại cơ sở + lý do; trả về ghi chú để lưu vào sự kiện ghi danh.
 */
export async function enforcePrerequisites(ctx: ProtectedContext, input: { studentId: string | null; courseId: string; centerId: string; waiverReason?: string | null }): Promise<string | null> {
  const miss = await missingPrereqCodes(ctx.db, input.studentId, input.courseId);
  if (!miss.length) return null;
  const codes = miss.map((m) => m.code).join(", ");
  if (!input.waiverReason?.trim()) {
    throw pre(`Học viên chưa hoàn thành khoá tiên quyết: ${codes}. Quản lý cơ sở có thể miễn điều kiện (xếp lớp theo năng lực) kèm lý do.`);
  }
  if (!authorize(ctx.actor, "enrollment:waive_prerequisite", { centerId: input.centerId }).allowed) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Chỉ quản lý cơ sở được miễn điều kiện tiên quyết (${codes})` });
  }
  let reason: string;
  try {
    reason = requireReason(input.waiverReason);
  } catch (e) {
    throw bad((e as Error).message);
  }
  return `Miễn tiên quyết ${codes}: ${reason}`;
}

/* ------------------------------------------------------------------ */
/* Khoá học                                                            */
/* ------------------------------------------------------------------ */

export async function listCourses(ctx: ProtectedContext, input: { q?: string; active?: boolean }) {
  requirePermission(ctx, "course:read");
  const conds = [];
  if (input.q?.trim()) conds.push(or(ilike(courses.code, `%${input.q.trim()}%`), ilike(courses.name, `%${input.q.trim()}%`))!);
  if (input.active !== undefined) conds.push(eq(courses.isActive, input.active));
  const rows = await ctx.db
    .select({
      id: courses.id, code: courses.code, name: courses.name, slug: courses.slug, gradeFrom: courses.gradeFrom, gradeTo: courses.gradeTo,
      totalSessions: courses.totalSessions, sessionMinutes: courses.sessionMinutes, listPrice: courses.listPrice, nextCourseId: courses.nextCourseId,
      description: courses.description, level: courses.level, isActive: courses.isActive,
      classes: sql<number>`(select count(*)::int from ${classes} c where c.course_id = ${sql.raw('"courses"."id"')} and c.deleted_at is null and c.status in ('recruiting','running'))`,
      curricula: sql<number>`(select count(*)::int from ${curricula} cu where cu.course_id = ${sql.raw('"courses"."id"')})`,
      activeCurriculum: sql<string | null>`(select cu.name from ${curricula} cu where cu.course_id = ${sql.raw('"courses"."id"')} and cu.status = 'active' order by cu.version desc limit 1)`,
      teachers: sql<number>`(select count(*)::int from ${teacherCourses} tc where tc.course_id = ${sql.raw('"courses"."id"')})`,
    })
    .from(courses).where(conds.length ? and(...conds) : undefined).orderBy(desc(courses.isActive), asc(courses.code));
  const edges = await ctx.db.select({ courseId: coursePrerequisites.courseId, requiredCourseId: coursePrerequisites.requiredCourseId }).from(coursePrerequisites);
  const code = new Map(rows.map((r) => [r.id, r.code]));
  return rows.map((r) => ({
    ...r,
    listPrice: Number(r.listPrice),
    nextCourseCode: r.nextCourseId ? code.get(r.nextCourseId) ?? null : null,
    prerequisites: edges.filter((e) => e.courseId === r.id).map((e) => code.get(e.requiredCourseId) ?? "?"),
  }));
}

export interface CourseUpsert {
  id?: string;
  code: string;
  name: string;
  gradeFrom?: number | null;
  gradeTo?: number | null;
  totalSessions: number;
  sessionMinutes: number;
  listPrice: number;
  nextCourseId?: string | null;
  description?: string | null;
  level?: string | null;
  isActive?: boolean;
}

export async function upsertCourse(ctx: ProtectedContext, input: CourseUpsert) {
  requirePermission(ctx, input.id ? "course:update" : "course:create");
  const code = normalizeCourseCode(input.code);
  const errs = validateCourse({ ...input, code });
  if (errs.length) throw bad(errs);
  if (input.nextCourseId && input.nextCourseId === input.id) throw bad("Khoá tiếp theo phải khác khoá hiện tại");
  const dup = (await ctx.db.select({ id: courses.id }).from(courses).where(and(eq(courses.code, code), input.id ? ne(courses.id, input.id) : undefined)).limit(1))[0];
  if (dup) throw new TRPCError({ code: "CONFLICT", message: `Mã khoá ${code} đã tồn tại` });
  const values = {
    code, name: input.name.trim(), gradeFrom: input.gradeFrom ?? null, gradeTo: input.gradeTo ?? null, totalSessions: input.totalSessions,
    sessionMinutes: input.sessionMinutes, listPrice: String(Math.round(input.listPrice)), nextCourseId: input.nextCourseId ?? null,
    description: input.description?.trim() || null, level: input.level?.trim() || null, isActive: input.isActive ?? true,
    slug: code.toLowerCase(),
  };
  if (!input.id) {
    const [row] = await ctx.db.insert(courses).values(values).returning({ id: courses.id });
    await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "academics", entity: "courses", entityId: row!.id, after: values, ip: ctx.ip });
    return { id: row!.id };
  }
  const before = await ctx.db.query.courses.findFirst({ where: eq(courses.id, input.id) });
  if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy khoá" });
  if (before.isActive && values.isActive === false) {
    const [n] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(classes).where(and(eq(classes.courseId, before.id), isNull(classes.deletedAt), inArray(classes.status, ["draft", "pending_approval", "recruiting", "running"])));
    if (n?.n) throw pre(`Khoá đang có ${n.n} lớp chưa kết thúc — không ngưng được`);
  }
  await ctx.db.update(courses).set(values).where(eq(courses.id, before.id));
  await writeAudit(ctx.db, {
    actorId: ctx.user.id, action: "UPDATE", module: "academics", entity: "courses", entityId: before.id,
    before: { code: before.code, name: before.name, totalSessions: before.totalSessions, listPrice: before.listPrice, isActive: before.isActive, nextCourseId: before.nextCourseId },
    after: values, ip: ctx.ip,
  });
  return { id: before.id };
}

/* ------------------------------------------------------------------ */
/* Khoá tiên quyết                                                     */
/* ------------------------------------------------------------------ */

export async function listPrerequisites(ctx: ProtectedContext) {
  requirePermission(ctx, "course:read");
  const req = sql`(select code from ${courses} rc where rc.id = ${coursePrerequisites.requiredCourseId})`;
  return ctx.db
    .select({
      id: coursePrerequisites.id, courseId: coursePrerequisites.courseId, courseCode: courses.code, courseName: courses.name,
      requiredCourseId: coursePrerequisites.requiredCourseId, requiredCode: sql<string>`${req}`,
      requiredName: sql<string>`(select name from ${courses} rc2 where rc2.id = ${coursePrerequisites.requiredCourseId})`,
      note: coursePrerequisites.note, createdAt: coursePrerequisites.createdAt, createdByName: users.fullName,
    })
    .from(coursePrerequisites)
    .innerJoin(courses, eq(courses.id, coursePrerequisites.courseId))
    .leftJoin(users, eq(users.id, coursePrerequisites.createdBy))
    .orderBy(asc(courses.code));
}

export async function addPrerequisite(ctx: ProtectedContext, input: { courseId: string; requiredCourseId: string; note?: string | null }) {
  requirePermission(ctx, "course:update");
  const edges = await ctx.db.select({ courseId: coursePrerequisites.courseId, requiredCourseId: coursePrerequisites.requiredCourseId }).from(coursePrerequisites);
  const err = validatePrerequisite(edges, input);
  if (err) throw bad(err);
  const [row] = await ctx.db.insert(coursePrerequisites).values({ ...input, note: input.note?.trim() || null, createdBy: ctx.user.id }).returning({ id: coursePrerequisites.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "academics", entity: "course_prerequisites", entityId: row!.id, after: input, ip: ctx.ip });
  return { id: row!.id };
}

export async function removePrerequisite(ctx: ProtectedContext, input: { id: string }) {
  requirePermission(ctx, "course:update");
  const row = await ctx.db.query.coursePrerequisites.findFirst({ where: eq(coursePrerequisites.id, input.id) });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy điều kiện" });
  await ctx.db.delete(coursePrerequisites).where(eq(coursePrerequisites.id, row.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "DELETE", module: "academics", entity: "course_prerequisites", entityId: row.id, before: { courseId: row.courseId, requiredCourseId: row.requiredCourseId }, ip: ctx.ip });
  return { ok: true };
}

/** Kiểm tra nhanh cho form ghi danh */
export async function prerequisiteStatus(ctx: ProtectedContext, input: { studentId?: string | null; classId: string }) {
  requirePermission(ctx, "enrollment:read");
  const cls = await ctx.db.query.classes.findFirst({ where: eq(classes.id, input.classId), columns: { courseId: true, centerId: true } });
  if (!cls) throw new TRPCError({ code: "NOT_FOUND", message: "Lớp không tồn tại" });
  const miss = await missingPrereqCodes(ctx.db, input.studentId ?? null, cls.courseId);
  return { missing: miss.map((m) => m.code), canWaive: authorize(ctx.actor, "enrollment:waive_prerequisite", { centerId: cls.centerId }).allowed };
}

/* ------------------------------------------------------------------ */
/* Giáo trình & bài học                                                */
/* ------------------------------------------------------------------ */

export async function listCurricula(ctx: ProtectedContext, input: { courseId?: string; status?: CurriculumStatus }) {
  requirePermission(ctx, "curriculum:read");
  const conds = [];
  if (input.courseId) conds.push(eq(curricula.courseId, input.courseId));
  if (input.status) conds.push(eq(curricula.status, input.status));
  return ctx.db
    .select({
      id: curricula.id, name: curricula.name, version: curricula.version, status: curricula.status, description: curricula.description, updatedAt: curricula.updatedAt,
      courseId: courses.id, courseCode: courses.code, courseName: courses.name, courseSessions: courses.totalSessions,
      lessons: sql<number>`(select count(*)::int from ${lessons} l where l.curriculum_id = ${curricula.id})`,
      classes: sql<number>`(select count(*)::int from ${classes} c where c.curriculum_id = ${curricula.id} and c.deleted_at is null and c.status in ('recruiting','running'))`,
    })
    .from(curricula).innerJoin(courses, eq(courses.id, curricula.courseId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(courses.code), desc(curricula.version));
}

async function loadCurriculum(db: Db, id: string) {
  const c = await db.query.curricula.findFirst({ where: eq(curricula.id, id) });
  if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy giáo trình" });
  return c;
}

export async function getCurriculum(ctx: ProtectedContext, id: string) {
  requirePermission(ctx, "curriculum:read");
  const c = await loadCurriculum(ctx.db, id);
  const course = await ctx.db.query.courses.findFirst({ where: eq(courses.id, c.courseId) });
  const ls = await ctx.db
    .select({
      id: lessons.id, sequenceNo: lessons.sequenceNo, title: lessons.title, objectives: lessons.objectives, materials: lessons.materials, isReportCardMilestone: lessons.isReportCardMilestone,
      used: sql<number>`(select count(*)::int from ${sessions} s where s.lesson_id = ${sql.raw('"lessons"."id"')})`,
    })
    .from(lessons).where(eq(lessons.curriculumId, id)).orderBy(asc(lessons.sequenceNo));
  const usedBy = await ctx.db.select({ id: classes.id, code: classes.code, status: classes.status }).from(classes)
    .where(and(eq(classes.curriculumId, id), isNull(classes.deletedAt))).orderBy(desc(classes.createdAt)).limit(50);
  const versions = await ctx.db.select({ id: curricula.id, name: curricula.name, version: curricula.version, status: curricula.status }).from(curricula).where(eq(curricula.courseId, c.courseId)).orderBy(desc(curricula.version));
  return {
    ...c,
    statusLabel: CURRICULUM_STATUS_VI[c.status as CurriculumStatus] ?? c.status,
    course: course ? { id: course.id, code: course.code, name: course.name, totalSessions: course.totalSessions } : null,
    lessons: ls,
    usedBy,
    versions,
    readiness: curriculumReadiness(ls.length, course?.totalSessions ?? 0),
    canEdit: authorize(ctx.actor, "curriculum:update").allowed,
  };
}

export async function upsertCurriculum(ctx: ProtectedContext, input: { id?: string; courseId: string; name: string; description?: string | null }) {
  requirePermission(ctx, input.id ? "curriculum:update" : "curriculum:create");
  if (input.name.trim().length < 3) throw bad("Tên giáo trình tối thiểu 3 ký tự");
  if (input.id) {
    const c = await loadCurriculum(ctx.db, input.id);
    await ctx.db.update(curricula).set({ name: input.name.trim(), description: input.description?.trim() || null }).where(eq(curricula.id, c.id));
    await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "academics", entity: "curricula", entityId: c.id, before: { name: c.name, description: c.description }, after: { name: input.name, description: input.description }, ip: ctx.ip });
    return { id: c.id };
  }
  const course = await ctx.db.query.courses.findFirst({ where: eq(courses.id, input.courseId) });
  if (!course) throw bad("Khoá học không hợp lệ");
  const [v] = await ctx.db.select({ n: sql<number>`coalesce(max(${curricula.version}), 0)::int` }).from(curricula).where(eq(curricula.courseId, course.id));
  const [row] = await ctx.db.insert(curricula).values({ courseId: course.id, name: input.name.trim(), description: input.description?.trim() || null, version: (v?.n ?? 0) + 1, status: "draft", isActive: false, createdBy: ctx.user.id }).returning({ id: curricula.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "academics", entity: "curricula", entityId: row!.id, after: { courseId: course.id, name: input.name }, ip: ctx.ip });
  return { id: row!.id };
}

/** Đưa vào sử dụng (giáo trình đang dùng khác của khoá chuyển "Không sử dụng") hoặc ngưng */
export async function setCurriculumStatus(ctx: ProtectedContext, input: { id: string; status: CurriculumStatus }) {
  requirePermission(ctx, "curriculum:update");
  const c = await loadCurriculum(ctx.db, input.id);
  if (c.status === input.status) return { ok: true };
  if (input.status === "active") {
    const course = await ctx.db.query.courses.findFirst({ where: eq(courses.id, c.courseId) });
    const [n] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(lessons).where(eq(lessons.curriculumId, c.id));
    const errs = curriculumReadiness(n?.n ?? 0, course?.totalSessions ?? 0);
    if (errs.length) throw pre(errs);
  }
  if (input.status === "draft" && c.status === "active") throw pre("Giáo trình đang dùng không đưa về nháp — hãy nhân bản thành phiên bản mới");
  await ctx.db.transaction(async (tx) => {
    if (input.status === "active") {
      await tx.update(curricula).set({ status: "archived", isActive: false }).where(and(eq(curricula.courseId, c.courseId), eq(curricula.status, "active"), ne(curricula.id, c.id)));
    }
    await tx.update(curricula).set({ status: input.status, isActive: input.status === "active" }).where(eq(curricula.id, c.id));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "academics", entity: "curricula", entityId: c.id, before: { status: c.status }, after: { status: input.status }, ip: ctx.ip });
  });
  return { ok: true };
}

/** Nhân bản giáo trình thành phiên bản nháp mới (sửa không ảnh hưởng lớp đang học) */
export async function cloneCurriculum(ctx: ProtectedContext, input: { id: string; name?: string }) {
  requirePermission(ctx, "curriculum:create");
  const c = await loadCurriculum(ctx.db, input.id);
  return ctx.db.transaction(async (tx) => {
    const [v] = await tx.select({ n: sql<number>`coalesce(max(${curricula.version}), 0)::int` }).from(curricula).where(eq(curricula.courseId, c.courseId));
    const version = (v?.n ?? 0) + 1;
    const [row] = await tx.insert(curricula).values({ courseId: c.courseId, name: input.name?.trim() || `${c.name.replace(/\s*\(.*\)$/, "")} v${version}`, description: c.description, version, status: "draft", isActive: false, createdBy: ctx.user.id }).returning({ id: curricula.id });
    const ls = await tx.select().from(lessons).where(eq(lessons.curriculumId, c.id));
    if (ls.length) await tx.insert(lessons).values(ls.map((l) => ({ curriculumId: row!.id, sequenceNo: l.sequenceNo, title: l.title, objectives: l.objectives, materials: l.materials, isReportCardMilestone: l.isReportCardMilestone })));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "academics", entity: "curricula", entityId: row!.id, after: { clonedFrom: c.id, version, lessons: ls.length }, ip: ctx.ip });
    return { id: row!.id };
  });
}

export async function upsertLesson(ctx: ProtectedContext, input: { id?: string; curriculumId: string; title: string; objectives?: string | null; materials?: string | null; isReportCardMilestone?: boolean }) {
  requirePermission(ctx, "curriculum:update");
  const c = await loadCurriculum(ctx.db, input.curriculumId);
  if (c.status === "archived") throw pre("Giáo trình không còn sử dụng — nhân bản để chỉnh sửa");
  if (input.title.trim().length < 3) throw bad("Tên bài tối thiểu 3 ký tự");
  const values = { title: input.title.trim(), objectives: input.objectives?.trim() || null, materials: input.materials?.trim() || null, isReportCardMilestone: !!input.isReportCardMilestone };
  if (input.id) {
    const l = await ctx.db.query.lessons.findFirst({ where: and(eq(lessons.id, input.id), eq(lessons.curriculumId, c.id)) });
    if (!l) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy bài học" });
    await ctx.db.update(lessons).set(values).where(eq(lessons.id, l.id));
    // Buổi chưa diễn ra dùng bài này cập nhật chủ đề theo tên bài mới
    await ctx.db.update(sessions).set({ topic: values.title }).where(and(eq(sessions.lessonId, l.id), eq(sessions.status, "scheduled"), eq(sessions.topic, l.title)));
    await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "academics", entity: "lessons", entityId: l.id, before: { title: l.title, objectives: l.objectives }, after: values, ip: ctx.ip });
    return { id: l.id };
  }
  if (c.status === "active") {
    const course = await ctx.db.query.courses.findFirst({ where: eq(courses.id, c.courseId) });
    const [n] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(lessons).where(eq(lessons.curriculumId, c.id));
    if ((n?.n ?? 0) >= (course?.totalSessions ?? 0)) throw pre("Giáo trình đã đủ số bài bằng số buổi của khoá");
  }
  return ctx.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"lesson:" + c.id}))`);
    const [m] = await tx.select({ n: sql<number>`coalesce(max(${lessons.sequenceNo}), 0)::int` }).from(lessons).where(eq(lessons.curriculumId, c.id));
    const [row] = await tx.insert(lessons).values({ curriculumId: c.id, sequenceNo: (m?.n ?? 0) + 1, ...values }).returning({ id: lessons.id });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "academics", entity: "lessons", entityId: row!.id, after: { curriculumId: c.id, ...values }, ip: ctx.ip });
    return { id: row!.id };
  });
}

export async function moveLessonOrder(ctx: ProtectedContext, input: { curriculumId: string; lessonId: string; dir: "up" | "down" }) {
  requirePermission(ctx, "curriculum:update");
  const c = await loadCurriculum(ctx.db, input.curriculumId);
  if (c.status !== "draft") throw pre("Chỉ đổi thứ tự bài trong giáo trình nháp (tránh lệch buổi của lớp đang học)");
  const ls = await ctx.db.select({ id: lessons.id, sequenceNo: lessons.sequenceNo }).from(lessons).where(eq(lessons.curriculumId, c.id));
  const next = moveLesson(ls, input.lessonId, input.dir);
  await ctx.db.transaction(async (tx) => {
    // tránh đụng unique (curriculum, seq): dời tạm sang số âm rồi đặt lại
    for (const l of next) await tx.update(lessons).set({ sequenceNo: -l.sequenceNo }).where(eq(lessons.id, l.id));
    for (const l of next) await tx.update(lessons).set({ sequenceNo: l.sequenceNo }).where(eq(lessons.id, l.id));
  });
  return { ok: true };
}

export async function deleteLesson(ctx: ProtectedContext, input: { curriculumId: string; lessonId: string }) {
  requirePermission(ctx, "curriculum:update");
  const c = await loadCurriculum(ctx.db, input.curriculumId);
  if (c.status !== "draft") throw pre("Chỉ xoá bài trong giáo trình nháp");
  const [u] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(sessions).where(eq(sessions.lessonId, input.lessonId));
  if (u?.n) throw pre(`Bài học đang gắn với ${u.n} buổi học — không xoá được`);
  const l = await ctx.db.query.lessons.findFirst({ where: and(eq(lessons.id, input.lessonId), eq(lessons.curriculumId, c.id)) });
  if (!l) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy bài học" });
  await ctx.db.transaction(async (tx) => {
    await tx.delete(lessons).where(eq(lessons.id, l.id));
    const rest = await tx.select({ id: lessons.id, sequenceNo: lessons.sequenceNo }).from(lessons).where(eq(lessons.curriculumId, c.id)).orderBy(asc(lessons.sequenceNo));
    for (const [i, r] of rest.entries()) if (r.sequenceNo !== i + 1) await tx.update(lessons).set({ sequenceNo: i + 1 }).where(eq(lessons.id, r.id));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "DELETE", module: "academics", entity: "lessons", entityId: l.id, before: { title: l.title, sequenceNo: l.sequenceNo }, ip: ctx.ip });
  });
  return { ok: true };
}

/** Danh sách khoá cho bộ chọn */
export async function courseOptions(ctx: ProtectedContext) {
  requirePermission(ctx, "course:read");
  return ctx.db.select({ id: courses.id, code: courses.code, name: courses.name, isActive: courses.isActive, totalSessions: courses.totalSessions }).from(courses).orderBy(asc(courses.code));
}

