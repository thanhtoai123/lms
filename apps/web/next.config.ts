import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@satarobo/api", "@satarobo/core", "@satarobo/db"],
  serverExternalPackages: ["postgres"],
  async headers() {
    // CSP thật (không report-only), có nonce sẽ được thêm ở proxy.ts khi cần script bên thứ ba.
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`, // React dev cần eval; production không
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""} ${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace("https://", "wss://")}`,
      "worker-src 'self' blob:",
    ].join("; ");
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
