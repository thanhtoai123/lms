import { createHmac } from "node:crypto";
import { and, eq, inArray, sql, desc, asc, or, ilike, gte, lte, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  einvoices, einvoiceEvents, einvoiceCounters, orders, orderItems, payments, paymentMethods, refunds, centers, users, appSettings, type Database,
} from "@satarobo/db";
import {
  authorize, authorizeGlobal, visibleCenterIds, maskPhone, normalizeVnPhone,
  computeInvoiceTotals, linesForPayment, validateBuyer, validateSerial, invoiceTransition, validateCorrection, issueDeadlineState, vndInWords, formatVnd,
  INVOICE_STATUS_VI, INVOICE_KIND_VI, TAX_RATES, TAX_RATE_VI,
  type InvoiceStatus, type InvoiceKind, type InvoiceLine, type TaxRate, type InvoiceAction,
} from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { tenantCond } from "./tenantScope";
import { writeAudit } from "./audit";
import { todayISO } from "./sessions";
import { queueEmail, getSettings } from "./admin";
import { notify, accountantsOf } from "./finance";
import { mediaSigningSecret } from "../lib/secrets";
import { logger } from "../lib/logger";

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
    if ((e as Error)?.name === "InvoiceRuleError") throw pre((e as Error).message);
    throw e;
  }
}
const can = (ctx: ProtectedContext, p: `finance:${string}`, centerId: string | null) => authorize(ctx.actor, p, { centerId }).allowed;
function scope(ctx: ProtectedContext): SQL {
  const v = visibleCenterIds(ctx.actor);
  if (v === null) return sql`true`;
  return v.length ? inArray(einvoices.centerId, v) : sql`false`;
}

/* ------------------------------------------------------------------ */
/* Cấu hình                                                             */
/* ------------------------------------------------------------------ */

export interface EInvoiceSettings {
  enabled: boolean;
  provider: "sandbox" | "http";
  templateCode: string;
  serial: string;
  sellerName: string;
  sellerTaxCode: string;
  sellerAddress: string;
  courseRate: TaxRate;
  goodsRate: TaxRate;
  autoDraft: boolean;
  autoIssue: boolean;
  startDate: string | null;
  lookupUrl: string;
}
const DEFAULTS: EInvoiceSettings = {
  enabled: false, provider: "sandbox", templateCode: "1", serial: `1C${String(new Date().getFullYear()).slice(-2)}TSR`, sellerName: "", sellerTaxCode: "", sellerAddress: "",
  courseRate: "KCT", goodsRate: "10", autoDraft: true, autoIssue: false, startDate: null, lookupUrl: "/tra-cuu-hoa-don",
};
export async function einvoiceSettings(db: Db): Promise<EInvoiceSettings> {
  const r = await db.query.appSettings.findFirst({ where: eq(appSettings.key, "einvoice") });
  return { ...DEFAULTS, ...((r?.value ?? {}) as Partial<EInvoiceSettings>) };
}

export async function getEInvoiceSettings(ctx: ProtectedContext) {
  if (!ctx.actor.assignments.some((a) => authorize({ ...ctx.actor, assignments: [a] }, "finance:read", { centerId: a.centerId }).allowed)) throw forbid("Không có quyền");
  const s = await einvoiceSettings(ctx.db);
  return {
    ...s, canEdit: authorizeGlobal(ctx.actor, "finance:configure"),
    providerStatus: {
      sandbox: s.provider === "sandbox", httpConfigured: !!process.env.EINVOICE_API_URL && !!process.env.EINVOICE_API_KEY,
      sandboxBlocked: s.provider === "sandbox" && process.env.NODE_ENV === "production" && process.env.EINVOICE_ALLOW_SANDBOX !== "1",
    },
  };
}

export async function saveEInvoiceSettings(ctx: ProtectedContext, input: EInvoiceSettings) {
  if (!authorizeGlobal(ctx.actor, "finance:configure")) throw forbid("Chỉ kế toán Hội sở cấu hình hoá đơn điện tử");
  const e: string[] = [];
  const year = Number(todayISO().slice(0, 4));
  e.push(...validateSerial(input.serial.trim().toUpperCase(), year));
  if (!/^[1-2]$/.test(input.templateCode.trim())) e.push("Mẫu số: 1 (hoá đơn GTGT) hoặc 2 (hoá đơn bán hàng)");
  if (input.enabled) {
    if (input.sellerName.trim().length < 5) e.push("Tên đơn vị bán (theo đăng ký thuế) tối thiểu 5 ký tự");
    if (!/^\d{10}(-\d{3})?$/.test(input.sellerTaxCode.trim())) e.push("Mã số thuế đơn vị bán không hợp lệ");
    if (input.sellerAddress.trim().length < 10) e.push("Địa chỉ đơn vị bán tối thiểu 10 ký tự");
    if (input.provider === "http" && !(process.env.EINVOICE_API_URL && process.env.EINVOICE_API_KEY)) e.push("Chưa cấu hình EINVOICE_API_URL / EINVOICE_API_KEY cho nhà cung cấp");
  }
  if (input.templateCode === "2" && (input.courseRate !== "KCT" || input.goodsRate !== "KCT")) e.push("Hoá đơn bán hàng (mẫu 2) không ghi thuế suất — đặt KCT");
  if (!TAX_RATES.includes(input.courseRate) || !TAX_RATES.includes(input.goodsRate)) e.push("Thuế suất không hợp lệ");
  if (input.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) e.push("Ngày bắt đầu không hợp lệ");
  if (e.length) throw bad(e);
  const v: EInvoiceSettings = { ...input, serial: input.serial.trim().toUpperCase(), templateCode: input.templateCode.trim(), sellerName: input.sellerName.trim(), sellerTaxCode: input.sellerTaxCode.trim(), sellerAddress: input.sellerAddress.trim(), lookupUrl: input.lookupUrl.trim() || DEFAULTS.lookupUrl };
  const before = await einvoiceSettings(ctx.db);
  await ctx.db.insert(appSettings).values({ key: "einvoice", value: v as unknown as Record<string, unknown>, updatedBy: ctx.user.id })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: v as unknown as Record<string, unknown>, updatedBy: ctx.user.id, updatedAt: new Date() } });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "finance", entity: "app_settings", entityId: null, before: { einvoice: before }, after: { einvoice: v }, ip: ctx.ip });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Nhà cung cấp                                                         */
