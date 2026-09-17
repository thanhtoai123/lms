/**
 * Website / tin tức, tracking marketing, cohort / churn, tuân thủ dữ liệu (NĐ13/2023) — quy tắc thuần.
 */

export class GrowthRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GrowthRuleError";
  }
}
const fail = (m: string): never => { throw new GrowthRuleError(m); };

/* ------------------------------------------------------------------ */
/* Tin tức                                                              */
/* ------------------------------------------------------------------ */

export const POST_STATUSES = ["draft", "scheduled", "published", "archived"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];
export const POST_STATUS_VI: Record<PostStatus, string> = { draft: "Nháp", scheduled: "Hẹn giờ", published: "Đã đăng", archived: "Gỡ xuống" };
export const POST_CATEGORIES = ["news", "event", "story", "tips", "promotion"] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number];
export const POST_CATEGORY_VI: Record<PostCategory, string> = { news: "Tin tức", event: "Sự kiện", story: "Câu chuyện học viên", tips: "Góc phụ huynh", promotion: "Ưu đãi" };

export function slugify(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export function validatePost(x: { title: string; slug: string; excerpt?: string | null; body: string; seoTitle?: string | null; seoDescription?: string | null }): string[] {
  const e: string[] = [];
  if (x.title.trim().length < 10) e.push("Tiêu đề tối thiểu 10 ký tự");
  if (x.title.length > 150) e.push("Tiêu đề tối đa 150 ký tự");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(x.slug) || x.slug.length < 3) e.push("Đường dẫn (slug) chỉ gồm chữ thường không dấu, số và dấu -");
  if ((x.excerpt ?? "").length > 300) e.push("Tóm tắt tối đa 300 ký tự");
  if (x.body.trim().length < 50) e.push("Nội dung tối thiểu 50 ký tự");
  if (x.body.length > 100_000) e.push("Nội dung quá dài");
  if ((x.seoTitle ?? "").length > 70) e.push("Tiêu đề SEO tối đa 70 ký tự");
  if ((x.seoDescription ?? "").length > 170) e.push("Mô tả SEO tối đa 170 ký tự");
  return e;
}

export type PostAction = "publish" | "schedule" | "unpublish" | "archive" | "restore";
export function postTransition(from: PostStatus, action: PostAction, opts: { publishAt?: Date | null; now: Date }): PostStatus {
  switch (action) {
    case "publish":
      if (from === "published") fail("Bài đã đăng");
      if (from === "archived") fail("Bài đã gỡ — khôi phục về nháp trước");
      return "published";
    case "schedule":
      if (from !== "draft" && from !== "scheduled") fail("Chỉ hẹn giờ cho bài nháp");
      if (!opts.publishAt || opts.publishAt.getTime() <= opts.now.getTime() + 5 * 60_000) fail("Giờ đăng phải sau hiện tại ít nhất 5 phút");
      if (opts.publishAt!.getTime() > opts.now.getTime() + 90 * 86_400_000) fail("Hẹn giờ tối đa 90 ngày");
      return "scheduled";
    case "unpublish":
      if (from !== "published" && from !== "scheduled") fail("Bài chưa đăng");
      return "draft";
    case "archive":
      if (from === "archived") fail("Bài đã gỡ");
      return "archived";
    case "restore":
      if (from !== "archived") fail("Chỉ khôi phục bài đã gỡ");
      return "draft";
  }
}

