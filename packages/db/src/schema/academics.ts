import {
  pgTable, text, uuid, boolean, integer, date, time, timestamp, pgEnum, jsonb, index, uniqueIndex, smallint, numeric,
} from "drizzle-orm/pg-core";
import { id, timestamps, softDelete } from "./_common";
import { SESSION_STATUSES, ATTENDANCE_STATUSES, ENROLLMENT_STATUSES, CLASS_STATUSES } from "@satarobo/core";
import { centers, rooms } from "./org";
import { teachers, students, parents } from "./people";
import { users } from "./identity";

export const sessionStatusEnum = pgEnum("session_status", SESSION_STATUSES);
export const attendanceStatusEnum = pgEnum("attendance_status", ATTENDANCE_STATUSES);
export const enrollmentStatusEnum = pgEnum("enrollment_status", ENROLLMENT_STATUSES);
export const classStatusEnum = pgEnum("class_status", CLASS_STATUSES);

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
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

/** Giáo trình: một khoá có thể có nhiều phiên bản giáo trình */
export const curricula = pgTable(
  "curricula",
  {
    id: id(),
    courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    version: integer("version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
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
    startDate: date("start_date"),
    expectedEndDate: date("expected_end_date"),
    status: classStatusEnum("status").notNull().default("draft"),
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
    ...timestamps,
  },
  (t) => [index("class_schedules_class_idx").on(t.classId)],
);

/** Ngày nghỉ theo cơ sở (null = toàn hệ thống) */
export const holidays = pgTable("holidays", {
  id: id(),
  centerId: uuid("center_id").references(() => centers.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  name: text("name").notNull(),
});

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
    date: date("date").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    roomId: uuid("room_id").references(() => rooms.id),
    teacherId: uuid("teacher_id").references(() => teachers.id),
    status: sessionStatusEnum("status").notNull().default("scheduled"),
    topic: text("topic"),
    /** Nhận xét chung của buổi (bắt buộc để hoàn tất) */
    sessionNote: text("session_note"),
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
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endReason: text("end_reason"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("enrollments_active_unique").on(t.studentId, t.classId),
    index("enrollments_class_idx").on(t.classId, t.status),
    index("enrollments_student_idx").on(t.studentId),
  ],
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
