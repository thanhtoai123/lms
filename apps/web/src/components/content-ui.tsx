"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DOC_KINDS, DOC_KIND_VI, DOC_CATEGORIES, DOC_CATEGORY_VI, DOC_AUDIENCES, DOC_AUDIENCE_VI, type DocKind, type DocCategory, type DocAudience } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

export const fmtSize = (n: number | null | undefined) => (n == null ? "" : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const DOC_STATUS_CHIP: Record<string, string> = { draft: "bg-slate-100 text-slate-600", published: "bg-green-100 text-green-800", archived: "bg-amber-100 text-amber-800" };

/** Mở / tải tài liệu (ghi nhật ký, lấy URL có chữ ký) */
export function OpenDocButton({ id, kind, label, version, className }: { id: string; kind: DocKind; label?: string; version?: number; className?: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.content.openDocument.mutationOptions({
    onSuccess: (r) => { window.open(r.url, "_blank", "noopener"); },
  }));
  if (kind === "scorm" && !version) return <button type="button" className={className ?? "text-xs text-brand-600"} onClick={() => router.push(`/scorm/${id}`)}>{label ?? "Học"}</button>;
  return (
    <span>
      <button type="button" className={className ?? "text-xs text-brand-600"} disabled={m.isPending} onClick={() => m.mutate({ id, version })}>{label ?? (kind === "link" ? "Mở" : "Tải")}</button>
      {m.error && <span className="block text-xs text-red-700">{m.error.message}</span>}
    </span>
  );
}

type DocDraft = { id?: string; title: string; description: string | null; kind: DocKind; category: DocCategory; audience: DocAudience; courseId: string; lessonId: string | null; url: string | null; tags: string[] };

export function DocForm({ doc, courses }: { doc?: DocDraft; courses: { id: string; code: string; name: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<DocDraft>(doc ?? { title: "", description: "", kind: "file", category: "lesson_plan", audience: "teacher", courseId: courses[0]?.id ?? "", lessonId: null, url: "", tags: [] });
  const [tags, setTags] = useState((doc?.tags ?? []).join(", "));
  const lessonsQ = useQuery({ ...trpc.content.lessonOptions.queryOptions({ courseId: v.courseId }), enabled: open && !!v.courseId });
  const m = useMutation(trpc.content.upsertDocument.mutationOptions({ onSuccess: (r) => { setOpen(false); if (doc) router.refresh(); else router.push(`/documents/${r.id}`); } }));
  const set = <K extends keyof DocDraft>(k: K, x: DocDraft[K]) => setV({ ...v, [k]: x });
  if (!open) return <button type="button" className={doc ? "btn-ghost" : "btn-primary"} onClick={() => setOpen(true)}>{doc ? "Sửa thông tin" : "+ Thêm tài liệu"}</button>;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <form className="card mt-10 grid w-full max-w-xl grid-cols-2 gap-2 p-4 text-sm" onSubmit={(e) => {
        e.preventDefault();
        m.mutate({ ...v, description: v.description || null, url: v.kind === "link" ? v.url : null, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) });
      }}>
        <h3 className="col-span-2 font-semibold">{doc ? "Sửa tài liệu" : "Thêm tài liệu"}</h3>
        <label className="col-span-2">Tiêu đề<input className="input mt-1 w-full" value={v.title} onChange={(e) => set("title", e.target.value)} maxLength={200} required /></label>
        <label>Loại<select className="input mt-1 w-full" value={v.kind} disabled={!!doc} onChange={(e) => set("kind", e.target.value as DocKind)}>{DOC_KINDS.map((k) => <option key={k} value={k}>{DOC_KIND_VI[k]}</option>)}</select></label>
        <label>Nhóm<select className="input mt-1 w-full" value={v.category} onChange={(e) => set("category", e.target.value as DocCategory)}>{DOC_CATEGORIES.map((k) => <option key={k} value={k}>{DOC_CATEGORY_VI[k]}</option>)}</select></label>
        <label>Khoá học<select className="input mt-1 w-full" value={v.courseId} onChange={(e) => setV({ ...v, courseId: e.target.value, lessonId: null })}>{courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select></label>
        <label>Bài học<select className="input mt-1 w-full" value={v.lessonId ?? ""} onChange={(e) => set("lessonId", e.target.value || null)}><option value="">Chung cho cả khoá</option>{(lessonsQ.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.curriculumStatus === "draft" ? "[nháp] " : ""}Bài {l.sequenceNo}: {l.title}</option>)}</select></label>
        <label className="col-span-2">Đối tượng xem<select className="input mt-1 w-full" value={v.audience} onChange={(e) => set("audience", e.target.value as DocAudience)}>{DOC_AUDIENCES.map((k) => <option key={k} value={k}>{DOC_AUDIENCE_VI[k]}</option>)}</select></label>
        {v.kind === "link" && <label className="col-span-2">Liên kết (https://)<input className="input mt-1 w-full" value={v.url ?? ""} onChange={(e) => set("url", e.target.value)} maxLength={1000} required /></label>}
        <label className="col-span-2">Mô tả<textarea className="input mt-1 w-full" rows={3} value={v.description ?? ""} onChange={(e) => set("description", e.target.value)} maxLength={2000} /></label>
        <label className="col-span-2">Thẻ (cách nhau dấu phẩy)<input className="input mt-1 w-full" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="cảm biến, scratch" /></label>
        {v.kind !== "link" && !doc && <p className="col-span-2 text-xs text-ink-400">Lưu xong sẽ chuyển sang trang tài liệu để tải tệp{v.kind === "scorm" ? " (.zip SCORM 1.2 / 2004)" : ""}.</p>}
        {m.error && <p className="col-span-2 text-red-700">{m.error.message}</p>}
        <div className="col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button><button className="btn-primary" disabled={m.isPending}>Lưu</button></div>
      </form>
    </div>
  );
}

export function UploadVersion({ documentId, kind }: { documentId: string; kind: DocKind }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.set("documentId", documentId);
    fd.set("note", note);
    fd.set("file", file);
    try {
      const r = await fetch("/api/content/upload", { method: "POST", body: fd });
      const j = (await r.json()) as { ok: boolean; error?: string; version?: number; scorm?: { title: string; files: number; version: string } | null };
      if (!j.ok) setMsg({ ok: false, text: j.error ?? "Lỗi tải lên" });
      else {
        setMsg({ ok: true, text: `Đã lưu phiên bản ${j.version}${j.scorm ? ` — SCORM ${j.scorm.version}, ${j.scorm.files} tệp, "${j.scorm.title}"` : ""}` });
        setFile(null);
        setNote("");
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "Không kết nối được máy chủ" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-black/20 p-3 text-sm">
      <div className="font-medium">Tải phiên bản mới</div>
      <input type="file" accept={kind === "scorm" ? ".zip" : ".pdf,.pptx,.docx,.xlsx,.png,.jpg,.jpeg,.webp,.mp4,.zip,.sb3,.txt"} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <input className="input w-full" placeholder="Ghi chú thay đổi (tuỳ chọn)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      <button type="button" className="btn-primary" disabled={!file || busy} onClick={submit}>{busy ? "Đang tải…" : "Tải lên"}</button>
      {msg && <p className={msg.ok ? "text-green-700" : "text-red-700"}>{msg.text}</p>}
      <p className="text-xs text-ink-400">{kind === "scorm" ? "Gói .zip có imsmanifest.xml, tối đa 200MB." : "PDF, PowerPoint, Word, Excel, ảnh, MP4, ZIP, Scratch (.sb3) — tối đa 50MB."} Bản cũ vẫn được giữ.</p>
    </div>
  );
}

export function DocStatusButtons({ id, status }: { id: string; status: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.content.setDocumentStatus.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <span className="flex flex-wrap items-center gap-2">
      {status !== "published" && <button type="button" className="btn-primary" disabled={m.isPending} onClick={() => m.mutate({ id, status: "published" })}>Phát hành</button>}
      {status === "published" && <button type="button" className="btn-ghost" disabled={m.isPending} onClick={() => m.mutate({ id, status: "draft" })}>Về nháp</button>}
      {status !== "archived" && <button type="button" className="btn-ghost" disabled={m.isPending} onClick={() => m.mutate({ id, status: "archived" })}>Lưu trữ</button>}
      {m.error && <span className="text-sm text-red-700">{m.error.message}</span>}
    </span>
  );
}
