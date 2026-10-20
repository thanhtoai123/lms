"use client";

/**
 * HỌC LIỆU BUỔI — tài liệu đính kèm của một buổi học (ngoài giáo án SCORM / PDF):
 * Word, PDF, ảnh bài tập, slide, video, mã chương trình mẫu (.sb3)… hoặc liên kết.
 * Tải nhiều tệp một lần: mỗi tệp thành một tài liệu gắn đúng buổi, nhóm chọn sẵn theo đuôi tệp, có thể phát hành ngay.
 * Giáo viên thấy tài liệu đã phát hành trong "Chuẩn bị buổi dạy"; tài liệu dành cho học viên đính kèm được khi giao bài tập về nhà.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  DOC_AUDIENCES, DOC_AUDIENCE_VI, DOC_CATEGORIES, DOC_CATEGORY_VI, DOC_FILE_TYPES, DOC_MAX_BYTES, guessDocCategory, titleFromFileName, validateDocFile,
  type DocAudience, type DocCategory, type DocKind,
} from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { OpenDocButton } from "@/components/content-ui";

export type LessonDoc = {
  id: string; title: string; kind: DocKind; category: DocCategory; categoryLabel: string; audience: DocAudience; status: string; statusLabel: string;
  fileName: string | null; sizeBytes: number | null; currentVersion: number; url: string | null; hasContent: boolean;
};

const CATS = DOC_CATEGORIES.filter((c) => c !== "lesson_plan");
const ACCEPT = Object.keys(DOC_FILE_TYPES).map((e) => `.${e}`).join(",");
const size = (n: number | null) => (n == null ? "" : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const STATUS_CHIP: Record<string, string> = { published: "bg-green-600/10 text-green-700", draft: "bg-amber-100 text-amber-800", archived: "bg-black/5 text-ink-600" };

type Row = { file: File; title: string; category: DocCategory; error: string | null; state: "wait" | "up" | "ok" | "fail"; msg?: string };

export function LessonMaterials({ courseId, lessonId, lessonLabel, docs, canEdit }: { courseId: string; lessonId: string; lessonLabel: string; docs: LessonDoc[]; canEdit: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [audience, setAudience] = useState<DocAudience>("teacher");
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [link, setLink] = useState<{ title: string; url: string } | null>(null);

  const upsert = useMutation(trpc.content.upsertDocument.mutationOptions());
  const status = useMutation(trpc.content.setDocumentStatus.mutationOptions({ onSuccess: () => router.refresh() }));

  const add = (files: FileList | File[]) => {
    const next = Array.from(files).map<Row>((f) => ({ file: f, title: titleFromFileName(f.name), category: guessDocCategory(f.name), error: validateDocFile(f.name, f.size, "file"), state: "wait" }));
    setRows((r) => [...r.filter((x) => x.state !== "ok"), ...next].slice(0, 20));
  };
  const patch = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const uploadAll = async () => {
    setBusy(true);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      if (r.error || r.state === "ok") continue;
      patch(i, { state: "up", msg: undefined });
      try {
        const d = await upsert.mutateAsync({ title: r.title.trim() || titleFromFileName(r.file.name), kind: "file", category: r.category, audience, courseId, lessonId });
        const fd = new FormData();
        fd.set("documentId", d.id);
        fd.set("note", "");
        fd.set("file", r.file);
        const res = await fetch("/api/content/upload", { method: "POST", body: fd });
        const j = (await res.json().catch(() => ({ ok: false, error: "Máy chủ trả lỗi" }))) as { ok: boolean; error?: string };
        if (!j.ok) throw new Error(j.error ?? "Lỗi tải lên");
        if (publish) await status.mutateAsync({ id: d.id, status: "published" });
        patch(i, { state: "ok", msg: publish ? "Đã tải và phát hành" : "Đã tải (nháp)" });
      } catch (e) {
        patch(i, { state: "fail", msg: (e as Error).message });
      }
    }
    setBusy(false);
    router.refresh();
  };

  const addLink = async () => {
    if (!link) return;
    setBusy(true);
    try {
      const d = await upsert.mutateAsync({ title: link.title.trim() || "Liên kết", kind: "link", category: "video", audience, courseId, lessonId, url: link.url.trim() });
      if (publish) await status.mutateAsync({ id: d.id, status: "published" });
      setLink(null);
      router.refresh();
    } catch {
      /* lỗi hiện ở upsert.error */
    } finally {
      setBusy(false);
    }
  };

  const shown = docs.filter((d) => showArchived || d.status !== "archived");
  const archived = docs.length - docs.filter((d) => d.status !== "archived").length;
  const pending = rows.filter((r) => !r.error && r.state !== "ok").length;

  return (
    <section className="card space-y-3 p-4" aria-label="Tài liệu đính kèm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Tài liệu đính kèm — {lessonLabel}</h2>
          <p className="text-xs text-ink-600">Word, PDF, ảnh bài tập, slide, video, mã chương trình mẫu (.sb3)… Mỗi tệp một tài liệu, giữ được nhiều phiên bản.</p>
        </div>
        {archived > 0 && (
          <label className="flex items-center gap-1 text-xs text-ink-600"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Hiện {archived} tài liệu đã lưu trữ</label>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/20 p-3 text-sm text-ink-600">Buổi này chưa có tài liệu đính kèm.</p>
      ) : (
        <ul className="divide-y divide-black/5 rounded-lg border border-black/10">
          {shown.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 p-2 text-sm">
              <div className="min-w-0 flex-1">
                <Link href={`/documents/${d.id}`} className="font-medium text-ink-900 hover:underline">{d.title}</Link>
                <div className="flex flex-wrap items-center gap-1 text-xs text-ink-600">
                  <span className="chip bg-brand-600/10 text-brand-600">{d.categoryLabel}</span>
                  <span>{d.audience === "student" ? "Giáo viên + học viên" : "Chỉ giáo viên"}</span>
                  {d.fileName && <span>· {d.fileName}{d.sizeBytes ? ` · ${size(d.sizeBytes)}` : ""}{d.currentVersion > 1 ? ` · v${d.currentVersion}` : ""}</span>}
                  {d.kind === "link" && d.url && <span className="truncate">· {d.url}</span>}
                  {!d.hasContent && <span className="text-red-700">· chưa có tệp</span>}
                </div>
              </div>
              <span className={`chip ${STATUS_CHIP[d.status] ?? "bg-black/5"}`}>{d.statusLabel}</span>
              {d.hasContent && <OpenDocButton id={d.id} kind={d.kind} version={d.kind === "scorm" ? d.currentVersion : undefined} className="btn-ghost !py-1 text-xs" label={d.kind === "link" ? "Mở" : "Xem / tải"} />}
              {canEdit && d.status !== "published" && d.hasContent && <button type="button" className="btn-ghost !py-1 text-xs" disabled={status.isPending} onClick={() => status.mutate({ id: d.id, status: "published" })}>Phát hành</button>}
              {canEdit && d.status === "published" && <button type="button" className="btn-ghost !py-1 text-xs" disabled={status.isPending} onClick={() => status.mutate({ id: d.id, status: "draft" })}>Ẩn (về nháp)</button>}
              {canEdit && d.status !== "archived" && <button type="button" className="btn-ghost !py-1 text-xs" disabled={status.isPending} onClick={() => status.mutate({ id: d.id, status: "archived" })}>Lưu trữ</button>}
            </li>
          ))}
        </ul>
      )}
      {status.error && <p className="text-sm text-red-700">{status.error.message}</p>}

      {canEdit && (
        <div className="space-y-2 rounded-lg border border-dashed border-black/20 p-3 text-sm">
          <div
            role="button"
            tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) add(e.dataTransfer.files); }}
            className={`flex min-h-20 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-3 text-center ${drag ? "border-brand-600 bg-brand-600/5" : "border-black/10"}`}
          >
            <span className="font-medium">Kéo thả tệp vào đây hoặc bấm để chọn (nhiều tệp)</span>
            <span className="text-xs text-ink-600">Word, PDF, PowerPoint, Excel, ảnh (JPG, PNG, WEBP, GIF), MP4, MP3, ZIP, Scratch .sb3 — mỗi tệp tối đa {Math.round(DOC_MAX_BYTES / 1048576)}MB. Giáo án SCORM tải ở phần Giáo án phía trên.</span>
            <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
          </div>

          {rows.length > 0 && (
            <ul className="space-y-1">
              {rows.map((r, i) => (
                <li key={`${r.file.name}-${i}`} className="grid gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-[1fr_12rem_auto] sm:items-center">
                  <div className="min-w-0">
                    <input className="input w-full !py-1" value={r.title} maxLength={200} disabled={r.state !== "wait" && r.state !== "fail"} onChange={(e) => patch(i, { title: e.target.value })} aria-label={`Tiêu đề cho ${r.file.name}`} />
                    <div className="truncate text-xs text-ink-600">{r.file.name} · {size(r.file.size)}</div>
                  </div>
                  <select className="input !py-1" value={r.category} disabled={r.state !== "wait" && r.state !== "fail"} onChange={(e) => patch(i, { category: e.target.value as DocCategory })} aria-label="Nhóm tài liệu">
                    {CATS.map((c) => <option key={c} value={c}>{DOC_CATEGORY_VI[c]}</option>)}
                  </select>
                  <div className="flex items-center gap-2 text-xs">
                    {r.error ? <span className="text-red-700">{r.error}</span>
                      : r.state === "up" ? <span className="text-brand-600">Đang tải…</span>
                      : r.state === "ok" ? <span className="text-green-700">{r.msg}</span>
                      : r.state === "fail" ? <span className="text-red-700">{r.msg}</span>
                      : <span className="text-ink-600">Chờ tải</span>}
                    {(r.state === "wait" || r.state === "fail" || r.error) && !busy && <button type="button" className="text-ink-600 hover:text-red-700" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label={`Bỏ ${r.file.name}`}>✕</button>}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1 text-xs">Ai xem
              <select className="input !py-1" value={audience} onChange={(e) => setAudience(e.target.value as DocAudience)}>
                {DOC_AUDIENCES.map((a) => <option key={a} value={a}>{DOC_AUDIENCE_VI[a]}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> Phát hành ngay</label>
            <button type="button" className="btn-primary" disabled={busy || pending === 0} onClick={uploadAll}>{busy ? "Đang tải…" : pending ? `Tải lên ${pending} tệp` : "Tải lên"}</button>
            {!link && <button type="button" className="btn-ghost" onClick={() => setLink({ title: "", url: "" })}>+ Thêm liên kết (video, Scratch, web)</button>}
          </div>
          {link && (
            <div className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
              <input className="input" placeholder="Tiêu đề" value={link.title} maxLength={200} onChange={(e) => setLink({ ...link, title: e.target.value })} />
              <input className="input" placeholder="https://…" value={link.url} maxLength={1000} onChange={(e) => setLink({ ...link, url: e.target.value })} />
              <span className="flex gap-2">
                <button type="button" className="btn-primary" disabled={busy || !/^https:\/\//.test(link.url.trim())} onClick={addLink}>Lưu</button>
                <button type="button" className="btn-ghost" onClick={() => setLink(null)}>Huỷ</button>
              </span>
            </div>
          )}
          {upsert.error && <p className="text-red-700">{upsert.error.message}</p>}
          <p className="text-xs text-ink-600">Tài liệu đã phát hành hiện cho giáo viên trong Chuẩn bị buổi dạy. Chọn “{DOC_AUDIENCE_VI.student}” cho phiếu / ảnh bài tập muốn đính kèm khi giao bài tập về nhà.</p>
        </div>
      )}
    </section>
  );
}
