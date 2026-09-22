import {
  pgTable, text, uuid, boolean, integer, bigint, date, time, timestamp, pgEnum, jsonb, index, uniqueIndex, smallint, numeric,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, timestamps, softDelete } from "./_common";
import { tenantCol } from "./tenant";
import { SESSION_STATUSES, ATTENDANCE_STATUSES, ENROLLMENT_STATUSES, CLASS_STATUSES, SESSION_KINDS, TRANSFER_REQUEST_STATUSES, MEDIA_STATUSES, COMPLETION_STATUSES, type ChecklistState, type MilestoneAggregate } from "@satarobo/core";
import { centers, rooms } from "./org";
import { teachers, students, parents } from "./people";
import { users } from "./identity";

export const sessionStatusEnum = pgEnum("session_status", SESSION_STATUSES);
export const attendanceStatusEnum = pgEnum("attendance_status", ATTENDANCE_STATUSES);
export const enrollmentStatusEnum = pgEnum("enrollment_status", ENROLLMENT_STATUSES);
export const classStatusEnum = pgEnum("class_status", CLASS_STATUSES);
export const sessionKindEnum = pgEnum("session_kind", SESSION_KINDS);

/**
 * Khoá học thương mại (Sata1..Sata8, combo).
 * Mã và slug chỉ duy nhất TRONG một trung tâm (tenant) — hai trung tâm nhượng quyền
 * được phép cùng dùng mã SATA4 cho danh mục khoá học riêng của mình.
 */
export const courses = pgTable("courses", {
  id: id(),
  tenantId: tenantCol(),
  code: text("code").notNull(), // SATA4
  name: text("name").notNull(),
  slug: text("slug"),
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
}, (t) => [
  uniqueIndex("courses_code_tenant_uq").on(t.tenantId, t.code),
  uniqueIndex("courses_slug_tenant_uq").on(t.tenantId, t.slug),
]);

/**
 * Gói bán cho khách: cùng một khoá có nhiều gói (trọn khoá / học phần / gói lẻ),
 * mỗi gói có số buổi + giá niêm yết + giá ưu đãi riêng. Dùng làm gợi ý khi tạo đơn và khi chốt lead.
 */
export const coursePackages = pgTable(
  "course_packages",
  {
    id: id(),
    tenantId: tenantCol(),
    courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    /** Duy nhất trong một trung tâm (tenant) — xem ghi chú ở bảng `courses` */
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** Cấp độ hiển thị cho khách (Cơ bản / Nâng cao…) */
    level: text("level"),
    sessions: integer("sessions").notNull(),
    listPrice: bigint("list_price", { mode: "number" }).notNull().default(0),
    /** Giá ưu đãi (≤ giá niêm yết); null = bán đúng giá niêm yết */
    salePrice: bigint("sale_price", { mode: "number" }),
    /** Mô tả marketing hiển thị cho khách */
    description: text("description"),
    isFeatured: boolean("is_featured").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("course_packages_course_idx").on(t.courseId, t.sortOrder), uniqueIndex("course_packages_code_tenant_uq").on(t.tenantId, t.code)],
);

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
    tenantId: tenantCol(),
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

/**
 * Nhóm lớp: gom nhiều lớp cùng một "khối" để lọc / báo cáo (vd "Sata4 hè 2026 CS1").
 * Chỉ là nhãn tổ chức — không ảnh hưởng lịch học hay ghi danh.
 */
