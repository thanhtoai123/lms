import { pgTable, text, uuid, integer, bigint, boolean, timestamp, pgEnum, jsonb, index, uniqueIndex, numeric } from "drizzle-orm/pg-core";
import {
  DOC_KINDS, DOC_AUDIENCES, DOC_STATUSES, DOC_CATEGORIES, SCORM_STATUSES, SUBMISSION_TYPES, ASSIGNMENT_STATUSES, SUBMISSION_STATUSES,
  PROPOSAL_TYPES, PROPOSAL_STATUSES, PLAN_VERSION_STATUSES,
} from "@satarobo/core";
import { id, timestamps } from "./_common";
import { users } from "./identity";
import { students } from "./people";
import { courses, curricula, lessons, classes, sessions } from "./academics";

export const docKindEnum = pgEnum("doc_kind", DOC_KINDS);
export const docAudienceEnum = pgEnum("doc_audience", DOC_AUDIENCES);
export const docStatusEnum = pgEnum("doc_status", DOC_STATUSES);
export const docVersionStatusEnum = pgEnum("doc_version_status", PLAN_VERSION_STATUSES);
export const docCategoryEnum = pgEnum("doc_category", DOC_CATEGORIES);
export const scormStatusEnum = pgEnum("scorm_status", SCORM_STATUSES);
export const submissionTypeEnum = pgEnum("submission_type", SUBMISSION_TYPES);
export const assignmentStatusEnum = pgEnum("assignment_status", ASSIGNMENT_STATUSES);
export const submissionStatusEnum = pgEnum("submission_status", SUBMISSION_STATUSES);
export const proposalTypeEnum = pgEnum("proposal_type", PROPOSAL_TYPES);
export const proposalStatusEnum = pgEnum("proposal_status", PROPOSAL_STATUSES);

