"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { enrollmentEventsFor, ENROLLMENT_EVENT_VI, EVENTS_REQUIRING_REASON, type EnrollmentEvent, type EnrollmentStatus } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { ErrorBox, OkBox } from "@/components/admin-ui";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

export function EnrollmentActions({ enrollmentId, status, packageSessions, consumed, canUpdate }: {
  enrollmentId: string;
  status: EnrollmentStatus;
  packageSessions: number;
  consumed: number;
  canUpdate: boolean;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState<null | Exclude<EnrollmentEvent, "transfer_out"> | "package">(null);
  const [reason, setReason] = useState("");
  const [pauseFrom, setPauseFrom] = useState(today());
  const [pauseUntil, setPauseUntil] = useState("");
  const [pkg, setPkg] = useState(String(packageSessions));
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const done = () => { setOpen(null); setReason(""); setError(null); router.refresh(); };
  const tr = useMutation(trpc.students.enrollmentTransition.mutationOptions({
    onSuccess: (r) => { done(); if (r.refundProposed) setInfo(`Đã tạo đề xuất hoàn tiền ${vnd(r.refundProposed)} — chờ quản lý duyệt ở Hoàn tiền.`); },
    onError: (x) => setError(x.message),
  }));
  const cp = useMutation(trpc.students.changePackage.mutationOptions({ onSuccess: done, onError: (x) => setError(x.message) }));
  const events = enrollmentEventsFor(status);
  const needReason = open && open !== "package" && EVENTS_REQUIRING_REASON.includes(open);

  if (!canUpdate) return <p className="text-xs text-ink-400">Bạn không có quyền đổi trạng thái ghi danh ở cơ sở này.</p>;

  return (
    <div className="space-y-2">
      {info && <OkBox>{info}</OkBox>}
      {(events.length > 0 || status !== "completed") && status !== "withdrawn" && (
        <div className="flex flex-wrap gap-2">
          {events.map((ev) => (
            <button key={ev} className={`btn-ghost !py-1 text-xs ${ev === "withdraw" ? "text-red-700" : ""}`} onClick={() => { setOpen(ev); setError(null); setInfo(null); }}>{ENROLLMENT_EVENT_VI[ev]}</button>
          ))}
          {status !== "completed" && <button className="btn-ghost !py-1 text-xs" onClick={() => { setOpen("package"); setError(null); }}>Đổi số buổi</button>}
        </div>
      )}
      {open && (
        <form
          className="space-y-2 rounded-xl border border-black/10 bg-black/[0.02] p-3"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (open === "package") cp.mutate({ enrollmentId, packageSessions: Number(pkg), reason });
            else tr.mutate({ enrollmentId, event: open, reason: reason || undefined, pauseFrom: open === "pause" ? pauseFrom : undefined, pauseUntil: open === "pause" ? pauseUntil || null : undefined });
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
          {open === "package" && <div><label className="label">Số buổi mới (≥ {consumed})</label><input type="number" min={Math.max(1, consumed)} className="input max-w-[140px]" value={pkg} onChange={(x) => setPkg(x.target.value)} /></div>}
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
