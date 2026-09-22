"use client";

import { useEffect } from "react";

/** Phạm vi service worker: "/ph" (không có "/" cuối) để điều khiển cả trang "/ph" — start_url của app */
export const PH_SW_SCOPE = "/ph";

/**
 * Đăng ký service worker của cổng phụ huynh (phạm vi /ph) ngay khi mở app — để màn "mất kết nối"
 * hiện được khi offline. Đăng ký lại cùng một tệp là không đổi gì; trình duyệt không hỗ trợ thì bỏ qua.
 */
export function PhServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/ph/sw.js", { scope: PH_SW_SCOPE }).catch(() => { /* không hỗ trợ / bị chặn — app vẫn chạy */ });
  }, []);
  return null;
}
