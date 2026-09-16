"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

type Row = { id: string; centerId: string; centerCode: string; code: string; name: string; capacity: number; isActive: boolean; sessionsThisWeek: number; homeClasses: number };
type V = { id?: string; centerId: string; code: string; name: string; capacity: string; isActive: boolean };

export function RoomsTable({ rows, centers, defaultCenterId }: { rows: Row[]; centers: { id: string; code: string }[]; defaultCenterId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const blank: V = { centerId: defaultCenterId, code: "", name: "", capacity: "12", isActive: true };
  const [edit, setEdit] = useState<V | null>(null);
  const [error, setError] = useState<string | null>(null);
  const m = useMutation(trpc.org.upsertRoom.mutationOptions({ onSuccess: () => { setEdit(null); setError(null); router.refresh(); }, onError: (e) => setError(e.message) }));
  const save = (v: V) => m.mutate({ id: v.id, centerId: v.centerId, code: v.code, name: v.name, capacity: Number(v.capacity), isActive: v.isActive });

  const form = (v: V) => (
    <tr className="bg-brand-50/50">
      <td className="p-2"><select className="input text-xs" value={v.centerId} disabled={!!v.id} onChange={(e) => setEdit({ ...v, centerId: e.target.value })}>{centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></td>
      <td className="p-2"><input className="input text-xs" placeholder="Mã *" value={v.code} onChange={(e) => setEdit({ ...v, code: e.target.value })} /></td>
      <td className="p-2"><input className="input text-xs" placeholder="Tên *" value={v.name} onChange={(e) => setEdit({ ...v, name: e.target.value })} /></td>
      <td className="p-2"><input type="number" min={1} className="input !w-20 text-xs" value={v.capacity} onChange={(e) => setEdit({ ...v, capacity: e.target.value })} /></td>
      <td className="p-2" colSpan={2}><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={v.isActive} onChange={(e) => setEdit({ ...v, isActive: e.target.checked })} /> Đang dùng</label></td>
      <td className="p-2 whitespace-nowrap"><button className="btn-primary !px-2 !py-1 text-xs" disabled={m.isPending || !v.code || !v.name} onClick={() => save(v)}>Lưu</button> <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setEdit(null)}>Huỷ</button></td>
    </tr>
  );

  return (
    <div className="space-y-2">
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Cơ sở</th><th className="p-3">Mã</th><th className="p-3">Tên phòng</th><th className="p-3">Sức chứa</th><th className="p-3">Lớp gốc</th><th className="p-3">Buổi tuần này</th><th className="p-3"></th></tr></thead>
          <tbody className="divide-y divide-black/5">
            {rows.map((r) =>
              edit?.id === r.id ? <FormRow key={r.id}>{form(edit)}</FormRow> : (
                <tr key={r.id} className={r.isActive ? "" : "opacity-50"}>
                  <td className="p-3">{r.centerCode}</td>
                  <td className="p-3 font-mono">{r.code}</td>
                  <td className="p-3">{r.name}{!r.isActive && <span className="ml-1 text-xs">(ngừng)</span>}</td>
                  <td className="p-3">{r.capacity}</td>
                  <td className="p-3">{r.homeClasses}</td>
                  <td className="p-3">{r.sessionsThisWeek}</td>
                  <td className="p-3"><button className="text-xs text-brand-600 underline" onClick={() => setEdit({ id: r.id, centerId: r.centerId, code: r.code, name: r.name, capacity: String(r.capacity), isActive: r.isActive })}>Sửa</button></td>
                </tr>
              ),
            )}
            {edit && !edit.id && form(edit)}
            {rows.length === 0 && !edit && <tr><td colSpan={7} className="p-4 text-center text-ink-400">Chưa có phòng.</td></tr>}
          </tbody>
        </table>
      </div>
      {error && <div className="text-sm text-red-700">{error}</div>}
      {!edit && <button className="btn-primary" onClick={() => setEdit(blank)}>+ Thêm phòng</button>}
    </div>
  );
}

function FormRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
