"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { useToast } from "@/components/toast";
import { leadNextStates, LEAD_STATUS_VI, LEAD_DROP_REASON_MIN, LEAD_DROP_REASON_MAX, type LeadStatus } from "@satarobo/core";

type Next = ReturnType<typeof leadNextStates>[number];

/**
 * Ô đổi trạng thái lead (chỉ các bước hợp lệ theo luật; "Đã đăng ký" chỉ qua màn Chuyển đổi).
 * Rời phễu (Đang nuôi dưỡng / Đã mất) → hộp thoại lý do 3–500 ký tự; hẹn học thử → chọn giờ.
 */
export function LeadStatusSelect({ leadId, status, disabled, onDone, compact }: { leadId: string; status: LeadStatus; disabled?: boolean; onDone?: () => void; compact?: boolean }) {
  const trpc = useTRPC();
  const next = leadNextStates(status);
  const [pending, setPending] = useState<Next | null>(null);
  const [reason, setReason] = useState("");
  const [trialAt, setTrialAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const tr = useMutation(trpc.admissions.leads.transition.mutationOptions({
    onSuccess: () => { setPending(null); setReason(""); setTrialAt(""); setError(null); onDone?.(); },
    onError: (e) => setError(e.message),
  }));
  const pick = (value: string) => {
    const n = next.find((x) => x.event === value);
    if (!n) return;
    setError(null);
    if (n.needsReason || n.needsTrialAt) setPending(n);
    else tr.mutate({ leadId, event: n.event });
  };
  const len = reason.trim().length;
  const reasonOk = len >= LEAD_DROP_REASON_MIN && len <= LEAD_DROP_REASON_MAX;
  return (
    <>
      <select
        className={`input !w-auto ${compact ? "!py-1 text-[11px]" : "text-xs"}`}
        value=""
        title="Đổi trạng thái"
        disabled={disabled || tr.isPending || next.length === 0}
        onChange={(e) => pick(e.target.value)}
      >
        <option value="">{next.length ? `${LEAD_STATUS_VI[status]} → …` : LEAD_STATUS_VI[status]}</option>
        {next.map((n) => <option key={n.event} value={n.event}>→ {LEAD_STATUS_VI[n.to]}{n.to === status ? " (hẹn lại)" : ""}</option>)}
      </select>
      {error && !pending && <span className="text-[11px] text-red-700">{error}</span>}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true">
          <form
            className="card w-full max-w-md space-y-3 p-5 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              tr.mutate({ leadId, event: pending.event, reason: pending.needsReason ? reason.trim() : undefined, trialAt: pending.needsTrialAt && trialAt ? new Date(trialAt).toISOString() : undefined });
            }}
          >
            <h3 className="font-semibold">Chuyển sang &quot;{LEAD_STATUS_VI[pending.to]}&quot;</h3>
            {pending.needsReason && (
              <div className="space-y-1">
                <p className="text-ink-600">Lead rời phễu ở bước này. Ghi lý do để báo cáo biết vì sao mất, không chỉ biết mất ở bậc nào.</p>
                <label className="label">Lý do *</label>
                <textarea className="input min-h-24" autoFocus maxLength={LEAD_DROP_REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: học phí cao hơn dự tính, đã chọn trung tâm khác, chưa sắp được lịch…" />
                <div className={`text-[11px] ${len && !reasonOk ? "text-red-700" : "text-ink-400"}`}>{len}/{LEAD_DROP_REASON_MAX} ký tự · tối thiểu {LEAD_DROP_REASON_MIN}</div>
              </div>
            )}
            {pending.needsTrialAt && (
              <div>
                <label className="label">Thời gian học thử *</label>
                <input type="datetime-local" className="input" required value={trialAt} onChange={(e) => setTrialAt(e.target.value)} />
                <p className="mt-1 text-[11px] text-ink-400">Muốn xếp bé vào một buổi học cụ thể (kiểm tra chỗ trống, báo GV) thì dùng màn Lớp Trial.</p>
              </div>
            )}
            {error && <div className="text-red-700">{error}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => { setPending(null); setError(null); }}>Huỷ</button>
              <button className="btn-primary" disabled={tr.isPending || (pending.needsReason && !reasonOk) || (pending.needsTrialAt && !trialAt)}>{tr.isPending ? "Đang lưu…" : "Xác nhận"}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

/** Xoá lead 2 bước (lý do bắt buộc) */
export function LeadDeleteButton({ leadId, name, onDeleted }: { leadId: string; name: string; onDeleted?: () => void }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const m = useMutation(trpc.admissions.leads.delete.mutationOptions({
    onSuccess: () => { setOpen(false); setReason(""); if (onDeleted) onDeleted(); else router.refresh(); },
  }));
  if (!open) return <button type="button" className="text-xs text-ink-400 hover:text-red-700" title={`Xoá ${name}`} onClick={() => setOpen(true)}>Xoá</button>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <input className="input !w-40 !py-1 text-xs" autoFocus placeholder="Lý do xoá *" maxLength={LEAD_DROP_REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} />
      <button type="button" className="text-xs font-semibold text-red-700 disabled:opacity-40" disabled={m.isPending || reason.trim().length < 3} onClick={() => m.mutate({ leadId, reason: reason.trim() })}>Xác nhận?</button>
      <button type="button" className="text-xs text-ink-400" onClick={() => { setOpen(false); m.reset(); }}>Huỷ</button>
      {m.error && <span className="text-[11px] text-red-700">{m.error.message}</span>}
    </span>
  );
}

/**
 * Một chạm "Đã gọi": ghi hoạt động gọi điện cho lead ngay trên dòng danh sách.
 * `lastTouchAt` được cập nhật nên đồng hồ SLA reset — trước đây phải mở trang
 * chi tiết lead rồi mới ghi được hoạt động (3 cú nhấp → 1).
 */
export function LeadTouchButton({ leadId, name }: { leadId: string; name: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const toast = useToast();
  const m = useMutation(trpc.admissions.leads.addActivity.mutationOptions({
    onSuccess: () => { toast.ok(`Đã ghi nhận liên hệ với ${name}`); router.refresh(); },
    onError: (e) => toast.error("Không ghi được hoạt động", { detail: e.message }),
  }));
  return (
    <button
      type="button"
      className="inline-flex min-h-10 items-center rounded-lg px-2 text-xs font-semibold text-primary transition-colors hover:bg-primary-soft disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      disabled={m.isPending}
      aria-label={`Ghi nhận đã liên hệ với ${name}`}
      title="Ghi nhận đã liên hệ (đồng hồ SLA tính lại từ bây giờ)"
      onClick={() => { if (!m.isPending) m.mutate({ leadId, type: "call", content: "Đã gọi cho phụ huynh" }); }}
    >
      {m.isPending ? "Đang ghi…" : "Đã gọi"}
    </button>
  );
}
