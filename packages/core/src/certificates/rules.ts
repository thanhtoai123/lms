/**
 * GIẤY CHỨNG NHẬN & LỘ TRÌNH HỌC — luật thuần (docs/CHUNG-NHAN-LO-TRINH.md).
 *
 * Thuật ngữ: trung tâm ngoài công lập dạy kỹ năng cho trẻ cấp **"Giấy chứng nhận hoàn thành"** —
 * KHÔNG phải "chứng chỉ" (văn bằng, chứng chỉ thuộc hệ thống giáo dục quốc dân do cơ quan có thẩm quyền cấp).
 * Mọi chữ hiển thị dùng "chứng nhận"; tên cột cũ (`certificate_no`) giữ nguyên để khỏi di chuyển dữ liệu.
 *
 * Dữ liệu một chứng nhận bám bộ trường tối thiểu của 1EdTech Open Badges 3.0:
 * tên thành tích (name), mô tả (description), tiêu chí đạt (criteria), đơn vị cấp (issuer),
 * người nhận (recipient), ngày cấp (validFrom), mã định danh duy nhất, bằng chứng (evidence — hồ sơ học tập)
 * và cách xác thực (trang công khai `/cn/<token>` qua mã QR). Không ký mật mã.
 *
 * File này không dùng kiểu DOM — chạy được ở máy chủ, trình duyệt và bộ kiểm thử.
 */

/* ------------------------------------------------------------------ */
/* Lộ trình học                                                         */
/* ------------------------------------------------------------------ */

export interface PathCourseRef {
  courseId: string;
  seq: number;
  required: boolean;
  code?: string;
  name?: string;
}

/** Một bản ghi hoàn thành khoá của học viên (chỉ bản ghi ĐÃ DUYỆT, chưa thu hồi mới tính là hoàn thành) */
export interface PathCompletionRef {
  courseId: string;
  status: string;
  revokedAt?: Date | string | null;
}

export type PathCourseState = "completed" | "in_progress" | "not_started";

export const PATH_COURSE_STATE_VI: Record<PathCourseState, string> = {
  completed: "Đã hoàn thành",
  in_progress: "Đang học",
  not_started: "Chưa học",
};

export interface PathProgress {
  courses: (PathCourseRef & { state: PathCourseState })[];
  /** Số khoá đã hoàn thành / tổng số khoá của lộ trình */
  completed: number;
  total: number;
  /** Tính trên các khoá BẮT BUỘC (không có khoá bắt buộc thì tính trên mọi khoá) */
  requiredCompleted: number;
  requiredTotal: number;
  /** 0–100, làm tròn; tính trên khoá bắt buộc */
  percent: number;
  /** Đủ điều kiện nhận chứng nhận: mọi khoá bắt buộc đã hoàn thành (lộ trình phải có ít nhất một khoá) */
  eligible: boolean;
}

/**
 * Tiến độ một học viên trên một lộ trình.
 * `activeCourseIds`: các khoá học viên đang có ghi danh mở (đang học / học thử / bảo lưu).
 * Khoá đã có bản ghi hoàn thành ĐÃ DUYỆT và chưa thu hồi → "Đã hoàn thành" (ưu tiên hơn "Đang học").
 */
export function pathProgress(
  pathCourses: readonly PathCourseRef[],
  completions: readonly PathCompletionRef[],
  activeCourseIds: readonly string[] = [],
): PathProgress {
  const done = new Set(completions.filter((c) => c.status === "approved" && !c.revokedAt).map((c) => c.courseId));
  const active = new Set(activeCourseIds);
  const sorted = [...pathCourses].sort((a, b) => a.seq - b.seq);
  const courses = sorted.map((c) => ({
    ...c,
    state: (done.has(c.courseId) ? "completed" : active.has(c.courseId) ? "in_progress" : "not_started") as PathCourseState,
  }));
  const req = courses.some((c) => c.required) ? courses.filter((c) => c.required) : courses;
  const requiredCompleted = req.filter((c) => c.state === "completed").length;
  const completed = courses.filter((c) => c.state === "completed").length;
  return {
    courses,
    completed,
    total: courses.length,
    requiredCompleted,
    requiredTotal: req.length,
    percent: req.length ? Math.round((requiredCompleted / req.length) * 100) : 0,
    eligible: req.length > 0 && requiredCompleted === req.length,
  };
}

