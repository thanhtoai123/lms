"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { renderMarkdown, type BlockField } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { ImageUpload } from "@/components/image-upload";

type Page = { key: string; label: string; path: string; fields: BlockField[]; data: Record<string, string>; version: number; updatedAt: string | null; updatedBy: string | null };

export function BlockEditor({ page, history, canEdit }: { page: Page; history: { version: number; createdAt: string; byName: string | null }[]; canEdit: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>(page.data);
  const [dirty, setDirty] = useState(false);
  const save = useMutation(trpc.site.saveBlock.mutationOptions({ onSuccess: () => { setDirty(false); router.refresh(); } }));
  const restore = useMutation(trpc.site.restoreBlock.mutationOptions({ onSuccess: () => router.refresh() }));
  const set = (k: string, x: string) => { setDirty(true); setV((s) => ({ ...s, [k]: x })); };
  const fmt = (d: string) => new Date(d).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <form className="card space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); save.mutate({ page: page.key, data: v, version: page.version }); }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{page.label} <span className="font-mono text-xs font-normal text-ink-400">{page.path}</span></h2>
          <span className="text-xs text-ink-400">{page.version ? `Phiên bản ${page.version} · ${page.updatedAt ? fmt(page.updatedAt) : ""} · ${page.updatedBy ?? ""}` : "Chưa có nội dung"}</span>
        </div>
        {page.fields.map((f) => (
          <div key={f.key}>
            {f.type === "image" ? (canEdit ? <ImageUpload label={f.label} value={v[f.key] ?? ""} onChange={(u) => set(f.key, u)} /> : v[f.key] ? <img src={v[f.key]} alt="" className="max-h-32 rounded" /> : null) : (
              <label className="block text-sm">
                {f.label}{f.required && <span className="text-red-700"> *</span>} <span className="text-xs text-ink-400">({(v[f.key] ?? "").length}/{f.max})</span>
                {f.type === "textarea"
                  ? <textarea className="input mt-1" rows={f.max > 1000 ? 10 : 3} maxLength={f.max} value={v[f.key] ?? ""} disabled={!canEdit} onChange={(e) => set(f.key, e.target.value)} />
                  : <input className="input mt-1" maxLength={f.max} value={v[f.key] ?? ""} disabled={!canEdit} onChange={(e) => set(f.key, e.target.value)} placeholder={f.type === "url" ? "https://… hoặc /duong-dan" : ""} />}
              </label>
            )}
            {page.key === "about" && f.key === "body" && v.body && <div className="sr-prose mt-2 rounded-lg bg-black/5 p-3 text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(v.body) }} />}
          </div>
        ))}
        {canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={save.isPending || !dirty}>Lưu & cập nhật website</button>
            <a href={page.path} target="_blank" rel="noopener" className="text-sm text-brand-600">Xem trang →</a>
            {dirty && <span className="text-xs text-amber-700">Chưa lưu</span>}
            {save.error && <span className="text-sm text-red-700">{save.error.message}</span>}
            {save.isSuccess && !dirty && <span className="text-sm text-green-700">Đã lưu — website đã có nội dung mới.</span>}
          </div>
        )}
      </form>
      <aside className="card p-3 text-sm">
        <h3 className="mb-2 font-semibold">Lịch sử</h3>
        {history.length === 0 ? <p className="text-xs text-ink-400">Chưa có.</p> : (
          <ul className="space-y-1 text-xs">
            {history.map((h) => (
              <li key={h.version} className="flex items-center justify-between gap-2">
                <span>v{h.version} · {fmt(h.createdAt)} · {h.byName ?? "—"}</span>
                {canEdit && h.version !== page.version && <button type="button" className="text-brand-600" disabled={restore.isPending} onClick={() => restore.mutate({ page: page.key, version: h.version })}>Khôi phục</button>}
              </li>
            ))}
          </ul>
        )}
        {restore.error && <p className="text-xs text-red-700">{restore.error.message}</p>}
      </aside>
    </div>
  );
}
