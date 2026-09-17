"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { DISTRIBUTION_MODES, DISTRIBUTION_MODE_VI, type DistributionMode } from "@satarobo/core";
import { fmtDateTime } from "@/components/lead-ui";

type AdjustState = { userId: string; centerId: string | null; current: number; rounds: string; reason: string };

export function DistributionBoard({ centerId }: { centerId: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const q = useQuery(trpc.admissions.leads.distribution.queryOptions({ centerId }));
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [addId, setAddId] = useState("");
  const [adjust, setAdjust] = useState<AdjustState | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: trpc.admissions.leads.distribution.queryKey({ centerId }) });
    qc.invalidateQueries({ queryKey: trpc.admissions.leads.poolHistory.queryKey() });
  };
  const onError = (e: { message: string }) => { setMsg(null); setError(e.message); };
  const ok = (text: string) => { setError(null); setMsg(text); refresh(); };
  const setMode = useMutation(trpc.admissions.leads.updateSettings.mutationOptions({ onSuccess: () => ok("Đã đổi chế độ chia"), onError }));
  const upsert = useMutation(trpc.admissions.leads.upsertAssignee.mutationOptions({ onSuccess: () => { setAddId(""); ok("Đã cập nhật pool"); }, onError }));
  const remove = useMutation(trpc.admissions.leads.removeAssignee.mutationOptions({ onSuccess: () => ok("Đã gỡ khỏi pool"), onError }));
  const reset = useMutation(trpc.admissions.leads.resetRounds.mutationOptions({ onSuccess: () => ok("Đã đặt lại lượt toàn cơ sở"), onError }));
  const adj = useMutation(trpc.admissions.leads.adjustRounds.mutationOptions({ onSuccess: () => { setAdjust(null); ok("Đã chỉnh lượt"); }, onError }));
  const pool = useMutation(trpc.admissions.leads.distributePool.mutationOptions({ onSuccess: (r) => ok(`Đã chia ${r.assigned} lead từ pool${r.remaining ? `, còn ${r.remaining} chưa chia (không có sale khả dụng)` : ""}`), onError }));

  if (q.isLoading) return <div className="card p-6 text-sm text-ink-400">Đang tải…</div>;
  if (q.error || !q.data) return <div className="card p-6 text-sm text-danger">{q.error?.message}</div>;
  const d = q.data;
  const busy = setMode.isPending || upsert.isPending || remove.isPending || reset.isPending || pool.isPending || adj.isPending;
  const floor = d.roundsFloor ?? 0;
  const lock = busy || !d.canManage;

  return (
    <div className="space-y-4">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {msg && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{msg}</div>}

      <section className="card grid items-center gap-4 p-4 md:grid-cols-[1fr_auto]">
        <div>
          <div className="label">Chế độ chia</div>
          <div className="flex flex-wrap gap-2">
            {DISTRIBUTION_MODES.map((m) => (
              <button key={m} disabled={lock} onClick={() => setMode.mutate({ centerId, distributionMode: m as DistributionMode })} className={`chip cursor-pointer px-3 py-1.5 ${d.mode === m ? "bg-brand-500 text-white" : "bg-black/5 hover:bg-black/10"}`}>{DISTRIBUTION_MODE_VI[m]}</button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-400">
            {d.mode === "round_robin" && "Chia theo sổ lượt — ai ít lượt nhất nhận trước; bằng lượt thì người lâu chưa nhận được ưu tiên."}
            {d.mode === "by_conversion" && "Ưu tiên sale có tỷ lệ chốt cao (làm trơn để sale mới vẫn được chia); bằng điểm thì người ít lead mở hơn."}
            {d.mode === "manual" && "Không chia tự động — lead vào pool, quản lý gán tay từng lead."}
          </p>
          {!d.consumesRounds && <p className="mt-1 text-xs font-medium text-amber-800">⚠️ Chế độ này KHÔNG tiêu lượt của sổ — cột Lượt đã nhận bên dưới sẽ đứng yên trong khi lead vẫn được chia.</p>}
        </div>
        <div className="space-y-2 text-right">
          <div className="text-xs text-ink-400">Pool chưa phân: <b className="text-ink-900">{d.poolSize}</b>{d.roundsResetAt ? ` · đặt lại lượt ${fmtDateTime(d.roundsResetAt)}` : ""}</div>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost text-xs" disabled={lock || d.poolSize === 0 || d.mode === "manual"} onClick={() => pool.mutate({ centerId })}>Chia pool ngay</button>
            <button
              className="btn-ghost text-xs"
              disabled={lock || d.board.length === 0}
              onClick={() => {
                if (window.confirm(`Mọi người đang nhận lead sẽ về mức ${floor} — mức THẤP NHẤT hiện tại, không phải 0. Số lead mỗi người đã nhận vẫn giữ nguyên. Tiếp tục?`)) reset.mutate({ centerId, reason: "Đặt lại lượt toàn cơ sở" });
              }}
            >
              Đặt lại lượt toàn cơ sở
            </button>
          </div>
        </div>
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-ink-400">
            <tr><th className="p-3">Sale</th><th className="p-3">Nhận lead</th><th className="p-3">Trọng số</th><th className="p-3">Lượt đã nhận</th><th className="p-3">Đang giữ</th><th className="p-3">Đã chốt / được giao</th><th className="p-3">Lần chia gần nhất</th><th className="p-3">Ghi chú</th><th className="p-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {d.board.map((b) => {
              const a = adjust && adjust.userId === b.id && adjust.centerId === b.centerId ? adjust : null;
              return (
              <tr key={b.rowId} className={b.isAvailable ? "" : "opacity-60"}>
                <td className="p-3 font-medium">{b.fullName}<div className="text-[11px] font-normal text-ink-400">{b.email}</div>{b.centerId === null && <span className="chip bg-black/5">toàn hệ thống</span>}</td>
                <td className="p-3">
                  <button
                    className={`chip cursor-pointer ${b.isAvailable ? "bg-green-100 text-green-800" : "bg-black/5"}`}
                    disabled={lock}
                    title={b.isAvailable ? "Tắt: thôi nhận lead mới, lượt đóng băng" : `Bật lại: lượt sẽ được đặt lại về ${floor} để không nhận dồn lead`}
                    onClick={() => {
                      if (!b.isAvailable && d.roundsFloor !== null && !window.confirm(`Lượt sẽ được đặt lại về ${d.roundsFloor} để không nhận dồn lead. Bật nhận lead cho ${b.fullName}?`)) return;
                      upsert.mutate({ userId: b.id, centerId: b.centerId, isAvailable: !b.isAvailable });
                    }}
                  >
                    {b.isAvailable ? "Đang nhận" : "Tạm nghỉ"}
                  </button>
                </td>
                <td className="p-3"><input type="number" min={1} max={10} className="input !w-16 text-xs" defaultValue={b.weight} disabled={lock} onBlur={(e) => Number(e.target.value) !== b.weight && upsert.mutate({ userId: b.id, centerId: b.centerId, weight: Number(e.target.value) })} /></td>
                <td className="p-3">
                  {a ? (
                    <form className="flex flex-col gap-1" onSubmit={(e) => { e.preventDefault(); adj.mutate({ userId: b.id, centerId: b.centerId, rounds: Number(a.rounds), reason: a.reason }); }}>
                      <input type="number" min={0} className="input !w-20 text-xs" autoFocus value={a.rounds} onChange={(e) => setAdjust({ ...a, rounds: e.target.value })} />
                      <input className="input text-xs" placeholder="Lý do *" maxLength={300} value={a.reason} onChange={(e) => setAdjust({ ...a, reason: e.target.value })} />
                      <div className="flex gap-1">
                        <button className="btn-primary !px-2 !py-1 text-xs" disabled={busy || a.reason.trim().length < 3 || a.rounds === "" || Number(a.rounds) === a.current}>Lưu</button>
                        <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setAdjust(null)}>Huỷ</button>
                      </div>
                    </form>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="font-mono">{b.roundsReceived}</span>
                      {d.canManage && <button type="button" className="text-xs text-brand-700" onClick={() => setAdjust({ userId: b.id, centerId: b.centerId, current: b.roundsReceived, rounds: String(b.roundsReceived), reason: "" })}>Chỉnh</button>}
                    </span>
                  )}
                </td>
                <td className="p-3 font-mono">{b.openLeads}</td>
                <td className="p-3 font-mono">{b.converted} / {b.totalAssigned}{b.conversionRate !== null && <span className="text-xs text-ink-400"> ({b.conversionRate}%)</span>}</td>
                <td className="whitespace-nowrap p-3 text-xs">{b.lastAssignedAt ? fmtDateTime(b.lastAssignedAt) : "Chưa từng được chia"}</td>
                <td className="p-3"><input className="input text-xs" defaultValue={b.note ?? ""} placeholder="…" disabled={lock} onBlur={(e) => (e.target.value || null) !== b.note && upsert.mutate({ userId: b.id, centerId: b.centerId, note: e.target.value || null })} /></td>
                <td className="p-3">{d.canManage && <button className="text-xs text-ink-400 hover:text-red-700" disabled={lock} onClick={() => window.confirm(`Gỡ ${b.fullName} khỏi pool chia lead?`) && remove.mutate({ userId: b.id, centerId: b.centerId })}>Gỡ</button>}</td>
              </tr>
              );
            })}
            {d.board.length === 0 && <tr><td className="p-4 text-center text-ink-400" colSpan={9}>Chưa có sale trong bảng chia.</td></tr>}
          </tbody>
        </table>
        {d.canManage && (
          <div className="flex items-center gap-2 border-t border-black/5 p-3">
            <select className="input max-w-xs" value={addId} onChange={(e) => setAddId(e.target.value)}>
              <option value="">— Thêm sale vào pool —</option>
              {d.addable.map((a) => <option key={a.id} value={a.id}>{a.fullName} ({a.role})</option>)}
            </select>
            <button className="btn-primary" disabled={busy || !addId} onClick={() => upsert.mutate({ userId: addId, centerId, isAvailable: true })}>Thêm</button>
            <span className="text-xs text-ink-400">Người mới bắt đầu ở mức lượt thấp nhất ({floor}).</span>
          </div>
        )}
        <p className="border-t border-black/5 p-3 text-xs text-ink-400">Lượt đã nhận chỉ đếm lead do hệ thống chia tự động (chế độ luân phiên). Lead do quản lý giao tay, lead sale tự nhập và lead nhập từ file có sẵn tên sale thì không tiêu lượt.</p>
      </section>
    </div>
  );
}
