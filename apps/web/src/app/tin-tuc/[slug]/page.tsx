import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { Metadata } from "next";
import { getDb } from "@satarobo/db";
import { publicPost } from "@satarobo/api";
import { PublicShell } from "@/components/public-shell";
import { SiteTracker } from "@/components/site-tracker";

export const dynamic = "force-dynamic";
const load = cache(async (slug: string) => (/^[a-z0-9-]{3,80}$/.test(slug) ? publicPost(getDb(), slug) : null));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) return { title: "Không tìm thấy bài viết" };
  return { title: `${p.seoTitle} — Sata Robo`, description: p.seoDescription, openGraph: { title: p.seoTitle, description: p.seoDescription, images: p.coverImage ? [p.coverImage] : [] } };
}

export default async function NewsPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) notFound();
  return (
    <PublicShell>
      <SiteTracker />
      <Link href="/tin-tuc" className="text-sm text-ink-600">← Tin tức</Link>
      <article className="mt-3">
        <div className="text-xs text-ink-400">{p.categoryLabel} · {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString("vi-VN") : ""} · {p.minutes} phút đọc</div>
        <h1 className="mt-1 text-3xl font-bold">{p.title}</h1>
        {p.excerpt && <p className="mt-2 text-lg text-ink-600">{p.excerpt}</p>}
        {p.coverImage && <img src={p.coverImage} alt="" className="mt-4 w-full rounded-2xl" />}
        <div className="sr-prose mt-6" dangerouslySetInnerHTML={{ __html: p.html }} />
      </article>
      <div className="card mt-8 flex flex-wrap items-center justify-between gap-3 p-5">
        <div><div className="font-semibold">Cho con trải nghiệm lập trình robot</div><div className="text-sm text-ink-600">Buổi học thử 1-1 miễn phí, không ràng buộc.</div></div>
        <Link href="/dang-ky" className="btn-primary">Đăng ký học thử</Link>
      </div>
      {p.related.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold">Bài liên quan</h2>
          <ul className="mt-2 space-y-1 text-sm">{p.related.map((r) => <li key={r.slug}><Link className="text-brand-600 hover:underline" href={`/tin-tuc/${r.slug}`}>{r.title}</Link></li>)}</ul>
        </div>
      )}
    </PublicShell>
  );
}
