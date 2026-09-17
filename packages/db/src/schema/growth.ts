import { pgTable, text, uuid, integer, bigint, boolean, date, timestamp, pgEnum, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { POST_STATUSES, POST_CATEGORIES, TRACK_EVENTS, CHANNELS, DSR_TYPES, DSR_STATUSES, SUBJECT_TYPES, CONSENT_PURPOSES, INCIDENT_SEVERITIES, INCIDENT_STATUSES } from "@satarobo/core";
import { id, timestamps } from "./_common";
import { users } from "./identity";
import { centers } from "./org";
import { leads } from "./admissions";

export const postStatusEnum = pgEnum("post_status", POST_STATUSES);
export const postCategoryEnum = pgEnum("post_category", POST_CATEGORIES);
export const trackEventEnum = pgEnum("track_event", TRACK_EVENTS);
export const channelEnum = pgEnum("marketing_channel", CHANNELS);
export const dsrTypeEnum = pgEnum("dsr_type", DSR_TYPES);
export const dsrStatusEnum = pgEnum("dsr_status", DSR_STATUSES);
export const subjectTypeEnum = pgEnum("data_subject_type", SUBJECT_TYPES);
export const consentPurposeEnum = pgEnum("consent_purpose", CONSENT_PURPOSES);
export const incidentSeverityEnum = pgEnum("incident_severity", INCIDENT_SEVERITIES);
export const incidentStatusEnum = pgEnum("incident_status", INCIDENT_STATUSES);

/** Bài viết website */
export const posts = pgTable("posts", {
  id: id(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  excerpt: text("excerpt"),
  body: text("body").notNull(),
  coverImage: text("cover_image"),
  category: postCategoryEnum("category").notNull().default("news"),
  status: postStatusEnum("status").notNull().default("draft"),
  publishAt: timestamp("publish_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  views: integer("views").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
  ...timestamps,
}, (t) => [index("posts_status_idx").on(t.status, t.publishedAt)]);

/** Nội dung từng trang công khai (khối theo trang) */
export const siteBlocks = pgTable("site_blocks", {
  page: text("page").primaryKey(),
  data: jsonb("data").$type<Record<string, string>>().notNull(),
  version: integer("version").notNull().default(1),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const siteBlockHistory = pgTable("site_block_history", {
  id: id(),
  page: text("page").notNull(),
  version: integer("version").notNull(),
  data: jsonb("data").$type<Record<string, string>>().notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("site_block_history_uq").on(t.page, t.version)]);

/** Ảnh công khai của website */
export const siteMedia = pgTable("site_media", {
  id: id(),
  objectKey: text("object_key").notNull().unique(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  alt: text("alt"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Chiến dịch marketing (khớp lead theo utm_campaign) */
export const campaigns = pgTable("campaigns", {
  id: id(),
  name: text("name").notNull(),
  utmCampaign: text("utm_campaign").notNull().unique(),
  channel: channelEnum("channel").notNull(),
  centerId: uuid("center_id").references(() => centers.id),
  budget: bigint("budget", { mode: "number" }).notNull().default(0),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  landingUrl: text("landing_url"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id),
  ...timestamps,
});

/** Chi phí thực chi theo ngày */
export const campaignSpends = pgTable("campaign_spends", {
  id: id(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  impressions: integer("impressions"),
  clicks: integer("clicks"),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("campaign_spends_uq").on(t.campaignId, t.date)]);

/** Sự kiện website first-party (không lưu IP / dữ liệu cá nhân) */
export const trackEvents = pgTable("track_events", {
  id: id(),
  event: trackEventEnum("event").notNull(),
  anonId: text("anon_id").notNull(),
  path: text("path").notNull(),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  referrerHost: text("referrer_host"),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("track_events_time_idx").on(t.createdAt), index("track_events_campaign_idx").on(t.utmCampaign, t.event)]);

/** Sổ đồng ý / rút đồng ý (chỉ thêm) */
export const consentRecords = pgTable("consent_records", {
  id: id(),
  subjectType: subjectTypeEnum("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  purpose: consentPurposeEnum("purpose").notNull(),
  granted: boolean("granted").notNull(),
  source: text("source").notNull(), // web_form | counter | dsr | parent_app | import
  textVersion: text("text_version").notNull(),
  requestId: uuid("request_id"),
  recordedBy: uuid("recorded_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("consent_subject_idx").on(t.subjectType, t.subjectId, t.purpose, t.createdAt)]);

/** Yêu cầu của chủ thể dữ liệu */
export const dataRequests = pgTable("data_requests", {
  id: id(),
  code: text("code").notNull().unique(),
  type: dsrTypeEnum("type").notNull(),
  status: dsrStatusEnum("status").notNull().default("received"),
  subjectType: subjectTypeEnum("subject_type"),
  subjectId: uuid("subject_id"),
  centerId: uuid("center_id").references(() => centers.id),
  requesterName: text("requester_name").notNull(),
  requesterPhone: text("requester_phone").notNull(),
  channel: text("channel").notNull(),
  details: text("details").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  ackDueAt: timestamp("ack_due_at", { withTimezone: true }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  extendedAt: timestamp("extended_at", { withTimezone: true }),
  extensionReason: text("extension_reason"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  resolution: text("resolution"),
  exportKey: text("export_key"),
  createdBy: uuid("created_by").references(() => users.id),
  handledBy: uuid("handled_by").references(() => users.id),
  ...timestamps,
}, (t) => [index("data_requests_status_idx").on(t.status, t.dueAt)]);

export const dataRequestEvents = pgTable("data_request_events", {
  id: id(),
  requestId: uuid("request_id").notNull().references(() => dataRequests.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  note: text("note"),
  userId: uuid("user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Sổ sự cố / vi phạm dữ liệu cá nhân */
export const dataIncidents = pgTable("data_incidents", {
  id: id(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  severity: incidentSeverityEnum("severity").notNull(),
  status: incidentStatusEnum("status").notNull().default("open"),
  centerId: uuid("center_id").references(() => centers.id),
  dataTypes: text("data_types"),
  affectedCount: integer("affected_count").notNull().default(0),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
  notifyDueAt: timestamp("notify_due_at", { withTimezone: true }).notNull(),
  containment: text("containment"),
  notifiedAuthorityAt: timestamp("notified_authority_at", { withTimezone: true }),
  notifiedSubjectsAt: timestamp("notified_subjects_at", { withTimezone: true }),
  noNotifyReason: text("no_notify_reason"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  reportedBy: uuid("reported_by").references(() => users.id),
  handledBy: uuid("handled_by").references(() => users.id),
  ...timestamps,
}, (t) => [index("data_incidents_status_idx").on(t.status, t.notifyDueAt)]);
