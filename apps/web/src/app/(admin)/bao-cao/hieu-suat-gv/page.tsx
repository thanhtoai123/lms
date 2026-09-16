import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { ReportFilter, Kpi, RateChip, Section, th, td } from "@/components/report-ui";
import { CsvButton } from "@/components/csv-button";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hiệu suất giáo viên" };

type SP = { from?: string; to?: string; center?: string };
const todayVN = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

export default async function TeacherReportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "report:read")) return <NoAccess title="Hiệu suất giáo viên" perm="report:read" />;
  const d = await caller.reports.teachers({ from: sp.from || undefined, to: sp.to || undefined, centerId: sp.center || undefined });
  return (
    <div className="space-y-4">
      <PageHeader title="Hiệu suất giáo viên" desc="Buổi đã dạy, chốt buổi đúng hạn, tải dạy/tuần so với định mức, chuyên cần lớp, học bạ đã gửi PH và điểm TB, ảnh lớp, chốt sau học thử." />
      <ReportFilter basePath="/bao-cao/hieu-suat-gv" from={d.range.from} to={d.range.to} centerId={d.centerId} centers={d.centers} today={todayVN()} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Giáo viên có lịch" value={d.totals.teachers} />
        <Kpi label="Buổi đã dạy" value={d.totals.taught} tone="good" />
        <Kpi label="Buổi quá hạn chưa chốt" value={d.totals.overdue} tone={d.totals.overdue ? "bad" : "default"} />
        <Kpi label="Học bạ đã gửi PH" value={d.totals.reportCards} tone="brand" />
      </div>
      <Section
        title="Theo giáo viên"
        desc="Đúng hạn = buổi kế hoạch không bị quá hạn chưa chốt. Tải/tuần tính trên số buổi kế hoạch trong kỳ."
        actions={<CsvButton filename={`hieu-suat-gv_${d.range.from}_${d.range.to}`} headers={["Mã GV", "Giáo viên", "Cơ sở", "Lớp", "Buổi kế hoạch", "Đã dạy", "Huỷ/dời", "Quá hạn", "Đúng hạn %", "Tải/tuần", "Định mức/tuần", "Chuyên cần %", "Học bạ gửi duyệt", "Học bạ đã gửi PH", "Học bạ bị trả", "Điểm TB", "Ảnh tải lên", "Ảnh đã duyệt", "Học thử đã dạy", "Chốt sau học thử"]}
          rows={d.items.map((x) => [x.code, x.fullName, x.centerCode, x.classes, x.planned, x.taught, x.cancelled, x.overdue, x.onTime, x.loadPerWeek, x.maxLoad, x.attendanceRate, x.reportCards.submitted, x.reportCards.published, x.reportCards.returned, x.reportCards.avg, x.media.uploaded, x.media.approved, x.trials.attended, x.trials.converted])} />}
      >
        {d.items.length === 0 ? <div className="p-4"><Empty>Không có giáo viên có lịch dạy trong kỳ.</Empty></div> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Giáo viên</th><th className={th}>Lớp</th><th className={th}>Đã dạy / KH</th><th className={th}>Đúng hạn</th><th className={th}>Tải / tuần</th><th className={th}>Chuyên cần</th><th className={th}>Học bạ (gửi PH / trả)</th><th className={th}>Điểm TB</th><th className={th}>Ảnh (duyệt / tải)</th><th className={th}>Học thử → chốt</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((x) => (
                <tr key={x.id}>
                  <td className="p-3"><div className="font-medium">{x.fullName}</div><div className="text-xs text-ink-400">{x.code ?? ""} {x.centerCode ? `· ${x.centerCode}` : ""}</div></td>
                  <td className={td}>{x.classes}</td>
                  <td className={td}>{x.taught}/{x.planned}{x.overdue ? <div className="text-[11px] font-semibold text-red-700">{x.overdue} quá hạn</div> : null}</td>
                  <td className={td}><RateChip value={x.onTime} good={95} warn={85} /></td>
                  <td className={`${td} ${x.loadPerWeek > x.maxLoad ? "font-semibold text-red-700" : ""}`}>{x.loadPerWeek}<span className="text-xs text-ink-400"> / {x.maxLoad}</span></td>
                  <td className={td}>{x.marks ? <RateChip value={x.attendanceRate} /> : <span className="text-ink-400">—</span>}</td>
                  <td className={td}>{x.reportCards.published}<span className="text-ink-400"> / {x.reportCards.returned}</span><div className="text-[11px] text-ink-400">{x.reportCards.submitted} đã gửi duyệt</div></td>
                  <td className={td}>{x.reportCards.avg ?? "—"}</td>
                  <td className={td}>{x.media.approved}<span className="text-ink-400"> / {x.media.uploaded}</span></td>
                  <td className={td}>{x.trials.attended ? <>{x.trials.converted}/{x.trials.attended} <span className="text-xs text-ink-400">({x.trials.conversion}%)</span></> : <span className="text-ink-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
