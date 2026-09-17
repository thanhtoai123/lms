import { NextResponse } from "next/server";
import { getDb } from "@satarobo/db";
import { submitPublicSurvey } from "@satarobo/api";

const hits = new Map<string, number[]>();
function limited(key: string) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < 10 * 60_000);
  if (arr.length >= 10) return true;
  arr.push(now);
  hits.set(key, arr);
  return false;
}

/** POST /api/public/survey/[token] — phụ huynh gửi câu trả lời khảo sát (không cần đăng nhập, token là quyền) */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(token)) return NextResponse.json({ ok: false, error: "Liên kết không hợp lệ" }, { status: 404 });
  if (limited(`${ip}|${token}`)) return NextResponse.json({ ok: false, error: "Gửi quá nhiều lần, thử lại sau" }, { status: 429 });
  let body: { answers?: Record<string, string | number | null> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const answers = body.answers && typeof body.answers === "object" ? body.answers : {};
  const r = await submitPublicSurvey(getDb(), token, answers, ip);
  return NextResponse.json(r, { status: r.ok ? 200 : 422 });
}