export const classGroups = pgTable(
  "class_groups",
  {
    id: id(),
    tenantId: tenantCol(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    centerId: uuid("center_id").references(() => centers.id),
    note: text("note"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (t) => [uniqueIndex("class_groups_code_unique").on(t.code).where(sql`deleted_at is null`), index("class_groups_center_idx").on(t.centerId)],
);

export const classes = pgTable(
  "classes",
  {
    id: id(),
    tenantId: tenantCol(),
    code: text("code").notNull().unique(), // CS2.SATA6.26.003 (nhãn)
    name: text("name").notNull(),
    courseId: uuid("course_id").notNull().references(() => courses.id),
    curriculumId: uuid("curriculum_id").references(() => curricula.id),
    centerId: uuid("center_id").notNull().references(() => centers.id),
    /** Nhóm lớp (nhãn tổ chức, không bắt buộc) */
    classGroupId: uuid("class_group_id").references(() => classGroups.id),
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
  (t) => [index("classes_center_idx").on(t.centerId, t.status), index("classes_teacher_idx").on(t.leadTeacherId), index("classes_group_idx").on(t.classGroupId)],
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
    tenantId: tenantCol(),
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
    /** Nếu là buổi dời từ buổi khác (buổi thay thế khi huỷ có dời bù) */
    rescheduledFromId: uuid("rescheduled_from_id"),
    /** Ngày gốc trước lần điều chỉnh đầu tiên */
    rescheduledFromDate: date("rescheduled_from_date"),
    adjustReason: text("adjust_reason"),
    /** Huỷ buổi: lý do, người huỷ; buổi chính thức có dời bù chuyển sang dải số 5001+ và nhớ số buổi gốc */
    cancelReason: text("cancel_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by").references(() => users.id),
    originalSequenceNo: integer("original_sequence_no"),
    /** GV xác nhận bài đã dạy (bắt buộc trước khi hoàn tất) */
    lessonConfirmedAt: timestamp("lesson_confirmed_at", { withTimezone: true }),
    lessonConfirmedBy: uuid("lesson_confirmed_by").references(() => users.id),
    /** Ghi nhận "Buổi này không có ảnh" ở màn Duyệt ảnh — buổi coi như đã xử lý ảnh, hết cảnh báo quá hạn */
    noMediaAt: timestamp("no_media_at", { withTimezone: true }),
    noMediaBy: uuid("no_media_by").references(() => users.id),
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
    tenantId: tenantCol(),
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

export const transferRequestStatusEnum = pgEnum("transfer_request_status", TRANSFER_REQUEST_STATUSES);

/**
 * Yêu cầu chuyển lớp / cơ sở: tạo → quản lý duyệt (thực hiện chuyển) / từ chối;
 * lớp đích đầy → danh sách chờ (xếp theo waitlist_rank), báo khi lớp có chỗ.
 */
export const classTransferRequests = pgTable(
  "class_transfer_requests",
  {
    id: id(),
    enrollmentId: uuid("enrollment_id").notNull().references(() => enrollments.id, { onDelete: "cascade" }),
    studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    fromClassId: uuid("from_class_id").notNull().references(() => classes.id),
    toClassId: uuid("to_class_id").references(() => classes.id),
    toCenterId: uuid("to_center_id").references(() => centers.id),
    status: transferRequestStatusEnum("status").notNull().default("pending"),
    reason: text("reason").notNull(),
    /** Quản lý miễn điều kiện cùng khoá */
    waiverReason: text("waiver_reason"),
    startSequenceNo: integer("start_sequence_no"),
    waitlistRank: integer("waitlist_rank"),
    /** Ghi danh mới sau khi duyệt */
    newEnrollmentId: uuid("new_enrollment_id").references(() => enrollments.id),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    // một ghi danh chỉ có một yêu cầu đang mở
    uniqueIndex("transfer_requests_open_unique").on(t.enrollmentId).where(sql`status in ('pending','waitlisted')`),
    index("transfer_requests_status_idx").on(t.status, t.toClassId),
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
    tenantId: tenantCol(),
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
    /** Vắng/Phép: GV chốt có cần xếp học bù không. null = chưa quyết (suy diễn như cũ: cần bù) */
    needsMakeup: boolean("needs_makeup"),
    /** Lý do phụ huynh xin vắng (ghi ngay tại dòng điểm danh) */
    absenceReason: text("absence_reason"),
    recordedBy: uuid("recorded_by").references(() => users.id),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [uniqueIndex("attendance_unique").on(t.sessionId, t.enrollmentId), index("attendance_enrollment_idx").on(t.enrollmentId)],
);

export const mediaStatusEnum = pgEnum("media_status", MEDIA_STATUSES);

/**
 * Ảnh lớp học hai tầng: GV tải vào **kho của lớp** (`library`, PH chưa thấy) → gắn thẻ HV hoặc
 * đánh dấu ảnh chung cả lớp → **Gửi duyệt** (`pending`) → giáo vụ duyệt (`approved`, PH mới thấy)
 * hoặc loại (`rejected`, còn khôi phục 7 ngày).
 * Lưu private bucket, phát hành qua signed URL; tôn trọng mediaConsent của PH.
 */
export const sessionMedia = pgTable(
  "session_media",
  {
    id: id(),
    tenantId: tenantCol(),
    sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    caption: text("caption"),
    status: mediaStatusEnum("status").notNull().default("library"),
    /** Ngày chụp (GV nhập; mặc định lấy ngày buổi học) */
    takenAt: date("taken_at"),
    /** Ảnh chung cả lớp: mọi phụ huynh trong lớp xem được, không cần gắn từng học viên */
    isClassWide: boolean("is_class_wide").notNull().default(false),
    /** Học viên xuất hiện trong ảnh — dùng để lọc theo consent */
    taggedStudentIds: jsonb("tagged_student_ids").$type<string[]>().notNull().default([]),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    /** Lúc GV gửi duyệt — mốc tính quá hạn duyệt (ảnh nằm trong kho không tính) */
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    submittedBy: uuid("submitted_by").references(() => users.id),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** Lúc bị loại — còn khôi phục trong 7 ngày kể từ mốc này */
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
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
    /** Nhóm tiêu chí (vd "Thiết kế & lắp ráp", "Thái độ & kỹ năng mềm") — docs/HO-SO-HOC-TAP.md */
    groupName: text("group_name"),
    /**
     * Mô tả HÀNH VI QUAN SÁT ĐƯỢC cho 4 mức (mảng 4 chuỗi, mức 1 → 4). Null = dùng mô tả mặc định theo tên.
     * Chụp vào phiếu buổi lúc phát hành — sửa sau không đổi phiếu cũ.
     */
    levelDescriptors: jsonb("level_descriptors").$type<string[]>(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("criteria_course_idx").on(t.courseId, t.sortOrder)],
);

/**
 * Tiêu chí TRỌNG TÂM của từng bài học (không bắt buộc): trong phiếu buổi, tiêu chí trọng tâm được đánh dấu
 * và xếp lên đầu. Bài không khai thì dùng toàn bộ tiêu chí của khoá như cũ. Ràng buộc ở sql/0013_chuan_ho_so.sql.
 * Không có cột tenant: phạm vi trung tâm đi theo khoá học (courses.tenant_id) của bài / tiêu chí.
 */
export const lessonFocusCriteria = pgTable(
  "lesson_focus_criteria",
  {
    id: id(),
    lessonId: uuid("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
    criterionId: uuid("criterion_id").notNull().references(() => competencyCriteria.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("lesson_focus_criteria_uq").on(t.lessonId, t.criterionId),
    index("lesson_focus_criteria_criterion_idx").on(t.criterionId),
  ],
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
    /**
     * Thang điểm: 5 = học bạ cũ (chấm tay 1–5); 4 = học bạ mốc tổng hợp từ phiếu nhận xét buổi (rubric 4 mức).
     * Học bạ tạo sau khi có hồ sơ học tập dùng thang 4; học bạ cũ giữ nguyên thang 5.
     */
    rubricScale: smallint("rubric_scale").notNull().default(5),
    /** Bản chụp số liệu tổng hợp từ phiếu buổi của giai đoạn (trung bình, xu hướng, chuyên cần…) lúc lưu */
    aggregate: jsonb("aggregate").$type<MilestoneAggregate>(),
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

export const completionStatusEnum = pgEnum("course_completion_status", COMPLETION_STATUSES);

/**
 * Hoàn thành khoá & chứng nhận theo luồng đề xuất:
 * GV tạo ĐỀ XUẤT (`proposed`) → người có quyền duyệt Duyệt (`approved`, mới sinh số chứng nhận)
 * hoặc Từ chối (`rejected`, bắt buộc lý do). Người có quyền duyệt tạo thẳng bản `approved`.
 */
export const courseCompletions = pgTable(
  "course_completions",
  {
    id: id(),
    enrollmentId: uuid("enrollment_id").notNull().references(() => enrollments.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").notNull().references(() => courses.id),
    status: completionStatusEnum("status").notNull().default("approved"),
    grade: text("grade").notNull(),
    teacherEvaluation: text("teacher_evaluation").notNull(),
    averageScore: numeric("average_score", { precision: 3, scale: 1 }),
    /** Chỉ có khi đã được duyệt */
    certificateNo: text("certificate_no"),
    nextCourseId: uuid("next_course_id").references(() => courses.id),
    proposedBy: uuid("proposed_by").references(() => users.id),
    proposedAt: timestamp("proposed_at", { withTimezone: true }),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    rejectReason: text("reject_reason"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    issuedBy: uuid("issued_by").references(() => users.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // đề xuất bị từ chối không chặn lần đề xuất sau
    uniqueIndex("completions_enrollment_unique").on(t.enrollmentId).where(sql`status <> 'rejected'`),
    uniqueIndex("completions_cert_unique").on(t.certificateNo),
    index("completions_status_idx").on(t.status),
  ],
);
