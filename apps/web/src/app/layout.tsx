import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";

const beVietnam = Be_Vietnam_Pro({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700", "800"], variable: "--font-be-vietnam", display: "swap" });
import { TRPCProvider } from "@/lib/trpc/client";
import { BrandProvider } from "@/components/brand";
import { loadBrand } from "@/lib/brand";

export async function generateMetadata(): Promise<Metadata> {
  const b = await loadBrand();
  return {
    title: { default: `Quản trị | ${b.name}`, template: `%s | ${b.name} Admin` },
    description: `Nền tảng vận hành trung tâm ${b.name}`,
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: b.name, statusBarStyle: "default" },
    // Có logo tải lên thì làm biểu tượng tab; không thì dùng icon.svg mặc định của ứng dụng
    ...(b.hasLogo ? { icons: { icon: b.logoUrl, apple: b.logoUrl } } : {}),
  };
}

export async function generateViewport(): Promise<Viewport> {
  const b = await loadBrand();
  return { themeColor: b.primary, width: "device-width", initialScale: 1, viewportFit: "cover" };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const brand = await loadBrand();
  return (
    <html lang="vi" className={`h-full ${beVietnam.variable}`}>
      <head>
        {/* Bảng màu thương hiệu do Quản trị hệ thống cấu hình (Cài đặt hệ thống → Nhận diện thương hiệu) */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href={`/api/public/brand/theme.css?v=${brand.version}`} />
      </head>
      <body className="min-h-full font-sans">
        <BrandProvider value={brand}><TRPCProvider>{children}</TRPCProvider></BrandProvider>
      </body>
    </html>
  );
}
