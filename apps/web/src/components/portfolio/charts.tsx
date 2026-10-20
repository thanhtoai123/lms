/**
 * Biểu đồ của hồ sơ công nghệ — SVG thuần, không thư viện. Toạ độ tính ở packages/core (hàm thuần, có kiểm thử).
 * Màu cố định theo nhận diện TH STEAM (Deep Ocean Blue #1D4ED8, Cosmic Gold #F59E0B) để bản in giống màn hình.
 */
import { RUBRIC_SCALE, bucketSeries, lineChart, radarChart, type ProgressPoint } from "@satarobo/core";

const PURPLE = "#1d4ed8";
const ORANGE = "#f59e0b";
const GRID = "#e2e8f0";
const INK = "#64748b";
/** Nhãn trục theo thang 3 mức hiện hành (TT 27/2020): 1 Cần cố gắng · 2 Đạt · 3 Tốt */
const LEVEL_SHORT = ["", "Cần cố gắng", "Đạt", "Tốt"];
/** Mức mục tiêu tối thiểu của mỗi buổi */
const GOAL = 2;

/** Biểu đồ đường: điểm trung bình tiêu chí của từng phiếu buổi theo thời gian (thang 1–3: Cần cố gắng → Tốt) */
export function ProgressLine({ points, title = "Tiến bộ theo buổi học" }: { points: readonly ProgressPoint[]; title?: string }) {
  const pts = bucketSeries(points, 24);
  if (pts.length < 2) {
    return <p className="text-sm italic text-muted-foreground">Cần ít nhất 2 phiếu nhận xét để vẽ biểu đồ tiến bộ.</p>;
  }
  const c = lineChart(pts, { width: 560, height: 190, pad: 30 });
  return (
    <figure className="hs-avoid">
      <svg viewBox={`0 0 ${c.width} ${c.height}`} className="h-auto w-full" role="img" aria-label={`${title}: từ ${pts[0]!.average} lên ${pts[pts.length - 1]!.average} trên thang ${RUBRIC_SCALE}`}>
        {c.grid.map((g) => (
          <g key={g.value}>
            <line x1={30} x2={c.width - 30} y1={g.y} y2={g.y} stroke={GRID} strokeWidth={1} />
            <text x={26} y={g.y + 3} textAnchor="end" fontSize={9} fill={INK}>{LEVEL_SHORT[g.value] ?? g.value}</text>
          </g>
        ))}
        {/* Vạch "Đạt" (mức 2) — mục tiêu tối thiểu của mỗi buổi */}
        {c.grid.filter((g) => g.value === GOAL).map((g) => <line key="goal" x1={30} x2={c.width - 30} y1={g.y} y2={g.y} stroke={ORANGE} strokeDasharray="4 4" strokeWidth={1.2} />)}
        <path d={c.area} fill={PURPLE} opacity={0.08} />
        <path d={c.path} fill="none" stroke={PURPLE} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
        {c.dots.map((d, i) => <circle key={i} cx={d.cx} cy={d.cy} r={3.2} fill="#fff" stroke={PURPLE} strokeWidth={2} />)}
        {c.ticks.map((t, i) => <text key={i} x={t.x} y={c.height - 10} textAnchor="middle" fontSize={9} fill={INK}>{t.label}</text>)}
      </svg>
      <figcaption className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-4 rounded bg-primary" /> Điểm trung bình mỗi buổi</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-0 w-4 border-t-2 border-dashed border-accent-500" /> Mức &ldquo;Đạt&rdquo;</span>
      </figcaption>
    </figure>
  );
}

/** Biểu đồ năng lực (dạng radar): mức trung bình từng tiêu chí của một khoá (thang 1–3) */
export function RadarChart({ axes, size = 240 }: { axes: readonly { label: string; value: number | null }[]; size?: number }) {
  if (axes.length < 3) {
    return (
      <ul className="space-y-1 text-sm">
        {axes.map((a) => <li key={a.label} className="flex justify-between gap-2"><span>{a.label}</span><b className="text-primary">{a.value ?? "—"}</b></li>)}
      </ul>
    );
  }
  const r = radarChart(axes, { size, labelPad: 56 });
  return (
    <svg viewBox={`0 0 ${r.size} ${r.size}`} className="hs-avoid mx-auto h-auto w-full max-w-[260px]" role="img" aria-label={`Biểu đồ năng lực — mức trung bình: ${axes.map((a) => `${a.label} ${a.value ?? "chưa có"}`).join(", ")}`}>
      {r.rings.map((ring, i) => <polygon key={i} points={ring} fill={i === r.rings.length - 1 ? "#f8fafc" : "none"} stroke={GRID} strokeWidth={1} />)}
      {r.axes.map((a, i) => <line key={i} x1={r.center} y1={r.center} x2={a.x} y2={a.y} stroke={GRID} strokeWidth={1} />)}
      <polygon points={r.polygon} fill={PURPLE} fillOpacity={0.22} stroke={PURPLE} strokeWidth={2} strokeLinejoin="round" />
      {r.points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={2.8} fill={ORANGE} />)}
      {r.axes.map((a, i) => (
        <text key={`t${i}`} x={a.lx} y={a.ly} textAnchor={a.anchor} dominantBaseline="middle" fontSize={9.5} fill="#0f172a" fontWeight={600}>
          {a.label.length > 18 ? `${a.label.slice(0, 17)}…` : a.label}
          {a.value != null && <tspan fill={PURPLE}>{` ${a.value}`}</tspan>}
        </text>
      ))}
    </svg>
  );
}
