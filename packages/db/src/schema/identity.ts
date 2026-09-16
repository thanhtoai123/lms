import { pgTable, text, uuid, boolean, timestamp, pgEnum, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_common";
import { ROLES } from "@satarobo/core";
import { centers } from "./org";

export const roleEnum = pgEnum("role", ROLES);

/**
 * users = tài khoản đăng nhập. authSubject = id trong Supabase Auth (sub của JWT).
 * Một người thật (person) có thể có nhiều vai trò; KHÔNG nhân bản hồ sơ theo vai trò.
 */
export const users = pgTable(
  "users",
  {
    id: id(),
    authSubject: text("auth_subject").unique(),
    email: text("email").notNull(),
    phone: text("phone"),
    fullName: text("full_name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/** Gán vai trò theo phạm vi cơ sở; centerId null = toàn hệ thống (Hội sở) */
export const userRoles = pgTable(
  "user_roles",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    centerId: uuid("center_id").references(() => centers.id, { onDelete: "cascade" }),
    grantedBy: uuid("granted_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("user_roles_unique").on(t.userId, t.role, t.centerId),
    index("user_roles_user_idx").on(t.userId),
  ],
);

/**
 * Audit log append-only. Không bao giờ UPDATE/DELETE (chặn bằng trigger trong migration SQL).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actorId: uuid("actor_id").references(() => users.id),
    action: text("action").notNull(), // CREATE | UPDATE | DELETE | TRANSITION | PII_REVEAL ...
    module: text("module").notNull(), // academics | finance | ...
    entity: text("entity").notNull(), // sessions | classes ...
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId), index("audit_actor_idx").on(t.actorId, t.createdAt)],
);
