import { pgTable, text, uuid, integer, bigint, boolean, timestamp, pgEnum, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { INVOICE_STATUSES, INVOICE_KINDS } from "@satarobo/core";
import { id, timestamps } from "./_common";
import { tenantCol } from "./tenant";
import { users } from "./identity";
import { centers } from "./org";
import { orders, payments, refunds } from "./finance";

const money = (name: string) => bigint(name, { mode: "number" });
export const invoiceStatusEnum = pgEnum("invoice_status", INVOICE_STATUSES);
export const invoiceKindEnum = pgEnum("invoice_kind", INVOICE_KINDS);

/** Hoá đơn điện tử — 1 khoản thu = 1 hoá đơn gốc; điều chỉnh / thay thế trỏ về hoá đơn gốc */
export const einvoices = pgTable("einvoices", {
  id: id(),
  tenantId: tenantCol(),
  centerId: uuid("center_id").notNull().references(() => centers.id),
  orderId: uuid("order_id").references(() => orders.id),
  paymentId: uuid("payment_id").references(() => payments.id),
  refundId: uuid("refund_id").references(() => refunds.id),
  kind: invoiceKindEnum("kind").notNull().default("original"),
  originalId: uuid("original_id"),
  status: invoiceStatusEnum("status").notNull().default("draft"),
  templateCode: text("template_code").notNull(),
  serial: text("serial").notNull(),
  number: integer("number"),
  provider: text("provider").notNull(),
  providerRef: text("provider_ref"),
  lookupCode: text("lookup_code"),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  buyerName: text("buyer_name"),
  buyerCompany: text("buyer_company"),
  buyerTaxCode: text("buyer_tax_code"),
  buyerAddress: text("buyer_address"),
  buyerEmail: text("buyer_email"),
  buyerPhone: text("buyer_phone"),
  noInvoiceRequested: boolean("no_invoice_requested").notNull().default(false),
  lines: jsonb("lines").$type<{ name: string; unit: string; quantity: number; unitPrice: number; amount: number; taxRate: string }[]>().notNull(),
  subtotal: money("subtotal").notNull(),
  vatAmount: money("vat_amount").notNull(),
  total: money("total").notNull(),
  paymentMethod: text("payment_method"),
  paidDate: text("paid_date"),
  reason: text("reason"),
  agreementNote: text("agreement_note"),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id),
  issuedBy: uuid("issued_by").references(() => users.id),
  ...timestamps,
}, (t) => [
  uniqueIndex("einvoices_payment_original_uq").on(t.paymentId).where(sql`kind = 'original' and status <> 'cancelled'`),
  uniqueIndex("einvoices_number_uq").on(t.templateCode, t.serial, t.number).where(sql`number is not null`),
  index("einvoices_status_idx").on(t.status, t.centerId, t.createdAt),
]);

export const einvoiceEvents = pgTable("einvoice_events", {
  id: id(),
  invoiceId: uuid("invoice_id").notNull().references(() => einvoices.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  note: text("note"),
  userId: uuid("user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Số hoá đơn tăng liên tục theo mẫu số + ký hiệu (nhà cung cấp sandbox; nhà cung cấp thật tự cấp số) */
export const einvoiceCounters = pgTable("einvoice_counters", {
  key: text("key").primaryKey(),
  seq: integer("seq").notNull().default(0),
});
