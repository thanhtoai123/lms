"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ROOM_STATUSES, ROOM_STATUS_VI, type RoomStatus } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

type Row = { id: string; centerId: string; centerCode: string; code: string; name: string; capacity: number; isActive: boolean; status: RoomStatus; equipment: string[]; sessionsThisWeek: number; homeClasses: number };
type V = { id?: string; centerId: string; code: string; name: string; capacity: string; status: RoomStatus; equipment: string };

const STATUS_CHIP: Record<RoomStatus, string> = { active: "bg-green-100 text-green-800", maintenance: "bg-amber-100 text-amber-800", paused: "bg-slate-200 text-ink-600" };

export function RoomsTable({ rows, centers, defaultCenterId }: { rows: Row[]; centers: { id: string; code: string }[]; defaultCenterId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const blank: V = { centerId: defaultCenterId, code: "", name: "", capacity: "12", status: "active", equipment: "" };
  const [edit, setEdit] = useState<V | null>(null);
  const [error, setError] = useState<string | null>(null);
  const m = useMutation(trpc.org.upsertRoom.mutationOptions({ onSuccess: () => { setEdit(null); setError(null); router.refresh(); }, onError: (e) => setError(e.message) }));
  const save = (v: V) => m.mutate({
    id: v.id, centerId: v.centerId, code: v.code, name: v.name, capacity: Number(v.capacity),
    status: v.status, equipment: v.equipment.split(",").map((s) => s.trim()).filter(Boolean),
  });

  const form = (v: V) => (
    <tr className="bg-brand-50/50">
      <td className="p-2"><select className="input text-xs" value={v.centerId} disabled={!!v.id} onChange={(e) => setEdit({ ...v, centerId: e.target.value })}>{centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></td>
      <td className="p-2"><input className="input text-xs" placeholder="Mã *" value={v.code} onChange={(e) => setEdit({ ...v, code: e.target.value })} /></td>
      <td className="p-2"><input className="input text-xs" placeholder="Tên *" value={v.name} onChange={(e) => setEdit({ ...v, name: e.target.value })} /></td>
      <td className="p-2"><input type="number" min={1} className="input !w-20 text-xs" value={v.capacity} onChange={(e) => setEdit({ ...v, capacity: e.target.value })} /></td>
      <td className="p-2"><select className="input text-xs" value={v.status} onChange={(e) => setEdit({ ...v, status: e.target.value as RoomStatus })}>{ROOM_STATUSES.map((s) => <option key={s} value={s}>{ROOM_STATUS_VI[s]}</option>)}</select></td>
      <td className="p-2" colSpan={3}><input className="input text-xs" placeholder="Thiết bị, cách nhau bằng dấu phẩy (máy chiếu, TV, bộ kit…)" value={v.equipment} onChange={(e) => setEdit({ ...v, equipment: e.target.value })} /></td>
      <td className="p-2 whitespace-nowrap"><button className="btn-primary !px-2 !py-1 text-xs" disabled={m.isPending || !v.code || !v.name} onClick={() => save(v)}>Lưu</button> <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setEdit(null)}>Huỷ</button></td>
    </tr>
  );

  return (
    <div className="space-y-2">
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Cơ sở</th><th className="p-3">Mã</th><th className="p-3">Tên phòng</th><th className="p-3">Sức chứa</th><th className="p-3">Trạng thái</th><th className="p-3">Thiết bị</th><th className="p-3">Lớp gốc</th><th className="p-3">Buổi tuần này</th><th className="p-3"></th></tr></thead>
          <tbody className="divide-y divide-black/5">
            {rows.map((r) =>
              edit?.id === r.id ? form(edit) : (
                <tr key={r.id} className={r.status === "active" ? "" : "opacity-70"}>
                  <td className="p-3">{r.centerCode}</td>
                  <td className="p-3 font-mono">{r.code}</td>
                  <td className="p-3">{r.name}</td>
                  <td className="p-3">{r.capacity}</td>
                  <td className="p-3"><span className={`chip ${STATUS_CHIP[r.status] ?? "bg-black/5"}`}>{ROOM_STATUS_VI[r.status] ?? r.status}</span></td>
                  <td className="p-3 text-xs">{r.equipment.length ? r.equipment.join(", ") : <span className="text-ink-400">—</span>}</td>
                  <td className="p-3">{r.homeClasses}</td>
                  <td className="p-3">{r.sessionsThisWeek}</td>
                  <td className="p-3"><button className="text-xs text-brand-600 underline" onClick={() => setEdit({ id: r.id, centerId: r.centerId, code: r.code, name: r.name, capacity: String(r.capacity), status: r.status, equipment: r.equipment.join(", ") })}>Sửa</button></td>
                </tr>
              ),
            )}
            {edit && !edit.id && form(edit)}
            {rows.length === 0 && !edit && <tr><td colSpan={9} className="p-4 text-center text-ink-400">Chưa có phòng.</td></tr>}
          </tbody>
        </table>
      </div>
      {error && <div className="text-sm text-red-700">{error}</div>}
      {!edit && <button className="btn-primary" onClick={() => setEdit(blank)}>+ Thêm phòng</button>}
    </div>
  );
}
