"use client";

import { useState } from "react";

export function LoginForm() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [method, setMethod] = useState<"otp" | "code">("otp");
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const call = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/ph/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return (await r.json()) as { ok: boolean; error?: string; note?: string; devCode?: string; firstLogin?: boolean };
    } catch {
      return { ok: false, error: "Không kết nối được, thử lại" };
    } finally {
      setBusy(false);
    }
  };
  const sendOtp = async () => {
    const r = await call({ action: "otp", phone });
    if (r.ok) { setSent(true); setMsg(`${r.note ?? "Đã gửi mã."}${r.devCode ? ` (mã thử: ${r.devCode})` : ""}`); }
    else setMsg(r.error ?? "Không gửi được mã");
  };
  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await call({ action: "login", phone, method, code });
    if (r.ok) window.location.href = "/ph";
    else setMsg(r.error ?? "Không đăng nhập được");
  };
  return (
    <form onSubmit={login} className="card space-y-3 p-5">
      <label className="block text-[15px]">Số điện thoại<input className="input mt-1" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required /></label>
      <div className="flex gap-3 text-[13px]">
        <label className="flex items-center gap-1"><input type="radio" checked={method === "otp"} onChange={() => setMethod("otp")} /> Mã qua Zalo</label>
        <label className="flex items-center gap-1"><input type="radio" checked={method === "code"} onChange={() => setMethod("code")} /> Mã kích hoạt từ trung tâm</label>
      </div>
      {method === "otp" && <button type="button" className="btn-ghost w-full" disabled={busy || phone.replace(/\D/g, "").length < 10} onClick={sendOtp}>{sent ? "Gửi lại mã" : "Gửi mã đăng nhập"}</button>}
      {(method === "code" || sent) && <label className="block text-[15px]">Mã 6 số<input className="input mt-1 text-center font-mono text-lg tracking-widest" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required /></label>}
      {msg && <p className="text-[15px] text-ink-600">{msg}</p>}
      <button className="btn-primary w-full" disabled={busy || code.length !== 6}>Đăng nhập</button>
    </form>
  );
}