/** Kiểm tra danh sách khoá của một lộ trình trước khi lưu */
export function validatePathCourses(items: readonly { courseId: string; required: boolean }[]): string[] {
  const errs: string[] = [];
  if (items.length === 0) errs.push("Lộ trình cần ít nhất một khoá");
  if (items.length > 20) errs.push("Lộ trình tối đa 20 khoá");
  const ids = items.map((i) => i.courseId);
  if (new Set(ids).size !== ids.length) errs.push("Một khoá chỉ xuất hiện một lần trong lộ trình");
  if (items.length && !items.some((i) => i.required)) errs.push("Cần ít nhất một khoá bắt buộc");
  return errs;
}

/** Mã lộ trình: IN HOA, chữ / số / gạch, 2–30 ký tự */
export const PATH_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{1,29}$/;
export function normalizePathCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "-");
}

/* ------------------------------------------------------------------ */
/* Số chứng nhận & token xác thực                                       */
/* ------------------------------------------------------------------ */

export const CERTIFICATE_KINDS = ["path", "course"] as const;
export type CertificateKind = (typeof CERTIFICATE_KINDS)[number];
export const CERTIFICATE_STATUSES = ["valid", "revoked"] as const;
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];
export const CERTIFICATE_STATUS_VI: Record<CertificateStatus, string> = { valid: "Hợp lệ", revoked: "Đã thu hồi" };
export const CERTIFICATE_KIND_VI: Record<CertificateKind, string> = { path: "Hoàn thành lộ trình", course: "Hoàn thành khoá học" };

/** Mã cơ sở trong số chứng nhận: chỉ chữ / số IN HOA (bỏ dấu, ký tự lạ) */
export function certificateCenterCode(code: string | null | undefined): string {
  const c = (code ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "D").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.slice(0, 12) || "SR";
}

/** Tiền tố số chứng nhận lộ trình của một cơ sở trong một năm: CN-CS1-26- */
export function certificatePrefix(centerCode: string, year: number): string {
  return `CN-${certificateCenterCode(centerCode)}-${String(year).slice(-2)}-`;
}

/** Số chứng nhận lộ trình: CN-<mã cơ sở>-<yy>-<6 số> — ví dụ CN-CS1-26-000012 */
export function pathCertificateNumber(centerCode: string, year: number, seq: number): string {
  if (!Number.isInteger(seq) || seq < 1 || seq > 999_999) throw new Error("Số thứ tự chứng nhận phải từ 1 đến 999999");
  return `${certificatePrefix(centerCode, year)}${String(seq).padStart(6, "0")}`;
}

export const PATH_CERTIFICATE_NO_RE = /^CN-[A-Z0-9]{1,12}-\d{2}-\d{6}$/;
/** Số chứng nhận hợp lệ: dạng lộ trình (CN-…) hoặc dạng khoá cũ (SR-<mã khoá>-yy-nnnnnn) */
export const CERTIFICATE_NO_RE = /^(CN-[A-Z0-9]{1,12}-\d{2}-\d{6}|SR-[A-Z0-9_-]{1,30}-\d{2}-\d{6})$/;

/** Số thứ tự kế tiếp từ số lớn nhất đã cấp cùng tiền tố (null = chưa có) */
export function nextCertificateSeq(maxNumber: string | null | undefined, prefix: string): number {
  if (!maxNumber || !maxNumber.startsWith(prefix)) return 1;
  const n = Number(maxNumber.slice(prefix.length));
  return Number.isFinite(n) && n >= 0 ? n + 1 : 1;
}

/**
 * Token xác thực trong mã QR: ≥ 24 byte ngẫu nhiên, base64url (máy chủ sinh 32 byte = 43 ký tự).
 * QR trỏ tới token chứ KHÔNG trỏ số chứng nhận — số chứng nhận tăng dần nên đoán được.
 */
