"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MEDIA_UPLOAD_MAX_FILES } from "@satarobo/core";
import { ErrorBox, OkBox } from "@/components/admin-ui";

type S = { id: string; sequenceNo: number; date: string; status: string };
type R = { id: string; fullName: string; consent: boolean };

/**
 * Tải ảnh vào **kho của lớp**: phụ huynh chưa nhìn thấy.
 * Gắn thẻ học viên (hoặc đánh dấu ảnh chung cả lớp) rồi bấm Gửi duyệt ở dưới thư viện.
 */
export function MediaUploader({ sessions, roster }: { sessions: S[]; roster: R[] }) {
  const router = useRouter();
  const first = sessions[0];
  const [sessionId, setSessionId] = useState(first?.id ?? "");
  const [takenAt, setTakenAt] = useState(first?.date ?? "");
  const [caption, setCaption] = useState("");
  const [classWide, setClassWide] = useState(false);
  const [tagged, setTagged] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const noConsent = roster.filter((r) => (classWide || tagged.includes(r.id)) && !r.consent);

  const pickSession = (id: string) => {
    setSessionId(id);
    const s = sessions.find((x) => x.id === id);
    if (s) setTakenAt(s.date);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null); setError(null);
    try {
      const fd = new FormData();
      fd.set("sessionId", sessionId);
      fd.set("caption", caption);
      fd.set("takenAt", takenAt);
      fd.set("classWide", classWide ? "1" : "0");
      fd.set("tagged", JSON.stringify(classWide ? [] : tagged));
      for (const f of files) fd.append("files", f);
      const r = await fetch("/api/media/upload", { method: "POST", body: fd });
      const j = (await r.json()) as { ok: boolean; uploaded?: number; error?: string; results?: { name: string; ok: boolean; error?: string }[] };
      const failed = j.results?.filter((x) => !x.ok) ?? [];
      if (j.ok) {
        setMsg(`Đã đưa ${j.uploaded} ảnh vào kho của lớp — phụ huynh chưa thấy. Kiểm tra thẻ học viên rồi bấm "Gửi duyệt".${failed.length ? ` ${failed.length} ảnh lỗi: ${failed.map((f) => `${f.name} (${f.error})`).join(", ")}` : ""}`);
        setFiles([]); setCaption(""); router.refresh();
      } else {
        setError(j.error ?? failed.map((f) => `${f.name}: ${f.error}`).join("; ") ?? "Không tải được ảnh");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (sessions.length === 0) return <div className="card p-4 text-sm text-ink-400">Lớp chưa có buổi học nào để đăng ảnh.</div>;
  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-600">Tải ảnh vào kho của lớp</h2>
      <p className="text-xs text-ink-600">Ảnh vào kho trước, phụ huynh chưa thấy. Gắn thẻ học viên hoặc đánh dấu &ldquo;ảnh chung cả lớp&rdquo;, sau đó bấm Gửi duyệt.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div><label className="label">Buổi học</label><select className="input" value={sessionId} onChange={(e) => pickSession(e.target.value)}>{sessions.map((s) => <option key={s.id} value={s.id}>Buổi {s.sequenceNo} · {s.date.split("-").reverse().join("/")}</option>)}</select></div>
        <div><label className="label">Ngày chụp</label><input type="date" className="input" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} /></div>
        <div><label className="label">Ảnh (JPG/PNG/WEBP, ≤10MB, tối đa {MEDIA_UPLOAD_MAX_FILES})</label><input type="file" multiple accept="image/jpeg,image/png,image/webp" className="input" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, MEDIA_UPLOAD_MAX_FILES))} /></div>
        <div><label className="label">Chú thích (tuỳ chọn)</label><textarea className="input min-h-14" value={caption} onChange={(e) => setCaption(e.target.value)} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={classWide} onChange={(e) => setClassWide(e.target.checked)} />
        Ảnh chung cả lớp — mọi phụ huynh trong lớp xem được (không cần gắn từng học viên)
      </label>
      {!classWide && (
        <div>
          <div className="label">Học viên có trong ảnh</div>
          <div className="flex flex-wrap gap-1">
            {roster.map((r) => {
              const on = tagged.includes(r.id);
              return (
                <button type="button" key={r.id} onClick={() => setTagged((t) => (on ? t.filter((x) => x !== r.id) : [...t, r.id]))} className={`chip cursor-pointer px-2.5 py-1 ${on ? "bg-brand-600 text-white" : "bg-black/5"}`} title={r.consent ? "PH đã đồng ý đăng ảnh" : "PH CHƯA đồng ý đăng ảnh"}>
                  {r.fullName}{!r.consent && " ⚠"}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {noConsent.length > 0 && <div className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">⚠ {noConsent.map((r) => r.fullName).join(", ")} chưa có đồng ý đăng ảnh của phụ huynh — ảnh sẽ không duyệt được cho tới khi bỏ gắn{classWide ? " hoặc bỏ đánh dấu ảnh chung cả lớp" : ""}.</div>}
      {msg && <OkBox>{msg}</OkBox>}
      {error && <ErrorBox>{error}</ErrorBox>}
      <button className="btn-primary" disabled={busy || files.length === 0 || !sessionId}>{busy ? "Đang tải lên…" : `Tải ${files.length || ""} ảnh vào kho`}</button>
    </form>
  );
}
