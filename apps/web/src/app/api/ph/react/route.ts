import { NextResponse } from "next/server";
import { getDb } from "@satarobo/db";
import { parentReact } from "@satarobo/api";
import { isSessionReaction } from "@satarobo/core";
import { clientIp, sharedRateLimit, tooManyResponse } from "@/lib/route-ctx";
import { parentFromRequest, sameOrigin } from "@/lib/parent-session";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Phản hồi sau buổi (cảm xúc một chạm) của phụ huynh trên phiếu nhận xét.
 * POST { studentId, sessionId, reaction: "happy" | "ok" | "concern", note? }
 * "concern" → mở việc chăm sóc cho CSKH / QLL (trong dịch vụ, cùng transaction).
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: "Nguồn không hợp lệ" }, { status: 403 });
  const p = await parentFromRequest(req);
  if (!p) return NextResponse.json({ ok: false, error: "Phiên đăng nhập đã hết — đăng nhập lại" }, { status: 401 });
  const gate = await sharedRateLimit("parentActionUser", "user", p.id, "ph-action");
  if (gate) return tooManyResponse(gate, "gửi phản hồi");
  let b: { studentId?: unknown; sessionId?: unknown; reaction?: unknown; note?: unknown };
  try { b = (await req.json()) as typeof b; } catch { return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 }); }
  const reaction = b.reaction;
  const studentId = typeof b.studentId === "string" && UUID.test(b.studentId) ? b.studentId : null;
  const sessionId = typeof b.sessionId === "string" && UUID.test(b.sessionId) ? b.sessionId : null;
  if (!studentId || !sessionId || !isSessionReaction(reaction)) {
    return NextResponse.json({ ok: false, error: "Thiếu thông tin phản hồi" }, { status: 400 });
  }
  const r = await parentReact(getDb(), p.id, {
    studentId, sessionId, reaction, note: typeof b.note === "string" ? b.note.slice(0, 400) : null,
  }, { ip: clientIp(req) });
  return NextResponse.json(r, { status: r.ok ? 200 : 422 });
}