export function readingMinutes(body: string): number {
  const words = body.replace(/[#>*_`\[\]()!-]/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Markdown tối giản → HTML an toàn (mọi thẻ HTML gốc bị escape; link chỉ http/https hoặc đường dẫn nội bộ) */
export function renderMarkdown(md: string, opts: { imageUrl?: (src: string) => string | null } = {}): string {
  const safeUrl = (u: string) => (/^(https?:\/\/|\/)[^\s"'<>]*$/i.test(u) && !/^\/\//.test(u) ? u : null);
  const inline = (raw: string) => {
    let s = esc(raw);
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, src: string) => {
      const url = opts.imageUrl ? opts.imageUrl(src.replace(/&amp;/g, "&")) : safeUrl(src.replace(/&amp;/g, "&"));
      return url ? `<img src="${esc(url)}" alt="${alt}" loading="lazy" />` : "";
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, href: string) => {
      const url = safeUrl(href.replace(/&amp;/g, "&"));
      return url ? `<a href="${esc(url)}"${url.startsWith("/") ? "" : ' rel="noopener nofollow" target="_blank"'}>${text}</a>` : text;
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
    return s;
  };
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${para.map(inline).join("<br />")}</p>`);
    para = [];
  };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of md.replace(/\r\n?/g, "\n").split("\n")) {
    const t = line.trimEnd();
    let m: RegExpExecArray | null;
    if (!t.trim()) { flush(); closeList(); continue; }
    if ((m = /^(#{2,4})\s+(.+)$/.exec(t))) { flush(); closeList(); const n = m[1]!.length; out.push(`<h${n}>${inline(m[2]!)}</h${n}>`); continue; }
    if ((m = /^[-*]\s+(.+)$/.exec(t))) { flush(); if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(m[1]!)}</li>`); continue; }
    if ((m = /^\d+[.)]\s+(.+)$/.exec(t))) { flush(); if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(m[1]!)}</li>`); continue; }
    if ((m = /^>\s?(.*)$/.exec(t))) { flush(); closeList(); out.push(`<blockquote>${inline(m[1]!)}</blockquote>`); continue; }
    closeList();
    para.push(t);
  }
  flush();
  closeList();
  return out.join("\n");
}

/* ------------------------------------------------------------------ */
/* Nội dung website                                                     */
/* ------------------------------------------------------------------ */

export type BlockField = { key: string; label: string; type: "text" | "textarea" | "image" | "url"; max: number; required?: boolean };
export const SITE_PAGES: Record<string, { label: string; path: string; fields: BlockField[] }> = {
  home: { label: "Trang chủ", path: "/", fields: [
    { key: "heroTitle", label: "Tiêu đề lớn", type: "text", max: 120, required: true },
    { key: "heroSubtitle", label: "Mô tả ngắn", type: "textarea", max: 300 },
    { key: "heroImage", label: "Ảnh bìa", type: "image", max: 500 },
    { key: "ctaLabel", label: "Nút kêu gọi", type: "text", max: 40, required: true },
    { key: "ctaUrl", label: "Liên kết nút", type: "url", max: 300, required: true },
  ] },
  about: { label: "Giới thiệu", path: "/gioi-thieu", fields: [
    { key: "title", label: "Tiêu đề", type: "text", max: 120, required: true },
    { key: "body", label: "Nội dung (markdown)", type: "textarea", max: 10000, required: true },
    { key: "image", label: "Ảnh", type: "image", max: 500 },
  ] },
  courses: { label: "Khoá học", path: "/khoa-hoc", fields: [
    { key: "title", label: "Tiêu đề", type: "text", max: 120, required: true },
    { key: "intro", label: "Giới thiệu", type: "textarea", max: 1000 },
    { key: "banner", label: "Ảnh banner", type: "image", max: 500 },
  ] },
  contact: { label: "Liên hệ", path: "/lien-he", fields: [
    { key: "title", label: "Tiêu đề", type: "text", max: 120, required: true },
    { key: "mapUrl", label: "Link bản đồ", type: "url", max: 500 },
    { key: "note", label: "Ghi chú giờ làm việc", type: "textarea", max: 500 },
  ] },
  register: { label: "Đăng ký học thử", path: "/dang-ky", fields: [
    { key: "title", label: "Tiêu đề", type: "text", max: 120, required: true },
    { key: "subtitle", label: "Mô tả", type: "textarea", max: 300 },
    { key: "thankYou", label: "Lời cảm ơn sau khi gửi", type: "textarea", max: 300, required: true },
  ] },
};
export type SitePageKey = keyof typeof SITE_PAGES;
export const SITE_PAGE_KEYS = Object.keys(SITE_PAGES) as SitePageKey[];

export function validateSiteBlock(page: string, data: Record<string, string>): string[] {
  const def = SITE_PAGES[page];
  if (!def) return ["Trang không tồn tại"];
  const e: string[] = [];
  for (const f of def.fields) {
    const v = (data[f.key] ?? "").trim();
    if (f.required && !v) e.push(`${f.label}: bắt buộc`);
    if (v.length > f.max) e.push(`${f.label}: tối đa ${f.max} ký tự`);
    if (v && f.type === "url" && !/^(https:\/\/|\/)[^\s]*$/.test(v)) e.push(`${f.label}: phải là https:// hoặc đường dẫn nội bộ`);
    if (v && f.type === "image" && !/^(\/api\/public\/site-media\/[A-Za-z0-9._-]+|https:\/\/[^\s]+)$/.test(v)) e.push(`${f.label}: ảnh không hợp lệ`);
  }
  const unknown = Object.keys(data).filter((k) => !def.fields.some((f) => f.key === k));
  if (unknown.length) e.push(`Trường không hợp lệ: ${unknown.join(", ")}`);
  return e;
}

/* ------------------------------------------------------------------ */
/* Tracking & chiến dịch                                                */
/* ------------------------------------------------------------------ */

export const TRACK_EVENTS = ["page_view", "form_view", "form_start", "form_submit", "cta_click"] as const;
export type TrackEvent = (typeof TRACK_EVENTS)[number];
export const CHANNELS = ["facebook", "google", "tiktok", "zalo", "referral", "organic", "offline", "other"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_VI: Record<Channel, string> = { facebook: "Facebook / Meta", google: "Google", tiktok: "TikTok", zalo: "Zalo", referral: "Giới thiệu", organic: "Tự nhiên / SEO", offline: "Offline / sự kiện", other: "Khác" };

export function normUtm(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_.-]/g, "").slice(0, 80);
  return s || null;
}

