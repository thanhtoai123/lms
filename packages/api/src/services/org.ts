import { and, eq, inArray, isNull, sql, asc, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { centers, regions, rooms, classes, students, sessions, staff, orgUnits, legalEntities } from "@satarobo/db";
import {
  visibleCenterIds, normalizeEquipment, roomUsable,
  buildPath, pathSegment, validateUnitCode, recomputeSubtreePaths, canDeleteUnit, assertImmutable, flattenTree, visibleUnitIds,
  ORG_UNIT_TYPE_VI, ORG_RELATIONSHIP_VI, ORG_UNIT_STATUS_VI, ORG_PARENT_TYPES,
  type RoomStatus, type OrgUnitType, type OrgRelationship, type OrgUnitStatus, type OrgUnitNode,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { tenantCond, assertTenant } from "./tenantScope";

type Db = ProtectedContext["db"];
const CENTER_ID = sql.raw('"centers"."id"');

function scopeCenters(ctx: ProtectedContext) {
  const v = visibleCenterIds(ctx.actor);
  const byCenter = v === null ? sql`true` : v.length ? inArray(centers.id, v) : sql`false`;
  return and(byCenter, tenantCond(ctx, centers))!;
}

export async function listCenters(ctx: ProtectedContext) {
  requirePermission(ctx, "center:read", {});
  return ctx.db
    .select({
      id: centers.id, code: centers.code, name: centers.name, address: centers.address, phone: centers.phone, isActive: centers.isActive,
      rooms: sql<number>`(select count(*)::int from ${rooms} r where r.center_id = ${CENTER_ID} and r.is_active)`,
      runningClasses: sql<number>`(select count(*)::int from ${classes} c where c.center_id = ${CENTER_ID} and c.status in ('recruiting','running') and c.deleted_at is null)`,
      activeStudents: sql<number>`(select count(*)::int from ${students} s where s.home_center_id = ${CENTER_ID} and s.status in ('active','trial') and s.deleted_at is null)`,
    })
    .from(centers).where(scopeCenters(ctx)).orderBy(asc(centers.code));
}

export async function upsertCenter(ctx: ProtectedContext, input: { id?: string; code: string; name: string; address?: string | null; phone?: string | null; isActive?: boolean }) {
  requirePermission(ctx, "center:update", {}); // chỉ Super Admin (cây tổ chức)
  const code = input.code.trim().toUpperCase();
  return ctx.db.transaction(async (tx) => {
    if (input.id) {
      const cur = await tx.query.centers.findFirst({ where: eq(centers.id, input.id), columns: { id: true, tenantId: true } });
      assertTenant(ctx, cur, "Cơ sở");
    }
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
  const conds = [v === null ? sql`true` : v.length ? inArray(rooms.centerId, v) : sql`false`, tenantCond(ctx, rooms)];
  if (input.centerId) conds.push(eq(rooms.centerId, input.centerId));
  return ctx.db
    .select({
      id: rooms.id, centerId: rooms.centerId, centerCode: centers.code, code: rooms.code, name: rooms.name, capacity: rooms.capacity, isActive: rooms.isActive,
      status: rooms.status, equipment: rooms.equipment,
      sessionsThisWeek: sql<number>`(select count(*)::int from ${sessions} s where s.room_id = ${rooms.id} and s.date between date_trunc('week', current_date)::date and (date_trunc('week', current_date) + interval '6 days')::date and s.status not in ('cancelled','rescheduled'))`,
      homeClasses: sql<number>`(select count(*)::int from ${classes} c where c.home_room_id = ${rooms.id} and c.status in ('recruiting','running') and c.deleted_at is null)`,
    })
    .from(rooms).innerJoin(centers, eq(centers.id, rooms.centerId))
    .where(and(...conds)).orderBy(asc(centers.code), asc(rooms.code));
}

export async function upsertRoom(ctx: ProtectedContext, input: { id?: string; centerId: string; code: string; name: string; capacity: number; status?: RoomStatus; equipment?: string[]; isActive?: boolean }) {
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
    const status: RoomStatus = input.status ?? (input.isActive === false ? "paused" : "active");
    const data = { centerId: input.centerId, code, name: input.name.trim(), capacity: input.capacity, status, equipment: normalizeEquipment(input.equipment), isActive: roomUsable(status) };
    const [row] = input.id
      ? await tx.update(rooms).set({ ...data, updatedAt: new Date() }).where(eq(rooms.id, input.id)).returning()
      : await tx.insert(rooms).values(data).returning();
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: input.id ? "UPDATE" : "CREATE", module: "org", entity: "rooms", entityId: row!.id, after: data, ip: ctx.ip });
    return row!;
  });
}

