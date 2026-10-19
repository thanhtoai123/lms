import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { competencyCriteria, courses, curricula, lessons, syncThSteamCatalog, TH_CURRICULUM_NAME, type Database } from "@satarobo/db";
import { hasPermission, thCourseSpecs } from "@satarobo/core";
import { TRPCError } from "@trpc/server";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";

/**
 * Đào tạo → Khung chương trình chuẩn TH STEAM (docs/KHUNG-CHUONG-TRINH.md).
 * Cây chuyên ngành → chương trình → năm học → học phần lấy từ @satarobo/core (TH_TRACKS / TH_PROGRAMS);
 * ở đây chỉ trả TRẠNG THÁI trong CSDL của trung tâm (đã nạp khoá chưa, đủ buổi / tiêu chí chưa) và nút đồng bộ.
 */
export interface ThCourseState { id: string; isActive: boolean; totalSessions: number; lessons: number; criteria: number }

export async function thCatalogOverview(ctx: ProtectedContext) {
  requirePermission(ctx, "course:read");
  const tenantId = ctx.tenantId;
  if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tài khoản chưa gắn trung tâm" });
  const codes = thCourseSpecs().map((s) => s.code);
  const rows = await ctx.db.select({ id: courses.id, code: courses.code, isActive: courses.isActive, totalSessions: courses.totalSessions })
    .from(courses).where(and(eq(courses.tenantId, tenantId), inArray(courses.code, codes)));
  const ids = rows.map((r) => r.id);
  const lessonCount = ids.length
    ? await ctx.db.select({ courseId: curricula.courseId, n: sql<number>`count(${lessons.id})::int` }).from(curricula)
      .leftJoin(lessons, eq(lessons.curriculumId, curricula.id))
      .where(and(inArray(curricula.courseId, ids), eq(curricula.name, TH_CURRICULUM_NAME))).groupBy(curricula.courseId)
    : [];
  const critCount = ids.length
    ? await ctx.db.select({ courseId: competencyCriteria.courseId, n: sql<number>`count(*)::int` }).from(competencyCriteria)
      .where(and(inArray(competencyCriteria.courseId, ids), eq(competencyCriteria.isActive, true))).groupBy(competencyCriteria.courseId)
    : [];
  const ln = new Map(lessonCount.map((r) => [r.courseId, r.n]));
  const cn = new Map(critCount.map((r) => [r.courseId, r.n]));
  const state: Record<string, ThCourseState> = {};
  for (const r of rows) state[r.code] = { id: r.id, isActive: r.isActive, totalSessions: r.totalSessions, lessons: ln.get(r.id) ?? 0, criteria: cn.get(r.id) ?? 0 };
  const [others] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(courses)
    .where(and(eq(courses.tenantId, tenantId), eq(courses.isActive, true), notInArray(courses.code, codes)));
  return {
    state,
    otherActiveCourses: others?.n ?? 0,
    canSync: hasPermission(ctx.actor, "course:update") && hasPermission(ctx.actor, "curriculum:update"),
  };
}

export async function thCatalogSync(ctx: ProtectedContext, input: { retireOthers: boolean }) {
  requirePermission(ctx, "course:update");
  requirePermission(ctx, "curriculum:update");
  if (!ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tài khoản chưa gắn trung tâm" });
  const r = await syncThSteamCatalog(ctx.db as unknown as Database, { tenantId: ctx.tenantId, retireOthers: input.retireOthers, actorId: ctx.user.id });
  await writeAudit(ctx.db as unknown as Database, { actorId: ctx.user.id, action: "UPDATE", module: "course", entity: "th_catalog", entityId: null, after: { ...r, retireOthers: input.retireOthers }, ip: ctx.ip });
  return r;
}
