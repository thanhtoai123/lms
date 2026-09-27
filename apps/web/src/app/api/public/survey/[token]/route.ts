import { ipTuHeader } from "@satarobo/core";
import { NextResponse } from "next/server";
import { getDb } from "@satarobo/db";
import { submitPublicSurvey } from "@satarobo/api";
import { sharedRateLimited } from "@/lib/route-ctx";


/** POST /api/public/survey/[token] — phụ huynh gửi câu trả lời khảo sát (không cần đăng nhập, token là quyền) */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = ipTuHeader(req.headers, process.env);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(token)) return NextResponse.json({ ok: false, error: "Liên kết không hợp lệ" }, { status: 404 });
  if (await sharedRateLimited("publicSurveyIp", "token", `${ip}|${token}`)) return NextResponse.json({ ok: false, error: "Gửi quá nhiều lần, thử lại sau" }, { status: 429 });
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
