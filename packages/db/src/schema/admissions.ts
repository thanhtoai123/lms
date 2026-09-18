import { pgTable, text, uuid, boolean, integer, date, time, timestamp, pgEnum, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, timestamps, softDelete } from "./_common";
import { tenantCol } from "./tenant";
import {
  LEAD_STATUSES, DISTRIBUTION_MODES, TRIAL_STATUSES, ASSIGNMENT_SOURCES, POOL_ACTIONS,
  TRIAL_CLASS_STATUSES, TRIAL_SESSION_STATUSES, TRIAL_ENROLLMENT_STATUSES, TRIAL_ATTENDANCE_STATUSES,
} from "@satarobo/core";
import { centers, rooms } from "./org";
import { users } from "./identity";
import { courses, sessions } from "./academics";
import { parents, students, teachers } from "./people";

export const leadStatusEnum = pgEnum("lead_status", LEAD_STATUSES);

/**
 * Lead = một cơ hội tuyển sinh. Một phụ huynh có thể có nhiều lead (nhiều con / nhiều lần).
 * phone_normalized dùng để phát hiện trùng và ghép với parents khi chuyển đổi.
 */
export const leads = pgTable(
  "leads",
  {
    id: id(),
    tenantId: tenantCol(),
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
    /* --- Nguồn & theo dõi: chỉ ghi khi lead vào từ form công khai (website / landing / Zalo Mini App) --- */
    /** URL trang đích khách điền form */
    landingPage: text("landing_page"),
    /** Trang giới thiệu (document.referrer) */
    referrer: text("referrer"),
    /** Id sự kiện quảng cáo (Meta/Google event id) — để đối soát với nền tảng quảng cáo */
    eventId: text("event_id"),
    /** IP người gửi form — PII, chỉ người có quyền lead:view_pii xem đầy đủ */
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    /**
     * Lead dùng chung: bật thì mọi CSKH cùng cơ sở thấy được lead này
     * (người chỉ có lead:read_own vẫn thấy) — nhãn "Dùng chung cho CSKH cùng cơ sở".
     */
    sharedWithCenter: boolean("shared_with_center").notNull().default(false),
    referrerParentId: uuid("referrer_parent_id").references(() => parents.id),
    /** Mã giới thiệu (affiliate) — không FK để tránh vòng import; khớp affiliates.code */
    referralCode: text("referral_code"),
    assignedToId: uuid("assigned_to_id").references(() => users.id),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    /** Mốc tính SLA: lần chạm gần nhất hoặc lần đổi trạng thái gần nhất */
    lastTouchAt: timestamp("last_touch_at", { withTimezone: true }).notNull().defaultNow(),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    lostReason: text("lost_reason"),
    /** Lý do rời phễu (nuôi dưỡng / mất) 3–500 ký tự — lostReason giữ để tương thích, ghi cả hai khi mất */
    dropReason: text("drop_reason"),
    droppedAt: timestamp("dropped_at", { withTimezone: true }),
    /** Số lần khách được nhập lại (trùng SĐT) và lần gần nhất */
    reentryCount: integer("reentry_count").notNull().default(0),
    lastReentryAt: timestamp("last_reentry_at", { withTimezone: true }),
    facebookUrl: text("facebook_url"),
    /** Nhân viên nhập phiếu (null = form công khai / hệ thống) */
    createdBy: uuid("created_by").references(() => users.id),
    /** Khi chuyển đổi: liên kết sang hồ sơ thật */
    convertedParentId: uuid("converted_parent_id").references(() => parents.id),
    convertedStudentId: uuid("converted_student_id").references(() => students.id),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    /** Đồng ý xử lý dữ liệu (NĐ13) ghi nhận từ form */
    consentAt: timestamp("consent_at", { withTimezone: true }),
    /** NĐ13: hạn chế xử lý / không nhận tiếp thị / đã ẩn danh */
    processingRestricted: boolean("processing_restricted").notNull().default(false),
    marketingOptOut: boolean("marketing_opt_out").notNull().default(false),
    anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
    notes: text("notes"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("leads_status_idx").on(t.status, t.centerId),
    index("leads_assigned_idx").on(t.assignedToId, t.status),
    index("leads_phone_idx").on(t.phoneNormalized),
    index("leads_last_touch_idx").on(t.lastTouchAt),
    index("leads_shared_idx").on(t.sharedWithCenter, t.centerId),
  ],
);

export const leadActivityTypeEnum = pgEnum("lead_activity_type", ["note", "call", "message", "email", "status_change", "assignment", "handover", "trial_booked", "task_done", "system"]);

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
    /** Ngày sinh đầy đủ (chính xác hơn năm sinh) — dùng để xếp lớp theo tuổi */
    dateOfBirth: date("date_of_birth"),
    /** male | female | other */
    gender: text("gender"),
    grade: integer("grade"),
    school: text("school"),
    interestedCourseId: uuid("interested_course_id").references(() => courses.id),
    /** Cơ sở bé muốn học (có thể khác cơ sở đang giữ lead) */
    interestedCenterId: uuid("interested_center_id").references(() => centers.id),
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
    /** 0 = so trùng SĐT với mọi lead (mãi mãi); N = chỉ lead chạm trong N ngày */
    dedupeDays: integer("dedupe_days").notNull().default(0),
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
    /** Ghi chú bàn giao: đã tư vấn gì cho khách (bắt buộc khi chuyển lead từng khách) */
    handoverNote: text("handover_note"),
    actorId: uuid("actor_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lead_transfers_lead_idx").on(t.leadId), index("lead_transfers_created_idx").on(t.createdAt)],
);

