import { and, eq, inArray, sql, desc, asc, or, ilike, gte, lte, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";
import {
  inventoryItems, kitComponents, stockLevels, stockMovements, stockCounters, rentals, stockAudits, stockAuditLines,
  centers, courses, students, classes, users, orders, orderEvents, financeLedger, parents, studentGuardians,
} from "@satarobo/db";
import {
  authorize, visibleCenterIds, hasRole,
  signedQty, validateMovement, movingAverageCost, stockTone, maxAssemblable, validateBom, validateItem,
  rentalDueDate, rentalOverdueDays, rentalFee, depositRefund, auditTransition, validateAuditSubmit, auditSummary, isLargeVariance, stockCode,
  MANUAL_MOVEMENTS, ITEM_TYPE_VI, MOVEMENT_TYPE_VI,
  type Permission, type ItemType, type MovementType, type RentalStatus, type AuditStatus, type AuditAction, type StockCodePrefix, type StockTone,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { todayISO } from "./sessions";
import { createOrder } from "./finance";

type Db = ProtectedContext["db"];
const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });
const pre = (m: string | string[]) => new TRPCError({ code: "PRECONDITION_FAILED", message: Array.isArray(m) ? m.join("; ") : m });
const notFound = (m: string) => new TRPCError({ code: "NOT_FOUND", message: m });
const can = (ctx: ProtectedContext, p: Permission, centerId: string | null) => authorize(ctx.actor, p, { centerId }).allowed;
const PAGE = 50;

function rule<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if ((e as Error)?.name === "InventoryRuleError") throw pre((e as Error).message);
    throw e;
  }
}
function scopeOn(ctx: ProtectedContext, col: AnyPgColumn): SQL {
  const v = visibleCenterIds(ctx.actor);
  if (v === null) return sql`true`;
  return v.length ? (inArray(col, v) as SQL) : sql`false`;
}
/** Danh mục hàng dùng chung: chỉ Hội sở (quyền toàn hệ thống) được sửa */
function requireCatalogEditor(ctx: ProtectedContext) {
  const ok = ctx.actor.assignments.some((a) => a.centerId === null && authorize({ userId: ctx.actor.userId, assignments: [a] }, "inventory:update", {}).allowed);
  if (!ok) throw new TRPCError({ code: "FORBIDDEN", message: "Chỉ Hội sở được sửa danh mục hàng / định mức bộ học cụ" });
}
async function centerRow(db: Db, id: string) {
  const c = await db.query.centers.findFirst({ where: eq(centers.id, id) });
  if (!c) throw notFound("Không tìm thấy cơ sở");
  return c;
}
async function itemRow(db: Db, id: string) {
  const i = await db.query.inventoryItems.findFirst({ where: eq(inventoryItems.id, id) });
  if (!i) throw notFound("Không tìm thấy mặt hàng");
  return i;
}

export async function nextStockCode(db: Db, prefix: StockCodePrefix, centerCode: string) {
  const year = Number(todayISO().slice(0, 4));
  const key = `${prefix}-${centerCode}-${year}`;
  const [r] = await db.insert(stockCounters).values({ key, seq: 1 })
    .onConflictDoUpdate({ target: stockCounters.key, set: { seq: sql`${stockCounters.seq} + 1` } }).returning({ seq: stockCounters.seq });
  return stockCode(prefix, centerCode, year, r!.seq);
}

export interface MovementInput {
  code: string;
  itemId: string;
  centerId: string;
  type: MovementType;
  /** Dương cho mọi loại trừ "adjust" (có dấu) */
  qty: number;
  unitCost?: number | null;
  studentId?: string | null;
  classId?: string | null;
  orderId?: string | null;
  counterpartCenterId?: string | null;
  refType?: string | null;
  refId?: string | null;
  supplier?: string | null;
  note?: string | null;
  userId: string;
}

/** Ghi 1 dòng phiếu + cập nhật tồn (gọi trong transaction; khoá dòng tồn) */
export async function applyMovement(tx: Db, m: MovementInput) {
  await tx.insert(stockLevels).values({ itemId: m.itemId, centerId: m.centerId }).onConflictDoNothing();
  const rows = await tx.execute(sql`select on_hand, avg_cost from stock_levels where item_id = ${m.itemId} and center_id = ${m.centerId} for update`);
  const cur = (rows as unknown as { rows?: { on_hand: number; avg_cost: string | number }[] }).rows?.[0] ?? (rows as unknown as { on_hand: number; avg_cost: string | number }[])[0];
  const onHand = Number(cur?.on_hand ?? 0);
  const avg = Number(cur?.avg_cost ?? 0);
  const delta = rule(() => signedQty(m.type, m.qty, onHand));
  const incoming = m.type === "receipt" || m.type === "transfer_in" || m.type === "assemble_in";
  const newAvg = incoming && m.unitCost != null ? movingAverageCost(onHand, avg, delta, m.unitCost) : avg;
  const balance = onHand + delta;
  await tx.update(stockLevels).set({ onHand: balance, avgCost: newAvg, updatedAt: new Date() }).where(and(eq(stockLevels.itemId, m.itemId), eq(stockLevels.centerId, m.centerId)));
  const [row] = await tx.insert(stockMovements).values({
    code: m.code, itemId: m.itemId, centerId: m.centerId, type: m.type, qty: delta, balanceAfter: balance, unitCost: m.unitCost ?? (incoming ? null : avg),
    studentId: m.studentId ?? null, classId: m.classId ?? null, orderId: m.orderId ?? null, counterpartCenterId: m.counterpartCenterId ?? null,
    refType: m.refType ?? null, refId: m.refId ?? null, supplier: m.supplier?.trim() || null, note: m.note?.trim() || null, createdBy: m.userId,
  }).returning();
  return { ...row!, avgCost: avg };
}

/* ------------------------------------------------------------------ */
/* Danh mục hàng & bộ học cụ                                            */
/* ------------------------------------------------------------------ */