/* ================================================================== */
/* Cây tổ chức động (/to-chuc)                                         */
/* ================================================================== */

const bad = (m: string) => new TRPCError({ code: "BAD_REQUEST", message: m });
const pre = (m: string) => new TRPCError({ code: "PRECONDITION_FAILED", message: m });
const notFound = (m = "Không tìm thấy đơn vị") => new TRPCError({ code: "NOT_FOUND", message: m });

/** Mọi thay đổi trên cây tổ chức bắt buộc ghi lý do */
function requireReason(reason: string | null | undefined): string {
  const r = (reason ?? "").trim();
  if (r.length < 5) throw bad("Thay đổi cây tổ chức phải ghi lý do (tối thiểu 5 ký tự)");
  if (r.length > 300) throw bad("Lý do tối đa 300 ký tự");
  return r;
}

async function liveUnits(db: Db, ctx?: ProtectedContext): Promise<(typeof orgUnits.$inferSelect)[]> {
  // Cây tổ chức của trung tâm khác không hiện trong cây của mình
  const where = ctx ? and(isNull(orgUnits.deletedAt), tenantCond(ctx, orgUnits)) : isNull(orgUnits.deletedAt);
  return db.select().from(orgUnits).where(where).orderBy(asc(orgUnits.path));
}

const asNode = (u: typeof orgUnits.$inferSelect): OrgUnitNode => ({ id: u.id, code: u.code, name: u.name, type: u.type as OrgUnitType, parentId: u.parentId, path: u.path, status: u.status as OrgUnitStatus });

/** Cây tổ chức đầy đủ + số liệu kèm theo, cho trang /to-chuc */
export async function orgUnitTree(ctx: ProtectedContext) {
  requirePermission(ctx, "system:read");
  const [units, ents, stu, cls, st] = await Promise.all([
    liveUnits(ctx.db, ctx),
    ctx.db.select().from(legalEntities).where(tenantCond(ctx, legalEntities)).orderBy(asc(legalEntities.legalName)),
    ctx.db.select({ centerId: students.homeCenterId, n: sql<number>`count(*)::int` }).from(students).where(and(inArray(students.status, ["active", "trial", "paused"]), isNull(students.deletedAt))).groupBy(students.homeCenterId),
    ctx.db.select({ centerId: classes.centerId, n: sql<number>`count(*)::int` }).from(classes).where(inArray(classes.status, ["running", "recruiting"])).groupBy(classes.centerId),
    ctx.db.select({ centerId: staff.centerId, n: sql<number>`count(*)::int` }).from(staff).where(sql`${staff.status} <> 'resigned'`).groupBy(staff.centerId),
  ]);
  const childCount = new Map<string, number>();
  for (const u of units) if (u.parentId) childCount.set(u.parentId, (childCount.get(u.parentId) ?? 0) + 1);
  const entById = new Map(ents.map((e) => [e.id, e]));

  const items = flattenTree(units.map(asNode)).map(({ node, depth }) => {
    const u = units.find((x) => x.id === node.id)!;
    return {
      id: u.id, code: u.code, name: u.name, type: u.type as OrgUnitType, typeLabel: ORG_UNIT_TYPE_VI[u.type as OrgUnitType],
      parentId: u.parentId, path: u.path, depth, address: u.address,
      relationshipType: u.relationshipType as OrgRelationship, relationshipLabel: ORG_RELATIONSHIP_VI[u.relationshipType as OrgRelationship],
      status: u.status as OrgUnitStatus, statusLabel: ORG_UNIT_STATUS_VI[u.status as OrgUnitStatus],
      legalEntityId: u.legalEntityId, legalEntityName: u.legalEntityId ? entById.get(u.legalEntityId)?.legalName ?? null : null,
      centerId: u.centerId, regionId: u.regionId, note: u.note,
      children: childCount.get(u.id) ?? 0,
      students: u.centerId ? stu.find((s) => s.centerId === u.centerId)?.n ?? 0 : 0,
      classes: u.centerId ? cls.find((s) => s.centerId === u.centerId)?.n ?? 0 : 0,
      staff: u.centerId ? st.find((s) => s.centerId === u.centerId)?.n ?? 0 : 0,
    };
  });

  return {
    items,
    legalEntities: ents,
    canEdit: ctx.actor.assignments.some((a) => a.role === "SUPER_ADMIN"),
    /** Loại nào đặt được dưới loại nào — để UI lọc danh sách cha */
    parentTypes: ORG_PARENT_TYPES,
    seeded: units.length > 0,
  };
}

