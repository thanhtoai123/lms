"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { CLASS_STATUS_VI, SESSION_KINDS, SESSION_KIND_VI, type SessionKind } from "@satarobo/core";
import { WEEKDAY_VI } from "@/components/ui";
import { SlotEditor, toSlotInput, type SlotRow, type Opt } from "./slot-editor";
import { PhaseEditor, toPhaseInput, emptyPhase, type PhaseRow } from "./phase-editor";

type WS = RouterOutputs["academics"]["classes"]["workspace"];
type Check = RouterOutputs["academics"]["classes"]["scheduleCheck"];

const fmt = (d: string | null | undefined) => (d ? d.split("-").reverse().join("/") : "—");

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <div className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>;
}

function useMsg() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return { msg, ok: (text: string) => setMsg({ ok: true, text }), err: (e: { message: string }) => setMsg({ ok: false, text: e.message }), clear: () => setMsg(null) };
}

const STATUS_CHIP: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending_approval: "bg-amber-100 text-amber-800",
  recruiting: "bg-sky-100 text-sky-800",
  running: "bg-green-100 text-green-800",
  finished: "bg-violet-100 text-violet-800",
  cancelled: "bg-red-100 text-red-700",
};

/* ------------------------------------------------------------------ */
/* Trạng thái & phê duyệt                                              */
/* ------------------------------------------------------------------ */

