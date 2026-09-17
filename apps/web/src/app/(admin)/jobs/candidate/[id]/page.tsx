import Link from "next/link";
import { notFound } from "next/navigation";
import type { Department } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { Section } from "@/components/report-ui";
import { dtVN } from "@/components/care-ui";
import { StageMover, ScheduleInterview, ScoreForm, CancelInterview, HireForm, RevealContact } from "../../client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ứng viên" };

const ACTION_VI: Record<string, string> = { applied: "Nộp hồ sơ", reapply: "Nộp lại", stage: "Chuyển giai đoạn", interview: "Xếp phỏng vấn", interview_cancel: "Huỷ phỏng vấn", score: "Chấm phỏng vấn" };

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { caller } = await getServerCaller();
  const c = await caller.recruit.candidate({ id });
  const centers = c.can.hire ? (await caller.recruit.jobs({})).centers : [];
  return (
    <div className="space-y-4">
      <PageHeader title={c.fullName} desc={`${c.job.title} (${c.job.code}) · ${c.stageLabel}`} actions={<Link href={`/jobs/${c.job.id}`} className="btn-ghost">← Tin tuyển dụng</Link>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card space-y-2 p-4 text-sm lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2"><span className="chip bg-brand-50 text-brand-700">{c.stageLabel}</span>{c.stageReason && <span className="text-xs text-ink-600">{c.stageReason}</span>}{c.anonymized && <span className="chip bg-slate-200">đã ẩn danh</span>}</div>
          <div>Liên hệ: {c.phone}{c.email ? ` · ${c.email}` : ""} {!c.can.manage && !c.anonymized && <RevealContact id={c.id} />}</div>
          <div className="text-xs text-ink-600">Nguồn: {c.source} · nộp {dtVN(c.createdAt)} · đồng ý xử lý dữ liệu {dtVN(c.consentAt)}</div>
          {c.coverNote && <p className="whitespace-pre-wrap rounded bg-black/[0.03] p-3">{c.coverNote}</p>}
          {c.cvUrl ? <a href={c.cvUrl} target="_blank" rel="noreferrer" className="btn-ghost inline-block">Xem CV (liên kết 10 phút)</a> : <p className="text-xs text-ink-400">Không có CV</p>}
          {c.hiredStaffId && <Link href={`/nhan-su/${c.hiredStaffId}`} className="block text-brand-600">→ Hồ sơ nhân sự</Link>}
          {c.can.manage && <div className="border-t border-black/5 pt-3"><StageMover id={c.id} next={c.nextStages} /></div>}
          {c.can.hire && <div className="border-t border-black/5 pt-3"><h3 className="mb-2 font-semibold">Nhận việc</h3><HireForm id={c.id} centers={centers} defaultCenter={c.job.centerId} defaultTitle={c.job.title} defaultDept={c.job.department as Department} /></div>}
        </div>
        <div className="card p-4 text-sm">
          <h3 className="mb-2 font-semibold">Lịch sử</h3>
          <ol className="space-y-2 text-xs">{c.events.map((e) => <li key={e.id}><span className="font-medium">{ACTION_VI[e.action] ?? e.action}</span> · {e.by ?? "Ứng viên"} · <span className="text-ink-400">{dtVN(e.createdAt)}</span>{e.note && <div className="text-ink-600">{e.note}</div>}</li>)}</ol>
        </div>
      </div>
      <Section title="Phỏng vấn">
        <div className="space-y-3 p-4 text-sm">
          {c.interviews.length === 0 && <p className="text-ink-400">Chưa có buổi phỏng vấn.</p>}
          {c.interviews.map((i) => (
            <div key={i.id} className="rounded-lg border border-black/5 p-3">
              <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{dtVN(i.scheduledAt)} · {i.durationMin} phút · {i.by}</span><span className="text-xs">{i.cancelledAt ? "Đã huỷ" : i.scoredAt ? `${i.score}/5 — ${i.resultLabel}` : "Chưa chấm"}</span></div>
              {i.location && <div className="text-xs text-ink-600">{i.location}</div>}
              {i.feedback && <p className="mt-1 whitespace-pre-wrap text-xs">{i.feedback}</p>}
              {i.canScore && !i.scoredAt && <ScoreForm id={i.id} />}
              {c.can.manage && !i.scoredAt && !i.cancelledAt && <CancelInterview id={i.id} />}
            </div>
          ))}
          {c.can.manage && ["applied", "screening", "interview"].includes(c.stage) && c.interviewers.length > 0 && <div className="border-t border-black/5 pt-3"><ScheduleInterview candidateId={c.id} interviewers={c.interviewers} /></div>}
        </div>
      </Section>
    </div>
  );
}
