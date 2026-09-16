"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { LEAD_STATUSES, LEAD_STATUS_VI, DISTRIBUTION_MODES, DISTRIBUTION_MODE_VI, type DistributionMode, type LeadStatus } from "@satarobo/core";

export function SettingsForm({ centerId }: { centerId: string | null }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const q = useQuery(trpc.admissions.leads.settings.queryOptions({ centerId }));
  const [f, setF] = useState<{ distributionMode: DistributionMode; dedupeDays: number; maxTrialsPerLead: number; staleAfterDays: number; sla: Record<string, string> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useMutation(trpc.admissions.leads.updateSettings.mutationOptions({ onSuccess: () => { setSaved(true); setError(null); qc.invalidateQueries({ queryKey: trpc.admissions.leads.settings.queryKey({ centerId }) }); }, onError: (e) => setError(e.message) }));

  useEffect(() => {
    if (!q.data) return;
    const e = q.data.effective;
    setF({ distributionMode: e.distributionMode, dedupeDays: e.dedupeDays, maxTrialsPerLead: e.maxTrialsPerLead, staleAfterDays: e.staleAfterDays, sla: Object.fromEntries(LEAD_STATUSES.map((s) => [s, e.sla.minutesByStatus[s] === null ? "" : String(e.sla.minutesByStatus[s])])) });
    setSaved(false);
  }, [q.data]);

  if (q.isLoading || !f) return <div className="card p-6 text-sm text-ink-400">Đang tải…</div>;
  if (q.error) return <div className="card p-6 text-sm text-danger">{q.error.message}</div>;

  return (
    <form className="card p-5 space-y-4 max-w-2xl" onSubmit={(e) => { e.preventDefault(); save.mutate({ centerId, distributionMode: f.distributionMode, dedupeDays: f.dedupeDays, maxTrialsPerLead: f.maxTrialsPerLead, staleAfterDays: f.staleAfterDays, slaMinutes: Object.fromEntries(Object.entries(f.sla).map(([k, v]) => [k, v === "" ? null : Number(v)])) }); }}>
      {q.data?.inherited && <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">Cơ sở này chưa có cấu hình riêng — đang hiển thị giá trị kế thừa. Lưu để tạo cấu hình riêng.</div>}
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className="label">Chế độ chia lead</label><select className="input" value={f.distributionMode} onChange={(e) => setF({ ...f, distributionMode: e.target.value as DistributionMode })}>{DISTRIBUTION_MODES.map((m) => <option key={m} value={m}>{DISTRIBUTION_MODE_VI[m]}</option>)}</select></div>
        <div><label className="label">Khử trùng SĐT trong (ngày)</label><input type="number" min={0} className="input" value={f.dedupeDays} onChange={(e) => setF({ ...f, dedupeDays: Number(e.target.value) })} /></div>
        <div><label className="label">Số buổi học thử tối đa / khách</label><input type="number" min={1} className="input" value={f.maxTrialsPerLead} onChange={(e) => setF({ ...f, maxTrialsPerLead: Number(e.target.value) })} /></div>
        <div><label className="label">"Lâu chưa chăm" sau (ngày)</label><input type="number" min={1} className="input" value={f.staleAfterDays} onChange={(e) => setF({ ...f, staleAfterDays: Number(e.target.value) })} /></div>
      </div>
      <div>
        <div className="label">SLA theo phút — quá thời gian này kể từ lần chạm gần nhất, lead bị coi là quá hạn (bỏ trống = không áp)</div>
        <div className="grid sm:grid-cols-2 gap-2">
          {LEAD_STATUSES.map((s) => (
            <label key={s} className="flex items-center justify-between gap-2 rounded-xl border border-black/5 px-3 py-2 text-sm">
              <span>{LEAD_STATUS_VI[s as LeadStatus]}</span>
              <span className="flex items-center gap-1"><input type="number" min={1} className="input !w-24 text-xs" value={f.sla[s] ?? ""} onChange={(e) => setF({ ...f, sla: { ...f.sla, [s]: e.target.value } })} /><span className="text-xs text-ink-400">phút</span></span>
            </label>
          ))}
        </div>
      </div>
      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
      {saved && <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-800">Đã lưu cấu hình.</div>}
      <button className="btn-primary" disabled={save.isPending}>{save.isPending ? "Đang lưu…" : "Lưu cấu hình"}</button>
    </form>
  );
}
