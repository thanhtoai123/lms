/**
 * Tiếp nhận lead: chặn chốt khi chưa thu, gộp phiếu trùng số điện thoại, token ghi chú của file
 * "đã đăng ký", đọc file nhập lead (CSV / TSV dán từ Excel). Không phụ thuộc DB.
 */
import { normalizeVnPhone } from "./leadMachine.js";
import { parseCsv, parseVnAmount, parseVnDate } from "../finance/bank.js";

/* ------------------------------------------------------------------ */
/* Chặn chốt khi chưa ghi nhận thanh toán                               */
/* ------------------------------------------------------------------ */

export const CONVERSION_GATE_MESSAGE = "Chưa đủ điều kiện chốt — cần ghi nhận thanh toán trước";

export interface LeadOrderLite {
  status: string;
  total: number;
  /** Khoản kế toán đã xác nhận */
  confirmed: number;
  /** Khoản sale đã ghi nhận, chờ kế toán */
  recorded: number;
}

/** Trạng thái đơn không còn hiệu lực với khối "Thanh toán" của lead */
const INACTIVE_ORDER = new Set(["cancelled", "refunded"]);

/** Tổng hợp đơn của lead: Đã nộp (= đã ghi nhận + đã xác nhận, tiền đã về là đã về) / Tổng phải thu / Còn thiếu */
export function summarizeLeadOrders(orders: readonly LeadOrderLite[]) {
  const active = orders.filter((o) => !INACTIVE_ORDER.has(o.status));
  const total = active.reduce((s, o) => s + o.total, 0);
  const confirmed = active.reduce((s, o) => s + o.confirmed, 0);
  const recorded = active.reduce((s, o) => s + o.recorded, 0);
  const paid = confirmed + recorded;
  return { count: active.length, total, confirmed, recorded, paid, outstanding: Math.max(0, total - paid) };
}

/**
 * Điều kiện chốt: phải có đơn của lead và đã ghi nhận ít nhất một khoản thu.
 * Đơn 0đ (học bổng toàn phần) cho qua. Trả về thông báo lỗi hoặc null.
 */
export function conversionGate(p: { orders: number; total: number; recorded: number; confirmed: number }): string | null {
  if (p.orders <= 0) return CONVERSION_GATE_MESSAGE;
  if (p.total > 0 && p.recorded + p.confirmed <= 0) return CONVERSION_GATE_MESSAGE;
  return null;
}

/** Học bổng toàn phần: lý do bắt buộc (≥ 5 ký tự) */
export function checkScholarshipReason(reason: string | null | undefined): string | null {
  return (reason ?? "").trim().length >= 5 ? null : "Học bổng toàn phần cần lý do (tối thiểu 5 ký tự)";
}

/** CCCD / CMND: 9 hoặc 12 chữ số */
export function isValidIdNumber(s: string | null | undefined): boolean {
  const t = (s ?? "").replace(/\s/g, "");
  return /^\d{9}$/.test(t) || /^\d{12}$/.test(t);
}

/* ------------------------------------------------------------------ */
/* Gộp phiếu nhập trùng số điện thoại                                   */
/* ------------------------------------------------------------------ */

/** Chuẩn hoá tên để so khớp: bỏ dấu, thường, gộp khoảng trắng */
export function normalizePersonName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export const FACEBOOK_URL_RE = /^(https?:\/\/)?((www|m|web|mbasic)\.)?(facebook\.com|fb\.com|m\.me)\/\S+$/i;
export function isFacebookUrl(s: string | null | undefined): boolean {
  return FACEBOOK_URL_RE.test((s ?? "").trim());
}

/** Tên tạm khi phiếu nhập không có tên phụ huynh */
export const PLACEHOLDER_PARENT_NAME = "Khách chưa rõ tên";

export const INTAKE_FIELDS = ["parentName", "email", "centerId", "source", "facebookUrl", "childName"] as const;
export type IntakeField = (typeof INTAKE_FIELDS)[number];
export const INTAKE_FIELD_VI: Record<IntakeField, string> = {
  parentName: "Tên PH",
  email: "Email",
  centerId: "Cơ sở",
  source: "Nguồn",
  facebookUrl: "Facebook",
  childName: "Tên con",
};

