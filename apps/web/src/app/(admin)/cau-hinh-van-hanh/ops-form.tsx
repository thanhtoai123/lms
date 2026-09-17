"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OpsGroup } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

export function OpsForm({ group, centerId }: { group: OpsGroup; centerId: string | null }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const q = useQuery(trpc.opsConfig.group.queryOptions({ group, centerId }));
  const [vals, setVals] = useState<Record<string, string>>({});
  const [inherit, setInherit] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("");
  const save = useMutation(trpc.opsConfig.save.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: trpc.opsConfig.group.queryKey({ group, centerId }) }) }));
  useEffect(() => {
    if (!q.data) return;
    setVals(Object.fromEntries(q.data.fields.map((f) => [f.key, String(f.value)])));
    setInherit(Object.fromEntries(q.data.fields.map((f) => [f.key, !!centerId && !f.overridden])));
  }, [q.data, centerId]);
  if (q.isLoading) return <div className="card p-6 text-sm text-ink-400">Đang tải…</div>;
  if (q.error) return <div className="card p-6 text-sm text-red-700">{q.error.message}</div>;
  const d = q.data!;
  const submit = () => {
    const values: Record<string, number | boolean | null> = {};
    for (const f of d.fields) {
      if (!f.editable) continue;
      if (centerId && inherit[f.key]) { if (f.overridden) values[f.key] = null; continue; }
      values[f.key] = f.type === "bool" ? vals[f.key] === "true" : Number(vals[f.key]);
    }
    save.mutate({ group, centerId, values, reason: reason || null });
  };
  return (
    <form className="card max-w-3xl space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {centerId && <p className="text-xs text-ink-600">Bỏ chọn "Theo mặc định" để đặt giá trị riêng cho cơ sở này.</p>}
      <div className="divide-y divide-black/5">
        {d.fields.map((f) => {
          const inh = !!centerId && inherit[f.key];
          return (
            <div key={f.key} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <div className="text-sm font-medium">{f.label}</div>
                <div className="text-xs text-ink-400">Dùng cho: {f.usedBy} · mặc định {String(f.defaultValue)}{f.unit ? ` ${f.unit}` : ""}{centerId ? ` · toàn hệ thống ${String(f.globalValue)}` : ""}{f.min !== undefined ? ` · cho phép ${f.min}–${f.max}` : ""}</div>
                {!f.editable && <div className="text-xs text-amber-700">Chỉ đặt ở mức toàn hệ thống</div>}
              </div>
              <div className="flex items-center gap-2">
                {centerId && f.editable && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={inh} disabled={!d.canEdit} onChange={(e) => setInherit({ ...inherit, [f.key]: e.target.checked })} /> Theo mặc định</label>}
                {f.type === "bool" ? (
                  <select className="input !w-28" disabled={!d.canEdit || !f.editable || inh} value={vals[f.key] ?? ""} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}><option value="true">Bật</option><option value="false">Tắt</option></select>
                ) : (
                  <input type="number" className="input !w-28 text-right" min={f.min} max={f.max} disabled={!d.canEdit || !f.editable || inh} value={inh ? String(f.globalValue) : (vals[f.key] ?? "")} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
                )}
                <span className="w-12 text-xs text-ink-400">{f.unit ?? ""}</span>
              </div>
            </div>
          );
        })}
      </div>
      {d.canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <input className="input flex-1" placeholder="Lý do thay đổi (ghi vào nhật ký)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn-primary" disabled={save.isPending}>{save.isPending ? "Đang lưu…" : "Lưu"}</button>
        </div>
      ) : <p className="text-xs text-ink-400">Bạn chỉ có quyền xem.</p>}
      {save.isSuccess && <div className="text-sm text-green-700">Đã lưu ({save.data.changed} thay đổi).</div>}
      {save.error && <div className="text-sm text-red-700">{save.error.message}</div>}
    </form>
  );
}
