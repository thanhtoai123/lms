/**
 * Vận hành pilot sau go-live: thông báo đẩy (Web Push) cho cổng phụ huynh, sổ phản hồi pilot,
 * chỉ số mức độ sử dụng hệ mới theo tuần.
 */

/* ------------------------------------------------------------------ */
/* Web Push                                                             */
/* ------------------------------------------------------------------ */

/** Dịch vụ đẩy của trình duyệt (chặn gửi tới địa chỉ tuỳ ý — chống SSRF) */
export const PUSH_HOST_SUFFIXES = ["fcm.googleapis.com", "push.services.mozilla.com", "notify.windows.com", "push.apple.com"] as const;

export function pushEndpointAllowed(endpoint: string, opts: { allowLocal?: boolean } = {}): boolean {
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (endpoint.length > 1000) return false;
  if (opts.allowLocal && u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return true;
  if (u.protocol !== "https:" || u.port) return false;
  const h = u.hostname.toLowerCase();
  return PUSH_HOST_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`));
}

const B64URL = /^[A-Za-z0-9_-]+$/;
/** Khoá trình duyệt gửi lên: p256dh 65 byte (87 ký tự base64url), auth 16 byte (22 ký tự) */
export function validPushKeys(k: { p256dh: string; auth: string }): boolean {
  return B64URL.test(k.p256dh) && B64URL.test(k.auth) && k.p256dh.length >= 86 && k.p256dh.length <= 88 && k.auth.length >= 21 && k.auth.length <= 24;
}

/** Nội dung thông báo gửi đi — ngắn, không chứa dữ liệu nhạy cảm, luôn trỏ về cổng /ph */
export function pushPayload(n: { title: string; body: string; link: string | null; template: string; id: string }): { title: string; body: string; url: string; tag: string } {
  const safeLink = n.link && /^\/ph(\/|\?|$)/.test(n.link) ? n.link : null;
  const url = safeLink ?? ({ MESSAGE_NEW: "/ph/tin-nhan", TUITION_DUE: "/ph/hoc-phi", INVOICE_ISSUED: "/ph/hoc-phi" } as Record<string, string>)[n.template] ?? "/ph/thong-bao";
  const clip = (s: string, n2: number) => (s.length > n2 ? `${s.slice(0, n2 - 1)}…` : s);
  return { title: clip(n.title.trim() || "Sata Robo", 60), body: clip(n.body.replace(/\s+/g, " ").trim(), 160), url, tag: `${n.template}:${n.id.slice(0, 8)}` };
}

/** Kết quả gọi dịch vụ đẩy: 404/410 = đăng ký hết hạn (xoá), 429/5xx = thử lại */
export function pushResultKind(status: number): "ok" | "gone" | "retry" | "fail" {
  if (status >= 200 && status < 300) return "ok";
  if (status === 404 || status === 410) return "gone";
  if (status === 429 || status >= 500) return "retry";
  return "fail";
}

/* ------------------------------------------------------------------ */
/* Sổ phản hồi pilot                                                    */
/* ------------------------------------------------------------------ */

export const PILOT_FB_CATEGORIES = ["bug", "data", "training", "request"] as const;
export type PilotFbCategory = (typeof PILOT_FB_CATEGORIES)[number];
export const PILOT_FB_CATEGORY_VI: Record<PilotFbCategory, string> = { bug: "Lỗi hệ thống", data: "Sai dữ liệu", training: "Chưa biết thao tác", request: "Đề xuất" };
export const PILOT_FB_SEVERITIES = ["low", "medium", "high"] as const;
export type PilotFbSeverity = (typeof PILOT_FB_SEVERITIES)[number];
export const PILOT_FB_SEVERITY_VI: Record<PilotFbSeverity, string> = { low: "Thấp", medium: "Trung bình", high: "Chặn công việc" };
export const PILOT_FB_STATUSES = ["open", "in_progress", "resolved", "wontfix"] as const;
export type PilotFbStatus = (typeof PILOT_FB_STATUSES)[number];
export const PILOT_FB_STATUS_VI: Record<PilotFbStatus, string> = { open: "Mới", in_progress: "Đang xử lý", resolved: "Đã xử lý", wontfix: "Không xử lý" };
/** Hạn phản hồi theo mức độ (giờ) */
export const PILOT_FB_SLA_HOURS: Record<PilotFbSeverity, number> = { high: 4, medium: 24, low: 72 };

export function pilotFbTransition(from: PilotFbStatus, to: PilotFbStatus, resolution: string | null): string[] {
  const allowed: Record<PilotFbStatus, PilotFbStatus[]> = { open: ["in_progress", "resolved", "wontfix"], in_progress: ["resolved", "wontfix", "open"], resolved: ["open"], wontfix: ["open"] };
  if (!allowed[from].includes(to)) return [`Không chuyển được từ "${PILOT_FB_STATUS_VI[from]}" sang "${PILOT_FB_STATUS_VI[to]}"`];
  if ((to === "resolved" || to === "wontfix") && (resolution ?? "").trim().length < 10) return ["Ghi cách xử lý / lý do (≥ 10 ký tự)"];
  return [];
}

export function pilotFbOverdue(f: { status: PilotFbStatus; severity: PilotFbSeverity; createdAt: Date }, now: Date): boolean {
  return (f.status === "open" || f.status === "in_progress") && now.getTime() - f.createdAt.getTime() > PILOT_FB_SLA_HOURS[f.severity] * 3_600_000;
}

/* ------------------------------------------------------------------ */
/* Mức độ sử dụng sau go-live                                           */
/* ------------------------------------------------------------------ */

export interface AdoptionWeek {
  sessionsDone: number;
  sessionsOnTime: number;
  paymentsConfirmed: number;
  paymentsAuto: number;
  invoicesDue: number;
  invoicesIssued: number;
  parentsTotal: number;
  parentsActive: number;
  otpTotal: number;
  otpSent: number;
  messagesTotal: number;
  messagesFailed: number;
}

export const ADOPTION_TARGETS = [
  { key: "attendanceOnTime", label: "Buổi học chốt điểm danh trong ngày", target: 0.95, num: "sessionsOnTime", den: "sessionsDone" },
  { key: "autoMatch", label: "Khoản thu tự khớp chuyển khoản", target: 0.6, num: "paymentsAuto", den: "paymentsConfirmed" },
  { key: "invoiceCoverage", label: "Khoản thu đã có hoá đơn điện tử", target: 0.98, num: "invoicesIssued", den: "invoicesDue" },
  { key: "parentActive", label: "Phụ huynh dùng cổng trong 30 ngày", target: 0.5, num: "parentsActive", den: "parentsTotal" },
  { key: "otpDelivery", label: "Mã OTP gửi được", target: 0.95, num: "otpSent", den: "otpTotal" },
  { key: "messageDelivery", label: "Tin ZNS / SMS / đẩy gửi thành công", target: 0.95, num: "messagesOk", den: "messagesTotal" },
] as const;

export function adoptionChecks(w: AdoptionWeek) {
  const v: Record<string, number> = { ...w, messagesOk: w.messagesTotal - w.messagesFailed };
  return ADOPTION_TARGETS.map((t) => {
    const den = v[t.den] ?? 0;
    const rate = den > 0 ? (v[t.num] ?? 0) / den : null;
    return { key: t.key, label: t.label, target: t.target, rate, num: v[t.num] ?? 0, den, ok: rate === null ? null : rate >= t.target };
  });
}

/** Mondays (YYYY-MM-DD) của n tuần gần nhất, cũ → mới */
export function recentWeeks(today: string, n: number): string[] {
  const d = new Date(`${today}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getTime() - i * 7 * 86_400_000);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}
