"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { enrollmentEventsFor, ENROLLMENT_EVENT_VI, EVENTS_REQUIRING_REASON, type EnrollmentStatus, type EnrollmentEvent } from "@satarobo/core";
import { EnrollmentChip, ErrorBox, fmtDate } from "@/components/admin-ui";

type E = {
  id: string; status: EnrollmentStatus; packageSessions: number; consumed: number; remaining: number; classId: string; classCode: string; className: string;
  courseCode: string; centerCode: string; enrolledAt: string; endedAt: string | null; endReason: string | null; pausedAt: string | null; pauseUntil: string | null;
  rate: number; pendingMakeup: number;
};

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

export function EnrollmentCard({ e }: { e: E }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState<null | Exclude<EnrollmentEvent, "transfer_out"> | "package">(null);
  const [reason, setReason] = useState("");
  const [pauseFrom, setPauseFrom] = useState(today());
  const [pauseUntil, setPauseUntil] = useState("");
  const [pkg, setPkg] = useState(String(e.packageSessions));
  const [error, setError] = useState<string | null>(null);
  const done = () => { setOpen(null); setReason(""); setError(null); router.refresh(); };
  const tr = useMutation(trpc.students.enrollmentTransition.mutationOptions({ onSuccess: done, onError: (x) => setError(x.message) }));
  const cp = useMutation(trpc.students.changePackage.mutationOptions({ onSuccess: done, onError: (x) => setError(x.message) }));
  const events = enrollmentEventsFor(e.status);
  const pct = Math.min(100, Math.round((e.consumed / Math.max(1, e.packageSessions)) * 100));
  const needReason = open && open !== "package" && EVENTS_REQUIRING_REASON.includes(open);

  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/classes/${e.classId}`} className="font-semibold text-brand-600">{e.className}</Link>
          <div className="text-xs text-ink-400">{e.classCode} · {e.courseCode} · {e.centerCode} · ghi danh {fmtDate(e.enrolledAt)}</div>
          {e.status === "paused" && <div className="mt-1 text-xs text-amber-700">Bảo lưu {fmtDate(e.pausedAt)} → {fmtDate(e.pauseUntil)}</div>}
          {e.endedAt && <div className="mt-1 text-xs text-ink-600">Kết thúc {fmtDate(e.endedAt)}{e.endReason ? ` — ${e.endReason}` : ""}</div>}
        </div>
        <EnrollmentChip status={e.status} />
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs"><span>Đã học {e.consumed}/{e.packageSessions} buổi</span><span className={e.remaining <= 4 && e.status === "active" ? "font-semibold text-red-700" : ""}>Còn {e.remaining}</span></div>
        <div className="h-2 rounded-full bg-black/5"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${pct}%` }} /></div>
        <div className="mt-1 text-[11px] text-ink-400">Chuyên cần {Math.round(e.rate * 100)}%{e.pendingMakeup ? ` · ${e.pendingMakeup} buổi chờ bù` : ""}</div>
      </div>
      {(events.length > 0 || e.status !== "completed") && e.status !== "withdrawn" && (
        <div className="flex flex-wrap gap-2">
          {events.map((ev) => (
            <button key={ev} className={`btn-ghost !py-1 text-xs ${ev === "withdraw" ? "text-red-700" : ""}`} onClick={() => { setOpen(ev); setError(null); }}>{ENROLLMENT_EVENT_VI[ev]}</button>
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
            else tr.mutate({ enrollmentId: e.id, event: open, reason: reason || undefined, pauseFrom: open === "pause" ? pauseFrom : undefined, pauseUntil: open === "pause" ? pauseUntil : undefined });
          }}
        >
          <div className="text-sm font-semibold">{open === "package" ? "Đổi số buổi trong gói" : ENROLLMENT_EVENT_VI[open]}</div>
          {open === "pause" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div><label className="label">Từ ngày</label><input type="date" className="input" required value={pauseFrom} onChange={(x) => setPauseFrom(x.target.value)} /></div>
              <div><label className="label">Học lại ngày (tối đa 3 tháng)</label><input type="date" className="input" required value={pauseUntil} onChange={(x) => setPauseUntil(x.target.value)} /></div>
            </div>
          )}
          {open === "package" && <div><label className="label">Số buổi mới (≥ {e.consumed})</label><input type="number" min={Math.max(1, e.consumed)} className="input max-w-[140px]" value={pkg} onChange={(x) => setPkg(x.target.value)} /></div>}
          <div><label className="label">Lý do{needReason || open === "package" ? " *" : ""}</label><input className="input" required={!!needReason || open === "package"} minLength={needReason || open === "package" ? 3 : 0} value={reason} onChange={(x) => setReason(x.target.value)} /></div>
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
  const [g, setG] = useState({ fullName: "", phone: "", email: "", relation: "father" as "mother" | "father" | "guardian" | "parent", mediaConsent: false });
  const [error, setError] = useState<string | null>(null);
  const m = useMutation(trpc.students.addGuardian.mutationOptions({ onSuccess: () => { setOpen(false); setError(null); router.refresh(); }, onError: (x) => setError(x.message) }));
  if (!open) return <button className="btn-ghost w-full text-xs" onClick={() => setOpen(true)}>+ Thêm phụ huynh</button>;
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); m.mutate({ studentId, fullName: g.fullName, phone: g.phone, email: g.email || null, relation: g.relation, mediaConsent: g.mediaConsent }); }}>
      <input className="input" placeholder="Họ tên *" required minLength={2} value={g.fullName} onChange={(e) => setG({ ...g, fullName: e.target.value })} />
      <input className="input" placeholder="SĐT *" required inputMode="tel" value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} />
      <input className="input" placeholder="Email" type="email" value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} />
      <select className="input" value={g.relation} onChange={(e) => setG({ ...g, relation: e.target.value as typeof g.relation })}><option value="father">Bố</option><option value="mother">Mẹ</option><option value="guardian">Người giám hộ</option><option value="parent">Phụ huynh</option></select>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={g.mediaConsent} onChange={(e) => setG({ ...g, mediaConsent: e.target.checked })} /> Đồng ý đăng ảnh của con</label>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex gap-2"><button className="btn-primary !py-1.5 text-xs" disabled={m.isPending}>Lưu</button><button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => setOpen(false)}>Huỷ</button></div>
    </form>
  );
}
