"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import type { LeadStatus } from "@satarobo/core";
import { LeadChip, fmtDateTime } from "@/components/lead-ui";

export type StaleLead = {
  id: string; parentName: string; phone: string; status: LeadStatus; centerCode: string | null; assigneeName: string | null;
  silentDays: number; lastTouchAt: string; canReassign: boolean;
};

/** Lead lâu ngày chưa chăm: chọn nhiều → phân bổ lại cho tư vấn viên khác kèm lý do (bỏ qua lead đã chốt) */
export function StaleLeadsTable({ items, days, assignees }: { items: StaleLead[]; days: number; assignees: { id: string; fullName: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [toUserId, setToUserId] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const m = useMutation(trpc.admissions.leads.reassign.mutationOptions({
    onSuccess: (r) => { setError(null); setPicked(new Set()); setReason(""); setResult(`Đã phân bổ ${r.done} lead · bỏ qua ${r.skipped}${r.skipped ? ` (${[...new Set(r.skippedDetails.map((s) => s.reason))].join(", ")})` : ""}`); router.refresh(); },
    onError: (e) => { setResult(null); setError(e.message); },
  }));
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectable = items.filter((i) => i.canReassign);
  const allPicked = selectable.length > 0 && selectable.every((i) => picked.has(i.id));

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-end gap-2 p-3">
        <div className="text-sm">Đã chọn <b>{picked.size}</b> lead</div>
        <label className="text-xs text-ink-600">Chọn tư vấn viên nhận
          <select className="input mt-1" value={toUserId} onChange={(e) => setToUserId(e.target.value)}>
            <option value="">— Chọn sale —</option>
            {assignees.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}
          </select>
        </label>
        <label className="min-w-64 flex-1 text-xs text-ink-600">Lý do phân bổ lại *
          <input className="input mt-1" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: sale cũ nghỉ việc, lead im quá lâu" />
        </label>
        <button
          className="btn-primary"
          disabled={m.isPending || picked.size === 0 || !toUserId || reason.trim().length < 3}
          onClick={() => m.mutate({ leadIds: [...picked], toUserId, reason: reason.trim() })}
        >
          {m.isPending ? "Đang phân bổ…" : `Phân bổ ${picked.size} lead`}
        </button>
      </div>
      {result && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{result}</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-ink-400">
            <tr>
              <th className="p-3"><input type="checkbox" checked={allPicked} onChange={(e) => setPicked(e.target.checked ? new Set(selectable.map((i) => i.id)) : new Set())} title="Chọn hết trang" /></th>
              <th className="p-3">Phụ huynh</th><th className="p-3">Số điện thoại</th><th className="p-3">Trạng thái</th><th className="p-3">Cơ sở</th><th className="p-3">Đang giữ</th><th className="p-3">Im bao lâu</th><th className="p-3">Chạm cuối</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {items.map((l) => (
              <tr key={l.id} className={picked.has(l.id) ? "bg-brand-50/40" : l.silentDays >= days * 2 ? "bg-red-50/50" : ""}>
                <td className="p-3"><input type="checkbox" checked={picked.has(l.id)} disabled={!l.canReassign} title={l.canReassign ? undefined : "Lead đã chốt hoặc bạn không có quyền"} onChange={() => toggle(l.id)} /></td>
                <td className="p-3"><Link href={`/leads/${l.id}`} className="font-medium text-brand-700">{l.parentName}</Link></td>
                <td className="p-3 font-mono text-xs">{l.phone}</td>
                <td className="p-3"><LeadChip status={l.status} /></td>
                <td className="p-3">{l.centerCode ?? "HO"}</td>
                <td className="p-3">{l.assigneeName ?? <span className="text-ink-400">Chưa phân</span>}</td>
                <td className="p-3 font-bold text-red-700">{l.silentDays} ngày{l.silentDays >= 60 ? ` (~${Math.round(l.silentDays / 30)} tháng)` : ""}</td>
                <td className="whitespace-nowrap p-3 text-xs">{fmtDateTime(l.lastTouchAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
