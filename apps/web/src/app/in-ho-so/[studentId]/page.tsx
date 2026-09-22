import { notFound } from "next/navigation";
import { getDb } from "@satarobo/db";
import { portfolioForRender, verifyPortfolioRenderSignature } from "@satarobo/api";
import { parsePortfolioScope, portfolioScopeQuery } from "@satarobo/core";
import { PortfolioDocument } from "@/components/portfolio/portfolio-document";
import { PortfolioPrintStyle } from "@/components/portfolio/print-style";

export const dynamic = "force-dynamic";
export const metadata = { title: { absolute: "Hồ sơ học tập — bản in" }, robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" as const };

type SP = { scope?: string; enrollmentId?: string; from?: string; to?: string; exp?: string; sig?: string };

/**
 * Trang in NỘI BỘ cho bộ xuất PDF phía máy chủ (Playwright không mang phiên đăng nhập).
 * Chỉ mở được bằng chữ ký HMAC ngắn hạn (5 phút) trên đúng (học viên, phạm vi) — quyền đã kiểm ở
 * thủ tục `portfolio.exportPdf` trước khi ký. Sai / hết hạn chữ ký → 404, không lộ gì.
 */
export default async function RenderPortfolioPage({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<SP> }) {
  const { studentId } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) notFound();
  const scope = parsePortfolioScope(sp);
  const exp = Number(sp.exp);
  if (!sp.sig || !verifyPortfolioRenderSignature(studentId, portfolioScopeQuery(scope), exp, sp.sig)) notFound();
  const view = await portfolioForRender(getDb(), studentId, scope);
  if (!view) notFound();
  return (
    <main className="bg-white">
      <PortfolioPrintStyle />
      <PortfolioDocument view={view} />
    </main>
  );
}
