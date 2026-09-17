"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { CHANNELS, CHANNEL_VI, buildUtmUrl, type Channel } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

export function TrackingSettings({ initial, canEdit }: { initial: { metaPixelId: string; ga4MeasurementId: string; trackingEnabled: boolean; leadRetentionMonths: number }; canEdit: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [v, setV] = useState(initial);
  const m = useMutation(trpc.marketing.saveSettings.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <form className="space-y-2 text-sm" onSubmit={(e) => { e.preventDefault(); m.mutate(v); }}>
      <label className="flex items-center gap-2"><input type="checkbox" checked={v.trackingEnabled} disabled={!canEdit} onChange={(e) => setV({ ...v, trackingEnabled: e.target.checked })} /> Ghi nhận sự kiện website (ẩn danh, không lưu IP)</label>
      <label className="block">Meta Pixel ID<input className="input mt-1" value={v.metaPixelId} disabled={!canEdit} onChange={(e) => setV({ ...v, metaPixelId: e.target.value.trim() })} placeholder="1234567890123456" /></label>
      <label className="block">GA4 Measurement ID<input className="input mt-1" value={v.ga4MeasurementId} disabled={!canEdit} onChange={(e) => setV({ ...v, ga4MeasurementId: e.target.value.trim().toUpperCase() })} placeholder="G-XXXXXXX" /></label>
      <label className="block">Thời hạn lưu lead không chuyển đổi (tháng)<input type="number" min={6} max={120} className="input mt-1 w-28" value={v.leadRetentionMonths} disabled={!canEdit} onChange={(e) => setV({ ...v, leadRetentionMonths: Number(e.target.value) })} /></label>
      {canEdit && <button className="btn-primary" disabled={m.isPending}>Lưu cấu hình</button>}
      {m.error && <p className="text-red-700">{m.error.message}</p>}
      {m.isSuccess && <p className="text-green-700">Đã lưu.</p>}
    </form>
  );
}

export function UtmBuilder({ campaigns }: { campaigns: { utmCampaign: string; name: string; landingUrl: string | null }[] }) {
  const [base, setBase] = useState(campaigns[0]?.landingUrl ?? "https://satarobo.vn/dang-ky");
  const [source, setSource] = useState("facebook");
  const [medium, setMedium] = useState("cpc");
  const [campaign, setCampaign] = useState(campaigns[0]?.utmCampaign ?? "");
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);
  let url = "";
  let err = "";
  try { url = campaign ? buildUtmUrl(base, { source, medium, campaign, content }) : ""; } catch (e) { err = (e as Error).message; }
  return (
    <div className="space-y-2 text-sm">
      <label className="block">Trang đích<input className="input mt-1" value={base} onChange={(e) => setBase(e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label>utm_source<input className="input mt-1" value={source} onChange={(e) => setSource(e.target.value)} /></label>
        <label>utm_medium<input className="input mt-1" value={medium} onChange={(e) => setMedium(e.target.value)} /></label>
        <label>utm_campaign<select className="input mt-1" value={campaign} onChange={(e) => { setCampaign(e.target.value); const c = campaigns.find((x) => x.utmCampaign === e.target.value); if (c?.landingUrl) setBase(c.landingUrl); }}><option value="">— chọn —</option>{campaigns.map((c) => <option key={c.utmCampaign} value={c.utmCampaign}>{c.utmCampaign} · {c.name}</option>)}</select></label>
        <label>utm_content<input className="input mt-1" value={content} onChange={(e) => setContent(e.target.value)} placeholder="tuỳ chọn" /></label>
      </div>
      {err && <p className="text-red-700">{err}</p>}
      {url && (
        <div className="flex gap-2">
          <input readOnly className="input font-mono text-xs" value={url} />
          <button type="button" className="btn-ghost" onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { /* bỏ qua */ } }}>{copied ? "Đã chép" : "Chép"}</button>
        </div>
      )}
    </div>
  );
}

type Camp = { id?: string; name: string; utmCampaign: string; channel: Channel; centerId: string | null; budget: number; startDate: string; endDate: string | null; landingUrl: string | null; notes: string | null; isActive: boolean };

