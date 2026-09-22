/**
 * Mảnh hiển thị dùng chung của HỒ SƠ HỌC TẬP (phiếu buổi, học bạ mốc, cả hồ sơ).
 * Không dùng hook, không import mã chỉ-máy-chủ → render được ở máy chủ (trang phụ huynh, trang in)
 * lẫn trình duyệt (xem trước trong drawer).
 */
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { RUBRIC_LEVELS, TREND_VI, scoreLabel, type RubricLevel, type Trend } from "@satarobo/core";

export const TZ = "Asia/Ho_Chi_Minh";

/** dd/mm/yyyy từ "YYYY-MM-DD" hoặc ISO */
export function fmtDay(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v.length === 10 ? `${v}T00:00:00+07:00` : v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("vi-VN", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
}

/** "Thứ Bảy, 20/09/2026" */
export function fmtWeekday(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v.length === 10 ? `${v}T00:00:00+07:00` : v);
  if (Number.isNaN(d.getTime())) return null;
  const s = d.toLocaleDateString("vi-VN", { timeZone: TZ, weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const pct = (r: number | null | undefined) => (r == null ? "—" : `${Math.round(r * 100)}%`);
export const num1 = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

/**
 * Màu theo nấc — nấc thấp dùng cam nhấn (tích cực, không đỏ), nấc cao dùng tím thương hiệu.
 * Mảng 4 phần tử cho thang 4; thang 5 quy về 4 màu gần nhất.
 */
const FILL = ["bg-accent-500", "bg-brand-300", "bg-brand-400", "bg-primary"] as const;
const TEXT = ["text-accent-700", "text-brand-500", "text-brand-500", "text-primary"] as const;
function toneOf(idx: number, n: number) {
  if (idx < 0) return 0;
  if (n <= 1) return 3;
  return Math.round((idx / (n - 1)) * 3);
}

/**
 * Thanh nấc cho một tiêu chí (4 nấc với rubric mới, 5 nấc với học bạ cũ): các nấc tới mức đạt được tô màu,
 * mức đạt được in đậm; dưới thanh là mô tả của mức (giúp ông bà đọc hiểu, không cần bảng tra).
 */
export function RubricBar({
  label, value, levels, scale = 4, hint = true, extra, dense = false,
}: {
  label: string;
  value: number | null;
  /** Mô tả mức (bản chụp trên phiếu); bỏ trống thì dùng nhãn chuẩn của thang */
  levels?: readonly RubricLevel[];
  scale?: number;
  hint?: boolean;
  /** Nội dung phụ bên phải (xu hướng, trung bình buổi…) */
  extra?: React.ReactNode;
  dense?: boolean;
}) {
  const steps: RubricLevel[] = levels?.length
    ? levels.map((l) => ({ ...l }))
    : scale === 4
      ? RUBRIC_LEVELS.map((l) => ({ ...l }))
      : Array.from({ length: scale }, (_, i) => ({ value: i + 1, label: scoreLabel(i + 1, scale), hint: "" }));
  const idx = value == null ? -1 : steps.findIndex((l) => l.value === value);
  const t = toneOf(idx, steps.length);
  const chosen = idx >= 0 ? steps[idx] : undefined;
  return (
    <div className={`hs-avoid ${dense ? "py-1.5" : "py-2"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="flex shrink-0 items-center gap-2">
          {extra}
          <span className={`text-sm font-bold ${chosen ? TEXT[t] : "text-muted-foreground"}`}>{chosen ? chosen.label : "Chưa đánh giá"}</span>
        </span>
      </div>
      <div
        className="mt-1 grid gap-1"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
        role="img"
        aria-label={`${label}: ${chosen ? chosen.label : "chưa đánh giá"} (${idx + 1}/${steps.length})`}
      >
        {steps.map((l, i) => (
          <div key={l.value} className={`h-2.5 rounded-full ${i <= idx ? FILL[t] : "bg-brand-100/70"}`} />
        ))}
      </div>
      {!dense && (
        <div className="mt-0.5 grid gap-1 text-center text-[10px] leading-tight text-muted-foreground" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-hidden>
          {steps.map((l, i) => <span key={l.value} className={`truncate ${i === idx ? `font-bold ${TEXT[t]}` : ""}`}>{l.label}</span>)}
        </div>
      )}
      {hint && chosen?.hint && <p className="mt-1 text-xs italic text-foreground/70">{chosen.hint}</p>}
    </div>
  );
}

export function TrendChip({ trend, small = false }: { trend: Trend | null | undefined; small?: boolean }) {
  if (!trend) return null;
  const Icon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const tone = trend === "up" ? "bg-green-100 text-green-800" : trend === "down" ? "bg-accent-100 text-accent-700" : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${small ? "text-[10px]" : "text-xs"} ${tone}`}>
      <Icon className="h-3 w-3" aria-hidden /> {TREND_VI[trend]}
    </span>
  );
}

/** Đầu trang in / đầu phiếu mang nhận diện Sata Robo */
export function BrandHeader({ title, sub, right }: { title: string; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <header className="hs-avoid bg-gradient-to-br from-primary to-primary-darker px-5 py-4 text-white print:px-4 print:py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={32} height={32} className="h-8 w-8 rounded-lg bg-white/10" />
          <span className="text-base font-extrabold tracking-tight">Sata Robo</span>
        </div>
        {right}
      </div>
      <h1 className="mt-3 text-xl font-extrabold leading-tight print:mt-2 print:text-lg">{title}</h1>
      {sub && <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-white/85">{sub}</div>}
    </header>
  );
}

export function CenterFooter({ center }: { center: { name: string; address: string | null; phone: string | null } | null }) {
  if (!center) return null;
  return (
    <footer className="hs-avoid border-t border-border bg-muted/50 px-5 py-3 text-xs text-muted-foreground print:px-4 print:py-2">
      <span className="font-bold text-foreground">Sata Robo · {center.name}</span>
      {center.address && <span> · {center.address}</span>}
      {center.phone && <span> · {center.phone}</span>}
    </footer>
  );
}
