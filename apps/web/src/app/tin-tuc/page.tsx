import Link from "next/link";
import { getDb } from "@satarobo/db";
import { publicPosts } from "@satarobo/api";
import { POST_CATEGORIES, POST_CATEGORY_VI, TRIAL_PATH, type PostCategory } from "@satarobo/core";
import { PublicShell } from "@/components/public-shell";
import { SiteTracker } from "@/components/site-tracker";
import { PageHero, viDate } from "@/components/site/page-hero";

export const dynamic = "force-dynamic";
export const metadata = { title: { absolute: "Tin tức — TH STEAM Academy" }, alternates: { canonical: "/tin-tuc" }, description: "Tin tức, sự kiện, câu chuyện học viên và góc phụ huynh của TH STEAM Academy: Robotics, AI, Thiết kế đồ họa và Lập trình cho học sinh 8–18 tuổi." };

const PER_PAGE = 12;

export default async function NewsIndex({ searchParams }: { searchParams: Promise<{ c?: string; page?: string }> }) {
  const sp = await searchParams;
  const cat = POST_CATEGORIES.includes(sp.c as PostCategory) ? (sp.c as PostCategory) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const d = await publicPosts(getDb(), { category: cat, page });
  const q = (p: number) => `/tin-tuc?${new URLSearchParams({ ...(cat ? { c: cat } : {}), page: String(p) })}`;
  return (
    <PublicShell landing>
      <SiteTracker />
      <PageHero
        crumbs={[{ label: "Trang chủ", href: "/" }, { label: "Tin tức" }]}
        title="Tin tức & góc phụ huynh"
        lead="Lịch khai giảng, sự kiện, câu chuyện học viên và những gợi ý giúp bố mẹ đồng hành cùng con học công nghệ."
      />
      <section className="lp-sec lp-page">
        <div className="lp-wrap">
          <nav aria-label="Chuyên mục">
            <ul className="lp-chips">
              <li><Link href="/tin-tuc" aria-current={!cat ? "page" : undefined}>Tất cả</Link></li>
              {POST_CATEGORIES.map((c) => <li key={c}><Link href={`/tin-tuc?c=${c}`} aria-current={cat === c ? "page" : undefined}>{POST_CATEGORY_VI[c]}</Link></li>)}
            </ul>
          </nav>
          {d.items.length === 0 ? (
            <div className="lp-empty"><strong>Chưa có bài viết trong mục này</strong>Bố mẹ xem các mục khác hoặc quay lại sau nhé.</div>
          ) : (
            <ul className="lp-cards">
              {d.items.map((p) => (
                <li key={p.slug}>
                  <Link href={`/tin-tuc/${p.slug}`} className="lp-ncard">
                    <div className="lp-ncard-pic">{p.coverImage ? <img src={p.coverImage} alt="" loading="lazy" /> : <img className="lp-ncard-logo" src="/thsteam/symbol.svg" alt="" />}</div>
                    <div className="lp-ncard-b">
                      <p className="lp-ncard-meta"><b>{p.categoryLabel}</b> · {viDate(p.publishedAt)} · {p.minutes} phút đọc</p>
                      <h2>{p.title}</h2>
                      {p.excerpt && <p>{p.excerpt}</p>}
                      <span className="lp-ncard-more">Đọc bài →</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {d.total > PER_PAGE && (
            <nav className="lp-pager" aria-label="Trang">
              {page > 1 && <Link className="lp-btn lp-btn-ghost" href={q(page - 1)}>← Trang trước</Link>}
              {page * PER_PAGE < d.total && <Link className="lp-btn lp-btn-ghost" href={q(page + 1)}>Trang sau →</Link>}
            </nav>
          )}
          <aside className="lp-callout">
            <div><h2>Cho con một buổi học trải nghiệm 1:1</h2><p>Con học cùng thầy và tự tay làm sản phẩm; sau buổi học, thầy đánh giá và gợi ý lộ trình riêng cho con. Không mất phí.</p></div>
            <Link className="lp-btn lp-btn-primary" href={TRIAL_PATH}>Đặt lịch học trải nghiệm</Link>
          </aside>
        </div>
      </section>
    </PublicShell>
  );
}
