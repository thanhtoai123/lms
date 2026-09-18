import { and, eq, inArray, sql, asc, desc, isNull, gte, lte, or, ilike, ne, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";
import {
  paymentMethods, orders, orderPrivate, orderItems, orderItemDiscounts, orderInstallments, orderEvents, payments, paymentAdjustments, paymentQrCodes, refunds, financeLedger, bankTransactions, commissions,
  centers, users, userRoles, userNotifications, enrollments, classes, courses, students, parents, studentGuardians, leads, leadChildren,
} from "@satarobo/db";
import {
  authorize, hasRole, visibleCenterIds, addDays, clampPageSize,
  priceLines, packagePrice, buildPlan, validateInstallmentPlan, replanInstallments, orderBalance, deriveOrderStatus, canCancelOrder,
  allocateInstallments, agingBucket, agingBucketBy, agingBucketLabels, dueSoon, validatePaymentDecision, receiptNumber, transferMemo, maskIdNumber,
  refundProposal, validateRefundRequest, refundTransition, vietQrImageUrl, requireReason, formatVnd, maskPhone, remainingSessions, isEmail,
  orderDisplayState, enrollmentDebtChip, COACH_MULTIPLIER, MAX_INSTALLMENTS, DEBT_CHIPS,
  AGING_BUCKETS, FinanceRuleError,
  buildOrderCode, orderCodePrefix, DEFAULT_ORDER_CODE_FORMAT,
  qrExpiresAt, qrExpired, qrState, DEFAULT_QR_TTL_HOURS, QR_REUSE_LABEL,
  applyDiscountPolicy, discountPolicyOf, DISCOUNT_POLICY_KIND, DISCOUNT_POLICY_VI, DEFAULT_MAX_LINE_DISCOUNT_PCT,
  scopeFlagsToAllowFor, allowForToScopeFlags, clientSafeMessage,
  type OrderType, type OrderStatus, type PaymentStatus, type PaymentDecision, type RefundStatus, type PaymentMethodKind, type AgingBucket, type Discount, type Permission,
  type ClassFormat, type InstallmentKind, type LineDiscount, type DebtChip, type DebtAgeBucket,
  type OrderCodeFormat, type DiscountPolicy, type PaymentScopeFlag,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { getOps, opsForCenters } from "./opsSettings";
import { writeAudit } from "./audit";
import { deliverNotifications } from "./notify";
import { tenantCond, tenantCondViaCenter, assertTenant, canSeeFinanceDetailOf, redact } from "./tenantScope";
import { todayISO } from "./sessions";
import { consumedSql } from "./students";
import { accrueCommissions, adjustCommissionsForRefund } from "./commissions";
import { queueEmail, getSettings } from "./admin";
import { logger } from "../lib/logger";

export type Db = ProtectedContext["db"];
export const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });
export const pre = (m: string | string[]) => new TRPCError({ code: "PRECONDITION_FAILED", message: Array.isArray(m) ? m.join("; ") : m });

export function wrapRule<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof FinanceRuleError || (e as Error)?.name === "FinanceRuleError") throw pre((e as Error).message);
    throw e;
  }
}

export function reasonOrThrow(reason: string | null | undefined) {
  try {
    return requireReason(reason);
  } catch (e) {
    throw bad((e as Error).message);
  }
}

/**
 * Phạm vi xem của mọi truy vấn tài chính: cơ sở được phép VÀ trung tâm (tenant) của cơ sở đó.
 * Gộp cách ly trung tâm vào đây để mọi hàm dùng `scope()` đều được bảo vệ, không phải sửa từng chỗ.
 */
export function scope(ctx: ProtectedContext, col: SQL | typeof orders.centerId): SQL {
  const v = visibleCenterIds(ctx.actor);
  const tenant = tenantCondViaCenter(ctx, col as unknown as AnyPgColumn);
  if (v === null) return tenant;
  return v.length ? and(inArray(col as typeof orders.centerId, v), tenant)! : sql`false`;
}

export const can = (ctx: ProtectedContext, p: Permission, centerId: string | null) => authorize(ctx.actor, p, { centerId }).allowed;

/** Gửi qua cổng chung để danh mục loại thông báo quyết định mức ưu tiên + có đẩy hay không */
export async function notify(db: Db, userIds: (string | null | undefined)[], title: string, body: string, link: string, priority = 2, type: string | null = null) {
  await deliverNotifications(db, userIds, { title, body, link, priority, type });
}

export async function accountantsOf(db: Db, centerId: string) {
  return (await db.select({ u: userRoles.userId }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.role, "CENTER_ACCOUNTANT"), eq(userRoles.centerId, centerId), eq(users.isActive, true)))).map((r) => r.u);
}

/** Danh sách sale để gán phụ trách (nhập giao dịch cũ, chốt hàng loạt) */
export async function saleOptions(ctx: ProtectedContext) {
  requirePermission(ctx, "finance:read", { centerId: null });
  const v = visibleCenterIds(ctx.actor);
  const rows = await ctx.db.selectDistinct({ id: users.id, fullName: users.fullName })
    .from(userRoles).innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(
      eq(users.isActive, true),
      inArray(userRoles.role, ["CENTER_SALES_CSM", "HO_SALE", "CENTER_MANAGER", "SUPER_ADMIN"]),
      v === null ? sql`true` : v.length ? or(isNull(userRoles.centerId), inArray(userRoles.centerId, v))! : isNull(userRoles.centerId),
    ))
    .orderBy(asc(users.fullName)).limit(300);
  return rows;
}

export async function managersOf(db: Db, centerId: string) {
  return (await db.select({ u: userRoles.userId }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.role, "CENTER_MANAGER"), eq(userRoles.centerId, centerId), eq(users.isActive, true)))).map((r) => r.u);
}

/** Đơn còn "sống" — dùng để chặn trùng dòng đơn và tìm đơn hiện hành của ghi danh */
export const OPEN_ORDER_STATUSES = ["pending_payment", "partially_paid", "paid"] as const;

/** Số đã xác nhận / chờ xác nhận / đã chi hoàn của đơn */
const confirmedSql = sql<number>`coalesce((select sum(p.amount) from ${payments} p where p.order_id = ${sql.raw('"orders"."id"')} and p.status = 'confirmed'), 0)::bigint`;
const pendingSql = sql<number>`coalesce((select sum(p.amount) from ${payments} p where p.order_id = ${sql.raw('"orders"."id"')} and p.status = 'recorded'), 0)::bigint`;
const refundedSql = sql<number>`coalesce((select sum(r.amount) from ${refunds} r where r.order_id = ${sql.raw('"orders"."id"')} and r.status = 'paid'), 0)::bigint`;

/**
 * Số thứ tự đơn kế tiếp trong phạm vi tiền tố (năm với DHyy-, ngày với ORD-YYMMDD-).
 * Gọi trong transaction. Dạng mã lấy từ cấu hình vận hành `orderCodeFormat`.
 */
export async function nextOrderCode(tx: Db, dateISO: string, format: OrderCodeFormat = DEFAULT_ORDER_CODE_FORMAT) {
  const prefix = orderCodePrefix(format, dateISO);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"order-code:" + prefix}))`);
  const [m] = await tx.select({ n: sql<number>`coalesce(max(right(${orders.code}, 6)::int), 0)::int` }).from(orders).where(ilike(orders.code, `${prefix}%`));
  return buildOrderCode(format, dateISO, (m?.n ?? 0) + 1);
}

/** Dạng mã đơn đang cấu hình (mặc định giữ kiểu hiện tại để không phá dữ liệu cũ) */
export async function orderCodeFormatOf(db: Db, centerId: string | null = null): Promise<OrderCodeFormat> {
  const ops = await getOps(db, centerId);
  return (ops.orderCodeFormat as OrderCodeFormat) ?? DEFAULT_ORDER_CODE_FORMAT;
}

/** Số phiếu thu kế tiếp theo cơ sở + năm (gọi trong transaction) */
export async function nextReceiptNo(tx: Db, centerCode: string, yr: number) {
  const prefix = receiptNumber(centerCode, yr, 0).slice(0, -6);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"receipt:" + prefix}))`);
  const [m] = await tx.select({ n: sql<number>`coalesce(max(right(${payments.receiptNo}, 6)::int), 0)::int` }).from(payments).where(ilike(payments.receiptNo, `${prefix}%`));
  return receiptNumber(centerCode, yr, (m?.n ?? 0) + 1);
}