export const leadAssignmentSourceEnum = pgEnum("lead_assignment_source", ASSIGNMENT_SOURCES);

/**
 * Sổ chia lead: mỗi lần lead được giao cho một sale (máy chia, sale tự nhập, quản lý giao, nhập file,
 * mã giới thiệu, nhập lại) — có tiêu lượt không và lượt của người nhận sau lần chia.
 */
export const leadDistributionLog = pgTable(
  "lead_distribution_log",
  {
    id: id(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    centerId: uuid("center_id").references(() => centers.id),
    fromUserId: uuid("from_user_id").references(() => users.id),
    assignedToId: uuid("assigned_to_id").references(() => users.id),
    actorId: uuid("actor_id").references(() => users.id),
    source: leadAssignmentSourceEnum("source").notNull(),
    /** Chế độ chia của cơ sở tại thời điểm chia */
    mode: distributionModeEnum("mode"),
    consumedRound: boolean("consumed_round").notNull().default(false),
    roundsAfter: integer("rounds_after"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lead_distribution_log_center_idx").on(t.centerId, t.createdAt),
    index("lead_distribution_log_assignee_idx").on(t.assignedToId, t.createdAt),
    index("lead_distribution_log_lead_idx").on(t.leadId),
  ],
);

export const leadPoolActionEnum = pgEnum("lead_pool_action", POOL_ACTIONS);

/** Lịch sử thay đổi pool chia lead: ai bật/tắt ai, chỉnh lượt bao nhiêu, vì sao */
export const leadPoolEvents = pgTable(
  "lead_pool_events",
  {
    id: id(),
    centerId: uuid("center_id").references(() => centers.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id),
    action: leadPoolActionEnum("action").notNull(),
    before: jsonb("before").$type<Record<string, unknown>>(),
    after: jsonb("after").$type<Record<string, unknown>>(),
    reason: text("reason"),
    actorId: uuid("actor_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lead_pool_events_center_idx").on(t.centerId, t.createdAt)],
);

export const trialStatusEnum = pgEnum("trial_status", TRIAL_STATUSES);

/**
 * Lớp Trial: một lượt học thử của lead (hoặc một con trong lead) tại một buổi học có sẵn.
 * Đổi lịch = dòng cũ chuyển "rescheduled" + dòng mới trỏ rescheduledFromId; mọi thay đổi có lý do.
 */
export const trialBookings = pgTable(
  "trial_bookings",
  {
    id: id(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    childId: uuid("child_id").references(() => leadChildren.id, { onDelete: "set null" }),
    sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    centerId: uuid("center_id").references(() => centers.id),
    status: trialStatusEnum("status").notNull().default("booked"),
    childName: text("child_name"),
    note: text("note"),
    reason: text("reason"),
    resultNote: text("result_note"),
    rescheduledFromId: uuid("rescheduled_from_id"),
    bookedBy: uuid("booked_by").references(() => users.id),
    resultBy: uuid("result_by").references(() => users.id),
    resultAt: timestamp("result_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("trial_bookings_session_idx").on(t.sessionId, t.status),
    index("trial_bookings_lead_idx").on(t.leadId),
    index("trial_bookings_center_idx").on(t.centerId, t.createdAt),
  ],
);

export const trialClassStatusEnum = pgEnum("trial_class_status", TRIAL_CLASS_STATUSES);
export const trialSessionStatusEnum = pgEnum("trial_session_status", TRIAL_SESSION_STATUSES);
export const trialEnrollmentStatusEnum = pgEnum("trial_enrollment_status", TRIAL_ENROLLMENT_STATUSES);
export const trialAttendanceStatusEnum = pgEnum("trial_attendance_status", TRIAL_ATTENDANCE_STATUSES);

/**
 * LỚP TRẢI NGHIỆM (bản gốc "Lớp Trial") — lớp học thử nhiều buổi, tách hẳn với `trial_bookings`
 * (xếp lead vào một buổi của lớp chính quy). Tạo lớp chỉ cần cơ sở + khoá trải nghiệm;
 * tên lớp và mã lớp (`TRIAL-CS2-26-008`) do hệ thống tự đặt.
 */
export const trialClasses = pgTable(
  "trial_classes",
  {
    id: id(),
    tenantId: tenantCol(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    centerId: uuid("center_id").notNull().references(() => centers.id),
    /** Khoá trải nghiệm = "khoá quan tâm" của khách; để trống khi chưa rõ */
    courseId: uuid("course_id").references(() => courses.id),
    status: trialClassStatusEnum("status").notNull().default("open"),
    capacity: integer("capacity").notNull().default(12),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("trial_classes_center_idx").on(t.centerId, t.status),
    index("trial_classes_created_idx").on(t.createdAt),
  ],
);

/** Buổi của lớp trải nghiệm — ngày/giờ/phòng/GV chọn theo TỪNG BUỔI (mỗi buổi có thể khác nhau) */
export const trialClassSessions = pgTable(
  "trial_class_sessions",
  {
    id: id(),
    trialClassId: uuid("trial_class_id").notNull().references(() => trialClasses.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    date: date("date").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    roomId: uuid("room_id").references(() => rooms.id),
    teacherId: uuid("teacher_id").references(() => teachers.id),
    status: trialSessionStatusEnum("status").notNull().default("scheduled"),
    topic: text("topic"),
    /** Bắt buộc khi đổi lịch — nội dung gửi thẳng cho giáo viên phụ trách buổi */
    rescheduleReason: text("reschedule_reason"),
    /** Bắt buộc khi huỷ buổi — nội dung gửi thẳng cho giáo viên phụ trách buổi */
    cancelReason: text("cancel_reason"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("trial_class_sessions_seq_unique").on(t.trialClassId, t.seq),
    index("trial_class_sessions_date_idx").on(t.date, t.status),
    index("trial_class_sessions_teacher_idx").on(t.teacherId, t.date),
  ],
);

/** Học viên (lead / con trong lead) học trải nghiệm — xếp vào lớp là học TOÀN BỘ buổi, kể cả buổi tạo sau */
export const trialClassEnrollments = pgTable(
  "trial_class_enrollments",
  {
    id: id(),
    trialClassId: uuid("trial_class_id").notNull().references(() => trialClasses.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    childId: uuid("child_id").references(() => leadChildren.id, { onDelete: "set null" }),
    studentName: text("student_name").notNull(),
    status: trialEnrollmentStatusEnum("status").notNull().default("enrolled"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    withdrawReason: text("withdraw_reason"),
    /** Xếp vượt sĩ số (cần quyền trials:override-capacity) */
    overCapacity: boolean("over_capacity").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("trial_class_enrollments_active_unique").on(t.trialClassId, t.leadId, t.childId).where(sql`status = 'enrolled'`),
    index("trial_class_enrollments_lead_idx").on(t.leadId),
    index("trial_class_enrollments_class_idx").on(t.trialClassId, t.status),
  ],
);

/** Điểm danh buổi trải nghiệm (bảng `attendance` gắn với ghi danh thật nên không dùng lại được) */
export const trialAttendance = pgTable(
  "trial_attendance",
  {
    id: id(),
    trialSessionId: uuid("trial_session_id").notNull().references(() => trialClassSessions.id, { onDelete: "cascade" }),
    enrollmentId: uuid("enrollment_id").notNull().references(() => trialClassEnrollments.id, { onDelete: "cascade" }),
    status: trialAttendanceStatusEnum("status").notNull(),
    note: text("note"),
    markedBy: uuid("marked_by").references(() => users.id),
    markedAt: timestamp("marked_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("trial_attendance_unique").on(t.trialSessionId, t.enrollmentId),
    index("trial_attendance_enrollment_idx").on(t.enrollmentId),
  ],
);
