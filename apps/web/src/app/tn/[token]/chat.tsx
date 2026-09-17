"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { mine: boolean; body: string; at: string; by: string };

export function ChatBox({ token, initial, closed }: { token: string; initial: Msg[]; closed: boolean }) {
  const [msgs, setMsgs] = useState(initial);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden) return;
      try {
        const r = await fetch(`/api/public/chat/${token}`, { cache: "no-store" });
        if (r.ok) { const j = (await r.json()) as { messages: Msg[] }; setMsgs(j.messages.map((m) => ({ ...m, at: new Date(m.at).toISOString() }))); }
      } catch { /* bỏ qua */ }
    }, 20_000);
    return () => clearInterval(t);
  }, [token]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setErr("");
    try {
      const r = await fetch(`/api/public/chat/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }) });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (j.ok) { setMsgs([...msgs, { mine: true, body: text.trim(), at: new Date().toISOString(), by: "Phụ huynh" }]); setText(""); }
      else setErr(j.error ?? "Không gửi được");
    } catch { setErr("Không gửi được, kiểm tra mạng"); }
    setSending(false);
  }
  const fmt = (s: string) => new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="card flex-1 space-y-2 overflow-y-auto p-3" style={{ maxHeight: "60dvh" }}>
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.mine ? "bg-brand-500 text-white" : "bg-black/5"}`}>
              <div className="whitespace-pre-wrap">{m.body}</div>
              <div className={`mt-0.5 text-[10px] ${m.mine ? "text-white/70" : "text-ink-400"}`}>{m.by} · {fmt(m.at)}</div>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="flex gap-2">
        <textarea className="input flex-1" rows={2} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder={closed ? "Hội thoại đã kết thúc — gửi tin để mở lại" : "Nhập tin nhắn…"} />
        <button className="btn-primary" disabled={sending || !text.trim()}>Gửi</button>
      </form>
      {err && <p className="text-sm text-red-700">{err}</p>}
    </div>
  );
}
