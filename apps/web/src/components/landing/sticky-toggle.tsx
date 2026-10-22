"use client";

import { useEffect } from "react";

/**
 * Thanh nút dưới cùng trên điện thoại (.lp-sticky): ẩn khi form đăng ký đang hiện trên màn hình (form đầu trang, form cuối trang)
 * để không che ô nhập và không lặp lời mời. Trình duyệt không có IntersectionObserver → thanh luôn hiện như cũ.
 */
export function StickyToggle() {
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>(".lp-sticky");
    const forms = Array.from(document.querySelectorAll<HTMLElement>("#dang-ky-nhanh, #dang-ky"));
    if (!bar || forms.length === 0 || typeof IntersectionObserver === "undefined") return;
    const seen = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) (e.isIntersecting ? seen.add(e.target) : seen.delete(e.target));
      bar.classList.toggle("is-off", seen.size > 0);
    }, { threshold: 0.15 });
    forms.forEach((f) => io.observe(f));
    return () => io.disconnect();
  }, []);
  return null;
}