/** Đơn vị mà một người (theo path đơn vị của họ) được thấy — chính mình + nhánh dưới */
export async function orgUnitScope(ctx: ProtectedContext, actorPath: string | null) {
  requirePermission(ctx, "system:read");
  const units = await liveUnits(ctx.db);
  const ids = visibleUnitIds(actorPath, units.map(asNode));
  const centersInScope = units.filter((u) => ids.includes(u.id) && u.centerId).map((u) => u.centerId!);
  return { unitIds: ids, centerIds: [...new Set(centersInScope)] };
}

export interface CreateOrgUnitInput {
  code: string;
  name: string;
  type: OrgUnitType;
  parentId: string | null;
  address?: string | null;
  relationshipType?: OrgRelationship;
  legalEntityId?: string | null;
  /** Gắn vào cơ sở sẵn có thay vì tạo cơ sở mới (giữ nguyên phân quyền đang chạy) */
  centerId?: string | null;
  note?: string | null;
  reason: string;
}

export async function createOrgUnit(ctx: ProtectedContext, input: CreateOrgUnitInput) {
  requirePermission(ctx, "system:update");
  const reason = requireReason(input.reason);
  const code = input.code.trim().toUpperCase();
  const codeErr = validateUnitCode(code);
  if (codeErr) throw bad(codeErr);

  return ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const dup = await db.select({ id: orgUnits.id }).from(orgUnits).where(eq(orgUnits.code, code)).limit(1);
    if (dup.length) throw new TRPCError({ code: "CONFLICT", message: `Mã đơn vị ${code} đã tồn tại` });

    const parent = input.parentId ? (await db.select().from(orgUnits).where(and(eq(orgUnits.id, input.parentId), isNull(orgUnits.deletedAt))).limit(1))[0] : null;
    if (input.parentId && !parent) throw notFound("Không tìm thấy đơn vị cha");
    const allowed = ORG_PARENT_TYPES[input.type];
    if (!allowed.includes(parent ? (parent.type as OrgUnitType) : null)) {
      throw pre(`${ORG_UNIT_TYPE_VI[input.type]} không thể trực thuộc ${parent ? ORG_UNIT_TYPE_VI[parent.type as OrgUnitType] : "gốc cây"}`);
    }
    if (!input.parentId) {
      const root = await db.select({ id: orgUnits.id }).from(orgUnits).where(and(eq(orgUnits.type, "root"), isNull(orgUnits.deletedAt))).limit(1);
      if (root.length) throw pre("Cây đã có đơn vị gốc — chọn đơn vị cha");
    }
    const sibling = await db.select({ id: orgUnits.id }).from(orgUnits)
      .where(and(input.parentId ? eq(orgUnits.parentId, input.parentId) : isNull(orgUnits.parentId), isNull(orgUnits.deletedAt)));
    if (sibling.length) {
      const sibs = await db.select({ code: orgUnits.code }).from(orgUnits).where(and(inArray(orgUnits.id, sibling.map((s) => s.id))));
      if (sibs.some((s) => pathSegment(s.code) === pathSegment(code))) throw new TRPCError({ code: "CONFLICT", message: `Đơn vị cha đã có đơn vị mã ${code}` });
    }

    // Tương thích: đơn vị loại "cơ sở" phải có một dòng trong `centers` (phân quyền vẫn chạy trên bảng này)
    let centerId = input.centerId ?? null;
    if (input.type === "center") {
      if (centerId) {
        const c = await db.select({ id: centers.id }).from(centers).where(eq(centers.id, centerId)).limit(1);
        if (!c.length) throw notFound("Không tìm thấy cơ sở để gắn");
        const taken = await db.select({ id: orgUnits.id }).from(orgUnits).where(and(eq(orgUnits.centerId, centerId), isNull(orgUnits.deletedAt))).limit(1);
        if (taken.length) throw pre("Cơ sở này đã gắn với một đơn vị khác trong cây");
      } else {
        const dupCenter = await db.select({ id: centers.id }).from(centers).where(eq(centers.code, code)).limit(1);
        if (dupCenter.length) centerId = dupCenter[0]!.id;
        else {
          const [c] = await db.insert(centers).values({ code, name: input.name.trim(), address: input.address ?? null }).returning({ id: centers.id });
          centerId = c!.id;
          await writeAudit(db, { actorId: ctx.user.id, action: "CREATE", module: "org", entity: "centers", entityId: centerId, after: { code, name: input.name.trim() }, reason, ip: ctx.ip });
        }
      }
    }

    const path = buildPath(parent?.path ?? null, code);
    const data = {
      code, name: input.name.trim(), type: input.type, parentId: input.parentId, path,
      address: input.address ?? null, relationshipType: input.relationshipType ?? "owned",
      status: "active" as const, legalEntityId: input.legalEntityId ?? null,
      centerId, regionId: null as string | null, note: input.note ?? null,
    };
    const [row] = await db.insert(orgUnits).values(data).returning();
    await writeAudit(db, { actorId: ctx.user.id, action: "CREATE", module: "org", entity: "org_units", entityId: row!.id, after: data, reason, ip: ctx.ip });
    return row!;
  });
}

