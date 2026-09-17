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

export function FeedbackForm({ centers, categories, severities }: { centers: { id: string; code: string }[]; categories: { key: string; label: string }[]; severities: { key: string; label: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [v, setV] = useState({ centerId: centers[0]?.id ?? "", category: "bug", severity: "medium", title: "", detail: "", pageUrl: "" });
  const m = useMutation(trpc.pilot.createFeedback.mutationOptions({ onSuccess: () => { setV({ ...v, title: "", detail: "", pageUrl: "" }); router.refresh(); } }));
  if (!centers.length) return null;
  return (
    <form className="card grid gap-2 p-4 text-sm md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); m.mutate({ centerId: v.centerId, category: v.category as "bug", severity: v.severity as "medium", title: v.title, detail: v.detail || null, pageUrl: v.pageUrl || null }); }}>
      <div className="font-semibold md:col-span-4">Ghi phản hồi mới</div>
      <select className="input" value={v.centerId} onChange={(e) => setV({ ...v, centerId: e.target.value })}>{centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select>
      <select className="input" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>{categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
      <select className="input" value={v.severity} onChange={(e) => setV({ ...v, severity: e.target.value })}>{severities.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
      <input className="input" placeholder="Trang gặp lỗi, VD /attendance" value={v.pageUrl} onChange={(e) => setV({ ...v, pageUrl: e.target.value })} />
      <input className="input md:col-span-4" placeholder="Tiêu đề ngắn" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
      <textarea className="input md:col-span-4" placeholder="Mô tả: làm gì, thấy gì, mong đợi gì" value={v.detail} onChange={(e) => setV({ ...v, detail: e.target.value })} />
      <div className="md:col-span-4"><button className="btn-primary" disabled={v.title.trim().length < 5 || m.isPending}>Gửi phản hồi</button>{m.error && <span className="ml-2 text-red-700">{m.error.message}</span>}</div>
    </form>
  );
}

const NEXT: Record<string, { to: "in_progress" | "resolved" | "wontfix" | "open"; label: string; needs: boolean }[]> = {
  open: [{ to: "in_progress", label: "Nhận xử lý", needs: false }, { to: "resolved", label: "Đã xử lý", needs: true }, { to: "wontfix", label: "Không xử lý", needs: true }],
  in_progress: [{ to: "resolved", label: "Đã xử lý", needs: true }, { to: "wontfix", label: "Không xử lý", needs: true }],
  resolved: [{ to: "open", label: "Mở lại", needs: false }],
  wontfix: [{ to: "open", label: "Mở lại", needs: false }],
};

export function FeedbackAction({ id, status }: { id: string; status: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [res, setRes] = useState("");
  const m = useMutation(trpc.pilot.updateFeedback.mutationOptions({ onSuccess: () => { setRes(""); router.refresh(); } }));
  const opts = NEXT[status] ?? [];
  return (
    <div className="flex flex-wrap items-center gap-1">
      {opts.some((o) => o.needs) && <input className="input min-w-[220px] flex-1 text-xs" placeholder="Cách xử lý / lý do" value={res} onChange={(e) => setRes(e.target.value)} />}
      {opts.map((o) => <button key={o.to} type="button" className="btn-ghost text-xs" disabled={m.isPending || (o.needs && res.trim().length < 10)} onClick={() => m.mutate({ id, status: o.to, resolution: o.needs ? res : null })}>{o.label}</button>)}
      {m.error && <span className="w-full text-xs text-red-700">{m.error.message}</span>}
    </div>
  );
}
