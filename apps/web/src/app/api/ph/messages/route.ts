import { NextResponse } from "next/server";
import { getDb } from "@satarobo/db";
import { parentPost, parentStart, parentThread } from "@satarobo/api";
import { rateLimited } from "@/lib/route-ctx";
import { parentFromRequest, sameOrigin } from "@/lib/parent-session";

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: Request) {
  const p = await parentFromRequest(req);
  if (!p) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Thiếu id" }, { status: 400 });
  const t = await parentThread(getDb(), p.id, id);
  return t ? NextResponse.json(t, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
}

/** POST { id, body } gửi tin; { studentId, subject, body } mở câu hỏi mới */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 });
  const p = await parentFromRequest(req);
  if (!p) return NextResponse.json({ ok: false, error: "Chưa đăng nhập" }, { status: 401 });
  if (rateLimited(`phmsg|${p.id}`, 30, 10 * 60_000)) return NextResponse.json({ ok: false, error: "Gửi quá nhiều tin, thử lại sau" }, { status: 429 });
  let b: { id?: string; studentId?: string; subject?: string; body?: string };
  try { b = (await req.json()) as typeof b; } catch { return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 }); }
  const db = getDb();
  if (b.id && UUID.test(b.id)) {
    const r = await parentPost(db, p.id, b.id, String(b.body ?? ""));
    return NextResponse.json(r, { status: r.ok ? 200 : 422 });
  }
  if (b.studentId && UUID.test(b.studentId)) {
    const r = await parentStart(db, p.id, { studentId: b.studentId, subject: String(b.subject ?? "").slice(0, 150), body: String(b.body ?? "") });
    return NextResponse.json(r, { status: r.ok ? 200 : 422 });
  }
  return NextResponse.json({ ok: false, error: "Thiếu thông tin" }, { status: 400 });
}
