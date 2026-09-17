import { getDb } from "@satarobo/db";
import { publicPost } from "@satarobo/api";
import { publicCors } from "@/lib/public-cors";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const headers = publicCors(req.headers.get("origin"), "GET, OPTIONS");
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) return Response.json({ ok: false }, { status: 404, headers });
  const p = await publicPost(getDb(), slug);
  if (!p) return Response.json({ ok: false }, { status: 404, headers });
  return Response.json({ ok: true, post: p }, { headers: { ...headers, "Cache-Control": "public, max-age=60" } });
}
