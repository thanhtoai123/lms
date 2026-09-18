import { pgTable, text, uuid, integer, bigint, timestamp, jsonb, index, uniqueIndex, boolean, primaryKey } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_common";
import { tenantCol } from "./tenant";
import { users } from "./identity";
import { centers } from "./org";

/** Mẫu email theo sự kiện (không có dòng → dùng mẫu mặc định trong core) */
export const emailTemplates = pgTable("email_templates", {
  id: id(),
  tenantId: tenantCol(),
  /** Duy nhất trong một trung tâm (tenant) — mỗi trung tâm có bộ mẫu email riêng */
  eventKey: text("event_key").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  updatedBy: uuid("updated_by").references(() => users.id),
  ...timestamps,
}, (t) => [uniqueIndex("email_templates_event_tenant_uq").on(t.tenantId, t.eventKey)]);

/** Nhật ký / hàng đợi email */
export const emailLogs = pgTable(
  "email_logs",
  {
    id: id(),
    /** Trung tâm (tenant) đứng tên gửi thư — quyết định mẫu email được dùng */
    tenantId: tenantCol(),
    toEmail: text("to_email").notNull(),
    eventKey: text("event_key").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    /** queued | sent | failed | skipped */
    status: text("status").notNull().default("queued"),
    provider: text("provider"),
    providerRef: text("provider_ref"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    relatedType: text("related_type"),
    relatedId: text("related_id"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("email_logs_status_idx").on(t.status, t.nextAttemptAt), index("email_logs_created_idx").on(t.createdAt)],
);

/** OTP: chỉ lưu băm mã */
export const otpRequests = pgTable(
  "otp_requests",
  {
    id: id(),
    phone: text("phone").notNull(),
    purpose: text("purpose").notNull(),
    codeHash: text("code_hash").notNull(),
    channel: text("channel").notNull(),
    /** sent | queued | verified | expired | failed | blocked */
    status: text("status").notNull(),
    attempts: integer("attempts").notNull().default(0),
    ip: text("ip"),
    userAgent: text("user_agent"),
    note: text("note"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("otp_requests_phone_idx").on(t.phone, t.createdAt), index("otp_requests_ip_idx").on(t.ip, t.createdAt)],
);

/** Nhóm người dùng (nhận thông báo nội bộ) */
export const userGroups = pgTable("user_groups", {
  id: id(),
  tenantId: tenantCol(),
  /** Duy nhất trong một trung tâm (tenant) */
  name: text("name").notNull(),
  description: text("description"),
  centerId: uuid("center_id").references(() => centers.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => users.id),
  ...timestamps,
}, (t) => [uniqueIndex("user_groups_name_tenant_uq").on(t.tenantId, t.name)]);

export const userGroupMembers = pgTable(
  "user_group_members",
  {
    groupId: uuid("group_id").notNull().references(() => userGroups.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    addedBy: uuid("added_by").references(() => users.id),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index("user_group_members_user_idx").on(t.userId)],
);

/**
 * Quyền cấp theo NHÓM người dùng — "cấp quyền cho một nhóm người mà không sửa vai trò".
 * Khi tính quyền của một người: quyền vai trò ∪ quyền của mọi nhóm họ thuộc.
 * `centerId` null = toàn hệ thống; khác null = chỉ đúng cơ sở đó.
 */
export const userGroupPermissions = pgTable(
  "user_group_permissions",
  {
    groupId: uuid("group_id").notNull().references(() => userGroups.id, { onDelete: "cascade" }),
    /** Dạng "resource:action", vd "student:read" */
    permission: text("permission").notNull(),
    centerId: uuid("center_id").references(() => centers.id, { onDelete: "cascade" }),
    grantedBy: uuid("granted_by").references(() => users.id),
    reason: text("reason"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.permission] }), index("user_group_perms_group_idx").on(t.groupId)],
);

/**
 * Danh mục loại thông báo cấu hình được (bản gốc: 38 loại).
 * Mặc định nằm trong `@satarobo/core` (NOTIFICATION_TYPES); dòng ở đây ghi đè `pushEnabled` / `isActive`.
 * Thiếu dòng + thiếu khai báo trong core ⇒ vẫn gửi trong app, KHÔNG đẩy push.
 */
export const notificationTypes = pgTable(
  "notification_types",
  {
    id: id(),
    tenantId: tenantCol(),
    /** Mã loại, vd `lead.moi`, `class.session_changed`, `request.submitted`, `shift.brief` (duy nhất trong một tenant) */
    prefix: text("prefix").notNull(),
    label: text("label").notNull(),
    groupKey: text("group_key").notNull(),
    groupLabel: text("group_label").notNull(),
    /** urgent (Khẩn) · normal (Thường) · info (Tham khảo) */
    priority: text("priority").notNull().default("normal"),
    /** Vai trò nhận mặc định */
    recipients: jsonb("recipients").$type<string[]>().notNull().default([]),
    pushEnabled: boolean("push_enabled").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("notification_types_group_idx").on(t.groupKey), uniqueIndex("notification_types_prefix_tenant_uq").on(t.tenantId, t.prefix)],
);

/** Nhật ký webhook nhận vào (để xem / chạy lại) */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: id(),
    source: text("source").notNull(),
    externalId: text("external_id"),
    /** processed | failed | rejected | duplicate */
    status: text("status").notNull(),
    httpStatus: integer("http_status"),
    payload: jsonb("payload"),
    headers: jsonb("headers").$type<Record<string, string>>(),
    result: jsonb("result"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(1),
    ip: text("ip"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    replayedBy: uuid("replayed_by").references(() => users.id),
  },
  (t) => [index("webhook_events_idx").on(t.source, t.status, t.receivedAt)],
);

/** Cài đặt chung (key → JSON) */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Mục tiêu doanh thu theo cơ sở × tháng */
export const revenueTargets = pgTable(
  "revenue_targets",
  {
    id: id(),
    centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    newEnrollments: integer("new_enrollments"),
    note: text("note"),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("revenue_targets_unique").on(t.centerId, t.period)],
);

/** Nhật ký đăng nhập nhân sự (không lưu email gốc khi không khớp tài khoản — chỉ mã băm + dạng che) */
export const loginEvents = pgTable(
  "login_events",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    emailHash: text("email_hash").notNull(),
    emailMasked: text("email_masked").notNull(),
    /** success | bad_password | locked_out | mfa_verified | logout | idle_logout | password_set */
    result: text("result").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("login_events_email_idx").on(t.emailHash, t.createdAt),
    index("login_events_ip_idx").on(t.ip, t.createdAt),
    index("login_events_user_idx").on(t.userId, t.createdAt),
    index("login_events_created_idx").on(t.createdAt),
  ],
);
