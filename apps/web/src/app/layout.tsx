import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";

const beVietnam = Be_Vietnam_Pro({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700", "800"], variable: "--font-be-vietnam", display: "swap" });
import { TRPCProvider } from "@/lib/trpc/client";

export const metadata: Metadata = {
  title: { default: "Quản trị | Sata Robo", template: "%s | Sata Robo Admin" },
  description: "Nền tảng vận hành trung tâm Sata Robo",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Sata Robo", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#610b8a", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`h-full ${beVietnam.variable}`}>
      <body className="min-h-full font-sans">
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
