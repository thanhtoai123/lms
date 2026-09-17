import { pgTable, text, uuid, timestamp, index, integer } from "drizzle-orm/pg-core";
import { id } from "./_common";
import { parents } from "./people";

/** Phiên đăng nhập cổng phụ huynh (cookie chứa mã ngẫu nhiên; DB chỉ lưu băm) */
export const parentSessions = pgTable("parent_sessions", {
  id: id(),
  parentId: uuid("parent_id").notNull().references(() => parents.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  method: text("method").notNull(),
  userAgent: text("user_agent"),
  ip: text("ip"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("parent_sessions_parent_idx").on(t.parentId, t.expiresAt)]);

/** Đăng ký nhận thông báo đẩy (Web Push) của từng thiết bị phụ huynh */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: id(),
  parentId: uuid("parent_id").notNull().references(() => parents.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  failures: integer("failures").notNull().default(0),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("push_subscriptions_parent_idx").on(t.parentId)]);
