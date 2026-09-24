import { getDb } from "@satarobo/db";
import { logWebhook, nhanSuKienKenh } from "@satarobo/api";
import { clientIp, sharedRateLimit } from "@/lib/route-ctx";

/**
 * Webhook kênh chat ngoài (hiện dùng cho Zalo cá nhân chạy trên ZCRM).
 * Mỗi nick có một đường riêng `/api/webhooks/kenh/<slug>` và một bí mật riêng — mất một nick không
 * kéo theo nick khác. Nguyên văn payload luôn được ghi vào `webhook_events` để mở ra đối chiếu khi
 * công cụ đổi tên trường.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const db = getDb();
  const { slug } = await params;
  const raw = await req.text();
  const ip = clientIp(req);
  const gate = await sharedRateLimit("webhookIp", "ip", ip, `wh-kenh-${slug}`);
  if (gate) return Response.json({ ok: false, error: "Quá nhiều yêu cầu" }, { status: 429, headers: { "Retry-After": String(Math.max(1, gate.retryAfterSec)) } });

  let body: unknown = null;
  try { body = JSON.parse(raw); } catch { body = null; }
  const headers: Record<string, string> = {};
  for (const [k, v] of req.headers) headers[k.toLowerCase()] = v;
  // Không ghi header mang bí mật vào nhật ký
  const hdrSach = Object.fromEntries(Object.entries(headers).filter(([k]) => !/secret|signature|api-key|authorization|cookie/.test(k)));

  const r = await nhanSuKienKenh(db, { slug, raw, headers, body });
  if (!r.ok) {
    await logWebhook(db, { source: `kenh:${slug}`, status: r.status, httpStatus: r.httpStatus, payload: body, headers: hdrSach, error: r.error, ip });
    return Response.json({ ok: false, error: r.error }, { status: r.httpStatus });
  }
  await logWebhook(db, {
    source: `kenh:${slug}`,
    status: r.status === "ignored" ? "processed" : r.status,
    httpStatus: 200, payload: body, headers: hdrSach, result: r, ip,
  });
  return Response.json({ ok: true });
}
