"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ConsentToggle({ purpose, granted, editable }: { purpose: string; granted: boolean; editable: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (!editable) return <span className="text-xs text-ink-400">Liên hệ trung tâm để thay đổi</span>;
  const set = async (v: boolean) => {
    setBusy(true);
    const r = await fetch("/api/ph/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "consent", purpose, granted: v }) }).catch(() => null);
    const j = r ? ((await r.json()) as { ok: boolean; error?: string }) : { ok: false, error: "Lỗi kết nối" };
    setBusy(false);
    if (j.ok) router.refresh(); else setErr(j.error ?? "Không lưu được");
  };
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" disabled={busy} onClick={() => set(!granted)} className={`relative h-6 w-11 rounded-full transition ${granted ? "bg-brand-500" : "bg-slate-300"}`} aria-pressed={granted}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${granted ? "left-5" : "left-0.5"}`} />
      </button>
      {err && <span className="text-xs text-red-700">{err}</span>}
    </span>
  );
}

export function RevokeSession({ id }: { id: string }) {
  const router = useRouter();
  return <button type="button" className="text-xs text-red-700 underline" onClick={async () => { await fetch("/api/ph/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revoke", sessionId: id }) }); router.refresh(); }}>Đăng xuất thiết bị này</button>;
}