export const CERTIFICATE_TOKEN_RE = /^[A-Za-z0-9_-]{32,80}$/;

export function certificateVerifyPath(token: string): string {
  return `/cn/${token}`;
}

/** Lý do thu hồi bắt buộc, tối thiểu 5 ký tự */
export function validateRevokeReason(reason: string | null | undefined): string | null {
  return (reason ?? "").trim().length >= 5 ? null : "Nhập lý do thu hồi (tối thiểu 5 ký tự)";
}

/* ------------------------------------------------------------------ */
/* Định dạng ngày cấp                                                   */
/* ------------------------------------------------------------------ */

export const ISSUED_DATE_FORMATS = ["dmy", "long"] as const;
export type IssuedDateFormat = (typeof ISSUED_DATE_FORMATS)[number];
export const ISSUED_DATE_FORMAT_VI: Record<IssuedDateFormat, string> = { dmy: "dd/mm/yyyy", long: "ngày … tháng … năm …" };

/**
 * Ngày cấp in trên giấy chứng nhận. `iso` = YYYY-MM-DD (giờ Việt Nam đã quy đổi trước).
 *  - "dmy":  22/09/2026
 *  - "long": ngày 22 tháng 9 năm 2026 — theo thể thức văn bản hành chính (Nghị định 30/2020/NĐ-CP):
 *            ngày nhỏ hơn 10 và tháng 1, 2 thêm số 0 phía trước ("ngày 05 tháng 01 năm 2026").
 * `place` (tuỳ chọn) đặt trước: "Đà Nẵng, ngày 05 tháng 01 năm 2026".
 */
export function formatIssuedDate(iso: string, format: IssuedDateFormat = "dmy", place?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return "";
  const y = m[1]!;
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (format === "dmy") return `${String(d).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${y}`;
  const dd = d < 10 ? `0${d}` : String(d);
  const mm = mo <= 2 ? `0${mo}` : String(mo);
  const text = `ngày ${dd} tháng ${mm} năm ${y}`;
  const p = (place ?? "").trim();
  return p ? `${p}, ${text}` : text;
}