export async function listItems(ctx: ProtectedContext, input: { type?: ItemType; q?: string; includeInactive?: boolean }) {
  requirePermission(ctx, "inventory:read");
  const conds: SQL[] = [];
  if (input.type) conds.push(eq(inventoryItems.type, input.type));
  if (!input.includeInactive) conds.push(eq(inventoryItems.isActive, true));
  if (input.q?.trim()) conds.push(or(ilike(inventoryItems.name, `%${input.q.trim()}%`), ilike(inventoryItems.sku, `%${input.q.trim()}%`))!);
  const items = await ctx.db.select({ i: inventoryItems, courseCode: courses.code }).from(inventoryItems).leftJoin(courses, eq(courses.id, inventoryItems.courseId))
    .where(conds.length ? and(...conds) : undefined).orderBy(asc(inventoryItems.type), asc(inventoryItems.sku));
  const ids = items.map((r) => r.i.id);
  const [stock, bom, ctrs] = await Promise.all([
    ids.length ? ctx.db.select({ itemId: stockLevels.itemId, centerId: stockLevels.centerId, onHand: stockLevels.onHand, avgCost: stockLevels.avgCost }).from(stockLevels).where(and(inArray(stockLevels.itemId, ids), scopeOn(ctx, stockLevels.centerId))) : [],
    ids.length ? ctx.db.select({ kitId: kitComponents.kitId, componentId: kitComponents.componentId, qty: kitComponents.qty, sku: inventoryItems.sku, name: inventoryItems.name, unit: inventoryItems.unit })
      .from(kitComponents).innerJoin(inventoryItems, eq(inventoryItems.id, kitComponents.componentId)).where(inArray(kitComponents.kitId, ids)) : [],
    ctx.db.select({ id: centers.id, code: centers.code, name: centers.name }).from(centers).where(and(eq(centers.isActive, true), scopeOn(ctx, centers.id))).orderBy(asc(centers.code)),
  ]);
  const stockMap = new Map<string, number>(stock.map((s) => [`${s.itemId}|${s.centerId}`, s.onHand]));
  return {
    centers: ctrs,
    canEdit: ctx.actor.assignments.some((a) => a.centerId === null && authorize({ userId: ctx.actor.userId, assignments: [a] }, "inventory:update", {}).allowed),
    items: items.map(({ i, courseCode }) => {
      const byCenter = ctrs.map((c) => {
        const onHand = stockMap.get(`${i.id}|${c.id}`) ?? 0;
        const comps = bom.filter((b) => b.kitId === i.id);
        return {
          centerId: c.id, code: c.code, onHand, tone: stockTone(onHand, i.reorderLevel),
          assemblable: comps.length ? maxAssemblable(comps, Object.fromEntries(comps.map((b) => [b.componentId, stockMap.get(`${b.componentId}|${c.id}`) ?? 0]))) : 0,
        };
      });
      return { ...i, typeLabel: ITEM_TYPE_VI[i.type as ItemType], courseCode, bom: bom.filter((b) => b.kitId === i.id), byCenter, total: byCenter.reduce((a, x) => a + x.onHand, 0) };
    }),
  };
}

export interface ItemInput {
  id?: string; sku: string; name: string; type: ItemType; unit: string; courseId?: string | null;
  salePrice?: number | null; rentPrice?: number | null; deposit?: number | null; reorderLevel?: number; description?: string | null; isActive?: boolean;
}
export async function upsertItem(ctx: ProtectedContext, input: ItemInput) {
  requireCatalogEditor(ctx);
  const v = {
    sku: input.sku.trim().toUpperCase(), name: input.name.trim(), type: input.type, unit: input.unit.trim(), courseId: input.courseId ?? null,
    salePrice: input.salePrice ?? null, rentPrice: input.rentPrice ?? null, deposit: input.deposit ?? null, reorderLevel: input.reorderLevel ?? 0,
    description: input.description?.trim() || null, isActive: input.isActive ?? true,
  };
  const errs = validateItem(v);
  if (errs.length) throw bad(errs);
  const dup = await ctx.db.query.inventoryItems.findFirst({ where: and(eq(inventoryItems.sku, v.sku), input.id ? sql`${inventoryItems.id} <> ${input.id}` : sql`true`) });
  if (dup) throw pre(`Mã hàng ${v.sku} đã tồn tại`);
  if (input.id) {
    const old = await itemRow(ctx.db, input.id);
    if (old.type !== v.type) {
      const [m] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(stockMovements).where(eq(stockMovements.itemId, old.id));
      if ((m?.n ?? 0) > 0) throw pre("Mặt hàng đã có phát sinh kho — không đổi loại");
    }
    if (!v.isActive && old.isActive) {
      const [s] = await ctx.db.select({ n: sql<number>`coalesce(sum(${stockLevels.onHand}), 0)::int` }).from(stockLevels).where(eq(stockLevels.itemId, old.id));
      if ((s?.n ?? 0) > 0) throw pre(`Còn tồn ${s!.n} — xuất / điều chỉnh hết trước khi ngừng dùng`);
    }
    await ctx.db.update(inventoryItems).set(v).where(eq(inventoryItems.id, old.id));
    await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "inventory", entity: "inventory_items", entityId: old.id, before: { sku: old.sku, salePrice: old.salePrice, rentPrice: old.rentPrice, isActive: old.isActive }, after: v, ip: ctx.ip });
    return { id: old.id };
  }
  const [r] = await ctx.db.insert(inventoryItems).values(v).returning({ id: inventoryItems.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "inventory", entity: "inventory_items", entityId: r!.id, after: v, ip: ctx.ip });
  return { id: r!.id };
}

