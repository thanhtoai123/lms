"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { ErrorBox } from "@/components/admin-ui";

type Row = {
  id: string; code: string; name: string; note: string | null; isActive: boolean;
  centerId: string | null; centerCode: string | null; classCount: number;
};
type V = { id?: string; code: string; name: string; centerId: string; note: string; isActive: boolean };

export function ClassGroupsTable({ rows, centers, defaultCenterId }: { rows: Row[]; centers: { id: string; code: string; name: string }[]; defaultCenterId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const blank: V = { code: "", name: "", centerId: defaultCenterId, note: "", isActive: true };
  const [edit, setEdit] = useState<V | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ok = () => { setEdit(null); setError(null); router.refresh(); };
  const save = useMutation(trpc.academics.classes.upsertGroup.mutationOptions({ onSuccess: ok, onError: (e) => setError(e.message) }));
  const remove = useMutation(trpc.academics.classes.deleteGroup.mutationOptions({ onSuccess: ok, onError: (e) => setError(e.message) }));
  const busy = save.isPending || remove.isPending;

  const del = (r: Row) => {
    const reason = window.prompt(`Xoá nhóm lớp ${r.code} — ${r.name}?\nNhập lý do (tối thiểu 5 ký tự):`, "");
    if (reason && reason.trim().length >= 5) remove.mutate({ id: r.id, reason: reason.trim() });
    else if (reason !== null) setError("Lý do tối thiểu 5 ký tự");
  };

  const form = (v: V) => (
    <tr className="bg-brand-50/50">
      <td className="p-2"><input className="input text-xs" placeholder="Mã *" value={v.code} onChange={(e) => setEdit({ ...v, code: e.target.value })} /></td>
      <td className="p-2"><input className="input text-xs" placeholder="Tên nhóm *" value={v.name} onChange={(e) => setEdit({ ...v, name: e.target.value })} /></td>
      <td className="p-2">
        <select className="input text-xs" value={v.centerId} onChange={(e) => setEdit({ ...v, centerId: e.target.value })}>
          <option value="">Toàn hệ thống</option>
          {centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
        </select>
      </td>
      <td className="p-2 text-center text-xs text-ink-400">—</td>
      <td className="p-2">
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={v.isActive} onChange={(e) => setEdit({ ...v, isActive: e.target.checked })} /> Đang dùng</label>
      </td>
      <td className="p-2"><input className="input text-xs" placeholder="Ghi chú" value={v.note} onChange={(e) => setEdit({ ...v, note: e.target.value })} /></td>
      <td className="p-2 whitespace-nowrap">
        <button className="btn-primary !px-2 !py-1 text-xs" disabled={busy || v.code.trim().length < 2 || v.name.trim().length < 3} onClick={() => save.mutate({ id: v.id, code: v.code, name: v.name, centerId: v.centerId || null, note: v.note || null, isActive: v.isActive })}>Lưu</button>{" "}
        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setEdit(null)}>Huỷ</button>
      </td>
    </tr>
  );

  return (
    <div className="space-y-2">
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-ink-400">
            <tr><th className="p-3">Mã hiển thị</th><th className="p-3">Tên nhóm</th><th className="p-3">Cơ sở</th><th className="p-3">Số lớp</th><th className="p-3">Trạng thái</th><th className="p-3">Ghi chú</th><th className="p-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {rows.map((r) =>
              edit?.id === r.id ? form(edit) : (
                <tr key={r.id} className={r.isActive ? "" : "opacity-60"}>
                  <td className="p-3 font-mono">{r.code}</td>
                  <td className="p-3">{r.name}</td>
                  <td className="p-3">{r.centerCode ?? <span className="text-ink-400">Toàn hệ thống</span>}</td>
                  <td className="p-3">{r.classCount ? <Link href={`/classes?group=${r.id}`} className="text-brand-600 underline">{r.classCount}</Link> : 0}</td>
                  <td className="p-3"><span className={`chip ${r.isActive ? "bg-green-100 text-green-800" : "bg-slate-200 text-ink-600"}`}>{r.isActive ? "Đang dùng" : "Ngừng dùng"}</span></td>
                  <td className="p-3 text-xs text-ink-600">{r.note ?? ""}</td>
                  <td className="p-3 whitespace-nowrap">
                    <button className="text-xs text-brand-600 underline" onClick={() => setEdit({ id: r.id, code: r.code, name: r.name, centerId: r.centerId ?? "", note: r.note ?? "", isActive: r.isActive })}>Sửa</button>{" "}
                    <button className="text-xs text-red-700 underline disabled:opacity-40" disabled={busy || r.classCount > 0} title={r.classCount > 0 ? "Còn lớp thuộc nhóm này" : "Xoá nhóm"} onClick={() => del(r)}>Xoá</button>
                  </td>
                </tr>
              ),
            )}
            {edit && !edit.id && form(edit)}
            {rows.length === 0 && !edit && <tr><td colSpan={7} className="p-4 text-center text-ink-400">Chưa có nhóm lớp nào.</td></tr>}
          </tbody>
        </table>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {!edit && <button className="btn-primary" onClick={() => setEdit(blank)}>+ Thêm nhóm lớp</button>}
    </div>
  );
}
