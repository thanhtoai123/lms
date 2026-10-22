import Link from "next/link";
import { keepText } from "@satarobo/core";

/**
 * Đầu trang con (tin tức, tuyển dụng…): mảng xanh Deep Ocean + quỹ đạo vàng như trang chính, đường dẫn (breadcrumb),
 * nhãn, H1, câu dẫn, các chip thông tin. Dùng trong PublicShell `landing` (CSS `.lp--vivid .lp-hero`, `.lp-crumbs`, `.lp-hero-meta`).
 */
export function PageHero({ crumbs, eyebrow, title, lead, meta }: {
  crumbs?: { label: string; href?: string }[];
  eyebrow?: string;
  title: string;
  lead?: string | null;
  meta?: { text: string; gold?: boolean }[];
}) {
  return (
    <section className="lp-sec lp-hero">
      <div className="lp-wrap">
        <div className="lp-hero-text">
          {crumbs && crumbs.length > 0 && (
            <nav aria-label="Đường dẫn">
              <ol className="lp-crumbs">
                {crumbs.map((c, i) => <li key={i}>{c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}</li>)}
              </ol>
            </nav>
          )}
          {eyebrow && <p className="lp-eyebrow">{eyebrow}</p>}
          <h1>{keepText(title)}</h1>
          {lead && <p className="lp-lead">{keepText(lead)}</p>}
          {meta && meta.length > 0 && <ul className="lp-hero-meta">{meta.map((m, i) => <li key={i} className={m.gold ? "is-gold" : undefined}>{m.text}</li>)}</ul>}
        </div>
      </div>
    </section>
  );
}

/** JSON-LD an toàn (chặn đóng thẻ script) */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export const viDate = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
