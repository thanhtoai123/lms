/**
 * Kênh gửi tin cho phụ huynh: Zalo ZNS (theo mẫu đã duyệt) và SMS brandname dự phòng.
 * - ZNS chỉ gửi theo template_id + tham số; mỗi tham số chuỗi tối đa 100 ký tự (mẫu thường ≤ 30 cho tên).
 * - Không gửi tin chăm sóc / nhắc trong khung giờ yên lặng (mặc định 21:00–07:00); OTP được gửi ngay.
 * - SMS brandname: nội dung không dấu để tối ưu độ dài (160 ký tự / tin, ghép 153 ký tự / tin).
 */
export const DELIVERY_EVENTS = ["OTP", "TUITION_DUE", "SESSION_REMINDER", "SESSION_SUMMARY", "INVOICE_ISSUED", "REPORT_CARD", "BROADCAST"] as const;
export type DeliveryEvent = (typeof DELIVERY_EVENTS)[number];
export const DELIVERY_EVENT_VI: Record<DeliveryEvent, string> = {
  OTP: "Mã OTP đăng nhập / kích hoạt",
  TUITION_DUE: "Nhắc học phí",
  SESSION_REMINDER: "Nhắc lịch học",
  SESSION_SUMMARY: "Tóm tắt buổi học",
  INVOICE_ISSUED: "Hoá đơn điện tử đã phát hành",
  REPORT_CARD: "Học bạ mới",
  BROADCAST: "Thông báo chung",
};
/** Biến có sẵn cho từng sự kiện (khoá dùng khi ánh xạ tham số mẫu ZNS) */
export const DELIVERY_VARS: Record<DeliveryEvent, string[]> = {
  OTP: ["otp", "phut"],
  TUITION_DUE: ["ten_ph", "ten_hv", "so_tien", "han", "ma_don"],
  SESSION_REMINDER: ["ten_ph", "ten_hv", "lop", "ngay", "gio", "co_so"],
  SESSION_SUMMARY: ["ten_ph", "ten_hv", "lop", "ngay", "nhan_xet"],
  INVOICE_ISSUED: ["ten_ph", "so_hd", "ky_hieu", "so_tien", "ma_tra_cuu"],
  REPORT_CARD: ["ten_ph", "ten_hv", "moc"],
  BROADCAST: ["ten_ph", "tieu_de", "noi_dung"],
};

/**
 * ĐỒNG Ý NHẬN TIN — vạch ranh giới giữa tin TIẾP THỊ và tin GIAO DỊCH.
 *
 * Phụ huynh tắt "nhận tin tiếp thị" thì KHÔNG được gửi thông báo chung nữa (Nghị định 13/2023 và
 * Luật BVDLCN 2025: tiếp thị phải có đồng ý riêng, rút lại lúc nào cũng được). Nhưng mã OTP,
 * nhắc học phí, nhắc lịch học, tóm tắt buổi, hoá đơn, học bạ là **tin phục vụ dịch vụ họ đang dùng**
 * — tắt luôn những tin này thì phụ huynh không biết con nghỉ học hay lớp đổi giờ. Vì vậy chỉ
 * `BROADCAST` chịu ràng buộc từ chối tiếp thị.
 *
 * "Hạn chế xử lý dữ liệu" (`processingRestricted`) thì chặn TẤT CẢ, kể cả OTP — đó là yêu cầu
 * pháp lý mạnh hơn, người dùng đã yêu cầu ngừng xử lý dữ liệu của họ.
 */
export const MARKETING_EVENTS: readonly DeliveryEvent[] = ["BROADCAST"];

export function isMarketingEvent(ev: DeliveryEvent): boolean {
  return MARKETING_EVENTS.includes(ev);
}

/** Lý do KHÔNG được gửi (null = được gửi). Dùng chung cho hàng đợi ZNS/SMS và gửi hàng loạt. */
export function consentBlock(ev: DeliveryEvent, who: { optOut?: boolean | null; restricted?: boolean | null }): string | null {
  if (who.restricted) return "Phụ huynh đã hạn chế xử lý dữ liệu";
  if (who.optOut && isMarketingEvent(ev)) return "Phụ huynh đã từ chối nhận tin tiếp thị";
  return null;
}

