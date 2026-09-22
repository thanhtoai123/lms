import { headers } from "next/headers";
import { getDb } from "@satarobo/db";
import { publicPortfolio, type PublicPortfolioResult } from "@satarobo/api";
import { PORTFOLIO_TOKEN_RE } from "@satarobo/core";
import { clientIp, sharedRateLimit } from "@/lib/route-ctx";
import { PortfolioDocument } from "@/components/portfolio/portfolio-document";
import { PortfolioPrintStyle } from "@/components/portfolio/print-style";
import { PrintButton } from "@/components/portfolio/print-button";

export const dynamic = "force-dynamic";
export const metadata = {
  title: { absolute: "Hồ sơ học tập — Sata Robo" },
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer" as const,
};

type State = PublicPortfolioResult | { state: "rate_limited" };

/**
 * Hồ sơ học tập chia sẻ qua link riêng (Zalo / email) — không cần đăng nhập, token là quyền.
 * Kiểm định dạng token TRƯỚC khi chạm CSDL; trần tần suất theo IP chặn máy quét dò token.
 * Không bao giờ hiển thị SĐT / email / địa chỉ phụ huynh, ghi chú nội bộ, lý do vắng.
 */
export default async function PublicPortfolioPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let s: State = { state: "not_found" };
  if (PORTFOLIO_TOKEN_RE.test(token)) {
    const gate = await sharedRateLimit("portfolioViewIp", "ip", clientIp(new Headers(await headers())), "hs-view");
    s = gate ? { state: "rate_limited" } : await publicPortfolio(getDb(), token);
  }
  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-50 to-background px-3 py-4 sm:px-4 sm:py-8 print:bg-white print:p-0">
      <PortfolioPrintStyle />
      {s.state === "ok" ? (
        <PortfolioDocument
          view={s.view}
          actions={<div className="flex flex-wrap gap-2"><PrintButton className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-primary shadow" /></div>}
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
    state.state === "expired" ? "Liên kết hồ sơ học tập đã hết hạn"
      : state.state === "revoked" ? "Liên kết này đã được trung tâm thu hồi"
        : state.state === "rate_limited" ? "Anh/chị vui lòng thử lại sau ít phút"
          : "Không tìm thấy hồ sơ học tập";
  const body =
    state.state === "expired" ? "Để bảo vệ thông tin của bé, liên kết chỉ có hiệu lực trong một thời gian. Anh/chị liên hệ trung tâm để nhận liên kết mới nhé."
      : state.state === "revoked" ? "Trung tâm có thể đã gửi một liên kết mới. Anh/chị vui lòng kiểm tra tin nhắn hoặc liên hệ trung tâm."
        : state.state === "rate_limited" ? "Hồ sơ được mở quá nhiều lần trong thời gian ngắn từ cùng một mạng."
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
