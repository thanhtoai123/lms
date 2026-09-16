import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { ReportFilter, Kpi, HBar, RateChip, Section, th, td, fmtMonth } from "@/components/report-ui";
import { CsvButton } from "@/components/csv-button";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Báo cáo Lead" };

type SP = { from?: string; to?: string; center?: string };
const todayVN = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

export default async function LeadReportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "report:read")) return <NoAccess title="Báo cáo Lead" perm="report:read" />;
  const d = await caller.reports.leads({ from: sp.from || undefined, to: sp.to || undefined, centerId: sp.center || undefined });
  const t = d.totals;
  const fname = `bao-cao-lead_${d.range.from}_${d.range.to}`;
  const groupRows = (xs: typeof d.bySale) => xs.map((x) => [x.label, x.total, x.contacted, x.trials, x.enrolled, x.lost, x.open, x.conversion, x.closedConversion, x.overdueTasks]);
  const groupHead = ["Nhóm", "Lead", "Đã liên hệ", "Hẹn/học thử", "Đăng ký", "Mất", "Đang mở", "Tỉ lệ chốt %", "Chốt/đã đóng %", "Việc quá hạn"];

  const GroupTable = ({ rows, first }: { rows: typeof d.bySale; first: string }) =>
    rows.length === 0 ? <div className="p-4"><Empty>Không có dữ liệu.</Empty></div> : (
      <table className="w-full text-sm">
        <thead><tr><th className={th}>{first}</th><th className={th}>Lead</th><th className={th}>Đã liên hệ</th><th className={th}>Học thử</th><th className={th}>Đăng ký</th><th className={th}>Mất</th><th className={th}>Đang mở</th><th className={th}>Tỉ lệ chốt</th><th className={th}>Việc quá hạn</th></tr></thead>
        <tbody className="divide-y divide-black/5">
          {rows.map((x) => (
            <tr key={x.key || x.label}>
              <td className="p-3 font-medium">{x.label}</td>
              <td className={td}>{x.total}</td><td className={td}>{x.contacted}</td><td className={td}>{x.trials}</td>
              <td className={`${td} font-semibold text-green-700`}>{x.enrolled}</td><td className={`${td} text-red-700`}>{x.lost}</td><td className={td}>{x.open}</td>
              <td className={td}><RateChip value={x.conversion} good={30} warn={15} /><div className="text-[11px] text-ink-400">{x.closedConversion}% trên lead đã đóng</div></td>
              <td className={`${td} ${x.overdueTasks ? "font-semibold text-red-700" : "text-ink-400"}`}>{x.overdueTasks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );

  const maxMonth = Math.max(1, ...d.byMonth.map((m) => m.total));
  return (
    <div className="space-y-4">
      <PageHeader title="Báo cáo Lead" desc="Phễu tuyển sinh theo lead tạo trong kỳ: tỉ lệ chuyển từng bậc, theo nguồn / tư vấn / cơ sở / tháng, và lead rụng ở bậc nào." />
      <ReportFilter basePath="/bao-cao/lead" from={d.range.from} to={d.range.to} centerId={d.centerId} centers={d.centers} today={todayVN()} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Lead mới trong kỳ" value={t.total} />
        <Kpi label="Đang mở" value={t.open} tone="brand" />
        <Kpi label="Đã đăng ký" value={t.enrolled} tone="good" hint={`Tỉ lệ chốt ${t.conversion}%`} />
        <Kpi label="Đã mất" value={t.lost} tone="bad" hint={`Chốt/đã đóng ${t.closedConversion}%`} />
        <Kpi label="Có học thử" value={t.trials} />
        <Kpi label="TB ngày để chốt" value={t.avgDaysToEnroll ?? "—"} hint="từ lúc tạo lead" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Phễu chuyển đổi" desc="Bậc cao nhất mỗi lead từng đạt (kể cả lead đã mất)" actions={<CsvButton filename={`${fname}_pheu`} headers={["Bậc", "Số lead", "% so với bậc trước", "% so với tổng"]} rows={d.funnel.map((f) => [f.label, f.count, f.fromPrev, f.fromTop])} />}>
          <div className="space-y-3 p-4">
            {d.funnel.map((f, i) => (
              <div key={f.stage}>
                <div className="flex items-baseline justify-between text-sm"><span className="font-medium">{f.label}</span><span className="tabular-nums"><b>{f.count}</b> <span className="text-xs text-ink-400">{i === 0 ? "" : `· ${f.fromPrev}% bậc trước · ${f.fromTop}% tổng`}</span></span></div>
                <HBar value={f.count} max={d.funnel[0]!.count} tone={f.stage === "enrolled" ? "good" : "brand"} />
              </div>
            ))}
          </div>
        </Section>
        <Section title="Lead mất rụng ở bậc nào" desc="Bậc cao nhất đạt được trước khi mất">
          <div className="space-y-3 p-4">
            {d.dropoff.map((x) => (
              <div key={x.stage}>
                <div className="flex justify-between text-sm"><span>Rụng sau “{x.label}”</span><b className="tabular-nums">{x.count}</b></div>
                <HBar value={x.count} max={Math.max(1, ...d.dropoff.map((y) => y.count))} tone="bad" />
              </div>
            ))}
            <div className="border-t border-black/5 pt-3">
              <div className="mb-1 text-xs font-semibold uppercase text-ink-400">Lý do mất</div>
              {d.lostReasons.length === 0 ? <div className="text-sm text-ink-400">Chưa có lead mất trong kỳ.</div> : (
                <ul className="space-y-1 text-sm">{d.lostReasons.map((r) => <li key={r.reason} className="flex justify-between"><span>{r.reason}</span><b className="tabular-nums">{r.count}</b></li>)}</ul>
              )}
            </div>
          </div>
        </Section>
      </div>

      <Section title="Theo tư vấn viên" actions={<CsvButton filename={`${fname}_tu-van`} headers={groupHead} rows={groupRows(d.bySale)} />}><GroupTable rows={d.bySale} first="Tư vấn" /></Section>
      <Section title="Theo nguồn" actions={<CsvButton filename={`${fname}_nguon`} headers={groupHead} rows={groupRows(d.bySource)} />}><GroupTable rows={d.bySource} first="Nguồn" /></Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Theo cơ sở"><GroupTable rows={d.byCenter} first="Cơ sở" /></Section>
        <Section title="Theo tháng" actions={<CsvButton filename={`${fname}_thang`} headers={["Tháng", "Lead", "Đăng ký", "Mất", "Tỉ lệ chốt %"]} rows={d.byMonth.map((m) => [m.month, m.total, m.enrolled, m.lost, m.conversion])} />}>
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Tháng</th><th className={th}>Lead</th><th className={`${th} w-1/3`}></th><th className={th}>Đăng ký</th><th className={th}>Mất</th><th className={th}>Chốt</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.byMonth.map((m) => (
                <tr key={m.month}><td className="p-3">{fmtMonth(m.month)}</td><td className={td}>{m.total}</td><td className="p-3"><HBar value={m.total} max={maxMonth} /></td><td className={`${td} text-green-700`}>{m.enrolled}</td><td className={`${td} text-red-700`}>{m.lost}</td><td className={td}>{m.conversion}%</td></tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
      <Section title="Phân bố trạng thái hiện tại">
        <div className="flex flex-wrap gap-2 p-4">
          {d.byStatus.map((s) => <span key={s.status} className="chip bg-black/5">{s.label}: <b className="ml-1 tabular-nums">{s.count}</b></span>)}
        </div>
      </Section>
    </div>
  );
}
