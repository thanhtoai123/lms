import { z } from "zod";
import { ORDER_TYPES, ORDER_STATUSES, PAYMENT_STATUSES, PAYMENT_METHOD_KINDS, REFUND_STATUSES, AGING_BUCKETS, BANK_TX_STATUSES, COMMISSION_KINDS, COMMISSION_STATUSES, RATE_TYPES } from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import * as F from "../services/finance";
import * as B from "../services/bank";
import * as C from "../services/commissions";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ");
const money = z.number().int("Số tiền phải là số nguyên").min(0).max(10_000_000_000);
const ntext = (n: number) => z.string().max(n).nullish();

export const financeRouter = router({
  methods: protectedProcedure
    .input(z.object({ centerId: uuid.nullish(), activeOnly: z.boolean().optional(), forType: z.enum(ORDER_TYPES).optional() }).default({}))
    .query(({ ctx, input }) => F.listPaymentMethods(ctx, input)),
  upsertMethod: protectedProcedure
    .input(z.object({
      id: uuid.optional(), code: z.string().trim().min(2).max(20), name: z.string().trim().min(3, "Tên tối thiểu 3 ký tự").max(120), kind: z.enum(PAYMENT_METHOD_KINDS),
      centerId: uuid.nullable(), bankBin: ntext(10), bankName: ntext(80), accountNo: ntext(30), accountName: ntext(120), description: ntext(500),
      allowFor: z.array(z.enum(["course", "product", "exam", "other"])).max(4), sortOrder: z.number().int().min(0).max(999), isActive: z.boolean(),
    }))
    .mutation(({ ctx, input }) => F.upsertPaymentMethod(ctx, input)),

  orders: protectedProcedure
    .input(z.object({ q: z.string().max(100).optional(), centerId: uuid.optional(), status: z.enum(ORDER_STATUSES).optional(), from: isoDate.optional(), to: isoDate.optional(), page: z.number().int().min(1).optional() }).default({}))
    .query(({ ctx, input }) => F.listOrders(ctx, input)),
  order: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => F.getOrder(ctx, input.id)),
  orderDraft: protectedProcedure.input(z.object({ enrollmentId: uuid })).query(({ ctx, input }) => F.orderDraftFromEnrollment(ctx, input.enrollmentId)),
  orderDraftFromLead: protectedProcedure.input(z.object({ leadId: uuid })).query(({ ctx, input }) => F.orderDraftFromLead(ctx, input.leadId)),
  createOrder: protectedProcedure
    .input(z.object({
      type: z.enum(ORDER_TYPES), centerId: uuid, enrollmentId: uuid.nullish(), studentId: uuid.nullish(), parentId: uuid.nullish(), leadId: uuid.nullish(),
      customer: z.object({
        name: z.string().trim().min(2, "Tên khách tối thiểu 2 ký tự").max(120), phone: z.string().trim().min(9, "Số điện thoại không hợp lệ").max(20),
        email: z.string().trim().email("Email không hợp lệ").max(200).nullish().or(z.literal("")), idNumber: ntext(20), address: ntext(300), province: ntext(80), ward: ntext(80),
      }),
      items: z.array(z.object({ courseId: uuid.nullish(), description: z.string().trim().min(2, "Mô tả dòng hàng tối thiểu 2 ký tự").max(200), quantity: z.number().int().min(1).max(100), unitPrice: money, packageSessions: z.number().int().min(1).max(200).nullish(), leadChildId: uuid.nullish() })).min(1, "Đơn cần ít nhất một dòng").max(20),
      discount: z.object({ type: z.enum(["amount", "percent"]), value: z.number().min(0).max(10_000_000_000) }).nullish(),
      paymentMethodId: uuid,
      installments: z.union([
        z.object({ count: z.number().int().min(1).max(4), firstDueDate: isoDate, intervalDays: z.number().int().min(7).max(180).optional() }),
        z.object({ plan: z.array(z.object({ amount: money, dueDate: isoDate })).min(1).max(4) }),
      ]),
      customerNote: ntext(1000), internalNote: ntext(1000), remindDays: z.number().int().min(0).max(30).optional(),
    }))
    .mutation(({ ctx, input }) => F.createOrder(ctx, { ...input, customer: { ...input.customer, email: input.customer.email || null } })),
  cancelOrder: protectedProcedure.input(z.object({ id: uuid, reason: z.string().max(300) })).mutation(({ ctx, input }) => F.cancelOrder(ctx, input)),
  updateOrderNotes: protectedProcedure.input(z.object({ id: uuid, internalNote: ntext(1000), customerNote: ntext(1000), remindDays: z.number().int().min(0).max(30).optional() })).mutation(({ ctx, input }) => F.updateOrderNotes(ctx, input)),
  revealCustomer: protectedProcedure.input(z.object({ id: uuid, reason: z.string().max(300) })).mutation(({ ctx, input }) => F.revealCustomerPrivate(ctx, input)),

  payments: protectedProcedure
    .input(z.object({ status: z.enum(PAYMENT_STATUSES).optional(), centerId: uuid.optional(), from: isoDate.optional(), to: isoDate.optional(), q: z.string().max(100).optional(), page: z.number().int().min(1).optional() }).default({}))
    .query(({ ctx, input }) => F.listPayments(ctx, input)),
  recordPayment: protectedProcedure
    .input(z.object({ orderId: uuid, amount: money.min(1, "Số tiền phải > 0"), paymentMethodId: uuid, paidAt: isoDate, payerName: ntext(120), note: ntext(500) }))
    .mutation(({ ctx, input }) => F.recordPayment(ctx, input)),
  decidePayment: protectedProcedure
    .input(z.object({ paymentId: uuid, decision: z.enum(["confirm", "reject", "adjust"]), adjustedAmount: money.nullish(), reason: ntext(300) }))
    .mutation(({ ctx, input }) => F.decidePayment(ctx, input)),
  receipt: protectedProcedure.input(z.object({ paymentId: uuid })).query(({ ctx, input }) => F.getReceipt(ctx, input.paymentId)),

  debts: protectedProcedure.input(z.object({ centerId: uuid.optional(), bucket: z.enum(AGING_BUCKETS).optional(), q: z.string().max(100).optional() }).default({})).query(({ ctx, input }) => F.debts(ctx, input)),
  missingTuition: protectedProcedure.input(z.object({ centerId: uuid.optional(), kind: z.enum(["no_order", "unpaid"]).optional() }).default({})).query(({ ctx, input }) => F.missingTuition(ctx, input)),

  refunds: protectedProcedure.input(z.object({ status: z.enum(REFUND_STATUSES).optional(), centerId: uuid.optional() }).default({})).query(({ ctx, input }) => F.listRefunds(ctx, input)),
  refundPreview: protectedProcedure.input(z.object({ enrollmentId: uuid })).query(({ ctx, input }) => F.refundPreview(ctx, input.enrollmentId)),
  requestRefund: protectedProcedure.input(z.object({ enrollmentId: uuid, amount: money.min(1, "Số tiền hoàn phải > 0"), reason: z.string().max(500) })).mutation(({ ctx, input }) => F.requestRefund(ctx, input)),
  decideRefund: protectedProcedure.input(z.object({ id: uuid, action: z.enum(["approve", "reject"]), note: ntext(300) })).mutation(({ ctx, input }) => F.decideRefund(ctx, input)),
  payRefund: protectedProcedure.input(z.object({ id: uuid, paymentMethodId: uuid, payoutRef: ntext(80) })).mutation(({ ctx, input }) => F.payRefund(ctx, input)),

  // Biến động số dư
  bankTxs: protectedProcedure
    .input(z.object({ status: z.enum(BANK_TX_STATUSES).optional(), q: z.string().max(100).optional(), from: isoDate.optional(), to: isoDate.optional(), page: z.number().int().min(1).optional() }).default({}))
    .query(({ ctx, input }) => B.listBankTx(ctx, input)),
  bankCandidates: protectedProcedure.input(z.object({ id: uuid, q: z.string().max(100).optional() })).query(({ ctx, input }) => B.matchCandidates(ctx, input)),
  bankMatch: protectedProcedure.input(z.object({ id: uuid, orderId: uuid, note: ntext(300) })).mutation(({ ctx, input }) => B.matchManually(ctx, input)),
  bankIgnore: protectedProcedure.input(z.object({ id: uuid, reason: z.string().max(300) })).mutation(({ ctx, input }) => B.ignoreBankTx(ctx, input)),
  bankRematch: protectedProcedure.input(z.object({ id: uuid })).mutation(({ ctx, input }) => B.rematchBankTx(ctx, input)),
  statementPreview: protectedProcedure.input(z.object({ csv: z.string().min(1, "File trống").max(3_000_000), paymentMethodId: uuid })).mutation(({ ctx, input }) => B.previewStatement(ctx, input)),
  statementImport: protectedProcedure.input(z.object({ csv: z.string().min(1).max(3_000_000), paymentMethodId: uuid, fileName: ntext(200), note: z.string().max(300) })).mutation(({ ctx, input }) => B.importStatement(ctx, input)),

  // Nhập giao dịch cũ
  legacyPreview: protectedProcedure.input(z.object({ csv: z.string().min(1, "File trống").max(3_000_000) })).mutation(({ ctx, input }) => B.previewLegacy(ctx, input)),
  legacyImport: protectedProcedure.input(z.object({ csv: z.string().min(1).max(3_000_000), note: z.string().max(300), fileName: ntext(200) })).mutation(({ ctx, input }) => B.importLegacy(ctx, input)),
  importBatches: protectedProcedure.input(z.object({ kind: z.enum(["legacy_payments", "bank_statement"]).optional() }).default({})).query(({ ctx, input }) => B.listImportBatches(ctx, input)),

  // Hoa hồng
  commissions: protectedProcedure
    .input(z.object({ period: z.string().regex(/^\d{4}-\d{2}$/).optional(), status: z.enum(COMMISSION_STATUSES).optional(), kind: z.enum(COMMISSION_KINDS).optional(), centerId: uuid.optional(), q: z.string().max(100).optional() }).default({}))
    .query(({ ctx, input }) => C.listCommissions(ctx, input)),
  decideCommissions: protectedProcedure
    .input(z.object({ ids: z.array(uuid).min(1, "Chưa chọn dòng").max(500), action: z.enum(["approve", "pay", "cancel"]), reason: ntext(300), payoutRef: ntext(80) }))
    .mutation(({ ctx, input }) => C.decideCommissions(ctx, input)),
  accrueMissing: protectedProcedure.input(z.object({ centerId: uuid.optional() }).default({})).mutation(({ ctx, input }) => C.accrueMissing(ctx, input)),
  commissionRules: protectedProcedure.query(({ ctx }) => C.listRules(ctx)),
  upsertCommissionRule: protectedProcedure
    .input(z.object({
      id: uuid.optional(), name: z.string().trim().min(3, "Tên tối thiểu 3 ký tự").max(120), kind: z.enum(COMMISSION_KINDS), centerId: uuid.nullable(), orderType: z.enum(ORDER_TYPES).nullable(),
      rateType: z.enum(RATE_TYPES), value: z.number().int().min(1).max(100_000_000), maxAmount: money.nullable(), minOrderTotal: money, effectiveFrom: isoDate, effectiveTo: isoDate.nullable(), isActive: z.boolean(),
    }))
    .mutation(({ ctx, input }) => C.upsertRule(ctx, input)),
});
