import {
  pgTable, text, uuid, boolean, integer, date, time, timestamp, pgEnum, jsonb, index, uniqueIndex, smallint, numeric,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, timestamps, softDelete } from "./_common";
import { SESSION_STATUSES, ATTENDANCE_STATUSES, ENROLLMENT_STATUSES, CLASS_STATUSES, SESSION_KINDS, type ChecklistState } from "@satarobo/core";
import { centers, rooms } from "./org";
import { teachers, students, parents } from "./people";
import { users } from "./identity";

export const sessionStatusEnum = pgEnum("session_status", SESSION_STATUSES);
export const attendanceStatusEnum = pgEnum("attendance_status", ATTENDANCE_STATUSES);
export const enrollmentStatusEnum = pgEnum("enrollment_status", ENROLLMENT_STATUSES);
export const classStatusEnum = pgEnum("class_status", CLASS_STATUSES);
export const sessionKindEnum = pgEnum("session_kind", SESSION_KINDS);

/** Khoá học thương mại (Sata1..Sata8, combo) */
export const courses = pgTable("courses", {
  id: id(),
  code: text("code").notNull().unique(), // SATA4
  name: text("name").notNull(),
  slug: text("slug").unique(),
  gradeFrom: integer("grade_from"),
  gradeTo: integer("grade_to"),
  totalSessions: integer("total_sessions").notNull(), // 12 / 48
  sessionMinutes: integer("session_minutes").notNull().default(90),
  listPrice: numeric("list_price", { precision: 12, scale: 0 }).notNull().default("0"),
  /** Gợi ý khoá tiếp theo khi hoàn thành (lộ trình) */
  nextCourseId: uuid("next_course_id"),
  description: text("description"),
  level: text("level"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

/** Khoá tiên quyết: muốn học courseId phải hoàn thành requiredCourseId */
export const coursePrerequisites = pgTable(
  "course_prerequisites",
  {
    id: id(),
    courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    requiredCourseId: uuid("required_course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("course_prereq_unique").on(t.courseId, t.requiredCourseId)],
);

/** Khoá được dạy của giáo viên */
export const teacherCourses = pgTable(
  "teacher_courses",
  {
    id: id(),
    teacherId: uuid("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("teacher_courses_unique").on(t.teacherId, t.courseId)],
);

/** Đánh giá GV (dự giờ) */
export const teacherEvaluations = pgTable(
  "teacher_evaluations",
  {
    id: id(),
    teacherId: uuid("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id"),
    score: smallint("score").notNull(),
    comment: text("comment").notNull(),
    observedOn: date("observed_on").notNull(),
    evaluatorId: uuid("evaluator_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("teacher_eval_idx").on(t.teacherId, t.observedOn)],
);

/** Giáo trình: một khoá có thể có nhiều phiên bản giáo trình */
export const curricula = pgTable(
  "curricula",
  {
    id: id(),
    courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    version: integer("version").notNull().default(1),
    /** draft | active | archived — isActive = (status = active) */
    status: text("status").notNull().default("active"),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("curricula_course_idx").on(t.courseId)],
);

export const lessons = pgTable(
  "lessons",
  {
    id: id(),
    curriculumId: uuid("curriculum_id").notNull().references(() => curricula.id, { onDelete: "cascade" }),
    sequenceNo: integer("sequence_no").notNull(),
    title: text("title").notNull(),
    objectives: text("objectives"),
    /** Học cụ / chuẩn bị */
    materials: text("materials"),
    /** Mốc học bạ: buổi 5, buổi 12 … */
    isReportCardMilestone: boolean("is_report_card_milestone").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("lessons_seq_unique").on(t.curriculumId, t.sequenceNo)],
);

export const classes = pgTable(
  "classes",
  {
    id: id(),
    code: text("code").notNull().unique(), // CS2.SATA6.26.003 (nhãn)
    name: text("name").notNull(),
    courseId: uuid("course_id").notNull().references(() => courses.id),
    curriculumId: uuid("curriculum_id").references(() => curricula.id),
    centerId: uuid("center_id").notNull().references(() => centers.id),
    homeRoomId: uuid("home_room_id").references(() => rooms.id),
    leadTeacherId: uuid("lead_teacher_id").references(() => teachers.id),
    assistantTeacherId: uuid("assistant_teacher_id").references(() => teachers.id),
    capacity: integer("capacity").notNull().default(12),
    minCapacity: integer("min_capacity").notNull().default(1),
    /** Tổng buổi chuẩn của lớp (mặc định theo khoá) — dùng khi duyệt để sinh buổi */
    plannedSessions: integer("planned_sessions"),
    /** Mô tả đặc thù để bàn giao khi đổi GV */
    description: text("description"),
    startDate: date("start_date"),
    expectedEndDate: date("expected_end_date"),
    status: classStatusEnum("status").notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    submittedBy: uuid("submitted_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id),
    statusReason: text("status_reason"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("classes_center_idx").on(t.centerId, t.status), index("classes_teacher_idx").on(t.leadTeacherId)],
);

/**
 * LỊCH HỌC LÀ DỮ LIỆU: mỗi dòng = một ca cố định trong tuần, có hiệu lực theo khoảng ngày.
 * Đổi lịch = đóng effectiveTo của dòng cũ + thêm dòng mới; buổi tương lai được sinh lại.
 */
export const classSchedules = pgTable(
  "class_schedules",
  {
    id: id(),
    classId: uuid("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(), // 1=Mon..7=Sun
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    roomId: uuid("room_id").references(() => rooms.id),
    teacherId: uuid("teacher_id").references(() => teachers.id),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    note: text("note"),
    /** Lý do khi giai đoạn này sinh ra từ "Áp lịch mới" */
    changeReason: text("change_reason"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("class_schedules_class_idx").on(t.classId)],
);

/** Lịch sử trạng thái lớp (gửi duyệt, duyệt, trả về, huỷ, áp lịch mới…) */
export const classEvents = pgTable(
  "class_events",
  {
    id: id(),
    classId: uuid("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    fromStatus: classStatusEnum("from_status"),
    toStatus: classStatusEnum("to_status"),
    reason: text("reason"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    actorId: uuid("actor_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("class_events_class_idx").on(t.classId, t.createdAt)],
);

/** Ngày nghỉ theo cơ sở (null = toàn hệ thống) */
export const holidays = pgTable(
  "holidays",
  {
    id: id(),
    centerId: uuid("center_id").references(() => centers.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    name: text("name").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("holidays_date_idx").on(t.date, t.centerId)],
);

/**
 * Buổi học cụ thể. Trạng thái theo state machine trong @satarobo/core.
 * Ràng buộc EXCLUDE (trùng phòng / trùng GV theo thời gian) nằm ở migration SQL.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    classId: uuid("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id").references(() => lessons.id),
    sequenceNo: integer("sequence_no").notNull(),
    kind: sessionKindEnum("kind").notNull().default("regular"),
    date: date("date").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    roomId: uuid("room_id").references(() => rooms.id),
    teacherId: uuid("teacher_id").references(() => teachers.id),
    status: sessionStatusEnum("status").notNull().default("scheduled"),
    topic: text("topic"),
    /** Nhận xét chung của buổi (bắt buộc để hoàn tất) */
    sessionNote: text("session_note"),
    /** Ghi chú nội bộ (PH không thấy) */
    privateNote: text("private_note"),
    /** Checklist chuẩn bị / sau buổi */
    checklist: jsonb("checklist").$type<ChecklistState>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by").references(() => users.id),
    /** Nếu là buổi dời từ buổi khác */
    rescheduledFromId: uuid("rescheduled_from_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("sessions_class_seq_unique").on(t.classId, t.sequenceNo),
    index("sessions_date_idx").on(t.date, t.status),
    index("sessions_teacher_date_idx").on(t.teacherId, t.date),
  ],
);

/**
 * Enrollment = hợp đồng học của một học viên trong một lớp, gắn gói (số buổi).
 * Công nợ, sắp hết khoá, hoàn tiền đều suy từ đây + attendance.
 */
export const enrollments = pgTable(
  "enrollments",
  {
    id: id(),
    studentId: uuid("student_id").notNull().references(() => students.id),
    classId: uuid("class_id").notNull().references(() => classes.id),
    status: enrollmentStatusEnum("status").notNull().default("active"),
    packageSessions: integer("package_sessions").notNull(), // số buổi đã mua
    startSequenceNo: integer("start_sequence_no").notNull().default(1), // vào lớp từ buổi mấy
    /** Số buổi đã học ở hệ cũ (chuyển đổi) — cộng vào số buổi đã dùng */
    carriedSessions: integer("carried_sessions").notNull().default(0),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endReason: text("end_reason"),
    pausedAt: date("paused_at"),
    pauseUntil: date("pause_until"),
    /** Chuyển lớp: ghi danh mới trỏ về ghi danh cũ */
    transferredFromId: uuid("transferred_from_id"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    // Chỉ chặn trùng khi ghi danh còn mở — cho phép học lại lớp cũ sau khi đã nghỉ/chuyển
    uniqueIndex("enrollments_active_unique").on(t.studentId, t.classId).where(sql`status in ('trial','active','paused')`),
    index("enrollments_class_idx").on(t.classId, t.status),
    index("enrollments_student_idx").on(t.studentId),
  ],
);

export const enrollmentEventTypeEnum = pgEnum("enrollment_event_type", ["created", "activate", "pause", "resume", "withdraw", "complete", "transfer_out", "transfer_in", "package_change"]);

/** Mốc thời gian của ghi danh — lịch sử bất biến */
export const enrollmentEvents = pgTable(
  "enrollment_events",
  {
    id: id(),
    enrollmentId: uuid("enrollment_id").notNull().references(() => enrollments.id, { onDelete: "cascade" }),
    type: enrollmentEventTypeEnum("type").notNull(),
    fromStatus: enrollmentStatusEnum("from_status"),
    toStatus: enrollmentStatusEnum("to_status"),
    reason: text("reason"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    actorId: uuid("actor_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("enrollment_events_enr_idx").on(t.enrollmentId, t.createdAt)],
);

export const attendance = pgTable(
  "attendance",
  {
    id: id(),
    sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    enrollmentId: uuid("enrollment_id").notNull().references(() => enrollments.id, { onDelete: "cascade" }),
    status: attendanceStatusEnum("status").notNull(),
    /** Nếu status = makeup: buổi vắng nào được bù */
    makeupForSessionId: uuid("makeup_for_session_id").references(() => sessions.id),
    note: text("note"),
    /** Nhận xét cá nhân cho HV trong buổi này (GV viết nhanh, PH thấy) */
    studentRemark: text("student_remark"),
    /** Đánh giá nhanh trong buổi 1–5 sao */
    rating: smallint("rating"),
    recordedBy: uuid("recorded_by").references(() => users.id),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [uniqueIndex("attendance_unique").on(t.sessionId, t.enrollmentId), index("attendance_enrollment_idx").on(t.enrollmentId)],
);

export const mediaStatusEnum = pgEnum("media_status", ["pending", "approved", "rejected"]);

/** Ảnh lớp học: lưu private bucket, phát hành qua signed URL; tôn trọng mediaConsent của PH */
export const sessionMedia = pgTable(
  "session_media",
  {
    id: id(),
    sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    caption: text("caption"),
    status: mediaStatusEnum("status").notNull().default("pending"),
    /** Học viên xuất hiện trong ảnh — dùng để lọc theo consent */
    taggedStudentIds: jsonb("tagged_student_ids").$type<string[]>().notNull().default([]),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectReason: text("reject_reason"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    ...timestamps,
  },
  (t) => [index("session_media_session_idx").on(t.sessionId), index("session_media_status_idx").on(t.status)],
);

export const makeupRequestStatusEnum = pgEnum("makeup_request_status", ["requested", "approved", "rejected", "done"]);

export const makeupRequests = pgTable("makeup_requests", {
  id: id(),
  enrollmentId: uuid("enrollment_id").notNull().references(() => enrollments.id, { onDelete: "cascade" }),
  missedSessionId: uuid("missed_session_id").notNull().references(() => sessions.id),
  targetSessionId: uuid("target_session_id").references(() => sessions.id),
  status: makeupRequestStatusEnum("status").notNull().default("requested"),
  requestedByParentId: uuid("requested_by_parent_id").references(() => parents.id),
  decidedBy: uuid("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  note: text("note"),
  ...timestamps,
});

/* ------------------------------------------------------------------ */
/* Học bạ năng lực & hoàn thành khoá                                  */
/* ------------------------------------------------------------------ */

/** Tiêu chí năng lực theo khoá (Cấu hình tiêu chí học bạ) */
export const competencyCriteria = pgTable(
  "competency_criteria",
  {
    id: id(),
    courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("criteria_course_idx").on(t.courseId, t.sortOrder)],
);

export const reportCardStatusEnum = pgEnum("report_card_status", ["draft", "submitted", "returned", "approved", "published"]);

/** Học bạ theo mốc buổi (5/12 mỗi kỳ) của một ghi danh */
export const reportCards = pgTable(
  "report_cards",
  {
    id: id(),
    enrollmentId: uuid("enrollment_id").notNull().references(() => enrollments.id, { onDelete: "cascade" }),
    milestoneSeq: integer("milestone_seq").notNull(),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
    status: reportCardStatusEnum("status").notNull().default("draft"),
    teacherComment: text("teacher_comment"),
    strengths: text("strengths"),
    improvements: text("improvements"),
    averageScore: numeric("average_score", { precision: 3, scale: 1 }),
    authorId: uuid("author_id").references(() => users.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    returnReason: text("return_reason"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("report_cards_unique").on(t.enrollmentId, t.milestoneSeq), index("report_cards_status_idx").on(t.status)],
);

export const reportCardScores = pgTable(
  "report_card_scores",
  {
    reportCardId: uuid("report_card_id").notNull().references(() => reportCards.id, { onDelete: "cascade" }),
    criterionId: uuid("criterion_id").notNull().references(() => competencyCriteria.id, { onDelete: "cascade" }),
    score: smallint("score"),
    comment: text("comment"),
  },
  (t) => [uniqueIndex("rc_scores_pk").on(t.reportCardId, t.criterionId)],
);

/** Hoàn thành khoá & chứng chỉ */
export const courseCompletions = pgTable(
  "course_completions",
  {
    id: id(),
    enrollmentId: uuid("enrollment_id").notNull().references(() => enrollments.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").notNull().references(() => courses.id),
    grade: text("grade").notNull(),
    teacherEvaluation: text("teacher_evaluation").notNull(),
    averageScore: numeric("average_score", { precision: 3, scale: 1 }),
    certificateNo: text("certificate_no").notNull(),
    nextCourseId: uuid("next_course_id").references(() => courses.id),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    issuedBy: uuid("issued_by").references(() => users.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("completions_enrollment_unique").on(t.enrollmentId), uniqueIndex("completions_cert_unique").on(t.certificateNo)],
);