/* ------------------------------------------------------------------ */

interface IssueResult { number: number; issuedAt: Date; lookupCode: string; providerRef: string }
interface IssuePayload {
  invoiceId: string; kind: InvoiceKind; templateCode: string; serial: string;
  original: { serial: string; number: number | null; issuedAt: Date | null; templateCode: string } | null;
  seller: { name: string; taxCode: string; address: string };
  buyer: { name: string | null; company: string | null; taxCode: string | null; address: string | null; email: string | null; phone: string | null; noInvoiceRequested: boolean };
  lines: InvoiceLine[]; subtotal: number; vat: number; total: number; totalInWords: string; paymentMethod: string | null; reason: string | null; agreementNote: string | null;
}

async function providerIssue(db: Db, provider: EInvoiceSettings["provider"], p: IssuePayload): Promise<IssueResult> {
  if (provider === "sandbox") {
    if (process.env.NODE_ENV === "production" && process.env.EINVOICE_ALLOW_SANDBOX !== "1") throw new Error("Nhà cung cấp thử nghiệm không dùng được ở production");
    const key = `${p.templateCode}|${p.serial}`;
    const [c] = await db.insert(einvoiceCounters).values({ key, seq: 1 }).onConflictDoUpdate({ target: einvoiceCounters.key, set: { seq: sql`${einvoiceCounters.seq} + 1` } }).returning({ seq: einvoiceCounters.seq });
    const lookupCode = createHmac("sha256", mediaSigningSecret()).update(`einv|${p.invoiceId}`).digest("hex").slice(0, 12).toUpperCase();
    return { number: c!.seq, issuedAt: new Date(), lookupCode, providerRef: `SBX-${p.invoiceId.slice(0, 8)}` };
  }
  const url = process.env.EINVOICE_API_URL;
  const key = process.env.EINVOICE_API_KEY;
  if (!url || !key) throw new Error("Chưa cấu hình EINVOICE_API_URL / EINVOICE_API_KEY");
  const r = await fetch(`${url.replace(/\/$/, "")}/invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "Idempotency-Key": p.invoiceId },
    body: JSON.stringify(p),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await r.json().catch(() => ({}))) as { number?: number; issuedAt?: string; lookupCode?: string; providerRef?: string; error?: string };
  if (!r.ok || !j.number || !j.lookupCode) throw new Error(j.error ?? `Nhà cung cấp trả lỗi HTTP ${r.status}`);
  return { number: j.number, issuedAt: j.issuedAt ? new Date(j.issuedAt) : new Date(), lookupCode: j.lookupCode, providerRef: j.providerRef ?? "" };
}

/* ------------------------------------------------------------------ */
/* Lập nháp                                                             */
/* ------------------------------------------------------------------ */

async function draftForPayment(db: Db, paymentId: string, s: EInvoiceSettings, actorId: string | null) {
  const [p] = await db.select({ p: payments, o: orders, method: paymentMethods.name }).from(payments).innerJoin(orders, eq(orders.id, payments.orderId))
    .leftJoin(paymentMethods, eq(paymentMethods.id, payments.paymentMethodId)).where(eq(payments.id, paymentId)).limit(1);
  if (!p) throw notFound("Không tìm thấy khoản thu");
  if (p.p.status !== "confirmed") throw pre("Chỉ lập hoá đơn cho khoản thu đã xác nhận");
  const exists = await db.query.einvoices.findFirst({ where: and(eq(einvoices.paymentId, p.p.id), eq(einvoices.kind, "original"), sql`${einvoices.status} <> 'cancelled'`) });
  if (exists) return { id: exists.id, created: false };
  const items = await db.select({ description: orderItems.description, quantity: orderItems.quantity, unitPrice: orderItems.unitPrice, amount: orderItems.amount, courseId: orderItems.courseId })
    .from(orderItems).where(eq(orderItems.orderId, p.o.id));
  const prior = await db.select({ id: payments.id }).from(payments).where(and(eq(payments.orderId, p.o.id), eq(payments.status, "confirmed"))).orderBy(asc(payments.decidedAt), asc(payments.recordedAt));
  const idx = prior.findIndex((x) => x.id === p.p.id) + 1;
  const partial = p.p.amount !== p.o.total;
  const lines = rule(() => linesForPayment({
    orderCode: p.o.code, orderType: p.o.type, orderTotal: p.o.total, paymentAmount: p.p.amount, installmentLabel: partial ? `đợt ${idx}` : null,
    items: items.map((i) => ({ ...i, isCourse: !!i.courseId || p.o.type === "course" || p.o.type === "exam" })), courseRate: s.courseRate, goodsRate: s.goodsRate,
  }));
  const t = computeInvoiceTotals(lines);
  const [row] = await db.insert(einvoices).values({
    centerId: p.p.centerId, orderId: p.o.id, paymentId: p.p.id, kind: "original", status: "draft", templateCode: s.templateCode, serial: s.serial, provider: s.provider,
    buyerName: p.o.customerName, buyerEmail: p.o.customerEmail, buyerPhone: p.o.customerPhone, lines, subtotal: t.subtotal, vatAmount: t.vat, total: t.total,
    paymentMethod: p.method ?? "TM/CK", paidDate: p.p.paidAt, createdBy: actorId,
  }).onConflictDoNothing().returning({ id: einvoices.id });
  if (!row) {
    const again = await db.query.einvoices.findFirst({ where: and(eq(einvoices.paymentId, p.p.id), eq(einvoices.kind, "original")) });
    return { id: again!.id, created: false };
  }
  await db.insert(einvoiceEvents).values({ invoiceId: row.id, action: "draft", note: `Từ phiếu thu ${p.p.receiptNo ?? p.p.externalRef ?? ""}`.trim(), userId: actorId });
  return { id: row.id, created: true };
}

export async function createDraft(ctx: ProtectedContext, input: { paymentId: string }) {
  const p = await ctx.db.query.payments.findFirst({ where: eq(payments.id, input.paymentId) });
  if (!p) throw notFound("Không tìm thấy khoản thu");
  if (!can(ctx, "finance:confirm", p.centerId)) throw forbid("Chỉ kế toán lập hoá đơn");
  const s = await einvoiceSettings(ctx.db);
  return draftForPayment(ctx.db, p.id, s, ctx.user.id);
}

/** Worker: tạo nháp cho khoản thu đã xác nhận (và phát hành luôn nếu bật) */
export async function syncInvoiceDrafts(db: Database, opts: { limit?: number } = {}) {
  const d = asDb(db);
  const s = await einvoiceSettings(d);
  if (!s.enabled || !s.autoDraft) return { drafted: 0, issued: 0, failed: 0 };
  const since = s.startDate ?? "2000-01-01";
  const todo = await d.select({ id: payments.id }).from(payments)
    .where(and(eq(payments.status, "confirmed"), gte(payments.paidAt, since),
      sql`not exists (select 1 from einvoices e where e.payment_id = ${payments.id} and e.kind = 'original' and e.status <> 'cancelled')`))
    .orderBy(asc(payments.decidedAt)).limit(opts.limit ?? 100);
  let drafted = 0;
  let issued = 0;
  let failed = 0;
  for (const t of todo) {
    try {
      const r = await draftForPayment(d, t.id, s, null);
      if (r.created) drafted++;
      if (r.created && s.autoIssue) {
        const inv = await d.query.einvoices.findFirst({ where: eq(einvoices.id, r.id) });
        const v = inv ? validateBuyer(buyerOf(inv)) : ["?"];
        if (v.length) continue;
        const res = await doIssue(d, r.id, null);
        if (res.status === "issued") issued++;
        else failed++;
      }
    } catch (e) {
      failed++;
      logger.child("einvoice").error("không phát hành được hoá đơn nháp", { err: e });
    }
  }
  return { drafted, issued, failed };
}

function buyerOf(i: typeof einvoices.$inferSelect) {
  return { name: i.buyerName, company: i.buyerCompany, taxCode: i.buyerTaxCode, address: i.buyerAddress, email: i.buyerEmail, phone: i.buyerPhone, noInvoiceRequested: i.noInvoiceRequested };
}

/* ------------------------------------------------------------------ */
/* Phát hành                                                            */
/* ------------------------------------------------------------------ */

async function doIssue(db: Db, id: string, actorId: string | null, ip?: string): Promise<{ status: InvoiceStatus; number?: number; error?: string }> {
  const s = await einvoiceSettings(db);
  if (!s.enabled) throw pre("Chưa bật hoá đơn điện tử (Cấu hình)");
  const claim = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"einv:" + id}))`);
    const inv = await tx.query.einvoices.findFirst({ where: eq(einvoices.id, id) });
    if (!inv) throw notFound("Không tìm thấy hoá đơn");
    const action: InvoiceAction = inv.status === "failed" ? "retry" : "issue";
    const to = rule(() => invoiceTransition(inv.status as InvoiceStatus, action));
    const errs = validateBuyer(buyerOf(inv));
    if (errs.length) throw bad(errs);
    const year = Number(todayISO().slice(0, 4));
    const serErr = validateSerial(inv.serial, year);
    if (serErr.length) {
      if (inv.status === "issued") throw pre(serErr);
      await tx.update(einvoices).set({ serial: s.serial, templateCode: s.templateCode }).where(eq(einvoices.id, inv.id));
      inv.serial = s.serial;
      inv.templateCode = s.templateCode;
    }
    await tx.update(einvoices).set({ status: to, attempts: inv.attempts + 1, error: null, provider: s.provider }).where(eq(einvoices.id, inv.id));
    return inv;
  });
  const original = claim.originalId ? await db.query.einvoices.findFirst({ where: eq(einvoices.id, claim.originalId) }) : null;
  const t = computeInvoiceTotals(claim.lines as InvoiceLine[]);
  try {
    const res = await providerIssue(db, s.provider, {
      invoiceId: claim.id, kind: claim.kind as InvoiceKind, templateCode: claim.templateCode, serial: claim.serial,
      original: original ? { serial: original.serial, number: original.number, issuedAt: original.issuedAt, templateCode: original.templateCode } : null,
      seller: { name: s.sellerName, taxCode: s.sellerTaxCode, address: s.sellerAddress }, buyer: buyerOf(claim),
      lines: claim.lines as InvoiceLine[], subtotal: t.subtotal, vat: t.vat, total: t.total, totalInWords: vndInWords(t.total),
      paymentMethod: claim.paymentMethod, reason: claim.reason, agreementNote: claim.agreementNote,
    });
    await db.transaction(async (tx) => {
      await tx.update(einvoices).set({ status: "issued", number: res.number, issuedAt: res.issuedAt, lookupCode: res.lookupCode, providerRef: res.providerRef, issuedBy: actorId }).where(eq(einvoices.id, claim.id));
      await tx.insert(einvoiceEvents).values({ invoiceId: claim.id, action: "issued", note: `Số ${res.number} · ${claim.serial}`, userId: actorId });
      if (original) {
        const to = rule(() => invoiceTransition(original.status as InvoiceStatus, claim.kind === "replacement" ? "mark_replaced" : "mark_adjusted"));
        await tx.update(einvoices).set({ status: to }).where(eq(einvoices.id, original.id));
        await tx.insert(einvoiceEvents).values({ invoiceId: original.id, action: to, note: `Bởi hoá đơn số ${res.number}`, userId: actorId });
      }
      // Nhật ký ghi TRONG transaction chốt số hoá đơn. Trước đây chỉ `issueInvoice` (thao tác tay)
      // mới ghi audit, và ghi SAU khi transaction đã cam kết; hoá đơn do worker phát hành
      // (`syncInvoiceDrafts`) thì không để lại dấu vết nào.
      await writeAudit(tx as unknown as Db, {
        actorId, action: "TRANSITION", module: "finance", entity: "einvoices", entityId: claim.id,
        before: { status: claim.status }, after: { status: "issued", number: res.number, serial: claim.serial, total: t.total }, ip,
      });
    });
    if (claim.buyerEmail) {
      const st = await getSettings(db);
      await queueEmail(db, {
        to: claim.buyerEmail, event: "INVOICE_ISSUED",
        vars: { ten_ph: claim.buyerName ?? claim.buyerCompany ?? "Quý khách", so_hd: String(res.number), ky_hieu: `${claim.templateCode}${claim.serial}`, so_tien: formatVnd(t.total), ma_tra_cuu: res.lookupCode, link: `${st.website.replace(/\/$/, "")}${s.lookupUrl}?ma=${res.lookupCode}` },
        relatedType: "einvoice", relatedId: claim.id, createdBy: actorId,
      }).catch((e) => logger.child("einvoice").error("không xếp được email hoá đơn vào hàng đợi", { err: e, einvoiceId: claim.id }));
    }
    return { status: "issued", number: res.number };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 500);
    await db.update(einvoices).set({ status: "failed", error: msg }).where(eq(einvoices.id, claim.id));
    await db.insert(einvoiceEvents).values({ invoiceId: claim.id, action: "failed", note: msg, userId: actorId });
    await notify(db, await accountantsOf(db, claim.centerId), "Hoá đơn điện tử phát hành lỗi", msg, `/hoa-don?id=${claim.id}`, 1, "einvoice.failed");
    return { status: "failed", error: msg };
  }
}

