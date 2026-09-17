import type { HHmm, ISODate, ScheduleRule, Weekday } from "../types.js";
import { addDays, isBetween, minutesOf, weekdayOf } from "../dates.js";
import { generateSessions } from "./generateSessions.js";
import { EXTRA_SEQUENCE_BASE, nextArchiveSequence } from "../classes/lifecycle.js";

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
  /** Buổi đã có dữ liệu khác: nhận xét, bài tập, ảnh, đã hoàn tất — không bao giờ tự dời */
  hasContent?: boolean;
  /** Buổi đã được dời tay (rescheduledFromId) */
  moved?: boolean;
}

const isLiveRegular = (s: ExistingSession) => s.kind === "regular" && s.sequenceNo <= EXTRA_SEQUENCE_BASE && s.status !== "cancelled" && s.status !== "rescheduled";
/** Buổi có dữ liệu (điểm danh, nhận xét, bài tập, ảnh, hoàn tất) */
export const sessionHasData = (s: ExistingSession) => s.hasAttendance || !!s.hasContent;
const hm = (t: string) => t.slice(0, 5);
const slotKey = (d: ISODate, t: string) => `${d} ${hm(t)}`;
const bySeq = (a: ExistingSession, b: ExistingSession) => a.sequenceNo - b.sequenceNo;
const byTime = (a: { date: ISODate; startTime: string }, b: { date: ISODate; startTime: string }) => slotKey(a.date, a.startTime).localeCompare(slotKey(b.date, b.startTime));

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
  const rules: ScheduleRule[] = input.slots.map((s) => ({ ...s, effectiveFrom: input.fromDate, effectiveTo: null }));
  return planReflow({ sessions: input.sessions, rules, fromDate: input.fromDate, today: input.today, holidays: input.holidays, extraErrors: errors });
}

/**
 * Xếp lại buổi chính thức chưa diễn ra từ `fromDate` theo các giai đoạn lịch (có hiệu lực) + ngày nghỉ.
 * Dùng cho "Áp lịch mới" và "Thêm ngày nghỉ → dời buổi bị ảnh hưởng".
 */
export function planReflow(input: {
  sessions: ExistingSession[];
  rules: ScheduleRule[];
  fromDate: ISODate;
  today: ISODate;
  holidays?: ISODate[];
  extraErrors?: string[];
}): ReplanResult {
  const errors = [...(input.extraErrors ?? [])];
  const warnings: string[] = [];
  if (input.fromDate <= input.today) errors.push("Ngày áp dụng phải sau hôm nay (không sửa buổi đã/đang diễn ra)");
  if (!input.rules.length) errors.push("Lớp chưa có lịch học");
  const movable = input.sessions
    .filter((s) => s.kind === "regular" && s.status === "scheduled" && s.date >= input.fromDate && !sessionHasData(s))
    .sort((a, b) => a.sequenceNo - b.sequenceNo);
  const stuck = input.sessions.filter((s) => s.kind === "regular" && s.date >= input.fromDate && !movable.includes(s) && s.status !== "cancelled" && s.status !== "rescheduled");
  if (stuck.length) warnings.push(`${stuck.length} buổi từ ngày áp dụng không dời được (đã điểm danh / có nhận xét, bài tập, ảnh / đang xử lý) — giữ nguyên`);
  const before = input.sessions.filter((s) => s.kind === "regular" && s.date < input.fromDate && s.status !== "cancelled" && s.status !== "rescheduled");
  const maxBeforeSeq = before.reduce((m, s) => Math.max(m, s.sequenceNo), 0);
  if (movable.some((m) => m.sequenceNo < maxBeforeSeq)) warnings.push("Có buổi số nhỏ hơn nằm sau ngày áp dụng — thứ tự buổi sẽ được giữ theo số buổi");
  if (errors.length) return { errors, warnings, movable: movable.length, changes: [], newEndDate: null };
  if (!movable.length) return { errors: ["Không có buổi nào để áp lịch mới từ ngày này"], warnings, movable: 0, changes: [], newEndDate: null };

  let planned;
  try {
    planned = generateSessions({ classId: "replan", startDate: input.fromDate, totalSessions: movable.length, rules: input.rules, holidays: input.holidays });
  } catch (e) {
    return { errors: [(e as Error).message], warnings, movable: movable.length, changes: [], newEndDate: null };
  }
  const changes: ReplanChange[] = movable.map((s, i) => {
    const p = planned[i]!;
    const from = { date: s.date, startTime: s.startTime.slice(0, 5), endTime: s.endTime.slice(0, 5), roomId: s.roomId, teacherId: s.teacherId };
    const to = { date: p.date, startTime: p.startTime.slice(0, 5), endTime: p.endTime.slice(0, 5), roomId: p.roomId, teacherId: p.teacherId };
    const changed = from.date !== to.date || from.startTime !== to.startTime || from.endTime !== to.endTime || from.roomId !== to.roomId || from.teacherId !== to.teacherId;
    return { sessionId: s.id, sequenceNo: s.sequenceNo, from, to, changed };
  });
  const allDates = [...input.sessions.filter((s) => s.kind === "regular" && s.status !== "cancelled" && s.status !== "rescheduled" && !movable.includes(s)).map((s) => s.date), ...changes.map((c) => c.to.date)];
  const newEndDate = allDates.length ? allDates.reduce((a, b) => (a > b ? a : b)) : null;
  return { errors: [], warnings, movable: movable.length, changes, newEndDate };
}

