/**
 * Chuyển đổi từ hệ thống cũ (admin.satarobo.vn) sang hệ mới:
 * - Nhập học viên + phụ huynh, nhập ghi danh (số buổi đã học mang sang) từ file CSV xuất ở hệ cũ.
 * - Đối soát số liệu tổng (học viên, ghi danh, buổi còn lại, công nợ) và từng học viên.
 * - Go-live theo cơ sở: chuẩn bị → chạy song song → chính thức → hệ cũ chỉ đọc.
 */
import { mapHeaders, parseCsv, parseVnAmount, parseVnDate } from "../finance/bank.js";
import { normalizeVnPhone } from "../admissions/leadMachine.js";
import type { EnrollmentStatus } from "../types.js";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export class MigrationRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationRuleError";
  }
}

export interface ParsedRow<T> {
  line: number;
  row: T | null;
  errors: string[];
  warnings: string[];
}
export interface ParsedFile<T> {
  rows: ParsedRow<T>[];
  headerErrors: string[];
}

/* ------------------------------------------------------------------ */
/* Học viên + phụ huynh                                                 */
/* ------------------------------------------------------------------ */

export const STUDENT_IMPORT_ALIASES = {
  legacyCode: ["ma_hv_cu", "ma_hv", "ma_hoc_vien", "student_code", "ma"],
  fullName: ["ho_ten", "ho_ten_hv", "ten_hv", "hoc_vien", "ten_hoc_vien", "full_name"],
  nickname: ["ten_goi", "biet_danh", "nickname"],
  dob: ["ngay_sinh", "dob", "sinh_nhat"],
  gender: ["gioi_tinh", "gender"],
  grade: ["khoi", "lop_pho_thong", "lop_o_truong", "grade"],
  school: ["truong", "truong_hoc", "school"],
  center: ["co_so", "ma_co_so", "center", "chi_nhanh"],
  status: ["trang_thai", "status", "tinh_trang"],
  parentName: ["ten_ph", "ho_ten_ph", "phu_huynh", "parent_name", "nguoi_giam_ho"],
  parentPhone: ["sdt_ph", "so_dien_thoai", "sdt", "dien_thoai", "phone", "sdt_phu_huynh"],
  parentEmail: ["email_ph", "email", "parent_email"],
  relation: ["quan_he", "relation"],
  parent2Name: ["ten_ph_2", "phu_huynh_2"],
  parent2Phone: ["sdt_ph_2", "so_dien_thoai_2"],
  healthNotes: ["suc_khoe", "luu_y_suc_khoe", "di_ung"],
  note: ["ghi_chu", "note"],
} as const satisfies Record<string, string[]>;
type StudentKey = keyof typeof STUDENT_IMPORT_ALIASES;

export type LegacyStudentStatus = "prospect" | "trial" | "active" | "paused" | "alumni" | "withdrawn";
export interface StudentImportRow {
  line: number;
  legacyCode: string;
  fullName: string;
  nickname: string | null;
  dateOfBirth: string | null;
  gender: "male" | "female" | null;
  grade: number | null;
  school: string | null;
  center: string;
  status: LegacyStudentStatus;
  parentName: string;
  parentPhone: string;
  parentEmail: string | null;
  relation: string;
  parent2: { name: string; phone: string } | null;
  healthNotes: string | null;
  note: string | null;
}

export function mapLegacyStudentStatus(raw: string): LegacyStudentStatus | null {
  const f = fold(raw);
  if (!f) return "active";
  if (/^(dang hoc|active|hoat dong|dang theo hoc)$/.test(f)) return "active";
  if (/(bao luu|tam dung|paused)/.test(f)) return "paused";
  if (/(hoc thu|trial)/.test(f)) return "trial";
  if (/(tot nghiep|hoan thanh|da xong|alumni|ket thuc khoa)/.test(f)) return "alumni";
  if (/(nghi|thoi hoc|withdrawn|huy)/.test(f)) return "withdrawn";
  if (/(tiem nang|prospect|cho xep lop|cho hoc)/.test(f)) return "prospect";
  return null;
}

export function mapGender(raw: string): "male" | "female" | null | undefined {
  const f = fold(raw);
  if (!f) return null;
  if (["nam", "trai", "male", "m", "be trai"].includes(f)) return "male";
  if (["nu", "gai", "female", "f", "be gai"].includes(f)) return "female";
  return undefined;
}

