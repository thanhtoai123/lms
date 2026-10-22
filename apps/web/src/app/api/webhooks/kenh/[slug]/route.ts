import { getDb } from "@satarobo/db";
import { logWebhook, nhanSuKienKenh } from "@satarobo/api";
import { clientIp, sharedRateLimit, readCappedText, TOO_LARGE } from "@/lib/route-ctx";

/**
 * Webhook kênh chat ngoài (hiện dùng cho Zalo cá nhân chạy trên ZCRM).
 * Mỗi nick có một đường riêng `/api/webhooks/kenh/<slug>` và một bí mật riêng — mất một nick không
 * kéo theo nick khác. Nguyên văn payload luôn được ghi vào `webhook_events` để mở ra đối chiếu khi
 * công cụ đổi tên trường.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const db = getDb();
  const { slug } = await params;
  const ip = clientIp(req);
  // Trần theo IP với mục đích CỐ ĐỊNH (đặt theo slug thì kẻ gửi rác đổi slug là có bộ đếm mới), kiểm trước khi đọc thân
  const gate = await sharedRateLimit("webhookIp", "ip", ip, "wh-kenh");
  if (gate) return Response.json({ ok: false, error: "Quá nhiều yêu cầu" }, { status: 429, headers: { "Retry-After": String(Math.max(1, gate.retryAfterSec)) } });
  if (!/^[a-z0-9-]{3,64}$/i.test(slug)) return Response.json({ ok: false }, { status: 404 });
  const raw = await readCappedText(req, 256 * 1024);
  if (raw === null) return TOO_LARGE();

  let body: unknown = null;
  try { body = JSON.parse(raw); } catch { body = null; }
  const headers: Record<string, string> = {};
  for (const [k, v] of req.headers) headers[k.toLowerCase()] = v;
  // Không ghi header mang bí mật vào nhật ký
  const hdrSach = Object.fromEntries(Object.entries(headers).filter(([k]) => !/secret|signature|api-key|authorization|cookie/.test(k)));

  const r = await nhanSuKienKenh(db, { slug, raw, headers, body });
  if (!r.ok) {
    // Đường không tồn tại: không ghi nhật ký (không cho người lạ đổ dữ liệu vào bảng nhật ký)
    if (r.httpStatus === 404) return Response.json({ ok: false }, { status: 404 });
    await logWebhook(db, { source: "zalo_ca_nhan", externalId: slug, status: r.status, httpStatus: r.httpStatus, payload: body, headers: hdrSach, error: r.error, ip });
    return Response.json({ ok: false, error: r.error }, { status: r.httpStatus });
  }
  await logWebhook(db, {
    // Một nguồn chung cho mọi nick; nick nào nằm ở externalId để lọc và chạy lại khi cần
    source: "zalo_ca_nhan", externalId: slug,
    status: r.status === "ignored" ? "processed" : r.status,
    httpStatus: 200, payload: body, headers: hdrSach, result: r, ip,
  });
  return Response.json({ ok: true });
}
