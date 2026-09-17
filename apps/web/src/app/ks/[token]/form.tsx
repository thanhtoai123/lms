"use client";

import { useState } from "react";
import type { SurveyQuestion } from "@satarobo/core";

export function SurveyForm({ token, questions }: { token: string; questions: SurveyQuestion[] }) {
  const [a, setA] = useState<Record<string, string | number | null>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (id: string, v: string | number | null) => setA((x) => ({ ...x, [id]: v }));
  const submit = async () => {
    setErr(null);
    const miss = questions.findIndex((q) => q.required && (a[q.id] === undefined || a[q.id] === null || a[q.id] === ""));
    if (miss >= 0) return setErr(`Vui lòng trả lời câu ${miss + 1}`);
    setBusy(true);
    try {
      const r = await fetch(`/api/public/survey/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: a }) });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (j.ok) setDone(true);
      else setErr(j.error ?? "Không gửi được, thử lại sau");
    } catch {
      setErr("Mất kết nối, thử lại sau");
    } finally {
      setBusy(false);
    }
  };
  if (done) return <div className="card p-6 text-center text-lg">Cảm ơn anh/chị đã góp ý! 💙<div className="mt-2 text-sm text-ink-600">Sata Robo sẽ dùng ý kiến này để phục vụ bé tốt hơn.</div></div>;
  return (
    <div className="space-y-4">
      {questions.map((q, i) => (
        <section key={q.id} className="card space-y-2 p-4">
          <div className="font-medium">{i + 1}. {q.label}{q.required && <span className="text-red-600"> *</span>}</div>
          {q.type === "nps" && (
            <>
              <div className="grid grid-cols-11 gap-1">
                {Array.from({ length: 11 }, (_, n) => (
                  <button key={n} type="button" onClick={() => set(q.id, n)} className={`rounded-lg border py-2 text-sm ${a[q.id] === n ? "border-brand-600 bg-brand-600 text-white" : "border-black/10"}`}>{n}</button>
                ))}
              </div>
              <div className="flex justify-between text-xs text-ink-400"><span>Không sẵn sàng</span><span>Rất sẵn sàng</span></div>
            </>
          )}
          {q.type === "rating" && (
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-label={`${n} sao`} onClick={() => set(q.id, n)} className={`text-3xl ${Number(a[q.id] ?? 0) >= n ? "text-amber-400" : "text-black/15"}`}>★</button>
              ))}
            </div>
          )}
          {q.type === "choice" && (
            <div className="space-y-1">
              {(q.options ?? []).map((o) => (
                <label key={o} className="flex items-center gap-2 text-sm"><input type="radio" name={q.id} checked={a[q.id] === o} onChange={() => set(q.id, o)} /> {o}</label>
              ))}
            </div>
          )}
          {q.type === "text" && <textarea className="input h-24" maxLength={2000} value={String(a[q.id] ?? "")} onChange={(e) => set(q.id, e.target.value)} />}
        </section>
      ))}
      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      <button className="btn-primary w-full !py-3 text-base" disabled={busy} onClick={submit}>{busy ? "Đang gửi…" : "Gửi khảo sát"}</button>
    </div>
  );
}
