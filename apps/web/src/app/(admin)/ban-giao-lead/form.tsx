"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { OPEN_LEAD_STATUSES, LEAD_STATUS_VI, type LeadStatus } from "@satarobo/core";

export function HandoverForm({ assignees, centers }: { assignees: { id: string; fullName: string }[]; centers: { id: string; code: string }[] }) {
  const trpc = useTRPC();
  const [f, setF] = useState({ fromUserId: "", toUserId: "", centerId: "", utmCampaign: "", reason: "" });
  const [statuses, setStatuses] = useState<LeadStatus[]>([]);
  const [preview, setPreview] = useState<{ count: number; byStatus: Record<string, number> } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const m = useMutation(trpc.admissions.leads.handover.mutationOptions({
    onSuccess: (r) => { setError(null); if (r.executed) { setDone(`Đã bàn giao ${r.count} lead.`); setPreview(null); } else setPreview(r); },
    onError: (e) => setError(e.message),
  }));
  const payload = (execute: boolean) => ({ fromUserId: f.fromUserId, toUserId: f.toUserId, centerId: f.centerId || null, utmCampaign: f.utmCampaign || null, statuses: statuses.length ? statuses : undefined, reason: f.reason, execute });
  const toggle = (s: LeadStatus) => setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <div className="card p-5 space-y-4 max-w-2xl">
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className="label">Sale nguồn *</label><select className="input" value={f.fromUserId} onChange={(e) => { setF({ ...f, fromUserId: e.target.value }); setPreview(null); }}><option value="">—</option>{assignees.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}</select></div>
        <div><label className="label">Sale đích *</label><select className="input" value={f.toUserId} onChange={(e) => { setF({ ...f, toUserId: e.target.value }); setPreview(null); }}><option value="">—</option>{assignees.filter((a) => a.id !== f.fromUserId).map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}</select></div>
        <div><label className="label">Cơ sở (tuỳ chọn)</label><select className="input" value={f.centerId} onChange={(e) => setF({ ...f, centerId: e.target.value })}><option value="">Mọi cơ sở</option>{centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></div>
        <div><label className="label">Chiến dịch UTM (tuỳ chọn)</label><input className="input" value={f.utmCampaign} onChange={(e) => setF({ ...f, utmCampaign: e.target.value })} placeholder="he-2026" /></div>
      </div>
      <div>
        <div className="label">Lọc trạng thái (bỏ trống = mọi lead mở)</div>
        <div className="flex flex-wrap gap-2">{OPEN_LEAD_STATUSES.map((s) => <button key={s} type="button" onClick={() => { toggle(s); setPreview(null); }} className={`chip cursor-pointer ${statuses.includes(s) ? "bg-brand-500 text-white" : "bg-black/5"}`}>{LEAD_STATUS_VI[s]}</button>)}</div>
      </div>
      <div><label className="label">Lý do bàn giao *</label><input className="input" minLength={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Sale nghỉ việc / đổi phụ trách chiến dịch…" /></div>
      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
      {done && <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-800">{done}</div>}
      {preview && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm">
          <b>{preview.count}</b> lead sẽ được bàn giao: {Object.entries(preview.byStatus).filter(([, n]) => n > 0).map(([s, n]) => `${LEAD_STATUS_VI[s as LeadStatus]} ${n}`).join(" · ") || "—"}
        </div>
      )}
      <div className="flex gap-2">
        <button className="btn-ghost" disabled={m.isPending || !f.fromUserId || !f.toUserId || f.reason.length < 3} onClick={() => m.mutate(payload(false))}>Xem trước số lead</button>
        <button className="btn-primary" disabled={m.isPending || !preview || preview.count === 0} onClick={() => m.mutate(payload(true))}>Thực hiện bàn giao</button>
      </div>
    </div>
  );
}
