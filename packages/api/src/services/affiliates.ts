import { and, eq, inArray, sql, desc, asc, or, ilike, isNull, isNotNull, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { affiliates, affiliateRewards, leads, orders, centers, users, parents, staff, type Database } from "@satarobo/db";
import {
  authorize, centersWith, normalizeRefCode, suggestRefCode, validateAffiliate, rewardAmount, rewardTransition, maskPhone, normalizeVnPhone,
  AFFILIATE_TYPE_VI, REWARD_STATUS_VI, LEAD_STATUS_VI,
  type AffiliateType, type RewardRule, type RewardStatus, type LeadStatus,
} from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { notify } from "./finance";

type Db = ProtectedContext["db"];
const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });
const pre = (m: string | string[]) => new TRPCError({ code: "PRECONDITION_FAILED", message: Array.isArray(m) ? m.join("; ") : m });
const notFound = (m: string) => new TRPCError({ code: "NOT_FOUND", message: m });
const forbid = (m: string) => new TRPCError({ code: "FORBIDDEN", message: m });
const asDb = (d: Database) => d as unknown as Db;

function rule<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if ((e as Error)?.name === "OutreachRuleError") throw pre((e as Error).message);
    throw e;
  }
}
const can = (ctx: ProtectedContext, p: `affiliate:${string}`, centerId: string | null) => authorize(ctx.actor, p, { centerId }).allowed;
function scopeOf(ctx: ProtectedContext, col: typeof affiliates.centerId | typeof affiliateRewards.centerId): SQL {
  const ids = centersWith(ctx.actor, "affiliate:read");
  if (ids === null) return sql`true`;
  if (!ids.length) throw forbid("Không có quyền xem nguồn giới thiệu");
  return or(isNull(col), inArray(col, ids))!;
}

export async function listAffiliates(ctx: ProtectedContext, input: { q?: string; active?: boolean }) {
  const conds: SQL[] = [scopeOf(ctx, affiliates.centerId)];
  if (input.active !== undefined) conds.push(eq(affiliates.isActive, input.active));
  if (input.q?.trim()) conds.push(or(ilike(affiliates.name, `%${input.q.trim()}%`), ilike(affiliates.code, `%${input.q.trim().toUpperCase()}%`))!);
  const r = await ctx.db.select({
    a: affiliates, centerCode: centers.code,
    leads: sql<number>`(select count(*)::int from ${leads} l where l.referral_code = ${affiliates.code} and l.deleted_at is null)`,
    enrolled: sql<number>`(select count(*)::int from ${leads} l where l.referral_code = ${affiliates.code} and l.converted_at is not null)`,
    pending: sql<number>`(select coalesce(sum(amount), 0)::float from ${affiliateRewards} r where r.affiliate_id = ${affiliates.id} and r.status in ('pending','approved'))`,
    paid: sql<number>`(select coalesce(sum(amount), 0)::float from ${affiliateRewards} r where r.affiliate_id = ${affiliates.id} and r.status = 'paid')`,
  }).from(affiliates).leftJoin(centers, eq(centers.id, affiliates.centerId)).where(and(...conds)).orderBy(desc(affiliates.isActive), asc(affiliates.name)).limit(300);
  const ids = centersWith(ctx.actor, "affiliate:create");
  const ctrs = await ctx.db.select({ id: centers.id, code: centers.code, name: centers.name }).from(centers).where(eq(centers.isActive, true)).orderBy(asc(centers.code));
  const [rw] = await ctx.db.select({
    pending: sql<number>`count(*) filter (where ${affiliateRewards.status} = 'pending')::int`,
    approved: sql<number>`count(*) filter (where ${affiliateRewards.status} = 'approved')::int`,
    owed: sql<number>`coalesce(sum(${affiliateRewards.amount}) filter (where ${affiliateRewards.status} in ('pending','approved')), 0)::float`,
  }).from(affiliateRewards).where(scopeOf(ctx, affiliateRewards.centerId));
  const [seq] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(affiliates);
  return {
    canCreate: ids === null || ids.length > 0, globalCreate: ids === null, centers: ids === null ? ctrs : ctrs.filter((c) => ids.includes(c.id)), nextSeq: (seq?.n ?? 0) + 1,
    rewards: rw ?? { pending: 0, approved: 0, owed: 0 },
    items: r.map((x) => ({
      ...x.a, phone: x.a.phone ? maskPhone(normalizeVnPhone(x.a.phone) ?? x.a.phone) : null, payoutInfo: undefined, centerCode: x.centerCode, typeLabel: AFFILIATE_TYPE_VI[x.a.type as AffiliateType],
      leads: x.leads, enrolled: x.enrolled, closeRate: x.leads ? Math.round((x.enrolled / x.leads) * 100) : 0, owed: x.pending, paid: x.paid, canEdit: can(ctx, "affiliate:update", x.a.centerId),
    })),
  };
}

