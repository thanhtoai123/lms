"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { POST_CATEGORIES, POST_CATEGORY_VI, renderMarkdown, slugify, readingMinutes, type PostCategory, type PostStatus } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";
import { ImageUpload } from "@/components/image-upload";

export type PostDraft = { id?: string; title: string; slug: string; excerpt: string; body: string; coverImage: string; category: PostCategory; seoTitle: string; seoDescription: string; status?: PostStatus; publishAt?: string | null };

const toLocal = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function PostEditor({ initial, canEdit }: { initial: PostDraft; canEdit: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [v, setV] = useState<PostDraft>(initial);
  const [slugTouched, setSlugTouched] = useState(!!initial.id);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [when, setWhen] = useState(toLocal(initial.publishAt));
  const html = useMemo(() => renderMarkdown(v.body), [v.body]);
  const save = useMutation(trpc.site.upsertPost.mutationOptions({ onSuccess: (r) => { if (!initial.id) router.push(`/news/${r.id}`); else router.refresh(); } }));
  const act = useMutation(trpc.site.postAction.mutationOptions({ onSuccess: () => router.refresh() }));
  const set = <K extends keyof PostDraft>(k: K, x: PostDraft[K]) => setV((s) => ({ ...s, [k]: x }));
  const status = initial.status ?? "draft";
  const payload = () => ({ id: v.id, title: v.title, slug: v.slug || null, excerpt: v.excerpt || null, body: v.body, coverImage: v.coverImage || null, category: v.category, seoTitle: v.seoTitle || null, seoDescription: v.seoDescription || null });
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <input className="input text-lg font-semibold" placeholder="Tiêu đề bài viết" value={v.title} disabled={!canEdit} maxLength={150}
          onChange={(e) => { const t = e.target.value; setV((s) => ({ ...s, title: t, slug: slugTouched ? s.slug : slugify(t) })); }} />
        <div className="flex items-center gap-1 text-xs"><span className="text-ink-400">/tin-tuc/</span><input className="input !py-1 font-mono text-xs" value={v.slug} disabled={!canEdit || status === "published"} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value.toLowerCase()); }} /></div>
        <textarea className="input" rows={2} placeholder="Tóm tắt (hiện ở danh sách, ≤ 300 ký tự)" value={v.excerpt} disabled={!canEdit} maxLength={300} onChange={(e) => set("excerpt", e.target.value)} />
        <div className="flex gap-1 border-b border-black/10 text-sm">
          {(["write", "preview"] as const).map((t) => <button key={t} type="button" onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3 py-1.5 ${tab === t ? "border-brand-600 font-semibold text-brand-600" : "border-transparent"}`}>{t === "write" ? "Soạn" : "Xem trước"}</button>)}
          <span className="ml-auto self-center text-xs text-ink-400">{v.body.length.toLocaleString("vi-VN")} ký tự · {readingMinutes(v.body)} phút đọc</span>
        </div>
        {tab === "write"
          ? <textarea className="input min-h-[420px] font-mono text-sm" value={v.body} disabled={!canEdit} onChange={(e) => set("body", e.target.value)} placeholder={"## Tiêu đề mục\nĐoạn văn với **chữ đậm**, *nghiêng*, [liên kết](https://satarobo.vn)\n\n- gạch đầu dòng\n\n![mô tả ảnh](/api/public/site-media/...)"} />
          : <div className="sr-prose card min-h-[420px] p-4" dangerouslySetInnerHTML={{ __html: html }} />}
        <p className="text-xs text-ink-400">Hỗ trợ: ## tiêu đề, **đậm**, *nghiêng*, - danh sách, 1. danh sách số, &gt; trích dẫn, [chữ](https://…), ![ảnh](url). Mã HTML bị vô hiệu hoá.</p>
      </div>
      <aside className="space-y-3">
        <div className="card space-y-2 p-3 text-sm">
          <label className="block">Chuyên mục<select className="input mt-1" value={v.category} disabled={!canEdit} onChange={(e) => set("category", e.target.value as PostCategory)}>{POST_CATEGORIES.map((c) => <option key={c} value={c}>{POST_CATEGORY_VI[c]}</option>)}</select></label>
          {canEdit ? <ImageUpload label="Ảnh bìa" value={v.coverImage} onChange={(u) => set("coverImage", u)} /> : v.coverImage && <img src={v.coverImage} alt="" className="rounded-lg" />}
        </div>
        <div className="card space-y-2 p-3 text-sm">
          <div className="font-semibold">SEO</div>
          <label className="block text-xs">Tiêu đề SEO ({v.seoTitle.length}/70)<input className="input mt-1" value={v.seoTitle} maxLength={70} disabled={!canEdit} onChange={(e) => set("seoTitle", e.target.value)} placeholder={v.title} /></label>
          <label className="block text-xs">Mô tả SEO ({v.seoDescription.length}/170)<textarea className="input mt-1" rows={3} value={v.seoDescription} maxLength={170} disabled={!canEdit} onChange={(e) => set("seoDescription", e.target.value)} placeholder={v.excerpt} /></label>
          <div className="rounded-lg border border-black/10 p-2 text-xs">
            <div className="truncate text-blue-700">{v.seoTitle || v.title || "Tiêu đề"}</div>
            <div className="text-green-700">satarobo.vn/tin-tuc/{v.slug}</div>
            <div className="line-clamp-2 text-ink-600">{v.seoDescription || v.excerpt}</div>
          </div>
        </div>
        {canEdit && (
          <div className="card space-y-2 p-3 text-sm">
            <button type="button" className="btn-primary w-full" disabled={save.isPending} onClick={() => save.mutate(payload())}>{initial.id ? "Lưu thay đổi" : "Lưu nháp"}</button>
            {save.error && <p className="text-xs text-red-700">{save.error.message}</p>}
            {save.isSuccess && initial.id && <p className="text-xs text-green-700">Đã lưu.</p>}
            {initial.id && (
              <>
                <div className="text-xs text-ink-400">Trạng thái: {status}</div>
                {status !== "published" && status !== "archived" && <button type="button" className="btn-ghost w-full" disabled={act.isPending} onClick={() => act.mutate({ id: initial.id!, action: "publish" })}>Đăng ngay</button>}
                {(status === "draft" || status === "scheduled") && (
                  <div className="flex gap-1">
                    <input type="datetime-local" className="input !py-1 text-xs" value={when} onChange={(e) => setWhen(e.target.value)} />
                    <button type="button" className="btn-ghost !px-2 text-xs" disabled={!when || act.isPending} onClick={() => act.mutate({ id: initial.id!, action: "schedule", publishAt: new Date(when).toISOString() })}>Hẹn giờ</button>
                  </div>
                )}
                {(status === "published" || status === "scheduled") && <button type="button" className="btn-ghost w-full" disabled={act.isPending} onClick={() => act.mutate({ id: initial.id!, action: "unpublish" })}>Về nháp</button>}
                {status !== "archived" ? <button type="button" className="btn-ghost w-full text-red-700" disabled={act.isPending} onClick={() => act.mutate({ id: initial.id!, action: "archive" })}>Gỡ bài</button>
                  : <button type="button" className="btn-ghost w-full" disabled={act.isPending} onClick={() => act.mutate({ id: initial.id!, action: "restore" })}>Khôi phục về nháp</button>}
                {act.error && <p className="text-xs text-red-700">{act.error.message}</p>}
                {status === "published" && <a href={`/tin-tuc/${v.slug}`} target="_blank" rel="noopener" className="block text-center text-xs text-brand-600">Xem bài trên trang tin →</a>}
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
