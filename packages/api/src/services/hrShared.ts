/**
 * Dùng chung cho các dịch vụ nhân sự / chấm công / đơn từ:
 * phạm vi quyền, kỳ công đã khoá, thông báo, và **tính bảng công ngày**.
 *
 * Nguyên tắc: công đếm theo ca đã xếp trên lưới phân ca; lượt quét chỉ sinh cờ.
 */
import { and, eq, inArray, sql, gte, lte, isNull, or, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  staff, workShifts, shiftAssignments, attendancePunches, timesheetOverrides, timesheetFlagReviews, staffRequests, timesheetPeriods,
  userRoles, users, userNotifications, holidays,
} from "@satarobo/db";
import {
  authorize, hasRole, computeDay, summarizeDays, vnParts, plannedMinutesOf, leaveIsPaid, isReviewableFlag, datesBetween, proratedLeave,
  normalizePeriodStatus, periodFrozen, weekdayOf, PERIOD_STATUS_VI,
  type Permission, type DayResult, type DayShift, type TimesheetFlag, type CellOrigin, type RequestKind, type RequestStatus, type ShiftSegment,
} from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { opsForCenters } from "./opsSettings";
import { todayISO } from "./sessions";

export type Db = ProtectedContext["db"];

export const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });
export const pre = (m: string | string[]) => new TRPCError({ code: "PRECONDITION_FAILED", message: Array.isArray(m) ? m.join("; ") : m });
export const notFound = (m: string) => new TRPCError({ code: "NOT_FOUND", message: m });
export const forbidden = (m: string) => new TRPCError({ code: "FORBIDDEN", message: m });

export function rule<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    const n = (e as Error)?.name;
    if (n === "HrRuleError" || n === "ShiftRuleError") throw pre((e as Error).message);
    throw e;
  }
}

export const can = (ctx: ProtectedContext, p: Permission, centerId: string | null) => authorize(ctx.actor, p, { centerId }).allowed;
export const isSA = (ctx: ProtectedContext) => hasRole(ctx.actor, "SUPER_ADMIN");

/** Danh sách cơ sở actor có quyền p (null trong mảng = toàn hệ thống) */
export function centersWith(ctx: ProtectedContext, p: Permission): (string | null)[] {
  return ctx.actor.assignments.filter((a) => authorize({ userId: ctx.actor.userId, assignments: [a] }, p, { centerId: a.centerId }).allowed).map((a) => a.centerId);
}

export function scopeSql(ctx: ProtectedContext, p: Permission, col: typeof staff.centerId): SQL {
  const cs = centersWith(ctx, p);
  if (cs.includes(null)) return sql`true`;
  const ids = cs.filter((c): c is string => !!c);
  return ids.length ? (inArray(col, ids) as SQL) : sql`false`;
}

export const reasonOf = (r: string | null | undefined, min = 5) => {
  const t = (r ?? "").trim();
  if (t.length < min) throw bad(`Cần nhập lý do (tối thiểu ${min} ký tự)`);
  return t;
};

export const vnStart = (d: string) => new Date(`${d}T00:00:00+07:00`);
export const vnEnd = (d: string) => new Date(`${d}T23:59:59.999+07:00`);
export const dmy = (d: string) => d.split("-").reverse().join("/");

export async function notify(db: Db, ids: (string | null | undefined)[], title: string, body: string, link: string, priority = 2, type: string | null = null) {
  await deliverNotifications(db, ids, { title, body, link, priority, type });
}

/** Người duyệt đơn của một cơ sở: quản lý / nhân sự cơ sở + nhân sự Hội sở */
export async function approversOf(db: Db, centerId: string) {
  return (await db.select({ u: userRoles.userId }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(users.isActive, true), or(and(inArray(userRoles.role, ["CENTER_MANAGER", "CENTER_HR"]), eq(userRoles.centerId, centerId)), and(eq(userRoles.role, "HO_HR"), isNull(userRoles.centerId)))!))).map((r) => r.u);
}

