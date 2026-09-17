import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { ReportFilter, Kpi, HBar, RateChip, Section, th, td, fmtMonth } from "@/components/report-ui";
import { CsvButton } from "@/components/csv-button";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Báo cáo cohort" };

type SP = { from?: string; to?: string; center?: string; course?: string };
const todayVN = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const UUID = /^[0-9a-f-]{36}$/i;

function curveCls(v: number) {
  if (v >= 90) return "bg-green-100 text-green-800";
  if (v >= 75) return "bg-green-50 text-green-700";
  if (v >= 60) return "bg-amber-50 text-amber-800";
  return "bg-red-50 text-red-700";
}

export default async function CohortReportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "report:read")) return <NoAccess title="Báo cáo cohort" perm="report:read" />;
  const courseId = sp.course && UUID.test(sp.course) ? sp.course : undefined;
  const centerId = sp.center && UUID.test(sp.center) ? sp.center : undefined;
  const d = await caller.reports.cohort({ from: sp.from || undefined, to: sp.to || undefined, centerId, courseId });
  const t = d.totals;
  const cols = Array.from({ length: d.maxCurve }, (_, k) => k);
  const maxSize = Math.max(1, ...d.byCourse.map((c) => c.size));
  return (
    <div className="space-y-4">
      <PageHeader title="Báo cáo cohort" desc="Nhóm ghi danh theo tháng nhập học (không tính lượt chuyển lớp). Tỉ lệ giữ chân = hoàn thành + đang học + bảo lưu + đã chuyển lớp trên tổng; đường cong cho biết % còn lại sau M0…M6." />
      <ReportFilter basePath="/bao-cao/cohort" from={d.range.from} to={d.range.to} centerId={d.centerId} centers={d.centers} today={todayVN()} extraParams={{ course: d.courseId }}
        extra={<label className="text-xs text-ink-600">Khoá học
          <select name="course" defaultValue={d.courseId ?? ""} className="input mt-1 !py-1.5 min-w-[140px]">
            <option value="">Tất cả khoá</option>
            {d.courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
          </select>
        </label>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Lượt ghi danh mới" value={t.size} />
        <Kpi label="Đang học / bảo lưu" value={`${t.active} / ${t.paused}`} />
        <Kpi label="Hoàn thành" value={t.completed} tone="good" hint={`${t.completionRate}%`} />
        <Kpi label="Nghỉ học" value={t.withdrawn} tone={t.withdrawn ? "bad" : "default"} hint={`${t.withdrawRate}%`} />
        <Kpi label="Chuyển lớp" value={t.transferred} />
        <Kpi label="Giữ chân" value={`${t.retention}%`} tone={t.retention >= 80 ? "good" : "warn"} />
      </div>
      <Section title="Theo tháng nhập học" desc="Ô Mk = % học viên của cohort chưa nghỉ tính đến cuối tháng thứ k sau khi nhập học (tối đa 6 tháng, chỉ tính tới tháng hiện tại)."
        actions={<CsvButton filename={`cohort_${d.range.from}_${d.range.to}`} headers={["Tháng", "Số HV", "Đang học", "Bảo lưu", "Hoàn thành", "Nghỉ", "Chuyển lớp", "Giữ chân %", ...cols.map((k) => `M${k} %`)]}
          rows={d.byMonth.map((m) => [m.month, m.size, m.active, m.paused, m.completed, m.withdrawn, m.transferred, m.retention, ...cols.map((k) => m.curve[k] ?? "")])} />}>
        {d.byMonth.length === 0 ? <div className="p-4"><Empty>Không có ghi danh mới trong kỳ.</Empty></div> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Tháng</th><th className={th}>HV</th><th className={th}>Đang học</th><th className={th}>Hoàn thành</th><th className={th}>Nghỉ</th><th className={th}>Giữ chân</th>{cols.map((k) => <th key={k} className={`${th} text-center`}>M{k}</th>)}</tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.byMonth.map((m) => (
                <tr key={m.month}>
                  <td className="p-3 font-medium">{fmtMonth(m.month)}</td>
                  <td className={td}>{m.size}</td>
                  <td className={td}>{m.active}{m.paused ? <span className="text-xs text-ink-400"> · BL {m.paused}</span> : null}</td>
                  <td className={td}>{m.completed}</td>
                  <td className={`${td} ${m.withdrawn ? "text-red-700" : "text-ink-400"}`}>{m.withdrawn}</td>
                  <td className={td}><RateChip value={m.retention} /></td>
                  {cols.map((k) => <td key={k} className="p-1 text-center">{m.curve[k] === undefined ? <span className="text-ink-300">·</span> : <span className={`inline-block min-w-[3rem] rounded px-1.5 py-1 text-xs tabular-nums ${curveCls(m.curve[k]!)}`}>{m.curve[k]}%</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <Section title="Theo khoá học" actions={<CsvButton filename={`cohort-khoa_${d.range.from}_${d.range.to}`} headers={["Khoá", "Số HV", "Hoàn thành", "Nghỉ", "Tỉ lệ hoàn thành %", "Tỉ lệ nghỉ %", "Giữ chân %"]} rows={d.byCourse.map((c) => [c.course, c.size, c.completed, c.withdrawn, c.completionRate, c.withdrawRate, c.retention])} />}>
        {d.byCourse.length === 0 ? <div className="p-4"><Empty>Chưa có dữ liệu.</Empty></div> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Khoá</th><th className={th}>HV</th><th className={th}>Quy mô</th><th className={th}>Hoàn thành</th><th className={th}>Nghỉ</th><th className={th}>Giữ chân</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.byCourse.map((c) => (
                <tr key={c.course}>
                  <td className="p-3 font-mono text-xs font-semibold">{c.course}</td>
                  <td className={td}>{c.size}</td>
                  <td className="p-3 min-w-[120px]"><HBar value={c.size} max={maxSize} /></td>
                  <td className={td}>{c.completed} <span className="text-xs text-ink-400">({c.completionRate}%)</span></td>
                  <td className={`${td} ${c.withdrawn ? "text-red-700" : ""}`}>{c.withdrawn} <span className="text-xs text-ink-400">({c.withdrawRate}%)</span></td>
                  <td className={td}><RateChip value={c.retention} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
