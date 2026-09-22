import type { Viewport } from "next";
import { PhServiceWorker } from "@/components/ph/sw-register";

export const metadata = {
  title: "Sata Robo — Phụ huynh",
  robots: { index: false },
  manifest: "/ph/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Sata Robo", statusBarStyle: "default" as const },
};

export const viewport: Viewport = { themeColor: "#610b8a", width: "device-width", initialScale: 1, viewportFit: "cover" };

/** Cổng phụ huynh: một cột ≤ 448px, chữ nền 15px (dễ đọc trên điện thoại), nền trung tính ấm */
export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-surface text-[15px] leading-relaxed">
      <PhServiceWorker />
      {children}
    </div>
  );
}