export interface IntakeChild {
  fullName: string;
  birthYear?: number | null;
  grade?: number | null;
  school?: string | null;
  interestedCourseId?: string | null;
  notes?: string | null;
}
type ChildField = "birthYear" | "grade" | "school" | "interestedCourseId";
const CHILD_FIELDS: readonly ChildField[] = ["birthYear", "grade", "school", "interestedCourseId"];
const CHILD_FIELD_VI: Record<ChildField, string> = { birthYear: "năm sinh", grade: "lớp", school: "trường", interestedCourseId: "khoá quan tâm" };

export type IntakeSnapshot = Partial<Record<IntakeField, string | null>> & {
  notes?: string | null;
  children: (IntakeChild & { id?: string })[];
};

export interface MergeResult {
  patch: Partial<Record<IntakeField, string>>;
  childrenToAdd: IntakeChild[];
  childPatches: { id: string; patch: Partial<Pick<IntakeChild, ChildField>> }[];
  /** Đoạn nối vào ghi chú (đã kèm ngày) — null nếu không có gì */
  noteAppend: string | null;
  conflicts: { field: string; existing: string; incoming: string; overwritten: boolean }[];
  changed: boolean;
}

const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const str = (v: unknown) => (blank(v) ? "" : String(v).trim());

/** "2026-09-17" → "17/09/2026" */
export function viDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Nối ghi chú (không lặp lại đoạn đã có) */
export function appendNote(existing: string | null | undefined, add: string | null | undefined): string | null {
  const a = str(add);
  const e = str(existing);
  if (!a) return e || null;
  if (e.includes(a)) return e;
  return e ? `${e}\n${a}` : a;
}

/**
 * Gộp phiếu nhập mới vào lead đã có (trùng SĐT):
 * - chỉ điền ô đang trống; ô trống ở phiếu mới KHÔNG bao giờ xoá dữ liệu;
 * - giá trị khác nhau ghi vào ghi chú kèm ngày (overwrite = true: lấy giá trị mới, giá trị cũ vào ghi chú);
 * - con mới (so theo tên chuẩn hoá) được thêm; con đã có chỉ điền ô trống;
 * - ghi chú của phiếu mới được nối thêm. Không bao giờ đổi trạng thái phễu.
 */
