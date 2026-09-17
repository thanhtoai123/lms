import { getDb } from "@satarobo/db";
import { publicSite } from "@satarobo/api";
import { SITE_PAGE_KEYS } from "@satarobo/core";
import { publicCors } from "@/lib/public-cors";

/** GET /api/public/site/[page] — nội dung trang công khai (website đọc về, lưu xong là có ngay) */
export async function GET(req: Request, { params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  const headers = publicCors(req.headers.get("origin"), "GET, OPTIONS");
  if (!SITE_PAGE_KEYS.includes(page)) return Response.json({ ok: false }, { status: 404, headers });
  return Response.json({ ok: true, ...(await publicSite(getDb(), page)) }, { headers: { ...headers, "Cache-Control": "no-store" } });
}
