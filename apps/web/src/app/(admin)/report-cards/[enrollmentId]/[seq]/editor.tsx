"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { averageScore, scoreLabel, TREND_VI, type ReportCardStatus, type MilestoneAggregate } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { ErrorBox, OkBox } from "@/components/admin-ui";

type Crit = { id: string; name: string; description: string | null; isActive: boolean };
type Init = { status: ReportCardStatus | null; cardId: string | null; teacherComment: string; strengths: string; improvements: string; scores: Record<string, { score: number | null; comment: string }> };

export function ReportCardEditor({
  enrollmentId, seq, criteria, initial, canWrite, canApprove, scale = 5, aggregate = null, prefill = {}, suggestedComment = null,
}: {
  enrollmentId: string; seq: number; criteria: Crit[]; initial: Init; canWrite: boolean; canApprove: boolean;
  /** 4 = học bạ mốc tổng hợp từ phiếu buổi (rubric 4 mức); 5 = học bạ cũ */
  scale?: number;
  aggregate?: MilestoneAggregate | null;
  prefill?: Record<string, number>;
  suggestedComment?: string | null;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const editable = canWrite && (initial.status === null || initial.status === "draft" || initial.status === "returned");
  const [scores, setScores] = useState(initial.scores);
  const [comment, setComment] = useState(initial.teacherComment);
  const [strengths, setStrengths] = useState(initial.strengths);
  const [improvements, setImprovements] = useState(initial.improvements);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = (m: string) => { setMsg(m); setError(null); router.refresh(); };
  const save = useMutation(trpc.learning.saveReportCard.mutationOptions({ onSuccess: (_r, v) => done(v.submit ? "Đã gửi duyệt." : "Đã lưu nháp."), onError: (e) => setError(e.message) }));
  const review = useMutation(trpc.learning.reviewReportCard.mutationOptions({ onSuccess: (r) => done(r.status === "published" ? "Đã gửi học bạ cho phụ huynh." : r.status === "approved" ? "Đã duyệt." : "Đã trả lại cho giáo viên."), onError: (e) => setError(e.message) }));
  const avg = averageScore(criteria.map((c) => scores[c.id]?.score ?? null));
  const payload = (submit: boolean) => ({
    enrollmentId, milestoneSeq: seq, submit,
    scores: criteria.map((c) => ({ criterionId: c.id, score: scores[c.id]?.score ?? null, comment: scores[c.id]?.comment || null })),
    teacherComment: comment || null, strengths: strengths || null, improvements: improvements || null,
  });

  if (criteria.length === 0) return <div className="card p-5 text-sm">Khoá chưa có tiêu chí năng lực. <Link href="/report-cards/criteria" className="text-brand-600 underline">Cấu hình tiêu chí</Link></div>;
  const aggOf = (id: string) => aggregate?.criteria.find((c) => c.criterionId === id) ?? null;
  const applyPrefill = () => {
    const next = { ...scores };
    for (const [k, v] of Object.entries(prefill)) next[k] = { score: v, comment: next[k]?.comment ?? "" };
    setScores(next);
  };

  return (
    <div className="space-y-4">
      {aggregate && (
        <section className="card space-y-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">Tổng hợp từ phiếu nhận xét buổi <span className="text-sm font-normal text-ink-400">(buổi {aggregate.period.fromSeq}–{aggregate.period.toSeq})</span></h2>
            {editable && scale === 4 && Object.keys(prefill).length > 0 && <button type="button" className="btn-ghost !py-1 text-xs" onClick={applyPrefill}>Điền lại theo phiếu buổi</button>}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-lg bg-brand-50 p-2"><div className="text-[11px] text-ink-600">Phiếu buổi</div><b>{aggregate.sessions}</b></div>
            <div className="rounded-lg bg-brand-50 p-2"><div className="text-[11px] text-ink-600">Chuyên cần</div><b>{aggregate.attendance.attended}/{aggregate.attendance.total}</b></div>
            <div className="rounded-lg bg-brand-50 p-2"><div className="text-[11px] text-ink-600">Đạt mục tiêu bài</div><b>{aggregate.objective.rate == null ? "—" : `${Math.round(aggregate.objective.rate * 100)}%`}</b></div>
            <div className="rounded-lg bg-brand-50 p-2"><div className="text-[11px] text-ink-600">TB giai đoạn</div><b>{aggregate.overall.average ?? "—"}/4</b>{aggregate.overall.trend && <span className="ml-1 text-xs">({TREND_VI[aggregate.overall.trend]})</span>}</div>
          </div>
          {aggregate.topHighlights.length > 0 && <p className="text-xs text-ink-600">Nổi bật: {aggregate.topHighlights.map((h) => `${h.label} (${h.count})`).join(", ")}</p>}
          {aggregate.sessions === 0 && <p className="text-xs text-amber-800">Chưa có phiếu nhận xét buổi nào được phát hành trong giai đoạn này — chấm tay như trước.</p>}
          {scale === 5 && <p className="text-xs text-ink-600">Học bạ này tạo trước khi có phiếu buổi nên giữ thang 5 mức; số liệu trên chỉ để tham khảo.</p>}
          {(suggestedComment || aggregate.remarkSuggestions.length > 0) && editable && (
            <div className="space-y-1 rounded-lg border border-dashed border-brand-300 p-2 text-xs">
              <div className="font-semibold text-ink-600">Gợi ý nhận xét (chạm để chèn vào nhận xét chung)</div>
              {[suggestedComment, ...aggregate.remarkSuggestions].filter((x): x is string => !!x).map((t, i) => (
                <button key={i} type="button" className="block w-full rounded bg-black/[0.03] px-2 py-1 text-left hover:bg-brand-50" onClick={() => setComment((c) => (c.trim() ? `${c.trim()}\n${t}` : t))}>{t}</button>
              ))}
            </div>
          )}
        </section>
      )}
      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between p-4 pb-2"><h2 className="font-bold">Đánh giá theo tiêu chí <span className="text-xs font-normal text-ink-400">(thang {scale} mức)</span></h2><span className="text-sm">Điểm TB: <b className="text-brand-700">{avg ?? "—"}</b>/{scale}</span></div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-black/5">
            {criteria.map((c) => {
              const v = scores[c.id]?.score ?? null;
              return (
                <tr key={c.id} className={c.isActive ? "" : "opacity-60"}>
                  <td className="p-3 align-top">
                    <div className="font-medium">{c.name}</div>{c.description && <div className="text-xs text-ink-400">{c.description}</div>}
                    {aggOf(c.id)?.average != null && <div className="mt-0.5 text-[11px] text-brand-700">TB phiếu buổi {aggOf(c.id)?.average}/4{aggOf(c.id)?.trend ? ` · ${TREND_VI[aggOf(c.id)!.trend!]}` : ""}</div>}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {Array.from({ length: scale }, (_, i) => i + 1).map((n) => (
                        <button key={n} type="button" disabled={!editable} title={scoreLabel(n, scale)} onClick={() => setScores({ ...scores, [c.id]: { score: n, comment: scores[c.id]?.comment ?? "" } })}
                          className={`h-9 min-w-9 rounded-lg px-2 text-sm font-bold ${v === n ? "bg-brand-600 text-white" : "bg-black/5 text-ink-600"} ${editable ? "hover:bg-brand-600/20" : ""}`}>{n}</button>
                      ))}
                    </div>
                    <div className="mt-1 text-[11px] text-ink-400">{v ? scoreLabel(v, scale) : "chưa chấm"}</div>
                  </td>
                  <td className="p-3"><input className="input text-xs" disabled={!editable} placeholder="Ghi chú tiêu chí" value={scores[c.id]?.comment ?? ""} onChange={(e) => setScores({ ...scores, [c.id]: { score: v, comment: e.target.value } })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section className="card grid gap-3 p-4 md:grid-cols-2">
        <div className="md:col-span-2"><label className="label">Nhận xét chung của giáo viên * (tối thiểu 20 ký tự)</label><textarea className="input min-h-28" disabled={!editable} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
        <div><label className="label">Điểm mạnh</label><textarea className="input min-h-20" disabled={!editable} value={strengths} onChange={(e) => setStrengths(e.target.value)} /></div>
        <div><label className="label">Cần cải thiện</label><textarea className="input min-h-20" disabled={!editable} value={improvements} onChange={(e) => setImprovements(e.target.value)} /></div>
      </section>
      {msg && <OkBox>{msg}</OkBox>}
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex flex-wrap items-end gap-2">
        {editable && (
          <>
            <button className="btn-ghost" disabled={save.isPending} onClick={() => save.mutate(payload(false))}>Lưu nháp</button>
            <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate(payload(true))}>Gửi duyệt</button>
          </>
        )}
        {canApprove && initial.cardId && (initial.status === "submitted" || initial.status === "approved") && (
          <>
            {initial.status === "submitted" && <button className="btn-primary" disabled={review.isPending} onClick={() => review.mutate({ id: initial.cardId!, action: "approve" })}>Duyệt</button>}
            {initial.status === "approved" && <button className="btn-primary" disabled={review.isPending} onClick={() => review.mutate({ id: initial.cardId!, action: "publish" })}>Gửi phụ huynh</button>}
            <input className="input max-w-xs" placeholder="Lý do trả lại" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="btn-ghost text-red-700" disabled={review.isPending} onClick={() => review.mutate({ id: initial.cardId!, action: "return", reason })}>Trả lại</button>
          </>
        )}
      </div>
    </div>
  );
}