export async function myStaff(ctx: ProtectedContext) {
  return ctx.db.query.staff.findFirst({ where: eq(staff.userId, ctx.user.id) });
}

/** Kỳ công đang đóng băng công (Đang chốt / Đã chốt, gồm cả giá trị cũ `locked`) */
export async function periodLocked(db: Db, centerId: string, dates: string[]) {
  const ps = [...new Set(dates.map((d) => d.slice(0, 7)))];
  if (!ps.length) return null;
  const rows = await db.select({ period: timesheetPeriods.period, status: timesheetPeriods.status }).from(timesheetPeriods)
    .where(and(eq(timesheetPeriods.centerId, centerId), inArray(timesheetPeriods.period, ps)));
  const hit = rows.find((r) => periodFrozen(normalizePeriodStatus(r.status)));
  return hit?.period ?? null;
}

export async function assertOpen(db: Db, centerId: string, dates: string[]) {
  const ps = [...new Set(dates.map((d) => d.slice(0, 7)))];
  if (!ps.length) return;
  const rows = await db.select({ period: timesheetPeriods.period, status: timesheetPeriods.status }).from(timesheetPeriods)
    .where(and(eq(timesheetPeriods.centerId, centerId), inArray(timesheetPeriods.period, ps)));
  const hit = rows.map((r) => ({ period: r.period, st: normalizePeriodStatus(r.status) })).find((r) => periodFrozen(r.st));
  if (hit) throw pre(`Kỳ công ${dmy(`${hit.period}-01`).slice(3)} — ${PERIOD_STATUS_VI[hit.st]}; số công không đổi được từ màn nào nữa. Nhờ nhân sự Hội sở mở lại kỳ.`);
}

/* ------------------------------------------------------------------ */
/* Bảng công ngày                                                      */
/* ------------------------------------------------------------------ */

export type ShiftRow = typeof workShifts.$inferSelect;
/** Ảnh chụp giờ / số công lưu trên ô phân ca lúc xếp */
export interface CellSnapshot {
  unitsSnapshot: number | null;
  minutesSnapshot: number | null;
  segmentsSnapshot: ShiftSegment[] | null;
}

/**
 * Mã ca → dữ liệu tính công.
 *
 * Bản gốc: "Đổi giờ/số công chỉ áp cho ô xếp SAU khi lưu — lịch đã xếp giữ nguyên."
 * Nên khi ô phân ca có **ảnh chụp** thì đọc theo ảnh chụp; ảnh chụp rỗng mới quay
 * về danh mục mã ca (ô cũ có trước khi bật chụp ảnh).
 */
export function shiftLite(s: ShiftRow, snap?: CellSnapshot | null): DayShift {
  const segments = snap?.segmentsSnapshot?.length ? snap.segmentsSnapshot : s.segments ?? [];
  const units = snap?.unitsSnapshot ?? s.units;
  const plannedMin = snap?.minutesSnapshot ?? (s.nominalMinutes || s.plannedMinutes || plannedMinutesOf(segments));
  return { code: s.code, kind: s.kind, units, segments, plannedMin, punchRequired: s.punchRequired };
}

/** Ảnh chụp để ghi vào ô phân ca khi xếp ca */
export function snapshotOf(s: ShiftRow): CellSnapshot {
  const segments = s.segments ?? [];
  return {
    unitsSnapshot: s.units,
    minutesSnapshot: s.nominalMinutes || s.plannedMinutes || plannedMinutesOf(segments),
    segmentsSnapshot: segments,
  };
}

export interface DayCell extends DayResult {
  date: string;
  shift: { id: string; code: string; name: string; kind: ShiftRow["kind"]; units: number; clock: string } | null;
  origin: CellOrigin | null;
  inMin: number | null;
  outMin: number | null;
  punches: number;
  requests: { id: string; kind: RequestKind; status: RequestStatus }[];
  override: { units: number; label: string; reason: string } | null;
  reviews: { flag: string; action: string; note: string }[];
  /** Cờ cần rà mà chưa có kết luận */
  openFlags: TimesheetFlag[];
  holidayName: string | null;
  scheduled: boolean;
}

