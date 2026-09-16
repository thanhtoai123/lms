"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

export function AccountActions({ parentId, status }: { parentId: string; status: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [code, setCode] = useState<{ code: string; expiresAt: Date } | null>(null);
  const [lockOpen, setLockOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const issue = useMutation(trpc.students.issueActivationCode.mutationOptions({ onSuccess: (r) => { setCode(r); setError(null); router.refresh(); }, onError: (e) => setError(e.message) }));
  const lock = useMutation(trpc.students.setParentLock.mutationOptions({ onSuccess: () => { setLockOpen(false); setReason(""); router.refresh(); }, onError: (e) => setError(e.message) }));
  const locked = status === "locked";

  return (
    <div className="min-w-[200px] space-y-2">
      <div className="flex flex-wrap gap-1">
        {(status === "none" || status === "pending_activation") && <button className="btn-primary !px-2 !py-1 text-xs" disabled={issue.isPending} onClick={() => issue.mutate({ parentId })}>{status === "none" ? "Cấp tài khoản" : "Cấp lại mã"}</button>}
        <button className={`btn-ghost !px-2 !py-1 text-xs ${locked ? "" : "text-red-700"}`} onClick={() => setLockOpen((v) => !v)}>{locked ? "Mở khoá" : "Khoá"}</button>
      </div>
      {code && (
        <div className="rounded-xl border border-brand-600/30 bg-brand-50 p-2 text-xs">
          <div>Mã kích hoạt (chỉ hiện một lần):</div>
          <div className="my-1 font-mono text-2xl font-bold tracking-[0.3em] text-brand-700">{code.code}</div>
          <div className="text-ink-600">Hết hạn {new Date(code.expiresAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}. Đọc mã cho PH; PH nhập SĐT + mã ở trang kích hoạt.</div>
          <button className="mt-1 underline" onClick={() => setCode(null)}>Đã đưa mã — ẩn</button>
        </div>
      )}
      {lockOpen && (
        <form className="space-y-1" onSubmit={(e) => { e.preventDefault(); lock.mutate({ parentId, locked: !locked, reason }); }}>
          <input className="input !py-1 text-xs" required minLength={3} placeholder="Lý do *" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn-ghost !py-1 text-xs" disabled={lock.isPending}>Xác nhận {locked ? "mở khoá" : "khoá"}</button>
        </form>
      )}
      {error && <div className="text-xs text-red-700">{error}</div>}
    </div>
  );
}
