/**
 * HỌC BẠ MỐC TỰ TỔNG HỢP từ các phiếu buổi đã phát hành (đánh giá hình thành → tổng kết).
 *
 * Phiếu buổi là dữ liệu gốc. Khi mở học bạ mốc (vd buổi 5, buổi 12), hệ thống tính sẵn:
 *  - điểm từng tiêu chí = trung bình các phiếu buổi trong giai đoạn (từ sau mốc trước đến mốc này),
 *    làm tròn 1 chữ số; tiêu chí không có dữ liệu thì bỏ qua;
 *  - xu hướng so với giai đoạn trước: tăng / giữ / giảm với ngưỡng ±0,3;
 *  - chuyên cần, tỷ lệ đạt mục tiêu bài, thẻ nổi bật xuất hiện nhiều nhất, gợi ý nhận xét.
 * Giáo viên chỉ xác nhận / chỉnh và viết nhận xét tổng. Hàm thuần — có kiểm thử.
 */
import { RUBRIC_SCALE, LEGACY_SCORE_SCALE, type ObjectiveResult } from "./rubric.js";

export const TREND_THRESHOLD = 0.3;
export type Trend = "up" | "flat" | "down";
export const TREND_VI: Record<Trend, string> = { up: "Tiến bộ", flat: "Ổn định", down: "Cần chú ý" };

/** Làm tròn 1 chữ số thập phân (tránh sai số dấu phẩy động kiểu 3.2500000001) */
export function round1(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

export function mean(values: readonly (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (!v.length) return null;
  return round1(v.reduce((a, b) => a + b, 0) / v.length);
}

/** Xu hướng: chênh ≥ +0,3 là tăng, ≤ −0,3 là giảm, còn lại là giữ; thiếu một trong hai → null */
export function trendOf(current: number | null | undefined, previous: number | null | undefined, threshold = TREND_THRESHOLD): Trend | null {
  if (current == null || previous == null) return null;
  const d = round1(current - previous);
  if (d >= threshold) return "up";
  if (d <= -threshold) return "down";
  return "flat";
}

/** Quy điểm về thang 5 để trộn học bạ cũ (thang 5) với học bạ mới (thang 4) khi tính xếp loại cuối khoá */
export function normalizeTo5(score: number, scale: number = RUBRIC_SCALE): number {
  if (scale === LEGACY_SCORE_SCALE || scale <= 1) return score;
  return round1(1 + ((score - 1) * (LEGACY_SCORE_SCALE - 1)) / (scale - 1));
}

/** Giai đoạn của một mốc: từ sau mốc trước đến mốc này; kèm giai đoạn trước để so xu hướng */
export function milestonePeriod(milestones: readonly number[], seq: number): { fromSeq: number; toSeq: number; previous: { fromSeq: number; toSeq: number } | null } {
  const sorted = [...new Set(milestones)].filter((m) => Number.isFinite(m)).sort((a, b) => a - b);
  const before = sorted.filter((m) => m < seq);
  const prev = before[before.length - 1];
  const prev2 = before[before.length - 2];
  const fromSeq = prev != null ? prev + 1 : 1;
  return {
    fromSeq,
    toSeq: seq,
    previous: prev != null ? { fromSeq: prev2 != null ? prev2 + 1 : 1, toSeq: prev } : null,
  };
}

export interface EvalForAggregate {
  date: string;
  sequenceNo: number;
  scores: Record<string, number | null | undefined>;
  objectiveResult: ObjectiveResult | null;
  highlights: readonly string[];
  remark: string | null;
  productNote?: string | null;
}

export interface AggregateCriterionRef {
  key: string;
  criterionId: string | null;
  label: string;
}

export interface PeriodAttendance {
  attended: number;
  total: number;
  absent: number;
  excused: number;
  makeup: number;
}

export interface MilestoneAggregateCriterion extends AggregateCriterionRef {
  average: number | null;
  count: number;
  previousAverage: number | null;
  trend: Trend | null;
  /** Mức gợi ý điền sẵn vào học bạ (làm tròn trung bình) — null khi không có dữ liệu */
  suggested: number | null;
}

/** Nội dung cột `report_cards.aggregate` — bản chụp số liệu tổng hợp lúc lưu học bạ */
export interface MilestoneAggregate {
  version: 1;
  scale: number;
  period: { fromSeq: number; toSeq: number; fromDate: string | null; toDate: string | null };
  /** Số phiếu buổi đã phát hành trong giai đoạn */
  sessions: number;
  attendance: PeriodAttendance;
  criteria: MilestoneAggregateCriterion[];
  overall: { average: number | null; previousAverage: number | null; trend: Trend | null };
  objective: { achieved: number; partial: number; notYet: number; rate: number | null };
  topHighlights: { label: string; count: number }[];
  remarkSuggestions: string[];
  products: string[];
  generatedAt: string;
}

function criterionAverages(criteria: readonly AggregateCriterionRef[], evals: readonly EvalForAggregate[]) {
  const out = new Map<string, { average: number | null; count: number }>();
  for (const c of criteria) {
    const vals = evals.map((e) => e.scores[c.key]).filter((v): v is number => typeof v === "number" && v >= 1 && v <= RUBRIC_SCALE);
    out.set(c.key, { average: mean(vals), count: vals.length });
  }
  return out;
}

/** Tổng hợp một mốc học bạ từ phiếu buổi của giai đoạn hiện tại và giai đoạn trước */
export function aggregateMilestone(input: {
  criteria: readonly AggregateCriterionRef[];
  current: readonly EvalForAggregate[];
  previous?: readonly EvalForAggregate[];
  attendance: PeriodAttendance;
  period: { fromSeq: number; toSeq: number };
  now?: Date;
  topHighlights?: number;
}): MilestoneAggregate {
  const cur = [...input.current].sort((a, b) => (a.date === b.date ? a.sequenceNo - b.sequenceNo : a.date < b.date ? -1 : 1));
  const prev = input.previous ?? [];
  const curAvg = criterionAverages(input.criteria, cur);
  const prevAvg = criterionAverages(input.criteria, prev);
  const criteria: MilestoneAggregateCriterion[] = input.criteria.map((c) => {
    const a = curAvg.get(c.key) ?? { average: null, count: 0 };
    const p = prevAvg.get(c.key)?.average ?? null;
    return {
      ...c,
      average: a.average,
      count: a.count,
      previousAverage: p,
      trend: trendOf(a.average, p),
      suggested: a.average == null ? null : Math.min(RUBRIC_SCALE, Math.max(1, Math.round(a.average))),
    };
  });
  // Bỏ qua tiêu chí không có dữ liệu khi tính điểm chung
  const overall = mean(criteria.map((c) => c.average));
  const overallPrev = mean(criteria.filter((c) => c.average != null).map((c) => c.previousAverage));

  let achieved = 0, partial = 0, notYet = 0;
  for (const e of cur) {
    if (e.objectiveResult === "achieved") achieved += 1;
    else if (e.objectiveResult === "partial") partial += 1;
    else if (e.objectiveResult === "not_yet") notYet += 1;
  }
  const judged = achieved + partial + notYet;

  const counts = new Map<string, number>();
  for (const e of cur) for (const h of new Set(e.highlights)) counts.set(h, (counts.get(h) ?? 0) + 1);
  const topHighlights = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "vi"))
    .slice(0, input.topHighlights ?? 3)
    .map(([label, count]) => ({ label, count }));

  const recent = [...cur].reverse();
  const uniq = (xs: (string | null | undefined)[], n: number) => {
    const out: string[] = [];
    for (const x of xs) {
      const t = (x ?? "").trim();
      if (t && !out.includes(t)) out.push(t);
      if (out.length >= n) break;
    }
    return out;
  };

  return {
    version: 1,
    scale: RUBRIC_SCALE,
    period: { fromSeq: input.period.fromSeq, toSeq: input.period.toSeq, fromDate: cur[0]?.date ?? null, toDate: cur[cur.length - 1]?.date ?? null },
    sessions: cur.length,
    attendance: { ...input.attendance },
    criteria,
    overall: { average: overall, previousAverage: overallPrev, trend: trendOf(overall, overallPrev) },
    objective: { achieved, partial, notYet, rate: judged ? Math.round((achieved / judged) * 100) / 100 : null },
    topHighlights,
    remarkSuggestions: uniq(recent.map((e) => e.remark), 3),
    products: uniq(recent.map((e) => e.productNote ?? null), 3),
    generatedAt: (input.now ?? new Date()).toISOString(),
  };
}

