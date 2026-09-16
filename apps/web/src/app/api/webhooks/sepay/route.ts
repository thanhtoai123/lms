import { NextResponse } from "next/server";
import { getDb } from "@satarobo/db";
import { ingestBankTx } from "@satarobo/api";
import { checkApiKey, parseSepayPayload } from "@satarobo/core";

/**
 * POST /api/webhooks/sepay — SePay gọi khi có biến động số dư.
 * Cấu hình trên SePay: xác thực "API Key", header `Authorization: Apikey <SEPAY_API_KEY>`.
 * SePay coi là thành công khi HTTP 200/201 và body {"success": true}; lỗi sẽ gửi lại (tối đa 7 lần).
 * Idempotent theo id giao dịch SePay → gửi lại không tạo trùng khoản thu.
 */
export async function POST(req: Request) {
  const key = process.env.SEPAY_API_KEY;
  if (!key) return NextResponse.json({ success: false, error: "Webhook chưa được cấu hình (SEPAY_API_KEY)" }, { status: 503 });
  if (!checkApiKey(req.headers.get("authorization"), key)) return NextResponse.json({ success: false, error: "Sai API key" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body không phải JSON" }, { status: 400 });
  }
  const parsed = parseSepayPayload(body);
  if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
  try {
    const r = await ingestBankTx(getDb(), parsed.tx, "sepay", body);
    return NextResponse.json({ success: true, duplicate: r.duplicate, status: r.status }, { status: r.duplicate ? 200 : 201 });
  } catch (e) {
    console.error("[sepay webhook]", e);
    // Trả 500 để SePay gửi lại sau
    return NextResponse.json({ success: false, error: "Lỗi xử lý, sẽ thử lại" }, { status: 500 });
  }
}
