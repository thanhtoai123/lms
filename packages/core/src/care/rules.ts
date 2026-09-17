/**
 * Chăm sóc phụ huynh: yêu cầu, đánh giá, khảo sát / NPS, thông báo, sinh nhật — quy tắc thuần.
 */
import { addDays, parseISODate } from "../dates.js";

export class CareRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CareRuleError";
  }
}

/* ------------------------------------------------------------------ */
/* Yêu cầu phụ huynh                                                   */
/* ------------------------------------------------------------------ */

export const PARENT_REQUEST_TYPES = ["absence", "pause", "schedule_change", "makeup", "refund", "complaint", "other"] as const;
export type ParentRequestType = (typeof PARENT_REQUEST_TYPES)[number];
export const PARENT_REQUEST_TYPE_VI: Record<ParentRequestType, string> = {
  absence: "Xin nghỉ buổi học", pause: "Bảo lưu", schedule_change: "Đổi lịch / chuyển lớp", makeup: "Học bù",
  refund: "Hoàn học phí", complaint: "Góp ý / khiếu nại", other: "Khác",
};
/** Hạn xử lý (giờ) theo loại */
export const PARENT_REQUEST_SLA_HOURS: Record<ParentRequestType, number> = { absence: 4, pause: 24, schedule_change: 24, makeup: 24, refund: 48, complaint: 24, other: 48 };
/** Loại cần duyệt (approve/reject) trước khi hoàn tất */
export const REQUEST_NEEDS_DECISION: readonly ParentRequestType[] = ["absence", "pause", "schedule_change", "makeup", "refund"];

export const PARENT_REQUEST_STATUSES = ["new", "in_progress", "approved", "rejected", "done", "cancelled"] as const;
export type ParentRequestStatus = (typeof PARENT_REQUEST_STATUSES)[number];
export const PARENT_REQUEST_STATUS_VI: Record<ParentRequestStatus, string> = { new: "Mới", in_progress: "Đang xử lý", approved: "Đã duyệt", rejected: "Từ chối", done: "Hoàn tất", cancelled: "Đã huỷ" };
export const OPEN_REQUEST_STATUSES: readonly ParentRequestStatus[] = ["new", "in_progress", "approved"];

export const CONTACT_CHANNELS = ["phone", "zalo", "walk_in", "app", "email"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];
export const CONTACT_CHANNEL_VI: Record<ContactChannel, string> = { phone: "Điện thoại", zalo: "Zalo", walk_in: "Tại quầy", app: "App phụ huynh", email: "Email" };

export type RequestAction = "assign" | "approve" | "reject" | "complete" | "cancel";

export function parentRequestTransition(type: ParentRequestType, from: ParentRequestStatus, action: RequestAction): ParentRequestStatus {
  const needs = REQUEST_NEEDS_DECISION.includes(type);
  const fail = (m: string): never => { throw new CareRuleError(m); };
  switch (action) {
    case "assign":
      return from === "new" || from === "in_progress" ? "in_progress" : fail(`Yêu cầu đang "${PARENT_REQUEST_STATUS_VI[from]}" — không giao lại`);
    case "approve":
    case "reject":
      if (!needs) fail("Loại yêu cầu này không cần duyệt — dùng Hoàn tất");
      return from === "new" || from === "in_progress" ? (action === "approve" ? "approved" : "rejected") : fail(`Yêu cầu đang "${PARENT_REQUEST_STATUS_VI[from]}" — không duyệt lại`);
    case "complete":
      if (needs && from !== "approved") return fail("Cần duyệt yêu cầu trước khi hoàn tất");
      return from === "new" || from === "in_progress" || from === "approved" ? "done" : fail(`Yêu cầu đang "${PARENT_REQUEST_STATUS_VI[from]}"`);
    case "cancel":
      return from === "new" || from === "in_progress" ? "cancelled" : fail("Chỉ huỷ yêu cầu chưa duyệt / chưa xong");
  }
}

