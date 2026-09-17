/**
 * Danh mục mã ca (bản gốc: 1 mã làm việc = 1 công/ngày; X, P = 0 công).
 *
 * Nguyên tắc: **công đếm theo ca đã xếp**, lượt quét chỉ sinh cờ để quản lý rà.
 * Vì vậy mã ca mang đủ thông tin: loại ca, số công, các đoạn giờ, giờ kế hoạch,
 * nơi làm và có bắt buộc quét hay không.
 */

export class ShiftRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShiftRuleError";
  }
}

export const SHIFT_KINDS = ["timed", "location_only", "flexible", "off", "leave"] as const;
export type ShiftKind = (typeof SHIFT_KINDS)[number];
export const SHIFT_KIND_VI: Record<ShiftKind, string> = {
  timed: "Có giờ · phải quét",
  location_only: "Chỉ nơi làm · quét tuỳ chọn",
  flexible: "Linh động",
  off: "Nghỉ",
  leave: "Nghỉ phép",
};

/** Nơi làm việc của ca */
export const WORKPLACES = ["own_center", "fixed_center", "assigned", "any_center", "flexible", "field"] as const;
export type Workplace = (typeof WORKPLACES)[number];
export const WORKPLACE_VI: Record<Workplace, string> = {
  own_center: "Cơ sở của đơn vị",
  fixed_center: "Tại cơ sở chỉ định",
  assigned: "Theo phân công (Hội sở)",
  any_center: "Bất kỳ cơ sở",
  flexible: "Linh động",
  field: "Công tác ngoài",
};

/** Số công hợp lệ của một mã ca */
export const SHIFT_UNIT_VALUES = [0, 0.5, 1, 1.5] as const;

/** Một đoạn giờ của ca. paid = false → đoạn "nghỉ giữa giờ" không tính công. */
export interface ShiftSegment {
  from: string;
  to: string;
  paid?: boolean;
}

export interface ShiftDef {
  code: string;
  name: string;
  kind: ShiftKind;
  units: number;
  segments: ShiftSegment[];
  workplace: Workplace;
  punchRequired: boolean;
  /** Giờ kế hoạch (phút). Để trống → tính từ các đoạn giờ. */
  plannedMinutes?: number | null;
}

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;
const toMin = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new ShiftRuleError(`Giờ không hợp lệ: ${s}`);
  return Number(m[1]) * 60 + Number(m[2]);
};

/** Tổng phút của các đoạn tính công */
export function plannedMinutesOf(segments: readonly ShiftSegment[]): number {
  return segments.filter((s) => s.paid !== false).reduce((n, s) => n + Math.max(0, toMin(s.to) - toMin(s.from)), 0);
}

/** Các đoạn tính công, đã sắp xếp — dùng để tính muộn / sớm / thiếu buổi */
export function workSegments(segments: readonly ShiftSegment[]): { from: number; to: number }[] {
  return segments.filter((s) => s.paid !== false).map((s) => ({ from: toMin(s.from), to: toMin(s.to) })).sort((a, b) => a.from - b.from);
}

export const shiftHasClock = (k: ShiftKind) => k === "timed";
export const shiftCounts = (k: ShiftKind) => k === "timed" || k === "location_only" || k === "flexible";

/** Kiểm tra khai báo mã ca */
export function validateShiftDef(s: ShiftDef): string[] {
  const e: string[] = [];
  if (!/^[A-Z0-9_-]{1,12}$/i.test(s.code.trim())) e.push("Mã ca 1–12 ký tự chữ/số");
  if (s.name.trim().length < 2) e.push("Tên ca tối thiểu 2 ký tự");
  if (!(SHIFT_UNIT_VALUES as readonly number[]).includes(s.units)) e.push("Số công chỉ nhận 0; 0,5; 1 hoặc 1,5");
  if (!shiftCounts(s.kind) && s.units !== 0) e.push("Ca nghỉ / nghỉ phép phải là 0 công");
  if (shiftCounts(s.kind) && s.units <= 0) e.push("Ca làm việc phải có số công lớn hơn 0");
  if (s.kind === "timed") {
    if (!s.segments.length) e.push("Ca có giờ cần ít nhất một đoạn giờ");
    if (!s.punchRequired) e.push("Ca có giờ bắt buộc quét");
  } else if (s.segments.length && s.kind !== "location_only") {
    e.push("Ca không theo giờ thì không khai đoạn giờ");
  }
  let prev = -1;
  for (const seg of s.segments) {
    if (!HHMM.test(seg.from.trim()) || !HHMM.test(seg.to.trim())) {
      e.push("Đoạn giờ dạng HH:MM");
      break;
    }
    const a = toMin(seg.from);
    const b = toMin(seg.to);
    if (b <= a) {
      e.push(`Đoạn ${seg.from}–${seg.to}: giờ kết thúc phải sau giờ bắt đầu (chưa hỗ trợ ca qua đêm)`);
      break;
    }
    if (a < prev) {
      e.push("Các đoạn giờ phải xếp theo thứ tự và không chồng nhau");
      break;
    }
    prev = b;
  }
  if (!e.length && s.kind === "timed" && plannedMinutesOf(s.segments) <= 0) e.push("Giờ kế hoạch phải lớn hơn 0");
  if (s.plannedMinutes != null && (s.plannedMinutes < 0 || s.plannedMinutes > 16 * 60)) e.push("Giờ kế hoạch trong khoảng 0–16 giờ");
  return e;
}

const seg = (from: string, to: string): ShiftSegment => ({ from, to });

/**
 * Danh mục ~22 mã ca của bản gốc (dùng chung — phạm vi Hội sở).
 * `fixedCenterCode` chỉ dùng khi workplace = fixed_center (D1 / D2).
 */
