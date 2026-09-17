"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

export function RegionForm({ managers, region }: { managers: { id: string; fullName: string }[]; region?: { id: string; code: string; name: string; managerUserId: string | null; sortOrder: number } }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(region?.code ?? "");
  const [name, setName] = useState(region?.name ?? "");
  const [managerUserId, setManager] = useState(region?.managerUserId ?? "");
  const [sortOrder, setSort] = useState(region?.sortOrder ?? 0);
  const m = useMutation(trpc.admin.upsertRegion.mutationOptions({ onSuccess: () => { setOpen(false); router.refresh(); } }));
  if (!open) return <button className={region ? "btn-ghost" : "btn-primary"} onClick={() => setOpen(true)}>{region ? "Sửa" : "+ Khu vực"}</button>;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <form className="card w-full max-w-md space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); m.mutate({ id: region?.id, code, name, managerUserId: managerUserId || null, sortOrder }); }}>
        <h3 className="font-semibold">{region ? "Sửa khu vực" : "Tạo khu vực"}</h3>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-sm">Mã<input className="input mt-1 w-full uppercase" value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} required /></label>
          <label className="col-span-2 text-sm">Tên<input className="input mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required /></label>
        </div>
        <label className="block text-sm">Người phụ trách
          <select className="input mt-1 w-full" value={managerUserId} onChange={(e) => setManager(e.target.value)}>
            <option value="">— Chưa gán —</option>
            {managers.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
        </label>
        <label className="block text-sm">Thứ tự<input type="number" min={0} max={999} className="input mt-1 w-24" value={sortOrder} onChange={(e) => setSort(Number(e.target.value))} /></label>
        {m.error && <p className="text-sm text-red-700">{m.error.message}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button><button className="btn-primary" disabled={m.isPending}>Lưu</button></div>
      </form>
    </div>
  );
}

export function DeleteRegion({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.admin.deleteRegion.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <span className="flex flex-col items-end">
      <button className="btn-ghost text-red-700" disabled={m.isPending} onClick={() => m.mutate({ id })}>Xoá</button>
      {m.error && <span className="max-w-[220px] text-right text-xs text-red-700">{m.error.message}</span>}
    </span>
  );
}

export function AssignRegion({ centerId, regionId, regions }: { centerId: string; regionId: string | null; regions: { id: string; code: string; name: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.admin.assignCenterRegion.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <span className="flex flex-col items-end">
      <select className="input !py-1 text-xs" value={regionId ?? ""} disabled={m.isPending} onChange={(e) => m.mutate({ centerId, regionId: e.target.value || null })} aria-label="Khu vực">
        <option value="">Chưa thuộc khu vực</option>
        {regions.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}
      </select>
      {m.error && <span className="text-xs text-red-700">{m.error.message}</span>}
    </span>
  );
}
