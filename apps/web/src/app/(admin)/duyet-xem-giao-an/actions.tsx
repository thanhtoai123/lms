"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

/** Nút duyệt / từ chối một yêu cầu xem giáo án (từ chối bắt buộc ghi lý do) */
export function DecideButtons({ id, grantMinutes, disabled }: { id: string; grantMinutes: number; disabled?: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const m = useMutation(trpc.content.planAccessDecide.mutationOptions({ onSuccess: () => { setRejecting(false); setNote(""); router.refresh(); } }));
  if (disabled) return <p className="text-sm text-ink-600">Yêu cầu của chính bạn — cần một quản lý khác duyệt.</p>;
  return (
    <div className="space-y-2">
      {!rejecting ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary min-h-11" disabled={m.isPending} onClick={() => m.mutate({ id, action: "approve" })}>
            {m.isPending ? "Đang duyệt…" : `Duyệt xem ${grantMinutes / 60} giờ`}
          </button>
          <button type="button" className="btn-ghost min-h-11" disabled={m.isPending} onClick={() => setRejecting(true)}>Từ chối</button>
        </div>
      ) : (
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); m.mutate({ id, action: "reject", note }); }}>
          <input className="input min-h-11 flex-1" autoFocus maxLength={300} placeholder="Lý do từ chối (giáo viên sẽ thấy)…" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Lý do từ chối" />
          <div className="flex gap-2">
            <button className="btn-primary min-h-11 !bg-red-700" disabled={m.isPending || note.trim().length < 5}>Từ chối</button>
            <button type="button" className="btn-ghost min-h-11" onClick={() => setRejecting(false)}>Thôi</button>
          </div>
        </form>
      )}
      {m.error && <p className="text-sm text-red-700" role="alert">{m.error.message}</p>}
    </div>
  );
}

/** Thu hồi sớm quyền xem đang còn hạn */
export function RevokeButton({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.content.planAccessDecide.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <span>
      <button type="button" className="text-sm font-semibold text-red-700 underline disabled:opacity-50" disabled={m.isPending} onClick={() => m.mutate({ id, action: "revoke", note: "Quản lý thu hồi sớm" })}>Thu hồi</button>
      {m.error && <span className="block text-xs text-red-700">{m.error.message}</span>}
    </span>
  );
}