const RELATIONS: Record<string, string> = { me: "mother", "me be": "mother", mother: "mother", bo: "father", ba: "father", cha: "father", father: "father", ong: "guardian", ba_noi: "guardian", "nguoi giam ho": "guardian", guardian: "guardian" };

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

function headerCheck<A extends Record<string, readonly string[]>>(all: string[][], aliases: A, required: NoInfer<keyof A & string>[], maxRows: number) {
  type K = keyof A & string;
  if (all.length < 2) return { index: {} as Partial<Record<K, number>>, errors: ["File cần dòng tiêu đề và ít nhất 1 dòng dữ liệu"] };
  const { index } = mapHeaders(all[0]!, aliases as unknown as Record<K, string[]>);
  const errors: string[] = [];
  for (const k of required) if (index[k] === undefined) errors.push(`Thiếu cột ${aliases[k]?.[0] ?? k}`);
  if (all.length - 1 > maxRows) errors.push(`Tối đa ${maxRows} dòng mỗi lần — chia nhỏ file`);
  return { index, errors };
}

export function parseStudentImport(text: string, today: string, maxRows = 3000): ParsedFile<StudentImportRow> {
  const all = parseCsv(text);
  const h = headerCheck(all, STUDENT_IMPORT_ALIASES, ["legacyCode", "fullName", "center", "parentPhone"], maxRows);
  if (h.errors.length) return { rows: [], headerErrors: h.errors };
  const get = (r: string[], k: StudentKey) => (h.index[k] === undefined ? "" : (r[h.index[k]!] ?? "").trim());
  const seen = new Set<string>();
  const rows = all.slice(1).map((r, i): ParsedRow<StudentImportRow> => {
    const line = i + 2;
    const errors: string[] = [];
    const warnings: string[] = [];
    const legacyCode = get(r, "legacyCode").toUpperCase().slice(0, 40);
    if (!legacyCode) errors.push("Thiếu mã học viên cũ");
    else if (seen.has(legacyCode)) errors.push("Mã học viên bị lặp trong file");
    else seen.add(legacyCode);
    const fullName = get(r, "fullName").replace(/\s+/g, " ");
    if (fullName.length < 2) errors.push("Thiếu họ tên học viên");
    const dobRaw = get(r, "dob");
    const dob = dobRaw ? parseVnDate(dobRaw) : null;
    if (dobRaw && !dob) errors.push("Ngày sinh không hợp lệ (dd/mm/yyyy)");
    if (dob) {
      if (dob > today) errors.push("Ngày sinh ở tương lai");
      else {
        const age = Number(today.slice(0, 4)) - Number(dob.slice(0, 4));
        if (age < 3 || age > 18) warnings.push(`Tuổi ${age} — kiểm tra lại ngày sinh`);
      }
    }
    const gender = mapGender(get(r, "gender"));
    if (gender === undefined) errors.push("Giới tính không rõ (Nam / Nữ)");
    const gradeRaw = get(r, "grade").replace(/^lop\s*/i, "");
    const grade = gradeRaw ? Number(gradeRaw) : null;
    if (grade !== null && !(Number.isInteger(grade) && grade >= 0 && grade <= 12)) errors.push("Khối lớp phải từ 0 đến 12");
    const center = get(r, "center").toUpperCase();
    if (!center) errors.push("Thiếu cơ sở");
    const statusRaw = get(r, "status");
    const status = mapLegacyStudentStatus(statusRaw);
    if (!status) errors.push(`Trạng thái "${statusRaw}" không nhận ra`);
    const parentPhone = normalizeVnPhone(get(r, "parentPhone"));
    if (!parentPhone) errors.push("SĐT phụ huynh không hợp lệ");
    let parentName = get(r, "parentName").replace(/\s+/g, " ");
    if (!parentName) {
      parentName = `PH ${fullName}`.slice(0, 120);
      warnings.push("Thiếu tên phụ huynh — tạm đặt theo tên học viên");
    }
    const emailRaw = get(r, "parentEmail").toLowerCase();
    let parentEmail: string | null = null;
    if (emailRaw) {
      if (emailOk(emailRaw)) parentEmail = emailRaw;
      else warnings.push("Email phụ huynh không hợp lệ — bỏ qua");
    }
    const relation = RELATIONS[fold(get(r, "relation"))] ?? "parent";
    let parent2: StudentImportRow["parent2"] = null;
    const p2phone = get(r, "parent2Phone");
    if (p2phone) {
      const n = normalizeVnPhone(p2phone);
      if (!n) warnings.push("SĐT phụ huynh 2 không hợp lệ — bỏ qua");
      else if (n !== parentPhone) parent2 = { name: get(r, "parent2Name") || `PH2 ${fullName}`.slice(0, 120), phone: n };
    }
    const row: StudentImportRow | null = errors.length ? null : {
      line, legacyCode, fullName: fullName.slice(0, 120), nickname: get(r, "nickname").slice(0, 60) || null, dateOfBirth: dob, gender: gender ?? null, grade,
      school: get(r, "school").slice(0, 150) || null, center, status: status!, parentName: parentName.slice(0, 120), parentPhone: parentPhone!, parentEmail, relation, parent2,
      healthNotes: get(r, "healthNotes").slice(0, 500) || null, note: get(r, "note").slice(0, 500) || null,
    };
    return { line, row, errors, warnings };
  });
  // Cùng SĐT nhưng khác tên phụ huynh → cảnh báo (có thể là anh chị em — hợp lệ)
  const byPhone = new Map<string, Set<string>>();
  for (const x of rows) if (x.row) (byPhone.get(x.row.parentPhone) ?? byPhone.set(x.row.parentPhone, new Set()).get(x.row.parentPhone)!).add(fold(x.row.parentName));
  for (const x of rows) if (x.row && byPhone.get(x.row.parentPhone)!.size > 1) x.warnings.push("Cùng SĐT phụ huynh với dòng khác nhưng khác tên — sẽ gộp chung một phụ huynh");
  return { rows, headerErrors: [] };
}

