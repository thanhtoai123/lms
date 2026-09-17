/**
 * Nhân sự, vị trí, chấm công, đơn từ, kỳ công — quy tắc thuần.
 *
 * Nguyên tắc chấm công (theo bản gốc): **công đếm theo ca đã xếp trên lưới phân ca;
 * lượt quét chỉ sinh cờ để quản lý rà** — không tự trừ công. Chỉ "ghi đè công" của
 * quản lý mới đổi được số công của một ngày.
 */
import { addDays, parseISODate, weekdayOf } from "../dates.js";
import type { Role, RoleAssignment } from "../policy/policy.js";
import { shiftCounts, shiftHasClock, workSegments, type ShiftKind, type ShiftSegment } from "./shifts.js";

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

/** Kiểm tra phân công vị trí mới so với danh sách hiện có */
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
/* Vị trí công việc = bộ vai trò (quyền gắn vào vị trí, không gắn người) */
/* ------------------------------------------------------------------ */

export interface PositionDefInput {
  name: string;
  centerId: string | null;
  roles: readonly Role[];
  isManager: boolean;
  reportsToId?: string | null;
  id?: string | null;
}

/** Kiểm tra khai báo vị trí (bộ vai trò) */
export function validatePositionDef(p: PositionDefInput, existing: readonly { id: string; name: string; centerId: string | null; reportsToId: string | null }[]): string[] {
  const e: string[] = [];
  if (p.name.trim().length < 2) e.push("Tên vị trí tối thiểu 2 ký tự");
  if (!p.roles.length) e.push("Chọn ít nhất một vai trò cho vị trí");
  if (p.roles.some((r) => r === "PARENT" || r === "STUDENT")) e.push("Vị trí công việc không gán vai trò Phụ huynh / Học viên");
  if (new Set(p.roles).size !== p.roles.length) e.push("Vai trò bị trùng");
  const dup = existing.find((x) => x.id !== p.id && x.centerId === p.centerId && x.name.trim().toLowerCase() === p.name.trim().toLowerCase());
  if (dup) e.push("Đã có vị trí cùng tên trong đơn vị này");
  if (p.reportsToId) {
    if (p.reportsToId === p.id) e.push("Vị trí không thể báo cáo cho chính nó");
    else {
      // chống vòng lặp trong cây báo cáo
      const byId = new Map(existing.map((x) => [x.id, x]));
      const seen = new Set<string>([p.id ?? "new"]);
      let cur = byId.get(p.reportsToId);
      while (cur) {
        if (seen.has(cur.id)) {
          e.push("Cây báo cáo bị vòng lặp");
          break;
        }
        seen.add(cur.id);
        cur = cur.reportsToId ? byId.get(cur.reportsToId) : undefined;
      }
    }
  }
  return e;
}

export const USER_ROLE_SOURCES = ["manual", "position"] as const;
export type UserRoleSource = (typeof USER_ROLE_SOURCES)[number];
export const USER_ROLE_SOURCE_VI: Record<UserRoleSource, string> = { manual: "Cấp tay", position: "Theo vị trí" };

export interface TimedRoleAssignment extends RoleAssignment {
  validFrom?: string | null;
  validTo?: string | null;
}

/** Vai trò còn hiệu lực tại ngày `date` — hết hạn là quyền tự tắt ở lần truy cập kế tiếp */
export function roleValidOn(a: { validFrom?: string | null; validTo?: string | null }, date: string): boolean {
  return (!a.validFrom || a.validFrom <= date) && (!a.validTo || a.validTo >= date);
}

