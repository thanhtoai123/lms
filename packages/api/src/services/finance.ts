import { and, eq, inArray, sql, asc, desc, isNull, gte, lte, or, ilike, ne, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  paymentMethods, orders, orderPrivate, orderItems, orderInstallments, orderEvents, payments, refunds, financeLedger,
  centers, users, userRoles, userNotifications, enrollments, classes, courses, students, parents, studentGuardians,
} from "@satarobo/db";
import {
  authorize, hasRole, visibleCenterIds, addDays,
  priceOrder, packagePrice, buildInstallmentPlan, validateInstallmentPlan, orderBalance, deriveOrderStatus, canCancelOrder,
  allocateInstallments, agingBucket, dueSoon, validatePaymentDecision, receiptNumber, orderCode, transferMemo, maskIdNumber,
  refundProposal, validateRefundRequest, refundTransition, vietQrImageUrl, requireReason, formatVnd,
  AGING_BUCKETS, FinanceRuleError,
  type OrderType, type OrderStatus, type PaymentStatus, type PaymentDecision, type RefundStatus, type PaymentMethodKind, type AgingBucket, type Discount, type Permission,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { todayISO } from "./sessions";
import { consumedSql } from "./students";

type Db = ProtectedContext["db"];
const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });
const pre = (m: string | string[]) => new TRPCError({ code: "PRECONDITION_FAILED", message: Array.isArray(m) ? m.join("; ") : m });

function wrapRule<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof FinanceRuleError || (e as Error)?.name === "FinanceRuleError") throw pre((e as Error).message);
    throw e;
  }
}

function reasonOrThrow(reason: string | null | undefined) {
  try {
    return requireReason(reason);
  } catch (e) {
    throw bad((e as Error).message);
  }
}

function scope(ctx: ProtectedContext, col: SQL | typeof orders.centerId): SQL {
  const v = visibleCenterIds(ctx.actor);
  if (v === null) return sql`true`;
  return v.length ? (inArray(col as typeof orders.centerId, v) as SQL) : sql`false`;
}

const can = (ctx: ProtectedContext, p: Permission, centerId: string | null) => authorize(ctx.actor, p, { centerId }).allowed;

async function notify(db: Db, userIds: (string | null | undefined)[], title: string, body: string, link: string, priority = 2) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (ids.length) await db.insert(userNotifications).values(ids.map((userId) => ({ userId, title, body, link, priority })));
}

async function accountantsOf(db: Db, centerId: string) {
  return (await db.select({ u: userRoles.userId }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.role, "CENTER_ACCOUNTANT"), eq(userRoles.centerId, centerId), eq(users.isActive, true)))).map((r) => r.u);
}

async function managersOf(db: Db, centerId: string) {
  return (await db.select({ u: userRoles.userId }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.role, "CENTER_MANAGER"), eq(userRoles.centerId, centerId), eq(users.isActive, true)))).map((r) => r.u);
}

/** Số đã xác nhận / chờ xác nhận / đã chi hoàn của đơn */
const confirmedSql = sql<number>`coalesce((select sum(p.amount) from ${payments} p where p.order_id = ${sql.raw('"orders"."id"')} and p.status = 'confirmed'), 0)::bigint`;
const pendingSql = sql<number>`coalesce((select sum(p.amount) from ${payments} p where p.order_id = ${sql.raw('"orders"."id"')} and p.status = 'recorded'), 0)::bigint`;
const refundedSql = sql<number>`coalesce((select sum(r.amount) from ${refunds} r where r.order_id = ${sql.raw('"orders"."id"')} and r.status = 'paid'), 0)::bigint`;

