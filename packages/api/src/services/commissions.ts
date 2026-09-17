import { and, eq, inArray, sql, desc, asc, isNull, isNotNull, or, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { commissionRules, commissions, orders, leads, parents, users, centers, students } from "@satarobo/db";
import {
  hasRole, pickRule, computeCommission, describeRule, commissionTransition, refundAdjustment, validateRule, periodOf, formatVnd,
  type CommissionKind, type CommissionStatus, type RateType, type OrderType,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { todayISO } from "./sessions";
import { bad, pre, wrapRule, reasonOrThrow, scope, can, notify, type Db } from "./finance";

type RuleRow = typeof commissionRules.$inferSelect;

/* ------------------------------------------------------------------ */
/* Ghi nhận tự động                                                    */
/* ------------------------------------------------------------------ */

/** Người hưởng: sale phụ trách lead đã chuyển thành HV của đơn (không có → người tạo đơn); người giới thiệu: PH giới thiệu trên lead */
async function beneficiaries(tx: Db, o: typeof orders.$inferSelect) {
  const lead = o.studentId
    ? (await tx.select({ assignedToId: leads.assignedToId, referrerParentId: leads.referrerParentId }).from(leads)
      .where(eq(leads.convertedStudentId, o.studentId)).orderBy(desc(leads.convertedAt)).limit(1))[0]
    : undefined;
  const saleId = lead?.assignedToId ?? o.createdBy;
  const sale = saleId ? await tx.query.users.findFirst({ where: eq(users.id, saleId), columns: { id: true, fullName: true } }) : undefined;
  const ref = lead?.referrerParentId ? await tx.query.parents.findFirst({ where: eq(parents.id, lead.referrerParentId), columns: { id: true, fullName: true } }) : undefined;
  return { sale, ref };
}

/** Gọi khi đơn chuyển sang "đã thu đủ" (trong transaction). Idempotent theo (đơn, loại). */
export async function accrueCommissions(tx: Db, orderId: string): Promise<number> {
  const o = await tx.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!o || o.status !== "paid" || o.total <= 0) return 0;
  const existing = await tx.select({ kind: commissions.kind }).from(commissions).where(and(eq(commissions.orderId, orderId), isNull(commissions.parentId)));
  const rules = (await tx.select().from(commissionRules).where(eq(commissionRules.isActive, true))) as RuleRow[];
  if (!rules.length) return 0;
  const today = todayISO();
  const { sale, ref } = await beneficiaries(tx, o);
  let n = 0;
  for (const kind of ["sale", "referrer"] as const) {
    if (existing.some((e) => e.kind === kind)) continue;
    const who = kind === "sale" ? (sale ? { userId: sale.id, parentId: null, name: sale.fullName } : null) : ref ? { userId: null, parentId: ref.id, name: ref.fullName } : null;
    if (!who) continue;
    const rule = pickRule(rules, { kind, centerId: o.centerId, orderType: o.type, date: today, total: o.total });
    if (!rule) continue;
    const amount = computeCommission(rule, o.total);
    if (amount <= 0) continue;
    const ins = await tx.insert(commissions).values({
      orderId, centerId: o.centerId, kind, ruleId: rule.id, beneficiaryUserId: who.userId, beneficiaryParentId: who.parentId, beneficiaryName: who.name,
      baseAmount: o.total, rateLabel: describeRule(rule), originalAmount: amount, amount, period: periodOf(today), status: "accrued",
    }).onConflictDoNothing().returning({ id: commissions.id });
    if (ins.length) {
      n++;
      if (who.userId) await notify(tx, [who.userId], "Hoa hồng tạm tính", `${o.code}: ${formatVnd(amount)} (${describeRule(rule)})`, "/crm/commission", 3);
    }
  }
  return n;
}

/** Hoàn tiền đã chi → giảm hoa hồng chưa chi / tạo dòng thu hồi cho hoa hồng đã chi */
export async function adjustCommissionsForRefund(tx: Db, orderId: string, refundAmount: number, actorId: string) {
  const rows = await tx.select().from(commissions).where(and(eq(commissions.orderId, orderId), isNull(commissions.parentId)));
  for (const c of rows) {
    const [cb] = await tx.select({ n: sql<number>`coalesce(sum(${commissions.amount}), 0)::bigint` }).from(commissions).where(and(eq(commissions.parentId, c.id), sql`${commissions.status} <> 'cancelled'`));
    const net = c.amount + Number(cb?.n ?? 0);
    const adj = refundAdjustment({ status: c.status, originalAmount: c.originalAmount, net, baseAmount: c.baseAmount }, refundAmount);
    if (adj.mode === "reduce") {
      const left = c.amount - adj.delta;
      await tx.update(commissions).set({
        amount: left, note: [c.note, `Giảm ${formatVnd(adj.delta)} do hoàn tiền ${formatVnd(refundAmount)}`].filter(Boolean).join(" · "),
        ...(left <= 0 ? { status: "cancelled" as const, cancelReason: "Đơn hoàn tiền toàn bộ" } : {}),
      }).where(eq(commissions.id, c.id));
    } else if (adj.mode === "clawback") {
      await tx.insert(commissions).values({
        orderId, centerId: c.centerId, kind: c.kind, ruleId: c.ruleId, parentId: c.id, beneficiaryUserId: c.beneficiaryUserId, beneficiaryParentId: c.beneficiaryParentId,
        beneficiaryName: c.beneficiaryName, baseAmount: -refundAmount, rateLabel: c.rateLabel, originalAmount: -adj.delta, amount: -adj.delta,
        period: periodOf(todayISO()), status: "accrued", note: `Thu hồi do hoàn tiền ${formatVnd(refundAmount)} — trừ vào kỳ chi sau`,
      });
    }
    if (adj.mode !== "none") {
      await writeAudit(tx, { actorId, action: "UPDATE", module: "finance", entity: "commissions", entityId: c.id, before: { amount: c.amount, status: c.status }, after: { mode: adj.mode, delta: adj.delta }, reason: `Hoàn tiền ${formatVnd(refundAmount)}` });
      if (c.beneficiaryUserId) await notify(tx, [c.beneficiaryUserId], adj.mode === "clawback" ? "Thu hồi hoa hồng" : "Hoa hồng giảm", `${formatVnd(adj.delta)} do đơn hoàn tiền`, "/crm/commission", 2);
    }
  }
}

/**
 * Đơn tụt khỏi "đã thu đủ" (gỡ gắn giao dịch, điều chỉnh khoản thu) → huỷ hoa hồng còn tạm tính.
 * Hoa hồng đã duyệt / đã chi giữ nguyên: xử lý bằng dòng thu hồi khi có hoàn tiền.
 */
export async function cancelAccruedForOrder(tx: Db, orderId: string, actorId: string, reason: string) {
  const rows = await tx.select().from(commissions).where(and(eq(commissions.orderId, orderId), eq(commissions.status, "accrued")));
  for (const c of rows) {
    await tx.update(commissions).set({ status: "cancelled", cancelReason: reason.slice(0, 300) }).where(and(eq(commissions.id, c.id), eq(commissions.status, "accrued")));
    await writeAudit(tx, { actorId, action: "TRANSITION", module: "finance", entity: "commissions", entityId: c.id, before: { status: "accrued" }, after: { status: "cancelled" }, reason });
    if (c.beneficiaryUserId) await notify(tx, [c.beneficiaryUserId], "Hoa hồng tạm tính bị huỷ", `${formatVnd(c.amount)} — ${reason}`, "/crm/commission", 2);
  }
  return rows.length;
}

/* ------------------------------------------------------------------ */
/* Danh sách / duyệt / chi                                             */
/* ------------------------------------------------------------------ */

function seesAll(ctx: ProtectedContext, centerId: string | null) {
  return can(ctx, "finance:approve", centerId) || can(ctx, "finance:confirm", centerId);
}

export async function listCommissions(ctx: ProtectedContext, input: { period?: string; status?: CommissionStatus; kind?: CommissionKind; centerId?: string; q?: string }) {
  requirePermission(ctx, "finance:read", { centerId: input.centerId ?? null });
  const all = ctx.actor.assignments.some((a) => seesAll(ctx, a.centerId));
  const conds: SQL[] = [scope(ctx, commissions.centerId as unknown as typeof orders.centerId)];
  if (!all) conds.push(eq(commissions.beneficiaryUserId, ctx.user.id));
  if (input.period) conds.push(eq(commissions.period, input.period));
  if (input.kind) conds.push(eq(commissions.kind, input.kind));
  if (input.centerId) conds.push(eq(commissions.centerId, input.centerId));
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`;
    conds.push(or(sql`${commissions.beneficiaryName} ilike ${q}`, sql`${orders.code} ilike ${q}`)!);
  }
  const base = and(...conds);
  const rows = await ctx.db.select({
    c: commissions, orderCode: orders.code, orderStatus: orders.status, customerName: orders.customerName, centerCode: centers.code, studentName: students.fullName,
    approverName: sql<string | null>`(select full_name from ${users} u where u.id = ${commissions.approvedBy})`,
    payerName: sql<string | null>`(select full_name from ${users} u where u.id = ${commissions.paidBy})`,
  }).from(commissions).innerJoin(orders, eq(orders.id, commissions.orderId)).innerJoin(centers, eq(centers.id, commissions.centerId)).leftJoin(students, eq(students.id, orders.studentId))
    .where(input.status ? and(base, eq(commissions.status, input.status)) : base)
    .orderBy(desc(commissions.period), asc(commissions.beneficiaryName), desc(commissions.createdAt)).limit(1000);
  const [counts] = await ctx.db.select({
    accrued: sql<number>`count(*) filter (where ${commissions.status} = 'accrued')::int`,
    approved: sql<number>`count(*) filter (where ${commissions.status} = 'approved')::int`,
    paid: sql<number>`count(*) filter (where ${commissions.status} = 'paid')::int`,
    cancelled: sql<number>`count(*) filter (where ${commissions.status} = 'cancelled')::int`,
  }).from(commissions).innerJoin(orders, eq(orders.id, commissions.orderId)).where(base);
  const items = rows.map((x) => ({
    ...x.c, orderCode: x.orderCode, orderStatus: x.orderStatus, customerName: x.customerName, centerCode: x.centerCode, studentName: x.studentName,
    approverName: x.approverName, payerName: x.payerName,
    canApprove: x.c.status === "accrued" && can(ctx, "finance:approve", x.c.centerId) && (x.c.beneficiaryUserId !== ctx.user.id || hasRole(ctx.actor, "SUPER_ADMIN")),
    canPay: x.c.status === "approved" && can(ctx, "finance:confirm", x.c.centerId) && (x.c.approvedBy !== ctx.user.id || hasRole(ctx.actor, "SUPER_ADMIN")) && x.c.beneficiaryUserId !== ctx.user.id,
    canCancel: (x.c.status === "accrued" || x.c.status === "approved") && can(ctx, "finance:approve", x.c.centerId),
  }));
  const map = new Map<string, { key: string; name: string; kind: CommissionKind; accrued: number; approved: number; paid: number; count: number }>();
  for (const i of items) {
    if (i.status === "cancelled") continue;
    const key = `${i.kind}:${i.beneficiaryUserId ?? i.beneficiaryParentId}`;
    const g = map.get(key) ?? { key, name: i.beneficiaryName, kind: i.kind, accrued: 0, approved: 0, paid: 0, count: 0 };
    g[i.status] += i.amount;
    g.count++;
    map.set(key, g);
  }
  const periods = (await ctx.db.selectDistinct({ p: commissions.period }).from(commissions).where(and(...conds.slice(0, all ? 1 : 2))).orderBy(desc(commissions.period)).limit(24)).map((r) => r.p);
  return {
    ownOnly: !all, counts, periods, items,
    byBeneficiary: [...map.values()].sort((a, b) => b.accrued + b.approved + b.paid - (a.accrued + a.approved + a.paid)),
    totals: {
      accrued: items.filter((i) => i.status === "accrued").reduce((s, i) => s + i.amount, 0),
      approved: items.filter((i) => i.status === "approved").reduce((s, i) => s + i.amount, 0),
      paid: items.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0),
    },
    perms: { configure: ctx.actor.assignments.some((a) => can(ctx, "finance:configure", a.centerId)) },
  };
}

export async function decideCommissions(ctx: ProtectedContext, input: { ids: string[]; action: "approve" | "pay" | "cancel"; reason?: string | null; payoutRef?: string | null }) {
  const ids = [...new Set(input.ids)];
  if (!ids.length) throw bad("Chưa chọn dòng hoa hồng");
  const rows = await ctx.db.select().from(commissions).where(inArray(commissions.id, ids));
  if (rows.length !== ids.length) throw new TRPCError({ code: "NOT_FOUND", message: "Có dòng hoa hồng không tồn tại" });
  const isSA = hasRole(ctx.actor, "SUPER_ADMIN");
  const reason = input.action === "cancel" ? reasonOrThrow(input.reason) : input.reason?.trim() || null;
  for (const c of rows) {
    requirePermission(ctx, input.action === "pay" ? "finance:confirm" : "finance:approve", { centerId: c.centerId });
    wrapRule(() => commissionTransition(c.status, input.action));
    if (input.action === "approve" && c.beneficiaryUserId === ctx.user.id && !isSA) throw pre("Không tự duyệt hoa hồng của chính mình");
    if (input.action === "pay" && c.approvedBy === ctx.user.id && !isSA) throw pre(`Người duyệt không đồng thời chi hoa hồng (${c.beneficiaryName})`);
    if (input.action === "pay" && c.beneficiaryUserId === ctx.user.id) throw pre("Không tự chi hoa hồng cho chính mình");
  }
  if (input.action === "pay") {
    // Không chi khi người hưởng còn dòng thu hồi chưa xử lý ở trạng thái tạm tính (phải duyệt để trừ cùng kỳ)
    const benef = [...new Set(rows.map((r) => r.beneficiaryUserId ?? r.beneficiaryParentId).filter((x): x is string => !!x))];
    const pending = await ctx.db.select({ id: commissions.id, name: commissions.beneficiaryName }).from(commissions)
      .where(and(isNotNull(commissions.parentId), eq(commissions.status, "accrued"), inArray(sql`coalesce(${commissions.beneficiaryUserId}, ${commissions.beneficiaryParentId})`, benef)));
    if (pending.length) throw pre(`${pending[0]!.name} còn khoản thu hồi chưa duyệt — duyệt để trừ cùng lần chi`);
  }
  const to = (s: CommissionStatus) => commissionTransition(s, input.action);
  await ctx.db.transaction(async (tx) => {
    for (const c of rows) {
      const set = input.action === "approve"
        ? { status: to(c.status), approvedBy: ctx.user.id, approvedAt: new Date(), note: reason ?? c.note }
        : input.action === "pay"
          ? { status: to(c.status), paidBy: ctx.user.id, paidAt: new Date(), payoutRef: input.payoutRef?.trim() || null }
          : { status: to(c.status), cancelReason: reason };
      const up = await tx.update(commissions).set(set).where(and(eq(commissions.id, c.id), eq(commissions.status, c.status))).returning({ id: commissions.id });
      if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Có dòng vừa được xử lý — tải lại trang" });
      await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "finance", entity: "commissions", entityId: c.id, before: { status: c.status }, after: { status: set.status, amount: c.amount }, reason, ip: ctx.ip });
    }
    const users_ = [...new Set(rows.map((r) => r.beneficiaryUserId).filter((x): x is string => !!x))];
    const total = rows.reduce((s, r) => s + r.amount, 0);
    const title = input.action === "approve" ? "Hoa hồng đã duyệt" : input.action === "pay" ? "Hoa hồng đã chi" : "Hoa hồng bị huỷ";
    await notify(tx as unknown as Db, users_, title, `${rows.length} dòng · ${formatVnd(total)}${reason ? ` — ${reason}` : ""}`, "/crm/commission", 3);
  });
  return { count: rows.length, total: rows.reduce((s, r) => s + r.amount, 0) };
}

/** Quét đơn đã thu đủ nhưng chưa có hoa hồng (VD: quy tắc tạo sau) */
export async function accrueMissing(ctx: ProtectedContext, input: { centerId?: string }) {
  const centerIds = ctx.actor.assignments.filter((a) => can(ctx, "finance:approve", a.centerId)).map((a) => a.centerId);
  if (!centerIds.length) requirePermission(ctx, "finance:approve", { centerId: input.centerId ?? null });
  const conds: SQL[] = [eq(orders.status, "paid"), scope(ctx, orders.centerId), sql`not exists (select 1 from ${commissions} c where c.order_id = ${orders.id} and c.parent_id is null)`];
  if (input.centerId) conds.push(eq(orders.centerId, input.centerId));
  const os = await ctx.db.select({ id: orders.id, centerId: orders.centerId }).from(orders).where(and(...conds)).limit(500);
  let created = 0;
  for (const o of os) {
    if (!can(ctx, "finance:approve", o.centerId)) continue;
    created += await ctx.db.transaction((tx) => accrueCommissions(tx as unknown as Db, o.id));
  }
  return { scanned: os.length, created };
}

/* ------------------------------------------------------------------ */
/* Quy tắc                                                             */
/* ------------------------------------------------------------------ */

export async function listRules(ctx: ProtectedContext) {
  requirePermission(ctx, "finance:read", { centerId: null });
  const v = scope(ctx, commissionRules.centerId as unknown as typeof orders.centerId);
  const rows = await ctx.db.select({ r: commissionRules, centerCode: centers.code }).from(commissionRules).leftJoin(centers, eq(centers.id, commissionRules.centerId))
    .where(or(isNull(commissionRules.centerId), v)).orderBy(asc(commissionRules.kind), desc(commissionRules.isActive), desc(commissionRules.effectiveFrom));
  const used = rows.length
    ? await ctx.db.select({ ruleId: commissions.ruleId, n: sql<number>`count(*)::int` }).from(commissions).where(inArray(commissions.ruleId, rows.map((r) => r.r.id))).groupBy(commissions.ruleId)
    : [];
  return rows.map((x) => ({
    ...x.r, centerCode: x.centerCode, label: describeRule(x.r), used: used.find((u) => u.ruleId === x.r.id)?.n ?? 0,
    canEdit: x.r.centerId ? can(ctx, "finance:configure", x.r.centerId) : ctx.actor.assignments.some((a) => a.centerId === null && can(ctx, "finance:configure", null)),
  }));
}

export interface RuleInput {
  id?: string; name: string; kind: CommissionKind; centerId: string | null; orderType: OrderType | null; rateType: RateType;
  value: number; maxAmount: number | null; minOrderTotal: number; effectiveFrom: string; effectiveTo: string | null; isActive: boolean;
}

export async function upsertRule(ctx: ProtectedContext, input: RuleInput) {
  if (input.centerId) requirePermission(ctx, "finance:configure", { centerId: input.centerId });
  else if (!ctx.actor.assignments.some((a) => a.centerId === null && can(ctx, "finance:configure", null))) throw new TRPCError({ code: "FORBIDDEN", message: "Chỉ kế toán Hội sở tạo quy tắc dùng chung — hãy chọn cơ sở" });
  const errs = validateRule(input);
  if (errs.length) throw bad(errs);
  const values = {
    name: input.name.trim(), kind: input.kind, centerId: input.centerId, orderType: input.orderType, rateType: input.rateType, value: input.value,
    maxAmount: input.maxAmount, minOrderTotal: input.minOrderTotal, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo, isActive: input.isActive,
  };
  return ctx.db.transaction(async (tx) => {
    if (input.id) {
      const before = await tx.query.commissionRules.findFirst({ where: eq(commissionRules.id, input.id) });
      if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy quy tắc" });
      if (before.centerId !== input.centerId) throw bad("Không đổi phạm vi cơ sở của quy tắc — tạo quy tắc mới");
      const [u] = await tx.select({ n: sql<number>`count(*)::int` }).from(commissions).where(eq(commissions.ruleId, before.id));
      if ((u?.n ?? 0) > 0 && (before.rateType !== input.rateType || before.value !== input.value || before.maxAmount !== input.maxAmount || before.effectiveFrom !== input.effectiveFrom)) {
        throw pre("Quy tắc đã dùng tính hoa hồng — không sửa mức/ngày hiệu lực; đặt ngày kết thúc và tạo quy tắc mới");
      }
      await tx.update(commissionRules).set(values).where(eq(commissionRules.id, before.id));
      await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "finance", entity: "commission_rules", entityId: before.id, before, after: values, ip: ctx.ip });
      return { id: before.id };
    }
    const [r] = await tx.insert(commissionRules).values({ ...values, createdBy: ctx.user.id }).returning({ id: commissionRules.id });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "finance", entity: "commission_rules", entityId: r!.id, after: values, ip: ctx.ip });
    return { id: r!.id };
  });
}

