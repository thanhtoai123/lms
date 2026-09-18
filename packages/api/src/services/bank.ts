import { and, eq, inArray, sql, desc, asc, isNull, or, gte, lte, ilike, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  bankTransactions, bankTxAllocations, importBatches, paymentMethods, orders, orderItems, orderInstallments, orderEvents, payments, financeLedger, legacyRefs,
  centers, users, enrollments, classes, courses, students, studentGuardians, parents,
} from "@satarobo/db";
import {
  decideBankMatch, extractOrderRef, digitsOnly, parseStatementCsv, parseLegacyCsv, planAllocation, matchLegacyStudent, legacyLineStatus,
  normalizeLegacyPhone, packagePrice, formatVnd, allocateInstallments,
  type BankTx, type BankTxSource, type BankTxStatus, type LegacyRow, type LegacyTuitionRow, type LegacyLineStatus,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { todayISO } from "./sessions";
import { bad, pre, reasonOrThrow, can, notify, accountantsOf, managersOf, recomputeOrderStatus, nextOrderCode, orderCodeFormatOf, nextReceiptNo, childDebtsOf, markQrUsed, installmentState, OPEN_ORDER_STATUSES, type Db } from "./finance";

/** Ngày theo giờ Việt Nam */
const vnDate = (d: Date) => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);

async function bankMethodsFor(db: Db, accountNo: string) {
  return db.select().from(paymentMethods).where(and(
    eq(paymentMethods.kind, "bank_transfer"), eq(paymentMethods.isActive, true),
    sql`regexp_replace(coalesce(${paymentMethods.accountNo}, ''), '\\D', '', 'g') = ${digitsOnly(accountNo)}`,
  ));
}

async function orderSnapshot(db: Db, orderId: string) {
  const o = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!o) return null;
  const pays = await db.select({ id: payments.id, amount: payments.amount, status: payments.status, recordedBy: payments.recordedBy }).from(payments).where(eq(payments.orderId, orderId));
  return {
    o,
    confirmed: pays.filter((p) => p.status === "confirmed").reduce((s, p) => s + p.amount, 0),
    pending: pays.filter((p) => p.status === "recorded").map((p) => ({ id: p.id, amount: p.amount, recordedBy: p.recordedBy })),
  };
}

/* ------------------------------------------------------------------ */
/* Nhận giao dịch + đối khớp                                           */
/* ------------------------------------------------------------------ */

/** Lưu giao dịch (idempotent theo nguồn + mã ngoài) rồi đối khớp. Dùng cho webhook và nhập sao kê. */
export async function ingestBankTx(db: Db, t: BankTx, source: BankTxSource, raw: unknown, importBatchId: string | null = null, actorId: string | null = null) {
  const methods = await bankMethodsFor(db, t.accountNo);
  const centerIds = [...new Set(methods.map((m) => m.centerId))];
  const [row] = await db.insert(bankTransactions).values({
    source, externalId: t.externalId, gateway: t.gateway || null, accountNo: t.accountNo, paymentMethodId: methods[0]?.id ?? null,
    centerId: centerIds.length === 1 ? centerIds[0]! : null, occurredAt: new Date(t.occurredAt), amount: t.amount, direction: t.direction,
    content: t.content, referenceCode: t.referenceCode, accumulated: t.accumulated, status: "unmatched", importBatchId, raw: raw ?? null,
  }).onConflictDoNothing().returning({ id: bankTransactions.id });
  if (!row) {
    const ex = await db.query.bankTransactions.findFirst({ where: and(eq(bankTransactions.source, source), eq(bankTransactions.externalId, t.externalId)), columns: { id: true, status: true } });
    return { id: ex?.id ?? null, duplicate: true, status: ex?.status ?? null, note: "Giao dịch đã nhận trước đó" };
  }
  const r = await matchBankTx(db, row.id, actorId);
  return { id: row.id, duplicate: false, ...r };
}

/** Đối khớp tự động một giao dịch chưa khớp. actorId null = hệ thống. */
export async function matchBankTx(db: Db, id: string, actorId: string | null): Promise<{ status: BankTxStatus; note: string; orderCode?: string; receiptNo?: string }> {
  const bt = await db.query.bankTransactions.findFirst({ where: eq(bankTransactions.id, id) });
  if (!bt) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy giao dịch" });
  if (bt.status === "matched") return { status: "matched", note: bt.matchNote ?? "" };
  const ref = extractOrderRef(bt.content);
  const order = ref ? await db.query.orders.findFirst({ where: eq(orders.code, ref) }) : undefined;
  const methods = await bankMethodsFor(db, bt.accountNo);
  const method = order ? methods.find((m) => m.centerId === order.centerId) ?? methods.find((m) => m.centerId === null) : undefined;

  return db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    if (order) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"order:" + order.id}))`);
    const snap = order ? await orderSnapshot(tx, order.id) : null;
    const d = decideBankMatch({
      direction: bt.direction, amount: bt.amount, content: bt.content, accountKnown: methods.length > 0, accountOk: !!method,
      order: snap ? { code: snap.o.code, status: snap.o.status, total: snap.o.total, confirmed: snap.confirmed, pending: snap.pending } : null,
    });
    if (d.kind === "unmatched" || d.kind === "needs_review" || d.kind === "ignored") {
      await tx.update(bankTransactions).set({ status: d.kind, matchNote: d.note, orderId: snap?.o.id ?? null, centerId: snap?.o.centerId ?? bt.centerId, ...(actorId ? { handledBy: actorId, handledAt: new Date() } : {}) })
        .where(and(eq(bankTransactions.id, bt.id), sql`${bankTransactions.status} <> 'matched'`));
      if (d.kind === "needs_review" && bt.status !== "needs_review") {
        const cid = snap?.o.centerId ?? bt.centerId;
        if (cid) await notify(tx, await accountantsOf(tx, cid), "Biến động số dư cần kiểm tra", `${formatVnd(bt.amount)} — ${d.note}`, "/bien-dong-so-du?status=needs_review", 1, "bank.needs_review");
      }
      return { status: d.kind, note: d.note, orderCode: snap?.o.code };
    }
    const o = snap!.o;
    const center = await tx.query.centers.findFirst({ where: eq(centers.id, o.centerId), columns: { code: true } });
    const receiptNo = await nextReceiptNo(tx, center?.code ?? "HO", Number(todayISO().slice(0, 4)));
    let paymentId: string;
    let recorder: string | null = null;
    if (d.kind === "confirm_pending") {
      const up = await tx.update(payments).set({ status: "confirmed", decidedBy: actorId, decidedAt: new Date(), decisionReason: `Khớp biến động số dư ${bt.referenceCode ?? bt.externalId}`, receiptNo })
        .where(and(eq(payments.id, d.paymentId), eq(payments.status, "recorded"))).returning({ id: payments.id, recordedBy: payments.recordedBy });
      if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Khoản thu vừa được xử lý" });
      paymentId = up[0]!.id;
      recorder = up[0]!.recordedBy;
    } else {
      const [p] = await tx.insert(payments).values({
        orderId: o.id, centerId: o.centerId, recordedAmount: bt.amount, amount: bt.amount, paymentMethodId: method!.id, paidAt: vnDate(bt.occurredAt),
        status: "confirmed", source: bt.source === "sepay" ? "sepay" : "statement", externalRef: bt.externalId, note: bt.content.slice(0, 300),
        recordedBy: null, decidedBy: actorId, decidedAt: new Date(), decisionReason: d.note, receiptNo,
      }).returning({ id: payments.id });
      paymentId = p!.id;
    }
    await tx.insert(financeLedger).values({ orderId: o.id, centerId: o.centerId, entryType: "payment", amount: -bt.amount, refId: paymentId, note: `${receiptNo} · chuyển khoản ${bt.referenceCode ?? ""}`.trim(), actorId });
    await tx.insert(orderEvents).values({ orderId: o.id, event: "payment_confirmed", note: `${receiptNo} · ${formatVnd(bt.amount)} · ${d.note}`, actorId });
    const up = await tx.update(bankTransactions).set({ status: "matched", matchNote: d.note, orderId: o.id, paymentId, centerId: o.centerId, surplusAmount: 0, ...(actorId ? { handledBy: actorId, handledAt: new Date() } : {}) })
      .where(and(eq(bankTransactions.id, bt.id), sql`${bankTransactions.status} <> 'matched'`)).returning({ id: bankTransactions.id });
    if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Giao dịch vừa được xử lý" });
    await tx.insert(bankTxAllocations).values({ bankTxId: bt.id, paymentId, amount: bt.amount, createdBy: actorId }).onConflictDoNothing();
    // Mã QR đúng số tiền này coi như đã dùng — lần sau phải xuất mã mới
    await markQrUsed(tx, o.id, bt.amount, paymentId);
    await recomputeOrderStatus(tx, o.id, actorId, receiptNo);
    await notify(tx, [o.createdBy, recorder], "Tiền đã về tài khoản", `${o.code} · ${formatVnd(bt.amount)} · ${receiptNo}`, `/orders/${o.id}`, 3, "bank.received");
    await writeAudit(tx, { actorId, action: "TRANSITION", module: "finance", entity: "bank_transactions", entityId: bt.id, before: { status: bt.status }, after: { status: "matched", orderId: o.id, paymentId, receiptNo, mode: d.kind } });
    return { status: "matched" as const, note: d.note, orderCode: o.code, receiptNo };
  });
}

/* ------------------------------------------------------------------ */
/* Màn hình Biến động số dư                                            */
/* ------------------------------------------------------------------ */

function confirmCenters(ctx: ProtectedContext) {
  return ctx.actor.assignments.filter((a) => can(ctx, "finance:confirm", a.centerId)).map((a) => a.centerId);
}

function bankScope(ctx: ProtectedContext): SQL {
  const cc = confirmCenters(ctx);
  if (cc.includes(null)) return sql`true`;
  // Sao kê tài khoản công ty: chỉ kế toán (xác nhận) và quản lý (duyệt) xem, sale không xem
  const readable = ctx.actor.assignments.filter((a) => can(ctx, "finance:approve", a.centerId) || can(ctx, "finance:confirm", a.centerId)).map((a) => a.centerId!).filter(Boolean);
  const parts: SQL[] = [];
  if (readable.length) parts.push(inArray(bankTransactions.centerId, readable));
  if (cc.length) parts.push(isNull(bankTransactions.centerId));
  return parts.length ? or(...parts)! : sql`false`;
}

function canHandle(ctx: ProtectedContext, centerId: string | null) {
  const cc = confirmCenters(ctx);
  return cc.includes(null) || (centerId ? cc.includes(centerId) : cc.length > 0);
}

export async function listBankTx(ctx: ProtectedContext, input: { status?: BankTxStatus; q?: string; from?: string; to?: string; page?: number }) {
  requirePermission(ctx, "finance:read", { centerId: null });
  if (!ctx.actor.assignments.some((a) => can(ctx, "finance:approve", a.centerId) || can(ctx, "finance:confirm", a.centerId))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Biến động số dư chỉ dành cho kế toán / quản lý" });
  }
  const conds: SQL[] = [bankScope(ctx)];
  if (input.from) conds.push(gte(bankTransactions.occurredAt, new Date(`${input.from}T00:00:00+07:00`)));
  if (input.to) conds.push(lte(bankTransactions.occurredAt, new Date(`${input.to}T23:59:59+07:00`)));
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`;
    const digits = input.q.replace(/\D/g, "");
    conds.push(or(ilike(bankTransactions.content, q), ilike(bankTransactions.referenceCode, q), ...(digits.length >= 4 ? [sql`${bankTransactions.amount}::text = ${digits}`] : []))!);
  }
  const base = and(...conds);
  const page = input.page ?? 1;
  const pageSize = 50;
  const where = input.status ? and(base, eq(bankTransactions.status, input.status)) : base;
  const rows = await ctx.db.select({
    t: bankTransactions, orderCode: orders.code, customerName: orders.customerName, centerCode: centers.code, methodName: paymentMethods.name, receiptNo: payments.receiptNo,
    handlerName: sql<string | null>`(select full_name from ${users} u where u.id = ${bankTransactions.handledBy})`,
  }).from(bankTransactions).leftJoin(orders, eq(orders.id, bankTransactions.orderId)).leftJoin(centers, eq(centers.id, bankTransactions.centerId))
    .leftJoin(paymentMethods, eq(paymentMethods.id, bankTransactions.paymentMethodId)).leftJoin(payments, eq(payments.id, bankTransactions.paymentId))
    .where(where).orderBy(desc(bankTransactions.occurredAt)).limit(pageSize).offset((page - 1) * pageSize);
  const [agg] = await ctx.db.select({
    total: sql<number>`count(*) filter (where true)::int`,
    matched: sql<number>`count(*) filter (where ${bankTransactions.status} = 'matched')::int`,
    unmatched: sql<number>`count(*) filter (where ${bankTransactions.status} = 'unmatched')::int`,
    needs_review: sql<number>`count(*) filter (where ${bankTransactions.status} = 'needs_review')::int`,
    ignored: sql<number>`count(*) filter (where ${bankTransactions.status} = 'ignored')::int`,
    inSum: sql<number>`coalesce(sum(${bankTransactions.amount}) filter (where ${bankTransactions.direction} = 'in'), 0)::bigint`,
    matchedSum: sql<number>`coalesce(sum(${bankTransactions.amount}) filter (where ${bankTransactions.status} = 'matched'), 0)::bigint`,
    openSum: sql<number>`coalesce(sum(${bankTransactions.amount}) filter (where ${bankTransactions.status} in ('unmatched','needs_review')), 0)::bigint`,
    lastSepay: sql<string | null>`(max(${bankTransactions.receivedAt}) filter (where ${bankTransactions.source} = 'sepay'))::text`,
  }).from(bankTransactions).where(base);
  const [cnt] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(bankTransactions).where(where);
  const accounts = await ctx.db.select({ id: paymentMethods.id, code: paymentMethods.code, name: paymentMethods.name, bankName: paymentMethods.bankName, accountNo: paymentMethods.accountNo, centerId: paymentMethods.centerId, centerCode: centers.code })
    .from(paymentMethods).leftJoin(centers, eq(centers.id, paymentMethods.centerId))
    .where(and(eq(paymentMethods.kind, "bank_transfer"), eq(paymentMethods.isActive, true))).orderBy(asc(paymentMethods.sortOrder));
  return {
    page, pageSize, total: cnt?.n ?? 0,
    counts: { matched: agg?.matched ?? 0, unmatched: agg?.unmatched ?? 0, needs_review: agg?.needs_review ?? 0, ignored: agg?.ignored ?? 0 },
    sums: { in: Number(agg?.inSum ?? 0), matched: Number(agg?.matchedSum ?? 0), open: Number(agg?.openSum ?? 0) },
    webhook: { path: "/api/webhooks/sepay", configured: !!process.env.SEPAY_API_KEY, lastReceivedAt: agg?.lastSepay ?? null },
    accounts: accounts.filter((a) => canHandle(ctx, a.centerId) || can(ctx, "finance:read", a.centerId)),
    canImport: confirmCenters(ctx).length > 0,
    items: rows.map((x) => ({
      ...x.t, raw: undefined, orderCode: x.orderCode, customerName: x.customerName, centerCode: x.centerCode, methodName: x.methodName, receiptNo: x.receiptNo, handlerName: x.handlerName,
      orderRef: extractOrderRef(x.t.content),
      canHandle: (x.t.status === "unmatched" || x.t.status === "needs_review") && x.t.direction === "in" && canHandle(ctx, x.t.centerId),
      canUnlink: x.t.status === "matched" && canHandle(ctx, x.t.centerId),
    })),
  };
}

