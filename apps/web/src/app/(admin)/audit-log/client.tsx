"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

const show = (v: unknown) => (v === undefined ? "∅" : v === null ? "null" : typeof v === "object" ? JSON.stringify(v, null, 1) : String(v));

/**
 * "Xem đầy đủ" — break-glass: bắt buộc lý do, chỉ vai trò có `audit:view_pii`,
 * và mỗi lần xem ghi một bản ghi audit `PII_REVEAL`.
 */
export function RevealAudit({ id }: { id: string }) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const m = useMutation(trpc.system.revealAudit.mutationOptions());

  if (!open) return <button className="text-[11px] text-amber-700 underline" onClick={() => setOpen(true)}>Xem đầy đủ</button>;
  return (
    <div className="mt-1 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px]">
      {!m.data ? (
        <form
          className="space-y-1"
          onSubmit={(e) => { e.preventDefault(); m.mutate({ id, reason }); }}
        >
          <p className="text-amber-900">Xem đầy đủ dữ liệu cá nhân là thao tác <b>break-glass</b>: bắt buộc ghi lý do và được ghi lại trong nhật ký (PII_REVEAL).</p>
          <input className="input w-full !py-1 text-[11px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do (tối thiểu 10 ký tự)" maxLength={500} required />
          <div className="flex gap-2">
            <button className="btn-primary !px-2 !py-0.5 text-[11px]" disabled={m.isPending}>{m.isPending ? "Đang mở…" : "Mở & ghi nhật ký"}</button>
            <button type="button" className="btn-ghost !px-2 !py-0.5 text-[11px]" onClick={() => { setOpen(false); setReason(""); }}>Huỷ</button>
          </div>
          {m.error && <p className="text-red-700">{m.error.message}</p>}
        </form>
      ) : (
        <div className="space-y-1">
          <div className="font-semibold text-amber-900">Dữ liệu đầy đủ (đã ghi nhật ký PII_REVEAL)</div>
          <div><b>Trước:</b> <pre className="whitespace-pre-wrap break-all font-mono">{show(m.data.before)}</pre></div>
          <div><b>Sau:</b> <pre className="whitespace-pre-wrap break-all font-mono">{show(m.data.after)}</pre></div>
          {m.data.reason && <div><b>Lý do gốc:</b> {m.data.reason}</div>}
          {m.data.actorEmail && <div><b>Email người thực hiện:</b> {m.data.actorEmail}</div>}
          <button type="button" className="btn-ghost !px-2 !py-0.5 text-[11px]" onClick={() => setOpen(false)}>Đóng</button>
        </div>
      )}
    </div>
  );
}