export interface AffiliateInput { id?: string; name: string; code: string; type: AffiliateType; phone?: string | null; email?: string | null; centerId?: string | null; rule: RewardRule; payoutInfo?: string | null; notes?: string | null; isActive?: boolean; parentPhone?: string | null; staffId?: string | null }

export async function upsertAffiliate(ctx: ProtectedContext, input: AffiliateInput) {
  const centerId = input.centerId ?? null;
  const before = input.id ? await ctx.db.query.affiliates.findFirst({ where: eq(affiliates.id, input.id) }) : undefined;
  if (input.id && !before) throw notFound("Không tìm thấy nguồn giới thiệu");
  const perm = before ? "affiliate:update" : "affiliate:create";
  if (centerId === null ? centersWith(ctx.actor, perm) !== null : !can(ctx, perm, centerId)) throw forbid(centerId === null ? "Nguồn toàn hệ thống do Hội sở tạo — chọn cơ sở" : "Không có quyền");
  if (before && !can(ctx, "affiliate:update", before.centerId)) throw forbid("Không có quyền");
  const code = normalizeRefCode(input.code) ?? "";
  const errs = validateAffiliate({ ...input, code });
  if (errs.length) throw bad(errs);
  if (before && before.code !== code) {
    const [used] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(leads).where(eq(leads.referralCode, before.code));
    if ((used?.n ?? 0) > 0) throw pre("Mã đã có lead — không đổi mã (tạo nguồn mới)");
  }
  const dup = await ctx.db.query.affiliates.findFirst({ where: and(eq(affiliates.code, code), before ? sql`${affiliates.id} <> ${before.id}` : sql`true`) });
  if (dup) throw pre(`Mã ${code} đã dùng cho ${dup.name}`);
  let parentId: string | null = before?.parentId ?? null;
  if (input.type === "parent" && input.parentPhone) {
    const pn = normalizeVnPhone(input.parentPhone);
    const variants = pn ? [pn, `0${pn.slice(2)}`] : [];
    const p = variants.length ? await ctx.db.query.parents.findFirst({ where: and(inArray(parents.phone, variants), isNull(parents.deletedAt)) }) : undefined;
    if (!p) throw bad("Không tìm thấy phụ huynh với số điện thoại này");
    parentId = p.id;
  }
  let staffId: string | null = input.type === "staff" ? input.staffId ?? before?.staffId ?? null : null;
  if (input.type === "staff") {
    if (!staffId) throw bad("Chọn nhân viên");
    const st = await ctx.db.query.staff.findFirst({ where: eq(staff.id, staffId) });
    if (!st) throw bad("Nhân viên không tồn tại");
    staffId = st.id;
  }
  const v = {
    code, name: input.name.trim(), type: input.type, phone: input.phone?.replace(/\D/g, "") || null, email: input.email?.trim() || null, centerId,
    parentId: input.type === "parent" ? parentId : null, staffId, rule: { kind: input.rule.kind, value: input.rule.value, cap: input.rule.cap ?? null },
    payoutInfo: input.payoutInfo?.trim() || null, notes: input.notes?.trim() || null, isActive: input.isActive ?? true,
  };
  if (before) {
    await ctx.db.update(affiliates).set(v).where(eq(affiliates.id, before.id));
    await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "affiliate", entity: "affiliates", entityId: before.id, before: { code: before.code, rule: before.rule, isActive: before.isActive }, after: { code, rule: v.rule, isActive: v.isActive }, ip: ctx.ip });
    return { id: before.id, code };
  }
  const [r] = await ctx.db.insert(affiliates).values({ ...v, createdBy: ctx.user.id }).returning({ id: affiliates.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "affiliate", entity: "affiliates", entityId: r!.id, after: { code, rule: v.rule, type: v.type }, ip: ctx.ip });
  return { id: r!.id, code };
}

