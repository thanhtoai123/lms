import { pgTable, text, uuid, integer, timestamp, pgEnum, jsonb, index, boolean } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_common";
import { NOTIFICATION_CHANNELS } from "@satarobo/core";
import { users } from "./identity";
import { parents, students } from "./people";
import { enrollments } from "./academics";
import { centers } from "./org";

/**
 * OUTBOX: producer ghi event trong cùng transaction với nghiệp vụ; worker đọc theo lô,
 * chạy automation rules, đánh dấu processed. Không bao giờ mất sự kiện.
 */
export const outbox = pgTable(
  "outbox",
  {
    id: id(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
  },
  (t) => [index("outbox_pending_idx").on(t.processedAt, t.createdAt)],
);

export const notificationChannelEnum = pgEnum("notification_channel", NOTIFICATION_CHANNELS);
export const notificationStatusEnum = pgEnum("notification_status", ["queued", "sent", "failed", "read"]);

/** Thông báo gửi cho phụ huynh (in-app/ZNS/push/email). Một dòng = một lần gửi qua một kênh. */
export const parentNotifications = pgTable(
  "parent_notifications",
  {
    id: id(),
    parentId: uuid("parent_id").notNull().references(() => parents.id, { onDelete: "cascade" }),
    studentId: uuid("student_id").references(() => students.id),
    channel: notificationChannelEnum("channel").notNull(),
    template: text("template").notNull(), // SESSION_SUMMARY, TUITION_DUE, …
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    params: jsonb("params").$type<Record<string, string>>(),
    status: notificationStatusEnum("status").notNull().default("queued"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    providerRef: text("provider_ref"),
    broadcastId: uuid("broadcast_id"),
    createdBy: uuid("created_by").references(() => users.id),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    /** tin SMS dự phòng trỏ về tin ZNS gốc */
    fallbackOf: uuid("fallback_of"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("parent_notif_parent_idx").on(t.parentId, t.createdAt), index("parent_notif_status_idx").on(t.status, t.channel)],
);

/** Thông báo nội bộ cho nhân sự (badge trên Ops/Teacher) */
export const userNotifications = pgTable(
  "user_notifications",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    priority: integer("priority").notNull().default(3), // 1 cao nhất
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("user_notif_user_idx").on(t.userId, t.readAt, t.createdAt)],
);

export const careTaskStatusEnum = pgEnum("care_task_status", ["open", "in_progress", "done", "escalated", "dismissed"]);

/** Việc chăm sóc học viên — sinh từ rủi ro (nghỉ liên tiếp, chuyên cần thấp…) hoặc tạo tay */
export const careTasks = pgTable(
  "care_tasks",
  {
    id: id(),
    studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    enrollmentId: uuid("enrollment_id").references(() => enrollments.id, { onDelete: "set null" }),
    centerId: uuid("center_id").references(() => centers.id),
    code: text("code").notNull(), // CONSECUTIVE_ABSENCE | LOW_ATTENDANCE | PENDING_MAKEUP | MANUAL
    title: text("title").notNull(),
    severity: integer("severity").notNull().default(3),
    status: careTaskStatusEnum("status").notNull().default("open"),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    assigneeId: uuid("assignee_id").references(() => users.id),
    outcome: text("outcome"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    /** Chống tạo trùng: một mã rủi ro / một enrollment chỉ có một việc đang mở */
    dedupeKey: text("dedupe_key"),
    ...timestamps,
  },
  (t) => [index("care_tasks_status_idx").on(t.status, t.centerId, t.dueAt), index("care_tasks_student_idx").on(t.studentId), index("care_tasks_dedupe_idx").on(t.dedupeKey)],
);

/** Cấu hình bật/tắt rule automation theo cơ sở (null = toàn hệ thống) */
export const automationSettings = pgTable("automation_settings", {
  id: id(),
  ruleCode: text("rule_code").notNull(),
  centerId: uuid("center_id").references(() => centers.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),
  ...timestamps,
});