/** Ngày (YYYY-MM-DD) theo giờ Việt Nam của một thời điểm */
export function vnDateOf(d: Date): string {
  return new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Mẫu chứng nhận: ô trường đặt trên ảnh nền                            */
/* ------------------------------------------------------------------ */

export const TEMPLATE_ORIENTATIONS = ["landscape", "portrait"] as const;
export type TemplateOrientation = (typeof TEMPLATE_ORIENTATIONS)[number];
export const TEMPLATE_ORIENTATION_VI: Record<TemplateOrientation, string> = { landscape: "A4 ngang", portrait: "A4 dọc" };

/** Khổ giấy A4 (mm) theo hướng */
export function a4Size(o: TemplateOrientation): { widthMm: number; heightMm: number } {
  return o === "landscape" ? { widthMm: 297, heightMm: 210 } : { widthMm: 210, heightMm: 297 };
}
/** Độ phân giải khuyến nghị cho ảnh nền (300 dpi) */
export function recommendedPixels(o: TemplateOrientation): { width: number; height: number } {
  return o === "landscape" ? { width: 3508, height: 2480 } : { width: 2480, height: 3508 };
}

export const CERTIFICATE_FIELD_KEYS = [
  "studentName", "pathName", "issuedDate", "certificateNo", "centerName", "grade", "criteriaText",
  "signerName", "signerTitle", "qr", "customText",
] as const;
export type CertificateFieldKey = (typeof CERTIFICATE_FIELD_KEYS)[number];

export const CERTIFICATE_FIELD_VI: Record<CertificateFieldKey, string> = {
  studentName: "Tên học viên",
  pathName: "Tên lộ trình / khoá",
  issuedDate: "Ngày cấp",
  certificateNo: "Số chứng nhận",
  centerName: "Tên cơ sở",
  grade: "Xếp loại",
  criteriaText: "Điều kiện đạt",
  signerName: "Tên người ký",
  signerTitle: "Chức danh người ký",
  qr: "Mã QR xác thực",
  customText: "Dòng chữ tuỳ ý",
};

/** Trường mà nội dung do người soạn mẫu nhập (không lấy từ dữ liệu học viên) */
export const TEMPLATE_TEXT_FIELDS: readonly CertificateFieldKey[] = ["signerName", "signerTitle", "customText"];

export const TEMPLATE_FONTS = ["be-vietnam", "serif", "sans"] as const;
export type TemplateFont = (typeof TEMPLATE_FONTS)[number];
export const TEMPLATE_FONT_VI: Record<TemplateFont, string> = { "be-vietnam": "Be Vietnam Pro", serif: "Có chân (serif hệ thống)", sans: "Không chân (sans hệ thống)" };
/** Chỉ font đã có sẵn trong dự án / hệ điều hành — không nạp font ngoài (CSP) */
export const TEMPLATE_FONT_CSS: Record<TemplateFont, string> = {
  "be-vietnam": 'var(--font-be-vietnam), "Be Vietnam Pro", ui-sans-serif, system-ui, sans-serif',
  serif: '"Times New Roman", Times, "Noto Serif", Georgia, serif',
  sans: 'Arial, Helvetica, "Liberation Sans", sans-serif',
};

export const TEMPLATE_ALIGNS = ["left", "center", "right"] as const;
export type TemplateAlign = (typeof TEMPLATE_ALIGNS)[number];

export interface TemplateField {
  key: CertificateFieldKey;
  enabled: boolean;
  /** Toạ độ góc trên-trái và kích thước theo % của khung (0–100) — in đúng ở mọi độ phân giải */
  x: number;
  y: number;
  w: number;
  /** Chiều cao ô (%): với QR là cạnh hình vuông tính theo % CHIỀU RỘNG khung; với chữ chỉ để hiển thị khung kéo */
  h: number;
  /** Cỡ chữ (pt) khi in ra A4 — quy đổi sang đơn vị theo khung khi hiển thị */
  fontSize: number;
  bold: boolean;
  italic: boolean;
  /** #rrggbb */
  color: string;
  align: TemplateAlign;
  uppercase: boolean;
  font: TemplateFont;
  /** Chỉ cho issuedDate */
  dateFormat?: IssuedDateFormat;
  /** Chỉ cho issuedDate: địa danh đặt trước ngày ("Đà Nẵng") */
  place?: string;
  /** Nội dung chữ cho signerName / signerTitle / customText */
  text?: string;
  /** Chữ đứng trước giá trị (vd "Số: " trước số chứng nhận) */
  prefix?: string;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Bố cục mặc định (A4 ngang) — hợp với nền "để trống" giữa trang */
export function defaultTemplateFields(orientation: TemplateOrientation = "landscape"): TemplateField[] {
  const base = { enabled: true, bold: false, italic: false, color: "#241a2e", align: "center" as TemplateAlign, uppercase: false, font: "be-vietnam" as TemplateFont };
  const L = orientation === "landscape";
  const f = (key: CertificateFieldKey, x: number, y: number, w: number, h: number, fontSize: number, extra: Partial<TemplateField> = {}): TemplateField =>
    ({ ...base, key, x, y, w, h, fontSize, ...extra });
  return [
    f("studentName", 10, L ? 38 : 36, 80, L ? 10 : 7, L ? 34 : 30, { bold: true, color: "#610b8a", uppercase: true }),
    f("pathName", 12, L ? 53 : 48, 76, L ? 7 : 5, L ? 20 : 18, { bold: true, color: "#3b1a5e" }),
    f("criteriaText", 18, L ? 61 : 55, 64, L ? 9 : 8, 11, { italic: true, color: "#4b4453" }),
    f("grade", 30, L ? 71 : 64, 40, 4, 12, { enabled: false, prefix: "Xếp loại: " }),
    f("issuedDate", 55, L ? 76 : 76, 35, 4, 12, { dateFormat: "long", place: "", italic: true }),
    f("signerTitle", 55, L ? 80 : 80, 35, 4, 12, { bold: true, uppercase: true, text: "Giám đốc trung tâm" }),
    f("signerName", 55, L ? 91 : 91, 35, 4, 14, { bold: true, text: "" }),
    f("centerName", 10, L ? 80 : 80, 35, 4, 11, { enabled: false }),
    f("certificateNo", 8, L ? 91 : 93, 30, 3, 9, { align: "left", prefix: "Số: ", color: "#4b4453" }),
    f("qr", 8, L ? 71 : 80, L ? 8.5 : 11, L ? 8.5 : 11, 0, { align: "left" }),
    f("customText", 15, L ? 30 : 30, 70, 4, 13, { enabled: false, text: "" }),
  ];
}

/** Kiểm tra một trường của mẫu: toạ độ 0–100 %, ô không tràn khung, cỡ chữ, màu… Trả mảng lỗi tiếng Việt */
export function validateTemplateField(f: TemplateField): string[] {
  const label = CERTIFICATE_FIELD_VI[f.key] ?? f.key;
  const errs: string[] = [];
  const nums: [string, number][] = [["x", f.x], ["y", f.y], ["w", f.w], ["h", f.h]];
  for (const [k, v] of nums) if (!Number.isFinite(v) || v < 0 || v > 100) errs.push(`${label}: toạ độ ${k} phải trong 0–100%`);
  if (Number.isFinite(f.w) && f.w < 1) errs.push(`${label}: độ rộng tối thiểu 1%`);
  if (Number.isFinite(f.x) && Number.isFinite(f.w) && f.x + f.w > 100.01) errs.push(`${label}: ô tràn ra ngoài mép phải`);
  if (Number.isFinite(f.y) && f.y > 99) errs.push(`${label}: ô nằm ngoài mép dưới`);
  if (f.key !== "qr" && (!Number.isFinite(f.fontSize) || f.fontSize < 6 || f.fontSize > 144)) errs.push(`${label}: cỡ chữ 6–144 pt`);
  if (!HEX_RE.test(f.color ?? "")) errs.push(`${label}: màu phải dạng #rrggbb`);
  if (!(TEMPLATE_ALIGNS as readonly string[]).includes(f.align)) errs.push(`${label}: căn lề không hợp lệ`);
  if (!(TEMPLATE_FONTS as readonly string[]).includes(f.font)) errs.push(`${label}: phông chữ không hợp lệ`);
  if ((f.text ?? "").length > 300) errs.push(`${label}: nội dung tối đa 300 ký tự`);
  if ((f.prefix ?? "").length > 40) errs.push(`${label}: chữ đứng trước tối đa 40 ký tự`);
  if ((f.place ?? "").length > 60) errs.push(`${label}: địa danh tối đa 60 ký tự`);
  return errs;
}

export function validateTemplateFields(fields: readonly TemplateField[]): string[] {
  const errs: string[] = [];
  const keys = fields.map((f) => f.key);
  for (const k of keys) if (!(CERTIFICATE_FIELD_KEYS as readonly string[]).includes(k)) errs.push(`Trường không hỗ trợ: ${k}`);
  if (new Set(keys).size !== keys.length) errs.push("Mỗi trường chỉ đặt một lần");
  for (const f of fields) errs.push(...validateTemplateField(f));
  if (!fields.some((f) => f.key === "studentName" && f.enabled)) errs.push("Mẫu phải hiển thị tên học viên");
  return errs;
}

/**
 * Chuẩn hoá dữ liệu trường từ máy khách / CSDL: kẹp toạ độ vào khung, làm tròn 2 số lẻ,
 * bổ sung trường còn thiếu (tắt), bỏ trường lạ. Dùng trước khi lưu và khi đọc JSON cũ.
 */
export function normalizeTemplateFields(input: unknown, orientation: TemplateOrientation = "landscape"): TemplateField[] {
  const defs = defaultTemplateFields(orientation);
  const arr = Array.isArray(input) ? (input as Partial<TemplateField>[]) : [];
  return defs.map((d) => {
    const raw = arr.find((x) => x && typeof x === "object" && x.key === d.key);
    if (!raw) return { ...d, enabled: false };
    const num = (v: unknown, fb: number) => (typeof v === "number" && Number.isFinite(v) ? v : fb);
    const w = clamp(num(raw.w, d.w), 1, 100);
    const h = clamp(num(raw.h, d.h), 0.5, 100);
    const x = clamp(num(raw.x, d.x), 0, 100 - w);
    const y = clamp(num(raw.y, d.y), 0, 99);
    const out: TemplateField = {
      key: d.key,
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : d.enabled,
      x: round2(x), y: round2(y), w: round2(w), h: round2(h),
      fontSize: d.key === "qr" ? 0 : round2(clamp(num(raw.fontSize, d.fontSize), 6, 144)),
      bold: typeof raw.bold === "boolean" ? raw.bold : d.bold,
      italic: typeof raw.italic === "boolean" ? raw.italic : d.italic,
      color: typeof raw.color === "string" && HEX_RE.test(raw.color) ? raw.color.toLowerCase() : d.color,
      align: (TEMPLATE_ALIGNS as readonly string[]).includes(String(raw.align)) ? (raw.align as TemplateAlign) : d.align,
      uppercase: typeof raw.uppercase === "boolean" ? raw.uppercase : d.uppercase,
      font: (TEMPLATE_FONTS as readonly string[]).includes(String(raw.font)) ? (raw.font as TemplateFont) : d.font,
    };
    if (d.key === "issuedDate") {
      out.dateFormat = (ISSUED_DATE_FORMATS as readonly string[]).includes(String(raw.dateFormat)) ? (raw.dateFormat as IssuedDateFormat) : d.dateFormat ?? "long";
      out.place = typeof raw.place === "string" ? raw.place.slice(0, 60) : d.place ?? "";
    }
    if (TEMPLATE_TEXT_FIELDS.includes(d.key)) out.text = typeof raw.text === "string" ? raw.text.slice(0, 300) : d.text ?? "";
    if (typeof raw.prefix === "string") out.prefix = raw.prefix.slice(0, 40);
    else if (d.prefix !== undefined) out.prefix = d.prefix;
    return out;
  });
}

/**
 * Cỡ chữ theo khung: pt khi in A4 → đơn vị `cqw` (% chiều rộng khung chứa).
 * Khung hiển thị đặt `container-type: inline-size` nên chữ co giãn đúng tỷ lệ ở trình dựng, xem thử và bản in.
 */
export function fontSizeCqw(pt: number, orientation: TemplateOrientation): number {
  const { widthMm } = a4Size(orientation);
  const widthPt = (widthMm / 25.4) * 72;
  return Math.round((pt / widthPt) * 100 * 1000) / 1000;
}

/* ------------------------------------------------------------------ */
/* Bản chụp nội dung đã in                                              */
/* ------------------------------------------------------------------ */

/**
 * Mọi chữ đã in lên chứng nhận, chụp lại lúc cấp — bản in lại luôn giống bản gốc
 * dù sau này đổi tên lộ trình, tên cơ sở, người ký hay học viên đổi tên.
 */
export interface CertificateSnapshot {
  v: 1;
  kind: CertificateKind;
  certificateNo: string;
  studentName: string;
  studentCode: string | null;
  /** Tên thành tích: tên lộ trình hoặc tên khoá */
  pathName: string;
  /** Mô tả ngắn thành tích (Open Badges: description) */
  description: string | null;
  /** Điều kiện đạt (Open Badges: criteria.narrative) */
  criteriaText: string;
  /** Các khoá đã hoàn thành làm căn cứ */
  courses: { code: string; name: string }[];
  /** YYYY-MM-DD giờ Việt Nam */
  issuedDate: string;
  grade: string | null;
  centerName: string;
  centerAddress: string | null;
  centerPhone: string | null;
  /** Đơn vị cấp (tên trung tâm / pháp nhân) */
  issuerName: string;
  signerName: string;
  signerTitle: string;
  customText: string;
}

export function buildCertificateSnapshot(input: {
  kind: CertificateKind;
  certificateNo: string;
  student: { fullName: string; code?: string | null };
  achievement: { name: string; description?: string | null; criteriaText?: string | null };
  courses?: { code: string; name: string }[];
  issuedAt: Date;
  grade?: string | null;
  center: { name: string; address?: string | null; phone?: string | null };
  issuerName?: string | null;
  template?: { fields: readonly TemplateField[] } | null;
}): CertificateSnapshot {
  const fieldText = (k: CertificateFieldKey) => (input.template?.fields.find((f) => f.key === k)?.text ?? "").trim();
  const criteria = (input.achievement.criteriaText ?? "").trim();
  return {
    v: 1,
    kind: input.kind,
    certificateNo: input.certificateNo,
    studentName: input.student.fullName.trim(),
    studentCode: input.student.code ?? null,
    pathName: input.achievement.name.trim(),
    description: (input.achievement.description ?? "").trim() || null,
    criteriaText: criteria || (input.kind === "course" ? `Hoàn thành chương trình khoá học ${input.achievement.name.trim()}` : `Hoàn thành các khoá bắt buộc của ${input.achievement.name.trim()}`),
    courses: input.courses ?? [],
    issuedDate: vnDateOf(input.issuedAt),
    grade: (input.grade ?? "").trim() || null,
    centerName: input.center.name,
    centerAddress: input.center.address ?? null,
    centerPhone: input.center.phone ?? null,
    issuerName: (input.issuerName ?? "").trim() || "Sata Robo",
    signerName: fieldText("signerName"),
    signerTitle: fieldText("signerTitle"),
    customText: fieldText("customText"),
  };
}

export function isCertificateSnapshot(x: unknown): x is CertificateSnapshot {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  return s.v === 1 && typeof s.studentName === "string" && typeof s.pathName === "string" && typeof s.certificateNo === "string" && typeof s.issuedDate === "string";
}

/** Dữ liệu mẫu cho nút "Xem thử với dữ liệu mẫu" ở trình dựng */
export function sampleCertificateSnapshot(fields: readonly TemplateField[] = [], now = new Date()): CertificateSnapshot {
  return buildCertificateSnapshot({
    kind: "path",
    certificateNo: pathCertificateNumber("CS1", now.getFullYear(), 12),
    student: { fullName: "Nguyễn Minh An", code: "HV-MAU" },
    achievement: { name: "Lộ trình Robotics nền tảng", criteriaText: "Hoàn thành 2 khoá bắt buộc: Sata1 — Luyện thi RoboSim và Sata4 — Bứt Phá Giới Hạn, chuyên cần từ 80%." },
    courses: [{ code: "SATA1", name: "Sata1" }, { code: "SATA4", name: "Sata4" }],
    issuedAt: now,
    grade: "Giỏi",
    center: { name: "Sata Robo Cơ sở 1", address: null, phone: null },
    template: { fields },
  });
}

/**
 * Chữ hiển thị cho một trường (đã áp chữ đứng trước và IN HOA).
 * Trường mẫu (người ký, dòng tuỳ ý) lấy từ BẢN CHỤP nếu có, không thì từ cấu hình mẫu (xem thử).
 * Trả chuỗi rỗng = không in gì. QR xử lý riêng.
 */
export function certificateFieldText(f: TemplateField, s: CertificateSnapshot): string {
  let v = "";
  switch (f.key) {
    case "studentName": v = s.studentName; break;
    case "pathName": v = s.pathName; break;
    case "issuedDate": v = formatIssuedDate(s.issuedDate, f.dateFormat ?? "long", f.place); break;
    case "certificateNo": v = s.certificateNo; break;
    case "centerName": v = s.centerName; break;
    case "grade": v = s.grade ?? ""; break;
    case "criteriaText": v = s.criteriaText; break;
    case "signerName": v = s.signerName || (f.text ?? ""); break;
    case "signerTitle": v = s.signerTitle || (f.text ?? ""); break;
    case "customText": v = s.customText || (f.text ?? ""); break;
    case "qr": return "";
  }
  v = v.trim();
  if (!v) return "";
  const out = `${f.prefix ?? ""}${v}`;
  return f.uppercase ? out.toLocaleUpperCase("vi-VN") : out;
}

/* ------------------------------------------------------------------ */
/* Ảnh nền                                                              */
/* ------------------------------------------------------------------ */

export const CERTIFICATE_BG_MAX_BYTES = 15 * 1024 * 1024;
export const CERTIFICATE_BG_MIME = ["image/png", "image/jpeg"] as const;

/** Kích thước ảnh PNG / JPEG đọc từ phần đầu tệp (không giải nén). null nếu không đọc được */
export function readImageSize(data: Uint8Array): { width: number; height: number } | null {
  // PNG: chữ ký 8 byte, rồi khối IHDR: độ dài(4) "IHDR"(4) rộng(4) cao(4)
  if (data.length >= 24 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    const u32 = (o: number) => ((data[o]! << 24) >>> 0) + (data[o + 1]! << 16) + (data[o + 2]! << 8) + data[o + 3]!;
    const w = u32(16);
    const h = u32(20);
    return w > 0 && h > 0 ? { width: w, height: h } : null;
  }
  // JPEG: duyệt các đoạn tới khung SOFn (C0–CF trừ C4, C8, CC)
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    let i = 2;
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) { i++; continue; }
      const marker = data[i + 1]!;
      if (marker === 0xff) { i++; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = (data[i + 2]! << 8) + data[i + 3]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const h = (data[i + 5]! << 8) + data[i + 6]!;
        const w = (data[i + 7]! << 8) + data[i + 8]!;
        return w > 0 && h > 0 ? { width: w, height: h } : null;
      }
      if (len < 2) return null;
      i += 2 + len;
    }
  }
  return null;
}

