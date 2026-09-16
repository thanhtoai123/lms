import type { HHmm, ISODate, ScheduleRule, Weekday } from "../types.js";
import { addDays, isBetween, minutesOf, weekdayOf } from "../dates.js";
import { generateSessions } from "./generateSessions.js";

export interface ExistingSession {
  id: string;
  sequenceNo: number;
  date: ISODate;
  startTime: HHmm;
  endTime: HHmm;
  status: string;
  kind: string;
  roomId: string | null;
  teacherId: string | null;
  hasAttendance: boolean;
  /** Buổi đã được dời tay (rescheduledFromId) */
  moved?: boolean;
}

export interface WeeklySlot {
  weekday: Weekday;
  startTime: HHmm;
  endTime: HHmm;
  roomId: string | null;
  teacherId: string | null;
}

export interface SlotSnapshot { date: ISODate; startTime: HHmm; endTime: HHmm; roomId: string | null; teacherId: string | null }

export interface ReplanChange {
  sessionId: string;
  sequenceNo: number;
  from: SlotSnapshot;
  to: SlotSnapshot;
  changed: boolean;
}

export interface ReplanResult {
  errors: string[];
  warnings: string[];
  movable: number;
  changes: ReplanChange[];
  newEndDate: ISODate | null;
}

export function validateWeeklySlots(slots: WeeklySlot[]): string[] {
  const errs: string[] = [];
  if (!slots.length) errs.push("Cần ít nhất một ca học trong tuần");
  const seen = new Set<string>();
  for (const s of slots) {
    let ok = true;
    try {
      if (minutesOf(s.endTime) <= minutesOf(s.startTime)) { errs.push(`Ca ${s.startTime}–${s.endTime}: giờ kết thúc phải sau giờ bắt đầu`); ok = false; }
    } catch {
      errs.push(`Giờ không hợp lệ: ${s.startTime}–${s.endTime}`);
      ok = false;
    }
    const k = `${s.weekday}-${s.startTime}`;
    if (ok && seen.has(k)) errs.push("Có hai ca trùng thứ và giờ bắt đầu");
    seen.add(k);
  }
  return errs;
}

/**
 * "Áp lịch mới cho buổi đã sinh": giữ nguyên buổi đã diễn ra / đã điểm danh / ngoài lộ trình,
 * xếp lại các buổi chính thức còn lại (từ ngày áp dụng) theo lịch tuần mới, bỏ ngày nghỉ, giữ đủ tổng buổi.
 * Buổi được cập nhật tại chỗ (giữ id) để không mất liên kết học thử / học bù.
 */
export function planScheduleChange(input: {
  sessions: ExistingSession[];
  slots: WeeklySlot[];
  fromDate: ISODate;
  today: ISODate;
  holidays?: ISODate[];
}): ReplanResult {
  const errors = validateWeeklySlots(input.slots);
  const warnings: string[] = [];
  if (input.fromDate <= input.today) errors.push("Ngày áp dụng phải sau hôm nay (không sửa buổi đã/đang diễn ra)");
  const movable = input.sessions
    .filter((s) => s.kind === "regular" && s.status === "scheduled" && s.date >= input.fromDate && !s.hasAttendance)
    .sort((a, b) => a.sequenceNo - b.sequenceNo);
  const stuck = input.sessions.filter((s) => s.kind === "regular" && s.date >= input.fromDate && !movable.includes(s) && s.status !== "cancelled" && s.status !== "rescheduled");
  if (stuck.length) warnings.push(`${stuck.length} buổi từ ngày áp dụng không dời được (đã điểm danh/đang xử lý) — giữ nguyên`);
  const before = input.sessions.filter((s) => s.kind === "regular" && s.date < input.fromDate && s.status !== "cancelled" && s.status !== "rescheduled");
  const maxBeforeSeq = before.reduce((m, s) => Math.max(m, s.sequenceNo), 0);
  if (movable.some((m) => m.sequenceNo < maxBeforeSeq)) warnings.push("Có buổi số nhỏ hơn nằm sau ngày áp dụng — thứ tự buổi sẽ được giữ theo số buổi");
  if (errors.length) return { errors, warnings, movable: movable.length, changes: [], newEndDate: null };
  if (!movable.length) return { errors: ["Không có buổi nào để áp lịch mới từ ngày này"], warnings, movable: 0, changes: [], newEndDate: null };

  const rules: ScheduleRule[] = input.slots.map((s) => ({ ...s, effectiveFrom: input.fromDate, effectiveTo: null }));
  let planned;
  try {
    planned = generateSessions({ classId: "replan", startDate: input.fromDate, totalSessions: movable.length, rules, holidays: input.holidays });
  } catch (e) {
    return { errors: [(e as Error).message], warnings, movable: movable.length, changes: [], newEndDate: null };
  }
  const changes: ReplanChange[] = movable.map((s, i) => {
    const p = planned[i]!;
    const from = { date: s.date, startTime: s.startTime.slice(0, 5), endTime: s.endTime.slice(0, 5), roomId: s.roomId, teacherId: s.teacherId };
    const to = { date: p.date, startTime: p.startTime, endTime: p.endTime, roomId: p.roomId, teacherId: p.teacherId };
    const changed = from.date !== to.date || from.startTime !== to.startTime || from.endTime !== to.endTime || from.roomId !== to.roomId || from.teacherId !== to.teacherId;
    return { sessionId: s.id, sequenceNo: s.sequenceNo, from, to, changed };
  });
  const allDates = [...input.sessions.filter((s) => s.kind === "regular" && s.status !== "cancelled" && s.status !== "rescheduled" && !movable.includes(s)).map((s) => s.date), ...changes.map((c) => c.to.date)];
  const newEndDate = allDates.length ? allDates.reduce((a, b) => (a > b ? a : b)) : null;
  return { errors: [], warnings, movable: movable.length, changes, newEndDate };
}