/** Tài liệu giảng dạy (tệp / liên kết / gói SCORM) theo khoá, có thể gắn bài học */
export const documents = pgTable("documents", {
  id: id(),
  title: text("title").notNull(),
  description: text("description"),
  kind: docKindEnum("kind").notNull(),
  category: docCategoryEnum("category").notNull().default("other"),
  audience: docAudienceEnum("audience").notNull().default("teacher"),
  status: docStatusEnum("status").notNull().default("draft"),
  courseId: uuid("course_id").notNull().references(() => courses.id),
  lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
  url: text("url"),
  currentVersion: integer("current_version").notNull().default(0),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [index("documents_course_idx").on(t.courseId, t.status), index("documents_lesson_idx").on(t.lessonId)]);

/** Phiên bản tệp của tài liệu (không ghi đè — bản mới là phiên bản mới) */
export const documentVersions = pgTable("document_versions", {
  id: id(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  objectKey: text("object_key").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(),
  note: text("note"),
  /** SCORM: phiên bản chuẩn, trang khởi chạy, số tệp */
  scormVersion: text("scorm_version"),
  launchPath: text("launch_path"),
  fileCount: integer("file_count"),
  /**
   * Vòng đời một bản tải lên: processing (đang giải nén / ghi tệp) → ready, hoặc failed.
   * Có trạng thái thì bản chết giữa chừng không "biến mất" âm thầm: màn hình giáo án hiện
   * "kẹt xử lý" kèm nút dọn (xem core/content/lessonPlan.ts).
   */
  status: docVersionStatusEnum("status").notNull().default("ready"),
  errorText: text("error_text"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("document_versions_uq").on(t.documentId, t.version)]);

/** Nhật ký mở / tải tài liệu */
export const documentAccessLogs = pgTable("document_access_logs", {
  id: id(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  version: integer("version"),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(), // download | view | launch
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("doc_access_doc_idx").on(t.documentId, t.createdAt)]);

/** Lượt học SCORM (theo tài khoản) */
export const scormAttempts = pgTable("scorm_attempts", {
  id: id(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id),
  status: scormStatusEnum("status").notNull().default("not_attempted"),
  score: numeric("score", { precision: 5, scale: 1, mode: "number" }),
  totalSeconds: integer("total_seconds").notNull().default(0),
  location: text("location"),
  suspendData: text("suspend_data"),
  cmi: jsonb("cmi").$type<Record<string, string>>().notNull().default({}),
  launches: integer("launches").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [uniqueIndex("scorm_attempts_uq").on(t.documentId, t.version, t.userId)]);

/** Mẫu bài tập (Đào tạo soạn theo khoá / bài) */
export const assignmentTemplates = pgTable("assignment_templates", {
  id: id(),
  courseId: uuid("course_id").notNull().references(() => courses.id),
  lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  instructions: text("instructions").notNull(),
  submissionType: submissionTypeEnum("submission_type").notNull().default("file"),
  maxScore: integer("max_score").notNull().default(10),
  documentIds: jsonb("document_ids").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id),
  ...timestamps,
}, (t) => [index("assign_tpl_course_idx").on(t.courseId, t.isActive)]);

export const assignments = pgTable("assignments", {
  id: id(),
  classId: uuid("class_id").notNull().references(() => classes.id),
  sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
  templateId: uuid("template_id").references(() => assignmentTemplates.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  instructions: text("instructions").notNull(),
  submissionType: submissionTypeEnum("submission_type").notNull().default("file"),
  maxScore: integer("max_score").notNull().default(10),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  allowLate: boolean("allow_late").notNull().default(true),
  coinReward: integer("coin_reward").notNull().default(0),
  documentIds: jsonb("document_ids").$type<string[]>().notNull().default([]),
  status: assignmentStatusEnum("status").notNull().default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  ...timestamps,
}, (t) => [index("assignments_class_idx").on(t.classId, t.status, t.dueAt)]);

export const submissions = pgTable("submissions", {
  id: id(),
  assignmentId: uuid("assignment_id").notNull().references(() => assignments.id, { onDelete: "cascade" }),
  studentId: uuid("student_id").notNull().references(() => students.id),
  status: submissionStatusEnum("status").notNull().default("assigned"),
  /** Liên kết nộp bài cho phụ huynh (token là quyền) */
  token: text("token").notNull().unique(),
  answerText: text("answer_text"),
  link: text("link"),
  files: jsonb("files").$type<{ key: string; name: string; mime: string; size: number }[]>().notNull().default([]),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  submittedVia: text("submitted_via"), // parent_link | staff
  late: boolean("late").notNull().default(false),
  attempts: integer("attempts").notNull().default(0),
  score: numeric("score", { precision: 5, scale: 1, mode: "number" }),
  feedback: text("feedback"),
  gradedBy: uuid("graded_by").references(() => users.id),
  gradedAt: timestamp("graded_at", { withTimezone: true }),
  coinTxId: uuid("coin_tx_id"),
  note: text("note"),
  ...timestamps,
}, (t) => [uniqueIndex("submissions_uq").on(t.assignmentId, t.studentId), index("submissions_student_idx").on(t.studentId, t.status)]);

/** Đề xuất sửa giáo án (GV → Đào tạo) */
export const lessonProposals = pgTable("lesson_proposals", {
  id: id(),
  code: text("code").notNull().unique(),
  lessonId: uuid("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  curriculumId: uuid("curriculum_id").notNull().references(() => curricula.id, { onDelete: "cascade" }),
  type: proposalTypeEnum("type").notNull(),
  status: proposalStatusEnum("status").notNull().default("submitted"),
  reason: text("reason").notNull(),
  snapshot: jsonb("snapshot").$type<{ title: string; objectives: string | null; materials: string | null }>().notNull(),
  patch: jsonb("patch").$type<{ title?: string | null; objectives?: string | null; materials?: string | null }>().notNull(),
  classId: uuid("class_id").references(() => classes.id, { onDelete: "set null" }),
  proposedBy: uuid("proposed_by").notNull().references(() => users.id),
  reviewerId: uuid("reviewer_id").references(() => users.id),
  decisionNote: text("decision_note"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  appliedBy: uuid("applied_by").references(() => users.id),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [index("lesson_proposals_status_idx").on(t.status, t.createdAt), index("lesson_proposals_lesson_idx").on(t.lessonId)]);

export const proposalComments = pgTable("proposal_comments", {
  id: id(),
  proposalId: uuid("proposal_id").notNull().references(() => lessonProposals.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
