import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { ReportFilter, Kpi, HBar, RateChip, Section, th, td, fmtMonth } from "@/components/report-ui";
import { CsvButton } from "@/components/csv-button";
import { Empty } from "@/components/ui";
import { vnd } from "@/components/finance-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Báo cáo trung tâm" };

type SP = { from?: string; to?: string; center?: string };
const todayVN = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

export default async function CenterReportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "report:read")) return <NoAccess title="Báo cáo trung tâm" perm="report:read" />;
  const d = await caller.reports.center({ from: sp.from || undefined, to: sp.to || undefined, centerId: sp.center || undefined });
  const t = d.totals;
  const fname = `bao-cao-trung-tam_${d.range.from}_${d.range.to}`;
  const maxRev = Math.max(1, ...d.byMonth.map((m) => m.revenue));
  const maxMethod = Math.max(1, ...d.byMethod.map((m) => m.amount));
  const maxCourse = Math.max(1, ...d.byCourse.map((m) => m.amount));
  return (
    <div className="space-y-4">
      <PageHeader title="Báo cáo trung tâm" desc="Tổng hợp theo cơ sở: doanh thu thực thu, hoàn tiền, đơn hàng, ghi danh, chuyên cần và công nợ hiện tại." />
      <ReportFilter basePath="/bao-cao/trung-tam" from={d.range.from} to={d.range.to} centerId={d.centerId} centers={d.centers} today={todayVN()} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Thực thu" value={vnd(t.revenue)} tone="good" hint={`${t.payments} phiếu thu`} />
        <Kpi label="Hoàn tiền" value={vnd(t.refunds)} tone={t.refunds ? "bad" : "default"} />
        <Kpi label="Doanh thu thuần" value={vnd(t.net)} tone="brand" />
        <Kpi label="Đơn mới" value={t.orders} hint={`Giảm giá ${vnd(t.discount)}`} />
        <Kpi label="Ghi danh mới" value={t.newEnrollments} hint={`Nghỉ ${t.withdrawn} · Hoàn thành ${t.completed}`} />
        <Kpi label="Chuyên cần" value={`${t.attendanceRate}%`} tone={t.attendanceRate >= 85 ? "good" : t.attendanceRate >= 70 ? "warn" : "bad"} />
        <Kpi label="Học viên đang học" value={t.activeStudents} hint="hiện tại" />
        <Kpi label="Lớp đang chạy" value={t.runningClasses} hint="hiện tại" />
        <Kpi label="Công nợ" value={vnd(t.outstanding)} tone={t.outstanding ? "warn" : "default"} hint={`${t.overdueOrders} đơn quá hạn`} />
      </div>

      <Section title="Theo cơ sở" actions={<CsvButton filename={`${fname}_co-so`} headers={["Cơ sở", "Thực thu", "Hoàn tiền", "Thuần", "Đơn", "Ghi danh", "Nghỉ", "Hoàn thành", "Chuyên cần %", "HV đang học", "Lớp chạy", "Công nợ", "Đơn quá hạn"]} rows={d.byCenter.map((c) => [c.code, c.revenue, c.refunds, c.net, c.orders, c.newEnrollments, c.withdrawn, c.completed, c.attendanceRate, c.snapshot?.active_students ?? 0, c.snapshot?.running_classes ?? 0, c.snapshot?.outstanding ?? 0, c.snapshot?.overdue_orders ?? 0])} />}>
        {d.byCenter.length === 0 ? <div className="p-4"><Empty>Không có cơ sở.</Empty></div> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Cơ sở</th><th className={th}>Thực thu</th><th className={th}>Hoàn</th><th className={th}>Thuần</th><th className={th}>Đơn</th><th className={th}>Ghi danh</th><th className={th}>Nghỉ / HT</th><th className={th}>Chuyên cần</th><th className={th}>HV / lớp</th><th className={th}>Công nợ</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.byCenter.map((c) => (
                <tr key={c.id}>
                  <td className="p-3 font-medium">{c.code}<div className="text-xs font-normal text-ink-400">{c.name}</div></td>
                  <td className={td}>{vnd(c.revenue)}</td>
                  <td className={`${td} ${c.refunds ? "text-red-700" : "text-ink-400"}`}>{vnd(c.refunds)}</td>
                  <td className={`${td} font-semibold`}>{vnd(c.net)}</td>
                  <td className={td}>{c.orders}</td>
                  <td className={`${td} text-green-700`}>{c.newEnrollments}</td>
                  <td className={td}>{c.withdrawn} / {c.completed}</td>
                  <td className={td}><RateChip value={c.attendanceRate} good={85} warn={70} /></td>
                  <td className={td}>{c.snapshot?.active_students ?? 0} / {c.snapshot?.running_classes ?? 0}</td>
                  <td className={`${td} ${(c.snapshot?.outstanding ?? 0) > 0 ? "text-amber-700" : "text-ink-400"}`}>{vnd(c.snapshot?.outstanding ?? 0)}{(c.snapshot?.overdue_orders ?? 0) > 0 && <div className="text-xs text-red-700">{c.snapshot?.overdue_orders} quá hạn</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Theo tháng" actions={<CsvButton filename={`${fname}_thang`} headers={["Tháng", "Thực thu", "Hoàn tiền", "Thuần", "Đơn", "Ghi danh", "Nghỉ", "Chuyên cần %"]} rows={d.byMonth.map((m) => [m.month, m.revenue, m.refunds, m.net, m.orders, m.newEnrollments, m.withdrawn, m.attendanceRate])} />}>
        <table className="w-full text-sm">
          <thead><tr><th className={th}>Tháng</th><th className={`${th} w-1/3`}>Thực thu</th><th className={th}>Hoàn</th><th className={th}>Thuần</th><th className={th}>Đơn</th><th className={th}>Ghi danh</th><th className={th}>Nghỉ</th><th className={th}>Chuyên cần</th></tr></thead>
          <tbody className="divide-y divide-black/5">
            {d.byMonth.map((m) => (
              <tr key={m.month}>
                <td className="p-3 font-medium">{fmtMonth(m.month)}</td>
                <td className={td}><div className="flex items-center gap-2"><span className="w-28 shrink-0">{vnd(m.revenue)}</span><HBar value={m.revenue} max={maxRev} tone="good" /></div></td>
                <td className={td}>{vnd(m.refunds)}</td>
                <td className={`${td} font-semibold`}>{vnd(m.net)}</td>
                <td className={td}>{m.orders}</td>
                <td className={td}>{m.newEnrollments}</td>
                <td className={td}>{m.withdrawn}</td>
                <td className={td}><RateChip value={m.attendanceRate} good={85} warn={70} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {d.byCenter.length > 1 && d.months.length > 1 && (
        <Section title="Thực thu thuần: cơ sở × tháng">
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Cơ sở</th>{d.months.map((m) => <th key={m} className={th}>{fmtMonth(m)}</th>)}</tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.byCenter.map((c) => <tr key={c.id}><td className="p-3 font-medium">{c.code}</td>{c.months.map((m) => <td key={m.month} className={td}>{vnd(m.net)}</td>)}</tr>)}
            </tbody>
          </table>
        </Section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Theo phương thức thanh toán">
          {d.byMethod.length === 0 ? <div className="p-4"><Empty>Chưa có thu.</Empty></div> : (
            <div className="space-y-2 p-4">{d.byMethod.map((m) => <div key={m.method ?? "-"} className="text-sm"><div className="flex justify-between"><span>{m.method ?? "Khác"} <span className="text-xs text-ink-400">({m.n})</span></span><span className="tabular-nums">{vnd(m.amount)}</span></div><HBar value={m.amount} max={maxMethod} /></div>)}</div>
          )}
        </Section>
        <Section title="Theo khoá học">
          {d.byCourse.length === 0 ? <div className="p-4"><Empty>Chưa có thu.</Empty></div> : (
            <div className="space-y-2 p-4">{d.byCourse.map((m) => <div key={m.course ?? "-"} className="text-sm"><div className="flex justify-between"><span>{m.course ?? "Khác"}</span><span className="tabular-nums">{vnd(m.amount)}</span></div><HBar value={m.amount} max={maxCourse} tone="good" /></div>)}</div>
          )}
        </Section>
      </div>
    </div>
  );
}
