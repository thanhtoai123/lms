import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { idleExpired } from "@satarobo/core";
import { IDLE_COOKIE, SEEN_COOKIE, hasStaffSession, seenCookieOptions } from "@/lib/auth-session";

/** POST — trình duyệt báo người dùng vẫn đang thao tác (gõ phím, bấm chuột) để gia hạn thời gian không thao tác */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return NextResponse.json({ ok: false }, { status: 403 });
  const c = await cookies();
  const get = (n: string) => c.get(n)?.value;
  if (!hasStaffSession(get)) return NextResponse.json({ ok: true, tracked: false });
  const idle = Number(get(IDLE_COOKIE)) || 60;
  if (idleExpired(Number(get(SEEN_COOKIE)) || null, Date.now(), idle)) return NextResponse.json({ ok: false, expired: true }, { status: 401 });
  c.set(SEEN_COOKIE, String(Date.now()), seenCookieOptions());
  return NextResponse.json({ ok: true, tracked: true, idleMinutes: idle });
}
