import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { ReportFilter, Kpi, HBar, RateChip, Section, th, td, fmtMonth } from "@/components/report-ui";
import { CsvButton } from "@/components/csv-button";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Báo cáo trải nghiệm" };

type SP = { from?: string; to?: string; center?: string };
const todayVN = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

export default async function TrialReportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "report:read")) return <NoAccess title="Báo cáo trải nghiệm" perm="report:read" />;
  const d = await caller.reports.trials({ from: sp.from || undefined, to: sp.to || undefined, centerId: sp.center || undefined });
  const t = d.totals;
  const fname = `bao-cao-hoc-thu_${d.range.from}_${d.range.to}`;
  const head = ["Nhóm", "Lượt xếp", "Đã học thử", "Không đến", "Huỷ/đổi", "Tỉ lệ đến %", "Đăng ký", "Chốt sau học thử %"];
  const csv = (xs: typeof d.byCourse) => xs.map((x) => [x.label, x.booked, x.attended, x.noShow, x.cancelled, x.showRate, x.converted, x.conversion]);

  const Group = ({ rows, first }: { rows: typeof d.byCourse; first: string }) =>
    rows.length === 0 ? <div className="p-4"><Empty>Không có lượt học thử trong kỳ.</Empty></div> : (
      <table className="w-full text-sm">
        <thead><tr><th className={th}>{first}</th><th className={th}>Lượt xếp</th><th className={th}>Đã học</th><th className={th}>Không đến</th><th className={th}>Huỷ / đổi</th><th className={th}>Tỉ lệ đến</th><th className={th}>Đăng ký</th><th className={th}>Chốt sau học thử</th></tr></thead>
        <tbody className="divide-y divide-black/5">
          {rows.map((x) => (
            <tr key={x.key || x.label}>
              <td className="p-3 font-medium">{x.label}</td><td className={td}>{x.booked}</td><td className={`${td} text-green-700`}>{x.attended}</td><td className={`${td} text-red-700`}>{x.noShow}</td><td className={`${td} text-ink-400`}>{x.cancelled}</td>
              <td className={td}><RateChip value={x.showRate} good={80} warn={60} /></td><td className={`${td} font-semibold`}>{x.converted}</td><td className={td}><RateChip value={x.conversion} good={40} warn={20} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    );

  const maxM = Math.max(1, ...d.byMonth.map((m) => m.booked));
  return (
    <div className="space-y-4">
      <PageHeader title="Báo cáo trải nghiệm" desc="Học thử → đăng ký: tỉ lệ đến buổi thử, tỉ lệ chốt sau học thử, lấp đầy lớp nhận học thử. Tính theo ngày của buổi học thử." actions={<Link href="/lop-trial/buoi-le" className="btn-ghost">Mở học thử buổi lẻ</Link>} />
      <ReportFilter basePath="/bao-cao/trial" from={d.range.from} to={d.range.to} centerId={d.centerId} centers={d.centers} today={todayVN()} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Lượt xếp học thử" value={t.booked} />
        <Kpi label="Sắp diễn ra" value={t.upcoming} tone="brand" />
        <Kpi label="Chưa ghi kết quả" value={t.pendingResult} tone={t.pendingResult ? "warn" : "default"} hint="buổi đã qua" />
        <Kpi label="Đã học thử" value={t.attended} tone="good" />
        <Kpi label="Không đến" value={t.noShow} tone="bad" hint={`Tỉ lệ đến ${t.showRate}%`} />
        <Kpi label="Huỷ / đổi lịch" value={`${t.cancelled} / ${t.rescheduled}`} />
        <Kpi label="Chốt sau học thử" value={`${t.conversion}%`} tone="good" hint={`${t.convertedLeads}/${t.attendedLeads} khách`} />
      </div>
      <Section title="Theo khoá học" actions={<CsvButton filename={`${fname}_khoa`} headers={head} rows={csv(d.byCourse)} />}><Group rows={d.byCourse} first="Khoá" /></Section>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Theo tư vấn xếp lịch" actions={<CsvButton filename={`${fname}_tu-van`} headers={head} rows={csv(d.bySale)} />}><Group rows={d.bySale} first="Tư vấn" /></Section>
        <Section title="Theo giáo viên đứng buổi" actions={<CsvButton filename={`${fname}_giao-vien`} headers={head} rows={csv(d.byTeacher)} />}><Group rows={d.byTeacher} first="Giáo viên" /></Section>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Lấp đầy lớp nhận học thử" desc="Số lượt thử trên mỗi buổi có khách thử">
          {d.fill.length === 0 ? <div className="p-4"><Empty>Chưa có lớp nhận học thử.</Empty></div> : (
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Lớp</th><th className={th}>Buổi có thử</th><th className={th}>Lượt thử</th><th className={th}>TB / buổi</th><th className={th}>Sĩ số tối đa</th></tr></thead>
              <tbody className="divide-y divide-black/5">
                {d.fill.map((f) => <tr key={f.classId}><td className="p-3 font-mono text-xs">{f.classCode}</td><td className={td}>{f.sessions}</td><td className={td}>{f.seats}</td><td className={td}>{f.perSession}</td><td className={`${td} text-ink-400`}>{f.capacity}</td></tr>)}
              </tbody>
            </table>
          )}
        </Section>
        <Section title="Theo tháng">
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Tháng</th><th className={th}>Lượt xếp</th><th className={`${th} w-1/3`}></th><th className={th}>Đã học</th><th className={th}>Không đến</th><th className={th}>Tỉ lệ đến</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.byMonth.map((m) => <tr key={m.month}><td className="p-3">{fmtMonth(m.month)}</td><td className={td}>{m.booked}</td><td className="p-3"><HBar value={m.booked} max={maxM} /></td><td className={td}>{m.attended}</td><td className={td}>{m.noShow}</td><td className={td}>{m.showRate}%</td></tr>)}
            </tbody>
          </table>
        </Section>
      </div>
      <Section title="Theo cơ sở"><Group rows={d.byCenter} first="Cơ sở" /></Section>
    </div>
  );
}
