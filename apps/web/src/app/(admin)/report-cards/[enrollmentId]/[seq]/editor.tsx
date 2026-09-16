"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { SCORE_VI, averageScore, type ReportCardStatus } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { ErrorBox, OkBox } from "@/components/admin-ui";

type Crit = { id: string; name: string; description: string | null; isActive: boolean };
type Init = { status: ReportCardStatus | null; cardId: string | null; teacherComment: string; strengths: string; improvements: string; scores: Record<string, { score: number | null; comment: string }> };

export function ReportCardEditor({ enrollmentId, seq, criteria, initial, canWrite, canApprove }: { enrollmentId: string; seq: number; criteria: Crit[]; initial: Init; canWrite: boolean; canApprove: boolean }) {
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

  return (
    <div className="space-y-4">
      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between p-4 pb-2"><h2 className="font-bold">Đánh giá theo tiêu chí</h2><span className="text-sm">Điểm TB: <b className="text-brand-700">{avg ?? "—"}</b></span></div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-black/5">
            {criteria.map((c) => {
              const v = scores[c.id]?.score ?? null;
              return (
                <tr key={c.id} className={c.isActive ? "" : "opacity-60"}>
                  <td className="p-3 align-top"><div className="font-medium">{c.name}</div>{c.description && <div className="text-xs text-ink-400">{c.description}</div>}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button" disabled={!editable} title={SCORE_VI[n]} onClick={() => setScores({ ...scores, [c.id]: { score: n, comment: scores[c.id]?.comment ?? "" } })}
                          className={`h-9 w-9 rounded-lg text-sm font-bold ${v === n ? "bg-brand-600 text-white" : "bg-black/5 text-ink-600"} ${editable ? "hover:bg-brand-600/20" : ""}`}>{n}</button>
                      ))}
                    </div>
                    <div className="mt-1 text-[11px] text-ink-400">{v ? SCORE_VI[v] : "chưa chấm"}</div>
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