export interface UpdateOrgUnitInput {
  id: string;
  name: string;
  address?: string | null;
  relationshipType?: OrgRelationship;
  status?: OrgUnitStatus;
  legalEntityId?: string | null;
  note?: string | null;
  /** Chỉ để kiểm tra bất biến — truyền lên thì phải trùng giá trị đang có */
  code?: string;
  type?: OrgUnitType;
  reason: string;
}

export async function updateOrgUnit(ctx: ProtectedContext, input: UpdateOrgUnitInput) {
  requirePermission(ctx, "system:update");
  const reason = requireReason(input.reason);
  return ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const [cur] = await db.select().from(orgUnits).where(and(eq(orgUnits.id, input.id), isNull(orgUnits.deletedAt))).limit(1);
    if (!cur) throw notFound();
    // Mã và loại KHÔNG đổi được sau khi tạo
    assertImmutable({ code: cur.code, type: cur.type as OrgUnitType }, { code: input.code, type: input.type });

    const before = { name: cur.name, address: cur.address, relationshipType: cur.relationshipType, status: cur.status, legalEntityId: cur.legalEntityId, note: cur.note };
    const after = {
      name: input.name.trim(),
      address: input.address ?? null,
      relationshipType: input.relationshipType ?? (cur.relationshipType as OrgRelationship),
      status: input.status ?? (cur.status as OrgUnitStatus),
      legalEntityId: input.legalEntityId ?? null,
      note: input.note ?? null,
    };
    const [row] = await db.update(orgUnits).set({ ...after, updatedAt: new Date() }).where(eq(orgUnits.id, cur.id)).returning();

    // Đồng bộ sang `centers` để không phá phân quyền theo cơ sở
    if (cur.centerId) {
      await db.update(centers).set({ name: after.name, address: after.address, isActive: after.status === "active", updatedAt: new Date() }).where(eq(centers.id, cur.centerId));
    }
    await writeAudit(db, { actorId: ctx.user.id, action: "UPDATE", module: "org", entity: "org_units", entityId: cur.id, before, after, reason, ip: ctx.ip });
    return row!;
  });
}

