/**
 * Nhân sự, vị trí, chấm công, đơn từ, kỳ công — quy tắc thuần.
 */
import { addDays, parseISODate, weekdayOf } from "../dates.js";

export class HrRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HrRuleError";
  }
}

/* ------------------------------------------------------------------ */
/* Hồ sơ & vị trí                                                      */
/* ------------------------------------------------------------------ */

export const STAFF_STATUSES = ["probation", "active", "on_leave", "resigned"] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];
export const STAFF_STATUS_VI: Record<StaffStatus, string> = { probation: "Thử việc", active: "Chính thức", on_leave: "Tạm nghỉ", resigned: "Đã nghỉ việc" };

export const EMPLOYMENT_TYPES = ["full_time", "part_time", "collaborator", "intern"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EMPLOYMENT_TYPE_VI: Record<EmploymentType, string> = { full_time: "Toàn thời gian", part_time: "Bán thời gian", collaborator: "Cộng tác viên", intern: "Thực tập" };

export const DEPARTMENTS = ["academic", "sales", "accounting", "hr", "operations", "marketing", "management"] as const;
export type Department = (typeof DEPARTMENTS)[number];
export const DEPARTMENT_VI: Record<Department, string> = {
  academic: "Đào tạo / Giáo vụ", sales: "Tư vấn / CSKH", accounting: "Kế toán", hr: "Nhân sự", operations: "Vận hành", marketing: "Marketing", management: "Quản lý",
};

export const POSITION_KINDS = ["primary", "concurrent", "delegated"] as const;
export type PositionKind = (typeof POSITION_KINDS)[number];
export const POSITION_KIND_VI: Record<PositionKind, string> = { primary: "Chính", concurrent: "Kiêm nhiệm", delegated: "Uỷ quyền" };

export const staffCode = (seq: number) => `NV${String(seq).padStart(4, "0")}`;

export interface PositionLite {
  id?: string;
  kind: PositionKind;
  centerId: string;
  title: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

const overlaps = (a: PositionLite, b: PositionLite) => a.effectiveFrom <= (b.effectiveTo ?? "9999-12-31") && b.effectiveFrom <= (a.effectiveTo ?? "9999-12-31");

/** Kiểm tra vị trí mới so với danh sách hiện có */
export function validatePosition(p: PositionLite, existing: readonly PositionLite[]): string[] {
  const e: string[] = [];
  if (p.title.trim().length < 2) e.push("Chức danh tối thiểu 2 ký tự");
  if (p.effectiveTo && p.effectiveTo < p.effectiveFrom) e.push("Ngày kết thúc phải sau ngày bắt đầu");
  if (p.kind === "delegated") {
    if (!p.effectiveTo) e.push("Uỷ quyền cần ngày kết thúc");
    else if ((parseISODate(p.effectiveTo).getTime() - parseISODate(p.effectiveFrom).getTime()) / 86400000 > 90) e.push("Uỷ quyền tối đa 90 ngày");
  }
  const others = existing.filter((x) => x.id !== p.id);
  if (p.kind === "primary") {
    const clash = others.find((x) => x.kind === "primary" && overlaps(x, p));
    if (clash) e.push(`Trùng thời gian với vị trí chính "${clash.title}" (${clash.effectiveFrom} → ${clash.effectiveTo ?? "nay"}) — kết thúc vị trí cũ trước`);
  }
  const dup = others.find((x) => x.centerId === p.centerId && x.title.trim().toLowerCase() === p.title.trim().toLowerCase() && overlaps(x, p));
  if (dup) e.push("Đã có vị trí cùng chức danh, cùng cơ sở trong khoảng thời gian này");
  return e;
}

export function activeOn<T extends { effectiveFrom: string; effectiveTo: string | null }>(list: readonly T[], date: string): T[] {
  return list.filter((x) => x.effectiveFrom <= date && (!x.effectiveTo || x.effectiveTo >= date));
}

export function staffTransition(from: StaffStatus, to: StaffStatus): string | null {
  if (from === to) return "Trạng thái không đổi";
  if (from === "resigned") return "Nhân sự đã nghỉ việc — tạo hồ sơ mới nếu quay lại";
  if (to === "probation" && from !== "on_leave") return "Không chuyển ngược về thử việc";
  return null;
}

/** Phép năm theo tháng làm việc trong năm (làm tròn xuống 0,5 ngày) */
export function proratedLeave(base: number, hiredAt: string | null, year: number): number {
  if (!hiredAt || Number(hiredAt.slice(0, 4)) < year) return base;
  if (Number(hiredAt.slice(0, 4)) > year) return 0;
  const months = 12 - Number(hiredAt.slice(5, 7)) + 1;
  return Math.floor(((base * months) / 12) * 2) / 2;
}

/* ------------------------------------------------------------------ */
/* Giờ, toạ độ                                                         */
/* ------------------------------------------------------------------ */

export function hhmm(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new HrRuleError(`Giờ không hợp lệ: ${s}`);
  return Number(m[1]) * 60 + Number(m[2]);
}
export const isHHMM = (s: string | null | undefined) => !!s && /^([01]?\d|2[0-3]):[0-5]\d$/.test(s.trim());
export const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Phút trong ngày và ngày theo giờ Việt Nam (UTC+7, không đổi giờ) */
export function vnParts(d: Date): { date: string; min: number } {
  const x = new Date(d.getTime() + 7 * 3600e3);
  return { date: x.toISOString().slice(0, 10), min: x.getUTCHours() * 60 + x.getUTCMinutes() };
}

export function validateShift(s: { code: string; name: string; startTime: string; endTime: string; breakMinutes: number }): string[] {
  const e: string[] = [];
  if (!/^[A-Z0-9_-]{1,12}$/i.test(s.code)) e.push("Mã ca 1–12 ký tự chữ/số");
  if (s.name.trim().length < 2) e.push("Tên ca tối thiểu 2 ký tự");
  if (!isHHMM(s.startTime) || !isHHMM(s.endTime)) e.push("Giờ ca dạng HH:MM");
  else {
    const len = hhmm(s.endTime) - hhmm(s.startTime);
    if (len <= 0) e.push("Giờ kết thúc phải sau giờ bắt đầu (chưa hỗ trợ ca qua đêm)");
    else if (s.breakMinutes < 0 || s.breakMinutes >= len) e.push("Nghỉ giữa ca không hợp lệ");
  }
  return e;
}

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export const MAX_GPS_ACCURACY_M = 200;

/** Chấm công theo bán kính: cơ sở chưa đặt toạ độ → cho phép (ghi nhận không kiểm tra) */
export function checkGeofence(center: { lat: number | null; lng: number | null; radiusM: number }, pos: { lat: number; lng: number; accuracy: number | null } | null): { ok: boolean; distanceM: number | null; reason: string | null; checked: boolean } {
  if (center.lat == null || center.lng == null) return { ok: true, distanceM: null, reason: null, checked: false };
  if (!pos) return { ok: false, distanceM: null, reason: "Cần bật định vị để chấm công", checked: true };
  if (pos.accuracy != null && pos.accuracy > MAX_GPS_ACCURACY_M) return { ok: false, distanceM: null, reason: `GPS sai số ${Math.round(pos.accuracy)}m — ra chỗ thoáng và thử lại`, checked: true };
  const d = haversineM({ lat: center.lat, lng: center.lng }, pos);
  const slack = Math.min(pos.accuracy ?? 0, 50);
  if (d > center.radiusM + slack) return { ok: false, distanceM: d, reason: `Bạn đang cách cơ sở ${d}m (cho phép ${center.radiusM}m)`, checked: true };
  return { ok: true, distanceM: d, reason: null, checked: true };
}

/* ------------------------------------------------------------------ */
/* Tính công ngày                                                      */
/* ------------------------------------------------------------------ */

export const GRACE_MIN = 5;

export const DAY_STATUSES = ["present", "late", "early", "late_early", "absent", "leave", "half_leave", "missing_in", "missing_out", "off", "holiday", "upcoming", "working", "override"] as const;
export type DayStatus = (typeof DAY_STATUSES)[number];
export const DAY_STATUS_VI: Record<DayStatus, string> = {
  present: "Đủ công", late: "Đi muộn", early: "Về sớm", late_early: "Muộn + sớm", absent: "Vắng", leave: "Nghỉ phép", half_leave: "Nghỉ nửa ngày",
  missing_in: "Thiếu giờ vào", missing_out: "Thiếu giờ ra", off: "Không có ca", holiday: "Ngày lễ", upcoming: "Sắp tới", working: "Đang làm", override: "Đã chỉnh",
};
export const DAY_STATUS_SHORT: Record<DayStatus, string> = {
  present: "✓", late: "M", early: "S", late_early: "MS", absent: "V", leave: "P", half_leave: "½P", missing_in: "?", missing_out: "?", off: "", holiday: "L", upcoming: "·", working: "…", override: "✎",
};

export interface DayInput {
  date: string;
  today: string;
  shift: { startTime: string; endTime: string; breakMinutes: number } | null;
  inMin: number | null;
  outMin: number | null;
  leave: { portion: "full" | "am" | "pm"; paid: boolean } | null;
  excusedLateMin?: number;
  excusedEarlyMin?: number;
  otMin?: number;
  holiday?: boolean;
  override?: { units: number; status: string; note: string } | null;
}

export interface DayResult {
  status: DayStatus;
  units: number;
  paidLeave: number;
  unpaidLeave: number;
  holidayUnits: number;
  lateMin: number;
  earlyMin: number;
  workedMin: number;
  otMin: number;
  note: string | null;
}

export function computeDay(i: DayInput): DayResult {
  const base: DayResult = { status: "off", units: 0, paidLeave: 0, unpaidLeave: 0, holidayUnits: 0, lateMin: 0, earlyMin: 0, workedMin: 0, otMin: i.otMin ?? 0, note: null };
  if (i.override) return { ...base, status: "override", units: i.override.units, note: `${i.override.status}: ${i.override.note}` };
  const worked = (from: number, to: number, brk: number) => (i.inMin != null && i.outMin != null ? Math.max(0, Math.min(i.outMin, to) - Math.max(i.inMin, from) - (i.inMin < from + (to - from) / 2 && i.outMin > from + (to - from) / 2 ? brk : 0)) : 0);
  if (!i.shift) return { ...base, workedMin: i.inMin != null && i.outMin != null ? Math.max(0, i.outMin - i.inMin) : 0 };
  if (i.holiday) return { ...base, status: "holiday", holidayUnits: 1 };
  const start = hhmm(i.shift.startTime);
  const end = hhmm(i.shift.endTime);
  const mid = Math.round((start + end) / 2);
  const leaveUnits = i.leave ? (i.leave.portion === "full" ? 1 : 0.5) : 0;
  const withLeave = (r: DayResult): DayResult => (i.leave ? { ...r, paidLeave: i.leave.paid ? leaveUnits : 0, unpaidLeave: i.leave.paid ? 0 : leaveUnits } : r);
  if (i.leave?.portion === "full") return withLeave({ ...base, status: "leave" });
  const halfBreak = Math.round(i.shift.breakMinutes / 2);
  const from = i.leave?.portion === "am" ? mid + halfBreak : start;
  const to = i.leave?.portion === "pm" ? mid - halfBreak : end;
  const brk = i.leave ? 0 : i.shift.breakMinutes;
  const fullUnits = i.leave ? 0.5 : 1;
  if (i.date > i.today) return withLeave({ ...base, status: "upcoming" });
  if (i.inMin == null && i.outMin == null) {
    return withLeave({ ...base, status: i.date === i.today ? "upcoming" : "absent" });
  }
  if (i.inMin != null && i.outMin == null) {
    if (i.date === i.today) return withLeave({ ...base, status: "working", lateMin: Math.max(0, i.inMin - from > GRACE_MIN ? i.inMin - from - (i.excusedLateMin ?? 0) : 0) });
    return withLeave({ ...base, status: "missing_out" });
  }
  if (i.inMin == null) return withLeave({ ...base, status: "missing_in" });
  const rawLate = i.inMin! - from;
  const rawEarly = to - i.outMin!;
  const lateMin = rawLate > GRACE_MIN ? Math.max(0, rawLate - (i.excusedLateMin ?? 0)) : 0;
  const earlyMin = rawEarly > GRACE_MIN ? Math.max(0, rawEarly - (i.excusedEarlyMin ?? 0)) : 0;
  const status: DayStatus = i.leave ? "half_leave" : lateMin && earlyMin ? "late_early" : lateMin ? "late" : earlyMin ? "early" : "present";
  const span = to - from;
  const missing = lateMin + earlyMin;
  const units = missing >= span ? 0 : missing > span / 2 ? fullUnits / 2 : fullUnits;
  return withLeave({ ...base, status, units, lateMin, earlyMin, workedMin: worked(from, to, brk) });
}

export interface PeriodSummary {
  scheduled: number;
  workUnits: number;
  paidLeave: number;
  unpaidLeave: number;
  holiday: number;
  payableUnits: number;
  lateCount: number;
  lateMin: number;
  earlyCount: number;
  absentCount: number;
  missingCount: number;
  otMin: number;
}

export function summarizeDays(days: readonly (DayResult & { scheduled?: boolean })[]): PeriodSummary {
  const s: PeriodSummary = { scheduled: 0, workUnits: 0, paidLeave: 0, unpaidLeave: 0, holiday: 0, payableUnits: 0, lateCount: 0, lateMin: 0, earlyCount: 0, absentCount: 0, missingCount: 0, otMin: 0 };
  for (const d of days) {
    if (d.scheduled) s.scheduled++;
    s.workUnits += d.units;
    s.paidLeave += d.paidLeave;
    s.unpaidLeave += d.unpaidLeave;
    s.holiday += d.holidayUnits;
    if (d.lateMin > 0) s.lateCount++;
    s.lateMin += d.lateMin;
    if (d.earlyMin > 0) s.earlyCount++;
    if (d.status === "absent") s.absentCount++;
    if (d.status === "missing_in" || d.status === "missing_out") s.missingCount++;
    s.otMin += d.otMin;
  }
  s.payableUnits = s.workUnits + s.paidLeave + s.holiday;
  return s;
}

/* ------------------------------------------------------------------ */
/* Đơn từ                                                              */
/* ------------------------------------------------------------------ */

export const REQUEST_KINDS = ["leave", "late_early", "overtime", "missing_punch"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];
export const REQUEST_KIND_VI: Record<RequestKind, string> = { leave: "Nghỉ phép", late_early: "Đi muộn / về sớm", overtime: "Làm thêm giờ", missing_punch: "Quên chấm công" };

export const REQUEST_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const REQUEST_STATUS_VI: Record<RequestStatus, string> = { pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối", cancelled: "Đã huỷ" };

export const LEAVE_TYPES = ["annual", "sick", "unpaid", "other_paid"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];
export const LEAVE_TYPE_VI: Record<LeaveType, string> = { annual: "Phép năm", sick: "Ốm (có giấy)", unpaid: "Không lương", other_paid: "Việc riêng có lương (cưới, tang…)" };
export const leaveIsPaid = (t: LeaveType) => t !== "unpaid";

export const BACKDATE_DAYS = 7;

export interface RequestInput {
  kind: RequestKind;
  dateFrom: string;
  dateTo: string;
  portion?: "full" | "am" | "pm" | null;
  leaveType?: LeaveType | null;
  lateMin?: number | null;
  earlyMin?: number | null;
  punchIn?: string | null;
  punchOut?: string | null;
  otStart?: string | null;
  otEnd?: string | null;
  reason: string;
}

export function validateRequest(r: RequestInput, today: string): string[] {
  const e: string[] = [];
  if (r.reason.trim().length < 5) e.push("Lý do tối thiểu 5 ký tự");
  if (r.dateTo < r.dateFrom) e.push("Ngày kết thúc phải sau ngày bắt đầu");
  if (r.dateFrom < addDays(today, -BACKDATE_DAYS)) e.push(`Chỉ làm đơn cho ngày trong ${BACKDATE_DAYS} ngày gần nhất — quá hạn nhờ nhân sự chỉnh công`);
  if (r.dateFrom > addDays(today, 90)) e.push("Chỉ làm đơn trước tối đa 90 ngày");
  const single = r.dateFrom === r.dateTo;
  switch (r.kind) {
    case "leave":
      if (!r.leaveType) e.push("Chọn loại nghỉ");
      if (r.portion && r.portion !== "full" && !single) e.push("Nghỉ nửa ngày chỉ áp dụng cho một ngày");
      if ((parseISODate(r.dateTo).getTime() - parseISODate(r.dateFrom).getTime()) / 86400000 > 30) e.push("Một đơn nghỉ tối đa 31 ngày");
      break;
    case "late_early":
      if (!single) e.push("Đơn đi muộn/về sớm cho một ngày");
      if (!(r.lateMin ?? 0) && !(r.earlyMin ?? 0)) e.push("Nhập số phút đi muộn hoặc về sớm");
      if ((r.lateMin ?? 0) < 0 || (r.lateMin ?? 0) > 240 || (r.earlyMin ?? 0) < 0 || (r.earlyMin ?? 0) > 240) e.push("Số phút trong khoảng 1–240");
      break;
    case "overtime": {
      if (!single) e.push("Đơn làm thêm cho một ngày");
      if (!isHHMM(r.otStart) || !isHHMM(r.otEnd)) e.push("Giờ làm thêm dạng HH:MM");
      else {
        const len = hhmm(r.otEnd!) - hhmm(r.otStart!);
        if (len < 30 || len > 480) e.push("Làm thêm từ 30 phút đến 8 giờ");
      }
      break;
    }
    case "missing_punch":
      if (!single) e.push("Đơn quên chấm công cho một ngày");
      if (r.dateFrom > today) e.push("Không làm đơn quên chấm công cho ngày chưa tới");
      if (!r.punchIn && !r.punchOut) e.push("Nhập giờ vào hoặc giờ ra");
      if ((r.punchIn && !isHHMM(r.punchIn)) || (r.punchOut && !isHHMM(r.punchOut))) e.push("Giờ dạng HH:MM");
      if (isHHMM(r.punchIn) && isHHMM(r.punchOut) && hhmm(r.punchOut!) <= hhmm(r.punchIn!)) e.push("Giờ ra phải sau giờ vào");
      break;
  }
  return e;
}

export function requestMinutes(r: Pick<RequestInput, "kind" | "otStart" | "otEnd" | "lateMin" | "earlyMin">): number {
  if (r.kind === "overtime" && isHHMM(r.otStart) && isHHMM(r.otEnd)) return hhmm(r.otEnd!) - hhmm(r.otStart!);
  if (r.kind === "late_early") return (r.lateMin ?? 0) + (r.earlyMin ?? 0);
  return 0;
}

/** Số ngày nghỉ: đếm ngày có ca (nếu có lịch ca), không thì mọi ngày trừ Chủ nhật; nửa ngày = 0,5 */
export function leaveDays(from: string, to: string, portion: "full" | "am" | "pm" | null | undefined, scheduled?: ReadonlySet<string>): number {
  if (portion && portion !== "full") return 0.5;
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (scheduled && scheduled.size > 0 ? scheduled.has(d) : weekdayOf(d) !== 7) n++;
  }
  return n;
}

export function requestTransition(from: RequestStatus, action: "approve" | "reject" | "cancel", who: { isRequester: boolean; isApprover: boolean; isSuperAdmin?: boolean }): RequestStatus {
  if (action === "cancel") {
    if (from === "pending" && (who.isRequester || who.isApprover)) return "cancelled";
    if (from === "approved" && who.isApprover) return "cancelled";
    throw new HrRuleError(from === "approved" ? "Đơn đã duyệt — nhờ người duyệt huỷ" : `Không huỷ được đơn "${REQUEST_STATUS_VI[from]}"`);
  }
  if (from !== "pending") throw new HrRuleError(`Đơn đang "${REQUEST_STATUS_VI[from]}" — không xử lý lại`);
  if (!who.isApprover) throw new HrRuleError("Không có quyền duyệt đơn");
  if (who.isRequester && !who.isSuperAdmin) throw new HrRuleError("Không tự duyệt đơn của chính mình");
  return action === "approve" ? "approved" : "rejected";
}

/* ------------------------------------------------------------------ */
/* Kỳ công                                                             */
/* ------------------------------------------------------------------ */

export const PERIOD_STATUSES = ["open", "locked"] as const;
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

export function periodRange(period: string): { from: string; to: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new HrRuleError("Kỳ công dạng YYYY-MM");
  const from = `${m[1]}-${m[2]}-01`;
  const next = Number(m[2]) === 12 ? `${Number(m[1]) + 1}-01-01` : `${m[1]}-${String(Number(m[2]) + 1).padStart(2, "0")}-01`;
  return { from, to: addDays(next, -1) };
}

export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function lockCheck(x: { pendingRequests: number; missingPunches: number; periodEnd: string; today: string }): { blockers: string[]; warnings: string[] } {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (x.periodEnd >= x.today) blockers.push("Kỳ công chưa kết thúc");
  if (x.pendingRequests > 0) blockers.push(`Còn ${x.pendingRequests} đơn chờ duyệt trong kỳ`);
  if (x.missingPunches > 0) warnings.push(`${x.missingPunches} ngày thiếu giờ vào/ra sẽ tính 0 công`);
  return { blockers, warnings };
}