export async function issueInvoice(ctx: ProtectedContext, input: { id: string }) {
  const inv = await ctx.db.query.einvoices.findFirst({ where: eq(einvoices.id, input.id) });
  if (!inv) throw notFound("Không tìm thấy hoá đơn");
  if (!can(ctx, "finance:confirm", inv.centerId)) throw forbid("Chỉ kế toán phát hành hoá đơn");
  // `doIssue` tự ghi audit TRONG transaction chốt số (gọi ra nhà cung cấp nằm giữa hai transaction
  // nên không gói chung được) — ở đây chỉ truyền IP xuống, không ghi lần thứ hai.
  return doIssue(ctx.db, inv.id, ctx.user.id, ctx.ip);
}

export async function updateDraft(ctx: ProtectedContext, input: { id: string; buyerName?: string | null; buyerCompany?: string | null; buyerTaxCode?: string | null; buyerAddress?: string | null; buyerEmail?: string | null; noInvoiceRequested?: boolean }) {
  const inv = await ctx.db.query.einvoices.findFirst({ where: eq(einvoices.id, input.id) });
  if (!inv) throw notFound("Không tìm thấy hoá đơn");
  if (!can(ctx, "finance:confirm", inv.centerId)) throw forbid("Chỉ kế toán sửa hoá đơn");
  if (!["draft", "failed"].includes(inv.status)) throw pre("Chỉ sửa hoá đơn nháp / lỗi — hoá đơn đã phát hành phải điều chỉnh hoặc thay thế");
  const t = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
  const next = {
    buyerName: t(input.buyerName) ?? (input.buyerName === undefined ? inv.buyerName : null),
    buyerCompany: t(input.buyerCompany) ?? (input.buyerCompany === undefined ? inv.buyerCompany : null),
    buyerTaxCode: t(input.buyerTaxCode) ?? (input.buyerTaxCode === undefined ? inv.buyerTaxCode : null),
    buyerAddress: t(input.buyerAddress) ?? (input.buyerAddress === undefined ? inv.buyerAddress : null),
    buyerEmail: t(input.buyerEmail) ?? (input.buyerEmail === undefined ? inv.buyerEmail : null),
    noInvoiceRequested: input.noInvoiceRequested ?? inv.noInvoiceRequested,
  };
  const errs = validateBuyer({ name: next.buyerName, company: next.buyerCompany, taxCode: next.buyerTaxCode, address: next.buyerAddress, email: next.buyerEmail, phone: inv.buyerPhone, noInvoiceRequested: next.noInvoiceRequested });
  if (errs.length) throw bad(errs);
  // Sửa người mua trên hoá đơn = đổi dữ liệu thuế + PII khách hàng (mã số thuế, địa chỉ, email).
  // Ba câu lệnh phải cùng một transaction, và nhật ký ghi ngay trong đó.
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.update(einvoices).set(next).where(eq(einvoices.id, inv.id));
    await tx.insert(einvoiceEvents).values({ invoiceId: inv.id, action: "edit", note: "Cập nhật thông tin người mua", userId: ctx.user.id });
    await writeAudit(tx, {
      actorId: ctx.user.id, action: "UPDATE", module: "finance", entity: "einvoices", entityId: inv.id,
      before: { buyerName: inv.buyerName, buyerCompany: inv.buyerCompany, buyerTaxCode: inv.buyerTaxCode, buyerAddress: inv.buyerAddress, buyerEmail: inv.buyerEmail, noInvoiceRequested: inv.noInvoiceRequested },
      after: next, ip: ctx.ip,
    });
  });
  return { ok: true };
}

