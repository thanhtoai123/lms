import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { Metadata } from "next";
import { getDb } from "@satarobo/db";
import { publicPost } from "@satarobo/api";
import { POST_CATEGORY_VI, TRIAL_PATH, type PostCategory } from "@satarobo/core";
import { PublicShell } from "@/components/public-shell";
import { SiteTracker } from "@/components/site-tracker";
import { JsonLd, PageHero, viDate } from "@/components/site/page-hero";
import { publicSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";
const load = cache(async (slug: string) => (/^[a-z0-9-]{3,80}$/.test(slug) ? publicPost(getDb(), slug) : null));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) return { title: "Không tìm thấy bài viết" };
  return { title: { absolute: `${p.seoTitle} — TH STEAM Academy` }, description: p.seoDescription, alternates: { canonical: `/tin-tuc/${slug}` }, openGraph: { type: "article", title: p.seoTitle, description: p.seoDescription, images: p.coverImage ? [p.coverImage] : [] } };
}

export default async function NewsPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) notFound();
  const base = publicSiteUrl();
  const ld = [
    { "@context": "https://schema.org", "@type": "Article", headline: p.title, description: p.seoDescription, ...(p.publishedAt ? { datePublished: new Date(p.publishedAt).toISOString() } : {}), ...(p.coverImage ? { image: [new URL(p.coverImage, base).href] } : {}), author: { "@type": "Organization", name: "TH STEAM Academy", url: base }, publisher: { "@type": "Organization", name: "TH STEAM Academy", logo: { "@type": "ImageObject", url: `${base}/thsteam/logo-ngang.png` } }, mainEntityOfPage: `${base}/tin-tuc/${p.slug}` },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Trang chủ", item: `${base}/` }, { "@type": "ListItem", position: 2, name: "Tin tức", item: `${base}/tin-tuc` }, { "@type": "ListItem", position: 3, name: p.title }] },
  ];
  return (
    <PublicShell landing>
      <SiteTracker />
      <JsonLd data={ld} />
      <PageHero
        crumbs={[{ label: "Trang chủ", href: "/" }, { label: "Tin tức", href: "/tin-tuc" }, { label: p.categoryLabel }]}
        title={p.title}
        lead={p.excerpt}
        meta={[{ text: p.categoryLabel, gold: true }, ...(p.publishedAt ? [{ text: viDate(p.publishedAt) }] : []), { text: `${p.minutes} phút đọc` }]}
      />
      <section className="lp-sec lp-page">
        <div className="lp-wrap">
          <div className="lp-art-in">
            {p.coverImage && <img className="lp-art-cover" src={p.coverImage} alt={p.title} />}
            <article className="lp-prose lp-article" dangerouslySetInnerHTML={{ __html: p.html }} />
            <aside className="lp-callout">
              <div><h2>Cho con một buổi học trải nghiệm 1:1</h2><p>Con học cùng thầy và tự tay làm sản phẩm; sau buổi học, thầy đánh giá và gợi ý lộ trình riêng cho con. Không mất phí.</p></div>
              <Link className="lp-btn lp-btn-primary" href={TRIAL_PATH}>Đặt lịch học trải nghiệm</Link>
            </aside>
          </div>
          {p.related.length > 0 && (
            <div className="lp-related">
              <h2>Bài viết cùng chuyên mục</h2>
              <ul className="lp-cards">
                {p.related.map((r) => (
                  <li key={r.slug}>
                    <Link href={`/tin-tuc/${r.slug}`} className="lp-ncard">
                      <div className="lp-ncard-pic">{r.coverImage ? <img src={r.coverImage} alt="" loading="lazy" /> : <img className="lp-ncard-logo" src="/thsteam/symbol.svg" alt="" />}</div>
                      <div className="lp-ncard-b">
                        <p className="lp-ncard-meta"><b>{POST_CATEGORY_VI[r.category as PostCategory]}</b>{r.publishedAt ? ` · ${viDate(r.publishedAt)}` : ""}</p>
                        <h3>{r.title}</h3>
                        {r.excerpt && <p>{r.excerpt}</p>}
                        <span className="lp-ncard-more">Đọc bài →</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </PublicShell>
  );
}