export const DELIVERY_MODES = ["off", "sandbox", "live"] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export interface ZnsTemplate {
  templateId: string;
  /** tên tham số trong mẫu ZNS → khoá biến của hệ thống */
  params: Record<string, string>;
}
export interface DeliverySettings {
  zns: { mode: DeliveryMode; templates: Partial<Record<DeliveryEvent, ZnsTemplate>> };
  sms: { mode: DeliveryMode; brandname: string; fallback: boolean; templates: Partial<Record<DeliveryEvent, string>> };
  quietStart: string;
  quietEnd: string;
  maxPerParentPerDay: number;
}
export const DELIVERY_DEFAULTS: DeliverySettings = {
  zns: { mode: "off", templates: {} },
  sms: {
    mode: "off", brandname: "", fallback: true,
    templates: {
      OTP: "Ma xac thuc Sata Robo cua ban la {otp}. Hieu luc {phut} phut. Khong chia se ma nay cho bat ky ai.",
      TUITION_DUE: "Sata Robo: Hoc phi cua be {ten_hv} con {so_tien}, han {han}. Chi tiet tren cong phu huynh.",
      SESSION_REMINDER: "Sata Robo: Be {ten_hv} co buoi hoc lop {lop} luc {gio} ngay {ngay} tai {co_so}.",
    },
  },
  quietStart: "21:00",
  quietEnd: "07:00",
  maxPerParentPerDay: 5,
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const PARAM = /^[a-z][a-z0-9_]{0,29}$/;

export function validateDeliverySettings(s: DeliverySettings, env: { production: boolean; znsToken: boolean; smsApi: boolean; allowSandbox: boolean }): string[] {
  const e: string[] = [];
  if (!HHMM.test(s.quietStart) || !HHMM.test(s.quietEnd)) e.push("Giờ yên lặng dạng HH:MM");
  if (!Number.isInteger(s.maxPerParentPerDay) || s.maxPerParentPerDay < 1 || s.maxPerParentPerDay > 20) e.push("Trần tin mỗi phụ huynh / ngày: 1–20");
  for (const [ch, mode] of [["ZNS", s.zns.mode], ["SMS", s.sms.mode]] as const) {
    if (mode === "sandbox" && env.production && !env.allowSandbox) e.push(`${ch}: chế độ giả lập không dùng ở production`);
  }
  if (s.zns.mode === "live" && !env.znsToken) e.push("ZNS: chưa cấu hình ZALO_ZNS_TOKEN");
  if (s.sms.mode === "live" && !env.smsApi) e.push("SMS: chưa cấu hình SMS_API_URL / SMS_API_KEY");
  if (s.sms.mode !== "off" && !/^[A-Za-z0-9 ._-]{3,11}$/.test(s.sms.brandname.trim())) e.push("SMS: brandname 3–11 ký tự không dấu (đã đăng ký với nhà mạng)");
  for (const [ev, t] of Object.entries(s.zns.templates) as [DeliveryEvent, ZnsTemplate | undefined][]) {
    if (!t) continue;
    if (!DELIVERY_EVENTS.includes(ev)) { e.push(`ZNS: sự kiện ${ev} không hợp lệ`); continue; }
    if (!/^\d{3,12}$/.test(t.templateId.trim())) e.push(`ZNS ${DELIVERY_EVENT_VI[ev]}: template_id là dãy số`);
    const entries = Object.entries(t.params);
    if (!entries.length) e.push(`ZNS ${DELIVERY_EVENT_VI[ev]}: cần ít nhất 1 tham số`);
    for (const [p, v] of entries) {
      if (!PARAM.test(p)) e.push(`ZNS ${DELIVERY_EVENT_VI[ev]}: tên tham số "${p}" không hợp lệ`);
      if (!DELIVERY_VARS[ev].includes(v)) e.push(`ZNS ${DELIVERY_EVENT_VI[ev]}: biến "${v}" không có cho sự kiện này`);
    }
    if (ev === "OTP" && !Object.values(t.params).includes("otp")) e.push("ZNS OTP: mẫu phải có tham số mã otp");
  }
  for (const [ev, text] of Object.entries(s.sms.templates) as [DeliveryEvent, string | undefined][]) {
    if (!text) continue;
    const vars = [...text.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]!);
    for (const v of vars) if (!DELIVERY_VARS[ev]?.includes(v)) e.push(`SMS ${DELIVERY_EVENT_VI[ev] ?? ev}: biến {${v}} không có`);
    if (smsSegments(stripDiacritics(text)).segments > 3) e.push(`SMS ${DELIVERY_EVENT_VI[ev] ?? ev}: quá 3 tin ghép`);
    if (ev === "OTP" && !vars.includes("otp")) e.push("SMS OTP: nội dung phải có {otp}");
  }
  return e;
}

