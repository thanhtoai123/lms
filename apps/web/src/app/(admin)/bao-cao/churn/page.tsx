import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { ReportFilter, Kpi, HBar, Section, th, td, fmtMonth } from "@/components/report-ui";
import { CsvButton } from "@/components/csv-button";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Báo cáo rời bỏ" };

type SP = { from?: string; to?: string; center?: string };
const todayVN = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const UUID = /^[0-9a-f-]{36}$/i;
const fmtDate = (s: string) => new Date(s).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

function churnCls(v: number) {
  return v >= 8 ? "bg-red-100 text-red-700" : v >= 4 ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800";
}

export default async function ChurnReportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "report:read")) return <NoAccess title="Báo cáo rời bỏ" perm="report:read" />;
  const centerId = sp.center && UUID.test(sp.center) ? sp.center : undefined;
  const d = await caller.reports.churn({ from: sp.from || undefined, to: sp.to || undefined, centerId });
  const t = d.totals;
  const maxReason = Math.max(1, ...d.byReason.map((r) => r.n));
  const maxCenter = Math.max(1, ...d.byCenter.map((r) => r.withdrawn));
  const maxCourse = Math.max(1, ...d.byCourse.map((r) => r.withdrawn));
  return (
    <div className="space-y-4">
      <PageHeader title="Báo cáo rời bỏ (churn)" desc="Churn tháng = số ghi danh nghỉ trong tháng / số đang học đầu tháng. Chuyển lớp không tính là nghỉ; hoàn thành khoá được tách riêng." />
      <ReportFilter basePath="/bao-cao/churn" from={d.range.from} to={d.range.to} centerId={d.centerId} centers={d.centers} today={todayVN()} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Nghỉ học trong kỳ" value={t.withdrawn} tone={t.withdrawn ? "bad" : "default"} />
        <Kpi label="Churn TB / tháng" value={`${t.avgChurn}%`} tone={t.avgChurn >= 8 ? "bad" : t.avgChurn >= 4 ? "warn" : "good"} />
        <Kpi label="Nghỉ sớm (≤4 buổi)" value={t.early} tone={t.early ? "warn" : "default"} hint={`${t.earlyShare}% số nghỉ`} />
        <Kpi label="Ghi danh mới" value={t.newEnroll} tone="good" />
        <Kpi label="Bảo lưu" value={t.paused} />
        <Kpi label="Chuyển lớp" value={t.transferred} />
      </div>
      <Section title="Theo tháng" desc="Ròng = ghi danh mới − nghỉ − hoàn thành."
        actions={<CsvButton filename={`churn_${d.range.from}_${d.range.to}`} headers={["Tháng", "Đang học đầu tháng", "Ghi danh mới", "Nghỉ", "Hoàn thành", "Bảo lưu", "Chuyển lớp", "Churn %", "Ròng"]}
          rows={d.byMonth.map((m) => [m.month, m.active_start, m.new_enroll, m.withdrawn, m.completed, m.paused, m.transferred, m.churn, m.net])} />}>
        <table className="w-full text-sm">
          <thead><tr><th className={th}>Tháng</th><th className={th}>Đầu tháng</th><th className={th}>Mới</th><th className={th}>Nghỉ</th><th className={th}>Hoàn thành</th><th className={th}>Bảo lưu</th><th className={th}>Chuyển lớp</th><th className={th}>Churn</th><th className={th}>Ròng</th></tr></thead>
          <tbody className="divide-y divide-black/5">
            {d.byMonth.map((m) => (
              <tr key={m.month}>
                <td className="p-3 font-medium">{fmtMonth(m.month)}</td>
                <td className={td}>{m.active_start}</td>
                <td className={td}>{m.new_enroll}</td>
                <td className={`${td} ${m.withdrawn ? "text-red-700" : "text-ink-400"}`}>{m.withdrawn}</td>
                <td className={td}>{m.completed}</td>
                <td className={td}>{m.paused}</td>
                <td className={td}>{m.transferred}</td>
                <td className={td}><span className={`chip tabular-nums ${churnCls(m.churn)}`}>{m.churn}%</span></td>
                <td className={`${td} font-semibold ${m.net < 0 ? "text-red-700" : "text-green-700"}`}>{m.net > 0 ? `+${m.net}` : m.net}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Lý do nghỉ" desc="Nhóm tự động theo từ khoá trong lý do ghi nhận.">
          {d.byReason.length === 0 ? <div className="p-4"><Empty>Không có.</Empty></div> : (
            <ul className="space-y-2 p-4 text-sm">
              {d.byReason.map((r) => <li key={r.key}><div className="flex justify-between"><span>{r.label}</span><span className="tabular-nums font-semibold">{r.n}</span></div><HBar value={r.n} max={maxReason} tone="bad" /></li>)}
            </ul>
          )}
        </Section>
        <Section title="Theo cơ sở">
          {d.byCenter.length === 0 ? <div className="p-4"><Empty>Không có.</Empty></div> : (
            <ul className="space-y-2 p-4 text-sm">
              {d.byCenter.map((c) => <li key={c.id}><div className="flex justify-between"><span><span className="font-mono text-xs">{c.code}</span> {c.name}</span><span className="tabular-nums font-semibold">{c.withdrawn}</span></div><HBar value={c.withdrawn} max={maxCenter} tone="warn" /></li>)}
            </ul>
          )}
        </Section>
        <Section title="Theo khoá học">
          {d.byCourse.length === 0 ? <div className="p-4"><Empty>Không có.</Empty></div> : (
            <ul className="space-y-2 p-4 text-sm">
              {d.byCourse.map((c) => <li key={c.course}><div className="flex justify-between"><span className="font-mono text-xs">{c.course}</span><span className="tabular-nums font-semibold">{c.withdrawn}</span></div><HBar value={c.withdrawn} max={maxCourse} tone="warn" /></li>)}
            </ul>
          )}
        </Section>
      </div>
      <Section title="Học viên nghỉ gần đây" desc="Tối đa 50 lượt mới nhất trong kỳ. Nghỉ sớm = có mặt ≤ 4 buổi — nên rà soát chất lượng buổi đầu."
        actions={<CsvButton filename={`hv-nghi_${d.range.from}_${d.range.to}`} headers={["Học viên", "Lớp", "Cơ sở", "Khoá", "Ngày nghỉ", "Buổi đã học", "Gói buổi", "Lý do"]}
          rows={d.leavers.map((l) => [l.student, l.class_code, l.center_code, l.course, l.ended_at.slice(0, 10), l.sessions_attended, l.package_sessions, l.reason ?? ""])} />}>
        {d.leavers.length === 0 ? <div className="p-4"><Empty>Không có học viên nghỉ trong kỳ.</Empty></div> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Học viên</th><th className={th}>Lớp</th><th className={th}>Ngày nghỉ</th><th className={th}>Đã học</th><th className={th}>Lý do</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.leavers.map((l) => (
                <tr key={l.id}>
                  <td className="p-3"><Link href={`/students/${l.student_id}`} className="font-medium text-brand-600">{l.student}</Link></td>
                  <td className="p-3 text-xs"><span className="font-mono font-semibold">{l.class_code}</span><div className="text-ink-400">{l.center_code} · {l.course}</div></td>
                  <td className="p-3 text-xs">{fmtDate(l.ended_at)}</td>
                  <td className={td}>{l.sessions_attended}/{l.package_sessions}{l.sessions_attended <= 4 && <span className="chip ml-1 bg-amber-100 text-amber-800">sớm</span>}</td>
                  <td className="p-3 text-xs text-ink-600">{l.reason ?? <span className="text-ink-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
