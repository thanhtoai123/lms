"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import {
  enrollmentEventsFor, ENROLLMENT_EVENT_VI, EVENTS_REQUIRING_REASON, GUARDIAN_RELATIONS, GUARDIAN_RELATION_VI, STUDENT_LIFECYCLE_VI,
  type EnrollmentStatus, type EnrollmentEvent, type GuardianRelation, type StudentLifecycleEvent,
} from "@satarobo/core";
import { EnrollmentChip, ErrorBox, OkBox, fmtDate } from "@/components/admin-ui";

type E = {
  id: string; status: EnrollmentStatus; packageSessions: number; consumed: number; remaining: number; classId: string; classCode: string; className: string;
  courseCode: string; centerCode: string; enrolledAt: string; endedAt: string | null; endReason: string | null; pausedAt: string | null; pauseUntil: string | null;
  rate: number; pendingMakeup: number;
};

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

export function EnrollmentCard({ e }: { e: E }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState<null | Exclude<EnrollmentEvent, "transfer_out"> | "package">(null);
  const [reason, setReason] = useState("");
  const [pauseFrom, setPauseFrom] = useState(today());
  const [pauseUntil, setPauseUntil] = useState("");
  const [pkg, setPkg] = useState(String(e.packageSessions));
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const done = () => { setOpen(null); setReason(""); setError(null); router.refresh(); };
  const tr = useMutation(trpc.students.enrollmentTransition.mutationOptions({
    onSuccess: (r) => { done(); if (r.refundProposed) setInfo(`Đã tạo đề xuất hoàn tiền ${vnd(r.refundProposed)} — chờ quản lý duyệt ở Hoàn tiền.`); },
    onError: (x) => setError(x.message),
  }));
  const cp = useMutation(trpc.students.changePackage.mutationOptions({ onSuccess: done, onError: (x) => setError(x.message) }));
  const events = enrollmentEventsFor(e.status);
  const pct = Math.min(100, Math.round((e.consumed / Math.max(1, e.packageSessions)) * 100));
  const needReason = open && open !== "package" && EVENTS_REQUIRING_REASON.includes(open);

  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/classes/${e.classId}`} className="font-semibold text-brand-600">{e.className}</Link>
          <div className="text-xs text-ink-400">{e.classCode} · {e.courseCode} · {e.centerCode} · ghi danh {fmtDate(e.enrolledAt)} · <Link href={`/enrollments/${e.id}`} className="text-brand-600 hover:underline">chi tiết ghi danh</Link></div>
          {e.status === "paused" && <div className="mt-1 text-xs text-amber-700">Bảo lưu {fmtDate(e.pausedAt)} → {e.pauseUntil ? fmtDate(e.pauseUntil) : "chưa hẹn ngày trở lại"}</div>}
          {e.endedAt && <div className="mt-1 text-xs text-ink-600">Kết thúc {fmtDate(e.endedAt)}{e.endReason ? ` — ${e.endReason}` : ""}</div>}
        </div>
        <EnrollmentChip status={e.status} />
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs"><span>Đã học {e.consumed}/{e.packageSessions} buổi</span><span className={e.remaining <= 4 && e.status === "active" ? "font-semibold text-red-700" : ""}>Còn {e.remaining}</span></div>
        <div className="h-2 rounded-full bg-black/5"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${pct}%` }} /></div>
        <div className="mt-1 text-[11px] text-ink-400">Chuyên cần {Math.round(e.rate * 100)}%{e.pendingMakeup ? ` · ${e.pendingMakeup} buổi chờ bù` : ""}</div>
      </div>
      {info && <OkBox>{info}</OkBox>}
      {(events.length > 0 || e.status !== "completed") && e.status !== "withdrawn" && (
        <div className="flex flex-wrap gap-2">
          {events.map((ev) => (
            <button key={ev} className={`btn-ghost !py-1 text-xs ${ev === "withdraw" ? "text-red-700" : ""}`} onClick={() => { setOpen(ev); setError(null); setInfo(null); }}>{ENROLLMENT_EVENT_VI[ev]}</button>
          ))}
          {e.status !== "completed" && <button className="btn-ghost !py-1 text-xs" onClick={() => { setOpen("package"); setError(null); }}>Đổi số buổi</button>}
        </div>
      )}
      {open && (
        <form
          className="space-y-2 rounded-xl border border-black/10 bg-black/[0.02] p-3"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (open === "package") cp.mutate({ enrollmentId: e.id, packageSessions: Number(pkg), reason });
            else tr.mutate({ enrollmentId: e.id, event: open, reason: reason || undefined, pauseFrom: open === "pause" ? pauseFrom : undefined, pauseUntil: open === "pause" ? pauseUntil || null : undefined });
          }}
        >
          <div className="text-sm font-semibold">{open === "package" ? "Đổi số buổi trong gói" : ENROLLMENT_EVENT_VI[open]}</div>
          {open === "pause" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div><label className="label">Từ ngày</label><input type="date" className="input" required value={pauseFrom} onChange={(x) => setPauseFrom(x.target.value)} /></div>
              <div><label className="label">Dự kiến học lại (tuỳ chọn)</label><input type="date" className="input" min={pauseFrom} value={pauseUntil} onChange={(x) => setPauseUntil(x.target.value)} /></div>
            </div>
          )}
          {open === "withdraw" && <p className="text-xs text-amber-800">Nếu còn học phí đã thu chưa dùng, hệ thống tự tạo đề xuất hoàn tiền chờ quản lý duyệt.</p>}
          {open === "package" && <div><label className="label">Số buổi mới (≥ {e.consumed})</label><input type="number" min={Math.max(1, e.consumed)} className="input max-w-[140px]" value={pkg} onChange={(x) => setPkg(x.target.value)} /></div>}
          <div><label className="label">Lý do{needReason || open === "package" ? " *" : ""}</label><input className="input" required={!!needReason || open === "package"} minLength={needReason ? 5 : open === "package" ? 3 : 0} value={reason} onChange={(x) => setReason(x.target.value)} /></div>
          {error && <ErrorBox>{error}</ErrorBox>}
          <div className="flex gap-2">
            <button className={open === "withdraw" ? "btn-primary !bg-red-600" : "btn-primary"} disabled={tr.isPending || cp.isPending}>Xác nhận</button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(null)}>Huỷ</button>
          </div>
        </form>
      )}
    </div>
  );
}

