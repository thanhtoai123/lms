"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { ErrorBox, OkBox } from "@/components/admin-ui";
import { fmtDate } from "@/components/ui";

/** "Xếp lại" một lớp lệch lịch: xem trước rồi áp dụng (neo lại cả dãy theo lịch) */
export function ReanchorButton({ classId, code }: { classId: string; code: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const preview = useQuery({ ...trpc.academics.classes.reanchorPreview.queryOptions({ id: classId }), enabled: open, retry: false });
  const apply = useMutation(trpc.academics.classes.reanchorApply.mutationOptions({
    onSuccess: (r) => { setMsg(`${code}: ${r.summary}`); setOpen(false); setReason(""); router.refresh(); },
    onError: (e) => setMsg(`Lỗi: ${e.message}`),
  }));
  const p = preview.data;
  if (msg && !open) return <OkBox>{msg}</OkBox>;
  if (!open) return <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setOpen(true)}>Xếp lại</button>;
  return (
    <div className="w-72 space-y-2 rounded-xl border border-black/10 p-2 text-xs">
      {preview.isFetching && <div className="text-ink-400">Đang tính…</div>}
      {preview.error && <ErrorBox>{preview.error.message}</ErrorBox>}
      {p && !preview.isFetching && (
        <>
          {p.errors.map((x) => <div key={x} className="text-red-700">• {x}</div>)}
          {p.warnings.map((x) => <div key={x} className="text-amber-800">• {x}</div>)}
          {p.conflicts.map((c, i) => <div key={i} className="text-red-700">• Trùng {c.kind === "room" ? "phòng" : "giáo viên"} {fmtDate(c.date)} với {c.with}</div>)}
          <div className="font-semibold">{p.summary}</div>
        </>
      )}
      <input className="input" maxLength={300} placeholder="Lý do (≥ 5 ký tự)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-1">
        <button className="btn-primary !px-2 !py-1 text-xs" disabled={apply.isPending || reason.trim().length < 5 || !p || p.errors.length > 0 || p.conflicts.length > 0 || p.changedCount === 0} onClick={() => apply.mutate({ classId, reason: reason.trim() })}>
          {apply.isPending ? "Đang xếp…" : `Xếp lại ${p?.changedCount ?? 0} buổi`}
        </button>
        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setOpen(false)}>Thôi</button>
      </div>
      {msg && <div className="text-red-700">{msg}</div>}
    </div>
  );
}