/* ------------------------------------------------------------------ */
/* Ghi danh                                                             */
/* ------------------------------------------------------------------ */

export const ENROLLMENT_IMPORT_ALIASES = {
  studentCode: ["ma_hv_cu", "ma_hv", "ma_hoc_vien", "student_code"],
  classCode: ["ma_lop", "lop", "class_code"],
  packageSessions: ["so_buoi_goi", "tong_buoi", "goi_buoi", "so_buoi_mua", "package"],
  usedSessions: ["da_hoc", "so_buoi_da_hoc", "buoi_da_hoc", "used"],
  remaining: ["con_lai", "so_buoi_con_lai", "buoi_con_lai", "remaining"],
  status: ["trang_thai", "status"],
  enrolledAt: ["ngay_ghi_danh", "ngay_vao_lop", "ngay_dang_ky", "enrolled_at"],
  pauseUntil: ["bao_luu_den", "pause_until"],
  note: ["ghi_chu", "note"],
} as const satisfies Record<string, string[]>;
type EnrollmentKey = keyof typeof ENROLLMENT_IMPORT_ALIASES;

export interface EnrollmentImportRow {
  line: number;
  studentCode: string;
  classCode: string;
  packageSessions: number;
  usedSessions: number;
  status: EnrollmentStatus;
  enrolledAt: string | null;
  pauseUntil: string | null;
  note: string | null;
}

export function mapLegacyEnrollmentStatus(raw: string): EnrollmentStatus | null {
  const s = mapLegacyStudentStatus(raw);
  if (s === null) return null;
  return ({ active: "active", paused: "paused", trial: "trial", alumni: "completed", withdrawn: "withdrawn", prospect: "active" } as const)[s];
}

const intOf = (s: string) => {
  if (!s) return null;
  const n = parseVnAmount(s) ?? (s.trim() === "0" ? 0 : null);
  return n !== null && Number.isInteger(n) ? n : NaN;
};

