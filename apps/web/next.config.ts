import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@satarobo/api", "@satarobo/core", "@satarobo/db"],
  serverExternalPackages: ["postgres"],
  // Đường dẫn cũ của bản thử nghiệm (/ops) → đường dẫn chuẩn giống admin.satarobo.vn
  async redirects() {
    const map: [string, string][] = [
      ["/ops", "/dashboard"],
      ["/ops/leads", "/leads"],
      ["/ops/leads/board", "/crm"],
      ["/ops/leads/new", "/nhap-khach-hang"],
      ["/ops/leads/bulk-convert", "/leads/bulk-convert"],
      ["/ops/leads/distribution", "/quan-ly-chia-lead"],
      ["/ops/leads/handover", "/ban-giao-lead"],
      ["/ops/leads/stale", "/lead-nguoi"],
      ["/ops/leads/transfers", "/leads/bao-cao-chuyen"],
      ["/ops/leads/settings", "/cau-hinh-van-hanh"],
      ["/ops/care", "/cham-soc-hv"],
      ["/ops/sessions", "/sessions"],
      ["/ops/classes", "/classes"],
    ];
    return [
      ...map.map(([source, destination]) => ({ source, destination, permanent: false })),
      { source: "/ops/leads/:id", destination: "/leads/:id", permanent: false },
      { source: "/ops/classes/:path*", destination: "/classes/:path*", permanent: false },
      { source: "/admin", destination: "/dashboard", permanent: false },
    ];
  },
  async headers() {
    // CSP thật (không report-only), có nonce sẽ được thêm ở proxy.ts khi cần script bên thứ ba.
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`, // React dev cần eval; production không
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""} ${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace("https://", "wss://")}`,
      "worker-src 'self' blob:",
      "frame-src 'self' https://www.youtube-nocookie.com https://drive.google.com",
      "media-src 'self' blob:",
    ].join("; ");
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=(), usb=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