export async function setBom(ctx: ProtectedContext, input: { kitId: string; lines: { componentId: string; qty: number }[] }) {
  requireCatalogEditor(ctx);
  const kit = await itemRow(ctx.db, input.kitId);
  if (kit.type !== "kit") throw pre("Chỉ bộ học cụ mới có định mức");
  const errs = validateBom(kit.id, input.lines);
  if (errs.length) throw bad(errs);
  const comps = await ctx.db.select({ id: inventoryItems.id, type: inventoryItems.type }).from(inventoryItems).where(inArray(inventoryItems.id, input.lines.map((l) => l.componentId)));
  if (comps.length !== input.lines.length) throw bad("Có linh kiện không tồn tại");
  if (comps.some((c) => c.type === "kit")) throw bad("Không lồng bộ học cụ trong bộ học cụ");
  await ctx.db.transaction(async (tx) => {
    await tx.delete(kitComponents).where(eq(kitComponents.kitId, kit.id));
    await tx.insert(kitComponents).values(input.lines.map((l) => ({ kitId: kit.id, componentId: l.componentId, qty: l.qty })));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "inventory", entity: "kit_components", entityId: kit.id, after: input.lines, ip: ctx.ip });
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Tồn kho & phiếu                                                      */
/* ------------------------------------------------------------------ */

export async function stockOverview(ctx: ProtectedContext, input: { centerId?: string; type?: ItemType; tone?: StockTone; q?: string }) {
  requirePermission(ctx, "inventory:read", input.centerId ? { centerId: input.centerId } : undefined);
  const ctrs = await ctx.db.select({ id: centers.id, code: centers.code, name: centers.name }).from(centers).where(and(eq(centers.isActive, true), scopeOn(ctx, centers.id))).orderBy(asc(centers.code));
  const cids = input.centerId ? ctrs.filter((c) => c.id === input.centerId).map((c) => c.id) : ctrs.map((c) => c.id);
  const conds: SQL[] = [eq(inventoryItems.isActive, true)];
  if (input.type) conds.push(eq(inventoryItems.type, input.type));
  if (input.q?.trim()) conds.push(or(ilike(inventoryItems.name, `%${input.q.trim()}%`), ilike(inventoryItems.sku, `%${input.q.trim()}%`))!);
  const items = await ctx.db.select().from(inventoryItems).where(and(...conds)).orderBy(asc(inventoryItems.sku));
  const levels = cids.length && items.length ? await ctx.db.select().from(stockLevels).where(and(inArray(stockLevels.centerId, cids), inArray(stockLevels.itemId, items.map((i) => i.id)))) : [];
  const rows = items.flatMap((i) => cids.map((cid) => {
    const l = levels.find((x) => x.itemId === i.id && x.centerId === cid);
    const onHand = l?.onHand ?? 0;
    return { itemId: i.id, sku: i.sku, name: i.name, type: i.type, typeLabel: ITEM_TYPE_VI[i.type as ItemType], unit: i.unit, reorderLevel: i.reorderLevel,
      centerId: cid, centerCode: ctrs.find((c) => c.id === cid)?.code ?? "", onHand, avgCost: l?.avgCost ?? 0, value: onHand * (l?.avgCost ?? 0), tone: stockTone(onHand, i.reorderLevel), updatedAt: l?.updatedAt ?? null };
  })).filter((r) => r.onHand > 0 || r.reorderLevel > 0 || levels.some((l) => l.itemId === r.itemId && l.centerId === r.centerId));
  const today = todayISO();
  const [rent] = cids.length ? await ctx.db.select({
    out: sql<number>`count(*) filter (where ${rentals.status} = 'out')::int`,
    overdue: sql<number>`count(*) filter (where ${rentals.status} = 'out' and ${rentals.dueDate} < ${today})::int`,
  }).from(rentals).where(inArray(rentals.centerId, cids)) : [{ out: 0, overdue: 0 }];
  const [aud] = cids.length ? await ctx.db.select({ open: sql<number>`count(*) filter (where ${stockAudits.status} in ('draft','submitted'))::int`, waiting: sql<number>`count(*) filter (where ${stockAudits.status} = 'submitted')::int` }).from(stockAudits).where(inArray(stockAudits.centerId, cids)) : [{ open: 0, waiting: 0 }];
  const filtered = input.tone ? rows.filter((r) => r.tone === input.tone) : rows;
  return {
    centers: ctrs, centerId: input.centerId ?? null,
    kpi: { skus: new Set(rows.filter((r) => r.onHand > 0).map((r) => r.itemId)).size, units: rows.reduce((a, r) => a + r.onHand, 0), value: rows.reduce((a, r) => a + r.value, 0),
      low: rows.filter((r) => r.tone === "low").length, out: rows.filter((r) => r.tone === "out").length, rentalsOut: rent?.out ?? 0, rentalsOverdue: rent?.overdue ?? 0, auditsOpen: aud?.open ?? 0, auditsWaiting: aud?.waiting ?? 0 },
    rows: filtered,
    canReceive: cids.some((c) => can(ctx, "inventory:update", c)),
    canIssue: cids.some((c) => can(ctx, "inventory:create", c)),
  };
}

export async function listMovements(ctx: ProtectedContext, input: { centerId?: string; itemId?: string; type?: MovementType; studentId?: string; from?: string; to?: string; page?: number }) {
  requirePermission(ctx, "inventory:read", input.centerId ? { centerId: input.centerId } : undefined);
  const conds: SQL[] = [scopeOn(ctx, stockMovements.centerId)];
  if (input.centerId) conds.push(eq(stockMovements.centerId, input.centerId));
  if (input.itemId) conds.push(eq(stockMovements.itemId, input.itemId));
  if (input.type) conds.push(eq(stockMovements.type, input.type));
  if (input.studentId) conds.push(eq(stockMovements.studentId, input.studentId));
  if (input.from) conds.push(gte(stockMovements.createdAt, new Date(`${input.from}T00:00:00+07:00`)));
  if (input.to) conds.push(lte(stockMovements.createdAt, new Date(`${input.to}T23:59:59+07:00`)));
  const page = input.page ?? 1;
  const cp = sql`(select code from centers c2 where c2.id = ${stockMovements.counterpartCenterId})`;
  const rows = await ctx.db.select({
    m: stockMovements, sku: inventoryItems.sku, itemName: inventoryItems.name, unit: inventoryItems.unit, centerCode: centers.code,
    studentName: students.fullName, classCode: classes.code, orderCode: orders.code, byName: users.fullName, counterpartCode: sql<string | null>`${cp}`,
  }).from(stockMovements)
    .innerJoin(inventoryItems, eq(inventoryItems.id, stockMovements.itemId)).innerJoin(centers, eq(centers.id, stockMovements.centerId))
    .leftJoin(students, eq(students.id, stockMovements.studentId)).leftJoin(classes, eq(classes.id, stockMovements.classId))
    .leftJoin(orders, eq(orders.id, stockMovements.orderId)).leftJoin(users, eq(users.id, stockMovements.createdBy))
    .where(and(...conds)).orderBy(desc(stockMovements.createdAt), desc(stockMovements.id)).limit(PAGE).offset((page - 1) * PAGE);
  const [c] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(stockMovements).where(and(...conds));
  return {
    page, pageSize: PAGE, total: c?.n ?? 0,
    items: rows.map((r) => ({ ...r.m, typeLabel: MOVEMENT_TYPE_VI[r.m.type as MovementType], sku: r.sku, itemName: r.itemName, unit: r.unit, centerCode: r.centerCode, studentName: r.studentName, classCode: r.classCode, orderCode: r.orderCode, byName: r.byName, counterpartCode: r.counterpartCode })),
  };
}

export async function createMovement(ctx: ProtectedContext, input: { centerId: string; itemId: string; type: MovementType; qty: number; unitCost?: number | null; studentId?: string | null; classId?: string | null; supplier?: string | null; note?: string | null }) {
  if (!MANUAL_MOVEMENTS.includes(input.type)) throw bad("Loại phiếu này được sinh tự động từ nghiệp vụ");
  // Nhập kho / báo hỏng: quản lý kho (update); cấp phát / nhận lại: giáo vụ trở lên (create)
  requirePermission(ctx, input.type === "receipt" || input.type === "damage" ? "inventory:update" : "inventory:create", { centerId: input.centerId });
  const errs = validateMovement(input);
  if (errs.length) throw bad(errs);
  const center = await centerRow(ctx.db, input.centerId);
  const item = await itemRow(ctx.db, input.itemId);
  if (!item.isActive) throw pre("Mặt hàng đã ngừng dùng");
  if (input.studentId && !(await ctx.db.query.students.findFirst({ where: eq(students.id, input.studentId) }))) throw notFound("Không tìm thấy học viên");
  if (input.classId) {
    const cl = await ctx.db.query.classes.findFirst({ where: eq(classes.id, input.classId) });
    if (!cl) throw notFound("Không tìm thấy lớp");
    if (cl.centerId !== center.id) throw bad("Lớp thuộc cơ sở khác");
  }
  if (input.type === "return" && input.studentId) {
    const [iss] = await ctx.db.select({ n: sql<number>`coalesce(-sum(${stockMovements.qty}), 0)::int` }).from(stockMovements)
      .where(and(eq(stockMovements.itemId, item.id), eq(stockMovements.studentId, input.studentId), inArray(stockMovements.type, ["issue", "return"])));
    if ((iss?.n ?? 0) < input.qty) throw pre(`Học viên mới nhận ${iss?.n ?? 0} ${item.unit} — không nhận lại quá số đã cấp`);
  }
  const prefix: StockCodePrefix = input.type === "receipt" || input.type === "return" ? "PN" : "PX";
  return ctx.db.transaction(async (tx) => {
    const code = await nextStockCode(tx as unknown as Db, prefix, center.code);
    const m = await applyMovement(tx as unknown as Db, { ...input, code, userId: ctx.user.id });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "inventory", entity: "stock_movements", entityId: m.id, after: { code, sku: item.sku, type: input.type, qty: m.qty, balance: m.balanceAfter }, ip: ctx.ip });
    return { id: m.id, code, balanceAfter: m.balanceAfter };
  });
}