export type DriftCode = "COUNT" | "HOLIDAY" | "OFF_SCHEDULE" | "ORDER" | "BEFORE_START" | "SEQ_GAP";

export interface DriftIssue { code: DriftCode; sessionId?: string; sequenceNo?: number; date?: ISODate; message: string; severity: "error" | "warning" | "info" }

/**
 * "Kiểm tra lịch buổi học": đối chiếu dãy buổi chính thức với khai giảng + các giai đoạn lịch + ngày nghỉ.
 */
export function checkScheduleDrift(input: {
  startDate: ISODate | null;
  totalSessions: number;
  rules: ScheduleRule[];
  holidays?: ISODate[];
  sessions: ExistingSession[];
}): { ok: boolean; issues: DriftIssue[]; regularCount: number } {
  const issues: DriftIssue[] = [];
  const holidays = new Set(input.holidays ?? []);
  const regular = input.sessions
    .filter((s) => s.kind === "regular" && s.status !== "cancelled" && s.status !== "rescheduled")
    .sort((a, b) => a.sequenceNo - b.sequenceNo);

  if (regular.length !== input.totalSessions) {
    issues.push({ code: "COUNT", severity: "error", message: `Số buổi chính thức ${regular.length} ≠ chuẩn của khoá ${input.totalSessions}` });
  }
  regular.forEach((s, i) => {
    if (s.sequenceNo !== i + 1) {
      issues.push({ code: "SEQ_GAP", severity: "warning", sessionId: s.id, sequenceNo: s.sequenceNo, date: s.date, message: `Số buổi không liên tục: vị trí ${i + 1} đang là buổi ${s.sequenceNo}` });
    }
  });
  for (const s of regular) {
    if (input.startDate && s.date < input.startDate) {
      issues.push({ code: "BEFORE_START", severity: "error", sessionId: s.id, sequenceNo: s.sequenceNo, date: s.date, message: `Buổi ${s.sequenceNo} trước ngày khai giảng` });
    }
    if (holidays.has(s.date)) {
      issues.push({ code: "HOLIDAY", severity: "error", sessionId: s.id, sequenceNo: s.sequenceNo, date: s.date, message: `Buổi ${s.sequenceNo} rơi vào ngày nghỉ` });
    }
    const wd = weekdayOf(s.date);
    const match = input.rules.some((r) => r.weekday === wd && isBetween(s.date, r.effectiveFrom, r.effectiveTo) && r.startTime.slice(0, 5) === s.startTime.slice(0, 5) && r.endTime.slice(0, 5) === s.endTime.slice(0, 5));
    if (!match) {
      issues.push({
        code: "OFF_SCHEDULE", severity: s.moved ? "info" : "warning", sessionId: s.id, sequenceNo: s.sequenceNo, date: s.date,
        message: s.moved ? `Buổi ${s.sequenceNo} đã được dời tay (ngoài lịch tuần)` : `Buổi ${s.sequenceNo} không khớp giai đoạn lịch nào (${s.startTime.slice(0, 5)})`,
      });
    }
  }
  for (let i = 1; i < regular.length; i++) {
    const a = regular[i - 1]!;
    const b = regular[i]!;
    if (`${b.date}T${b.startTime}` < `${a.date}T${a.startTime}`) {
      issues.push({ code: "ORDER", severity: "error", sessionId: b.id, sequenceNo: b.sequenceNo, date: b.date, message: `Buổi ${b.sequenceNo} diễn ra trước buổi ${a.sequenceNo}` });
    }
  }
  return { ok: !issues.some((i) => i.severity !== "info"), issues, regularCount: regular.length };
}

/** Đóng các giai đoạn lịch đang mở trước ngày áp dụng */
export function closePhasesBefore(fromDate: ISODate): ISODate {
  return addDays(fromDate, -1);
}
