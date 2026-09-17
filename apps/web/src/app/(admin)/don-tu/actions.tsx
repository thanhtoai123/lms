"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

export function DecideRequest({ id, canDecide, canCancel, approved }: { id: string; canDecide: boolean; canCancel: boolean; approved: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const m = useMutation(trpc.hr.decideRequest.mutationOptions({ onSuccess: (r) => { setErr(null); setWarn(r.warning); router.refresh(); }, onError: (e) => setErr(e.message) }));
  const needNote = approved;
  return (
    <div className="min-w-[13rem] space-y-1">
      <input className="input !py-1 text-xs" placeholder={canDecide ? "Ghi chú (bắt buộc khi từ chối)" : "Lý do huỷ"} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-1">
        {canDecide && <button className="btn-primary !px-2 !py-1 text-xs" disabled={m.isPending} onClick={() => m.mutate({ id, action: "approve", note: note.trim() || null })}>Duyệt</button>}
        {canDecide && <button className="btn-ghost !px-2 !py-1 text-xs" disabled={m.isPending || note.trim().length < 5} onClick={() => m.mutate({ id, action: "reject", note: note.trim() })}>Từ chối</button>}
        {canCancel && <button className="btn-ghost !px-2 !py-1 text-xs text-red-700" disabled={m.isPending || (needNote && note.trim().length < 5)} onClick={() => m.mutate({ id, action: "cancel", note: note.trim() || null })}>Huỷ đơn</button>}
      </div>
      {err && <div className="text-xs text-red-700">{err}</div>}
      {warn && <div className="text-xs text-amber-700">{warn}</div>}
    </div>
  );
}