export function AddGuardian({ studentId }: { studentId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [g, setG] = useState({ fullName: "", phone: "", email: "", relation: "father" as GuardianRelation, mediaConsent: false, nationalId: "" });
  const [error, setError] = useState<string | null>(null);
  const m = useMutation(trpc.students.addGuardian.mutationOptions({ onSuccess: () => { setOpen(false); setError(null); router.refresh(); }, onError: (x) => setError(x.message) }));
  if (!open) return <button className="btn-ghost w-full text-xs" onClick={() => setOpen(true)}>+ Thêm phụ huynh</button>;
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); m.mutate({ studentId, fullName: g.fullName, phone: g.phone, email: g.email || null, relation: g.relation, mediaConsent: g.mediaConsent, nationalId: g.nationalId.trim() || null }); }}>
      <input className="input" placeholder="Họ tên *" required minLength={2} value={g.fullName} onChange={(e) => setG({ ...g, fullName: e.target.value })} />
      <input className="input" placeholder="SĐT *" required inputMode="tel" value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} />
      <input className="input" placeholder="Email" type="email" value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} />
      <input className="input" placeholder="CCCD (9 hoặc 12 số, tuỳ chọn)" inputMode="numeric" maxLength={15} value={g.nationalId} onChange={(e) => setG({ ...g, nationalId: e.target.value })} />
      <select className="input" value={g.relation} onChange={(e) => setG({ ...g, relation: e.target.value as GuardianRelation })}>
        {GUARDIAN_RELATIONS.map((r) => <option key={r} value={r}>{GUARDIAN_RELATION_VI[r]}</option>)}
      </select>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={g.mediaConsent} onChange={(e) => setG({ ...g, mediaConsent: e.target.checked })} /> Đồng ý đăng ảnh của con</label>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex gap-2"><button className="btn-primary !py-1.5 text-xs" disabled={m.isPending}>Lưu</button><button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => setOpen(false)}>Huỷ</button></div>
    </form>
  );
}