/** Các ngày trong khoảng [from, to] (tối đa 60 ngày) */
export function dateRange(from: ISODate, to: ISODate, max = 60): ISODate[] {
  const out: ISODate[] = [];
  let d = from;
  while (d <= to && out.length < max) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

export type DriftCode = "COUNT" | "HOLIDAY" | "OFF_SCHEDULE" | "ORDER" | "BEFORE_START" | "SEQ_GAP" | "ANCHOR";

export interface DriftIssue { code: DriftCode; sessionId?: string; sequenceNo?: number; date?: ISODate; message: string; severity: "error" | "warning" | "info" }

/**
 * Quét các ca học theo lịch (giai đoạn có hiệu lực), bỏ ngày nghỉ và các ca đã bị chiếm.
 * Bắt đầu từ ngày `from`; nếu có `afterTime` thì trong ngày `from` chỉ lấy ca bắt đầu sau giờ đó.
 */
export function scanSlots(input: {
  rules: ScheduleRule[];
  holidays?: ISODate[];
  from: ISODate;
  afterTime?: HHmm | null;
  count: number;
  /** Ca (ngày + giờ bắt đầu) không được dùng */
  blocked?: { date: ISODate; startTime: HHmm }[];
  notBefore?: ISODate | null;
  maxScanDays?: number;
}): SlotSnapshot[] {
  const hol = new Set(input.holidays ?? []);
  const blocked = new Set((input.blocked ?? []).map((b) => slotKey(b.date, b.startTime)));
  const out: SlotSnapshot[] = [];
  if (!input.rules.length || input.count <= 0) return out;
  let d = input.from;
  for (let scanned = 0; out.length < input.count && scanned < (input.maxScanDays ?? 1095); scanned++, d = addDays(d, 1)) {
    if (hol.has(d) || (input.notBefore && d < input.notBefore)) continue;
    const wd = weekdayOf(d);
    const todays = input.rules.filter((r) => r.weekday === wd && isBetween(d, r.effectiveFrom, r.effectiveTo)).sort((a, b) => hm(a.startTime).localeCompare(hm(b.startTime)));
    for (const r of todays) {
      if (out.length >= input.count) break;
      if (d === input.from && input.afterTime && hm(r.startTime) <= hm(input.afterTime)) continue;
      const k = slotKey(d, r.startTime);
      if (blocked.has(k)) continue;
      blocked.add(k);
      out.push({ date: d, startTime: hm(r.startTime), endTime: hm(r.endTime), roomId: r.roomId, teacherId: r.teacherId });
    }
  }
  return out;
}

/** Ca của các buổi chính thức đã huỷ — không được dùng lại khi neo dãy buổi */
function cancelledSlots(sessions: ExistingSession[]) {
  return sessions.filter((s) => s.kind === "regular" && s.status === "cancelled").map((s) => ({ date: s.date, startTime: s.startTime }));
}

/** Dãy ca đúng theo khai giảng + lịch + ngày nghỉ cho `count` buổi (bỏ qua ca của buổi đã huỷ) */
export function expectedSlots(input: { startDate: ISODate; rules: ScheduleRule[]; holidays?: ISODate[]; count: number; sessions?: ExistingSession[] }): SlotSnapshot[] {
  return scanSlots({ rules: input.rules, holidays: input.holidays, from: input.startDate, count: input.count, blocked: cancelledSlots(input.sessions ?? []) });
}

/**
 * "Kiểm tra lịch buổi học": đối chiếu dãy buổi chính thức với khai giảng + các giai đoạn lịch + ngày nghỉ.
 * Buổi đã huỷ không dời bù (giữ số buổi) được tính là "thiếu có chủ đích" (cảnh báo, không phải lỗi).
 */
export function checkScheduleDrift(input: {
  startDate: ISODate | null;
  totalSessions: number;
  rules: ScheduleRule[];
  holidays?: ISODate[];
  sessions: ExistingSession[];
}): { ok: boolean; issues: DriftIssue[]; regularCount: number; anchor: { expectedFirstDate: ISODate | null; actualFirstDate: ISODate | null; mismatched: number } } {
  const issues: DriftIssue[] = [];
  const holidays = new Set(input.holidays ?? []);
  const regular = input.sessions.filter(isLiveRegular).sort(bySeq);
  const cancelledKept = input.sessions.filter((s) => s.kind === "regular" && s.status === "cancelled" && s.sequenceNo <= EXTRA_SEQUENCE_BASE);

  if (regular.length !== input.totalSessions) {
    if (cancelledKept.length && regular.length + cancelledKept.length === input.totalSessions) {
      issues.push({ code: "COUNT", severity: "warning", message: `${cancelledKept.length} buổi đã huỷ không dời bù — lớp còn ${regular.length}/${input.totalSessions} buổi chính thức` });
    } else {
      issues.push({ code: "COUNT", severity: "error", message: `Số buổi chính thức ${regular.length} ≠ chuẩn của khoá ${input.totalSessions}` });
    }
  }
  [...regular, ...cancelledKept].sort(bySeq).forEach((s, i) => {
    if (s.sequenceNo !== i + 1) {
      issues.push({ code: "SEQ_GAP", severity: "warning", sessionId: s.id, sequenceNo: s.sequenceNo, date: s.date, message: `Số buổi không liên tục: vị trí ${i + 1} đang là buổi ${s.sequenceNo}` });
    }
  });
  const anchor = { expectedFirstDate: null as ISODate | null, actualFirstDate: regular[0]?.date ?? null, mismatched: 0 };
  if (input.startDate && input.rules.length && regular.length) {
    const exp = expectedSlots({ startDate: input.startDate, rules: input.rules, holidays: input.holidays, count: regular.length, sessions: input.sessions });
    anchor.expectedFirstDate = exp[0]?.date ?? null;
    anchor.mismatched = regular.filter((s, i) => !exp[i] || exp[i]!.date !== s.date || exp[i]!.startTime !== hm(s.startTime)).length;
    const first = regular[0]!;
    if (exp[0] && first.sequenceNo === 1 && (exp[0].date !== first.date || exp[0].startTime !== hm(first.startTime))) {
      issues.push({
        code: "ANCHOR", severity: "error", sessionId: first.id, sequenceNo: 1, date: first.date,
        message: `Neo sai ngày khai giảng: Buổi 1 đang là ${first.date.split("-").reverse().join("/")} ${hm(first.startTime)} nhưng theo ngày khai giảng + lịch học phải là ${exp[0].date.split("-").reverse().join("/")} ${exp[0].startTime} — cả dãy ${regular.length} buổi bị neo sai (${anchor.mismatched} buổi lệch ngày)`,
      });
    }
  }
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
  return { ok: !issues.some((i) => i.severity !== "info"), issues, regularCount: regular.length, anchor };
}

/** Đóng các giai đoạn lịch đang mở trước ngày áp dụng */
export function closePhasesBefore(fromDate: ISODate): ISODate {
  return addDays(fromDate, -1);
}

/* ------------------------------------------------------------------ */
/* Huỷ một buổi và dời bù (giữ đủ tổng buổi)                            */
/* ------------------------------------------------------------------ */

export interface CancelShiftResult {
  errors: string[];
  warnings: string[];
  /** Số buổi lưu trữ cho buổi bị huỷ (5001+) */
  archiveSeq: number;
  /** Ca của buổi thay thế (mang số buổi + bài học của buổi bị huỷ) */
  replacement: SlotSnapshot | null;
  /** Các buổi sau dời lên một nhịp theo lịch */
  moves: ReplanChange[];
  newEndDate: ISODate | null;
}

/** Số buổi diễn ra trước một buổi có số nhỏ hơn (sai thứ tự bài) */
export function orderInversions(list: readonly { seq: number; date: ISODate; startTime: string }[]): number {
  const sorted = [...list].sort((a, b) => a.seq - b.seq);
  let n = 0;
  let maxKey = "";
  for (const x of sorted) {
    const k = slotKey(x.date, x.startTime);
    if (k < maxKey) n++;
    else maxKey = k;
  }
  return n;
}

const snap = (s: ExistingSession): SlotSnapshot => ({ date: s.date, startTime: hm(s.startTime), endTime: hm(s.endTime), roomId: s.roomId, teacherId: s.teacherId });
const sameSlot = (a: SlotSnapshot, b: SlotSnapshot) => a.date === b.date && a.startTime === b.startTime && a.endTime === b.endTime && a.roomId === b.roomId && a.teacherId === b.teacherId;

/**
 * Huỷ buổi chính thức có dời bù: buổi huỷ chuyển sang dải số lưu trữ; buổi thay thế nhận số buổi đó và
 * dùng ca của buổi chính thức kế tiếp chưa có dữ liệu; mỗi buổi sau dời lên ca của buổi kế tiếp;
 * buổi cuối nhận ca mới sinh theo lịch (bỏ ngày nghỉ, không trùng ca của lớp) ⇒ giữ đủ tổng buổi, bài học đi theo số buổi.
 * Buổi đã có dữ liệu hoặc đã qua ngày không bao giờ bị dời.
 */
export function planCancelShift(input: { sessions: ExistingSession[]; cancelledId: string; rules: ScheduleRule[]; holidays?: ISODate[]; today: ISODate }): CancelShiftResult {
  const archiveSeq = nextArchiveSequence(input.sessions.map((s) => s.sequenceNo));
  const empty = (errors: string[], warnings: string[] = []): CancelShiftResult => ({ errors, warnings, archiveSeq, replacement: null, moves: [], newEndDate: null });
  const target = input.sessions.find((s) => s.id === input.cancelledId);
  if (!target) return empty(["Không tìm thấy buổi cần huỷ"]);
  const errors: string[] = [];
  if (!isLiveRegular(target)) errors.push("Chỉ dời bù cho buổi chính thức — buổi ngoài lộ trình chỉ huỷ");
  if (target.status !== "scheduled" && target.status !== "in_progress") errors.push("Buổi đã hoàn tất / đang chốt — không huỷ");
  if (target.hasAttendance) errors.push("Buổi đã có điểm danh — không huỷ");
  if (!input.rules.length) errors.push("Lớp chưa có lịch học để sinh buổi bù");
  if (errors.length) return empty(errors);

  const warnings: string[] = [];
  const live = input.sessions.filter((s) => isLiveRegular(s) && s.id !== target.id).sort(bySeq);
  const later = live.filter((s) => s.sequenceNo > target.sequenceNo);
  const movable = later.filter((s) => s.status === "scheduled" && !sessionHasData(s) && s.date >= input.today);
  const fixed = later.filter((s) => !movable.includes(s));
  if (fixed.length) warnings.push(`${fixed.length} buổi sau đã diễn ra / đã có dữ liệu — giữ nguyên ngày`);

  const last = [...live, target].sort(byTime).pop()!;
  const occupied = input.sessions.filter((s) => s.status !== "cancelled" && s.status !== "rescheduled").map((s) => ({ date: s.date, startTime: s.startTime }));
  const extra = scanSlots({ rules: input.rules, holidays: input.holidays, from: last.date, afterTime: hm(last.startTime), count: 1, blocked: [...occupied, ...cancelledSlots(input.sessions)], notBefore: input.today });
  if (!extra.length) return empty(["Không tìm được ca học theo lịch để sinh buổi bù — kiểm tra kế hoạch lịch"], warnings);

  const slots = [...movable.map(snap).sort(byTime), extra[0]!];
  const replacement = slots[0]!;
  const moves: ReplanChange[] = movable.map((s, i) => {
    const from = snap(s);
    const to = slots[i + 1]!;
    return { sessionId: s.id, sequenceNo: s.sequenceNo, from, to, changed: !sameSlot(from, to) };
  });
  const finalOrder = [
    ...live.filter((s) => !movable.includes(s)).map((s) => ({ seq: s.sequenceNo, date: s.date, startTime: hm(s.startTime) })),
    { seq: target.sequenceNo, date: replacement.date, startTime: replacement.startTime },
    ...moves.map((m) => ({ seq: m.sequenceNo, date: m.to.date, startTime: m.to.startTime })),
  ];
  const inv = orderInversions(finalOrder);
  if (inv) warnings.push(`Có buổi đã có dữ liệu nằm giữa — ${inv} buổi sẽ học không đúng thứ tự bài`);
  const dates = [...fixed.map((f) => f.date), ...live.filter((s) => s.sequenceNo < target.sequenceNo).map((s) => s.date), ...slots.map((s) => s.date)];
  const newEndDate = dates.reduce((a, b) => (a > b ? a : b));
  return { errors: [], warnings, archiveSeq, replacement, moves, newEndDate };
}

/* ------------------------------------------------------------------ */
/* Xếp lại cả dãy buổi theo lịch (neo lại từ ngày khai giảng)          */
/* ------------------------------------------------------------------ */

export interface ReanchorResult {
  errors: string[];
  warnings: string[];
  changes: ReplanChange[];
  /** Buổi giữ nguyên vì đã có dữ liệu / không ở trạng thái Đã lên lịch */
  kept: number;
  newEndDate: ISODate | null;
}

/**
 * Neo lại toàn bộ dãy buổi chính thức theo khai giảng + lịch hiện hành (trừ ngày nghỉ và ca của buổi đã huỷ).
 * Chỉ đổi ngày/giờ/phòng/GV của buổi CHƯA có dữ liệu (kể cả buổi quá khứ đang neo sai); không tạo, không xoá buổi.
 */
export function planReanchor(input: { sessions: ExistingSession[]; rules: ScheduleRule[]; startDate: ISODate | null; holidays?: ISODate[]; today: ISODate }): ReanchorResult {
  if (!input.startDate) return { errors: ["Lớp chưa có ngày khai giảng"], warnings: [], changes: [], kept: 0, newEndDate: null };
  if (!input.rules.length) return { errors: ["Lớp chưa có lịch học"], warnings: [], changes: [], kept: 0, newEndDate: null };
  const regular = input.sessions.filter(isLiveRegular).sort(bySeq);
  if (!regular.length) return { errors: ["Lớp chưa có buổi chính thức"], warnings: [], changes: [], kept: 0, newEndDate: null };
  const exp = expectedSlots({ startDate: input.startDate, rules: input.rules, holidays: input.holidays, count: regular.length, sessions: input.sessions });
  if (exp.length < regular.length) return { errors: [`Lịch hiện hành chỉ sinh được ${exp.length}/${regular.length} buổi — kiểm tra ngày kết thúc các giai đoạn`], warnings: [], changes: [], kept: 0, newEndDate: null };
  const keptList = regular.filter((s) => s.status !== "scheduled" || sessionHasData(s));
  const taken = new Set(keptList.map((s) => slotKey(s.date, s.startTime)));
  const blockedBase = [...cancelledSlots(input.sessions), ...keptList.map((s) => ({ date: s.date, startTime: s.startTime }))];
  const assigned: { date: ISODate; startTime: HHmm }[] = [];
  const warnings: string[] = [];
  const changes: ReplanChange[] = [];
  let displaced = 0;
  let cursor: { date: ISODate; startTime: HHmm } | null = null;
  regular.forEach((s, i) => {
    if (keptList.includes(s)) {
      if (!cursor || byTime(s, cursor) > 0) cursor = { date: s.date, startTime: hm(s.startTime) };
      return;
    }
    const from = snap(s);
    let target: SlotSnapshot | undefined = exp[i]!;
    const k = slotKey(target.date, target.startTime);
    if (taken.has(k) || (cursor && byTime(target, cursor) <= 0)) {
      // Vị trí đúng đã bị buổi có dữ liệu chiếm (hoặc nằm trước buổi đã giữ) → ca trống kế tiếp
      target = scanSlots({ rules: input.rules, holidays: input.holidays, from: cursor?.date ?? input.startDate!, afterTime: cursor?.startTime ?? null, count: 1, blocked: [...blockedBase, ...assigned] })[0];
      if (!target) {
        changes.push({ sessionId: s.id, sequenceNo: s.sequenceNo, from, to: from, changed: false });
        return;
      }
      displaced++;
    }
    const to: SlotSnapshot = { ...target, roomId: target.roomId ?? s.roomId, teacherId: target.teacherId ?? s.teacherId };
    taken.add(slotKey(to.date, to.startTime));
    assigned.push({ date: to.date, startTime: to.startTime });
    cursor = { date: to.date, startTime: to.startTime };
    changes.push({ sessionId: s.id, sequenceNo: s.sequenceNo, from, to, changed: !sameSlot(from, to) });
  });
  if (keptList.length) warnings.push(`${keptList.length} buổi đã có dữ liệu / đã xử lý — giữ nguyên ngày`);
  if (displaced) warnings.push(`${displaced} buổi không về đúng vị trí vì buổi đã có dữ liệu đang chiếm chỗ — xếp vào ca trống kế tiếp`);
  const past = changes.filter((c) => c.changed && c.to.date < input.today).length;
  if (past) warnings.push(`${past} buổi sẽ nằm ở ngày đã qua — cần điểm danh bù hoặc huỷ`);
  const dates = [...keptList.map((s) => s.date), ...changes.map((c) => c.to.date)];
  return { errors: [], warnings, changes, kept: keptList.length, newEndDate: dates.reduce((a, b) => (a > b ? a : b)) };
}

/* ------------------------------------------------------------------ */
/* Kế hoạch lịch nhiều giai đoạn (lớp chưa mở)                          */
/* ------------------------------------------------------------------ */

export interface ScheduleProposalPhase {
  from: ISODate;
  /** null = đến khi học đủ số buổi (chỉ giai đoạn cuối) */
  to: ISODate | null;
  slots: WeeklySlot[];
  note?: string | null;
}

/**
 * Giai đoạn phải liên tiếp, không chồng, không hở; giai đoạn đầu bắt đầu đúng ngày khai giảng;
 * chỉ giai đoạn cuối để trống "đến ngày".
 */
export function validatePhases(phases: readonly ScheduleProposalPhase[], startDate: ISODate | null): string[] {
  const e: string[] = [];
  if (!phases.length) return ["Cần ít nhất một giai đoạn lịch học"];
  if (!startDate) e.push("Nhập ngày khai giảng trước");
  const ps = [...phases].sort((a, b) => a.from.localeCompare(b.from));
  ps.forEach((p, i) => {
    const n = `Giai đoạn ${i + 1}`;
    for (const x of validateWeeklySlots(p.slots)) e.push(`${n}: ${x}`);
    if (p.to !== null && p.to < p.from) e.push(`${n}: "đến ngày" phải sau "từ ngày"`);
    if ((p.note ?? "").length > 200) e.push(`${n}: ghi chú tối đa 200 ký tự`);
    const isLast = i === ps.length - 1;
    if (!isLast && p.to === null) e.push(`${n}: chỉ giai đoạn cuối được để trống "đến ngày"`);
    if (isLast && p.to !== null) e.push(`${n}: giai đoạn cuối phải để trống "đến ngày" (kéo dài tới khi học đủ số buổi)`);
    if (i > 0) {
      const prev = ps[i - 1]!;
      if (prev.to !== null) {
        if (p.from <= prev.to) e.push(`${n} chồng lên giai đoạn ${i}`);
        else if (p.from !== addDays(prev.to, 1)) e.push(`${n} phải bắt đầu ngay sau giai đoạn ${i} (${addDays(prev.to, 1)})`);
      }
    }
  });
  if (startDate && ps[0]!.from !== startDate) e.push(`Giai đoạn đầu phải bắt đầu đúng ngày khai giảng (${startDate})`);
  return e;
}

export function phasesToRules(phases: readonly ScheduleProposalPhase[]): ScheduleRule[] {
  return phases.flatMap((p) => p.slots.map((s) => ({ weekday: s.weekday, startTime: s.startTime, endTime: s.endTime, roomId: s.roomId, teacherId: s.teacherId, effectiveFrom: p.from, effectiveTo: p.to })));
}
