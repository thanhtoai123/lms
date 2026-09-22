import { NextResponse } from "next/server";
import { getDb } from "@satarobo/db";
import { parentSubmitRequest, parentCancelRequest } from "@satarobo/api";
import { clientIp, sharedRateLimit, tooManyResponse } from "@/lib/route-ctx";
import { parentFromRequest, sameOrigin } from "@/lib/parent-session";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Yêu cầu của phụ huynh (cổng /ph) — phạm vi theo PHIÊN phụ huynh, không nhận parentId từ máy khách.
 * POST { action: "create", kind: "absence" | "makeup", studentId, sessionId, needsMakeup?, reason? }
 *      { action: "cancel", id }
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: "Nguồn không hợp lệ" }, { status: 403 });
  const p = await parentFromRequest(req);
  if (!p) return NextResponse.json({ ok: false, error: "Phiên đăng nhập đã hết — đăng nhập lại" }, { status: 401 });
  const gate = await sharedRateLimit("parentActionUser", "user", p.id, "ph-action");
  if (gate) return tooManyResponse(gate, "gửi yêu cầu");
  let b: { action?: unknown; kind?: unknown; studentId?: unknown; sessionId?: unknown; needsMakeup?: unknown; reason?: unknown; id?: unknown };
  try { b = (await req.json()) as typeof b; } catch { return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 }); }
  const db = getDb();
  const ip = clientIp(req);
  if (b.action === "cancel") {
    const id = typeof b.id === "string" && UUID.test(b.id) ? b.id : null;
    if (!id) return NextResponse.json({ ok: false, error: "Thiếu yêu cầu" }, { status: 400 });
    const r = await parentCancelRequest(db, p.id, id, { ip });
    return NextResponse.json(r, { status: r.ok ? 200 : 422 });
  }
  if (b.action === "create") {
    const kind = b.kind === "absence" ? "absence" : b.kind === "makeup" ? "makeup" : null;
    if (!kind) return NextResponse.json({ ok: false, error: "Loại yêu cầu không hợp lệ" }, { status: 400 });
    const studentId = typeof b.studentId === "string" && UUID.test(b.studentId) ? b.studentId : null;
    const sessionId = typeof b.sessionId === "string" && UUID.test(b.sessionId) ? b.sessionId : null;
    if (!studentId || !sessionId) return NextResponse.json({ ok: false, error: "Thiếu học viên hoặc buổi học" }, { status: 400 });
    const r = await parentSubmitRequest(db, p.id, {
      kind, studentId, sessionId,
      needsMakeup: typeof b.needsMakeup === "boolean" ? b.needsMakeup : null,
      reason: typeof b.reason === "string" ? b.reason.slice(0, 500) : null,
    }, { ip });
    return NextResponse.json(r, { status: r.ok ? 200 : 422 });
  }
  return NextResponse.json({ ok: false, error: "Yêu cầu không hợp lệ" }, { status: 400 });
}
