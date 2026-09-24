/**
 * Hệ thống: mẫu email, OTP, webhook, cài đặt, tổ chức, mục tiêu doanh thu — quy tắc thuần.
 */

export class SystemRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SystemRuleError";
  }
}

/* ------------------------------------------------------------------ */
/* Email                                                               */
/* ------------------------------------------------------------------ */

export interface EmailEventDef {
  label: string;
  vars: readonly string[];
  subject: string;
  body: string;
}

export const EMAIL_EVENTS = {
  STAFF_WELCOME: {
    label: "Chào mừng nhân sự mới",
    vars: ["ten", "email", "link"],
    subject: "Chào mừng {ten} đến với Sata Robo",
    body: "Xin chào {ten},\n\nTài khoản quản trị của bạn đã được tạo với email {email}.\nĐặt mật khẩu và đăng nhập tại (liên kết dùng một lần, hết hạn sau 1 giờ): {link}\n\nTrân trọng,\nSata Robo",
  },
  PASSWORD_RESET: {
    label: "Đặt lại mật khẩu",
    vars: ["ten", "link", "het_han"],
    subject: "Đặt lại mật khẩu Sata Robo",
    body: "Xin chào {ten},\n\nBấm vào liên kết sau để đặt lại mật khẩu (hết hạn {het_han}):\n{link}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.",
  },
  RECEIPT_ISSUED: {
    label: "Phiếu thu đã xác nhận",
    vars: ["ten_ph", "so_phieu", "so_tien", "ma_don", "co_so"],
    subject: "Sata Robo xác nhận thanh toán {so_phieu}",
    body: "Kính gửi {ten_ph},\n\nSata Robo {co_so} đã nhận {so_tien} cho đơn {ma_don} (phiếu thu {so_phieu}).\nCảm ơn anh/chị đã đồng hành cùng bé!\n\nSata Robo",
  },
  INVOICE_ISSUED: {
    label: "Hoá đơn điện tử đã phát hành",
    vars: ["ten_ph", "so_hd", "ky_hieu", "so_tien", "ma_tra_cuu", "link"],
    subject: "Sata Robo gửi hoá đơn điện tử số {so_hd}",
    body: "Kính gửi {ten_ph},\n\nSata Robo gửi anh/chị hoá đơn điện tử ký hiệu {ky_hieu} số {so_hd}, tổng tiền {so_tien}.\nMã tra cứu: {ma_tra_cuu}\nTra cứu tại: {link}\n\nSata Robo",
  },
  ORDER_CREATED: {
    label: "Gửi đơn hàng cho khách",
    vars: ["ten_ph", "ma_don", "so_tien", "con", "co_so", "han_dau", "link"],
    subject: "Sata Robo gửi đơn hàng {ma_don}",
    body: "Kính gửi {ten_ph},\n\nSata Robo {co_so} gửi anh/chị đơn hàng {ma_don} cho {con}, tổng tiền {so_tien}.\nHạn đóng đợt đầu: {han_dau}.\nXem chi tiết và mã QR chuyển khoản: {link}\n\nSata Robo",
  },
  PARENT_ACTIVATION: {
    label: "Mã kích hoạt tài khoản phụ huynh",
    vars: ["ten_ph", "ma", "het_han", "link"],
    subject: "Mã kích hoạt tài khoản phụ huynh Sata Robo",
    body: "Kính gửi {ten_ph},\n\nMã kích hoạt tài khoản phụ huynh của anh/chị là {ma} (hết hạn {het_han}).\nVào {link}, nhập số điện thoại và mã này để đặt mật khẩu.\n\nSata Robo",
  },
  TUITION_REMINDER: {
    label: "Nhắc học phí",
    vars: ["ten_ph", "ten_hv", "so_tien", "han", "ma_don"],
    subject: "Nhắc lịch đóng học phí của bé {ten_hv}",
    body: "Kính gửi {ten_ph},\n\nKỳ học phí {so_tien} của bé {ten_hv} (đơn {ma_don}) đến hạn ngày {han}.\nAnh/chị có thể chuyển khoản với nội dung mã đơn để được xác nhận tự động.\n\nSata Robo",
  },
  REPORT_CARD_READY: {
    label: "Học bạ đã có",
    vars: ["ten_ph", "ten_hv", "lop", "link"],
    subject: "Học bạ của bé {ten_hv} đã sẵn sàng",
    body: "Kính gửi {ten_ph},\n\nHọc bạ kỳ này của bé {ten_hv} (lớp {lop}) đã được giáo viên hoàn thành.\nXem chi tiết: {link}\n\nSata Robo",
  },
  SURVEY_INVITE: {
    label: "Mời khảo sát",
    vars: ["ten_ph", "ten_hv", "link"],
    subject: "Sata Robo mong nhận góp ý của anh/chị",
    body: "Kính gửi {ten_ph},\n\nAnh/chị dành 1 phút góp ý về việc học của bé {ten_hv} nhé:\n{link}\n\nCảm ơn anh/chị!",
  },
  TRIAL_REPORT_PUBLISHED: {
    label: "Gửi phiếu đánh giá buổi học thử",
    vars: ["ten_ph", "ten_be", "link", "co_so"],
    subject: "Kết quả buổi học thử của bé {ten_be} tại Sata Robo",
    body: "Kính gửi {ten_ph},\n\nCảm ơn anh/chị đã cho bé {ten_be} tham gia buổi học thử tại Sata Robo {co_so}.\nThầy cô đã gửi nhận xét chi tiết và lộ trình đề xuất cho bé tại:\n{link}\n\nNếu muốn được tư vấn thêm, anh/chị bấm \"Đăng ký tư vấn lộ trình\" ngay trên phiếu.\n\nSata Robo",
  },
  TEST: {
    label: "Email thử",
    vars: ["ten"],
    subject: "Email thử từ Sata Robo",
    body: "Xin chào {ten}, đây là email thử cấu hình gửi thư.",
  },
} as const satisfies Record<string, EmailEventDef>;
export type EmailEvent = keyof typeof EMAIL_EVENTS;
export const EMAIL_EVENT_KEYS = Object.keys(EMAIL_EVENTS) as EmailEvent[];

