import type { MetadataRoute } from "next";
import { publicSiteUrl } from "@/lib/site-url";
import { getDb } from "@satarobo/db";
import { publicSitemap } from "@satarobo/api";

export const dynamic = "force-dynamic";

/** Sơ đồ trang cho công cụ tìm kiếm: trang dựng khối đã xuất bản + tin tức + tuyển dụng + trang hệ thống cố định */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicSiteUrl();
  const s = await publicSitemap(getDb()).catch(() => ({ pages: [], news: [], jobs: [] }));
  const fixed = ["/tin-tuc", "/tuyen-dung", "/dang-ky"].map((path) => ({ path, lastModified: null as Date | null }));
  const seen = new Set<string>();
  return [...s.pages, ...fixed, ...s.news, ...s.jobs].filter((x) => (seen.has(x.path) ? false : (seen.add(x.path), true))).map((x) => ({
    url: base + (x.path === "/" ? "" : x.path),
    ...(x.lastModified ? { lastModified: x.lastModified } : {}),
  }));
}