export function mergeIntake(
  existing: IntakeSnapshot,
  incoming: IntakeSnapshot,
  opts: { today: string; overwrite?: boolean; display?: (field: string, value: string) => string },
): MergeResult {
  const show = (f: string, v: string) => (opts.display ? opts.display(f, v) : v);
  const patch: MergeResult["patch"] = {};
  const conflicts: MergeResult["conflicts"] = [];
  const lines: string[] = [];
  const same = (f: IntakeField, a: string, b: string) =>
    f === "email" ? a.toLowerCase() === b.toLowerCase() : f === "parentName" || f === "childName" || f === "source" ? normalizePersonName(a) === normalizePersonName(b) : a === b;

  for (const f of INTAKE_FIELDS) {
    const inc = str(incoming[f]);
    if (!inc) continue;
    let cur = str(existing[f]);
    if (f === "parentName" && cur === PLACEHOLDER_PARENT_NAME) cur = "";
    if (f === "parentName" && inc === PLACEHOLDER_PARENT_NAME) continue;
    if (!cur) {
      patch[f] = inc;
      continue;
    }
    if (same(f, cur, inc)) continue;
    const label = INTAKE_FIELD_VI[f];
    if (opts.overwrite) {
      patch[f] = inc;
      conflicts.push({ field: f, existing: cur, incoming: inc, overwritten: true });
      lines.push(`${label} cũ: "${show(f, cur)}" (đã thay bằng "${show(f, inc)}")`);
    } else {
      conflicts.push({ field: f, existing: cur, incoming: inc, overwritten: false });
      lines.push(`${label} khác: "${show(f, inc)}" (đang giữ "${show(f, cur)}")`);
    }
  }

  const childrenToAdd: IntakeChild[] = [];
  const childPatches: MergeResult["childPatches"] = [];
  const known = new Map<string, IntakeChild & { id?: string }>();
  for (const c of existing.children) if (str(c.fullName)) known.set(normalizePersonName(c.fullName), c);
  for (const c of incoming.children) {
    const name = str(c.fullName);
    if (!name) continue;
    const key = normalizePersonName(name);
    const cur = known.get(key);
    if (!cur) {
      const add: IntakeChild = { fullName: name, birthYear: c.birthYear ?? null, grade: c.grade ?? null, school: str(c.school) || null, interestedCourseId: c.interestedCourseId ?? null, notes: str(c.notes) || null };
      childrenToAdd.push(add);
      known.set(key, add);
      continue;
    }
    const p: Partial<Pick<IntakeChild, ChildField>> = {};
    for (const f of CHILD_FIELDS) {
      const inc = c[f];
      if (blank(inc)) continue;
      const was = cur[f];
      if (blank(was)) {
        (p as Record<string, unknown>)[f] = typeof inc === "string" ? inc.trim() : inc;
        continue;
      }
      if (String(was).trim() === String(inc).trim()) continue;
      const label = `Con ${cur.fullName} — ${CHILD_FIELD_VI[f]}`;
      if (opts.overwrite && cur.id) {
        (p as Record<string, unknown>)[f] = typeof inc === "string" ? inc.trim() : inc;
        lines.push(`${label} cũ: "${show(f, String(was))}" (đã thay bằng "${show(f, String(inc))}")`);
      } else {
        lines.push(`${label} khác: "${show(f, String(inc))}" (đang giữ "${show(f, String(was))}")`);
      }
      conflicts.push({ field: `child.${f}`, existing: String(was), incoming: String(inc), overwritten: !!(opts.overwrite && cur.id) });
    }
    if (cur.id && Object.keys(p).length) {
      childPatches.push({ id: cur.id, patch: p });
      Object.assign(cur, p);
    }
  }

  const incNote = str(incoming.notes);
  if (incNote && !str(existing.notes).includes(incNote)) lines.push(`Ghi chú: ${incNote}`);
  const noteAppend = lines.length ? `[${viDate(opts.today)}] Nhập lại: ${lines.join("; ")}` : null;
  return {
    patch,
    childrenToAdd,
    childPatches,
    noteAppend,
    conflicts,
    changed: Object.keys(patch).length > 0 || childrenToAdd.length > 0 || childPatches.length > 0 || noteAppend !== null,
  };
}

/* ------------------------------------------------------------------ */
/* Token ghi chú của file "đã đăng ký": ĐãĐóng=, HạnĐợt2=               */
/* ------------------------------------------------------------------ */

export function parseNoteTokens(notes: string | null | undefined): { paid?: number; dueDate2?: string } {
  const s = (notes ?? "").normalize("NFC");
  const out: { paid?: number; dueDate2?: string } = {};
  const p = /(?:đãđóng|dadong|đã\s+đóng)\s*=\s*([0-9][0-9.,\s]*(?:đ|vnd|vnđ)?)/iu.exec(s);
  if (p) {
    const n = parseVnAmount(p[1]!.trim());
    if (n !== null) out.paid = n;
  }
  const d = /(?:hạnđợt2|handot2|hạn\s+đợt\s*2)\s*=\s*([0-9][0-9/.-]*)/iu.exec(s);
  if (d) {
    const iso = parseVnDate(d[1]!);
    if (iso) out.dueDate2 = iso;
  }
  return out;
}

