import Link from "next/link";
import { notFound } from "next/navigation";
import { CANDIDATE_STAGES, CANDIDATE_STAGE_VI, renderMarkdown, DEPARTMENT_VI, type CandidateStage, type Department, type EmploymentType } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { Section, th, td } from "@/components/report-ui";
import { Empty } from "@/components/ui";
import { dtVN } from "@/components/care-ui";
import { JobForm, JobStatusButtons } from "../client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tin tuyển dụng" };

export default async function JobDetailAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ stage?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { caller } = await getServerCaller();
  const stage = CANDIDATE_STAGES.includes(sp.stage as CandidateStage) ? (sp.stage as CandidateStage) : undefined;
  const [j, list] = await Promise.all([caller.recruit.job({ id, stage }), caller.recruit.jobs({})]);
  const m = (v: number) => `${Math.round(v / 1e5) / 10} tr`;
  return (
    <div className="space-y-4">
      <PageHeader title={j.title} desc={`${j.code} · ${j.center ? `${j.center.code} — ${j.center.name}` : "Toàn hệ thống"} · ${DEPARTMENT_VI[j.department as Department] ?? j.department} · ${j.typeLabel} · ${j.openings} người`}
        actions={<div className="flex flex-wrap gap-2"><Link href="/jobs" className="btn-ghost">← Danh sách</Link>{j.status === "open" && <a href={`/tuyen-dung/${j.slug}`} target="_blank" className="btn-ghost">Xem trang công khai ↗</a>}{j.canEdit && j.status !== "closed" && <JobForm centers={list.centers} globalCreate={list.globalCreate} job={{ id: j.id, title: j.title, centerId: j.centerId, department: j.department as Department, employmentType: j.employmentType as EmploymentType, openings: j.openings, salaryMin: j.salaryMin, salaryMax: j.salaryMax, salaryText: j.salaryText, description: j.description, requirements: j.requirements, benefits: j.benefits, deadline: j.deadline }} />}{j.canEdit && <JobStatusButtons id={j.id} status={j.status} />}</div>} />
      <div className="flex flex-wrap gap-1 text-xs">
        <Link href={`/jobs/${j.id}`} className={`rounded-full border px-2.5 py-1 ${!stage ? "border-brand-500 bg-brand-50" : "border-black/10"}`}>Tất cả ({Object.values(j.counts).reduce((a, b) => a + b, 0)})</Link>
        {CANDIDATE_STAGES.map((s) => <Link key={s} href={`/jobs/${j.id}?stage=${s}`} className={`rounded-full border px-2.5 py-1 ${stage === s ? "border-brand-500 bg-brand-50" : "border-black/10"}`}>{CANDIDATE_STAGE_VI[s]} ({j.counts[s] ?? 0})</Link>)}
      </div>
      <Section title="Ứng viên">
        {j.candidates.length === 0 ? <div className="p-4"><Empty>Chưa có ứng viên.</Empty></div> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Ứng viên</th><th className={th}>Nguồn</th><th className={th}>Giai đoạn</th><th className={th}>Phỏng vấn</th><th className={th}>Phụ trách</th><th className={th}>Nộp lúc</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {j.candidates.map((c) => (
                <tr key={c.id}>
                  <td className="p-3"><Link href={`/jobs/candidate/${c.id}`} className="font-medium text-brand-600">{c.fullName}</Link><div className="text-xs text-ink-400">{c.phone}{c.hasCv ? " · có CV" : ""}</div></td>
                  <td className="p-3 text-xs">{c.source}</td>
                  <td className="p-3 text-xs">{c.stageLabel}</td>
                  <td className={td}>{c.interviews}{c.avgScore !== null ? <span className="text-xs text-ink-600"> · TB {c.avgScore}/5</span> : null}</td>
                  <td className="p-3 text-xs">{c.owner ?? "—"}</td>
                  <td className="p-3 text-xs">{dtVN(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <Section title="Nội dung tin">
        <div className="grid gap-4 p-4 text-sm md:grid-cols-3">
          <div className="md:col-span-2"><div className="sr-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(j.description) }} />{j.requirements && <><h3 className="mt-3 font-semibold">Yêu cầu</h3><div className="sr-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(j.requirements) }} /></>}</div>
          <div className="space-y-1 text-xs text-ink-600">
            <div>Lương: {j.salaryText ?? (j.salaryMin ? `${m(j.salaryMin)}${j.salaryMax ? ` – ${m(j.salaryMax)}` : "+"}` : "Thoả thuận")}</div>
            <div>Hạn nộp: {j.deadline?.split("-").reverse().join("/") ?? "không giới hạn"}</div>
            <div>Đăng: {j.openedAt ? dtVN(j.openedAt) : "chưa"}</div>
            {j.benefits && <div className="sr-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(j.benefits) }} />}
          </div>
        </div>
      </Section>
    </div>
  );
}
