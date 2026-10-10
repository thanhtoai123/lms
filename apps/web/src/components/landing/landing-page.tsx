import type { Metadata } from "next";
import { getDb } from "@satarobo/db";
import { publicLanding } from "@satarobo/api";
import { loadBrand } from "@/lib/brand";
import { LandingView } from "./landing-view";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Trang công khai của một landing đã xuất bản; null nếu chưa có / chưa xuất bản (để gọi notFound hoặc chuyển hướng) */
export async function LandingPage({ slug, searchParams }: { slug: string; searchParams: SP }) {
  const [page, brand] = await Promise.all([publicLanding(getDb(), slug).catch(() => null), loadBrand()]);
  if (!page) return null;
  return (
    <LandingView
      doc={page.doc}
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
