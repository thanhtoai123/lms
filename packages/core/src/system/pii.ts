/**
 * Che dữ liệu cá nhân trong nhật ký (audit log).
 * Bản gốc: audit log che SĐT / email mặc định (`09***67`, `a***@x.com`);
 * "Xem đầy đủ" là thao tác break-glass — bắt buộc lý do và ghi một bản ghi audit `PII_REVEAL`.
 *
 * Hàm thuần, dùng ở lớp đọc của service audit.
 */

/** `0912345678` → `09***78` · `84912345678` → `84***78` */
export function maskPhoneValue(value: string): string {
  const s = value.trim();
  const digits = s.replace(/\D/g, "");
  if (digits.length < 6) return "***";
  return `${digits.slice(0, 2)}***${digits.slice(-2)}`;
}

/** `an.nguyen@example.com` → `a***@example.com` */
export function maskEmailValue(value: string): string {
  const s = value.trim();
  const at = s.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  const head = local[0] ?? "";
  const dot = domain.lastIndexOf(".");
  const shortDomain = dot > 1 ? `${domain[0]}${domain.slice(dot)}` : domain;
  return `${head}***@${shortDomain}`;
}

/**
 * Che SĐT nhưng GIỮ ĐẦU SỐ để còn nhận ra nhà mạng / phân biệt khách:
 * `0912345678` → `0912****78`. Dùng khi trả dữ liệu của một tenant cho người ngoài tenant.
 */
export function maskPhoneKeepPrefix(value: string): string {
  const digits = value.trim().replace(/\D/g, "");
  if (digits.length < 6) return "***";
  const head = digits.slice(0, Math.min(4, digits.length - 4));
  return `${head}${"*".repeat(Math.max(2, digits.length - head.length - 2))}${digits.slice(-2)}`;
}

