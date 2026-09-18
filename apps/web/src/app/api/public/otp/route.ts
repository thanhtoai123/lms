import { NextResponse } from "next/server";
import { getDb } from "@satarobo/db";
import { requestOtp, verifyOtp } from "@satarobo/api";
import { OTP_PURPOSES, type OtpPurpose } from "@satarobo/core";
import { rateLimited } from "@/lib/route-ctx";

/**
 * POST /api/public/otp — { action: "request" | "verify", phone, purpose, code? }
 * Giới hạn: 1 mã / 60 giây, 3 mã / 15 phút mỗi SĐT, 10 mã / giờ mỗi IP; sai 5 lần khoá mã. Mã chỉ lưu dạng băm.
 */
export async function POST(req: Request) {
  let body: { action?: string; phone?: string; purpose?: string; code?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const purpose = OTP_PURPOSES.includes(body.purpose as OtpPurpose) ? (body.purpose as OtpPurpose) : null;
  if (!purpose || typeof body.phone !== "string") return NextResponse.json({ ok: false, error: "Thiếu số điện thoại / mục đích" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  // Trần theo IP ngay ở cửa ngõ (lớp trong CSDL vẫn giữ trần theo SĐT / mục đích)
  if (rateLimited(`otp|${ip ?? "unknown"}`, 30, 60 * 60_000)) {
    return NextResponse.json({ ok: false, error: "Gửi quá nhiều lần, thử lại sau" }, { status: 429 });
  }
  const db = getDb();
  if (body.action === "request") {
    const r = await requestOtp(db, { phone: body.phone, purpose, ip, userAgent: req.headers.get("user-agent") });
    return NextResponse.json(r, { status: r.ok ? 200 : "retryAfterSec" in r && r.retryAfterSec ? 429 : 422 });
  }
  if (body.action === "verify") {
    const r = await verifyOtp(db, { phone: body.phone, purpose, code: String(body.code ?? "") });
    return NextResponse.json(r, { status: r.ok ? 200 : 422 });
  }
  return NextResponse.json({ ok: false, error: "action phải là request hoặc verify" }, { status: 400 });
}