export async function transferStock(ctx: ProtectedContext, input: { fromCenterId: string; toCenterId: string; itemId: string; qty: number; note?: string | null }) {
  requirePermission(ctx, "inventory:update", { centerId: input.fromCenterId });
  if (input.fromCenterId === input.toCenterId) throw bad("Cơ sở nhận phải khác cơ sở chuyển");
  if (!Number.isInteger(input.qty) || input.qty <= 0) throw bad("Số lượng phải là số nguyên > 0");
  const from = await centerRow(ctx.db, input.fromCenterId);
  const to = await centerRow(ctx.db, input.toCenterId);
  if (!to.isActive) throw pre("Cơ sở nhận đã ngừng hoạt động");
  const item = await itemRow(ctx.db, input.itemId);
  return ctx.db.transaction(async (tx) => {
    const code = await nextStockCode(tx as unknown as Db, "CK", from.code);
    const out = await applyMovement(tx as unknown as Db, { code, itemId: item.id, centerId: from.id, type: "transfer_out", qty: input.qty, counterpartCenterId: to.id, note: input.note, userId: ctx.user.id });
    const inn = await applyMovement(tx as unknown as Db, { code, itemId: item.id, centerId: to.id, type: "transfer_in", qty: input.qty, unitCost: out.avgCost, counterpartCenterId: from.id, note: input.note, userId: ctx.user.id, refId: out.id, refType: "transfer" });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "inventory", entity: "stock_movements", entityId: out.id, after: { code, sku: item.sku, from: from.code, to: to.code, qty: input.qty }, ip: ctx.ip });
    return { code, fromBalance: out.balanceAfter, toBalance: inn.balanceAfter };
  });
}

export async function assembleKit(ctx: ProtectedContext, input: { centerId: string; kitId: string; qty: number; note?: string | null }) {
  requirePermission(ctx, "inventory:update", { centerId: input.centerId });
  if (!Number.isInteger(input.qty) || input.qty <= 0 || input.qty > 1000) throw bad("Số bộ 1–1000");
  const center = await centerRow(ctx.db, input.centerId);
  const kit = await itemRow(ctx.db, input.kitId);
  if (kit.type !== "kit") throw pre("Chỉ đóng bộ cho bộ học cụ");
  const bom = await ctx.db.select().from(kitComponents).where(eq(kitComponents.kitId, kit.id));
  if (!bom.length) throw pre("Bộ học cụ chưa có định mức linh kiện");
  return ctx.db.transaction(async (tx) => {
    const code = await nextStockCode(tx as unknown as Db, "DB", center.code);
    let cost = 0;
    for (const b of bom) {
      const m = await applyMovement(tx as unknown as Db, { code, itemId: b.componentId, centerId: center.id, type: "assemble_out", qty: b.qty * input.qty, refType: "kit", refId: kit.id, note: input.note, userId: ctx.user.id });
      cost += m.avgCost * b.qty;
    }
    const k = await applyMovement(tx as unknown as Db, { code, itemId: kit.id, centerId: center.id, type: "assemble_in", qty: input.qty, unitCost: cost, refType: "kit", refId: kit.id, note: input.note, userId: ctx.user.id });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "inventory", entity: "stock_movements", entityId: k.id, after: { code, kit: kit.sku, qty: input.qty, unitCost: cost }, ip: ctx.ip });
    return { code, balance: k.balanceAfter, unitCost: cost };
  });
}