async function loadOpenTx(ctx: ProtectedContext, id: string) {
  const bt = await ctx.db.query.bankTransactions.findFirst({ where: eq(bankTransactions.id, id) });
  if (!bt) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy giao dịch" });
  if (!canHandle(ctx, bt.centerId)) throw new TRPCError({ code: "FORBIDDEN", message: "Không có quyền finance:confirm cho giao dịch này" });
  if (bt.status !== "unmatched" && bt.status !== "needs_review") throw pre(`Giao dịch đang "${bt.status === "matched" ? "Đã khớp" : "Bỏ qua"}" — không xử lý lại`);
  return bt;
}

/** Gợi ý đơn để khớp tay: đơn còn nợ ≥ số tiền, ưu tiên kỳ trả góp đúng số tiền */
export async function matchCandidates(ctx: ProtectedContext, input: { id: string; q?: string }) {
  const bt = await loadOpenTx(ctx, input.id);
  const cc = confirmCenters(ctx);
  const conds: SQL[] = [inArray(orders.status, ["pending_payment", "partially_paid"])];
  if (!cc.includes(null)) conds.push(inArray(orders.centerId, cc.filter((c): c is string => !!c)));
  if (bt.centerId) conds.push(eq(orders.centerId, bt.centerId));
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`;
    const digits = input.q.replace(/\D/g, "");
    conds.push(or(ilike(orders.code, q), ilike(orders.customerName, q), ilike(students.fullName, q), ...(digits.length >= 4 ? [ilike(orders.customerPhone, `%${digits}%`)] : []))!);
  }
  const rows = await ctx.db.select({
    id: orders.id, code: orders.code, total: orders.total, status: orders.status, customerName: orders.customerName, centerId: orders.centerId, centerCode: centers.code, studentName: students.fullName,
  }).from(orders).innerJoin(centers, eq(centers.id, orders.centerId)).leftJoin(students, eq(students.id, orders.studentId))
    .where(and(...conds)).orderBy(desc(orders.createdAt)).limit(200);
  const ids = rows.map((r) => r.id);
  // Cộng tiền ở JS: truy vấn con tương quan trong drizzle không phải lúc nào cũng khớp bảng ngoài
  const payRows = ids.length ? await ctx.db.select({ orderId: payments.orderId, status: payments.status, amount: payments.amount }).from(payments).where(inArray(payments.orderId, ids)) : [];
  const sumPay = (orderId: string, status: "confirmed" | "recorded") => payRows.filter((x) => x.orderId === orderId && x.status === status).reduce((n, x) => n + Number(x.amount), 0);
  const plans = ids.length ? await ctx.db.select().from(orderInstallments).where(inArray(orderInstallments.orderId, ids)) : [];
  const today = todayISO();
  const methods = await bankMethodsFor(ctx.db, bt.accountNo);
  const items = rows.map((r) => {
    const confirmed = sumPay(r.id, "confirmed");
    const outstanding = Math.max(0, r.total - confirmed);
    const alloc = allocateInstallments(plans.filter((p) => p.orderId === r.id).map((p) => ({ seq: p.seq, amount: p.amount, dueDate: p.dueDate })), confirmed, today);
    const next = alloc.find((a) => a.remaining > 0);
    const score = (next?.remaining === bt.amount ? 3 : 0) + (outstanding === bt.amount ? 2 : 0) + (sumPay(r.id, "recorded") === bt.amount ? 2 : 0);
    return { ...r, confirmed, pending: sumPay(r.id, "recorded"), outstanding, nextDue: next ?? null, score, accountOk: methods.some((m) => m.centerId === null || m.centerId === r.centerId) };
  }).filter((r) => r.outstanding >= bt.amount).sort((a, b) => b.score - a.score).slice(0, 20);
  return { tx: { ...bt, raw: undefined }, items };
}

export async function matchManually(ctx: ProtectedContext, input: { id: string; orderId: string; note?: string | null }) {
  const bt = await loadOpenTx(ctx, input.id);
  if (bt.direction !== "in") throw pre("Chỉ khớp giao dịch tiền vào");
  const note = bt.status === "needs_review" ? reasonOrThrow(input.note) : input.note?.trim() || null;
  const order = await ctx.db.query.orders.findFirst({ where: eq(orders.id, input.orderId) });
  if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy đơn" });
  requirePermission(ctx, "finance:confirm", { centerId: order.centerId });
  if (order.status === "cancelled" || order.status === "refunded") throw pre("Đơn đã đóng");
  const methods = await bankMethodsFor(ctx.db, bt.accountNo);
  const method = methods.find((m) => m.centerId === order.centerId) ?? methods.find((m) => m.centerId === null)
    ?? (await ctx.db.query.paymentMethods.findFirst({ where: and(eq(paymentMethods.kind, "bank_transfer"), eq(paymentMethods.isActive, true), or(isNull(paymentMethods.centerId), eq(paymentMethods.centerId, order.centerId))) }));
  if (!method) throw pre("Chưa có phương thức chuyển khoản nào cho cơ sở của đơn");
  const center = await ctx.db.query.centers.findFirst({ where: eq(centers.id, order.centerId), columns: { code: true } });
  return ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"order:" + order.id}))`);
    const snap = (await orderSnapshot(tx, order.id))!;
    const outstanding = Math.max(0, order.total - snap.confirmed);
    if (bt.amount > outstanding) throw pre(`Số tiền ${formatVnd(bt.amount)} vượt số còn phải thu ${formatVnd(outstanding)} của ${order.code}`);
    const receiptNo = await nextReceiptNo(tx, center?.code ?? "HO", Number(todayISO().slice(0, 4)));
    const same = snap.pending.find((p) => p.amount === bt.amount);
    const reason = `Khớp tay biến động số dư ${bt.referenceCode ?? bt.externalId}${note ? `: ${note}` : ""}`;
    let paymentId: string;
    if (same) {
      const up = await tx.update(payments).set({ status: "confirmed", decidedBy: ctx.user.id, decidedAt: new Date(), decisionReason: reason, receiptNo })
        .where(and(eq(payments.id, same.id), eq(payments.status, "recorded"))).returning({ id: payments.id });
      if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Khoản thu vừa được xử lý" });
      paymentId = same.id;
    } else {
      if (snap.pending.length && snap.pending.reduce((s, p) => s + p.amount, 0) + bt.amount > outstanding) throw pre("Đơn còn khoản sale ghi nhận chờ xác nhận — xử lý khoản đó trước để tránh thu trùng");
      const [p] = await tx.insert(payments).values({
        orderId: order.id, centerId: order.centerId, recordedAmount: bt.amount, amount: bt.amount, paymentMethodId: method.id, paidAt: vnDate(bt.occurredAt),
        status: "confirmed", source: bt.source === "sepay" ? "sepay" : "statement", externalRef: bt.externalId, note: bt.content.slice(0, 300),
        recordedBy: ctx.user.id, decidedBy: ctx.user.id, decidedAt: new Date(), decisionReason: reason, receiptNo,
      }).returning({ id: payments.id });
      paymentId = p!.id;
    }
    await tx.insert(financeLedger).values({ orderId: order.id, centerId: order.centerId, entryType: "payment", amount: -bt.amount, refId: paymentId, note: `${receiptNo} · khớp tay`, actorId: ctx.user.id });
    await tx.insert(orderEvents).values({ orderId: order.id, event: "payment_confirmed", note: `${receiptNo} · ${formatVnd(bt.amount)} · ${reason}`, actorId: ctx.user.id });
    const up = await tx.update(bankTransactions).set({ status: "matched", matchNote: reason, orderId: order.id, paymentId, centerId: order.centerId, surplusAmount: 0, handledBy: ctx.user.id, handledAt: new Date() })
      .where(and(eq(bankTransactions.id, bt.id), inArray(bankTransactions.status, ["unmatched", "needs_review"]))).returning({ id: bankTransactions.id });
    if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Giao dịch vừa được xử lý" });
    await tx.insert(bankTxAllocations).values({ bankTxId: bt.id, paymentId, amount: bt.amount, createdBy: ctx.user.id }).onConflictDoNothing();
    await recomputeOrderStatus(tx, order.id, ctx.user.id, receiptNo);
    await notify(tx, [order.createdBy], "Tiền đã về tài khoản", `${order.code} · ${formatVnd(bt.amount)} · ${receiptNo}`, `/orders/${order.id}`, 3, "bank.received");
    await writeAudit(tx, { actorId: ctx.user.id, action: "TRANSITION", module: "finance", entity: "bank_transactions", entityId: bt.id, before: { status: bt.status }, after: { status: "matched", orderId: order.id, paymentId, receiptNo, manual: true }, reason: note, ip: ctx.ip });
    return { receiptNo, orderCode: order.code };
  });
}