/** Suy ra kênh từ utm_source / nguồn lead */
export function channelOf(utmSource: string | null | undefined, source: string | null | undefined): Channel {
  const s = `${utmSource ?? ""} ${source ?? ""}`.toLowerCase();
  if (/facebook|fb|meta|instagram|ig\b/.test(s)) return "facebook";
  if (/google|gg|adwords|youtube/.test(s)) return "google";
  if (/tiktok/.test(s)) return "tiktok";
  if (/zalo/.test(s)) return "zalo";
  if (/referral|gioi[-_ ]?thieu|affiliate/.test(s)) return "referral";
  if (/walk|offline|event|su[-_ ]?kien|hotline/.test(s)) return "offline";
  if (/organic|seo|web|direct/.test(s)) return "organic";
  return "other";
}

export function validateCampaign(x: { name: string; utmCampaign: string; channel: Channel; budget: number; startDate: string; endDate?: string | null }): string[] {
  const e: string[] = [];
  if (x.name.trim().length < 3) e.push("Tên chiến dịch tối thiểu 3 ký tự");
  if (!/^[a-z0-9_.-]{3,80}$/.test(x.utmCampaign)) e.push("utm_campaign 3–80 ký tự: chữ thường, số, _ . -");
  if (!Number.isInteger(x.budget) || x.budget < 0) e.push("Ngân sách là số nguyên ≥ 0");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x.startDate)) e.push("Ngày bắt đầu không hợp lệ");
  if (x.endDate && x.endDate < x.startDate) e.push("Ngày kết thúc trước ngày bắt đầu");
  return e;
}

/** Chỉ số hiệu quả chiến dịch */
export function campaignMetrics(x: { spend: number; visits: number; leads: number; trials: number; enrolled: number; revenue: number }) {
  const r = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
  const d = (a: number, b: number) => (b > 0 ? Math.round(a / b) : null);
  return {
    cvr: r(x.leads, x.visits), trialRate: r(x.trials, x.leads), closeRate: r(x.enrolled, x.leads),
    cpl: d(x.spend, x.leads), cpa: d(x.spend, x.enrolled),
    roas: x.spend > 0 ? Math.round((x.revenue / x.spend) * 100) / 100 : null,
  };
}

export function buildUtmUrl(base: string, p: { source: string; medium: string; campaign: string; content?: string | null }): string {
  if (!/^https:\/\/[^\s]+$/.test(base)) fail("Địa chỉ trang đích phải bắt đầu bằng https://");
  const u = new URL(base);
  u.searchParams.set("utm_source", normUtm(p.source) ?? "");
  u.searchParams.set("utm_medium", normUtm(p.medium) ?? "");
  u.searchParams.set("utm_campaign", normUtm(p.campaign) ?? "");
  if (p.content) u.searchParams.set("utm_content", normUtm(p.content) ?? "");
  return u.toString();
}