async function recomputeOrderStatus(tx: Db, orderId: string, actorId: string, note: string) {
  const o = await tx.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!o) return;
  const [c] = await tx.select({ n: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint` }).from(payments).where(and(eq(payments.orderId, orderId), eq(payments.status, "confirmed")));
  const next = deriveOrderStatus(o.status, o.total, Number(c?.n ?? 0));
  if (next !== o.status) {
    await tx.update(orders).set({ status: next }).where(eq(orders.id, orderId));
    await tx.insert(orderEvents).values({ orderId, event: "status", fromStatus: o.status, toStatus: next, note, actorId });
  }
}

/* ------------------------------------------------------------------ */
/* Phương thức thanh toán                                              */
/* ------------------------------------------------------------------ */

export async function listPaymentMethods(ctx: ProtectedContext, input: { centerId?: string | null; activeOnly?: boolean; forType?: OrderType }) {
  requirePermission(ctx, "finance:read", { centerId: input.centerId ?? null });
  const conds: SQL[] = [];
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
    .map((r) => ({ ...r.m, centerCode: r.centerCode, canEdit: can(ctx, "finance:configure", r.m.centerId) }));
}

export interface PaymentMethodInput {
  id?: string; code: string; name: string; kind: PaymentMethodKind; centerId: string | null; bankBin?: string | null; bankName?: string | null;
  accountNo?: string | null; accountName?: string | null; description?: string | null; allowFor: string[]; sortOrder: number; isActive: boolean;
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
  if (!input.allowFor.length) throw bad("Chọn ít nhất một loại đơn được dùng");
  const dup = (await ctx.db.select({ id: paymentMethods.id }).from(paymentMethods).where(and(eq(paymentMethods.code, code), input.id ? ne(paymentMethods.id, input.id) : undefined)).limit(1))[0];
  if (dup) throw new TRPCError({ code: "CONFLICT", message: `Mã ${code} đã tồn tại` });
  const values = {
    code, name: input.name.trim(), kind: input.kind, centerId: input.centerId, bankBin: input.bankBin?.trim() || null, bankName: input.bankName?.trim() || null,
    accountNo: input.accountNo?.trim() || null, accountName: input.accountName?.trim().toUpperCase() || null, description: input.description?.trim() || null,
    allowFor: [...new Set(input.allowFor)], sortOrder: input.sortOrder, isActive: input.isActive,
  };
  if (input.id) {
    const before = await ctx.db.query.paymentMethods.findFirst({ where: eq(paymentMethods.id, input.id) });
    if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy phương thức" });
    if (before.centerId !== input.centerId && !can(ctx, "finance:configure", before.centerId)) throw new TRPCError({ code: "FORBIDDEN", message: "Không có quyền sửa phương thức này" });
    await ctx.db.update(paymentMethods).set(values).where(eq(paymentMethods.id, input.id));
    await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "finance", entity: "payment_methods", entityId: input.id, before: { ...before, createdAt: undefined, updatedAt: undefined }, after: values, ip: ctx.ip });
    return { id: input.id };
  }
  const [row] = await ctx.db.insert(paymentMethods).values(values).returning({ id: paymentMethods.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "finance", entity: "payment_methods", entityId: row!.id, after: values, ip: ctx.ip });
  return { id: row!.id };
}

/* ------------------------------------------------------------------ */
/* Đơn hàng                                                            */
/* ------------------------------------------------------------------ */

export async function listOrders(ctx: ProtectedContext, input: { q?: string; centerId?: string; status?: OrderStatus; from?: string; to?: string; page?: number }) {
  requirePermission(ctx, "finance:read", { centerId: input.centerId ?? null });
  const conds: SQL[] = [scope(ctx, orders.centerId)];
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
  return {
    total: tot?.n ?? 0, sum: Number(tot?.sum ?? 0), page, pageSize, counts,
    items: rows.map((r) => ({ ...r, confirmed: Number(r.confirmed), pending: Number(r.pending), outstanding: r.status === "cancelled" || r.status === "refunded" ? 0 : Math.max(0, r.total - Number(r.confirmed)), customerPhone: full ? r.customerPhone : r.customerPhone.replace(/\d(?=\d{3})/g, "•") })),
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

export interface CreateOrderInput {
  type: OrderType;
  centerId: string;
  enrollmentId?: string | null;
  studentId?: string | null;
  parentId?: string | null;
  customer: { name: string; phone: string; email?: string | null; idNumber?: string | null; address?: string | null; province?: string | null; ward?: string | null };
  items: { courseId?: string | null; description: string; quantity: number; unitPrice: number; packageSessions?: number | null }[];
  discount?: Discount | null;
  paymentMethodId: string;
  installments: { count: number; firstDueDate: string; intervalDays?: number } | { plan: { amount: number; dueDate: string }[] };
  customerNote?: string | null;
  internalNote?: string | null;
  remindDays?: number;
}

export async function createOrder(ctx: ProtectedContext, input: CreateOrderInput) {
  requirePermission(ctx, "finance:create", { centerId: input.centerId });
  const center = await ctx.db.query.centers.findFirst({ where: eq(centers.id, input.centerId) });
  if (!center) throw bad("Cơ sở không hợp lệ");
  const phone = input.customer.phone.replace(/\D/g, "");
  if (phone.length < 9 || phone.length > 11) throw bad("Số điện thoại khách hàng không hợp lệ");
  const priced = priceOrder(input.items, input.discount);
  if (priced.errors.length) throw bad(priced.errors);
  const method = await ctx.db.query.paymentMethods.findFirst({ where: eq(paymentMethods.id, input.paymentMethodId) });
  if (!method || !method.isActive) throw bad("Phương thức thanh toán không hợp lệ");
  if (method.centerId && method.centerId !== input.centerId) throw bad("Phương thức thanh toán thuộc cơ sở khác");
  if (!method.allowFor.includes(input.type)) throw bad("Phương thức này không áp dụng cho loại đơn đã chọn");
  const plan = "plan" in input.installments
    ? input.installments.plan.map((p, i) => ({ seq: i + 1, amount: Math.round(p.amount), dueDate: p.dueDate }))
    : wrapRule(() => buildInstallmentPlan(priced.total, (input.installments as { count: number }).count, (input.installments as { firstDueDate: string }).firstDueDate, (input.installments as { intervalDays?: number }).intervalDays ?? 30));
  const planErrs = validateInstallmentPlan(priced.total, plan);
  if (priced.total > 0 && planErrs.length) throw bad(planErrs);
  let enrollmentId: string | null = null;
  let studentId = input.studentId ?? null;
  if (input.enrollmentId) {
    const [e] = await ctx.db.select({ id: enrollments.id, centerId: classes.centerId, studentId: enrollments.studentId, status: enrollments.status })
      .from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).where(eq(enrollments.id, input.enrollmentId));
    if (!e) throw bad("Đăng ký học không tồn tại");
    if (e.centerId !== input.centerId) throw bad("Đăng ký học thuộc cơ sở khác");
    const open = await ctx.db.select({ code: orders.code }).from(orders).where(and(eq(orders.enrollmentId, e.id), inArray(orders.status, ["pending_payment", "partially_paid", "paid"]))).limit(1);
    if (open[0]) throw new TRPCError({ code: "CONFLICT", message: `Đăng ký này đã có đơn ${open[0].code} — huỷ đơn cũ hoặc tạo đơn bổ sung loại "Khác"` });
    enrollmentId = e.id;
    studentId = e.studentId;
  }
  if (input.discount && input.discount.value > 0 && (input.internalNote ?? "").trim().length < 3) throw bad("Đơn có giảm giá cần ghi chú nội bộ (lý do / chương trình ưu đãi)");

  return ctx.db.transaction(async (tx) => {
    const yr = Number(todayISO().slice(0, 4));
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"order-code:" + yr}))`);
    const prefix = orderCode(yr, 0).slice(0, 5); // "DH26-"
    const [m] = await tx.select({ n: sql<number>`coalesce(max(substring(${orders.code} from 6)::int), 0)::int` }).from(orders).where(ilike(orders.code, `${prefix}%`));
    const code = orderCode(yr, (m?.n ?? 0) + 1);
    const [o] = await tx.insert(orders).values({
      code, type: input.type, status: priced.total === 0 ? "paid" : "pending_payment", centerId: input.centerId, parentId: input.parentId ?? null, studentId, enrollmentId,
      customerName: input.customer.name.trim(), customerPhone: phone, customerEmail: input.customer.email?.trim() || null,
      subtotal: priced.subtotal, discountType: input.discount?.value ? input.discount.type : null, discountValue: input.discount?.value ? Math.round(input.discount.value) : null,
      discountAmount: priced.discountAmount, total: priced.total, paymentMethodId: method.id,
      customerNote: input.customerNote?.trim() || null, internalNote: input.internalNote?.trim() || null, remindDays: input.remindDays ?? 3, createdBy: ctx.user.id,
    }).returning();
    const priv = input.customer;
    if (priv.idNumber || priv.address || priv.province || priv.ward) {
      await tx.insert(orderPrivate).values({ orderId: o!.id, idNumber: priv.idNumber?.replace(/\s/g, "") || null, address: priv.address?.trim() || null, province: priv.province?.trim() || null, ward: priv.ward?.trim() || null });
    }
    await tx.insert(orderItems).values(input.items.map((i) => ({ orderId: o!.id, courseId: i.courseId ?? null, description: i.description.trim(), quantity: i.quantity, unitPrice: Math.round(i.unitPrice), amount: Math.round(i.quantity * i.unitPrice), packageSessions: i.packageSessions ?? null })));
    if (priced.total > 0) await tx.insert(orderInstallments).values(plan.map((p) => ({ orderId: o!.id, ...p })));
    await tx.insert(orderEvents).values({ orderId: o!.id, event: "create", toStatus: o!.status, note: priced.discountAmount ? `Giảm ${formatVnd(priced.discountAmount)}` : null, actorId: ctx.user.id });
    await tx.insert(financeLedger).values({ orderId: o!.id, centerId: input.centerId, entryType: "charge", amount: priced.total, refId: o!.id, note: `Tạo đơn ${code}`, actorId: ctx.user.id });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "finance", entity: "orders", entityId: o!.id, after: { code, total: priced.total, discount: priced.discountAmount, enrollmentId, installments: plan.length }, ip: ctx.ip });
    return { id: o!.id, code };
  });
}

