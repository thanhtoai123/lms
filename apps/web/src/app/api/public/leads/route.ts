import { NextResponse } from "next/server";
import { getDb } from "@satarobo/db";
import { createLead, mapPublicLeadBody, logWebhook, recordTrack, publicTrackingConfig } from "@satarobo/api";
import { clientSafeMessage, fbcFromUrl, ipTuHeader, metaCapiLeadEvent } from "@satarobo/core";
import { sharedRateLimited } from "@/lib/route-ctx";

/**
 * POST /api/public/leads — endpoint cho form "Đặt buổi học thử" trên website / landing page / Zalo Mini App.
 * Bảo vệ: honeypot field `website`, rate-limit theo IP dùng chung mọi bản sao (bảng rate_limits), CORS chỉ domain cho phép.
 */

const ALLOWED_ORIGINS = (process.env.PUBLIC_FORM_ORIGINS ?? "https://thsteam.edu.vn,https://www.thsteam.edu.vn,http://localhost:3000").split(",").map((s) => s.trim());

function cors(origin: string | null) {
  const ok = origin && ALLOWED_ORIGINS.includes(origin);
  return { "Access-Control-Allow-Origin": ok ? origin! : ALLOWED_ORIGINS[0]!, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" };
}

/**
 * Meta Conversions API: gửi "Lead" từ máy chủ, cùng event_id với Pixel (Meta tự khử trùng lặp). Chỉ khi có
 * META_CAPI_TOKEN, đã nhập Pixel ID ở Quản trị → Marketing và phụ huynh đã ĐỒNG Ý đo lường quảng cáo trên website.
 * Lỗi / quá 4 giây không ảnh hưởng việc tạo lead; kết quả ghi ở nhật ký webhook (nguồn meta_capi).
 */
async function sendMetaCapi(db: ReturnType<typeof getDb>, req: Request, body: Record<string, unknown>, ip: string, phone: string, interest: string | null) {
  const token = process.env.META_CAPI_TOKEN;
  if (!token || body.adsConsent !== true || typeof body.eventId !== "string") return;
  const cfg = await publicTrackingConfig(db).catch(() => null);
  const pixel = cfg?.trackingEnabled && cfg.metaPixelId && /^\d{10,20}$/.test(cfg.metaPixelId) ? cfg.metaPixelId : null;
  if (!pixel) return;
  const url = typeof body.landingPage === "string" ? body.landingPage : req.headers.get("referer") ?? "";
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const event = await metaCapiLeadEvent({
    eventId: body.eventId, eventTimeSec: Date.now() / 1000, url, ip, userAgent: req.headers.get("user-agent"),
    fbp: str(body.fbp), fbc: str(body.fbc) ?? fbcFromUrl(url, Date.now()), phone, interest,
  });
  const payload: Record<string, unknown> = { data: [event] };
  if (process.env.META_CAPI_TEST_CODE) payload.test_event_code = process.env.META_CAPI_TEST_CODE;
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(4000),
    });
    const j = await r.json().catch(() => ({}));
    await logWebhook(db, { source: "meta_capi", status: r.ok ? "processed" : "failed", httpStatus: r.status, payload: { event_id: event.event_id, event_name: event.event_name }, result: j, ip });
  } catch (e) {
    await logWebhook(db, { source: "meta_capi", status: "failed", httpStatus: 0, payload: { event_id: event.event_id }, error: (e as Error).message.slice(0, 200), ip }).catch(() => {});
  }
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req.headers.get("origin")) });
}

export async function POST(req: Request) {
  const headers = cors(req.headers.get("origin"));
  const ip = ipTuHeader(req.headers, process.env);
  if (await sharedRateLimited("publicLeadIp", "ip", ip)) return NextResponse.json({ ok: false, error: "Bạn gửi quá nhiều lần, vui lòng thử lại sau." }, { status: 429, headers });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400, headers });
  }
  if (typeof body.website === "string" && body.website.length > 0) return NextResponse.json({ ok: true }, { headers }); // honeypot: bot điền → giả vờ thành công

  const parsed = mapPublicLeadBody(body);
  if (!parsed.success) {
    await logWebhook(getDb(), { source: "public_lead", status: "rejected", httpStatus: 422, payload: body, error: "Dữ liệu không hợp lệ", ip });
    return NextResponse.json({ ok: false, error: "Vui lòng kiểm tra họ tên và số điện thoại", issues: parsed.error.flatten().fieldErrors }, { status: 422, headers });
  }

  const db = getDb();
  const hdrs = Object.fromEntries(req.headers.entries());
  try {
    // Nguồn & theo dõi: IP và user agent lấy từ chính request (không tin body gửi lên)
    const r = await createLead(db, {
      ...parsed.data,
      landingPage: parsed.data.landingPage ?? req.headers.get("referer"),
      referrer: parsed.data.referrer ?? req.headers.get("referer"),
      ipAddress: ip === "unknown" ? null : ip,
      userAgent: req.headers.get("user-agent"),
    }, null);
    if (typeof body.anonId === "string") {
      await recordTrack(db, { event: "form_submit", anonId: body.anonId, path: "/dang-ky", utmSource: parsed.data.utmSource, utmMedium: parsed.data.utmMedium, utmCampaign: parsed.data.utmCampaign, leadId: r.lead.id }).catch(() => null);
    }
    await logWebhook(db, { source: "public_lead", status: r.duplicated ? "duplicate" : "processed", httpStatus: 200, payload: body, headers: hdrs, result: { leadId: r.lead.id, duplicated: r.duplicated }, ip });
    if (!r.duplicated) {
      const pick = typeof body.ghiChu === "string" ? /Quan tâm: ([^·]+)/.exec(body.ghiChu)?.[1]?.trim() ?? null : null;
      await sendMetaCapi(db, req, body, ip, typeof body.sdt === "string" ? body.sdt : "", pick).catch(() => {});
    }
    return NextResponse.json({ ok: true, duplicated: r.duplicated }, { headers });
  } catch (e) {
    // Chỉ trả nguyên văn khi là lỗi kiểm tra dữ liệu (BAD_REQUEST); lỗi khác về câu chung
    const msg = clientSafeMessage(e);
    const bad = (e as { code?: string }).code === "BAD_REQUEST";
    await logWebhook(db, { source: "public_lead", status: bad ? "rejected" : "failed", httpStatus: bad ? 400 : 500, payload: body, headers: hdrs, error: msg, ip });
    return NextResponse.json({ ok: false, error: bad ? msg : "Hệ thống bận, vui lòng thử lại sau" }, { status: bad ? 400 : 500, headers });
  }
}
