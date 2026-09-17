import { getDb } from "@satarobo/db";
import { publicJobs } from "@satarobo/api";
import { publicCors } from "@/lib/public-cors";

/** GET /api/public/jobs — tin tuyển dụng đang mở (cho website ngoài) */
export async function GET(req: Request) {
  const items = await publicJobs(getDb());
  return Response.json({ items }, { headers: { ...publicCors(req.headers.get("origin"), "GET, OPTIONS"), "Cache-Control": "public, max-age=120" } });
}
