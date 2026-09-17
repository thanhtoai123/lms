import { pgTable, text, uuid, integer, bigint, boolean, date, timestamp, pgEnum, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { JOB_STATUSES, CANDIDATE_STAGES, INTERVIEW_RESULTS, MSG_CHANNELS, CONV_STATUSES, AFFILIATE_TYPES, REWARD_STATUSES } from "@satarobo/core";
import { id, timestamps } from "./_common";
import { users } from "./identity";
import { centers } from "./org";
import { parents, teachers } from "./people";
import { leads } from "./admissions";
import { staff, employmentTypeEnum } from "./hr";
import { orders } from "./finance";

const money = (name: string) => bigint(name, { mode: "number" });

/* ---------------- Tuyển dụng ---------------- */
export const jobStatusEnum = pgEnum("job_status", JOB_STATUSES);
export const candidateStageEnum = pgEnum("candidate_stage", CANDIDATE_STAGES);
export const interviewResultEnum = pgEnum("interview_result", INTERVIEW_RESULTS);

export const jobPostings = pgTable("job_postings", {
  id: id(),
  code: text("code").notNull().unique(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  centerId: uuid("center_id").references(() => centers.id),
  department: text("department").notNull(),
  employmentType: employmentTypeEnum("employment_type").notNull().default("full_time"),
  openings: integer("openings").notNull().default(1),
  salaryMin: money("salary_min"),
  salaryMax: money("salary_max"),
  salaryText: text("salary_text"),
  description: text("description").notNull(),
  requirements: text("requirements"),
  benefits: text("benefits"),
  deadline: date("deadline"),
  status: jobStatusEnum("status").notNull().default("draft"),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  ...timestamps,
}, (t) => [index("job_postings_status_idx").on(t.status, t.centerId)]);

export const candidates = pgTable("candidates", {
  id: id(),
  jobId: uuid("job_id").notNull().references(() => jobPostings.id),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  phoneNormalized: text("phone_normalized").notNull(),
  email: text("email"),
  coverNote: text("cover_note"),
  cvKey: text("cv_key"),
  cvName: text("cv_name"),
  source: text("source").notNull().default("website"),
  stage: candidateStageEnum("stage").notNull().default("applied"),
  stageReason: text("stage_reason"),
  ownerId: uuid("owner_id").references(() => users.id),
  rating: integer("rating"),
  consentAt: timestamp("consent_at", { withTimezone: true }),
  hiredStaffId: uuid("hired_staff_id").references(() => staff.id),
  anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
  lastStageAt: timestamp("last_stage_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
}, (t) => [index("candidates_job_idx").on(t.jobId, t.stage), uniqueIndex("candidates_job_phone_uq").on(t.jobId, t.phoneNormalized)]);

export const candidateEvents = pgTable("candidate_events", {
  id: id(),
  candidateId: uuid("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  fromStage: candidateStageEnum("from_stage"),
  toStage: candidateStageEnum("to_stage"),
  note: text("note"),
  userId: uuid("user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const interviews = pgTable("interviews", {
  id: id(),
  candidateId: uuid("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  durationMin: integer("duration_min").notNull().default(45),
  location: text("location"),
  interviewerId: uuid("interviewer_id").notNull().references(() => users.id),
  interviewerTeacherId: uuid("interviewer_teacher_id").references(() => teachers.id),
  score: integer("score"),
  result: interviewResultEnum("result"),
  feedback: text("feedback"),
  scoredAt: timestamp("scored_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("interviews_time_idx").on(t.interviewerId, t.scheduledAt)]);

/* ---------------- Hội thoại ---------------- */
export const msgChannelEnum = pgEnum("msg_channel", MSG_CHANNELS);
export const convStatusEnum = pgEnum("conv_status", CONV_STATUSES);
export const msgDirectionEnum = pgEnum("msg_direction", ["in", "out", "note"]);
export const msgStatusEnum = pgEnum("msg_status", ["received", "sent", "queued", "skipped", "failed"]);

export const conversations = pgTable("conversations", {
  id: id(),
  channel: msgChannelEnum("channel").notNull(),
  /** PSID Messenger / user_id Zalo; cổng PH: null */
  externalId: text("external_id"),
  displayName: text("display_name"),
  centerId: uuid("center_id").references(() => centers.id),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  parentId: uuid("parent_id").references(() => parents.id, { onDelete: "set null" }),
  /** Giáo viên phụ trách (hội thoại PH ↔ GV) */
  teacherId: uuid("teacher_id").references(() => teachers.id),
  assignedTo: uuid("assigned_to").references(() => users.id),
  status: convStatusEnum("status").notNull().default("open"),
  subject: text("subject"),
  /** Cổng PH: băm SHA-256 của mã truy cập */
  portalTokenHash: text("portal_token_hash"),
  portalSeenAt: timestamp("portal_seen_at", { withTimezone: true }),
  lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
  lastOutboundAt: timestamp("last_outbound_at", { withTimezone: true }),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  lastPreview: text("last_preview"),
  waitingSince: timestamp("waiting_since", { withTimezone: true }),
  flags: text("flags").array().notNull().default([]),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  ...timestamps,
}, (t) => [
  uniqueIndex("conversations_ext_uq").on(t.channel, t.externalId),
  index("conversations_inbox_idx").on(t.status, t.centerId, t.lastMessageAt),
  index("conversations_parent_idx").on(t.parentId),
]);

export const messages = pgTable("messages", {
  id: id(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  direction: msgDirectionEnum("direction").notNull(),
  body: text("body").notNull(),
  attachments: jsonb("attachments").$type<{ type: string; url: string; name?: string }[]>(),
  senderUserId: uuid("sender_user_id").references(() => users.id),
  externalId: text("external_id"),
  status: msgStatusEnum("status").notNull(),
  tag: text("tag"),
  error: text("error"),
  flags: text("flags").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("messages_conv_idx").on(t.conversationId, t.createdAt), uniqueIndex("messages_ext_uq").on(t.externalId)]);

/* ---------------- Nguồn giới thiệu ---------------- */
export const affiliateTypeEnum = pgEnum("affiliate_type", AFFILIATE_TYPES);
export const rewardStatusEnum = pgEnum("reward_status", REWARD_STATUSES);

export const affiliates = pgTable("affiliates", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: affiliateTypeEnum("type").notNull(),
  phone: text("phone"),
  email: text("email"),
  centerId: uuid("center_id").references(() => centers.id),
  parentId: uuid("parent_id").references(() => parents.id),
  staffId: uuid("staff_id").references(() => staff.id),
  rule: jsonb("rule").$type<{ kind: "fixed" | "percent"; value: number; cap?: number | null }>().notNull(),
  payoutInfo: text("payout_info"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  ...timestamps,
});

export const affiliateRewards = pgTable("affiliate_rewards", {
  id: id(),
  affiliateId: uuid("affiliate_id").notNull().references(() => affiliates.id),
  leadId: uuid("lead_id").notNull().references(() => leads.id),
  orderId: uuid("order_id").references(() => orders.id),
  centerId: uuid("center_id").references(() => centers.id),
  base: money("base").notNull(),
  amount: money("amount").notNull(),
  status: rewardStatusEnum("status").notNull().default("pending"),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  paidBy: uuid("paid_by").references(() => users.id),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  paymentRef: text("payment_ref"),
  cancelReason: text("cancel_reason"),
  ...timestamps,
}, (t) => [uniqueIndex("affiliate_rewards_lead_uq").on(t.leadId), index("affiliate_rewards_status_idx").on(t.status, t.affiliateId)]);
