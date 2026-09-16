"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { vnd } from "@/components/finance-ui";

function Err({ text }: { text: string | null }) {
  return text ? <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{text}</div> : null;
}

export function RecordPayment({ orderId, suggested, methods, defaultMethodId, today }: { orderId: string; suggested: number; methods: { id: string; name: string }[]; defaultMethodId: string; today: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ amount: suggested, paymentMethodId: defaultMethodId || methods[0]?.id || "", paidAt: today, payerName: "", note: "" });
  const [err, setErr] = useState<string | null>(null);
  const rec = useMutation(trpc.finance.recordPayment.mutationOptions({ onSuccess: () => { setOpen(false); setErr(null); router.refresh(); }, onError: (e) => setErr(e.message) }));
  if (!open) return <button className="btn-primary" onClick={() => setOpen(true)}>+ Ghi nhận khoản thu</button>;
  return (
    <div className="space-y-2 rounded-xl border border-black/10 p-3">
      <p className="text-xs text-ink-600">Khoản thu ở trạng thái <b>chờ kế toán xác nhận</b> — chưa trừ công nợ cho tới khi được xác nhận.</p>
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="text-xs text-ink-600">Số tiền (đ)<input type="number" min={1} step={1000} className="input mt-1" value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></label>
        <label className="text-xs text-ink-600">Hình thức
          <select className="input mt-1" value={f.paymentMethodId} onChange={(e) => setF({ ...f, paymentMethodId: e.target.value })}>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        </label>
        <label className="text-xs text-ink-600">Ngày thu<input type="date" max={today} className="input mt-1" value={f.paidAt} onChange={(e) => setF({ ...f, paidAt: e.target.value })} /></label>
        <label className="text-xs text-ink-600">Người nộp<input className="input mt-1" value={f.payerName} onChange={(e) => setF({ ...f, payerName: e.target.value })} /></label>
      </div>
      <input className="input" placeholder="Ghi chú (số biên nhận, nội dung CK…)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      <Err text={err} />
      <div className="flex gap-2">
        <button className="btn-primary" disabled={rec.isPending || f.amount <= 0 || !f.paymentMethodId} onClick={() => rec.mutate({ orderId, amount: Math.round(f.amount), paymentMethodId: f.paymentMethodId, paidAt: f.paidAt, payerName: f.payerName || null, note: f.note || null })}>Ghi nhận {vnd(f.amount)}</button>
        <button className="btn-ghost" onClick={() => setOpen(false)}>Thôi</button>
      </div>
    </div>
  );
}