/** Đổi đơn vị cha → tính lại path CẢ NHÁNH CON */
export async function moveOrgUnit(ctx: ProtectedContext, input: { id: string; parentId: string | null; reason: string }) {
  requirePermission(ctx, "system:update");
  const reason = requireReason(input.reason);
  return ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const units = await liveUnits(db);
    const cur = units.find((u) => u.id === input.id);
    if (!cur) throw notFound();
    if (cur.parentId === input.parentId) return { changed: 0, items: [] as { code: string; from: string; to: string }[] };

    let changes;
    try {
      changes = recomputeSubtreePaths(units.map(asNode), input.id, input.parentId);
    } catch (e) {
      throw pre((e as Error).message);
    }
    for (const c of changes) {
      await db.update(orgUnits).set({ path: c.to, parentId: c.parentId, updatedAt: new Date() }).where(eq(orgUnits.id, c.id));
    }
    const byId = new Map(units.map((u) => [u.id, u]));
    const detail = changes.map((c) => ({ code: byId.get(c.id)!.code, from: c.from, to: c.to }));
    await writeAudit(db, {
      actorId: ctx.user.id, action: "UPDATE", module: "org", entity: "org_units", entityId: cur.id,
      before: { parentId: cur.parentId, path: cur.path },
      after: { parentId: input.parentId, path: changes[0]?.to ?? cur.path, subtree: detail },
      reason, ip: ctx.ip,
    });
    return { changed: changes.length, items: detail };
  });
}

/** Xoá mềm — còn đơn vị con đang hoạt động thì không xoá */
export async function deleteOrgUnit(ctx: ProtectedContext, input: { id: string; reason: string }) {
  requirePermission(ctx, "system:update");
  const reason = requireReason(input.reason);
  return ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const [cur] = await db.select().from(orgUnits).where(and(eq(orgUnits.id, input.id), isNull(orgUnits.deletedAt))).limit(1);
    if (!cur) throw notFound();
    const children = await db.select({ status: orgUnits.status, code: orgUnits.code }).from(orgUnits).where(and(eq(orgUnits.parentId, cur.id), isNull(orgUnits.deletedAt)));
    const blocker = canDeleteUnit({ type: cur.type as OrgUnitType, code: cur.code }, children.map((c) => ({ status: c.status as OrgUnitStatus, code: c.code })));
    if (blocker) throw pre(blocker);

    await db.update(orgUnits).set({ deletedAt: new Date(), deletedBy: ctx.user.id, status: "inactive", updatedAt: new Date() }).where(eq(orgUnits.id, cur.id));
    // Không xoá `centers` (dữ liệu nghiệp vụ vẫn trỏ vào) — chỉ ngừng hoạt động
    if (cur.centerId) await db.update(centers).set({ isActive: false, updatedAt: new Date() }).where(eq(centers.id, cur.centerId));
    await writeAudit(db, { actorId: ctx.user.id, action: "DELETE", module: "org", entity: "org_units", entityId: cur.id, before: { code: cur.code, name: cur.name, path: cur.path, status: cur.status }, after: { deleted: true }, reason, ip: ctx.ip });
    return { ok: true };
  });
}

export async function upsertLegalEntity(ctx: ProtectedContext, input: { id?: string; legalName: string; taxCode: string; address?: string | null; representative?: string | null; isActive?: boolean; reason: string }) {
  requirePermission(ctx, "system:update");
  const reason = requireReason(input.reason);
  const taxCode = input.taxCode.trim();
  if (!/^\d{10}(-\d{3})?$/.test(taxCode)) throw bad("Mã số thuế gồm 10 số, chi nhánh thêm -3 số");
  return ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const dup = await db.select({ id: legalEntities.id }).from(legalEntities).where(eq(legalEntities.taxCode, taxCode)).limit(1);
    if (dup.length && dup[0]!.id !== input.id) throw new TRPCError({ code: "CONFLICT", message: `Mã số thuế ${taxCode} đã khai` });
    const data = { legalName: input.legalName.trim(), taxCode, address: input.address ?? null, representative: input.representative ?? null, isActive: input.isActive ?? true };
    const [row] = input.id
      ? await db.update(legalEntities).set({ ...data, updatedAt: new Date() }).where(eq(legalEntities.id, input.id)).returning()
      : await db.insert(legalEntities).values(data).returning();
    if (!row) throw notFound("Không tìm thấy pháp nhân");
    await writeAudit(db, { actorId: ctx.user.id, action: input.id ? "UPDATE" : "CREATE", module: "org", entity: "legal_entities", entityId: row.id, after: data, reason, ip: ctx.ip });
    return row;
  });
}

