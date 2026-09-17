import { NextResponse } from "next/server";
import { getDb } from "@satarobo/db";
import { ParentPortal } from "@satarobo/api";
import { CONSENT_PURPOSES, type ConsentPurpose } from "@satarobo/core";
import { parentFromRequest, sameOrigin } from "@/lib/parent-session";

/** POST { action: "consent", purpose, granted } | { action: "revoke", sessionId } */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 });
  const p = await parentFromRequest(req);
  if (!p) return NextResponse.json({ ok: false, error: "Chưa đăng nhập" }, { status: 401 });
  let b: { action?: string; purpose?: string; granted?: boolean; sessionId?: string };
  try { b = (await req.json()) as typeof b; } catch { return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 }); }
  const db = getDb();
  if (b.action === "consent" && CONSENT_PURPOSES.includes(b.purpose as ConsentPurpose) && typeof b.granted === "boolean") {
    const r = await ParentPortal.setParentConsent(db, p.id, b.purpose as ConsentPurpose, b.granted);
    return NextResponse.json(r, { status: r.ok ? 200 : 422 });
  }
  if (b.action === "revoke" && typeof b.sessionId === "string" && /^[0-9a-f-]{36}$/i.test(b.sessionId)) {
    await ParentPortal.revokeParentSession(db, p.id, b.sessionId);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: "Yêu cầu không hợp lệ" }, { status: 400 });
}