export async function recomputeOrderStatus(tx: Db, orderId: string, actorId: string | null, note: string, opts: { accrue?: boolean } = {}) {
  const o = await tx.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!o) return;
  const [c] = await tx.select({ n: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint` }).from(payments).where(and(eq(payments.orderId, orderId), eq(payments.status, "confirmed")));
  const next = deriveOrderStatus(o.status, o.total, Number(c?.n ?? 0));
  if (next !== o.status) {
    await tx.update(orders).set({ status: next }).where(eq(orders.id, orderId));
    await tx.insert(orderEvents).values({ orderId, event: "status", fromStatus: o.status, toStatus: next, note, actorId });
    if (next === "paid" && opts.accrue !== false) await accrueCommissions(tx, orderId);
  }
}

/* ------------------------------------------------------------------ */
/* Phương thức thanh toán                                              */
/* ------------------------------------------------------------------ */

export async function listPaymentMethods(ctx: ProtectedContext, input: { centerId?: string | null; activeOnly?: boolean; forType?: OrderType }) {
  requirePermission(ctx, "finance:read", { centerId: input.centerId ?? null });
  const conds: SQL[] = [tenantCond(ctx, paymentMethods)];
  if (input.activeOnly) conds.push(eq(paymentMethods.isActive, true));
  if (input.centerId) conds.push(or(isNull(paymentMethods.centerId), eq(paymentMethods.centerId, input.centerId))!);
  else {
    const v = visibleCenterIds(ctx.actor);
    if (v !== null) conds.push(v.length ? or(isNull(paymentMethods.centerId), inArray(paymentMethods.centerId, v))! : isNull(paymentMethods.centerId));
  }
  const rows = await ctx.db.select({ m: paymentMethods, centerCode: centers.code }).from(paymentMethods).leftJoin(centers, eq(centers.id, paymentMethods.centerId))
    .where(conds.length ? and(...conds) : undefined).orderBy(asc(paymentMethods.sortOrder), asc(paymentMethods.code));
  return rows
    .filter((r) => !input.forType || r.m.allowFor.includes(input.forType === "course" ? "course" : input.forType))
    .map((r) => ({
      ...r.m,
      centerCode: r.centerCode,
      // Dữ liệu cũ chưa khai cờ thì suy từ allowFor để form luôn hiện đúng
      scope: r.m.canBuyCourse || r.m.canBuyPackage || r.m.canBuyExam || r.m.canBuyProduct || r.m.canDeposit
        ? { canBuyCourse: r.m.canBuyCourse, canBuyPackage: r.m.canBuyPackage, canBuyExam: r.m.canBuyExam, canBuyProduct: r.m.canBuyProduct, canDeposit: r.m.canDeposit }
        : allowForToScopeFlags(r.m.allowFor),
      canEdit: can(ctx, "finance:configure", r.m.centerId),
    }));
}

export interface PaymentMethodInput {
  id?: string; code: string; name: string; kind: PaymentMethodKind; centerId: string | null; bankBin?: string | null; bankName?: string | null;
  bankBranch?: string | null; accountNo?: string | null; accountName?: string | null; description?: string | null; image?: string | null;
  /** Cách khai cũ — vẫn nhận để không phá form / API đang dùng */
  allowFor?: string[];
  /** 5 cờ phạm vi như bản gốc; khai cờ thì `allowFor` được suy ra theo */
  scope?: Partial<Record<PaymentScopeFlag, boolean>>;
  sortOrder: number; isActive: boolean;
}

export async function upsertPaymentMethod(ctx: ProtectedContext, input: PaymentMethodInput) {
  if (input.centerId === null) {
    const global = ctx.actor.assignments.some((a) => a.centerId === null && authorize({ userId: ctx.actor.userId, assignments: [a] }, "finance:configure", {}).allowed);
    if (!global) throw new TRPCError({ code: "FORBIDDEN", message: "Chỉ kế toán Hội sở tạo phương thức dùng chung — hãy chọn cơ sở" });
  } else requirePermission(ctx, "finance:configure", { centerId: input.centerId });
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,20}$/.test(code)) throw bad("Mã phương thức chỉ gồm chữ in hoa, số, - _ (2–20 ký tự)");
  if (input.kind === "bank_transfer" && (!input.bankBin?.trim() || !input.accountNo?.trim() || !input.accountName?.trim())) throw bad("Chuyển khoản cần mã ngân hàng (BIN), số tài khoản và tên chủ tài khoản");
  if (input.bankBin && !/^\d{6}$/.test(input.bankBin.trim())) throw bad("Mã BIN ngân hàng gồm 6 chữ số (VD Vietcombank 970436)");
  // Phạm vi dùng: nhận 5 cờ (bản gốc) hoặc `allowFor` cũ; hai chiều luôn được giữ đồng bộ
  const scopeFlags = input.scope ?? allowForToScopeFlags(input.allowFor ?? []);
  const allowFor = input.scope ? scopeFlagsToAllowFor(input.scope) : [...new Set(input.allowFor ?? [])];
  if (!allowFor.length && !scopeFlags.canDeposit) throw bad("Chọn ít nhất một phạm vi được dùng (khoá học, gói, kỳ thi, sản phẩm hoặc nạp ví)");
  const dup = (await ctx.db.select({ id: paymentMethods.id }).from(paymentMethods).where(and(eq(paymentMethods.code, code), input.id ? ne(paymentMethods.id, input.id) : undefined)).limit(1))[0];
  if (dup) throw new TRPCError({ code: "CONFLICT", message: `Mã ${code} đã tồn tại` });
  const values = {
    code, name: input.name.trim(), kind: input.kind, centerId: input.centerId, bankBin: input.bankBin?.trim() || null, bankName: input.bankName?.trim() || null,
    bankBranch: input.bankBranch?.trim() || null,
    accountNo: input.accountNo?.trim() || null, accountName: input.accountName?.trim().toUpperCase() || null, description: input.description?.trim() || null,
    image: input.image?.trim() || null,
    allowFor,
    canBuyCourse: !!scopeFlags.canBuyCourse, canBuyPackage: !!scopeFlags.canBuyPackage, canBuyExam: !!scopeFlags.canBuyExam,
    canBuyProduct: !!scopeFlags.canBuyProduct, canDeposit: !!scopeFlags.canDeposit,
    sortOrder: input.sortOrder, isActive: input.isActive,
  };
  return ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    if (input.id) {
      const before = await tx.query.paymentMethods.findFirst({ where: eq(paymentMethods.id, input.id) });
      if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy phương thức" });
      if (before.centerId !== input.centerId && !can(ctx, "finance:configure", before.centerId)) throw new TRPCError({ code: "FORBIDDEN", message: "Không có quyền sửa phương thức này" });
      await tx.update(paymentMethods).set(values).where(eq(paymentMethods.id, input.id));
      await writeAudit(tx, { actorId: ctx.user.id, action: "UPDATE", module: "finance", entity: "payment_methods", entityId: input.id, before: { ...before, createdAt: undefined, updatedAt: undefined }, after: values, ip: ctx.ip });
      return { id: input.id };
    }
    const [row] = await tx.insert(paymentMethods).values(values).returning({ id: paymentMethods.id });
    await writeAudit(tx, { actorId: ctx.user.id, action: "CREATE", module: "finance", entity: "payment_methods", entityId: row!.id, after: values, ip: ctx.ip });
    return { id: row!.id };
  });
}

/* ------------------------------------------------------------------ */
/* Đơn hàng                                                            */
/* ------------------------------------------------------------------ */

export async function listOrders(ctx: ProtectedContext, input: { q?: string; centerId?: string; status?: OrderStatus; from?: string; to?: string; page?: number }) {
  requirePermission(ctx, "finance:read", { centerId: input.centerId ?? null });
  const conds: SQL[] = [scope(ctx, orders.centerId), tenantCond(ctx, orders)];
  if (input.centerId) conds.push(eq(orders.centerId, input.centerId));
  if (input.status) conds.push(eq(orders.status, input.status));
  if (input.from) conds.push(gte(orders.createdAt, new Date(`${input.from}T00:00:00+07:00`)));
  if (input.to) conds.push(lte(orders.createdAt, new Date(`${input.to}T23:59:59.999+07:00`)));
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`;
    const digits = input.q.replace(/\D/g, "");
    conds.push(or(ilike(orders.code, q), ilike(orders.customerName, q), ...(digits.length >= 4 ? [ilike(orders.customerPhone, `%${digits.slice(-9)}%`)] : []))!);
  }
  const pageSize = 30;
  const page = Math.max(1, input.page ?? 1);
  const where = and(...conds);
  const [tot] = await ctx.db.select({ n: sql<number>`count(*)::int`, sum: sql<number>`coalesce(sum(${orders.total}), 0)::bigint` }).from(orders).where(where);
  const rows = await ctx.db
    .select({
      id: orders.id, code: orders.code, type: orders.type, status: orders.status, total: orders.total, customerName: orders.customerName, customerPhone: orders.customerPhone,
      createdAt: orders.createdAt, centerCode: centers.code, methodName: paymentMethods.name, creatorName: users.fullName, studentName: students.fullName,
      confirmed: confirmedSql, pending: pendingSql,
    })
    .from(orders).innerJoin(centers, eq(centers.id, orders.centerId)).leftJoin(paymentMethods, eq(paymentMethods.id, orders.paymentMethodId))
    .leftJoin(users, eq(users.id, orders.createdBy)).leftJoin(students, eq(students.id, orders.studentId))
    .where(where).orderBy(desc(orders.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  const [counts] = await ctx.db.select({
    pending_payment: sql<number>`count(*) filter (where ${orders.status} = 'pending_payment')::int`,
    partially_paid: sql<number>`count(*) filter (where ${orders.status} = 'partially_paid')::int`,
    paid: sql<number>`count(*) filter (where ${orders.status} = 'paid')::int`,
    cancelled: sql<number>`count(*) filter (where ${orders.status} = 'cancelled')::int`,
    refunded: sql<number>`count(*) filter (where ${orders.status} = 'refunded')::int`,
  }).from(orders).where(scope(ctx, orders.centerId));
  const full = hasRole(ctx.actor, "SUPER_ADMIN", "CENTER_MANAGER", "CENTER_SALES_CSM", "CENTER_ACCOUNTANT", "HO_ACCOUNTANT");
  const ids = rows.map((r) => r.id);
  const planRows = ids.length
    ? await ctx.db.select({ orderId: orderInstallments.orderId, kind: orderInstallments.kind, seq: orderInstallments.seq, amount: orderInstallments.amount, dueDate: orderInstallments.dueDate })
        .from(orderInstallments).where(and(inArray(orderInstallments.orderId, ids), isNull(orderInstallments.cancelledAt)))
    : [];
  const today = todayISO();
  return {
    total: tot?.n ?? 0, sum: Number(tot?.sum ?? 0), page, pageSize, counts,
    items: rows.map((r) => {
      const confirmed = Number(r.confirmed);
      const pending = Number(r.pending);
      const plan = planRows.filter((p) => p.orderId === r.id);
      const alloc = allocateInstallments(plan.map((p) => ({ seq: p.seq, amount: p.amount, dueDate: p.dueDate, kind: p.kind })), confirmed, today);
      return {
        ...r, confirmed, pending,
        outstanding: r.status === "cancelled" || r.status === "refunded" ? 0 : Math.max(0, r.total - confirmed),
        display: orderDisplayState({ status: r.status, total: r.total, confirmed, pending, installments: plan.filter((p) => p.kind !== "deposit").length, paidInstallments: alloc.filter((a) => a.state === "paid").length }),
        customerPhone: full ? r.customerPhone : r.customerPhone.replace(/\d(?=\d{3})/g, "•"),
      };
    }),
  };
}

/** Gợi ý đơn từ một đăng ký học (tên PH, HV, khoá, giá gói theo số buổi) */
export async function orderDraftFromEnrollment(ctx: ProtectedContext, enrollmentId: string) {
  const [r] = await ctx.db
    .select({
      enrollmentId: enrollments.id, packageSessions: enrollments.packageSessions, status: enrollments.status, studentId: students.id, studentName: students.fullName,
      classCode: classes.code, centerId: classes.centerId, courseId: courses.id, courseCode: courses.code, courseName: courses.name, listPrice: courses.listPrice, totalSessions: courses.totalSessions,
    })
    .from(enrollments).innerJoin(students, eq(students.id, enrollments.studentId)).innerJoin(classes, eq(classes.id, enrollments.classId)).innerJoin(courses, eq(courses.id, classes.courseId))
    .where(eq(enrollments.id, enrollmentId)).limit(1);
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy đăng ký học" });
  requirePermission(ctx, "finance:create", { centerId: r.centerId });
  const [g] = await ctx.db.select({ id: parents.id, fullName: parents.fullName, phone: parents.phone, email: parents.email }).from(studentGuardians)
    .innerJoin(parents, eq(parents.id, studentGuardians.parentId)).where(eq(studentGuardians.studentId, r.studentId)).orderBy(desc(studentGuardians.isPrimary)).limit(1);
  const existing = await ctx.db.select({ id: orders.id, code: orders.code, status: orders.status }).from(orders).where(and(eq(orders.enrollmentId, r.enrollmentId), ne(orders.status, "cancelled")));
  return {
    ...r,
    listPrice: Number(r.listPrice),
    unitPrice: packagePrice(Number(r.listPrice), r.totalSessions, r.packageSessions),
    parent: g ?? null,
    existingOrders: existing,
  };
}

/** "84905123456" → "0905123456" */
export const localPhone = (normalized: string) => (normalized.startsWith("84") ? `0${normalized.slice(2)}` : normalized);

/** Gợi ý đơn từ lead: khách theo lead, mỗi con chưa chốt có khoá quan tâm → một dòng giá niêm yết */
export async function orderDraftFromLead(ctx: ProtectedContext, leadId: string) {
  const lead = await ctx.db.query.leads.findFirst({ where: and(eq(leads.id, leadId), isNull(leads.deletedAt)) });
  if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy lead" });
  requirePermission(ctx, "finance:create", { centerId: lead.centerId });
  const kids = await ctx.db
    .select({ id: leadChildren.id, fullName: leadChildren.fullName, convertedStudentId: leadChildren.convertedStudentId, courseId: courses.id, courseCode: courses.code, listPrice: courses.listPrice, totalSessions: courses.totalSessions })
    .from(leadChildren).leftJoin(courses, eq(courses.id, leadChildren.interestedCourseId))
    .where(eq(leadChildren.leadId, lead.id)).orderBy(asc(leadChildren.createdAt));
  const items: { courseId: string; description: string; unitPrice: number; packageSessions: number | null; leadChildId: string | null }[] = [];
  for (const k of kids) {
    if (k.convertedStudentId || !k.courseId) continue;
    items.push({ courseId: k.courseId, description: `Học phí ${k.courseCode} — ${k.fullName}`, unitPrice: Number(k.listPrice ?? 0), packageSessions: k.totalSessions, leadChildId: k.id });
  }
  if (!items.length && lead.interestedCourseId) {
    const c = await ctx.db.query.courses.findFirst({ where: eq(courses.id, lead.interestedCourseId) });
    if (c) items.push({ courseId: c.id, description: `Học phí ${c.code}${lead.childName ? ` — ${lead.childName}` : ""}`, unitPrice: Number(c.listPrice), packageSessions: c.totalSessions, leadChildId: null });
  }
  const existingOrders = await ctx.db.select({ id: orders.id, code: orders.code, status: orders.status, total: orders.total }).from(orders).where(eq(orders.leadId, lead.id)).orderBy(desc(orders.createdAt));
  const full = hasRole(ctx.actor, "SUPER_ADMIN", "CENTER_MANAGER", "CENTER_SALES_CSM", "HO_SALE", "CENTER_ACCOUNTANT", "HO_ACCOUNTANT");
  return {
    leadId: lead.id, centerId: lead.centerId, parentName: lead.parentName, email: lead.email,
    phone: full ? localPhone(lead.phoneNormalized) : maskPhone(lead.phoneNormalized),
    children: kids.map((k) => ({ id: k.id, fullName: k.fullName, converted: !!k.convertedStudentId, courseId: k.courseId })),
    items,
    existingOrders,
  };
}

/** Phương thức ghi khoản thu lùi ngày: tiền mặt của cơ sở → tiền mặt dùng chung → phương thức học phí đầu tiên */
export async function pickBackfillMethod(db: Db, centerId: string): Promise<string | null> {
  const rows = await db.select({ id: paymentMethods.id, kind: paymentMethods.kind, centerId: paymentMethods.centerId, allowFor: paymentMethods.allowFor })
    .from(paymentMethods).where(and(eq(paymentMethods.isActive, true), or(isNull(paymentMethods.centerId), eq(paymentMethods.centerId, centerId))!)).orderBy(asc(paymentMethods.sortOrder));
  const ok = rows.filter((r) => r.allowFor.includes("course"));
  return (ok.find((r) => r.kind === "cash" && r.centerId === centerId) ?? ok.find((r) => r.kind === "cash") ?? ok[0])?.id ?? null;
}

/**
 * Tạo đơn của lead trong transaction đang chạy (chốt lead): đơn 0đ học bổng toàn phần, hoặc đơn giá niêm yết
 * kèm khoản thu lùi ngày "backfill" ở trạng thái chờ kế toán (không bịa khoản đã xác nhận).
 */
export async function insertLeadOrderTx(tx: Db, p: {
  leadId: string; centerId: string; parentId: string | null; studentId: string | null; enrollmentId: string | null;
  customer: { name: string; phone: string; email: string | null };
  items: { courseId: string | null; description: string; unitPrice: number; packageSessions: number | null; leadChildId: string | null; studentId: string | null; enrollmentId: string | null }[];
  paymentMethodId: string | null; internalNote: string | null; dueDate: string; actorId: string;
  payment?: { amount: number; paidAt: string; note: string } | null;
}) {
  const total = p.items.reduce((s, i) => s + Math.round(i.unitPrice), 0);
  if (p.payment && p.payment.amount > total) throw pre(`Số đã đóng (${formatVnd(p.payment.amount)}) lớn hơn tổng đơn (${formatVnd(total)})`);
  const code = await nextOrderCode(tx, todayISO(), await orderCodeFormatOf(tx, p.centerId));
  const status: OrderStatus = total === 0 ? "paid" : "pending_payment";
  const [o] = await tx.insert(orders).values({
    code, type: "course", status, centerId: p.centerId, parentId: p.parentId, studentId: p.studentId, enrollmentId: p.enrollmentId, leadId: p.leadId,
    customerName: p.customer.name, customerPhone: p.customer.phone, customerEmail: p.customer.email,
    subtotal: total, discountAmount: 0, total, paymentMethodId: p.paymentMethodId, internalNote: p.internalNote, createdBy: p.actorId,
  }).returning({ id: orders.id });
  await tx.insert(orderItems).values(p.items.map((i) => ({
    orderId: o!.id, courseId: i.courseId, description: i.description, quantity: 1, unitPrice: Math.round(i.unitPrice), amount: Math.round(i.unitPrice), netAmount: Math.round(i.unitPrice),
    packageSessions: i.packageSessions, leadChildId: i.leadChildId, studentId: i.studentId, enrollmentId: i.enrollmentId,
  })));
  if (total > 0) await tx.insert(orderInstallments).values({ orderId: o!.id, seq: 1, amount: total, dueDate: p.dueDate, createdBy: p.actorId });
  await tx.insert(orderEvents).values({ orderId: o!.id, event: "create", toStatus: status, note: p.internalNote, actorId: p.actorId });
  await tx.insert(financeLedger).values({ orderId: o!.id, centerId: p.centerId, entryType: "charge", amount: total, refId: o!.id, note: `Tạo đơn ${code}`, actorId: p.actorId });
  let paymentId: string | null = null;
  if (p.payment && p.payment.amount > 0) {
    const [pay] = await tx.insert(payments).values({
      orderId: o!.id, centerId: p.centerId, recordedAmount: p.payment.amount, amount: p.payment.amount, paymentMethodId: p.paymentMethodId, paidAt: p.payment.paidAt,
      status: "recorded", source: "backfill", note: p.payment.note, recordedBy: p.actorId,
    }).returning({ id: payments.id });
    paymentId = pay!.id;
    await tx.insert(orderEvents).values({ orderId: o!.id, event: "payment_recorded", note: `${formatVnd(p.payment.amount)} · ghi lùi ngày ${p.payment.paidAt}`, actorId: p.actorId });
    await notify(tx, await accountantsOf(tx, p.centerId), "Khoản thu chờ xác nhận", `${code} · ${formatVnd(p.payment.amount)} · ${p.customer.name} (nhập liệu ban đầu)`, "/payments?status=recorded", 2, "payment.pending");
  }
  await writeAudit(tx, { actorId: p.actorId, action: "CREATE", module: "finance", entity: "orders", entityId: o!.id, after: { code, total, leadId: p.leadId, backfill: p.payment ?? null } });
  return { id: o!.id, code, total, paymentId };
}

export interface OrderLineInput {
  courseId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  packageSessions?: number | null;
  leadChildId?: string | null;
  studentId?: string | null;
  enrollmentId?: string | null;
  /** group | coach_1_1 | coach_1_2 | coach_1_4 — hệ số đã áp vào đơn giá trước khi gửi lên */
  format?: ClassFormat | null;
  discounts?: LineDiscount[] | null;
}

export interface PlanInput { amount: number; dueDate: string; kind?: InstallmentKind | null; studentId?: string | null; orderItemIndex?: number | null }

export interface CreateOrderInput {
  type: OrderType;
  centerId: string;
  enrollmentId?: string | null;
  studentId?: string | null;
  parentId?: string | null;
  /** Đơn cho khách tiềm năng: khoá cơ sở theo lead, SĐT lấy từ lead */
  leadId?: string | null;
  customer: { name: string; phone: string; email?: string | null; idNumber?: string | null; address?: string | null; province?: string | null; ward?: string | null };
  items: OrderLineInput[];
  /** Giảm giá cấp đơn — giữ cho dữ liệu cũ, ưu tiên giảm theo dòng */
  discount?: Discount | null;
  paymentMethodId: string;
  installments: { count: number; firstDueDate: string; intervalDays?: number; deposit?: number | null; monthly?: boolean } | { plan: PlanInput[] };
  customerNote?: string | null;
  internalNote?: string | null;
  remindDays?: number;
}

/** Ghi danh đã có dòng đơn đang mở nào chưa (thay cho “mỗi ghi danh một đơn”) */
export async function openOrderLineFor(db: Db, enrollmentIds: string[], excludeOrderId?: string) {
  if (!enrollmentIds.length) return [] as { enrollmentId: string; orderCode: string; orderId: string }[];
  const rows = await db.select({ enrollmentId: orderItems.enrollmentId, orderCode: orders.code, orderId: orders.id })
    .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(
      inArray(orderItems.enrollmentId, enrollmentIds),
      inArray(orders.status, ["pending_payment", "partially_paid", "paid"]),
      excludeOrderId ? ne(orders.id, excludeOrderId) : undefined,
    ));
  return rows.filter((r): r is { enrollmentId: string; orderCode: string; orderId: string } => !!r.enrollmentId);
}

export async function createOrder(ctx: ProtectedContext, input: CreateOrderInput) {
  requirePermission(ctx, "finance:create", { centerId: input.centerId });
  const center = await ctx.db.query.centers.findFirst({ where: eq(centers.id, input.centerId) });
  if (!center) throw bad("Cơ sở không hợp lệ");
  let lead: typeof leads.$inferSelect | undefined;
  const childIds = [...new Set(input.items.map((i) => i.leadChildId).filter((x): x is string => !!x))];
  if (input.leadId) {
    lead = await ctx.db.query.leads.findFirst({ where: and(eq(leads.id, input.leadId), isNull(leads.deletedAt)) });
    if (!lead) throw bad("Lead không tồn tại");
    if (lead.centerId && lead.centerId !== input.centerId) throw bad("Đơn của khách phải thuộc cơ sở của khách (cơ sở trên lead)");
    if (input.enrollmentId) throw bad("Đơn tạo từ lead không chọn đăng ký học — chốt lead xong hệ thống tự gắn học viên / ghi danh");
    if (childIds.length) {
      const kids = await ctx.db.select({ id: leadChildren.id }).from(leadChildren).where(and(eq(leadChildren.leadId, lead.id), inArray(leadChildren.id, childIds)));
      if (kids.length !== childIds.length) throw bad("Dòng đơn chọn con không thuộc lead này");
    }
  } else if (childIds.length) throw bad("Chỉ đơn tạo từ lead mới chọn được con của lead");
  const phone = lead ? localPhone(lead.phoneNormalized) : input.customer.phone.replace(/\D/g, "");
  if (phone.length < 9 || phone.length > 11) throw bad("Số điện thoại khách hàng không hợp lệ");
  const ops = await getOps(ctx.db, input.centerId);
  const priced = priceLines(input.items.map((i) => ({
    unitPrice: i.unitPrice, quantity: i.quantity, discounts: i.discounts ?? [], maxPercent: ops.maxLineDiscountPercent,
    format: i.format ?? "group", sessions: i.packageSessions ?? null,
  })));
  if (priced.errors.length) throw bad(priced.errors);
  // Giảm giá cấp đơn: giữ cho dữ liệu cũ, cộng sau giảm theo dòng
  const orderDiscount = input.discount && input.discount.value > 0
    ? (input.discount.type === "percent" ? Math.round((priced.total * Math.min(100, input.discount.value)) / 100) : Math.min(Math.round(input.discount.value), priced.total))
    : 0;
  const total = priced.total - orderDiscount;
  const discountAmount = priced.discountAmount + orderDiscount;
  const method = await ctx.db.query.paymentMethods.findFirst({ where: eq(paymentMethods.id, input.paymentMethodId) });
  if (!method || !method.isActive) throw bad("Phương thức thanh toán không hợp lệ");
  if (method.centerId && method.centerId !== input.centerId) throw bad("Phương thức thanh toán thuộc cơ sở khác");
  if (!method.allowFor.includes(input.type)) throw bad("Phương thức này không áp dụng cho loại đơn đã chọn");
  const plan: PlanInput[] = "plan" in input.installments
    ? input.installments.plan.map((p) => ({ ...p, amount: Math.round(p.amount) }))
    : wrapRule(() => buildPlan(total, (input.installments as { count: number }).count, (input.installments as { firstDueDate: string }).firstDueDate, {
        intervalDays: (input.installments as { intervalDays?: number }).intervalDays ?? 30,
        deposit: (input.installments as { deposit?: number | null }).deposit ?? null,
        monthly: (input.installments as { monthly?: boolean }).monthly ?? false,
      }));
  // Như bản gốc: kế hoạch lỗi vẫn tạo đơn, trả planError để người dùng đặt lại ở trang đơn
  const planErrs = total > 0 ? validateInstallmentPlan(total, plan, { maxInstallments: MAX_INSTALLMENTS }) : [];

  // Mỗi ghi danh chỉ một dòng đơn đang mở
  const lineEnrollmentIds = [...new Set(input.items.map((i) => i.enrollmentId).filter((x): x is string => !!x))];
  const allEnrollmentIds = [...new Set([...lineEnrollmentIds, ...(input.enrollmentId ? [input.enrollmentId] : [])])];
  const enrollRows = allEnrollmentIds.length
    ? await ctx.db.select({ id: enrollments.id, centerId: classes.centerId, studentId: enrollments.studentId })
        .from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).where(inArray(enrollments.id, allEnrollmentIds))
    : [];
  for (const id of allEnrollmentIds) {
    const e = enrollRows.find((x) => x.id === id);
    if (!e) throw bad("Đăng ký học không tồn tại");
    if (e.centerId !== input.centerId) throw bad("Đăng ký học thuộc cơ sở khác");
  }
  const busy = await openOrderLineFor(ctx.db, allEnrollmentIds);
  if (busy[0]) throw new TRPCError({ code: "CONFLICT", message: `Đăng ký này đã có dòng đơn đang mở ở ${busy[0].orderCode} — huỷ dòng cũ hoặc tạo đơn bổ sung loại "Khác"` });
  const legacyEnrollmentId = input.enrollmentId ?? (lineEnrollmentIds.length === 1 ? lineEnrollmentIds[0]! : null);
  const lineStudentIds = [...new Set(input.items.map((i) => i.studentId).filter((x): x is string => !!x))];
  const enrollStudentId = legacyEnrollmentId ? (enrollRows.find((x) => x.id === legacyEnrollmentId)?.studentId ?? null) : null;
  const studentId = input.studentId ?? enrollStudentId ?? (lineStudentIds.length === 1 ? lineStudentIds[0]! : null);
  if (input.discount && input.discount.value > 0 && (input.internalNote ?? "").trim().length < 3) throw bad("Đơn có giảm giá cần ghi chú nội bộ (lý do / chương trình ưu đãi)");

  return ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    const code = await nextOrderCode(tx, todayISO(), (ops.orderCodeFormat as OrderCodeFormat) ?? DEFAULT_ORDER_CODE_FORMAT);
    const [o] = await tx.insert(orders).values({
      code, type: input.type, status: total === 0 ? "paid" : "pending_payment", centerId: input.centerId, parentId: input.parentId ?? lead?.convertedParentId ?? null, studentId, enrollmentId: legacyEnrollmentId, leadId: lead?.id ?? null,
      customerName: input.customer.name.trim(), customerPhone: phone, customerEmail: input.customer.email?.trim() || null,
      subtotal: priced.subtotal, discountType: input.discount?.value ? input.discount.type : null, discountValue: input.discount?.value ? Math.round(input.discount.value) : null,
      discountAmount, total, paymentMethodId: method.id,
      customerNote: input.customerNote?.trim() || null, internalNote: input.internalNote?.trim() || null, remindDays: input.remindDays ?? ops.orderRemindDays, createdBy: ctx.user.id,
    }).returning();
    const priv = input.customer;
    if (priv.idNumber || priv.address || priv.province || priv.ward) {
      await tx.insert(orderPrivate).values({ orderId: o!.id, idNumber: priv.idNumber?.replace(/\s/g, "") || null, address: priv.address?.trim() || null, province: priv.province?.trim() || null, ward: priv.ward?.trim() || null });
    }
    const itemRows = await tx.insert(orderItems).values(input.items.map((i, idx) => {
      const p = priced.lines[idx]!;
      const fmt = (i.format ?? "group") as ClassFormat;
      return {
        orderId: o!.id, courseId: i.courseId ?? null, description: i.description.trim(), quantity: i.quantity, unitPrice: Math.round(i.unitPrice),
        amount: p.gross, discountAmount: p.discount, netAmount: p.net, packageSessions: i.packageSessions ?? null,
        leadChildId: i.leadChildId ?? null, studentId: i.studentId ?? null, enrollmentId: i.enrollmentId ?? null,
        classFormat: fmt, formatMultiplier: String(COACH_MULTIPLIER[fmt] ?? 1),
      };
    })).returning({ id: orderItems.id });
    // Chính sách giảm quyết định cách tính; `kind` giữ lại làm hình chiếu cho dữ liệu cũ
    const discRows = input.items.flatMap((i, idx) => (i.discounts ?? []).map((d) => {
      const policy = discountPolicyOf(d);
      const r = applyDiscountPolicy({ listPrice: priced.lines[idx]!.gross, policy, value: d.value, maxPercent: ops.maxLineDiscountPercent, reason: d.reason });
      return {
        orderItemId: itemRows[idx]!.id, kind: DISCOUNT_POLICY_KIND[policy] === "percent" ? ("percent" as const) : ("amount" as const), policy,
        value: Math.round(d.value), amount: r.amount, reason: (d.reason ?? "").trim(), createdBy: ctx.user.id,
      };
    }));
    if (discRows.length) await tx.insert(orderItemDiscounts).values(discRows);
    if (total > 0 && !planErrs.length) {
      await tx.insert(orderInstallments).values(plan.map((p, i) => ({
        orderId: o!.id, seq: i + 1, amount: p.amount, dueDate: p.dueDate, kind: p.kind ?? "installment",
        studentId: p.studentId ?? null, orderItemId: p.orderItemIndex != null ? (itemRows[p.orderItemIndex]?.id ?? null) : null, createdBy: ctx.user.id,
      })));
    }
    await tx.insert(orderEvents).values({ orderId: o!.id, event: "create", toStatus: o!.status, note: discountAmount ? `Giảm ${formatVnd(discountAmount)}` : null, actorId: ctx.user.id });
    await tx.insert(financeLedger).values({ orderId: o!.id, centerId: input.centerId, entryType: "charge", amount: total, refId: o!.id, note: `Tạo đơn ${code}`, actorId: ctx.user.id });
    await writeAudit(tx, { actorId: ctx.user.id, action: "CREATE", module: "finance", entity: "orders", entityId: o!.id, after: { code, total, discount: discountAmount, enrollmentId: legacyEnrollmentId, leadId: lead?.id ?? null, installments: planErrs.length ? 0 : plan.length, lines: input.items.length }, ip: ctx.ip });
    if (lead) await tx.update(leads).set({ lastTouchAt: new Date() }).where(eq(leads.id, lead.id));
    return { id: o!.id, code, leadId: lead?.id ?? null, total, planError: planErrs.length ? planErrs.join("; ") : null };
  });
}