/**
 * Dựng cây lần đầu từ dữ liệu đang có: gốc hệ thống → hội sở → khối vùng (`regions`) → cơ sở (`centers`).
 * Chạy lại được — chỉ thêm đơn vị còn thiếu, không đụng đơn vị đã có.
 */
export async function seedOrgUnitsFromCenters(ctx: ProtectedContext, input: { reason: string }) {
  requirePermission(ctx, "system:update");
  const reason = requireReason(input.reason);
  return ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const existing = await liveUnits(db);
    const byCode = new Map(existing.map((u) => [u.code, u]));
    let created = 0;

    const ensure = async (x: { code: string; name: string; type: OrgUnitType; parentPath: string | null; parentId: string | null; centerId?: string | null; regionId?: string | null; address?: string | null; sortOrder?: number }) => {
      const found = byCode.get(x.code);
      if (found) return found;
      const path = buildPath(x.parentPath, x.code);
      const [row] = await db.insert(orgUnits).values({
        code: x.code, name: x.name, type: x.type, parentId: x.parentId, path,
        address: x.address ?? null, relationshipType: "owned", status: "active",
        centerId: x.centerId ?? null, regionId: x.regionId ?? null, sortOrder: x.sortOrder ?? 0,
      }).returning();
      byCode.set(x.code, row!);
      created++;
      return row!;
    };

    const root = await ensure({ code: "ROOT", name: "Sata Robo", type: "root", parentPath: null, parentId: null });
    const ho = await ensure({ code: "HO", name: "Hội sở Sata Robo", type: "ho", parentPath: root.path, parentId: root.id });

    const rgs = await db.select().from(regions).orderBy(asc(regions.sortOrder), asc(regions.code));
    const regionUnit = new Map<string, typeof orgUnits.$inferSelect>();
    for (const r of rgs) {
      const u = await ensure({ code: r.code, name: r.name, type: "region", parentPath: ho.path, parentId: ho.id, regionId: r.id, sortOrder: r.sortOrder });
      regionUnit.set(r.id, u);
    }

    const ctrs = await db.select().from(centers).orderBy(asc(centers.code));
    for (const c of ctrs) {
      const parent = c.regionId ? regionUnit.get(c.regionId) ?? ho : ho;
      await ensure({ code: c.code, name: c.name, type: "center", parentPath: parent.path, parentId: parent.id, centerId: c.id, address: c.address });
    }

    if (created) {
      await writeAudit(db, { actorId: ctx.user.id, action: "CREATE", module: "org", entity: "org_units", entityId: root.id, after: { seeded: created, from: "centers + regions" }, reason, ip: ctx.ip });
    }
    return { created };
  });
}

/** Danh sách cơ sở chưa có đơn vị trong cây (để gắn khi tạo đơn vị loại "cơ sở") */
export async function unlinkedCenters(ctx: ProtectedContext) {
  requirePermission(ctx, "system:read");
  const linked = await ctx.db.select({ centerId: orgUnits.centerId }).from(orgUnits).where(and(isNull(orgUnits.deletedAt), sql`${orgUnits.centerId} is not null`));
  const ids = linked.map((l) => l.centerId!).filter(Boolean);
  const rows = await ctx.db.select({ id: centers.id, code: centers.code, name: centers.name }).from(centers).orderBy(asc(centers.code));
  return rows.filter((r) => !ids.includes(r.id));
}
