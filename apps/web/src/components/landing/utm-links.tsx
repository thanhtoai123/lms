"use client";

import { useEffect } from "react";
import { currentUtm, track } from "@/components/site-tracker";

/**
 * Gắn theo dõi cho landing (không render gì):
 *  - liên kết nội bộ có `data-cta` (vd /dang-ky) được nối thêm UTM của lượt truy cập + `lp=<đường dẫn trang>`;
 *  - bấm nút kêu gọi ghi sự kiện `cta_click`.
 * HTML của landing không chứa script (CSP theo nonce), nên việc này làm ở đây.
 */
export function UtmLinks({ slug }: { slug: string }) {
  useEffect(() => {
    const utm = currentUtm();
    document.querySelectorAll<HTMLAnchorElement>(".lp a[data-cta]").forEach((a) => {
      const h = a.getAttribute("href") ?? "";
      if (!h.startsWith("/") || h.startsWith("//")) return;
      try {
        const u = new URL(h, window.location.origin);
        for (const [k, v] of Object.entries(utm)) if (!u.searchParams.has(k)) u.searchParams.set(k, v);
        if (!u.searchParams.has("lp")) u.searchParams.set("lp", slug);
        a.setAttribute("href", u.pathname + u.search + u.hash);
      } catch { /* giữ nguyên liên kết */ }
    });
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("a[data-cta]");
      if (el) track("cta_click");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [slug]);
  return null;
}