export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

/** Số tin SMS: GSM-7 160 / 153 ký tự; có ký tự ngoài GSM → UCS-2 70 / 67 */
export function smsSegments(text: string): { length: number; unicode: boolean; segments: number } {
  const unicode = /[^\x0A\x0D\x20-\x7E]/.test(text);
  const len = [...text].length;
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return { length: len, unicode, segments: len === 0 ? 0 : len <= single ? 1 : Math.ceil(len / multi) };
}

export function renderSms(template: string, vars: Record<string, string>): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = template.replace(/\{([a-z_]+)\}/g, (_, k: string) => {
    const v = vars[k];
    if (v === undefined || v === "") {
      missing.push(k);
      return "";
    }
    return v;
  });
  return { text: stripDiacritics(text).replace(/\s+/g, " ").trim(), missing };
}

export function buildZnsData(t: ZnsTemplate, vars: Record<string, string>): { data: Record<string, string>; missing: string[] } {
  const data: Record<string, string> = {};
  const missing: string[] = [];
  for (const [p, key] of Object.entries(t.params)) {
    const v = vars[key];
    if (v === undefined || v === "") missing.push(key);
    else data[p] = v.slice(0, 100);
  }
  return { data, missing };
}

/** ZNS nhận SĐT dạng 84xxxxxxxxx */
export function znsPhone(phone: string): string | null {
  const d = phone.replace(/\D/g, "");
  if (/^84\d{9}$/.test(d)) return d;
  if (/^0\d{9}$/.test(d)) return `84${d.slice(1)}`;
  return null;
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Giờ Việt Nam hiện tại có nằm trong khung yên lặng không; nếu có trả thời điểm được gửi tiếp */
export function quietHours(now: Date, start: string, end: string): { quiet: boolean; resumeAt: Date | null } {
  const vn = new Date(now.getTime() + 7 * 3600_000);
  const m = vn.getUTCHours() * 60 + vn.getUTCMinutes();
  const s = toMin(start);
  const e = toMin(end);
  if (s === e) return { quiet: false, resumeAt: null };
  const quiet = s < e ? m >= s && m < e : m >= s || m < e;
  if (!quiet) return { quiet: false, resumeAt: null };
  const wait = (e - m + 1440) % 1440;
  const resume = new Date(now.getTime() + wait * 60_000);
  resume.setUTCSeconds(0, 0);
  return { quiet: true, resumeAt: resume };
}

/**
 * Phân loại lỗi khi gọi nhà cung cấp. Bảng mã lỗi ZNS thay đổi theo thời gian nên không cứng hoá từng mã:
 * - Lỗi mạng / HTTP 5xx / 429 → thử lại (tối đa MAX_DELIVERY_ATTEMPTS).
 * - Nhà cung cấp trả lỗi nghiệp vụ (error ≠ 0) → không thử lại; chuyển SMS nếu bật dự phòng.
 */
export type DeliveryFailure = { kind: "network" } | { kind: "http"; status: number } | { kind: "provider"; code: number | string };
export function failureRetryable(f: DeliveryFailure): boolean {
  if (f.kind === "network") return true;
  if (f.kind === "http") return f.status >= 500 || f.status === 429;
  return false;
}

export const MAX_DELIVERY_ATTEMPTS = 3;
export function retryDelayMinutes(attempt: number): number {
  return [5, 30, 120][Math.min(attempt, 3) - 1] ?? 120;
}