/* ------------------------------------------------------------------ */
/* Kế hoạch thanh toán: sửa sau khi tạo, đợt riêng cho con              */
/* ------------------------------------------------------------------ */

/** Các đợt còn hiệu lực + phần đã thu suy từ số tiền kế toán đã xác nhận */
export async function installmentState(db: Db, orderId: string, confirmed: number, today: string) {
  const rows = await db.select().from(orderInstallments)
    .where(and(eq(orderInstallments.orderId, orderId), isNull(orderInstallments.cancelledAt))).orderBy(asc(orderInstallments.seq));
  const alloc = allocateInstallments(rows.map((p) => ({ seq: p.seq, amount: p.amount, dueDate: p.dueDate, kind: p.kind })), confirmed, today);
  return rows.map((r) => {
    const a = alloc.find((x) => x.seq === r.seq)!;
    return { ...r, paid: a.paid, remaining: a.remaining, state: a.state, overdueDays: a.overdueDays };
  });
}

export interface ReplacePlanInput {
  orderId: string;
  plan: { seq?: number | null; amount: number; dueDate: string; kind?: InstallmentKind | null; studentId?: string | null; orderItemId?: string | null }[];
  reason: string;
  /** Chống ghi đè: orders.updatedAt lúc mở form (ISO) */
  expectedUpdatedAt?: string | null;
}

/**
 * Thay toàn bộ kế hoạch thanh toán: đợt đã thu phải được giữ lại và không nhỏ hơn phần đã thu.
 * Đợt cũ bị huỷ mềm (giữ lịch sử), đợt mới đánh số lại 1..n.
 */
export async function replaceInstallmentPlan(ctx: ProtectedContext, input: ReplacePlanInput) {
  const o = await loadOrder(ctx, input.orderId, "finance:create");
  if (o.status === "cancelled" || o.status === "refunded") throw pre("Đơn đã đóng — không sửa kế hoạch");
  const reason = reasonOrThrow(input.reason);
  if (input.plan.length > MAX_INSTALLMENTS + 1) throw bad(`Tối đa ${MAX_INSTALLMENTS} đợt (chưa kể cọc)`);
  const today = todayISO();
  return ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"order:" + o.id}))`);
    const fresh = await tx.query.orders.findFirst({ where: eq(orders.id, o.id) });
    if (!fresh) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy đơn hàng" });
    if (input.expectedUpdatedAt && new Date(input.expectedUpdatedAt).getTime() !== new Date(fresh.updatedAt).getTime()) {
      throw new TRPCError({ code: "CONFLICT", message: "STALE_WRITE — đơn vừa được người khác sửa, tải lại trang rồi thao tác tiếp" });
    }
    const [c] = await tx.select({ n: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint` }).from(payments).where(and(eq(payments.orderId, o.id), eq(payments.status, "confirmed")));
    const confirmed = Number(c?.n ?? 0);
    const current = await installmentState(tx, o.id, confirmed, today);
    const plan = input.plan.map((p) => ({ ...p, amount: Math.round(p.amount) }));
    const errs = replanInstallments(fresh.total, current.map((x) => ({ seq: x.seq, amount: x.amount, paid: x.paid, kind: x.kind })), plan, { maxInstallments: MAX_INSTALLMENTS });
    if (errs.length) throw pre(errs);
    await tx.update(orderInstallments).set({ cancelledAt: new Date(), cancelReason: reason, updatedAt: new Date() })
      .where(and(eq(orderInstallments.orderId, o.id), isNull(orderInstallments.cancelledAt)));
    await tx.insert(orderInstallments).values(plan.map((p, i) => ({
      orderId: o.id, seq: i + 1, amount: p.amount, dueDate: p.dueDate, kind: p.kind ?? "installment",
      studentId: p.studentId ?? null, orderItemId: p.orderItemId ?? null, createdBy: ctx.user.id,
    })));
    await tx.update(orders).set({ updatedAt: new Date() }).where(eq(orders.id, o.id));
    const label = `${plan.some((p) => p.kind === "deposit") ? "cọc + " : ""}${plan.filter((p) => p.kind !== "deposit").length} đợt`;
    await tx.insert(orderEvents).values({ orderId: o.id, event: "plan_changed", note: `Lưu kế hoạch ${label}: ${reason}`, actorId: ctx.user.id });
    await writeAudit(tx, {
      actorId: ctx.user.id, action: "UPDATE", module: "finance", entity: "order_installments", entityId: o.id,
      before: { plan: current.map((x) => ({ seq: x.seq, amount: x.amount, dueDate: x.dueDate, kind: x.kind, paid: x.paid })) },
      after: { plan: plan.map((p, i) => ({ seq: i + 1, amount: p.amount, dueDate: p.dueDate, kind: p.kind ?? "installment" })) },
      reason, ip: ctx.ip,
    });
    return { ok: true, installments: plan.length };
  });
}

/** Đợt riêng cho một con (đơn nhiều con) — tạo tại chỗ ở trang đơn hoặc màn đối soát */
export async function createInstallmentForChild(ctx: ProtectedContext, input: { orderId: string; orderItemId: string; amount: number; dueDate?: string | null; note?: string | null }) {
  const o = await loadOrder(ctx, input.orderId, "finance:create");
  if (o.status === "cancelled" || o.status === "refunded") throw pre("Đơn đã đóng");
  const amount = Math.round(input.amount);
  if (!Number.isInteger(amount) || amount <= 0) throw bad("Số tiền đợt phải > 0");
  const item = await ctx.db.query.orderItems.findFirst({ where: and(eq(orderItems.id, input.orderItemId), eq(orderItems.orderId, o.id)) });
  if (!item) throw bad("Dòng đơn không thuộc đơn này");
  return ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"order:" + o.id}))`);
    const open = await tx.select({ n: sql<number>`coalesce(sum(${orderInstallments.amount}), 0)::bigint` }).from(orderInstallments)
      .where(and(eq(orderInstallments.orderId, o.id), isNull(orderInstallments.cancelledAt)));
    if (Number(open[0]?.n ?? 0) + amount > o.total) throw pre(`Các đợt đang mở đã phủ hết ${formatVnd(o.total)} của đơn — sửa kế hoạch thay vì thêm đợt`);
    const [m] = await tx.select({ n: sql<number>`coalesce(max(${orderInstallments.seq}), 0)::int` }).from(orderInstallments).where(eq(orderInstallments.orderId, o.id));
    const [row] = await tx.insert(orderInstallments).values({
      orderId: o.id, seq: (m?.n ?? 0) + 1, amount, dueDate: input.dueDate ?? addDays(todayISO(), 30),
      kind: "installment", studentId: item.studentId, orderItemId: item.id, createdBy: ctx.user.id,
    }).returning({ id: orderInstallments.id });
    await tx.insert(orderEvents).values({ orderId: o.id, event: "installment_added", note: `${formatVnd(amount)} cho ${item.description}${input.note ? ` · ${input.note}` : ""}`, actorId: ctx.user.id });
    await writeAudit(tx, { actorId: ctx.user.id, action: "CREATE", module: "finance", entity: "order_installments", entityId: row!.id, after: { orderId: o.id, orderItemId: item.id, amount }, ip: ctx.ip });
    return { id: row!.id };
  });
}

export async function cancelInstallment(ctx: ProtectedContext, input: { installmentId: string; reason: string }) {
  const inst = await ctx.db.query.orderInstallments.findFirst({ where: eq(orderInstallments.id, input.installmentId) });
  if (!inst) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy đợt thanh toán" });
  const o = await loadOrder(ctx, inst.orderId, "finance:create");
  const reason = reasonOrThrow(input.reason);
  if (inst.cancelledAt) throw pre("Đợt đã huỷ");
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"order:" + o.id}))`);
    const [c] = await tx.select({ n: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint` }).from(payments).where(and(eq(payments.orderId, o.id), eq(payments.status, "confirmed")));
    const state = await installmentState(tx, o.id, Number(c?.n ?? 0), todayISO());
    const me = state.find((x) => x.id === inst.id);
    if (me && me.paid > 0) throw pre(`Đợt ${inst.seq} đã thu ${formatVnd(me.paid)} — không huỷ được`);
    await tx.update(orderInstallments).set({ cancelledAt: new Date(), cancelReason: reason, updatedAt: new Date() }).where(eq(orderInstallments.id, inst.id));
    await tx.insert(orderEvents).values({ orderId: o.id, event: "installment_cancelled", note: `Đợt ${inst.seq} · ${formatVnd(inst.amount)}: ${reason}`, actorId: ctx.user.id });
    await writeAudit(tx, { actorId: ctx.user.id, action: "DELETE", module: "finance", entity: "order_installments", entityId: inst.id, before: { seq: inst.seq, amount: inst.amount }, reason, ip: ctx.ip });
  });
  return { ok: true };
}

/** Công nợ theo con: Σ net của dòng − khoản thu đã rót vào dòng đó */
export async function childDebtsOf(db: Db, orderId: string) {
  const items = await db.select({ i: orderItems, studentName: students.fullName, classCode: classes.code })
    .from(orderItems).leftJoin(students, eq(students.id, orderItems.studentId))
    .leftJoin(enrollments, eq(enrollments.id, orderItems.enrollmentId)).leftJoin(classes, eq(classes.id, enrollments.classId))
    .where(eq(orderItems.orderId, orderId));
  const pays = await db.select({ orderItemId: payments.orderItemId, status: payments.status, amount: payments.amount })
    .from(payments).where(and(eq(payments.orderId, orderId), inArray(payments.status, ["confirmed", "recorded"])));
  const insts = await db.select().from(orderInstallments).where(and(eq(orderInstallments.orderId, orderId), isNull(orderInstallments.cancelledAt)));
  const unassigned = pays.filter((p) => !p.orderItemId);
  return {
    unassigned: {
      confirmed: unassigned.filter((p) => p.status === "confirmed").reduce((s, p) => s + p.amount, 0),
      pending: unassigned.filter((p) => p.status === "recorded").reduce((s, p) => s + p.amount, 0),
    },
    items: items.map((x) => {
      const mine = pays.filter((p) => p.orderItemId === x.i.id);
      const confirmed = mine.filter((p) => p.status === "confirmed").reduce((s, p) => s + p.amount, 0);
      const pending = mine.filter((p) => p.status === "recorded").reduce((s, p) => s + p.amount, 0);
      const openInstallments = insts.filter((p) => p.orderItemId === x.i.id);
      return {
        orderItemId: x.i.id, description: x.i.description, studentId: x.i.studentId, studentName: x.studentName, classCode: x.classCode,
        leadChildId: x.i.leadChildId, enrollmentId: x.i.enrollmentId, classFormat: x.i.classFormat, packageSessions: x.i.packageSessions,
        gross: x.i.amount, discount: x.i.discountAmount, net: x.i.netAmount, confirmed, pending,
        outstanding: Math.max(0, x.i.netAmount - confirmed),
        covered: openInstallments.reduce((s, p) => s + p.amount, 0),
        installments: openInstallments.map((p) => ({ id: p.id, seq: p.seq, amount: p.amount, dueDate: p.dueDate, kind: p.kind })),
      };
    }),
  };
}

async function loadOrder(ctx: ProtectedContext, id: string, perm: Permission = "finance:read") {
  const o = await ctx.db.query.orders.findFirst({ where: eq(orders.id, id) });
  if (!o) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy đơn hàng" });
  assertTenant(ctx, o, "Đơn hàng");
  // Trung tâm không chia sẻ chi tiết tài chính: người ngoài không mở được từng đơn
  if (!canSeeFinanceDetailOf(ctx, o.tenantId)) throw new TRPCError({ code: "FORBIDDEN", message: "Trung tâm này chỉ chia sẻ số liệu tài chính tổng hợp" });
  requirePermission(ctx, perm, { centerId: o.centerId });
  return o;
}

/**
 * Gửi email đơn hàng cho khách (mẫu ORDER_CREATED): dòng đơn, tổng tiền, hạn đợt đầu,
 * liên kết xem đơn + QR chuyển khoản. Email vào hàng đợi, worker gửi.
 */
export async function sendOrderEmail(ctx: ProtectedContext, input: { orderId: string; to?: string | null }) {
  const o = await loadOrder(ctx, input.orderId, "finance:create");
  const to = (input.to ?? o.customerEmail ?? "").trim();
  if (!isEmail(to)) throw bad("Đơn chưa có email khách hợp lệ — nhập email để gửi");
  const [center, items, plan] = await Promise.all([
    ctx.db.query.centers.findFirst({ where: eq(centers.id, o.centerId), columns: { code: true, name: true } }),
    ctx.db.select({ description: orderItems.description, studentName: students.fullName }).from(orderItems).leftJoin(students, eq(students.id, orderItems.studentId)).where(eq(orderItems.orderId, o.id)),
    ctx.db.select({ dueDate: orderInstallments.dueDate }).from(orderInstallments).where(and(eq(orderInstallments.orderId, o.id), isNull(orderInstallments.cancelledAt))).orderBy(asc(orderInstallments.seq)).limit(1),
  ]);
  const con = [...new Set(items.map((i) => i.studentName).filter((x): x is string => !!x))].join(", ") || items.map((i) => i.description).join("; ").slice(0, 120) || "học viên";
  const id = await queueEmail(ctx.db, {
    to, event: "ORDER_CREATED",
    vars: { ten_ph: o.customerName, ma_don: o.code, so_tien: formatVnd(o.total), con, co_so: center?.name ?? center?.code ?? "", han_dau: plan[0]?.dueDate?.split("-").reverse().join("/") ?? "theo thoả thuận", link: `/orders/${o.id}` },
    relatedType: "order", relatedId: o.id, createdBy: ctx.user.id, tenantId: o.tenantId ?? ctx.tenantId,
  });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "finance", entity: "email_logs", entityId: id, after: { orderId: o.id, orderCode: o.code, to }, ip: ctx.ip });
  return { ok: true, to };
}

export async function getOrder(ctx: ProtectedContext, id: string) {
  const o = await loadOrder(ctx, id);
  const today = todayISO();
  const [center, method, priv, items, plan, pays, refs, events, ledger, creator, student, enrollment] = await Promise.all([
    ctx.db.query.centers.findFirst({ where: eq(centers.id, o.centerId), columns: { id: true, code: true, name: true } }),
    o.paymentMethodId ? ctx.db.query.paymentMethods.findFirst({ where: eq(paymentMethods.id, o.paymentMethodId) }) : null,
    ctx.db.query.orderPrivate.findFirst({ where: eq(orderPrivate.orderId, o.id) }),
    ctx.db.select({ i: orderItems, courseCode: courses.code, studentName: students.fullName }).from(orderItems).leftJoin(courses, eq(courses.id, orderItems.courseId)).leftJoin(students, eq(students.id, orderItems.studentId)).where(eq(orderItems.orderId, o.id)),
    ctx.db.select().from(orderInstallments).where(and(eq(orderInstallments.orderId, o.id), isNull(orderInstallments.cancelledAt))).orderBy(asc(orderInstallments.seq)),
    ctx.db.select({ p: payments, methodName: paymentMethods.name, recorder: sql<string | null>`(select full_name from ${users} u where u.id = ${payments.recordedBy})`, decider: sql<string | null>`(select full_name from ${users} u where u.id = ${payments.decidedBy})` })
      .from(payments).leftJoin(paymentMethods, eq(paymentMethods.id, payments.paymentMethodId)).where(eq(payments.orderId, o.id)).orderBy(desc(payments.recordedAt)),
    ctx.db.select().from(refunds).where(eq(refunds.orderId, o.id)).orderBy(desc(refunds.createdAt)),
    ctx.db.select({ e: orderEvents, actorName: users.fullName }).from(orderEvents).leftJoin(users, eq(users.id, orderEvents.actorId)).where(eq(orderEvents.orderId, o.id)).orderBy(desc(orderEvents.createdAt)),
    ctx.db.select({ l: financeLedger, actorName: users.fullName }).from(financeLedger).leftJoin(users, eq(users.id, financeLedger.actorId)).where(eq(financeLedger.orderId, o.id)).orderBy(asc(financeLedger.createdAt)),
    o.createdBy ? ctx.db.query.users.findFirst({ where: eq(users.id, o.createdBy), columns: { fullName: true } }) : null,
    o.studentId ? ctx.db.query.students.findFirst({ where: eq(students.id, o.studentId), columns: { id: true, code: true, fullName: true } }) : null,
    o.enrollmentId
      ? ctx.db.select({ id: enrollments.id, status: enrollments.status, packageSessions: enrollments.packageSessions, classId: classes.id, classCode: classes.code, consumed: consumedSql })
          .from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).where(eq(enrollments.id, o.enrollmentId)).then((r) => r[0] ?? null)
      : null,
  ]);
  const lead = o.leadId ? await ctx.db.query.leads.findFirst({ where: eq(leads.id, o.leadId), columns: { id: true, parentName: true, status: true } }) : null;
  const childDebts = await childDebtsOf(ctx.db, o.id);
  const itemDiscounts = items.length
    ? await ctx.db.select().from(orderItemDiscounts).where(inArray(orderItemDiscounts.orderItemId, items.map((x) => x.i.id)))
    : [];
  const refundedPaid = refs.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount, 0);
  const bal = orderBalance(o.total, pays.map((p) => ({ amount: p.p.amount, status: p.p.status })), refundedPaid);
  const installments = allocateInstallments(plan.map((p) => ({ seq: p.seq, amount: p.amount, dueDate: p.dueDate, kind: p.kind })), bal.confirmed, today)
    .map((a) => ({ ...a, id: plan.find((p) => p.seq === a.seq)?.id ?? null, studentId: plan.find((p) => p.seq === a.seq)?.studentId ?? null, orderItemId: plan.find((p) => p.seq === a.seq)?.orderItemId ?? null }));
  const display = orderDisplayState({
    status: o.status, total: o.total, confirmed: bal.confirmed, pending: bal.pending,
    installments: plan.filter((p) => p.kind !== "deposit").length, paidInstallments: installments.filter((i) => i.state === "paid").length,
  });
  const memo = transferMemo(o.code);
  // Ảnh QR động (không hạn dùng) — giữ cho cổng phụ huynh và dữ liệu cũ.
  // Trang đơn của nhân sự dùng mã có hạn ở `orderQrState` / `issueOrderQr`.
  const qr = method?.kind === "bank_transfer" && method.bankBin && method.accountNo && bal.outstanding > 0 && o.status !== "cancelled"
    ? { url: vietQrImageUrl({ bankBin: method.bankBin, accountNo: method.accountNo, accountName: method.accountName, amount: installments.find((i) => i.remaining > 0)?.remaining ?? bal.outstanding, memo }), bankName: method.bankName, accountNo: method.accountNo, accountName: method.accountName, memo }
    : null;
  const canConfirm = can(ctx, "finance:confirm", o.centerId);
  return {
    ...o,
    center, method: method ? { id: method.id, name: method.name, kind: method.kind } : null,
    customerPrivate: priv ? { idNumber: maskIdNumber(priv.idNumber), address: priv.address ? `${priv.address.slice(0, 4)}…` : null, province: priv.province, ward: priv.ward, hasIdNumber: !!priv.idNumber } : null,
    items: items.map((x) => ({ ...x.i, courseCode: x.courseCode, studentName: x.studentName, discounts: itemDiscounts.filter((d) => d.orderItemId === x.i.id) })),
    installments,
    display,
    childDebts,
    nextDue: installments.find((i) => i.remaining > 0) ?? null,
    payments: pays.map((x) => ({ ...x.p, methodName: x.methodName, recorderName: x.recorder, deciderName: x.decider })),
    refunds: refs,
    events: events.map((x) => ({ ...x.e, actorName: x.actorName })),
    ledger: ledger.map((x) => ({ ...x.l, actorName: x.actorName })),
    balance: bal,
    qr,
    creatorName: creator?.fullName ?? null,
    student: student ?? null,
    enrollment,
    lead: lead ?? null,
    cancelBlock: canCancelOrder(o.status, bal.confirmed, bal.pending),
    perms: {
      create: can(ctx, "finance:create", o.centerId),
      confirm: canConfirm,
      approve: can(ctx, "finance:approve", o.centerId),
      cancel: can(ctx, "finance:approve", o.centerId) || canConfirm,
    },
    today,
  };
}

/* ------------------------------------------------------------------ */
/* Mã QR chuyển khoản có hạn dùng                                      */
/* ------------------------------------------------------------------ */

/** Tài khoản nhận tiền của đơn (phương thức chuyển khoản của đơn, hoặc phương thức chuyển khoản của cơ sở) */
async function qrAccountFor(db: Db, o: { paymentMethodId: string | null; centerId: string }) {
  const own = o.paymentMethodId ? await db.query.paymentMethods.findFirst({ where: eq(paymentMethods.id, o.paymentMethodId) }) : null;
  if (own?.kind === "bank_transfer" && own.bankBin && own.accountNo) return own;
  const rows = await db.select().from(paymentMethods)
    .where(and(eq(paymentMethods.isActive, true), eq(paymentMethods.kind, "bank_transfer"), or(isNull(paymentMethods.centerId), eq(paymentMethods.centerId, o.centerId))!))
    .orderBy(asc(paymentMethods.sortOrder));
  return rows.find((m) => m.bankBin && m.accountNo && m.centerId === o.centerId) ?? rows.find((m) => m.bankBin && m.accountNo) ?? null;
}

/** Số tiền của mã QR: đợt còn nợ gần nhất (hoặc đợt được chỉ định), không có kế hoạch thì lấy phần còn thiếu của đơn */
async function qrAmountFor(db: Db, orderId: string, installmentId: string | null, today: string) {
  const o = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!o) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy đơn" });
  const pays = await db.select({ amount: payments.amount, status: payments.status }).from(payments).where(eq(payments.orderId, orderId));
  const bal = orderBalance(o.total, pays);
  const plan = await installmentState(db, orderId, bal.confirmed, today);
  if (installmentId) {
    const row = plan.find((p) => p.id === installmentId);
    if (!row) throw bad("Đợt không thuộc đơn này hoặc đã huỷ");
    if (row.remaining <= 0) throw pre("Đợt này đã thu đủ — không cần xuất QR");
    return { order: o, amount: row.remaining, installmentId, label: row.kind === "deposit" ? "Cọc" : `Đợt ${row.seq}` };
  }
  const due = plan.find((p) => p.remaining > 0);
  return { order: o, amount: due?.remaining ?? bal.outstanding, installmentId: due?.id ?? null, label: due ? (due.kind === "deposit" ? "Cọc" : `Đợt ${due.seq}`) : "Thu toàn bộ đơn" };
}

/**
 * Trạng thái QR của đơn: mã còn hiệu lực đúng số tiền thì dùng lại, hết hạn thì phải xuất mã mới.
 * Hạn dùng lấy từ cấu hình vận hành `qrTtlHours` (mặc định 24 giờ).
 */
export async function orderQrState(ctx: ProtectedContext, input: { orderId: string; installmentId?: string | null }) {
  const o = await loadOrder(ctx, input.orderId);
  const today = todayISO();
  const now = new Date();
  const ops = await getOps(ctx.db, o.centerId);
  const ttlHours = ops.qrTtlHours ?? DEFAULT_QR_TTL_HOURS;
  const { amount, installmentId, label } = await qrAmountFor(ctx.db, o.id, input.installmentId ?? null, today);
  const rows = await ctx.db.select().from(paymentQrCodes).where(eq(paymentQrCodes.orderId, o.id)).orderBy(desc(paymentQrCodes.issuedAt));
  const st = qrState(rows, amount, now);
  const r = st.reuse;
  const closed = o.status === "cancelled" || o.status === "refunded";
  return {
    orderId: o.id,
    amount,
    installmentId,
    installmentLabel: label,
    ttlHours,
    label: st.label,
    hasExpired: st.hasExpired,
    canIssue: st.canIssue && !closed && can(ctx, "finance:create", o.centerId),
    reusing: !!r,
    current: r
      ? {
          id: r.id, amount: r.amount, content: r.content, imageUrl: r.imageUrl,
          bankName: r.bankName, accountNo: r.accountNo, accountName: r.accountName,
          issuedAt: r.issuedAt.toISOString(), expiresAt: r.expiresAt.toISOString(),
        }
      : null,
    history: rows.map((h) => ({
      id: h.id, amount: h.amount, content: h.content, status: h.status,
      issuedAt: h.issuedAt.toISOString(), expiresAt: h.expiresAt.toISOString(), usedAt: h.usedAt?.toISOString() ?? null,
      expired: qrExpired(now, h.expiresAt),
    })),
    now: now.toISOString(),
  };
}

/**
 * Xuất mã QR cho đơn / đợt. Dùng lại mã còn hiệu lực đúng số tiền (bản gốc: "Đang dùng lại mã QR
 * còn hiệu lực"); `force` = xuất mã mới và thu hồi mã cũ cùng số tiền.
 */
export async function issueOrderQr(ctx: ProtectedContext, input: { orderId: string; installmentId?: string | null; force?: boolean }) {
  const o = await loadOrder(ctx, input.orderId, "finance:create");
  requirePermission(ctx, "finance:create", { centerId: o.centerId });
  if (o.status === "cancelled" || o.status === "refunded") throw pre("Đơn đã đóng — không xuất mã QR");
  const today = todayISO();
  const now = new Date();
  const ops = await getOps(ctx.db, o.centerId);
  const ttlHours = ops.qrTtlHours ?? DEFAULT_QR_TTL_HOURS;
  const { amount, installmentId, label } = await qrAmountFor(ctx.db, o.id, input.installmentId ?? null, today);
  if (amount <= 0) throw pre("Đơn đã thu đủ — không cần mã QR");
  const method = await qrAccountFor(ctx.db, o);
  if (!method?.bankBin || !method.accountNo) throw pre("Chưa khai tài khoản nhận tiền cho cơ sở — vào Cấu hình vận hành › Phương thức thanh toán");

  return ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"order-qr:" + o.id}))`);
    // Đánh dấu hết hạn cho mã đã quá hạn trước khi xét dùng lại
    await tx.update(paymentQrCodes).set({ status: "expired" })
      .where(and(eq(paymentQrCodes.orderId, o.id), eq(paymentQrCodes.status, "active"), lte(paymentQrCodes.expiresAt, now)));
    const rows = await tx.select().from(paymentQrCodes).where(eq(paymentQrCodes.orderId, o.id)).orderBy(desc(paymentQrCodes.issuedAt));
    const st = qrState(rows, amount, now);
    if (st.reuse && !input.force) {
      const r = st.reuse;
      return { id: r.id, amount: r.amount, content: r.content, imageUrl: r.imageUrl, expiresAt: r.expiresAt.toISOString(), reused: true, label: QR_REUSE_LABEL };
    }
    if (input.force) {
      await tx.update(paymentQrCodes).set({ status: "revoked", revokedReason: "Xuất lại mã mới" })
        .where(and(eq(paymentQrCodes.orderId, o.id), eq(paymentQrCodes.status, "active")));
    }
    const content = transferMemo(o.code);
    const imageUrl = vietQrImageUrl({ bankBin: method.bankBin!, accountNo: method.accountNo!, accountName: method.accountName, amount, memo: content });
    const expiresAt = qrExpiresAt(now, ttlHours);
    const [q] = await tx.insert(paymentQrCodes).values({
      orderId: o.id, installmentId, paymentMethodId: method.id, amount, content, imageUrl,
      bankBin: method.bankBin, accountNo: method.accountNo, accountName: method.accountName, bankName: method.bankName,
      status: "active", issuedBy: ctx.user.id, issuedAt: now, expiresAt,
    }).returning({ id: paymentQrCodes.id });
    await tx.insert(orderEvents).values({ orderId: o.id, event: "qr_issued", note: `${label} · ${formatVnd(amount)} · hạn ${ttlHours} giờ`, actorId: ctx.user.id });
    await writeAudit(tx, {
      actorId: ctx.user.id, action: "CREATE", module: "finance", entity: "payment_qr_codes", entityId: q!.id,
      after: { orderId: o.id, orderCode: o.code, amount, content, expiresAt: expiresAt.toISOString(), installmentId }, ip: ctx.ip,
    });
    return { id: q!.id, amount, content, imageUrl, expiresAt: expiresAt.toISOString(), reused: false, label: null };
  });
}

