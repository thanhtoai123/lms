import type { MetadataRoute } from "next";
import { publicSiteUrl } from "@/lib/site-url";

/** Cho phép công cụ tìm kiếm đọc các trang công khai; chặn khu quản trị, API và đăng nhập. */
export default function robots(): MetadataRoute.Robots {
  const base = publicSiteUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/login", "/logout", "/teacher", "/ph/", "/hs/", "/cn/", "/ks/", "/pdg/", "/bt/", "/tn/", "/in-ho-so/", "/tra-cuu-hoa-don"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
