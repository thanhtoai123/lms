import { NextResponse } from "next/server";
import { getDb } from "@satarobo/db";
import { createLead, leadInput } from "@satarobo/api";

/**
 * POST /api/public/leads — endpoint cho form "Đặt buổi học thử" trên website / landing page / Zalo Mini App.
 * Bảo vệ: honeypot field `website`, rate-limit theo IP (in-memory; production dùng Upstash), CORS chỉ domain cho phép.
 */
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) return true;
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

const ALLOWED_ORIGINS = (process.env.PUBLIC_FORM_ORIGINS ?? "https://satarobo.vn,http://localhost:3000").split(",").map((s) => s.trim());

function cors(origin: string | null) {
  const ok = origin && ALLOWED_ORIGINS.includes(origin);
  return { "Access-Control-Allow-Origin": ok ? origin! : ALLOWED_ORIGINS[0]!, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" };
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req.headers.get("origin")) });
}

export async function POST(req: Request) {
  const headers = cors(req.headers.get("origin"));
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (limited(ip)) return NextResponse.json({ ok: false, error: "Bạn gửi quá nhiều lần, vui lòng thử lại sau." }, { status: 429, headers });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400, headers });
  }
  if (typeof body.website === "string" && body.website.length > 0) return NextResponse.json({ ok: true }, { headers }); // honeypot: bot điền → giả vờ thành công

  const parsed = leadInput.safeParse({
    parentName: body.hoTenPh ?? body.parentName,
    phone: body.sdt ?? body.phone,
    email: body.email || null,
    childName: body.hoTenCon ?? body.childName ?? null,
    childGrade: body.lop ? Number(body.lop) : (body.childGrade as number | undefined) ?? null,
    school: body.truong ?? body.school ?? null,
    interestedCourseId: body.interestedCourseId ?? null,
    centerId: body.centerId ?? null,
    source: (body.source as string | undefined) ?? "web-form",
    utmSource: body.utm_source ?? body.utmSource ?? null,
    utmMedium: body.utm_medium ?? body.utmMedium ?? null,
    utmCampaign: body.utm_campaign ?? body.utmCampaign ?? null,
    notes: body.ghiChu ?? body.notes ?? null,
    consent: body.consent === true || body.consent === "on" || body.consent === "1",
  });
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Vui lòng kiểm tra họ tên và số điện thoại", issues: parsed.error.flatten().fieldErrors }, { status: 422, headers });

  try {
    const r = await createLead(getDb(), parsed.data, null);
    return NextResponse.json({ ok: true, duplicated: r.duplicated }, { headers });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400, headers });
  }
}