/** Thu hồi mã QR (ẩn mã đang hiện) */
export async function revokeOrderQr(ctx: ProtectedContext, input: { qrId: string; reason?: string | null }) {
  const q = await ctx.db.query.paymentQrCodes.findFirst({ where: eq(paymentQrCodes.id, input.qrId) });
  if (!q) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy mã QR" });
  const o = await loadOrder(ctx, q.orderId, "finance:create");
  requirePermission(ctx, "finance:create", { centerId: o.centerId });
  if (q.status !== "active") throw pre(`Mã QR đang "${q.status}" — không thu hồi được`);
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.update(paymentQrCodes).set({ status: "revoked", revokedReason: input.reason?.trim() || "Ẩn mã QR" }).where(and(eq(paymentQrCodes.id, q.id), eq(paymentQrCodes.status, "active")));
    await writeAudit(tx, { actorId: ctx.user.id, action: "UPDATE", module: "finance", entity: "payment_qr_codes", entityId: q.id, before: { status: q.status }, after: { status: "revoked" }, reason: input.reason ?? null, ip: ctx.ip });
  });
  return { ok: true };
}

/** Đánh dấu mã QR đã dùng khi tiền về khớp đúng số tiền của mã (gọi trong transaction đối soát) */
export async function markQrUsed(tx: Db, orderId: string, amount: number, paymentId: string) {
  const now = new Date();
  const rows = await tx.select().from(paymentQrCodes)
    .where(and(eq(paymentQrCodes.orderId, orderId), eq(paymentQrCodes.status, "active"), eq(paymentQrCodes.amount, amount)))
    .orderBy(asc(paymentQrCodes.expiresAt));
  const hit = rows.find((r) => !qrExpired(now, r.expiresAt));
  if (!hit) return 0;
  await tx.update(paymentQrCodes).set({ status: "used", usedAt: now, usedPaymentId: paymentId }).where(and(eq(paymentQrCodes.id, hit.id), eq(paymentQrCodes.status, "active")));
  return 1;
}

export async function cancelOrder(ctx: ProtectedContext, input: { id: string; reason: string }) {
  const o = await loadOrder(ctx, input.id);
  if (!can(ctx, "finance:approve", o.centerId) && !can(ctx, "finance:confirm", o.centerId)) throw new TRPCError({ code: "FORBIDDEN", message: "Chỉ quản lý cơ sở hoặc kế toán được huỷ đơn" });
  const reason = reasonOrThrow(input.reason);
  const pays = await ctx.db.select({ amount: payments.amount, status: payments.status }).from(payments).where(eq(payments.orderId, o.id));
  const bal = orderBalance(o.total, pays);
  const block = canCancelOrder(o.status, bal.confirmed, bal.pending);
  if (block) throw pre(block);
  await ctx.db.transaction(async (tx) => {
    await tx.update(orders).set({ status: "cancelled", cancelReason: reason }).where(eq(orders.id, o.id));
    await tx.insert(orderEvents).values({ orderId: o.id, event: "cancel", fromStatus: o.status, toStatus: "cancelled", note: reason, actorId: ctx.user.id });
    if (o.total > 0) await tx.insert(financeLedger).values({ orderId: o.id, centerId: o.centerId, entryType: "cancel", amount: -o.total, refId: o.id, note: `Huỷ đơn: ${reason}`, actorId: ctx.user.id });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "finance", entity: "orders", entityId: o.id, before: { status: o.status }, after: { status: "cancelled" }, reason, ip: ctx.ip });
  });
  const restocked = o.type === "product" ? await (await import("./inventory")).restockOrder(ctx.db, o.id, ctx.user.id, `Huỷ đơn ${o.code}: ${reason}`) : 0;
  return { ok: true, restocked };
}

export async function updateOrderNotes(ctx: ProtectedContext, input: { id: string; internalNote?: string | null; customerNote?: string | null; remindDays?: number }) {
  const o = await loadOrder(ctx, input.id, "finance:create");
  const after = {
    ...(input.internalNote !== undefined ? { internalNote: input.internalNote?.trim() || null } : {}),
    ...(input.customerNote !== undefined ? { customerNote: input.customerNote?.trim() || null } : {}),
    ...(input.remindDays !== undefined ? { remindDays: input.remindDays } : {}),
  };
  await ctx.db.update(orders).set(after).where(eq(orders.id, o.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "finance", entity: "orders", entityId: o.id, before: { internalNote: o.internalNote, customerNote: o.customerNote, remindDays: o.remindDays }, after, ip: ctx.ip });
  return { ok: true };
}

/** Xem CCCD / địa chỉ đầy đủ — chỉ kế toán, bắt buộc lý do, ghi nhật ký */
export async function revealCustomerPrivate(ctx: ProtectedContext, input: { id: string; reason: string }) {
  const o = await loadOrder(ctx, input.id, "finance:confirm");
  const reason = reasonOrThrow(input.reason);
  const priv = await ctx.db.query.orderPrivate.findFirst({ where: eq(orderPrivate.orderId, o.id) });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "PII_REVEAL", module: "finance", entity: "order_private", entityId: o.id, reason, ip: ctx.ip });
  return { idNumber: priv?.idNumber ?? null, address: priv?.address ?? null, province: priv?.province ?? null, ward: priv?.ward ?? null };
}

/* ------------------------------------------------------------------ */
/* Khoản thu                                                           */
/* ------------------------------------------------------------------ */

const EVIDENCE_RE = /^https:\/\/\S+$/;

/** Dòng đơn + ghi danh của khoản thu phải thuộc đúng đơn */
async function checkPaymentTarget(db: Db, orderId: string, input: { enrollmentId?: string | null; orderItemId?: string | null }) {
  let orderItemId: string | null = input.orderItemId ?? null;
  let enrollmentId: string | null = input.enrollmentId ?? null;
  if (orderItemId) {
    const it = await db.query.orderItems.findFirst({ where: and(eq(orderItems.id, orderItemId), eq(orderItems.orderId, orderId)) });
    if (!it) throw bad("Dòng đơn không thuộc đơn này");
    enrollmentId = enrollmentId ?? it.enrollmentId;
  } else if (enrollmentId) {
    const it = await db.query.orderItems.findFirst({ where: and(eq(orderItems.orderId, orderId), eq(orderItems.enrollmentId, enrollmentId)) });
    orderItemId = it?.id ?? null;
  }
  return { orderItemId, enrollmentId };
}

export async function recordPayment(ctx: ProtectedContext, input: { orderId: string; amount: number; paymentMethodId: string; paidAt: string; payerName?: string | null; note?: string | null; enrollmentId?: string | null; orderItemId?: string | null; evidenceUrl?: string | null }) {
  const o = await loadOrder(ctx, input.orderId, "finance:create");
  if (o.status === "cancelled" || o.status === "refunded") throw pre("Đơn đã đóng — không ghi nhận thu");
  const amount = Math.round(input.amount);
  if (amount <= 0) throw bad("Số tiền phải > 0");
  const today = todayISO();
  if (input.paidAt > today) throw bad("Ngày thu không được ở tương lai");
  if (input.paidAt < addDays(today, -90)) throw bad("Ngày thu quá 90 ngày — dùng Nhập giao dịch cũ");
  if (input.evidenceUrl?.trim() && !EVIDENCE_RE.test(input.evidenceUrl.trim())) throw bad("Link chứng từ phải bắt đầu bằng https://");
  const method = await ctx.db.query.paymentMethods.findFirst({ where: eq(paymentMethods.id, input.paymentMethodId) });
  if (!method || !method.isActive || (method.centerId && method.centerId !== o.centerId)) throw bad("Phương thức thanh toán không hợp lệ cho đơn này");
  const target = await checkPaymentTarget(ctx.db, o.id, input);
  const id = await ctx.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"order:" + o.id}))`);
    const pays = await tx.select({ amount: payments.amount, status: payments.status }).from(payments).where(eq(payments.orderId, o.id));
    const bal = orderBalance(o.total, pays);
    const room = bal.outstanding - bal.pending;
    if (amount > room) throw pre(`Số tiền vượt phần còn phải thu (${formatVnd(Math.max(0, room))}, đã trừ ${formatVnd(bal.pending)} đang chờ xác nhận)`);
    const [p] = await tx.insert(payments).values({
      orderId: o.id, centerId: o.centerId, recordedAmount: amount, amount, paymentMethodId: method.id, paidAt: input.paidAt, status: "recorded",
      payerName: input.payerName?.trim() || null, note: input.note?.trim() || null, recordedBy: ctx.user.id,
      enrollmentId: target.enrollmentId, orderItemId: target.orderItemId, evidenceUrl: input.evidenceUrl?.trim() || null,
    }).returning({ id: payments.id });
    await tx.insert(orderEvents).values({ orderId: o.id, event: "payment_recorded", note: `${formatVnd(amount)} · ${method.name}`, actorId: ctx.user.id });
    await notify(tx as unknown as Db, await accountantsOf(tx as unknown as Db, o.centerId), "Khoản thu chờ xác nhận", `${o.code} · ${formatVnd(amount)} · ${o.customerName}`, "/payments?status=recorded", 2, "payment.pending");
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "finance", entity: "payments", entityId: p!.id, after: { orderId: o.id, amount, method: method.code, paidAt: input.paidAt, orderItemId: target.orderItemId }, ip: ctx.ip });
    return p!.id;
  });
  return { id };
}

/** Sửa khoản đang chờ kế toán (người ghi nhận hoặc kế toán) — chống ghi đè bằng version */
export async function updatePendingPayment(ctx: ProtectedContext, input: {
  paymentId: string; amount?: number | null; paidAt?: string | null; paymentMethodId?: string | null;
  note?: string | null; evidenceUrl?: string | null; enrollmentId?: string | null; orderItemId?: string | null; payerName?: string | null; version: number;
}) {
  const p = await ctx.db.query.payments.findFirst({ where: eq(payments.id, input.paymentId) });
  if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy khoản thu" });
  requirePermission(ctx, "finance:read", { centerId: p.centerId });
  const isAccountant = can(ctx, "finance:confirm", p.centerId);
  if (!isAccountant && p.recordedBy !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Chỉ người ghi nhận hoặc kế toán mới sửa được khoản đang chờ" });
  if (p.status !== "recorded") throw pre("Chỉ sửa được khoản đang chờ kế toán — khoản đã xử lý dùng Điều chỉnh");
  const o = await ctx.db.query.orders.findFirst({ where: eq(orders.id, p.orderId) });
  if (!o) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy đơn" });
  const today = todayISO();
  const amount = input.amount == null ? p.amount : Math.round(input.amount);
  if (amount <= 0) throw bad("Số tiền phải > 0");
  const paidAt = input.paidAt ?? p.paidAt;
  if (paidAt > today) throw bad("Ngày thu không được ở tương lai");
  if (input.evidenceUrl?.trim() && !EVIDENCE_RE.test(input.evidenceUrl.trim())) throw bad("Link chứng từ phải bắt đầu bằng https://");
  let methodId = p.paymentMethodId;
  if (input.paymentMethodId && input.paymentMethodId !== p.paymentMethodId) {
    const m = await ctx.db.query.paymentMethods.findFirst({ where: eq(paymentMethods.id, input.paymentMethodId) });
    if (!m || !m.isActive || (m.centerId && m.centerId !== p.centerId)) throw bad("Phương thức thanh toán không hợp lệ cho đơn này");
    methodId = m.id;
  }
  const target = await checkPaymentTarget(ctx.db, p.orderId, { enrollmentId: input.enrollmentId ?? p.enrollmentId, orderItemId: input.orderItemId ?? p.orderItemId });
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"order:" + o.id}))`);
    const others = await tx.select({ amount: payments.amount, status: payments.status }).from(payments).where(and(eq(payments.orderId, o.id), ne(payments.id, p.id)));
    const bal = orderBalance(o.total, others);
    const room = bal.outstanding - bal.pending;
    if (amount > room) throw pre(`Số tiền vượt phần còn phải thu (${formatVnd(Math.max(0, room))})`);
    const up = await tx.update(payments).set({
      amount, recordedAmount: amount, paidAt, paymentMethodId: methodId, note: input.note === undefined ? p.note : input.note?.trim() || null,
      payerName: input.payerName === undefined ? p.payerName : input.payerName?.trim() || null,
      evidenceUrl: input.evidenceUrl === undefined ? p.evidenceUrl : input.evidenceUrl?.trim() || null,
      enrollmentId: target.enrollmentId, orderItemId: target.orderItemId, version: p.version + 1,
    }).where(and(eq(payments.id, p.id), eq(payments.status, "recorded"), eq(payments.version, input.version))).returning({ id: payments.id });
    if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "STALE_WRITE — khoản thu vừa được sửa hoặc xử lý, tải lại rồi thao tác tiếp" });
    if (amount !== p.amount || paidAt !== p.paidAt) {
      await tx.insert(orderEvents).values({ orderId: o.id, event: "payment_updated", note: `${formatVnd(p.amount)} → ${formatVnd(amount)}${paidAt !== p.paidAt ? ` · ngày ${paidAt}` : ""}`, actorId: ctx.user.id });
    }
    await writeAudit(tx, { actorId: ctx.user.id, action: "UPDATE", module: "finance", entity: "payments", entityId: p.id, before: { amount: p.amount, paidAt: p.paidAt, orderItemId: p.orderItemId }, after: { amount, paidAt, orderItemId: target.orderItemId }, ip: ctx.ip });
  });
  return { ok: true, version: p.version + 1 };
}