export async function getAffiliate(ctx: ProtectedContext, id: string) {
  const [row] = await ctx.db.select({ a: affiliates, centerCode: centers.code }).from(affiliates).leftJoin(centers, eq(centers.id, affiliates.centerId)).where(and(eq(affiliates.id, id), scopeOf(ctx, affiliates.centerId)));
  if (!row) throw notFound("Không tìm thấy nguồn giới thiệu");
  const a = row.a;
  const ls = await ctx.db.select({ id: leads.id, name: leads.parentName, phone: leads.phoneNormalized, status: leads.status, createdAt: leads.createdAt, convertedAt: leads.convertedAt, owner: users.fullName })
    .from(leads).leftJoin(users, eq(users.id, leads.assignedToId)).where(and(eq(leads.referralCode, a.code), isNull(leads.deletedAt))).orderBy(desc(leads.createdAt)).limit(200);
  const rs = await ctx.db.select({ r: affiliateRewards, lead: leads.parentName, order: orders.code, approver: users.fullName }).from(affiliateRewards)
    .innerJoin(leads, eq(leads.id, affiliateRewards.leadId)).leftJoin(orders, eq(orders.id, affiliateRewards.orderId)).leftJoin(users, eq(users.id, affiliateRewards.approvedBy))
    .where(eq(affiliateRewards.affiliateId, a.id)).orderBy(desc(affiliateRewards.createdAt));
  const payer = can(ctx, "affiliate:pay", a.centerId);
  return {
    ...a, centerCode: row.centerCode, typeLabel: AFFILIATE_TYPE_VI[a.type as AffiliateType], canEdit: can(ctx, "affiliate:update", a.centerId),
    phone: a.phone && !can(ctx, "affiliate:update", a.centerId) ? maskPhone(normalizeVnPhone(a.phone) ?? a.phone) : a.phone,
    payoutInfo: payer || can(ctx, "affiliate:update", a.centerId) ? a.payoutInfo : a.payoutInfo ? "•••" : null,
    link: `/dang-ky?ref=${a.code}&utm_source=referral&utm_medium=affiliate&utm_campaign=${a.code.toLowerCase()}`,
    leads: ls.map((l) => ({ ...l, phone: maskPhone(l.phone), statusLabel: LEAD_STATUS_VI[l.status as LeadStatus] ?? l.status })),
    rewards: rs.map((x) => ({ ...x.r, lead: x.lead, order: x.order, approver: x.approver, statusLabel: REWARD_STATUS_VI[x.r.status as RewardStatus] })),
  };
}

export async function listRewards(ctx: ProtectedContext, input: { status?: RewardStatus }) {
  const r = await ctx.db.select({ r: affiliateRewards, aff: affiliates.name, code: affiliates.code, payout: affiliates.payoutInfo, lead: leads.parentName, order: orders.code, centerCode: centers.code })
    .from(affiliateRewards).innerJoin(affiliates, eq(affiliates.id, affiliateRewards.affiliateId)).innerJoin(leads, eq(leads.id, affiliateRewards.leadId))
    .leftJoin(orders, eq(orders.id, affiliateRewards.orderId)).leftJoin(centers, eq(centers.id, affiliateRewards.centerId))
    .where(and(scopeOf(ctx, affiliateRewards.centerId), input.status ? eq(affiliateRewards.status, input.status) : inArray(affiliateRewards.status, ["pending", "approved"])))
    .orderBy(asc(affiliateRewards.createdAt)).limit(300);
  return {
    items: r.map((x) => ({
      ...x.r, affiliate: x.aff, code: x.code, lead: x.lead, order: x.order, centerCode: x.centerCode, statusLabel: REWARD_STATUS_VI[x.r.status as RewardStatus],
      payoutInfo: can(ctx, "affiliate:pay", x.r.centerId) ? x.payout : null,
      can: { approve: can(ctx, "affiliate:approve", x.r.centerId) && x.r.status === "pending", pay: can(ctx, "affiliate:pay", x.r.centerId) && x.r.status === "approved" && x.r.approvedBy !== ctx.user.id, cancel: (can(ctx, "affiliate:approve", x.r.centerId) || can(ctx, "affiliate:pay", x.r.centerId)) && ["pending", "approved"].includes(x.r.status) },
    })),
  };
}

