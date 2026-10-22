import { TH_BRAND } from "@satarobo/core";

/**
 * Địa chỉ gốc công khai của website (canonical, Open Graph, JSON-LD, sitemap, robots), không có "/" cuối.
 * Ưu tiên NEXT_PUBLIC_APP_URL; bản chạy thật quên đặt biến thì dùng tên miền chính thức (không để localhost lọt ra Google);
 * máy phát triển dùng localhost.
 */
export function publicSiteUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const v = env || (process.env.NODE_ENV === "production" ? TH_BRAND.websiteUrl : "http://localhost:3000");
  return v.replace(/\/+$/, "");
}