export function activeRoleAssignments(rows: readonly TimedRoleAssignment[], date: string): RoleAssignment[] {
  const out: RoleAssignment[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!roleValidOn(r, date)) continue;
    const k = `${r.role}|${r.centerId ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ role: r.role, centerId: r.centerId });
  }
  return out;
}

export interface DeploymentLite {
  centerId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/**
 * Điều động tác nghiệp: mở **phạm vi dữ liệu** của cơ sở được điều động trong đúng
 * khoảng thời gian — không đổi vai trò, không đổi biên chế. Hết hạn là mất truy cập ngay.
 */
export function widenByDeployments(assignments: readonly RoleAssignment[], deployments: readonly DeploymentLite[], date: string): RoleAssignment[] {
  const active = deployments.filter((d) => d.effectiveFrom <= date && (!d.effectiveTo || d.effectiveTo >= date));
  if (!active.length) return [...assignments];
  const out = [...assignments];
  const has = (role: Role, centerId: string | null) => out.some((a) => a.role === role && a.centerId === centerId);
  for (const d of active) {
    for (const a of assignments) {
      if (a.centerId === null) continue; // vai trò toàn hệ thống đã bao trùm
      if (!has(a.role, d.centerId)) out.push({ role: a.role, centerId: d.centerId });
    }
  }
  return out;
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

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export const MAX_GPS_ACCURACY_M = 200;

/** Chấm công theo bán kính cơ sở: chưa đặt toạ độ → cho phép (ghi nhận không kiểm tra) */
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
/* Cờ chấm công                                                        */
/* ------------------------------------------------------------------ */

export const TIMESHEET_FLAGS = [
  "no_punch", "missing_out", "missing_in", "missing_am", "missing_pm",
  "late", "early", "short_hours", "near_start",
  "outside_geofence", "no_gps", "poor_gps", "no_geo_point", "wrong_place",
  "off_schedule", "duplicate_punch", "over_limit", "holiday_work", "manual_fix", "excused",
] as const;
export type TimesheetFlag = (typeof TIMESHEET_FLAGS)[number];

export const TIMESHEET_FLAG_VI: Record<TimesheetFlag, string> = {
  no_punch: "Không có lượt", missing_out: "Thiếu lượt ra", missing_in: "Ra không có vào", missing_am: "Thiếu buổi sáng", missing_pm: "Thiếu buổi chiều",
  late: "Đi muộn", early: "Về sớm", short_hours: "Thiếu giờ", near_start: "Đến sát giờ",
  outside_geofence: "Ngoài vùng", no_gps: "Thiếu GPS", poor_gps: "GPS kém", no_geo_point: "Chưa toạ độ", wrong_place: "Sai nơi làm",
  off_schedule: "Chấm ngoài lịch", duplicate_punch: "Bấm trùng", over_limit: "Vượt trần lượt", holiday_work: "Làm ngày lễ", manual_fix: "Chỉnh tay (đơn duyệt)", excused: "Vắng có lý do",
};

/** Cờ cần quản lý rà (các cờ còn lại chỉ để ghi nhận) */
export const REVIEWABLE_FLAGS: readonly TimesheetFlag[] = [
  "no_punch", "missing_out", "missing_in", "missing_am", "missing_pm", "late", "early", "short_hours",
  "outside_geofence", "no_gps", "poor_gps", "wrong_place", "off_schedule", "duplicate_punch", "over_limit",
];
export const isReviewableFlag = (f: TimesheetFlag) => REVIEWABLE_FLAGS.includes(f);

export const FLAG_REVIEW_ACTIONS = ["ack", "dismiss", "excused"] as const;
export type FlagReviewAction = (typeof FLAG_REVIEW_ACTIONS)[number];
export const FLAG_REVIEW_ACTION_VI: Record<FlagReviewAction, string> = { ack: "Đã ghi nhận có lý do", dismiss: "Đã gỡ kết luận", excused: "Vắng có lý do" };

/* ------------------------------------------------------------------ */
/* Tính công ngày                                                      */
/* ------------------------------------------------------------------ */

export const GRACE_MIN = 5;
/** Chênh so với giờ kế hoạch mới gắn cờ "Thiếu giờ" */
export const SHORT_HOURS_MIN = 15;
/** Đến trong khoảng này trước giờ vào → cờ "Đến sát giờ" */
export const NEAR_START_MIN = 2;

export const DAY_STATUSES = ["present", "late", "early", "late_early", "absent", "excused", "leave", "half_leave", "missing_in", "missing_out", "off", "holiday", "upcoming", "working", "override"] as const;
export type DayStatus = (typeof DAY_STATUSES)[number];
export const DAY_STATUS_VI: Record<DayStatus, string> = {
  present: "Đủ công", late: "Đi muộn", early: "Về sớm", late_early: "Muộn + sớm", absent: "Vắng", excused: "Vắng có lý do", leave: "Nghỉ phép", half_leave: "Nghỉ nửa ngày",
  missing_in: "Thiếu giờ vào", missing_out: "Thiếu giờ ra", off: "Không có ca", holiday: "Ngày lễ", upcoming: "Sắp tới", working: "Đang làm", override: "Đã ghi đè",
};
export const DAY_STATUS_SHORT: Record<DayStatus, string> = {
  present: "✓", late: "M", early: "S", late_early: "MS", absent: "V", excused: "Vl", leave: "P", half_leave: "½P", missing_in: "?", missing_out: "?", off: "", holiday: "L", upcoming: "·", working: "…", override: "✎",
};

/** Ca đã xếp cho một ngày (rút gọn từ danh mục mã ca) */
export interface DayShift {
  code: string;
  kind: ShiftKind;
  units: number;
  segments: ShiftSegment[];
  plannedMin: number;
  punchRequired: boolean;
}

export interface DayInput {
  date: string;
  today: string;
  shift: DayShift | null;
  inMin: number | null;
  outMin: number | null;
  punchCount?: number;
  /** có lượt chấm sinh từ đơn duyệt / sửa tay */
  manualPunch?: boolean;
  /** ca nghỉ phép: có lương hay không */
  leavePaid?: boolean;
  holiday?: boolean;
  /** quản lý đã kết luận "vắng có lý do" */
  excused?: boolean;
  /** ghi đè công (luôn thắng) */
  override?: { units: number; label: string; note: string } | null;
  graceMin?: number;
  otMin?: number;
  /** cờ phát hiện lúc chấm (ngoài vùng, thiếu GPS, bấm trùng…) */
  punchFlags?: readonly TimesheetFlag[];
}

export interface DayResult {
  status: DayStatus;
  units: number;
  plannedMin: number;
  workedMin: number;
  lateMin: number;
  earlyMin: number;
  flags: TimesheetFlag[];
  paidLeave: number;
  unpaidLeave: number;
  holidayUnits: number;
  otMin: number;
  note: string | null;
}

/**
 * Công của một ngày.
 *
 * - Không có ca → 0 công (có quét thì gắn cờ "Chấm ngoài lịch").
 * - Ca chỉ nơi làm / linh động → đủ công của mã ca, không xét giờ.
 * - Ca có giờ + ít nhất một lượt quét → **đủ công của mã ca**; muộn / sớm / thiếu giờ /
 *   thiếu lượt chỉ là **cờ** để quản lý rà.
 * - Ca có giờ, không quét lượt nào → 0 công + cờ "Không có lượt".
 * - Mã nghỉ (X) / nghỉ phép (P) → 0 công.
 * - Ghi đè công của quản lý luôn thắng.
 */
export function computeDay(i: DayInput): DayResult {
  const grace = i.graceMin ?? GRACE_MIN;
  const sh = i.shift;
  const flags = new Set<TimesheetFlag>(i.punchFlags ?? []);
  if (i.manualPunch) flags.add("manual_fix");
  const hasIn = i.inMin != null;
  const hasOut = i.outMin != null;
  const hasPunch = hasIn || hasOut;
  const segs = sh ? workSegments(sh.segments) : [];
  const plannedMin = sh && shiftCounts(sh.kind) ? sh.plannedMin : 0;
  const worked = (() => {
    if (!hasIn || !hasOut) return 0;
    if (!segs.length) return Math.max(0, i.outMin! - i.inMin!);
    return segs.reduce((n, s) => n + Math.max(0, Math.min(i.outMin!, s.to) - Math.max(i.inMin!, s.from)), 0);
  })();
  const out = (over: Partial<DayResult>): DayResult => ({
    status: "off", units: 0, plannedMin, workedMin: worked, lateMin: 0, earlyMin: 0,
    paidLeave: 0, unpaidLeave: 0, holidayUnits: 0, otMin: i.otMin ?? 0, note: null,
    ...over, flags: [...flags].sort(),
  });

  if (i.override) {
    flags.add("manual_fix");
    return out({ status: "override", units: i.override.units, note: `${i.override.label}: ${i.override.note}` });
  }
  if (!sh) {
    if (hasPunch) flags.add("off_schedule");
    return out({ status: "off" });
  }
  if (sh.kind === "off") {
    if (hasPunch) flags.add("off_schedule");
    return out({ status: "off" });
  }
  if (sh.kind === "leave") {
    const d = sh.units > 0 ? sh.units : 1;
    return out({ status: "leave", paidLeave: i.leavePaid === false ? 0 : d, unpaidLeave: i.leavePaid === false ? d : 0 });
  }
  if (i.date > i.today) return out({ status: "upcoming" });
  if (i.holiday) {
    if (hasPunch) flags.add("holiday_work");
    return out({ status: "holiday", holidayUnits: sh.units });
  }
  if (!shiftHasClock(sh.kind)) {
    if (sh.punchRequired && !hasPunch && i.date < i.today) flags.add("no_punch");
    return out({ status: "present", units: sh.units });
  }

  // Ca có giờ
  if (!hasPunch) {
    if (i.date === i.today) return out({ status: "upcoming" });
    flags.add("no_punch");
    if (i.excused) {
      flags.add("excused");
      return out({ status: "excused" });
    }
    return out({ status: "absent" });
  }
  const start = segs[0]?.from ?? 0;
  const end = segs[segs.length - 1]?.to ?? 0;
  let lateMin = 0;
  let earlyMin = 0;
  if (hasIn) {
    const d = i.inMin! - start;
    if (d > grace) {
      lateMin = d;
      flags.add("late");
    } else if (d > -NEAR_START_MIN && d <= grace) flags.add("near_start");
  } else flags.add("missing_in");
  if (hasOut) {
    const d = end - i.outMin!;
    if (d > grace) {
      earlyMin = d;
      flags.add("early");
    }
  } else if (i.date !== i.today) flags.add("missing_out");
  if (hasIn && hasOut) {
    for (const s of segs) {
      if (Math.min(i.outMin!, s.to) - Math.max(i.inMin!, s.from) <= 0) flags.add(s.from < 12 * 60 ? "missing_am" : "missing_pm");
    }
    if (plannedMin - worked > SHORT_HOURS_MIN) flags.add("short_hours");
  }
  const status: DayStatus = !hasIn ? "missing_in"
    : !hasOut ? (i.date === i.today ? "working" : "missing_out")
      : lateMin && earlyMin ? "late_early" : lateMin ? "late" : earlyMin ? "early" : "present";
  return out({ status, units: sh.units, lateMin, earlyMin });
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
  earlyMin: number;
  absentCount: number;
  missingCount: number;
  noPunchCount: number;
  flagDays: number;
  overrideCount: number;
  plannedMin: number;
  workedMin: number;
  otMin: number;
}

export function summarizeDays(days: readonly (DayResult & { scheduled?: boolean })[]): PeriodSummary {
  const s: PeriodSummary = {
    scheduled: 0, workUnits: 0, paidLeave: 0, unpaidLeave: 0, holiday: 0, payableUnits: 0,
    lateCount: 0, lateMin: 0, earlyCount: 0, earlyMin: 0, absentCount: 0, missingCount: 0, noPunchCount: 0,
    flagDays: 0, overrideCount: 0, plannedMin: 0, workedMin: 0, otMin: 0,
  };
  for (const d of days) {
    if (d.scheduled) s.scheduled++;
    s.workUnits += d.units;
    s.paidLeave += d.paidLeave;
    s.unpaidLeave += d.unpaidLeave;
    s.holiday += d.holidayUnits;
    if (d.lateMin > 0) s.lateCount++;
    s.lateMin += d.lateMin;
    if (d.earlyMin > 0) s.earlyCount++;
    s.earlyMin += d.earlyMin;
    if (d.status === "absent") s.absentCount++;
    if (d.status === "missing_in" || d.status === "missing_out") s.missingCount++;
    if (d.flags.includes("no_punch")) s.noPunchCount++;
    if (d.status === "override") s.overrideCount++;
    if (d.flags.some(isReviewableFlag)) s.flagDays++;
    s.plannedMin += d.plannedMin;
    s.workedMin += d.workedMin;
    s.otMin += d.otMin;
  }
  s.payableUnits = s.workUnits + s.paidLeave + s.holiday;
  return s;
}

/* ------------------------------------------------------------------ */
/* Đơn từ — 10 loại, 3 nhóm                                            */
/* ------------------------------------------------------------------ */

export const REQUEST_KINDS = [
  "class_change", "sub_teach", "class_off",
  "shift_swap", "overtime", "late_early", "timesheet_fix",
  "leave", "remote", "business_trip",
] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const REQUEST_KIND_VI: Record<RequestKind, string> = {
  class_change: "Đổi lớp dạy", sub_teach: "Dạy thay", class_off: "Nghỉ buổi dạy",
  shift_swap: "Đổi ca", overtime: "Tăng ca (OT)", late_early: "Đi muộn / Về sớm", timesheet_fix: "Chỉnh công",
  leave: "Nghỉ phép", remote: "Làm từ xa", business_trip: "Đi công tác",
};

export const REQUEST_GROUPS = ["class", "shift", "leave"] as const;
export type RequestGroup = (typeof REQUEST_GROUPS)[number];
export const REQUEST_GROUP_VI: Record<RequestGroup, string> = { class: "Liên quan lớp học", shift: "Ca làm & chấm công", leave: "Nghỉ phép & khác" };
export const REQUEST_KIND_GROUP: Record<RequestKind, RequestGroup> = {
  class_change: "class", sub_teach: "class", class_off: "class",
  shift_swap: "shift", overtime: "shift", late_early: "shift", timesheet_fix: "shift",
  leave: "leave", remote: "leave", business_trip: "leave",
};
export const requestKindsOf = (g: RequestGroup): RequestKind[] => REQUEST_KINDS.filter((k) => REQUEST_KIND_GROUP[k] === g);
/** Đơn chỉ dành cho giáo viên có lớp */
export const isClassRequest = (k: RequestKind) => REQUEST_KIND_GROUP[k] === "class";

export const REQUEST_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const REQUEST_STATUS_VI: Record<RequestStatus, string> = { pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối", cancelled: "Đã huỷ" };

export const LEAVE_TYPES = ["annual", "unpaid", "marriage", "child_marriage", "bereavement", "sick_insurance", "maternity", "compensatory"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];
export const LEAVE_TYPE_VI: Record<LeaveType, string> = {
  annual: "Nghỉ phép năm", unpaid: "Nghỉ không lương", marriage: "Nghỉ kết hôn", child_marriage: "Nghỉ con kết hôn",
  bereavement: "Nghỉ ma chay", sick_insurance: "Nghỉ hưởng BHXH (ốm)", maternity: "Nghỉ thai sản", compensatory: "Nghỉ bù",
};
/** Có lương hay không — BHXH và thai sản do bảo hiểm chi trả nên không tính lương ngày công */
export const LEAVE_TYPE_PAID: Record<LeaveType, boolean> = {
  annual: true, unpaid: false, marriage: true, child_marriage: true, bereavement: true, sick_insurance: false, maternity: false, compensatory: true,
};
export const leaveIsPaid = (t: LeaveType) => LEAVE_TYPE_PAID[t];
/** Loại nghỉ trừ vào số dư phép năm */
export const leaveUsesBalance = (t: LeaveType) => t === "annual";

export const LATE_EARLY_KINDS = ["late", "early"] as const;
export type LateEarlyKind = (typeof LATE_EARLY_KINDS)[number];
export const LATE_EARLY_KIND_VI: Record<LateEarlyKind, string> = { late: "Đi muộn", early: "Về sớm" };

/** Số ngày báo trước theo loại đơn — nộp sát hơn vẫn gửi được nhưng mang cờ "Nộp muộn" */
export const NOTICE_DAYS: Record<RequestKind, number> = {
  class_change: 2, sub_teach: 1, class_off: 2,
  shift_swap: 1, overtime: 0, late_early: 0, timesheet_fix: 0,
  leave: 3, remote: 1, business_trip: 2,
};

/** Được làm đơn lùi tối đa bao nhiêu ngày */
export const BACKDATE_DAYS = 7;
export const BACKDATE_DAYS_FIX = 31;
export const backdateLimit = (k: RequestKind) => (k === "timesheet_fix" ? BACKDATE_DAYS_FIX : BACKDATE_DAYS);
/** Quá hạn xử lý của người duyệt */
export const APPROVAL_SLA_DAYS = 2;

export interface RequestInput {
  kind: RequestKind;
  dateFrom: string;
  dateTo: string;
  reason: string;
  /** Lớp học (đơn nhóm lớp) */
  classId?: string | null;
  /** Người dạy thay / người nhận ca */
  targetStaffId?: string | null;
  /** Mã ca mới của người nộp / của người nhận ca */
  requesterShiftId?: string | null;
  targetShiftId?: string | null;
  leaveType?: LeaveType | null;
  portion?: "full" | "am" | "pm" | null;
  lateEarlyKind?: LateEarlyKind | null;
  /** Giờ đi muộn / về sớm */
  atTime?: string | null;
  /** Khung giờ tăng ca */
  startTime?: string | null;
  endTime?: string | null;
  /** Mốc giờ đề nghị cho đơn chỉnh công */
  punchIn?: string | null;
  punchOut?: string | null;
  /** Nơi đến (đi công tác) */
  destination?: string | null;
  /** Cơ sở nhận đơn (người Hội sở tự chọn) */
  receivingCenterId?: string | null;
  /** Người nộp thuộc Hội sở → bắt buộc chọn cơ sở nhận đơn */
  needsCenterChoice?: boolean;
}

const MAX_SPAN_DAYS = 31;
const spanDays = (from: string, to: string) => Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / 86400000) + 1;

/** Kiểm tra đơn theo từng loại (trường riêng của loại nào chỉ bắt buộc với loại đó) */
export function validateRequest(r: RequestInput, today: string): string[] {
  const e: string[] = [];
  if (r.reason.trim().length < 5) e.push("Nhập lý do (tối thiểu 5 ký tự)");
  if (r.dateTo < r.dateFrom) e.push("Ngày kết thúc phải sau ngày bắt đầu");
  if (r.dateFrom < addDays(today, -backdateLimit(r.kind))) e.push(`Chỉ làm đơn cho ngày trong ${backdateLimit(r.kind)} ngày gần nhất — quá hạn nhờ nhân sự chỉnh công`);
  if (r.dateFrom > addDays(today, 90)) e.push("Chỉ làm đơn trước tối đa 90 ngày");
  if (r.needsCenterChoice && !r.receivingCenterId) e.push("Chọn cơ sở nhận đơn");
  const single = r.dateFrom === r.dateTo;
  const oneDay = (label: string) => {
    if (!single) e.push(`Đơn ${label} chỉ cho một ngày`);
  };
  const span = (label: string) => {
    if (spanDays(r.dateFrom, r.dateTo) > MAX_SPAN_DAYS) e.push(`Một đơn ${label} tối đa ${MAX_SPAN_DAYS} ngày`);
  };
  switch (r.kind) {
    case "class_change":
    case "class_off":
      oneDay(REQUEST_KIND_VI[r.kind].toLowerCase());
      if (!r.classId) e.push("Chọn lớp");
      break;
    case "sub_teach":
      oneDay("dạy thay");
      if (!r.classId) e.push("Chọn lớp");
      if (r.targetStaffId && r.targetShiftId) e.push("Đơn dạy thay không đổi mã ca của người dạy thay");
      break;
    case "shift_swap":
      oneDay("đổi ca");
      if (!r.requesterShiftId) e.push("Chọn mã ca mới");
      if (r.targetShiftId && !r.targetStaffId) e.push("Chọn người nhận ca trước khi đặt mã ca cho họ");
      break;
    case "overtime":
      oneDay("tăng ca");
      if (!isHHMM(r.startTime) || !isHHMM(r.endTime)) e.push("Giờ tăng ca dạng HH:MM");
      else {
        const len = hhmm(r.endTime!) - hhmm(r.startTime!);
        if (len < 30 || len > 480) e.push("Tăng ca từ 30 phút đến 8 giờ");
      }
      break;
    case "late_early":
      oneDay("đi muộn / về sớm");
      if (!r.lateEarlyKind) e.push("Chọn hình thức: đi muộn hay về sớm");
      if (!isHHMM(r.atTime)) e.push("Nhập giờ dạng HH:MM");
      break;
    case "timesheet_fix":
      oneDay("chỉnh công");
      if (r.dateFrom > today) e.push("Không làm đơn chỉnh công cho ngày chưa tới");
      if (!r.punchIn && !r.punchOut) e.push("Nhập giờ vào hoặc giờ ra đề nghị");
      if ((r.punchIn && !isHHMM(r.punchIn)) || (r.punchOut && !isHHMM(r.punchOut))) e.push("Giờ dạng HH:MM");
      if (isHHMM(r.punchIn) && isHHMM(r.punchOut) && hhmm(r.punchOut!) <= hhmm(r.punchIn!)) e.push("Giờ ra phải sau giờ vào");
      break;
    case "leave":
      if (!r.leaveType) e.push("Chọn loại nghỉ");
      if (r.portion && r.portion !== "full" && !single) e.push("Nghỉ nửa ngày chỉ áp dụng cho một ngày");
      span("nghỉ");
      break;
    case "remote":
      span("làm từ xa");
      break;
    case "business_trip":
      if (!r.destination || r.destination.trim().length < 2) e.push("Nhập nơi đến");
      span("đi công tác");
      break;
  }
  return e;
}

/** Nộp muộn: gửi sát ngày áp dụng hơn số ngày báo trước của loại đơn */
export function isLateSubmission(r: { kind: RequestKind; dateFrom: string }, submittedOn: string): boolean {
  const notice = NOTICE_DAYS[r.kind];
  if (notice === 0) return r.dateFrom < submittedOn;
  return r.dateFrom < addDays(submittedOn, notice);
}

/** Số phút quy đổi của đơn (tăng ca / đi muộn — dùng cho tổng hợp) */
export function requestMinutes(r: Pick<RequestInput, "kind" | "startTime" | "endTime">): number {
  if (r.kind === "overtime" && isHHMM(r.startTime) && isHHMM(r.endTime)) return hhmm(r.endTime!) - hhmm(r.startTime!);
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

/** Xem trước hệ quả khi duyệt — hiển thị ở cột "Thay đổi" của /don-tu */
export function describeRequestEffect(
  r: Pick<RequestInput, "kind" | "dateFrom" | "dateTo" | "portion" | "leaveType" | "lateEarlyKind" | "atTime" | "startTime" | "endTime" | "punchIn" | "punchOut" | "destination">,
  ctx: { currentShiftCode?: string | null; newShiftCode?: string | null; targetName?: string | null; targetCurrentShiftCode?: string | null; targetNewShiftCode?: string | null; className?: string | null; leaveShiftCode?: string | null } = {},
): string {
  const cur = ctx.currentShiftCode || "—";
  switch (r.kind) {
    case "class_change":
      return `${ctx.className ?? "lớp"}: đổi người dạy`;
    case "sub_teach":
      return `${ctx.className ?? "lớp"}: ${ctx.targetName ? `${ctx.targetName} dạy thay` : "chờ chỉ định người dạy thay"}`;
    case "class_off":
      return `${ctx.className ?? "lớp"}: huỷ buổi ${r.dateFrom.split("-").reverse().join("/")}`;
    case "shift_swap": {
      const mine = `${cur} → ${ctx.newShiftCode ?? "?"}`;
      if (!ctx.targetName) return mine;
      return `${mine} · ${ctx.targetName}: ${ctx.targetCurrentShiftCode ?? "—"} → ${ctx.targetNewShiftCode ?? cur}`;
    }
    case "overtime":
      return `Thêm giờ ${r.startTime ?? "?"}–${r.endTime ?? "?"}`;
    case "late_early":
      return `${r.lateEarlyKind === "early" ? "Về sớm" : "Đi muộn"} ${r.atTime ?? "?"} — bỏ qua cờ`;
    case "timesheet_fix":
      return `Thêm mốc ${[r.punchIn ? `vào ${r.punchIn}` : null, r.punchOut ? `ra ${r.punchOut}` : null].filter(Boolean).join(", ")}`;
    case "leave":
      return `${cur} → ${ctx.leaveShiftCode ?? "P"}${r.portion && r.portion !== "full" ? ` (${r.portion === "am" ? "sáng" : "chiều"})` : ""}`;
    case "remote":
      return `${cur} → ${ctx.newShiftCode ?? "LD"} (làm từ xa)`;
    case "business_trip":
      return `${cur} → ${ctx.newShiftCode ?? "NG"}${r.destination ? ` · ${r.destination}` : ""}`;
  }
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

export function lockCheck(x: { pendingRequests: number; unreviewedFlagDays: number; noPunchDays: number; periodEnd: string; today: string }): { blockers: string[]; warnings: string[] } {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (x.periodEnd >= x.today) blockers.push("Kỳ công chưa kết thúc");
  if (x.pendingRequests > 0) blockers.push(`Còn ${x.pendingRequests} đơn chờ duyệt trong kỳ`);
  if (x.unreviewedFlagDays > 0) warnings.push(`${x.unreviewedFlagDays} ngày còn cờ chưa rà`);
  if (x.noPunchDays > 0) warnings.push(`${x.noPunchDays} ngày có ca nhưng không quét lượt nào (đang tính 0 công)`);
  return { blockers, warnings };
}

/** Số công chuẩn mặc định của kỳ: số ngày − ngày nghỉ tuần − ngày lễ */
export function standardUnits(period: string, weeklyOffDays: readonly number[], holidays: readonly string[]): number {
  const { from, to } = periodRange(period);
  let n = 0;
  for (const d of datesBetween(from, to)) {
    if (weeklyOffDays.includes(weekdayOf(d))) continue;
    if (holidays.includes(d)) continue;
    n++;
  }
  return n;
}