type OpenPause = { id: string; fromDate: string; expectedReturn: string | null; reason: string } | null;

/** Khối "Vòng đời học viên": bảo lưu (tất cả / một lớp), kết thúc bảo lưu, nghỉ học hẳn, kích hoạt lại */
export function StudentLifecycle({ studentId, name, actions, openPause, activeEnrollments, maxPauseMonths }: {
  studentId: string; name: string; actions: StudentLifecycleEvent[]; openPause: OpenPause;
  activeEnrollments: { id: string; label: string }[]; maxPauseMonths: number;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState<StudentLifecycleEvent | null>(null);
  const [scope, setScope] = useState("");
  const [reason, setReason] = useState("");
  const [from, setFrom] = useState(today());
  const [until, setUntil] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const finish = (text: string) => { setMsg({ ok: true, text }); setOpen(null); setReason(""); setUntil(""); router.refresh(); };
  const onError = (e: { message: string }) => setMsg({ ok: false, text: e.message });
  const reserve = useMutation(trpc.students.reserve.mutationOptions({ onSuccess: (r) => finish(`Đã bảo lưu ${r.paused} lớp.`), onError }));
  const endReserve = useMutation(trpc.students.endReserve.mutationOptions({ onSuccess: (r) => finish(`Đã kết thúc bảo lưu — ${r.resumed} lớp học lại.`), onError }));
  const withdraw = useMutation(trpc.students.withdraw.mutationOptions({
    onSuccess: (r) => finish(`Đã cho nghỉ học hẳn: ${r.withdrawn} ghi danh kết thúc${r.makeupCancelled ? `, huỷ ${r.makeupCancelled} yêu cầu học bù` : ""}${r.refunds.length ? `; tạo ${r.refunds.length} đề xuất hoàn tiền (${vnd(r.refunds.reduce((s, x) => s + x.amount, 0))}) chờ duyệt` : ""}.`),
    onError,
  }));
  const reactivate = useMutation(trpc.students.reactivate.mutationOptions({ onSuccess: () => finish("Đã kích hoạt lại — ghi danh lớp mới để học tiếp."), onError }));
  const busy = reserve.isPending || endReserve.isPending || withdraw.isPending || reactivate.isPending;
  const needReason = open !== null && open !== "end_reserve";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (open === "reserve") reserve.mutate({ studentId, enrollmentId: scope || null, reason, from, expectedReturn: until || null });
    if (open === "end_reserve") endReserve.mutate({ studentId, note: reason.trim() || null });
    if (open === "withdraw") withdraw.mutate({ studentId, reason });
    if (open === "reactivate") reactivate.mutate({ studentId, reason });
  };

  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-bold">Vòng đời học viên</h2>
      {openPause && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Đang bảo lưu từ <b>{fmtDate(openPause.fromDate)}</b> → {openPause.expectedReturn ? <>dự kiến trở lại <b>{fmtDate(openPause.expectedReturn)}</b></> : "chưa hẹn ngày trở lại"}
          <div className="text-xs">{openPause.reason}</div>
        </div>
      )}
      {msg && (msg.ok ? <OkBox>{msg.text}</OkBox> : <ErrorBox>{msg.text}</ErrorBox>)}
      {actions.length === 0 ? (
        <p className="text-xs text-ink-400">Không có thao tác vòng đời nào khả dụng.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <button key={a} className={`btn-ghost !py-1 text-xs ${a === "withdraw" ? "text-red-700" : ""}`} onClick={() => { setOpen(a); setMsg(null); setReason(""); }}>{STUDENT_LIFECYCLE_VI[a]}</button>
          ))}
        </div>
      )}
      {open && (
        <form onSubmit={submit} className="space-y-2 rounded-xl border border-black/10 bg-black/[0.02] p-3">
          <div className="text-sm font-semibold">{STUDENT_LIFECYCLE_VI[open]} — {name}</div>
          {open === "reserve" && (
            <>
              <div>
                <label className="label">Lớp bảo lưu</label>
                <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
                  <option value="">Tất cả lớp đang học ({activeEnrollments.length})</option>
                  {activeEnrollments.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div><label className="label">Từ ngày</label><input type="date" className="input" required value={from} onChange={(e) => setFrom(e.target.value)} /></div>
                <div><label className="label">Dự kiến trở lại (tuỳ chọn, tối đa {maxPauseMonths} tháng)</label><input type="date" className="input" min={from} value={until} onChange={(e) => setUntil(e.target.value)} /></div>
              </div>
              <p className="text-xs text-ink-400">Không hẹn ngày: hệ thống tạo việc chăm sóc khi quá {maxPauseMonths} tháng; có hẹn: nhắc trước 3 ngày.</p>
            </>
          )}
          {open === "end_reserve" && <p className="text-xs text-ink-600">Học viên sẽ chuyển về trạng thái “Đang học” và các lớp đang bảo lưu sẽ được học lại.</p>}
          {open === "withdraw" && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              Học viên chuyển sang “Đã nghỉ”, đợt bảo lưu (nếu có) kết thúc, mọi ghi danh chưa hoàn thành chuyển sang nghỉ học, yêu cầu học bù đang chờ bị huỷ; học phí còn dư được tạo đề xuất hoàn tiền. Có thể kích hoạt lại sau.
            </div>
          )}
          <div>
            <label className="label">{open === "end_reserve" ? "Ghi chú (tuỳ chọn)" : open === "withdraw" ? "Lý do nghỉ học *" : "Lý do *"}</label>
            <input className="input" required={needReason} minLength={needReason ? 5 : 0} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button className={open === "withdraw" ? "btn-primary !bg-red-600" : "btn-primary"} disabled={busy || (needReason && reason.trim().length < 5)}>{busy ? "Đang xử lý…" : "Xác nhận"}</button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(null)}>Thôi</button>
          </div>
        </form>
      )}
    </section>
  );
}

