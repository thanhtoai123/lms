/**
 * DỮ LIỆU CÓ CẤU TRÚC (schema.org JSON-LD) CHO LANDING / TRANG WEBSITE.
 *
 * Sinh từ chính nội dung các khối (không nhập tay), nên luôn khớp với chữ phụ huynh nhìn thấy — đúng hướng dẫn của Google:
 *  - Organization (EducationalOrganization): tên, logo, điện thoại, địa chỉ web.
 *  - WebPage + BreadcrumbList: tên trang, mô tả, ảnh chính, đường dẫn.
 *  - FAQPage: từ khối "Câu hỏi thường gặp" (Google hiện chỉ hiện kết quả nhiều định dạng FAQ cho một số trang
 *    chính phủ / y tế, nhưng dữ liệu vẫn giúp máy tìm kiếm hiểu nội dung).
 *  - Course: từ khối "Lộ trình học" (mỗi chặng một khoá, học online). Google đã ngừng hiện thẻ khoá học (09/2025);
 *    giữ lại vì schema.org vẫn dùng được cho các công cụ khác và không có hại.
 * Chuỗi JSON đã thoát `<` để nhúng an toàn trong <script type="application/ld+json">.
 */
import { rowsOf, sectionVisible, type LandingDoc } from "./model.js";

export interface JsonLdMeta {
  /** Địa chỉ gốc của website, https://…, không dấu / cuối */
  baseUrl: string;
  /** Đường dẫn trang: "/", "/lp/robotics-ai-cho-tre"… */
  path: string;
  title: string;
  description?: string | null;
  image?: string | null;
  brand: { name: string; logo?: string | null; phone?: string | null; email?: string | null; sameAs?: string[] };
  /** Tên trang trong đường dẫn breadcrumb */
  crumb?: string;
}

const absUrl = (base: string, u: string) => (/^https:\/\//.test(u) ? u : `${base}${u.startsWith("/") ? "" : "/"}${u}`);

export function landingJsonLd(doc: LandingDoc, m: JsonLdMeta): Record<string, unknown> {
  const url = absUrl(m.baseUrl, m.path);
  const orgId = `${m.baseUrl}/#to-chuc`;
  const graph: Record<string, unknown>[] = [];
  graph.push({
    "@type": "EducationalOrganization", "@id": orgId, name: m.brand.name, url: `${m.baseUrl}/`,
    ...(m.brand.logo ? { logo: absUrl(m.baseUrl, m.brand.logo) } : {}),
    ...(m.brand.phone ? { telephone: m.brand.phone } : {}),
    ...(m.brand.email ? { email: m.brand.email } : {}),
    ...(m.brand.sameAs?.length ? { sameAs: m.brand.sameAs } : {}),
  });
  graph.push({
    "@type": "WebPage", "@id": `${url}#trang`, url, name: m.title, inLanguage: "vi-VN",
    ...(m.description ? { description: m.description } : {}),
    ...(m.image ? { primaryImageOfPage: { "@type": "ImageObject", url: absUrl(m.baseUrl, m.image) } } : {}),
    isPartOf: { "@type": "WebSite", url: `${m.baseUrl}/`, name: m.brand.name },
    about: { "@id": orgId },
  });
  if (m.path !== "/") {
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Trang chủ", item: `${m.baseUrl}/` },
        { "@type": "ListItem", position: 2, name: m.crumb ?? m.title, item: url },
      ],
    });
  }
  const visible = doc.sections.filter(sectionVisible);
  const faq = visible.find((s) => s.type === "faq");
  if (faq) {
    const qs = rowsOf(faq, "items");
    if (qs.length) graph.push({ "@type": "FAQPage", mainEntity: qs.map((q) => ({ "@type": "Question", name: q.q, acceptedAnswer: { "@type": "Answer", text: q.a } })) });
  }
  // Chuyên ngành (khối tab của trang chính): mỗi chuyên ngành một khoá học online
  for (const t of visible.filter((s) => s.type === "tracks")) {
    for (const r of rowsOf(t, "items")) {
      graph.push({
        "@type": "Course", name: r.name, description: [r.hook, r.text].filter(Boolean).join(" ").slice(0, 500) || r.name,
        provider: { "@id": orgId }, inLanguage: "vi", ...(r.ages ? { educationalLevel: r.ages } : {}),
        hasCourseInstance: { "@type": "CourseInstance", courseMode: "online", inLanguage: "vi" },
      });
    }
  }
  // Buổi học trải nghiệm: một dịch vụ giáo dục có Offer giá 0 — chỉ khi khối "trial" có dòng nổi bật nói rõ không mất phí
  const trial = visible.find((s) => s.type === "trial");
  if (trial && /không (mất|phải trả) phí/i.test(trial.data.badge ?? "")) {
    graph.push({
      "@type": "Service", name: (trial.data.eyebrow || "Buổi học trải nghiệm").slice(0, 120),
      description: (trial.data.intro ?? "").slice(0, 500) || undefined, provider: { "@id": orgId }, areaServed: "VN", serviceType: "Buổi học trải nghiệm và định hướng lộ trình",
      offers: { "@type": "Offer", price: "0", priceCurrency: "VND", url: `${url}#dang-ky`, availability: "https://schema.org/InStock" },
    });
  }
  const road = visible.find((s) => s.type === "roadmap");
  if (road) {
    for (const r of rowsOf(road, "items")) {
      graph.push({
        "@type": "Course", name: r.name, description: [r.meta, r.text].filter(Boolean).join(". ") || r.name,
        provider: { "@id": orgId }, inLanguage: "vi",
        hasCourseInstance: { "@type": "CourseInstance", courseMode: "online", inLanguage: "vi" },
      });
    }
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

/** Chuỗi JSON an toàn để đặt trong thẻ <script type="application/ld+json"> */
export function jsonLdString(v: unknown): string {
  return JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