export async function ignoreBankTx(ctx: ProtectedContext, input: { id: string; reason: string }) {
  const bt = await loadOpenTx(ctx, input.id);
  const reason = reasonOrThrow(input.reason);
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    const up = await tx.update(bankTransactions).set({ status: "ignored", matchNote: reason, handledBy: ctx.user.id, handledAt: new Date() })
      .where(and(eq(bankTransactions.id, bt.id), eq(bankTransactions.status, bt.status))).returning({ id: bankTransactions.id });
    if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Giao dịch vừa được xử lý" });
    await writeAudit(tx, { actorId: ctx.user.id, action: "TRANSITION", module: "finance", entity: "bank_transactions", entityId: bt.id, before: { status: bt.status }, after: { status: "ignored" }, reason, ip: ctx.ip });
  });
  return { ok: true };
}

export async function rematchBankTx(ctx: ProtectedContext, input: { id: string }) {
  const bt = await loadOpenTx(ctx, input.id);
  return matchBankTx(ctx.db, bt.id, ctx.user.id);
}

/* ------------------------------------------------------------------ */
/* Rót một giao dịch cho nhiều con + gỡ gắn + tiền thừa                */
/* ------------------------------------------------------------------ */

/** Bảng “X đ cho từng con” của một đơn: còn thiếu theo dòng + đợt đang mở */
export async function allocationPreview(ctx: ProtectedContext, input: { id: string; orderId: string }) {
  const bt = await loadOpenTx(ctx, input.id);
  const order = await ctx.db.query.orders.findFirst({ where: eq(orders.id, input.orderId) });
  if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy đơn" });
  requirePermission(ctx, "finance:confirm", { centerId: order.centerId });
  const debts = await childDebtsOf(ctx.db, order.id);
  const [c] = await ctx.db.select({ n: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint` }).from(payments).where(and(eq(payments.orderId, order.id), eq(payments.status, "confirmed")));
  const confirmed = Number(c?.n ?? 0);
  const plan = await ctx.db.select().from(orderInstallments).where(and(eq(orderInstallments.orderId, order.id), isNull(orderInstallments.cancelledAt))).orderBy(asc(orderInstallments.seq));
  const alloc = allocateInstallments(plan.map((p) => ({ seq: p.seq, amount: p.amount, dueDate: p.dueDate, kind: p.kind })), confirmed, todayISO());
  const outstandingTotal = Math.max(0, order.total - confirmed);
  return {
    tx: { ...bt, raw: undefined },
    order: { id: order.id, code: order.code, total: order.total, status: order.status, customerName: order.customerName, centerId: order.centerId, confirmed, outstanding: outstandingTotal },
    lines: debts.items,
    unassigned: debts.unassigned,
    installments: alloc.map((a) => ({ ...a, id: plan.find((p) => p.seq === a.seq)?.id ?? null, orderItemId: plan.find((p) => p.seq === a.seq)?.orderItemId ?? null })),
    /** Rót đủ / đang thừa / còn thiếu so với số tiền về */
    fit: bt.amount === outstandingTotal ? "exact" : bt.amount > outstandingTotal ? "surplus" : "short",
  };
}

/**
 * Ghi phân bổ: tạo N khoản thu ĐÃ xác nhận theo từng dòng đơn (từng con), phần dư ghi vào
 * `surplus_amount` — hệ thống không tự hoàn và không tự trừ sang đơn khác.
 */
export async function allocateBankTx(ctx: ProtectedContext, input: { id: string; orderId: string; allocations: { orderItemId: string; amount: number }[]; note?: string | null }) {
  const bt = await loadOpenTx(ctx, input.id);
  if (bt.direction !== "in") throw pre("Chỉ rót giao dịch tiền vào");
  const order = await ctx.db.query.orders.findFirst({ where: eq(orders.id, input.orderId) });
  if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy đơn" });
  requirePermission(ctx, "finance:confirm", { centerId: order.centerId });
  if (order.status === "cancelled" || order.status === "refunded") throw pre("Đơn đã đóng");
  const note = bt.status === "needs_review" ? reasonOrThrow(input.note) : input.note?.trim() || null;
  const methods = await bankMethodsFor(ctx.db, bt.accountNo);
  const method = methods.find((m) => m.centerId === order.centerId) ?? methods.find((m) => m.centerId === null)
    ?? (await ctx.db.query.paymentMethods.findFirst({ where: and(eq(paymentMethods.kind, "bank_transfer"), eq(paymentMethods.isActive, true), or(isNull(paymentMethods.centerId), eq(paymentMethods.centerId, order.centerId))) }));
  if (!method) throw pre("Chưa có phương thức chuyển khoản nào cho cơ sở của đơn");
  const center = await ctx.db.query.centers.findFirst({ where: eq(centers.id, order.centerId), columns: { code: true } });
  return ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"order:" + order.id}))`);
    const debts = await childDebtsOf(tx, order.id);
    const plan = planAllocation(
      bt.amount,
      debts.items.map((i) => ({ orderItemId: i.orderItemId, outstanding: i.outstanding, label: i.studentName ?? i.description })),
      input.allocations.map((a) => ({ orderItemId: a.orderItemId, amount: Math.round(a.amount) })),
    );
    if (plan.errors.length) throw pre(plan.errors);
    if (!plan.allocations.length) throw bad("Chưa nhập số tiền rót cho con nào");
    const [c] = await tx.select({ n: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint` }).from(payments).where(and(eq(payments.orderId, order.id), eq(payments.status, "confirmed")));
    if (Number(c?.n ?? 0) + plan.allocated > order.total) throw pre(`Rót ${formatVnd(plan.allocated)} sẽ vượt tổng đơn ${formatVnd(order.total)}`);
    const yr = Number(todayISO().slice(0, 4));
    const created: { paymentId: string; receiptNo: string; amount: number; orderItemId: string }[] = [];
    for (const a of plan.allocations) {
      const line = debts.items.find((i) => i.orderItemId === a.orderItemId)!;
      const receiptNo = await nextReceiptNo(tx, center?.code ?? "HO", yr);
      const [p] = await tx.insert(payments).values({
        orderId: order.id, centerId: order.centerId, recordedAmount: a.amount, amount: a.amount, paymentMethodId: method.id, paidAt: vnDate(bt.occurredAt),
        status: "confirmed", source: bt.source === "sepay" ? "sepay" : "statement", externalRef: `${bt.externalId}:${a.orderItemId}`, note: bt.content.slice(0, 300),
        enrollmentId: line.enrollmentId, orderItemId: a.orderItemId, recordedBy: ctx.user.id,
        decidedBy: ctx.user.id, decidedAt: new Date(), decisionReason: `Rót biến động số dư ${bt.referenceCode ?? bt.externalId}${note ? `: ${note}` : ""}`, receiptNo,
      }).returning({ id: payments.id });
      await tx.insert(bankTxAllocations).values({ bankTxId: bt.id, paymentId: p!.id, orderItemId: a.orderItemId, amount: a.amount, createdBy: ctx.user.id });
      await tx.insert(financeLedger).values({ orderId: order.id, centerId: order.centerId, entryType: "payment", amount: -a.amount, refId: p!.id, note: `${receiptNo} · ${line.studentName ?? line.description}`, actorId: ctx.user.id });
      await tx.insert(orderEvents).values({ orderId: order.id, event: "payment_confirmed", note: `${receiptNo} · ${formatVnd(a.amount)} · ${line.studentName ?? line.description}`, actorId: ctx.user.id });
      created.push({ paymentId: p!.id, receiptNo, amount: a.amount, orderItemId: a.orderItemId });
    }
    const up = await tx.update(bankTransactions).set({
      status: "matched", matchNote: `Rót cho ${created.length} dòng${plan.surplus ? ` · thừa ${formatVnd(plan.surplus)}` : ""}${note ? `: ${note}` : ""}`,
      orderId: order.id, paymentId: created[0]!.paymentId, centerId: order.centerId, surplusAmount: plan.surplus, handledBy: ctx.user.id, handledAt: new Date(),
    }).where(and(eq(bankTransactions.id, bt.id), inArray(bankTransactions.status, ["unmatched", "needs_review"]))).returning({ id: bankTransactions.id });
    if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Giao dịch vừa được xử lý" });
    await recomputeOrderStatus(tx, order.id, ctx.user.id, created.map((x) => x.receiptNo).join(", "));
    if (plan.surplus > 0) {
      await notify(tx, await accountantsOf(tx, order.centerId), "Tiền thừa chưa xử lý", `${order.code} · thừa ${formatVnd(plan.surplus)} — kế toán quyết cách xử lý`, "/bien-dong-so-du?status=matched", 1, "bank.surplus");
    }
    await notify(tx, [order.createdBy], "Tiền đã về tài khoản", `${order.code} · ${formatVnd(plan.allocated)} cho ${created.length} dòng`, `/orders/${order.id}`, 3, "bank.received");
    await writeAudit(tx, { actorId: ctx.user.id, action: "TRANSITION", module: "finance", entity: "bank_transactions", entityId: bt.id, before: { status: bt.status }, after: { status: "matched", orderId: order.id, allocations: created, surplus: plan.surplus }, reason: note, ip: ctx.ip });
    return { orderCode: order.code, allocated: plan.allocated, surplus: plan.surplus, receipts: created.map((x) => x.receiptNo) };
  });
}

/**
 * Gỡ gắn giao dịch đã khớp: khoản do giao dịch tạo → `voided` + đảo bút toán;
 * khoản do sale ghi nhận rồi được xác nhận qua khớp → trả về `recorded` (huỷ số phiếu);
 * giao dịch quay lại "Cần xử lý".
 */
export async function unlinkBankTx(ctx: ProtectedContext, input: { id: string; reason: string }) {
  const bt = await ctx.db.query.bankTransactions.findFirst({ where: eq(bankTransactions.id, input.id) });
  if (!bt) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy giao dịch" });
  if (!canHandle(ctx, bt.centerId)) throw new TRPCError({ code: "FORBIDDEN", message: "Không có quyền finance:confirm cho giao dịch này" });
  if (bt.status !== "matched") throw pre("Chỉ gỡ được giao dịch đã khớp");
  const reason = reasonOrThrow(input.reason);
  const orderId = bt.orderId;
  return ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    if (orderId) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"order:" + orderId}))`);
    const allocs = await tx.select().from(bankTxAllocations).where(eq(bankTxAllocations.bankTxId, bt.id));
    const payIds = [...new Set([...allocs.map((a) => a.paymentId), ...(bt.paymentId ? [bt.paymentId] : [])])];
    const pays = payIds.length ? await tx.select().from(payments).where(inArray(payments.id, payIds)) : [];
    let voided = 0;
    let reverted = 0;
    for (const p of pays) {
      if (p.status !== "confirmed") continue;
      const fromBank = p.source === "sepay" || p.source === "statement";
      if (fromBank) {
        await tx.update(payments).set({ status: "voided", voidedAt: new Date(), voidReason: reason, receiptNo: null, version: p.version + 1 }).where(eq(payments.id, p.id));
        voided++;
      } else {
        await tx.update(payments).set({ status: "recorded", decidedBy: null, decidedAt: null, decisionReason: `Gỡ gắn giao dịch: ${reason}`, receiptNo: null, version: p.version + 1 }).where(eq(payments.id, p.id));
        reverted++;
      }
      await tx.insert(financeLedger).values({ orderId: p.orderId, centerId: p.centerId, entryType: "adjustment", amount: p.amount, refId: p.id, note: `Gỡ gắn ${bt.referenceCode ?? bt.externalId} — đảo ${formatVnd(p.amount)}: ${reason}`, actorId: ctx.user.id });
      await tx.insert(orderEvents).values({ orderId: p.orderId, event: "payment_unlinked", note: `${formatVnd(p.amount)} — ${fromBank ? "huỷ khoản do giao dịch tạo" : "trả về chờ kế toán"}: ${reason}`, actorId: ctx.user.id });
    }
    await tx.delete(bankTxAllocations).where(eq(bankTxAllocations.bankTxId, bt.id));
    await tx.update(bankTransactions).set({ status: "unmatched", matchNote: `Đã gỡ gắn: ${reason}`, orderId: null, paymentId: null, surplusAmount: 0, handledBy: ctx.user.id, handledAt: new Date() }).where(eq(bankTransactions.id, bt.id));
    if (orderId) {
      const before = await tx.query.orders.findFirst({ where: eq(orders.id, orderId) });
      await recomputeOrderStatus(tx, orderId, ctx.user.id, `Gỡ gắn giao dịch: ${reason}`, { accrue: false });
      const after = await tx.query.orders.findFirst({ where: eq(orders.id, orderId) });
      // Đơn tụt khỏi "đủ tiền" → thu hồi hoa hồng tạm tính
      if (before?.status === "paid" && after && after.status !== "paid") {
        const { cancelAccruedForOrder } = await import("./commissions");
        await cancelAccruedForOrder(tx, orderId, ctx.user.id, `Gỡ gắn giao dịch: ${reason}`).catch(() => undefined);
      }
      if (after) await notify(tx, await managersOf(tx, after.centerId), "Đã gỡ gắn giao dịch", `${after.code} · ${formatVnd(bt.amount)} — ${reason}`, `/orders/${after.id}`, 1, "bank.unlinked");
    }
    await writeAudit(tx, { actorId: ctx.user.id, action: "TRANSITION", module: "finance", entity: "bank_transactions", entityId: bt.id, before: { status: "matched", orderId }, after: { status: "unmatched", voided, reverted }, reason, ip: ctx.ip });
    return { ok: true, voided, reverted };
  });
}