/** Câu nhận xét gợi ý (GV sửa lại) dựng từ số liệu tổng hợp — không bịa nội dung ngoài dữ liệu */
export function suggestMilestoneComment(a: MilestoneAggregate, studentName?: string | null): string {
  const who = (studentName ?? "").trim() ? `Con ${studentName!.trim().split(/\s+/).slice(-1)[0]}` : "Con";
  const parts: string[] = [];
  parts.push(`Trong giai đoạn buổi ${a.period.fromSeq}–${a.period.toSeq}, ${who.charAt(0).toLowerCase()}${who.slice(1)} có mặt ${a.attendance.attended}/${a.attendance.total} buổi`
    + (a.objective.rate != null ? ` và đạt mục tiêu bài ở ${a.objective.achieved}/${a.objective.achieved + a.objective.partial + a.objective.notYet} buổi.` : "."));
  if (a.topHighlights.length) parts.push(`Điểm nổi bật: ${a.topHighlights.map((h) => h.label.toLowerCase()).join(", ")}.`);
  const ups = a.criteria.filter((c) => c.trend === "up").map((c) => c.label);
  if (ups.length) parts.push(`Tiến bộ rõ ở ${ups.join(", ")}.`);
  const low = a.criteria.filter((c) => c.average != null && c.average < 2.5).map((c) => c.label);
  if (low.length) parts.push(`Cần luyện thêm: ${low.join(", ")}.`);
  const text = parts.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Đọc JSONB tổng hợp từ CSDL (phòng dữ liệu hỏng) */
export function isMilestoneAggregate(x: unknown): x is MilestoneAggregate {
  if (!x || typeof x !== "object") return false;
  const a = x as { version?: unknown; criteria?: unknown; period?: unknown; attendance?: unknown };
  return a.version === 1 && Array.isArray(a.criteria) && !!a.period && typeof a.period === "object" && !!a.attendance && typeof a.attendance === "object";
}
