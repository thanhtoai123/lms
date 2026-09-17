"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

export function DecideRequest({ id, canDecide, canCancel, approved, needsTarget, centerId }: { id: string; canDecide: boolean; canCancel: boolean; approved: boolean; needsTarget?: boolean; centerId?: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [target, setTarget] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const people = useQuery({ ...trpc.hr.assignableStaff.queryOptions({ centerId }), enabled: !!needsTarget && canDecide });
  const m = useMutation(trpc.hr.decideRequest.mutationOptions({
    onSuccess: (r) => { setErr(null); setOk(r.applied ? `Đã áp: ${r.applied}` : r.warning ?? null); router.refresh(); },
    onError: (e) => { setOk(null); setErr(e.message); },
  }));
  return (
    <div className="min-w-[14rem] space-y-1">
      {needsTarget && canDecide && (
        <select className="input !py-1 text-xs" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">— Chọn người dạy thay —</option>
          {(people.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
        </select>
      )}
      <input className="input !py-1 text-xs" placeholder={canDecide ? "Ghi chú (bắt buộc khi từ chối)" : "Lý do huỷ"} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-1">
        {canDecide && <button className="btn-primary !px-2 !py-1 text-xs" disabled={m.isPending || (needsTarget && !target)} onClick={() => m.mutate({ id, action: "approve", note: note.trim() || null, targetStaffId: target || null })}>Duyệt &amp; áp ngay</button>}
        {canDecide && <button className="btn-ghost !px-2 !py-1 text-xs" disabled={m.isPending || note.trim().length < 5} onClick={() => m.mutate({ id, action: "reject", note: note.trim() })}>Từ chối</button>}
        {canCancel && <button className="btn-ghost !px-2 !py-1 text-xs text-red-700" disabled={m.isPending || (approved && note.trim().length < 5)} onClick={() => m.mutate({ id, action: "cancel", note: note.trim() || null })}>Huỷ đơn</button>}
      </div>
      {needsTarget && canDecide && !target && <div className="text-xs text-amber-700">Chọn người dạy thay trước khi duyệt.</div>}
      {err && <div className="text-xs text-red-700">{err}</div>}
      {ok && <div className="text-xs text-green-700">{ok}</div>}
    </div>
  );
}
