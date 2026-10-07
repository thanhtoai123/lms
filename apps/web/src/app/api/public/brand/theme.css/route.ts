import { getDb } from "@satarobo/db";
import { publicBrand } from "@satarobo/api";

/** GET /api/public/brand/theme.css — bảng màu thương hiệu (biến CSS) do Quản trị hệ thống cấu hình */
export async function GET(req: Request) {
  const b = await publicBrand(getDb());
  const versioned = new URL(req.url).searchParams.get("v") === String(b.version);
  return new Response(b.css, {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
