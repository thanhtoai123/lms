"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { STAFF_STATUS_VI, POSITION_KINDS, POSITION_KIND_VI, DEPARTMENTS, DEPARTMENT_VI, type StaffStatus, type PositionKind, type Department } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

export function StatusActions({ id, status }: { id: string; status: StaffStatus }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [to, setTo] = useState<StaffStatus | "">("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(today());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const m = useMutation(trpc.hr.setStaffStatus.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: ["Đã cập nhật", ...r.warnings].join(" · ") }); setTo(""); setReason(""); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const options = (["active", "on_leave", "resigned", "probation"] as const).filter((x) => x !== status && !(x === "probation" && status !== "on_leave"));
  return (
    <div className="mt-3 space-y-1 border-t border-black/5 pt-3">
      <div className="flex flex-wrap gap-1">
        {options.map((o) => <button key={o} className={`btn-ghost !px-2 !py-1 text-xs ${to === o ? "ring-2 ring-brand-300" : ""}`} onClick={() => setTo(o)}>→ {STAFF_STATUS_VI[o]}</button>)}
      </div>
      {to && (
        <div className="space-y-1">
          {to === "resigned" && <label className="block text-xs text-ink-600">Ngày nghỉ việc<input type="date" className="input mt-1" value={date} onChange={(e) => setDate(e.target.value)} /></label>}
          <input className="input text-xs" placeholder={to === "resigned" || to === "on_leave" ? "Lý do (bắt buộc)" : "Ghi chú"} value={reason} onChange={(e) => setReason(e.target.value)} />
          {to === "resigned" && <p className="text-[11px] text-amber-700">Kết thúc mọi vị trí, gỡ ca sau ngày nghỉ, huỷ đơn chờ duyệt.</p>}
          <button className="btn-primary !py-1 text-xs" disabled={m.isPending || ((to === "resigned" || to === "on_leave") && reason.trim().length < 5)} onClick={() => m.mutate({ id, status: to, reason: reason.trim() || null, effectiveDate: to === "resigned" ? date : null })}>Xác nhận</button>
        </div>
      )}
      {msg && <div className={`text-xs ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</div>}
    </div>
  );
}

export function RevealPrivate({ id }: { id: string }) {
  const trpc = useTRPC();
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const m = useMutation(trpc.hr.revealStaff.mutationOptions());
  if (m.data) return <div className="rounded-lg bg-amber-50 p-2 text-xs">CCCD: <b className="font-mono">{m.data.idNumber ?? "—"}</b> · STK: <b className="font-mono">{m.data.bankAccount ?? "—"}</b> <span className="text-ink-400">(đã ghi nhật ký)</span></div>;
  if (!open) return <button className="text-xs text-brand-600" onClick={() => setOpen(true)}>Xem đầy đủ CCCD / STK</button>;
  return (
    <div className="flex gap-1">
      <input className="input !py-1 text-xs" placeholder="Lý do xem (bắt buộc)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className="btn-ghost !py-1 text-xs" disabled={reason.trim().length < 5 || m.isPending} onClick={() => m.mutate({ id, reason: reason.trim() })}>Xem</button>
      {m.error && <span className="text-xs text-red-700">{m.error.message}</span>}
    </div>
  );
}

type Props = { mode: "add"; staffId: string; centerId: string; department: string; centers: { id: string; code: string }[] } | { mode: "end"; positionId: string };

export function PositionActions(props: Props) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ centerId: props.mode === "add" ? props.centerId : "", positionId: "", title: "", kind: "concurrent" as PositionKind, department: (props.mode === "add" ? props.department : "sales") as Department, from: today(), to: "", note: "", reason: "" });
  const defs = useQuery({ ...trpc.hr.positionDefs.queryOptions({}), enabled: props.mode === "add" && open });
  const done = { onSuccess: () => { setOpen(false); setErr(null); router.refresh(); }, onError: (e: { message: string }) => setErr(e.message) };
  const add = useMutation(trpc.hr.assignPosition.mutationOptions(done));
  const end = useMutation(trpc.hr.endPosition.mutationOptions(done));
  if (!open) return <button className={props.mode === "add" ? "btn-ghost" : "text-xs text-brand-600"} onClick={() => setOpen(true)}>{props.mode === "add" ? "+ Thêm vị trí (kiêm nhiệm / uỷ quyền / chuyển vị trí chính)" : "Kết thúc"}</button>;
  if (props.mode === "end") {
    return (
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <input type="date" className="input !w-auto !py-1 text-xs" value={f.to || today()} onChange={(e) => setF({ ...f, to: e.target.value })} />
        <input className="input !w-40 !py-1 text-xs" placeholder="Lý do" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        <button className="btn-ghost !py-1 text-xs" disabled={f.reason.trim().length < 5 || end.isPending} onClick={() => end.mutate({ id: props.positionId, effectiveTo: f.to || today(), reason: f.reason.trim() })}>Lưu</button>
        {err && <span className="text-red-700">{err}</span>}
      </div>
    );
  }
  return (
    <div className="grid gap-2 rounded-xl border border-black/10 p-3 sm:grid-cols-3">
      <label className="text-xs text-ink-600">Vị trí (bộ vai trò)
        <select className="input mt-1" value={f.positionId} onChange={(e) => { const d = (defs.data?.items ?? []).find((x) => x.id === e.target.value); setF({ ...f, positionId: e.target.value, title: d?.name ?? f.title, centerId: d?.centerId ?? f.centerId }); }}>
          <option value="">— Không gắn vị trí (chỉ chức danh) —</option>
          {(defs.data?.items ?? []).map((d) => <option key={d.id} value={d.id}>{d.centerCode} · {d.name} ({d.roleLabels.join(", ")})</option>)}
        </select>
      </label>
      <label className="text-xs text-ink-600">Chức danh<input className="input mt-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Lấy theo tên vị trí nếu để trống" /></label>
      <label className="text-xs text-ink-600">Cơ sở<select className="input mt-1" value={f.centerId} onChange={(e) => setF({ ...f, centerId: e.target.value })}>{props.centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></label>
      <label className="text-xs text-ink-600">Loại<select className="input mt-1" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as PositionKind })}>{POSITION_KINDS.map((k) => <option key={k} value={k}>{POSITION_KIND_VI[k]}</option>)}</select></label>
      <label className="text-xs text-ink-600">Bộ phận<select className="input mt-1" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value as Department })}>{DEPARTMENTS.map((k) => <option key={k} value={k}>{DEPARTMENT_VI[k]}</option>)}</select></label>
      <label className="text-xs text-ink-600">Từ ngày<input type="date" className="input mt-1" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
      <label className="text-xs text-ink-600">Đến ngày {f.kind === "delegated" ? "(bắt buộc, ≤ 90 ngày)" : "(tuỳ chọn)"}<input type="date" className="input mt-1" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
      <label className="text-xs text-ink-600">Ghi chú<input className="input mt-1" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      {f.kind === "primary" && <p className="text-xs text-amber-700 sm:col-span-3">Vị trí chính mới không được trùng thời gian với vị trí chính cũ — kết thúc vị trí cũ trước (ngày trước ngày bắt đầu mới).</p>}
      <div className="flex items-center gap-2 sm:col-span-3">
        <button className="btn-primary" disabled={add.isPending || (!f.positionId && f.title.trim().length < 2)} onClick={() => add.mutate({ staffId: props.staffId, positionId: f.positionId || null, centerId: f.centerId, title: f.title.trim() || null, department: f.department, kind: f.kind, effectiveFrom: f.from, effectiveTo: f.to || null, note: f.note || null })}>Thêm</button>
        <button className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button>
        {err && <span className="text-sm text-red-700">{err}</span>}
      </div>
    </div>
  );
}
