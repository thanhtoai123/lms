"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { PAYMENT_METHOD_KINDS, PAYMENT_METHOD_KIND_VI, type PaymentMethodKind } from "@satarobo/core";

type M = { id: string; code: string; name: string; kind: PaymentMethodKind; centerId: string | null; bankBin: string | null; bankName: string | null; accountNo: string | null; accountName: string | null; description: string | null; allowFor: string[]; sortOrder: number; isActive: boolean };
const FOR = [["course", "Khoá học"], ["product", "Sản phẩm"], ["exam", "Kỳ thi"], ["other", "Khác"]] as const;

export function MethodEditor({ method, centers }: { method?: M; centers: { id: string; code: string; name: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const init = { code: method?.code ?? "", name: method?.name ?? "", kind: method?.kind ?? ("bank_transfer" as PaymentMethodKind), centerId: method?.centerId ?? "", bankBin: method?.bankBin ?? "", bankName: method?.bankName ?? "", accountNo: method?.accountNo ?? "", accountName: method?.accountName ?? "", description: method?.description ?? "", allowFor: method?.allowFor ?? ["course"], sortOrder: method?.sortOrder ?? 0, isActive: method?.isActive ?? true };
  const [f, setF] = useState(init);
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation(trpc.finance.upsertMethod.mutationOptions({ onSuccess: () => { setOpen(false); if (!method) setF(init); router.refresh(); }, onError: (e) => setErr(e.message) }));
  if (!open) return <button className={method ? "text-xs font-semibold text-brand-600" : "btn-primary"} onClick={() => { setOpen(true); setErr(null); }}>{method ? "Sửa" : "+ Thêm phương thức"}</button>;
  const toggle = (k: string) => setF({ ...f, allowFor: f.allowFor.includes(k) ? f.allowFor.filter((x) => x !== k) : [...f.allowFor, k] });
  return (
    <div className={method ? "fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/30 p-4" : ""}>
      <div className="card w-full max-w-3xl space-y-3 p-4">
        <h2 className="font-semibold">{method ? `Sửa ${method.code}` : "Thêm phương thức thanh toán"}</h2>
        {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="text-xs text-ink-600">Mã *<input className="input mt-1 font-mono uppercase" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="CK-VCB" /></label>
          <label className="text-xs text-ink-600 sm:col-span-2">Tên *<input className="input mt-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="text-xs text-ink-600">Loại *
            <select className="input mt-1" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as PaymentMethodKind })}>{PAYMENT_METHOD_KINDS.map((k) => <option key={k} value={k}>{PAYMENT_METHOD_KIND_VI[k]}</option>)}</select>
          </label>
          <label className="text-xs text-ink-600">Cơ sở áp dụng
            <select className="input mt-1" value={f.centerId} onChange={(e) => setF({ ...f, centerId: e.target.value })}>
              <option value="">Dùng chung</option>
              {centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
            </select>
          </label>
          {f.kind === "bank_transfer" && (
            <>
              <label className="text-xs text-ink-600">Mã BIN ngân hàng *<input className="input mt-1 font-mono" value={f.bankBin} onChange={(e) => setF({ ...f, bankBin: e.target.value })} placeholder="970436" /></label>
              <label className="text-xs text-ink-600">Ngân hàng<input className="input mt-1" value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} /></label>
              <label className="text-xs text-ink-600">Số tài khoản *<input className="input mt-1 font-mono" value={f.accountNo} onChange={(e) => setF({ ...f, accountNo: e.target.value })} /></label>
              <label className="text-xs text-ink-600 sm:col-span-2">Chủ tài khoản *<input className="input mt-1 uppercase" value={f.accountName} onChange={(e) => setF({ ...f, accountName: e.target.value })} /></label>
            </>
          )}
          <label className="text-xs text-ink-600">Thứ tự<input type="number" min={0} className="input mt-1" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })} /></label>
          <label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Đang dùng</label>
        </div>
        <div className="flex flex-wrap gap-2 text-sm"><span className="text-xs text-ink-600">Cho phép thanh toán:</span>{FOR.map(([k, l]) => <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={f.allowFor.includes(k)} onChange={() => toggle(k)} /> {l}</label>)}</div>
        <label className="block text-xs text-ink-600">Mô tả<input className="input mt-1" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate({
            id: method?.id, code: f.code, name: f.name, kind: f.kind, centerId: f.centerId || null, bankBin: f.bankBin || null, bankName: f.bankName || null,
            accountNo: f.accountNo || null, accountName: f.accountName || null, description: f.description || null, allowFor: f.allowFor as ("course" | "product" | "exam" | "other")[], sortOrder: f.sortOrder, isActive: f.isActive,
          })}>{save.isPending ? "Đang lưu…" : "Lưu"}</button>
          <button className="btn-ghost" onClick={() => setOpen(false)}>Thôi</button>
        </div>
      </div>
    </div>
  );
}
