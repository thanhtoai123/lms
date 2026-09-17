import Link from "next/link";
import { hasPermission, JOB_STATUSES, JOB_STATUS_VI, type Actor, type JobStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Kpi, Section, th, td } from "@/components/report-ui";
import { Empty } from "@/components/ui";
import { dtVN } from "@/components/care-ui";
import { JobForm } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tuyển dụng" };

const CHIP: Record<JobStatus, string> = { draft: "bg-slate-100 text-ink-600", open: "bg-green-100 text-green-800", paused: "bg-amber-100 text-amber-800", closed: "bg-slate-200 text-ink-600" };

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !hasPermission(actor, "recruit:read")) return <NoAccess title="Tuyển dụng" perm="recruit:read" />;
  const status = JOB_STATUSES.includes(sp.status as JobStatus) ? (sp.status as JobStatus) : undefined;
  const [d, rep] = await Promise.all([caller.recruit.jobs({ status, q: sp.q || undefined }), caller.recruit.report()]);
  const t = rep.totals;
  return (
    <div className="space-y-4">
      <PageHeader title="Tuyển dụng" desc="Tin tuyển dụng đăng lên trang /tuyen-dung, ứng viên nộp CV (PDF/DOCX) kèm đồng ý xử lý dữ liệu; sàng lọc → phỏng vấn (chấm điểm) → đề nghị → nhận việc tự tạo hồ sơ nhân sự. Hồ sơ không trúng tuyển tự ẩn danh sau 12 tháng."
        actions={<div className="flex gap-2"><a href="/tuyen-dung" target="_blank" className="btn-ghost">Trang tuyển dụng ↗</a>{d.canCreate && <JobForm centers={d.centers} globalCreate={d.globalCreate} />}</div>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Tin đang tuyển" value={d.items.filter((j) => j.status === "open").length} tone="brand" />
        <Kpi label="Ứng viên" value={t.total} />
        <Kpi label="Chưa xử lý" value={t.fresh} tone={t.stale ? "warn" : "default"} hint={t.stale ? `${t.stale} hồ sơ quá 3 ngày` : undefined} />
        <Kpi label="Đã nhận việc" value={t.hired} tone="good" />
        <Kpi label="Thời gian tuyển TB" value={t.days_to_hire ? `${t.days_to_hire} ngày` : "—"} />
      </div>
      {d.myInterviews.length > 0 && (
        <Section title="Lịch phỏng vấn của tôi">
          <ul className="divide-y divide-black/5 text-sm">{d.myInterviews.map((i) => <li key={i.id} className="flex justify-between p-3"><Link href={`/jobs/candidate/${i.candidateId}`} className="text-brand-600">{i.candidate} — {i.job}</Link><span className="text-xs text-ink-600">{dtVN(i.at)}</span></li>)}</ul>
        </Section>
      )}
      <Section title="Tin tuyển dụng" actions={
        <form className="flex flex-wrap gap-2 text-sm">
          <input name="q" defaultValue={sp.q} placeholder="Tên / mã tin" className="input !py-1.5 w-48" />
          <select name="status" defaultValue={status ?? ""} className="input !py-1.5 w-auto"><option value="">Mọi trạng thái</option>{JOB_STATUSES.map((s) => <option key={s} value={s}>{JOB_STATUS_VI[s]}</option>)}</select>
          <button className="btn-ghost !py-1.5">Lọc</button>
        </form>}>
        {d.items.length === 0 ? <div className="p-4"><Empty>Chưa có tin tuyển dụng.</Empty></div> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Vị trí</th><th className={th}>Cơ sở</th><th className={th}>Trạng thái</th><th className={th}>Hạn nộp</th><th className={th}>Ứng viên</th><th className={th}>Mới</th><th className={th}>Đã tuyển</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((j) => (
                <tr key={j.id} className="hover:bg-black/[0.02]">
                  <td className="p-3"><Link href={`/jobs/${j.id}`} className="font-medium text-brand-600">{j.title}</Link><div className="font-mono text-[11px] text-ink-400">{j.code} · {j.typeLabel}</div></td>
                  <td className="p-3 text-xs">{j.centerCode ?? "Toàn hệ thống"}</td>
                  <td className="p-3"><span className={`chip ${CHIP[j.status as JobStatus]}`}>{j.statusLabel}</span>{j.expired && <span className="chip ml-1 bg-red-100 text-red-700">hết hạn</span>}</td>
                  <td className="p-3 text-xs">{j.deadline?.split("-").reverse().join("/") ?? "—"}</td>
                  <td className={td}>{j.counts.total}<span className="text-xs text-ink-400"> ({j.counts.active} đang xử lý)</span></td>
                  <td className={`${td} ${j.counts.fresh ? "font-semibold text-amber-700" : "text-ink-400"}`}>{j.counts.fresh}</td>
                  <td className={td}>{j.counts.hired}/{j.openings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      {rep.bySource.length > 0 && (
        <Section title="Nguồn ứng viên">
          <ul className="flex flex-wrap gap-2 p-4 text-sm">{rep.bySource.map((s) => <li key={s.source} className="chip bg-slate-100">{s.source}: {s.n} hồ sơ · {s.hired} nhận việc</li>)}</ul>
        </Section>
      )}
    </div>
  );
}
