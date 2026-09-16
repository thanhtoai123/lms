"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { vnd, fmtD } from "@/components/finance-ui";
import { CsvFileInput } from "@/components/csv-file-input";
import type { RouterOutputs } from "@/lib/trpc/types";

type Mode = null | "match" | "ignore";

export function BankRowActions({ id, amount, status }: { id: string; amount: number; status: "unmatched" | "needs_review" | "matched" | "ignored" }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [q, setQ] = useState("");
  const [orderId, setOrderId] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const cands = useQuery({ ...trpc.finance.bankCandidates.queryOptions({ id, q: q.trim() || undefined }), enabled: mode === "match", retry: false });
  const fail = (e: { message: string }) => setMsg({ ok: false, text: e.message });
  const match = useMutation(trpc.finance.bankMatch.mutationOptions({ onSuccess: (r) => { setMsg({ ok: true, text: `Đã khớp ${r.orderCode} · phiếu ${r.receiptNo}` }); setMode(null); router.refresh(); }, onError: fail }));
  const ignore = useMutation(trpc.finance.bankIgnore.mutationOptions({ onSuccess: () => { setMode(null); router.refresh(); }, onError: fail }));
  const rematch = useMutation(trpc.finance.bankRematch.mutationOptions({ onSuccess: (r) => { setMsg({ ok: r.status === "matched", text: r.status === "matched" ? `Đã khớp ${r.orderCode}` : r.note }); router.refresh(); }, onError: fail }));
  const needNote = status === "needs_review";
  return (
    <div className="min-w-[15rem] space-y-1 text-xs">
      <div className="flex flex-wrap gap-1">
        <button className="btn-primary !px-2 !py-1 text-xs" onClick={() => { setMsg(null); setMode(mode === "match" ? null : "match"); }}>Khớp đơn</button>
        <button className="btn-ghost !px-2 !py-1 text-xs" disabled={rematch.isPending} onClick={() => { setMsg(null); rematch.mutate({ id }); }}>Thử khớp lại</button>
        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { setMsg(null); setMode(mode === "ignore" ? null : "ignore"); }}>Bỏ qua</button>
      </div>
      {mode === "match" && (
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
          <button className="btn-primary w-full !py-1 text-xs" disabled={!orderId || match.isPending || (needNote && note.trim().length < 5)} onClick={() => match.mutate({ id, orderId, note: note.trim() || null })}>Xác nhận khớp & cấp phiếu thu</button>
        </div>
      )}
      {mode === "ignore" && (
        <div className="flex gap-1">
          <input className="input !py-1 text-xs" placeholder="Lý do (VD: tiền lãi, chuyển nội bộ)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-ghost !py-1 text-xs" disabled={note.trim().length < 5 || ignore.isPending} onClick={() => ignore.mutate({ id, reason: note.trim() })}>Lưu</button>
        </div>
      )}
      {msg && <div className={msg.ok ? "text-green-700" : "text-red-700"}>{msg.text}</div>}
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
