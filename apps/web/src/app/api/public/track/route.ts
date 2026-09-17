import { getDb } from "@satarobo/db";
import { recordTrack, publicTrackingConfig } from "@satarobo/api";
import { rateLimited } from "@/lib/route-ctx";
import { publicCors } from "@/lib/public-cors";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: publicCors(req.headers.get("origin")) });
}

/** GET: cấu hình tracking công khai (Pixel / GA4 ID) */
export async function GET(req: Request) {
  return Response.json(await publicTrackingConfig(getDb()), { headers: { ...publicCors(req.headers.get("origin")), "Cache-Control": "public, max-age=300" } });
}

/** POST: sự kiện website first-party — không lưu IP, chỉ mã ẩn danh ngẫu nhiên */
export async function POST(req: Request) {
  const headers = publicCors(req.headers.get("origin"));
  let b: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 4000) return Response.json({ ok: false }, { status: 413, headers });
    b = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400, headers });
  }
  const anonId = typeof b.anonId === "string" ? b.anonId : "";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?";
  if (rateLimited(`trk|${anonId}`, 120, 10 * 60_000) || rateLimited(`trkip|${ip}`, 600, 10 * 60_000)) return Response.json({ ok: false, error: "Quá nhiều sự kiện" }, { status: 429, headers });
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const r = await recordTrack(getDb(), {
    event: String(b.event ?? ""), anonId, path: str(b.path) ?? "/", referrer: str(b.referrer),
    utmSource: str(b.utm_source), utmMedium: str(b.utm_medium), utmCampaign: str(b.utm_campaign),
  });
  return Response.json(r, { status: r.ok ? 200 : 422, headers });
}
