import { sql } from "drizzle-orm";
import { pgTable, text, uuid, boolean, integer, bigint, date, timestamp, pgEnum, jsonb, index, uniqueIndex, smallint, numeric, primaryKey } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_common";
import { ORDER_TYPES, ORDER_STATUSES, PAYMENT_STATUSES, PAYMENT_METHOD_KINDS, REFUND_STATUSES, LEDGER_TYPES, BANK_TX_STATUSES, BANK_TX_SOURCES, COMMISSION_KINDS, COMMISSION_STATUSES, RATE_TYPES } from "@satarobo/core";
import { centers } from "./org";
import { users } from "./identity";
import { parents, students } from "./people";
import { courses, enrollments } from "./academics";
import { leads, leadChildren } from "./admissions";

const money = (name: string) => bigint(name, { mode: "number" });

export const orderTypeEnum = pgEnum("order_type", ORDER_TYPES);
export const orderStatusEnum = pgEnum("order_status", ORDER_STATUSES);
export const paymentStatusEnum = pgEnum("payment_status", PAYMENT_STATUSES);
export const paymentMethodKindEnum = pgEnum("payment_method_kind", PAYMENT_METHOD_KINDS);
export const refundStatusEnum = pgEnum("refund_status", REFUND_STATUSES);
export const ledgerTypeEnum = pgEnum("ledger_type", LEDGER_TYPES);

/** Phương thức thanh toán — dùng chung (centerId null) hoặc riêng cơ sở */
export const paymentMethods = pgTable("payment_methods", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  kind: paymentMethodKindEnum("kind").notNull(),
  centerId: uuid("center_id").references(() => centers.id, { onDelete: "cascade" }),
  bankBin: text("bank_bin"),
  bankName: text("bank_name"),
  accountNo: text("account_no"),
  accountName: text("account_name"),
  description: text("description"),
  /** course | package | exam | product */
  allowFor: jsonb("allow_for").$type<string[]>().notNull().default(["course"]),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

/** Đơn hàng (học phí / sản phẩm) */
export const orders = pgTable(
  "orders",
  {
    id: id(),
    code: text("code").notNull().unique(),
    type: orderTypeEnum("type").notNull().default("course"),
    status: orderStatusEnum("status").notNull().default("pending_payment"),
    centerId: uuid("center_id").notNull().references(() => centers.id),
    parentId: uuid("parent_id").references(() => parents.id),
    studentId: uuid("student_id").references(() => students.id),
    enrollmentId: uuid("enrollment_id").references(() => enrollments.id),
    /** Đơn tạo cho khách tiềm năng (lead) — điều kiện chốt: lead phải có đơn đã ghi nhận thu */
    leadId: uuid("lead_id").references(() => leads.id),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerEmail: text("customer_email"),
    subtotal: money("subtotal").notNull(),
    discountType: text("discount_type"),
    discountValue: integer("discount_value"),
    discountAmount: money("discount_amount").notNull().default(0),
    total: money("total").notNull(),
    paymentMethodId: uuid("payment_method_id").references(() => paymentMethods.id),
    customerNote: text("customer_note"),
    internalNote: text("internal_note"),
    /** Nhắc công nợ trước N ngày */
    remindDays: smallint("remind_days").notNull().default(3),
    cancelReason: text("cancel_reason"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("orders_center_idx").on(t.centerId, t.status, t.createdAt),
    index("orders_enrollment_idx").on(t.enrollmentId),
    index("orders_phone_idx").on(t.customerPhone),
    index("orders_lead_idx").on(t.leadId),
  ],
);

/** CCCD / địa chỉ khách — tách riêng, chỉ vai trò tài chính mới đọc (đã che) */
export const orderPrivate = pgTable("order_private", {
  orderId: uuid("order_id").primaryKey().references(() => orders.id, { onDelete: "cascade" }),
  idNumber: text("id_number"),
  address: text("address"),
  province: text("province"),
  ward: text("ward"),
});

export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").references(() => courses.id),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: money("unit_price").notNull(),
    /** Thành tiền trước giảm (SL × đơn giá) */
    amount: money("amount").notNull(),
    packageSessions: integer("package_sessions"),
    /** Dòng của con nào (khi đơn tạo từ lead); chốt xong gắn học viên + ghi danh */
    leadChildId: uuid("lead_child_id").references(() => leadChildren.id, { onDelete: "set null" }),
    studentId: uuid("student_id").references(() => students.id),
    enrollmentId: uuid("enrollment_id").references(() => enrollments.id),
    /** group | coach_1_1 | coach_1_2 | coach_1_4 — hệ số đã nằm trong đơn giá */
    classFormat: text("class_format").notNull().default("group"),
    formatMultiplier: numeric("format_multiplier", { precision: 3, scale: 2 }).notNull().default("1"),
    /** Tổng các khoản giảm của dòng (xem order_item_discounts) */
    discountAmount: money("discount_amount").notNull().default(0),
    /** amount − discount_amount: phần thực phải thu của dòng (công nợ theo con) */
    netAmount: money("net_amount").notNull().default(0),
  },
  (t) => [index("order_items_order_idx").on(t.orderId), index("order_items_lead_child_idx").on(t.leadChildId), index("order_items_enrollment_idx").on(t.enrollmentId), index("order_items_student_idx").on(t.studentId)],
);