/**
 * Điều chỉnh khoản ĐÃ xác nhận: sinh bút toán chênh lệch trong sổ cái và một dòng payment_adjustments.
 * Chỉ kế toán; luôn cần lý do.
 */
export async function adjustConfirmedPayment(ctx: ProtectedContext, input: { paymentId: string; newAmount: number; reason: string; version: number }) {
  const p = await ctx.db.query.payments.findFirst({ where: eq(payments.id, input.paymentId) });
  if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy khoản thu" });
  requirePermission(ctx, "finance:confirm", { centerId: p.centerId });
  if (p.status !== "confirmed") throw pre("Chỉ điều chỉnh khoản kế toán đã xác nhận");
  const reason = reasonOrThrow(input.reason);
  const newAmount = Math.round(input.newAmount);
  if (!Number.isInteger(newAmount) || newAmount <= 0) throw bad("Số tiền mới phải > 0");
  if (newAmount === p.amount) throw bad("Bằng số hiện tại — không có gì để điều chỉnh");
  const o = await ctx.db.query.orders.findFirst({ where: eq(orders.id, p.orderId) });
  if (!o) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy đơn" });
  const delta = newAmount - p.amount;
  return ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"order:" + o.id}))`);
    const [c] = await tx.select({ n: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint` }).from(payments).where(and(eq(payments.orderId, o.id), eq(payments.status, "confirmed"), ne(payments.id, p.id)));
    if (Number(c?.n ?? 0) + newAmount > o.total) throw pre(`Điều chỉnh lên ${formatVnd(newAmount)} sẽ vượt tổng đơn (${formatVnd(o.total)})`);
    const up = await tx.update(payments).set({
      amount: newAmount, version: p.version + 1, adjustCount: p.adjustCount + 1,
      decisionReason: reason, decidedBy: ctx.user.id, decidedAt: new Date(),
    }).where(and(eq(payments.id, p.id), eq(payments.status, "confirmed"), eq(payments.version, input.version))).returning({ id: payments.id });
    if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "STALE_WRITE — khoản thu vừa được sửa, tải lại rồi thao tác tiếp" });
    await tx.insert(paymentAdjustments).values({ paymentId: p.id, beforeAmount: p.amount, afterAmount: newAmount, reason, actorId: ctx.user.id });
    // Bút toán chênh lệch: thu thêm là âm (tiền vào), giảm thu là dương
    await tx.insert(financeLedger).values({ orderId: o.id, centerId: o.centerId, entryType: "adjustment", amount: -delta, refId: p.id, note: `Điều chỉnh ${p.receiptNo ?? ""} ${formatVnd(p.amount)} → ${formatVnd(newAmount)}: ${reason}`.trim(), actorId: ctx.user.id });
    await tx.insert(orderEvents).values({ orderId: o.id, event: "payment_adjusted", note: `${formatVnd(p.amount)} → ${formatVnd(newAmount)} (${delta > 0 ? "+" : ""}${formatVnd(delta)}): ${reason}`, actorId: ctx.user.id });
    await recomputeOrderStatus(tx, o.id, ctx.user.id, `Điều chỉnh khoản thu ${p.receiptNo ?? ""}`.trim());
    await notify(tx, [p.recordedBy], "Khoản thu được điều chỉnh", `${o.code}: ${formatVnd(p.amount)} → ${formatVnd(newAmount)}`, `/orders/${o.id}`, 2, "payment.decided");
    await writeAudit(tx, { actorId: ctx.user.id, action: "UPDATE", module: "finance", entity: "payments", entityId: p.id, before: { amount: p.amount, adjustCount: p.adjustCount }, after: { amount: newAmount, delta, adjustCount: p.adjustCount + 1 }, reason, ip: ctx.ip });
    return { ok: true, delta, version: p.version + 1, adjustCount: p.adjustCount + 1 };
  });
}

/** Gắn ghi danh / dòng đơn cho khoản thu chưa gắn (kế toán mới xác nhận được) */
export async function attachPaymentTarget(ctx: ProtectedContext, input: { paymentId: string; enrollmentId?: string | null; orderItemId?: string | null }) {
  const p = await ctx.db.query.payments.findFirst({ where: eq(payments.id, input.paymentId) });
  if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy khoản thu" });
  requirePermission(ctx, "finance:confirm", { centerId: p.centerId });
  if (p.status === "voided" || p.status === "rejected") throw pre("Khoản thu đã đóng");
  const target = await checkPaymentTarget(ctx.db, p.orderId, input);
  if (!target.enrollmentId && !target.orderItemId) throw bad("Chọn ghi danh hoặc dòng đơn để gắn");
  await ctx.db.update(payments).set({ enrollmentId: target.enrollmentId, orderItemId: target.orderItemId, version: p.version + 1 }).where(eq(payments.id, p.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "finance", entity: "payments", entityId: p.id, before: { enrollmentId: p.enrollmentId, orderItemId: p.orderItemId }, after: target, ip: ctx.ip });
  return { ok: true };
}

export async function decidePayment(ctx: ProtectedContext, input: { paymentId: string; decision: PaymentDecision; adjustedAmount?: number | null; reason?: string | null }) {
  const p = await ctx.db.query.payments.findFirst({ where: eq(payments.id, input.paymentId) });
  if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy khoản thu" });
  requirePermission(ctx, "finance:confirm", { centerId: p.centerId });
  const errs = validatePaymentDecision({
    status: p.status, decision: input.decision, recordedBy: p.recordedBy, actorId: ctx.user.id, isSuperAdmin: hasRole(ctx.actor, "SUPER_ADMIN"),
    amount: p.amount, adjustedAmount: input.adjustedAmount ?? null, reason: input.reason,
  });
  if (errs.length) throw pre(errs);
  const o = await ctx.db.query.orders.findFirst({ where: eq(orders.id, p.orderId) });
  if (!o) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy đơn" });
  const center = await ctx.db.query.centers.findFirst({ where: eq(centers.id, p.centerId), columns: { code: true } });
  const result = await ctx.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"order:" + o.id}))`);
    if (input.decision === "reject") {
      const up = await tx.update(payments).set({ status: "rejected", decidedBy: ctx.user.id, decidedAt: new Date(), decisionReason: input.reason!.trim() }).where(and(eq(payments.id, p.id), eq(payments.status, "recorded"))).returning({ id: payments.id });
      if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Khoản thu vừa được xử lý" });
      await tx.insert(orderEvents).values({ orderId: o.id, event: "payment_rejected", note: `${formatVnd(p.amount)}: ${input.reason!.trim()}`, actorId: ctx.user.id });
      await notify(tx as unknown as Db, [p.recordedBy], "Khoản thu bị từ chối", `${o.code} · ${formatVnd(p.amount)} — ${input.reason!.trim()}`, `/orders/${o.id}`, 1, "payment.decided");
      await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "finance", entity: "payments", entityId: p.id, before: { status: "recorded" }, after: { status: "rejected" }, reason: input.reason ?? null, ip: ctx.ip });
      return { status: "rejected" as PaymentStatus, receiptNo: null as string | null };
    }
    const amount = input.decision === "adjust" ? Math.round(input.adjustedAmount!) : p.amount;
    const [c] = await tx.select({ n: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint` }).from(payments).where(and(eq(payments.orderId, o.id), eq(payments.status, "confirmed")));
    if (Number(c?.n ?? 0) + amount > o.total) throw pre(`Xác nhận ${formatVnd(amount)} sẽ vượt tổng đơn (đã thu ${formatVnd(Number(c?.n ?? 0))}/${formatVnd(o.total)}) — điều chỉnh số tiền`);
    const receiptNo = await nextReceiptNo(tx as unknown as Db, center?.code ?? "HO", Number(todayISO().slice(0, 4)));
    const up = await tx.update(payments).set({ status: "confirmed", amount, decidedBy: ctx.user.id, decidedAt: new Date(), decisionReason: input.reason?.trim() || null, receiptNo })
      .where(and(eq(payments.id, p.id), eq(payments.status, "recorded"))).returning({ id: payments.id });
    if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Khoản thu vừa được xử lý" });
    await tx.insert(financeLedger).values({ orderId: o.id, centerId: o.centerId, entryType: "payment", amount: -amount, refId: p.id, note: `${receiptNo}${input.decision === "adjust" ? ` (điều chỉnh từ ${formatVnd(p.amount)})` : ""}`, actorId: ctx.user.id });
    await tx.insert(orderEvents).values({ orderId: o.id, event: input.decision === "adjust" ? "payment_adjusted" : "payment_confirmed", note: `${receiptNo} · ${formatVnd(amount)}${input.decision === "adjust" ? ` (ghi nhận ${formatVnd(p.amount)}: ${input.reason!.trim()})` : ""}`, actorId: ctx.user.id });
    await recomputeOrderStatus(tx as unknown as Db, o.id, ctx.user.id, receiptNo);
    if (input.decision === "adjust") await notify(tx as unknown as Db, [p.recordedBy], "Khoản thu được điều chỉnh", `${o.code}: ${formatVnd(p.amount)} → ${formatVnd(amount)}`, `/orders/${o.id}`, 2, "payment.decided");
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "finance", entity: "payments", entityId: p.id, before: { status: "recorded", amount: p.amount }, after: { status: "confirmed", amount, receiptNo }, reason: input.reason ?? null, ip: ctx.ip });
    return { status: "confirmed" as PaymentStatus, receiptNo };
  });
  if (result.status === "confirmed" && o.customerEmail) {
    const amount = input.decision === "adjust" ? Math.round(input.adjustedAmount!) : p.amount;
    await queueEmail(ctx.db, { to: o.customerEmail, event: "RECEIPT_ISSUED", vars: { ten_ph: o.customerName, so_phieu: result.receiptNo, so_tien: formatVnd(amount), ma_don: o.code, co_so: center?.code ?? "" }, relatedType: "payment", relatedId: p.id, createdBy: ctx.user.id, tenantId: o.tenantId ?? ctx.tenantId }).catch((e) => logger.child("finance").error("không xếp được email phiếu thu vào hàng đợi", { err: e, paymentId: p.id }));
  }
  return result;
}

export async function listPayments(ctx: ProtectedContext, input: { status?: PaymentStatus; centerId?: string; from?: string; to?: string; q?: string; page?: number }) {
  requirePermission(ctx, "finance:read", { centerId: input.centerId ?? null });
  const conds: SQL[] = [scope(ctx, payments.centerId as unknown as typeof orders.centerId), tenantCond(ctx, payments)];
  if (input.centerId) conds.push(eq(payments.centerId, input.centerId));
  if (input.status) conds.push(eq(payments.status, input.status));
  if (input.from) conds.push(gte(payments.paidAt, input.from));
  if (input.to) conds.push(lte(payments.paidAt, input.to));
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`;
    conds.push(or(ilike(orders.code, q), ilike(orders.customerName, q), ilike(payments.receiptNo, q), ilike(students.fullName, q))!);
  }
  const where = and(...conds);
  const pageSize = 30;
  const page = Math.max(1, input.page ?? 1);
  const base = ctx.db.select({
    id: payments.id, amount: payments.amount, recordedAmount: payments.recordedAmount, status: payments.status, paidAt: payments.paidAt, receiptNo: payments.receiptNo,
    source: payments.source, note: payments.note, decisionReason: payments.decisionReason, recordedAt: payments.recordedAt, decidedAt: payments.decidedAt, recordedBy: payments.recordedBy,
    version: payments.version, adjustCount: payments.adjustCount, evidenceUrl: payments.evidenceUrl, enrollmentId: payments.enrollmentId, orderItemId: payments.orderItemId, paymentMethodId: payments.paymentMethodId,
    orderId: orders.id, orderCode: orders.code, customerName: orders.customerName, orderTotal: orders.total, centerId: payments.centerId, centerCode: centers.code,
    tenantId: payments.tenantId,
    studentName: students.fullName, classCode: classes.code, methodName: paymentMethods.name,
    recorderName: sql<string | null>`(select full_name from ${users} u where u.id = ${payments.recordedBy})`,
    deciderName: sql<string | null>`(select full_name from ${users} u where u.id = ${payments.decidedBy})`,
    idNumber: sql<string | null>`(select op.id_number from ${orderPrivate} op where op.order_id = ${orders.id})`,
    // Nguồn học viên (kênh lead) + sale phụ trách — lấy theo lead của đơn, không có lead thì lấy người lập đơn
    leadSource: sql<string | null>`(select l.source from ${leads} l where l.id = ${orders.leadId})`,
    saleName: sql<string | null>`coalesce((select u.full_name from ${leads} l join ${users} u on u.id = l.assigned_to_id where l.id = ${orders.leadId}), (select u2.full_name from ${users} u2 where u2.id = ${orders.createdBy}))`,
  })
    .from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).innerJoin(centers, eq(centers.id, payments.centerId))
    .leftJoin(students, eq(students.id, orders.studentId)).leftJoin(enrollments, eq(enrollments.id, orders.enrollmentId)).leftJoin(classes, eq(classes.id, enrollments.classId))
    .leftJoin(paymentMethods, eq(paymentMethods.id, payments.paymentMethodId));
  const rows = await base.where(where).orderBy(desc(payments.recordedAt)).limit(pageSize).offset((page - 1) * pageSize);
  const [tot] = await ctx.db.select({
    n: sql<number>`count(*)::int`,
    confirmedSum: sql<number>`coalesce(sum(${payments.amount}) filter (where ${payments.status} = 'confirmed'), 0)::bigint`,
    recordedSum: sql<number>`coalesce(sum(${payments.amount}) filter (where ${payments.status} = 'recorded'), 0)::bigint`,
  }).from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).leftJoin(students, eq(students.id, orders.studentId)).where(where);
  const [counts] = await ctx.db.select({
    recorded: sql<number>`count(*) filter (where ${payments.status} = 'recorded')::int`,
    /** Phiếu thu chờ kế toán quá 24 giờ — để hộp việc khỏi phải lọc mảng đã tải về */
    recordedOverdue: sql<number>`count(*) filter (where ${payments.status} = 'recorded' and ${payments.recordedAt} < now() - interval '24 hours')::int`,
    confirmed: sql<number>`count(*) filter (where ${payments.status} = 'confirmed')::int`,
    rejected: sql<number>`count(*) filter (where ${payments.status} = 'rejected')::int`,
    voided: sql<number>`count(*) filter (where ${payments.status} = 'voided')::int`,
  }).from(payments).where(scope(ctx, payments.centerId as unknown as typeof orders.centerId));
  return {
    total: tot?.n ?? 0, page, pageSize, counts,
    sums: { confirmed: Number(tot?.confirmedSum ?? 0), recorded: Number(tot?.recordedSum ?? 0) },
    // Trung tâm không chia sẻ CHI TIẾT tài chính: người ngoài chỉ được thấy phần tổng hợp phía trên
    items: rows.filter((r) => canSeeFinanceDetailOf(ctx, r.tenantId)).map((r) => {
      const isAccountant = can(ctx, "finance:confirm", r.centerId);
      return redact(ctx, {
        ...r,
        idNumber: maskIdNumber(r.idNumber),
        canDecide: r.status === "recorded" && isAccountant && (r.recordedBy !== ctx.user.id || hasRole(ctx.actor, "SUPER_ADMIN")),
        canEdit: r.status === "recorded" && (isAccountant || r.recordedBy === ctx.user.id),
        canAdjust: r.status === "confirmed" && isAccountant,
        needsTarget: !r.enrollmentId && !r.orderItemId,
      });
    }),
  };
}

/** Khoản backfill đang chờ kế toán theo lô nhập — xem thử trước khi xác nhận cả lượt */
export async function backfillBatchPreview(ctx: ProtectedContext, input: { batchId?: string | null }) {
  requirePermission(ctx, "finance:confirm", { centerId: null });
  const conds: SQL[] = [scope(ctx, payments.centerId as unknown as typeof orders.centerId), eq(payments.status, "recorded"), inArray(payments.source, ["backfill", "legacy"])];
  const rows = await ctx.db.select({
    id: payments.id, amount: payments.amount, paidAt: payments.paidAt, centerId: payments.centerId, centerCode: centers.code, note: payments.note,
    enrollmentId: payments.enrollmentId, orderItemId: payments.orderItemId, orderId: orders.id, orderCode: orders.code, customerName: orders.customerName,
    studentName: students.fullName, orderTotal: orders.total,
  }).from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).innerJoin(centers, eq(centers.id, payments.centerId))
    .leftJoin(students, eq(students.id, orders.studentId))
    .where(and(...conds)).orderBy(asc(payments.paidAt)).limit(1000);
  const items = rows.map((r) => {
    const blockers: string[] = [];
    if (!can(ctx, "finance:confirm", r.centerId)) blockers.push("Không có quyền xác nhận ở cơ sở này");
    if (!r.enrollmentId && !r.orderItemId) blockers.push("Chưa gắn ghi danh — chốt lead thành học viên rồi gắn ở màn Thanh toán");
    return { ...r, willConfirm: blockers.length === 0, blockers };
  });
  const will = items.filter((i) => i.willConfirm);
  return {
    batchId: input.batchId ?? null,
    totals: { pending: items.length, willConfirm: will.length, skipped: items.length - will.length, amount: will.reduce((s, i) => s + i.amount, 0) },
    items,
  };
}

/** Kế toán xác nhận cả lượt backfill (bỏ qua khoản chưa gắn ghi danh, ghi rõ lý do bỏ) */
export async function bulkConfirmBackfill(ctx: ProtectedContext, input: { paymentIds?: string[] | null; note: string }) {
  requirePermission(ctx, "finance:confirm", { centerId: null });
  const note = reasonOrThrow(input.note);
  const preview = await backfillBatchPreview(ctx, {});
  const wanted = input.paymentIds?.length ? new Set(input.paymentIds) : null;
  const target = preview.items.filter((i) => i.willConfirm && (!wanted || wanted.has(i.id)));
  if (!target.length) throw pre("Không có khoản nào đủ điều kiện xác nhận");
  const yr = Number(todayISO().slice(0, 4));
  let confirmed = 0;
  let amount = 0;
  const failed: { id: string; error: string }[] = [];
  for (const t of target) {
    try {
      await ctx.db.transaction(async (txx) => {
        const tx = txx as unknown as Db;
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"order:" + t.orderId}))`);
        const [c] = await tx.select({ n: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint` }).from(payments).where(and(eq(payments.orderId, t.orderId), eq(payments.status, "confirmed")));
        if (Number(c?.n ?? 0) + t.amount > t.orderTotal) throw pre(`Vượt tổng đơn ${t.orderCode}`);
        const center = await tx.query.centers.findFirst({ where: eq(centers.id, t.centerId), columns: { code: true } });
        const receiptNo = await nextReceiptNo(tx, center?.code ?? "HO", yr);
        const up = await tx.update(payments).set({ status: "confirmed", decidedBy: ctx.user.id, decidedAt: new Date(), decisionReason: `Xác nhận lượt nhập liệu ban đầu: ${note}`, receiptNo, version: sql`${payments.version} + 1` })
          .where(and(eq(payments.id, t.id), eq(payments.status, "recorded"))).returning({ id: payments.id });
        if (!up.length) throw pre("Khoản vừa được xử lý");
        await tx.insert(financeLedger).values({ orderId: t.orderId, centerId: t.centerId, entryType: "payment", amount: -t.amount, refId: t.id, note: `${receiptNo} · nhập liệu ban đầu`, actorId: ctx.user.id });
        await tx.insert(orderEvents).values({ orderId: t.orderId, event: "payment_confirmed", note: `${receiptNo} · ${formatVnd(t.amount)} · xác nhận cả lượt`, actorId: ctx.user.id });
        await recomputeOrderStatus(tx, t.orderId, ctx.user.id, receiptNo, { accrue: false });
        // Nhật ký TỪNG khoản thu, ghi trong cùng transaction. Bản ghi tổng kết ở cuối hàm
        // chỉ cho biết "đã xác nhận N khoản" — không truy được khoản nào của đơn nào.
        await writeAudit(tx, {
          actorId: ctx.user.id, action: "TRANSITION", module: "finance", entity: "payments", entityId: t.id,
          before: { status: "recorded" }, after: { status: "confirmed", receiptNo, amount: t.amount, orderCode: t.orderCode, bulkBackfill: true },
          reason: note, ip: ctx.ip,
        });
      });
      confirmed++;
      amount += t.amount;
    } catch (e) {
      // Không trả nguyên văn lỗi tầng CSDL ra màn hình (lộ câu SQL / tên cột)
      failed.push({ id: t.id, error: clientSafeMessage(e) });
    }
  }
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "TRANSITION", module: "finance", entity: "payments", entityId: null, after: { bulkConfirmBackfill: confirmed, amount, failed: failed.length }, reason: note, ip: ctx.ip });
  return { confirmed, amount, skipped: preview.totals.skipped, failed };
}

export async function getReceipt(ctx: ProtectedContext, paymentId: string) {
  const [r] = await ctx.db.select({
    p: payments, orderCode: orders.code, customerName: orders.customerName, customerPhone: orders.customerPhone, orderTotal: orders.total, orderId: orders.id,
    centerName: centers.name, centerAddress: centers.address, centerPhone: centers.phone, methodName: paymentMethods.name, studentName: students.fullName,
  }).from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).innerJoin(centers, eq(centers.id, payments.centerId))
    .leftJoin(paymentMethods, eq(paymentMethods.id, payments.paymentMethodId)).leftJoin(students, eq(students.id, orders.studentId))
    .where(eq(payments.id, paymentId)).limit(1);
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy khoản thu" });
  requirePermission(ctx, "finance:read", { centerId: r.p.centerId });
  if (r.p.status !== "confirmed") throw pre("Chỉ in phiếu thu cho khoản đã được kế toán xác nhận");
  if (!r.p.receiptNo) throw pre(`Khoản nhập từ hệ cũ — dùng số phiếu cũ ${r.p.externalRef ?? ""}`.trim());
  const [c] = await ctx.db.select({ n: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint` }).from(payments).where(and(eq(payments.orderId, r.orderId), eq(payments.status, "confirmed"), lte(payments.decidedAt, r.p.decidedAt ?? new Date())));
  const items = await ctx.db.select({ description: orderItems.description, amount: orderItems.amount }).from(orderItems).where(eq(orderItems.orderId, r.orderId));
  const decider = r.p.decidedBy ? await ctx.db.query.users.findFirst({ where: eq(users.id, r.p.decidedBy), columns: { fullName: true } }) : null;
  const recorder = r.p.recordedBy ? await ctx.db.query.users.findFirst({ where: eq(users.id, r.p.recordedBy), columns: { fullName: true } }) : null;
  return {
    ...r,
    items,
    paidToDate: Number(c?.n ?? 0),
    remaining: Math.max(0, r.orderTotal - Number(c?.n ?? 0)),
    customerPhone: r.customerPhone.replace(/\d(?=\d{3})/g, "•"),
    deciderName: decider?.fullName ?? null,
    recorderName: recorder?.fullName ?? null,
    org: await getSettings(ctx.db).then((x) => ({ brandName: x.brandName, legalName: x.legalName, taxCode: x.taxCode, hotline: x.hotline, footer: x.receiptFooter })),
  };
}

