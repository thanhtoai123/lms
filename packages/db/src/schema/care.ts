import { pgTable, text, uuid, boolean, integer, smallint, date, timestamp, pgEnum, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import {
  PARENT_REQUEST_TYPES, PARENT_REQUEST_STATUSES, CONTACT_CHANNELS, FEEDBACK_STATUSES, SURVEY_TRIGGERS, SURVEY_STATUSES,
  EVAL_FORM_TYPES, EVAL_QUESTION_TYPES, EVAL_ROUND_STATUSES,
  type SurveyQuestion, type SurveyAnswers,
} from "@satarobo/core";
import { id, timestamps } from "./_common";
import { tenantCol } from "./tenant";
import { users } from "./identity";
import { centers } from "./org";
import { parents, students, teachers } from "./people";
import { enrollments, sessions, classes } from "./academics";

export const parentRequestTypeEnum = pgEnum("parent_request_type", PARENT_REQUEST_TYPES);
export const parentRequestStatusEnum = pgEnum("parent_request_status", PARENT_REQUEST_STATUSES);
export const contactChannelEnum = pgEnum("contact_channel", CONTACT_CHANNELS);
export const feedbackStatusEnum = pgEnum("feedback_status", FEEDBACK_STATUSES);
export const surveyTriggerEnum = pgEnum("survey_trigger", SURVEY_TRIGGERS);
export const surveyStatusEnum = pgEnum("survey_status", SURVEY_STATUSES);

/** Yêu cầu của phụ huynh (nghỉ, bảo lưu, đổi lịch, học bù, hoàn phí, khiếu nại…) */
export const parentRequests = pgTable(
  "parent_requests",
  {
    id: id(),
    tenantId: tenantCol(),
    code: text("code").notNull().unique(),
    type: parentRequestTypeEnum("type").notNull(),
    status: parentRequestStatusEnum("status").notNull().default("new"),
    channel: contactChannelEnum("channel").notNull(),
    centerId: uuid("center_id").notNull().references(() => centers.id),
    studentId: uuid("student_id").notNull().references(() => students.id),
    parentId: uuid("parent_id").references(() => parents.id),
    enrollmentId: uuid("enrollment_id").references(() => enrollments.id),
    sessionId: uuid("session_id").references(() => sessions.id),
    missedSessionId: uuid("missed_session_id").references(() => sessions.id),
    dateFrom: date("date_from"),
    dateTo: date("date_to"),
    content: text("content").notNull(),
    resolution: text("resolution"),
    assigneeId: uuid("assignee_id").references(() => users.id),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    linked: jsonb("linked").$type<{ kind: string; id: string; href: string } | null>(),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("parent_requests_status_idx").on(t.status, t.centerId, t.dueAt), index("parent_requests_student_idx").on(t.studentId)],
);

export const parentRequestEvents = pgTable(
  "parent_request_events",
  {
    id: id(),
    requestId: uuid("request_id").notNull().references(() => parentRequests.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    fromStatus: parentRequestStatusEnum("from_status"),
    toStatus: parentRequestStatusEnum("to_status"),
    note: text("note"),
    actorId: uuid("actor_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("parent_request_events_idx").on(t.requestId, t.createdAt)],
);

/** Đánh giá của phụ huynh về buổi học / giáo viên */
export const parentFeedback = pgTable(
  "parent_feedback",
  {
    id: id(),
    centerId: uuid("center_id").notNull().references(() => centers.id),
    studentId: uuid("student_id").notNull().references(() => students.id),
    parentId: uuid("parent_id").references(() => parents.id),
    classId: uuid("class_id").references(() => classes.id),
    sessionId: uuid("session_id").references(() => sessions.id),
    teacherId: uuid("teacher_id").references(() => teachers.id),
    rating: smallint("rating").notNull(),
    teacherRating: smallint("teacher_rating"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    comment: text("comment"),
    channel: contactChannelEnum("channel").notNull(),
    status: feedbackStatusEnum("status").notNull().default("new"),
    response: text("response"),
    respondedBy: uuid("responded_by").references(() => users.id),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    careTaskId: uuid("care_task_id"),
    surveyResponseId: uuid("survey_response_id"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("parent_feedback_center_idx").on(t.centerId, t.createdAt), index("parent_feedback_teacher_idx").on(t.teacherId), uniqueIndex("parent_feedback_session_unique").on(t.sessionId, t.studentId)],
);

/** Khảo sát (NPS, mức hài lòng) */
export const surveys = pgTable("surveys", {
  id: id(),
  title: text("title").notNull(),
  description: text("description"),
  centerId: uuid("center_id").references(() => centers.id),
  trigger: surveyTriggerEnum("trigger").notNull().default("manual"),
  triggerValue: integer("trigger_value"),
  questions: jsonb("questions").$type<SurveyQuestion[]>().notNull(),
  status: surveyStatusEnum("status").notNull().default("draft"),
  createdBy: uuid("created_by").references(() => users.id),
  ...timestamps,
});

export const surveyInvites = pgTable(
  "survey_invites",
  {
    id: id(),
    surveyId: uuid("survey_id").notNull().references(() => surveys.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").notNull().references(() => parents.id),
    studentId: uuid("student_id").notNull().references(() => students.id),
    enrollmentId: uuid("enrollment_id").references(() => enrollments.id),
    centerId: uuid("center_id").notNull().references(() => centers.id),
    token: text("token").notNull().unique(),
    /** sent | opened | answered | expired */
    status: text("status").notNull().default("sent"),
    source: text("source").notNull().default("manual"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (t) => [uniqueIndex("survey_invites_unique").on(t.surveyId, t.studentId), index("survey_invites_status_idx").on(t.surveyId, t.status)],
);

export const surveyResponses = pgTable("survey_responses", {
  id: id(),
  inviteId: uuid("invite_id").notNull().unique().references(() => surveyInvites.id, { onDelete: "cascade" }),
  surveyId: uuid("survey_id").notNull().references(() => surveys.id, { onDelete: "cascade" }),
  answers: jsonb("answers").$type<SurveyAnswers>().notNull(),
  npsScore: smallint("nps_score"),
  careTaskId: uuid("care_task_id"),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Đợt gửi thông báo hàng loạt */
export const notificationBroadcasts = pgTable("notification_broadcasts", {
  id: id(),
  tenantId: tenantCol(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  channel: text("channel").notNull(),
  audience: jsonb("audience").$type<Record<string, unknown>>().notNull(),
  recipients: integer("recipients").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Lời chúc sinh nhật đã gửi (1 lần / học viên / năm) */
export const birthdayGreetings = pgTable(
  "birthday_greetings",
  {
    id: id(),
    studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    message: text("message").notNull(),
    sentBy: uuid("sent_by").references(() => users.id),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("birthday_greetings_unique").on(t.studentId, t.year)],
);

/* ------------------------------------------------------------------ */
/* Đánh giá & Khảo sát v2 (bản gốc /evaluations)                       */
/* ------------------------------------------------------------------ */

export const evalFormTypeEnum = pgEnum("eval_form_type", EVAL_FORM_TYPES);
export const evalQuestionTypeEnum = pgEnum("eval_question_type", EVAL_QUESTION_TYPES);
export const evalRoundStatusEnum = pgEnum("eval_round_status", EVAL_ROUND_STATUSES);

/**
 * Phiếu đánh giá (trình dựng phiếu). Ba loại: Đánh giá GV · Khảo sát cơ sở · Đánh giá buổi học.
 * NPS cũ (bảng surveys) vẫn giữ nguyên, đang được thay dần bằng bộ bảng này.
 */
export const evalForms = pgTable(
  "eval_forms",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description"),
    type: evalFormTypeEnum("type").notNull(),
    /** null = phiếu dùng chung toàn hệ thống */
    centerId: uuid("center_id").references(() => centers.id),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("eval_forms_type_idx").on(t.type, t.centerId)],
);

/** Câu hỏi của phiếu — mỗi câu có thể gắn nhóm tiêu chí (vd "Kiến thức"), để trống nếu không nhóm */
export const evalQuestions = pgTable(
  "eval_questions",
  {
    id: id(),
    formId: uuid("form_id").notNull().references(() => evalForms.id, { onDelete: "cascade" }),
    type: evalQuestionTypeEnum("type").notNull(),
    label: text("label").notNull(),
    /** Nhóm tiêu chí — null = không nhóm */
    criteriaGroup: text("criteria_group"),
    /** Lựa chọn dựng sẵn: chỉ radio / checkbox */
    options: jsonb("options").$type<string[]>(),
    required: boolean("required").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("eval_questions_form_idx").on(t.formId, t.sortOrder)],
);

/** Đợt khảo sát: chọn phiếu, phạm vi cơ sở tuỳ chọn, thời gian; Mở đợt / Đóng đợt / Lưu trữ */
export const evalRounds = pgTable(
  "eval_rounds",
  {
    id: id(),
    formId: uuid("form_id").notNull().references(() => evalForms.id),
    title: text("title").notNull(),
    /** null = mọi cơ sở */
    centerId: uuid("center_id").references(() => centers.id),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: evalRoundStatusEnum("status").notNull().default("draft"),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("eval_rounds_status_idx").on(t.status, t.centerId), index("eval_rounds_form_idx").on(t.formId)],
);

/** Một lượt trả lời phiếu trong một đợt */
export const evalResponses = pgTable(
  "eval_responses",
  {
    id: id(),
    roundId: uuid("round_id").notNull().references(() => evalRounds.id, { onDelete: "cascade" }),
    formId: uuid("form_id").notNull().references(() => evalForms.id),
    centerId: uuid("center_id").references(() => centers.id),
    /** Đối tượng được đánh giá — theo loại phiếu */
    teacherId: uuid("teacher_id").references(() => teachers.id),
    sessionId: uuid("session_id").references(() => sessions.id),
    classId: uuid("class_id").references(() => classes.id),
    /** Người trả lời (PH / HV) — null = ẩn danh */
    parentId: uuid("parent_id").references(() => parents.id),
    studentId: uuid("student_id").references(() => students.id),
    submittedBy: uuid("submitted_by").references(() => users.id),
    /** Điểm trung bình các câu chấm sao của lượt này (×100 để khỏi dùng số thực) */
    ratingAvgX100: integer("rating_avg_x100"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("eval_responses_round_idx").on(t.roundId), index("eval_responses_teacher_idx").on(t.teacherId)],
);

/** Trả lời từng câu — tách dòng để tổng hợp theo nhóm tiêu chí */
export const evalAnswers = pgTable(
  "eval_answers",
  {
    id: id(),
    responseId: uuid("response_id").notNull().references(() => evalResponses.id, { onDelete: "cascade" }),
    questionId: uuid("question_id").notNull().references(() => evalQuestions.id),
    /** rating 1–5 */
    rating: smallint("rating"),
    /** radio: 1 phần tử; checkbox: nhiều phần tử */
    choices: jsonb("choices").$type<string[]>(),
    text: text("text"),
    /** image: đường dẫn ảnh đã tải lên */
    imageUrl: text("image_url"),
  },
  (t) => [index("eval_answers_response_idx").on(t.responseId), index("eval_answers_question_idx").on(t.questionId)],
);