/** Khối “Tiền thừa chưa xử lý” — chỉ xem, kế toán quyết rồi ghi nhận ở nơi xử lý tương ứng */
export async function surplusList(ctx: ProtectedContext) {
  requirePermission(ctx, "finance:read", { centerId: null });
  const rows = await ctx.db.select({
    id: bankTransactions.id, amount: bankTransactions.amount, surplusAmount: bankTransactions.surplusAmount, occurredAt: bankTransactions.occurredAt,
    content: bankTransactions.content, referenceCode: bankTransactions.referenceCode, matchNote: bankTransactions.matchNote,
    orderId: bankTransactions.orderId, orderCode: orders.code, customerName: orders.customerName, centerCode: centers.code,
  }).from(bankTransactions).leftJoin(orders, eq(orders.id, bankTransactions.orderId)).leftJoin(centers, eq(centers.id, bankTransactions.centerId))
    .where(and(bankScope(ctx), sql`${bankTransactions.surplusAmount} > 0`)).orderBy(desc(bankTransactions.occurredAt)).limit(200);
  return {
    total: rows.reduce((s, r) => s + r.surplusAmount, 0),
    items: rows.map((r) => ({ ...r, canCreateInstallment: !!r.orderId && can(ctx, "finance:confirm", null) })),
  };
}

/**
 * Tạo một đợt trả góp mới trên đơn bằng đúng số tiền thừa rồi rót phần dư vào đợt đó.
 * Giữ nguyên nguyên tắc gốc: không tự hoàn, không tự trừ sang đơn khác — tiền thừa chỉ ở lại
 * chính đơn đã nhận, và chỉ khi kế toán bấm.
 */
export async function createInstallmentForSurplus(ctx: ProtectedContext, input: { id: string; dueDate?: string | null; orderItemId?: string | null; note?: string | null }) {
  const bt = await ctx.db.query.bankTransactions.findFirst({ where: eq(bankTransactions.id, input.id) });
  if (!bt) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy giao dịch" });
  if (bt.surplusAmount <= 0) throw pre("Giao dịch này không còn tiền thừa");
  if (!bt.orderId) throw pre("Giao dịch chưa gắn đơn — gắn vào đơn trước");
  const order = await ctx.db.query.orders.findFirst({ where: eq(orders.id, bt.orderId) });
  if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy đơn" });
  requirePermission(ctx, "finance:confirm", { centerId: order.centerId });
  if (order.status === "cancelled" || order.status === "refunded") throw pre("Đơn đã đóng — không tạo đợt mới");
  const surplus = bt.surplusAmount;
  const today = todayISO();
  const dueDate = input.dueDate ?? vnDate(bt.occurredAt);
  const methods = await bankMethodsFor(ctx.db, bt.accountNo);
  const method = methods.find((m) => m.centerId === order.centerId) ?? methods.find((m) => m.centerId === null)
    ?? (await ctx.db.query.paymentMethods.findFirst({ where: and(eq(paymentMethods.kind, "bank_transfer"), eq(paymentMethods.isActive, true), or(isNull(paymentMethods.centerId), eq(paymentMethods.centerId, order.centerId))) }));
  if (!method) throw pre("Chưa có phương thức chuyển khoản nào cho cơ sở của đơn");
  const center = await ctx.db.query.centers.findFirst({ where: eq(centers.id, order.centerId), columns: { code: true } });

  return ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"order:" + order.id}))`);
    const fresh = await tx.query.bankTransactions.findFirst({ where: eq(bankTransactions.id, bt.id) });
    if (!fresh || fresh.surplusAmount !== surplus) throw new TRPCError({ code: "CONFLICT", message: "Tiền thừa vừa được xử lý — tải lại trang" });
    // Đợt mới nối tiếp số thứ tự đang có, mang đúng số tiền thừa
    const [mx] = await tx.select({ n: sql<number>`coalesce(max(${orderInstallments.seq}), 0)::int` }).from(orderInstallments).where(eq(orderInstallments.orderId, order.id));
    const seq = (mx?.n ?? 0) + 1;
    const [inst] = await tx.insert(orderInstallments).values({
      orderId: order.id, seq, amount: surplus, dueDate, kind: "installment",
      orderItemId: input.orderItemId ?? null, createdBy: ctx.user.id,
    }).returning({ id: orderInstallments.id });
    // Tổng đơn tăng đúng bằng phần dư: đợt mới phải có chỗ trong tổng phải thu
    const newTotal = order.total + surplus;
    await tx.update(orders).set({ total: newTotal }).where(eq(orders.id, order.id));
    await tx.insert(financeLedger).values({ orderId: order.id, centerId: order.centerId, entryType: "charge", amount: surplus, refId: inst!.id, note: `Đợt ${seq} cho phần dư ${formatVnd(surplus)}`, actorId: ctx.user.id });

    const receiptNo = await nextReceiptNo(tx, center?.code ?? "HO", Number(today.slice(0, 4)));
    const [p] = await tx.insert(payments).values({
      orderId: order.id, centerId: order.centerId, recordedAmount: surplus, amount: surplus, paymentMethodId: method.id, paidAt: vnDate(bt.occurredAt),
      status: "confirmed", source: bt.source === "sepay" ? "sepay" : "statement", externalRef: `${bt.externalId}:surplus`, note: bt.content.slice(0, 300),
      orderItemId: input.orderItemId ?? null, recordedBy: ctx.user.id, decidedBy: ctx.user.id, decidedAt: new Date(),
      decisionReason: `Tạo đợt cho phần dư ${formatVnd(surplus)}${input.note ? `: ${input.note.trim()}` : ""}`, receiptNo,
    }).returning({ id: payments.id });
    await tx.insert(bankTxAllocations).values({ bankTxId: bt.id, paymentId: p!.id, orderItemId: input.orderItemId ?? null, amount: surplus, createdBy: ctx.user.id }).onConflictDoNothing();
    await tx.insert(financeLedger).values({ orderId: order.id, centerId: order.centerId, entryType: "payment", amount: -surplus, refId: p!.id, note: `${receiptNo} · phần dư vào đợt ${seq}`, actorId: ctx.user.id });
    await tx.insert(orderEvents).values({ orderId: order.id, event: "installment_added", note: `Đợt ${seq} cho phần dư ${formatVnd(surplus)} · ${receiptNo}`, actorId: ctx.user.id });
    await tx.update(bankTransactions).set({
      surplusAmount: 0, matchNote: `${fresh.matchNote ?? ""} · phần dư ${formatVnd(surplus)} đã tạo đợt ${seq}`.trim().slice(0, 500),
      handledBy: ctx.user.id, handledAt: new Date(),
    }).where(and(eq(bankTransactions.id, bt.id), eq(bankTransactions.surplusAmount, surplus)));
    await recomputeOrderStatus(tx, order.id, ctx.user.id, receiptNo);
    await notify(tx, [order.createdBy], "Phần dư đã vào đợt mới", `${order.code} · đợt ${seq} · ${formatVnd(surplus)}`, `/orders/${order.id}`, 2);
    await writeAudit(tx, {
      actorId: ctx.user.id, action: "CREATE", module: "finance", entity: "order_installments", entityId: inst!.id,
      before: { orderTotal: order.total, surplus }, after: { orderTotal: newTotal, seq, amount: surplus, dueDate, paymentId: p!.id, receiptNo },
      reason: input.note ?? "Tạo đợt cho phần dư", ip: ctx.ip,
    });
    return { orderCode: order.code, seq, amount: surplus, receiptNo, orderTotal: newTotal };
  });
}

/** Các dòng đơn (con) để chọn khi tạo đợt cho phần dư */
export async function surplusTargets(ctx: ProtectedContext, input: { id: string }) {
  const bt = await ctx.db.query.bankTransactions.findFirst({ where: eq(bankTransactions.id, input.id) });
  if (!bt?.orderId) throw pre("Giao dịch chưa gắn đơn");
  const order = await ctx.db.query.orders.findFirst({ where: eq(orders.id, bt.orderId) });
  if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy đơn" });
  requirePermission(ctx, "finance:read", { centerId: order.centerId });
  const debts = await childDebtsOf(ctx.db, order.id);
  const [c] = await ctx.db.select({ n: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint` }).from(payments).where(and(eq(payments.orderId, order.id), eq(payments.status, "confirmed")));
  const plan = await installmentState(ctx.db, order.id, Number(c?.n ?? 0), todayISO());
  return {
    surplus: bt.surplusAmount,
    order: { id: order.id, code: order.code, total: order.total, customerName: order.customerName },
    lines: debts.items.map((i) => ({ orderItemId: i.orderItemId, label: i.studentName ?? i.description, outstanding: i.outstanding })),
    installments: plan.map((p) => ({ id: p.id, seq: p.seq, amount: p.amount, dueDate: p.dueDate, remaining: p.remaining })),
    today: todayISO(),
  };
}

