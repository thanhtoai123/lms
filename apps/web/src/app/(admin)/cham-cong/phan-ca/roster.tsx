"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { wdOf } from "@/components/hr-ui";
import type { RouterOutputs } from "@/lib/trpc/types";

type RRow = { id: string; code: string; fullName: string; title: string; status: string; days: { date: string; shiftId: string; status: string; leave: boolean }[] };
type Shift = { id: string; code: string; name: string; startTime: string; endTime: string };

export function RosterEditor({ centerId, weekStart, dates, rows, shifts, canEdit, today }: { centerId: string; weekStart: string; dates: string[]; rows: RRow[]; shifts: Shift[]; canEdit: boolean; today: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const initial = useMemo(() => new Map(rows.flatMap((r) => r.days.map((d) => [`${r.id}|${d.date}`, d.shiftId] as const))), [rows]);
  const [grid, setGrid] = useState(new Map(initial));
  const [fill, setFill] = useState(shifts[0]?.id ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copyTo, setCopyTo] = useState(() => { const d = new Date(`${weekStart}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 7); return d.toISOString().slice(0, 10); });
  const changed = [...grid.entries()].filter(([k, v]) => initial.get(k) !== v);
  const save = useMutation(trpc.hr.assignShifts.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: `Đã lưu: ${r.set} ca, gỡ ${r.cleared}` }); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const copy = useMutation(trpc.hr.copyWeek.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: `Đã chép ${r.set} ca sang tuần ${copyTo.split("-").reverse().join("/")}${r.skipped ? ` (bỏ qua ${r.skipped} ngày đã có ca)` : ""}` }); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const setCell = (k: string, v: string) => setGrid((g) => new Map(g).set(k, v));
  const fillRow = (r: RRow) => setGrid((g) => { const n = new Map(g); for (const d of dates) if (wdOf(d) !== "CN") n.set(`${r.id}|${d}`, fill); return n; });
  return (
    <section className="space-y-2">
      {canEdit && (
        <div className="card flex flex-wrap items-center gap-2 p-3 text-sm">
          <span>Điền nhanh:</span>
          <select className="input w-auto" value={fill} onChange={(e) => setFill(e.target.value)}>{shifts.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.startTime}–{s.endTime}</option>)}</select>
          <span className="text-xs text-ink-400">rồi bấm "T2–T7" ở từng dòng</span>
          <span className="flex-1" />
          <button className="btn-primary" disabled={!changed.length || save.isPending} onClick={() => { setMsg(null); save.mutate({ centerId, entries: changed.map(([k, v]) => { const [staffId, date] = k.split("|") as [string, string]; return { staffId, date, shiftId: v || null }; }) }); }}>Lưu {changed.length ? `(${changed.length})` : ""}</button>
          <span className="text-xs">Chép tuần này sang tuần</span>
          <input type="date" className="input w-auto" value={copyTo} onChange={(e) => setCopyTo(e.target.value)} />
          <button className="btn-ghost" disabled={copy.isPending || changed.length > 0} onClick={() => { setMsg(null); copy.mutate({ centerId, fromWeek: weekStart, toWeek: copyTo, overwrite: false }); }}>Chép</button>
        </div>
      )}
      {msg && <div className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</div>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-ink-400">
            <tr><th className="p-2 text-left">Nhân sự</th>{dates.map((d) => <th key={d} className={`p-2 ${d === today ? "text-brand-700" : ""}`}>{wdOf(d)} {d.slice(8)}/{d.slice(5, 7)}</th>)}<th className="p-2"></th></tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="p-2"><div className="font-medium">{r.fullName}</div><div className="text-xs text-ink-400">{r.code} · {r.title}</div></td>
                {r.days.map((d) => {
                  const k = `${r.id}|${d.date}`;
                  const v = grid.get(k) ?? "";
                  return (
                    <td key={d.date} className="p-1 text-center">
                      {canEdit ? (
                        <select className={`input !px-1 !py-1 text-xs ${v !== (initial.get(k) ?? "") ? "ring-2 ring-amber-300" : ""}`} value={v} onChange={(e) => setCell(k, e.target.value)}>
                          <option value="">—</option>
                          {shifts.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
                        </select>
                      ) : <span className="text-xs">{shifts.find((s) => s.id === v)?.code ?? "—"}</span>}
                      {d.leave && <div className="text-[10px] text-sky-700">nghỉ phép</div>}
                    </td>
                  );
                })}
                <td className="p-1">{canEdit && <button className="text-xs text-brand-600" onClick={() => fillRow(r)}>T2–T7</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type ShiftRow = RouterOutputs["hr"]["roster"]["shifts"][number];

export function ShiftTemplates({ centerId, shifts, canConfigure }: { centerId: string; shifts: ShiftRow[]; canConfigure: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const blank = { id: undefined as string | undefined, scope: centerId, code: "", name: "", startTime: "08:00", endTime: "17:00", breakMinutes: 60, isActive: true };
  const [f, setF] = useState<typeof blank | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation(trpc.hr.upsertShift.mutationOptions({ onSuccess: () => { setF(null); setErr(null); router.refresh(); }, onError: (e) => setErr(e.message) }));
  return (
    <section className="card space-y-2 p-4">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Ca làm việc</h2>{canConfigure && !f && <button className="text-sm text-brand-600" onClick={() => setF(blank)}>+ Thêm ca</button>}</div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-black/5">
          {shifts.map((s) => (
            <tr key={s.id} className={s.isActive ? "" : "text-ink-400"}>
              <td className="p-1 font-mono text-xs">{s.code}</td><td className="p-1">{s.name}</td><td className="p-1 tabular-nums">{s.startTime}–{s.endTime}</td><td className="p-1 text-xs">nghỉ {s.breakMinutes}′</td><td className="p-1 text-xs">{s.centerCode ?? "Dùng chung"}{s.isActive ? "" : " · tắt"}</td>
              <td className="p-1">{s.canEdit && <button className="text-xs text-brand-600" onClick={() => setF({ id: s.id, scope: s.centerId ?? "", code: s.code, name: s.name, startTime: s.startTime, endTime: s.endTime, breakMinutes: s.breakMinutes, isActive: s.isActive })}>Sửa</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {f && (
        <div className="grid gap-2 border-t border-black/5 pt-2 sm:grid-cols-3">
          <label className="text-xs text-ink-600">Mã<input className="input mt-1" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></label>
          <label className="text-xs text-ink-600">Tên<input className="input mt-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="text-xs text-ink-600">Phạm vi<select className="input mt-1" value={f.scope} disabled={!!f.id} onChange={(e) => setF({ ...f, scope: e.target.value })}><option value={centerId}>Cơ sở này</option><option value="">Dùng chung</option></select></label>
          <label className="text-xs text-ink-600">Bắt đầu<input type="time" className="input mt-1" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></label>
          <label className="text-xs text-ink-600">Kết thúc<input type="time" className="input mt-1" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></label>
          <label className="text-xs text-ink-600">Nghỉ giữa ca (phút)<input type="number" min={0} className="input mt-1" value={f.breakMinutes} onChange={(e) => setF({ ...f, breakMinutes: Number(e.target.value) })} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Đang dùng</label>
          <div className="flex items-center gap-2 sm:col-span-2">
            <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate({ id: f.id, centerId: f.scope || null, code: f.code, name: f.name, startTime: f.startTime, endTime: f.endTime, breakMinutes: f.breakMinutes, isActive: f.isActive })}>Lưu</button>
            <button className="btn-ghost" onClick={() => setF(null)}>Huỷ</button>
            {err && <span className="text-sm text-red-700">{err}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

export function GeofenceEditor({ centerId, lat, lng, radius, canConfigure }: { centerId: string; lat: number | null; lng: number | null; radius: number; canConfigure: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [f, setF] = useState({ lat: lat?.toString() ?? "", lng: lng?.toString() ?? "", radius: String(radius) });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = useMutation(trpc.hr.setGeofence.mutationOptions({ onSuccess: () => { setMsg({ ok: true, text: "Đã lưu" }); router.refresh(); }, onError: (e) => setMsg({ ok: false, text: e.message }) }));
  const here = () => navigator.geolocation?.getCurrentPosition((p) => setF((x) => ({ ...x, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) })), (e) => setMsg({ ok: false, text: e.message }), { enableHighAccuracy: true, timeout: 15000 });
  return (
    <section className="card space-y-2 p-4">
      <h2 className="font-semibold">Vị trí chấm công của cơ sở</h2>
      <p className="text-xs text-ink-600">Nhân viên chỉ chấm công được khi ở trong bán kính. Để trống toạ độ = không kiểm tra vị trí (chỉ ghi nhận).</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-ink-600">Vĩ độ<input className="input mt-1" disabled={!canConfigure} value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value })} /></label>
        <label className="text-xs text-ink-600">Kinh độ<input className="input mt-1" disabled={!canConfigure} value={f.lng} onChange={(e) => setF({ ...f, lng: e.target.value })} /></label>
        <label className="text-xs text-ink-600">Bán kính (m)<input type="number" className="input mt-1" disabled={!canConfigure} value={f.radius} onChange={(e) => setF({ ...f, radius: e.target.value })} /></label>
      </div>
      {canConfigure && (
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-ghost" onClick={here}>Lấy vị trí hiện tại</button>
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate({ centerId, latitude: f.lat ? Number(f.lat) : null, longitude: f.lng ? Number(f.lng) : null, radiusM: Number(f.radius) })}>Lưu</button>
          {f.lat && f.lng && <a className="text-xs text-brand-600" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${f.lat},${f.lng}`}>Xem trên bản đồ</a>}
        </div>
      )}
      {msg && <div className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</div>}
    </section>
  );
}
