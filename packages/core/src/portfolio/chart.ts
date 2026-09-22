/**
 * Dữ liệu biểu đồ cho hồ sơ học tập — hàm thuần tính toạ độ SVG (không thư viện vẽ).
 *  - Biểu đồ đường: điểm trung bình tiêu chí của từng phiếu buổi theo thời gian (thang 1–4).
 *  - Mạng nhện (radar): điểm trung bình từng năng lực trong một khoá.
 */
import { RUBRIC_SCALE } from "./rubric.js";
import { mean, round1 } from "./aggregate.js";

export interface ProgressInput {
  date: string;
  sequenceNo: number;
  average: number | null;
  courseCode?: string | null;
}
export interface ProgressPoint {
  date: string;
  average: number;
  label: string;
  courseCode: string | null;
}

/** Điểm tiến bộ theo thời gian: bỏ phiếu chưa có điểm, xếp theo ngày */
export function progressSeries(items: readonly ProgressInput[]): ProgressPoint[] {
  return items
    .filter((i): i is ProgressInput & { average: number } => typeof i.average === "number" && Number.isFinite(i.average))
    .sort((a, b) => (a.date === b.date ? a.sequenceNo - b.sequenceNo : a.date < b.date ? -1 : 1))
    .map((i) => ({ date: i.date, average: round1(i.average), label: `${i.date.slice(8, 10)}/${i.date.slice(5, 7)}`, courseCode: i.courseCode ?? null }));
}

/** Gộp các điểm liền nhau thành trung bình trượt theo nhóm n phiếu — biểu đồ dài vẫn dễ đọc khi in */
export function bucketSeries(points: readonly ProgressPoint[], maxPoints = 24): ProgressPoint[] {
  if (points.length <= maxPoints) return [...points];
  const size = Math.ceil(points.length / maxPoints);
  const out: ProgressPoint[] = [];
  for (let i = 0; i < points.length; i += size) {
    const chunk = points.slice(i, i + size);
    const last = chunk[chunk.length - 1]!;
    out.push({ ...last, average: mean(chunk.map((c) => c.average)) ?? last.average });
  }
  return out;
}

export interface LineChart {
  width: number;
  height: number;
  path: string;
  area: string;
  dots: { cx: number; cy: number; value: number; label: string }[];
  grid: { y: number; value: number }[];
  /** Nhãn trục ngang thưa (tối đa ~6) */
  ticks: { x: number; label: string }[];
}

const f = (n: number) => Math.round(n * 10) / 10;

/** Toạ độ biểu đồ đường thang [min, max] */
export function lineChart(points: readonly ProgressPoint[], opts: { width?: number; height?: number; pad?: number; min?: number; max?: number } = {}): LineChart {
  const width = opts.width ?? 560;
  const height = opts.height ?? 180;
  const pad = opts.pad ?? 28;
  const min = opts.min ?? 1;
  const max = opts.max ?? RUBRIC_SCALE;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const n = points.length;
  const x = (i: number) => pad + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => pad + innerH - ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * innerH;
  const dots = points.map((p, i) => ({ cx: f(x(i)), cy: f(y(p.average)), value: p.average, label: p.label }));
  const path = dots.map((d, i) => `${i === 0 ? "M" : "L"}${d.cx} ${d.cy}`).join(" ");
  const base = f(pad + innerH);
  const area = dots.length ? `${path} L${dots[dots.length - 1]!.cx} ${base} L${dots[0]!.cx} ${base} Z` : "";
  const grid: { y: number; value: number }[] = [];
  for (let v = min; v <= max; v += 1) grid.push({ y: f(y(v)), value: v });
  const step = Math.max(1, Math.ceil(n / 6));
  const ticks = dots.filter((_, i) => i % step === 0 || i === n - 1).map((d) => ({ x: d.cx, label: d.label }));
  return { width, height, path, area, dots, grid, ticks };
}

export interface RadarAxisInput {
  label: string;
  value: number | null;
}
export interface RadarChart {
  size: number;
  center: number;
  polygon: string;
  rings: string[];
  axes: { x: number; y: number; lx: number; ly: number; anchor: "start" | "middle" | "end"; label: string; value: number | null }[];
  points: { x: number; y: number; value: number }[];
}

/** Điểm trên vòng tròn: góc 0 ở đỉnh, quay theo chiều kim đồng hồ */
export function polarPoint(cx: number, cy: number, r: number, i: number, n: number): { x: number; y: number } {
  const a = (Math.PI * 2 * i) / Math.max(1, n) - Math.PI / 2;
  return { x: f(cx + r * Math.cos(a)), y: f(cy + r * Math.sin(a)) };
}

/** Toạ độ mạng nhện; tiêu chí không có dữ liệu vẽ ở tâm (giá trị 0) nhưng vẫn giữ trục */
export function radarChart(axes: readonly RadarAxisInput[], opts: { size?: number; max?: number; labelPad?: number } = {}): RadarChart {
  const size = opts.size ?? 240;
  const max = opts.max ?? RUBRIC_SCALE;
  const labelPad = opts.labelPad ?? 44;
  const c = size / 2;
  const r = c - labelPad;
  const n = axes.length;
  const pts = axes.map((a, i) => {
    const v = a.value == null ? 0 : Math.min(max, Math.max(0, a.value));
    return { ...polarPoint(c, c, (v / max) * r, i, n), value: v };
  });
  const rings: string[] = [];
  for (let k = 1; k <= max; k += 1) rings.push(axes.map((_, i) => { const p = polarPoint(c, c, (k / max) * r, i, n); return `${p.x},${p.y}`; }).join(" "));
  return {
    size,
    center: c,
    polygon: pts.map((p) => `${p.x},${p.y}`).join(" "),
    rings,
    points: pts,
    axes: axes.map((a, i) => {
      const end = polarPoint(c, c, r, i, n);
      const lab = polarPoint(c, c, r + 14, i, n);
      const anchor: "start" | "middle" | "end" = Math.abs(lab.x - c) < 4 ? "middle" : lab.x > c ? "start" : "end";
      return { x: end.x, y: end.y, lx: lab.x, ly: lab.y, anchor, label: a.label, value: a.value };
    }),
  };
}