export const EMAIL_STATUSES = ["queued", "sent", "failed", "skipped"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];
export const EMAIL_STATUS_VI: Record<EmailStatus, string> = { queued: "Chờ gửi", sent: "Đã gửi", failed: "Lỗi", skipped: "Không gửi" };
export const EMAIL_MAX_ATTEMPTS = 3;

export const isEmail = (s: string | null | undefined) => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

const VAR_RE = /\{([a-z_]+)\}/g;
export function templateVars(tpl: string): string[] {
  return [...new Set([...tpl.matchAll(VAR_RE)].map((m) => m[1]!))];
}

/** Điền biến; báo biến thiếu dữ liệu / biến không thuộc sự kiện */
export function fillTemplate(tpl: string, vars: Record<string, string | number | null | undefined>, allowed?: readonly string[]): { text: string; missing: string[]; unknown: string[] } {
  const missing = new Set<string>();
  const unknown = new Set<string>();
  const text = tpl.replace(VAR_RE, (_, k: string) => {
    if (allowed && !allowed.includes(k)) unknown.add(k);
    const v = vars[k];
    if (v === null || v === undefined || v === "") { missing.add(k); return `{${k}}`; }
    return String(v);
  });
  return { text, missing: [...missing], unknown: [...unknown] };
}

export function validateEmailTemplate(event: EmailEvent, subject: string, body: string): string[] {
  const e: string[] = [];
  if (subject.trim().length < 3) e.push("Tiêu đề tối thiểu 3 ký tự");
  if (subject.length > 200) e.push("Tiêu đề tối đa 200 ký tự");
  if (body.trim().length < 10) e.push("Nội dung tối thiểu 10 ký tự");
  const allowed = EMAIL_EVENTS[event].vars as readonly string[];
  const bad = templateVars(`${subject} ${body}`).filter((v) => !allowed.includes(v));
  if (bad.length) e.push(`Biến không dùng được cho sự kiện này: ${bad.map((b) => `{${b}}`).join(", ")}`);
  return e;
}

/** Lần thử tiếp theo: 1 phút, 5 phút, 30 phút */
export function emailRetryDelayMs(attempts: number): number | null {
  return attempts >= EMAIL_MAX_ATTEMPTS ? null : [60_000, 300_000, 1_800_000][attempts] ?? null;
}

/* ------------------------------------------------------------------ */
/* OTP                                                                 */
/* ------------------------------------------------------------------ */

