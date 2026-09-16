"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { DISTRIBUTION_MODES, DISTRIBUTION_MODE_VI, type DistributionMode } from "@satarobo/core";
import { fmtDateTime } from "@/components/lead-ui";

export function DistributionBoard({ centerId }: { centerId: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const q = useQuery(trpc.admissions.leads.distribution.queryOptions({ centerId }));
  const [error, setError] = useState<string | null>(null);
  const [addId, setAddId] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: trpc.admissions.leads.distribution.queryKey({ centerId }) });
  const onError = (e: unknown) => setError((e as Error).message);
  const setMode = useMutation(trpc.admissions.leads.updateSettings.mutationOptions({ onSuccess: refresh, onError }));
  const upsert = useMutation(trpc.admissions.leads.upsertAssignee.mutationOptions({ onSuccess: () => { setAddId(""); refresh(); }, onError }));
  const remove = useMutation(trpc.admissions.leads.removeAssignee.mutationOptions({ onSuccess: refresh, onError }));
  const reset = useMutation(trpc.admissions.leads.resetRounds.mutationOptions({ onSuccess: refresh, onError }));
  const pool = useMutation(trpc.admissions.leads.distributePool.mutationOptions({ onSuccess: (r) => { setError(null); setMsg(`Đã chia ${r.assigned} lead từ pool${r.remaining ? `, còn ${r.remaining} chưa chia (không có sale khả dụng)` : ""}`); refresh(); }, onError }));
  const [msg, setMsg] = useState<string | null>(null);

  if (q.isLoading) return <div className="card p-6 text-sm text-ink-400">Đang tải…</div>;
  if (q.error || !q.data) return <div className="card p-6 text-sm text-danger">{q.error?.message}</div>;
  const d = q.data;
  const busy = setMode.isPending || upsert.isPending || remove.isPending || reset.isPending || pool.isPending;

  return (
    <div className="space-y-4">
      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
      {msg && <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-800">{msg}</div>}

      <section className="card p-4 grid md:grid-cols-[1fr_auto] gap-4 items-center">
        <div>
          <div className="label">Chế độ chia</div>
          <div className="flex flex-wrap gap-2">
            {DISTRIBUTION_MODES.map((m) => (
              <button key={m} disabled={busy} onClick={() => setMode.mutate({ centerId, distributionMode: m as DistributionMode })} className={`chip cursor-pointer px-3 py-1.5 ${d.mode === m ? "bg-brand-500 text-white" : "bg-black/5 hover:bg-black/10"}`}>{DISTRIBUTION_MODE_VI[m]}</button>
            ))}
          </div>
          <p className="text-xs text-ink-400 mt-2">
            {d.mode === "round_robin" && "Lead mới về sale có ít lượt nhất trong chu kỳ; bằng lượt thì người lâu chưa nhận được ưu tiên."}
            {d.mode === "by_conversion" && "Ưu tiên sale có tỷ lệ chốt cao (làm trơn để sale mới vẫn được chia); bằng điểm thì người ít lead mở hơn."}
            {d.mode === "manual" && "Không chia tự động — lead vào pool, quản lý gán tay từng lead."}
          </p>
        </div>
        <div className="text-right space-y-2">
          <div className="text-xs text-ink-400">Pool chưa phân: <b className="text-ink-900">{d.poolSize}</b>{d.roundsResetAt ? ` · đặt lại lượt ${fmtDateTime(d.roundsResetAt)}` : ""}</div>
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost text-xs" disabled={busy || d.poolSize === 0 || d.mode === "manual"} onClick={() => pool.mutate({ centerId })}>Chia pool ngay</button>
            <button className="btn-ghost text-xs" disabled={busy} onClick={() => reset.mutate({ centerId })}>Đặt lại lượt toàn cơ sở</button>
          </div>
        </div>
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-ink-400">
            <tr><th className="p-3">Sale</th><th className="p-3">Nhận lead</th><th className="p-3">Trọng số</th><th className="p-3">Lượt đã nhận</th><th className="p-3">Đang giữ</th><th className="p-3">Đã chốt / được giao</th><th className="p-3">Lần chia gần nhất</th><th className="p-3">Ghi chú</th><th className="p-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {d.board.map((b) => (
              <tr key={b.id} className={b.isAvailable ? "" : "opacity-60"}>
                <td className="p-3 font-medium">{b.fullName}{b.centerId === null && <span className="ml-1 chip bg-black/5">toàn hệ thống</span>}</td>
                <td className="p-3"><button className={`chip cursor-pointer ${b.isAvailable ? "bg-green-100 text-green-800" : "bg-black/5"}`} disabled={busy} onClick={() => upsert.mutate({ userId: b.id, centerId: b.centerId, isAvailable: !b.isAvailable })}>{b.isAvailable ? "Bật" : "Tắt"}</button></td>
                <td className="p-3"><input type="number" min={1} max={10} className="input !w-16 text-xs" defaultValue={b.weight} onBlur={(e) => Number(e.target.value) !== b.weight && upsert.mutate({ userId: b.id, centerId: b.centerId, weight: Number(e.target.value) })} /></td>
                <td className="p-3 font-mono">{b.roundsReceived}</td>
                <td className="p-3 font-mono">{b.openLeads}</td>
                <td className="p-3 font-mono">{b.converted} / {b.totalAssigned}{b.conversionRate !== null && <span className="text-xs text-ink-400"> ({b.conversionRate}%)</span>}</td>
                <td className="p-3 text-xs whitespace-nowrap">{b.lastAssignedAt ? fmtDateTime(b.lastAssignedAt) : "—"}</td>
                <td className="p-3"><input className="input text-xs" defaultValue={b.note ?? ""} placeholder="…" onBlur={(e) => (e.target.value || null) !== b.note && upsert.mutate({ userId: b.id, centerId: b.centerId, note: e.target.value || null })} /></td>
                <td className="p-3"><button className="text-xs text-ink-400 hover:text-red-700" disabled={busy} onClick={() => remove.mutate({ userId: b.id, centerId: b.centerId })}>Gỡ</button></td>
              </tr>
            ))}
            {d.board.length === 0 && <tr><td className="p-4 text-ink-400 text-center" colSpan={9}>Chưa có sale trong bảng chia.</td></tr>}
          </tbody>
        </table>
        <div className="p-3 flex gap-2 items-center border-t border-black/5">
          <select className="input max-w-xs" value={addId} onChange={(e) => setAddId(e.target.value)}>
            <option value="">— Thêm sale vào bảng chia —</option>
            {d.addable.map((a) => <option key={a.id} value={a.id}>{a.fullName} ({a.role})</option>)}
          </select>
          <button className="btn-primary" disabled={busy || !addId} onClick={() => upsert.mutate({ userId: addId, centerId, isAvailable: true })}>Thêm</button>
        </div>
      </section>
    </div>
  );
}