export function parseEnrollmentImport(text: string, today: string, maxRows = 5000): ParsedFile<EnrollmentImportRow> {
  const all = parseCsv(text);
  const h = headerCheck(all, ENROLLMENT_IMPORT_ALIASES, ["studentCode", "classCode", "packageSessions"], maxRows);
  if (!h.errors.length && h.index.usedSessions === undefined && h.index.remaining === undefined) h.errors.push("Cần cột da_hoc hoặc con_lai");
  if (h.errors.length) return { rows: [], headerErrors: h.errors };
  const get = (r: string[], k: EnrollmentKey) => (h.index[k] === undefined ? "" : (r[h.index[k]!] ?? "").trim());
  const seen = new Set<string>();
  const rows = all.slice(1).map((r, i): ParsedRow<EnrollmentImportRow> => {
    const line = i + 2;
    const errors: string[] = [];
    const warnings: string[] = [];
    const studentCode = get(r, "studentCode").toUpperCase();
    const classCode = get(r, "classCode").toUpperCase();
    if (!studentCode) errors.push("Thiếu mã học viên");
    if (!classCode) errors.push("Thiếu mã lớp");
    const key = `${studentCode}|${classCode}`;
    if (studentCode && classCode) {
      if (seen.has(key)) errors.push("Cặp học viên + lớp bị lặp trong file");
      seen.add(key);
    }
    const pkg = intOf(get(r, "packageSessions"));
    const used = intOf(get(r, "usedSessions"));
    const rem = intOf(get(r, "remaining"));
    if (pkg === null || Number.isNaN(pkg) || pkg < 1 || pkg > 500) errors.push("Số buổi gói phải là số nguyên 1–500");
    if (Number.isNaN(used as number) || (used !== null && used < 0)) errors.push("Số buổi đã học không hợp lệ");
    if (Number.isNaN(rem as number) || (rem !== null && rem < 0)) errors.push("Số buổi còn lại không hợp lệ");
    let usedSessions = 0;
    if (!errors.length) {
      if (used === null && rem === null) errors.push("Cần số buổi đã học hoặc còn lại");
      else if (used !== null && rem !== null && used + rem !== pkg) errors.push(`Gói ${pkg} ≠ đã học ${used} + còn lại ${rem}`);
      else usedSessions = used ?? pkg! - rem!;
      if (!errors.length && (usedSessions < 0 || usedSessions > pkg!)) errors.push("Số buổi đã học vượt gói");
    }
    const statusRaw = get(r, "status");
    let status = mapLegacyEnrollmentStatus(statusRaw);
    if (!status) errors.push(`Trạng thái "${statusRaw}" không nhận ra`);
    if (status === "active" && !errors.length && usedSessions === pkg) {
      warnings.push("Đã học hết gói nhưng còn 'đang học' — nhập là hoàn thành");
      status = "completed";
    }
    const enrRaw = get(r, "enrolledAt");
    const enrolledAt = enrRaw ? parseVnDate(enrRaw) : null;
    if (enrRaw && !enrolledAt) errors.push("Ngày ghi danh không hợp lệ");
    else if (enrolledAt && enrolledAt > today) errors.push("Ngày ghi danh ở tương lai");
    const puRaw = get(r, "pauseUntil");
    const pauseUntil = puRaw ? parseVnDate(puRaw) : null;
    if (puRaw && !pauseUntil) errors.push("Ngày hết bảo lưu không hợp lệ");
    if (status === "paused" && !pauseUntil) warnings.push("Bảo lưu không có ngày hết hạn — đặt 90 ngày kể từ hôm nay");
    const row: EnrollmentImportRow | null = errors.length ? null : {
      line, studentCode, classCode, packageSessions: pkg!, usedSessions, status: status!, enrolledAt, pauseUntil: status === "paused" ? pauseUntil : null, note: get(r, "note").slice(0, 300) || null,
    };
    return { line, row, errors, warnings };
  });
  return { rows, headerErrors: [] };
}

/* ------------------------------------------------------------------ */
/* Đối soát                                                             */
/* ------------------------------------------------------------------ */

export const RECON_METRICS = ["activeStudents", "openEnrollments", "runningClasses", "remainingSessions", "debtTotal", "collectedMonth"] as const;
export type ReconMetric = (typeof RECON_METRICS)[number];
export const RECON_METRIC_VI: Record<ReconMetric, string> = {
  activeStudents: "Học viên đang học",
  openEnrollments: "Ghi danh đang mở (học / học thử / bảo lưu)",
  runningClasses: "Lớp đang chạy",
  remainingSessions: "Tổng buổi còn lại",
  debtTotal: "Công nợ học phí",
  collectedMonth: "Đã thu tháng này",
};
const MONEY: ReconMetric[] = ["debtTotal", "collectedMonth"];

export interface ReconRow {
  metric: ReconMetric;
  label: string;
  legacy: number | null;
  current: number;
  diff: number | null;
  ok: boolean | null;
}

/** So số liệu hệ cũ ↔ hệ mới. Đếm phải khớp tuyệt đối; tiền lệch ≤ 1.000đ (làm tròn) */
export function reconcile(legacy: Partial<Record<ReconMetric, number | null>>, current: Record<ReconMetric, number>): { rows: ReconRow[]; ok: boolean; compared: number } {
  const rows = RECON_METRICS.map((m): ReconRow => {
    const l = legacy[m];
    if (l === undefined || l === null || !Number.isFinite(l)) return { metric: m, label: RECON_METRIC_VI[m], legacy: null, current: current[m], diff: null, ok: null };
    const diff = current[m] - l;
    const ok = MONEY.includes(m) ? Math.abs(diff) <= 1000 : diff === 0;
    return { metric: m, label: RECON_METRIC_VI[m], legacy: l, current: current[m], diff, ok };
  });
  const compared = rows.filter((r) => r.ok !== null).length;
  return { rows, ok: compared > 0 && rows.every((r) => r.ok !== false), compared };
}

