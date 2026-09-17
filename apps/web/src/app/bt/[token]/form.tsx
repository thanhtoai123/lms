"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SubmissionType } from "@satarobo/core";

export function HomeworkForm({ token, type, accept, again }: { token: string; type: SubmissionType; accept: string; again: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const fd = new FormData();
    fd.set("text", text);
    fd.set("link", link);
    for (const f of files) fd.append("files", f);
    try {
      const r = await fetch(`/api/public/homework/${token}`, { method: "POST", body: fd });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (j.ok) { setDone(true); router.refresh(); } else setErr(j.error ?? "Không gửi được");
    } catch {
      setErr("Không kết nối được, anh/chị thử lại");
    } finally {
      setBusy(false);
    }
  };
  if (done) return <div className="card p-6 text-center">Đã nộp bài. Giáo viên sẽ chấm và gửi nhận xét. Cảm ơn anh/chị! 💙</div>;
  return (
    <form className="card space-y-3 p-4 text-sm" onSubmit={submit}>
      <h2 className="font-semibold">{again ? "Nộp lại bài" : "Nộp bài"}</h2>
      {type === "file" && (
        <label className="block">Ảnh / tệp bài làm (tối đa 5 tệp, mỗi tệp ≤ 10MB)
          <input type="file" multiple accept={accept} capture="environment" className="mt-1 block w-full" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
        </label>
      )}
      {files.length > 0 && <ul className="text-xs text-ink-600">{files.map((f, i) => <li key={i}>{f.name} · {Math.round(f.size / 1024)} KB</li>)}</ul>}
      {type === "link" && <label className="block">Đường link bài làm (Scratch, YouTube, Google Drive…)<input className="input mt-1 w-full" inputMode="url" placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} required /></label>}
      {type === "text" && <label className="block">Câu trả lời<textarea className="input mt-1 w-full" rows={5} value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} required /></label>}
      {type !== "text" && <label className="block">Lời nhắn cho giáo viên (tuỳ chọn)<textarea className="input mt-1 w-full" rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} /></label>}
      {err && <p className="text-red-700">{err}</p>}
      <button className="btn-primary w-full" disabled={busy || (type === "file" && files.length === 0)}>{busy ? "Đang gửi…" : "Gửi bài"}</button>
    </form>
  );
}
