"use client";

import { useState } from "react";

/** Tải ảnh website → trả URL công khai */
export function ImageUpload({ value, onChange, label = "Ảnh" }: { value: string; onChange: (url: string) => void; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const upload = async (f: File) => {
    setBusy(true);
    setErr("");
    const fd = new FormData();
    fd.set("file", f);
    try {
      const r = await fetch("/api/content/site-media", { method: "POST", body: fd });
      const j = (await r.json()) as { ok: boolean; url?: string; error?: string };
      if (j.ok && j.url) onChange(j.url); else setErr(j.error ?? "Lỗi tải ảnh");
    } catch {
      setErr("Không kết nối được");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-1 text-sm">
      <div>{label}</div>
      {value && <img src={value} alt="" className="max-h-32 rounded-lg border border-black/10" />}
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
        {value && <button type="button" className="text-xs text-red-700" onClick={() => onChange("")}>Bỏ ảnh</button>}
        {busy && <span className="text-xs text-ink-400">Đang tải…</span>}
      </div>
      <input className="input !py-1 text-xs" placeholder="hoặc dán URL ảnh https://" value={value} onChange={(e) => onChange(e.target.value)} />
      {err && <p className="text-xs text-red-700">{err}</p>}
    </div>
  );
}
