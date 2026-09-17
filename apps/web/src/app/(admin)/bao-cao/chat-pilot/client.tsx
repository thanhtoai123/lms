"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

export function PilotConfig({ classes, initial }: { classes: { id: string; code: string; name: string }[]; initial: { classIds: string[]; startDate: string | null; note: string } }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(initial.classIds.length === 0);
  const [v, setV] = useState(initial);
  const m = useMutation(trpc.messaging.savePilot.mutationOptions({ onSuccess: () => { setOpen(false); router.refresh(); } }));
  if (!open) return <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>Cấu hình lớp pilot</button>;
  const toggle = (id: string) => setV({ ...v, classIds: v.classIds.includes(id) ? v.classIds.filter((x) => x !== id) : [...v.classIds, id] });
  return (
    <form className="card space-y-2 p-4 text-sm" onSubmit={(e) => { e.preventDefault(); m.mutate(v); }}>
      <h3 className="font-semibold">Lớp tham gia pilot tin nhắn phụ huynh</h3>
      <div className="grid max-h-60 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
        {classes.map((c) => <label key={c.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={v.classIds.includes(c.id)} onChange={() => toggle(c.id)} /> <span className="font-mono">{c.code}</span> {c.name}</label>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <label>Bắt đầu pilot<input type="date" className="input mt-1" value={v.startDate ?? ""} onChange={(e) => setV({ ...v, startDate: e.target.value || null })} /></label>
        <label className="flex-1">Ghi chú<input className="input mt-1" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="Mục tiêu, người phụ trách…" /></label>
      </div>
      {m.error && <p className="text-red-700">{m.error.message}</p>}
      <div className="flex gap-2"><button className="btn-primary" disabled={m.isPending}>Lưu ({v.classIds.length} lớp)</button>{initial.classIds.length > 0 && <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Đóng</button>}</div>
    </form>
  );
}