/* ------------------------------------------------------------------ */
/* Nhập sao kê                                                         */
/* ------------------------------------------------------------------ */

async function statementMethod(ctx: ProtectedContext, paymentMethodId: string) {
  const m = await ctx.db.query.paymentMethods.findFirst({ where: eq(paymentMethods.id, paymentMethodId) });
  if (!m || m.kind !== "bank_transfer" || !m.accountNo) throw bad("Chọn tài khoản ngân hàng đã khai báo số tài khoản");
  if (!canHandle(ctx, m.centerId)) throw new TRPCError({ code: "FORBIDDEN", message: "Không có quyền nhập sao kê cho tài khoản này" });
  return m;
}

export async function previewStatement(ctx: ProtectedContext, input: { csv: string; paymentMethodId: string }) {
  const m = await statementMethod(ctx, input.paymentMethodId);
  const r = parseStatementCsv(input.csv, digitsOnly(m.accountNo), m.bankName ?? m.name);
  if (r.headerErrors.length) return { headerErrors: r.headerErrors, rows: [], errors: [], summary: null };
  const ext = r.txs.map((t) => t.externalId);
  const dup = ext.length ? await ctx.db.select({ e: bankTransactions.externalId }).from(bankTransactions).where(and(inArray(bankTransactions.source, ["statement", "sepay"]), inArray(bankTransactions.externalId, ext))) : [];
  const refs = [...new Set(r.txs.map((t) => extractOrderRef(t.content)).filter((x): x is string => !!x))];
  const os = refs.length ? await ctx.db.select({ code: orders.code, status: orders.status }).from(orders).where(inArray(orders.code, refs)) : [];
  const rows = r.txs.map((t) => {
    const ref = extractOrderRef(t.content);
    const o = ref ? os.find((x) => x.code === ref) : undefined;
    return { ...t, duplicate: dup.some((d) => d.e === t.externalId), orderRef: ref, orderFound: !!o, orderStatus: o?.status ?? null };
  });
  return {
    headerErrors: [], errors: r.errors, rows: rows.slice(0, 300),
    summary: { rows: rows.length, amount: rows.reduce((s, x) => s + x.amount, 0), duplicates: rows.filter((x) => x.duplicate).length, withOrder: rows.filter((x) => x.orderFound).length, skippedOut: r.skippedOut, errorRows: r.errors.length },
  };
}

export async function importStatement(ctx: ProtectedContext, input: { csv: string; paymentMethodId: string; fileName?: string | null; note: string }) {
  const m = await statementMethod(ctx, input.paymentMethodId);
  const note = reasonOrThrow(input.note);
  const r = parseStatementCsv(input.csv, digitsOnly(m.accountNo), m.bankName ?? m.name);
  if (r.headerErrors.length) throw bad(r.headerErrors);
  if (!r.txs.length) throw bad("Không có giao dịch tiền vào hợp lệ");
  const existing = await ctx.db.select({ e: bankTransactions.externalId }).from(bankTransactions).where(and(eq(bankTransactions.source, "statement"), inArray(bankTransactions.externalId, r.txs.map((t) => t.externalId))));
  if (existing.length >= new Set(r.txs.map((t) => t.externalId)).size) throw pre("Tất cả giao dịch trong file đã được nhập trước đó");
  const [batch] = await ctx.db.insert(importBatches).values({ kind: "bank_statement", fileName: input.fileName?.slice(0, 200) || null, note, totalRows: r.txs.length + r.errors.length + r.skippedOut, createdBy: ctx.user.id }).returning({ id: importBatches.id });
  const res = { imported: 0, duplicates: 0, matched: 0, needs_review: 0, unmatched: 0, ignored: 0, amount: 0 };
  for (const t of r.txs) {
    const x = await ingestBankTx(ctx.db, t, "statement", { line: "csv" }, batch!.id, ctx.user.id);
    if (x.duplicate) {
      res.duplicates++;
      continue;
    }
    res.imported++;
    res.amount += t.amount;
    if (x.status) res[x.status]++;
  }
  await ctx.db.update(importBatches).set({ okRows: res.imported, skippedRows: res.duplicates + r.errors.length + r.skippedOut, totalAmount: res.amount, summary: { ...res, errors: r.errors.slice(0, 50), skippedOut: r.skippedOut, account: m.code } }).where(eq(importBatches.id, batch!.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "finance", entity: "import_batches", entityId: batch!.id, after: { kind: "bank_statement", ...res }, reason: note, ip: ctx.ip });
  return { batchId: batch!.id, ...res, errors: r.errors, skippedOut: r.skippedOut };
}

/* ------------------------------------------------------------------ */
/* Nhập giao dịch cũ                                                   */
/* ------------------------------------------------------------------ */

type Resolved = {
  line: number;
  status: "ok" | "error" | "duplicate";
  errors: string[];
  row: LegacyRow | null;
  centerId: string | null;
  centerCode: string | null;
  orderId: string | null;
  orderCode: string | null;
  newOrder: { enrollmentId: string; studentId: string; parentId: string | null; customerName: string; customerPhone: string; courseId: string; courseCode: string; total: number; packageSessions: number } | null;
  studentName: string | null;
  methodId: string | null;
  methodName: string | null;
};

