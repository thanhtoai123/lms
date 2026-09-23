"use client";

/**
 * Các mảnh tương tác của trang "SCORM / Giáo án buổi học".
 * Trang chính dựng ở máy chủ; ở đây chỉ những gì cần trình duyệt: chọn khoá / buổi,
 * đẩy tệp kèm phần trăm, và các nút một chạm (dọn bản lỗi, gỡ, dùng lại bản cũ).
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

type Opt = { id: string; label: string };

/** Ô chọn tự đi luôn khi đổi (không có nút "Lọc" — một chạm) */
export function PlanPicker({ name, value, options, placeholder, otherName, otherValue }: {
  name: "khoa" | "buoi";
  value: string;
  options: Opt[];
  placeholder: string;
  otherName?: "khoa";
  otherValue?: string;
}) {
  const router = useRouter();
  return (
    <select
      className="input w-full"
      value={value}
      aria-label={placeholder}
      onChange={(e) => {
        const v = e.target.value;
        const q = new URLSearchParams();
        if (otherName && otherValue) q.set(otherName, otherValue);
        if (v) q.set(name, v);
        router.push(q.size ? `/scorm?${q.toString()}` : "/scorm");
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
}

/**
 * Đẩy & thay giáo án. Dùng XMLHttpRequest thay vì fetch để có phần trăm tải lên:
 * gói SCORM vài chục MB trên mạng trung tâm mất cả phút, không có thanh tiến độ thì người dùng
 * tưởng máy treo và bấm lại — tạo thêm bản kẹt.
 */
export function PlanUpload({ lessonId, hasPlan }: { lessonId: string; hasPlan: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (!file) return;
    setMsg(null);
    setPct(0);
    const fd = new FormData();
    fd.set("lessonId", lessonId);
    fd.set("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/content/giao-an");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      setPct(null);
      let j: { ok?: boolean; error?: string; version?: number; kind?: string; scorm?: { files: number; version: string } | null } = {};
      try { j = JSON.parse(xhr.responseText) as typeof j; } catch { /* phản hồi không phải JSON */ }
      if (!j.ok) setMsg({ ok: false, text: j.error ?? "Không tải lên được" });
      else {
        setMsg({ ok: true, text: `Đã thay giáo án (bản ${j.version})${j.scorm ? ` — SCORM ${j.scorm.version}, ${j.scorm.files} tệp` : ""}` });
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      }
    };
    xhr.onerror = () => { setPct(null); setMsg({ ok: false, text: "Mất kết nối khi tải lên" }); };
    xhr.send(fd);
  };

  const busy = pct !== null;
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-black/20 p-3 text-sm">
      <div className="font-semibold uppercase tracking-wide text-ink-600">{hasPlan ? "Thay giáo án (đẩy bản mới)" : "Tải giáo án cho buổi này"}</div>
      <p className="text-xs text-ink-600">Nhận <b>.pdf</b> (slide) hoặc <b>.zip</b> (gói SCORM) — cả hai chiếu trong cùng một khung xem.</p>
      {hasPlan && <p className="text-xs text-amber-700">Đẩy bản mới sẽ tự thay giáo án hiện tại sau khi xử lý xong; bản liền trước vẫn giữ để dùng lại.</p>}
      <input ref={inputRef} type="file" accept=".pdf,.zip" disabled={busy} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setMsg(null); }} />
      {busy && (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded bg-black/10"><div className="h-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} /></div>
          <p className="text-xs text-ink-600">{pct! < 100 ? `Đang tải lên ${pct}%` : "Đang xử lý tệp trên máy chủ…"}</p>
        </div>
      )}
      <button type="button" className="btn-primary" disabled={!file || busy} onClick={submit}>{busy ? "Đang xử lý…" : "Đẩy & thay giáo án"}</button>
      {msg && <p className={msg.ok ? "text-green-700" : "text-red-700"}>{msg.text}</p>}
    </div>
  );
}

/** Nút một chạm: dọn bản lỗi / gỡ giáo án / dùng lại bản cũ */
export function PlanActions({ lessonId, canClean, canRemove, restoreVersion }: {
  lessonId: string;
  canClean: boolean;
  canRemove: boolean;
  restoreVersion: number | null;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const done = () => router.refresh();
  const clean = useMutation(trpc.content.planCleanFailed.mutationOptions({ onSuccess: done }));
  const remove = useMutation(trpc.content.planRemove.mutationOptions({ onSuccess: done }));
  const restore = useMutation(trpc.content.planRestore.mutationOptions({ onSuccess: done }));
  const busy = clean.isPending || remove.isPending || restore.isPending;
  const err = clean.error ?? remove.error ?? restore.error;
  return (
    <span className="flex flex-wrap items-center gap-2">
      {canClean && <button type="button" className="btn-ghost !text-red-700" disabled={busy} onClick={() => clean.mutate({ lessonId })}>Dọn bản lỗi</button>}
      {restoreVersion !== null && <button type="button" className="btn-ghost" disabled={busy} onClick={() => restore.mutate({ lessonId, version: restoreVersion })}>Dùng lại bản {restoreVersion}</button>}
      {canRemove && (
        <button
          type="button"
          className="btn-ghost !text-red-700"
          disabled={busy}
          onClick={() => { if (confirm("Gỡ giáo án của buổi này? Tệp sẽ bị xoá.")) remove.mutate({ lessonId }); }}
        >
          Gỡ giáo án
        </button>
      )}
      {err && <span className="text-xs text-red-700">{err.message}</span>}
    </span>
  );
}
