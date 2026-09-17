import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Kpi, HBar, Section, th, td, fmtMonth } from "@/components/report-ui";
import { CsvButton } from "@/components/csv-button";
import { vnd } from "@/components/finance-ui";
import { TargetForm } from "./target-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Doanh thu vs mục tiêu" };
const TONE = { good: "bg-green-100 text-green-800", warn: "bg-amber-100 text-amber-800", bad: "bg-red-100 text-red-700", none: "bg-slate-100 text-slate-500" } as const;
const Pct = ({ pct, tone }: { pct: number | null; tone: keyof typeof TONE }) => <span className={`chip tabular-nums ${TONE[tone]}`}>{pct === null ? "—" : `${pct}%`}</span>;

export default async function RevenueTargetPage({ searchParams }: { searchParams: Promise<{ year?: string; center?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "report:read")) return <NoAccess title="Doanh thu vs mục tiêu" perm="report:read" />;
  const year = Number(sp.year) >= 2020 && Number(sp.year) <= 2100 ? Number(sp.year) : undefined;
  const d = await caller.reports.revenue({ year, centerId: sp.center || undefined });
  const t = d.totals;
  const q = (y: number) => `/bao-cao/doanh-thu?year=${y}${d.centerId ? `&center=${d.centerId}` : ""}`;
  const curMonth = d.today.slice(0, 7);
  const maxBar = Math.max(1, ...d.byMonth.map((m) => Math.max(m.actual, m.target ?? 0)));
  return (
    <div className="space-y-4">
      <PageHeader title="Doanh thu vs mục tiêu" desc="Thực thu thuần (thu − hoàn) so với mục tiêu tháng do Hội sở đặt. Tháng hiện tại so với tiến độ thời gian đã trôi qua." />
      <div className="card flex flex-wrap items-end gap-3 p-3">
        <div className="flex items-center gap-1 text-sm">
          <Link href={q(d.year - 1)} className="btn-ghost !py-1">← {d.year - 1}</Link>
          <span className="px-2 font-semibold">Năm {d.year}</span>
          <Link href={q(d.year + 1)} className="btn-ghost !py-1">{d.year + 1} →</Link>
        </div>
        {d.centers.length > 1 && (
          <form className="flex items-end gap-2">
            <input type="hidden" name="year" value={d.year} />
            <select name="center" defaultValue={d.centerId ?? ""} className="input !py-1.5">
              <option value="">Tất cả cơ sở</option>
              {d.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
            <button className="btn-primary !py-1.5">Xem</button>
          </form>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={`Mục tiêu năm ${d.year}`} value={t.target === null ? "Chưa đặt" : vnd(t.target)} />
        <Kpi label="Thực thu thuần" value={vnd(t.actual)} tone="brand" hint={<Pct pct={t.pct} tone={t.tone} />} />
        <Kpi label="Lũy kế mục tiêu (YTD)" value={t.ytdTarget === null ? "—" : vnd(t.ytdTarget)} />
        <Kpi label="Lũy kế thực thu (YTD)" value={vnd(t.ytdActual)} tone={t.ytd.tone === "none" ? "default" : t.ytd.tone} hint={<Pct pct={t.ytd.pct} tone={t.ytd.tone} />} />
      </div>

      <Section title="Theo tháng" actions={<CsvButton filename={`doanh-thu-muc-tieu_${d.year}`} headers={["Tháng", "Mục tiêu", "Thực thu thuần", "% đạt", "Kỳ vọng theo tiến độ", "Ghi danh mục tiêu", "Ghi danh thực tế"]} rows={d.byMonth.map((m) => [m.month, m.target ?? "", m.actual, m.pct ?? "", m.expected ?? "", m.enrollTarget ?? "", m.enrollActual])} />}>
        <table className="w-full text-sm">
          <thead><tr><th className={th}>Tháng</th><th className={th}>Mục tiêu</th><th className={th}>Thực thu</th><th className={`${th} w-1/4`}>Tiến độ</th><th className={th}>% đạt</th><th className={th}>Ghi danh</th></tr></thead>
          <tbody className="divide-y divide-black/5">
            {d.byMonth.map((m) => {
              const isCur = m.month === curMonth;
              const behind = isCur && m.expected !== null && m.actual < m.expected;
              return (
                <tr key={m.month} className={isCur ? "bg-brand-50/50" : m.month > curMonth ? "text-ink-400" : ""}>
                  <td className="p-3 font-medium">{fmtMonth(m.month)}{isCur && <div className="text-[11px] font-normal text-ink-400">đã qua {Math.round(m.progress * 100)}% tháng</div>}</td>
                  <td className={td}>{m.target === null ? "—" : vnd(m.target)}</td>
                  <td className={`${td} font-semibold`}>{vnd(m.actual)}</td>
                  <td className={td}>
                    <div className="space-y-1"><HBar value={m.actual} max={maxBar} tone={m.tone === "none" ? "brand" : m.tone} />{m.target !== null && <HBar value={m.target} max={maxBar} tone="muted" />}</div>
                    {isCur && m.expected !== null && <div className={`text-[11px] ${behind ? "text-red-700" : "text-green-700"}`}>Kỳ vọng đến hôm nay {vnd(m.expected)} — {behind ? `thiếu ${vnd(m.expected - m.actual)}` : "đúng tiến độ"}</div>}
                  </td>
                  <td className={td}><Pct pct={m.pct} tone={m.tone} /></td>
                  <td className={td}>{m.enrollActual}{m.enrollTarget !== null && <span className="text-ink-400"> / {m.enrollTarget}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <Section title="Cơ sở × tháng" desc="Mỗi ô: thực thu / mục tiêu">
        <table className="w-full text-xs">
          <thead><tr><th className={th}>Cơ sở</th><th className={th}>Cả năm</th>{d.months.map((m) => <th key={m} className={th}>{fmtMonth(m)}</th>)}</tr></thead>
          <tbody className="divide-y divide-black/5">
            {d.byCenter.map((c) => (
              <tr key={c.id}>
                <td className="p-2 font-medium">{c.code}</td>
                <td className="p-2 tabular-nums"><div>{vnd(c.actual)}</div><div className="text-ink-400">{c.target === null ? "—" : vnd(c.target)}</div><Pct pct={c.pct} tone={c.tone} /></td>
                {c.months.map((m) => (
                  <td key={m.month} className="p-2 tabular-nums" title={m.note ?? undefined}>
                    <div>{m.actual ? vnd(m.actual) : "·"}</div>
                    <div className="text-ink-400">{m.target === null ? "—" : vnd(m.target)}</div>
                    {m.pct !== null && <Pct pct={m.pct} tone={m.tone} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {d.canSet && <TargetForm centers={d.centers} year={d.year} curMonth={curMonth} />}
    </div>
  );
}
