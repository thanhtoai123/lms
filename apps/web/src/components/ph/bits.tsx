/**
 * Mảnh giao diện nhỏ dùng chung của cổng phụ huynh (không hook — render được ở máy chủ).
 * Màu theo nhận diện Sata Robo: tím #610b8a cho mức đạt trở lên, cam #ff8f2d cho mức cần luyện thêm.
 */
import type { DayTone } from "@satarobo/core";

/** Thanh 4 nấc cho một tiêu chí rubric (1 Đang làm quen · 2 Cần hỗ trợ · 3 Đạt · 4 Vượt mong đợi) */
export function LevelMeter({ value, label }: { value: number | null; label: string }) {
  const v = value ?? 0;
  return (
    <span className="inline-flex gap-1" role="img" aria-label={`${label}: ${value ? `mức ${value}/4` : "chưa chấm"}`}>
      {[1, 2, 3, 4].map((n) => (
        <span key={n} className={`h-2 w-5 rounded-full ${n <= v ? (v >= 3 ? "bg-primary" : "bg-accent-500") : "bg-black/10"}`} />
      ))}
    </span>
  );
}

export const TONE_STYLE: Record<DayTone, { chip: string; dot: string }> = {
  done: { chip: "bg-green-100 text-green-800", dot: "bg-green-600" },
  late: { chip: "bg-amber-100 text-amber-900", dot: "bg-amber-500" },
  makeup: { chip: "bg-violet-100 text-violet-800", dot: "bg-violet-600" },
  excused: { chip: "bg-slate-200 text-slate-800", dot: "bg-slate-500" },
  absent: { chip: "bg-red-100 text-red-800", dot: "bg-red-600" },
  upcoming: { chip: "bg-primary-soft text-primary", dot: "bg-primary" },
  requested: { chip: "bg-accent-100 text-accent-700", dot: "bg-accent-500" },
  cancelled: { chip: "bg-black/5 text-ink-600 line-through", dot: "bg-black/25" },
  pending: { chip: "bg-black/5 text-ink-600", dot: "bg-black/30" },
};

export function ToneChip({ tone, label }: { tone: DayTone; label: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${TONE_STYLE[tone].chip}`}>{label}</span>;
}

/** Thanh tiến độ ngang có nhãn cho trình đọc màn hình */
export function Progress({ percent, label, tone = "primary" }: { percent: number | null; label: string; tone?: "primary" | "accent" | "ok" }) {
  const p = Math.max(0, Math.min(100, percent ?? 0));
  const bar = tone === "ok" ? "bg-green-600" : tone === "accent" ? "bg-accent-500" : "bg-primary";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-black/10" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p}>
      <div className={`h-2 rounded-full ${bar}`} style={{ width: `${p}%` }} />
    </div>
  );
}
