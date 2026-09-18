"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { vnd } from "@/components/finance-ui";
import { buildPlan, replanInstallments, MAX_INSTALLMENTS, INSTALLMENT_KIND_VI, type InstallmentKind } from "@satarobo/core";

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

/** Gửi email đơn hàng cho khách (mẫu ORDER_CREATED, vào hàng đợi email) */
export function SendOrderEmail({ orderId, customerEmail }: { orderId: string; customerEmail: string | null }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [to, setTo] = useState(customerEmail ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const m = useMutation(trpc.finance.sendOrderEmail.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: `Đã xếp email đơn hàng gửi tới ${r.to} vào hàng đợi.` }); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  return (
    <div className="space-y-2">
      <input className="input" type="email" placeholder="Email nhận đơn" value={to} onChange={(e) => setTo(e.target.value)} />
      <button className="btn-ghost" disabled={m.isPending || !to.includes("@")} onClick={() => { setMsg(null); m.mutate({ orderId, to: to.trim() }); }}>
        {m.isPending ? "Đang gửi…" : "Gửi email đơn hàng"}
      </button>
      {msg && <div className={`text-xs ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</div>}
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

/* ------------------------------------------------------------------ */
/* Kế hoạch thanh toán (Đợt 2 — mục 5)                                  */
/* ------------------------------------------------------------------ */

type PlanRow = { seq: number | null; amount: number; dueDate: string; kind: InstallmentKind };
type CurrentRow = { seq: number; amount: number; dueDate: string; kind: InstallmentKind; paid: number };

export function PlanEditor({ orderId, total, current, today, updatedAt, canEdit }: {
  orderId: string; total: number; current: CurrentRow[]; today: string; updatedAt: string; canEdit: boolean;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PlanRow[]>(current.length ? current.map((c) => ({ seq: c.seq, amount: c.amount, dueDate: c.dueDate, kind: c.kind })) : [{ seq: null, amount: total, dueDate: today, kind: "installment" }]);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation(trpc.finance.replaceInstallmentPlan.mutationOptions({
    onSuccess: () => { setOpen(false); setErr(null); router.refresh(); },
    onError: (e) => setErr(e.message),
  }));

  const errs = useMemo(() => replanInstallments(total, current.map((c) => ({ seq: c.seq, amount: c.amount, paid: c.paid })), rows, { maxInstallments: MAX_INSTALLMENTS }), [total, current, rows]);
  const sum = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const lockedSeqs = new Set(current.filter((c) => c.paid > 0).map((c) => c.seq));
  const apply = (plan: { seq: number; amount: number; dueDate: string; kind?: InstallmentKind }[]) =>
    setRows(plan.map((p) => ({ seq: null, amount: p.amount, dueDate: p.dueDate, kind: p.kind ?? "installment" })));
  const quick = (count: number, opts: { monthly?: boolean; deposit?: number } = {}) => {
    try {
      apply(buildPlan(total, count, today, { monthly: opts.monthly, deposit: opts.deposit ?? null }));
      setErr(null);
    } catch (e) { setErr((e as Error).message); }
  };

  if (!canEdit) return null;
  if (!open) return <button className="btn-ghost !py-1 text-xs" onClick={() => setOpen(true)}>{current.length ? "Sửa kế hoạch thanh toán" : "Thiết lập kế hoạch"}</button>;
  return (
    <div className="space-y-2 rounded-xl border border-black/10 p-3">
      <p className="text-xs text-ink-600">
        Đóng một lần hoặc chia theo học phần (48 buổi = 4 học phần × 12 buổi). Công văn SR.QD.223 nêu mốc các đợt cách 30 ngày;
        SR.QD.219 Điều 2 cho phép chia đều tối đa {MAX_INSTALLMENTS} kỳ theo tháng. Đợt đã thu giữ nguyên.
      </p>
      <div className="flex flex-wrap gap-1 text-xs">
        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => quick(1)}>1 lần</button>
        {[2, 3, 4].map((n) => <button key={n} className="btn-ghost !px-2 !py-1 text-xs" onClick={() => quick(n)}>{n} học phần</button>)}
        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => quick(Math.min(MAX_INSTALLMENTS, 6), { monthly: true })}>6 kỳ / tháng</button>
        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => quick(MAX_INSTALLMENTS, { monthly: true })}>{MAX_INSTALLMENTS} kỳ / tháng</button>
        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => quick(3, { deposit: Math.max(1000, Math.round(total / 10 / 1000) * 1000) })}>Thu cọc trước + 3 đợt</button>
      </div>
      <table className="w-full max-w-xl text-sm">
        <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-1">Phiếu</th><th className="p-1">Hẹn đóng</th><th className="p-1 text-right">Số tiền</th><th className="p-1"></th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const locked = r.seq != null && lockedSeqs.has(r.seq);
            return (
              <tr key={i} className={locked ? "bg-green-50/60" : ""}>
                <td className="p-1 text-xs">
                  <select className="input !py-1 text-xs" value={r.kind} disabled={locked} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, kind: e.target.value as InstallmentKind } : x)))}>
                    <option value="installment">{INSTALLMENT_KIND_VI.installment} {i + 1}</option>
                    <option value="deposit">{INSTALLMENT_KIND_VI.deposit}</option>
                  </select>
                  {locked && <div className="text-[11px] text-green-700">đã thu — giữ nguyên</div>}
                </td>
                <td className="p-1"><input type="date" className="input !py-1 text-xs" value={r.dueDate} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)))} /></td>
                <td className="p-1 text-right"><input type="number" min={1} step={1000} className="input !py-1 text-right text-xs" value={r.amount} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))} /></td>
                <td className="p-1">{!locked && rows.length > 1 && <button className="text-xs text-red-700" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Bỏ</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {rows.length < MAX_INSTALLMENTS + 1 && <button className="font-semibold text-brand-600" onClick={() => setRows([...rows, { seq: null, amount: Math.max(0, total - sum), dueDate: rows[rows.length - 1]?.dueDate ?? today, kind: "installment" }])}>+ Thêm đợt</button>}
        <span className={sum === total ? "text-green-700" : "text-red-700"}>Tổng các phiếu phải bằng {vnd(total)}{sum !== total ? ` — đang lệch ${vnd(Math.abs(sum - total))}` : " ✓"}</span>
      </div>
      {errs.length > 0 && <div className="text-xs text-red-700">{errs.join("; ")}</div>}
      <input className="input !py-1 text-xs" placeholder="Lý do sửa kế hoạch (bắt buộc)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <Err text={err} />
      <div className="flex gap-2">
        <button className="btn-primary !py-1 text-xs" disabled={save.isPending || errs.length > 0 || reason.trim().length < 5}
          onClick={() => save.mutate({ orderId, reason: reason.trim(), expectedUpdatedAt: updatedAt, plan: rows.map((r) => ({ seq: r.seq ?? null, amount: Math.round(r.amount), dueDate: r.dueDate, kind: r.kind })) })}>
          Lưu kế hoạch {rows.some((r) => r.kind === "deposit") ? "cọc + " : ""}{rows.filter((r) => r.kind !== "deposit").length} đợt
        </button>
        <button className="btn-ghost !py-1 text-xs" onClick={() => setOpen(false)}>Thôi</button>
      </div>
    </div>
  );
}

/** Công nợ theo con: tạo / huỷ đợt riêng cho từng dòng đơn */
export function ChildInstallment({ orderId, orderItemId, outstanding, covered, today, canEdit }: {
  orderId: string; orderItemId: string; outstanding: number; covered: number; today: string; canEdit: boolean;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(Math.max(0, outstanding - covered));
  const [dueDate, setDueDate] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const add = useMutation(trpc.finance.createInstallmentForChild.mutationOptions({ onSuccess: () => { setOpen(false); router.refresh(); }, onError: (e) => setErr(e.message) }));
  if (!canEdit) return null;
  if (covered >= outstanding && outstanding > 0) return <p className="text-[11px] text-ink-400">Các đợt đang mở đã phủ hết {vnd(outstanding)} còn nợ.</p>;
  if (!open) return <button className="text-xs font-semibold text-brand-600" onClick={() => setOpen(true)}>+ Tạo đợt cho con này</button>;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        <input type="number" min={1} step={1000} className="input !w-36 !py-1 text-xs" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        <input type="date" className="input !w-40 !py-1 text-xs" min={today} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <button className="btn-primary !px-2 !py-1 text-xs" disabled={add.isPending || amount <= 0} onClick={() => add.mutate({ orderId, orderItemId, amount: Math.round(amount), dueDate: dueDate || null })}>Tạo đợt</button>
        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setOpen(false)}>Thôi</button>
      </div>
      <Err text={err} />
    </div>
  );
}

export function CancelInstallment({ installmentId }: { installmentId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const del = useMutation(trpc.finance.cancelInstallment.mutationOptions({ onSuccess: () => { setOpen(false); router.refresh(); }, onError: (e) => setErr(e.message) }));
  if (!open) return <button className="text-[11px] text-red-700" onClick={() => setOpen(true)}>Huỷ đợt</button>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <input className="input !w-40 !py-1 text-xs" placeholder="Lý do huỷ đợt" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className="btn-ghost !px-2 !py-1 text-xs text-red-700" disabled={del.isPending || reason.trim().length < 5} onClick={() => del.mutate({ installmentId, reason: reason.trim() })}>Xác nhận</button>
      <Err text={err} />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Khoản thu: sửa khoản chờ / điều chỉnh khoản đã xác nhận (mục 9)      */
/* ------------------------------------------------------------------ */

export function EditPendingPayment({ paymentId, amount, paidAt, version, today, evidenceUrl }: {
  paymentId: string; amount: number; paidAt: string; version: number; today: string; evidenceUrl: string | null;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ amount, paidAt, evidenceUrl: evidenceUrl ?? "", note: "" });
  const [err, setErr] = useState<string | null>(null);
  const up = useMutation(trpc.finance.updatePendingPayment.mutationOptions({ onSuccess: () => { setOpen(false); setErr(null); router.refresh(); }, onError: (e) => setErr(e.message) }));
  if (!open) return <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setOpen(true)}>Sửa</button>;
  return (
    <div className="space-y-1 text-xs">
      <div className="flex flex-wrap justify-end gap-1">
        <input type="number" min={1} step={1000} className="input !w-32 !py-1 text-xs" value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} />
        <input type="date" max={today} className="input !w-36 !py-1 text-xs" value={f.paidAt} onChange={(e) => setF({ ...f, paidAt: e.target.value })} />
      </div>
      <input className="input !py-1 text-xs" placeholder="Link chứng từ (https://…)" value={f.evidenceUrl} onChange={(e) => setF({ ...f, evidenceUrl: e.target.value })} />
      <input className="input !py-1 text-xs" placeholder="Ghi chú" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      <Err text={err} />
      <div className="flex justify-end gap-1">
        <button className="btn-primary !px-2 !py-1 text-xs" disabled={up.isPending || f.amount <= 0}
          onClick={() => up.mutate({ paymentId, version, amount: Math.round(f.amount), paidAt: f.paidAt, evidenceUrl: f.evidenceUrl || null, note: f.note || null })}>Lưu</button>
        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setOpen(false)}>Thôi</button>
      </div>
    </div>
  );
}

export function AdjustConfirmedPayment({ paymentId, amount, version }: { paymentId: string; amount: number; version: number }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newAmount, setNewAmount] = useState(amount);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const adj = useMutation(trpc.finance.adjustConfirmedPayment.mutationOptions({ onSuccess: () => { setOpen(false); setErr(null); router.refresh(); }, onError: (e) => setErr(e.message) }));
  const delta = Math.round(newAmount) - amount;
  if (!open) return <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setOpen(true)}>Điều chỉnh</button>;
  return (
    <div className="space-y-1 text-xs">
      <div className="flex flex-wrap justify-end gap-1">
        <input type="number" min={1} step={1000} className="input !w-32 !py-1 text-xs" value={newAmount} onChange={(e) => setNewAmount(Number(e.target.value))} />
        <input className="input !w-48 !py-1 text-xs" placeholder="Lý do điều chỉnh" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className={delta === 0 ? "text-ink-400" : "text-amber-800"}>{delta === 0 ? "Bằng số hiện tại — không có gì để điều chỉnh" : `Sẽ sinh bút toán ${delta > 0 ? "+" : "−"}${vnd(Math.abs(delta))}`}</div>
      <Err text={err} />
      <div className="flex justify-end gap-1">
        <button className="btn-primary !px-2 !py-1 text-xs" disabled={adj.isPending || delta === 0 || reason.trim().length < 5}
          onClick={() => adj.mutate({ paymentId, newAmount: Math.round(newAmount), reason: reason.trim(), version })}>Ghi điều chỉnh</button>
        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setOpen(false)}>Thôi</button>
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