const clockOf = (segs: readonly ShiftSegment[]) => segs.map((x) => `${x.from}–${x.to}`).join(", ");

export async function buildDays(db: Db, people: { id: string; centerId: string }[], from: string, to: string): Promise<Map<string, DayCell[]>> {
  const out = new Map<string, DayCell[]>();
  if (!people.length) return out;
  const ids = people.map((p) => p.id);
  const today = todayISO();
  const [asg, punches, reqs, ovs, hols, reviews] = await Promise.all([
    db.select({ a: shiftAssignments, s: workShifts }).from(shiftAssignments).innerJoin(workShifts, eq(workShifts.id, shiftAssignments.shiftId))
      .where(and(inArray(shiftAssignments.staffId, ids), gte(shiftAssignments.date, from), lte(shiftAssignments.date, to))),
    db.select({ staffId: attendancePunches.staffId, kind: attendancePunches.kind, at: attendancePunches.at, source: attendancePunches.source, flags: attendancePunches.flags })
      .from(attendancePunches).where(and(inArray(attendancePunches.staffId, ids), gte(attendancePunches.at, vnStart(from)), lte(attendancePunches.at, vnEnd(to)))),
    db.select().from(staffRequests).where(and(inArray(staffRequests.staffId, ids), lte(staffRequests.dateFrom, to), gte(staffRequests.dateTo, from), inArray(staffRequests.status, ["pending", "approved"]))),
    db.select().from(timesheetOverrides).where(and(inArray(timesheetOverrides.staffId, ids), gte(timesheetOverrides.date, from), lte(timesheetOverrides.date, to))),
    db.select().from(holidays).where(and(gte(holidays.date, from), lte(holidays.date, to))),
    db.select().from(timesheetFlagReviews).where(and(inArray(timesheetFlagReviews.staffId, ids), gte(timesheetFlagReviews.date, from), lte(timesheetFlagReviews.date, to))),
  ]);
  const opsBy = await opsForCenters(db, [...new Set(people.map((p) => p.centerId))]);
  const byKey = new Map<string, { in: number | null; out: number | null; n: number; manual: boolean; flags: Set<TimesheetFlag> }>();
  for (const p of punches) {
    const v = vnParts(p.at);
    const k = `${p.staffId}|${v.date}`;
    const cur = byKey.get(k) ?? { in: null, out: null, n: 0, manual: false, flags: new Set<TimesheetFlag>() };
    cur.n++;
    if (p.source !== "qr") cur.manual = true;
    for (const f of p.flags ?? []) cur.flags.add(f as TimesheetFlag);
    if (p.kind === "in") cur.in = cur.in == null ? v.min : Math.min(cur.in, v.min);
    else cur.out = cur.out == null ? v.min : Math.max(cur.out, v.min);
    byKey.set(k, cur);
  }
  const cellOf = new Map<string, { s: ShiftRow; origin: CellOrigin; snap: CellSnapshot }>();
  for (const x of asg) {
    cellOf.set(`${x.a.staffId}|${x.a.date}`, {
      s: x.s, origin: x.a.origin,
      snap: { unitsSnapshot: x.a.unitsSnapshot, minutesSnapshot: x.a.minutesSnapshot, segmentsSnapshot: x.a.segmentsSnapshot },
    });
  }
  const dates = datesBetween(from, to);
  for (const p of people) {
    const myReqs = reqs.filter((r) => r.staffId === p.id);
    const myReviews = reviews.filter((r) => r.staffId === p.id);
    const cells: DayCell[] = dates.map((date) => {
      const cell = cellOf.get(`${p.id}|${date}`) ?? null;
      const sh = cell?.s ?? null;
      const pu = byKey.get(`${p.id}|${date}`);
      const onDay = myReqs.filter((r) => r.dateFrom <= date && r.dateTo >= date);
      const ok = onDay.filter((r) => r.status === "approved");
      const ot = ok.filter((r) => r.kind === "overtime");
      const leaveReq = ok.find((r) => r.kind === "leave");
      const ov = ovs.find((o) => o.staffId === p.id && o.date === date);
      const hol = hols.find((h) => h.date === date && (h.centerId === null || h.centerId === p.centerId));
      const dayReviews = myReviews.filter((r) => r.date === date);
      const excused = dayReviews.some((r) => r.action === "excused");
      const r = computeDay({
        date, today, shift: sh ? shiftLite(sh, cell?.snap) : null,
        inMin: pu?.in ?? null, outMin: pu?.out ?? null, punchCount: pu?.n ?? 0, manualPunch: pu?.manual ?? false,
        leavePaid: leaveReq?.leaveType ? leaveIsPaid(leaveReq.leaveType) : leaveReq?.leavePaid ?? true,
        otMin: ot.reduce((s, x) => s + x.minutes, 0),
        holiday: !!hol && !!sh, excused,
        // Chủ nhật mà không có ca = nghỉ tuần (cờ ghi nhận, không cần rà)
        weeklyOff: !sh && weekdayOf(date) === 7,
        override: ov ? { units: ov.units, label: ov.label, note: ov.reason } : null,
        graceMin: opsBy.get(p.centerId)?.timesheetGraceMin,
        punchFlags: [...(pu?.flags ?? [])],
      });
      const reviewed = new Set(dayReviews.filter((x) => x.action !== "dismiss").map((x) => x.flag));
      return {
        ...r, date, scheduled: !!sh,
        // giờ + số công hiển thị theo ảnh chụp lúc xếp ô (nếu có)
        shift: sh ? { id: sh.id, code: sh.code, name: sh.name, kind: sh.kind, units: cell?.snap.unitsSnapshot ?? sh.units, clock: clockOf(cell?.snap.segmentsSnapshot?.length ? cell.snap.segmentsSnapshot : sh.segments ?? []) } : null,
        origin: cell?.origin ?? null,
        inMin: pu?.in ?? null, outMin: pu?.out ?? null, punches: pu?.n ?? 0,
        requests: onDay.map((x) => ({ id: x.id, kind: x.kind, status: x.status })),
        override: ov ? { units: ov.units, label: ov.label, reason: ov.reason } : null,
        reviews: dayReviews.map((x) => ({ flag: x.flag, action: x.action, note: x.note })),
        openFlags: r.flags.filter((f) => isReviewableFlag(f) && !reviewed.has(f) && !reviewed.has("*")),
        holidayName: hol?.name ?? null,
      };
    });
    out.set(p.id, cells);
  }
  return out;
}

export { summarizeDays };

/** Số dư phép năm (chỉ loại nghỉ trừ phép mới tính) */
export async function leaveBalance(db: Db, s: { id: string; annualLeaveDays: number; hiredAt: string | null }, year: number) {
  const [u] = await db.select({
    used: sql<number>`coalesce(sum(${staffRequests.days}) filter (where ${staffRequests.status} = 'approved'), 0)::float`,
    pending: sql<number>`coalesce(sum(${staffRequests.days}) filter (where ${staffRequests.status} = 'pending'), 0)::float`,
  }).from(staffRequests).where(and(eq(staffRequests.staffId, s.id), eq(staffRequests.kind, "leave"), eq(staffRequests.leaveType, "annual"), gte(staffRequests.dateFrom, `${year}-01-01`), lte(staffRequests.dateFrom, `${year}-12-31`)));
  const entitled = proratedLeave(s.annualLeaveDays, s.hiredAt, year);
  const used = Number(u?.used ?? 0);
  const pending = Number(u?.pending ?? 0);
  return { year, entitled, used, pending, remaining: entitled - used - pending };
}