export const OTP_PURPOSES = ["parent_activation", "password_reset", "phone_verify", "parent_login"] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];
export const OTP_PURPOSE_VI: Record<OtpPurpose, string> = { parent_activation: "Kích hoạt tài khoản PH", password_reset: "Quên mật khẩu", phone_verify: "Xác minh SĐT", parent_login: "Đăng nhập cổng phụ huynh" };
export const OTP_STATUSES = ["sent", "queued", "verified", "expired", "failed", "blocked"] as const;
export type OtpStatus = (typeof OTP_STATUSES)[number];
export const OTP_STATUS_VI: Record<OtpStatus, string> = { sent: "Đã gửi", queued: "Chờ gửi", verified: "Đã xác minh", expired: "Hết hạn", failed: "Nhập sai quá số lần", blocked: "Bị chặn" };

export const OTP_POLICY = { ttlMinutes: 5, maxAttempts: 5, perPhoneWindowMin: 15, perPhoneMax: 3, perIpWindowMin: 60, perIpMax: 10, cooldownSec: 60 };
export type OtpPolicy = typeof OTP_POLICY;

/** Có được gửi OTP mới? recent = các lần gửi gần đây (của SĐT / của IP) */
export function otpRequestDecision(x: { now: Date; phoneRecent: Date[]; ipRecent: Date[] }, P: OtpPolicy = OTP_POLICY): { ok: true } | { ok: false; reason: string; retryAfterSec: number } {
  const t = x.now.getTime();
  const inWin = (ds: Date[], min: number) => ds.filter((d) => t - d.getTime() < min * 60_000);
  const last = x.phoneRecent.reduce((m, d) => Math.max(m, d.getTime()), 0);
  if (last && t - last < P.cooldownSec * 1000) return { ok: false, reason: "Vui lòng đợi trước khi yêu cầu mã mới", retryAfterSec: Math.ceil((P.cooldownSec * 1000 - (t - last)) / 1000) };
  const ph = inWin(x.phoneRecent, P.perPhoneWindowMin);
  if (ph.length >= P.perPhoneMax) {
    const oldest = Math.min(...ph.map((d) => d.getTime()));
    return { ok: false, reason: "Số điện thoại đã yêu cầu quá nhiều lần", retryAfterSec: Math.ceil((oldest + P.perPhoneWindowMin * 60_000 - t) / 1000) };
  }
  if (inWin(x.ipRecent, P.perIpWindowMin).length >= P.perIpMax) return { ok: false, reason: "Thiết bị đã yêu cầu quá nhiều lần", retryAfterSec: P.perIpWindowMin * 60 };
  return { ok: true };
}

export function otpVerifyDecision(x: { status: OtpStatus; attempts: number; expiresAt: Date; now: Date; matches: boolean }, P: OtpPolicy = OTP_POLICY): { result: "ok" | "wrong" | "expired" | "locked" | "used"; status: OtpStatus; attempts: number } {
  if (x.status === "verified") return { result: "used", status: x.status, attempts: x.attempts };
  if (x.status === "failed" || x.status === "blocked") return { result: "locked", status: x.status, attempts: x.attempts };
  if (x.status === "expired" || x.expiresAt.getTime() < x.now.getTime()) return { result: "expired", status: "expired", attempts: x.attempts };
  if (x.matches) return { result: "ok", status: "verified", attempts: x.attempts + 1 };
  const attempts = x.attempts + 1;
  return attempts >= P.maxAttempts ? { result: "locked", status: "failed", attempts } : { result: "wrong", status: x.status, attempts };
}


/* ------------------------------------------------------------------ */
/* Webhook                                                             */
/* ------------------------------------------------------------------ */

export const WEBHOOK_SOURCES = ["sepay", "public_lead", "messenger", "zalo", "zalo_ca_nhan", "public_job"] as const;
export type WebhookSource = (typeof WEBHOOK_SOURCES)[number];
export const WEBHOOK_SOURCE_VI: Record<WebhookSource, string> = { sepay: "SePay (biến động số dư)", public_lead: "Form đăng ký học thử", messenger: "Facebook Messenger", zalo: "Zalo OA", zalo_ca_nhan: "Zalo cá nhân (công cụ ngoài)", public_job: "Form ứng tuyển" };
export const WEBHOOK_STATUSES = ["processed", "failed", "rejected", "duplicate"] as const;
export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number];
export const WEBHOOK_STATUS_VI: Record<WebhookStatus, string> = { processed: "Đã xử lý", failed: "Lỗi xử lý", rejected: "Từ chối", duplicate: "Trùng" };

/** Chỉ được chạy lại sự kiện lỗi xử lý (không chạy lại sự kiện bị từ chối vì sai khoá / dữ liệu) */
export function canReplay(status: WebhookStatus, attempts: number): string | null {
  if (status !== "failed") return status === "processed" || status === "duplicate" ? "Sự kiện đã xử lý" : "Sự kiện bị từ chối (sai khoá / dữ liệu) — không chạy lại";
  if (attempts >= 10) return "Đã chạy lại quá 10 lần";
  return null;
}

