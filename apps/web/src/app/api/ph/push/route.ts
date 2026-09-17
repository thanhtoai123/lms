import { NextResponse } from "next/server";
import { getDb } from "@satarobo/db";
import { pushStatus, subscribePush, unsubscribePush } from "@satarobo/api";
import { parentFromRequest, sameOrigin } from "@/lib/parent-session";

export async function GET(req: Request) {
  const p = await parentFromRequest(req);
  if (!p) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  return NextResponse.json(await pushStatus(getDb(), p.id), { headers: { "Cache-Control": "no-store" } });
}

/** POST { action: "subscribe", subscription: { endpoint, keys: { p256dh, auth } } } | { action: "unsubscribe", endpoint } */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 });
  const p = await parentFromRequest(req);
  if (!p) return NextResponse.json({ ok: false, error: "Chưa đăng nhập" }, { status: 401 });
  let b: { action?: string; endpoint?: string; subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } };
  try { b = (await req.json()) as typeof b; } catch { return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 }); }
  const db = getDb();
  if (b.action === "subscribe") {
    const s = b.subscription;
    if (!s || typeof s.endpoint !== "string" || typeof s.keys?.p256dh !== "string" || typeof s.keys?.auth !== "string") return NextResponse.json({ ok: false, error: "Thiếu thông tin đăng ký" }, { status: 400 });
    const r = await subscribePush(db, p.id, { endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, userAgent: req.headers.get("user-agent") });
    return NextResponse.json(r, { status: r.ok ? 200 : 422 });
  }
  if (b.action === "unsubscribe" && typeof b.endpoint === "string") return NextResponse.json(await unsubscribePush(db, p.id, b.endpoint.slice(0, 1000)));
  return NextResponse.json({ ok: false, error: "action không hợp lệ" }, { status: 400 });
}