export interface ParentRequestInput {
  type: ParentRequestType;
  content: string;
  sessionId?: string | null;
  missedSessionId?: string | null;
  enrollmentId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

export function validateParentRequest(r: ParentRequestInput, today: string): string[] {
  const e: string[] = [];
  if (r.content.trim().length < 5) e.push("Nội dung tối thiểu 5 ký tự");
  const needEnrollment: ParentRequestType[] = ["absence", "pause", "schedule_change", "makeup", "refund"];
  if (needEnrollment.includes(r.type) && !r.enrollmentId) e.push("Chọn lớp (ghi danh) liên quan");
  if (r.type === "absence" && !r.sessionId) e.push("Chọn buổi xin nghỉ");
  if (r.type === "makeup" && !r.missedSessionId) e.push("Chọn buổi đã vắng cần học bù");
  if (r.type === "pause") {
    if (!r.dateFrom || !r.dateTo) e.push("Nhập thời gian bảo lưu");
    else {
      if (r.dateTo <= r.dateFrom) e.push("Ngày học lại phải sau ngày bắt đầu bảo lưu");
      if (r.dateFrom < addDays(today, -7)) e.push("Ngày bắt đầu bảo lưu quá xa trong quá khứ");
    }
  }
  return e;
}

export function slaDue(createdAt: Date, type: ParentRequestType): Date {
  return new Date(createdAt.getTime() + PARENT_REQUEST_SLA_HOURS[type] * 3600e3);
}

export function slaState(dueAt: Date, now: Date, status: ParentRequestStatus): { overdue: boolean; minutesLeft: number | null } {
  if (!OPEN_REQUEST_STATUSES.includes(status) || status === "approved") return { overdue: false, minutesLeft: null };
  const m = Math.round((dueAt.getTime() - now.getTime()) / 60000);
  return { overdue: m < 0, minutesLeft: m };
}

export const requestCode = (year: number, seq: number) => `YC${String(year % 100).padStart(2, "0")}-${String(seq).padStart(5, "0")}`;

/* ------------------------------------------------------------------ */
/* Đánh giá                                                            */
/* ------------------------------------------------------------------ */

export const FEEDBACK_TAGS = ["teacher", "content", "facility", "schedule", "communication", "price", "result"] as const;
export type FeedbackTag = (typeof FEEDBACK_TAGS)[number];
export const FEEDBACK_TAG_VI: Record<FeedbackTag, string> = { teacher: "Giáo viên", content: "Nội dung bài", facility: "Cơ sở vật chất", schedule: "Lịch học", communication: "Liên lạc / thông tin", price: "Học phí", result: "Tiến bộ của con" };
export const FEEDBACK_STATUSES = ["new", "acknowledged", "resolved"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export const FEEDBACK_STATUS_VI: Record<FeedbackStatus, string> = { new: "Mới", acknowledged: "Đã tiếp nhận", resolved: "Đã phản hồi" };

export function feedbackPriority(rating: number, teacherRating?: number | null): "urgent" | "follow_up" | "normal" {
  const min = Math.min(rating, teacherRating ?? 5);
  return min <= 2 ? "urgent" : min === 3 ? "follow_up" : "normal";
}

export function validateFeedback(f: { rating: number; teacherRating?: number | null; comment?: string | null; tags?: string[] }): string[] {
  const e: string[] = [];
  const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= 5;
  if (!ok(f.rating)) e.push("Điểm hài lòng 1–5");
  if (f.teacherRating != null && !ok(f.teacherRating)) e.push("Điểm giáo viên 1–5");
  if (feedbackPriority(f.rating, f.teacherRating) !== "normal" && (f.comment ?? "").trim().length < 5) e.push("Đánh giá thấp cần ghi rõ ý kiến phụ huynh");
  if ((f.tags ?? []).some((t) => !(FEEDBACK_TAGS as readonly string[]).includes(t))) e.push("Nhãn không hợp lệ");
  return e;
}

export function ratingStats(values: readonly number[]): { count: number; avg: number | null; dist: number[] } {
  const dist = [0, 0, 0, 0, 0];
  for (const v of values) if (v >= 1 && v <= 5) dist[v - 1]!++;
  const count = dist.reduce((s, x) => s + x, 0);
  const avg = count ? Math.round((values.filter((v) => v >= 1 && v <= 5).reduce((s, v) => s + v, 0) / count) * 100) / 100 : null;
  return { count, avg, dist };
}

/* ------------------------------------------------------------------ */
/* Khảo sát / NPS                                                      */
/* ------------------------------------------------------------------ */

export const QUESTION_TYPES = ["nps", "rating", "choice", "text"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const QUESTION_TYPE_VI: Record<QuestionType, string> = { nps: "NPS 0–10", rating: "Sao 1–5", choice: "Chọn một", text: "Ý kiến" };

export interface SurveyQuestion {
  id: string;
  type: QuestionType;
  label: string;
  required: boolean;
  options?: string[];
}

export const SURVEY_TRIGGERS = ["manual", "session_n", "course_end"] as const;
export type SurveyTrigger = (typeof SURVEY_TRIGGERS)[number];
export const SURVEY_TRIGGER_VI: Record<SurveyTrigger, string> = { manual: "Gửi thủ công", session_n: "Sau buổi thứ N", course_end: "Khi hoàn thành khoá" };
export const SURVEY_STATUSES = ["draft", "active", "closed"] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];
export const SURVEY_STATUS_VI: Record<SurveyStatus, string> = { draft: "Nháp", active: "Đang chạy", closed: "Đã đóng" };
export const INVITE_TTL_DAYS = 14;

export function validateSurvey(s: { title: string; trigger: SurveyTrigger; triggerValue?: number | null; questions: SurveyQuestion[] }): string[] {
  const e: string[] = [];
  if (s.title.trim().length < 3) e.push("Tiêu đề tối thiểu 3 ký tự");
  if (!s.questions.length) e.push("Cần ít nhất 1 câu hỏi");
  if (s.questions.length > 15) e.push("Tối đa 15 câu hỏi");
  if (s.questions.filter((q) => q.type === "nps").length > 1) e.push("Chỉ một câu NPS mỗi khảo sát");
  const ids = new Set<string>();
  s.questions.forEach((q, i) => {
    if (ids.has(q.id)) e.push(`Câu ${i + 1}: trùng mã`);
    ids.add(q.id);
    if (q.label.trim().length < 3) e.push(`Câu ${i + 1}: nội dung tối thiểu 3 ký tự`);
    if (q.type === "choice") {
      const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) e.push(`Câu ${i + 1}: cần ít nhất 2 lựa chọn`);
      if (new Set(opts).size !== opts.length) e.push(`Câu ${i + 1}: lựa chọn bị trùng`);
    }
  });
  if (s.trigger === "session_n" && (!s.triggerValue || s.triggerValue < 1 || s.triggerValue > 200)) e.push("Nhập số buổi N (1–200)");
  return e;
}

export type SurveyAnswers = Record<string, string | number | null>;

export function validateAnswers(questions: readonly SurveyQuestion[], a: SurveyAnswers): { errors: string[]; clean: SurveyAnswers; nps: number | null } {
  const errors: string[] = [];
  const clean: SurveyAnswers = {};
  let nps: number | null = null;
  questions.forEach((q, i) => {
    const v = a[q.id];
    const empty = v === undefined || v === null || (typeof v === "string" && v.trim() === "");
    if (empty) {
      if (q.required) errors.push(`Câu ${i + 1} bắt buộc`);
      clean[q.id] = null;
      return;
    }
    const n = Number(v);
    switch (q.type) {
      case "nps":
        if (!Number.isInteger(n) || n < 0 || n > 10) errors.push(`Câu ${i + 1}: chọn 0–10`);
        else { clean[q.id] = n; nps = n; }
        break;
      case "rating":
        if (!Number.isInteger(n) || n < 1 || n > 5) errors.push(`Câu ${i + 1}: chọn 1–5 sao`);
        else clean[q.id] = n;
        break;
      case "choice":
        if (!(q.options ?? []).includes(String(v))) errors.push(`Câu ${i + 1}: lựa chọn không hợp lệ`);
        else clean[q.id] = String(v);
        break;
      case "text":
        clean[q.id] = String(v).trim().slice(0, 2000);
        break;
    }
  });
  return { errors, clean, nps };
}

export type NpsGroup = "promoter" | "passive" | "detractor";
export const npsGroup = (n: number): NpsGroup => (n >= 9 ? "promoter" : n >= 7 ? "passive" : "detractor");

export function npsScore(values: readonly number[]): { count: number; promoters: number; passives: number; detractors: number; nps: number | null } {
  const v = values.filter((x) => Number.isInteger(x) && x >= 0 && x <= 10);
  const p = v.filter((x) => x >= 9).length;
  const d = v.filter((x) => x <= 6).length;
  return { count: v.length, promoters: p, passives: v.length - p - d, detractors: d, nps: v.length ? Math.round(((p - d) / v.length) * 100) : null };
}

/* ------------------------------------------------------------------ */
/* Thông báo                                                           */
/* ------------------------------------------------------------------ */

export const TEMPLATE_VARS = ["ten_ph", "ten_hv", "lop", "co_so"] as const;

/** Thay {bien} trong mẫu; trả danh sách biến không có dữ liệu */
export function renderTemplate(tpl: string, params: Record<string, string | null | undefined>): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const text = tpl.replace(/\{([a-z_]+)\}/g, (_, k: string) => {
    const v = params[k];
    if (v == null || v === "") { missing.add(k); return ""; }
    return v;
  });
  return { text: text.replace(/[ \t]{2,}/g, " ").trim(), missing: [...missing] };
}

