"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { PARALLEL_METRICS, PARALLEL_METRIC_VI, type ParallelMetric, type CutoverStage } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

export function ChecklistToggle({ centerId, k, label, done, auto, required, disabled }: { centerId: string; k: string; label: string; done: boolean; auto: boolean; required: boolean; disabled: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.cutover.check.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" className="mt-1" checked={done} disabled={disabled || auto || m.isPending} onChange={(e) => m.mutate({ centerId, key: k, done: e.target.checked })} />
      <span>{label}{required && <span className="text-red-700"> *</span>}{auto && <span className="ml-1 text-xs text-ink-400">(tự kiểm tra)</span>}{m.error && <span className="block text-xs text-red-700">{m.error.message}</span>}</span>
    </label>
  );
}

export function LogDayForm({ centerId, today }: { centerId: string; today: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [v, setV] = useState<Record<ParallelMetric, string>>({ attendance: "", collected: "", newEnrollments: "", openEnrollments: "" });
  const [note, setNote] = useState("");
  const m = useMutation(trpc.cutover.logDay.mutationOptions({ onSuccess: () => router.refresh() }));
  const n = (s: string) => Number(s.replace(/[.,\s]/g, ""));
  const ready = PARALLEL_METRICS.every((k) => v[k].trim() !== "" && Number.isFinite(n(v[k])));
  return (
    <form className="space-y-2 text-sm" onSubmit={(e) => { e.preventDefault(); m.mutate({ centerId, date, note: note || null, legacy: Object.fromEntries(PARALLEL_METRICS.map((k) => [k, n(v[k])])) as Record<ParallelMetric, number> }); }}>
      <label className="flex items-center justify-between gap-2">Ngày<input type="date" className="input max-w-[170px]" max={today} value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <p className="text-xs text-ink-600">Số liệu xem trên hệ cũ cho ngày này:</p>
      {PARALLEL_METRICS.map((k) => (
        <label key={k} className="flex items-center justify-between gap-2"><span className="text-xs">{PARALLEL_METRIC_VI[k]}</span><input inputMode="numeric" className="input max-w-[130px] text-right" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>
      ))}
      <input className="input" placeholder="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn-primary" disabled={!ready || m.isPending}>So và ghi sổ</button>
      {m.data && <div className={m.data.ok ? "text-green-700" : "text-red-700"}>{m.data.ok ? "Khớp" : `Lệch: ${m.data.diffs.filter((d) => !d.ok).map((d) => `${d.label} (${d.diff > 0 ? "+" : ""}${d.diff})`).join("; ")} — ghi giải thích ở bảng dưới`}</div>}
      {m.error && <div className="text-red-700">{m.error.message}</div>}
    </form>
  );
}

export function ExplainForm({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [t, setT] = useState("");
  const m = useMutation(trpc.cutover.explain.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <form className="flex flex-wrap gap-1" onSubmit={(e) => { e.preventDefault(); m.mutate({ id, explanation: t }); }}>
      <input className="input min-w-[200px] flex-1 text-xs" placeholder="Nguyên nhân lệch + đã xử lý thế nào" value={t} onChange={(e) => setT(e.target.value)} />
      <button className="btn-ghost text-xs" disabled={t.trim().length < 15 || m.isPending}>Lưu</button>
      {m.error && <span className="w-full text-red-700">{m.error.message}</span>}
    </form>
  );
}

export function StageButton({ centerId, stage, label, disabled }: { centerId: string; stage: CutoverStage; label: string; disabled: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const m = useMutation(trpc.cutover.setStage.mutationOptions({ onSuccess: () => { setOpen(false); router.refresh(); } }));
  if (!open) return <button className="btn-ghost text-xs" disabled={disabled} onClick={() => setOpen(true)}>Chuyển</button>;
  return (
    <form className="flex w-full flex-wrap gap-1" onSubmit={(e) => { e.preventDefault(); m.mutate({ centerId, stage, reason }); }}>
      <input className="input min-w-[160px] flex-1 text-xs" placeholder={`Quyết định chuyển sang "${label}"`} value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className="btn-primary text-xs" disabled={reason.trim().length < 5 || m.isPending}>Xác nhận</button>
      <button type="button" className="btn-ghost text-xs" onClick={() => setOpen(false)}>Huỷ</button>
      {m.error && <span className="w-full text-xs text-red-700">{m.error.message}</span>}
    </form>
  );
}
