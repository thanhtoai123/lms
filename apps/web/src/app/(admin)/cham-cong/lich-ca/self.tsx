"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { REQUEST_KINDS, REQUEST_KIND_VI, LEAVE_TYPES, LEAVE_TYPE_VI, type RequestKind, type LeaveType, type DayStatus } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { DayChip, hm } from "@/components/hr-ui";

type Cell = { status: DayStatus; shift: { name: string; startTime: string; endTime: string } | null; inMin: number | null; outMin: number | null; lateMin: number } | null;

export function PunchCard({ today, cell, punches, geofence }: { today: string; cell: Cell; punches: { kind: string; at: string; distanceM: number | null; source: string }[]; geofence: { has: boolean; radiusM: number; name: string } | null }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const m = useMutation(trpc.hr.punch.mutationOptions({
    onSuccess: (r, v) => { setMsg({ ok: true, text: `Đã chấm ${v.kind === "in" ? "vào" : "ra"} lúc ${new Date(r.at).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" })}${r.distanceM != null ? ` · cách cơ sở ${r.distanceM}m` : ""}${r.warning ? ` · ${r.warning}` : ""}` }); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
    onSettled: () => setBusy(false),
  }));
  const go = (kind: "in" | "out") => {
    setMsg(null);
    setBusy(true);
    if (!navigator.geolocation) return m.mutate({ kind });
    navigator.geolocation.getCurrentPosition(
      (p) => m.mutate({ kind, lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => { if (geofence?.has) { setBusy(false); setMsg({ ok: false, text: `Không lấy được vị trí: ${e.message}. Hãy cho phép trình duyệt truy cập vị trí.` }); } else m.mutate({ kind }); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };
  const hasIn = punches.some((p) => p.kind === "in");
  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Hôm nay {today.split("-").reverse().join("/")}</h2>
          <div className="text-sm text-ink-600">{cell?.shift ? `${cell.shift.name} ${cell.shift.startTime}–${cell.shift.endTime}` : "Không có ca"}{cell && cell.status !== "off" && <span className="ml-2"><DayChip status={cell.status} /></span>}{cell && cell.lateMin > 0 && <span className="ml-2 text-amber-700">muộn {cell.lateMin}′</span>}</div>
          <div className="text-xs text-ink-400">{geofence?.has ? `Chấm trong bán kính ${geofence.radiusM}m quanh ${geofence.name}` : "Cơ sở chưa đặt vị trí — chấm công không kiểm tra bán kính"}</div>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary !px-6 !py-3 text-base" disabled={busy} onClick={() => go("in")}>{hasIn ? "Chấm vào lại" : "Chấm vào"}</button>
          <button className="btn-ghost !px-6 !py-3 text-base" disabled={busy || !hasIn} onClick={() => go("out")}>Chấm ra</button>
        </div>
      </div>
      {punches.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {punches.map((p, i) => <span key={i} className="chip bg-black/5">{p.kind === "in" ? "Vào" : "Ra"} {new Date(p.at).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" })}{p.distanceM != null ? ` · ${p.distanceM}m` : ""}</span>)}
          <span className="text-ink-400">Tính công: vào {hm(cell?.inMin)} · ra {hm(cell?.outMin)}</span>
        </div>
      )}
      {busy && <div className="text-sm text-ink-600">Đang lấy vị trí…</div>}
      {msg && <div className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}
    </section>
  );
}

export function RequestForm({ today, staffId, staffName }: { today: string; staffId?: string; staffName?: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<RequestKind>("leave");
  const [f, setF] = useState({ dateFrom: today, dateTo: today, portion: "full" as "full" | "am" | "pm", leaveType: "annual" as LeaveType, lateMin: "", earlyMin: "", punchIn: "", punchOut: "", otStart: "17:30", otEnd: "19:30", reason: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const m = useMutation(trpc.hr.createRequest.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: `Đã gửi đơn${r.days ? ` (${r.days} ngày)` : ""} — chờ quản lý duyệt` }); setF((x) => ({ ...x, reason: "" })); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  if (!open) return <button className="btn-primary" onClick={() => setOpen(true)}>+ Làm đơn{staffName ? ` cho ${staffName}` : ""}</button>;
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const L = "text-xs text-ink-600";
  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Làm đơn{staffName ? ` cho ${staffName}` : ""}</h2><button className="text-sm text-ink-600" onClick={() => setOpen(false)}>Đóng</button></div>
      <div className="flex flex-wrap gap-1">{REQUEST_KINDS.map((k) => <button key={k} className={`btn-ghost !py-1 text-xs ${kind === k ? "ring-2 ring-brand-300" : ""}`} onClick={() => setKind(k)}>{REQUEST_KIND_VI[k]}</button>)}</div>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <label className={L}>{kind === "leave" ? "Từ ngày" : "Ngày"}<input type="date" className="input mt-1" value={f.dateFrom} onChange={(e) => { set("dateFrom", e.target.value); if (f.dateTo < e.target.value) set("dateTo", e.target.value); }} /></label>
        {kind === "leave" && (
          <>
            <label className={L}>Đến ngày<input type="date" className="input mt-1" value={f.dateTo} min={f.dateFrom} onChange={(e) => set("dateTo", e.target.value)} /></label>
            <label className={L}>Loại nghỉ<select className="input mt-1" value={f.leaveType} onChange={(e) => set("leaveType", e.target.value)}>{LEAVE_TYPES.map((t) => <option key={t} value={t}>{LEAVE_TYPE_VI[t]}</option>)}</select></label>
            <label className={L}>Thời gian<select className="input mt-1" value={f.portion} disabled={f.dateTo !== f.dateFrom} onChange={(e) => set("portion", e.target.value)}><option value="full">Cả ngày</option><option value="am">Buổi sáng</option><option value="pm">Buổi chiều</option></select></label>
          </>
        )}
        {kind === "late_early" && (
          <>
            <label className={L}>Đi muộn (phút)<input type="number" min={0} max={240} className="input mt-1" value={f.lateMin} onChange={(e) => set("lateMin", e.target.value)} /></label>
            <label className={L}>Về sớm (phút)<input type="number" min={0} max={240} className="input mt-1" value={f.earlyMin} onChange={(e) => set("earlyMin", e.target.value)} /></label>
          </>
        )}
        {kind === "overtime" && (
          <>
            <label className={L}>Từ<input type="time" className="input mt-1" value={f.otStart} onChange={(e) => set("otStart", e.target.value)} /></label>
            <label className={L}>Đến<input type="time" className="input mt-1" value={f.otEnd} onChange={(e) => set("otEnd", e.target.value)} /></label>
          </>
        )}
        {kind === "missing_punch" && (
          <>
            <label className={L}>Giờ vào thực tế<input type="time" className="input mt-1" value={f.punchIn} onChange={(e) => set("punchIn", e.target.value)} /></label>
            <label className={L}>Giờ ra thực tế<input type="time" className="input mt-1" value={f.punchOut} onChange={(e) => set("punchOut", e.target.value)} /></label>
          </>
        )}
        <label className={`${L} sm:col-span-3 lg:col-span-4`}>Lý do *<input className="input mt-1" value={f.reason} onChange={(e) => set("reason", e.target.value)} /></label>
      </div>
      <button
        className="btn-primary"
        disabled={m.isPending || f.reason.trim().length < 5}
        onClick={() => { setMsg(null); m.mutate({
          staffId: staffId ?? null, kind, dateFrom: f.dateFrom, dateTo: kind === "leave" ? f.dateTo : f.dateFrom, reason: f.reason.trim(),
          ...(kind === "leave" ? { portion: f.dateTo === f.dateFrom ? f.portion : "full", leaveType: f.leaveType } : {}),
          ...(kind === "late_early" ? { lateMin: f.lateMin ? Number(f.lateMin) : null, earlyMin: f.earlyMin ? Number(f.earlyMin) : null } : {}),
          ...(kind === "overtime" ? { otStart: f.otStart, otEnd: f.otEnd } : {}),
          ...(kind === "missing_punch" ? { punchIn: f.punchIn, punchOut: f.punchOut } : {}),
        }); }}
      >Gửi đơn</button>
      {msg && <div className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}
    </section>
  );
}

export function CancelMine({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.hr.decideRequest.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <span>
      <button className="text-xs text-red-700" disabled={m.isPending} onClick={() => m.mutate({ id, action: "cancel" })}>Huỷ đơn</button>
      {m.error && <span className="block text-xs text-red-700">{m.error.message}</span>}
    </span>
  );
}