export function CampaignForm({ centers, camp }: { centers: { id: string; code: string }[]; camp?: Camp }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [v, setV] = useState<Camp>(camp ?? { name: "", utmCampaign: "", channel: "facebook", centerId: null, budget: 0, startDate: today, endDate: null, landingUrl: "https://satarobo.vn/dang-ky", notes: null, isActive: true });
  const m = useMutation(trpc.marketing.upsertCampaign.mutationOptions({ onSuccess: () => { setOpen(false); router.refresh(); } }));
  if (!open) return <button type="button" className={camp ? "text-xs text-brand-600" : "btn-primary"} onClick={() => setOpen(true)}>{camp ? "Sửa" : "+ Chiến dịch"}</button>;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <form className="card mt-10 grid w-full max-w-xl grid-cols-2 gap-2 p-4 text-sm" onSubmit={(e) => { e.preventDefault(); m.mutate({ ...v, id: camp?.id }); }}>
        <h3 className="col-span-2 font-semibold">{camp ? "Sửa chiến dịch" : "Chiến dịch mới"}</h3>
        <label className="col-span-2">Tên<input className="input mt-1" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required /></label>
        <label>utm_campaign<input className="input mt-1 font-mono" value={v.utmCampaign} onChange={(e) => setV({ ...v, utmCampaign: e.target.value.toLowerCase() })} required placeholder="he_2026" /></label>
        <label>Kênh<select className="input mt-1" value={v.channel} onChange={(e) => setV({ ...v, channel: e.target.value as Channel })}>{CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_VI[c]}</option>)}</select></label>
        <label>Cơ sở<select className="input mt-1" value={v.centerId ?? ""} onChange={(e) => setV({ ...v, centerId: e.target.value || null })}><option value="">Toàn hệ thống</option>{centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></label>
        <label>Ngân sách (đ)<input type="number" min={0} className="input mt-1" value={v.budget} onChange={(e) => setV({ ...v, budget: Number(e.target.value) })} /></label>
        <label>Bắt đầu<input type="date" className="input mt-1" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} required /></label>
        <label>Kết thúc<input type="date" className="input mt-1" value={v.endDate ?? ""} onChange={(e) => setV({ ...v, endDate: e.target.value || null })} /></label>
        <label className="col-span-2">Trang đích<input className="input mt-1" value={v.landingUrl ?? ""} onChange={(e) => setV({ ...v, landingUrl: e.target.value || null })} /></label>
        <label className="col-span-2">Ghi chú<textarea className="input mt-1" rows={2} value={v.notes ?? ""} onChange={(e) => setV({ ...v, notes: e.target.value || null })} /></label>
        {camp && <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} /> Đang chạy</label>}
        {m.error && <p className="col-span-2 text-red-700">{m.error.message}</p>}
        <div className="col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button><button className="btn-primary" disabled={m.isPending}>Lưu</button></div>
      </form>
    </div>
  );
}

export function SpendForm({ campaignId }: { campaignId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [clicks, setClicks] = useState("");
  const m = useMutation(trpc.marketing.recordSpend.mutationOptions({ onSuccess: () => { setOpen(false); setAmount(""); router.refresh(); } }));
  if (!open) return <button type="button" className="text-xs text-brand-600" onClick={() => setOpen(true)}>Ghi chi phí</button>;
  return (
    <form className="mt-1 flex flex-wrap items-center gap-1 text-xs" onSubmit={(e) => { e.preventDefault(); m.mutate({ campaignId, date, amount: Number(amount.replace(/\D/g, "")), clicks: clicks ? Number(clicks) : null }); }}>
      <input type="date" className="input !w-32 !py-0.5 text-xs" value={date} onChange={(e) => setDate(e.target.value)} />
      <input className="input !w-24 !py-0.5 text-xs" inputMode="numeric" placeholder="Số tiền" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      <input className="input !w-16 !py-0.5 text-xs" inputMode="numeric" placeholder="Click" value={clicks} onChange={(e) => setClicks(e.target.value)} />
      <button className="btn-primary !px-2 !py-0.5 text-xs" disabled={m.isPending}>Lưu</button>
      <button type="button" className="text-xs" onClick={() => setOpen(false)}>✕</button>
      {m.error && <span className="w-full text-red-700">{m.error.message}</span>}
      {m.data?.overBudget && <span className="w-full text-amber-700">Vượt ngân sách!</span>}
    </form>
  );
}