/**
 * Nhận xét ảnh nền so với khổ A4 của mẫu: lệch tỷ lệ > 3% hoặc độ phân giải thấp (< 150 dpi) → cảnh báo.
 * Không chặn — ảnh vẫn phủ kín trang (có thể bị kéo giãn nhẹ).
 */
export function backgroundWarnings(size: { width: number; height: number }, orientation: TemplateOrientation): string[] {
  const out: string[] = [];
  const { widthMm, heightMm } = a4Size(orientation);
  const want = widthMm / heightMm;
  const got = size.width / size.height;
  if ((size.width > size.height) !== (orientation === "landscape")) out.push(`Ảnh đang ${size.width > size.height ? "nằm ngang" : "dọc"} nhưng mẫu chọn ${TEMPLATE_ORIENTATION_VI[orientation]}`);
  else if (Math.abs(got - want) / want > 0.03) out.push(`Tỷ lệ ảnh ${size.width}×${size.height} lệch khổ A4 — ảnh sẽ bị kéo giãn nhẹ khi in`);
  const dpi = size.width / (widthMm / 25.4);
  if (dpi < 150) out.push(`Độ phân giải thấp (~${Math.round(dpi)} dpi) — bản in có thể bị mờ; nên xuất ${recommendedPixels(orientation).width}×${recommendedPixels(orientation).height} px`);
  return out;
}

/** Khoá tệp ảnh nền hợp lệ: tệp tải lên (certificates/…png|jpg) hoặc nền dựng sẵn (builtin/<tên>.svg) */
export const CERTIFICATE_BG_KEY_RE = /^(certificates\/[A-Za-z0-9/_.-]+\.(png|jpg)|builtin\/[a-z0-9-]+\.svg)$/;

/** Đường dẫn công khai của nền dựng sẵn (apps/web/public/mau-chung-nhan/…) */
export function builtinBackgroundPath(key: string): string | null {
  const m = /^builtin\/([a-z0-9-]+\.svg)$/.exec(key);
  return m ? `/mau-chung-nhan/${m[1]}` : null;
}
