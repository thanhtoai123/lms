"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Factor = { id: string; status: string; name: string | null; createdAt: string | null };
async function call(body: object) {
  const r = await fetch("/api/auth/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!r) return { ok: false, error: "Lỗi kết nối" } as Record<string, unknown> & { ok: boolean; error?: string };
  return (await r.json().catch(() => ({ ok: false, error: "Lỗi" }))) as Record<string, unknown> & { ok: boolean; error?: string };
}

export function MfaPanel({ pending }: { pending: boolean }) {
  const router = useRouter();
  const [st, setSt] = useState<{ aal: string; factors: Factor[] } | null>(null);
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await call({ action: "status" });
    if (r.ok) setSt({ aal: String(r.aal), factors: r.factors as Factor[] });
    else setMsg({ ok: false, text: r.error ?? "Không tải được" });
  }, []);
  useEffect(() => { void load(); }, [load]);
  const verified = st?.factors.filter((f) => f.status === "verified") ?? [];
  const verify = async (factorId: string) => {
    setBusy(true);
    const r = await call({ action: "verify", factorId, code });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Không xác thực được" });
    setMsg({ ok: true, text: "Đã xác thực 2 lớp." });
    setEnroll(null);
    setCode("");
    await load();
    router.refresh();
    if (pending) router.push("/dashboard");
  };
  if (!st) return <div className="card p-4 text-sm text-ink-400">{msg?.text ?? "Đang tải…"}</div>;
  return (
    <div className="card space-y-3 p-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Xác thực 2 lớp</span>
        <span className={`chip ${verified.length ? "bg-green-100 text-green-800" : "bg-slate-100"}`}>{verified.length ? `Đã bật · phiên ${st.aal === "aal2" ? "đã xác thực" : "chưa xác thực"}` : "Chưa bật"}</span>
      </div>
      {verified.length > 0 && st.aal !== "aal2" && (
        <div className="flex gap-2">
          <input className="input" inputMode="numeric" maxLength={6} placeholder="Mã 6 số" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          <button className="btn-primary" disabled={busy || code.length !== 6} onClick={() => verify(verified[0]!.id)}>Xác thực</button>
        </div>
      )}
      {verified.length === 0 && !enroll && (
        <button className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); const r = await call({ action: "enroll" }); setBusy(false); if (r.ok) setEnroll({ factorId: String(r.factorId), qr: String(r.qr), secret: String(r.secret) }); else setMsg({ ok: false, text: r.error ?? "Lỗi" }); }}>Bật xác thực 2 lớp</button>
      )}
      {enroll && (
        <div className="space-y-2">
          <p>1. Mở ứng dụng xác thực, quét mã QR (hoặc nhập khoá). 2. Nhập mã 6 số hiện trong ứng dụng.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.qr} alt="Mã QR xác thực 2 lớp" className="h-44 w-44 rounded-lg border border-black/10 bg-white p-1" />
          <p className="break-all font-mono text-xs text-ink-600">Khoá: {enroll.secret}</p>
          <div className="flex gap-2">
            <input className="input" inputMode="numeric" maxLength={6} placeholder="Mã 6 số" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            <button className="btn-primary" disabled={busy || code.length !== 6} onClick={() => verify(enroll.factorId)}>Xác nhận</button>
          </div>
        </div>
      )}
      {verified.length > 0 && st.aal === "aal2" && (
        <ul className="divide-y divide-black/5">{verified.map((f) => (
          <li key={f.id} className="flex items-center justify-between py-2"><span>{f.name ?? "Ứng dụng xác thực"}</span>
            {!pending && <button className="text-xs text-red-700 underline" disabled={busy} onClick={async () => { setBusy(true); const r = await call({ action: "unenroll", factorId: f.id }); setBusy(false); setMsg(r.ok ? { ok: true, text: "Đã gỡ." } : { ok: false, text: r.error ?? "Lỗi" }); await load(); }}>Gỡ</button>}
          </li>
        ))}</ul>
      )}
      {msg && <p className={msg.ok ? "text-green-700" : "text-red-700"}>{msg.text}</p>}
    </div>
  );
}