/** Khoản giảm của từng dòng đơn — cộng dồn, mỗi khoản bắt buộc có lý do */
export const orderItemDiscounts = pgTable(
  "order_item_discounts",
  {
    id: id(),
    orderItemId: uuid("order_item_id").notNull().references(() => orderItems.id, { onDelete: "cascade" }),
    /** amount | percent */
    kind: text("kind", { enum: ["amount", "percent"] }).notNull(),
    /** amount: VND; percent: 1..trần cấu hình */
    value: integer("value").notNull(),
    /** Số tiền giảm đã quy ra VND */
    amount: money("amount").notNull(),
    reason: text("reason").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_item_discounts_item_idx").on(t.orderItemId)],
);

export const orderInstallments = pgTable(
  "order_installments",
  {
    id: id(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    seq: smallint("seq").notNull(),
    amount: money("amount").notNull(),
    dueDate: date("due_date").notNull(),
    /** deposit (thu cọc trước, tối đa 1 và đứng đầu) | installment */
    kind: text("kind", { enum: ["deposit", "installment"] }).notNull().default("installment"),
    /** Đợt riêng cho một con (đơn nhiều con) */
    studentId: uuid("student_id").references(() => students.id),
    orderItemId: uuid("order_item_id").references(() => orderItems.id, { onDelete: "set null" }),
    /** Huỷ mềm khi sửa kế hoạch — giữ lịch sử, unique chỉ tính đợt còn hiệu lực */
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    createdBy: uuid("created_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("order_installments_unique").on(t.orderId, t.seq).where(sql`cancelled_at is null`),
    index("order_installments_due_idx").on(t.dueDate),
    index("order_installments_student_idx").on(t.studentId),
  ],
);

/** Lịch sử trạng thái đơn */
export const orderEvents = pgTable(
  "order_events",
  {
    id: id(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    fromStatus: orderStatusEnum("from_status"),
    toStatus: orderStatusEnum("to_status"),
    note: text("note"),
    actorId: uuid("actor_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);

/** Khoản thu: sale/lễ tân ghi nhận → kế toán xác nhận / từ chối / điều chỉnh */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    orderId: uuid("order_id").notNull().references(() => orders.id),
    centerId: uuid("center_id").notNull().references(() => centers.id),
    /** Số tiền ghi nhận ban đầu */
    recordedAmount: money("recorded_amount").notNull(),
    /** Số tiền có hiệu lực (= ghi nhận, hoặc số điều chỉnh khi kế toán xác nhận) */
    amount: money("amount").notNull(),
    paymentMethodId: uuid("payment_method_id").references(() => paymentMethods.id),
    paidAt: date("paid_at").notNull(),
    status: paymentStatusEnum("status").notNull().default("recorded"),
    /** manual | sepay | statement | backfill | legacy */
    source: text("source").notNull().default("manual"),
    externalRef: text("external_ref"),
    payerName: text("payer_name"),
    note: text("note"),
    /** Khoản thu của ghi danh / dòng đơn nào (đơn nhiều con) */
    enrollmentId: uuid("enrollment_id").references(() => enrollments.id),
    orderItemId: uuid("order_item_id").references(() => orderItems.id, { onDelete: "set null" }),
    /** Link chứng từ (ảnh uỷ nhiệm chi, biên nhận) */
    evidenceUrl: text("evidence_url"),
    /** Chống ghi đè: tăng mỗi lần sửa / điều chỉnh (STALE_WRITE khi lệch) */
    version: integer("version").notNull().default(1),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    recordedBy: uuid("recorded_by").references(() => users.id),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionReason: text("decision_reason"),
    receiptNo: text("receipt_no").unique(),
    ...timestamps,
  },
  (t) => [
    index("payments_order_idx").on(t.orderId),
    index("payments_status_idx").on(t.status, t.centerId, t.recordedAt),
    index("payments_enrollment_idx").on(t.enrollmentId),
    index("payments_order_item_idx").on(t.orderItemId),
    uniqueIndex("payments_external_ref_unique").on(t.source, t.externalRef),
  ],
);

/** Lịch sử điều chỉnh khoản thu đã xác nhận (mỗi lần sinh bút toán chênh lệch) */
export const paymentAdjustments = pgTable(
  "payment_adjustments",
  {
    id: id(),
    paymentId: uuid("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
    beforeAmount: money("before_amount").notNull(),
    afterAmount: money("after_amount").notNull(),
    reason: text("reason").notNull(),
    actorId: uuid("actor_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payment_adjustments_payment_idx").on(t.paymentId, t.createdAt)],
);

/** Hoàn tiền theo buổi: đề xuất → duyệt → chi */
export const refunds = pgTable(
  "refunds",
  {
    id: id(),
    orderId: uuid("order_id").notNull().references(() => orders.id),
    enrollmentId: uuid("enrollment_id").references(() => enrollments.id),
    centerId: uuid("center_id").notNull().references(() => centers.id),
    status: refundStatusEnum("status").notNull().default("pending"),
    amount: money("amount").notNull(),
    proposedAmount: money("proposed_amount").notNull(),
    sessionsUsed: integer("sessions_used").notNull().default(0),
    sessionsTotal: integer("sessions_total").notNull().default(0),
    reason: text("reason").notNull(),
    /** withdraw | transfer | class_cancel | manual — nguồn sinh đề xuất */
    trigger: text("trigger"),
    /** Đề xuất do hệ thống tự sinh theo vòng đời học vụ */
    auto: boolean("auto").notNull().default(false),
    requestedBy: uuid("requested_by").references(() => users.id),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    paidBy: uuid("paid_by").references(() => users.id),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paymentMethodId: uuid("payment_method_id").references(() => paymentMethods.id),
    payoutRef: text("payout_ref"),
    ...timestamps,
  },
  (t) => [index("refunds_status_idx").on(t.status, t.centerId)],
);

/** Sổ cái tài chính — chỉ thêm, không sửa/xoá (trigger ở SQL) */
export const financeLedger = pgTable(
  "finance_ledger",
  {
    id: id(),
    orderId: uuid("order_id").notNull().references(() => orders.id),
    centerId: uuid("center_id").notNull().references(() => centers.id),
    entryType: ledgerTypeEnum("entry_type").notNull(),
    /** Dương = phải thu tăng / tiền vào; âm = giảm */
    amount: money("amount").notNull(),
    refId: uuid("ref_id"),
    note: text("note"),
    actorId: uuid("actor_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("finance_ledger_order_idx").on(t.orderId, t.createdAt), index("finance_ledger_center_idx").on(t.centerId, t.createdAt)],
);

export const bankTxStatusEnum = pgEnum("bank_tx_status", BANK_TX_STATUSES);
export const commissionKindEnum = pgEnum("commission_kind", COMMISSION_KINDS);
export const commissionStatusEnum = pgEnum("commission_status", COMMISSION_STATUSES);
export const rateTypeEnum = pgEnum("rate_type", RATE_TYPES);

/** Lô nhập file (giao dịch cũ / sao kê) */
export const importBatches = pgTable(
  "import_batches",
  {
    id: id(),
    /** legacy_payments | bank_statement */
    kind: text("kind").notNull(),
    fileName: text("file_name"),
    note: text("note").notNull(),
    totalRows: integer("total_rows").notNull().default(0),
    okRows: integer("ok_rows").notNull().default(0),
    skippedRows: integer("skipped_rows").notNull().default(0),
    totalAmount: money("total_amount").notNull().default(0),
    summary: jsonb("summary").$type<Record<string, unknown>>(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("import_batches_kind_idx").on(t.kind, t.createdAt)],
);

/** Biến động số dư: webhook SePay hoặc nhập sao kê */
export const bankTransactions = pgTable(
  "bank_transactions",
  {
    id: id(),
    source: text("source", { enum: BANK_TX_SOURCES }).notNull(),
    externalId: text("external_id").notNull(),
    gateway: text("gateway"),
    accountNo: text("account_no").notNull(),
    paymentMethodId: uuid("payment_method_id").references(() => paymentMethods.id),
    /** Cơ sở suy ra từ tài khoản nhận (null = tài khoản dùng chung) hoặc từ đơn khi đã khớp */
    centerId: uuid("center_id").references(() => centers.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    amount: money("amount").notNull(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    content: text("content").notNull().default(""),
    referenceCode: text("reference_code"),
    accumulated: money("accumulated"),
    status: bankTxStatusEnum("status").notNull(),
    matchNote: text("match_note"),
    orderId: uuid("order_id").references(() => orders.id),
    /** Khoản thu khi rót một-một (giữ để tương thích; rót nhiều con dùng bank_tx_allocations) */
    paymentId: uuid("payment_id").references(() => payments.id),
    /** Tiền còn dư sau khi rót hết các đợt — không tự hoàn, không tự trừ sang đơn khác */
    surplusAmount: money("surplus_amount").notNull().default(0),
    handledBy: uuid("handled_by").references(() => users.id),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    importBatchId: uuid("import_batch_id").references(() => importBatches.id),
    raw: jsonb("raw"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bank_tx_external_unique").on(t.source, t.externalId),
    index("bank_tx_status_idx").on(t.status, t.occurredAt),
    index("bank_tx_center_idx").on(t.centerId, t.occurredAt),
    index("bank_tx_surplus_idx").on(t.surplusAmount),
  ],
);

/** Rót một giao dịch vào nhiều khoản thu (đơn nhiều con) — thay cho quan hệ 1-1 cũ */
export const bankTxAllocations = pgTable(
  "bank_tx_allocations",
  {
    bankTxId: uuid("bank_tx_id").notNull().references(() => bankTransactions.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id").references(() => orderItems.id, { onDelete: "set null" }),
    amount: money("amount").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.bankTxId, t.paymentId] }), index("bank_tx_alloc_payment_idx").on(t.paymentId)],
);

/** Quy tắc hoa hồng */
export const commissionRules = pgTable("commission_rules", {
  id: id(),
  name: text("name").notNull(),
  kind: commissionKindEnum("kind").notNull(),
  centerId: uuid("center_id").references(() => centers.id, { onDelete: "cascade" }),
  orderType: orderTypeEnum("order_type"),
  rateType: rateTypeEnum("rate_type").notNull(),
  /** percent: điểm cơ bản (500 = 5%); fixed: VND */
  value: money("value").notNull(),
  maxAmount: money("max_amount"),
  minOrderTotal: money("min_order_total").notNull().default(0),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id),
  ...timestamps,
});

/** Hoa hồng phát sinh theo đơn (dòng âm = thu hồi khi hoàn tiền sau khi đã chi) */
export const commissions = pgTable(
  "commissions",
  {
    id: id(),
    orderId: uuid("order_id").notNull().references(() => orders.id),
    centerId: uuid("center_id").notNull().references(() => centers.id),
    kind: commissionKindEnum("kind").notNull(),
    ruleId: uuid("rule_id").references(() => commissionRules.id),
    parentId: uuid("parent_id"),
    beneficiaryUserId: uuid("beneficiary_user_id").references(() => users.id),
    beneficiaryParentId: uuid("beneficiary_parent_id").references(() => parents.id),
    beneficiaryName: text("beneficiary_name").notNull(),
    baseAmount: money("base_amount").notNull(),
    rateLabel: text("rate_label").notNull(),
    originalAmount: money("original_amount").notNull(),
    amount: money("amount").notNull(),
    /** YYYY-MM — kỳ tính theo ngày đơn thu đủ */
    period: text("period").notNull(),
    status: commissionStatusEnum("status").notNull().default("accrued"),
    note: text("note"),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    paidBy: uuid("paid_by").references(() => users.id),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    payoutRef: text("payout_ref"),
    cancelReason: text("cancel_reason"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("commissions_order_kind_unique").on(t.orderId, t.kind).where(sql`parent_id is null`),
    index("commissions_period_idx").on(t.period, t.status),
    index("commissions_beneficiary_idx").on(t.beneficiaryUserId, t.period),
  ],
);
