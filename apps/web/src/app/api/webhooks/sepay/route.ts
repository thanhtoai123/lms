import { NextResponse } from "next/server";
import { getDb } from "@satarobo/db";
import { ingestBankTx, logWebhook } from "@satarobo/api";
import { checkApiKey, parseSepayPayload, ipTuHeader, sepaySignatureOk } from "@satarobo/core";
import { clientIp, sharedRateLimit } from "@/lib/route-ctx";
import { webLogger } from "@/lib/logger";

/**
 * POST /api/webhooks/sepay — SePay gọi khi có biến động số dư (tài liệu: developer.sepay.vn → SePay Webhooks).
 *
 * Xác thực (chọn một trên SePay, bước "Bảo mật" khi tạo webhook):
 *  - HMAC-SHA256 (khuyến nghị): đặt `SEPAY_WEBHOOK_SECRET` = Secret Key SePay cấp. Kiểm `X-SePay-Signature`
 *    trên đúng từng byte body + `X-SePay-Timestamp`. Khi đã đặt biến này, API Key KHÔNG còn được chấp nhận.
 *  - API Key: đặt `SEPAY_API_KEY` (≥ 24 ký tự); SePay gửi `Authorization: Apikey <khoá>`.
 *
 * SePay chỉ coi là THÀNH CÔNG khi HTTP 200/201 và body đúng `{"success": true}` trong 30 giây; trả khác đi
 * (kể cả thêm trường) là thất bại và SePay gửi lại 7 lần trong ~33 phút. Gửi lại / phát lại không tạo trùng
 * khoản thu (chống trùng theo `id` giao dịch). Mọi lần gọi được ghi ở Hệ thống → Chạy lại webhook.
 */
const OK = () => NextResponse.json({ success: true }, { status: 200 });

export async function POST(req: Request) {
  const db = getDb();
  const headers = Object.fromEntries(req.headers.entries());
  const ip = ipTuHeader(req.headers, process.env);
  // Trần rất rộng, chỉ để chặn đợt bắn dồn vào cổng webhook; 429 để nhà cung cấp tự gửi lại sau.
  const gate = await sharedRateLimit("webhookIp", "ip", clientIp(req), "wh-sepay");
  if (gate) return NextResponse.json({ success: false, error: "Quá nhiều yêu cầu" }, { status: 429, headers: { "Retry-After": String(Math.max(1, gate.retryAfterSec)) } });

  const secret = process.env.SEPAY_WEBHOOK_SECRET?.trim() || undefined;
  const key = process.env.SEPAY_API_KEY?.trim() || undefined;
  if (!secret && !key) return NextResponse.json({ success: false, error: "Webhook chưa được cấu hình (SEPAY_WEBHOOK_SECRET hoặc SEPAY_API_KEY)" }, { status: 503 });

  // Đọc body THÔ: chữ ký HMAC tính trên đúng từng byte, không được parse rồi stringify lại
  const raw = await req.text();
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  const authed = secret
    ? sepaySignatureOk(raw, req.headers.get("x-sepay-signature"), req.headers.get("x-sepay-timestamp"), secret)
    : checkApiKey(req.headers.get("authorization"), key);
  if (!authed) {
    const error = secret ? "Sai chữ ký HMAC hoặc dấu thời gian quá cũ" : "Sai API key";
    await logWebhook(db, { source: "sepay", status: "rejected", httpStatus: 401, payload: body, headers, error, ip });
    return NextResponse.json({ success: false, error }, { status: 401 });
  }
  if (body === null) {
    await logWebhook(db, { source: "sepay", status: "rejected", httpStatus: 400, payload: null, headers, error: "Body không phải JSON", ip });
    return NextResponse.json({ success: false, error: "Body không phải JSON" }, { status: 400 });
  }
  const parsed = parseSepayPayload(body);
  if (!parsed.ok) {
    await logWebhook(db, { source: "sepay", status: "rejected", httpStatus: 400, payload: body, headers, error: parsed.error, ip });
    return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
  }
  try {
    const r = await ingestBankTx(db, parsed.tx, "sepay", body);
    await logWebhook(db, { source: "sepay", status: r.duplicate ? "duplicate" : "processed", httpStatus: 200, payload: body, headers, externalId: parsed.tx.externalId, result: { status: r.status, note: r.note }, ip });
    return OK();
  } catch (e) {
    // Lỗi CSDL mang theo câu SQL và giá trị tham số (tên khách, SĐT) → phải qua bộ che PII
    webLogger.child("sepay-webhook").error("xử lý giao dịch thất bại", { err: e, externalId: parsed.tx.externalId });
    await logWebhook(db, { source: "sepay", status: "failed", httpStatus: 500, payload: body, headers, externalId: parsed.tx.externalId, error: (e as Error).message, ip });
    // Trả 500 để SePay gửi lại sau
    return NextResponse.json({ success: false, error: "Lỗi xử lý, sẽ thử lại" }, { status: 500 });
  }
}
