"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DAY_STATUS_SHORT, DAY_STATUS_VI, REQUEST_KIND_VI, REQUEST_STATUS_VI, FLAG_REVIEW_ACTION_VI, type DayStatus, type FlagReviewAction } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { DAY_CELL, DayChip, FlagChip, flagLabel, hm, units, wdOf } from "@/components/hr-ui";
import type { RouterOutputs } from "@/lib/trpc/types";

type Row = RouterOutputs["hr"]["timesheet"]["rows"][number];

export function TimesheetGrid({ dates, rows, canUpdate }: { dates: string[]; rows: Row[]; canUpdate: boolean }) {
  const [sel, setSel] = useState<{ staffId: string; date: string } | null>(null);
  return (
    <div className="space-y-3">
      <div className="card overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr className="text-ink-400">
              <th className="sticky left-0 z-10 bg-white p-2 text-left">Nhân sự</th>
              {dates.map((d) => <th key={d} className={`px-0.5 py-1 text-center font-normal ${wdOf(d) === "CN" ? "text-red-500" : ""}`}><div>{wdOf(d)}</div><div>{d.slice(8)}</div></th>)}
              <th className="p-2 text-right">Công</th><th className="p-2 text-right">Phép</th><th className="p-2 text-right">Lương</th><th className="p-2 text-right">Cờ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white p-2"><a href={`/nhan-su/${r.id}`} className="font-medium text-brand-700">{r.fullName}</a><div className="text-ink-400">{r.code}</div></td>
                {r.days.map((c) => (
                  <td key={c.date} className="px-0.5 py-1 text-center">
                    <button
                      title={`${DAY_STATUS_VI[c.status as DayStatus]}${c.shiftCode ? ` · ca ${c.shiftCode}` : ""}${c.inMin != null || c.outMin != null ? ` · ${hm(c.inMin)}–${hm(c.outMin)}` : ""}${c.openFlags.length ? ` · ${c.openFlags.map(flagLabel).join(", ")}` : ""}`}
                      onClick={() => setSel({ staffId: r.id, date: c.date })}
                      className={`relative h-7 w-7 rounded ${DAY_CELL[c.status as DayStatus]} ${sel?.staffId === r.id && sel.date === c.date ? "ring-2 ring-brand-500" : ""} ${c.status === "off" ? "hover:bg-black/5" : ""}`}
                    >
                      {c.override ? "✎" : c.shiftCode && c.status !== "off" ? DAY_STATUS_SHORT[c.status as DayStatus] || c.shiftCode.slice(0, 2) : DAY_STATUS_SHORT[c.status as DayStatus]}
                      {c.openFlags.length > 0 && <span className="absolute -left-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500" title="Cờ chưa rà" />}
                      {c.hasRequest && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500" />}
                    </button>
                  </td>
                ))}
                <td className="p-2 text-right tabular-nums font-semibold">{units(r.summary.workUnits)}</td>
                <td className="p-2 text-right tabular-nums">{units(r.summary.paidLeave + r.summary.unpaidLeave)}</td>
                <td className="p-2 text-right tabular-nums font-semibold text-brand-700">{units(r.summary.payableUnits)}</td>
                <td className="p-2 text-right tabular-nums">{r.openFlagCount ? <span className="chip bg-amber-100 text-amber-800">{r.openFlagCount}</span> : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sel && <DayPanel key={`${sel.staffId}${sel.date}`} staffId={sel.staffId} date={sel.date} canUpdate={canUpdate} onClose={() => setSel(null)} />}
    </div>
  );
}

function DayPanel({ staffId, date, canUpdate, onClose }: { staffId: string; date: string; canUpdate: boolean; onClose: () => void }) {
  const trpc = useTRPC();
  const router = useRouter();
  const q = useQuery(trpc.hr.dayDetail.queryOptions({ staffId, date }));
  const [unitsV, setUnits] = useState("1");
  const [label, setLabel] = useState("Công tác");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const done = { onSuccess: () => { setErr(null); setReason(""); setNote(""); q.refetch(); router.refresh(); }, onError: (e: { message: string }) => setErr(e.message) };
  const ov = useMutation(trpc.hr.overrideDay.mutationOptions(done));
  const rv = useMutation(trpc.hr.reviewFlag.mutationOptions(done));
  const d = q.data;
  const review = (flag: string, action: FlagReviewAction) => rv.mutate({ staffId, date, flag, action, note: note.trim() || null });
  return (
    <section className="card space-y-2 p-4 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{d?.staff.fullName ?? "…"} · {wdOf(date)} {date.split("-").reverse().join("/")}</h3>
        <button className="text-ink-600" onClick={onClose}>Đóng</button>
      </div>
      {q.error && <div className="text-red-700">{q.error.message}</div>}
      {d && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <DayChip status={d.cell.status} />
            <span>Ca: {d.cell.shift ? `${d.cell.shift.code} · ${d.cell.shift.name}${d.cell.shift.clock ? ` (${d.cell.shift.clock})` : ""}` : "không có"}</span>
            <span>Vào/ra: <b className="tabular-nums">{hm(d.cell.inMin)} – {hm(d.cell.outMin)}</b> ({d.cell.punches} lượt)</span>
            <span>Công: <b>{units(d.cell.units)}</b></span>
            <span className="text-ink-500">Giờ làm / KH: {Math.round(d.cell.workedMin / 6) / 10}h / {Math.round(d.cell.plannedMin / 6) / 10}h</span>
            {d.cell.lateMin > 0 && <span className="text-amber-700">Muộn {d.cell.lateMin}′</span>}
            {d.cell.earlyMin > 0 && <span className="text-amber-700">Sớm {d.cell.earlyMin}′</span>}
            {d.cell.otMin > 0 && <span>OT {d.cell.otMin}′</span>}
            {d.cell.holidayName && <span className="text-violet-700">{d.cell.holidayName}</span>}
            {d.locked && <span className="chip bg-slate-800 text-white">Kỳ {d.locked} đã chốt — số công không đổi được</span>}
          </div>
          <p className="text-xs text-ink-400">Công đếm theo ca đã xếp; lượt quét chỉ sinh cờ để rà — muốn đổi số công thì ghi đè có lý do.</p>
          {d.cell.flags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {d.cell.flags.map((f) => <FlagChip key={f} flag={f} open={d.cell.openFlags.includes(f)} />)}
            </div>
          )}
          {d.cell.override && <div className="rounded-lg bg-indigo-50 p-2 text-xs">Đã ghi đè: {units(d.cell.override.units)} công ({d.cell.override.label}) — {d.cell.override.reason}</div>}
          {d.reviews.length > 0 && (
            <div className="rounded-lg bg-black/5 p-2 text-xs">
              {d.reviews.map((r) => <div key={r.id}>{FLAG_REVIEW_ACTION_VI[r.action as FlagReviewAction]} · {r.flag === "*" ? "cả ngày" : flagLabel(r.flag)} — {r.note} {r.byName ? `(${r.byName})` : ""}</div>)}
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-ink-600">Lượt chấm</div>
              {d.punches.length === 0 ? <div className="text-xs text-ink-400">Không có</div> : d.punches.map((p) => (
                <div key={p.id} className="text-xs">
                  {p.kind === "in" ? "Vào" : "Ra"} {new Date(p.at).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" })} ·
                  {p.source === "qr" ? ` quét QR${p.distanceM != null ? ` ${p.distanceM}m` : ""}` : p.source === "request" ? " qua đơn" : " sửa tay"}
                  {(p.flags ?? []).length > 0 ? ` · ${(p.flags ?? []).map(flagLabel).join(", ")}` : ""}{p.note ? ` · ${p.note}` : ""}{p.byName ? ` · ${p.byName}` : ""}
                </div>
              ))}
            </div>
            <div>
              <div className="text-xs font-semibold text-ink-600">Đơn liên quan</div>
              {d.requests.length === 0 ? <div className="text-xs text-ink-400">Không có</div> : d.requests.map((r) => (
                <div key={r.id} className="text-xs">{REQUEST_KIND_VI[r.kind]} · {REQUEST_STATUS_VI[r.status]} — {r.reason}</div>
              ))}
            </div>
          </div>
          {canUpdate && d.canReview && (
            <div className="space-y-2 border-t border-black/5 pt-2">
              <label className="block text-xs text-ink-600">Ghi chú kết luận / lý do<input className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: có xác nhận của quản lý, đi công tác CS2" /></label>
              {d.cell.openFlags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  <span className="text-ink-600">Rà cờ:</span>
                  {d.cell.openFlags.map((f) => (
                    <button key={f} className="btn-ghost !px-2 !py-1 text-xs" disabled={note.trim().length < 5 || rv.isPending} onClick={() => review(f, "ack")}>Ghi nhận “{flagLabel(f)}”</button>
                  ))}
                  <button className="btn-ghost !px-2 !py-1 text-xs" disabled={note.trim().length < 5 || rv.isPending} onClick={() => review("*", "ack")}>Ghi nhận cả ngày</button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1 text-xs">
                {(d.cell.status === "absent" || d.cell.flags.includes("no_punch")) && (
                  <>
                    <button className="btn-ghost !px-2 !py-1 text-xs" disabled={note.trim().length < 5 || rv.isPending} onClick={() => review("no_punch", "excused")}>Vắng có lý do</button>
                    <button className="btn-ghost !px-2 !py-1 text-xs" disabled={note.trim().length < 5 || rv.isPending} onClick={() => review("no_punch", "unexcused")}>Đã ghi nhận nghỉ không phép</button>
                  </>
                )}
                {d.reviews.map((r) => (
                  <button key={`d${r.id}`} className="btn-ghost !px-2 !py-1 text-xs text-red-700" disabled={rv.isPending} onClick={() => rv.mutate({ staffId, date, flag: r.flag, action: "dismiss", note: null })}>Gỡ kết luận {r.flag === "*" ? "cả ngày" : flagLabel(r.flag)}</button>
                ))}
              </div>
            </div>
          )}
          {canUpdate && d.canOverride && (
            <div className="flex flex-wrap items-end gap-2 border-t border-black/5 pt-2">
              <label className="text-xs text-ink-600">Công<select className="input mt-1 w-auto" value={unitsV} onChange={(e) => setUnits(e.target.value)}><option value="1">1</option><option value="0.5">0,5</option><option value="0">0</option><option value="1.5">1,5</option></select></label>
              <label className="text-xs text-ink-600">Nhãn<input className="input mt-1 w-32" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
              <label className="flex-1 text-xs text-ink-600">Lý do (bắt buộc)<input className="input mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: đi công tác CS2 có xác nhận QL" /></label>
              <button className="btn-primary" disabled={reason.trim().length < 5 || ov.isPending} onClick={() => ov.mutate({ staffId, date, units: Number(unitsV), label, reason: reason.trim() })}>Ghi đè công</button>
              {d.cell.override && <button className="btn-ghost" disabled={reason.trim().length < 5 || ov.isPending} onClick={() => ov.mutate({ staffId, date, units: null, reason: reason.trim() })}>Bỏ ghi đè</button>}
            </div>
          )}
          {err && <div className="text-red-700">{err}</div>}
        </>
      )}
    </section>
  );
}

export function PeriodActions({ centerId, period, status, blockers, warnings, canLock, canUnlock, standardUnits }: { centerId: string; period: string; status: string; blockers: string[]; warnings: string[]; canLock: boolean; canUnlock: boolean; standardUnits: number }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [std, setStd] = useState(String(standardUnits));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const lock = useMutation(trpc.hr.lockPeriod.mutationOptions({ onSuccess: (r) => { setMsg({ ok: true, text: [`Đã chốt kỳ (bản chốt lần ${r.closeCount}) — ${r.note}`, ...r.warnings].join(" · ") }); router.refresh(); }, onError: (e) => setMsg({ ok: false, text: e.message }) }));
  const unlock = useMutation(trpc.hr.unlockPeriod.mutationOptions({ onSuccess: (r) => { setMsg({ ok: true, text: `Đã mở lại kỳ — ${r.note}` }); setReason(""); router.refresh(); }, onError: (e) => setMsg({ ok: false, text: e.message }) }));
  const setStdM = useMutation(trpc.hr.setPeriodStandard.mutationOptions({ onSuccess: () => { setMsg({ ok: true, text: "Đã lưu công chuẩn" }); router.refresh(); }, onError: (e) => setMsg({ ok: false, text: e.message }) }));
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {(status === "open" || status === "reopened" || status === "closing") && canLock && (
        <>
          <label className="flex items-center gap-1">Công chuẩn<input className="input !w-16 !py-1 text-xs" value={std} onChange={(e) => setStd(e.target.value)} /></label>
          <button className="btn-ghost !py-1 text-xs" disabled={setStdM.isPending} onClick={() => setStdM.mutate({ centerId, period, standardUnits: std.trim() === "" ? null : Number(std.replace(",", ".")), note: null })}>Lưu</button>
          <button className="btn-primary !py-1 text-xs" disabled={blockers.length > 0 || lock.isPending} onClick={() => lock.mutate({ centerId, period })} title="Chốt xong, số công của kỳ này không đổi được từ màn nào nữa">Chốt kỳ công</button>
          {blockers.length > 0 && <span className="text-amber-700">{blockers.join(" · ")}</span>}
          {blockers.length === 0 && warnings.length > 0 && <span className="text-amber-700">Cảnh báo: {warnings.join(" · ")}</span>}
        </>
      )}
      {status === "closed" && canUnlock && (
        <>
          <input className="input !w-56 !py-1 text-xs" placeholder="Lý do mở lại" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn-ghost !py-1 text-xs" disabled={reason.trim().length < 5 || unlock.isPending} onClick={() => unlock.mutate({ centerId, period, reason: reason.trim() })}>Mở lại kỳ</button>
          <span className="text-ink-500">Số đã chốt vẫn nằm trong nhật ký; chốt lại sau đó sẽ ghi một bản mới.</span>
        </>
      )}
      {msg && <span className={msg.ok ? "text-green-700" : "text-red-700"}>{msg.text}</span>}
    </div>
  );
}
