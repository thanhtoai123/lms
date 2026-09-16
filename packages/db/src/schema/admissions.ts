import { pgTable, text, uuid, boolean, integer, timestamp, pgEnum, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { id, timestamps, softDelete } from "./_common";
import { LEAD_STATUSES, DISTRIBUTION_MODES } from "@satarobo/core";
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
    /** Lượt đã nhận trong chu kỳ chia hiện tại — "Đặt lại lượt toàn cơ sở" đưa về 0 */
    roundsReceived: integer("rounds_received").notNull().default(0),
    lastAssignedAt: timestamp("last_assigned_at", { withTimezone: true }),
    note: text("note"),
    ...timestamps,
  },
  (t) => [uniqueIndex("lead_assignees_unique").on(t.userId, t.centerId)],
);

/** Con của phụ huynh trong lead — một lead có thể có nhiều con (LeadChild) */
export const leadChildren = pgTable(
  "lead_children",
  {
    id: id(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    birthYear: integer("birth_year"),
    grade: integer("grade"),
    school: text("school"),
    interestedCourseId: uuid("interested_course_id").references(() => courses.id),
    notes: text("notes"),
    /** Khi chốt: học viên được tạo từ dòng này */
    convertedStudentId: uuid("converted_student_id").references(() => students.id),
    ...timestamps,
  },
  (t) => [index("lead_children_lead_idx").on(t.leadId)],
);

export const distributionModeEnum = pgEnum("lead_distribution_mode", DISTRIBUTION_MODES);

/**
 * Tham số tuyển sinh theo cơ sở (center_id null = mặc định toàn hệ thống):
 * chế độ chia lead, khử trùng, SLA theo phút từng trạng thái (ADMIN-SPEC §13.1).
 */
export const admissionsSettings = pgTable(
  "admissions_settings",
  {
    id: id(),
    centerId: uuid("center_id").references(() => centers.id, { onDelete: "cascade" }),
    distributionMode: distributionModeEnum("distribution_mode").notNull().default("round_robin"),
    dedupeDays: integer("dedupe_days").notNull().default(30),
    maxTrialsPerLead: integer("max_trials_per_lead").notNull().default(2),
    staleAfterDays: integer("stale_after_days").notNull().default(7),
    /** { new: 15, contacted: 1440, ... } phút; null = không áp */
    slaMinutes: jsonb("sla_minutes").$type<Record<string, number | null>>(),
    roundsResetAt: timestamp("rounds_reset_at", { withTimezone: true }),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("admissions_settings_center_unique").on(t.centerId)],
);

export const leadTransferKindEnum = pgEnum("lead_transfer_kind", ["handover", "center_transfer", "redistribute"]);

/** Sổ bàn giao / chuyển lead: ai chuyển cho ai, cơ sở nào, lý do — làm báo cáo "Chuyển lead liên cơ sở" */
export const leadTransfers = pgTable(
  "lead_transfers",
  {
    id: id(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    kind: leadTransferKindEnum("kind").notNull(),
    fromUserId: uuid("from_user_id").references(() => users.id),
    toUserId: uuid("to_user_id").references(() => users.id),
    fromCenterId: uuid("from_center_id").references(() => centers.id),
    toCenterId: uuid("to_center_id").references(() => centers.id),
    reason: text("reason"),
    actorId: uuid("actor_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lead_transfers_lead_idx").on(t.leadId), index("lead_transfers_created_idx").on(t.createdAt)],
);
