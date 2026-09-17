"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { AFFILIATE_TYPES, AFFILIATE_TYPE_VI, suggestRefCode, type AffiliateType } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

type Aff = { id?: string; name: string; code: string; type: AffiliateType; phone: string | null; email: string | null; centerId: string | null; rule: { kind: "fixed" | "percent"; value: number; cap: number | null }; payoutInfo: string | null; notes: string | null; isActive: boolean; parentPhone?: string | null; staffId?: string | null };

export function AffiliateForm({ centers, globalCreate, nextSeq, aff }: { centers: { id: string; code: string }[]; globalCreate: boolean; nextSeq: number; aff?: Aff }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Aff>(aff ?? { name: "", code: "", type: "parent", phone: null, email: null, centerId: globalCreate ? null : centers[0]?.id ?? null, rule: { kind: "fixed", value: 300000, cap: null }, payoutInfo: null, notes: null, isActive: true, parentPhone: null, staffId: null });
  const m = useMutation(trpc.affiliate.upsert.mutationOptions({ onSuccess: (r) => { setOpen(false); if (!aff) router.push(`/affiliates/${r.id}`); router.refresh(); } }));
  if (!open) return <button type="button" className={aff ? "btn-ghost" : "btn-primary"} onClick={() => setOpen(true)}>{aff ? "Sửa" : "+ Nguồn giới thiệu"}</button>;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <form className="card mt-10 grid w-full max-w-xl grid-cols-2 gap-2 p-4 text-sm" onSubmit={(e) => { e.preventDefault(); m.mutate({ ...v, id: aff?.id }); }}>
        <h3 className="col-span-2 font-semibold">{aff ? "Sửa nguồn giới thiệu" : "Nguồn giới thiệu mới"}</h3>
        <label className="col-span-2">Tên<input className="input mt-1" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value, code: aff || v.code ? v.code : "" })} onBlur={() => !v.code && v.name && setV({ ...v, code: suggestRefCode(v.name, nextSeq) })} required /></label>
        <label>Loại<select className="input mt-1" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as AffiliateType })}>{AFFILIATE_TYPES.filter((t) => t !== "staff").map((t) => <option key={t} value={t}>{AFFILIATE_TYPE_VI[t]}</option>)}</select></label>
        <label>Mã giới thiệu<input className="input mt-1 font-mono uppercase" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} required /></label>
        <label>SĐT<input className="input mt-1" value={v.phone ?? ""} onChange={(e) => setV({ ...v, phone: e.target.value || null })} /></label>
        <label>Cơ sở<select className="input mt-1" value={v.centerId ?? ""} onChange={(e) => setV({ ...v, centerId: e.target.value || null })}>{globalCreate && <option value="">Toàn hệ thống</option>}{centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></label>
        {v.type === "parent" && <label className="col-span-2">SĐT phụ huynh trong hệ thống (để chặn tự giới thiệu)<input className="input mt-1" value={v.parentPhone ?? ""} onChange={(e) => setV({ ...v, parentPhone: e.target.value || null })} /></label>}
        <label>Cách tính thưởng<select className="input mt-1" value={v.rule.kind} onChange={(e) => setV({ ...v, rule: { ...v.rule, kind: e.target.value as "fixed" | "percent" } })}><option value="fixed">Cố định / học viên</option><option value="percent">% đơn học phí đầu</option></select></label>
        <label>{v.rule.kind === "fixed" ? "Số tiền (đ)" : "Tỉ lệ (%)"}<input type="number" min={0} step={v.rule.kind === "fixed" ? 10000 : 0.5} className="input mt-1" value={v.rule.value} onChange={(e) => setV({ ...v, rule: { ...v.rule, value: Number(e.target.value) } })} /></label>
        {v.rule.kind === "percent" && <label>Mức trần (đ)<input type="number" min={0} className="input mt-1" value={v.rule.cap ?? ""} onChange={(e) => setV({ ...v, rule: { ...v.rule, cap: e.target.value ? Number(e.target.value) : null } })} /></label>}
        <label className="col-span-2">Thông tin nhận thưởng (STK / tiền mặt / trừ học phí)<input className="input mt-1" value={v.payoutInfo ?? ""} onChange={(e) => setV({ ...v, payoutInfo: e.target.value || null })} /></label>
        <label className="col-span-2">Ghi chú<textarea className="input mt-1" rows={2} value={v.notes ?? ""} onChange={(e) => setV({ ...v, notes: e.target.value || null })} /></label>
        {aff && <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} /> Đang hoạt động</label>}
        {m.error && <p className="col-span-2 text-red-700">{m.error.message}</p>}
        <div className="col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button><button className="btn-primary" disabled={m.isPending}>Lưu</button></div>
      </form>
    </div>
  );
}

export function RewardButtons({ id, can }: { id: string; can: { approve: boolean; pay: boolean; cancel: boolean } }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [ref, setRef] = useState("");
  const [reason, setReason] = useState("");
  const m = useMutation(trpc.affiliate.rewardAction.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      {can.approve && <button type="button" className="btn-primary !px-2 !py-1 !text-xs" disabled={m.isPending} onClick={() => m.mutate({ id, action: "approve" })}>Duyệt</button>}
      {can.pay && <><input className="input !w-28 !py-1 !text-xs" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Số chứng từ" /><button type="button" className="btn-primary !px-2 !py-1 !text-xs" disabled={m.isPending} onClick={() => m.mutate({ id, action: "pay", paymentRef: ref })}>Đã chi</button></>}
      {can.cancel && <><input className="input !w-28 !py-1 !text-xs" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do huỷ" /><button type="button" className="btn-ghost !px-2 !py-1 !text-xs text-red-700" disabled={m.isPending} onClick={() => m.mutate({ id, action: "cancel", reason })}>Huỷ</button></>}
      {m.error && <span className="w-full text-red-700">{m.error.message}</span>}
    </div>
  );
}

export function CopyLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const full = (typeof window !== "undefined" ? window.location.origin : "") + path;
  return (
    <div className="flex gap-1 text-xs"><input readOnly className="input !py-1 !text-xs font-mono" value={full} /><button type="button" className="btn-ghost !py-1 !text-xs" onClick={async () => { try { await navigator.clipboard.writeText(full); setCopied(true); } catch { /* bỏ qua */ } }}>{copied ? "Đã chép" : "Chép"}</button></div>
  );
}
