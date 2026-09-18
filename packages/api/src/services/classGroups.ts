import { and, eq, inArray, sql, asc, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { classGroups, classes, centers } from "@satarobo/db";
import { visibleCenterIds } from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { tenantCond } from "./tenantScope";
import { writeAudit } from "./audit";

type Db = ProtectedContext["db"];

/** Nhóm lớp không gắn cơ sở (dùng chung toàn hệ thống) luôn nhìn thấy được */
function scope(ctx: ProtectedContext) {
  const v = visibleCenterIds(ctx.actor);
  if (v === null) return sql`true`;
  return v.length ? sql`(${classGroups.centerId} is null or ${inArray(classGroups.centerId, v)})` : isNull(classGroups.centerId);
}

export async function listClassGroups(ctx: ProtectedContext, input: { centerId?: string; includeInactive?: boolean } = {}) {
  requirePermission(ctx, "class:read", { centerId: input.centerId ?? null });
  const conds = [isNull(classGroups.deletedAt), scope(ctx), tenantCond(ctx, classGroups)];
  if (input.centerId) conds.push(eq(classGroups.centerId, input.centerId));
  if (!input.includeInactive) conds.push(eq(classGroups.isActive, true));
  return ctx.db
    .select({
      id: classGroups.id, code: classGroups.code, name: classGroups.name, note: classGroups.note, isActive: classGroups.isActive,
      centerId: classGroups.centerId, centerCode: centers.code, centerName: centers.name, createdAt: classGroups.createdAt,
      classCount: sql<number>`(select count(*)::int from ${classes} c where c.class_group_id = ${classGroups.id} and c.deleted_at is null)`,
    })
    .from(classGroups)
    .leftJoin(centers, eq(centers.id, classGroups.centerId))
    .where(and(...conds))
    .orderBy(asc(classGroups.code));
}

export async function upsertClassGroup(
  ctx: ProtectedContext,
  input: { id?: string; code: string; name: string; centerId?: string | null; note?: string | null; isActive?: boolean },
) {
  requirePermission(ctx, "class:update", { centerId: input.centerId ?? null });
  const code = input.code.trim().toUpperCase();
  if (code.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Mã nhóm lớp tối thiểu 2 ký tự" });
  return ctx.db.transaction(async (tx) => {
    let before: typeof classGroups.$inferSelect | undefined;
    if (input.id) {
      before = await tx.query.classGroups.findFirst({ where: eq(classGroups.id, input.id) });
      if (!before || before.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy nhóm lớp" });
      requirePermission(ctx, "class:update", { centerId: before.centerId });
    }
    const dup = await tx.query.classGroups.findFirst({ where: and(eq(classGroups.code, code), isNull(classGroups.deletedAt)) });
    if (dup && dup.id !== input.id) throw new TRPCError({ code: "CONFLICT", message: `Mã nhóm lớp ${code} đã tồn tại` });
    const data = {
      code, name: input.name.trim(), centerId: input.centerId ?? null, note: input.note?.trim() || null,
      isActive: input.isActive ?? before?.isActive ?? true,
    };
    const [row] = input.id
      ? await tx.update(classGroups).set({ ...data, updatedAt: new Date() }).where(eq(classGroups.id, input.id)).returning()
      : await tx.insert(classGroups).values({ ...data, createdBy: ctx.user.id }).returning();
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    await writeAudit(tx as unknown as Db, {
      actorId: ctx.user.id, action: input.id ? "UPDATE" : "CREATE", module: "academics", entity: "class_groups", entityId: row.id,
      before: before ? { code: before.code, name: before.name, centerId: before.centerId, isActive: before.isActive } : undefined, after: data, ip: ctx.ip,
    });
    return row;
  });
}

/** Xoá mềm: chỉ khi không còn lớp nào đang gắn nhóm */
export async function deleteClassGroup(ctx: ProtectedContext, input: { id: string; reason: string }) {
  const g = await ctx.db.query.classGroups.findFirst({ where: eq(classGroups.id, input.id) });
  if (!g || g.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy nhóm lớp" });
  requirePermission(ctx, "class:update", { centerId: g.centerId });
  const [used] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(classes).where(and(eq(classes.classGroupId, g.id), isNull(classes.deletedAt)));
  if ((used?.n ?? 0) > 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Còn ${used?.n} lớp thuộc nhóm này — gỡ lớp khỏi nhóm trước` });
  await ctx.db.transaction(async (tx) => {
    await tx.update(classGroups).set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() }).where(eq(classGroups.id, g.id));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "DELETE", module: "academics", entity: "class_groups", entityId: g.id, before: { code: g.code, name: g.name }, reason: input.reason, ip: ctx.ip });
  });
  return { ok: true };
}

/** Lựa chọn cho ô "Nhóm lớp" trong form lớp */
export async function classGroupOptions(db: Db, centerId: string | null) {
  return db
    .select({ id: classGroups.id, code: classGroups.code, name: classGroups.name, centerId: classGroups.centerId })
    .from(classGroups)
    .where(and(isNull(classGroups.deletedAt), eq(classGroups.isActive, true), centerId ? sql`(${classGroups.centerId} is null or ${classGroups.centerId} = ${centerId})` : sql`true`))
    .orderBy(asc(classGroups.code));
}