/** Mã định danh ẩn danh: chỉ chấp nhận chuỗi ngẫu nhiên, không chứa thông tin cá nhân */
export function validAnonId(v: string | null | undefined): boolean {
  return !!v && /^[A-Za-z0-9_-]{16,64}$/.test(v) && !/\d{9,}/.test(v);
}

/* ------------------------------------------------------------------ */
/* Cohort & churn                                                       */
/* ------------------------------------------------------------------ */

export type EnrollmentOutcome = "active" | "paused" | "completed" | "withdrawn" | "transferred" | "trial";
export function cohortRow(rows: { status: EnrollmentOutcome }[]) {
  const n = rows.length;
  const c = (s: EnrollmentOutcome) => rows.filter((r) => r.status === s).length;
  const pct = (a: number) => (n ? Math.round((a / n) * 100) : 0);
  const completed = c("completed"), withdrawn = c("withdrawn"), active = c("active") + c("trial"), paused = c("paused"), transferred = c("transferred");
  return { size: n, completed, withdrawn, active, paused, transferred, completionRate: pct(completed), withdrawRate: pct(withdrawn), retention: pct(completed + active + paused + transferred) };
}

/** Churn tháng = rời trong tháng / số đang học đầu tháng */
export function churnRate(activeAtStart: number, left: number): number {
  return activeAtStart > 0 ? Math.round((left / activeAtStart) * 1000) / 10 : 0;
}

export const WITHDRAW_REASON_GROUPS: { key: string; label: string; pattern: RegExp }[] = [
  { key: "finance", label: "Tài chính / học phí", pattern: /tiền|học phí|tai chinh|chi phí|kinh tế/i },
  { key: "schedule", label: "Lịch học / đi lại", pattern: /lịch|giờ|xa|đi lại|chuyển nhà|bận/i },
  { key: "quality", label: "Chất lượng / giáo viên", pattern: /giáo viên|chất lượng|không hài lòng|chán|khó/i },
  { key: "health", label: "Sức khoẻ / gia đình", pattern: /ốm|sức khoẻ|gia đình|đi xa|về quê/i },
  { key: "other_activity", label: "Chuyển hoạt động khác", pattern: /môn khác|học thêm|thi|ôn/i },
];
export function withdrawReasonGroup(reason: string | null | undefined): string {
  const r = reason ?? "";
  return WITHDRAW_REASON_GROUPS.find((g) => g.pattern.test(r))?.key ?? "other";
}

/* ------------------------------------------------------------------ */
/* Tuân thủ dữ liệu (Luật BVDLCN 2025, NĐ 356/2025/NĐ-CP từ 01/01/2026) */
/* ------------------------------------------------------------------ */

export const DSR_TYPES = ["access", "rectify", "delete", "withdraw_consent", "restrict", "object"] as const;
export type DsrType = (typeof DSR_TYPES)[number];
export const DSR_TYPE_VI: Record<DsrType, string> = {
  access: "Xem / nhận bản sao dữ liệu", rectify: "Chỉnh sửa dữ liệu", delete: "Xoá dữ liệu", withdraw_consent: "Rút lại sự đồng ý",
  restrict: "Hạn chế xử lý", object: "Phản đối xử lý (tiếp thị)",
};
/**
 * Thời hạn thực hiện (ngày) theo NĐ 356/2025: xem / cung cấp / chỉnh sửa 10 ngày; rút đồng ý / hạn chế / phản đối 15 ngày;
 * xoá 20 ngày; được gia hạn 1 lần tối đa bằng thời hạn ban đầu. Phản hồi tiếp nhận trong 2 ngày làm việc.
 */
