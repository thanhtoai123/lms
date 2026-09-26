import { Suspense } from "react";
import type { Viewport } from "next";
import { getDb } from "@satarobo/db";
import { parentUnread } from "@satarobo/api";
import { PhServiceWorker } from "@/components/ph/sw-register";
import { PhSidebar, PhTopbar } from "@/components/ph/nav";
import { currentParent } from "@/lib/parent-session";

export const metadata = {
  title: "Sata Robo — Phụ huynh",
  robots: { index: false },
  manifest: "/ph/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Sata Robo", statusBarStyle: "default" as const },
};

export const viewport: Viewport = { themeColor: "#610b8a", width: "device-width", initialScale: 1, viewportFit: "cover" };
export const dynamic = "force-dynamic";

/**
 * KHUNG CỔNG PHỤ HUYNH — dựng theo cổng học viên hệ cũ: thanh bên dài chia nhóm + thanh trên
 * có chuông và chip tài khoản. Khung nằm ở layout chứ không ở từng trang, nên thêm trang mới
 * chỉ cần viết nội dung.
 *
 * - **≥1024px**: thanh bên cố định 256px, nội dung tối đa 1100px.
 * - **<1024px**: thanh bên thu vào ngăn kéo, mở bằng nút ☰ ở thanh trên.
 */
export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const p = await currentParent();
  const unread = p ? await parentUnread(getDb(), p.id).catch(() => 0) : 0;

  // Chưa đăng nhập (trang đăng nhập, trang offline): không dựng khung, giữ một cột hẹp
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
      <Suspense fallback={null}>
        <PhSidebar unread={unread} />
      </Suspense>
      <div className="flex min-h-dvh flex-col lg:pl-64">
        <Suspense fallback={<div className="h-14 border-b border-border bg-card md:h-16" />}>
          <PhTopbar unread={unread} parentName={p.fullName} />
        </Suspense>
        <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
