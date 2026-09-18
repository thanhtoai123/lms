"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { MAKEUP_STATUS_VI, type MakeupStatus } from "@satarobo/core";
import { ATT_LABEL, Empty, fmtTime } from "@/components/ui";
import { ErrorBox, fmtDate } from "@/components/admin-ui";

type Absence = { enrollmentId: string; sessionId: string; date: string; sequenceNo: number; status: "absent_excused" | "absent_unexcused" | string; needsMakeup: boolean | null; absenceReason: string | null; studentId: string; studentName: string; studentCode: string | null; classId: string; classCode: string; centerCode: string };
type Req = {
  id: string; status: MakeupStatus; note: string | null; studentId: string; studentName: string; studentCode: string | null; classCode: string; centerCode: string;
  missedDate: string; missedSeq: number; targetSessionId: string | null; targetDate: string | null; targetStart: string | null; targetClassCode: string | null; done: boolean;
};

export function MakeupBoard({ tab, absences, items }: { tab: string; absences: Absence[]; items: Req[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const create = useMutation(trpc.schedule.requestMakeup.mutationOptions({ onSuccess: () => { setError(null); router.refresh(); }, onError: (e) => setError(e.message) }));
  const complete = useMutation(trpc.schedule.completeMakeup.mutationOptions({ onSuccess: () => { setError(null); router.refresh(); }, onError: (e) => setError(e.message) }));

  if (tab === "pending") {
    if (absences.length === 0) return <Empty>Không có buổi vắng nào cần xử lý học bù.</Empty>;
    return (
      <div className="space-y-2">
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Học viên</th><th className="p-3">Lớp</th><th className="p-3">Buổi vắng</th><th className="p-3">Loại</th><th className="p-3"></th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {absences.map((a) => (
                <tr key={`${a.enrollmentId}:${a.sessionId}`}>
                  <td className="p-3"><Link href={`/students/${a.studentId}`} className="font-medium text-brand-600">{a.studentName}</Link><div className="font-mono text-[11px] text-ink-400">{a.studentCode}</div></td>
                  <td className="p-3">{a.classCode}<div className="text-xs text-ink-400">{a.centerCode}</div></td>
                  <td className="p-3">Buổi {a.sequenceNo}<div className="text-xs text-ink-400">{fmtDate(a.date)}</div></td>
                  <td className="p-3 text-xs">
                    {ATT_LABEL[a.status as keyof typeof ATT_LABEL] ?? a.status}
                    {a.needsMakeup === true && <div className="chip mt-1 bg-violet-100 text-violet-800">GV: cần học bù</div>}
                    {a.absenceReason && <div className="mt-1 text-ink-400">PH: {a.absenceReason}</div>}
                  </td>
                  <td className="p-3"><button className="btn-primary !py-1 text-xs" disabled={create.isPending} onClick={() => create.mutate({ enrollmentId: a.enrollmentId, missedSessionId: a.sessionId })}>Tạo yêu cầu học bù</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (items.length === 0) return <Empty>Không có yêu cầu nào.</Empty>;
  return (
    <div className="space-y-2">
      {error && <ErrorBox>{error}</ErrorBox>}
      {items.map((r) => (
        <div key={r.id} className="card space-y-2 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link href={`/students/${r.studentId}`} className="font-semibold text-brand-600">{r.studentName}</Link> <span className="font-mono text-xs text-ink-400">{r.studentCode}</span>
              <div className="text-xs text-ink-600">Vắng buổi {r.missedSeq} lớp {r.classCode} ({r.centerCode}) ngày {fmtDate(r.missedDate)}</div>
              {r.targetSessionId && <div className="text-xs text-ink-600">→ Học bù: {r.targetClassCode} · {fmtDate(r.targetDate)} {r.targetStart ? fmtTime(r.targetStart) : ""}</div>}
              {r.note && <div className="text-xs text-ink-400">Ghi chú: {r.note}</div>}
            </div>
            <span className={`chip ${r.status === "done" ? "bg-green-100 text-green-800" : r.status === "rejected" ? "bg-red-100 text-red-700" : r.status === "approved" ? "bg-violet-100 text-violet-800" : "bg-amber-100 text-amber-800"}`}>{MAKEUP_STATUS_VI[r.status]}</span>
          </div>
          {(r.status === "requested" || r.status === "approved") && (
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost !py-1 text-xs" onClick={() => setOpen(open === r.id ? null : r.id)}>{r.status === "requested" ? "Xếp buổi bù / từ chối" : "Đổi buổi bù / huỷ"}</button>
              {r.status === "approved" && r.targetDate && <button className="btn-primary !py-1 text-xs" disabled={complete.isPending} onClick={() => complete.mutate({ requestId: r.id })}>Ghi nhận đã học bù</button>}
            </div>
          )}
          {open === r.id && <Decide req={r} onDone={() => { setOpen(null); router.refresh(); }} />}
        </div>
      ))}
    </div>
  );
}

function Decide({ req, onDone }: { req: Req; onDone: () => void }) {
  const trpc = useTRPC();
  const cands = useQuery(trpc.schedule.makeupCandidates.queryOptions({ requestId: req.id }));
  const [target, setTarget] = useState(req.targetSessionId ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const m = useMutation(trpc.schedule.decideMakeup.mutationOptions({ onSuccess: onDone, onError: (e) => setError(e.message) }));
  const action = req.status === "requested" ? "approve" : "reschedule";
  return (
    <div className="space-y-2 rounded-xl border border-black/10 bg-black/[0.02] p-3">
      <div className="label">Buổi phù hợp (cùng bài {req.missedSeq}, còn chỗ)</div>
      {cands.isLoading && <div className="text-xs text-ink-400">Đang tìm…</div>}
      {cands.data?.length === 0 && <div className="text-sm text-amber-800">Chưa có buổi phù hợp trong lịch sắp tới.</div>}
      <div className="space-y-1">
        {cands.data?.map((c) => (
          <label key={c.id} className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-2 text-sm ${target === c.id ? "border-brand-600 bg-brand-50" : "border-black/5 bg-white"}`}>
            <span className="flex items-center gap-2"><input type="radio" checked={target === c.id} onChange={() => setTarget(c.id)} />{c.classCode} · {c.centerCode} · {fmtDate(c.date)} {fmtTime(c.startTime)}–{fmtTime(c.endTime)}</span>
            <span className="text-xs text-ink-400">{c.enrolled}/{c.capacity}</span>
          </label>
        ))}
      </div>
      <input className="input" placeholder="Ghi chú / lý do từ chối" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary !py-1.5 text-xs" disabled={!target || m.isPending} onClick={() => m.mutate({ requestId: req.id, action, targetSessionId: target, note: note || undefined })}>{action === "approve" ? "Xếp vào buổi này" : "Đổi sang buổi này"}</button>
        <button className="btn-ghost !py-1.5 text-xs text-red-700" disabled={m.isPending} onClick={() => m.mutate({ requestId: req.id, action: "reject", note })}>Từ chối</button>
      </div>
    </div>
  );
}
