"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

type V = { id?: string; code: string; name: string; address: string; phone: string; isActive: boolean };

export function CenterEditor({ initial }: { initial?: V }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(!initial);
  const [v, setV] = useState<V>(initial ?? { code: "", name: "", address: "", phone: "", isActive: true });
  const [error, setError] = useState<string | null>(null);
  const m = useMutation(trpc.org.upsertCenter.mutationOptions({ onSuccess: () => { if (initial) setOpen(false); else setV({ code: "", name: "", address: "", phone: "", isActive: true }); setError(null); router.refresh(); }, onError: (e) => setError(e.message) }));
  if (!open) return <button className="text-xs text-brand-600 underline" onClick={() => setOpen(true)}>Sửa</button>;
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); m.mutate({ id: v.id, code: v.code, name: v.name, address: v.address || null, phone: v.phone || null, isActive: v.isActive }); }}>
      <div className="grid grid-cols-[100px_1fr] gap-2">
        <input className="input" placeholder="Mã *" required value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} />
        <input className="input" placeholder="Tên cơ sở *" required minLength={3} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </div>
      <input className="input" placeholder="Địa chỉ" value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} />
      <input className="input" placeholder="SĐT cơ sở" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} /> Đang hoạt động</label>
      {error && <div className="text-xs text-red-700">{error}</div>}
      <div className="flex gap-2"><button className="btn-primary !py-1.5 text-xs" disabled={m.isPending}>Lưu</button>{initial && <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => setOpen(false)}>Huỷ</button>}</div>
    </form>
  );
}