/** Che email nhưng GIỮ NGUYÊN nhà cung cấp: `an.nguyen@gmail.com` → `a***@gmail.com` */
export function maskEmailKeepDomain(value: string): string {
  const s = value.trim();
  const at = s.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${s[0]}***@${s.slice(at + 1)}`;
}

/**
 * Địa chỉ chỉ còn quận / tỉnh: `211 Nguyễn Hữu Thọ, Hải Châu, Đà Nẵng` → `Hải Châu, Đà Nẵng`.
 * Bỏ mọi đoạn có chữ số (số nhà, ngõ, tầng); không còn đoạn nào an toàn thì che hết.
 */
export function maskAddressValue(value: string): string {
  const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return "***";
  const coarse = parts.filter((p) => !/\d/.test(p));
  if (!coarse.length) return "***";
  return coarse.slice(-2).join(", ");
}

/** Họ tên rút gọn: `Nguyễn Văn An` → `Nguyễn V. A.` (giữ họ để còn xếp danh sách) */
export function maskPersonName(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "***";
  if (parts.length === 1) return `${parts[0]![0]}***`;
  return [parts[0], ...parts.slice(1).map((p) => `${p[0]}.`)].join(" ");
}

const PHONE_RE = /(?:\+?84|0)\d{8,10}/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Tên trường được coi là chứa SĐT / email dù giá trị trông không giống */
const PHONE_KEY = /(phone|sdt|mobile|zalo|dien_?thoai|dienthoai)/i;
const EMAIL_KEY = /(email|mail)/i;
/** Trường luôn che toàn bộ (giấy tờ tuỳ thân, tài khoản ngân hàng) */
const SECRET_KEY = /(cccd|cmnd|citizen|identity_?no|passport|bank_?account|account_?no|tax_?code|ma_?so_?thue)/i;

/** Che mọi SĐT / email xuất hiện trong chuỗi tự do */
export function maskPiiText(text: string): string {
  return text.replace(EMAIL_RE, (m) => maskEmailValue(m)).replace(PHONE_RE, (m) => maskPhoneValue(m));
}

function maskLeaf(key: string, value: string): string {
  if (SECRET_KEY.test(key)) return value.length <= 2 ? "***" : `${value.slice(0, 1)}***${value.slice(-1)}`;
  if (EMAIL_KEY.test(key) && value.includes("@")) return maskEmailValue(value);
  if (PHONE_KEY.test(key)) return maskPhoneValue(value);
  return maskPiiText(value);
}

/**
 * Che PII trong `metadata` của audit (before / after / reason).
 * Giữ nguyên hình dạng dữ liệu; chỉ đổi giá trị chuỗi. Không sửa đối tượng gốc.
 */
export function maskPii<T>(value: T, key = ""): T {
  if (typeof value === "string") return maskLeaf(key, value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => maskPii(v, key)) as unknown as T;
  if (value && typeof value === "object") {
    if (value instanceof Date) return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = maskPii(v, k);
    return out as unknown as T;
  }
  return value;
}

/** Có gì để "Xem đầy đủ" không? (nút break-glass chỉ hiện khi bản ghi thực sự có PII) */
export function hasPii(value: unknown, key = ""): boolean {
  if (typeof value === "string") return maskLeaf(key, value) !== value;
  if (Array.isArray(value)) return value.some((v) => hasPii(v, key));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.entries(value as Record<string, unknown>).some(([k, v]) => hasPii(v, k));
  }
  return false;
}

/** Lý do bắt buộc khi bấm "Xem đầy đủ" */
export const PII_REVEAL_MIN_REASON = 10;
export function validateRevealReason(reason: string | null | undefined): string | null {
  const r = (reason ?? "").trim();
  if (r.length < PII_REVEAL_MIN_REASON) return `Xem đầy đủ dữ liệu cá nhân phải ghi lý do (tối thiểu ${PII_REVEAL_MIN_REASON} ký tự) — thao tác được ghi nhật ký`;
  if (r.length > 500) return "Lý do tối đa 500 ký tự";
  return null;
}

/* ------------------------------------------------------------------ */
/* Che dữ liệu của một tenant khi trả cho người NGOÀI tenant            */
/* ------------------------------------------------------------------ */

/** Tên trường chứa họ tên người thật (không phải tên khoá học / tên lớp) */
const PERSON_NAME_KEY = /^(full_?name|ho_?ten|student_?name|child_?name|parent_?name|guardian_?name|contact_?name|account_?name|teacher_?name|staff_?name|nickname|representative|actor_?name|assignee_?name|owner_?name|reviewer_?name|created_?by_?name|approver_?name)$/i;
/** Tên trường chứa địa chỉ */
const ADDRESS_KEY = /(address|dia_?chi)/i;

function maskOutsiderLeaf(key: string, value: string): string {
  if (!value) return value;
  if (SECRET_KEY.test(key)) return value.length <= 2 ? "***" : `${value.slice(0, 1)}***${value.slice(-1)}`;
  if (PERSON_NAME_KEY.test(key)) return maskPersonName(value);
  if (ADDRESS_KEY.test(key)) return maskAddressValue(value);
  if (EMAIL_KEY.test(key) && value.includes("@")) return maskEmailKeepDomain(value);
  if (PHONE_KEY.test(key)) return maskPhoneKeepPrefix(value);
  // chuỗi tự do (ghi chú, lý do…): vẫn quét SĐT / email lẫn trong câu chữ
  return value.replace(EMAIL_RE, (m) => maskEmailKeepDomain(m)).replace(PHONE_RE, (m) => maskPhoneKeepPrefix(m));
}

/**
 * Che PII của một bản ghi trước khi trả cho actor NGOÀI tenant (khi `hoSeesPii = false`).
 * Giữ nguyên hình dạng dữ liệu, chỉ đổi giá trị chuỗi; không sửa đối tượng gốc.
 *
 * Khác `maskPii` (dùng cho nhật ký) ở chỗ: giữ đầu số SĐT, giữ nhà cung cấp email,
 * rút gọn họ tên và cắt địa chỉ về quận / tỉnh — đủ để đối soát số liệu, không đủ để liên hệ khách.
 */
export function maskOutsideTenant<T>(value: T, key = ""): T {
  if (typeof value === "string") return maskOutsiderLeaf(key, value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => maskOutsideTenant(v, key)) as unknown as T;
  if (value && typeof value === "object") {
    if (value instanceof Date) return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = maskOutsideTenant(v, k);
    return out as unknown as T;
  }
  return value;
}
