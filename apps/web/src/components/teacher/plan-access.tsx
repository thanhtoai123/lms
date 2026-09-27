"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Clock3, KeyRound, ShieldCheck } from "lucide-react";
import { thoiLuongVi, PLAN_REASON_MIN, PLAN_REASON_MAX, PLAN_GRANT_MIN } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

const hm = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });

/**
 * Dải "còn được xem bao lâu" trên khung chiếu. Hết giờ → tải lại trang: máy chủ khoá lại và
 * khung chiếu biến mất (URL ký của gói SCORM cũng hết hạn cùng lúc — services/documents.scormLaunch).
 */
export function AccessCountdown({ until, via }: { until: string; via: "ca-day" | "duyet" }) {
  const [left, setLeft] = useState(() => new Date(until).getTime() - Date.now());
  useEffect(() => {
    const tick = () => {
      const l = new Date(until).getTime() - Date.now();
      setLeft(l);
      if (l <= 0) window.location.reload();
    };
    const t = window.setInterval(tick, 15_000);
    const end = window.setTimeout(tick, Math.max(0, new Date(until).getTime() - Date.now()) + 500);
    return () => { window.clearInterval(t); window.clearTimeout(end); };
  }, [until]);
  const min = Math.max(0, Math.ceil(left / 60_000));
  const sap = min <= 10;
  return (
    <div role="status" className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-[14px] ${sap ? "bg-amber-50 text-amber-900" : "bg-green-50 text-green-900"}`}>
      {via === "ca-day" ? <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden /> : <KeyRound className="h-4 w-4 shrink-0" aria-hidden />}
      <span>{via === "ca-day" ? "Trong ca dạy" : "Được quản lý duyệt"} · mở đến <b>{hm(until)}</b> (còn {thoiLuongVi(min)})</span>
      {sap && <span className="font-semibold">— sắp đóng</span>}
    </div>
  );
}

type Req = { id: string; status: string; statusLabel: string; reason: string; decisionNote: string | null; createdAt: string; expiresAt: string | null } | null;

/** Xin xem giáo án ngoài ca dạy: ghi lý do → quản lý cơ sở duyệt → xem 2 giờ */
export function RequestAccess({ lessonId, sessionId, request, canRequest }: { lessonId: string; sessionId: string | null; request: Req; canRequest: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const send = useMutation(trpc.content.planAccessRequest.mutationOptions({ onSuccess: () => { setReason(""); router.refresh(); } }));
  const cancel = useMutation(trpc.content.planAccessCancel.mutationOptions({ onSuccess: () => router.refresh() }));
  const len = reason.trim().length;

  if (request?.status === "pending") {
    return (
      <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[14px] text-amber-950">
        <p className="flex items-center gap-2 font-semibold"><Clock3 className="h-4 w-4" aria-hidden />Đã gửi yêu cầu lúc {hm(request.createdAt)} — chờ quản lý duyệt</p>
        <p className="text-amber-900">Lý do: “{request.reason}”. Duyệt xong bạn nhận thông báo và mở được ngay tại trang này.</p>
        <button type="button" className="text-sm font-semibold underline" disabled={cancel.isPending} onClick={() => cancel.mutate({ id: request.id })}>Huỷ yêu cầu</button>
        {cancel.error && <p className="text-sm text-red-700">{cancel.error.message}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {request && (request.status === "rejected" || request.status === "revoked") && (
        <p className="rounded-xl bg-red-50 p-3 text-[14px] text-red-800">Yêu cầu gần nhất: <b>{request.statusLabel}</b>{request.decisionNote ? ` — ${request.decisionNote}` : ""}</p>
      )}
      {request && request.status === "expired" && <p className="text-[14px] text-ink-600">Lần được xem trước đã hết hạn — gửi yêu cầu mới nếu cần xem tiếp.</p>}
      {canRequest ? (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); send.mutate({ lessonId, reason, sessionId }); }}>
          <label htmlFor="ly-do" className="block text-[14px] font-semibold">Xin xem ngoài ca dạy ({PLAN_GRANT_MIN / 60} giờ sau khi quản lý duyệt)</label>
          <textarea id="ly-do" rows={3} maxLength={PLAN_REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} className="input"
            placeholder="Lý do cần xem — ví dụ: dạy thay lớp khác ngày mai, soạn bài trước buổi, kiểm tra nội dung…" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12px] text-ink-600">{len}/{PLAN_REASON_MAX} ký tự · tối thiểu {PLAN_REASON_MIN}</span>
            <button className="btn-primary min-h-11" disabled={send.isPending || len < PLAN_REASON_MIN}>{send.isPending ? "Đang gửi…" : "Gửi quản lý duyệt"}</button>
          </div>
          {send.error && <p className="text-sm text-red-700" role="alert">{send.error.message}</p>}
        </form>
      ) : null}
    </div>
  );
}
