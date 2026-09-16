import { pgTable, text, uuid, boolean, integer, bigint, date, timestamp, pgEnum, jsonb, index, uniqueIndex, smallint } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_common";
import { ORDER_TYPES, ORDER_STATUSES, PAYMENT_STATUSES, PAYMENT_METHOD_KINDS, REFUND_STATUSES, LEDGER_TYPES } from "@satarobo/core";
import { centers } from "./org";
import { users } from "./identity";
import { parents, students } from "./people";
import { courses, enrollments } from "./academics";

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
    amount: money("amount").notNull(),
    packageSessions: integer("package_sessions"),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

export const orderInstallments = pgTable(
  "order_installments",
  {
    id: id(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    seq: smallint("seq").notNull(),
    amount: money("amount").notNull(),
    dueDate: date("due_date").notNull(),
  },
  (t) => [uniqueIndex("order_installments_unique").on(t.orderId, t.seq), index("order_installments_due_idx").on(t.dueDate)],
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
    /** manual | sepay | import */
    source: text("source").notNull().default("manual"),
    externalRef: text("external_ref"),
    payerName: text("payer_name"),
    note: text("note"),
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
    uniqueIndex("payments_external_ref_unique").on(t.source, t.externalRef),
  ],
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