/* ------------------------------------------------------------------ */
/* Công nợ & thiếu học phí                                             */
/* ------------------------------------------------------------------ */

export async function debts(ctx: ProtectedContext, input: { centerId?: string; bucket?: AgingBucket; q?: string }) {
  requirePermission(ctx, "finance:read", { centerId: input.centerId ?? null });
  const today = todayISO();
  const conds: SQL[] = [scope(ctx, orders.centerId), inArray(orders.status, ["pending_payment", "partially_paid"])];
  if (input.centerId) conds.push(eq(orders.centerId, input.centerId));
  if (input.q?.trim()) conds.push(or(ilike(orders.code, `%${input.q.trim()}%`), ilike(orders.customerName, `%${input.q.trim()}%`))!);
  const rows = await ctx.db
    .select({
      id: orders.id, code: orders.code, total: orders.total, customerName: orders.customerName, customerPhone: orders.customerPhone, remindDays: orders.remindDays, createdAt: orders.createdAt,
      centerId: orders.centerId, centerCode: centers.code, studentName: students.fullName, classCode: classes.code, enrollmentStatus: enrollments.status,
      confirmed: confirmedSql, pending: pendingSql,
    })
    .from(orders).innerJoin(centers, eq(centers.id, orders.centerId)).leftJoin(students, eq(students.id, orders.studentId))
    .leftJoin(enrollments, eq(enrollments.id, orders.enrollmentId)).leftJoin(classes, eq(classes.id, enrollments.classId))
    .where(and(...conds)).orderBy(asc(orders.createdAt)).limit(5000);
  const ids = rows.map((r) => r.id);
  const plans = ids.length ? await ctx.db.select().from(orderInstallments).where(inArray(orderInstallments.orderId, ids)) : [];
  // Trước: `plans.filter(...)` CHO MỖI đơn — 5.000 đơn × mọi kỳ hạn là hàng triệu phép so
  // trong JavaScript. Sau: gom một lần thành Map, tra O(1) (mỗi đơn chỉ còn vài kỳ hạn).
  const planByOrder = new Map<string, typeof plans>();
  for (const p of plans) {
    const list = planByOrder.get(p.orderId);
    if (list) list.push(p);
    else planByOrder.set(p.orderId, [p]);
  }
  const items = rows.map((r) => {
    const confirmed = Number(r.confirmed);
    const plan = (planByOrder.get(r.id) ?? []).map((p) => ({ seq: p.seq, amount: p.amount, dueDate: p.dueDate }));
    const alloc = allocateInstallments(plan, confirmed, today);
    const maxOverdue = alloc.reduce((m, a) => Math.max(m, a.overdueDays), 0);
    const overdueAmount = alloc.filter((a) => a.overdueDays > 0).reduce((s, a) => s + a.remaining, 0);
    const next = alloc.find((a) => a.remaining > 0) ?? null;
    return {
      ...r, confirmed, pending: Number(r.pending), outstanding: Math.max(0, r.total - confirmed),
      overdueDays: maxOverdue, overdueAmount, bucket: agingBucket(maxOverdue), nextDue: next,
      dueSoon: dueSoon(alloc, today, r.remindDays).length > 0,
      customerPhone: r.customerPhone.replace(/\d(?=\d{3})/g, "•"),
    };
  }).filter((r) => r.outstanding > 0);
  // Một lượt duyệt cho cả nhóm tuổi nợ và nhóm cơ sở, thay cho 10+ lượt `items.filter(...)`
  const bucketAcc = new Map<string, { count: number; amount: number }>();
  // Kiểu `centerCode` lấy thẳng từ hàng truy vấn để không nới rộng kiểu trả về cho client
  const centerAcc = new Map<string, { centerCode: (typeof rows)[number]["centerCode"]; orders: number; outstanding: number; overdue: number; pending: number }>();
  for (const i of items) {
    const b = bucketAcc.get(i.bucket) ?? { count: 0, amount: 0 };
    b.count += 1;
    b.amount += i.bucket === "current" ? i.outstanding : i.overdueAmount;
    bucketAcc.set(i.bucket, b);
    // Giữ thứ tự cơ sở theo lần xuất hiện đầu tiên, đúng như bản cũ
    const c = centerAcc.get(i.centerId) ?? { centerCode: i.centerCode, orders: 0, outstanding: 0, overdue: 0, pending: 0 };
    c.orders += 1;
    c.outstanding += i.outstanding;
    c.overdue += i.overdueAmount;
    c.pending += i.pending;
    centerAcc.set(i.centerId, c);
  }
  const buckets = AGING_BUCKETS.map((b) => ({ bucket: b, count: bucketAcc.get(b)?.count ?? 0, amount: bucketAcc.get(b)?.amount ?? 0 }));
  const byCenter = [...centerAcc.entries()].map(([centerId, c]) => ({ centerId, centerCode: c.centerCode, orders: c.orders, outstanding: c.outstanding, overdue: c.overdue, pending: c.pending }));
  const filtered = input.bucket ? items.filter((i) => i.bucket === input.bucket) : items;
  return {
    today,
    totals: {
      orders: items.length,
      outstanding: items.reduce((s, i) => s + i.outstanding, 0),
      overdue: items.reduce((s, i) => s + i.overdueAmount, 0),
      pending: items.reduce((s, i) => s + i.pending, 0),
      dueSoon: items.filter((i) => i.dueSoon).length,
    },
    buckets, byCenter,
    items: filtered.sort((a, b) => b.overdueDays - a.overdueDays || b.outstanding - a.outstanding),
  };
}

/** Học viên đang học nhưng chưa có đơn hoặc chưa đóng đủ */
export async function missingTuition(ctx: ProtectedContext, input: { centerId?: string; kind?: "no_order" | "unpaid" }) {
  requirePermission(ctx, "finance:read", { centerId: input.centerId ?? null });
  const conds: SQL[] = [scope(ctx, classes.centerId as unknown as typeof orders.centerId), inArray(enrollments.status, ["active", "trial", "paused"]), sql`${classes.status} not in ('cancelled')`];
  if (input.centerId) conds.push(eq(classes.centerId, input.centerId));
  const rows = await ctx.db
    .select({
      enrollmentId: enrollments.id, enrollmentStatus: enrollments.status, packageSessions: enrollments.packageSessions, consumed: consumedSql,
      studentId: students.id, studentName: students.fullName, studentCode: students.code, classId: classes.id, classCode: classes.code, centerCode: centers.code, centerId: classes.centerId,
      courseCode: courses.code, listPrice: courses.listPrice, courseSessions: courses.totalSessions,
      parentName: sql<string | null>`(select p.full_name from ${studentGuardians} g join ${parents} p on p.id = g.parent_id where g.student_id = ${students.id} order by g.is_primary desc limit 1)`,
      orderId: sql<string | null>`(select oi.order_id from ${orderItems} oi join ${orders} o on o.id = oi.order_id where oi.enrollment_id = ${enrollments.id} and o.status in ('pending_payment','partially_paid','paid') order by o.created_at desc limit 1)`,
      legacyOrderId: sql<string | null>`(select o.id from ${orders} o where o.enrollment_id = ${enrollments.id} and o.status in ('pending_payment','partially_paid','paid') order by o.created_at desc limit 1)`,
    })
    .from(enrollments).innerJoin(students, eq(students.id, enrollments.studentId)).innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(courses, eq(courses.id, classes.courseId)).innerJoin(centers, eq(centers.id, classes.centerId))
    .where(and(...conds)).orderBy(asc(centers.code), asc(classes.code), asc(students.fullName));
  const orderIds = [...new Set(rows.map((r) => r.orderId ?? r.legacyOrderId).filter((x): x is string => !!x))];
  const os = orderIds.length ? await ctx.db.select({ id: orders.id, code: orders.code, total: orders.total, status: orders.status, confirmed: confirmedSql, pending: pendingSql }).from(orders).where(inArray(orders.id, orderIds)) : [];
  const items = rows.map((r) => {
    const oid = r.orderId ?? r.legacyOrderId;
    const o = oid ? os.find((x) => x.id === oid) ?? null : null;
    const expected = packagePrice(Number(r.listPrice), r.courseSessions, r.packageSessions);
    const confirmed = o ? Number(o.confirmed) : 0;
    const outstanding = o ? Math.max(0, o.total - confirmed) : expected;
    return {
      ...r, listPrice: Number(r.listPrice), expected,
      order: o ? { id: o.id, code: o.code, total: o.total, status: o.status, confirmed, pending: Number(o.pending) } : null,
      kind: (o ? "unpaid" : "no_order") as "no_order" | "unpaid",
      outstanding,
      paidRatio: o && o.total > 0 ? Math.round((confirmed / o.total) * 100) : 0,
    };
  }).filter((r) => !r.order || r.outstanding > 0);
  const filtered = input.kind ? items.filter((i) => i.kind === input.kind) : items;
  // Trần % giảm để form "Ghi học phí" hiện đúng giới hạn (máy chủ vẫn là nơi quyết định cuối)
  const ops = await opsForCenters(ctx.db, [...new Set(rows.map((r) => r.centerId))]);
  return {
    totals: { noOrder: items.filter((i) => i.kind === "no_order").length, unpaid: items.filter((i) => i.kind === "unpaid").length, amount: items.reduce((s, i) => s + i.outstanding, 0) },
    items: filtered.map((i) => ({ ...i, maxDiscountPercent: ops.get(i.centerId)?.maxLineDiscountPercent ?? DEFAULT_MAX_LINE_DISCOUNT_PCT })),
  };
}

/**
 * “Ghi học phí cũ” ở /thieu-hoc-phi: lập đơn (nếu chưa có) + ghi khoản mang dấu nhập liệu ban đầu.
 * Khoản ở trạng thái chờ kế toán — hệ thống không tự cho vào doanh thu.
 */
export async function backfillTuition(ctx: ProtectedContext, input: {
  enrollmentId: string; total?: number | null; discount?: number | null; discountReason?: string | null; paidAmount: number; paidAt?: string | null; note?: string | null;
  /** Chính sách giảm: none | percent | amount | program | scholarship. `discount` là số % hoặc số tiền tuỳ chính sách. */
  discountPolicy?: DiscountPolicy | null;
}) {
  const [e] = await ctx.db.select({
    id: enrollments.id, packageSessions: enrollments.packageSessions, studentId: students.id, studentName: students.fullName,
    centerId: classes.centerId, classCode: classes.code, courseId: courses.id, courseCode: courses.code, listPrice: courses.listPrice, courseSessions: courses.totalSessions,
  }).from(enrollments).innerJoin(students, eq(students.id, enrollments.studentId)).innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(courses, eq(courses.id, classes.courseId)).where(eq(enrollments.id, input.enrollmentId)).limit(1);
  if (!e) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy đăng ký học" });
  requirePermission(ctx, "finance:create", { centerId: e.centerId });
  const today = todayISO();
  const paidAt = input.paidAt ?? today;
  if (paidAt > today) throw bad("Ngày thu không được ở tương lai");
  const paid = Math.round(input.paidAmount);
  if (!Number.isInteger(paid) || paid < 0) throw bad("Tiền đã thu phải là số nguyên ≥ 0");
  const policy: DiscountPolicy = input.discountPolicy ?? ((input.discount ?? 0) > 0 ? "amount" : "none");
  const discountValue = Math.max(0, Math.round(input.discount ?? 0));
  const [existing] = await ctx.db.select({ order: orders, itemId: orderItems.id, net: orderItems.netAmount })
    .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orderItems.enrollmentId, e.id), inArray(orders.status, [...OPEN_ORDER_STATUSES]))).orderBy(desc(orders.createdAt)).limit(1);
  const methodId = await pickBackfillMethod(ctx.db, e.centerId);
  const [g] = await ctx.db.select({ id: parents.id, fullName: parents.fullName, phone: parents.phone, email: parents.email })
    .from(studentGuardians).innerJoin(parents, eq(parents.id, studentGuardians.parentId))
    .where(eq(studentGuardians.studentId, e.studentId)).orderBy(desc(studentGuardians.isPrimary)).limit(1);

  return ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    let orderId: string;
    let orderCodeStr: string;
    let total: number;
    let itemId: string | null;
    if (existing) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"order:" + existing.order.id}))`);
      orderId = existing.order.id;
      orderCodeStr = existing.order.code;
      total = existing.order.total;
      itemId = existing.itemId;
    } else {
      if (!g?.phone) throw pre("Học viên chưa có phụ huynh / SĐT để lập đơn");
      const gross = Math.round(input.total ?? packagePrice(Number(e.listPrice), e.courseSessions, e.packageSessions));
      if (gross <= 0) throw bad("Tổng học phí phải > 0");
      // Giảm giá theo chính sách (lý do vẫn bắt buộc, trần % theo cấu hình vận hành)
      const ops = await getOps(ctx.db, e.centerId);
      const dis = applyDiscountPolicy({ listPrice: gross, policy, value: discountValue, maxPercent: ops.maxLineDiscountPercent, reason: input.discountReason });
      if (dis.errors.length) throw bad(dis.errors);
      const discount = dis.amount;
      total = gross - discount;
      if (paid > total) throw pre(`Đã thu (${formatVnd(paid)}) lớn hơn tổng phải đóng (${formatVnd(total)})`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"enroll-order:" + e.id}))`);
      const again = await openOrderLineFor(tx, [e.id]);
      if (again[0]) throw new TRPCError({ code: "CONFLICT", message: `Ghi danh vừa có đơn ${again[0].orderCode} — tải lại trang` });
      orderCodeStr = await nextOrderCode(tx, today, (ops.orderCodeFormat as OrderCodeFormat) ?? DEFAULT_ORDER_CODE_FORMAT);
      const [o] = await tx.insert(orders).values({
        code: orderCodeStr, type: "course", status: "pending_payment", centerId: e.centerId, parentId: g.id, studentId: e.studentId, enrollmentId: e.id,
        customerName: g.fullName, customerPhone: g.phone.replace(/\D/g, ""), customerEmail: g.email,
        subtotal: gross, discountAmount: discount, total, paymentMethodId: methodId,
        internalNote: `Ghi học phí cũ${input.note ? ` — ${input.note}` : ""}${discount ? ` · ${DISCOUNT_POLICY_VI[policy]} ${formatVnd(discount)}: ${(input.discountReason ?? "").trim()}` : ""}`.slice(0, 1000),
        createdBy: ctx.user.id,
      }).returning({ id: orders.id });
      orderId = o!.id;
      const [it] = await tx.insert(orderItems).values({
        orderId, courseId: e.courseId, description: `Học phí ${e.courseCode} — gói ${e.packageSessions} buổi (${e.studentName})`,
        quantity: 1, unitPrice: gross, amount: gross, discountAmount: discount, netAmount: total,
        packageSessions: e.packageSessions, studentId: e.studentId, enrollmentId: e.id,
      }).returning({ id: orderItems.id });
      itemId = it!.id;
      if (discount > 0) {
        await tx.insert(orderItemDiscounts).values({
          orderItemId: itemId, kind: dis.kind, policy, value: discountValue, amount: discount,
          reason: (input.discountReason ?? "").trim(), createdBy: ctx.user.id,
        });
      }
      await tx.insert(orderInstallments).values({ orderId, seq: 1, amount: total, dueDate: paidAt, kind: "installment", studentId: e.studentId, orderItemId: itemId, createdBy: ctx.user.id });
      await tx.insert(orderEvents).values({ orderId, event: "create", toStatus: "pending_payment", note: "Ghi học phí cũ", actorId: ctx.user.id });
      await tx.insert(financeLedger).values({ orderId, centerId: e.centerId, entryType: "charge", amount: total, refId: orderId, note: `Tạo đơn ${orderCodeStr} (ghi học phí cũ)`, actorId: ctx.user.id });
    }
    let paymentId: string | null = null;
    if (paid > 0) {
      const pays = await tx.select({ amount: payments.amount, status: payments.status }).from(payments).where(eq(payments.orderId, orderId));
      const bal = orderBalance(total, pays);
      const room = bal.outstanding - bal.pending;
      if (paid > room) throw pre(`Đã thu lớn hơn tổng phải đóng — còn nhận tối đa ${formatVnd(Math.max(0, room))}`);
      const [p] = await tx.insert(payments).values({
        orderId, centerId: e.centerId, recordedAmount: paid, amount: paid, paymentMethodId: methodId, paidAt, status: "recorded",
        source: "backfill", note: input.note?.trim() || "Ghi học phí cũ", recordedBy: ctx.user.id, enrollmentId: e.id, orderItemId: itemId,
      }).returning({ id: payments.id });
      paymentId = p!.id;
      await tx.insert(orderEvents).values({ orderId, event: "payment_recorded", note: `${formatVnd(paid)} · ghi lùi ngày ${paidAt} (nhập liệu ban đầu)`, actorId: ctx.user.id });
      await notify(tx, await accountantsOf(tx, e.centerId), "Khoản thu chờ xác nhận", `${orderCodeStr} · ${formatVnd(paid)} · ${e.studentName} (nhập liệu ban đầu)`, "/payments?status=recorded", 2, "payment.pending");
    }
    await writeAudit(tx, { actorId: ctx.user.id, action: existing ? "UPDATE" : "CREATE", module: "finance", entity: "orders", entityId: orderId, after: { code: orderCodeStr, total, paid, backfill: true, enrollmentId: e.id }, reason: input.note ?? null, ip: ctx.ip });
    return { orderId, code: orderCodeStr, paymentId, total };
  });
}

