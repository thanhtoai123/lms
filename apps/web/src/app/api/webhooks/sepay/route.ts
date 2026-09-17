import { NextResponse } from "next/server";
import { getDb } from "@satarobo/db";
import { ingestBankTx, logWebhook } from "@satarobo/api";
import { checkApiKey, parseSepayPayload } from "@satarobo/core";

/**
 * POST /api/webhooks/sepay — SePay gọi khi có biến động số dư.
 * Cấu hình trên SePay: xác thực "API Key", header `Authorization: Apikey <SEPAY_API_KEY>`.
 * SePay coi là thành công khi HTTP 200/201 và body {"success": true}; lỗi sẽ gửi lại (tối đa 7 lần).
 * Idempotent theo id giao dịch SePay → gửi lại không tạo trùng khoản thu. Mọi lần gọi được ghi ở Hệ thống → Chạy lại webhook.
 */
export async function POST(req: Request) {
  const db = getDb();
  const headers = Object.fromEntries(req.headers.entries());
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const key = process.env.SEPAY_API_KEY;
  if (!key) return NextResponse.json({ success: false, error: "Webhook chưa được cấu hình (SEPAY_API_KEY)" }, { status: 503 });
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  if (!checkApiKey(req.headers.get("authorization"), key)) {
    await logWebhook(db, { source: "sepay", status: "rejected", httpStatus: 401, payload: body, headers, error: "Sai API key", ip });
    return NextResponse.json({ success: false, error: "Sai API key" }, { status: 401 });
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
    await logWebhook(db, { source: "sepay", status: r.duplicate ? "duplicate" : "processed", httpStatus: r.duplicate ? 200 : 201, payload: body, headers, externalId: parsed.tx.externalId, result: { status: r.status, note: r.note }, ip });
    return NextResponse.json({ success: true, duplicate: r.duplicate, status: r.status }, { status: r.duplicate ? 200 : 201 });
  } catch (e) {
    console.error("[sepay webhook]", e);
    await logWebhook(db, { source: "sepay", status: "failed", httpStatus: 500, payload: body, headers, externalId: parsed.tx.externalId, error: (e as Error).message, ip });
    // Trả 500 để SePay gửi lại sau
    return NextResponse.json({ success: false, error: "Lỗi xử lý, sẽ thử lại" }, { status: 500 });
  }
}
