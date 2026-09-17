"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

type Acts = { assign: boolean; approve: boolean; reject: boolean; complete: boolean; cancel: boolean };

export function RequestActions({ id, actions, assignees, assigneeId }: { id: string; actions: Acts; assignees: { id: string; fullName: string }[]; assigneeId: string | null }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [who, setWho] = useState(assigneeId ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const m = useMutation(trpc.care.actRequest.mutationOptions({
    onSuccess: (r) => { setMsg({ ok: true, text: ["Đã cập nhật", ...r.notes].join(" · ") }); setNote(""); router.refresh(); },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  }));
  const any = Object.values(actions).some(Boolean);
  if (!any) return <p className="text-sm text-ink-400">Yêu cầu đã đóng.</p>;
  const go = (action: "assign" | "approve" | "reject" | "complete" | "cancel") => { setMsg(null); m.mutate({ id, action, note: note.trim() || null, assigneeId: action === "assign" ? who || null : null }); };
  return (
    <div className="space-y-2">
      {actions.assign && (
        <div className="flex gap-1">
          <select className="input !py-1 text-sm" value={who} onChange={(e) => setWho(e.target.value)}><option value="">Tôi nhận xử lý</option>{assignees.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}</select>
          <button className="btn-ghost !py-1 text-sm" disabled={m.isPending} onClick={() => go("assign")}>Giao</button>
        </div>
      )}
      <textarea className="input h-20 text-sm" placeholder="Ghi chú / kết quả (bắt buộc khi từ chối, hoàn tất, huỷ)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-1">
        {actions.approve && <button className="btn-primary !py-1 text-sm" disabled={m.isPending} onClick={() => go("approve")}>Duyệt</button>}
        {actions.reject && <button className="btn-ghost !py-1 text-sm" disabled={m.isPending || note.trim().length < 5} onClick={() => go("reject")}>Từ chối</button>}
        {actions.complete && <button className="btn-primary !py-1 text-sm" disabled={m.isPending || note.trim().length < 5} onClick={() => go("complete")}>Hoàn tất</button>}
        {actions.cancel && <button className="btn-ghost !py-1 text-sm text-red-700" disabled={m.isPending || note.trim().length < 5} onClick={() => go("cancel")}>Huỷ</button>}
      </div>
      {msg && <div className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</div>}
    </div>
  );
}
