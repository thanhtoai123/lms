"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { ATT_LABEL } from "@/components/ui";
import { EnrollmentChip, ErrorBox } from "@/components/admin-ui";
import type { EnrollmentStatus } from "@satarobo/core";

const SHORT: Record<AttendanceStatus, string> = { present: "✓", late: "M", absent_excused: "P", absent_unexcused: "K", makeup: "B" };
const CELL: Record<AttendanceStatus, string> = {
  present: "bg-green-100 text-green-800",
  late: "bg-amber-100 text-amber-800",
  absent_excused: "bg-slate-200 text-slate-700",
  absent_unexcused: "bg-red-100 text-red-700",
  makeup: "bg-violet-100 text-violet-800",
};

type Grid = {
  class: { id: string; code: string; name: string };
  today: string;
  sessions: { id: string; sequenceNo: number; date: string; status: string }[];
  rows: {
    enrollmentId: string; studentId: string; fullName: string; code: string | null; status: EnrollmentStatus;
    cells: { sessionId: string; status: AttendanceStatus | null; note: string | null; needsMakeup: boolean | null; absenceReason: string | null; applicable: boolean }[];
    summary: { rate: number; total: number; attended: number; pendingMakeup: number };
  }[];
};

export function AttendanceGrid({ data }: { data: Grid }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [edit, setEdit] = useState<{ enrollmentId: string; sessionId: string; name: string; current: AttendanceStatus | null } | null>(null);
  const [status, setStatus] = useState<AttendanceStatus>("present");
  const [reason, setReason] = useState("");
  const [needsMakeup, setNeedsMakeup] = useState<boolean | null>(null);
  const [absenceReason, setAbsenceReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const m = useMutation(trpc.schedule.correctAttendance.mutationOptions({
    onSuccess: (r) => { setMsg(r.changed ? (r.retroactive ? "Đã sửa hồi tố — đã báo giáo viên." : "Đã ghi điểm danh.") : "Không có thay đổi."); setEdit(null); setReason(""); setError(null); router.refresh(); },
    onError: (e) => setError(e.message),
  }));
  const session = edit ? data.sessions.find((s) => s.id === edit.sessionId) : null;
  const retro = session ? session.status === "completed" || session.date < data.today : false;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        {ATTENDANCE_STATUSES.map((s) => <span key={s} className={`chip ${CELL[s]}`}>{SHORT[s]} = {ATT_LABEL[s]}</span>)}
        <span className="chip bg-black/5">· = chưa ghi</span>
      </div>
      {msg && <div className="rounded-xl border border-green-200 bg-green-50 p-2 text-sm text-green-800">{msg}</div>}
      {data.sessions.length === 0 ? (
        <div className="card p-6 text-sm text-ink-400">Lớp chưa có buổi nào diễn ra.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="text-xs text-ink-400">
                <th className="sticky left-0 z-10 min-w-[200px] bg-white p-2 text-left">Học viên</th>
                {data.sessions.map((s) => (
                  <th key={s.id} className="p-1 text-center font-normal">
                    <Link href={`/teacher/sessions/${s.id}`} className="hover:text-brand-600">B{s.sequenceNo}<div className="text-[10px]">{s.date.slice(8, 10)}/{s.date.slice(5, 7)}</div></Link>
                  </th>
                ))}
                <th className="p-2 text-right">Chuyên cần</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {data.rows.map((r) => (
                <tr key={r.enrollmentId}>
                  <td className="sticky left-0 z-10 bg-white p-2">
                    <Link href={`/students/${r.studentId}`} className="font-medium hover:text-brand-600">{r.fullName}</Link>
                    <div className="flex items-center gap-1 text-[10px] text-ink-400">{r.code} {r.status !== "active" && <EnrollmentChip status={r.status} />}</div>
                  </td>
                  {r.cells.map((c) => (
                    <td key={c.sessionId} className="p-0.5 text-center">
                      {c.applicable ? (
                        <button
                          title={c.status ? `${ATT_LABEL[c.status]}${c.note ? ` — ${c.note}` : ""}` : "Chưa ghi"}
                          className={`h-8 w-8 rounded-lg text-xs font-bold ${c.status ? CELL[c.status] : "bg-black/[0.03] text-ink-400"} ${edit?.enrollmentId === r.enrollmentId && edit.sessionId === c.sessionId ? "ring-2 ring-brand-600" : ""}`}
                          onClick={() => { setEdit({ enrollmentId: r.enrollmentId, sessionId: c.sessionId, name: r.fullName, current: c.status }); setStatus(c.status ?? "present"); setNeedsMakeup(c.needsMakeup); setAbsenceReason(c.absenceReason ?? ""); setMsg(null); setError(null); }}
                        >
                          {c.status ? SHORT[c.status] : "·"}
                        </button>
                      ) : <span className="text-[10px] text-ink-400">—</span>}
                    </td>
                  ))}
                  <td className={`p-2 text-right text-xs font-semibold ${r.summary.total >= 4 && r.summary.rate < 0.8 ? "text-red-700" : ""}`}>{Math.round(r.summary.rate * 100)}%{r.summary.pendingMakeup ? <div className="font-normal text-violet-700">{r.summary.pendingMakeup} chờ bù</div> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && session && (
        <form
          className="card max-w-xl space-y-2 border-brand-600/30 p-4"
          onSubmit={(e) => { e.preventDefault(); m.mutate({ sessionId: edit.sessionId, enrollmentId: edit.enrollmentId, status, reason: reason || undefined, needsMakeup, absenceReason: absenceReason.trim() || null }); }}
        >
          <div className="font-semibold">{edit.name} · buổi {session.sequenceNo} ({session.date.split("-").reverse().join("/")})</div>
          <div className="text-xs text-ink-600">Hiện tại: {edit.current ? ATT_LABEL[edit.current] : "chưa ghi"}</div>
          <div className="flex flex-wrap gap-1">
            {ATTENDANCE_STATUSES.filter((s) => s !== "makeup").map((s) => (
              <button type="button" key={s} onClick={() => setStatus(s)} className={`chip cursor-pointer px-3 py-1.5 ${status === s ? "bg-brand-600 text-white" : CELL[s]}`}>{ATT_LABEL[s]}</button>
            ))}
          </div>
          {(status === "absent_excused" || status === "absent_unexcused") && (
            <div className="space-y-1 rounded-lg bg-black/[0.03] p-2">
              <div className="flex flex-wrap items-center gap-1 text-xs">
                <span className="text-ink-600">Học bù:</span>
                <button type="button" onClick={() => setNeedsMakeup(true)} className={`chip cursor-pointer px-2 py-0.5 ${needsMakeup === true ? "bg-violet-600 text-white" : "bg-black/5"}`}>Cần học bù</button>
                <button type="button" onClick={() => setNeedsMakeup(false)} className={`chip cursor-pointer px-2 py-0.5 ${needsMakeup === false ? "bg-ink-900 text-white" : "bg-black/5"}`}>Không bù</button>
                {needsMakeup === null && <span className="text-ink-400">chưa chọn — mặc định xếp vào &ldquo;Chờ xếp bù&rdquo;</span>}
              </div>
              <input className="input !py-1 text-xs" maxLength={500} placeholder="Lý do phụ huynh xin vắng…" value={absenceReason} onChange={(e) => setAbsenceReason(e.target.value)} />
            </div>
          )}
          {retro && <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Buổi đã qua/đã hoàn tất: đây là sửa hồi tố — bắt buộc lý do, giáo viên phụ trách sẽ được báo.</div>}
          <input className="input" placeholder={retro ? "Lý do sửa *" : "Ghi chú (tuỳ chọn)"} required={retro} minLength={retro ? 3 : 0} value={reason} onChange={(e) => setReason(e.target.value)} />
          {error && <ErrorBox>{error}</ErrorBox>}
          <div className="flex gap-2"><button className="btn-primary" disabled={m.isPending}>Lưu</button><button type="button" className="btn-ghost" onClick={() => setEdit(null)}>Huỷ</button></div>
        </form>
      )}
    </div>
  );
}