async function loadOrder(ctx: ProtectedContext, id: string, perm: Permission = "finance:read") {
  const o = await ctx.db.query.orders.findFirst({ where: eq(orders.id, id) });
  if (!o) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy đơn hàng" });
  requirePermission(ctx, perm, { centerId: o.centerId });
  return o;
}

export async function getOrder(ctx: ProtectedContext, id: string) {
  const o = await loadOrder(ctx, id);
  const today = todayISO();
  const [center, method, priv, items, plan, pays, refs, events, ledger, creator, student, enrollment] = await Promise.all([
    ctx.db.query.centers.findFirst({ where: eq(centers.id, o.centerId), columns: { id: true, code: true, name: true } }),
    o.paymentMethodId ? ctx.db.query.paymentMethods.findFirst({ where: eq(paymentMethods.id, o.paymentMethodId) }) : null,
    ctx.db.query.orderPrivate.findFirst({ where: eq(orderPrivate.orderId, o.id) }),
    ctx.db.select({ i: orderItems, courseCode: courses.code }).from(orderItems).leftJoin(courses, eq(courses.id, orderItems.courseId)).where(eq(orderItems.orderId, o.id)),
    ctx.db.select().from(orderInstallments).where(eq(orderInstallments.orderId, o.id)).orderBy(asc(orderInstallments.seq)),
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
  const refundedPaid = refs.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount, 0);
  const bal = orderBalance(o.total, pays.map((p) => ({ amount: p.p.amount, status: p.p.status })), refundedPaid);
  const installments = allocateInstallments(plan.map((p) => ({ seq: p.seq, amount: p.amount, dueDate: p.dueDate })), bal.confirmed, today);
  const memo = transferMemo(o.code);
  const qr = method?.kind === "bank_transfer" && method.bankBin && method.accountNo && bal.outstanding > 0 && o.status !== "cancelled"
    ? { url: vietQrImageUrl({ bankBin: method.bankBin, accountNo: method.accountNo, accountName: method.accountName, amount: installments.find((i) => i.remaining > 0)?.remaining ?? bal.outstanding, memo }), bankName: method.bankName, accountNo: method.accountNo, accountName: method.accountName, memo }
    : null;
  const canConfirm = can(ctx, "finance:confirm", o.centerId);
  return {
    ...o,
    center, method: method ? { id: method.id, name: method.name, kind: method.kind } : null,
    customerPrivate: priv ? { idNumber: maskIdNumber(priv.idNumber), address: priv.address ? `${priv.address.slice(0, 4)}…` : null, province: priv.province, ward: priv.ward, hasIdNumber: !!priv.idNumber } : null,
    items: items.map((x) => ({ ...x.i, courseCode: x.courseCode })),
    installments,
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
  return { ok: true };
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

export async function recordPayment(ctx: ProtectedContext, input: { orderId: string; amount: number; paymentMethodId: string; paidAt: string; payerName?: string | null; note?: string | null }) {
  const o = await loadOrder(ctx, input.orderId, "finance:create");
  if (o.status === "cancelled" || o.status === "refunded") throw pre("Đơn đã đóng — không ghi nhận thu");
  const amount = Math.round(input.amount);
  if (amount <= 0) throw bad("Số tiền phải > 0");
  const today = todayISO();
  if (input.paidAt > today) throw bad("Ngày thu không được ở tương lai");
  if (input.paidAt < addDays(today, -90)) throw bad("Ngày thu quá 90 ngày — dùng Nhập giao dịch cũ");
  const method = await ctx.db.query.paymentMethods.findFirst({ where: eq(paymentMethods.id, input.paymentMethodId) });
  if (!method || !method.isActive || (method.centerId && method.centerId !== o.centerId)) throw bad("Phương thức thanh toán không hợp lệ cho đơn này");
  const id = await ctx.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"order:" + o.id}))`);
    const pays = await tx.select({ amount: payments.amount, status: payments.status }).from(payments).where(eq(payments.orderId, o.id));
    const bal = orderBalance(o.total, pays);
    const room = bal.outstanding - bal.pending;
    if (amount > room) throw pre(`Số tiền vượt phần còn phải thu (${formatVnd(Math.max(0, room))}, đã trừ ${formatVnd(bal.pending)} đang chờ xác nhận)`);
    const [p] = await tx.insert(payments).values({
      orderId: o.id, centerId: o.centerId, recordedAmount: amount, amount, paymentMethodId: method.id, paidAt: input.paidAt, status: "recorded",
      payerName: input.payerName?.trim() || null, note: input.note?.trim() || null, recordedBy: ctx.user.id,
    }).returning({ id: payments.id });
    await tx.insert(orderEvents).values({ orderId: o.id, event: "payment_recorded", note: `${formatVnd(amount)} · ${method.name}`, actorId: ctx.user.id });
    await notify(tx as unknown as Db, await accountantsOf(tx as unknown as Db, o.centerId), "Khoản thu chờ xác nhận", `${o.code} · ${formatVnd(amount)} · ${o.customerName}`, "/payments?status=recorded");
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "finance", entity: "payments", entityId: p!.id, after: { orderId: o.id, amount, method: method.code, paidAt: input.paidAt }, ip: ctx.ip });
    return p!.id;
  });
  return { id };
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
      await notify(tx as unknown as Db, [p.recordedBy], "Khoản thu bị từ chối", `${o.code} · ${formatVnd(p.amount)} — ${input.reason!.trim()}`, `/orders/${o.id}`, 1);
      await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "finance", entity: "payments", entityId: p.id, before: { status: "recorded" }, after: { status: "rejected" }, reason: input.reason ?? null, ip: ctx.ip });
      return { status: "rejected" as PaymentStatus, receiptNo: null as string | null };
    }
    const amount = input.decision === "adjust" ? Math.round(input.adjustedAmount!) : p.amount;
    const [c] = await tx.select({ n: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint` }).from(payments).where(and(eq(payments.orderId, o.id), eq(payments.status, "confirmed")));
    if (Number(c?.n ?? 0) + amount > o.total) throw pre(`Xác nhận ${formatVnd(amount)} sẽ vượt tổng đơn (đã thu ${formatVnd(Number(c?.n ?? 0))}/${formatVnd(o.total)}) — điều chỉnh số tiền`);
    const yr = Number(todayISO().slice(0, 4));
    const prefix = receiptNumber(center?.code ?? "HO", yr, 0).slice(0, -6);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"receipt:" + prefix}))`);
    const [m] = await tx.select({ n: sql<number>`coalesce(max(right(${payments.receiptNo}, 6)::int), 0)::int` }).from(payments).where(ilike(payments.receiptNo, `${prefix}%`));
    const receiptNo = receiptNumber(center?.code ?? "HO", yr, (m?.n ?? 0) + 1);
    const up = await tx.update(payments).set({ status: "confirmed", amount, decidedBy: ctx.user.id, decidedAt: new Date(), decisionReason: input.reason?.trim() || null, receiptNo })
      .where(and(eq(payments.id, p.id), eq(payments.status, "recorded"))).returning({ id: payments.id });
    if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Khoản thu vừa được xử lý" });
    await tx.insert(financeLedger).values({ orderId: o.id, centerId: o.centerId, entryType: "payment", amount: -amount, refId: p.id, note: `${receiptNo}${input.decision === "adjust" ? ` (điều chỉnh từ ${formatVnd(p.amount)})` : ""}`, actorId: ctx.user.id });
    await tx.insert(orderEvents).values({ orderId: o.id, event: input.decision === "adjust" ? "payment_adjusted" : "payment_confirmed", note: `${receiptNo} · ${formatVnd(amount)}${input.decision === "adjust" ? ` (ghi nhận ${formatVnd(p.amount)}: ${input.reason!.trim()})` : ""}`, actorId: ctx.user.id });
    await recomputeOrderStatus(tx as unknown as Db, o.id, ctx.user.id, receiptNo);
    if (input.decision === "adjust") await notify(tx as unknown as Db, [p.recordedBy], "Khoản thu được điều chỉnh", `${o.code}: ${formatVnd(p.amount)} → ${formatVnd(amount)}`, `/orders/${o.id}`);
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "finance", entity: "payments", entityId: p.id, before: { status: "recorded", amount: p.amount }, after: { status: "confirmed", amount, receiptNo }, reason: input.reason ?? null, ip: ctx.ip });
    return { status: "confirmed" as PaymentStatus, receiptNo };
  });
  return result;
}

export async function listPayments(ctx: ProtectedContext, input: { status?: PaymentStatus; centerId?: string; from?: string; to?: string; q?: string; page?: number }) {
  requirePermission(ctx, "finance:read", { centerId: input.centerId ?? null });
  const conds: SQL[] = [scope(ctx, payments.centerId as unknown as typeof orders.centerId)];
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
    orderId: orders.id, orderCode: orders.code, customerName: orders.customerName, centerId: payments.centerId, centerCode: centers.code,
    studentName: students.fullName, classCode: classes.code, methodName: paymentMethods.name,
    recorderName: sql<string | null>`(select full_name from ${users} u where u.id = ${payments.recordedBy})`,
    deciderName: sql<string | null>`(select full_name from ${users} u where u.id = ${payments.decidedBy})`,
    idNumber: sql<string | null>`(select op.id_number from ${orderPrivate} op where op.order_id = ${orders.id})`,
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
    confirmed: sql<number>`count(*) filter (where ${payments.status} = 'confirmed')::int`,
    rejected: sql<number>`count(*) filter (where ${payments.status} = 'rejected')::int`,
  }).from(payments).where(scope(ctx, payments.centerId as unknown as typeof orders.centerId));
  return {
    total: tot?.n ?? 0, page, pageSize, counts,
    sums: { confirmed: Number(tot?.confirmedSum ?? 0), recorded: Number(tot?.recordedSum ?? 0) },
    items: rows.map((r) => ({
      ...r,
      idNumber: maskIdNumber(r.idNumber),
      canDecide: r.status === "recorded" && can(ctx, "finance:confirm", r.centerId) && (r.recordedBy !== ctx.user.id || hasRole(ctx.actor, "SUPER_ADMIN")),
    })),
  };
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
  const items = rows.map((r) => {
    const confirmed = Number(r.confirmed);
    const plan = plans.filter((p) => p.orderId === r.id).map((p) => ({ seq: p.seq, amount: p.amount, dueDate: p.dueDate }));
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
  const buckets = AGING_BUCKETS.map((b) => ({ bucket: b, count: items.filter((i) => i.bucket === b).length, amount: items.filter((i) => i.bucket === b).reduce((s, i) => s + (b === "current" ? i.outstanding : i.overdueAmount), 0) }));
  const byCenter = [...new Map(items.map((i) => [i.centerId, i.centerCode])).entries()].map(([id, code]) => {
    const xs = items.filter((i) => i.centerId === id);
    return { centerId: id, centerCode: code, orders: xs.length, outstanding: xs.reduce((s, i) => s + i.outstanding, 0), overdue: xs.reduce((s, i) => s + i.overdueAmount, 0), pending: xs.reduce((s, i) => s + i.pending, 0) };
  });
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
      orderId: sql<string | null>`(select o.id from ${orders} o where o.enrollment_id = ${enrollments.id} and o.status in ('pending_payment','partially_paid','paid') order by o.created_at desc limit 1)`,
    })
    .from(enrollments).innerJoin(students, eq(students.id, enrollments.studentId)).innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(courses, eq(courses.id, classes.courseId)).innerJoin(centers, eq(centers.id, classes.centerId))
    .where(and(...conds)).orderBy(asc(centers.code), asc(classes.code), asc(students.fullName));
  const orderIds = rows.map((r) => r.orderId).filter((x): x is string => !!x);
  const os = orderIds.length ? await ctx.db.select({ id: orders.id, code: orders.code, total: orders.total, status: orders.status, confirmed: confirmedSql, pending: pendingSql }).from(orders).where(inArray(orders.id, orderIds)) : [];
  const items = rows.map((r) => {
    const o = r.orderId ? os.find((x) => x.id === r.orderId) ?? null : null;
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
  return {
    totals: { noOrder: items.filter((i) => i.kind === "no_order").length, unpaid: items.filter((i) => i.kind === "unpaid").length, amount: items.reduce((s, i) => s + i.outstanding, 0) },
    items: filtered,
  };
}

/* ------------------------------------------------------------------ */
/* Hoàn tiền                                                           */
/* ------------------------------------------------------------------ */

async function refundContext(ctx: ProtectedContext, enrollmentId: string) {
  const [e] = await ctx.db.select({
    id: enrollments.id, status: enrollments.status, packageSessions: enrollments.packageSessions, consumed: consumedSql,
    centerId: classes.centerId, classCode: classes.code, studentName: students.fullName, studentId: students.id,
  }).from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).innerJoin(students, eq(students.id, enrollments.studentId)).where(eq(enrollments.id, enrollmentId)).limit(1);
  if (!e) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy đăng ký học" });
  requirePermission(ctx, "finance:read", { centerId: e.centerId });
  const [o] = await ctx.db.select({ id: orders.id, code: orders.code, total: orders.total, status: orders.status, confirmed: confirmedSql })
    .from(orders).where(and(eq(orders.enrollmentId, e.id), inArray(orders.status, ["partially_paid", "paid", "refunded"]))).orderBy(desc(orders.createdAt)).limit(1);
  if (!o) return { enrollment: e, order: null, proposal: null, refunds: [] as (typeof refunds.$inferSelect)[] };
  const items = await ctx.db.select({ amount: orderItems.amount, packageSessions: orderItems.packageSessions }).from(orderItems).where(eq(orderItems.orderId, o.id));
  const courseItem = items.find((i) => i.packageSessions);
  const discountRatio = o.total > 0 ? o.total / items.reduce((s, i) => s + i.amount, 0) : 1;
  const packageValue = Math.round((courseItem?.amount ?? o.total) * (Number.isFinite(discountRatio) ? discountRatio : 1));
  const rs = await ctx.db.select().from(refunds).where(eq(refunds.orderId, o.id)).orderBy(desc(refunds.createdAt));
  const already = rs.filter((r) => r.status !== "rejected").reduce((s, r) => s + r.amount, 0);
  const proposal = refundProposal({ paid: Number(o.confirmed), packageValue, packageSessions: courseItem?.packageSessions ?? e.packageSessions, consumedSessions: e.consumed, alreadyRefunded: already });
  return { enrollment: e, order: { ...o, confirmed: Number(o.confirmed) }, proposal: { ...proposal, packageValue, alreadyRefunded: already }, refunds: rs };
}

export async function refundPreview(ctx: ProtectedContext, enrollmentId: string) {
  const r = await refundContext(ctx, enrollmentId);
  return { ...r, canRequest: can(ctx, "finance:create", r.enrollment.centerId) && !!r.order && !r.refunds.some((x) => x.status === "pending" || x.status === "approved") };
}

export async function requestRefund(ctx: ProtectedContext, input: { enrollmentId: string; amount: number; reason: string }) {
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
      sessionsUsed: r.proposal!.usedSessions, sessionsTotal: r.enrollment.packageSessions, reason: input.reason.trim(), requestedBy: ctx.user.id,
    }).returning({ id: refunds.id });
    await tx.insert(orderEvents).values({ orderId: r.order!.id, event: "refund_requested", note: `${formatVnd(amount)} (đề xuất ${formatVnd(r.proposal!.refundable)}): ${input.reason.trim()}`, actorId: ctx.user.id });
    await notify(tx as unknown as Db, await managersOf(tx as unknown as Db, r.enrollment.centerId), "Yêu cầu hoàn tiền chờ duyệt", `${r.enrollment.studentName} · ${formatVnd(amount)}`, "/hoan-tien?status=pending");
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
    await notify(tx as unknown as Db, targets, input.action === "approve" ? "Hoàn tiền đã duyệt — chờ chi" : "Yêu cầu hoàn tiền bị từ chối", `${formatVnd(r.amount)}${note ? ` — ${note}` : ""}`, "/hoan-tien");
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
    await notify(tx as unknown as Db, [r.requestedBy], "Đã chi hoàn tiền", `${formatVnd(r.amount)} — nhớ cập nhật trạng thái đăng ký học nếu học viên nghỉ`, "/hoan-tien?status=paid");
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "finance", entity: "refunds", entityId: r.id, before: { status: r.status }, after: { status: to, method: method.code, payoutRef: input.payoutRef ?? null }, ip: ctx.ip });
  });
  return { status: to };
}

export async function listRefunds(ctx: ProtectedContext, input: { status?: RefundStatus; centerId?: string }) {
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
    .where(and(...conds)).orderBy(desc(refunds.createdAt)).limit(300);
  const [counts] = await ctx.db.select({
    pending: sql<number>`count(*) filter (where ${refunds.status} = 'pending')::int`,
    approved: sql<number>`count(*) filter (where ${refunds.status} = 'approved')::int`,
    rejected: sql<number>`count(*) filter (where ${refunds.status} = 'rejected')::int`,
    paid: sql<number>`count(*) filter (where ${refunds.status} = 'paid')::int`,
  }).from(refunds).where(scope(ctx, refunds.centerId as unknown as typeof orders.centerId));
  return {
    counts,
    items: rows.map((x) => ({
      ...x.r, orderCode: x.orderCode, orderTotal: x.orderTotal, customerName: x.customerName, centerCode: x.centerCode, studentName: x.studentName, classCode: x.classCode,
      paid: Number(x.paid), requesterName: x.requesterName, deciderName: x.deciderName,
      canApprove: x.r.status === "pending" && can(ctx, "finance:approve", x.r.centerId) && (x.r.requestedBy !== ctx.user.id || hasRole(ctx.actor, "SUPER_ADMIN")),
      canPay: x.r.status === "approved" && can(ctx, "finance:confirm", x.r.centerId),
    })),
  };
}

/** Đếm việc tài chính cho dashboard */
export async function financeQueues(ctx: ProtectedContext) {
  const confirmCenters = ctx.actor.assignments.filter((a) => authorize({ userId: ctx.actor.userId, assignments: [a] }, "finance:confirm", { centerId: a.centerId }).allowed);
  const approveCenters = ctx.actor.assignments.filter((a) => authorize({ userId: ctx.actor.userId, assignments: [a] }, "finance:approve", { centerId: a.centerId }).allowed);
  const inScope = (list: { centerId: string | null }[], col: typeof payments.centerId | typeof refunds.centerId): SQL => {
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
  }
  if (approveCenters.length) {
    const [r] = await ctx.db.select({ n: sql<number>`count(*)::int`, old: sql<number>`count(*) filter (where ${refunds.createdAt} < now() - interval '48 hours')::int` }).from(refunds).where(and(eq(refunds.status, "pending"), inScope(approveCenters, refunds.centerId)));
    out.push({ key: "refunds_approve", title: "Yêu cầu hoàn tiền chờ duyệt", count: r?.n ?? 0, overdue: r?.old ?? 0, href: "/hoan-tien?status=pending" });
  }
  return out;
}
