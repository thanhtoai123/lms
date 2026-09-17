import { pgTable, text, uuid, integer, bigint, boolean, date, timestamp, pgEnum, index, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";
import { ITEM_TYPES, MOVEMENT_TYPES, RENTAL_STATUSES, AUDIT_STATUSES, COIN_REASONS, REDEMPTION_STATUSES } from "@satarobo/core";
import { id, timestamps } from "./_common";
import { users } from "./identity";
import { centers } from "./org";
import { students } from "./people";
import { classes, courses, sessions } from "./academics";
import { orders } from "./finance";

const money = (name: string) => bigint(name, { mode: "number" });

export const itemTypeEnum = pgEnum("item_type", ITEM_TYPES);
export const movementTypeEnum = pgEnum("stock_movement_type", MOVEMENT_TYPES);
export const rentalStatusEnum = pgEnum("rental_status", RENTAL_STATUSES);
export const stockAuditStatusEnum = pgEnum("stock_audit_status", AUDIT_STATUSES);
export const coinReasonEnum = pgEnum("coin_reason", COIN_REASONS);
export const redemptionStatusEnum = pgEnum("redemption_status", REDEMPTION_STATUSES);

/** Danh mục hàng (dùng chung toàn hệ thống) */
export const inventoryItems = pgTable("inventory_items", {
  id: id(),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  type: itemTypeEnum("type").notNull(),
  unit: text("unit").notNull().default("cái"),
  courseId: uuid("course_id").references(() => courses.id),
  salePrice: money("sale_price"),
  rentPrice: money("rent_price"),
  deposit: money("deposit"),
  reorderLevel: integer("reorder_level").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  description: text("description"),
  ...timestamps,
}, (t) => [index("inventory_items_type_idx").on(t.type, t.isActive)]);

/** Định mức bộ học cụ (BOM) */
export const kitComponents = pgTable("kit_components", {
  kitId: uuid("kit_id").notNull().references(() => inventoryItems.id, { onDelete: "cascade" }),
  componentId: uuid("component_id").notNull().references(() => inventoryItems.id),
  qty: integer("qty").notNull(),
}, (t) => [primaryKey({ columns: [t.kitId, t.componentId] })]);

/** Tồn hiện tại theo cơ sở — chỉ cập nhật cùng transaction với phiếu */
export const stockLevels = pgTable("stock_levels", {
  itemId: uuid("item_id").notNull().references(() => inventoryItems.id),
  centerId: uuid("center_id").notNull().references(() => centers.id),
  onHand: integer("on_hand").notNull().default(0),
  avgCost: money("avg_cost").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.itemId, t.centerId] })]);

/** Sổ phiếu kho — chỉ thêm */
export const stockMovements = pgTable("stock_movements", {
  id: id(),
  code: text("code").notNull(),
  itemId: uuid("item_id").notNull().references(() => inventoryItems.id),
  centerId: uuid("center_id").notNull().references(() => centers.id),
  type: movementTypeEnum("type").notNull(),
  qty: integer("qty").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  unitCost: money("unit_cost"),
  studentId: uuid("student_id").references(() => students.id),
  classId: uuid("class_id").references(() => classes.id),
  orderId: uuid("order_id").references(() => orders.id),
  counterpartCenterId: uuid("counterpart_center_id").references(() => centers.id),
  refType: text("ref_type"),
  refId: uuid("ref_id"),
  supplier: text("supplier"),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("stock_mov_item_idx").on(t.itemId, t.centerId, t.createdAt),
  index("stock_mov_center_idx").on(t.centerId, t.createdAt),
  index("stock_mov_code_idx").on(t.code),
  index("stock_mov_student_idx").on(t.studentId),
  index("stock_mov_order_idx").on(t.orderId),
]);

/** Bộ đếm số phiếu theo tiền tố + cơ sở + năm */
export const stockCounters = pgTable("stock_counters", {
  key: text("key").primaryKey(),
  seq: integer("seq").notNull().default(0),
});

export const rentals = pgTable("rentals", {
  id: id(),
  code: text("code").notNull().unique(),
  itemId: uuid("item_id").notNull().references(() => inventoryItems.id),
  centerId: uuid("center_id").notNull().references(() => centers.id),
  studentId: uuid("student_id").notNull().references(() => students.id),
  qty: integer("qty").notNull().default(1),
  status: rentalStatusEnum("status").notNull().default("out"),
  startDate: date("start_date").notNull(),
  dueDate: date("due_date").notNull(),
  fee: money("fee").notNull().default(0),
  deposit: money("deposit").notNull().default(0),
  depositCharged: money("deposit_charged"),
  orderId: uuid("order_id").references(() => orders.id),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  condition: text("condition"),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id),
  closedBy: uuid("closed_by").references(() => users.id),
  ...timestamps,
}, (t) => [index("rentals_center_idx").on(t.centerId, t.status, t.dueDate), index("rentals_student_idx").on(t.studentId)]);

export const stockAudits = pgTable("stock_audits", {
  id: id(),
  code: text("code").notNull().unique(),
  centerId: uuid("center_id").notNull().references(() => centers.id),
  status: stockAuditStatusEnum("status").notNull().default("draft"),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id),
  submittedBy: uuid("submitted_by").references(() => users.id),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [index("stock_audits_center_idx").on(t.centerId, t.status)]);

export const stockAuditLines = pgTable("stock_audit_lines", {
  auditId: uuid("audit_id").notNull().references(() => stockAudits.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").notNull().references(() => inventoryItems.id),
  systemQty: integer("system_qty").notNull(),
  countedQty: integer("counted_qty"),
  note: text("note"),
}, (t) => [primaryKey({ columns: [t.auditId, t.itemId] })]);

/* ------------------------------------------------------------------ */
/* SataCoin                                                            */
/* ------------------------------------------------------------------ */

/** Sổ xu — chỉ thêm */
export const coinTransactions = pgTable("coin_transactions", {
  id: id(),
  studentId: uuid("student_id").notNull().references(() => students.id),
  centerId: uuid("center_id").notNull().references(() => centers.id),
  amount: integer("amount").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  reason: coinReasonEnum("reason").notNull(),
  note: text("note"),
  classId: uuid("class_id").references(() => classes.id),
  sessionId: uuid("session_id").references(() => sessions.id),
  redemptionId: uuid("redemption_id"),
  revokesId: uuid("revokes_id"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("coin_tx_student_idx").on(t.studentId, t.createdAt),
  index("coin_tx_center_idx").on(t.centerId, t.createdAt),
  uniqueIndex("coin_tx_revokes_uq").on(t.revokesId),
]);

export const rewardItems = pgTable("reward_items", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  cost: integer("cost").notNull(),
  inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const redemptions = pgTable("redemptions", {
  id: id(),
  code: text("code").notNull().unique(),
  studentId: uuid("student_id").notNull().references(() => students.id),
  centerId: uuid("center_id").notNull().references(() => centers.id),
  rewardId: uuid("reward_id").notNull().references(() => rewardItems.id),
  cost: integer("cost").notNull(),
  status: redemptionStatusEnum("status").notNull().default("requested"),
  note: text("note"),
  decisionNote: text("decision_note"),
  requestedBy: uuid("requested_by").references(() => users.id),
  decidedBy: uuid("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  deliveredBy: uuid("delivered_by").references(() => users.id),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [index("redemptions_center_idx").on(t.centerId, t.status), index("redemptions_student_idx").on(t.studentId)]);
