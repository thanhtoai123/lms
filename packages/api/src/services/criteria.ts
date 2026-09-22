/**
 * TIÊU CHÍ ĐÁNH GIÁ (rubric có mô tả 4 mức) + TIÊU CHÍ TRỌNG TÂM THEO BÀI — quản trị ở drawer "Tiêu chí đánh giá"
 * trên trang Khoá học / Giáo trình (docs/HO-SO-HOC-TAP.md, mục "Rubric có mô tả mức & tiêu chí trọng tâm").
 *
 * - Tiêu chí thuộc khoá (`competency_criteria`): tên, nhóm, mô tả, 4 mô tả mức, thứ tự, đang dùng / ngưng.
 *   Không xoá tiêu chí (đã có học bạ / phiếu tham chiếu) — ngưng dùng thì phiếu mới không có tiêu chí đó.
 * - Tiêu chí trọng tâm của bài (`lesson_focus_criteria`): tuỳ chọn; phiếu buổi đánh dấu và xếp lên đầu.
 * - Phiếu đã phát hành giữ bản chụp riêng — sửa tiêu chí không làm đổi phiếu cũ.
 *
 * Quyền: xem `course:read`; sửa tiêu chí `course:update`; tiêu chí trọng tâm / mục tiêu bài `curriculum:update`.
 * Khoá / giáo trình nạp theo id luôn `assertTenant`; mọi thao tác ghi có `writeAudit` TRONG transaction.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { competencyCriteria, courses, curricula, lessons, lessonFocusCriteria } from "@satarobo/db";
import {
  authorize, validateCriterion, normalizeLevelDescriptors, rubricLevelsFor, CRITERIA_TEMPLATE_ROBOTICS, CURRICULUM_STATUS_VI,
  type CurriculumStatus,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { assertTenant } from "./tenantScope";
import { writeAudit } from "./audit";

type Db = ProtectedContext["db"];
const asDb = (d: unknown) => d as Db;
const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });

async function loadCourse(ctx: ProtectedContext, courseId: string) {
  const [c] = await ctx.db.select({ id: courses.id, tenantId: courses.tenantId, code: courses.code, name: courses.name }).from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy khoá học" });
  assertTenant(ctx, c, "Khoá học");
  return c;
}

/** Drawer "Tiêu chí đánh giá": tiêu chí của khoá + bài học của giáo trình (mục tiêu, trọng tâm) */
export async function courseCriteriaBoard(ctx: ProtectedContext, input: { courseId: string; curriculumId?: string | null }) {
  requirePermission(ctx, "course:read");
  const course = await loadCourse(ctx, input.courseId);
  const [crits, curs] = await Promise.all([
    ctx.db.select().from(competencyCriteria).where(eq(competencyCriteria.courseId, course.id)).orderBy(asc(competencyCriteria.sortOrder), asc(competencyCriteria.createdAt)),
    ctx.db.select({ id: curricula.id, name: curricula.name, version: curricula.version, status: curricula.status })
      .from(curricula).where(eq(curricula.courseId, course.id)).orderBy(desc(curricula.version)),
  ]);
  // Giáo trình: theo yêu cầu, hoặc giáo trình đang dùng, hoặc bản mới nhất
  const cur = (input.curriculumId ? curs.find((c) => c.id === input.curriculumId) : null) ?? curs.find((c) => c.status === "active") ?? curs[0] ?? null;
  const ls = cur
    ? await ctx.db.select({ id: lessons.id, sequenceNo: lessons.sequenceNo, title: lessons.title, objectives: lessons.objectives, materials: lessons.materials, isReportCardMilestone: lessons.isReportCardMilestone })
      .from(lessons).where(eq(lessons.curriculumId, cur.id)).orderBy(asc(lessons.sequenceNo))
    : [];
  const focus = ls.length
    ? await ctx.db.select({ lessonId: lessonFocusCriteria.lessonId, criterionId: lessonFocusCriteria.criterionId }).from(lessonFocusCriteria).where(inArray(lessonFocusCriteria.lessonId, ls.map((l) => l.id)))
    : [];
  const focusBy = new Map<string, string[]>();
  for (const f of focus) focusBy.set(f.lessonId, [...(focusBy.get(f.lessonId) ?? []), f.criterionId]);
  return {
    course: { id: course.id, code: course.code, name: course.name },
    canEdit: authorize(ctx.actor, "course:update").allowed,
    canEditLessons: authorize(ctx.actor, "curriculum:update").allowed && !!cur && cur.status !== "archived",
    criteria: crits.map((c) => {
      const own = normalizeLevelDescriptors(c.levelDescriptors);
      return {
        id: c.id, name: c.name, groupName: c.groupName, description: c.description, sortOrder: c.sortOrder, isActive: c.isActive,
        /** Mô tả mức đã khai (null = đang dùng mô tả mặc định) */
        levelDescriptors: own,
        /** Mô tả mức đang hiệu lực (khai riêng, hoặc mặc định theo tên) — để quản trị thấy GV đang đọc gì */
        effectiveLevels: rubricLevelsFor(c.name, own).map((l) => l.hint),
      };
    }),
    curricula: curs.map((c) => ({ id: c.id, label: `${c.name} · v${c.version} · ${CURRICULUM_STATUS_VI[c.status as CurriculumStatus] ?? c.status}` })),
    curriculumId: cur?.id ?? null,
    lessons: ls.map((l) => ({ ...l, focusIds: focusBy.get(l.id) ?? [] })),
    template: CRITERIA_TEMPLATE_ROBOTICS.map((t) => ({ ...t, levelDescriptors: [...t.levelDescriptors] })),
  };
}

