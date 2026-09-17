import { pgTable, text, uuid, integer, smallint, date, timestamp, pgEnum, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import {
  PARENT_REQUEST_TYPES, PARENT_REQUEST_STATUSES, CONTACT_CHANNELS, FEEDBACK_STATUSES, SURVEY_TRIGGERS, SURVEY_STATUSES,
  type SurveyQuestion, type SurveyAnswers,
} from "@satarobo/core";
import { id, timestamps } from "./_common";
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