export function unknownVars(tpl: string): string[] {
  return [...new Set([...tpl.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]!))].filter((k) => !(TEMPLATE_VARS as readonly string[]).includes(k));
}

export const BROADCAST_CHANNELS = ["in_app", "zns"] as const;
export type BroadcastChannel = (typeof BROADCAST_CHANNELS)[number];

/* ------------------------------------------------------------------ */
/* Sinh nhật                                                           */
/* ------------------------------------------------------------------ */

/** Lần sinh nhật kế tiếp tính từ `from` (29/2 → 28/2 năm không nhuận) */
export function nextBirthday(dob: string, from: string): { date: string; age: number; daysUntil: number } {
  const y0 = Number(from.slice(0, 4));
  const md = dob.slice(5);
  const on = (y: number) => {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return `${y}-${md === "02-29" && !leap ? "02-28" : md}`;
  };
  let d = on(y0);
  if (d < from) d = on(y0 + 1);
  const age = Number(d.slice(0, 4)) - Number(dob.slice(0, 4));
  const daysUntil = Math.round((parseISODate(d).getTime() - parseISODate(from).getTime()) / 86400000);
  return { date: d, age, daysUntil };
}

export const DEFAULT_BIRTHDAY_TEMPLATE = "Sata Robo chúc mừng sinh nhật {ten_hv}! Chúc con tuổi mới luôn vui khoẻ, sáng tạo và học thật giỏi. Thân mến gửi {ten_ph}.";
