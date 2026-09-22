import { headers } from "next/headers";
import { getDb } from "@satarobo/db";
import { publicTrialReport, type PublicTrialReportResult } from "@satarobo/api";
import { TRIAL_REPORT_TOKEN_RE } from "@satarobo/core";
import { clientIp, sharedRateLimit } from "@/lib/route-ctx";
import { TrialReportSheet, TrialReportPrintStyle } from "@/components/trial-report/sheet";
import { ParentActions } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = {
  title: { absolute: "Phiếu đánh giá buổi học thử — Sata Robo" },
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer" as const,
};

type State = PublicTrialReportResult | { state: "rate_limited" };

/**
 * Trang phụ huynh mở từ link Zalo / email — không cần đăng nhập, token là quyền.
 * Kiểm định dạng token TRƯỚC khi chạm CSDL; trần tần suất theo IP để chặn máy quét dò token.
 */
export default async function PublicTrialReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let s: State = { state: "not_found" };
  if (TRIAL_REPORT_TOKEN_RE.test(token)) {
    const gate = await sharedRateLimit("trialReportViewIp", "ip", clientIp(new Headers(await headers())), "pdg-view");
    s = gate ? { state: "rate_limited" } : await publicTrialReport(getDb(), token);
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-50 to-background px-3 py-4 sm:px-4 sm:py-8 print:bg-white print:p-0">
      <TrialReportPrintStyle />
      {s.state === "ok" ? (
        <TrialReportSheet
          report={s.report}
          actions={<ParentActions token={token} phone={s.report.center.phone} responded={s.responded} />}
        />
      ) : (
        <Friendly state={s} />
      )}
    </main>
  );
}

function Friendly({ state }: { state: Exclude<State, { state: "ok" }> }) {
  const center = "center" in state ? state.center : null;
  const title =
    state.state === "expired" ? "Liên kết phiếu đánh giá đã hết hạn"
      : state.state === "revoked" ? "Phiếu đánh giá này đã được trung tâm thu hồi"
        : state.state === "rate_limited" ? "Anh/chị vui lòng thử lại sau ít phút"
          : "Không tìm thấy phiếu đánh giá";
  const body =
    state.state === "expired" ? "Để bảo vệ thông tin của bé, liên kết chỉ có hiệu lực trong một thời gian. Anh/chị liên hệ trung tâm để nhận lại phiếu nhé."
      : state.state === "revoked" ? "Trung tâm có thể đã gửi cho anh/chị một phiếu mới. Anh/chị vui lòng kiểm tra tin nhắn hoặc liên hệ trung tâm."
        : state.state === "rate_limited" ? "Phiếu được mở quá nhiều lần trong thời gian ngắn từ cùng một mạng."
          : "Liên kết có thể bị thiếu ký tự khi sao chép. Anh/chị vui lòng mở lại đúng liên kết trong tin nhắn của trung tâm.";
  const tel = center?.phone ? center.phone.replace(/[^\d+]/g, "") : "";
  return (
    <div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-border bg-card text-center shadow-sm">
      <div className="bg-gradient-to-br from-primary to-primary-darker px-5 py-4 text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" width={40} height={40} className="mx-auto h-10 w-10 rounded-xl" />
        <div className="mt-1 text-lg font-extrabold">Sata Robo</div>
      </div>
      <div className="space-y-2 p-6">
        <h1 className="text-lg font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
        {center && (
          <p className="pt-2 text-sm text-foreground">
            {center.name}
            {tel && (
              <>
                {" · "}
                <a href={`tel:${tel}`} className="font-bold text-primary underline">{center.phone}</a>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
