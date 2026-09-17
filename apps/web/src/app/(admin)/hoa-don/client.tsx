"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { TAX_RATES, TAX_RATE_VI, type TaxRate } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

type Settings = { enabled: boolean; provider: "sandbox" | "http"; templateCode: string; serial: string; sellerName: string; sellerTaxCode: string; sellerAddress: string; courseRate: TaxRate; goodsRate: TaxRate; autoDraft: boolean; autoIssue: boolean; startDate: string | null; lookupUrl: string };

export function SettingsForm({ initial, canEdit }: { initial: Settings; canEdit: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [v, setV] = useState(initial);
  const m = useMutation(trpc.invoice.saveSettings.mutationOptions({ onSuccess: () => router.refresh() }));
  const f = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  return (
    <form className="grid gap-2 p-4 text-sm md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); m.mutate({ ...v, startDate: v.startDate || null }); }}>
      <label className="flex items-center gap-2 md:col-span-2"><input type="checkbox" checked={v.enabled} disabled={!canEdit} onChange={f("enabled")} /> Bật hoá đơn điện tử</label>
      <label>Nhà cung cấp<select className="input mt-1" value={v.provider} disabled={!canEdit} onChange={f("provider")}><option value="sandbox">Thử nghiệm (không có giá trị pháp lý)</option><option value="http">Cổng kết nối nhà cung cấp (EINVOICE_API_URL)</option></select></label>
      <div className="grid grid-cols-2 gap-2">
        <label>Mẫu số<select className="input mt-1" value={v.templateCode} disabled={!canEdit} onChange={f("templateCode")}><option value="1">1 — Hoá đơn GTGT</option><option value="2">2 — Hoá đơn bán hàng</option></select></label>
        <label>Ký hiệu<input className="input mt-1 font-mono uppercase" value={v.serial} disabled={!canEdit} onChange={f("serial")} placeholder="1C26TSR" /></label>
      </div>
      <label className="md:col-span-2">Tên đơn vị bán (đúng đăng ký thuế)<input className="input mt-1" value={v.sellerName} disabled={!canEdit} onChange={f("sellerName")} /></label>
      <label>Mã số thuế<input className="input mt-1 font-mono" value={v.sellerTaxCode} disabled={!canEdit} onChange={f("sellerTaxCode")} /></label>
      <label>Địa chỉ<input className="input mt-1" value={v.sellerAddress} disabled={!canEdit} onChange={f("sellerAddress")} /></label>
      <label>Thuế suất học phí<select className="input mt-1" value={v.courseRate} disabled={!canEdit} onChange={f("courseRate")}>{TAX_RATES.map((r) => <option key={r} value={r}>{TAX_RATE_VI[r]}</option>)}</select></label>
      <label>Thuế suất hàng hoá (học cụ, sản phẩm)<select className="input mt-1" value={v.goodsRate} disabled={!canEdit} onChange={f("goodsRate")}>{TAX_RATES.map((r) => <option key={r} value={r}>{TAX_RATE_VI[r]}</option>)}</select></label>
      <label>Áp dụng cho khoản thu từ ngày<input type="date" className="input mt-1" value={v.startDate ?? ""} disabled={!canEdit} onChange={f("startDate")} /></label>
      <label>Trang tra cứu<input className="input mt-1" value={v.lookupUrl} disabled={!canEdit} onChange={f("lookupUrl")} /></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={v.autoDraft} disabled={!canEdit} onChange={f("autoDraft")} /> Tự lập nháp khi khoản thu được xác nhận</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={v.autoIssue} disabled={!canEdit} onChange={f("autoIssue")} /> Tự phát hành ngay (khi đủ thông tin người mua)</label>
      <p className="text-xs text-ink-600 md:col-span-2">Học phí dạy học theo pháp luật giáo dục thường không chịu thuế GTGT (ghi KCT); cần có điều kiện hoạt động giáo dục hợp lệ — xác nhận với kế toán thuế trước khi bật.</p>
      {canEdit && <div className="md:col-span-2"><button className="btn-primary" disabled={m.isPending}>Lưu cấu hình</button>{m.isSuccess && <span className="ml-2 text-green-700">Đã lưu</span>}</div>}
      {m.error && <p className="text-red-700 md:col-span-2">{m.error.message}</p>}
    </form>
  );
}

export function DraftFromPayment({ paymentId }: { paymentId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.invoice.createDraft.mutationOptions({ onSuccess: (r) => router.push(`/hoa-don?id=${r.id}`) }));
  return <><button type="button" className="text-xs text-brand-600 hover:underline" disabled={m.isPending} onClick={() => m.mutate({ paymentId })}>Lập nháp</button>{m.error && <span className="text-xs text-red-700"> {m.error.message}</span>}</>;
}

export function BuyerForm({ id, initial }: { id: string; initial: { buyerName: string | null; buyerCompany: string | null; buyerTaxCode: string | null; buyerAddress: string | null; buyerEmail: string | null; noInvoiceRequested: boolean } }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [v, setV] = useState(initial);
  const m = useMutation(trpc.invoice.updateDraft.mutationOptions({ onSuccess: () => router.refresh() }));
  const t = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value || null });
  return (
    <form className="grid gap-2 text-sm md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); m.mutate({ id, ...v }); }}>
      <label>Người mua<input className="input mt-1" value={v.buyerName ?? ""} onChange={t("buyerName")} /></label>
      <label>Email nhận hoá đơn<input className="input mt-1" value={v.buyerEmail ?? ""} onChange={t("buyerEmail")} /></label>
      <label>Tên đơn vị (nếu lấy hoá đơn công ty)<input className="input mt-1" value={v.buyerCompany ?? ""} onChange={t("buyerCompany")} /></label>
      <label>Mã số thuế<input className="input mt-1 font-mono" value={v.buyerTaxCode ?? ""} onChange={t("buyerTaxCode")} /></label>
      <label className="md:col-span-2">Địa chỉ đơn vị<input className="input mt-1" value={v.buyerAddress ?? ""} onChange={t("buyerAddress")} /></label>
      <label className="flex items-center gap-2 md:col-span-2"><input type="checkbox" checked={v.noInvoiceRequested} onChange={(e) => setV({ ...v, noInvoiceRequested: e.target.checked })} /> Người mua không lấy hoá đơn (vẫn phải lập)</label>
      <div className="md:col-span-2"><button className="btn-ghost" disabled={m.isPending}>Lưu thông tin người mua</button>{m.isSuccess && <span className="ml-2 text-green-700">Đã lưu</span>}</div>
      {m.error && <p className="text-red-700 md:col-span-2">{m.error.message}</p>}
    </form>
  );
}

