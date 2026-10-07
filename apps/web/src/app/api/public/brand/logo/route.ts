import { getDb } from "@satarobo/db";
import { readBrandLogo } from "@satarobo/api";

/**
 * GET /api/public/brand/logo — logo thương hiệu (công khai: trang đăng nhập, cổng phụ huynh, biểu tượng tab).
 * SVG được phát kèm CSP khoá hết + sandbox: dù ai mở thẳng đường dẫn này cũng không chạy được mã.
 * Có `?v=<phiên bản>` thì cho cache dài (đổi logo là đổi phiên bản); không có thì luôn hỏi lại máy chủ.
 */
export async function GET(req: Request) {
  const logo = await readBrandLogo(getDb());
  if (!logo) return new Response("Chưa có logo", { status: 404, headers: { "Cache-Control": "no-store" } });
  const versioned = new URL(req.url).searchParams.get("v") === String(logo.version);
  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      "Content-Type": logo.mime,
      "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}
