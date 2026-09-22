"use client";

/**
 * PHẦN BỔ SUNG của màn buổi dạy (app GV) — docs/PHIA-NGUOI-DUNG.md:
 *  1. Chụp & gắn ảnh nhanh: camera điện thoại, gắn nhiều em một chạm (chỉ em mà phụ huynh đã đồng ý đăng ảnh),
 *     tải lên qua route ảnh lớp sẵn có (/api/media/upload — soi magic bytes) rồi gửi duyệt; ảnh được duyệt tự vào phiếu
 *     nhận xét buổi của các em đã gắn.
 *  2. Phản hồi của phụ huynh sau buổi (cảm xúc + ghi chú) — chỉ đọc.
 * Không đụng tới luồng điểm danh / phiếu / hoàn tất.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, Loader2, TriangleAlert, X } from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";

const MAX_EDGE = 1600;

/** Thu nhỏ ảnh camera (thường 4–8 MB) về cạnh dài 1600px JPEG trước khi tải — nhanh trên 4G; lỗi thì giữ tệp gốc */
async function shrink(file: File): Promise<File> {
  try {
    if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") return file;
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1_500_000) { bmp.close(); return file; }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) { bmp.close(); return file; }
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function SessionExtras({ sessionId, isFuture, sessionDate }: { sessionId: string; isFuture: boolean; sessionDate: string }) {
  const trpc = useTRPC();
  const q = useQuery({ ...trpc.teacher.sessionExtras.queryOptions({ sessionId }), retry: false });
  if (!q.data) return null;
  const d = q.data;
  return (
    <>
      {d.photo.allowed && !isFuture && <QuickPhoto sessionId={sessionId} sessionDate={sessionDate} roster={d.photo.roster} counts={d.photo.counts} />}
      <section id="phan-hoi-ph" className="card scroll-mt-20 space-y-2 p-4" aria-label="Phản hồi của phụ huynh">
        <h2 className="font-bold">Phản hồi của phụ huynh <span className="text-[15px] font-normal text-ink-400">({d.reactions.length})</span></h2>
        {d.reactions.length === 0 ? (
          <p className="text-[15px] text-ink-600">Phụ huynh thả cảm xúc trên phiếu nhận xét sau buổi — phản hồi sẽ hiện tại đây.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {d.reactions.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-2">
                <span className="text-[22px] leading-none" role="img" aria-label={r.reactionLabel}>{r.emoji}</span>
                <div className="min-w-0 flex-1 text-[15px]">
                  <div className="font-semibold">{r.studentName} <span className="font-normal text-ink-600">· {r.reactionLabel}</span></div>
                  {r.note && <p className="text-ink-900">“{r.note}”</p>}
                  {r.reaction === "concern" && <p className="text-[13px] text-accent-700">{r.handled ? "CSKH đã phản hồi phụ huynh" : "Đã chuyển CSKH gọi lại trong 24 giờ"}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function QuickPhoto({ sessionId, sessionDate, roster, counts }: {
  sessionId: string; sessionDate: string;
  roster: { studentId: string; fullName: string; nickname: string | null; consent: boolean }[];
  counts: { library: number; pending: number; approved: number; rejected: number };
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [tagged, setTagged] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => { for (const u of previews) URL.revokeObjectURL(u); }, [previews]);
  const submit = useMutation(trpc.learning.submitMedia.mutationOptions());

  const allowed = roster.filter((r) => r.consent);
  const blocked = roster.filter((r) => !r.consent);
  const toggle = (id: string) => setTagged((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  const pick = async (list: FileList | null) => {
    if (!list || !list.length) return;
    setMsg(null);
    const shrunk = await Promise.all(Array.from(list).slice(0, 20).map(shrink));
    setFiles((f) => [...f, ...shrunk].slice(0, 20));
    if (input.current) input.current.value = "";
  };

  const upload = async () => {
    if (!files.length || !tagged.length) return;
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("sessionId", sessionId);
      fd.set("takenAt", sessionDate);
      fd.set("tagged", JSON.stringify(tagged));
      if (caption.trim()) fd.set("caption", caption.trim().slice(0, 200));
      for (const f of files) fd.append("files", f);
      const r = await fetch("/api/media/upload", { method: "POST", body: fd });
      const j = (await r.json()) as { ok: boolean; uploaded?: number; error?: string; results?: { ok: boolean; id?: string; error?: string }[] };
      const ids = (j.results ?? []).filter((x) => x.ok && x.id).map((x) => x.id!);
      if (!j.ok || !ids.length) throw new Error(j.error ?? j.results?.find((x) => !x.ok)?.error ?? "Không tải được ảnh");
      const s = await submit.mutateAsync({ ids });
      const failed = (j.results ?? []).filter((x) => !x.ok).length;
      setMsg({ ok: true, text: `Đã tải ${ids.length} ảnh và gửi duyệt (${s.ok} ảnh)${failed ? ` · ${failed} ảnh lỗi` : ""}. Ảnh được duyệt sẽ tự vào phiếu nhận xét của ${tagged.length} em đã gắn.` });
      setFiles([]);
      setCaption("");
      qc.invalidateQueries({ queryKey: trpc.teacher.sessionExtras.queryKey({ sessionId }) });
      qc.invalidateQueries({ queryKey: trpc.academics.evaluations.board.queryKey({ sessionId }) });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy(false);
  };

  return (
    <section className="card space-y-3 p-4" aria-label="Chụp và gắn ảnh">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold">Ảnh buổi học</h2>
        <span className="text-[13px] text-ink-600">{counts.pending} chờ duyệt · {counts.approved} đã duyệt</span>
      </div>
      <input ref={input} type="file" accept="image/*" capture="environment" multiple className="sr-only" id={`chup-${sessionId}`} onChange={(e) => void pick(e.target.files)} />
      <label htmlFor={`chup-${sessionId}`} className="btn-primary min-h-12 w-full cursor-pointer">
        <Camera className="h-5 w-5" aria-hidden /> {files.length ? "Chụp thêm ảnh" : "Chụp ảnh"}
      </label>
      {files.length > 0 && (
        <ul className="grid grid-cols-4 gap-2" aria-label="Ảnh đã chọn">
          {previews.map((u, i) => (
            <li key={u} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt={`Ảnh ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />
              <button type="button" aria-label={`Bỏ ảnh ${i + 1}`} onClick={() => setFiles((f) => f.filter((_, k) => k !== i))} className="absolute -right-1 -top-1 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[15px] font-semibold">Gắn học viên trong ảnh</span>
          {allowed.length > 0 && (
            <button type="button" className="min-h-11 px-1 text-[15px] font-semibold text-brand-600" onClick={() => setTagged(tagged.length === allowed.length ? [] : allowed.map((r) => r.studentId))}>
              {tagged.length === allowed.length ? "Bỏ chọn" : `Chọn cả ${allowed.length} em`}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {allowed.map((r) => {
            const on = tagged.includes(r.studentId);
            return (
              <button key={r.studentId} type="button" aria-pressed={on} onClick={() => toggle(r.studentId)}
                className={`inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-[15px] ${on ? "border-brand-600 bg-brand-600 text-white" : "border-black/10 bg-white"}`}>
                {on && <Check className="h-4 w-4" aria-hidden />}{r.nickname || r.fullName}
              </button>
            );
          })}
        </div>
        {blocked.length > 0 && (
          <p className="mt-2 flex items-start gap-1 rounded-lg bg-amber-50 p-2 text-[13px] text-amber-900">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>Chưa đồng ý đăng ảnh — <b>không gắn, tránh chụp rõ mặt</b>: {blocked.map((r) => r.fullName).join(", ")}</span>
          </p>
        )}
      </div>
      <input className="input" maxLength={200} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Chú thích (tuỳ chọn): Các con thử robot trên sa bàn" />
      <button type="button" className="btn-primary min-h-11 w-full" disabled={busy || !files.length || !tagged.length} onClick={upload}>
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Đang tải…</> : `Tải ${files.length || ""} ảnh & gửi duyệt`}
      </button>
      {!tagged.length && files.length > 0 && <p className="text-[13px] text-ink-600">Chọn ít nhất một em để ảnh vào phiếu nhận xét.</p>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-lg p-2 text-[15px] ${msg.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-800"}`}>{msg.text}</p>}
    </section>
  );
}
