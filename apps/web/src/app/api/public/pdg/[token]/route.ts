import { NextResponse } from "next/server";
import { getDb } from "@satarobo/db";
import { publicTrialReportRespond } from "@satarobo/api";
import { TRIAL_REPORT_TOKEN_RE } from "@satarobo/core";
import { clientIp, crossSite, crossSiteResponse, sharedRateLimit, tooManyResponse } from "@/lib/route-ctx";

/**
 * POST /api/public/pdg/[token] — phụ huynh bấm "Đăng ký tư vấn lộ trình" trên phiếu đánh giá học thử.
 * Không cần đăng nhập (token là quyền). Mỗi link chỉ ghi nhận một lần; bấm lại trả "đã nhận".
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (crossSite(req)) return crossSiteResponse();
  if (!TRIAL_REPORT_TOKEN_RE.test(token)) return NextResponse.json({ ok: false, error: "Liên kết không hợp lệ" }, { status: 404 });
  const gate = await sharedRateLimit("trialReportRespondIp", "ip", clientIp(req), "pdg-respond");
  if (gate) return tooManyResponse(gate, "gửi yêu cầu");
  try {
    const r = await publicTrialReportRespond(getDb(), token);
    return NextResponse.json(r, { status: r.ok ? 200 : 422 });
  } catch {
    return NextResponse.json({ ok: false, error: "Chưa gửi được yêu cầu, anh/chị thử lại sau ít phút." }, { status: 500 });
  }
}