export async function rewardAction(ctx: ProtectedContext, input: { id: string; action: "approve" | "pay" | "cancel"; reason?: string | null; paymentRef?: string | null }) {
  const r = await ctx.db.query.affiliateRewards.findFirst({ where: eq(affiliateRewards.id, input.id) });
  if (!r) throw notFound("Không tìm thấy khoản thưởng");
  const perm = input.action === "approve" ? "affiliate:approve" : input.action === "pay" ? "affiliate:pay" : null;
  if (perm && !can(ctx, perm, r.centerId)) throw forbid("Không có quyền");
  if (!perm && !can(ctx, "affiliate:approve", r.centerId) && !can(ctx, "affiliate:pay", r.centerId)) throw forbid("Không có quyền");
  const to = rule(() => rewardTransition(r.status as RewardStatus, input.action, { reason: input.reason, paymentRef: input.paymentRef, sameUserAsApprover: r.approvedBy === ctx.user.id }));
  const now = new Date();
  await ctx.db.update(affiliateRewards).set({
    status: to,
    ...(to === "approved" ? { approvedBy: ctx.user.id, approvedAt: now } : {}),
    ...(to === "paid" ? { paidBy: ctx.user.id, paidAt: now, paymentRef: input.paymentRef!.trim() } : {}),
    ...(to === "cancelled" ? { cancelReason: input.reason!.trim() } : {}),
  }).where(eq(affiliateRewards.id, r.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "TRANSITION", module: "affiliate", entity: "affiliate_rewards", entityId: r.id, before: { status: r.status }, after: { status: to, amount: r.amount }, reason: input.reason ?? input.paymentRef ?? null, ip: ctx.ip });
  return { status: to };
}

/** Worker: tạo khoản thưởng khi đơn học phí đầu tiên của lead được giới thiệu đã thu đủ; huỷ khi đơn bị huỷ / hoàn */
export async function syncAffiliateRewards(db: Database) {
  const d = asDb(db);
  const cands = (await d.execute(sql`
    select l.id as lead_id, l.phone_normalized as lead_phone, l.converted_parent_id, a.id as affiliate_id, a.rule, a.parent_id as aff_parent, a.phone as aff_phone, a.created_by, a.center_id as aff_center,
      o.id as order_id, o.total, o.center_id
    from leads l
    join affiliates a on a.code = l.referral_code and a.is_active
    join lateral (
      select o.id, o.total, o.center_id from orders o
      where o.student_id = l.converted_student_id and o.type = 'course' and o.created_at >= l.created_at - interval '1 day'
      order by o.created_at asc limit 1
    ) o on true
    where l.converted_student_id is not null
      and not exists (select 1 from affiliate_rewards r where r.lead_id = l.id)
      and exists (select 1 from orders oo where oo.id = o.id and oo.status = 'paid')
    limit 200`)) as unknown as { lead_id: string; lead_phone: string; converted_parent_id: string | null; affiliate_id: string; rule: RewardRule; aff_parent: string | null; aff_phone: string | null; created_by: string | null; aff_center: string | null; order_id: string; total: number; center_id: string }[];
  let created = 0;
  for (const c of cands) {
    const self = (c.aff_parent && c.aff_parent === c.converted_parent_id) || (c.aff_phone && normalizeVnPhone(c.aff_phone) === c.lead_phone);
    if (self) continue;
    const amount = rewardAmount(c.rule, Number(c.total));
    if (amount <= 0) continue;
    const ins = await d.insert(affiliateRewards).values({ affiliateId: c.affiliate_id, leadId: c.lead_id, orderId: c.order_id, centerId: c.center_id, base: Number(c.total), amount })
      .onConflictDoNothing({ target: affiliateRewards.leadId }).returning({ id: affiliateRewards.id });
    if (ins.length) {
      created++;
      await notify(d, [c.created_by], "Thưởng giới thiệu chờ duyệt", `${amount.toLocaleString("vi-VN")}đ`, "/affiliates?tab=rewards", 3);
    }
  }
  const voided = await d.update(affiliateRewards).set({ status: "cancelled", cancelReason: "Tự động: đơn học phí đã huỷ / hoàn tiền", updatedAt: new Date() })
    .where(and(inArray(affiliateRewards.status, ["pending", "approved"]), isNotNull(affiliateRewards.orderId),
      sql`exists (select 1 from orders o where o.id = ${affiliateRewards.orderId} and o.status in ('cancelled','refunded'))`)).returning({ id: affiliateRewards.id });
  return { created, voided: voided.length };
}

export function suggestCode(name: string, seq: number) {
  return suggestRefCode(name, seq);
}