export async function cancelDraft(ctx: ProtectedContext, input: { id: string; reason: string }) {
  const inv = await ctx.db.query.einvoices.findFirst({ where: eq(einvoices.id, input.id) });
  if (!inv) throw notFound("Không tìm thấy hoá đơn");
  if (!can(ctx, "finance:confirm", inv.centerId)) throw forbid("Chỉ kế toán");
  if (input.reason.trim().length < 5) throw bad("Ghi lý do huỷ nháp");
  const to = rule(() => invoiceTransition(inv.status as InvoiceStatus, "cancel"));
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.update(einvoices).set({ status: to, reason: input.reason.trim() }).where(eq(einvoices.id, inv.id));
    await tx.insert(einvoiceEvents).values({ invoiceId: inv.id, action: "cancel", note: input.reason.trim(), userId: ctx.user.id });
    await writeAudit(tx, {
      actorId: ctx.user.id, action: "TRANSITION", module: "finance", entity: "einvoices", entityId: inv.id,
      before: { status: inv.status }, after: { status: to }, reason: input.reason.trim(), ip: ctx.ip,
    });
  });
  return { status: to };
}

/** Lập hoá đơn điều chỉnh / thay thế (nháp) cho hoá đơn đã phát hành */
export async function createCorrection(ctx: ProtectedContext, input: { originalId: string; kind: "adjustment" | "replacement"; reason: string; agreementNote: string; lines: InvoiceLine[]; refundId?: string | null; buyer?: { name?: string | null; company?: string | null; taxCode?: string | null; address?: string | null; email?: string | null } | null }) {
  const o = await ctx.db.query.einvoices.findFirst({ where: eq(einvoices.id, input.originalId) });
  if (!o) throw notFound("Không tìm thấy hoá đơn gốc");
  if (!can(ctx, "finance:confirm", o.centerId)) throw forbid("Chỉ kế toán");
  const lines = input.lines.map((l) => ({ ...l, name: l.name.trim(), unit: l.unit.trim() || "Lần", quantity: Math.round(l.quantity) || 1, amount: Math.round(l.amount), unitPrice: Math.round(l.amount / (Math.round(l.quantity) || 1)) }));
  const errs = validateCorrection({ kind: input.kind, originalStatus: o.status as InvoiceStatus, agreementNote: input.agreementNote, reason: input.reason, lines });
  if (errs.length) throw bad(errs);
  const open = await ctx.db.query.einvoices.findFirst({ where: and(eq(einvoices.originalId, o.id), inArray(einvoices.status, ["draft", "issuing", "failed"])) });
  if (open) throw pre("Đã có hoá đơn điều chỉnh / thay thế chưa phát hành cho hoá đơn này");
  if (input.refundId) {
    const rf = await ctx.db.query.refunds.findFirst({ where: eq(refunds.id, input.refundId) });
    if (!rf || rf.orderId !== o.orderId || rf.status !== "paid") throw bad("Khoản hoàn tiền không khớp hoá đơn");
  }
  const t = computeInvoiceTotals(lines);
  const s = await einvoiceSettings(ctx.db);
  const b = input.buyer ?? {};
  const buyer = input.kind === "replacement"
    ? { buyerName: b.name?.trim() || o.buyerName, buyerCompany: b.company?.trim() || o.buyerCompany, buyerTaxCode: b.taxCode?.trim() || o.buyerTaxCode, buyerAddress: b.address?.trim() || o.buyerAddress, buyerEmail: b.email?.trim() || o.buyerEmail }
    : { buyerName: o.buyerName, buyerCompany: o.buyerCompany, buyerTaxCode: o.buyerTaxCode, buyerAddress: o.buyerAddress, buyerEmail: o.buyerEmail };
  const bErr = validateBuyer({ name: buyer.buyerName, company: buyer.buyerCompany, taxCode: buyer.buyerTaxCode, address: buyer.buyerAddress, email: buyer.buyerEmail, phone: o.buyerPhone, noInvoiceRequested: o.noInvoiceRequested });
  if (bErr.length) throw bad(bErr);
  const [row] = await ctx.db.insert(einvoices).values({
    centerId: o.centerId, orderId: o.orderId, paymentId: o.paymentId, refundId: input.refundId ?? null, kind: input.kind, originalId: o.id, status: "draft",
    templateCode: s.templateCode, serial: s.serial, provider: s.provider, ...buyer, buyerPhone: o.buyerPhone, noInvoiceRequested: o.noInvoiceRequested,
    lines, subtotal: t.subtotal, vatAmount: t.vat, total: t.total, paymentMethod: o.paymentMethod, paidDate: o.paidDate,
    reason: input.reason.trim(), agreementNote: input.agreementNote.trim(), createdBy: ctx.user.id,
  }).returning({ id: einvoices.id });
  await ctx.db.insert(einvoiceEvents).values({ invoiceId: row!.id, action: "draft", note: `${INVOICE_KIND_VI[input.kind]} cho số ${o.number}: ${input.reason.trim()}`, userId: ctx.user.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "finance", entity: "einvoices", entityId: row!.id, after: { kind: input.kind, originalId: o.id, total: t.total }, reason: input.reason, ip: ctx.ip });
  return { id: row!.id };
}

