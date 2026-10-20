import { NextResponse } from "next/server";
import { getDb } from "@satarobo/db";
import { parentSetChildAvatar, parentRemoveChildAvatar } from "@satarobo/api";
import { STUDENT_AVATAR_MAX } from "@satarobo/core";
import { clientIp, sharedRateLimit, tooManyResponse } from "@/lib/route-ctx";
import { parentFromRequest, sameOrigin } from "@/lib/parent-session";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Phụ huynh đổi ảnh đại diện của con (cổng /ph) — phạm vi theo PHIÊN phụ huynh; học viên phải là con của chính phụ huynh.
 * POST multipart { studentId, file } · DELETE { studentId }
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: "Nguồn không hợp lệ" }, { status: 403 });
  const p = await parentFromRequest(req);
  if (!p) return NextResponse.json({ ok: false, error: "Phiên đăng nhập đã hết — đăng nhập lại" }, { status: 401 });
  const gate = await sharedRateLimit("parentActionUser", "user", p.id, "ph-avatar");
  if (gate) return tooManyResponse(gate, "đổi ảnh");
  if (Number(req.headers.get("content-length") ?? 0) > STUDENT_AVATAR_MAX + 100_000) return NextResponse.json({ ok: false, error: "Ảnh tối đa 2MB" }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const studentId = String(form?.get("studentId") ?? "");
  const file = form?.get("file");
  if (!UUID.test(studentId)) return NextResponse.json({ ok: false, error: "Thiếu học viên" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Chọn ảnh" }, { status: 400 });
  const r = await parentSetChildAvatar(getDb(), p.id, { studentId, mime: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }, { ip: clientIp(req) });
  return NextResponse.json(r, { status: r.ok ? 200 : 422 });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: "Nguồn không hợp lệ" }, { status: 403 });
  const p = await parentFromRequest(req);
  if (!p) return NextResponse.json({ ok: false, error: "Phiên đăng nhập đã hết — đăng nhập lại" }, { status: 401 });
  let b: { studentId?: unknown };
  try { b = (await req.json()) as typeof b; } catch { return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 }); }
  const studentId = typeof b.studentId === "string" && UUID.test(b.studentId) ? b.studentId : null;
  if (!studentId) return NextResponse.json({ ok: false, error: "Thiếu học viên" }, { status: 400 });
  const r = await parentRemoveChildAvatar(getDb(), p.id, studentId, { ip: clientIp(req) });
  return NextResponse.json(r, { status: r.ok ? 200 : 422 });
}