export const DSR_SLA_DAYS: Record<DsrType, number> = { access: 10, rectify: 10, withdraw_consent: 15, restrict: 15, object: 15, delete: 20 };
export const DSR_ACK_BUSINESS_DAYS = 2;
export const DSR_STATUSES = ["received", "verifying", "in_progress", "completed", "rejected"] as const;
export type DsrStatus = (typeof DSR_STATUSES)[number];
export const DSR_STATUS_VI: Record<DsrStatus, string> = { received: "Mới nhận", verifying: "Xác minh danh tính", in_progress: "Đang xử lý", completed: "Hoàn tất", rejected: "Từ chối" };
export type DsrAction = "verify" | "start" | "complete" | "reject";
export const SUBJECT_TYPES = ["lead", "parent"] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

export function dsrTransition(from: DsrStatus, action: DsrAction): DsrStatus {
  const map: Record<DsrStatus, Partial<Record<DsrAction, DsrStatus>>> = {
    received: { verify: "verifying", start: "in_progress", reject: "rejected" },
    verifying: { start: "in_progress", reject: "rejected" },
    in_progress: { complete: "completed", reject: "rejected" },
    completed: {},
    rejected: {},
  };
  return map[from][action] ?? fail(`Yêu cầu "${DSR_STATUS_VI[from]}" không thể ${action}`);
}

