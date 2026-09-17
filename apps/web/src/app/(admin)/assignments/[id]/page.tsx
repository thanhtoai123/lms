import Link from "next/link";
import { type SubmissionType } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { Kpi } from "@/components/report-ui";
import { dtVN } from "@/components/care-ui";
import { OpenDocButton } from "@/components/content-ui";
import { AssignmentForm } from "../form";
import { AssignmentActions, SubmissionRow } from "./grading";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bài tập" };

export default async function AssignmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller } = await getServerCaller();
  const a = await caller.content.assignment({ id });
  const st = a.stats;
  return (
    <div className="space-y-4">
      <Link href={`/assignments?class=${a.class.id}`} className="text-sm text-ink-600">← Bài tập lớp {a.class.code}</Link>
      <PageHeader
        title={a.title}
        desc={`${a.class.code} — ${a.class.name}${a.sessionSeq ? ` · buổi ${a.sessionSeq}` : ""} · ${a.typeLabel} · thang ${a.maxScore}${a.coinReward ? ` · +${a.coinReward} xu khi đạt ≥ 80%` : ""} · hạn ${dtVN(a.dueAt)}${a.allowLate ? " (nhận muộn)" : ""}`}
        actions={<div className="flex flex-wrap items-center gap-2"><span className="chip bg-black/5">{a.statusLabel}</span>{a.canEdit && a.status !== "closed" && <AssignmentForm classes={[a.class]} draft={{ id: a.id, classId: a.classId, sessionId: a.sessionId, templateId: a.templateId, title: a.title, instructions: a.instructions, submissionType: a.submissionType as SubmissionType, maxScore: a.maxScore, dueAt: a.dueAt.toISOString(), allowLate: a.allowLate, coinReward: a.coinReward, documentIds: a.documentIds }} />}</div>}
      />
      <section className="card space-y-2 p-4 text-sm">
        <p className="whitespace-pre-line">{a.instructions}</p>
        {a.docs.length > 0 && <div className="flex flex-wrap gap-3 text-xs">Tài liệu: {a.docs.map((d) => <span key={d.id}>{d.title} <OpenDocButton id={d.id} kind={d.kind} /></span>)}</div>}
      </section>
      {a.canEdit && <AssignmentActions id={a.id} status={a.status} missingFromRoster={a.missingFromRoster} />}
      {a.status !== "draft" && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi label="Đã nộp" value={`${st.turnedIn}/${st.total}`} hint={`${st.rate}%`} tone={st.rate >= 80 ? "good" : st.rate >= 50 ? "warn" : "bad"} />
          <Kpi label="Chờ chấm" value={st.pending} tone={st.pending ? "warn" : "default"} />
          <Kpi label="Đã chấm" value={st.graded} hint={st.avg !== null ? `TB ${st.avg}/${a.maxScore}` : undefined} />
          <Kpi label="Nộp muộn" value={st.late} />
          <Kpi label="Không nộp" value={st.missing} tone={st.missing ? "bad" : "default"} />
        </div>
      )}
      {a.status === "draft" ? <p className="card p-4 text-sm text-ink-600">Bài đang ở trạng thái nháp — bấm <b>Giao bài</b> để tạo danh sách {a.rosterSize} học viên và gửi thông báo cho phụ huynh.</p> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Học viên</th><th className="p-3">Bài nộp</th><th className="p-3">Trạng thái</th><th className="p-3">Chấm / xử lý</th></tr></thead>
            <tbody className="divide-y divide-black/5 align-top">
              {a.submissions.map((s) => (
                <SubmissionRow key={s.id} s={{ ...s, submittedAt: s.submittedAt?.toISOString() ?? null, gradedAt: s.gradedAt?.toISOString() ?? null }} maxScore={a.maxScore} canGrade={a.canGrade} submissionType={a.submissionType as SubmissionType} closed={a.status === "closed"} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