/* ------------------------------------------------------------------ */
/* Bán hàng                                                             */
/* ------------------------------------------------------------------ */

async function primaryGuardian(db: Db, studentId: string) {
  const [g] = await db.select({ id: parents.id, fullName: parents.fullName, phone: parents.phone, email: parents.email }).from(studentGuardians)
    .innerJoin(parents, eq(parents.id, studentGuardians.parentId)).where(eq(studentGuardians.studentId, studentId)).orderBy(desc(studentGuardians.isPrimary)).limit(1);
  return g ?? null;
}

export async function sellProducts(ctx: ProtectedContext, input: {
  centerId: string; studentId?: string | null; customer?: { name: string; phone: string; email?: string | null } | null;
  lines: { itemId: string; qty: number }[]; paymentMethodId: string; note?: string | null;
}) {
  requirePermission(ctx, "inventory:create", { centerId: input.centerId });
  requirePermission(ctx, "finance:create", { centerId: input.centerId });
  if (!input.lines.length || input.lines.length > 20) throw bad("Đơn bán 1–20 dòng");
  if (new Set(input.lines.map((l) => l.itemId)).size !== input.lines.length) throw bad("Mặt hàng bị lặp");
  const center = await centerRow(ctx.db, input.centerId);
  const items = await ctx.db.select().from(inventoryItems).where(inArray(inventoryItems.id, input.lines.map((l) => l.itemId)));
  const levels = await ctx.db.select().from(stockLevels).where(and(eq(stockLevels.centerId, center.id), inArray(stockLevels.itemId, input.lines.map((l) => l.itemId))));
  const errs: string[] = [];
  for (const l of input.lines) {
    const it = items.find((i) => i.id === l.itemId);
    if (!it || !it.isActive) { errs.push("Có mặt hàng không hợp lệ"); continue; }
    if (!it.salePrice) errs.push(`${it.sku} chưa có giá bán`);
    if (!Number.isInteger(l.qty) || l.qty < 1) errs.push(`${it.sku}: số lượng ≥ 1`);
    const onHand = levels.find((x) => x.itemId === it.id)?.onHand ?? 0;
    if (onHand < l.qty) errs.push(`${it.sku}: tồn ${onHand}, không đủ ${l.qty}`);
  }
  if (errs.length) throw pre(errs);
  let customer = input.customer ?? null;
  let parentId: string | null = null;
  if (input.studentId) {
    const g = await primaryGuardian(ctx.db, input.studentId);
    if (g) { parentId = g.id; customer ??= { name: g.fullName, phone: g.phone, email: g.email }; }
  }
  if (!customer) throw bad("Cần thông tin khách hàng (hoặc chọn học viên có phụ huynh)");
  const order = await createOrder(ctx, {
    type: "product", centerId: center.id, studentId: input.studentId ?? null, parentId, customer,
    items: input.lines.map((l) => { const it = items.find((i) => i.id === l.itemId)!; return { description: `${it.name} (${it.sku})`, quantity: l.qty, unitPrice: it.salePrice! }; }),
    paymentMethodId: input.paymentMethodId, installments: { count: 1, firstDueDate: todayISO() }, internalNote: input.note ?? null,
  });
  try {
    await ctx.db.transaction(async (tx) => {
      const code = await nextStockCode(tx as unknown as Db, "BH", center.code);
      for (const l of input.lines) {
        await applyMovement(tx as unknown as Db, { code, itemId: l.itemId, centerId: center.id, type: "sale", qty: l.qty, orderId: order.id, studentId: input.studentId ?? null, refType: "order", refId: order.id, userId: ctx.user.id });
      }
    });
  } catch (e) {
    // Hết hàng giữa chừng (người khác vừa xuất): huỷ đơn vừa lập để không treo công nợ
    const [o] = await ctx.db.select({ total: orders.total, status: orders.status }).from(orders).where(eq(orders.id, order.id));
    await ctx.db.update(orders).set({ status: "cancelled", cancelReason: "Không đủ tồn khi xuất hàng" }).where(eq(orders.id, order.id));
    await ctx.db.insert(orderEvents).values({ orderId: order.id, event: "cancel", fromStatus: o?.status, toStatus: "cancelled", note: "Không đủ tồn khi xuất hàng", actorId: ctx.user.id });
    if (o?.total) await ctx.db.insert(financeLedger).values({ orderId: order.id, centerId: center.id, entryType: "cancel", amount: -o.total, refId: order.id, note: "Huỷ đơn: không đủ tồn", actorId: ctx.user.id });
    throw e;
  }
  return order;
}

/** Huỷ / hoàn đơn sản phẩm → nhập lại hàng đã xuất (gọi từ tài chính, idempotent) */
export async function restockOrder(db: Db, orderId: string, userId: string, reason: string) {
  const sold = await db.select({ itemId: stockMovements.itemId, centerId: stockMovements.centerId, studentId: stockMovements.studentId, qty: sql<number>`(-sum(${stockMovements.qty}))::int` })
    .from(stockMovements).where(and(eq(stockMovements.orderId, orderId), inArray(stockMovements.type, ["sale", "sale_return"])))
    .groupBy(stockMovements.itemId, stockMovements.centerId, stockMovements.studentId);
  const open = sold.filter((s) => s.qty > 0);
  if (!open.length) return 0;
  const ctr = await db.query.centers.findFirst({ where: eq(centers.id, open[0]!.centerId) });
  await db.transaction(async (tx) => {
    const code = await nextStockCode(tx as unknown as Db, "PN", ctr?.code ?? "HO");
    for (const s of open) await applyMovement(tx as unknown as Db, { code, itemId: s.itemId, centerId: s.centerId, type: "sale_return", qty: s.qty, orderId, studentId: s.studentId, refType: "order", refId: orderId, note: reason, userId });
  });
  return open.length;
}