/** Xem đầy đủ CCCD phụ huynh + địa chỉ — ghi lý do, lưu nhật ký */
export function RevealPrivate({ studentId }: { studentId: string }) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const m = useMutation(trpc.students.revealPrivate.mutationOptions({}));
  if (!open) return <button className="text-xs font-semibold text-brand-600" onClick={() => setOpen(true)}>Xem đầy đủ CCCD / địa chỉ</button>;
  return (
    <div className="space-y-2 rounded-xl border border-black/10 p-2 text-xs">
      {!m.data ? (
        <>
          <input className="input" placeholder="Lý do xem (bắt buộc, ghi nhật ký)" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          {m.error && <ErrorBox>{m.error.message}</ErrorBox>}
          <div className="flex gap-2">
            <button className="btn-primary !py-1 text-xs" disabled={m.isPending || reason.trim().length < 5} onClick={() => m.mutate({ studentId, reason: reason.trim() })}>Xem</button>
            <button className="btn-ghost !py-1 text-xs" onClick={() => setOpen(false)}>Thôi</button>
          </div>
        </>
      ) : (
        <>
          {m.data.guardians.map((g) => <div key={g.parentId}>{g.fullName}: <span className="font-mono">{g.nationalId ?? "—"}</span></div>)}
          <div>Địa chỉ: {m.data.address ? [m.data.address.address, m.data.address.ward, m.data.address.district, m.data.address.city].filter(Boolean).join(", ") || "—" : "—"}</div>
          <button className="btn-ghost !py-1 text-xs" onClick={() => { setOpen(false); m.reset(); setReason(""); }}>Ẩn</button>
        </>
      )}
    </div>
  );
}
