"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { allocationFitLabel } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { vnd, fmtD } from "@/components/finance-ui";
import { CsvFileInput } from "@/components/csv-file-input";
import type { RouterOutputs } from "@/lib/trpc/types";

type Mode = null | "match" | "ignore" | "unlink";

/** Bảng “X đ cho từng con” — Khớp đủ / Đang thừa / Còn thiếu, tạo đợt tại chỗ */
function AllocateOrder({ id, txAmount, orderId, onBack }: { id: string; txAmount: number; orderId: string; onBack: () => void }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [instFor, setInstFor] = useState<string | null>(null);
  const [instAmount, setInstAmount] = useState(0);
  const [instDue, setInstDue] = useState("");
  const pv = useQuery({ ...trpc.finance.bankAllocationPreview.queryOptions({ id, orderId }), retry: false });
  const fail = (e: { message: string }) => setMsg({ ok: false, text: e.message });
  const run = useMutation(trpc.finance.bankAllocate.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: `Đã rót ${vnd(r.allocated)} vào ${r.orderCode}${r.surplus ? ` · thừa ${vnd(r.surplus)} (chưa xử lý)` : ""} · phiếu ${r.receipts.join(", ")}` }); router.refresh(); },
    onError: fail,
  }));
  const addInst = useMutation(trpc.finance.createInstallmentForChild.mutationOptions({ onSuccess: () => { setInstFor(null); pv.refetch(); router.refresh(); }, onError: fail }));
  const d = pv.data;
  const allocated = Object.values(amounts).reduce((s, v) => s + (Number(v) || 0), 0);
  // Nhãn đối soát tính bằng đúng hàm thuần dùng ở máy chủ
  const { fit, label: fitLabel } = allocationFitLabel(txAmount, allocated);
  return (
    <div className="space-y-1 rounded-xl border border-black/10 p-2">
      <div className="flex items-center justify-between">
        <b>{vnd(txAmount)} cho từng con {d ? `· đơn ${d.order.code}` : ""}</b>
        <button className="text-brand-600" onClick={onBack}>← Đổi đơn</button>
      </div>
      {pv.error && <div className="text-red-700">{pv.error.message}</div>}
      {d && (
        <>
          <table className="w-full text-xs">
            <thead className="text-left text-ink-400"><tr><th className="p-1">Con</th><th className="p-1 text-right">Còn thiếu</th><th className="p-1 text-right">Rót</th><th className="p-1">Đợt đang mở</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.lines.map((l) => (
                <tr key={l.orderItemId}>
                  <td className="p-1">{l.studentName ?? l.description}{l.classCode ? <div className="text-ink-400">{l.classCode}</div> : null}</td>
                  <td className="p-1 text-right tabular-nums">{vnd(l.outstanding)}</td>
                  <td className="p-1 text-right">
                    <input type="number" min={0} step={1000} className="input !w-32 !py-1 text-right text-xs" value={amounts[l.orderItemId] ?? 0}
                      onChange={(e) => setAmounts({ ...amounts, [l.orderItemId]: Number(e.target.value) })} />
                  </td>
                  <td className="p-1">
                    {l.installments.map((p) => <div key={p.id}>Đợt {p.seq}: {vnd(p.amount)} · {fmtD(p.dueDate)}</div>)}
                    {instFor === l.orderItemId ? (
                      <div className="flex flex-wrap gap-1">
                        <input type="number" min={1} step={1000} className="input !w-28 !py-1 text-xs" value={instAmount} onChange={(e) => setInstAmount(Number(e.target.value))} />
                        <input type="date" className="input !w-32 !py-1 text-xs" value={instDue} onChange={(e) => setInstDue(e.target.value)} />
                        <button className="btn-primary !px-2 !py-1 text-xs" disabled={addInst.isPending || instAmount <= 0} onClick={() => addInst.mutate({ orderId, orderItemId: l.orderItemId, amount: Math.round(instAmount), dueDate: instDue || null })}>Tạo đợt</button>
                      </div>
                    ) : <button className="text-brand-600" onClick={() => { setInstFor(l.orderItemId); setInstAmount(Math.max(0, l.outstanding - l.covered)); }}>+ Tạo đợt tại chỗ</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={fit === "exact" ? "text-green-700" : fit === "short" ? "text-red-700" : "text-amber-800"}>
            Đã rót {vnd(allocated)} / {vnd(txAmount)} — {fitLabel}
          </div>
          <p className="text-[11px] text-ink-400">Tiền còn dư sau khi rót hết các đợt của đơn sẽ vào khối “Tiền thừa chưa xử lý”. Hệ thống không tự hoàn và không tự trừ sang đơn khác.</p>
          <input className="input !py-1 text-xs" placeholder="Ghi chú (bắt buộc nếu giao dịch đang Cần kiểm tra)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-primary w-full !py-1 text-xs" disabled={run.isPending || allocated <= 0 || allocated > txAmount}
            onClick={() => run.mutate({ id, orderId, note: note.trim() || null, allocations: Object.entries(amounts).filter(([, v]) => Number(v) > 0).map(([orderItemId, v]) => ({ orderItemId, amount: Math.round(Number(v)) })) })}>
            Ghi phân bổ {vnd(allocated)}
          </button>
        </>
      )}
      {msg && <div className={msg.ok ? "text-green-700" : "text-red-700"}>{msg.text}</div>}
    </div>
  );
}

export function BankRowActions({ id, amount, status, canUnlink }: { id: string; amount: number; status: "unmatched" | "needs_review" | "matched" | "ignored"; canUnlink?: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [q, setQ] = useState("");
  const [orderId, setOrderId] = useState("");
  const [allocOrderId, setAllocOrderId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const cands = useQuery({ ...trpc.finance.bankCandidates.queryOptions({ id, q: q.trim() || undefined }), enabled: mode === "match" && !allocOrderId, retry: false });
  const fail = (e: { message: string }) => setMsg({ ok: false, text: e.message });
  const match = useMutation(trpc.finance.bankMatch.mutationOptions({ onSuccess: (r) => { setMsg({ ok: true, text: `Đã khớp ${r.orderCode} · phiếu ${r.receiptNo}` }); setMode(null); router.refresh(); }, onError: fail }));
  const ignore = useMutation(trpc.finance.bankIgnore.mutationOptions({ onSuccess: () => { setMode(null); router.refresh(); }, onError: fail }));
  const rematch = useMutation(trpc.finance.bankRematch.mutationOptions({ onSuccess: (r) => { setMsg({ ok: r.status === "matched", text: r.status === "matched" ? `Đã khớp ${r.orderCode}` : r.note }); router.refresh(); }, onError: fail }));
  const unlink = useMutation(trpc.finance.bankUnlink.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: `Đã gỡ gắn — huỷ ${r.voided} khoản, trả ${r.reverted} khoản về chờ kế toán` }); setMode(null); router.refresh(); },
    onError: fail,
  }));
  const needNote = status === "needs_review";
  const open = status === "unmatched" || status === "needs_review";
  return (
    <div className="min-w-[15rem] space-y-1 text-xs">
      <div className="flex flex-wrap gap-1">
        {open && <button className="btn-primary !px-2 !py-1 text-xs" onClick={() => { setMsg(null); setAllocOrderId(null); setMode(mode === "match" ? null : "match"); }}>Gắn vào đơn</button>}
        {open && <button className="btn-ghost !px-2 !py-1 text-xs" disabled={rematch.isPending} onClick={() => { setMsg(null); rematch.mutate({ id }); }}>Thử khớp lại</button>}
        {open && <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { setMsg(null); setMode(mode === "ignore" ? null : "ignore"); }}>Không phải học phí</button>}
        {canUnlink && <button className="btn-ghost !px-2 !py-1 text-xs text-red-700" onClick={() => { setMsg(null); setMode(mode === "unlink" ? null : "unlink"); }}>Gỡ gắn</button>}
      </div>
      {mode === "match" && (allocOrderId
        ? <AllocateOrder id={id} txAmount={amount} orderId={allocOrderId} onBack={() => setAllocOrderId(null)} />
        : (
          <div className="space-y-1 rounded-xl border border-black/10 p-2">
            <input className="input !py-1 text-xs" placeholder="Tìm mã đơn, tên PH/HV, SĐT…" value={q} onChange={(e) => setQ(e.target.value)} />
            {cands.error && <div className="text-red-700">{cands.error.message}</div>}
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {(cands.data?.items ?? []).length === 0 && !cands.isLoading && <div className="text-ink-400">Không có đơn còn nợ ≥ {vnd(amount)}.</div>}
              {(cands.data?.items ?? []).map((o) => (
                <label key={o.id} className={`flex cursor-pointer gap-2 rounded-lg p-1.5 ${orderId === o.id ? "bg-brand-50" : "hover:bg-black/[0.03]"}`}>
                  <input type="radio" name={`o-${id}`} checked={orderId === o.id} onChange={() => setOrderId(o.id)} />
                  <span>
                    <b className="font-mono">{o.code}</b> · {o.studentName ?? o.customerName} · {o.centerCode}
                    <span className="block text-ink-600">Còn {vnd(o.outstanding)}{o.nextDue ? ` · kỳ ${o.nextDue.seq}: ${vnd(o.nextDue.remaining)} (${fmtD(o.nextDue.dueDate)})` : ""}{o.pending ? ` · chờ XN ${vnd(o.pending)}` : ""}</span>
                    {o.score > 0 && <span className="text-green-700">Khớp số tiền</span>}
                    {!o.accountOk && <span className="block text-amber-700">Tài khoản nhận không thuộc cơ sở này</span>}
                  </span>
                </label>
              ))}
            </div>
            <input className="input !py-1 text-xs" placeholder={needNote ? "Ghi chú (bắt buộc)" : "Ghi chú (tuỳ chọn)"} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex gap-1">
              <button className="btn-primary flex-1 !py-1 text-xs" disabled={!orderId || match.isPending || (needNote && note.trim().length < 5)} onClick={() => match.mutate({ id, orderId, note: note.trim() || null })}>Rót {vnd(amount)} vào đơn này</button>
              <button className="btn-ghost !py-1 text-xs" disabled={!orderId} onClick={() => setAllocOrderId(orderId)}>Chia cho từng con…</button>
            </div>
          </div>
        ))}
      {mode === "ignore" && (
        <div className="flex gap-1">
          <input className="input !py-1 text-xs" placeholder="Lý do (VD: tiền lãi, chuyển nội bộ)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-ghost !py-1 text-xs" disabled={note.trim().length < 5 || ignore.isPending} onClick={() => ignore.mutate({ id, reason: note.trim() })}>Xác nhận bỏ qua</button>
        </div>
      )}
      {mode === "unlink" && (
        <div className="space-y-1 rounded-xl border border-red-200 p-2">
          <p className="text-[11px] text-ink-600">Gỡ gắn sẽ huỷ khoản thu do giao dịch này tạo (đảo bút toán) và trả khoản sale đã ghi về “chờ kế toán”; giao dịch quay lại “Cần xử lý”.</p>
          <input className="input !py-1 text-xs" placeholder="Lý do gỡ (bắt buộc)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-ghost !py-1 text-xs text-red-700" disabled={note.trim().length < 5 || unlink.isPending} onClick={() => unlink.mutate({ id, reason: note.trim() })}>Xác nhận gỡ</button>
        </div>
      )}
      {msg && <div className={msg.ok ? "text-green-700" : "text-red-700"}>{msg.text}</div>}
    </div>
  );
}

