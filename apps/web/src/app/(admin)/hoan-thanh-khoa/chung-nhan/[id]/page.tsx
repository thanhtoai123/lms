import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { PrintButton } from "@/components/portfolio/print-button";
import { CertificateSheet, CertificatePrintStyle } from "@/components/certificates/certificate-sheet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Giấy chứng nhận" };

/**
 * Giấy chứng nhận hoàn thành khoá của một học viên — hiển thị ĐÚNG MẪU CHUẨN đang in (nền dựng sẵn hoặc mẫu
 * trung tâm tải lên, mã QR xác thực), cùng bản chụp nội dung lúc cấp. Không còn bản HTML trắng riêng: xem gì in nấy.
 */
export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller } = await getServerCaller();
  const c = await caller.learning.certificate({ id });
  const [cert] = c.certificateId ? await caller.certificates.print({ ids: [c.certificateId] }) : [];
  const back = encodeURIComponent(`/hoan-thanh-khoa/chung-nhan/${c.id}`);

  return (
    <div className="cn-print-root space-y-4">
      {cert && <CertificatePrintStyle orientation={cert.template.orientation} />}
      <div className="cn-noprint flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Giấy chứng nhận</h1>
          <p className="text-sm text-muted-foreground">
            {c.studentName} · {c.courseCode} · Số <span className="font-mono">{c.certificateNo}</span>
            {cert && <> · {cert.statusLabel}</>}
          </p>
          {cert && (
            <p className="mt-1 text-xs text-muted-foreground">
              Khi in chọn <b>Lề: Không</b> và bật <b>Đồ hoạ nền</b>. Mẫu, người ký, địa danh sửa ở{" "}
              <Link href="/lo-trinh/mau-chung-nhan" className="text-brand-600 underline">Lộ trình → Mẫu chứng nhận</Link>.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/hoan-thanh-khoa" className="btn-ghost">Quay lại</Link>
          {cert && <Link href={`/lo-trinh/in-chung-nhan?ids=${cert.id}&back=${back}`} className="btn-ghost">Trang in hàng loạt</Link>}
          {cert && <PrintButton label="In / Lưu PDF" />}
        </div>
      </div>
      {cert ? (
        <section
          className={`cn-page mx-auto shadow-md ${cert.template.orientation === "landscape" ? "cn-page-landscape max-w-5xl" : "cn-page-portrait max-w-2xl"}`}
          aria-label={`Giấy chứng nhận ${cert.number}`}
        >
          <CertificateSheet template={cert.template} snapshot={cert.snapshot} qrSvg={cert.qrSvg} revoked={cert.status === "revoked"} />
        </section>
      ) : (
        <div className="card p-6 text-sm text-muted-foreground">
          Hoàn thành khoá này chưa có giấy chứng nhận trong sổ chứng nhận (dữ liệu cũ). Liên hệ quản trị hệ thống để đồng bộ sổ chứng nhận.
        </div>
      )}
    </div>
  );
}
