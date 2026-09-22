"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Msg = { mine: boolean; body: string; at: string; by: string };

export function Thread({ id, initial }: { id: string; initial: Msg[] }) {
  const [msgs, setMsgs] = useState(initial);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden) return;
      const r = await fetch(`/api/ph/messages?id=${id}`, { cache: "no-store" }).catch(() => null);
      if (r?.ok) setMsgs(((await r.json()) as { messages: Msg[] }).messages);
    }, 20_000);
    return () => clearInterval(t);
  }, [id]);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const r = await fetch("/api/ph/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, body: text }) }).catch(() => null);
    const j = r ? ((await r.json()) as { ok: boolean; error?: string }) : { ok: false, error: "Không gửi được" };
    if (j.ok) { setMsgs([...msgs, { mine: true, body: text.trim(), at: new Date().toISOString(), by: "Tôi" }]); setText(""); } else setErr(j.error ?? "Không gửi được");
  };
  return (
    <div className="space-y-3">
      <div className="card max-h-[60dvh] space-y-2 overflow-y-auto p-3">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-[15px] ${m.mine ? "bg-brand-500 text-white" : "bg-black/5"}`}><div className="whitespace-pre-wrap">{m.body}</div><div className={`text-[12px] ${m.mine ? "text-white/70" : "text-ink-600"}`}>{m.by} · {new Date(m.at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div></div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="flex gap-2"><textarea className="input flex-1" rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Nhập tin nhắn…" /><button className="btn-primary" disabled={!text.trim()}>Gửi</button></form>
      {err && <p className="text-[15px] text-red-700">{err}</p>}
    </div>
  );
}

export function AskForm({ studentId }: { studentId: string }) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await fetch("/api/ph/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, subject, body }) }).catch(() => null);
    const j = r ? ((await r.json()) as { ok: boolean; id?: string; error?: string }) : { ok: false, error: "Không gửi được" };
    setBusy(false);
    if (j.ok && j.id) router.push(`/ph/tin-nhan?id=${j.id}`);
    else setErr(j.error ?? "Không gửi được");
  };
  return (
    <form onSubmit={send} className="space-y-2 text-[15px]">
      <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Chủ đề (xin nghỉ, hỏi lịch học…)" required minLength={3} />
      <textarea className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} required placeholder="Nội dung" />
      {err && <p className="text-red-700">{err}</p>}
      <button className="btn-primary w-full" disabled={busy}>Gửi cho trung tâm</button>
    </form>
  );
}
