import type { NextConfig } from "next";
import { API_CSP, securityHeaderOptions, securityHeaders } from "@satarobo/core";

const nextConfig: NextConfig = {
  transpilePackages: ["@satarobo/api", "@satarobo/core", "@satarobo/db"],
  // playwright-core: gói TUỲ CHỌN cho xuất PDF phía máy chủ (PDF_RENDERER=playwright) — không đóng gói, nạp động lúc chạy
  serverExternalPackages: ["postgres", "playwright-core"],
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
  /**
   * HEADER BẢO MẬT — định nghĩa nằm ở MỘT NƠI DUY NHẤT:
   * `packages/core/src/security/headers.ts` (có bộ kiểm thử `headers.test.ts`).
   *
   * Phản hồi TRANG lấy header từ `apps/web/src/proxy.ts`, vì CSP mang **nonce sinh theo
   * từng yêu cầu** nên không đặt tĩnh ở đây được. Chỗ này chỉ lo phần proxy KHÔNG chạy:
   * các route handler dưới `/api/*` (xem `matcher` trong proxy.ts) — chúng trả JSON hoặc tệp
   * nên dùng CSP khoá hết (`API_CSP`) và không cần nonce.
   *
   * NGOẠI LỆ `/api/content/scorm/*`: gói SCORM là **tài liệu HTML + JS của bên thứ ba**,
   * `default-src 'none'` sẽ làm bài giảng không chạy. Route đó tự đặt header riêng
   * (`X-Content-Type-Options`, `X-Frame-Options`) — xem mục T8 trong docs/KIEM-DINH-BAO-MAT.md
   * về việc nên tách gói SCORM sang một miền riêng.
   */
  async headers() {
    // Bỏ `Cross-Origin-Resource-Policy` ở đây: API công khai (`/api/public/*`) được website
    // satarobo.vn gọi từ MIỀN KHÁC (xem `lib/public-cors.ts`), đặt `same-site` sẽ chặn nhầm.
    // Phản hồi trang vẫn có CORP đầy đủ vì proxy gắn.
    const base = securityHeaders(securityHeaderOptions(process.env))
      .filter(([k]) => !k.startsWith("Content-Security-Policy") && k !== "Cross-Origin-Resource-Policy")
      .map(([key, value]) => ({ key, value }));
    // Route SCORM tự đặt `X-Content-Type-Options` và `X-Frame-Options`; gửi thêm bản thứ hai
    // có thể khiến trình duyệt coi `X-Frame-Options` là xung đột và CHẶN iframe bài giảng.
    const ownHeaders = new Set(["X-Content-Type-Options", "X-Frame-Options"]);
    return [
      { source: "/api/:path((?!content/scorm/).*)", headers: [...base, { key: "Content-Security-Policy", value: API_CSP }] },
      { source: "/api/content/scorm/:path*", headers: base.filter((h) => !ownHeaders.has(h.key)) },
    ];
  },
};

export default nextConfig;