/* ------------------------------------------------------------------ */
/* Cho thuê                                                             */
/* ------------------------------------------------------------------ */

export async function listRentals(ctx: ProtectedContext, input: { centerId?: string; status?: RentalStatus; overdue?: boolean; studentId?: string }) {
  requirePermission(ctx, "inventory:read", input.centerId ? { centerId: input.centerId } : undefined);
  const today = todayISO();
  const conds: SQL[] = [scopeOn(ctx, rentals.centerId)];
  if (input.centerId) conds.push(eq(rentals.centerId, input.centerId));
  if (input.status) conds.push(eq(rentals.status, input.status));
  if (input.studentId) conds.push(eq(rentals.studentId, input.studentId));
  if (input.overdue) conds.push(and(eq(rentals.status, "out"), sql`${rentals.dueDate} < ${today}`)!);
  const rows = await ctx.db.select({ r: rentals, sku: inventoryItems.sku, itemName: inventoryItems.name, studentName: students.fullName, studentCode: students.code, centerCode: centers.code, orderCode: orders.code })
    .from(rentals).innerJoin(inventoryItems, eq(inventoryItems.id, rentals.itemId)).innerJoin(students, eq(students.id, rentals.studentId))
    .innerJoin(centers, eq(centers.id, rentals.centerId)).leftJoin(orders, eq(orders.id, rentals.orderId))
    .where(and(...conds)).orderBy(asc(rentals.status), asc(rentals.dueDate)).limit(200);
  return rows.map((x) => ({ ...x.r, sku: x.sku, itemName: x.itemName, studentName: x.studentName, studentCode: x.studentCode, centerCode: x.centerCode, orderCode: x.orderCode,
    overdueDays: x.r.status === "out" ? rentalOverdueDays(x.r.dueDate, today) : 0, canClose: x.r.status === "out" && can(ctx, "inventory:create", x.r.centerId) }));
}

export async function rentOut(ctx: ProtectedContext, input: { centerId: string; itemId: string; studentId: string; qty: number; days: number; paymentMethodId?: string | null; note?: string | null }) {
  requirePermission(ctx, "inventory:create", { centerId: input.centerId });
  const center = await centerRow(ctx.db, input.centerId);
  const item = await itemRow(ctx.db, input.itemId);
  if (!item.isActive || !item.rentPrice) throw pre("Mặt hàng không cho thuê (chưa có giá thuê)");
  if (!Number.isInteger(input.qty) || input.qty < 1 || input.qty > 10) throw bad("Số lượng thuê 1–10");
  const stu = await ctx.db.query.students.findFirst({ where: eq(students.id, input.studentId) });
  if (!stu) throw notFound("Không tìm thấy học viên");
  const [dup] = await ctx.db.select({ code: rentals.code }).from(rentals).where(and(eq(rentals.studentId, stu.id), eq(rentals.itemId, item.id), eq(rentals.status, "out"))).limit(1);
  if (dup) throw pre(`Học viên đang thuê ${item.sku} (phiếu ${dup.code}) — nhận lại trước khi cho thuê tiếp`);
  const start = todayISO();
  const due = rule(() => rentalDueDate(start, input.days));
  const fee = rentalFee(item.rentPrice, input.days) * input.qty;
  const deposit = (item.deposit ?? 0) * input.qty;
  const level = await ctx.db.query.stockLevels.findFirst({ where: and(eq(stockLevels.itemId, item.id), eq(stockLevels.centerId, center.id)) });
  if ((level?.onHand ?? 0) < input.qty) throw pre(`Không đủ tồn: hiện có ${level?.onHand ?? 0}`);
  let orderId: string | null = null;
  if (input.paymentMethodId && fee + deposit > 0) {
    const g = await primaryGuardian(ctx.db, stu.id);
    if (!g) throw pre("Học viên chưa có phụ huynh — không lập được đơn thuê");
    const o = await createOrder(ctx, {
      type: "product", centerId: center.id, studentId: stu.id, parentId: g.id, customer: { name: g.fullName, phone: g.phone, email: g.email },
      items: [
        { description: `Thuê ${item.name} (${item.sku}) ${input.days} ngày`, quantity: input.qty, unitPrice: rentalFee(item.rentPrice, input.days) },
        ...(deposit ? [{ description: `Đặt cọc ${item.sku} (hoàn khi trả)`, quantity: input.qty, unitPrice: item.deposit! }] : []),
      ],
      paymentMethodId: input.paymentMethodId, installments: { count: 1, firstDueDate: start }, internalNote: `Cho thuê đến ${due}`,
    });
    orderId = o.id;
  }
  return ctx.db.transaction(async (tx) => {
    const code = await nextStockCode(tx as unknown as Db, "TH", center.code);
    const [r] = await tx.insert(rentals).values({ code, itemId: item.id, centerId: center.id, studentId: stu.id, qty: input.qty, startDate: start, dueDate: due, fee, deposit, orderId, note: input.note?.trim() || null, createdBy: ctx.user.id }).returning();
    await applyMovement(tx as unknown as Db, { code, itemId: item.id, centerId: center.id, type: "rent_out", qty: input.qty, studentId: stu.id, orderId, refType: "rental", refId: r!.id, userId: ctx.user.id });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "inventory", entity: "rentals", entityId: r!.id, after: { code, sku: item.sku, qty: input.qty, due, fee, deposit }, ip: ctx.ip });
    return { id: r!.id, code, dueDate: due, fee, deposit, orderId };
  });
}