async function resolveLegacy(ctx: ProtectedContext, csv: string) {
  const today = todayISO();
  const parsed = parseLegacyCsv(csv, today);
  if (parsed.headerErrors.length) return { headerErrors: parsed.headerErrors, rows: [] as Resolved[] };
  const ok = parsed.rows.filter((r) => r.row).map((r) => r.row!);
  const codes = [...new Set(ok.map((r) => r.orderCode).filter((x): x is string => !!x))];
  const orderRows = codes.length ? await ctx.db.select({ id: orders.id, code: orders.code, centerId: orders.centerId, total: orders.total, status: orders.status, studentName: students.fullName })
    .from(orders).leftJoin(students, eq(students.id, orders.studentId)).where(inArray(orders.code, codes)) : [];
  const pairs = ok.filter((r) => !r.orderCode);
  const stuCodes = [...new Set(pairs.map((r) => r.studentCode!))];
  const enrRows = stuCodes.length ? await ctx.db.select({
    enrollmentId: enrollments.id, studentId: students.id, studentCode: students.code, studentName: students.fullName, classCode: classes.code, centerId: classes.centerId,
    packageSessions: enrollments.packageSessions, courseId: courses.id, courseCode: courses.code, listPrice: courses.listPrice, totalSessions: courses.totalSessions, createdAt: enrollments.createdAt,
  }).from(enrollments).innerJoin(students, eq(students.id, enrollments.studentId)).innerJoin(classes, eq(classes.id, enrollments.classId)).innerJoin(courses, eq(courses.id, classes.courseId))
    .where(inArray(students.code, stuCodes)).orderBy(desc(enrollments.createdAt)) : [];
  const enrIds = enrRows.map((e) => e.enrollmentId);
  const openOrders = enrIds.length ? await ctx.db.select({ id: orders.id, code: orders.code, enrollmentId: orders.enrollmentId, total: orders.total, status: orders.status })
    .from(orders).where(and(inArray(orders.enrollmentId, enrIds), inArray(orders.status, ["pending_payment", "partially_paid", "paid"]))) : [];
  const guardians = enrRows.length ? await ctx.db.select({ studentId: studentGuardians.studentId, parentId: parents.id, name: parents.fullName, phone: parents.phone, isPrimary: studentGuardians.isPrimary })
    .from(studentGuardians).innerJoin(parents, eq(parents.id, studentGuardians.parentId)).where(inArray(studentGuardians.studentId, enrRows.map((e) => e.studentId))) : [];
  const methods = await ctx.db.select({ id: paymentMethods.id, code: paymentMethods.code, name: paymentMethods.name, centerId: paymentMethods.centerId }).from(paymentMethods);
  const receipts = ok.map((r) => r.legacyReceipt.toUpperCase());
  const dups = receipts.length ? await ctx.db.select({ e: payments.externalRef }).from(payments).where(and(eq(payments.source, "legacy"), inArray(payments.externalRef, receipts))) : [];
  const orderIds = [...new Set([...orderRows.map((o) => o.id), ...openOrders.map((o) => o.id)])];
  const paid = orderIds.length ? await ctx.db.select({ orderId: payments.orderId, n: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint` }).from(payments)
    .where(and(inArray(payments.orderId, orderIds), inArray(payments.status, ["confirmed", "recorded"]))).groupBy(payments.orderId) : [];
  const used = new Map<string, number>(paid.map((p) => [p.orderId, Number(p.n)]));
  const newTotals = new Map<string, { total: number; used: number }>();

  const rows: Resolved[] = parsed.rows.map((pr) => {
    const res: Resolved = { line: pr.line, status: "error", errors: [...pr.errors], row: pr.row, centerId: null, centerCode: null, orderId: null, orderCode: null, newOrder: null, studentName: null, methodId: null, methodName: null };
    const r = pr.row;
    if (!r) return res;
    let total = 0;
    let key = "";
    if (r.orderCode) {
      const o = orderRows.find((x) => x.code === r.orderCode);
      if (!o) res.errors.push(`Không tìm thấy đơn ${r.orderCode}`);
      else if (o.status === "cancelled" || o.status === "refunded") res.errors.push(`Đơn ${o.code} đã đóng`);
      else Object.assign(res, { centerId: o.centerId, orderId: o.id, orderCode: o.code, studentName: o.studentName }), (total = o.total), (key = o.id);
    } else {
      const e = enrRows.find((x) => x.studentCode === r.studentCode && x.classCode === r.classCode);
      if (!e) res.errors.push(`Không tìm thấy ghi danh ${r.studentCode} ở lớp ${r.classCode}`);
      else {
        res.centerId = e.centerId;
        res.studentName = e.studentName;
        const oo = openOrders.find((x) => x.enrollmentId === e.enrollmentId);
        if (oo) Object.assign(res, { orderId: oo.id, orderCode: oo.code }), (total = oo.total), (key = oo.id);
        else {
          const g = guardians.filter((x) => x.studentId === e.studentId).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))[0];
          const t = r.orderTotal ?? packagePrice(Number(e.listPrice), e.totalSessions, e.packageSessions);
          if (!g?.phone) res.errors.push("Học viên chưa có phụ huynh / SĐT để lập đơn");
          else {
            key = `new:${e.enrollmentId}`;
            const prev = newTotals.get(key);
            if (prev && r.orderTotal && prev.total !== r.orderTotal) res.errors.push(`Tổng đơn khác dòng trước (${formatVnd(prev.total)})`);
            total = prev?.total ?? t;
            if (!prev) newTotals.set(key, { total, used: 0 });
            res.newOrder = { enrollmentId: e.enrollmentId, studentId: e.studentId, parentId: g.parentId, customerName: g.name, customerPhone: g.phone, courseId: e.courseId, courseCode: e.courseCode, total, packageSessions: e.packageSessions };
            res.orderCode = "(tạo mới)";
          }
        }
      }
    }
    if (res.centerId) {
      res.centerCode = null;
      if (!can(ctx, "finance:confirm", res.centerId)) res.errors.push("Không có quyền xác nhận thu ở cơ sở này");
      const mm = methods.find((m) => (m.code.toUpperCase() === r.method.toUpperCase() || m.name.toLowerCase() === r.method.toLowerCase()) && (m.centerId === null || m.centerId === res.centerId));
      if (!mm) res.errors.push(`Phương thức "${r.method}" không có ở cơ sở này`);
      else Object.assign(res, { methodId: mm.id, methodName: mm.name });
    }
    if (key && !res.errors.length) {
      const already = key.startsWith("new:") ? newTotals.get(key)!.used : used.get(key) ?? 0;
      if (already + r.amount > total) res.errors.push(`Vượt tổng đơn: đã có ${formatVnd(already)}/${formatVnd(total)}`);
      else if (key.startsWith("new:")) newTotals.get(key)!.used += r.amount;
      else used.set(key, already + r.amount);
    }
    if (dups.some((d) => d.e === r.legacyReceipt.toUpperCase())) {
      res.status = "duplicate";
      res.errors = ["Số phiếu cũ đã nhập trước đó"];
      return res;
    }
    res.status = res.errors.length ? "error" : "ok";
    return res;
  });
  const cmap = await ctx.db.select({ id: centers.id, code: centers.code }).from(centers);
  for (const r of rows) r.centerCode = cmap.find((c) => c.id === r.centerId)?.code ?? null;
  return { headerErrors: [] as string[], rows };
}

function assertCanImport(ctx: ProtectedContext) {
  if (!confirmCenters(ctx).length) throw new TRPCError({ code: "FORBIDDEN", message: "Chỉ kế toán được nhập giao dịch cũ" });
}

export async function previewLegacy(ctx: ProtectedContext, input: { csv: string }) {
  assertCanImport(ctx);
  const r = await resolveLegacy(ctx, input.csv);
  const okRows = r.rows.filter((x) => x.status === "ok");
  return {
    headerErrors: r.headerErrors,
    rows: r.rows.slice(0, 500).map((x) => ({ ...x, newOrder: x.newOrder ? { courseCode: x.newOrder.courseCode, total: x.newOrder.total, customerName: x.newOrder.customerName } : null })),
    summary: {
      rows: r.rows.length, ok: okRows.length, errors: r.rows.filter((x) => x.status === "error").length, duplicates: r.rows.filter((x) => x.status === "duplicate").length,
      amount: okRows.reduce((s, x) => s + x.row!.amount, 0), newOrders: new Set(okRows.filter((x) => x.newOrder).map((x) => x.newOrder!.enrollmentId)).size,
    },
  };
}

export async function importLegacy(ctx: ProtectedContext, input: { csv: string; note: string; fileName?: string | null }) {
  assertCanImport(ctx);
  const note = reasonOrThrow(input.note);
  const r = await resolveLegacy(ctx, input.csv);
  if (r.headerErrors.length) throw bad(r.headerErrors);
  const okRows = r.rows.filter((x) => x.status === "ok");
  if (!okRows.length) throw pre("Không có dòng hợp lệ để nhập");
  return ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    const [batch] = await tx.insert(importBatches).values({ kind: "legacy_payments", fileName: input.fileName?.slice(0, 200) || null, note, totalRows: r.rows.length, createdBy: ctx.user.id }).returning({ id: importBatches.id });
    const created = new Map<string, { id: string; code: string }>();
    const touched = new Set<string>();
    let amount = 0;
    for (const x of okRows) {
      const row = x.row!;
      let orderId = x.orderId;
      if (!orderId && x.newOrder) {
        const no = x.newOrder;
        let c = created.get(no.enrollmentId);
        if (!c) {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"enroll-order:" + no.enrollmentId}))`);
          const again = await tx.select({ id: orders.id }).from(orders).where(and(eq(orders.enrollmentId, no.enrollmentId), inArray(orders.status, ["pending_payment", "partially_paid", "paid"]))).limit(1);
          if (again[0]) throw new TRPCError({ code: "CONFLICT", message: `Dòng ${x.line}: ghi danh vừa có đơn — xem trước lại` });
          const code = await nextOrderCode(tx, todayISO(), await orderCodeFormatOf(tx, x.centerId ?? null));
          const [o] = await tx.insert(orders).values({
            code, type: "course", status: "pending_payment", centerId: x.centerId!, parentId: no.parentId, studentId: no.studentId, enrollmentId: no.enrollmentId,
            customerName: no.customerName, customerPhone: no.customerPhone.replace(/\D/g, ""), subtotal: no.total, discountAmount: 0, total: no.total,
            paymentMethodId: x.methodId, internalNote: `Nhập từ hệ cũ — ${note}`, createdBy: ctx.user.id,
          }).returning({ id: orders.id });
          await tx.insert(orderItems).values({ orderId: o!.id, courseId: no.courseId, description: `Học phí ${no.courseCode} — gói ${no.packageSessions} buổi (hệ cũ)`, quantity: 1, unitPrice: no.total, amount: no.total, netAmount: no.total, packageSessions: no.packageSessions, studentId: no.studentId, enrollmentId: no.enrollmentId });
          await tx.insert(orderInstallments).values({ orderId: o!.id, seq: 1, amount: no.total, dueDate: row.paidAt });
          await tx.insert(orderEvents).values({ orderId: o!.id, event: "create", toStatus: "pending_payment", note: "Nhập từ hệ cũ", actorId: ctx.user.id });
          await tx.insert(financeLedger).values({ orderId: o!.id, centerId: x.centerId!, entryType: "charge", amount: no.total, refId: o!.id, note: `Tạo đơn ${code} (hệ cũ)`, actorId: ctx.user.id });
          c = { id: o!.id, code };
          created.set(no.enrollmentId, c);
        }
        orderId = c.id;
      }
      const [p] = await tx.insert(payments).values({
        orderId: orderId!, centerId: x.centerId!, recordedAmount: row.amount, amount: row.amount, paymentMethodId: x.methodId, paidAt: row.paidAt, status: "confirmed",
        source: "legacy", externalRef: row.legacyReceipt.toUpperCase(), payerName: row.payer, note: [`Phiếu cũ ${row.legacyReceipt}`, row.note].filter(Boolean).join(" · "),
        recordedBy: ctx.user.id, decidedBy: ctx.user.id, decidedAt: new Date(), decisionReason: `Nhập giao dịch cũ: ${note}`,
      }).returning({ id: payments.id });
      await tx.insert(financeLedger).values({ orderId: orderId!, centerId: x.centerId!, entryType: "payment", amount: -row.amount, refId: p!.id, note: `Hệ cũ ${row.legacyReceipt}`, actorId: ctx.user.id });
      await tx.insert(orderEvents).values({ orderId: orderId!, event: "payment_imported", note: `${formatVnd(row.amount)} · phiếu cũ ${row.legacyReceipt} · ${row.paidAt}`, actorId: ctx.user.id });
      touched.add(orderId!);
      amount += row.amount;
    }
    for (const id of touched) await recomputeOrderStatus(tx, id, ctx.user.id, "Nhập giao dịch cũ", { accrue: false });
    const summary = { payments: okRows.length, newOrders: created.size, orders: touched.size, errors: r.rows.filter((x) => x.status === "error").length, duplicates: r.rows.filter((x) => x.status === "duplicate").length };
    await tx.update(importBatches).set({ okRows: okRows.length, skippedRows: r.rows.length - okRows.length, totalAmount: amount, summary }).where(eq(importBatches.id, batch!.id));
    await writeAudit(tx, { actorId: ctx.user.id, action: "CREATE", module: "finance", entity: "import_batches", entityId: batch!.id, after: { kind: "legacy_payments", amount, ...summary }, reason: note, ip: ctx.ip });
    return { batchId: batch!.id, amount, ...summary };
  });
}

