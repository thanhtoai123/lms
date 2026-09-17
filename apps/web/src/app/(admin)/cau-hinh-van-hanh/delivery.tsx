"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DELIVERY_EVENTS, smsSegments, stripDiacritics, type DeliveryEvent, type DeliveryMode, type DeliverySettings } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

const MODE_VI: Record<DeliveryMode, string> = { off: "Tắt", sandbox: "Giả lập (không gửi thật)", live: "Gửi thật" };
const STATUS_VI: Record<string, string> = { queued: "Chờ gửi", sent: "Đã gửi", failed: "Lỗi", read: "Đã đọc" };

/** "param=bien, param2=bien2" ⇄ object */
const toText = (p: Record<string, string>) => Object.entries(p).map(([k, v]) => `${k}=${v}`).join(", ");
const toParams = (t: string) => Object.fromEntries(t.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).map((x) => { const [k, v] = x.split("="); return [(k ?? "").trim(), (v ?? "").trim()]; }));

export function DeliverySettingsPanel() {
  const trpc = useTRPC();
  const router = useRouter();
  const q = useQuery(trpc.delivery.config.queryOptions());
  if (q.isPending) return <div className="text-sm text-ink-600">Đang tải…</div>;
  if (q.error) return <div className="text-sm text-red-700">{q.error.message}</div>;
  const d = q.data;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="card p-4 text-sm">
          <div className="font-semibold">Môi trường</div>
          <div>ZALO_ZNS_TOKEN: {d.env.znsToken ? "đã có" : "chưa có"}</div>
          <div>SMS_API_URL / KEY: {d.env.smsApi ? "đã có" : "chưa có"}</div>
          <div>Giả lập: {d.env.sandboxAllowed ? "được phép" : "bị chặn (production)"}</div>
          <div className={d.otpReady ? "text-green-700" : "text-amber-700"}>OTP: {d.otpReady ? "đã có kênh gửi" : "chưa có kênh — phụ huynh dùng mã kích hoạt"}</div>
        </div>
        <div className="card p-4 text-sm md:col-span-2">
          <div className="font-semibold">7 ngày qua</div>
          {d.stats.length === 0 ? <div className="text-ink-600">Chưa có tin ZNS / SMS.</div> : (
            <div className="flex flex-wrap gap-3">{d.stats.map((s) => <span key={`${s.channel}${s.status}`} className="chip bg-slate-100">{s.channel.toUpperCase()} · {STATUS_VI[s.status] ?? s.status}: {s.n}</span>)}</div>
          )}
          {d.errors.length > 0 && <ul className="mt-2 list-disc pl-4 text-xs text-red-700">{d.errors.map((e, i) => <li key={i}>{e.channel.toUpperCase()}: {e.error ?? "?"} ({e.n})</li>)}</ul>}
        </div>
      </div>
      <SettingsEditor key={JSON.stringify(d.settings)} initial={d.settings} events={d.events} canEdit={d.canEdit} onSaved={() => { void q.refetch(); router.refresh(); }} />
      {d.canEdit && <TestSend events={d.events} />}
    </div>
  );
}

