/**
 * Tính toán chỉ số báo cáo (thuần, không phụ thuộc DB) — dùng chung cho các trang Báo cáo.
 */

export function pct(num: number, den: number, digits = 1): number {
  if (!den) return 0;
  const f = 10 ** digits;
  return Math.round((num / den) * 100 * f) / f;
}

/** Bậc phễu lead theo trạng thái xa nhất từng đạt */
export const FUNNEL_STAGES = ["created", "contacted", "trial_booked", "trial_done", "enrolled"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];
export const FUNNEL_STAGE_VI: Record<FunnelStage, string> = {
  created: "Lead mới",
  contacted: "Đã liên hệ",
  trial_booked: "Hẹn học thử",
  trial_done: "Đã học thử",
  enrolled: "Đăng ký",
};

const STATUS_RANK: Record<string, number> = {
  new: 0, contacted: 1, nurturing: 1, consulting: 1, trial_scheduled: 2, trial_in_progress: 2, trial_done: 3, deciding: 3, enrolled: 4,
};

/** Bậc cao nhất lead đạt được, dựa trên các trạng thái từng qua (kể cả trạng thái trước khi mất) */
export function furthestStage(statusesSeen: readonly string[]): number {
  let r = 0;
  for (const s of statusesSeen) r = Math.max(r, STATUS_RANK[s] ?? 0);
  return r;
}

export interface FunnelRow { stage: FunnelStage; label: string; count: number; fromPrev: number; fromTop: number }

export function buildFunnel(furthest: readonly number[]): FunnelRow[] {
  const top = furthest.length;
  let prev = top;
  return FUNNEL_STAGES.map((stage, i) => {
    const count = furthest.filter((f) => f >= i).length;
    const row = { stage, label: FUNNEL_STAGE_VI[stage], count, fromPrev: pct(count, prev), fromTop: pct(count, top) };
    prev = count;
    return row;
  });
}

/** Lead mất rụng ở bậc nào (bậc cao nhất đạt trước khi mất) */
export function dropoffByStage(lostFurthest: readonly number[]): { stage: FunnelStage; label: string; count: number }[] {
  return FUNNEL_STAGES.slice(0, 4).map((stage, i) => ({ stage, label: FUNNEL_STAGE_VI[stage], count: lostFurthest.filter((f) => f === i).length }));
}

export interface AttendanceTally { present: number; late: number; absent: number; excused: number; makeup: number }

/** Tỉ lệ chuyên cần: có mặt (kể cả muộn, học bù) / tổng lượt được điểm danh */
export function attendanceRate(t: AttendanceTally): number {
  const total = t.present + t.late + t.absent + t.excused + t.makeup;
  return pct(t.present + t.late + t.makeup, total);
}

export function monthKey(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  const local = new Date(x.getTime() + 7 * 3600 * 1000);
  return local.toISOString().slice(0, 7);
}

/** Danh sách tháng YYYY-MM từ from đến to (bao gồm) */
export function monthsBetween(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  let [y, m] = fromISO.slice(0, 7).split("-").map(Number) as [number, number];
  const end = toISO.slice(0, 7);
  for (let i = 0; i < 120; i++) {
    const k = `${y}-${String(m).padStart(2, "0")}`;
    if (k > end) break;
    out.push(k);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** Chuẩn hoá khoảng ngày báo cáo: mặc định 90 ngày gần nhất, tối đa 2 năm */
export function normalizeRange(from: string | undefined, to: string | undefined, todayISO: string): { from: string; to: string } {
  const t = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : todayISO;
  const d = new Date(`${t}T00:00:00Z`);
  const def = new Date(d.getTime() - 89 * 86400000).toISOString().slice(0, 10);
  let f = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : def;
  if (f > t) f = t;
  const min = new Date(d.getTime() - 730 * 86400000).toISOString().slice(0, 10);
  if (f < min) f = min;
  return { from: f, to: t };
}

/** CSV an toàn (chống công thức Excel) */
export function toCsv(headers: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@]/.test(s) && typeof v === "string") s = `'${s}`;
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}
