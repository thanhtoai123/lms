import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { loadBrand } from "@/lib/brand";
import { getDb } from "@satarobo/db";
import { familyChildren, parentUnread } from "@satarobo/api";
import { PhServiceWorker } from "@/components/ph/sw-register";
import { PhSidebar, PhTopbar } from "@/components/ph/nav";
import { currentParent } from "@/lib/parent-session";

export async function generateMetadata(): Promise<Metadata> {
  const b = await loadBrand();
  return {
    title: `${b.name} — Phụ huynh`,
    robots: { index: false },
    manifest: "/ph/manifest.webmanifest",
    appleWebApp: { capable: true, title: b.name, statusBarStyle: "default" },
    ...(b.hasLogo ? { icons: { icon: b.logoUrl, apple: b.logoUrl } } : {}),
  };
}

export async function generateViewport(): Promise<Viewport> {
  const b = await loadBrand();
  return { themeColor: b.primary, width: "device-width", initialScale: 1, viewportFit: "cover" };
}
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
  const [unread, kids] = p
    ? await Promise.all([parentUnread(getDb(), p.id).catch(() => 0), familyChildren(getDb(), p.id).catch(() => [])])
    : [0, []];
  // Con mặc định cho các mục "Học tập của con" khi phụ huynh chưa chọn con nào
  const conMacDinh = kids[0]?.id ?? null;

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
        <PhSidebar unread={unread} conMacDinh={conMacDinh} />
      </Suspense>
      <div className="flex min-h-dvh flex-col lg:pl-64">
        <Suspense fallback={<div className="h-14 border-b border-border bg-card md:h-16" />}>
          <PhTopbar unread={unread} parentName={p.fullName} conMacDinh={conMacDinh} />
        </Suspense>
        <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
