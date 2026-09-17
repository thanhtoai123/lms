import Link from "next/link";

export function addDaysISO(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function monthStart(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

/** Bộ lọc khoảng ngày + cơ sở dùng chung cho các trang báo cáo (GET form) */
export function ReportFilter({ basePath, from, to, centerId, centers, today, extra, extraParams }: { basePath: string; from: string; to: string; centerId: string | null; centers: { id: string; code: string; name: string }[]; today: string; extra?: React.ReactNode; extraParams?: Record<string, string | null | undefined> }) {
  const q = (f: string, t: string) => {
    const u = new URLSearchParams({ from: f, to: t });
    if (centerId) u.set("center", centerId);
    for (const [k, v] of Object.entries(extraParams ?? {})) if (v) u.set(k, v);
    return `${basePath}?${u.toString()}`;
  };
  const prevMonthEnd = addDaysISO(monthStart(today), -1);
  const presets = [
    { label: "30 ngày", href: q(addDaysISO(today, -29), today) },
    { label: "Tháng này", href: q(monthStart(today), today) },
    { label: "Tháng trước", href: q(monthStart(prevMonthEnd), prevMonthEnd) },
    { label: "90 ngày", href: q(addDaysISO(today, -89), today) },
    { label: "Từ đầu năm", href: q(`${today.slice(0, 4)}-01-01`, today) },
  ];
  return (
    <div className="card flex flex-wrap items-end gap-3 p-3 print:hidden">
      <form className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-ink-600">Từ ngày<input type="date" name="from" defaultValue={from} className="input mt-1 !py-1.5" /></label>
        <label className="text-xs text-ink-600">Đến ngày<input type="date" name="to" defaultValue={to} className="input mt-1 !py-1.5" /></label>
        {centers.length > 1 || !centerId ? (
          <label className="text-xs text-ink-600">Cơ sở
            <select name="center" defaultValue={centerId ?? ""} className="input mt-1 !py-1.5 min-w-[160px]">
              {centers.length > 1 && <option value="">Tất cả cơ sở được xem</option>}
              {centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </label>
        ) : null}
        {extra}
        <button className="btn-primary !py-1.5">Xem</button>
      </form>
      <div className="flex flex-wrap gap-1 text-xs">
        {presets.map((p) => <Link key={p.label} href={p.href} className="rounded-full border border-black/10 px-2.5 py-1 hover:bg-black/5">{p.label}</Link>)}
      </div>
    </div>
  );
}

export function Kpi({ label, value, hint, tone = "default" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "default" | "good" | "warn" | "bad" | "brand" }) {
  const color = { default: "text-ink-900", good: "text-green-700", warn: "text-amber-700", bad: "text-red-700", brand: "text-brand-600" }[tone];
  return (
    <div className="card p-4">
      <div className="text-xs text-ink-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-600">{hint}</div>}
    </div>
  );
}

/** Thanh ngang đơn giản (không cần thư viện biểu đồ) */
export function HBar({ value, max, tone = "brand" }: { value: number; max: number; tone?: "brand" | "good" | "bad" | "warn" | "muted" }) {
  const w = max > 0 ? Math.max(value > 0 ? 2 : 0, Math.round((value / max) * 100)) : 0;
  const bg = { brand: "bg-brand-500", good: "bg-green-500", bad: "bg-red-400", warn: "bg-amber-400", muted: "bg-slate-300" }[tone];
  return (
    <div className="h-2 w-full rounded-full bg-black/5">
      <div className={`h-2 rounded-full ${bg}`} style={{ width: `${w}%` }} />
    </div>
  );
}

export function RateChip({ value, good = 80, warn = 60 }: { value: number; good?: number; warn?: number }) {
  const cls = value >= good ? "bg-green-100 text-green-800" : value >= warn ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700";
  return <span className={`chip tabular-nums ${cls}`}>{value}%</span>;
}

export function Section({ title, desc, actions, children }: { title: string; desc?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 px-4 py-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {desc && <p className="text-xs text-ink-600">{desc}</p>}
        </div>
        {actions}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

export const th = "p-3 text-left text-xs font-semibold uppercase text-ink-400";
export const td = "p-3 tabular-nums";

export function fmtMonth(m: string) {
  const [y, mm] = m.split("-");
  return `T${Number(mm)}/${y}`;
}