/* ------------------------------------------------------------------ */
/* Công nợ theo ghi danh (/cong-no)                                    */
/* ------------------------------------------------------------------ */

/**
 * Công nợ theo từng ghi danh: phải đóng = net của dòng đơn, đã thu = xác nhận + chờ xác nhận,
 * "thiếu PH đang thấy" = total − đã xác nhận (chỉ giảm khi kế toán xác nhận), "thiếu thật" = total − (xác nhận + chờ).
 */
export async function enrollmentDebts(ctx: ProtectedContext, input: { centerId?: string; chip?: DebtChip; q?: string }) {
  requirePermission(ctx, "finance:read", { centerId: input.centerId ?? null });
  const today = todayISO();
  const conds: SQL[] = [
    scope(ctx, classes.centerId as unknown as typeof orders.centerId),
    inArray(enrollments.status, ["active", "trial", "paused", "completed"]),
    sql`${classes.status} <> 'cancelled'`,
  ];
  if (input.centerId) conds.push(eq(classes.centerId, input.centerId));
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`;
    conds.push(or(ilike(students.fullName, q), ilike(students.code, q), ilike(classes.code, q), ilike(courses.code, q), ilike(courses.name, q))!);
  }
  const rows = await ctx.db.select({
    enrollmentId: enrollments.id, enrollmentStatus: enrollments.status, packageSessions: enrollments.packageSessions,
    studentId: students.id, studentName: students.fullName, studentCode: students.code,
    classId: classes.id, classCode: classes.code, centerId: classes.centerId, centerCode: centers.code,
    courseCode: courses.code, courseName: courses.name, listPrice: courses.listPrice, courseSessions: courses.totalSessions,
  }).from(enrollments).innerJoin(students, eq(students.id, enrollments.studentId)).innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(courses, eq(courses.id, classes.courseId)).innerJoin(centers, eq(centers.id, classes.centerId))
    .where(and(...conds)).orderBy(asc(centers.code), asc(classes.code), asc(students.fullName)).limit(5000);
  const ids = rows.map((r) => r.enrollmentId);
  const lines = ids.length
    ? await ctx.db.select({
        itemId: orderItems.id, enrollmentId: orderItems.enrollmentId, net: orderItems.netAmount, orderId: orders.id, orderCode: orders.code, orderStatus: orders.status, orderTotal: orders.total, remindDays: orders.remindDays,
      }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(and(inArray(orderItems.enrollmentId, ids), inArray(orders.status, [...OPEN_ORDER_STATUSES])))
    : [];
  const itemIds = lines.map((l) => l.itemId);
  const orderIds = [...new Set(lines.map((l) => l.orderId))];
  const pays = ids.length
    ? await ctx.db.select({ id: payments.id, amount: payments.amount, status: payments.status, enrollmentId: payments.enrollmentId, orderItemId: payments.orderItemId })
        .from(payments).where(and(
          inArray(payments.status, ["confirmed", "recorded"]),
          or(inArray(payments.enrollmentId, ids), itemIds.length ? inArray(payments.orderItemId, itemIds) : sql`false`)!,
        ))
    : [];
  const insts = orderIds.length
    ? await ctx.db.select().from(orderInstallments).where(and(inArray(orderInstallments.orderId, orderIds), isNull(orderInstallments.cancelledAt)))
    : [];
  const opsByCenter = await opsForCenters(ctx.db, [...new Set(rows.map((r) => r.centerId))]);
  const items = rows.map((r) => {
    const line = lines.find((l) => l.enrollmentId === r.enrollmentId) ?? null;
    const mine = pays.filter((p) => p.enrollmentId === r.enrollmentId || (line && p.orderItemId === line.itemId));
    const seen = new Set<string>();
    const uniq = mine.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
    const confirmed = uniq.filter((p) => p.status === "confirmed").reduce((s, p) => s + p.amount, 0);
    const recorded = uniq.filter((p) => p.status === "recorded").reduce((s, p) => s + p.amount, 0);
    const total = line?.net ?? 0;
    const chip = enrollmentDebtChip({ hasFee: !!line, total, confirmed, recorded });
    const plan = line ? insts.filter((i) => i.orderId === line.orderId) : [];
    const alloc = allocateInstallments(plan.map((p) => ({ seq: p.seq, amount: p.amount, dueDate: p.dueDate, kind: p.kind })), confirmed, today);
    const overdueDays = alloc.reduce((m, a) => Math.max(m, a.overdueDays), 0);
    const ops = opsByCenter.get(r.centerId);
    const edges: [number, number] = [ops?.debtAgingWarnDays ?? 7, ops?.debtAgingBadDays ?? 30];
    return {
      ...r,
      listPrice: Number(r.listPrice),
      expected: packagePrice(Number(r.listPrice), r.courseSessions, r.packageSessions),
      order: line ? { id: line.orderId, code: line.orderCode, status: line.orderStatus, total: line.orderTotal, orderItemId: line.itemId } : null,
      hasFee: !!line,
      total, confirmed, recorded,
      /** Con số phụ huynh đang thấy trên cổng — chỉ giảm khi kế toán xác nhận */
      shortParent: Math.max(0, total - confirmed),
      /** Thiếu thật — đã trừ khoản sale ghi nhận chờ xác nhận */
      shortReal: Math.max(0, total - confirmed - recorded),
      overpaid: Math.max(0, confirmed - total),
      chip,
      overdueDays,
      overdueAmount: alloc.filter((a) => a.overdueDays > 0).reduce((s, a) => s + a.remaining, 0),
      ageBucket: agingBucketBy(overdueDays, edges),
      nextDue: alloc.find((a) => a.remaining > 0) ?? null,
      dueSoon: line ? dueSoon(alloc, today, line.remindDays).length > 0 : false,
      canEditFee: !!line && can(ctx, "finance:confirm", r.centerId),
    };
  });
  const chips = DEBT_CHIPS.map((c) => ({
    chip: c,
    count: items.filter((i) => i.chip === c).length,
    amount: items.filter((i) => i.chip === c).reduce((s, i) => s + (c === "overpaid" ? i.overpaid : i.shortParent), 0),
  }));
  const ageEdges: [number, number] = [7, 30];
  const buckets = (["current", "b1", "b2", "b3"] as DebtAgeBucket[]).map((b) => ({
    bucket: b,
    label: agingBucketLabels(ageEdges)[b],
    count: items.filter((i) => i.ageBucket === b && i.shortParent > 0).length,
    amount: items.filter((i) => i.ageBucket === b && i.shortParent > 0).reduce((s, i) => s + (b === "current" ? i.shortParent : i.overdueAmount), 0),
  }));
  const filtered = input.chip ? items.filter((i) => i.chip === input.chip) : items.filter((i) => i.shortParent > 0 || i.chip === "no_fee" || i.chip === "overpaid" || i.chip === "paid_pending");
  return {
    today,
    totals: {
      enrollments: items.length,
      noFee: items.filter((i) => i.chip === "no_fee").length,
      outstanding: items.reduce((s, i) => s + i.shortParent, 0),
      outstandingReal: items.reduce((s, i) => s + i.shortReal, 0),
      pending: items.reduce((s, i) => s + i.recorded, 0),
      overpaid: items.reduce((s, i) => s + i.overpaid, 0),
    },
    chips, buckets,
    items: filtered.sort((a, b) => b.overdueDays - a.overdueDays || b.shortParent - a.shortParent),
  };
}

/** Sửa học phí hợp đồng của một ghi danh (dòng đơn) — cần lý do, sinh bút toán điều chỉnh */
export async function updateEnrollmentFee(ctx: ProtectedContext, input: { enrollmentId: string; newTotal: number; reason: string }) {
  const reason = reasonOrThrow(input.reason);
  const newTotal = Math.round(input.newTotal);
  if (!Number.isInteger(newTotal) || newTotal < 0) throw bad("Học phí mới phải là số nguyên ≥ 0");
  const [line] = await ctx.db.select({ item: orderItems, order: orders })
    .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orderItems.enrollmentId, input.enrollmentId), inArray(orders.status, [...OPEN_ORDER_STATUSES])))
    .orderBy(desc(orders.createdAt)).limit(1);
  if (!line) throw pre("Ghi danh chưa có dòng đơn đang mở — lập đơn trước");
  requirePermission(ctx, "finance:confirm", { centerId: line.order.centerId });
  const oldNet = line.item.netAmount;
  const delta = newTotal - oldNet;
  if (delta === 0) throw bad("Bằng học phí hiện tại — không có gì để sửa");
  return ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"order:" + line.order.id}))`);
    const mine = await tx.select({ amount: payments.amount }).from(payments)
      .where(and(eq(payments.status, "confirmed"), or(eq(payments.orderItemId, line.item.id), eq(payments.enrollmentId, input.enrollmentId))!));
    const confirmed = mine.reduce((s, p) => s + p.amount, 0);
    if (newTotal < confirmed) throw pre(`Học phí mới (${formatVnd(newTotal)}) nhỏ hơn số kế toán đã xác nhận (${formatVnd(confirmed)}) — dùng hoàn tiền`);
    const patch = newTotal <= line.item.amount
      ? { discountAmount: line.item.amount - newTotal, netAmount: newTotal }
      : { amount: newTotal, unitPrice: Math.round(newTotal / Math.max(1, line.item.quantity)), discountAmount: 0, netAmount: newTotal };
    await tx.update(orderItems).set(patch).where(eq(orderItems.id, line.item.id));
    const [agg] = await tx.select({ gross: sql<number>`coalesce(sum(${orderItems.amount}), 0)::bigint`, net: sql<number>`coalesce(sum(${orderItems.netAmount}), 0)::bigint` })
      .from(orderItems).where(eq(orderItems.orderId, line.order.id));
    const subtotal = Number(agg?.gross ?? 0);
    const total = Number(agg?.net ?? 0);
    await tx.update(orders).set({ subtotal, total, discountAmount: Math.max(0, subtotal - total), updatedAt: new Date() }).where(eq(orders.id, line.order.id));
    await tx.insert(financeLedger).values({ orderId: line.order.id, centerId: line.order.centerId, entryType: "adjustment", amount: delta, refId: line.item.id, note: `Sửa học phí hợp đồng ${formatVnd(oldNet)} → ${formatVnd(newTotal)}: ${reason}`, actorId: ctx.user.id });
    await tx.insert(orderEvents).values({ orderId: line.order.id, event: "fee_changed", note: `${line.item.description}: ${formatVnd(oldNet)} → ${formatVnd(newTotal)} — ${reason}`, actorId: ctx.user.id });
    await recomputeOrderStatus(tx, line.order.id, ctx.user.id, "Sửa học phí hợp đồng");
    await writeAudit(tx, { actorId: ctx.user.id, action: "UPDATE", module: "finance", entity: "order_items", entityId: line.item.id, before: { netAmount: oldNet, orderTotal: line.order.total }, after: { netAmount: newTotal, orderTotal: total }, reason, ip: ctx.ip });
    return { ok: true, orderId: line.order.id, orderTotal: total, delta };
  });
}

/* ------------------------------------------------------------------ */
/* Hoàn tiền                                                           */
/* ------------------------------------------------------------------ */

export type RefundTrigger = "withdraw" | "transfer" | "class_cancel";
const TRIGGER_VI: Record<RefundTrigger, string> = { withdraw: "Nghỉ học", transfer: "Chuyển lớp", class_cancel: "Huỷ lớp" };

/**
 * Hook vòng đời học vụ: khi học viên rút / chuyển lớp / lớp bị huỷ, nếu ghi danh còn tiền đã thu
 * chưa dùng hết và đơn chưa có đề xuất hoàn đang mở → tạo đề xuất "Chờ duyệt" và báo quản lý cơ sở.
 * Đề xuất = Σ đã thu − số buổi đã học × đơn giá buổi. Không kiểm quyền tài chính: chỉ gọi bên trong
 * transaction của thao tác học vụ đã được phân quyền; duyệt / chi vẫn đi luồng /hoan-tien.
 */
export async function proposeRefundIfPaid(tx: Db, input: { enrollmentId: string; reason: string; trigger: RefundTrigger; actorId: string }): Promise<{ refundId: string | null; amount: number }> {
  const none = { refundId: null, amount: 0 };
  const [e] = await tx
    .select({ id: enrollments.id, packageSessions: enrollments.packageSessions, consumed: consumedSql, transferredFromId: enrollments.transferredFromId, centerId: classes.centerId, classCode: classes.code, studentName: students.fullName })
    .from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).innerJoin(students, eq(students.id, enrollments.studentId))
    .where(eq(enrollments.id, input.enrollmentId)).limit(1);
  if (!e) return none;

  // Đơn có thể gắn với ghi danh gốc trước khi chuyển lớp → lần theo chuỗi transferred_from
  const chain = [e.id];
  let prev = e.transferredFromId;
  while (prev && chain.length < 6 && !chain.includes(prev)) {
    chain.push(prev);
    const p = await tx.query.enrollments.findFirst({ where: eq(enrollments.id, prev), columns: { transferredFromId: true } });
    prev = p?.transferredFromId ?? null;
  }
  // Ưu tiên dòng đơn của ghi danh (đơn nhiều con), rồi mới tới đơn gắn ghi danh kiểu cũ
  const [line] = await tx.select({ orderId: orders.id, code: orders.code, total: orders.total, itemId: orderItems.id, net: orderItems.netAmount, packageSessions: orderItems.packageSessions })
    .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(inArray(orderItems.enrollmentId, chain), inArray(orders.status, ["partially_paid", "paid", "refunded"])))
    .orderBy(desc(orders.createdAt)).limit(1);
  let orderId: string | null = line?.orderId ?? null;
  let packageValue = line?.net ?? 0;
  let pkg = line?.packageSessions ?? e.packageSessions;
  let itemId: string | null = line?.itemId ?? null;
  if (!orderId) {
    const [o] = await tx.select({ id: orders.id, total: orders.total })
      .from(orders).where(and(inArray(orders.enrollmentId, chain), inArray(orders.status, ["partially_paid", "paid", "refunded"]))).orderBy(desc(orders.createdAt)).limit(1);
    if (!o) return none;
    orderId = o.id;
    const its = await tx.select({ amount: orderItems.netAmount, packageSessions: orderItems.packageSessions }).from(orderItems).where(eq(orderItems.orderId, o.id));
    const courseItem = its.find((i) => i.packageSessions);
    packageValue = courseItem?.amount ?? o.total;
    pkg = courseItem?.packageSessions ?? e.packageSessions;
  }

  const [paid] = await tx.select({ n: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint` }).from(payments)
    .where(and(eq(payments.orderId, orderId), eq(payments.status, "confirmed"), itemId ? or(eq(payments.orderItemId, itemId), isNull(payments.orderItemId))! : sql`true`));
  const rs = await tx.select({ amount: refunds.amount, status: refunds.status }).from(refunds).where(eq(refunds.orderId, orderId));
  if (rs.some((r) => r.status === "pending" || r.status === "approved")) return none;
  const already = rs.filter((r) => r.status !== "rejected").reduce((s, r) => s + r.amount, 0);

  // Buổi đã dùng của cả gói = gói gốc − số buổi còn lại hiện tại (đã mang sang khi chuyển lớp)
  const used = Math.max(0, pkg - remainingSessions(e.packageSessions, e.consumed));
  const proposal = refundProposal({ paid: Number(paid?.n ?? 0), packageValue, packageSessions: pkg, consumedSessions: used, alreadyRefunded: already });
  if (proposal.refundable <= 0) return none;

  const reason = `[${TRIGGER_VI[input.trigger]} — tự đề xuất] ${input.reason}`.slice(0, 500);
  const [row] = await tx.insert(refunds).values({
    orderId, enrollmentId: e.id, centerId: e.centerId, status: "pending", amount: proposal.refundable, proposedAmount: proposal.refundable,
    sessionsUsed: proposal.usedSessions, sessionsTotal: pkg, reason, trigger: input.trigger, auto: true, requestedBy: input.actorId,
  }).returning({ id: refunds.id });
  await tx.insert(orderEvents).values({ orderId, event: "refund_requested", note: `${formatVnd(proposal.refundable)} (tự đề xuất khi ${TRIGGER_VI[input.trigger].toLowerCase()}): ${input.reason}`.slice(0, 500), actorId: input.actorId });
  await notify(tx, await managersOf(tx, e.centerId), "Đề xuất hoàn tiền chờ duyệt", `${e.studentName} · ${e.classCode} · ${formatVnd(proposal.refundable)} (${TRIGGER_VI[input.trigger]})`, "/hoan-tien?status=pending", 2, "refund.pending");
  return { refundId: row!.id, amount: proposal.refundable };
}

/** Ghi danh đã rút / lớp huỷ, còn tiền đã thu mà chưa có đề xuất hoàn — “tạo đề xuất cho ca chưa có” */
export async function refundGaps(ctx: ProtectedContext, input: { centerId?: string } = {}) {
  requirePermission(ctx, "finance:read", { centerId: input.centerId ?? null });
  const conds: SQL[] = [
    scope(ctx, classes.centerId as unknown as typeof orders.centerId),
    or(eq(enrollments.status, "withdrawn"), eq(classes.status, "cancelled"))!,
  ];
  if (input.centerId) conds.push(eq(classes.centerId, input.centerId));
  const rows = await ctx.db.select({
    enrollmentId: enrollments.id, enrollmentStatus: enrollments.status, packageSessions: enrollments.packageSessions, consumed: consumedSql,
    endedAt: enrollments.endedAt, endReason: enrollments.endReason,
    studentId: students.id, studentName: students.fullName, classCode: classes.code, classStatus: classes.status, centerId: classes.centerId, centerCode: centers.code,
  }).from(enrollments).innerJoin(students, eq(students.id, enrollments.studentId)).innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(centers, eq(centers.id, classes.centerId)).where(and(...conds)).orderBy(desc(enrollments.endedAt)).limit(500);
  const ids = rows.map((r) => r.enrollmentId);
  const lines = ids.length
    ? await ctx.db.select({ enrollmentId: orderItems.enrollmentId, orderId: orders.id, orderCode: orders.code, net: orderItems.netAmount, packageSessions: orderItems.packageSessions })
        .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(and(inArray(orderItems.enrollmentId, ids), inArray(orders.status, ["partially_paid", "paid"])))
    : [];
  const legacy = ids.length
    ? await ctx.db.select({ enrollmentId: orders.enrollmentId, orderId: orders.id, orderCode: orders.code, net: orders.total, packageSessions: sql<number | null>`null::int` })
        .from(orders).where(and(inArray(orders.enrollmentId, ids), inArray(orders.status, ["partially_paid", "paid"])))
    : [];
  const orderIds = [...new Set([...lines.map((l) => l.orderId), ...legacy.map((l) => l.orderId)])];
  const paid = orderIds.length
    ? await ctx.db.select({ orderId: payments.orderId, n: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint` }).from(payments)
        .where(and(inArray(payments.orderId, orderIds), eq(payments.status, "confirmed"))).groupBy(payments.orderId)
    : [];
  const existing = orderIds.length ? await ctx.db.select({ orderId: refunds.orderId, status: refunds.status, amount: refunds.amount }).from(refunds).where(inArray(refunds.orderId, orderIds)) : [];
  const items = rows.map((r) => {
    const l = lines.find((x) => x.enrollmentId === r.enrollmentId) ?? legacy.find((x) => x.enrollmentId === r.enrollmentId) ?? null;
    if (!l) return null;
    const rs = existing.filter((x) => x.orderId === l.orderId);
    if (rs.some((x) => x.status === "pending" || x.status === "approved")) return null;
    const already = rs.filter((x) => x.status !== "rejected").reduce((s, x) => s + x.amount, 0);
    const pkg = l.packageSessions ?? r.packageSessions;
    const p = refundProposal({
      paid: Number(paid.find((x) => x.orderId === l.orderId)?.n ?? 0), packageValue: l.net,
      packageSessions: pkg, consumedSessions: r.consumed, alreadyRefunded: already,
    });
    if (p.refundable <= 0) return null;
    return {
      enrollmentId: r.enrollmentId, studentId: r.studentId, studentName: r.studentName, classCode: r.classCode, centerCode: r.centerCode, centerId: r.centerId,
      enrollmentStatus: r.enrollmentStatus, classCancelled: r.classStatus === "cancelled", endedAt: r.endedAt, endReason: r.endReason,
      orderId: l.orderId, orderCode: l.orderCode, refundable: p.refundable, usedSessions: p.usedSessions, packageSessions: pkg, perSession: p.perSession,
      canRequest: can(ctx, "finance:create", r.centerId),
    };
  }).filter((x): x is NonNullable<typeof x> => !!x);
  return { items };
}

