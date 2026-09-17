"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { isLargeVariance, type AuditStatus } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

type Line = { itemId: string; sku: string; name: string; unit: string; systemQty: number; currentQty: number; countedQty: number | null; note: string | null; movedSince: boolean };

export function CountSheet({ id, editable, lines }: { id: string; editable: boolean; lines: Line[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [rows, setRows] = useState(lines.map((l) => ({ ...l, counted: l.countedQty === null ? "" : String(l.countedQty), noteText: l.note ?? "" })));
  const [dirty, setDirty] = useState(false);
  const m = useMutation(trpc.inventory.saveAuditCounts.mutationOptions({ onSuccess: () => { setDirty(false); router.refresh(); } }));
  const upd = (i: number, patch: Partial<(typeof rows)[number]>) => { setDirty(true); setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r))); };
  const save = () => m.mutate({ id, lines: rows.map((r) => ({ itemId: r.itemId, countedQty: r.counted === "" ? null : Number(r.counted), note: r.noteText || null })) });
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Mặt hàng</th><th className="p-3 text-right">Tồn sổ</th><th className="p-3">Đếm thực tế</th><th className="p-3 text-right">Chênh lệch</th><th className="p-3">Ghi chú / nguyên nhân</th></tr></thead>
        <tbody className="divide-y divide-black/5">
          {rows.map((r, i) => {
            const c = r.counted === "" ? null : Number(r.counted);
            const v = c === null ? null : c - r.systemQty;
            const large = c !== null && isLargeVariance(r.systemQty, c);
            return (
              <tr key={r.itemId} className={large ? "bg-amber-50" : ""}>
                <td className="p-3"><div className="font-medium">{r.name}</div><div className="font-mono text-xs text-ink-400">{r.sku}</div>{r.movedSince && <div className="text-[11px] text-amber-700">Có phát sinh sau khi lập phiếu (tồn hiện {r.currentQty}) — điều chỉnh tính theo chênh lệch.</div>}</td>
                <td className="p-3 text-right tabular-nums">{r.systemQty} <span className="text-xs text-ink-400">{r.unit}</span></td>
                <td className="p-3">{editable ? <input type="number" min={0} className="input w-24 !py-1" value={r.counted} onChange={(e) => upd(i, { counted: e.target.value })} aria-label={`Số đếm ${r.sku}`} /> : <span className="tabular-nums">{c ?? "—"}</span>}</td>
                <td className={`p-3 text-right font-semibold tabular-nums ${v ? (v < 0 ? "text-red-700" : "text-green-700") : "text-ink-400"}`}>{v === null ? "—" : v > 0 ? `+${v}` : v}</td>
                <td className="p-3">{editable ? <input className={`input w-full !py-1 ${large && r.noteText.trim().length < 5 ? "border-amber-500" : ""}`} placeholder={large ? "Bắt buộc: nguyên nhân" : ""} value={r.noteText} onChange={(e) => upd(i, { noteText: e.target.value })} maxLength={300} /> : <span className="text-xs">{r.noteText || "—"}</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {editable && (
        <div className="flex items-center gap-3 border-t border-black/5 p-3">
          <button type="button" className="btn-primary" disabled={m.isPending || !dirty} onClick={save}>Lưu số đếm</button>
          <button type="button" className="btn-ghost" onClick={() => { setDirty(true); setRows(rows.map((r) => (r.counted === "" ? { ...r, counted: String(r.systemQty) } : r))); }}>Điền = tồn sổ cho dòng trống</button>
          {dirty && <span className="text-xs text-amber-700">Chưa lưu</span>}
          {m.error && <span className="text-sm text-red-700">{m.error.message}</span>}
        </div>
      )}
    </div>
  );
}

export function AuditActions({ id, status, canCount, canApprove, canManage }: { id: string; status: AuditStatus; canCount: boolean; canApprove: boolean; canManage: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [note, setNote] = useState("");
  const m = useMutation(trpc.inventory.auditAction.mutationOptions({ onSuccess: () => router.refresh() }));
  if (!canCount && !canApprove && !canManage) return null;
  const act = (action: "submit" | "approve" | "reopen" | "cancel") => m.mutate({ id, action, note: note || null });
  return (
    <div className="card flex flex-wrap items-center gap-2 p-4">
      <input className="input flex-1" placeholder="Ghi chú (bắt buộc khi trả lại / huỷ)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      {status === "draft" && canCount && <button type="button" className="btn-primary" disabled={m.isPending} onClick={() => act("submit")}>Nộp duyệt</button>}
      {status === "submitted" && canApprove && <button type="button" className="btn-primary" disabled={m.isPending} onClick={() => act("approve")}>Duyệt & điều chỉnh tồn</button>}
      {status === "submitted" && canManage && <button type="button" className="btn-ghost" disabled={m.isPending} onClick={() => act("reopen")}>Trả lại đếm lại</button>}
      {canManage && <button type="button" className="btn-ghost text-red-700" disabled={m.isPending} onClick={() => act("cancel")}>Huỷ phiếu</button>}
      {m.error && <p className="w-full text-sm text-red-700">{m.error.message}</p>}
      {m.data && <p className="w-full text-sm text-green-700">Đã chuyển sang: {m.data.status}{m.data.adjusted ? ` — lập ${m.data.adjusted} dòng điều chỉnh` : ""}</p>}
    </div>
  );
}