/* ------------------------------------------------------------------ */
/* Xem, danh sách, đối soát                                             */
/* ------------------------------------------------------------------ */

export async function listInvoices(ctx: ProtectedContext, input: { status?: InvoiceStatus; q?: string; from?: string; to?: string; centerId?: string }) {
  if (!ctx.actor.assignments.some((a) => authorize({ ...ctx.actor, assignments: [a] }, "finance:read", { centerId: a.centerId }).allowed)) throw forbid("Không có quyền xem hoá đơn");
  const conds: SQL[] = [scope(ctx), tenantCond(ctx, einvoices)];
  if (input.status) conds.push(eq(einvoices.status, input.status));
  if (input.centerId) conds.push(eq(einvoices.centerId, input.centerId));
  if (input.from) conds.push(gte(einvoices.createdAt, new Date(`${input.from}T00:00:00+07:00`)));
  if (input.to) conds.push(lte(einvoices.createdAt, new Date(`${input.to}T23:59:59+07:00`)));
  if (input.q?.trim()) {
    const q = input.q.trim();
    conds.push(or(ilike(einvoices.buyerName, `%${q}%`), ilike(einvoices.buyerCompany, `%${q}%`), ilike(einvoices.lookupCode, `%${q}%`), sql`${einvoices.number}::text = ${q}`, sql`exists (select 1 from orders o where o.id = ${einvoices.orderId} and o.code ilike ${`%${q}%`})`)!);
  }
  const r = await ctx.db.select({ i: einvoices, centerCode: centers.code, orderCode: orders.code, receiptNo: payments.receiptNo })
    .from(einvoices).innerJoin(centers, eq(centers.id, einvoices.centerId)).leftJoin(orders, eq(orders.id, einvoices.orderId)).leftJoin(payments, eq(payments.id, einvoices.paymentId))
    .where(and(...conds)).orderBy(sql`case ${einvoices.status} when 'failed' then 0 when 'draft' then 1 when 'issuing' then 2 else 3 end`, desc(einvoices.createdAt)).limit(300);
  const today = todayISO();
  const [c] = await ctx.db.select({
    draft: sql<number>`count(*) filter (where ${einvoices.status} = 'draft')::int`,
    failed: sql<number>`count(*) filter (where ${einvoices.status} = 'failed')::int`,
    issued: sql<number>`count(*) filter (where ${einvoices.status} in ('issued','adjusted','replaced'))::int`,
    lateDrafts: sql<number>`count(*) filter (where ${einvoices.status} in ('draft','failed') and ${einvoices.kind} = 'original' and ${einvoices.paidDate} < ${today})::int`,
  }).from(einvoices).where(scope(ctx));
  const v = visibleCenterIds(ctx.actor);
  const missing = await ctx.db.select({ id: payments.id, receiptNo: payments.receiptNo, amount: payments.amount, paidAt: payments.paidAt, orderCode: orders.code, customer: orders.customerName, centerCode: centers.code })
    .from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).innerJoin(centers, eq(centers.id, payments.centerId))
    .where(and(eq(payments.status, "confirmed"), v === null ? sql`true` : v.length ? inArray(payments.centerId, v) : sql`false`,
      sql`not exists (select 1 from einvoices e where e.payment_id = ${payments.id} and e.kind = 'original' and e.status <> 'cancelled')`))
    .orderBy(desc(payments.paidAt)).limit(100);
  const refundsToAdjust = await ctx.db.select({ id: refunds.id, amount: refunds.amount, paidAt: refunds.paidAt, orderCode: orders.code, invoiceId: einvoices.id, invoiceNo: einvoices.number })
    .from(refunds).innerJoin(orders, eq(orders.id, refunds.orderId))
    .innerJoin(einvoices, and(eq(einvoices.orderId, refunds.orderId), eq(einvoices.kind, "original"), inArray(einvoices.status, ["issued", "adjusted"])))
    .where(and(eq(refunds.status, "paid"), v === null ? sql`true` : v.length ? inArray(refunds.centerId, v) : sql`false`,
      sql`not exists (select 1 from einvoices a where a.refund_id = ${refunds.id} and a.status <> 'cancelled')`)).limit(50);
  const s = await einvoiceSettings(ctx.db);
  return {
    settings: { enabled: s.enabled, provider: s.provider, serial: s.serial, templateCode: s.templateCode, autoIssue: s.autoIssue },
    counts: { ...c, missing: missing.length, refundsToAdjust: refundsToAdjust.length },
    canIssue: ctx.actor.assignments.some((a) => authorize({ ...ctx.actor, assignments: [a] }, "finance:confirm", { centerId: a.centerId }).allowed),
    items: r.map((x) => ({
      id: x.i.id, kind: x.i.kind, kindLabel: INVOICE_KIND_VI[x.i.kind as InvoiceKind], status: x.i.status, statusLabel: INVOICE_STATUS_VI[x.i.status as InvoiceStatus],
      number: x.i.number, serial: x.i.serial, templateCode: x.i.templateCode, issuedAt: x.i.issuedAt, total: x.i.total, vat: x.i.vatAmount, buyer: x.i.buyerCompany ?? x.i.buyerName ?? "Người mua không lấy hoá đơn",
      centerCode: x.centerCode, orderCode: x.orderCode, orderId: x.i.orderId, receiptNo: x.receiptNo, error: x.i.error, paidDate: x.i.paidDate, createdAt: x.i.createdAt,
      deadline: x.i.kind === "original" && x.i.paidDate ? issueDeadlineState(x.i.paidDate, !["draft", "failed", "issuing"].includes(x.i.status), today) : "ok",
    })),
    missing: missing.map((m) => ({ ...m, deadline: issueDeadlineState(m.paidAt, false, today) })),
    refundsToAdjust,
  };
}

