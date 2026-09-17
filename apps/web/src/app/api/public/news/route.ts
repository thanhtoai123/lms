import { getDb } from "@satarobo/db";
import { publicPosts } from "@satarobo/api";
import { POST_CATEGORIES, type PostCategory } from "@satarobo/core";
import { publicCors } from "@/lib/public-cors";

/** GET /api/public/news?category=&page= — tin đã đăng cho website */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const cat = u.searchParams.get("category");
  const r = await publicPosts(getDb(), { category: POST_CATEGORIES.includes(cat as PostCategory) ? (cat as PostCategory) : undefined, page: Math.max(1, Number(u.searchParams.get("page")) || 1) });
  return Response.json(r, { headers: { ...publicCors(req.headers.get("origin"), "GET, OPTIONS"), "Cache-Control": "public, max-age=60" } });
}
