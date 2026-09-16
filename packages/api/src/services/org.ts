import { and, eq, inArray, sql, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { centers, rooms, classes, students, sessions } from "@satarobo/db";
import { visibleCenterIds } from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";

type Db = ProtectedContext["db"];

function scopeCenters(ctx: ProtectedContext) {
  const v = visibleCenterIds(ctx.actor);
  return v === null ? sql`true` : v.length ? inArray(centers.id, v) : sql`false`;
}

export async function listCenters(ctx: ProtectedContext) {
  requirePermission(ctx, "center:read", {});
  return ctx.db
    .select({
      id: centers.id, code: centers.code, name: centers.name, address: centers.address, phone: centers.phone, isActive: centers.isActive,
      rooms: sql<number>`(select count(*)::int from ${rooms} r where r.center_id = ${centers.id} and r.is_active)`,
      runningClasses: sql<number>`(select count(*)::int from ${classes} c where c.center_id = ${centers.id} and c.status in ('recruiting','running') and c.deleted_at is null)`,
      activeStudents: sql<number>`(select count(*)::int from ${students} s where s.home_center_id = ${centers.id} and s.status in ('active','trial') and s.deleted_at is null)`,
    })
    .from(centers).where(scopeCenters(ctx)).orderBy(asc(centers.code));
}

export async function upsertCenter(ctx: ProtectedContext, input: { id?: string; code: string; name: string; address?: string | null; phone?: string | null; isActive?: boolean }) {
  requirePermission(ctx, "center:update", {}); // chỉ Super Admin (cây tổ chức)
  const code = input.code.trim().toUpperCase();
  return ctx.db.transaction(async (tx) => {
    const dup = await tx.query.centers.findFirst({ where: eq(centers.code, code) });
    if (dup && dup.id !== input.id) throw new TRPCError({ code: "CONFLICT", message: `Mã cơ sở ${code} đã tồn tại` });
    const data = { code, name: input.name.trim(), address: input.address ?? null, phone: input.phone ?? null, isActive: input.isActive ?? true };
    const [row] = input.id
      ? await tx.update(centers).set({ ...data, updatedAt: new Date() }).where(eq(centers.id, input.id)).returning()
      : await tx.insert(centers).values(data).returning();
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: input.id ? "UPDATE" : "CREATE", module: "org", entity: "centers", entityId: row.id, after: data, ip: ctx.ip });
    return row;
  });
}

export async function listRooms(ctx: ProtectedContext, input: { centerId?: string }) {
  requirePermission(ctx, "class:read", { centerId: input.centerId ?? null });
  const v = visibleCenterIds(ctx.actor);
  const conds = [v === null ? sql`true` : v.length ? inArray(rooms.centerId, v) : sql`false`];
  if (input.centerId) conds.push(eq(rooms.centerId, input.centerId));
  return ctx.db
    .select({
      id: rooms.id, centerId: rooms.centerId, centerCode: centers.code, code: rooms.code, name: rooms.name, capacity: rooms.capacity, isActive: rooms.isActive,
      sessionsThisWeek: sql<number>`(select count(*)::int from ${sessions} s where s.room_id = ${rooms.id} and s.date between date_trunc('week', current_date)::date and (date_trunc('week', current_date) + interval '6 days')::date and s.status not in ('cancelled','rescheduled'))`,
      homeClasses: sql<number>`(select count(*)::int from ${classes} c where c.home_room_id = ${rooms.id} and c.status in ('recruiting','running') and c.deleted_at is null)`,
    })
    .from(rooms).innerJoin(centers, eq(centers.id, rooms.centerId))
    .where(and(...conds)).orderBy(asc(centers.code), asc(rooms.code));
}

export async function upsertRoom(ctx: ProtectedContext, input: { id?: string; centerId: string; code: string; name: string; capacity: number; isActive?: boolean }) {
  requirePermission(ctx, "room:update", { centerId: input.centerId });
  const code = input.code.trim().toUpperCase();
  return ctx.db.transaction(async (tx) => {
    if (input.id) {
      const cur = await tx.query.rooms.findFirst({ where: eq(rooms.id, input.id) });
      if (!cur) throw new TRPCError({ code: "NOT_FOUND" });
      requirePermission(ctx, "room:update", { centerId: cur.centerId });
    }
    const dup = await tx.query.rooms.findFirst({ where: and(eq(rooms.centerId, input.centerId), eq(rooms.code, code)) });
    if (dup && dup.id !== input.id) throw new TRPCError({ code: "CONFLICT", message: `Cơ sở đã có phòng ${code}` });
    const data = { centerId: input.centerId, code, name: input.name.trim(), capacity: input.capacity, isActive: input.isActive ?? true };
    const [row] = input.id
      ? await tx.update(rooms).set({ ...data, updatedAt: new Date() }).where(eq(rooms.id, input.id)).returning()
      : await tx.insert(rooms).values(data).returning();
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: input.id ? "UPDATE" : "CREATE", module: "org", entity: "rooms", entityId: row!.id, after: data, ip: ctx.ip });
    return row!;
  });
}
