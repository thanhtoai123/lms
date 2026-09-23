import { sql } from "drizzle-orm";
import { pgTable, text, uuid, boolean, integer, bigint, date, timestamp, pgEnum, jsonb, index, uniqueIndex, smallint, numeric, primaryKey } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_common";
import { tenantCol } from "./tenant";
import {
  ORDER_TYPES, ORDER_STATUSES, DISCOUNT_APPROVALS, PAYMENT_STATUSES, PAYMENT_METHOD_KINDS, REFUND_STATUSES, LEDGER_TYPES, BANK_TX_STATUSES, BANK_TX_SOURCES,
  COMMISSION_KINDS, COMMISSION_STATUSES, RATE_TYPES, PAYMENT_QR_STATUSES, DISCOUNT_POLICIES, COMMISSION_EVENTS, COMMISSION_SCOPES, COMMISSION_CALC_METHODS,
} from "@satarobo/core";
import { centers } from "./org";
import { users } from "./identity";
import { parents, students } from "./people";
import { courses, enrollments } from "./academics";
import { leads, leadChildren } from "./admissions";

const money = (name: string) => bigint(name, { mode: "number" });

export const orderTypeEnum = pgEnum("order_type", ORDER_TYPES);
export const orderStatusEnum = pgEnum("order_status", ORDER_STATUSES);
export const discountApprovalEnum = pgEnum("discount_approval", DISCOUNT_APPROVALS);
export const paymentStatusEnum = pgEnum("payment_status", PAYMENT_STATUSES);
export const paymentMethodKindEnum = pgEnum("payment_method_kind", PAYMENT_METHOD_KINDS);
export const refundStatusEnum = pgEnum("refund_status", REFUND_STATUSES);
export const ledgerTypeEnum = pgEnum("ledger_type", LEDGER_TYPES);

