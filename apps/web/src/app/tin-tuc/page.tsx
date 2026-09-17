import Link from "next/link";
import { getDb } from "@satarobo/db";
import { publicPosts } from "@satarobo/api";
import { POST_CATEGORIES, POST_CATEGORY_VI, type PostCategory } from "@satarobo/core";
import { PublicShell } from "@/components/public-shell";
import { SiteTracker } from "@/components/site-tracker";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tin tức — Sata Robo", description: "Tin tức, sự kiện và câu chuyện học viên Sata Robo" };

export default async function NewsIndex({ searchParams }: { searchParams: Promise<{ c?: string; page?: string }> }) {
  const sp = await searchParams;
  const cat = POST_CATEGORIES.includes(sp.c as PostCategory) ? (sp.c as PostCategory) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const d = await publicPosts(getDb(), { category: cat, page });
  return (
    <PublicShell>
      <SiteTracker />
      <h1 className="text-2xl font-bold">Tin tức</h1>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <Link href="/tin-tuc" className={`chip ${!cat ? "bg-brand-600 text-white" : "bg-black/5"}`}>Tất cả</Link>
        {POST_CATEGORIES.map((c) => <Link key={c} href={`/tin-tuc?c=${c}`} className={`chip ${cat === c ? "bg-brand-600 text-white" : "bg-black/5"}`}>{POST_CATEGORY_VI[c]}</Link>)}
      </div>
      {d.items.length === 0 ? <p className="mt-8 text-center text-ink-400">Chưa có bài viết.</p> : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {d.items.map((p) => (
            <Link key={p.slug} href={`/tin-tuc/${p.slug}`} className="card overflow-hidden transition hover:shadow-md">
              {p.coverImage ? <img src={p.coverImage} alt="" className="aspect-video w-full object-cover" /> : <div className="grid aspect-video place-items-center bg-brand-50 text-3xl font-black text-brand-600">S</div>}
              <div className="space-y-1 p-4">
                <div className="text-xs text-ink-400">{p.categoryLabel} · {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString("vi-VN") : ""} · {p.minutes} phút đọc</div>
                <h2 className="font-semibold">{p.title}</h2>
                <p className="line-clamp-3 text-sm text-ink-600">{p.excerpt}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
      {d.total > 12 && (
        <div className="mt-6 flex justify-center gap-2 text-sm">
          {page > 1 && <Link className="btn-ghost" href={`/tin-tuc?${new URLSearchParams({ ...(cat ? { c: cat } : {}), page: String(page - 1) })}`}>← Trước</Link>}
          {page * 12 < d.total && <Link className="btn-ghost" href={`/tin-tuc?${new URLSearchParams({ ...(cat ? { c: cat } : {}), page: String(page + 1) })}`}>Sau →</Link>}
        </div>
      )}
    </PublicShell>
  );
}
