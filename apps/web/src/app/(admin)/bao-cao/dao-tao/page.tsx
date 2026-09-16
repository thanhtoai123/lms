import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { ReportFilter, Kpi, HBar, RateChip, Section, th, td } from "@/components/report-ui";
import { CsvButton } from "@/components/csv-button";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Báo cáo đào tạo" };

type SP = { from?: string; to?: string; center?: string };
const todayVN = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

export default async function TrainingReportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "report:read")) return <NoAccess title="Báo cáo đào tạo" perm="report:read" />;
  const d = await caller.reports.training({ from: sp.from || undefined, to: sp.to || undefined, centerId: sp.center || undefined });
  const t = d.totals;
  const a = t.attendance;
  return (
    <div className="space-y-4">
      <PageHeader title="Báo cáo đào tạo" desc="Chuyên cần theo lớp trong kỳ: số buổi kế hoạch / đã hoàn tất / huỷ / quá hạn chưa chốt; lượt có mặt, vắng; học bù đang chờ và đã bù." />
      <ReportFilter basePath="/bao-cao/dao-tao" from={d.range.from} to={d.range.to} centerId={d.centerId} centers={d.centers} today={todayVN()} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Lớp có buổi trong kỳ" value={t.classes} />
        <Kpi label="Buổi kế hoạch" value={t.planned} />
        <Kpi label="Đã hoàn tất" value={t.completed} tone="good" />
        <Kpi label="Quá hạn chưa chốt" value={t.overdue} tone={t.overdue ? "bad" : "default"} />
        <Kpi label="Huỷ / dời" value={t.cancelled} />
        <Kpi label="Chuyên cần" value={`${t.rate}%`} tone={t.rate >= 80 ? "good" : "warn"} hint={`${a.present + a.late + a.makeup} có mặt · ${a.absent + a.excused} vắng`} />
        <Kpi label="Học bù chờ / đã bù" value={`${t.makeupPending} / ${t.makeupDone}`} tone={t.makeupPending ? "warn" : "default"} />
      </div>
      <Section
        title="Theo lớp"
        desc="Vắng có phép / không phép tách riêng; 'chờ bù' gồm yêu cầu đang mở và buổi vắng chưa có yêu cầu bù."
        actions={<CsvButton filename={`bao-cao-dao-tao_${d.range.from}_${d.range.to}`} headers={["Lớp", "Tên lớp", "Cơ sở", "Khoá", "GV chính", "HV đang học", "Buổi kế hoạch", "Hoàn tất", "Huỷ/dời", "Quá hạn", "Tiến độ %", "Có mặt", "Muộn", "Học bù", "Vắng có phép", "Vắng không phép", "Chuyên cần %", "Chờ bù", "Đã bù"]}
          rows={d.items.map((c) => [c.code, c.name, c.center_code, c.course_code, c.teacher, c.students, c.planned, c.completed, c.cancelled, c.overdue, c.progress, c.attendance.present, c.attendance.late, c.attendance.makeup, c.attendance.excused, c.attendance.absent, c.rate, c.makeupPending, c.makeupDone])} />}
      >
        {d.items.length === 0 ? <div className="p-4"><Empty>Không có buổi học nào trong kỳ.</Empty></div> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Lớp</th><th className={th}>GV chính</th><th className={th}>HV</th><th className={th}>Buổi (xong / kế hoạch)</th><th className={th}>Quá hạn</th><th className={th}>Có mặt</th><th className={th}>Vắng (P / KP)</th><th className={th}>Chuyên cần</th><th className={th}>Chờ bù</th><th className={th}>Đã bù</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((c) => (
                <tr key={c.id} className="hover:bg-black/[0.02]">
                  <td className="p-3"><Link href={`/attendance?class=${c.id}`} className="font-mono text-xs font-semibold text-brand-600">{c.code}</Link><div className="text-xs text-ink-400">{c.center_code} · {c.course_code}</div></td>
                  <td className="p-3 text-xs">{c.teacher ?? "—"}</td>
                  <td className={td}>{c.students}</td>
                  <td className="p-3 min-w-[140px]"><div className="text-xs tabular-nums">{c.completed}/{c.planned}{c.cancelled ? <span className="text-ink-400"> · huỷ {c.cancelled}</span> : null}</div><HBar value={c.completed} max={c.planned} tone="good" /></td>
                  <td className={`${td} ${c.overdue ? "font-semibold text-red-700" : "text-ink-400"}`}>{c.overdue}</td>
                  <td className={td}>{c.attendance.present + c.attendance.late + c.attendance.makeup}<div className="text-[11px] text-ink-400">muộn {c.attendance.late} · bù {c.attendance.makeup}</div></td>
                  <td className={td}>{c.attendance.excused} / <span className={c.attendance.absent ? "text-red-700" : ""}>{c.attendance.absent}</span></td>
                  <td className={td}>{c.marks ? <RateChip value={c.rate} /> : <span className="text-ink-400">—</span>}</td>
                  <td className={`${td} ${c.makeupPending ? "font-semibold text-amber-700" : "text-ink-400"}`}>{c.makeupPending ? <Link href="/hoc-bu" className="hover:underline">{c.makeupPending}</Link> : 0}</td>
                  <td className={td}>{c.makeupDone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
