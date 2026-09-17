"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ITEM_TYPES, ITEM_TYPE_VI, type ItemType } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

export type ItemDraft = {
  id?: string; sku: string; name: string; type: ItemType; unit: string; courseId: string | null; salePrice: number | null; rentPrice: number | null;
  deposit: number | null; reorderLevel: number; description: string | null; isActive: boolean;
};
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/\D/g, "")));

export function ItemForm({ item, courses, defaultType = "product" }: { item?: ItemDraft; courses: { id: string; code: string; name: string }[]; defaultType?: ItemType }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({
    sku: item?.sku ?? "", name: item?.name ?? "", type: item?.type ?? defaultType, unit: item?.unit ?? "cái", courseId: item?.courseId ?? "",
    salePrice: item?.salePrice?.toString() ?? "", rentPrice: item?.rentPrice?.toString() ?? "", deposit: item?.deposit?.toString() ?? "",
    reorderLevel: String(item?.reorderLevel ?? 0), description: item?.description ?? "", isActive: item?.isActive ?? true,
  });
  const m = useMutation(trpc.inventory.upsertItem.mutationOptions({ onSuccess: () => { setOpen(false); router.refresh(); } }));
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV({ ...v, [k]: x });
  if (!open) return <button type="button" className={item ? "text-xs text-brand-600" : "btn-primary"} onClick={() => setOpen(true)}>{item ? "Sửa" : "+ Thêm mặt hàng"}</button>;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <form className="card mt-10 grid w-full max-w-xl grid-cols-2 gap-2 p-4 text-sm" onSubmit={(e) => {
        e.preventDefault();
        m.mutate({ id: item?.id, sku: v.sku, name: v.name, type: v.type, unit: v.unit, courseId: v.courseId || null, salePrice: num(v.salePrice), rentPrice: num(v.rentPrice), deposit: num(v.deposit), reorderLevel: Number(v.reorderLevel) || 0, description: v.description || null, isActive: v.isActive });
      }}>
        <h3 className="col-span-2 font-semibold">{item ? `Sửa ${item.sku}` : "Thêm mặt hàng"}</h3>
        <label>Mã hàng (SKU)<input className="input mt-1 w-full uppercase" value={v.sku} onChange={(e) => set("sku", e.target.value.toUpperCase())} maxLength={40} required /></label>
        <label>Loại<select className="input mt-1 w-full" value={v.type} onChange={(e) => set("type", e.target.value as ItemType)}>{ITEM_TYPES.map((t) => <option key={t} value={t}>{ITEM_TYPE_VI[t]}</option>)}</select></label>
        <label className="col-span-2">Tên hàng<input className="input mt-1 w-full" value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={150} required /></label>
        <label>Đơn vị tính<input className="input mt-1 w-full" value={v.unit} onChange={(e) => set("unit", e.target.value)} maxLength={20} required /></label>
        <label>Tồn tối thiểu (cảnh báo)<input type="number" min={0} className="input mt-1 w-full" value={v.reorderLevel} onChange={(e) => set("reorderLevel", e.target.value)} /></label>
        {v.type === "kit" && <label className="col-span-2">Dùng cho khoá<select className="input mt-1 w-full" value={v.courseId} onChange={(e) => set("courseId", e.target.value)}><option value="">—</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select></label>}
        <label>Giá bán (đ)<input inputMode="numeric" className="input mt-1 w-full" value={v.salePrice} onChange={(e) => set("salePrice", e.target.value)} placeholder="Để trống nếu không bán" /></label>
        {(v.type === "product" || v.type === "kit") && <label>Giá thuê / tháng (đ)<input inputMode="numeric" className="input mt-1 w-full" value={v.rentPrice} onChange={(e) => set("rentPrice", e.target.value)} placeholder="Để trống nếu không cho thuê" /></label>}
        {(v.type === "product" || v.type === "kit") && <label>Tiền cọc thuê (đ)<input inputMode="numeric" className="input mt-1 w-full" value={v.deposit} onChange={(e) => set("deposit", e.target.value)} /></label>}
        <label className="col-span-2">Mô tả<textarea className="input mt-1 w-full" rows={2} value={v.description} onChange={(e) => set("description", e.target.value)} maxLength={500} /></label>
        {item && <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={v.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Đang sử dụng</label>}
        {m.error && <p className="col-span-2 text-red-700">{m.error.message}</p>}
        <div className="col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button><button className="btn-primary" disabled={m.isPending}>Lưu</button></div>
      </form>
    </div>
  );
}
