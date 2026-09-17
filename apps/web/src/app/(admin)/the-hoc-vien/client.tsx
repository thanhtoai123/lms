"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

export function PrintButton() {
  return <button type="button" className="btn-primary" onClick={() => window.print()}>In thẻ</button>;
}

export function ReissueCard({ studentId }: { studentId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const m = useMutation(trpc.card.reissue.mutationOptions({ onSuccess: () => { setOpen(false); router.refresh(); } }));
  if (!open) return <button type="button" className="text-[11px] text-ink-600 underline" onClick={() => setOpen(true)}>Cấp lại thẻ</button>;
  return (
    <div className="space-y-1 text-xs">
      <input className="input !py-1 !text-xs" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do (mất thẻ…)" />
      <button type="button" className="btn-primary !px-2 !py-1 !text-xs" disabled={m.isPending || reason.trim().length < 5} onClick={() => m.mutate({ studentId, reason })}>Cấp lại</button>
      {m.error && <p className="text-red-700">{m.error.message}</p>}
    </div>
  );
}
