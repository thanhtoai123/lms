import { NextResponse } from "next/server";
import { getDb } from "@satarobo/db";
import { ParentPortal } from "@satarobo/api";
import { rateLimited } from "@/lib/route-ctx";
import { PH_COOKIE, sameOrigin } from "@/lib/parent-session";

/** POST { action: "otp", phone } → gửi mã; { action: "login", phone, method: "otp"|"code", code } → đặt cookie phiên */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: "Nguồn không hợp lệ" }, { status: 403 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  let b: { action?: string; phone?: string; method?: string; code?: string };
  try { b = (await req.json()) as typeof b; } catch { return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 }); }
  const phone = typeof b.phone === "string" ? b.phone.slice(0, 20) : "";
  const db = getDb();
  if (b.action === "otp") {
    if (rateLimited(`photp|${ip}`, 10, 60 * 60_000)) return NextResponse.json({ ok: false, error: "Thử lại sau" }, { status: 429 });
    const r = await ParentPortal.parentRequestOtp(db, { phone, ip, userAgent: req.headers.get("user-agent") });
    return NextResponse.json(r, { status: r.ok ? 200 : 429 });
  }
  if (b.action === "login") {
    if (rateLimited(`phlogin|${ip}`, 20, 15 * 60_000)) return NextResponse.json({ ok: false, error: "Thử lại sau ít phút" }, { status: 429 });
    const method = b.method === "code" ? "code" : "otp";
    const r = await ParentPortal.parentLogin(db, { phone, method, code: String(b.code ?? "").trim().slice(0, 10), ip, userAgent: req.headers.get("user-agent") });
    if (!r.ok) return NextResponse.json(r, { status: 401 });
    const res = NextResponse.json({ ok: true, firstLogin: r.firstLogin });
    res.cookies.set(PH_COOKIE, r.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: r.expiresAt });
    return res;
  }
  return NextResponse.json({ ok: false, error: "action không hợp lệ" }, { status: 400 });
}