export function StatusPanel({ classId, ws }: { classId: string; ws: WS }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMsg();
  const [reason, setReason] = useState("");
  const tr = useMutation(trpc.academics.classes.transition.mutationOptions({
    onSuccess: (r) => { m.ok(`Đã chuyển sang "${CLASS_STATUS_VI[r.status]}"${r.sessionsCreated ? ` — sinh ${r.sessionsCreated} buổi học` : ""}.`); setReason(""); router.refresh(); },
    onError: m.err,
  }));
  // Huỷ lớp đi qua khối "Huỷ lớp dây chuyền" (có xem trước) bên dưới
  const actions = ws.actions.filter((a) => a.event !== "cancel");
  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Trạng thái lớp <span className={`chip ml-1 ${STATUS_CHIP[ws.status]}`}>{CLASS_STATUS_VI[ws.status]}</span></h2>
        <div className="text-xs text-ink-400">
          {ws.submittedAt && <>Gửi duyệt: {ws.submittedByName ?? "?"} · {new Date(ws.submittedAt).toLocaleString("vi-VN")}</>}
          {ws.approvedAt && <> · Duyệt: {ws.approvedByName ?? "?"} · {new Date(ws.approvedAt).toLocaleString("vi-VN")}</>}
        </div>
      </div>
      {ws.statusReason && <p className="text-sm text-amber-800">Ghi chú trạng thái: {ws.statusReason}</p>}
      {ws.planning && (
        ws.readiness.length ? (
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <b>Chưa đủ điều kiện mở lớp:</b>
            <ul className="ml-4 list-disc">{ws.readiness.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        ) : ws.preview ? (
          <div className={`rounded-xl p-3 text-sm ${ws.preview.error ? "bg-red-50 text-red-700" : "bg-sky-50 text-sky-900"}`}>
            {ws.preview.error ? ws.preview.error : <>Khi duyệt sẽ sinh <b>{ws.preview.count}</b> buổi, từ {fmt(ws.preview.firstDate)} đến {fmt(ws.preview.lastDate)} (bỏ ngày nghỉ).</>}
          </div>
        ) : null
      )}
      <Msg msg={m.msg} />
      {actions.length > 0 ? (
        <div className="space-y-2">
          <input className="input" maxLength={500} placeholder="Lý do / ghi chú (bắt buộc khi trả về; khi bắt đầu lớp chưa đủ sĩ số tối thiểu)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <button
                key={a.event}
                className={a.event === "cancel" || a.event === "reject" ? "btn-ghost text-red-700" : "btn-primary"}
                disabled={tr.isPending || (a.needsReason && reason.trim().length < 5) || (a.event === "approve" && (ws.readiness.length > 0 || !!ws.preview?.error))}
                onClick={() => { m.clear(); tr.mutate({ classId, event: a.event, reason: reason.trim() || null }); }}
              >
                {tr.isPending ? "Đang xử lý…" : a.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-ink-400">{ws.status === "finished" || ws.status === "cancelled" ? "Lớp đã đóng." : "Bạn không có thao tác nào ở trạng thái này."}</p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Huỷ lớp dây chuyền                                                  */
/* ------------------------------------------------------------------ */

export function CancelClassPanel({ classId, ws }: { classId: string; ws: WS }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMsg();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const preview = useQuery({ ...trpc.academics.classes.previewCancel.queryOptions({ id: classId }), enabled: open, retry: false });
  const cancel = useMutation(trpc.academics.classes.transition.mutationOptions({
    onSuccess: (r) => {
      const c = r.cascade;
      m.ok(`Đã huỷ lớp${c ? `: rút ${c.withdrawn} ghi danh, huỷ ${c.sessions} buổi${c.trials ? `, huỷ ${c.trials} lượt học thử` : ""}${c.refunds ? `, tạo ${c.refunds} đề xuất hoàn tiền` : ""}` : ""}.`);
      setOpen(false); setReason(""); setConfirm(false); router.refresh();
    },
    onError: m.err,
  }));
  if (!ws.canApprove || ws.status === "cancelled" || ws.status === "finished") return null;
  const p = preview.data;
  return (
    <section className="card space-y-2 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-red-800">Huỷ lớp</h2>
        {!open && <button className="btn-ghost !py-1 text-xs text-red-700" onClick={() => { setOpen(true); m.clear(); }}>Huỷ lớp…</button>}
      </div>
      <p className="text-xs text-ink-600">Rút toàn bộ ghi danh còn học, huỷ các buổi tương lai, huỷ lượt học thử và tạo đề xuất hoàn tiền cho khoản đã thu. <b>Không thể hoàn tác.</b></p>
      <Msg msg={m.msg} />
      {open && (
        <div className="space-y-2 rounded-xl border border-red-200 bg-red-50/50 p-3">
          {preview.isFetching && <div className="text-sm text-ink-400">Đang tính ảnh hưởng…</div>}
          {preview.error && <Msg msg={{ ok: false, text: preview.error.message }} />}
          {p && (
            <>
              {!p.canCancel && <Msg msg={{ ok: false, text: "Trạng thái lớp hiện tại không cho huỷ" }} />}
              <ul className="text-sm">
                <li>• <b>{p.enrollmentCount}</b> ghi danh còn học sẽ chuyển sang “Đã nghỉ”{p.enrollments.length ? `: ${p.enrollments.slice(0, 8).map((e) => e.studentName).join(", ")}${p.enrollments.length > 8 ? `… (+${p.enrollments.length - 8})` : ""}` : ""}</li>
                <li>• <b>{p.futureSessions}</b> buổi từ hôm nay trở đi sẽ bị huỷ</li>
                <li>• <b>{p.trials}</b> lượt học thử sẽ bị huỷ (báo tư vấn)</li>
                <li>• Đã thu <b>{p.collectedLabel}</b> — phần chưa học sẽ được tạo đề xuất hoàn tiền chờ duyệt</li>
              </ul>
            </>
          )}
          <input className="input" maxLength={500} placeholder="Lý do huỷ lớp (bắt buộc, ≥ 5 ký tự)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <label className="flex items-center gap-2 text-xs text-red-800"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> Tôi hiểu thao tác này không thể hoàn tác</label>
          <div className="flex gap-2">
            <button className="btn-primary !bg-red-600" disabled={cancel.isPending || !confirm || reason.trim().length < 5 || !p?.canCancel} onClick={() => { m.clear(); cancel.mutate({ classId, event: "cancel", reason: reason.trim() }); }}>
              {cancel.isPending ? "Đang huỷ…" : "Xác nhận huỷ lớp"}
            </button>
            <button className="btn-ghost" onClick={() => { setOpen(false); setConfirm(false); }}>Thôi</button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Thông tin lớp                                                       */
/* ------------------------------------------------------------------ */

export function InfoPanel({ classId, ws }: { classId: string; ws: WS }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMsg();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({
    name: ws.info.name, description: ws.info.description ?? "", homeRoomId: ws.info.homeRoomId ?? "", leadTeacherId: ws.info.leadTeacherId ?? "",
    assistantTeacherId: ws.info.assistantTeacherId ?? "", capacity: ws.info.capacity, minCapacity: ws.info.minCapacity,
    startDate: ws.info.startDate ?? "", plannedSessions: ws.info.plannedSessions ?? 0, classGroupId: ws.info.classGroupId ?? "", applyTeacherToFuture: true,
  });
  const save = useMutation(trpc.academics.classes.updateInfo.mutationOptions({
    onSuccess: (r) => { m.ok(`Đã lưu thông tin lớp${r.movedSessions ? ` — ${r.movedSessions} buổi sắp tới chuyển cho GV mới` : ""}.`); setEdit(false); router.refresh(); },
    onError: m.err,
  }));
  const teacherName = (id: string | null) => ws.teacherOptions.find((t) => t.id === id)?.fullName ?? "—";
  const roomName = (id: string | null) => ws.roomOptions.find((r) => r.id === id)?.code ?? "—";
  const groupName = (id: string | null) => { const g = ws.groupOptions.find((x) => x.id === id); return g ? `${g.code} — ${g.name}` : "—"; };
  const leadChanged = f.leadTeacherId !== (ws.info.leadTeacherId ?? "");
  const closed = ws.status === "finished" || ws.status === "cancelled";

  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Thông tin lớp</h2>
        {ws.canUpdate && !closed && !edit && <button className="text-xs font-semibold text-brand-600" onClick={() => { setEdit(true); m.clear(); }}>Sửa</button>}
      </div>
      <Msg msg={m.msg} />
      {!edit ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink-400">GV chính</dt><dd>{teacherName(ws.info.leadTeacherId)}</dd>
          <dt className="text-ink-400">Trợ giảng</dt><dd>{teacherName(ws.info.assistantTeacherId)}</dd>
          <dt className="text-ink-400">Phòng mặc định</dt><dd>{roomName(ws.info.homeRoomId)}</dd>
          <dt className="text-ink-400">Nhóm lớp</dt><dd>{groupName(ws.info.classGroupId)}</dd>
          <dt className="text-ink-400">Sĩ số</dt><dd>tối thiểu {ws.info.minCapacity} · tối đa {ws.info.capacity}</dd>
          <dt className="text-ink-400">Khai giảng</dt><dd>{fmt(ws.info.startDate)}</dd>
          <dt className="text-ink-400">Bế giảng dự kiến</dt><dd>{fmt(ws.info.expectedEndDate)}</dd>
          <dt className="text-ink-400">Số buổi chuẩn</dt><dd>{ws.info.plannedSessions ?? "—"}</dd>
          {ws.info.description && <><dt className="text-ink-400">Mô tả đặc thù</dt><dd className="whitespace-pre-wrap">{ws.info.description}</dd></>}
        </dl>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs text-ink-600">Tên lớp<input className="input mt-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs text-ink-600">GV chính
              <select className="input mt-1" value={f.leadTeacherId} onChange={(e) => setF({ ...f, leadTeacherId: e.target.value })}>
                <option value="">— Chưa phân —</option>
                {ws.teacherOptions.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
              </select>
            </label>
            <label className="text-xs text-ink-600">Trợ giảng
              <select className="input mt-1" value={f.assistantTeacherId} onChange={(e) => setF({ ...f, assistantTeacherId: e.target.value })}>
                <option value="">— Không —</option>
                {ws.teacherOptions.filter((t) => t.id !== f.leadTeacherId).map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
              </select>
            </label>
            <label className="text-xs text-ink-600">Phòng mặc định
              <select className="input mt-1" value={f.homeRoomId} onChange={(e) => setF({ ...f, homeRoomId: e.target.value })}>
                <option value="">— Không —</option>
                {ws.roomOptions.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.name} ({r.capacity})</option>)}
              </select>
            </label>
            <label className="text-xs text-ink-600">Nhóm lớp
              <select className="input mt-1" value={f.classGroupId} onChange={(e) => setF({ ...f, classGroupId: e.target.value })}>
                <option value="">— Không thuộc nhóm —</option>
                {ws.groupOptions.map((g) => <option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-ink-600">Sĩ số tối thiểu<input type="number" min={1} max={30} className="input mt-1" value={f.minCapacity} onChange={(e) => setF({ ...f, minCapacity: Number(e.target.value) })} /></label>
            <label className="text-xs text-ink-600">Sĩ số tối đa<input type="number" min={1} max={30} className="input mt-1" value={f.capacity} onChange={(e) => setF({ ...f, capacity: Number(e.target.value) })} /></label>
            {ws.planning && (
              <>
                <label className="text-xs text-ink-600">Khai giảng<input type="date" className="input mt-1" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></label>
                <label className="text-xs text-ink-600">Số buổi chuẩn<input type="number" min={1} max={200} className="input mt-1" value={f.plannedSessions} onChange={(e) => setF({ ...f, plannedSessions: Number(e.target.value) })} /></label>
              </>
            )}
          </div>
          {leadChanged && !ws.planning && f.leadTeacherId && (
            <label className="flex items-center gap-2 text-xs text-ink-600">
              <input type="checkbox" checked={f.applyTeacherToFuture} onChange={(e) => setF({ ...f, applyTeacherToFuture: e.target.checked })} />
              Chuyển các buổi sắp tới của GV cũ cho GV mới (kiểm tra trùng lịch, báo cả hai GV)
            </label>
          )}
          <label className="block text-xs text-ink-600">Mô tả đặc thù (bàn giao)<textarea className="input mt-1 min-h-16" maxLength={1000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate({
              id: classId, name: f.name, description: f.description || null, homeRoomId: f.homeRoomId || null, leadTeacherId: f.leadTeacherId || null,
              assistantTeacherId: f.assistantTeacherId || null, capacity: f.capacity, minCapacity: f.minCapacity, classGroupId: f.classGroupId || null,
              startDate: ws.planning ? f.startDate || null : undefined, plannedSessions: ws.planning ? f.plannedSessions || null : undefined,
              applyTeacherToFuture: leadChanged && f.applyTeacherToFuture,
            })}>{save.isPending ? "Đang lưu…" : "Lưu"}</button>
            <button className="btn-ghost" onClick={() => setEdit(false)}>Thôi</button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Kế hoạch lịch học (nhiều giai đoạn) + áp lịch mới                   */
/* ------------------------------------------------------------------ */

export function SchedulePanel({ classId, ws }: { classId: string; ws: WS }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMsg();
  const rooms: Opt[] = ws.roomOptions.map((r) => ({ id: r.id, label: r.code }));
  const teachers: Opt[] = ws.teacherOptions.map((t) => ({ id: t.id, label: t.fullName }));
  const current = ws.phases.filter((p) => (ws.planning ? true : p.current || p.future));
  const seed: SlotRow[] = (current.length ? current : ws.phases).map((p) => ({
    weekday: p.weekday as SlotRow["weekday"], startTime: p.startTime, endTime: p.endTime,
    roomId: p.roomId && p.roomId !== ws.info.homeRoomId ? p.roomId : "", teacherId: p.teacherId && p.teacherId !== ws.info.leadTeacherId ? p.teacherId : "",
  }));
  const [rows, setRows] = useState<SlotRow[]>(seed.length ? seed : [{ weekday: 6, startTime: "15:45", endTime: "17:15", roomId: "", teacherId: "" }]);
  const seedPhases: PhaseRow[] = ws.phaseGroups.length
    ? ws.phaseGroups.map((g) => ({
        from: g.from, to: g.to ?? "", note: g.note ?? "",
        slots: g.slots.map((s) => ({
          weekday: s.weekday as SlotRow["weekday"], startTime: s.startTime, endTime: s.endTime,
          roomId: s.roomId && s.roomId !== ws.info.homeRoomId ? s.roomId : "", teacherId: s.teacherId && s.teacherId !== ws.info.leadTeacherId ? s.teacherId : "",
        })),
      }))
    : [emptyPhase(ws.info.startDate ?? ws.today)];
  const [phases, setPhases] = useState<PhaseRow[]>(seedPhases);
  const [open, setOpen] = useState(false);
  const tomorrow = new Date(Date.now() + 7 * 3600e3 + 86400e3).toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(tomorrow);
  const [reason, setReason] = useState("");
  const [notifyParents, setNotifyParents] = useState(true);
  const [previewKey, setPreviewKey] = useState<{ slots: ReturnType<typeof toSlotInput>; fromDate: string } | null>(null);

  const savePhases = useMutation(trpc.academics.classes.savePhases.mutationOptions({ onSuccess: (r) => { m.ok(`Đã lưu kế hoạch lịch (${r.phases} giai đoạn).`); setOpen(false); router.refresh(); }, onError: m.err }));
  const preview = useQuery({ ...trpc.academics.classes.previewSchedule.queryOptions({ classId, slots: previewKey?.slots ?? [], fromDate: previewKey?.fromDate ?? tomorrow }), enabled: !!previewKey, retry: false });
  const apply = useMutation(trpc.academics.classes.applySchedule.mutationOptions({
    onSuccess: (r) => { m.ok(`Đã áp lịch mới: ${r.changed} buổi được xếp lại, bế giảng dự kiến ${fmt(r.newEndDate)}.`); setOpen(false); setPreviewKey(null); setReason(""); router.refresh(); },
    onError: m.err,
  }));
  const canEdit = ws.canUpdate && (ws.planning || ws.status === "recruiting" || ws.status === "running");
  const p = preview.data;
  const stale = previewKey && (JSON.stringify(previewKey.slots) !== JSON.stringify(toSlotInput(rows)) || previewKey.fromDate !== fromDate);

  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Kế hoạch lịch học</h2>
        {canEdit && !open && <button className="text-xs font-semibold text-brand-600" onClick={() => { setOpen(true); m.clear(); }}>{ws.planning ? "Sửa lịch" : "Áp lịch mới"}</button>}
      </div>
      <Msg msg={m.msg} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-2">Thứ</th><th className="p-2">Giờ</th><th className="p-2">Phòng</th><th className="p-2">GV</th><th className="p-2">Hiệu lực</th><th className="p-2"></th></tr></thead>
          <tbody className="divide-y divide-black/5">
            {ws.phases.map((ph) => (
              <tr key={ph.id} className={ph.past ? "text-ink-400" : ""}>
                <td className="p-2">{WEEKDAY_VI[ph.weekday]}</td>
                <td className="p-2 tabular-nums">{ph.startTime}–{ph.endTime}</td>
                <td className="p-2">{ph.roomCode ?? "—"}</td>
                <td className="p-2">{ph.teacherName ?? "—"}</td>
                <td className="p-2 text-xs">{fmt(ph.effectiveFrom)} → {ph.effectiveTo ? fmt(ph.effectiveTo) : "hết khoá"}{ph.note && <div className="text-ink-600">{ph.note}</div>}{ph.changeReason && <div className="text-amber-800">{ph.changeReason}</div>}</td>
                <td className="p-2">{ph.current ? <span className="chip bg-green-100 text-green-800">Đang áp dụng</span> : ph.future ? <span className="chip bg-sky-100 text-sky-800">Sắp áp dụng</span> : <span className="chip bg-black/5">Đã hết</span>}</td>
              </tr>
            ))}
            {ws.phases.length === 0 && <tr><td colSpan={6} className="p-3 text-sm text-ink-400">Chưa có ca học nào.</td></tr>}
          </tbody>
        </table>
      </div>

      {open && ws.planning && (
        <div className="space-y-2 rounded-xl border border-black/10 p-3">
          <div className="label">Kế hoạch lịch học (nhiều giai đoạn)</div>
          <PhaseEditor rows={phases} onChange={setPhases} rooms={rooms} teachers={teachers} startDate={ws.info.startDate ?? ""} />
          <input className="input" maxLength={300} placeholder="Lý do thay đổi (ghi nhật ký lớp, tuỳ chọn)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-primary" disabled={savePhases.isPending} onClick={() => { m.clear(); savePhases.mutate({ classId, phases: toPhaseInput(phases), reason: reason.trim() || null }); }}>
              {savePhases.isPending ? "Đang lưu…" : "Lưu kế hoạch lịch"}
            </button>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Thôi</button>
          </div>
        </div>
      )}

      {open && !ws.planning && (
        <div className="space-y-3 rounded-xl border border-black/10 p-3">
          <p className="text-xs text-ink-600">Chỉ xếp lại các buổi <b>chính thức chưa diễn ra, chưa điểm danh</b> từ ngày áp dụng; giữ nguyên số buổi và bỏ ngày nghỉ. Buổi đã học, buổi coach / bù không bị đụng tới.</p>
          <SlotEditor rows={rows} onChange={setRows} rooms={rooms} teachers={teachers} />
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-ink-600">Áp dụng từ ngày<input type="date" className="input mt-1" min={tomorrow} value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></label>
            <button className="btn-ghost" onClick={() => { m.clear(); setPreviewKey({ slots: toSlotInput(rows), fromDate }); }}>Xem trước thay đổi</button>
            <button className="btn-ghost" onClick={() => { setOpen(false); setPreviewKey(null); }}>Thôi</button>
          </div>
          {preview.isFetching && <div className="text-sm text-ink-400">Đang tính…</div>}
          {preview.error && <Msg msg={{ ok: false, text: preview.error.message }} />}
          {p && !preview.isFetching && (
            <div className="space-y-2">
              {p.errors.length > 0 && <Msg msg={{ ok: false, text: p.errors.join("; ") }} />}
              {p.conflicts.length > 0 && (
                <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  <b>Trùng lịch:</b>
                  <ul className="ml-4 list-disc">{p.conflicts.slice(0, 6).map((c, i) => <li key={i}>{c.kind === "room" ? "Phòng" : "Giáo viên"} ngày {fmt(c.date)} — {c.with}</li>)}</ul>
                </div>
              )}
              {p.warnings.map((w) => <div key={w} className="rounded-xl bg-amber-50 p-2 text-xs text-amber-900">{w}</div>)}
              {p.errors.length === 0 && (
                <>
                  <div className="text-sm">
                    <b>{p.changedCount}</b>/{p.movable} buổi thay đổi · bế giảng dự kiến {fmt(p.oldEndDate)} → <b>{fmt(p.newEndDate)}</b>
                  </div>
                  <div className="max-h-72 overflow-y-auto rounded-xl border border-black/10">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white text-left uppercase text-ink-400"><tr><th className="p-2">Buổi</th><th className="p-2">Hiện tại</th><th className="p-2">Sau khi áp</th></tr></thead>
                      <tbody className="divide-y divide-black/5">
                        {p.changes.map((c) => (
                          <tr key={c.sessionId} className={c.changed ? "" : "text-ink-400"}>
                            <td className="p-2">Buổi {c.sequenceNo}{c.trials > 0 && <span className="chip ml-1 bg-fuchsia-100 text-fuchsia-800">{c.trials} học thử</span>}</td>
                            <td className="p-2">{fmt(c.from.date)} {c.from.startTime}–{c.from.endTime} · {c.fromRoom ?? "—"} · {c.fromTeacher ?? "—"}</td>
                            <td className={`p-2 ${c.changed ? "font-semibold text-brand-700" : ""}`}>{c.changed ? `${fmt(c.to.date)} ${c.to.startTime}–${c.to.endTime} · ${c.toRoom ?? "—"} · ${c.toTeacher ?? "—"}` : "không đổi"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <input className="input" maxLength={300} placeholder="Lý do thay đổi lịch (bắt buộc, GV và nhật ký sẽ thấy)" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <label className="flex items-center gap-2 text-xs text-ink-600"><input type="checkbox" checked={notifyParents} onChange={(e) => setNotifyParents(e.target.checked)} /> Gửi thông báo đổi lịch cho phụ huynh trong lớp</label>
                  {stale && <div className="text-xs text-amber-800">Bạn đã sửa lịch sau khi xem trước — bấm “Xem trước thay đổi” lại.</div>}
                  <button
                    className="btn-primary"
                    disabled={apply.isPending || !!stale || p.conflicts.length > 0 || p.changedCount === 0 || reason.trim().length < 5}
                    onClick={() => previewKey && apply.mutate({ classId, slots: previewKey.slots, fromDate: previewKey.fromDate, reason: reason.trim(), notifyParents })}
                  >
                    {apply.isPending ? "Đang áp dụng…" : `Áp dụng cho ${p.changedCount} buổi`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Kiểm tra lệch lịch                                                  */
/* ------------------------------------------------------------------ */

export function CheckPanel({ classId, check, canUpdate }: { classId: string; check: Check; canUpdate: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMsg();
  const [openFix, setOpenFix] = useState(false);
  const [reason, setReason] = useState("");
  const [notifyParents, setNotifyParents] = useState(false);
  const sync = useMutation(trpc.academics.classes.syncEndDate.mutationOptions({ onSuccess: (r) => { m.ok(`Đã cập nhật bế giảng dự kiến: ${fmt(r.expectedEndDate)}`); router.refresh(); }, onError: m.err }));
  const fix = useQuery({ ...trpc.academics.classes.reanchorPreview.queryOptions({ id: classId }), enabled: openFix, retry: false });
  const apply = useMutation(trpc.academics.classes.reanchorApply.mutationOptions({
    onSuccess: (r) => { m.ok(`Xếp lại buổi theo lịch: ${r.summary}${r.newEndDate ? ` · bế giảng ${fmt(r.newEndDate)}` : ""}.`); setOpenFix(false); setReason(""); router.refresh(); },
    onError: m.err,
  }));
  const real = check.issues.filter((i) => i.severity !== "info");
  const f = fix.data;
  return (
    <section className="card space-y-2 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Kiểm tra lịch buổi học</h2>
        {check.ok ? <span className="chip bg-green-100 text-green-800">Khớp lịch</span> : <span className="chip bg-red-100 text-red-700">{real.length} điểm lệch</span>}
      </div>
      <p className="text-xs text-ink-600">Đối chiếu {check.regularCount} buổi chính thức với khai giảng, các giai đoạn lịch và ngày nghỉ.</p>
      <Msg msg={m.msg} />
      {check.issues.length > 0 && (
        <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
          {check.issues.map((i, k) => (
            <li key={k} className={i.severity === "error" ? "text-red-700" : i.severity === "warning" ? "text-amber-800" : "text-ink-400"}>• {i.message}{i.date ? ` (${fmt(i.date)})` : ""}</li>
          ))}
        </ul>
      )}
      {check.endDateMismatch && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 p-2 text-xs text-amber-900">
          <span>Bế giảng dự kiến {fmt(check.expectedEndDate)} khác buổi cuối {fmt(check.actualEndDate)}</span>
          {canUpdate && <button className="btn-ghost !px-2 !py-1 text-xs" disabled={sync.isPending} onClick={() => sync.mutate({ id: classId })}>Cập nhật theo buổi cuối</button>}
        </div>
      )}
      {check.canReanchor && (
        <div className="space-y-2 border-t border-black/5 pt-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-ink-600">“Xếp lại buổi theo lịch”: neo lại <b>cả dãy</b> buổi từ ngày khai giảng theo lịch hiện tại (trừ ngày nghỉ). Chỉ đổi ngày — không tạo, không xoá buổi; buổi đã điểm danh / có nhận xét / có bài tập / có ảnh / đã hoàn tất giữ nguyên.</p>
            {!openFix && <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { setOpenFix(true); m.clear(); }}>Xếp lại buổi</button>}
          </div>
          {openFix && (
            <div className="space-y-2 rounded-xl border border-black/10 p-2 text-xs">
              {fix.isFetching && <div className="text-ink-400">Đang tính…</div>}
              {fix.error && <Msg msg={{ ok: false, text: fix.error.message }} />}
              {f && !fix.isFetching && (
                <>
                  {f.errors.map((x) => <div key={x} className="text-red-700">• {x}</div>)}
                  {f.warnings.map((x) => <div key={x} className="text-amber-800">• {x}</div>)}
                  {f.conflicts.map((c, i) => <div key={i} className="text-red-700">• Trùng {c.kind === "room" ? "phòng" : "giáo viên"} ngày {fmt(c.date)} với {c.with}</div>)}
                  <div className="font-semibold">{f.summary}{f.newEndDate ? ` · bế giảng ${fmt(f.oldEndDate)} → ${fmt(f.newEndDate)}` : ""}</div>
                  {f.changes.length > 0 && (
                    <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                      {f.changes.map((c) => <li key={c.sessionId}>Buổi {c.sequenceNo}: {fmt(c.from.date)} → <b>{fmt(c.to.date)}</b>{c.trials ? ` · ${c.trials} học thử` : ""}</li>)}
                    </ul>
                  )}
                </>
              )}
              <input className="input" maxLength={300} placeholder="Lý do xếp lại (bắt buộc, ≥ 5 ký tự)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <label className="flex items-center gap-2 text-ink-600"><input type="checkbox" checked={notifyParents} onChange={(e) => setNotifyParents(e.target.checked)} /> Báo phụ huynh trong lớp</label>
              <div className="flex gap-2">
                <button className="btn-primary !py-1 text-xs" disabled={apply.isPending || reason.trim().length < 5 || !f || f.errors.length > 0 || f.conflicts.length > 0 || f.changedCount === 0} onClick={() => apply.mutate({ classId, reason: reason.trim(), notifyParents })}>
                  {apply.isPending ? "Đang xếp lại…" : `Áp dụng dời ${f?.changedCount ?? 0} buổi`}
                </button>
                <button className="btn-ghost !py-1 text-xs" onClick={() => setOpenFix(false)}>Thôi</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Thêm buổi ngoài lộ trình                                            */
/* ------------------------------------------------------------------ */

export function AddSessionPanel({ classId, ws }: { classId: string; ws: WS }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMsg();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ kind: "coach_1_1" as Exclude<SessionKind, "regular">, date: ws.today, startTime: "18:00", endTime: "19:30", roomId: "", teacherId: "", topic: "", privateNote: "" });
  const add = useMutation(trpc.academics.classes.addSession.mutationOptions({ onSuccess: (r) => { m.ok(`Đã thêm ${r.label}.`); setOpen(false); router.refresh(); }, onError: m.err }));
  if (!ws.canAddSession) return null;
  return (
    <section className="card space-y-2 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Buổi ngoài lộ trình</h2>
        {!open && <button className="text-xs font-semibold text-brand-600" onClick={() => { setOpen(true); m.clear(); }}>+ Thêm buổi</button>}
      </div>
      <p className="text-xs text-ink-600">Coach 1-1/1-2/1-4, học bù cả lớp, học vượt, buổi bổ sung — không làm lệch số buổi chính thức và mốc học bạ.</p>
      <Msg msg={m.msg} />
      {open && (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-4">
            <label className="text-xs text-ink-600">Loại buổi
              <select className="input mt-1" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as typeof f.kind })}>
                {SESSION_KINDS.filter((k) => k !== "regular").map((k) => <option key={k} value={k}>{SESSION_KIND_VI[k]}</option>)}
              </select>
            </label>
            <label className="text-xs text-ink-600">Ngày<input type="date" min={ws.today} className="input mt-1" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
            <label className="text-xs text-ink-600">Bắt đầu<input type="time" className="input mt-1" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></label>
            <label className="text-xs text-ink-600">Kết thúc<input type="time" className="input mt-1" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></label>
            <label className="text-xs text-ink-600">Phòng
              <select className="input mt-1" value={f.roomId} onChange={(e) => setF({ ...f, roomId: e.target.value })}>
                <option value="">Phòng mặc định</option>
                {ws.roomOptions.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}
              </select>
            </label>
            <label className="text-xs text-ink-600">Giáo viên
              <select className="input mt-1" value={f.teacherId} onChange={(e) => setF({ ...f, teacherId: e.target.value })}>
                <option value="">GV chính</option>
                {ws.teacherOptions.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
              </select>
            </label>
            <label className="text-xs text-ink-600 sm:col-span-2">Chủ đề<input className="input mt-1" maxLength={200} value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} /></label>
          </div>
          <label className="block text-xs text-ink-600">Ghi chú riêng (PH không thấy)<input className="input mt-1" maxLength={1000} value={f.privateNote} onChange={(e) => setF({ ...f, privateNote: e.target.value })} /></label>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={add.isPending} onClick={() => add.mutate({ classId, kind: f.kind, date: f.date, startTime: f.startTime, endTime: f.endTime, roomId: f.roomId || null, teacherId: f.teacherId || null, topic: f.topic || null, privateNote: f.privateNote || null })}>{add.isPending ? "Đang thêm…" : "Thêm buổi"}</button>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Thôi</button>
          </div>
        </div>
      )}
    </section>
  );
}

const EVENT_VI: Record<string, string> = {
  create: "Tạo lớp", submit: "Gửi duyệt", approve: "Duyệt mở lớp", reject: "Trả về nháp", start: "Bắt đầu học", finish: "Kết thúc lớp", cancel: "Huỷ lớp",
  reschedule: "Áp lịch mới", add_session: "Thêm buổi", teacher_change: "Đổi giáo viên",
  plan_phases: "Lưu kế hoạch lịch", reanchor: "Xếp lại buổi theo lịch", adjust_session: "Điều chỉnh buổi", cancel_session: "Huỷ buổi", holiday_reflow: "Dời buổi do ngày nghỉ",
};

export function EventTimeline({ ws }: { ws: WS }) {
  return (
    <section className="card p-4">
      <h2 className="mb-2 font-semibold">Lịch sử lớp</h2>
      {ws.events.length === 0 ? <p className="text-sm text-ink-400">Chưa có sự kiện.</p> : (
        <ol className="space-y-2 text-sm">
          {ws.events.map((e) => {
            const meta = (e.meta ?? {}) as Record<string, unknown>;
            return (
              <li key={e.id} className="border-l-2 border-brand-100 pl-3">
                <div><b>{EVENT_VI[e.event] ?? e.event}</b>{e.toStatus && e.fromStatus !== e.toStatus ? <span className="text-ink-600"> → {CLASS_STATUS_VI[e.toStatus]}</span> : null}
                  {typeof meta.sessions === "number" && <span className="text-ink-600"> · {meta.sessions} buổi</span>}
                  {typeof meta.changed === "number" && <span className="text-ink-600"> · {meta.changed} buổi từ {fmt(String(meta.fromDate ?? ""))}</span>}
                </div>
                {e.reason && <div className="text-xs text-amber-800">{e.reason}</div>}
                <div className="text-xs text-ink-400">{e.actorName ?? "hệ thống"} · {new Date(e.createdAt).toLocaleString("vi-VN")}</div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