export function formatNoteTokens(t: { paid?: number | null; dueDate2?: string | null }): string {
  return [t.paid ? `ĐãĐóng=${t.paid}` : null, t.dueDate2 ? `HạnĐợt2=${t.dueDate2}` : null].filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/* Nhập lead từ file (cột cố định)                                      */
/* ------------------------------------------------------------------ */

export const LEAD_IMPORT_MAX_ROWS = 5000;

/** Cột cố định theo file mẫu; khoá chuẩn → các cách viết tiêu đề (không dấu, nối "_") */
export const LEAD_IMPORT_ALIASES = {
  parentName: ["ten_phu_huynh", "ho_ten_phu_huynh", "phu_huynh", "ten_ph", "ho_ten_ph", "parent_name"],
  phone: ["sdt", "so_dien_thoai", "dien_thoai", "sdt_phu_huynh", "phone"],
  email: ["email", "e_mail"],
  childName: ["ten_con", "ho_ten_con", "ten_hoc_vien", "ho_ten_hoc_vien", "ten_hoc_sinh", "ten_be", "child_name"],
  childAge: ["tuoi_con", "tuoi", "child_age"],
  centerCode: ["co_so", "ma_co_so", "ma_cs", "center"],
  course: ["khoa_quan_tam", "khoa_hoc", "khoa", "course"],
  source: ["nguon", "source"],
  notes: ["ghi_chu", "notes", "note"],
  sale: ["sale_phu_trach", "sale", "tu_van_vien", "nhan_vien_phu_trach"],
  paid: ["da_dong", "so_tien_da_dong", "da_nop"],
  dueDate2: ["han_dot_2", "han_dong_dot_2"],
  registeredAt: ["ngay_dang_ky", "ngay_dk"],
} as const satisfies Record<string, readonly string[]>;
export type LeadImportKey = keyof typeof LEAD_IMPORT_ALIASES;
export const LEAD_IMPORT_KEYS = Object.keys(LEAD_IMPORT_ALIASES) as LeadImportKey[];

/** Tiêu đề file mẫu (theo thứ tự cột) */
export const LEAD_IMPORT_TEMPLATE = ["Tên phụ huynh", "SĐT", "Email", "Tên con", "Tuổi con", "Cơ sở", "Khoá quan tâm", "Nguồn", "Ghi chú", "Sale phụ trách"];
export const LEAD_REGISTERED_TEMPLATE = [...LEAD_IMPORT_TEMPLATE, "Đã đóng", "Hạn đợt 2", "Ngày đăng ký"];

export type RawLeadImportRow = { line: number } & Record<LeadImportKey, string>;

const foldHeader = (h: string) =>
  h.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** Map tiêu đề → khoá; chấp nhận tiêu đề có chú thích phía sau ("Cơ sở (mã CS, để trống)") */
export function mapLeadImportHeader(header: readonly string[]): Partial<Record<LeadImportKey, number>> {
  const index: Partial<Record<LeadImportKey, number>> = {};
  header.forEach((h, i) => {
    const f = foldHeader(h);
    if (!f) return;
    const hit = LEAD_IMPORT_KEYS.find((k) => index[k] === undefined && (LEAD_IMPORT_ALIASES[k] as readonly string[]).some((a) => f === a || f.startsWith(`${a}_`)));
    if (hit) index[hit] = i;
  });
  return index;
}

export function emptyImportRow(line: number): RawLeadImportRow {
  return Object.fromEntries([["line", line], ...LEAD_IMPORT_KEYS.map((k) => [k, ""])]) as RawLeadImportRow;
}

/** Đọc bảng (CSV, chấm phẩy hoặc tab — dán thẳng từ Excel được) → các dòng thô, chưa kiểm tra */
export function parseLeadImportTable(text: string, maxRows = LEAD_IMPORT_MAX_ROWS): { headerErrors: string[]; rows: RawLeadImportRow[] } {
  const all = parseCsv(text);
  if (all.length < 2) return { headerErrors: ["File cần dòng tiêu đề và ít nhất 1 dòng dữ liệu"], rows: [] };
  const index = mapLeadImportHeader(all[0]!);
  const headerErrors: string[] = [];
  if (index.phone === undefined) headerErrors.push("Thiếu cột SĐT");
  if (all.length - 1 > maxRows) headerErrors.push(`File quá lớn (${all.length - 1} dòng). Tối đa ${maxRows}.`);
  if (headerErrors.length) return { headerErrors, rows: [] };
  const rows = all.slice(1).map((r, i) => {
    const row = emptyImportRow(i + 2);
    for (const k of LEAD_IMPORT_KEYS) if (index[k] !== undefined) row[k] = (r[index[k]!] ?? "").trim();
    return row;
  });
  return { headerErrors, rows };
}

export interface CheckedImportRow {
  errors: string[];
  warnings: string[];
  phoneNormalized: string | null;
  age: number | null;
  birthYear: number | null;
  paid: number | null;
  dueDate2: string | null;
  registeredAt: string | null;
}

/** Kiểm tra định dạng một dòng (chưa tra mã cơ sở / khoá / sale) */
export function checkLeadImportRow(row: RawLeadImportRow, today: string): CheckedImportRow {
  const errors: string[] = [];
  const warnings: string[] = [];
  const phoneNormalized = row.phone.trim() ? normalizeVnPhone(row.phone) : null;
  if (!phoneNormalized) errors.push("SĐT thiếu hoặc không hợp lệ (09xx / +84)");
  if (row.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) errors.push("Email không hợp lệ");
  if (row.parentName.length > 120) errors.push("Tên phụ huynh quá 120 ký tự");
  if (row.childName.length > 120) errors.push("Tên con quá 120 ký tự");
  if (row.notes.length > 2000) errors.push("Ghi chú quá 2000 ký tự");
  let age: number | null = null;
  if (row.childAge.trim()) {
    const n = Number(row.childAge.trim());
    if (!Number.isInteger(n) || n < 3 || n > 18) errors.push("Tuổi con phải là số nguyên 3–18 hoặc để trống");
    else age = n;
  }
  const year = Number(today.slice(0, 4));
  const birthYear = age !== null ? year - age : null;
  let paid: number | null = null;
  const paidRaw = row.paid.trim();
  if (paidRaw && paidRaw !== "0") {
    paid = parseVnAmount(paidRaw);
    if (paid === null) errors.push("Số tiền đã đóng không hợp lệ");
  }
  let dueDate2: string | null = null;
  if (row.dueDate2.trim()) {
    dueDate2 = parseVnDate(row.dueDate2);
    if (!dueDate2) errors.push("Hạn đợt 2 không hợp lệ (dd/mm/yyyy)");
  }
  let registeredAt: string | null = null;
  if (row.registeredAt.trim()) {
    registeredAt = parseVnDate(row.registeredAt);
    if (!registeredAt) errors.push("Ngày đăng ký không hợp lệ (dd/mm/yyyy)");
    else if (registeredAt > today) errors.push("Ngày đăng ký ở tương lai");
  }
  if (!row.parentName.trim()) warnings.push("Không có tên phụ huynh");
  if (!row.childName.trim() && (age !== null || row.course.trim())) warnings.push("Có tuổi / khoá nhưng thiếu tên con — bỏ qua thông tin con");
  return { errors, warnings, phoneNormalized, age, birthYear, paid, dueDate2, registeredAt };
}

export type ImportGroup = "new" | "dup" | "error";

/**
 * Chia dòng thành Mới / Trùng / Lỗi. Trùng = SĐT đã có trong CRM hoặc lặp lại trong file
 * (dòng sau gộp vào dòng đầu tiên cùng số).
 */
export function groupLeadImport(
  rows: readonly { line: number; phone: string; phoneNormalized: string | null; errors: readonly string[] }[],
  existingPhones: ReadonlySet<string>,
): Map<number, { group: ImportGroup; firstLine: number | null; existing: boolean; messages: string[] }> {
  const out = new Map<number, { group: ImportGroup; firstLine: number | null; existing: boolean; messages: string[] }>();
  const first = new Map<string, number>();
  for (const r of rows) {
    if (r.errors.length || !r.phoneNormalized) {
      out.set(r.line, { group: "error", firstLine: null, existing: false, messages: [...r.errors] });
      continue;
    }
    const existing = existingPhones.has(r.phoneNormalized);
    const messages: string[] = [];
    const f = first.get(r.phoneNormalized);
    if (f !== undefined) messages.push(`Trùng ${r.phone} với dòng ${f} trong file — hai dòng sẽ gộp làm một khi nhập`);
    else first.set(r.phoneNormalized, r.line);
    if (existing) messages.push("SĐT đã có trong CRM — chỉ điền ô trống, thêm con mới, giá trị khác ghi vào ghi chú (tick Đè để lấy dữ liệu file)");
    out.set(r.line, { group: existing || f !== undefined ? "dup" : "new", firstLine: f ?? null, existing, messages });
  }
  return out;
}

/** Gom các dòng cùng SĐT (giữ thứ tự xuất hiện đầu tiên) */
export function collapseByPhone<T extends { phoneNormalized: string | null }>(rows: readonly T[]): { phone: string; rows: T[] }[] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    if (!r.phoneNormalized) continue;
    const list = map.get(r.phoneNormalized);
    if (list) list.push(r);
    else map.set(r.phoneNormalized, [r]);
  }
  return [...map.entries()].map(([phone, list]) => ({ phone, rows: list }));
}
