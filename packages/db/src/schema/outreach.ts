import { pgTable, text, uuid, integer, bigint, boolean, date, timestamp, pgEnum, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { JOB_STATUSES, CANDIDATE_STAGES, INTERVIEW_RESULTS, MSG_CHANNELS, CONV_STATUSES, APPOINTMENT_KINDS, APPOINTMENT_STATUSES, AFFILIATE_TYPES, REWARD_STATUSES } from "@satarobo/core";
import { id, timestamps } from "./_common";
import { users } from "./identity";
import { centers } from "./org";
import { parents, teachers } from "./people";
import { leads } from "./admissions";
import { staff, employmentTypeEnum } from "./hr";
import { orders } from "./finance";
import { tenantCol } from "./tenant";

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
  /** Nick/cổng của kênh ngoài đã nhận hội thoại này (Zalo cá nhân) — để trả lời đúng nick */
  channelAccountId: uuid("channel_account_id"),
  assignedTo: uuid("assigned_to").references(() => users.id),
  status: convStatusEnum("status").notNull().default("open"),
  subject: text("subject"),
  /** Cổng PH: băm SHA-256 của mã truy cập */
  portalTokenHash: text("portal_token_hash"),
  portalSeenAt: timestamp("portal_seen_at", { withTimezone: true }),
  lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
  /** Lần cuối một nhân viên MỞ hội thoại — để tính "chưa đọc" (tin khách tới sau mốc này) */
  staffSeenAt: timestamp("staff_seen_at", { withTimezone: true }),
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

/**
 * KHOÁ TRUY CẬP ZALO OA — vòng đời token, không để trong biến môi trường.
 *
 * Zalo cấp access token sống **25 giờ** và refresh token sống 3 tháng **dùng một lần** (refresh
 * xong token cũ bị vô hiệu, Zalo trả về token mới). Để trong `.env` nghĩa là mỗi ngày phải sửa
 * tệp và khởi động lại máy chủ, quên một hôm là toàn bộ tin Zalo chết im lặng. Vì vậy token phải
 * nằm trong CSDL để worker tự làm mới và ghi đè token mới.
 *
 * Ba cột token/secret lưu dạng ĐÃ MÃ HOÁ (AES-256-GCM, cùng khoá với PII) — đọc thẳng CSDL
 * không lấy được giá trị.
 */
export const zaloCredentials = pgTable("zalo_credentials", {
  id: id(),
  /** Chỗ cho nhiều OA về sau; hiện dùng một dòng "oa" */
  key: text("key").notNull().default("oa"),
  oaId: text("oa_id"),
  appId: text("app_id"),
  /** secret_key của ứng dụng Zalo (đã mã hoá) */
  secretKey: text("secret_key"),
  /** access token hiện hành (đã mã hoá) */
  accessToken: text("access_token"),
  /** refresh token cho lần làm mới kế tiếp (đã mã hoá) — dùng một lần rồi bị thay */
  refreshToken: text("refresh_token"),
  /** Hạn của access token (Zalo trả expires_in, thường 90.000 giây = 25 giờ) */
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true }),
  /** Lỗi làm mới gần nhất — hiện ở màn Tích hợp để biết vì sao tin Zalo ngừng gửi */
  lastError: text("last_error"),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  updatedBy: uuid("updated_by").references(() => users.id),
  ...timestamps,
}, (t) => [uniqueIndex("zalo_credentials_key_uq").on(t.key)]);

/**
 * TÀI KHOẢN KÊNH CHAT NGOÀI — mỗi dòng là một "nick" hoặc một cổng của công cụ chat bên ngoài
 * (hiện dùng cho Zalo cá nhân chạy trên ZCRM).
 *
 * Vì sao tách bảng thay vì nhét vào `app_settings`: một trung tâm có nhiều nick, mỗi nick có khoá
 * riêng, hạn mức riêng, trạng thái sống/chết riêng — và trạng thái ấy phải hiện lên màn Zalo CRM.
 * `api_key` / `webhook_secret` lưu dạng ĐÃ MÃ HOÁ và không bao giờ trả về giao diện.
 */
