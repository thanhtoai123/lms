import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, BadgeCheck, Coins, Printer, QrCode } from "lucide-react";
import { getDb } from "@satarobo/db";
import { ParentPortal, familyChildren, hubJourney } from "@satarobo/api";
import { childShortName } from "@satarobo/core";
import { requireParent } from "@/lib/parent-session";
import { PhMain, PhPageHead, ChildChips, PhSection } from "@/components/ph-ui";
import { ShareLinkButton } from "@/components/ph/actions";
import { AvatarUploader } from "@/components/avatar-uploader";
import { PortfolioDocument } from "@/components/portfolio/portfolio-document";
import { PortfolioPrintStyle } from "@/components/portfolio/print-style";
import { PrintButton } from "@/components/portfolio/print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hồ sơ công nghệ — TH STEAM Academy", robots: { index: false } };

const dmy = (d: string | Date | null) => {
  if (!d) return "";
  const s = typeof d === "string" ? d : d.toISOString();
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
};

/**
 * HỒ SƠ CÔNG NGHỆ CỦA CON — trang học tập DUY NHẤT của cổng phụ huynh (gộp "Hành trình học", "Nhận xét", "Hình ảnh lớp"):
 *  - Thanh công cụ (không in): ảnh đại diện (đổi được), In / Lưu PDF, TH Coin, giấy chứng nhận (tải / in, chia sẻ, xác thực),
 *    thẻ QR điểm danh.
 *  - Bên dưới là chính tài liệu Hồ sơ công nghệ; ở cổng phụ huynh phiếu từng buổi xếp mới nhất lên đầu và hiện đủ ảnh của buổi.
 * Chỉ con của phụ huynh đang đăng nhập (hubJourney / portalChild kiểm phạm vi theo phiên).
 */
export default async function ChildTechProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await requireParent();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getDb();
  const [kids, j, c] = await Promise.all([familyChildren(db, p.id), hubJourney(db, p.id, id), ParentPortal.portalChild(db, p.id, id)]);
  if (!j || !c) notFound();
  const name = childShortName(j.child);
  const kid = kids.find((k) => k.id === j.child.id) ?? null;

  return (
    <PhMain className="space-y-4 print:p-0">
      <PortfolioPrintStyle />
      <div className="space-y-4 print:hidden">
        <PhPageHead title={`Hồ sơ công nghệ của ${name}`} desc="Lộ trình, năng lực, nhận xét và hình ảnh từng buổi học của con — xem, in hoặc lưu PDF." />
        <ChildChips kids={kids} activeId={j.child.id} hrefFor={(kidId) => `/ph/be/${kidId}`} />

        <div className="card flex flex-wrap items-center justify-between gap-3 p-3">
          <AvatarUploader endpoint="/api/ph/avatar" fields={{ studentId: j.child.id }} current={kid?.avatarUrl ?? null} name={j.child.fullName} nickname={j.child.nickname} seed={c.code ?? j.child.id} size={56} compact addLabel="Thêm ảnh của con" />
          <div className="flex flex-wrap gap-2">
            <PrintButton className="btn-primary min-h-11 text-[15px]" />
            <Link href={`/ph/be/${j.child.id}/xu`} className="btn-ghost min-h-11 text-[15px]"><Coins className="h-5 w-5 text-accent-600" aria-hidden /> {c.coins} xu</Link>
            <a href="#chi-tiet" className="btn-ghost min-h-11 text-[15px]">Nhận xét & ảnh từng buổi</a>
          </div>
        </div>

        {j.certificates.length > 0 && (
          <PhSection title="Giấy chứng nhận">
            <ul className="space-y-2">
              {j.certificates.map((cert) => (
                <li key={cert.id} className="card flex flex-wrap items-center justify-between gap-3 border-accent-200 bg-accent-50/60 p-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <Award className="mt-0.5 h-5 w-5 shrink-0 text-accent-700" aria-hidden />
                    <div className="min-w-0">
                      <div className="font-bold leading-snug">{cert.title}</div>
                      <div className="text-[13px] text-ink-600">Số {cert.number}{cert.issuedAt ? ` · cấp ${dmy(cert.issuedAt)}` : ""}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/ph/be/${j.child.id}/chung-nhan/${cert.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-3 text-[14px] font-bold text-white"><Printer className="h-4 w-4" aria-hidden /> Tải / in</Link>
                    {cert.verifyPath && <ShareLinkButton path={cert.verifyPath} title={cert.title} />}
                    {cert.verifyPath && <a href={cert.verifyPath} className="inline-flex min-h-11 items-center gap-1 px-1 text-[14px] font-semibold text-primary"><BadgeCheck className="h-4 w-4" aria-hidden /> Xác thực</a>}
                  </div>
                </li>
              ))}
            </ul>
          </PhSection>
        )}

        {c.card && (
          <details className="card p-4">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold"><QrCode className="h-5 w-5 text-primary" aria-hidden /> Thẻ điểm danh QR của con</summary>
            <div className="mx-auto mt-2 w-56 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: c.card.svg }} />
            <p className="text-center text-[14px] text-ink-600">Đưa thẻ (hoặc màn hình này) cho giáo viên quét khi vào lớp.</p>
          </details>
        )}
      </div>

      <PortfolioDocument view={j.view} portal />
    </PhMain>
  );
}
