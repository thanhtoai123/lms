"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { COMMISSION_KIND_VI, COMMISSION_STATUS_VI, COMMISSION_KINDS, ORDER_TYPES, ORDER_TYPE_VI, type CommissionStatus, type CommissionKind, type OrderType } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { vnd, fmtD } from "@/components/finance-ui";
import type { RouterOutputs } from "@/lib/trpc/types";

type Item = RouterOutputs["finance"]["commissions"]["items"][number];
type Rule = RouterOutputs["finance"]["commissionRules"][number];

const CHIP: Record<CommissionStatus, string> = { accrued: "bg-amber-100 text-amber-800", approved: "bg-sky-100 text-sky-800", paid: "bg-green-100 text-green-800", cancelled: "bg-slate-100 text-slate-600" };

export function CommissionTable({ items }: { items: Item[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [sel, setSel] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const decide = useMutation(trpc.finance.decideCommissions.mutationOptions({
    onSuccess: (r, v) => { setMsg({ ok: true, text: `${v.action === "approve" ? "Đã duyệt" : v.action === "pay" ? "Đã chi" : "Đã huỷ"} ${r.count} dòng · ${vnd(r.total)}` }); setSel([]); setText(""); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const chosen = items.filter((i) => sel.includes(i.id));
  const allApprove = chosen.length > 0 && chosen.every((i) => i.canApprove);
  const allPay = chosen.length > 0 && chosen.every((i) => i.canPay);
  const allCancel = chosen.length > 0 && chosen.every((i) => i.canCancel);
  const selectable = items.filter((i) => i.canApprove || i.canPay || i.canCancel);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const run = (action: "approve" | "pay" | "cancel") => { setMsg(null); decide.mutate({ ids: sel, action, reason: action === "cancel" ? text.trim() : null, payoutRef: action === "pay" ? text.trim() || null : null }); };
  return (
    <div className="space-y-2">
      {selectable.length > 0 && (
        <div className="card flex flex-wrap items-center gap-2 p-3 text-sm">
          <span>Đã chọn {chosen.length} · {vnd(chosen.reduce((s, i) => s + i.amount, 0))}</span>
          <input className="input w-64 !py-1 text-xs" placeholder="Mã chi (khi chi) / lý do (khi huỷ)" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn-primary !py-1 text-xs" disabled={!allApprove || decide.isPending} onClick={() => run("approve")}>Duyệt</button>
          <button className="btn-primary !py-1 text-xs" disabled={!allPay || decide.isPending} onClick={() => run("pay")}>Đánh dấu đã chi</button>
          <button className="btn-ghost !py-1 text-xs" disabled={!allCancel || text.trim().length < 5 || decide.isPending} onClick={() => run("cancel")}>Huỷ</button>
          {chosen.length > 0 && !allApprove && !allPay && !allCancel && <span className="text-xs text-amber-700">Các dòng đã chọn không cùng thao tác được</span>}
        </div>
      )}
      {msg && <div className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-ink-400">
            <tr>
              <th className="p-3">{selectable.length > 0 && <input type="checkbox" checked={sel.length > 0 && sel.length === selectable.length} onChange={(e) => setSel(e.target.checked ? selectable.map((i) => i.id) : [])} />}</th>
              <th className="p-3">Kỳ</th><th className="p-3">Người hưởng</th><th className="p-3">Đơn</th><th className="p-3 text-right">Giá trị tính</th><th className="p-3">Mức</th><th className="p-3 text-right">Hoa hồng</th><th className="p-3">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 align-top">
            {items.map((i) => (
              <tr key={i.id} className={i.amount < 0 ? "bg-red-50/50" : ""}>
                <td className="p-3">{(i.canApprove || i.canPay || i.canCancel) && <input type="checkbox" checked={sel.includes(i.id)} onChange={() => toggle(i.id)} />}</td>
                <td className="p-3 text-xs">{i.period.split("-").reverse().join("/")}</td>
                <td className="p-3">{i.beneficiaryName}<div className="text-xs text-ink-400">{COMMISSION_KIND_VI[i.kind]}{i.parentId ? " · thu hồi" : ""}</div></td>
                <td className="p-3 text-xs"><Link href={`/orders/${i.orderId}`} className="font-mono text-brand-600">{i.orderCode}</Link><div>{i.studentName ?? i.customerName} · {i.centerCode}</div></td>
                <td className="p-3 text-right tabular-nums">{vnd(i.baseAmount)}</td>
                <td className="p-3 text-xs">{i.rateLabel}</td>
                <td className={`p-3 text-right font-semibold tabular-nums ${i.amount < 0 ? "text-red-700" : ""}`}>{vnd(i.amount)}{i.amount !== i.originalAmount && <div className="text-xs font-normal text-ink-400 line-through">{vnd(i.originalAmount)}</div>}</td>
                <td className="p-3 text-xs">
                  <span className={`chip ${CHIP[i.status]}`}>{COMMISSION_STATUS_VI[i.status]}</span>
                  {i.approverName && <div className="text-ink-400">Duyệt: {i.approverName}</div>}
                  {i.payerName && <div className="text-ink-400">Chi: {i.payerName}{i.paidAt ? ` · ${fmtD(i.paidAt)}` : ""}{i.payoutRef ? ` · ${i.payoutRef}` : ""}</div>}
                  {i.note && <div className="text-ink-600">{i.note}</div>}
                  {i.cancelReason && <div className="text-red-700">{i.cancelReason}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AccrueMissing() {
  const trpc = useTRPC();
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const m = useMutation(trpc.finance.accrueMissing.mutationOptions({ onSuccess: (r) => { setMsg(`Quét ${r.scanned} đơn, tạo ${r.created} dòng`); router.refresh(); }, onError: (e) => setMsg(e.message) }));
  return (
    <span className="flex items-center gap-2">
      <button className="btn-ghost" disabled={m.isPending} onClick={() => m.mutate({})} title="Tính cho đơn đã thu đủ nhưng chưa có hoa hồng (VD: quy tắc tạo sau)">Tính bổ sung</button>
      {msg && <span className="text-xs text-ink-600">{msg}</span>}
    </span>
  );
}

type Form = { id?: string; name: string; kind: CommissionKind; centerId: string; orderType: OrderType | ""; rateType: "percent" | "fixed"; value: string; maxAmount: string; minOrderTotal: string; effectiveFrom: string; effectiveTo: string; isActive: boolean };
const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const blank = (): Form => ({ name: "", kind: "sale", centerId: "", orderType: "course", rateType: "percent", value: "5", maxAmount: "", minOrderTotal: "0", effectiveFrom: today(), effectiveTo: "", isActive: true });

export function RulesPanel({ rules, centers, canConfigure }: { rules: Rule[]; centers: { id: string; code: string }[]; canConfigure: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [f, setF] = useState<Form | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation(trpc.finance.upsertCommissionRule.mutationOptions({ onSuccess: () => { setF(null); setErr(null); router.refresh(); }, onError: (e) => setErr(e.message) }));
  const edit = (r: Rule) => setF({
    id: r.id, name: r.name, kind: r.kind, centerId: r.centerId ?? "", orderType: r.orderType ?? "", rateType: r.rateType,
    value: r.rateType === "percent" ? String(r.value / 100) : String(r.value), maxAmount: r.maxAmount != null ? String(r.maxAmount) : "", minOrderTotal: String(r.minOrderTotal),
    effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo ?? "", isActive: r.isActive,
  });
  const submit = () => {
    if (!f) return;
    const v = Number(f.value.replace(",", "."));
    save.mutate({
      id: f.id, name: f.name, kind: f.kind, centerId: f.centerId || null, orderType: f.orderType || null, rateType: f.rateType,
      value: f.rateType === "percent" ? Math.round(v * 100) : Math.round(v), maxAmount: f.maxAmount ? Number(f.maxAmount) : null, minOrderTotal: Number(f.minOrderTotal || 0),
      effectiveFrom: f.effectiveFrom, effectiveTo: f.effectiveTo || null, isActive: f.isActive,
    });
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => (x ? { ...x, [k]: v } : x));
  return (
    <div className="space-y-3">
      {canConfigure && !f && <button className="btn-primary" onClick={() => setF(blank())}>+ Thêm quy tắc</button>}
      {f && (
        <section className="card grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-ink-600 sm:col-span-2">Tên<input className="input mt-1" value={f.name} onChange={(e) => set("name", e.target.value)} /></label>
          <label className="text-xs text-ink-600">Người hưởng<select className="input mt-1" value={f.kind} onChange={(e) => set("kind", e.target.value as CommissionKind)}>{COMMISSION_KINDS.map((k) => <option key={k} value={k}>{COMMISSION_KIND_VI[k]}</option>)}</select></label>
          <label className="text-xs text-ink-600">Phạm vi<select className="input mt-1" value={f.centerId} disabled={!!f.id} onChange={(e) => set("centerId", e.target.value)}><option value="">Dùng chung</option>{centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></label>
          <label className="text-xs text-ink-600">Loại đơn<select className="input mt-1" value={f.orderType} onChange={(e) => set("orderType", e.target.value as OrderType | "")}><option value="">Mọi loại</option>{ORDER_TYPES.map((t) => <option key={t} value={t}>{ORDER_TYPE_VI[t]}</option>)}</select></label>
          <label className="text-xs text-ink-600">Cách tính<select className="input mt-1" value={f.rateType} onChange={(e) => set("rateType", e.target.value as "percent" | "fixed")}><option value="percent">% giá trị đơn</option><option value="fixed">Số tiền cố định</option></select></label>
          <label className="text-xs text-ink-600">{f.rateType === "percent" ? "Tỷ lệ (%)" : "Số tiền (đ)"}<input className="input mt-1" inputMode="decimal" value={f.value} onChange={(e) => set("value", e.target.value)} /></label>
          <label className="text-xs text-ink-600">Tối đa (đ, tuỳ chọn)<input className="input mt-1" type="number" min={0} step={1000} value={f.maxAmount} onChange={(e) => set("maxAmount", e.target.value)} /></label>
          <label className="text-xs text-ink-600">Đơn tối thiểu (đ)<input className="input mt-1" type="number" min={0} step={1000} value={f.minOrderTotal} onChange={(e) => set("minOrderTotal", e.target.value)} /></label>
          <label className="text-xs text-ink-600">Hiệu lực từ<input className="input mt-1" type="date" value={f.effectiveFrom} onChange={(e) => set("effectiveFrom", e.target.value)} /></label>
          <label className="text-xs text-ink-600">Đến (tuỳ chọn)<input className="input mt-1" type="date" value={f.effectiveTo} onChange={(e) => set("effectiveTo", e.target.value)} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Đang áp dụng</label>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button className="btn-primary" disabled={save.isPending || f.name.trim().length < 3 || !f.value} onClick={submit}>Lưu</button>
            <button className="btn-ghost" onClick={() => { setF(null); setErr(null); }}>Huỷ</button>
            {err && <span className="text-sm text-red-700">{err}</span>}
          </div>
        </section>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Quy tắc</th><th className="p-3">Người hưởng</th><th className="p-3">Phạm vi</th><th className="p-3">Mức</th><th className="p-3">Hiệu lực</th><th className="p-3 text-right">Đã dùng</th><th className="p-3"></th></tr></thead>
          <tbody className="divide-y divide-black/5">
            {rules.length === 0 && <tr><td className="p-3 text-ink-400" colSpan={7}>Chưa có quy tắc — hoa hồng sẽ không được tính.</td></tr>}
            {rules.map((r) => (
              <tr key={r.id} className={r.isActive ? "" : "text-ink-400"}>
                <td className="p-3">{r.name}{!r.isActive && <span className="chip ml-1 bg-slate-100 text-slate-600">Tắt</span>}</td>
                <td className="p-3 text-xs">{COMMISSION_KIND_VI[r.kind]}</td>
                <td className="p-3 text-xs">{r.centerCode ?? "Dùng chung"} · {r.orderType ? ORDER_TYPE_VI[r.orderType] : "mọi loại đơn"}{r.minOrderTotal > 0 ? ` · đơn ≥ ${vnd(r.minOrderTotal)}` : ""}</td>
                <td className="p-3 text-xs">{r.label}</td>
                <td className="p-3 text-xs">{fmtD(r.effectiveFrom)} → {r.effectiveTo ? fmtD(r.effectiveTo) : "…"}</td>
                <td className="p-3 text-right">{r.used}</td>
                <td className="p-3">{r.canEdit && <button className="text-xs text-brand-600" onClick={() => edit(r)}>Sửa</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