/* ------------------------------------------------------------------ */
/* Nhập giao dịch cũ theo SĐT phụ huynh + họ tên (bản gốc)             */
/* ------------------------------------------------------------------ */

export interface LegacyCandidateOut {
  enrollmentId: string; studentId: string; studentName: string; studentCode: string | null;
  classCode: string; courseCode: string; centerId: string; centerCode: string; packageSessions: number; parentName: string | null;
}
export interface LegacyResolvedLine {
  line: number;
  status: LegacyLineStatus | "error";
  errors: string[];
  row: LegacyTuitionRow | null;
  candidates: LegacyCandidateOut[];
  enrollmentId: string | null;
  studentName: string | null;
  centerId: string | null;
  centerCode: string | null;
  orderId: string | null;
  orderCode: string | null;
  /** Đã có bao nhiêu tiền trong hệ mới cho ghi danh này (chống cộng đôi) */
  existingPaid: number;
  /** Học phí dự kiến khi phải lập đơn mới */
  expectedTotal: number;
}

const last9 = (p: string | null) => (p ? p.replace(/\D/g, "").slice(-9) : "");

/** Dòng do trình duyệt gửi lên — các cột tuỳ chọn có thể vắng mặt */
export type LegacyTuitionInput = Pick<LegacyTuitionRow, "line" | "name" | "amount" | "paidAt"> &
  Partial<Pick<LegacyTuitionRow, "sheet" | "studentCode" | "phone" | "courseText" | "centerCode" | "orderCode" | "note">>;

const fullRow = (r: LegacyTuitionInput): LegacyTuitionRow => ({
  line: r.line, name: r.name, amount: Math.round(r.amount), paidAt: r.paidAt,
  sheet: r.sheet ?? null, studentCode: r.studentCode ?? null, phone: r.phone ? normalizeLegacyPhone(r.phone) : null,
  courseText: r.courseText ?? null, centerCode: r.centerCode ?? null,
  orderCode: r.orderCode ? (extractOrderRef(r.orderCode.toUpperCase()) ?? r.orderCode.toUpperCase()) : null,
  note: r.note ?? null,
});