export interface CriterionInput {
  id?: string;
  courseId: string;
  name: string;
  groupName?: string | null;
  description?: string | null;
  /** 4 chuỗi (mức 1 → 4); bỏ trống cả 4 = dùng mô tả mặc định */
  levelDescriptors?: string[] | null;
  isActive?: boolean;
}

/** Thêm / sửa một tiêu chí */
export async function saveCriterion(ctx: ProtectedContext, input: CriterionInput) {
  requirePermission(ctx, "course:update");
  const course = await loadCourse(ctx, input.courseId);
  const errs = validateCriterion(input);
  if (errs.length) throw bad(errs);
  const desc4 = input.levelDescriptors && input.levelDescriptors.some((v) => v.trim()) ? input.levelDescriptors.map((v) => v.trim()) : null;
  const values = {
    name: input.name.trim(),
    groupName: input.groupName?.trim() || null,
    description: input.description?.trim() || null,
    levelDescriptors: desc4,
    isActive: input.isActive ?? true,
  };
  return ctx.db.transaction(async (txx) => {
    const tx = asDb(txx);
    if (input.id) {
      const [before] = await tx.select().from(competencyCriteria).where(and(eq(competencyCriteria.id, input.id), eq(competencyCriteria.courseId, course.id))).limit(1);
      if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy tiêu chí của khoá này" });
      await tx.update(competencyCriteria).set(values).where(eq(competencyCriteria.id, before.id));
      await writeAudit(tx, {
        actorId: ctx.user.id, action: "UPDATE", module: "academics", entity: "competency_criteria", entityId: before.id,
        before: { name: before.name, groupName: before.groupName, description: before.description, levelDescriptors: before.levelDescriptors, isActive: before.isActive },
        after: values, ip: ctx.ip, tenantId: course.tenantId,
      });
      return { id: before.id };
    }
    const [m] = await tx.select({ n: sql<number>`coalesce(max(${competencyCriteria.sortOrder}), 0)::int` }).from(competencyCriteria).where(eq(competencyCriteria.courseId, course.id));
    const [row] = await tx.insert(competencyCriteria).values({ courseId: course.id, sortOrder: (m?.n ?? 0) + 1, ...values }).returning({ id: competencyCriteria.id });
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Không lưu được tiêu chí" });
    await writeAudit(tx, { actorId: ctx.user.id, action: "CREATE", module: "academics", entity: "competency_criteria", entityId: row.id, after: { courseId: course.id, ...values }, ip: ctx.ip, tenantId: course.tenantId });
    return { id: row.id };
  });
}

/** Sắp thứ tự tiêu chí (danh sách id theo thứ tự mới — phải đủ mọi tiêu chí của khoá) */
export async function reorderCriteria(ctx: ProtectedContext, input: { courseId: string; ids: string[] }) {
  requirePermission(ctx, "course:update");
  const course = await loadCourse(ctx, input.courseId);
  const rows = await ctx.db.select({ id: competencyCriteria.id, sortOrder: competencyCriteria.sortOrder }).from(competencyCriteria).where(eq(competencyCriteria.courseId, course.id));
  const ids = [...new Set(input.ids)];
  if (ids.length !== rows.length || !rows.every((r) => ids.includes(r.id))) throw bad("Danh sách thứ tự phải gồm đủ các tiêu chí của khoá");
  await ctx.db.transaction(async (txx) => {
    const tx = asDb(txx);
    for (const [i, id] of ids.entries()) await tx.update(competencyCriteria).set({ sortOrder: i + 1 }).where(and(eq(competencyCriteria.id, id), eq(competencyCriteria.courseId, course.id)));
    await writeAudit(tx, {
      actorId: ctx.user.id, action: "UPDATE", module: "academics", entity: "competency_criteria", entityId: course.id,
      before: { order: [...rows].sort((a, b) => a.sortOrder - b.sortOrder).map((r) => r.id) }, after: { order: ids }, reason: "Sắp thứ tự tiêu chí đánh giá", ip: ctx.ip, tenantId: course.tenantId,
    });
  });
  return { ok: true };
}