export async function closeRental(ctx: ProtectedContext, input: { id: string; outcome: "ok" | "damaged" | "lost"; damageCharge?: number; note?: string | null }) {
  const r = await ctx.db.query.rentals.findFirst({ where: eq(rentals.id, input.id) });
  if (!r) throw notFound("Không tìm thấy phiếu thuê");
  requirePermission(ctx, "inventory:create", { centerId: r.centerId });
  if (r.status !== "out") throw pre("Phiếu thuê đã đóng");
  if (input.outcome !== "ok" && (input.note ?? "").trim().length < 5) throw bad("Hỏng / mất cần ghi rõ tình trạng (≥ 5 ký tự)");
  const item = await itemRow(ctx.db, r.itemId);
  const today = todayISO();
  const late = rentalOverdueDays(r.dueDate, today);
  const lateFeePerDay = Math.round((item.rentPrice ?? 0) / 30) * r.qty;
  const damage = input.outcome === "lost" ? r.deposit : Math.max(0, Math.round(input.damageCharge ?? 0));
  const dep = depositRefund(r.deposit, damage, late, lateFeePerDay);
  return ctx.db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    if (input.outcome !== "lost") {
      await applyMovement(t, { code: r.code, itemId: r.itemId, centerId: r.centerId, type: "rent_return", qty: r.qty, studentId: r.studentId, refType: "rental", refId: r.id, note: input.note, userId: ctx.user.id });
      if (input.outcome === "damaged") await applyMovement(t, { code: r.code, itemId: r.itemId, centerId: r.centerId, type: "damage", qty: r.qty, studentId: r.studentId, refType: "rental", refId: r.id, note: `Trả hỏng: ${input.note}`, userId: ctx.user.id });
    }
    await tx.update(rentals).set({ status: input.outcome === "lost" ? "lost" : "returned", returnedAt: new Date(), condition: input.outcome, depositCharged: dep.charged, note: [r.note, input.note?.trim()].filter(Boolean).join(" · ") || null, closedBy: ctx.user.id }).where(eq(rentals.id, r.id));
    await writeAudit(t, { actorId: ctx.user.id, action: "TRANSITION", module: "inventory", entity: "rentals", entityId: r.id, before: { status: "out" }, after: { outcome: input.outcome, lateDays: late, depositCharged: dep.charged, depositRefund: dep.refund }, ip: ctx.ip });
    return { lateDays: late, ...dep };
  });
}

/* ------------------------------------------------------------------ */
/* Kiểm kê                                                              */
/* ------------------------------------------------------------------ */

export async function listAudits(ctx: ProtectedContext, input: { centerId?: string; status?: AuditStatus }) {
  requirePermission(ctx, "inventory:read", input.centerId ? { centerId: input.centerId } : undefined);
  const conds: SQL[] = [scopeOn(ctx, stockAudits.centerId)];
  if (input.centerId) conds.push(eq(stockAudits.centerId, input.centerId));
  if (input.status) conds.push(eq(stockAudits.status, input.status));
  const rows = await ctx.db.select({
    a: stockAudits, centerCode: centers.code, byName: users.fullName,
    lines: sql<number>`(select count(*)::int from ${stockAuditLines} l where l.audit_id = ${stockAudits.id})`,
    counted: sql<number>`(select count(*)::int from ${stockAuditLines} l where l.audit_id = ${stockAudits.id} and l.counted_qty is not null)`,
    diff: sql<number>`(select count(*)::int from ${stockAuditLines} l where l.audit_id = ${stockAudits.id} and l.counted_qty is not null and l.counted_qty <> l.system_qty)`,
  }).from(stockAudits).innerJoin(centers, eq(centers.id, stockAudits.centerId)).leftJoin(users, eq(users.id, stockAudits.createdBy))
    .where(and(...conds)).orderBy(desc(stockAudits.createdAt)).limit(100);
  const ctrs = await ctx.db.select({ id: centers.id, code: centers.code, name: centers.name }).from(centers).where(and(eq(centers.isActive, true), scopeOn(ctx, centers.id))).orderBy(asc(centers.code));
  return { items: rows.map((r) => ({ ...r.a, centerCode: r.centerCode, byName: r.byName, lines: r.lines, counted: r.counted, diff: r.diff })), centers: ctrs.map((c) => ({ ...c, canCreate: can(ctx, "inventory:create", c.id) })) };
}

export async function createAudit(ctx: ProtectedContext, input: { centerId: string; type?: ItemType | null; note?: string | null }) {
  requirePermission(ctx, "inventory:create", { centerId: input.centerId });
  const center = await centerRow(ctx.db, input.centerId);
  const [open] = await ctx.db.select({ code: stockAudits.code }).from(stockAudits).where(and(eq(stockAudits.centerId, center.id), inArray(stockAudits.status, ["draft", "submitted"]))).limit(1);
  if (open) throw pre(`Cơ sở đang có phiếu kiểm kê ${open.code} chưa chốt`);
  const items = await ctx.db.select({ id: inventoryItems.id, onHand: sql<number>`coalesce(${stockLevels.onHand}, 0)` }).from(inventoryItems)
    .leftJoin(stockLevels, and(eq(stockLevels.itemId, inventoryItems.id), eq(stockLevels.centerId, center.id)))
    .where(and(eq(inventoryItems.isActive, true), input.type ? eq(inventoryItems.type, input.type) : sql`true`)).orderBy(asc(inventoryItems.sku));
  if (!items.length) throw pre("Không có mặt hàng để kiểm kê");
  return ctx.db.transaction(async (tx) => {
    const code = await nextStockCode(tx as unknown as Db, "KK", center.code);
    const [a] = await tx.insert(stockAudits).values({ code, centerId: center.id, note: input.note?.trim() || null, createdBy: ctx.user.id }).returning({ id: stockAudits.id });
    await tx.insert(stockAuditLines).values(items.map((i) => ({ auditId: a!.id, itemId: i.id, systemQty: Number(i.onHand) })));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "inventory", entity: "stock_audits", entityId: a!.id, after: { code, lines: items.length }, ip: ctx.ip });
    return { id: a!.id, code };
  });
}