async function resolveLegacyTuition(ctx: ProtectedContext, rows: readonly LegacyTuitionRow[], opts: { choices?: Record<string, string>; force?: number[] } = {}) {
  const choices = opts.choices ?? {};
  const force = new Set(opts.force ?? []);
  const phones = [...new Set(rows.map((r) => last9(r.phone)).filter(Boolean))];
  const codes = [...new Set(rows.map((r) => r.studentCode).filter((x): x is string => !!x))];
  const orderCodes = [...new Set(rows.map((r) => r.orderCode).filter((x): x is string => !!x))];

  const orderRows = orderCodes.length
    ? await ctx.db.select({ id: orders.id, code: orders.code, centerId: orders.centerId, total: orders.total, status: orders.status, enrollmentId: orders.enrollmentId, studentName: students.fullName })
        .from(orders).leftJoin(students, eq(students.id, orders.studentId)).where(inArray(orders.code, orderCodes))
    : [];
  // Mã hệ cũ → hồ sơ hệ mới (legacy_refs) và mã học viên hệ mới
  const refRows = codes.length ? await ctx.db.select({ legacyCode: legacyRefs.legacyCode, entityId: legacyRefs.entityId, kind: legacyRefs.kind }).from(legacyRefs).where(and(eq(legacyRefs.kind, "student"), inArray(legacyRefs.legacyCode, codes))) : [];
  const codeStudents = codes.length ? await ctx.db.select({ id: students.id, code: students.code }).from(students).where(inArray(students.code, codes)) : [];

  // Ứng viên: mọi ghi danh của học viên có phụ huynh trùng SĐT (9 số cuối) hoặc trùng mã hệ cũ
  const idPool = [...new Set([...refRows.map((r) => r.entityId), ...codeStudents.map((s) => s.id)])];
  const cands = (phones.length || idPool.length)
    ? await ctx.db.select({
        enrollmentId: enrollments.id, studentId: students.id, studentName: students.fullName, studentCode: students.code,
        classCode: classes.code, courseCode: courses.code, centerId: classes.centerId, centerCode: centers.code,
        packageSessions: enrollments.packageSessions, listPrice: courses.listPrice, courseSessions: courses.totalSessions,
        parentName: parents.fullName, parentPhone: parents.phone,
      }).from(enrollments)
        .innerJoin(students, eq(students.id, enrollments.studentId))
        .innerJoin(classes, eq(classes.id, enrollments.classId))
        .innerJoin(courses, eq(courses.id, classes.courseId))
        .innerJoin(centers, eq(centers.id, classes.centerId))
        .leftJoin(studentGuardians, eq(studentGuardians.studentId, students.id))
        .leftJoin(parents, eq(parents.id, studentGuardians.parentId))
        .where(and(
          inArray(enrollments.status, ["trial", "active", "paused", "completed"]),
          or(
            phones.length ? inArray(sql<string>`right(regexp_replace(coalesce(${parents.phone}, ''), '\\D', '', 'g'), 9)`, phones) : sql`false`,
            idPool.length ? inArray(students.id, idPool) : sql`false`,
          )!,
        )).limit(4000)
    : [];
  // Gộp nhiều phụ huynh của cùng một ghi danh
  const byEnrollment = new Map<string, LegacyCandidateOut & { phones: string[]; listPrice: number; courseSessions: number }>();
  for (const c of cands) {
    const prev = byEnrollment.get(c.enrollmentId);
    const phone = normalizeLegacyPhone(c.parentPhone);
    if (prev) {
      if (phone && !prev.phones.includes(phone)) prev.phones.push(phone);
      continue;
    }
    byEnrollment.set(c.enrollmentId, {
      enrollmentId: c.enrollmentId, studentId: c.studentId, studentName: c.studentName, studentCode: c.studentCode,
      classCode: c.classCode, courseCode: c.courseCode, centerId: c.centerId, centerCode: c.centerCode,
      packageSessions: c.packageSessions, parentName: c.parentName,
      phones: phone ? [phone] : [], listPrice: Number(c.listPrice), courseSessions: c.courseSessions,
    });
  }
  const all = [...byEnrollment.values()];
  const enrIds = all.map((c) => c.enrollmentId);
  const lines = enrIds.length
    ? await ctx.db.select({ enrollmentId: orderItems.enrollmentId, itemId: orderItems.id, orderId: orders.id, orderCode: orders.code, net: orderItems.netAmount, centerId: orders.centerId })
        .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(and(inArray(orderItems.enrollmentId, enrIds), inArray(orders.status, [...OPEN_ORDER_STATUSES])))
    : [];
  const orderIdsAll = [...new Set([...lines.map((l) => l.orderId), ...orderRows.map((o) => o.id)])];
  const paidRows = orderIdsAll.length
    ? await ctx.db.select({ orderId: payments.orderId, n: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint` }).from(payments)
        .where(and(inArray(payments.orderId, orderIdsAll), inArray(payments.status, ["confirmed", "recorded"]))).groupBy(payments.orderId)
    : [];
  const paidOf = (orderId: string | null) => (orderId ? Number(paidRows.find((p) => p.orderId === orderId)?.n ?? 0) : 0);

  const out: LegacyResolvedLine[] = rows.map((row) => {
    const base: LegacyResolvedLine = {
      line: row.line, status: "not_found", errors: [], row, candidates: [], enrollmentId: null, studentName: row.name,
      centerId: null, centerCode: null, orderId: null, orderCode: null, existingPaid: 0, expectedTotal: 0,
    };
    // 1) mã đơn
    if (row.orderCode) {
      const o = orderRows.find((x) => x.code === row.orderCode);
      if (o) {
        if (o.status === "cancelled" || o.status === "refunded") return { ...base, status: "error", errors: [`Đơn ${o.code} đã đóng`] };
        const paid = paidOf(o.id);
        return {
          ...base, orderId: o.id, orderCode: o.code, centerId: o.centerId, enrollmentId: o.enrollmentId,
          studentName: o.studentName ?? row.name, existingPaid: paid, expectedTotal: o.total,
          status: legacyLineStatus({ matched: "one", existingPaid: paid, amount: row.amount, forced: force.has(row.line) }),
        };
      }
    }
    // 2) mã hệ cũ (legacy_refs) → 3) SĐT phụ huynh + họ tên
    const refStudentId = row.studentCode
      ? refRows.find((r) => r.legacyCode === row.studentCode)?.entityId ?? codeStudents.find((s) => s.code === row.studentCode)?.id ?? null
      : null;
    const pool = refStudentId ? all.filter((c) => c.studentId === refStudentId) : all;
    const m = matchLegacyStudent({ name: row.name, phone: row.phone }, pool.map((c) => ({ id: c.enrollmentId, fullName: c.studentName, parentPhones: c.phones })));
    const chosen = choices[String(row.line)] ?? null;
    const ids = chosen && m.ids.includes(chosen) ? [chosen] : m.ids;
    const kind = chosen && m.ids.includes(chosen) ? ("one" as const) : m.kind;
    const candidates = pool.filter((c) => m.ids.includes(c.enrollmentId)).map(({ phones: _p, listPrice: _l, courseSessions: _c, ...rest }) => rest);
    if (kind === "none") return { ...base, candidates, status: "not_found", errors: ["Không tìm thấy hồ sơ theo SĐT + họ tên (hệ thống không tự tạo hồ sơ)"] };
    if (kind === "many") return { ...base, candidates, status: "needs_choice" };
    const c = pool.find((x) => x.enrollmentId === ids[0])!;
    const line = lines.find((l) => l.enrollmentId === c.enrollmentId) ?? null;
    const paid = paidOf(line?.orderId ?? null);
    const errors: string[] = [];
    if (!can(ctx, "finance:confirm", c.centerId)) errors.push("Không có quyền ghi khoản ở cơ sở này");
    return {
      ...base, candidates, enrollmentId: c.enrollmentId, studentName: c.studentName, centerId: c.centerId, centerCode: c.centerCode,
      orderId: line?.orderId ?? null, orderCode: line?.orderCode ?? null, existingPaid: paid,
      expectedTotal: line?.net ?? packagePrice(c.listPrice, c.courseSessions, c.packageSessions),
      errors,
      status: errors.length ? "error" : legacyLineStatus({ matched: "one", existingPaid: paid, amount: row.amount, forced: force.has(row.line) }),
    };
  });
  return out;
}

export async function previewLegacyTuition(ctx: ProtectedContext, input: { rows: LegacyTuitionInput[]; choices?: Record<string, string>; force?: number[] }) {
  assertCanImport(ctx);
  if (input.rows.length > 3000) throw bad("Tối đa 3000 dòng mỗi lần");
  const lines = await resolveLegacyTuition(ctx, input.rows.map(fullRow), { choices: input.choices, force: input.force });
  const count = (s: LegacyResolvedLine["status"]) => lines.filter((l) => l.status === s).length;
  const will = lines.filter((l) => l.status === "will_write");
  return {
    lines,
    summary: {
      rows: lines.length, will_write: count("will_write"), already_paid: count("already_paid"), needs_choice: count("needs_choice"),
      not_found: count("not_found"), errors: count("error"),
      amount: will.reduce((s, l) => s + (l.row?.amount ?? 0), 0),
      newOrders: new Set(will.filter((l) => !l.orderId && l.enrollmentId).map((l) => l.enrollmentId!)).size,
      students: new Set(will.map((l) => l.enrollmentId ?? `o:${l.orderId}`)).size,
    },
  };
}

/**
 * Ghi vào hệ mới: mỗi em một đơn, mỗi đợt một khoản giữ đúng ngày đóng, khoản ở trạng thái
 * CHỜ KẾ TOÁN (`source = "backfill"`). Bắt buộc gán sale phụ trách cho đơn lập mới.
 */
export async function importLegacyTuition(ctx: ProtectedContext, input: {
  rows: LegacyTuitionInput[]; choices?: Record<string, string>; force?: number[]; saleUserId: string; note: string; fileName?: string | null;
}) {
  assertCanImport(ctx);
  const note = reasonOrThrow(input.note);
  const sale = await ctx.db.query.users.findFirst({ where: eq(users.id, input.saleUserId), columns: { id: true, fullName: true, isActive: true } });
  if (!sale || !sale.isActive) throw bad("Chưa gán sale phụ trách hợp lệ cho lượt nhập");
  const lines = await resolveLegacyTuition(ctx, input.rows.map(fullRow), { choices: input.choices, force: input.force });
  const ok = lines.filter((l) => l.status === "will_write" && l.row);
  if (!ok.length) throw pre("Không có dòng nào sẽ ghi");
  const today = todayISO();
  return ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    const [batch] = await tx.insert(importBatches).values({
      kind: "legacy_payments", fileName: input.fileName?.slice(0, 200) || null, note, totalRows: lines.length, createdBy: ctx.user.id,
    }).returning({ id: importBatches.id });
    const orderByEnrollment = new Map<string, { id: string; code: string; total: number; itemId: string | null; centerId: string }>();
    let amount = 0;
    let newOrders = 0;
    const touched = new Set<string>();
    const touchedCenters = new Set<string>();
    for (const l of ok) {
      const row = l.row!;
      let target = l.enrollmentId ? orderByEnrollment.get(l.enrollmentId) : undefined;
      if (!target && l.orderId) {
        const o = (await tx.select({ id: orders.id, code: orders.code, total: orders.total, centerId: orders.centerId }).from(orders).where(eq(orders.id, l.orderId)))[0]!;
        const it = l.enrollmentId ? (await tx.select({ id: orderItems.id }).from(orderItems).where(and(eq(orderItems.orderId, o.id), eq(orderItems.enrollmentId, l.enrollmentId))))[0] : undefined;
        target = { ...o, itemId: it?.id ?? null };
      }
      if (!target) {
        if (!l.enrollmentId || !l.centerId) throw pre(`Dòng ${l.line}: thiếu ghi danh để lập đơn`);
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"enroll-order:" + l.enrollmentId}))`);
        const [e] = await tx.select({
          studentId: enrollments.studentId, packageSessions: enrollments.packageSessions, courseId: courses.id, courseCode: courses.code,
          listPrice: courses.listPrice, courseSessions: courses.totalSessions, studentName: students.fullName,
        }).from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).innerJoin(courses, eq(courses.id, classes.courseId))
          .innerJoin(students, eq(students.id, enrollments.studentId)).where(eq(enrollments.id, l.enrollmentId)).limit(1);
        if (!e) throw pre(`Dòng ${l.line}: không tìm thấy ghi danh`);
        const [g] = await tx.select({ id: parents.id, fullName: parents.fullName, phone: parents.phone, email: parents.email })
          .from(studentGuardians).innerJoin(parents, eq(parents.id, studentGuardians.parentId))
          .where(eq(studentGuardians.studentId, e.studentId)).orderBy(desc(studentGuardians.isPrimary)).limit(1);
        if (!g?.phone) throw pre(`Dòng ${l.line}: học viên chưa có phụ huynh / SĐT để lập đơn`);
        const total = l.expectedTotal || packagePrice(Number(e.listPrice), e.courseSessions, e.packageSessions);
        const code = await nextOrderCode(tx, today, await orderCodeFormatOf(tx, l.centerId));
        const methodId = await pickLegacyMethod(tx, l.centerId);
        const [o] = await tx.insert(orders).values({
          code, type: "course", status: "pending_payment", centerId: l.centerId, parentId: g.id, studentId: e.studentId, enrollmentId: l.enrollmentId,
          customerName: g.fullName, customerPhone: g.phone.replace(/\D/g, ""), customerEmail: g.email,
          subtotal: total, discountAmount: 0, total, paymentMethodId: methodId,
          internalNote: `Nhập giao dịch cũ — ${note}${row.sheet ? ` · ${row.sheet}` : ""}`.slice(0, 1000), createdBy: sale.id,
        }).returning({ id: orders.id });
        const [it] = await tx.insert(orderItems).values({
          orderId: o!.id, courseId: e.courseId, description: `Học phí ${e.courseCode} — gói ${e.packageSessions} buổi (${e.studentName})`,
          quantity: 1, unitPrice: total, amount: total, discountAmount: 0, netAmount: total,
          packageSessions: e.packageSessions, studentId: e.studentId, enrollmentId: l.enrollmentId,
        }).returning({ id: orderItems.id });
        await tx.insert(orderInstallments).values({ orderId: o!.id, seq: 1, amount: total, dueDate: row.paidAt, kind: "installment", studentId: e.studentId, orderItemId: it!.id, createdBy: ctx.user.id });
        await tx.insert(orderEvents).values({ orderId: o!.id, event: "create", toStatus: "pending_payment", note: `Nhập giao dịch cũ · sale ${sale.fullName}`, actorId: ctx.user.id });
        await tx.insert(financeLedger).values({ orderId: o!.id, centerId: l.centerId, entryType: "charge", amount: total, refId: o!.id, note: `Tạo đơn ${code} (hệ cũ)`, actorId: ctx.user.id });
        target = { id: o!.id, code, total, itemId: it!.id, centerId: l.centerId };
        newOrders++;
      }
      if (l.enrollmentId) orderByEnrollment.set(l.enrollmentId, target);
      const methodId = await pickLegacyMethod(tx, target.centerId);
      await tx.insert(payments).values({
        orderId: target.id, centerId: target.centerId, recordedAmount: row.amount, amount: row.amount, paymentMethodId: methodId, paidAt: row.paidAt,
        status: "recorded", source: "backfill", payerName: null, enrollmentId: l.enrollmentId, orderItemId: target.itemId,
        note: [`Nhập giao dịch cũ`, row.sheet, row.note].filter(Boolean).join(" · ").slice(0, 300), recordedBy: ctx.user.id,
      });
      await tx.insert(orderEvents).values({ orderId: target.id, event: "payment_recorded", note: `${formatVnd(row.amount)} · ngày ${row.paidAt} (nhập giao dịch cũ — chờ kế toán)`, actorId: ctx.user.id });
      touched.add(target.id);
      touchedCenters.add(target.centerId);
      amount += row.amount;
    }
    const summary = {
      payments: ok.length, newOrders, orders: touched.size,
      already_paid: lines.filter((l) => l.status === "already_paid").length,
      needs_choice: lines.filter((l) => l.status === "needs_choice").length,
      not_found: lines.filter((l) => l.status === "not_found").length,
      errors: lines.filter((l) => l.status === "error").length,
      saleUserId: sale.id,
    };
    await tx.update(importBatches).set({ okRows: ok.length, skippedRows: lines.length - ok.length, totalAmount: amount, summary }).where(eq(importBatches.id, batch!.id));
    for (const cid of touchedCenters) {
      await notify(tx, await accountantsOf(tx, cid), "Học phí nhập từ file chờ xác nhận", `${ok.length} khoản · ${formatVnd(amount)} — xem thử rồi xác nhận cả lượt`, "/payments?status=recorded", 2, "payment.pending");
    }
    await writeAudit(tx, { actorId: ctx.user.id, action: "CREATE", module: "finance", entity: "import_batches", entityId: batch!.id, after: { kind: "legacy_payments", amount, ...summary }, reason: note, ip: ctx.ip });
    return { batchId: batch!.id, amount, ...summary };
  });
}

/** Phương thức ghi khoản nhập cũ: tiền mặt của cơ sở → tiền mặt dùng chung → phương thức đầu tiên */
async function pickLegacyMethod(db: Db, centerId: string) {
  const rows = await db.select({ id: paymentMethods.id, kind: paymentMethods.kind, centerId: paymentMethods.centerId, allowFor: paymentMethods.allowFor })
    .from(paymentMethods).where(and(eq(paymentMethods.isActive, true), or(isNull(paymentMethods.centerId), eq(paymentMethods.centerId, centerId))!)).orderBy(asc(paymentMethods.sortOrder));
  const ok = rows.filter((r) => r.allowFor.includes("course"));
  return (ok.find((r) => r.kind === "cash" && r.centerId === centerId) ?? ok.find((r) => r.kind === "cash") ?? ok[0])?.id ?? null;
}

export async function listImportBatches(ctx: ProtectedContext, input: { kind?: "legacy_payments" | "bank_statement" }) {
  requirePermission(ctx, "finance:read", { centerId: null });
  const cc = confirmCenters(ctx);
  if (!cc.length) return [];
  const conds: SQL[] = [];
  if (input.kind) conds.push(eq(importBatches.kind, input.kind));
  if (!cc.includes(null)) conds.push(eq(importBatches.createdBy, ctx.user.id));
  const rows = await ctx.db.select({ b: importBatches, creatorName: users.fullName }).from(importBatches).leftJoin(users, eq(users.id, importBatches.createdBy))
    .where(conds.length ? and(...conds) : sql`true`).orderBy(desc(importBatches.createdAt)).limit(50);
  return rows.map((x) => ({ ...x.b, creatorName: x.creatorName }));
}
