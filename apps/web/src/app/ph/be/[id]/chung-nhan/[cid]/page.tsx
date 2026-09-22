import { notFound } from "next/navigation";
import { getDb } from "@satarobo/db";
import { portalCertificate } from "@satarobo/api";
import { requireParent } from "@/lib/parent-session";
import { PhHeader } from "@/components/ph-ui";
import { PrintButton } from "@/components/portfolio/print-button";
import { ShareLinkButton } from "@/components/ph/actions";
import { CertificateSheet, CertificatePrintStyle } from "@/components/certificates/certificate-sheet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Giấy chứng nhận — Sata Robo", robots: { index: false } };

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Cổng phụ huynh: xem / in / lưu PDF giấy chứng nhận CÒN HIỆU LỰC của con (một trang A4 đúng mẫu, có mã QR xác thực)
 * và chia sẻ link xác thực công khai /cn/<token>. Phạm vi theo phiên phụ huynh (portalCertificate).
 */
export default async function ParentCertificatePage({ params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  const p = await requireParent();
  if (!UUID.test(id) || !UUID.test(cid)) notFound();
  const c = await portalCertificate(getDb(), p.id, cid);
  if (!c || c.studentId !== id) notFound();
  const verifyPath = new URL(c.verifyUrl).pathname;
  return (
    <>
      <div className="print:hidden"><PhHeader title="Giấy chứng nhận" back={{ href: `/ph/be/${id}`, label: "Hành trình học" }} /></div>
      <main className="cn-print-root flex-1 space-y-4 px-4 pb-10 pt-3 print:p-0">
        <CertificatePrintStyle orientation={c.template.orientation} />
        <div className="cn-noprint space-y-2">
          <div className="text-[17px] font-bold">{c.snapshot.pathName}</div>
          <div className="text-[14px] text-ink-600">Số {c.number} · {c.kindLabel}</div>
          <div className="flex flex-wrap gap-2">
            <PrintButton label="In / Lưu PDF" className="btn-primary min-h-11 text-[15px]" />
            <ShareLinkButton path={verifyPath} title={`Giấy chứng nhận ${c.snapshot.pathName}`} />
          </div>
          <p className="text-[13px] text-ink-600">Lưu PDF: bấm “In / Lưu PDF” rồi chọn “Lưu dưới dạng PDF”, <b>Lề: Không</b>, bật <b>Đồ hoạ nền</b>. Người nhận quét mã QR trên giấy để xác thực.</p>
        </div>
        <section className={`cn-page mx-auto overflow-hidden rounded-xl shadow-md ${c.template.orientation === "landscape" ? "cn-page-landscape" : "cn-page-portrait max-w-sm"}`} aria-label={`Giấy chứng nhận ${c.number}`}>
          <CertificateSheet template={c.template} snapshot={c.snapshot} qrSvg={c.qrSvg} />
        </section>
      </main>
    </>
  );
}