export function IssueButtons({ id, canIssue, canCancel }: { id: string; canIssue: boolean; canCancel: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const iss = useMutation(trpc.invoice.issue.mutationOptions({ onSuccess: () => router.refresh() }));
  const can = useMutation(trpc.invoice.cancelDraft.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {canIssue && <button type="button" className="btn-primary" disabled={iss.isPending} onClick={() => iss.mutate({ id })}>{iss.isPending ? "Đang phát hành…" : "Phát hành hoá đơn"}</button>}
      {canCancel && <><input className="input !w-48 !py-1.5" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do huỷ nháp" /><button type="button" className="btn-ghost text-red-700" disabled={can.isPending || reason.trim().length < 5} onClick={() => can.mutate({ id, reason })}>Huỷ nháp</button></>}
      {iss.data?.status === "failed" && <p className="w-full text-red-700">Phát hành lỗi: {iss.data.error}</p>}
      {(iss.error || can.error) && <p className="w-full text-red-700">{(iss.error ?? can.error)!.message}</p>}
    </div>
  );
}

type Line = { name: string; unit: string; quantity: number; unitPrice: number; amount: number; taxRate: TaxRate };
export function CorrectionForm({ originalId, lines, refunds }: { originalId: string; lines: Line[]; refunds: { id: string; amount: number; label: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"adjustment" | "replacement">("adjustment");
  const [reason, setReason] = useState("");
  const [agreement, setAgreement] = useState("");
  const [refundId, setRefundId] = useState("");
  const [rows, setRows] = useState<Line[]>([{ name: "Điều chỉnh giảm học phí", unit: "Lần", quantity: 1, unitPrice: 0, amount: 0, taxRate: lines[0]?.taxRate ?? "KCT" }]);
  const [buyer, setBuyer] = useState({ name: "", company: "", taxCode: "", address: "", email: "" });
  const m = useMutation(trpc.invoice.correct.mutationOptions({ onSuccess: (r) => router.push(`/hoa-don?id=${r.id}`) }));
  if (!open) return <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>Lập hoá đơn điều chỉnh / thay thế</button>;
  const setKindAndRows = (k: "adjustment" | "replacement") => {
    setKind(k);
    setRows(k === "replacement" ? lines.map((l) => ({ ...l })) : [{ name: "Điều chỉnh giảm học phí", unit: "Lần", quantity: 1, unitPrice: 0, amount: 0, taxRate: lines[0]?.taxRate ?? "KCT" }]);
  };
  const upd = (i: number, patch: Partial<Line>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <form className="space-y-2 text-sm" onSubmit={(e) => { e.preventDefault(); m.mutate({ originalId, kind, reason, agreementNote: agreement, lines: rows.map((r) => ({ ...r, unitPrice: Math.round(r.amount / (r.quantity || 1)) })), refundId: refundId || null, buyer: kind === "replacement" ? { name: buyer.name || null, company: buyer.company || null, taxCode: buyer.taxCode || null, address: buyer.address || null, email: buyer.email || null } : null }); }}>
      <div className="flex gap-3">
        <label className="flex items-center gap-1"><input type="radio" checked={kind === "adjustment"} onChange={() => setKindAndRows("adjustment")} /> Điều chỉnh (sai số tiền, giảm giá, hoàn tiền)</label>
        <label className="flex items-center gap-1"><input type="radio" checked={kind === "replacement"} onChange={() => setKindAndRows("replacement")} /> Thay thế (sai thông tin người mua / nội dung)</label>
      </div>
      <label className="block">Văn bản thoả thuận với người mua<input className="input mt-1" value={agreement} onChange={(e) => setAgreement(e.target.value)} placeholder="Biên bản số … ngày …" /></label>
      <label className="block">Lý do<input className="input mt-1" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      {kind === "adjustment" && refunds.length > 0 && <label className="block">Gắn khoản hoàn tiền<select className="input mt-1" value={refundId} onChange={(e) => { setRefundId(e.target.value); const r = refunds.find((x) => x.id === e.target.value); if (r) setRows([{ ...rows[0]!, name: `Điều chỉnh giảm do hoàn học phí`, amount: -r.amount }]); }}><option value="">— không —</option>{refunds.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>}
      {kind === "replacement" && (
        <div className="grid gap-2 md:grid-cols-2">
          <input className="input" value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} placeholder="Tên người mua đúng (để trống = giữ)" />
          <input className="input" value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} placeholder="Email" />
          <input className="input" value={buyer.company} onChange={(e) => setBuyer({ ...buyer, company: e.target.value })} placeholder="Tên đơn vị" />
          <input className="input font-mono" value={buyer.taxCode} onChange={(e) => setBuyer({ ...buyer, taxCode: e.target.value })} placeholder="Mã số thuế" />
          <input className="input md:col-span-2" value={buyer.address} onChange={(e) => setBuyer({ ...buyer, address: e.target.value })} placeholder="Địa chỉ đơn vị" />
        </div>
      )}
      <table className="w-full text-xs">
        <thead><tr className="text-left text-ink-400"><th>Nội dung</th><th>ĐVT</th><th>SL</th><th>Thành tiền (âm = giảm)</th><th>Thuế</th><th></th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}>
            <td><input className="input !py-1 !text-xs" value={r.name} onChange={(e) => upd(i, { name: e.target.value })} /></td>
            <td><input className="input !w-16 !py-1 !text-xs" value={r.unit} onChange={(e) => upd(i, { unit: e.target.value })} /></td>
            <td><input type="number" min={1} className="input !w-16 !py-1 !text-xs" value={r.quantity} onChange={(e) => upd(i, { quantity: Number(e.target.value) })} /></td>
            <td><input type="number" className="input !w-32 !py-1 !text-xs" value={r.amount} onChange={(e) => upd(i, { amount: Number(e.target.value) })} /></td>
            <td><select className="input !w-24 !py-1 !text-xs" value={r.taxRate} onChange={(e) => upd(i, { taxRate: e.target.value as TaxRate })}>{TAX_RATES.map((t) => <option key={t} value={t}>{t}</option>)}</select></td>
            <td>{rows.length > 1 && <button type="button" className="text-red-700" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>}</td>
          </tr>
        ))}</tbody>
      </table>
      <button type="button" className="text-xs text-brand-600" onClick={() => setRows([...rows, { name: "", unit: "Lần", quantity: 1, unitPrice: 0, amount: 0, taxRate: rows[0]?.taxRate ?? "KCT" }])}>+ Thêm dòng</button>
      {m.error && <p className="text-red-700">{m.error.message}</p>}
      <div className="flex gap-2"><button className="btn-primary" disabled={m.isPending}>Tạo nháp</button><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Đóng</button></div>
    </form>
  );
}

export function PrintInvoice() {
  return <button type="button" className="btn-ghost" onClick={() => window.print()}>In</button>;
}