export async function getInvoice(ctx: ProtectedContext, id: string) {
  const [x] = await ctx.db.select({ i: einvoices, center: centers, orderCode: orders.code, receiptNo: payments.receiptNo }).from(einvoices)
    .innerJoin(centers, eq(centers.id, einvoices.centerId)).leftJoin(orders, eq(orders.id, einvoices.orderId)).leftJoin(payments, eq(payments.id, einvoices.paymentId))
    .where(eq(einvoices.id, id)).limit(1);
  if (!x) throw notFound("Không tìm thấy hoá đơn");
  if (!can(ctx, "finance:read", x.i.centerId)) throw forbid("Không có quyền xem hoá đơn này");
  const ev = await ctx.db.select({ e: einvoiceEvents, by: users.fullName }).from(einvoiceEvents).leftJoin(users, eq(users.id, einvoiceEvents.userId))
    .where(eq(einvoiceEvents.invoiceId, id)).orderBy(asc(einvoiceEvents.createdAt));
  const related = await ctx.db.select({ id: einvoices.id, kind: einvoices.kind, status: einvoices.status, number: einvoices.number, total: einvoices.total, originalId: einvoices.originalId })
    .from(einvoices).where(or(eq(einvoices.originalId, x.i.originalId ?? x.i.id), eq(einvoices.id, x.i.originalId ?? x.i.id))!).orderBy(asc(einvoices.createdAt));
  const s = await einvoiceSettings(ctx.db);
  const lines = x.i.lines as InvoiceLine[];
  const t = computeInvoiceTotals(lines);
  const manage = can(ctx, "finance:confirm", x.i.centerId);
  const issued = ["issued", "adjusted"].includes(x.i.status);
  return {
    ...x.i, buyerPhone: x.i.buyerPhone ? maskPhone(normalizeVnPhone(x.i.buyerPhone) ?? x.i.buyerPhone) : null,
    statusLabel: INVOICE_STATUS_VI[x.i.status as InvoiceStatus], kindLabel: INVOICE_KIND_VI[x.i.kind as InvoiceKind],
    orderCode: x.orderCode, receiptNo: x.receiptNo, centerName: x.center.name, centerAddress: x.center.address,
    seller: { name: s.sellerName, taxCode: s.sellerTaxCode, address: s.sellerAddress }, sandbox: x.i.provider === "sandbox",
    byRate: Object.entries(t.byRate).map(([rate, v]) => ({ rate, label: TAX_RATE_VI[rate as TaxRate] ?? rate, ...v })), totalInWords: vndInWords(x.i.total),
    events: ev.map((e) => ({ ...e.e, by: e.by })), related: related.filter((r) => r.id !== x.i.id),
    can: {
      edit: manage && ["draft", "failed"].includes(x.i.status), issue: manage && ["draft", "failed"].includes(x.i.status), cancel: manage && ["draft", "failed"].includes(x.i.status),
      correct: manage && issued && x.i.kind !== "adjustment",
    },
  };
}