/**
 * "Tạo đợt cho phần dư": tạo một đợt trả góp mới trên chính đơn đã nhận tiền, bằng đúng số tiền
 * thừa, rồi rót phần dư vào. Không tự hoàn và không tự trừ sang đơn khác.
 */
export function SurplusInstallment({ id, surplus }: { id: string; surplus: number }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [orderItemId, setOrderItemId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const t = useQuery({ ...trpc.finance.bankSurplusTargets.queryOptions({ id }), enabled: open, retry: false });
  const run = useMutation(trpc.finance.bankSurplusInstallment.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: `Đã tạo đợt ${r.seq} trên ${r.orderCode} — ${vnd(r.amount)} · phiếu ${r.receiptNo}` }); setOpen(false); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  if (!open) {
    return (
      <div className="space-y-1">
        <button className="btn-primary !px-2 !py-1 text-xs" onClick={() => { setMsg(null); setOpen(true); }}>Tạo đợt cho phần dư</button>
        {msg && <div className={`text-[11px] ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</div>}
      </div>
    );
  }
  const d = t.data;
  return (
    <div className="w-80 space-y-1 rounded-xl border border-black/10 p-2 text-xs">
      <div className="flex items-center justify-between"><b>Tạo đợt cho phần dư {vnd(surplus)}</b><button className="text-ink-600" onClick={() => setOpen(false)}>Đóng</button></div>
      {t.error && <div className="text-red-700">{t.error.message}</div>}
      {d && (
        <>
          <div className="text-ink-600">Đơn {d.order.code} · {d.order.customerName} — tổng đơn hiện tại {vnd(d.order.total)}</div>
          {d.lines.length > 1 && (
            <label className="block text-ink-600">Đợt của con nào (tuỳ chọn)
              <select className="input mt-1 !py-1 text-xs" value={orderItemId} onChange={(e) => setOrderItemId(e.target.value)}>
                <option value="">— Không gắn con cụ thể —</option>
                {d.lines.map((l) => <option key={l.orderItemId} value={l.orderItemId}>{l.label} (còn thiếu {vnd(l.outstanding)})</option>)}
              </select>
            </label>
          )}
          <label className="block text-ink-600">Hạn đóng của đợt mới<input type="date" className="input mt-1 !py-1 text-xs" value={dueDate} onChange={(e) => setDueDate(e.target.value)} placeholder={d.today} /></label>
          <input className="input !py-1 text-xs" placeholder="Ghi chú (VD: PH chuyển dư, giữ cho kỳ sau)" value={note} onChange={(e) => setNote(e.target.value)} />
          <p className="text-[11px] text-ink-400">
            Đợt mới mang đúng {vnd(surplus)} và tổng đơn tăng tương ứng, rồi phần dư được rót vào đợt đó.
            Hệ thống vẫn không tự hoàn và không tự trừ sang đơn khác.
          </p>
          <button className="btn-primary w-full !py-1 text-xs" disabled={run.isPending}
            onClick={() => { setMsg(null); run.mutate({ id, orderItemId: orderItemId || null, dueDate: dueDate || null, note: note.trim() || null }); }}>
            Tạo đợt {vnd(surplus)} & rót vào
          </button>
        </>
      )}
      {msg && !msg.ok && <div className="text-red-700">{msg.text}</div>}
    </div>
  );
}

type Preview = RouterOutputs["finance"]["statementPreview"];

export function StatementImport({ accounts }: { accounts: { id: string; label: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [methodId, setMethodId] = useState(accounts[0]?.id ?? "");
  const [csv, setCsv] = useState<{ text: string; name: string | null } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const pv = useMutation(trpc.finance.statementPreview.mutationOptions({ onSuccess: setPreview, onError: (e) => setMsg({ ok: false, text: e.message }) }));
  const imp = useMutation(trpc.finance.statementImport.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: `Đã nhập ${r.imported} giao dịch (${vnd(r.amount)}): khớp ${r.matched}, cần kiểm tra ${r.needs_review}, chưa khớp ${r.unmatched}; trùng bỏ qua ${r.duplicates}.` }); setPreview(null); setCsv(null); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  if (!open) return <button className="btn-ghost" onClick={() => setOpen(true)}>Nhập sao kê ngân hàng (CSV)</button>;
  const run = (text: string, name: string | null) => { setMsg(null); setPreview(null); setCsv({ text, name }); pv.mutate({ csv: text, paymentMethodId: methodId }); };
  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Nhập sao kê</h2><button className="text-sm text-ink-600" onClick={() => setOpen(false)}>Đóng</button></div>
      <p className="text-xs text-ink-600">Dùng khi chưa bật SePay hoặc cần bù ngày bị lỡ. Cột cần có: <b>Ngày</b>, <b>Số tiền ghi có</b>, <b>Nội dung</b> (nên có <b>Mã GD</b> để chống trùng). Dòng tiền ra được bỏ qua. Giao dịch đã có (từ SePay hoặc lần nhập trước) không nhập lại.</p>
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={methodId} onChange={(e) => { setMethodId(e.target.value); setPreview(null); }}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </div>
      <CsvFileInput onText={run} disabled={!methodId || pv.isPending} />
      {pv.isPending && <div className="text-sm text-ink-600">Đang đọc file…</div>}
      {preview && (preview.headerErrors.length ? <div className="text-sm text-red-700">{preview.headerErrors.join("; ")}</div> : preview.summary && (
        <div className="space-y-2">
          <div className="text-sm">{preview.summary.rows} giao dịch vào · {vnd(preview.summary.amount)} · có mã đơn: {preview.summary.withOrder} · đã có: {preview.summary.duplicates} · dòng tiền ra: {preview.summary.skippedOut} · lỗi: {preview.summary.errorRows}</div>
          {preview.errors.length > 0 && <div className="text-xs text-red-700">{preview.errors.slice(0, 10).map((e) => `Dòng ${e.line}: ${e.error}`).join(" · ")}</div>}
          <div className="max-h-64 overflow-auto rounded-xl border border-black/10">
            <table className="w-full text-xs">
              <thead className="text-left text-ink-400"><tr><th className="p-2">Ngày</th><th className="p-2 text-right">Số tiền</th><th className="p-2">Nội dung</th><th className="p-2">Mã đơn</th><th className="p-2"></th></tr></thead>
              <tbody className="divide-y divide-black/5">
                {preview.rows.map((r) => (
                  <tr key={r.externalId} className={r.duplicate ? "text-ink-400" : ""}>
                    <td className="p-2">{fmtD(r.occurredAt.slice(0, 10))}</td>
                    <td className="p-2 text-right tabular-nums">{vnd(r.amount)}</td>
                    <td className="p-2">{r.content}</td>
                    <td className="p-2 font-mono">{r.orderRef ?? "—"}{r.orderRef && !r.orderFound && <span className="text-red-700"> (không có)</span>}</td>
                    <td className="p-2">{r.duplicate ? "Đã có" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <input className="input flex-1" placeholder="Ghi chú lô nhập (bắt buộc), VD: Sao kê VCB 01–15/09" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn-primary" disabled={!csv || note.trim().length < 5 || imp.isPending || preview.summary.rows - preview.summary.duplicates === 0} onClick={() => csv && imp.mutate({ csv: csv.text, paymentMethodId: methodId, fileName: csv.name, note: note.trim() })}>
              Nhập {preview.summary.rows - preview.summary.duplicates} giao dịch & tự khớp
            </button>
          </div>
        </div>
      ))}
      {msg && <div className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}
    </section>
  );
}