export const channelAccounts = pgTable("channel_accounts", {
  id: id(),
  channel: msgChannelEnum("channel").notNull(),
  /** Tên người dùng đặt: "Nick CS2 — chị Hà" */
  label: text("label").notNull(),
  /** Mã ngắn không dấu, dùng trong đường dẫn webhook và header X-Channel-Account */
  slug: text("slug").notNull(),
  /** Id nick Zalo phía công cụ (nếu biết) */
  externalId: text("external_id"),
  centerId: uuid("center_id").references(() => centers.id),
  /** Gốc API của công cụ, ví dụ http://10.0.0.5:3080 */
  baseUrl: text("base_url"),
  /** Khoá gọi API công cụ (đã mã hoá) — dùng ở đợt gửi tin */
  apiKey: text("api_key"),
  /** Bí mật để kiểm chữ ký webhook công cụ bắn về (đã mã hoá) */
  webhookSecret: text("webhook_secret"),
  active: boolean("active").notNull().default(true),
  /** online | offline | error */
  status: text("status").notNull().default("offline"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  lastEventAt: timestamp("last_event_at", { withTimezone: true }),
  lastError: text("last_error"),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  /** Trần tin/ngày cho nick — giữ nick khỏi bị Zalo khoá */
  dailyCap: integer("daily_cap").notNull().default(180),
  sentToday: integer("sent_today").notNull().default(0),
  /** Ngày (giờ VN) của bộ đếm sentToday */
  sentDay: date("sent_day"),
  updatedBy: uuid("updated_by").references(() => users.id),
  ...timestamps,
}, (t) => [
  uniqueIndex("channel_accounts_slug_uq").on(t.channel, t.slug),
  index("channel_accounts_ch_idx").on(t.channel, t.active),
]);


/* ---------------- Nhãn hội thoại (kiểu CRM Zalo) ---------------- */

/**
 * Nhãn do trung tâm tự đặt, gắn lên hội thoại: "Lộ trình ngắn hạn", "Chờ báo giá", "Đã hẹn học thử"…
 * Tách khỏi `conversations.flags` (cờ hệ thống sinh ra tự động: từ nhạy cảm, thanh toán riêng) vì nhãn
 * là việc của người bán hàng, sửa được, đổi màu được, và dùng để lọc hộp thư.
 */
export const conversationTags = pgTable("conversation_tags", {
  id: id(),
  tenantId: tenantCol(),
  name: text("name").notNull(),
  /** Mã màu ngắn: slate | brand | green | amber | red | violet */
  color: text("color").notNull().default("slate"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id),
  ...timestamps,
}, (t) => [uniqueIndex("conversation_tags_name_uq").on(t.tenantId, t.name)]);

export const conversationTagLinks = pgTable("conversation_tag_links", {
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").notNull().references(() => conversationTags.id, { onDelete: "cascade" }),
  taggedBy: uuid("tagged_by").references(() => users.id),
  taggedAt: timestamp("tagged_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("conversation_tag_links_uq").on(t.conversationId, t.tagId),
  index("conversation_tag_links_tag_idx").on(t.tagId),
]);

/* ---------------- Lịch hẹn (CRM bán hàng) ---------------- */

export const appointmentKindEnum = pgEnum("appointment_kind", APPOINTMENT_KINDS);
export const appointmentStatusEnum = pgEnum("appointment_status", APPOINTMENT_STATUSES);

/**
 * Lịch hẹn với khách: gọi lại, hẹn tư vấn tại trung tâm, hẹn cho bé học thử.
 *
 * Vì sao cần bảng riêng (đã có `trial_bookings` cho học thử): phần lớn cuộc hẹn của tư vấn viên
 * KHÔNG phải buổi học thử — là "gọi lại 19h tối nay", "chị Lan ghé xem cơ sở thứ bảy". Không có chỗ
 * ghi thì nó nằm trong đầu nhân viên, và mất khi người đó nghỉ. Quá hẹn mà chưa xử lý phải nổi lên
 * ngay cạnh hộp thư, đúng như "Lịch hẹn 24h tới" / "Hẹn quá hạn" của công cụ CRM Zalo.
 */
export const appointments = pgTable("appointments", {
  id: id(),
  tenantId: tenantCol(),
  centerId: uuid("center_id").references(() => centers.id),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  parentId: uuid("parent_id").references(() => parents.id, { onDelete: "set null" }),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  kind: appointmentKindEnum("kind").notNull().default("goi_lai"),
  at: timestamp("at", { withTimezone: true }).notNull(),
  durationMin: integer("duration_min").notNull().default(30),
  status: appointmentStatusEnum("status").notNull().default("dat"),
  note: text("note"),
  /** Người phụ trách cuộc hẹn (mặc định là người tạo) */
  assignedTo: uuid("assigned_to").references(() => users.id),
  /** Đã bắn nhắc trước giờ hẹn chưa — tránh nhắc trùng */
  remindedAt: timestamp("reminded_at", { withTimezone: true }),
  doneAt: timestamp("done_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  ...timestamps,
}, (t) => [
  index("appointments_time_idx").on(t.at, t.status),
  index("appointments_owner_idx").on(t.assignedTo, t.status, t.at),
  index("appointments_lead_idx").on(t.leadId),
]);
