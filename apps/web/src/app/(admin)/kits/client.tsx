"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

export function BomEditor({ kitId, lines, components }: { kitId: string; lines: { componentId: string; qty: number }[]; components: { id: string; label: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(lines.length ? lines : [{ componentId: components[0]?.id ?? "", qty: 1 }]);
  const m = useMutation(trpc.inventory.setBom.mutationOptions({ onSuccess: () => { setOpen(false); router.refresh(); } }));
  if (!open) return <button type="button" className="text-xs text-brand-600" onClick={() => setOpen(true)}>Sửa định mức</button>;
  return (
    <div className="mt-2 space-y-1 rounded-lg border border-black/10 p-2">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-1">
          <select className="input flex-1 !py-1 text-xs" value={r.componentId} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, componentId: e.target.value } : x)))}>{components.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          <input type="number" min={1} className="input w-16 !py-1 text-xs" value={r.qty} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} />
          <button type="button" className="text-xs text-red-700" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <div className="flex gap-2">
        <button type="button" className="text-xs text-brand-600" onClick={() => setRows([...rows, { componentId: components[0]?.id ?? "", qty: 1 }])}>+ Linh kiện</button>
        <button type="button" className="btn-primary !py-1 text-xs" disabled={m.isPending} onClick={() => m.mutate({ kitId, lines: rows })}>Lưu</button>
        <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => setOpen(false)}>Huỷ</button>
      </div>
      {m.error && <p className="text-xs text-red-700">{m.error.message}</p>}
    </div>
  );
}

export function AssembleButton({ kitId, centerId, max }: { kitId: string; centerId: string; max: number }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [qty, setQty] = useState("1");
  const [open, setOpen] = useState(false);
  const m = useMutation(trpc.inventory.assemble.mutationOptions({ onSuccess: () => { setOpen(false); router.refresh(); } }));
  if (!open) return <button type="button" className="text-xs text-brand-600 disabled:text-ink-400" disabled={max < 1} onClick={() => setOpen(true)} title={max < 1 ? "Không đủ linh kiện" : ""}>Đóng bộ</button>;
  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex gap-1">
        <input type="number" min={1} max={max} className="input w-16 !py-0.5 text-xs" value={qty} onChange={(e) => setQty(e.target.value)} />
        <button type="button" className="btn-primary !px-2 !py-0.5 text-xs" disabled={m.isPending} onClick={() => m.mutate({ kitId, centerId, qty: Number(qty) })}>OK</button>
        <button type="button" className="text-xs" onClick={() => setOpen(false)}>✕</button>
      </span>
      {m.error && <span className="max-w-[180px] text-xs text-red-700">{m.error.message}</span>}
    </span>
  );
}
