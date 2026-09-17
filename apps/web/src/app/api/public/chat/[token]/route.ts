import { getDb } from "@satarobo/db";
import { portalPost, portalThread } from "@satarobo/api";
import { rateLimited } from "@/lib/route-ctx";

/** Cổng tin nhắn phụ huynh — mã trong liên kết là quyền truy cập */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await portalThread(getDb(), token);
  return t ? Response.json(t, { headers: { "Cache-Control": "no-store" } }) : Response.json({ error: "Liên kết không đúng" }, { status: 404 });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?";
  if (rateLimited(`chat|${ip}|${token}`, 20, 10 * 60_000)) return Response.json({ ok: false, error: "Gửi quá nhiều tin, thử lại sau ít phút" }, { status: 429 });
  let b: { body?: unknown };
  try { b = (await req.json()) as { body?: unknown }; } catch { return Response.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 }); }
  const r = await portalPost(getDb(), token, typeof b.body === "string" ? b.body : "");
  return Response.json(r, { status: r.ok ? 200 : r.status });
}
