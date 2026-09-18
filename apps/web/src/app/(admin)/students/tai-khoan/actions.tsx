"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

/** Gửi lại mã kích hoạt hàng loạt cho phụ huynh chưa nhận (hàng đợi thông báo, tôn trọng giờ yên lặng) */
export function BulkResend({ candidates }: { candidates: { id: string; fullName: string; hasEmail: boolean }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(() => candidates.map((c) => c.id));
  const [result, setResult] = useState<{ queued: number; emailed: number; skipped: { fullName: string; reason: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const m = useMutation(trpc.students.resendActivationCodes.mutationOptions({
    onSuccess: (r) => { setResult(r); setError(null); router.refresh(); },
    onError: (e) => { setError(e.message); setResult(null); },
  }));
  if (candidates.length === 0) return null;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <section className="card space-y-2 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <b>Gửi lại mã kích hoạt hàng loạt</b>
          <div className="text-xs text-ink-600">{candidates.length} phụ huynh trong trang này chưa kích hoạt. Mã mới hiệu lực 72 giờ, xếp vào hàng đợi thông báo (Zalo ZNS) — worker gửi ngoài giờ yên lặng; phụ huynh có email được gửi thêm email.</div>
        </div>
        <button className="btn-ghost !py-1.5" onClick={() => setOpen((v) => !v)}>{open ? "Đóng" : "Chọn phụ huynh"}</button>
      </div>
      {open && (
        <div className="space-y-2">
          <div className="flex gap-2 text-xs">
            <button className="underline" onClick={() => setPicked(candidates.map((c) => c.id))}>Chọn tất cả</button>
            <button className="underline" onClick={() => setPicked([])}>Bỏ chọn</button>
          </div>
          <ul className="max-h-60 space-y-1 overflow-auto text-xs">
            {candidates.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} />
                  {c.fullName}{c.hasEmail ? " · có email" : ""}
                </label>
              </li>
            ))}
          </ul>
          <button className="btn-primary !py-1.5" disabled={m.isPending || picked.length === 0} onClick={() => m.mutate({ parentIds: picked })}>
            {m.isPending ? "Đang xếp hàng đợi…" : `Gửi lại mã cho ${picked.length} phụ huynh`}
          </button>
        </div>
      )}
      {result && (
        <div className="text-xs text-green-700">
          Đã xếp {result.queued} tin vào hàng đợi{result.emailed ? ` · ${result.emailed} email` : ""}.
          {result.skipped.length > 0 && <span className="text-amber-700"> Bỏ qua {result.skipped.length}: {result.skipped.slice(0, 5).map((s) => `${s.fullName} (${s.reason})`).join("; ")}</span>}
        </div>
      )}
      {error && <div className="text-xs text-red-700">{error}</div>}
    </section>
  );
}

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
