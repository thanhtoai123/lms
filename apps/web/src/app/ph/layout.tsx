import type { Viewport } from "next";
import { getDb } from "@satarobo/db";
import { parentUnread } from "@satarobo/api";
import { PhServiceWorker } from "@/components/ph/sw-register";
import { PhSideNav } from "@/components/ph/nav";
import { currentParent } from "@/lib/parent-session";

export const metadata = {
  title: "Sata Robo — Phụ huynh",
  robots: { index: false },
  manifest: "/ph/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Sata Robo", statusBarStyle: "default" as const },
};

export const viewport: Viewport = { themeColor: "#610b8a", width: "device-width", initialScale: 1, viewportFit: "cover" };

/**
 * KHUNG CỔNG PHỤ HUYNH — một mã nguồn, ba khổ màn hình:
 *
 * - **Điện thoại (< 768px)**: một cột sát mép, điều hướng ở thanh đáy (ngón cái với tới).
 *   Đây vẫn là khổ chính — phần lớn phụ huynh mở cổng từ đường dẫn trong tin Zalo.
 * - **Máy tính bảng (≥ 768px)**: thanh bên cố định 240px + cột nội dung; thanh đáy ẩn đi.
 * - **Máy tính (≥ 1024px)**: cột nội dung nới tới 960px, các trang tự xếp hai cột bên trong.
 *
 * Trước đây khung khoá cứng `max-w-md` (448px) nên mở trên máy tính là một dải hẹp giữa màn hình
 * trống hai bên. Giới hạn bề rộng nay nằm ở từng trang, không nằm ở khung.
 */
export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const p = await currentParent();
  const unread = p ? await parentUnread(getDb(), p.id).catch(() => 0) : 0;

  // Chưa đăng nhập (trang đăng nhập, trang offline): không dựng thanh điều hướng, giữ một cột hẹp
  if (!p) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-surface text-[15px] leading-relaxed">
        <PhServiceWorker />
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-surface text-[15px] leading-relaxed">
      <PhServiceWorker />
      <PhSideNav unread={unread} />
      <div className="flex min-h-dvh flex-col md:pl-60">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-[960px]">{children}</div>
      </div>
    </div>
  );
}