export const SHIFT_CATALOGUE: (ShiftDef & { fixedCenterCode?: string })[] = [
  { code: "CG", name: "Ca gãy", kind: "timed", units: 1, segments: [seg("09:00", "11:30"), seg("14:00", "17:45")], workplace: "own_center", punchRequired: true },
  { code: "CS", name: "Ca suốt (nghỉ 16:30–17:00 tính giờ làm)", kind: "timed", units: 1, segments: [seg("14:00", "21:00")], workplace: "own_center", punchRequired: true },
  { code: "CCT", name: "Ca cuối tuần", kind: "timed", units: 1, segments: [seg("07:45", "11:30"), seg("13:45", "17:45")], workplace: "own_center", punchRequired: true },
  { code: "CGD", name: "Ca gãy dài", kind: "timed", units: 1, segments: [seg("09:00", "11:30"), seg("13:30", "19:15")], workplace: "own_center", punchRequired: true },
  { code: "D1", name: "Làm tại Cơ sở 1", kind: "location_only", units: 1, segments: [], workplace: "fixed_center", punchRequired: false, fixedCenterCode: "CS1" },
  { code: "D2", name: "Làm tại Cơ sở 2", kind: "location_only", units: 1, segments: [], workplace: "fixed_center", punchRequired: false, fixedCenterCode: "CS2" },
  { code: "HC", name: "Giờ hành chính", kind: "timed", units: 1, segments: [seg("08:00", "11:30"), seg("13:30", "17:30")], workplace: "assigned", punchRequired: true },
  { code: "12", name: "Sáng CS1 · Chiều CS2", kind: "timed", units: 1, segments: [seg("08:00", "11:30"), seg("13:30", "17:30")], workplace: "any_center", punchRequired: true },
  { code: "21", name: "Sáng CS2 · Chiều CS1", kind: "timed", units: 1, segments: [seg("08:00", "11:30"), seg("13:30", "17:30")], workplace: "any_center", punchRequired: true },
  { code: "2C", name: "Cả 2 cơ sở", kind: "timed", units: 1, segments: [seg("08:00", "11:30"), seg("13:30", "17:30")], workplace: "any_center", punchRequired: true },
  { code: "S", name: "Ca sáng", kind: "timed", units: 0.5, segments: [seg("07:45", "11:30")], workplace: "own_center", punchRequired: true },
  { code: "C", name: "Ca chiều", kind: "timed", units: 0.5, segments: [seg("13:45", "17:30")], workplace: "own_center", punchRequired: true },
  { code: "T", name: "Ca tối", kind: "timed", units: 0.5, segments: [seg("17:15", "21:00")], workplace: "own_center", punchRequired: true },
  { code: "SC", name: "Sáng + chiều", kind: "timed", units: 1, segments: [seg("07:45", "11:30"), seg("13:45", "17:30")], workplace: "own_center", punchRequired: true },
  { code: "ST", name: "Sáng + tối", kind: "timed", units: 1, segments: [seg("07:45", "11:30"), seg("17:15", "21:00")], workplace: "own_center", punchRequired: true },
  { code: "CT", name: "Chiều + tối (nghỉ 16:30–17:30 tính công)", kind: "timed", units: 1, segments: [seg("13:45", "21:00")], workplace: "own_center", punchRequired: true },
  { code: "SCT", name: "Sáng + chiều + tối", kind: "timed", units: 1.5, segments: [seg("07:45", "11:30"), seg("13:45", "21:00")], workplace: "own_center", punchRequired: true },
  { code: "LD", name: "Linh động (không cần đến)", kind: "flexible", units: 1, segments: [], workplace: "flexible", punchRequired: false },
  { code: "LDGV", name: "Linh động giáo viên", kind: "flexible", units: 1, segments: [], workplace: "flexible", punchRequired: false },
  { code: "NG", name: "Công tác ngoài", kind: "timed", units: 1, segments: [seg("08:00", "11:30"), seg("13:30", "17:30")], workplace: "field", punchRequired: true },
  { code: "X", name: "Nghỉ", kind: "off", units: 0, segments: [], workplace: "flexible", punchRequired: false },
  { code: "P", name: "Nghỉ phép", kind: "leave", units: 0, segments: [], workplace: "flexible", punchRequired: false },
];

/** Mã ca mặc định sinh từ đơn đã duyệt */
export const SHIFT_CODE_OFF = "X";
export const SHIFT_CODE_LEAVE = "P";
export const SHIFT_CODE_REMOTE = "LD";
export const SHIFT_CODE_FIELD = "NG";

/** Giờ hiển thị của ca: "09:00–11:30, 14:00–17:45" */
export function shiftClock(segments: readonly ShiftSegment[]): string {
  return segments.map((s) => `${s.from}–${s.to}${s.paid === false ? " (nghỉ)" : ""}`).join(", ");
}

/** Nguồn của ô lưới phân ca — ô sửa tay / từ đơn không bị sinh lại hay import đè */
export const CELL_ORIGINS = ["template", "manual", "request", "import"] as const;
export type CellOrigin = (typeof CELL_ORIGINS)[number];
export const CELL_ORIGIN_VI: Record<CellOrigin, string> = { template: "Sinh từ khung", manual: "Sửa tay", request: "Từ đơn đã duyệt", import: "Nhập từ Sheet" };
export const CELL_ORIGIN_MARK: Record<CellOrigin, string> = { template: "", manual: "T", request: "Đ", import: "N" };

/** Ô được giữ nguyên khi sinh lưới từ khung hoặc import lại */
export const isProtectedCell = (o: CellOrigin) => o === "manual" || o === "request";