function SettingsEditor({ initial, events, canEdit, onSaved }: { initial: DeliverySettings; events: { key: DeliveryEvent; label: string; vars: string[] }[]; canEdit: boolean; onSaved: () => void }) {
  const trpc = useTRPC();
  const [s, setS] = useState(initial);
  const [znsText, setZnsText] = useState<Record<string, { id: string; params: string }>>(
    Object.fromEntries(DELIVERY_EVENTS.map((e) => [e, { id: initial.zns.templates[e]?.templateId ?? "", params: toText(initial.zns.templates[e]?.params ?? {}) }])),
  );
  const m = useMutation(trpc.delivery.save.mutationOptions({ onSuccess: onSaved }));
  const save = () => m.mutate({
    ...s,
    zns: { mode: s.zns.mode, templates: Object.fromEntries(DELIVERY_EVENTS.filter((e) => znsText[e]!.id.trim()).map((e) => [e, { templateId: znsText[e]!.id.trim(), params: toParams(znsText[e]!.params) }])) },
  });
  return (
    <form className="card space-y-4 p-4 text-sm" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="grid gap-3 md:grid-cols-4">
        <label>Zalo ZNS<select className="input mt-1" disabled={!canEdit} value={s.zns.mode} onChange={(e) => setS({ ...s, zns: { ...s.zns, mode: e.target.value as DeliveryMode } })}>{(["off", "sandbox", "live"] as const).map((x) => <option key={x} value={x}>{MODE_VI[x]}</option>)}</select></label>
        <label>SMS brandname<select className="input mt-1" disabled={!canEdit} value={s.sms.mode} onChange={(e) => setS({ ...s, sms: { ...s.sms, mode: e.target.value as DeliveryMode } })}>{(["off", "sandbox", "live"] as const).map((x) => <option key={x} value={x}>{MODE_VI[x]}</option>)}</select></label>
        <label>Tên brandname<input className="input mt-1" disabled={!canEdit} value={s.sms.brandname} onChange={(e) => setS({ ...s, sms: { ...s.sms, brandname: e.target.value } })} placeholder="SATAROBO" /></label>
        <label className="flex items-end gap-2 pb-2"><input type="checkbox" disabled={!canEdit} checked={s.sms.fallback} onChange={(e) => setS({ ...s, sms: { ...s.sms, fallback: e.target.checked } })} /> ZNS lỗi thì gửi SMS</label>
        <label>Giờ yên lặng từ<input className="input mt-1" disabled={!canEdit} value={s.quietStart} onChange={(e) => setS({ ...s, quietStart: e.target.value })} /></label>
        <label>đến<input className="input mt-1" disabled={!canEdit} value={s.quietEnd} onChange={(e) => setS({ ...s, quietEnd: e.target.value })} /></label>
        <label>Tối đa tin / phụ huynh / ngày<input type="number" className="input mt-1" disabled={!canEdit} value={s.maxPerParentPerDay} onChange={(e) => setS({ ...s, maxPerParentPerDay: Number(e.target.value) })} /></label>
      </div>
      <p className="text-xs text-ink-600">ZNS chỉ gửi được theo mẫu đã được Zalo duyệt. Khai báo template_id và ánh xạ tham số dạng <code>ten_tham_so_trong_mau=bien</code>, cách nhau dấu phẩy. OTP gửi ngay; tin khác chờ hết giờ yên lặng.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-ink-400"><tr><th className="p-2">Sự kiện</th><th className="p-2">Biến có sẵn</th><th className="p-2">ZNS template_id</th><th className="p-2">Tham số ZNS</th><th className="p-2">Nội dung SMS (không dấu)</th></tr></thead>
          <tbody className="divide-y divide-black/5">{events.map((ev) => {
            const sms = s.sms.templates[ev.key] ?? "";
            const seg = smsSegments(stripDiacritics(sms));
            return (
              <tr key={ev.key} className="align-top">
                <td className="p-2 font-medium">{ev.label}</td>
                <td className="p-2 font-mono text-ink-600">{ev.vars.join(", ")}</td>
                <td className="p-2"><input className="input w-28 font-mono" disabled={!canEdit} value={znsText[ev.key]!.id} onChange={(e) => setZnsText({ ...znsText, [ev.key]: { ...znsText[ev.key]!, id: e.target.value } })} /></td>
                <td className="p-2"><input className="input min-w-[180px] font-mono" disabled={!canEdit} value={znsText[ev.key]!.params} placeholder="otp=otp" onChange={(e) => setZnsText({ ...znsText, [ev.key]: { ...znsText[ev.key]!, params: e.target.value } })} /></td>
                <td className="p-2"><textarea className="input min-h-[52px] min-w-[240px]" disabled={!canEdit} value={sms} onChange={(e) => setS({ ...s, sms: { ...s.sms, templates: { ...s.sms.templates, [ev.key]: e.target.value } } })} />
                  {sms && <div className="text-ink-400">{seg.length} ký tự · {seg.segments} tin</div>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {canEdit && <div className="flex items-center gap-2"><button className="btn-primary" disabled={m.isPending}>Lưu cấu hình kênh gửi</button>{m.isSuccess && <span className="text-green-700">Đã lưu</span>}</div>}
      {m.error && <p className="text-red-700">{m.error.message}</p>}
    </form>
  );
}

function TestSend({ events }: { events: { key: DeliveryEvent; label: string }[] }) {
  const trpc = useTRPC();
  const [channel, setChannel] = useState<"zns" | "sms">("zns");
  const [event, setEvent] = useState<DeliveryEvent>("OTP");
  const [phone, setPhone] = useState("");
  const m = useMutation(trpc.delivery.test.mutationOptions());
  return (
    <form className="card flex flex-wrap items-end gap-2 p-4 text-sm" onSubmit={(e) => { e.preventDefault(); m.mutate({ channel, event, phone }); }}>
      <div className="w-full font-semibold">Gửi thử (dữ liệu mẫu)</div>
      <label>Kênh<select className="input mt-1" value={channel} onChange={(e) => setChannel(e.target.value as "zns" | "sms")}><option value="zns">ZNS</option><option value="sms">SMS</option></select></label>
      <label>Sự kiện<select className="input mt-1" value={event} onChange={(e) => setEvent(e.target.value as DeliveryEvent)}>{events.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
      <label>SĐT nhận<input className="input mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="SĐT của bạn" /></label>
      <button className="btn-ghost" disabled={!phone || m.isPending}>Gửi thử</button>
      {m.data && <span className={m.data.ok ? "text-green-700" : "text-red-700"}>{m.data.ok ? `Đã gửi (${m.data.ref})` : m.data.error}</span>}
      {m.error && <span className="text-red-700">{m.error.message}</span>}
    </form>
  );
}
