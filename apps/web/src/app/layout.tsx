import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TRPCProvider } from "@/lib/trpc/client";

export const metadata: Metadata = {
  title: { default: "Sata Robo Platform", template: "%s · Sata Robo" },
  description: "Nền tảng vận hành trung tâm Sata Robo",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Sata Robo", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#f97316", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="h-full">
      <body className="min-h-full font-sans">
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
