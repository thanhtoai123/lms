import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Phông duy nhất của bộ nhận diện TH STEAM (Bold 700 cho H1, SemiBold 600 cho H2/H3, Regular/Medium cho nội dung)
const brandFont = Plus_Jakarta_Sans({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700", "800"], variable: "--font-brand", display: "swap" });
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
    // Có logo tải lên thì làm biểu tượng tab; không thì dùng bộ biểu tượng TH STEAM chính thức
    icons: b.hasLogo
      ? { icon: b.logoUrl, apple: b.logoUrl }
      : { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/thsteam/favicon-32.png", sizes: "32x32", type: "image/png" }], apple: "/thsteam/apple-touch-icon.png" },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const b = await loadBrand();
  return { themeColor: b.primary, width: "device-width", initialScale: 1, viewportFit: "cover" };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const brand = await loadBrand();
  return (
    <html lang="vi" className={`h-full ${brandFont.variable}`}>
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