export async function invoiceReport(ctx: ProtectedContext, input: { year: number }) {
  if (!ctx.actor.assignments.some((a) => authorize({ ...ctx.actor, assignments: [a] }, "finance:read", { centerId: a.centerId }).allowed)) throw forbid("Không có quyền");
  const v = visibleCenterIds(ctx.actor);
  const pc = v === null ? sql`true` : v.length ? sql`p.center_id in (${sql.join(v.map((i) => sql`${i}::uuid`), sql`, `)})` : sql`false`;
  const ic = v === null ? sql`true` : v.length ? sql`e.center_id in (${sql.join(v.map((i) => sql`${i}::uuid`), sql`, `)})` : sql`false`;
  const rows = (await ctx.db.execute(sql`
    with m as (select generate_series(1, 12) as mo),
    pay as (select extract(month from p.paid_at)::int as mo, sum(p.amount)::bigint as collected, count(*)::int as n from payments p
            where p.status = 'confirmed' and extract(year from p.paid_at) = ${input.year} and ${pc} group by 1),
    inv as (select extract(month from (e.issued_at at time zone 'Asia/Ho_Chi_Minh'))::int as mo,
              sum(e.total) filter (where e.kind <> 'replacement')::bigint as invoiced_orig,
              sum(e.total) filter (where e.kind = 'replacement')::bigint as replaced_total,
              sum(e.vat_amount)::bigint as vat, count(*)::int as n
            from einvoices e where e.issued_at is not null and extract(year from (e.issued_at at time zone 'Asia/Ho_Chi_Minh')) = ${input.year} and ${ic} group by 1)
    select m.mo, coalesce(pay.collected, 0)::float as collected, coalesce(pay.n, 0) as payments,
      coalesce(inv.invoiced_orig, 0)::float as invoiced, coalesce(inv.vat, 0)::float as vat, coalesce(inv.n, 0) as invoices
    from m left join pay on pay.mo = m.mo left join inv on inv.mo = m.mo order by m.mo`)) as unknown as { mo: number; collected: number; payments: number; invoiced: number; vat: number; invoices: number }[];
  return { year: input.year, rows: rows.map((r) => ({ ...r, gap: r.collected - r.invoiced })) };
}

