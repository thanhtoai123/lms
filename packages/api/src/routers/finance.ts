import { z } from "zod";
import { ORDER_TYPES, ORDER_STATUSES, PAYMENT_STATUSES, PAYMENT_METHOD_KINDS, REFUND_STATUSES, AGING_BUCKETS } from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import * as F from "../services/finance";

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
  createOrder: protectedProcedure
    .input(z.object({
      type: z.enum(ORDER_TYPES), centerId: uuid, enrollmentId: uuid.nullish(), studentId: uuid.nullish(), parentId: uuid.nullish(),
      customer: z.object({
        name: z.string().trim().min(2, "Tên khách tối thiểu 2 ký tự").max(120), phone: z.string().trim().min(9, "Số điện thoại không hợp lệ").max(20),
        email: z.string().trim().email("Email không hợp lệ").max(200).nullish().or(z.literal("")), idNumber: ntext(20), address: ntext(300), province: ntext(80), ward: ntext(80),
      }),
      items: z.array(z.object({ courseId: uuid.nullish(), description: z.string().trim().min(2, "Mô tả dòng hàng tối thiểu 2 ký tự").max(200), quantity: z.number().int().min(1).max(100), unitPrice: money, packageSessions: z.number().int().min(1).max(200).nullish() })).min(1, "Đơn cần ít nhất một dòng").max(20),
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
});
