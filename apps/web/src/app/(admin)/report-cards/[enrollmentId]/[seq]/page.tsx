import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { ReportCardChip } from "@/components/admin-ui";
import { ReportCardEditor } from "./editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Học bạ" };

export default async function ReportCardPage({ params }: { params: Promise<{ enrollmentId: string; seq: string }> }) {
  const { enrollmentId, seq } = await params;
  const n = Number(seq);
  if (!Number.isInteger(n) || n < 1 || !/^[0-9a-f-]{36}$/.test(enrollmentId)) notFound();
  const { caller, ctx } = await getServerCaller();
  const d = await caller.learning.reportCard({ enrollmentId, milestoneSeq: n });
  const actor = ctx.actor as Actor;
  return (
    <div className="max-w-4xl space-y-4">
      <Link href={`/ho-so-hoc-tap?xem=hoc-ba-moc&class=${d.class.id}`} className="text-sm text-ink-600">← Học bạ mốc lớp {d.class.code}</Link>
      <header className="card flex flex-wrap items-start justify-between gap-3 p-5">
        <div>
          <h1 className="text-xl font-bold">{d.enrollment.studentName}</h1>
          <div className="text-sm text-ink-600">{d.label} · {d.class.name} · {d.class.courseCode}</div>
          <div className="text-xs text-ink-400">Chuyên cần đến mốc: {d.attendance.attended}/{d.attendance.total} buổi{d.authorName ? ` · Người viết: ${d.authorName}` : ""} · Thang {d.scale} mức</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {d.card ? <ReportCardChip status={d.card.status} /> : <span className="chip bg-red-50 text-red-700">Chưa viết</span>}
          {d.card && <Link href={`/hoc-ba-moc/${d.card.id}`} className="text-xs font-semibold text-brand-600">In học bạ</Link>}
          <Link href={`/ho-so-hoc-tap/${d.enrollment.studentId}?enrollmentId=${d.enrollment.id}`} className="text-xs text-ink-600">Hồ sơ học tập khoá này</Link>
        </div>
      </header>
      {d.card?.status === "returned" && d.card.returnReason && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">Giáo vụ trả lại: {d.card.returnReason}</div>}
      <ReportCardEditor
        enrollmentId={enrollmentId}
        seq={n}
        criteria={d.criteria.map((c) => ({ id: c.id, name: c.name, description: c.description, isActive: c.isActive }))}
        initial={{
          status: d.card?.status ?? null,
          cardId: d.card?.id ?? null,
          teacherComment: d.card?.teacherComment ?? "",
          strengths: d.card?.strengths ?? "",
          improvements: d.card?.improvements ?? "",
          // Học bạ mới chưa có điểm: điền sẵn trung bình các phiếu buổi của giai đoạn (GV chỉ xác nhận / chỉnh)
          scores: d.scores.length
            ? Object.fromEntries(d.scores.map((s) => [s.criterionId, { score: s.score, comment: s.comment ?? "" }]))
            : Object.fromEntries(Object.entries(d.prefill).map(([k, v]) => [k, { score: v, comment: "" }])),
        }}
        scale={d.scale}
        aggregate={d.aggregate}
        prefill={d.prefill}
        suggestedComment={d.suggestedComment}
        canWrite={hasPermission(actor, "report_card:write")}
        canApprove={hasPermission(actor, "report_card:approve")}
      />
    </div>
  );
}
