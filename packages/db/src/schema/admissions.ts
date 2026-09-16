import { pgTable, text, uuid, boolean, integer, timestamp, pgEnum, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { id, timestamps, softDelete } from "./_common";
import { LEAD_STATUSES } from "@satarobo/core";
import { centers } from "./org";
import { users } from "./identity";
import { courses } from "./academics";
import { parents, students } from "./people";

export const leadStatusEnum = pgEnum("lead_status", LEAD_STATUSES);

/**
 * Lead = một cơ hội tuyển sinh. Một phụ huynh có thể có nhiều lead (nhiều con / nhiều lần).
 * phone_normalized dùng để phát hiện trùng và ghép với parents khi chuyển đổi.
 */
export const leads = pgTable(
  "leads",
  {
    id: id(),
    centerId: uuid("center_id").references(() => centers.id),
    status: leadStatusEnum("status").notNull().default("new"),
    parentName: text("parent_name").notNull(),
    phone: text("phone").notNull(),
    phoneNormalized: text("phone_normalized").notNull(),
    email: text("email"),
    childName: text("child_name"),
    childGrade: integer("child_grade"),
    childBirthYear: integer("child_birth_year"),
    school: text("school"),
    interestedCourseId: uuid("interested_course_id").references(() => courses.id),
    /** Nguồn: web-form | ads | referral | walk-in | legacy-sheet … */
    source: text("source"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    referrerParentId: uuid("referrer_parent_id").references(() => parents.id),
    assignedToId: uuid("assigned_to_id").references(() => users.id),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    /** Mốc tính SLA: lần chạm gần nhất hoặc lần đổi trạng thái gần nhất */
    lastTouchAt: timestamp("last_touch_at", { withTimezone: true }).notNull().defaultNow(),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    lostReason: text("lost_reason"),
    /** Khi chuyển đổi: liên kết sang hồ sơ thật */
    convertedParentId: uuid("converted_parent_id").references(() => parents.id),
    convertedStudentId: uuid("converted_student_id").references(() => students.id),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    /** Đồng ý xử lý dữ liệu (NĐ13) ghi nhận từ form */
    consentAt: timestamp("consent_at", { withTimezone: true }),
    notes: text("notes"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("leads_status_idx").on(t.status, t.centerId),
    index("leads_assigned_idx").on(t.assignedToId, t.status),
    index("leads_phone_idx").on(t.phoneNormalized),
    index("leads_last_touch_idx").on(t.lastTouchAt),
  ],
);

export const leadActivityTypeEnum = pgEnum("lead_activity_type", ["note", "call", "message", "status_change", "assignment", "trial_booked", "task_done", "system"]);

/** Timeline hợp nhất của lead — mọi tương tác đều ở đây */
export const leadActivities = pgTable(
  "lead_activities",
  {
    id: id(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    type: leadActivityTypeEnum("type").notNull(),
    content: text("content"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    actorId: uuid("actor_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lead_activities_lead_idx").on(t.leadId, t.createdAt)],
);

/** Việc phải làm trên lead (gọi lần đầu, gọi chốt sau học thử…) — sinh từ automation hoặc tay */
export const leadTasks = pgTable(
  "lead_tasks",
  {
    id: id(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    assigneeId: uuid("assignee_id").references(() => users.id),
    doneAt: timestamp("done_at", { withTimezone: true }),
    doneBy: uuid("done_by").references(() => users.id),
    createdByRule: text("created_by_rule"),
    ...timestamps,
  },
  (t) => [index("lead_tasks_due_idx").on(t.doneAt, t.dueAt), index("lead_tasks_lead_idx").on(t.leadId)],
);

/** Sale/CSKH khả dụng để nhận lead theo cơ sở — cấu hình phân bổ */
export const leadAssignees = pgTable(
  "lead_assignees",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    centerId: uuid("center_id").references(() => centers.id, { onDelete: "cascade" }),
    isAvailable: boolean("is_available").notNull().default(true),
    weight: integer("weight").notNull().default(1),
    ...timestamps,
  },
  (t) => [uniqueIndex("lead_assignees_unique").on(t.userId, t.centerId)],
);