/** Tra cứu công khai theo mã tra cứu */
export async function publicInvoiceLookup(db: Database, code: string) {
  if (!/^[A-Z0-9-]{8,40}$/i.test(code)) return null;
  const d = asDb(db);
  const [x] = await d.select({ i: einvoices, center: centers.name }).from(einvoices).innerJoin(centers, eq(centers.id, einvoices.centerId))
    .where(and(eq(einvoices.lookupCode, code.toUpperCase()), sql`${einvoices.issuedAt} is not null`)).limit(1);
  if (!x) return null;
  const s = await einvoiceSettings(d);
  const lines = x.i.lines as InvoiceLine[];
  const t = computeInvoiceTotals(lines);
  const orig = x.i.originalId ? await d.query.einvoices.findFirst({ where: eq(einvoices.id, x.i.originalId) }) : null;
  const buyer = x.i.buyerCompany ?? x.i.buyerName ?? "Người mua không lấy hoá đơn";
  return {
    kindLabel: INVOICE_KIND_VI[x.i.kind as InvoiceKind], statusLabel: INVOICE_STATUS_VI[x.i.status as InvoiceStatus], status: x.i.status,
    templateCode: x.i.templateCode, serial: x.i.serial, number: x.i.number, issuedAt: x.i.issuedAt, sandbox: x.i.provider === "sandbox",
    seller: { name: s.sellerName, taxCode: s.sellerTaxCode, address: s.sellerAddress }, center: x.center,
    buyer: buyer.length > 4 ? `${buyer.slice(0, 2)}${"•".repeat(Math.max(3, buyer.length - 4))}${buyer.slice(-2)}` : buyer, buyerTaxCode: x.i.buyerTaxCode,
    lines, subtotal: x.i.subtotal, vat: x.i.vatAmount, total: x.i.total, totalInWords: vndInWords(x.i.total),
    byRate: Object.entries(t.byRate).map(([rate, v]) => ({ label: TAX_RATE_VI[rate as TaxRate] ?? rate, ...v })),
    original: orig ? { serial: orig.serial, number: orig.number, issuedAt: orig.issuedAt } : null, reason: x.i.reason,
  };
}

/** Hoá đơn của phụ huynh (cổng PH) */
export async function invoicesForParent(db: Db, parentId: string) {
  return db.select({ id: einvoices.id, kind: einvoices.kind, status: einvoices.status, number: einvoices.number, serial: einvoices.serial, templateCode: einvoices.templateCode, issuedAt: einvoices.issuedAt, total: einvoices.total, lookupCode: einvoices.lookupCode, orderCode: orders.code })
    .from(einvoices).innerJoin(orders, eq(orders.id, einvoices.orderId))
    .where(and(eq(orders.parentId, parentId), sql`${einvoices.issuedAt} is not null`)).orderBy(desc(einvoices.issuedAt)).limit(100);
}

