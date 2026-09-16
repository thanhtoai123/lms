"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { TEACHER_STATUSES, TEACHER_STATUS_VI, type TeacherStatus } from "@satarobo/core";
import { TeacherForm, type TeacherFormValue } from "../form";

type Ev = { id: string; score: number; comment: string; observedOn: string; createdAt: string; evaluatorName: string | null };
type FormProps = { initial: TeacherFormValue; centers: { id: string; code: string; name: string }[]; courses: { id: string; code: string; name: string; isActive: boolean }[]; accounts: { id: string; email: string; fullName: string }[] };

export function TeacherActions({ teacher, evaluations, form }: { teacher: { id: string; workStatus: string; canEdit: boolean; canEvaluate: boolean; today: string }; evaluations: Ev[]; form: FormProps | null }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [status, setStatus] = useState<TeacherStatus>(teacher.workStatus as TeacherStatus);
  const [reason, setReason] = useState("");
  const [ev, setEv] = useState({ score: 4, comment: "", observedOn: teacher.today });
  const onError = (e: { message: string }) => setMsg({ ok: false, text: e.message });
  const setSt = useMutation(trpc.catalog.setTeacherStatus.mutationOptions({ onSuccess: () => { setMsg({ ok: true, text: "Đã cập nhật trạng thái." }); setReason(""); router.refresh(); }, onError }));
  const addEv = useMutation(trpc.catalog.addEvaluation.mutationOptions({ onSuccess: () => { setMsg({ ok: true, text: "Đã lưu đánh giá dự giờ." }); setEv({ ...ev, comment: "" }); router.refresh(); }, onError }));

  return (
    <div className="space-y-4">
      {msg && <div className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}
      {form && (edit ? <TeacherForm {...form} onDone={() => setEdit(false)} /> : (
        <div className="flex flex-wrap items-end gap-2">
          <button className="btn-ghost" onClick={() => setEdit(true)}>Sửa hồ sơ</button>
          <label className="text-xs text-ink-600">Trạng thái
            <select className="input mt-1" value={status} onChange={(e) => setStatus(e.target.value as TeacherStatus)}>
              {TEACHER_STATUSES.map((s) => <option key={s} value={s}>{TEACHER_STATUS_VI[s]}</option>)}
            </select>
          </label>
          {status !== "active" && <input className="input max-w-sm" placeholder="Lý do (bắt buộc)" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />}
          <button className="btn-ghost" disabled={setSt.isPending || status === teacher.workStatus} onClick={() => setSt.mutate({ id: teacher.id, status, reason: reason.trim() || null })}>Đổi trạng thái</button>
        </div>
      ))}

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Đánh giá dự giờ</h2>
        {teacher.canEvaluate && (
          <div className="space-y-2 rounded-xl border border-black/10 p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <div className="label">Điểm</div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={`text-2xl leading-none ${n <= ev.score ? "text-amber-500" : "text-black/15"}`} onClick={() => setEv({ ...ev, score: n })} aria-label={`${n} sao`}>★</button>)}
                </div>
              </div>
              <label className="text-xs text-ink-600">Ngày dự giờ<input type="date" max={teacher.today} className="input mt-1" value={ev.observedOn} onChange={(e) => setEv({ ...ev, observedOn: e.target.value })} /></label>
            </div>
            <textarea className="input min-h-20" maxLength={2000} placeholder="Nhận xét bắt buộc: điểm mạnh, cần cải thiện, đề xuất…" value={ev.comment} onChange={(e) => setEv({ ...ev, comment: e.target.value })} />
            <button className="btn-primary" disabled={addEv.isPending || ev.comment.trim().length < 10} onClick={() => addEv.mutate({ teacherId: teacher.id, ...ev, comment: ev.comment.trim() })}>Lưu đánh giá</button>
          </div>
        )}
        {evaluations.length === 0 ? <p className="text-sm text-ink-400">Chưa có đánh giá.</p> : (
          <ul className="divide-y divide-black/5 text-sm">
            {evaluations.map((e) => (
              <li key={e.id} className="py-2">
                <div className="flex justify-between gap-2"><span className="text-amber-500">{"★".repeat(e.score)}<span className="text-black/15">{"★".repeat(5 - e.score)}</span></span><span className="text-xs text-ink-400">{e.observedOn.split("-").reverse().join("/")} · {e.evaluatorName ?? "?"}</span></div>
                <p className="whitespace-pre-wrap text-ink-900">{e.comment}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