/** Bỏ header nhạy cảm trước khi lưu */
export function safeHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    const key = k.toLowerCase();
    if (["authorization", "cookie", "x-api-key", "proxy-authorization"].includes(key)) out[key] = "[ẩn]";
    else if (["content-type", "user-agent", "x-forwarded-for", "x-real-ip", "origin", "referer"].includes(key)) out[key] = v.slice(0, 300);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Cài đặt                                                             */
/* ------------------------------------------------------------------ */

export interface AppSettings {
  brandName: string;
  legalName: string;
  hotline: string;
  supportEmail: string;
  website: string;
  headOfficeAddress: string;
  taxCode: string;
  receiptFooter: string;
  zaloOaId: string;
  timezone: string;
  parentAppUrl: string;
}

export const SETTINGS_DEFAULTS: AppSettings = {
  brandName: "Sata Robo",
  legalName: "",
  hotline: "",
  supportEmail: "",
  website: "https://satarobo.vn",
  headOfficeAddress: "",
  taxCode: "",
  receiptFooter: "Cảm ơn quý phụ huynh đã tin tưởng Sata Robo.",
  zaloOaId: "",
  timezone: "Asia/Ho_Chi_Minh",
  parentAppUrl: "",
};

export function validateSettings(s: AppSettings): string[] {
  const e: string[] = [];
  if (s.brandName.trim().length < 2) e.push("Tên thương hiệu tối thiểu 2 ký tự");
  if (s.hotline && !/^[0-9+ .()-]{8,20}$/.test(s.hotline)) e.push("Hotline không hợp lệ");
  if (s.supportEmail && !isEmail(s.supportEmail)) e.push("Email hỗ trợ không hợp lệ");
  for (const [k, v] of [["website", s.website], ["parentAppUrl", s.parentAppUrl]] as const) if (v && !/^https?:\/\/[^\s]+$/.test(v)) e.push(`${k === "website" ? "Website" : "Địa chỉ app phụ huynh"} phải bắt đầu bằng http(s)://`);
  if (s.taxCode && !/^\d{10}(-\d{3})?$/.test(s.taxCode)) e.push("Mã số thuế 10 số (hoặc 10-3)");
  if (s.receiptFooter.length > 300) e.push("Chân phiếu thu tối đa 300 ký tự");
  if (s.timezone !== "Asia/Ho_Chi_Minh") e.push("Hiện chỉ hỗ trợ múi giờ Asia/Ho_Chi_Minh");
  return e;
}

/* ------------------------------------------------------------------ */
/* Tổ chức, nhóm                                                       */
/* ------------------------------------------------------------------ */

export function validateCode(code: string, label = "Mã"): string | null {
  return /^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(code) ? null : `${label} 2–20 ký tự IN HOA, số, - hoặc _`;
}

export function validateGroup(g: { name: string; description?: string | null }): string[] {
  const e: string[] = [];
  if (g.name.trim().length < 3) e.push("Tên nhóm tối thiểu 3 ký tự");
  if (g.name.length > 80) e.push("Tên nhóm tối đa 80 ký tự");
  if ((g.description ?? "").length > 300) e.push("Mô tả tối đa 300 ký tự");
  return e;
}

/* ------------------------------------------------------------------ */
/* Mục tiêu doanh thu                                                  */
/* ------------------------------------------------------------------ */

export function attainment(actual: number, target: number | null | undefined): { pct: number | null; tone: "good" | "warn" | "bad" | "none" } {
  if (!target || target <= 0) return { pct: null, tone: "none" };
  const pct = Math.round((actual / target) * 1000) / 10;
  return { pct, tone: pct >= 100 ? "good" : pct >= 80 ? "warn" : "bad" };
}

/** Tỉ lệ thời gian đã trôi qua của tháng (để so tiến độ) */
export function monthProgress(period: string, today: string): number {
  if (today.slice(0, 7) > period) return 1;
  if (today.slice(0, 7) < period) return 0;
  const [y, m] = period.split("-").map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Math.round((Number(today.slice(8, 10)) / days) * 1000) / 1000;
}

export function monthsOf(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number) as [number, number];
  const end = to.slice(0, 7);
  while (`${y}-${String(m).padStart(2, "0")}` <= end && out.length < 36) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}