/** "Áp dụng bộ mẫu": chỉ cho khoá CHƯA có tiêu chí nào (tránh nhân đôi / lẫn với tiêu chí đang có học bạ) */
export async function applyCriteriaTemplate(ctx: ProtectedContext, input: { courseId: string }) {
  requirePermission(ctx, "course:update");
  const course = await loadCourse(ctx, input.courseId);
  return ctx.db.transaction(async (txx) => {
    const tx = asDb(txx);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"criteria:" + course.id}))`);
    const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(competencyCriteria).where(eq(competencyCriteria.courseId, course.id));
    if ((n?.n ?? 0) > 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Khoá đã có tiêu chí — bộ mẫu chỉ áp cho khoá chưa có tiêu chí (sửa từng tiêu chí ở danh sách)" });
    const rows = await tx.insert(competencyCriteria).values(CRITERIA_TEMPLATE_ROBOTICS.map((t, i) => ({
      courseId: course.id, name: t.name, groupName: t.groupName, description: t.description, levelDescriptors: [...t.levelDescriptors], sortOrder: i + 1, isActive: true,
    }))).returning({ id: competencyCriteria.id });
    await writeAudit(tx, {
      actorId: ctx.user.id, action: "CREATE", module: "academics", entity: "competency_criteria", entityId: course.id,
      after: { template: "robotics", count: rows.length, names: CRITERIA_TEMPLATE_ROBOTICS.map((t) => t.name) }, reason: "Áp dụng bộ mẫu tiêu chí robotics / lập trình", ip: ctx.ip, tenantId: course.tenantId,
    });
    return { created: rows.length };
  });
}

/** Tiêu chí trọng tâm của một bài (thay cả danh sách; rỗng = dùng toàn bộ tiêu chí của khoá) */
export async function setLessonFocus(ctx: ProtectedContext, input: { lessonId: string; criterionIds: string[] }) {
  requirePermission(ctx, "curriculum:update");
  const [l] = await ctx.db
    .select({ id: lessons.id, title: lessons.title, curriculumId: curricula.id, courseId: curricula.courseId, status: curricula.status, tenantId: curricula.tenantId })
    .from(lessons).innerJoin(curricula, eq(curricula.id, lessons.curriculumId))
    .where(eq(lessons.id, input.lessonId)).limit(1);
  if (!l) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy bài học" });
  assertTenant(ctx, l, "Bài học");
  if (l.status === "archived") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Giáo trình không còn sử dụng — nhân bản để chỉnh sửa" });
  const ids = [...new Set(input.criterionIds)];
  if (ids.length > 4) throw bad("Chọn tối đa 4 tiêu chí trọng tâm cho một bài");
  const valid = ids.length
    ? await ctx.db.select({ id: competencyCriteria.id }).from(competencyCriteria).where(and(inArray(competencyCriteria.id, ids), eq(competencyCriteria.courseId, l.courseId), eq(competencyCriteria.isActive, true)))
    : [];
  if (valid.length !== ids.length) throw bad("Tiêu chí trọng tâm phải là tiêu chí đang dùng của khoá");
  await ctx.db.transaction(async (txx) => {
    const tx = asDb(txx);
    const before = await tx.select({ criterionId: lessonFocusCriteria.criterionId }).from(lessonFocusCriteria).where(eq(lessonFocusCriteria.lessonId, l.id));
    await tx.delete(lessonFocusCriteria).where(eq(lessonFocusCriteria.lessonId, l.id));
    if (ids.length) await tx.insert(lessonFocusCriteria).values(ids.map((criterionId) => ({ lessonId: l.id, criterionId, createdBy: ctx.user.id })));
    await writeAudit(tx, {
      actorId: ctx.user.id, action: "UPDATE", module: "academics", entity: "lesson_focus_criteria", entityId: l.id,
      before: { criterionIds: before.map((b) => b.criterionId) }, after: { criterionIds: ids }, ip: ctx.ip, tenantId: l.tenantId,
    });
  });
  return { ok: true, count: ids.length };
}

/** Nhân bản giáo trình: chép cả tiêu chí trọng tâm theo số thứ tự bài (gọi TRONG transaction nhân bản) */
export async function cloneLessonFocus(tx: Db, fromCurriculumId: string, toCurriculumId: string) {
  await tx.execute(sql`
    insert into ${lessonFocusCriteria} (lesson_id, criterion_id, created_by)
    select nl.id, f.criterion_id, f.created_by
      from ${lessonFocusCriteria} f
      join ${lessons} ol on ol.id = f.lesson_id and ol.curriculum_id = ${fromCurriculumId}
      join ${lessons} nl on nl.curriculum_id = ${toCurriculumId} and nl.sequence_no = ol.sequence_no
    on conflict (lesson_id, criterion_id) do nothing`);
}