export async function getAudit(ctx: ProtectedContext, id: string) {
  const a = await ctx.db.query.stockAudits.findFirst({ where: eq(stockAudits.id, id) });
  if (!a) throw notFound("Không tìm thấy phiếu kiểm kê");
  requirePermission(ctx, "inventory:read", { centerId: a.centerId });
  const center = await centerRow(ctx.db, a.centerId);
  const lines = await ctx.db.select({ l: stockAuditLines, sku: inventoryItems.sku, name: inventoryItems.name, unit: inventoryItems.unit, type: inventoryItems.type, onHand: stockLevels.onHand, avgCost: stockLevels.avgCost })
    .from(stockAuditLines).innerJoin(inventoryItems, eq(inventoryItems.id, stockAuditLines.itemId))
    .leftJoin(stockLevels, and(eq(stockLevels.itemId, stockAuditLines.itemId), eq(stockLevels.centerId, a.centerId)))
    .where(eq(stockAuditLines.auditId, a.id)).orderBy(asc(inventoryItems.sku));
  const names = await ctx.db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, [a.createdBy, a.submittedBy, a.approvedBy].filter((x): x is string => !!x)));
  const nm = (x: string | null) => names.find((n) => n.id === x)?.fullName ?? null;
  const rows = lines.map((x) => ({
    ...x.l, sku: x.sku, name: x.name, unit: x.unit, type: x.type, currentQty: x.onHand ?? 0, avgCost: x.avgCost ?? 0,
    variance: x.l.countedQty === null ? null : x.l.countedQty - x.l.systemQty,
    large: x.l.countedQty !== null && isLargeVariance(x.l.systemQty, x.l.countedQty),
    movedSince: (x.onHand ?? 0) !== x.l.systemQty,
  }));
  const isSA = hasRole(ctx.actor, "SUPER_ADMIN");
  return {
    ...a, centerCode: center.code, centerName: center.name, createdByName: nm(a.createdBy), submittedByName: nm(a.submittedBy), approvedByName: nm(a.approvedBy),
    lines: rows, summary: auditSummary(rows.map((r) => ({ systemQty: r.systemQty, countedQty: r.countedQty, avgCost: r.avgCost }))),
    canCount: a.status === "draft" && can(ctx, "inventory:create", a.centerId),
    canApprove: a.status === "submitted" && can(ctx, "inventory:approve", a.centerId) && (isSA || a.submittedBy !== ctx.user.id),
    canManage: (a.status === "draft" || a.status === "submitted") && can(ctx, "inventory:approve", a.centerId),
  };
}

export async function saveAuditCounts(ctx: ProtectedContext, input: { id: string; lines: { itemId: string; countedQty: number | null; note?: string | null }[] }) {
  const a = await ctx.db.query.stockAudits.findFirst({ where: eq(stockAudits.id, input.id) });
  if (!a) throw notFound("Không tìm thấy phiếu kiểm kê");
  requirePermission(ctx, "inventory:create", { centerId: a.centerId });
  if (a.status !== "draft") throw pre("Chỉ nhập số đếm khi phiếu đang đếm");
  for (const l of input.lines) {
    if (l.countedQty !== null && (!Number.isInteger(l.countedQty) || l.countedQty < 0 || l.countedQty > 1_000_000)) throw bad("Số đếm phải là số nguyên ≥ 0");
  }
  await ctx.db.transaction(async (tx) => {
    for (const l of input.lines) {
      await tx.update(stockAuditLines).set({ countedQty: l.countedQty, note: l.note?.trim() || null }).where(and(eq(stockAuditLines.auditId, a.id), eq(stockAuditLines.itemId, l.itemId)));
    }
    await tx.update(stockAudits).set({ updatedAt: new Date() }).where(eq(stockAudits.id, a.id));
  });
  return { ok: true, saved: input.lines.length };
}

export async function auditAction(ctx: ProtectedContext, input: { id: string; action: AuditAction; note?: string | null }) {
  const a = await ctx.db.query.stockAudits.findFirst({ where: eq(stockAudits.id, input.id) });
  if (!a) throw notFound("Không tìm thấy phiếu kiểm kê");
  const to = rule(() => auditTransition(a.status as AuditStatus, input.action));
  const lines = await ctx.db.select().from(stockAuditLines).where(eq(stockAuditLines.auditId, a.id));
  if (input.action === "submit") {
    requirePermission(ctx, "inventory:create", { centerId: a.centerId });
    const errs = validateAuditSubmit(lines);
    if (errs.length) throw bad(errs);
  } else {
    requirePermission(ctx, "inventory:approve", { centerId: a.centerId });
    if (input.action === "approve" && a.submittedBy === ctx.user.id && !hasRole(ctx.actor, "SUPER_ADMIN")) throw new TRPCError({ code: "FORBIDDEN", message: "Người nộp phiếu không tự duyệt" });
    if ((input.action === "cancel" || input.action === "reopen") && (input.note ?? "").trim().length < 5) throw bad("Cần ghi lý do (≥ 5 ký tự)");
  }
  const center = await centerRow(ctx.db, a.centerId);
  return ctx.db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    let adjusted = 0;
    if (input.action === "approve") {
      for (const l of lines) {
        const v = (l.countedQty ?? l.systemQty) - l.systemQty;
        if (!v) continue;
        await applyMovement(t, { code: a.code, itemId: l.itemId, centerId: a.centerId, type: "adjust", qty: v, refType: "stock_audit", refId: a.id, note: l.note ?? `Kiểm kê ${a.code}`, userId: ctx.user.id });
        adjusted++;
      }
    }
    const now = new Date();
    await tx.update(stockAudits).set({
      status: to,
      ...(input.action === "submit" ? { submittedBy: ctx.user.id, submittedAt: now } : {}),
      ...(input.action === "approve" ? { approvedBy: ctx.user.id, approvedAt: now } : {}),
      ...(input.action === "reopen" ? { submittedBy: null, submittedAt: null } : {}),
      ...(input.note?.trim() ? { note: [a.note, `${input.action}: ${input.note.trim()}`].filter(Boolean).join(" · ") } : {}),
    }).where(eq(stockAudits.id, a.id));
    await writeAudit(t, { actorId: ctx.user.id, action: "TRANSITION", module: "inventory", entity: "stock_audits", entityId: a.id, before: { status: a.status }, after: { status: to, adjusted, center: center.code }, reason: input.note ?? null, ip: ctx.ip });
    return { status: to, adjusted };
  });
}