async function refundContext(ctx: ProtectedContext, enrollmentId: string) {
  const [e] = await ctx.db.select({
    id: enrollments.id, status: enrollments.status, packageSessions: enrollments.packageSessions, consumed: consumedSql,
    centerId: classes.centerId, classCode: classes.code, studentName: students.fullName, studentId: students.id,
  }).from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).innerJoin(students, eq(students.id, enrollments.studentId)).where(eq(enrollments.id, enrollmentId)).limit(1);
  if (!e) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy đăng ký học" });
  requirePermission(ctx, "finance:read", { centerId: e.centerId });
  // Ưu tiên dòng đơn của ghi danh (đơn nhiều con), rồi mới tới đơn gắn ghi danh kiểu cũ
  const [line] = await ctx.db.select({ id: orders.id, code: orders.code, total: orders.total, status: orders.status, confirmed: confirmedSql, net: orderItems.netAmount, itemSessions: orderItems.packageSessions })
    .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orderItems.enrollmentId, e.id), inArray(orders.status, ["partially_paid", "paid", "refunded"]))).orderBy(desc(orders.createdAt)).limit(1);
  const [legacy] = line ? [] : await ctx.db.select({ id: orders.id, code: orders.code, total: orders.total, status: orders.status, confirmed: confirmedSql })
    .from(orders).where(and(eq(orders.enrollmentId, e.id), inArray(orders.status, ["partially_paid", "paid", "refunded"]))).orderBy(desc(orders.createdAt)).limit(1);
  const o = line ?? legacy;
  if (!o) return { enrollment: e, order: null, proposal: null, refunds: [] as (typeof refunds.$inferSelect)[] };
  let packageValue = line?.net ?? 0;
  let pkgSessions = line?.itemSessions ?? e.packageSessions;
  if (!line) {
    const items = await ctx.db.select({ amount: orderItems.netAmount, packageSessions: orderItems.packageSessions }).from(orderItems).where(eq(orderItems.orderId, o.id));
    const courseItem = items.find((i) => i.packageSessions);
    packageValue = courseItem?.amount ?? o.total;
    pkgSessions = courseItem?.packageSessions ?? e.packageSessions;
  }
  const rs = await ctx.db.select().from(refunds).where(eq(refunds.orderId, o.id)).orderBy(desc(refunds.createdAt));
  const already = rs.filter((r) => r.status !== "rejected").reduce((s, r) => s + r.amount, 0);
  const proposal = refundProposal({ paid: Number(o.confirmed), packageValue, packageSessions: pkgSessions, consumedSessions: e.consumed, alreadyRefunded: already });
  return { enrollment: e, order: { id: o.id, code: o.code, total: o.total, status: o.status, confirmed: Number(o.confirmed) }, proposal: { ...proposal, packageValue, alreadyRefunded: already }, refunds: rs };
}

export async function refundPreview(ctx: ProtectedContext, enrollmentId: string) {
  const r = await refundContext(ctx, enrollmentId);
  return { ...r, canRequest: can(ctx, "finance:create", r.enrollment.centerId) && !!r.order && !r.refunds.some((x) => x.status === "pending" || x.status === "approved") };
}

export async function requestRefund(ctx: ProtectedContext, input: { enrollmentId: string; amount: number; reason: string; trigger?: RefundTrigger | "manual" | null }) {
  const r = await refundContext(ctx, input.enrollmentId);
  requirePermission(ctx, "finance:create", { centerId: r.enrollment.centerId });
  if (!r.order || !r.proposal) throw pre("Đăng ký chưa có đơn đã thu tiền — không có gì để hoàn");
  if (r.refunds.some((x) => x.status === "pending" || x.status === "approved")) throw pre("Đã có yêu cầu hoàn tiền đang xử lý cho đơn này");
  const amount = Math.round(input.amount);
  const errs = validateRefundRequest(amount, r.proposal.refundable, input.reason);
  if (errs.length) throw pre(errs);
  const [row] = await ctx.db.transaction(async (tx) => {
    const ins = await tx.insert(refunds).values({
      orderId: r.order!.id, enrollmentId: r.enrollment.id, centerId: r.enrollment.centerId, status: "pending", amount, proposedAmount: r.proposal!.refundable,
      sessionsUsed: r.proposal!.usedSessions, sessionsTotal: r.enrollment.packageSessions, reason: input.reason.trim(), trigger: input.trigger ?? "manual", auto: false, requestedBy: ctx.user.id,
    }).returning({ id: refunds.id });
    await tx.insert(orderEvents).values({ orderId: r.order!.id, event: "refund_requested", note: `${formatVnd(amount)} (đề xuất ${formatVnd(r.proposal!.refundable)}): ${input.reason.trim()}`, actorId: ctx.user.id });
    await notify(tx as unknown as Db, await managersOf(tx as unknown as Db, r.enrollment.centerId), "Yêu cầu hoàn tiền chờ duyệt", `${r.enrollment.studentName} · ${formatVnd(amount)}`, "/hoan-tien?status=pending", 2, "refund.pending");
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "finance", entity: "refunds", entityId: ins[0]!.id, after: { orderId: r.order!.id, amount, proposed: r.proposal!.refundable }, reason: input.reason, ip: ctx.ip });
    return ins;
  });
  return { id: row!.id };
}

export async function decideRefund(ctx: ProtectedContext, input: { id: string; action: "approve" | "reject"; note?: string | null }) {
  const r = await ctx.db.query.refunds.findFirst({ where: eq(refunds.id, input.id) });
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy yêu cầu hoàn tiền" });
  requirePermission(ctx, input.action === "reject" && r.status === "approved" ? "finance:confirm" : "finance:approve", { centerId: r.centerId });
  const to = wrapRule(() => refundTransition(r.status, input.action));
  if (input.action === "approve" && r.requestedBy === ctx.user.id && !hasRole(ctx.actor, "SUPER_ADMIN")) throw pre("Người đề xuất không tự duyệt yêu cầu hoàn tiền");
  const note = input.action === "reject" ? reasonOrThrow(input.note) : input.note?.trim() || null;
  await ctx.db.transaction(async (tx) => {
    const up = await tx.update(refunds).set({ status: to, decidedBy: ctx.user.id, decidedAt: new Date(), decisionNote: note }).where(and(eq(refunds.id, r.id), eq(refunds.status, r.status))).returning({ id: refunds.id });
    if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Yêu cầu vừa được xử lý" });
    await tx.insert(orderEvents).values({ orderId: r.orderId, event: input.action === "approve" ? "refund_approved" : "refund_rejected", note: `${formatVnd(r.amount)}${note ? `: ${note}` : ""}`, actorId: ctx.user.id });
    const targets = input.action === "approve" ? await accountantsOf(tx as unknown as Db, r.centerId) : [r.requestedBy];
    await notify(tx as unknown as Db, targets, input.action === "approve" ? "Hoàn tiền đã duyệt — chờ chi" : "Yêu cầu hoàn tiền bị từ chối", `${formatVnd(r.amount)}${note ? ` — ${note}` : ""}`, "/hoan-tien", 2, "refund.decided");
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "finance", entity: "refunds", entityId: r.id, before: { status: r.status }, after: { status: to }, reason: note, ip: ctx.ip });
  });
  return { status: to };
}

export async function payRefund(ctx: ProtectedContext, input: { id: string; paymentMethodId: string; payoutRef?: string | null }) {
  const r = await ctx.db.query.refunds.findFirst({ where: eq(refunds.id, input.id) });
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy yêu cầu hoàn tiền" });
  requirePermission(ctx, "finance:confirm", { centerId: r.centerId });
  const to = wrapRule(() => refundTransition(r.status, "pay"));
  const method = await ctx.db.query.paymentMethods.findFirst({ where: eq(paymentMethods.id, input.paymentMethodId) });
  if (!method || (method.centerId && method.centerId !== r.centerId)) throw bad("Phương thức chi không hợp lệ");
  if (r.decidedBy === ctx.user.id && !hasRole(ctx.actor, "SUPER_ADMIN")) throw pre("Người duyệt hoàn tiền không đồng thời chi tiền — cần kế toán khác thực hiện");
  if (method.kind === "bank_transfer" && !input.payoutRef?.trim()) throw bad("Chi hoàn bằng chuyển khoản cần mã giao dịch");
  await ctx.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"order:" + r.orderId}))`);
    const up = await tx.update(refunds).set({ status: to, paidBy: ctx.user.id, paidAt: new Date(), paymentMethodId: method.id, payoutRef: input.payoutRef?.trim() || null })
      .where(and(eq(refunds.id, r.id), eq(refunds.status, "approved"))).returning({ id: refunds.id });
    if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Yêu cầu vừa được xử lý" });
    await tx.insert(financeLedger).values({ orderId: r.orderId, centerId: r.centerId, entryType: "refund", amount: r.amount, refId: r.id, note: `Chi hoàn ${method.name}${input.payoutRef ? ` · ${input.payoutRef}` : ""}`, actorId: ctx.user.id });
    const o = await tx.query.orders.findFirst({ where: eq(orders.id, r.orderId) });
    const [c] = await tx.select({ n: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint` }).from(payments).where(and(eq(payments.orderId, r.orderId), eq(payments.status, "confirmed")));
    const [rf] = await tx.select({ n: sql<number>`coalesce(sum(${refunds.amount}), 0)::bigint` }).from(refunds).where(and(eq(refunds.orderId, r.orderId), eq(refunds.status, "paid")));
    const fully = Number(rf?.n ?? 0) >= Number(c?.n ?? 0);
    await tx.insert(orderEvents).values({ orderId: r.orderId, event: "refund_paid", fromStatus: o?.status, toStatus: fully ? "refunded" : o?.status, note: `${formatVnd(r.amount)} · ${method.name}`, actorId: ctx.user.id });
    if (fully && o) await tx.update(orders).set({ status: "refunded" }).where(eq(orders.id, o.id));
    await adjustCommissionsForRefund(tx as unknown as Db, r.orderId, r.amount, ctx.user.id);
    await notify(tx as unknown as Db, [r.requestedBy], "Đã chi hoàn tiền", `${formatVnd(r.amount)} — nhớ cập nhật trạng thái đăng ký học nếu học viên nghỉ`, "/hoan-tien?status=paid", 2, "refund.decided");
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "finance", entity: "refunds", entityId: r.id, before: { status: r.status }, after: { status: to, method: method.code, payoutRef: input.payoutRef ?? null }, ip: ctx.ip });
  });
  return { status: to };
}

export async function listRefunds(ctx: ProtectedContext, input: { status?: RefundStatus; centerId?: string; limit?: number }) {
  requirePermission(ctx, "finance:read", { centerId: input.centerId ?? null });
  const conds: SQL[] = [scope(ctx, refunds.centerId as unknown as typeof orders.centerId)];
  if (input.status) conds.push(eq(refunds.status, input.status));
  if (input.centerId) conds.push(eq(refunds.centerId, input.centerId));
  const rows = await ctx.db.select({
    r: refunds, orderCode: orders.code, orderTotal: orders.total, customerName: orders.customerName, centerCode: centers.code,
    studentName: students.fullName, classCode: classes.code,
    paid: sql<number>`coalesce((select sum(p.amount) from ${payments} p where p.order_id = ${refunds.orderId} and p.status = 'confirmed'), 0)::bigint`,
    requesterName: sql<string | null>`(select full_name from ${users} u where u.id = ${refunds.requestedBy})`,
    deciderName: sql<string | null>`(select full_name from ${users} u where u.id = ${refunds.decidedBy})`,
  }).from(refunds).innerJoin(orders, eq(orders.id, refunds.orderId)).innerJoin(centers, eq(centers.id, refunds.centerId))
    .leftJoin(enrollments, eq(enrollments.id, refunds.enrollmentId)).leftJoin(students, eq(students.id, enrollments.studentId)).leftJoin(classes, eq(classes.id, enrollments.classId))
    .where(and(...conds)).orderBy(desc(refunds.createdAt)).limit(clampPageSize(input.limit, 300, 500));
  const [counts] = await ctx.db.select({
    pending: sql<number>`count(*) filter (where ${refunds.status} = 'pending')::int`,
    /** Yêu cầu hoàn tiền chờ duyệt quá 48 giờ — để hộp việc khỏi phải lọc mảng đã tải về */
    pendingOverdue: sql<number>`count(*) filter (where ${refunds.status} = 'pending' and ${refunds.createdAt} < now() - interval '48 hours')::int`,
    approved: sql<number>`count(*) filter (where ${refunds.status} = 'approved')::int`,
    rejected: sql<number>`count(*) filter (where ${refunds.status} = 'rejected')::int`,
    paid: sql<number>`count(*) filter (where ${refunds.status} = 'paid')::int`,
  }).from(refunds).where(scope(ctx, refunds.centerId as unknown as typeof orders.centerId));
  const TRIG_VI: Record<string, string> = { withdraw: "Nghỉ học", transfer: "Chuyển lớp", class_cancel: "Huỷ lớp", manual: "Tạo tay" };
  return {
    counts,
    items: rows.map((x) => ({
      ...x.r, orderCode: x.orderCode, orderTotal: x.orderTotal, customerName: x.customerName, centerCode: x.centerCode, studentName: x.studentName, classCode: x.classCode,
      paid: Number(x.paid), requesterName: x.requesterName, deciderName: x.deciderName,
      sourceLabel: x.r.auto ? `Tự đề xuất — ${TRIG_VI[x.r.trigger ?? ""] ?? "vòng đời"}` : TRIG_VI[x.r.trigger ?? "manual"] ?? "Tạo tay",
      canApprove: x.r.status === "pending" && can(ctx, "finance:approve", x.r.centerId) && (x.r.requestedBy !== ctx.user.id || hasRole(ctx.actor, "SUPER_ADMIN")),
      canPay: x.r.status === "approved" && can(ctx, "finance:confirm", x.r.centerId) && (x.r.decidedBy !== ctx.user.id || hasRole(ctx.actor, "SUPER_ADMIN")),
    })),
  };
}

/** Đếm việc tài chính cho dashboard */
export async function financeQueues(ctx: ProtectedContext) {
  const confirmCenters = ctx.actor.assignments.filter((a) => authorize({ userId: ctx.actor.userId, assignments: [a] }, "finance:confirm", { centerId: a.centerId }).allowed);
  const approveCenters = ctx.actor.assignments.filter((a) => authorize({ userId: ctx.actor.userId, assignments: [a] }, "finance:approve", { centerId: a.centerId }).allowed);
  const inScope = (list: { centerId: string | null }[], col: typeof payments.centerId | typeof refunds.centerId | typeof commissions.centerId): SQL => {
    if (list.some((a) => a.centerId === null)) return sql`true`;
    const ids = list.map((a) => a.centerId!).filter(Boolean);
    return ids.length ? (inArray(col, ids) as SQL) : sql`false`;
  };
  const out: { key: string; title: string; count: number; overdue: number; href: string }[] = [];
  if (confirmCenters.length) {
    const [p] = await ctx.db.select({ n: sql<number>`count(*)::int`, old: sql<number>`count(*) filter (where ${payments.recordedAt} < now() - interval '24 hours')::int` }).from(payments).where(and(eq(payments.status, "recorded"), inScope(confirmCenters, payments.centerId)));
    out.push({ key: "payments_confirm", title: "Khoản thu chờ kế toán xác nhận", count: p?.n ?? 0, overdue: p?.old ?? 0, href: "/payments?status=recorded" });
    const [r] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(refunds).where(and(eq(refunds.status, "approved"), inScope(confirmCenters, refunds.centerId)));
    out.push({ key: "refunds_pay", title: "Hoàn tiền đã duyệt chờ chi", count: r?.n ?? 0, overdue: 0, href: "/hoan-tien?status=approved" });
    const bankScope = confirmCenters.some((a) => a.centerId === null)
      ? sql`true`
      : or(isNull(bankTransactions.centerId), inArray(bankTransactions.centerId, confirmCenters.map((a) => a.centerId!).filter(Boolean)))!;
    const [b] = await ctx.db.select({ n: sql<number>`count(*)::int`, old: sql<number>`count(*) filter (where ${bankTransactions.receivedAt} < now() - interval '24 hours')::int` })
      .from(bankTransactions).where(and(inArray(bankTransactions.status, ["unmatched", "needs_review"]), eq(bankTransactions.direction, "in"), bankScope));
    out.push({ key: "bank_open", title: "Tiền về chưa khớp đơn", count: b?.n ?? 0, overdue: b?.old ?? 0, href: "/bien-dong-so-du?status=needs_review" });
    const [c] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(commissions).where(and(eq(commissions.status, "approved"), inScope(confirmCenters, commissions.centerId)));
    out.push({ key: "commission_pay", title: "Hoa hồng đã duyệt chờ chi", count: c?.n ?? 0, overdue: 0, href: "/crm/commission?status=approved" });
  }
  if (approveCenters.length) {
    const [r] = await ctx.db.select({ n: sql<number>`count(*)::int`, old: sql<number>`count(*) filter (where ${refunds.createdAt} < now() - interval '48 hours')::int` }).from(refunds).where(and(eq(refunds.status, "pending"), inScope(approveCenters, refunds.centerId)));
    out.push({ key: "refunds_approve", title: "Yêu cầu hoàn tiền chờ duyệt", count: r?.n ?? 0, overdue: r?.old ?? 0, href: "/hoan-tien?status=pending" });
    const [c] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(commissions).where(and(eq(commissions.status, "accrued"), inScope(approveCenters, commissions.centerId)));
    out.push({ key: "commission_approve", title: "Hoa hồng tạm tính chờ duyệt", count: c?.n ?? 0, overdue: 0, href: "/crm/commission?status=accrued" });
  }
  return out;
}