/** Phương thức thanh toán — dùng chung (centerId null) hoặc riêng cơ sở */
export const paymentMethods = pgTable("payment_methods", {
  id: id(),
  tenantId: tenantCol(),
  /** Duy nhất trong một trung tâm (tenant) — mỗi trung tâm có danh mục phương thức riêng */
  code: text("code").notNull(),
  name: text("name").notNull(),
  kind: paymentMethodKindEnum("kind").notNull(),
  centerId: uuid("center_id").references(() => centers.id, { onDelete: "cascade" }),
  bankBin: text("bank_bin"),
  bankName: text("bank_name"),
  bankBranch: text("bank_branch"),
  accountNo: text("account_no"),
  accountName: text("account_name"),
  description: text("description"),
  image: text("image"),
  /** course | package | exam | product */
  allowFor: jsonb("allow_for").$type<string[]>().notNull().default(["course"]),
  /** Phạm vi dùng như bản gốc — 5 cờ; `allow_for` vẫn được giữ đồng bộ để không phá dữ liệu cũ */
  canBuyCourse: boolean("can_buy_course").notNull().default(true),
  canBuyPackage: boolean("can_buy_package").notNull().default(false),
  canBuyExam: boolean("can_buy_exam").notNull().default(false),
  canBuyProduct: boolean("can_buy_product").notNull().default(false),
  /** Nạp ví (reserved — bản gốc đã khai sẵn cờ này) */
  canDeposit: boolean("can_deposit").notNull().default(false),
  /** Cấu hình cổng (VNPAY / TINGEE) */
  gatewayConfig: jsonb("gateway_config").$type<Record<string, unknown>>(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
}, (t) => [uniqueIndex("payment_methods_code_tenant_uq").on(t.tenantId, t.code)]);

/** Đơn hàng (học phí / sản phẩm) */
export const orders = pgTable(
  "orders",
  {
    id: id(),
    tenantId: tenantCol(),
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
    /**
     * Duyệt giảm giá: đơn giảm từ ngưỡng cấu hình trở lên vào `pending` và KHÔNG thu tiền được
     * cho tới khi người có `finance:approve` duyệt (xem `discountNeedsApproval` ở core).
     */
    discountApproval: discountApprovalEnum("discount_approval").notNull().default("none"),
    discountApprovalBy: uuid("discount_approval_by").references(() => users.id),
    discountApprovalAt: timestamp("discount_approval_at", { withTimezone: true }),
    discountApprovalNote: text("discount_approval_note"),
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
    // Hàng chờ duyệt giảm giá: lọc theo cơ sở, mở nhiều lần trong ngày
    index("orders_discount_approval_idx").on(t.discountApproval, t.centerId),
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
    /** amount | percent — hình chiếu cách tính của `policy`, giữ cho dữ liệu cũ */
    kind: text("kind", { enum: ["amount", "percent"] }).notNull(),
    /** none | percent | amount | program (ưu đãi chương trình) | scholarship (học bổng) */
    policy: text("policy", { enum: DISCOUNT_POLICIES }).notNull().default("amount"),
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
    tenantId: tenantCol(),
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
    /** Số lần kế toán điều chỉnh khoản đã xác nhận (bản gốc: cột "soLanDieuChinh") */
    adjustCount: integer("adjust_count").notNull().default(0),
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

export const paymentQrStatusEnum = pgEnum("payment_qr_status", PAYMENT_QR_STATUSES);

/**
 * Mã QR chuyển khoản có hạn dùng. Xuất theo đơn (hoặc theo đợt), còn hiệu lực + đúng số tiền
 * thì dùng lại; hết hạn thì phải xuất mã mới. Hạn dùng lấy từ cấu hình vận hành (mặc định 24 giờ).
 */
export const paymentQrCodes = pgTable(
  "payment_qr_codes",
  {
    id: id(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    /** Đợt được xuất mã (bỏ trống = thu toàn bộ phần còn thiếu của đơn) */
    installmentId: uuid("installment_id").references(() => orderInstallments.id, { onDelete: "set null" }),
    paymentMethodId: uuid("payment_method_id").references(() => paymentMethods.id),
    amount: money("amount").notNull(),
    /** Nội dung chuyển khoản in kèm mã — phụ huynh phải giữ nguyên để hệ thống tự đối khớp */
    content: text("content").notNull(),
    imageUrl: text("image_url").notNull(),
    /** Tham số sinh ảnh, để dựng lại mã khi đổi nhà cung cấp ảnh QR */
    bankBin: text("bank_bin"),
    accountNo: text("account_no"),
    accountName: text("account_name"),
    bankName: text("bank_name"),
    status: paymentQrStatusEnum("status").notNull().default("active"),
    issuedBy: uuid("issued_by").references(() => users.id),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    /** Khoản thu đã khớp vào mã này */
    usedPaymentId: uuid("used_payment_id"),
    revokedReason: text("revoked_reason"),
  },
  (t) => [
    index("payment_qr_order_idx").on(t.orderId, t.status),
    index("payment_qr_expires_idx").on(t.status, t.expiresAt),
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
    tenantId: tenantCol(),
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
  tenantId: tenantCol(),
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
  /** Nguồn văn bản, vd "SR.QD.208 · PL04 Điều 1" */
  sourceRef: text("source_ref"),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id),
  ...timestamps,
});

export const commissionEventEnum = pgEnum("commission_event", COMMISSION_EVENTS);
export const commissionScopeEnum = pgEnum("commission_scope", COMMISSION_SCOPES);
export const commissionCalcEnum = pgEnum("commission_calc", COMMISSION_CALC_METHODS);

/**
 * Chính sách hoa hồng 4 trục (SR.QD.208 · PL04):
 * trục 1 sự kiện · trục 2 loại đơn · trục 3 cách tính · trục 4 các vai nhận (bảng con).
 * Sửa chính sách bắt buộc ghi lý do (ghi vào audit); dòng hoa hồng đã sinh trước đó không đổi.
 */
export const commissionPolicies = pgTable(
  "commission_policies",
  {
    id: id(),
    tenantId: tenantCol(),
    name: text("name").notNull(),
    /** Trục 1 — chi khi nào */
    event: commissionEventEnum("event").notNull(),
    /** Trục 2 — loại đơn: all | course | product */
    orderScope: commissionScopeEnum("order_scope").notNull().default("all"),
    centerId: uuid("center_id").references(() => centers.id, { onDelete: "cascade" }),
    /** Trục 3 — cách tính: percent | fixed | tier */
    calcMethod: commissionCalcEnum("calc_method").notNull(),
    /** Nguồn văn bản, vd "SR.QD.208 · PL04 Điều 1" */
    sourceRef: text("source_ref"),
    note: text("note"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("commission_policies_lookup_idx").on(t.event, t.orderScope, t.centerId, t.isActive)],
);

/** Trục 4 — ai nhận bao nhiêu: nhiều vai cho một chính sách, mỗi vai một mức */
export const commissionPolicyShares = pgTable(
  "commission_policy_shares",
  {
    id: id(),
    policyId: uuid("policy_id").notNull().references(() => commissionPolicies.id, { onDelete: "cascade" }),
    /** Mã vai nhận (vai trò / vị trí công việc) */
    role: text("role").notNull(),
    /** percent: điểm cơ bản (500 = 5%); fixed: VND mỗi đơn vị; tier: đọc bảng bậc */
    value: money("value").notNull().default(0),
    maxAmount: money("max_amount"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("commission_policy_share_unique").on(t.policyId, t.role)],
);

/** Bảng bậc doanh thu của một vai (chỉ dùng khi cách tính = tier) — các bậc không được chồng lấn */
export const commissionPolicyTiers = pgTable(
  "commission_policy_tiers",
  {
    id: id(),
    shareId: uuid("share_id").notNull().references(() => commissionPolicyShares.id, { onDelete: "cascade" }),
    fromAmount: money("from_amount").notNull(),
    /** Bỏ trống = bậc cuối, không giới hạn trên */
    toAmount: money("to_amount"),
    /** Thưởng số tiền cố định của bậc (VND) — dùng một trong hai */
    amount: money("amount"),
    /** Thưởng theo % doanh thu, điểm cơ bản (500 = 5%) — dùng một trong hai */
    percent: integer("percent"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("commission_policy_tiers_share_idx").on(t.shareId, t.fromAmount)],
);

/** Hoa hồng phát sinh theo đơn (dòng âm = thu hồi khi hoàn tiền sau khi đã chi) */
export const commissions = pgTable(
  "commissions",
  {
    id: id(),
    orderId: uuid("order_id").notNull().references(() => orders.id),
    centerId: uuid("center_id").notNull().references(() => centers.id),
    kind: commissionKindEnum("kind").notNull(),
    ruleId: uuid("rule_id").references(() => commissionRules.id),
    /** Chính sách 4 trục đã sinh dòng này (dòng cũ theo quy tắc `rule_id` giữ nguyên) */
    policyId: uuid("policy_id").references(() => commissionPolicies.id),
    event: commissionEventEnum("event"),
    /** Vai nhận theo trục 4 */
    role: text("role"),
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
    // Dòng theo quy tắc cũ: mỗi đơn một dòng cho mỗi loại người hưởng
    uniqueIndex("commissions_order_kind_unique").on(t.orderId, t.kind).where(sql`parent_id is null and policy_id is null`),
    // Dòng theo chính sách 4 trục: một đơn có nhiều vai nhận, mỗi vai một dòng
    uniqueIndex("commissions_order_policy_role_unique").on(t.orderId, t.policyId, t.role).where(sql`parent_id is null and policy_id is not null`),
    index("commissions_period_idx").on(t.period, t.status),
    index("commissions_beneficiary_idx").on(t.beneficiaryUserId, t.period),
  ],
);
