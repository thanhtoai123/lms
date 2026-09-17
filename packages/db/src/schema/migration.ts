import { pgTable, text, uuid, timestamp, jsonb, boolean, date, uniqueIndex, index, integer } from "drizzle-orm/pg-core";
import { id } from "./_common";
import { centers } from "./org";
import { users } from "./identity";

/** Ánh xạ mã hệ cũ → bản ghi hệ mới (chạy lại file không nhân bản) */
export const legacyRefs = pgTable("legacy_refs", {
  id: id(),
  /** student | enrollment */
  kind: text("kind").notNull(),
  legacyCode: text("legacy_code").notNull(),
  entityId: uuid("entity_id").notNull(),
  batchId: uuid("batch_id"),
  data: jsonb("data").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("legacy_refs_kind_code_uq").on(t.kind, t.legacyCode), index("legacy_refs_entity_idx").on(t.entityId)]);

/** Lần đối soát số liệu tổng (hệ cũ nhập tay ↔ hệ mới tính) */
export const reconSnapshots = pgTable("recon_snapshots", {
  id: id(),
  centerId: uuid("center_id").references(() => centers.id),
  legacy: jsonb("legacy").$type<Record<string, number | null>>().notNull(),
  current: jsonb("current").$type<Record<string, number>>().notNull(),
  ok: boolean("ok").notNull(),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("recon_snapshots_center_idx").on(t.centerId, t.createdAt)]);

/** Giai đoạn go-live của từng cơ sở */
export const cutoverCenters = pgTable("cutover_centers", {
  centerId: uuid("center_id").primaryKey().references(() => centers.id),
  stage: text("stage").notNull().default("preparing"),
  checklist: jsonb("checklist").$type<Record<string, boolean>>().notNull().default({}),
  parallelFrom: date("parallel_from"),
  liveAt: timestamp("live_at", { withTimezone: true }),
  readonlyAt: timestamp("readonly_at", { withTimezone: true }),
  note: text("note"),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Sổ chạy song song: mỗi ngày so số liệu hệ cũ ↔ hệ mới */
export const parallelRunDays = pgTable("parallel_run_days", {
  id: id(),
  centerId: uuid("center_id").notNull().references(() => centers.id),
  date: date("date").notNull(),
  legacy: jsonb("legacy").$type<Record<string, number>>().notNull(),
  current: jsonb("current").$type<Record<string, number>>().notNull(),
  ok: boolean("ok").notNull(),
  mismatches: integer("mismatches").notNull().default(0),
  /** giải thích chênh lệch; ngày lệch mà chưa giải thích = vấn đề mở */
  explanation: text("explanation"),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("parallel_run_days_uq").on(t.centerId, t.date)]);

/** Sổ phản hồi / sự cố trong thời gian pilot */
export const pilotFeedback = pgTable("pilot_feedback", {
  id: id(),
  centerId: uuid("center_id").notNull().references(() => centers.id),
  category: text("category").notNull(),
  severity: text("severity").notNull(),
  status: text("status").notNull().default("open"),
  title: text("title").notNull(),
  detail: text("detail"),
  pageUrl: text("page_url"),
  resolution: text("resolution"),
  createdBy: uuid("created_by").references(() => users.id),
  handledBy: uuid("handled_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("pilot_feedback_center_idx").on(t.centerId, t.status)]);

/** Nhân sự đã học xong bài hướng dẫn (đạt câu hỏi kiểm tra) */
export const trainingCompletions = pgTable("training_completions", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  moduleKey: text("module_key").notNull(),
  attempts: integer("attempts").notNull().default(1),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("training_completions_uq").on(t.userId, t.moduleKey)]);