export function DecidePayment({ paymentId, amount, compact }: { paymentId: string; amount: number; compact?: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [mode, setMode] = useState<"reject" | "adjust" | null>(null);
  const [reason, setReason] = useState("");
  const [adj, setAdj] = useState(amount);
  const [err, setErr] = useState<string | null>(null);
  const dec = useMutation(trpc.finance.decidePayment.mutationOptions({ onSuccess: () => { setMode(null); setErr(null); router.refresh(); }, onError: (e) => setErr(e.message) }));
  return (
    <div className={`space-y-1 ${compact ? "" : "text-right"}`}>
      <div className="flex flex-wrap justify-end gap-1">
        <button className="btn-primary !px-2 !py-1 text-xs" disabled={dec.isPending} onClick={() => dec.mutate({ paymentId, decision: "confirm" })}>Xác nhận</button>
        <button className="btn-ghost !px-2 !py-1 text-xs" disabled={dec.isPending} onClick={() => setMode(mode === "adjust" ? null : "adjust")}>Điều chỉnh</button>
        <button className="btn-ghost !px-2 !py-1 text-xs text-red-700" disabled={dec.isPending} onClick={() => setMode(mode === "reject" ? null : "reject")}>Từ chối</button>
      </div>
      {mode && (
        <div className="flex flex-wrap justify-end gap-1">
          {mode === "adjust" && <input type="number" min={1} step={1000} className="input !w-32 !py-1 text-xs" value={adj} onChange={(e) => setAdj(Number(e.target.value))} />}
          <input className="input !w-48 !py-1 text-xs" placeholder={mode === "adjust" ? "Lý do điều chỉnh" : "Lý do từ chối"} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn-primary !px-2 !py-1 text-xs" disabled={dec.isPending || reason.trim().length < 5} onClick={() => dec.mutate({ paymentId, decision: mode, adjustedAmount: mode === "adjust" ? Math.round(adj) : null, reason: reason.trim() })}>OK</button>
        </div>
      )}
      <Err text={err} />
    </div>
  );
}

export function CancelOrder({ orderId }: { orderId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const c = useMutation(trpc.finance.cancelOrder.mutationOptions({ onSuccess: () => router.refresh(), onError: (e) => setErr(e.message) }));
  return (
    <div className="space-y-2">
      <input className="input" placeholder="Lý do huỷ (bắt buộc)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <Err text={err} />
      <button className="btn-ghost text-red-700" disabled={c.isPending || reason.trim().length < 5} onClick={() => c.mutate({ id: orderId, reason: reason.trim() })}>Huỷ đơn</button>
    </div>
  );
}

export function NotesEditor({ orderId, internalNote, customerNote, remindDays, canEdit }: { orderId: string; internalNote: string | null; customerNote: string | null; remindDays: number; canEdit: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ internalNote: internalNote ?? "", customerNote: customerNote ?? "", remindDays });
  const save = useMutation(trpc.finance.updateOrderNotes.mutationOptions({ onSuccess: () => { setEdit(false); router.refresh(); } }));
  if (!edit) {
    return (
      <div className="space-y-1">
        <div><span className="text-xs text-ink-400">Nội bộ:</span> {internalNote ?? "—"}</div>
        <div><span className="text-xs text-ink-400">Cho khách:</span> {customerNote ?? "—"}</div>
        <div className="text-xs text-ink-400">Nhắc công nợ trước {remindDays} ngày</div>
        {canEdit && <button className="text-xs font-semibold text-brand-600" onClick={() => setEdit(true)}>Sửa</button>}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <textarea className="input min-h-16" value={f.internalNote} onChange={(e) => setF({ ...f, internalNote: e.target.value })} placeholder="Ghi chú nội bộ" />
      <textarea className="input min-h-16" value={f.customerNote} onChange={(e) => setF({ ...f, customerNote: e.target.value })} placeholder="Ghi chú cho khách" />
      <label className="text-xs text-ink-600">Nhắc trước (ngày)<input type="number" min={0} max={30} className="input mt-1 w-24" value={f.remindDays} onChange={(e) => setF({ ...f, remindDays: Number(e.target.value) })} /></label>
      <div className="flex gap-2">
        <button className="btn-primary !py-1" disabled={save.isPending} onClick={() => save.mutate({ id: orderId, internalNote: f.internalNote || null, customerNote: f.customerNote || null, remindDays: f.remindDays })}>Lưu</button>
        <button className="btn-ghost !py-1" onClick={() => setEdit(false)}>Thôi</button>
      </div>
    </div>
  );
}

export function RevealCustomer({ orderId }: { orderId: string }) {
  const trpc = useTRPC();
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const r = useMutation(trpc.finance.revealCustomer.mutationOptions({ onError: (e) => setErr(e.message) }));
  if (r.data) return <div className="rounded-lg bg-amber-50 p-2 text-xs">CCCD: <b className="font-mono">{r.data.idNumber ?? "—"}</b><div>{[r.data.address, r.data.ward, r.data.province].filter(Boolean).join(", ")}</div><div className="text-ink-400">Lượt xem đã được ghi nhật ký.</div></div>;
  if (!open) return <button className="text-xs font-semibold text-brand-600" onClick={() => setOpen(true)}>Xem đầy đủ (ghi nhật ký)</button>;
  return (
    <div className="space-y-1">
      <input className="input !py-1 text-xs" placeholder="Lý do xem (xuất hoá đơn, đối soát…)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <Err text={err} />
      <button className="btn-ghost !py-1 text-xs" disabled={r.isPending || reason.trim().length < 5} onClick={() => r.mutate({ id: orderId, reason: reason.trim() })}>Xem</button>
    </div>
  );
}
