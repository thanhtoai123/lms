import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@satarobo/db";
import { portalPortfolio } from "@satarobo/api";
import { requireParent } from "@/lib/parent-session";
import { PhMain } from "@/components/ph-ui";
import { PortfolioDocument } from "@/components/portfolio/portfolio-document";
import { PortfolioPrintStyle } from "@/components/portfolio/print-style";
import { PrintButton } from "@/components/portfolio/print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hồ sơ học tập", robots: { index: false } };

/**
 * Cổng phụ huynh: HỒ SƠ HỌC TẬP của con — toàn bộ phiếu nhận xét từng buổi, học bạ mốc, chứng nhận,
 * sản phẩm (ảnh đã duyệt, gia đình đồng ý đăng ảnh). Phụ huynh đã đăng nhập thì không cần link chia sẻ.
 */
export default async function ChildPortfolioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await requireParent();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const view = await portalPortfolio(getDb(), p.id, id);
  if (!view) notFound();
  return (
    <>
      <PhMain className="space-y-3 print:p-0">
        <PortfolioPrintStyle />
        <Link href={`/ph/be/${id}`} className="text-sm text-ink-600 print:hidden">← {view.student.fullName}</Link>
        <PortfolioDocument
          view={view}
          actions={<PrintButton className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-primary shadow" />}
        />
      </PhMain>
    </>
  );
}