export const REMAINING_ALIASES = {
  studentCode: ["ma_hv_cu", "ma_hv", "ma_hoc_vien"],
  classCode: ["ma_lop", "lop"],
  remaining: ["con_lai", "so_buoi_con_lai", "buoi_con_lai"],
  debt: ["cong_no", "con_no", "no_hoc_phi", "debt"],
} as const satisfies Record<string, string[]>;

export interface RemainingRow { line: number; studentCode: string; classCode: string | null; remaining: number | null; debt: number | null }

export function parseRemainingCsv(text: string, maxRows = 5000): ParsedFile<RemainingRow> {
  const all = parseCsv(text);
  const h = headerCheck(all, REMAINING_ALIASES, ["studentCode"], maxRows);
  if (!h.errors.length && h.index.remaining === undefined && h.index.debt === undefined) h.errors.push("Cần cột con_lai hoặc cong_no");
  if (h.errors.length) return { rows: [], headerErrors: h.errors };
  const get = (r: string[], k: keyof typeof REMAINING_ALIASES) => (h.index[k] === undefined ? "" : (r[h.index[k]!] ?? "").trim());
  return {
    headerErrors: [],
    rows: all.slice(1).map((r, i) => {
      const errors: string[] = [];
      const studentCode = get(r, "studentCode").toUpperCase();
      if (!studentCode) errors.push("Thiếu mã học viên");
      const rem = intOf(get(r, "remaining"));
      const debtRaw = get(r, "debt");
      const debt = debtRaw ? (debtRaw.trim() === "0" ? 0 : parseVnAmount(debtRaw)) : null;
      if (Number.isNaN(rem as number)) errors.push("Buổi còn lại không hợp lệ");
      if (debtRaw && debt === null) errors.push("Công nợ không hợp lệ");
      return { line: i + 2, errors, warnings: [], row: errors.length ? null : { line: i + 2, studentCode, classCode: get(r, "classCode").toUpperCase() || null, remaining: rem as number | null, debt } };
    }),
  };
}

export interface RemainingDiff { studentCode: string; classCode: string | null; kind: "missing" | "remaining" | "debt"; legacy: number | null; current: number | null }

