import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decodeJwtPayload } from "@satarobo/core";
import { ACCESS_COOKIE, REFRESH_COOKIE, cookieOptions, enrollTotp, listFactors, supabaseOn, unenrollFactor, verifyTotp } from "@/lib/auth-session";
import { rateLimited } from "@/lib/route-ctx";

/** POST { action: "status" | "enroll" | "verify" | "unenroll", factorId?, code? } — xác thực 2 lớp cho nhân sự đăng nhập Supabase */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return NextResponse.json({ ok: false }, { status: 403 });
  if (!supabaseOn()) return NextResponse.json({ ok: false, error: "Hệ thống chưa bật đăng nhập Supabase" }, { status: 400 });
  const c = await cookies();
  const access = c.get(ACCESS_COOKIE)?.value;
  if (!access) return NextResponse.json({ ok: false, error: "Chưa đăng nhập" }, { status: 401 });
  const sub = decodeJwtPayload(access)?.sub ?? "x";
  let b: { action?: string; factorId?: string; code?: string };
  try { b = (await req.json()) as typeof b; } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const aal = decodeJwtPayload(access)?.aal ?? "aal1";
  if (b.action === "status") {
    const f = await listFactors(access);
    if (!f) return NextResponse.json({ ok: false, error: "Phiên đăng nhập không hợp lệ — đăng nhập lại" }, { status: 401 });
    return NextResponse.json({ ok: true, aal, factors: f.map((x) => ({ id: x.id, status: x.status, name: x.friendly_name ?? null, createdAt: x.created_at ?? null })) });
  }
  if (b.action === "enroll") {
    if (rateLimited(`mfa-enroll|${sub}`, 5, 60 * 60_000)) return NextResponse.json({ ok: false, error: "Thử lại sau" }, { status: 429 });
    const f = await listFactors(access);
    for (const x of f ?? []) if (x.status !== "verified") await unenrollFactor(access, x.id);
    const r = await enrollTotp(access);
    return "error" in r ? NextResponse.json({ ok: false, error: r.error }, { status: 400 }) : NextResponse.json({ ok: true, factorId: r.id, qr: r.qr, secret: r.secret });
  }
  if (b.action === "verify" && typeof b.factorId === "string" && /^\d{6}$/.test(b.code ?? "")) {
    if (rateLimited(`mfa-verify|${sub}`, 10, 15 * 60_000)) return NextResponse.json({ ok: false, error: "Nhập sai quá nhiều — thử lại sau 15 phút" }, { status: 429 });
    const r = await verifyTotp(access, b.factorId, b.code!);
    if ("error" in r) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    c.set(ACCESS_COOKIE, r.access_token, cookieOptions("access", r.expires_in));
    c.set(REFRESH_COOKIE, r.refresh_token, cookieOptions("refresh"));
    return NextResponse.json({ ok: true });
  }
  if (b.action === "unenroll" && typeof b.factorId === "string") {
    if (aal !== "aal2") return NextResponse.json({ ok: false, error: "Xác thực 2 lớp trước khi gỡ thiết bị" }, { status: 403 });
    const e = await unenrollFactor(access, b.factorId);
    return e ? NextResponse.json({ ok: false, error: e }, { status: 400 }) : NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: "Yêu cầu không hợp lệ" }, { status: 400 });
}
