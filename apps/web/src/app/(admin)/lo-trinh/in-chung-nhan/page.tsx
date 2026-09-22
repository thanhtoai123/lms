import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { PrintButton } from "@/components/portfolio/print-button";
import { CertificateSheet, CertificatePrintStyle } from "@/components/certificates/certificate-sheet";

export const dynamic = "force-dynamic";
export const metadata = { title: "In giấy chứng nhận" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Trang in NỘI BỘ: `/lo-trinh/in-chung-nhan?ids=a,b,c` — mỗi giấy chứng nhận một trang A4 đúng hướng của mẫu,
 * ảnh nền phủ kín trang, chữ đặt tuyệt đối theo %, giữ màu khi in. Một lệnh "In / Lưu PDF" ra nhiều trang.
 */
export default async function PrintCertificatesPage({ searchParams }: { searchParams: Promise<{ ids?: string; back?: string }> }) {
  const sp = await searchParams;
  const ids = (sp.ids ?? "").split(",").map((x) => x.trim()).filter((x) => UUID_RE.test(x)).slice(0, 200);
  const { caller } = await getServerCaller();
  const list = ids.length ? await caller.certificates.print({ ids }) : [];
  const back = sp.back && sp.back.startsWith("/") && !sp.back.startsWith("//") ? sp.back : "/lo-trinh";
  const firstOrientation = list[0]?.template.orientation ?? "landscape";
  const revoked = list.filter((c) => c.status === "revoked").length;

  return (
    <div className="cn-print-root space-y-4">
      <CertificatePrintStyle orientation={firstOrientation} />
      <div className="cn-noprint flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">In giấy chứng nhận</h1>
          <p className="text-xs text-muted-foreground">
            {list.length} giấy · mỗi giấy một trang A4 · khi in chọn <b>Lề: Không</b> và bật <b>Đồ hoạ nền</b> (Chrome: “Background graphics”).
            {revoked > 0 && <span className="ml-1 font-semibold text-red-700">{revoked} giấy đã thu hồi (in kèm dấu “ĐÃ THU HỒI”).</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={back} className="btn-ghost">Quay lại</Link>
          {list.length > 0 && <PrintButton label="In / Lưu PDF" />}
        </div>
      </div>
      {list.length === 0 ? (
        <div className="card p-6 text-sm text-muted-foreground">Không có giấy chứng nhận nào để in (hoặc bạn không có quyền xem).</div>
      ) : (
        list.map((c) => (
          <section
            key={c.id}
            className={`cn-page mx-auto shadow-md ${c.template.orientation === "landscape" ? "cn-page-landscape max-w-5xl" : "cn-page-portrait max-w-2xl"}`}
            aria-label={`Giấy chứng nhận ${c.number}`}
          >
            <CertificateSheet template={c.template} snapshot={c.snapshot} qrSvg={c.qrSvg} revoked={c.status === "revoked"} />
          </section>
        ))
      )}
    </div>
  );
}
