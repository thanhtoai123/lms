import { getDb } from "@satarobo/db";
import { logWebhook, xuLySuKienOa, zaloSignatureOk } from "@satarobo/api";
import { clientIp, sharedRateLimit } from "@/lib/route-ctx";

/** Webhook Zalo OA: kiểm tra X-ZEvent-Signature (ZALO_APP_ID + ZALO_OA_SECRET), lưu tin người dùng gửi tới OA */
export async function POST(req: Request) {
  const db = getDb();
  const raw = await req.text();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  // Trần rộng, chỉ chặn đợt bắn dồn; Zalo gửi lại khi gặp 429 nên không mất tin
  const gate = await sharedRateLimit("webhookIp", "ip", clientIp(req), "wh-zalo");
  if (gate) return Response.json({ ok: false, error: "Quá nhiều yêu cầu" }, { status: 429, headers: { "Retry-After": String(Math.max(1, gate.retryAfterSec)) } });
  if (!process.env.ZALO_OA_SECRET || !process.env.ZALO_APP_ID) return Response.json({ ok: false, error: "Chưa cấu hình Zalo OA" }, { status: 503 });
  let body: unknown = null;
  try { body = JSON.parse(raw); } catch { body = null; }
  const ts = (body as { timestamp?: string | number } | null)?.timestamp ?? null;
  if (!zaloSignatureOk(raw, req.headers.get("x-zevent-signature"), process.env.ZALO_APP_ID, process.env.ZALO_OA_SECRET, ts)) {
    await logWebhook(db, { source: "zalo", status: "rejected", httpStatus: 401, payload: body, error: "Sai chữ ký", ip });
    return Response.json({ ok: false }, { status: 401 });
  }
  // Không chỉ tin nhắn: quan tâm/bỏ quan tâm OA, khách tự chia sẻ SĐT, ZNS đã tới máy — xem services/zaloOaEvents
  const r = await xuLySuKienOa(db, body);
  await logWebhook(db, { source: "zalo", status: r.ok ? (r.duplicate ? "duplicate" : "processed") : "rejected", httpStatus: 200, payload: body, result: r, ip });
  return Response.json({ ok: true });
}
