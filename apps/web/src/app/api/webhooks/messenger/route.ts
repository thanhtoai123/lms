import { getDb } from "@satarobo/db";
import { ingestExternal, logWebhook, metaSignatureOk, parseMessengerPayload } from "@satarobo/api";
import { clientIp, sharedRateLimit } from "@/lib/route-ctx";

/**
 * Webhook Facebook Messenger (trang Sata Robo).
 * GET: xác minh (hub.verify_token = META_VERIFY_TOKEN). POST: kiểm tra X-Hub-Signature-256 bằng META_APP_SECRET, lưu tin khách gửi.
 * Luôn trả 200 nhanh cho sự kiện hợp lệ để Meta không gửi lại.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const token = process.env.META_VERIFY_TOKEN;
  if (token && u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === token) {
    return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const db = getDb();
  const raw = await req.text();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  // Trần rộng, chỉ chặn đợt bắn dồn; Meta tự gửi lại khi gặp 429 nên không mất tin
  const gate = await sharedRateLimit("webhookIp", "ip", clientIp(req), "wh-messenger");
  if (gate) return Response.json({ ok: false, error: "Quá nhiều yêu cầu" }, { status: 429, headers: { "Retry-After": String(Math.max(1, gate.retryAfterSec)) } });
  if (!process.env.META_APP_SECRET) return Response.json({ ok: false, error: "Chưa cấu hình META_APP_SECRET" }, { status: 503 });
  let body: unknown = null;
  try { body = JSON.parse(raw); } catch { body = null; }
  if (!metaSignatureOk(raw, req.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET)) {
    await logWebhook(db, { source: "messenger", status: "rejected", httpStatus: 401, payload: body, error: "Sai chữ ký", ip });
    return Response.json({ ok: false }, { status: 401 });
  }
  const events = parseMessengerPayload(body);
  let stored = 0;
  for (const e of events) {
    const r = await ingestExternal(db, { channel: "messenger", senderId: e.senderId, text: e.text, messageId: e.messageId, at: e.at, attachments: e.attachments });
    if (r.ok && !r.duplicate) stored++;
  }
  await logWebhook(db, { source: "messenger", status: events.length && !stored ? "duplicate" : "processed", httpStatus: 200, payload: body, result: { events: events.length, stored }, ip });
  return Response.json({ ok: true, stored });
}