/** So từng học viên: thiếu trên hệ mới, lệch buổi còn lại, lệch công nợ (> 1.000đ) */
export function compareRemaining(legacy: RemainingRow[], current: { studentCode: string; classCode: string; remaining: number }[], debts: Map<string, number>): RemainingDiff[] {
  const out: RemainingDiff[] = [];
  const byStudent = new Map<string, { classCode: string; remaining: number }[]>();
  for (const c of current) (byStudent.get(c.studentCode) ?? byStudent.set(c.studentCode, []).get(c.studentCode)!).push(c);
  for (const l of legacy) {
    const list = byStudent.get(l.studentCode);
    if (!list) {
      out.push({ studentCode: l.studentCode, classCode: l.classCode, kind: "missing", legacy: l.remaining, current: null });
      continue;
    }
    if (l.remaining !== null) {
      const cur = l.classCode ? list.find((x) => x.classCode === l.classCode) : null;
      const val = l.classCode ? (cur ? cur.remaining : null) : list.reduce((s, x) => s + x.remaining, 0);
      if (val === null) out.push({ studentCode: l.studentCode, classCode: l.classCode, kind: "missing", legacy: l.remaining, current: null });
      else if (val !== l.remaining) out.push({ studentCode: l.studentCode, classCode: l.classCode, kind: "remaining", legacy: l.remaining, current: val });
    }
    if (l.debt !== null) {
      const d = debts.get(l.studentCode) ?? 0;
      if (Math.abs(d - l.debt) > 1000) out.push({ studentCode: l.studentCode, classCode: l.classCode, kind: "debt", legacy: l.debt, current: d });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Go-live theo cơ sở                                                   */
/* ------------------------------------------------------------------ */

export const CUTOVER_STAGES = ["preparing", "parallel", "live", "legacy_readonly"] as const;
export type CutoverStage = (typeof CUTOVER_STAGES)[number];
export const CUTOVER_STAGE_VI: Record<CutoverStage, string> = {
  preparing: "Chuẩn bị",
  parallel: "Chạy song song",
  live: "Chính thức trên hệ mới",
  legacy_readonly: "Hệ cũ chỉ đọc",
};

export const CUTOVER_CHECKLIST = [
  { key: "data_imported", label: "Đã nhập học viên, phụ huynh, ghi danh, phiếu thu cũ", required: true },
  { key: "recon_ok", label: "Đối soát tổng khớp (lần gần nhất)", required: true, auto: true },
  { key: "staff_trained", label: "Quản lý, giáo vụ, tư vấn, kế toán, giáo viên đã được hướng dẫn", required: true },
  { key: "accounts_ready", label: "Tài khoản nhân sự + vai trò theo cơ sở đã cấp", required: true },
  { key: "backup_tested", label: "Sao lưu + thử khôi phục thành công trong 7 ngày", required: true, auto: true },
  { key: "parents_notified", label: "Đã báo phụ huynh về cổng / mã kích hoạt mới", required: false },
  { key: "cards_printed", label: "Đã in và phát thẻ QR", required: false },
  { key: "einvoice_ready", label: "Hoá đơn điện tử đã kết nối nhà cung cấp thật", required: false },
] as const;
export type CutoverCheck = (typeof CUTOVER_CHECKLIST)[number]["key"];

export const PARALLEL_MIN_DAYS = 5;

export const PARALLEL_METRICS = ["attendance", "collected", "newEnrollments", "openEnrollments"] as const;
export type ParallelMetric = (typeof PARALLEL_METRICS)[number];
export const PARALLEL_METRIC_VI: Record<ParallelMetric, string> = {
  attendance: "Lượt điểm danh có mặt / muộn trong ngày",
  collected: "Tiền thu xác nhận trong ngày",
  newEnrollments: "Ghi danh mới trong ngày",
  openEnrollments: "Ghi danh đang mở cuối ngày",
};

export function compareParallelDay(legacy: Record<ParallelMetric, number>, current: Record<ParallelMetric, number>) {
  const diffs = PARALLEL_METRICS.map((m) => {
    const diff = current[m] - legacy[m];
    return { metric: m, label: PARALLEL_METRIC_VI[m], legacy: legacy[m], current: current[m], diff, ok: m === "collected" ? Math.abs(diff) <= 1000 : diff === 0 };
  });
  return { diffs, ok: diffs.every((d) => d.ok) };
}

/** Số ngày khớp liên tiếp tính từ ngày gần nhất (ngày làm việc liên tục theo sổ, không bắt buộc liền lịch) */
export function parallelStreak(days: { date: string; ok: boolean }[]): number {
  const s = [...days].sort((a, b) => (a.date < b.date ? 1 : -1));
  let n = 0;
  for (const d of s) {
    if (!d.ok) break;
    n++;
  }
  return n;
}

export interface CutoverState {
  stage: CutoverStage;
  checklist: Partial<Record<CutoverCheck, boolean>>;
  streak: number;
  parallelDays: number;
  openIssues: number;
}

/** Điều kiện chuyển giai đoạn — trả danh sách lý do chặn (rỗng = được) */
export function cutoverBlockers(s: CutoverState, to: CutoverStage): string[] {
  const order = CUTOVER_STAGES.indexOf(s.stage);
  const target = CUTOVER_STAGES.indexOf(to);
  if (target === order) return ["Cơ sở đang ở giai đoạn này"];
  if (target < order) {
    if (s.stage === "legacy_readonly") return ["Hệ cũ đã khoá chỉ đọc — không quay lại được, xử lý sự cố trên hệ mới"];
    return [];
  }
  if (target > order + 1) return [`Phải qua "${CUTOVER_STAGE_VI[CUTOVER_STAGES[order + 1]!]}" trước`];
  const e: string[] = [];
  if (to === "parallel" && !s.checklist.data_imported) e.push("Chưa đánh dấu đã nhập dữ liệu");
  if (to === "live") {
    for (const c of CUTOVER_CHECKLIST) if (c.required && !s.checklist[c.key]) e.push(`Chưa xong: ${c.label}`);
    if (s.streak < PARALLEL_MIN_DAYS) e.push(`Cần ${PARALLEL_MIN_DAYS} ngày chạy song song khớp liên tiếp (hiện ${s.streak})`);
    if (s.openIssues > 0) e.push(`Còn ${s.openIssues} chênh lệch chưa giải thích`);
  }
  if (to === "legacy_readonly" && s.openIssues > 0) e.push(`Còn ${s.openIssues} chênh lệch chưa giải thích`);
  return e;
}
