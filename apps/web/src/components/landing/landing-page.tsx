import type { Metadata } from "next";
import { getDb } from "@satarobo/db";
import { getSiteChrome, publicLanding } from "@satarobo/api";
import { applyChrome, isSiteSlug } from "@satarobo/core";
import { loadBrand } from "@/lib/brand";
import { LandingView } from "./landing-view";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Trang công khai của một landing đã xuất bản; null nếu chưa có / chưa xuất bản (để gọi notFound hoặc chuyển hướng) */
export async function LandingPage({ slug, searchParams }: { slug: string; searchParams: SP }) {
  const site = isSiteSlug(slug);
  const [page, brand, chrome] = await Promise.all([publicLanding(getDb(), slug).catch(() => null), loadBrand(), site ? getSiteChrome(getDb()).catch(() => null) : null]);
  if (!page) return null;
  return (
    <LandingView
      // Trang thuộc website: đầu / chân trang lấy từ khung chung (Website → Cấu trúc & khung), không từ khối của trang
      doc={chrome ? applyChrome(page.doc, chrome) : page.doc}
      homeHref={chrome ? "/" : undefined}
      variant={page.variant}
      slug={page.slug}
      brand={{ name: brand.name, primary: brand.primary, accent: brand.accent, logoUrl: brand.logoUrl }}
      utm={{ utm_source: one(searchParams.utm_source), utm_medium: one(searchParams.utm_medium), utm_campaign: one(searchParams.utm_campaign), ref: one(searchParams.ref).slice(0, 20) }}
    />
  );
}

export async function landingMetadata(slug: string): Promise<Metadata> {
  const page = await publicLanding(getDb(), slug).catch(() => null);
  if (!page) return {};
  const title = page.seoTitle || page.title;
  return {
    title: { absolute: title },
    description: page.seoDescription || undefined,
    openGraph: { title, description: page.seoDescription || undefined, images: page.seoImage ? [page.seoImage] : undefined },
    robots: { index: true, follow: true },
  };
}
