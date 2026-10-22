import type { Metadata } from "next";
import { getDb } from "@satarobo/db";
import { getSiteChrome, publicLanding, publicTrackingConfig } from "@satarobo/api";
import { HOME_SLUG, TH_BRAND, applyChrome, homeFocus, isSiteSlug, jsonLdString, landingJsonLd, sitePathOf } from "@satarobo/core";
import { loadBrand } from "@/lib/brand";
import { cspNonce } from "@/lib/nonce";
import { publicSiteUrl } from "@/lib/site-url";
import { LandingView } from "./landing-view";
import { AdTags } from "./ad-tags";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Địa chỉ gốc công khai của website (canonical, Open Graph, JSON-LD) */
export function siteBase(): string {
  return publicSiteUrl();
}
/** Đường dẫn công khai của một trang dựng khối: trang website ("/", "/khoa-hoc/…") hoặc landing "/lp/<tên>" */
export const landingPath = (slug: string): string => sitePathOf(slug) ?? `/lp/${slug}`;

/** Trang công khai của một landing đã xuất bản; null nếu chưa có / chưa xuất bản (để gọi notFound hoặc chuyển hướng) */
export async function LandingPage({ slug, searchParams }: { slug: string; searchParams: SP }) {
  const site = isSiteSlug(slug);
  const [page, brand, chrome, tags, nonce] = await Promise.all([
    publicLanding(getDb(), slug).catch(() => null), loadBrand(), site ? getSiteChrome(getDb()).catch(() => null) : null,
    publicTrackingConfig(getDb()).catch(() => null), cspNonce(),
  ]);
  if (!page) return null;
  const doc = chrome ? applyChrome(page.doc, chrome) : page.doc;
  const ld = landingJsonLd(doc, {
    baseUrl: siteBase(), path: landingPath(slug), title: page.seoTitle || page.title, description: page.seoDescription, image: page.seoImage,
    brand: { name: brand.name, logo: "/thsteam/logo-ngang.png", phone: TH_BRAND.hotline },
  });
  return (
    <>
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: jsonLdString(ld) }} />
      <LandingView
        // Trang thuộc website: đầu / chân trang lấy từ khung chung (Website → Cấu trúc & khung), không từ khối của trang
        doc={doc}
        homeHref={chrome ? "/" : undefined}
        variant={page.variant}
        slug={page.slug}
        // Trang chính: /?nganh=robotics|ai|do-hoa|lap-trinh mở sẵn tab chuyên ngành, đổi tiêu đề lớn, chọn sẵn ngành trong form
        focus={slug === HOME_SLUG ? homeFocus(one(searchParams.nganh)) : undefined}
        brand={{ name: brand.name, primary: brand.primary, accent: brand.accent, logoUrl: brand.logoUrl, lockup: brand.lockup, lockupOnDark: brand.lockupOnDark }}
        utm={{ utm_source: one(searchParams.utm_source), utm_medium: one(searchParams.utm_medium), utm_campaign: one(searchParams.utm_campaign), ref: one(searchParams.ref).slice(0, 20) }}
      />
      {tags?.trackingEnabled ? <AdTags nonce={nonce} metaPixelId={tags.metaPixelId} ga4Id={tags.ga4MeasurementId} googleAdsId={tags.googleAdsId} googleAdsLeadLabel={tags.googleAdsLeadLabel} /> : null}
    </>
  );
}

export async function landingMetadata(slug: string): Promise<Metadata> {
  const page = await publicLanding(getDb(), slug).catch(() => null);
  if (!page) return {};
  const title = page.seoTitle || page.title;
  const description = page.seoDescription || undefined;
  const path = landingPath(slug);
  const image = page.seoImage ? { url: page.seoImage, width: 1200, height: 630, alt: title } : { url: "/thsteam/logo-ngang.png", alt: TH_BRAND.name };
  return {
    metadataBase: new URL(siteBase()),
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", locale: "vi_VN", siteName: TH_BRAND.name, url: path, title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
    robots: { index: true, follow: true, "max-image-preview": "large" },
    formatDetection: { telephone: true },
  };
}