const DAY = 86_400_000;
export function dsrDue(type: DsrType, receivedAt: Date, extended = false): Date {
  return new Date(receivedAt.getTime() + DSR_SLA_DAYS[type] * (extended ? 2 : 1) * DAY);
}
/** Hạn phản hồi tiếp nhận: +2 ngày làm việc (bỏ thứ 7, CN theo giờ Việt Nam) */
export function dsrAckDue(receivedAt: Date): Date {
  let t = receivedAt.getTime();
  let left = DSR_ACK_BUSINESS_DAYS;
  while (left > 0) {
    t += DAY;
    const wd = new Date(t + 7 * 3_600_000).getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return new Date(t);
}
/** Gia hạn: 1 lần, khi yêu cầu còn mở, có lý do */
export function dsrCanExtend(x: { status: DsrStatus; extendedAt: Date | null; reason: string }): string[] {
  const e: string[] = [];
  if (x.status === "completed" || x.status === "rejected") e.push("Yêu cầu đã đóng");
  if (x.extendedAt) e.push("Chỉ được gia hạn 1 lần");
  if (x.reason.trim().length < 10) e.push("Ghi lý do gia hạn (≥ 10 ký tự) — thông báo cho người yêu cầu");
  return e;
}
export function dsrSlaState(due: Date, status: DsrStatus, now: Date): "done" | "overdue" | "due_soon" | "ok" {
  if (status === "completed" || status === "rejected") return "done";
  const left = due.getTime() - now.getTime();
  if (left < 0) return "overdue";
  if (left < 2 * DAY) return "due_soon";
  return "ok";
}

/* Sự cố / vi phạm dữ liệu cá nhân: thông báo cơ quan chuyên trách (A05) trong 72 giờ */
export const INCIDENT_NOTIFY_HOURS = 72;
export const INCIDENT_SEVERITIES = ["low", "medium", "high"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];
export const INCIDENT_SEVERITY_VI: Record<IncidentSeverity, string> = { low: "Thấp", medium: "Trung bình", high: "Nghiêm trọng" };
export const INCIDENT_STATUSES = ["open", "contained", "closed"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export const INCIDENT_STATUS_VI: Record<IncidentStatus, string> = { open: "Đang xử lý", contained: "Đã khoanh vùng", closed: "Đã đóng" };
export function incidentNotifyDue(detectedAt: Date): Date {
  return new Date(detectedAt.getTime() + INCIDENT_NOTIFY_HOURS * 3_600_000);
}
export function validateIncident(x: { title: string; description: string; severity: IncidentSeverity; detectedAt: Date; affectedCount: number; now: Date }): string[] {
  const e: string[] = [];
  if (x.title.trim().length < 5) e.push("Tiêu đề tối thiểu 5 ký tự");
  if (x.description.trim().length < 20) e.push("Mô tả sự cố tối thiểu 20 ký tự (điều gì xảy ra, dữ liệu nào)");
  if (!INCIDENT_SEVERITIES.includes(x.severity)) e.push("Mức độ không hợp lệ");
  if (x.detectedAt.getTime() > x.now.getTime() + 60_000) e.push("Thời điểm phát hiện ở tương lai");
  if (!Number.isInteger(x.affectedCount) || x.affectedCount < 0) e.push("Số người bị ảnh hưởng là số nguyên ≥ 0");
  return e;
}
/** Đóng sự cố: mức trung bình / nghiêm trọng phải có thời điểm đã thông báo; mức thấp phải ghi lý do không thông báo */
export function incidentCloseCheck(x: { severity: IncidentSeverity; notifiedAuthorityAt: Date | null; containment: string | null; noNotifyReason: string | null }): string[] {
  const e: string[] = [];
  if (!x.containment || x.containment.trim().length < 10) e.push("Ghi biện pháp khắc phục (≥ 10 ký tự)");
  if (x.severity !== "low" && !x.notifiedAuthorityAt) e.push("Sự cố mức trung bình / nghiêm trọng phải ghi nhận đã thông báo cơ quan chuyên trách");
  if (x.severity === "low" && !x.notifiedAuthorityAt && (!x.noNotifyReason || x.noNotifyReason.trim().length < 10)) e.push("Ghi lý do không thông báo (≥ 10 ký tự)");
  return e;
}
export function incidentCode(year: number, seq: number): string {
  return `SC-DL${String(year).slice(-2)}-${String(seq).padStart(3, "0")}`;
}

/** Có được xoá (ẩn danh hoá) không — nghĩa vụ lưu giữ chứng từ kế toán thắng yêu cầu xoá */
export function erasureDecision(x: { subjectType: SubjectType; hasFinancialRecords: boolean; hasActiveEnrollment: boolean; hasOpenDebt: boolean }): { allowed: boolean; mode: "anonymize" | "partial" | "none"; reasons: string[] } {
  const reasons: string[] = [];
  if (x.hasActiveEnrollment) reasons.push("Học viên đang học — cần kết thúc ghi danh trước");
  if (x.hasOpenDebt) reasons.push("Còn công nợ chưa thanh toán / hoàn tất");
  if (reasons.length) return { allowed: false, mode: "none", reasons };
  if (x.hasFinancialRecords) return { allowed: true, mode: "partial", reasons: ["Chứng từ kế toán phải lưu 10 năm (Luật Kế toán) — chỉ ẩn danh thông tin liên hệ, giữ tên trên chứng từ"] };
  return { allowed: true, mode: "anonymize", reasons: [] };
}

export function validateDsr(x: { type: DsrType; requesterName: string; requesterPhone: string; details: string; channel: string }): string[] {
  const e: string[] = [];
  if (x.requesterName.trim().length < 2) e.push("Tên người yêu cầu tối thiểu 2 ký tự");
  if (!/^0\d{9,10}$/.test(x.requesterPhone.replace(/\D/g, ""))) e.push("Số điện thoại người yêu cầu không hợp lệ");
  if (x.details.trim().length < 10) e.push("Nội dung yêu cầu tối thiểu 10 ký tự");
  if (!["phone", "email", "zalo", "in_person", "letter", "web"].includes(x.channel)) e.push("Kênh tiếp nhận không hợp lệ");
  return e;
}

export const CONSENT_PURPOSES = ["service", "marketing", "media"] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];
export const CONSENT_PURPOSE_VI: Record<ConsentPurpose, string> = { service: "Cung cấp dịch vụ học tập", marketing: "Nhận thông tin tiếp thị", media: "Đăng ảnh / video của con" };
export const CONSENT_TEXT_VERSION = "2026-01";

/** Hạn lưu dữ liệu lead không chuyển đổi (tháng) → quá hạn thì ẩn danh hoá */
export const LEAD_RETENTION_MONTHS = 24;
export function retentionCutoff(today: string, months: number): string {
  if (!Number.isInteger(months) || months < 6 || months > 120) fail("Thời hạn lưu 6–120 tháng");
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1 - months, 1));
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** Giá trị thay thế khi ẩn danh hoá */
export function anonymizedPhone(id: string): string {
  return `000${id.replace(/-/g, "").slice(0, 7)}`;
}
export const ANON_NAME = "[Đã ẩn danh]";

export function dsrCode(year: number, seq: number): string {
  return `YC-DL${String(year).slice(-2)}-${String(seq).padStart(4, "0")}`;
}
