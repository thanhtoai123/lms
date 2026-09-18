import { pgTable, text, uuid, boolean, date, timestamp, pgEnum, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_common";
import { tenantCol } from "./tenant";
import { ROLES, USER_ROLE_SOURCES } from "@satarobo/core";
import { centers } from "./org";

export const roleEnum = pgEnum("role", ROLES);
export const userRoleSourceEnum = pgEnum("user_role_source", USER_ROLE_SOURCES);

/**
 * users = tài khoản đăng nhập. authSubject = id trong Supabase Auth (sub của JWT).
 * Một người thật (person) có thể có nhiều vai trò; KHÔNG nhân bản hồ sơ theo vai trò.
 */
export const users = pgTable(
  "users",
  {
    id: id(),
    tenantId: tenantCol(),
    authSubject: text("auth_subject").unique(),
    email: text("email").notNull(),
    phone: text("phone"),
    fullName: text("full_name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedReason: text("locked_reason"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/**
 * Gán vai trò theo phạm vi cơ sở; centerId null = toàn hệ thống (Hội sở).
 *
 * Vai trò có thể cấp tay (`source = manual`) hoặc sinh từ **vị trí công việc**
 * (`source = position`, gắn `staffPositionId`). Hiệu lực `validFrom`/`validTo`:
 * hết hạn là quyền tự tắt ở lần truy cập kế tiếp, không cần ai đi gỡ.
 */
export const userRoles = pgTable(
  "user_roles",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    centerId: uuid("center_id").references(() => centers.id, { onDelete: "cascade" }),
    source: userRoleSourceEnum("source").notNull().default("manual"),
    /** Phân công vị trí sinh ra vai trò này (staff_positions.id — không khai FK để tránh vòng import) */
    staffPositionId: uuid("staff_position_id"),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    grantedBy: uuid("granted_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("user_roles_unique").on(t.userId, t.role, t.centerId, t.staffPositionId),
    index("user_roles_user_idx").on(t.userId),
    index("user_roles_position_idx").on(t.staffPositionId),
  ],
);

/**
 * Audit log append-only. Không bao giờ UPDATE/DELETE (chặn bằng trigger trong migration SQL).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    tenantId: tenantCol(),
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
  (t) => [
    index("audit_entity_idx").on(t.entity, t.entityId),
    index("audit_actor_idx").on(t.actorId, t.createdAt),
    index("audit_created_idx").on(t.createdAt),
    index("audit_module_idx").on(t.module, t.createdAt),
  ],
);
