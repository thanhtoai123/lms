"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  REQUEST_GROUPS, REQUEST_GROUP_VI, REQUEST_KIND_VI, REQUEST_KIND_GROUP, REQUEST_KINDS, LEAVE_TYPES, LEAVE_TYPE_VI, LEAVE_TYPE_PAID,
  NOTICE_DAYS, type RequestKind, type LeaveType, type RequestGroup,
} from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { units } from "@/components/hr-ui";

const L = "text-xs text-ink-600";

/** Form tạo đơn: 10 loại chia 3 nhóm, mỗi loại chỉ hiện trường của nó */
export function RequestForm({ staffId, staffName, onDone }: { staffId?: string; staffName?: string; onDone?: () => void }) {
  const trpc = useTRPC();
  const router = useRouter();
  const q = useQuery(trpc.hr.requestForm.queryOptions());
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<RequestGroup>("leave");
  const [kind, setKind] = useState<RequestKind>("leave");
  const d = q.data;
  const today = d?.today ?? new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const [f, setF] = useState({
    dateFrom: today, dateTo: today, portion: "full", leaveType: "annual" as LeaveType,
    classId: "", targetStaffId: "", requesterShiftId: "", targetShiftId: "",
    lateEarlyKind: "late", atTime: "09:00", startTime: "17:30", endTime: "19:30",
    punchIn: "", punchOut: "", destination: "", receivingCenterId: "", reason: "",
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const m = useMutation(trpc.hr.createRequest.mutationOptions({
    onSuccess: (r) => {
      setMsg({ ok: true, text: `Đã gửi đơn${r.days ? ` (${units(r.days)} ngày)` : ""}${r.lateSubmission ? " · cờ Nộp muộn" : ""} — thay đổi khi duyệt: ${r.preview}` });
      setF((x) => ({ ...x, reason: "" }));
      router.refresh();
      onDone?.();
    },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const isTeacher = d?.staff?.isTeacher ?? false;
  const kinds = REQUEST_KINDS.filter((k) => REQUEST_KIND_GROUP[k] === group && (group !== "class" || isTeacher));

  if (!open) return <button className="btn-primary" onClick={() => setOpen(true)}>+ Làm đơn{staffName ? ` cho ${staffName}` : ""}</button>;
  if (q.isLoading) return <div className="card p-4 text-sm">Đang tải…</div>;
  if (!d?.staff && !staffId) return <div className="card p-4 text-sm text-amber-700">Tài khoản chưa gắn hồ sơ nhân sự — liên hệ nhân sự.</div>;

  const submit = () => {
    setMsg(null);
    m.mutate({
      staffId: staffId ?? null, kind, dateFrom: f.dateFrom, dateTo: f.dateTo, reason: f.reason.trim(),
      receivingCenterId: d?.isHo ? f.receivingCenterId || null : null,
      classId: REQUEST_KIND_GROUP[kind] === "class" ? f.classId || null : null,
      targetStaffId: ["sub_teach", "class_change", "shift_swap"].includes(kind) ? f.targetStaffId || null : null,
      requesterShiftId: kind === "shift_swap" ? f.requesterShiftId || null : null,
      targetShiftId: kind === "shift_swap" && f.targetStaffId ? f.targetShiftId || null : null,
      leaveType: kind === "leave" ? f.leaveType : null,
      portion: kind === "leave" ? (f.dateTo === f.dateFrom ? (f.portion as "full" | "am" | "pm") : "full") : null,
      lateEarlyKind: kind === "late_early" ? (f.lateEarlyKind as "late" | "early") : null,
      atTime: kind === "late_early" ? f.atTime : null,
      startTime: kind === "overtime" ? f.startTime : null,
      endTime: kind === "overtime" ? f.endTime : null,
      punchIn: kind === "timesheet_fix" ? f.punchIn : null,
      punchOut: kind === "timesheet_fix" ? f.punchOut : null,
      destination: kind === "business_trip" ? f.destination : null,
    });
  };

  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Tạo đơn mới{staffName ? ` cho ${staffName}` : ""}</h2>
        <button className="text-sm text-ink-600" onClick={() => setOpen(false)}>Đóng</button>
      </div>
      <div className="space-y-1">
        <div className="flex flex-wrap gap-1">
          {REQUEST_GROUPS.map((g) => (
            <button key={g} className={`chip ${group === g ? "bg-brand-100 text-brand-800" : "bg-black/5"}`} onClick={() => { setGroup(g); const first = REQUEST_KINDS.find((k) => REQUEST_KIND_GROUP[k] === g)!; setKind(first); }}>
              {REQUEST_GROUP_VI[g]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {kinds.map((k) => <button key={k} className={`btn-ghost !py-1 text-xs ${kind === k ? "ring-2 ring-brand-300" : ""}`} onClick={() => setKind(k)}>{REQUEST_KIND_VI[k]}</button>)}
          {group === "class" && !isTeacher && <span className="text-xs text-ink-400">Đơn nhóm lớp học chỉ dành cho giáo viên có lớp.</span>}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {d?.isHo && (
          <label className={L}>Cơ sở nhận đơn *
            <select className="input mt-1" value={f.receivingCenterId} onChange={(e) => set("receivingCenterId", e.target.value)}>
              <option value="">— Chọn cơ sở —</option>
              {d.centers.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
            </select>
          </label>
        )}
        <label className={L}>{["leave", "remote", "business_trip"].includes(kind) ? "Từ ngày *" : "Ngày *"}
          <input type="date" className="input mt-1" value={f.dateFrom} onChange={(e) => { set("dateFrom", e.target.value); if (f.dateTo < e.target.value) set("dateTo", e.target.value); }} />
        </label>
        {["leave", "remote", "business_trip"].includes(kind) && (
          <label className={L}>Đến ngày<input type="date" className="input mt-1" min={f.dateFrom} value={f.dateTo} onChange={(e) => set("dateTo", e.target.value)} /></label>
        )}

        {REQUEST_KIND_GROUP[kind] === "class" && (
          <label className={L}>Lớp *
            <select className="input mt-1" value={f.classId} onChange={(e) => set("classId", e.target.value)}>
              <option value="">— Chọn lớp —</option>
              {(d?.classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
            </select>
          </label>
        )}
        {(kind === "sub_teach" || kind === "class_change") && (
          <label className={L}>Người dạy thay
            <select className="input mt-1" value={f.targetStaffId} onChange={(e) => set("targetStaffId", e.target.value)}>
              <option value="">— Chưa chỉ định —</option>
              {(d?.colleagues ?? []).filter((c) => c.isTeacher).map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
            </select>
          </label>
        )}
        {kind === "shift_swap" && (
          <>
            <label className={L}>Mã ca mới của tôi *
              <select className="input mt-1" value={f.requesterShiftId} onChange={(e) => set("requesterShiftId", e.target.value)}>
                <option value="">— Chọn mã ca —</option>
                {(d?.shifts ?? []).map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
              </select>
            </label>
            <label className={L}>Người nhận ca
              <select className="input mt-1" value={f.targetStaffId} onChange={(e) => set("targetStaffId", e.target.value)}>
                <option value="">— Không có —</option>
                {(d?.colleagues ?? []).map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
              </select>
            </label>
            {f.targetStaffId && (
              <label className={L}>Mã ca mới cho người nhận
                <select className="input mt-1" value={f.targetShiftId} onChange={(e) => set("targetShiftId", e.target.value)}>
                  <option value="">— Nhận đúng ca của tôi —</option>
                  {(d?.shifts ?? []).map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
                </select>
              </label>
            )}
          </>
        )}
        {kind === "overtime" && (
          <>
            <label className={L}>Từ giờ<input type="time" className="input mt-1" value={f.startTime} onChange={(e) => set("startTime", e.target.value)} /></label>
            <label className={L}>Đến giờ<input type="time" className="input mt-1" value={f.endTime} onChange={(e) => set("endTime", e.target.value)} /></label>
          </>
        )}
        {kind === "late_early" && (
          <>
            <label className={L}>Hình thức
              <select className="input mt-1" value={f.lateEarlyKind} onChange={(e) => set("lateEarlyKind", e.target.value)}><option value="late">Đi muộn</option><option value="early">Về sớm</option></select>
            </label>
            <label className={L}>Giờ<input type="time" className="input mt-1" value={f.atTime} onChange={(e) => set("atTime", e.target.value)} /></label>
          </>
        )}
        {kind === "timesheet_fix" && (
          <>
            <label className={L}>Giờ vào đề nghị<input type="time" className="input mt-1" value={f.punchIn} onChange={(e) => set("punchIn", e.target.value)} /></label>
            <label className={L}>Giờ ra đề nghị<input type="time" className="input mt-1" value={f.punchOut} onChange={(e) => set("punchOut", e.target.value)} /></label>
          </>
        )}
        {kind === "leave" && (
          <>
            <label className={L}>Loại nghỉ
              <select className="input mt-1" value={f.leaveType} onChange={(e) => set("leaveType", e.target.value)}>
                {LEAVE_TYPES.map((t) => <option key={t} value={t}>{LEAVE_TYPE_VI[t]}{LEAVE_TYPE_PAID[t] ? "" : " (không lương)"}</option>)}
              </select>
            </label>
            <label className={L}>Thời gian
              <select className="input mt-1" value={f.portion} disabled={f.dateTo !== f.dateFrom} onChange={(e) => set("portion", e.target.value)}>
                <option value="full">Cả ngày</option><option value="am">Buổi sáng</option><option value="pm">Buổi chiều</option>
              </select>
            </label>
          </>
        )}
        {kind === "business_trip" && <label className={L}>Nơi đến *<input className="input mt-1" value={f.destination} onChange={(e) => set("destination", e.target.value)} placeholder="VD: Cơ sở 2" /></label>}
        <label className={`${L} sm:col-span-3 lg:col-span-4`}>Lý do *<input className="input mt-1" value={f.reason} onChange={(e) => set("reason", e.target.value)} placeholder="Ghi rõ để người duyệt không phải hỏi lại" /></label>
      </div>

      <div className="text-xs text-ink-500">
        {kind === "timesheet_fix" && "Quên quét thì điền mốc bị thiếu. Duyệt xong hệ thống ghi mốc “chỉnh tay” và tính lại công ngày đó — lượt quét thật vẫn giữ nguyên để đối chiếu."}
        {kind === "leave" && d?.leave && ` Phép năm còn ${units(d.leave.remaining)} / ${units(d.leave.entitled)} ngày (đã dùng ${units(d.leave.used)}, chờ duyệt ${units(d.leave.pending)}).`}
        {` Nộp trước ít nhất ${NOTICE_DAYS[kind]} ngày; nộp muộn vẫn gửi được nhưng mang cờ “Nộp muộn”.`}
      </div>
      <button className="btn-primary" disabled={m.isPending || f.reason.trim().length < 5} onClick={submit}>Gửi đơn</button>
      {msg && <div className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}
    </section>
  );
}
