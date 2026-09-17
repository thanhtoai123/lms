"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { StatusChip, fmtDate, fmtTime, WEEKDAY_VI } from "@/components/ui";
import { ErrorBox, OkBox } from "@/components/admin-ui";
import type { SessionStatus } from "@satarobo/core";

export type SessionRow = {
  id: string; label: string; sequenceNo: number; kind: string; date: string; startTime: string; endTime: string; status: SessionStatus;
  topic: string | null; roomId: string | null; teacherId: string | null; marked: number; remarks: number; trials: number;
  cancelReason: string | null; rescheduledFromDate: string | null;
};
type Opt = { id: string; label: string };

const fmtW = (d: string) => WEEKDAY_VI[new Date(d + "T00:00:00Z").getUTCDay() || 7];
const d = (x: string | null | undefined) => (x ? fmtDate(x) : "—");

/** Danh sách buổi của lớp + thao tác "Điều chỉnh" / "Huỷ" từng buổi */
export function SessionList({ classId, sessions, rooms, teachers, canEdit, enrolled }: {
  classId: string; sessions: SessionRow[]; rooms: Opt[]; teachers: Opt[]; canEdit: boolean; enrolled: number;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<"adjust" | "cancel">("adjust");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  void classId;
  return (
    <div className="card max-h-[70vh] divide-y divide-black/5 overflow-y-auto">
      {msg && <div className="p-3">{msg.ok ? <OkBox>{msg.text}</OkBox> : <ErrorBox>{msg.text}</ErrorBox>}</div>}
      {sessions.map((s) => {
        const closed = s.status === "cancelled" || s.status === "rescheduled";
        const canCancel = canEdit && (s.status === "scheduled" || s.status === "in_progress") && s.marked === 0;
        const canAdjust = canEdit && s.status === "scheduled" && s.marked === 0;
        return (
          <div key={s.id} className={`p-3 ${closed ? "opacity-70" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  <Link href={`/teacher/sessions/${s.id}`} className="hover:text-brand-600">{s.label}</Link>
                  {s.topic ? <span className="text-ink-600"> · {s.topic}</span> : null}
                  {s.kind !== "regular" && <span className="chip ml-1 bg-violet-100 text-violet-800">ngoài lộ trình</span>}
                  {s.trials > 0 && <span className="chip ml-1 bg-fuchsia-100 text-fuchsia-800">{s.trials} học thử</span>}
                </div>
                <div className="text-xs text-ink-400">
                  {fmtW(s.date)}, {fmtDate(s.date)} · {fmtTime(s.startTime)}–{fmtTime(s.endTime)}
                  {s.rescheduledFromDate && <span className="text-amber-700"> · dời từ {fmtDate(s.rescheduledFromDate)}</span>}
                  {" · "}{s.marked ? `đã điểm danh ${s.marked}/${enrolled}` : "chưa điểm danh"}{s.remarks ? ` · ${s.remarks} nhận xét` : ""}
                </div>
                {s.cancelReason && <div className="text-xs text-red-700">Huỷ: {s.cancelReason}</div>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <StatusChip status={s.status} />
                {(canAdjust || canCancel) && (
                  <div className="flex gap-1">
                    {canAdjust && <button className="btn-ghost !px-2 !py-0.5 text-[11px]" onClick={() => { setOpenId(openId === s.id && mode === "adjust" ? null : s.id); setMode("adjust"); setMsg(null); }}>Điều chỉnh</button>}
                    {canCancel && <button className="btn-ghost !px-2 !py-0.5 text-[11px] text-red-700" onClick={() => { setOpenId(openId === s.id && mode === "cancel" ? null : s.id); setMode("cancel"); setMsg(null); }}>Huỷ</button>}
                  </div>
                )}
              </div>
            </div>
            {openId === s.id && mode === "adjust" && (
              <AdjustForm s={s} rooms={rooms} teachers={teachers} onClose={() => setOpenId(null)} onDone={(t) => { setOpenId(null); setMsg({ ok: true, text: t }); }} />
            )}
            {openId === s.id && mode === "cancel" && (
              <CancelForm s={s} onClose={() => setOpenId(null)} onDone={(t) => { setOpenId(null); setMsg({ ok: true, text: t }); }} />
            )}
          </div>
        );
      })}
      {sessions.length === 0 && <div className="p-4 text-sm text-ink-400">Chưa có buổi học.</div>}
    </div>
  );
}

function AdjustForm({ s, rooms, teachers, onClose, onDone }: { s: SessionRow; rooms: Opt[]; teachers: Opt[]; onClose: () => void; onDone: (t: string) => void }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [f, setF] = useState({ date: "", startTime: "", endTime: "", roomId: "", teacherId: "", reason: "", notifyParents: true });
  const [error, setError] = useState<string | null>(null);
  const m = useMutation(trpc.academics.sessions.adjust.mutationOptions({
    onSuccess: (r) => { onDone(`Đã điều chỉnh ${r.label}: ${fmtDate(r.to.date)} ${r.to.startTime}–${r.to.endTime}.`); router.refresh(); },
    onError: (e) => setError(e.message),
  }));
  return (
    <form
      className="mt-2 space-y-2 rounded-xl border border-black/10 bg-black/[0.02] p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        m.mutate({
          sessionId: s.id, reason: f.reason.trim(), notifyParents: f.notifyParents,
          date: f.date || null, startTime: f.startTime || null, endTime: f.endTime || null,
          roomId: f.roomId || null, teacherId: f.teacherId || null,
        });
      }}
    >
      <div className="text-sm font-semibold">Điều chỉnh {s.label} — mặc định “Giữ nguyên”</div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-ink-600">Ngày<input type="date" className="input mt-1" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label className="text-xs text-ink-600">Giờ bắt đầu<input type="time" className="input mt-1" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></label>
        <label className="text-xs text-ink-600">Giờ kết thúc<input type="time" className="input mt-1" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></label>
        <label className="text-xs text-ink-600">Giáo viên
          <select className="input mt-1" value={f.teacherId} onChange={(e) => setF({ ...f, teacherId: e.target.value })}>
            <option value="">— Giữ nguyên —</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-600">Phòng
          <select className="input mt-1" value={f.roomId} onChange={(e) => setF({ ...f, roomId: e.target.value })}>
            <option value="">— Giữ nguyên —</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
      </div>
      <input className="input" maxLength={500} placeholder="Lý do điều chỉnh (bắt buộc, ≥ 5 ký tự — GV và phụ huynh sẽ thấy)" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
      <label className="flex items-center gap-2 text-xs text-ink-600"><input type="checkbox" checked={f.notifyParents} onChange={(e) => setF({ ...f, notifyParents: e.target.checked })} /> Báo phụ huynh trong lớp</label>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex gap-2">
        <button className="btn-primary !py-1 text-xs" disabled={m.isPending || f.reason.trim().length < 5}>{m.isPending ? "Đang lưu…" : "Lưu điều chỉnh"}</button>
        <button type="button" className="btn-ghost !py-1 text-xs" onClick={onClose}>Thôi</button>
      </div>
    </form>
  );
}

function CancelForm({ s, onClose, onDone }: { s: SessionRow; onClose: () => void; onDone: (t: string) => void }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [shift, setShift] = useState(s.kind === "regular");
  const [reason, setReason] = useState("");
  const [notifyParents, setNotifyParents] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mode = shift ? "shift" : "none";
  const preview = useQuery({ ...trpc.academics.sessions.previewCancel.queryOptions({ sessionId: s.id, mode }), retry: false });
  const m = useMutation(trpc.academics.sessions.cancel.mutationOptions({
    onSuccess: (r) => { onDone(`Đã huỷ ${r.label}${r.replacement ? ` — buổi bù ${fmtDate(r.replacement.date)} ${r.replacement.startTime}, dời ${r.moved} buổi sau` : ""}${r.trialsCancelled ? `, huỷ ${r.trialsCancelled} lượt học thử` : ""}.`); router.refresh(); },
    onError: (e) => setError(e.message),
  }));
  const p = preview.data;
  return (
    <form
      className="mt-2 space-y-2 rounded-xl border border-red-200 bg-red-50/40 p-3"
      onSubmit={(e) => { e.preventDefault(); setError(null); m.mutate({ sessionId: s.id, reason: reason.trim(), mode, notifyParents }); }}
    >
      <div className="text-sm font-semibold text-red-800">Huỷ {s.label} · {fmtDate(s.date)}</div>
      <p className="text-xs text-ink-600">Buổi chuyển trạng thái “Đã huỷ” (không xoá dữ liệu). Học thử trong buổi sẽ bị huỷ và báo tư vấn.</p>
      {s.kind === "regular" && (
        <label className="flex items-center gap-2 text-xs text-ink-700">
          <input type="checkbox" checked={shift} onChange={(e) => setShift(e.target.checked)} /> Dời các buổi sau một nhịp để lớp vẫn đủ tổng số buổi (sinh thêm buổi cuối)
        </label>
      )}
      {preview.isFetching && <div className="text-xs text-ink-400">Đang tính buổi bù…</div>}
      {p && !preview.isFetching && (
        <div className="space-y-1 text-xs">
          {p.errors.map((x) => <div key={x} className="text-red-700">• {x}</div>)}
          {p.warnings.map((x) => <div key={x} className="text-amber-800">• {x}</div>)}
          {p.conflicts.map((c, i) => <div key={i} className="text-red-700">• Trùng {c.kind === "room" ? "phòng" : "giáo viên"} ngày {fmtDate(c.date)} với {c.with}</div>)}
          {p.replacement && <div>Buổi bù: <b>{fmtDate(p.replacement.date)} {p.replacement.startTime}–{p.replacement.endTime}</b> · dời {p.moves.length} buổi sau · bế giảng {d(p.oldEndDate)} → <b>{d(p.newEndDate)}</b></div>}
          {p.trials > 0 && <div className="text-amber-800">• {p.trials} lượt học thử trong buổi sẽ bị huỷ</div>}
          {p.movedTrials > 0 && <div className="text-amber-800">• {p.movedTrials} lượt học thử ở buổi bị dời — nhớ báo phụ huynh</div>}
        </div>
      )}
      {preview.error && <ErrorBox>{preview.error.message}</ErrorBox>}
      <input className="input" maxLength={500} placeholder="Lý do huỷ buổi (bắt buộc, ≥ 5 ký tự)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <label className="flex items-center gap-2 text-xs text-ink-600"><input type="checkbox" checked={notifyParents} onChange={(e) => setNotifyParents(e.target.checked)} /> Báo phụ huynh trong lớp</label>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex gap-2">
        <button className="btn-primary !bg-red-600 !py-1 text-xs" disabled={m.isPending || reason.trim().length < 5 || !!p?.errors.length || !!p?.conflicts.length}>{m.isPending ? "Đang huỷ…" : "Xác nhận huỷ buổi"}</button>
        <button type="button" className="btn-ghost !py-1 text-xs" onClick={onClose}>Thôi</button>
      </div>
    </form>
  );
}
