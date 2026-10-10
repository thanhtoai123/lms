import type { MetadataRoute } from "next";

/** Cho phép công cụ tìm kiếm đọc các trang công khai; chặn khu quản trị, API và đăng nhập. */
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/login", "/logout", "/teacher", "/ph/", "/hs/", "/cn/", "/ks/", "/pdg/", "/bt/", "/tn/", "/in-ho-so/", "/tra-cuu-hoa-don"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
