import Link from "next/link";
import { hasPermission, sampleCertificateSnapshot, TEMPLATE_ORIENTATION_VI, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { CertificateSheet } from "@/components/certificates/certificate-sheet";
import { CreateTemplate, SetDefaultButton } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mẫu giấy chứng nhận" };

export default async function CertificateTemplatesPage() {
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !(hasPermission(actor, "course:read") || hasPermission(actor, "completion:read") || hasPermission(actor, "enrollment:read"))) {
    return <NoAccess title="Mẫu giấy chứng nhận" perm="course:read" />;
  }
  const canManage = hasPermission(actor, "course:update");
  const list = await caller.certificates.templates.list({ includeInactive: true });
  return (
    <div className="space-y-4">
      <PageHeader
        title="Mẫu giấy chứng nhận"
        desc="Thiết kế nền trên Canva, tải lên, rồi kéo các ô (tên học viên, tên lộ trình, ngày cấp, số chứng nhận, mã QR…) vào đúng chỗ trống. Toạ độ lưu theo % khung nên in đúng ở mọi độ phân giải."
        actions={<Link href="/lo-trinh" className="btn-ghost">Về lộ trình học</Link>}
      />
      <div className="card space-y-2 border-l-4 border-l-accent p-4 text-sm">
        <h2 className="font-bold">Cách làm mẫu trên Canva</h2>
        <ol className="list-decimal space-y-1 pl-5 text-foreground/90">
          <li>Tạo thiết kế <b>khổ A4 ngang (297 × 210 mm)</b> — hoặc cỡ tuỳ chỉnh <b>3508 × 2480 px</b> (300 dpi).</li>
          <li><b>Để trống</b> các vị trí: tên học viên, tên lộ trình / khoá, ngày cấp, số chứng nhận, mã QR (≈ 3 × 3 cm), chữ ký người ký.</li>
          <li>Chữ “GIẤY CHỨNG NHẬN” (không phải “chứng chỉ”), logo, khung viền… vẽ luôn trên nền.</li>
          <li>Tải xuống <b>PNG</b> chất lượng cao (không chọn nền trong suốt), dung lượng ≤ 15 MB, rồi tải lên ở trình dựng.</li>
        </ol>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((t) => (
          <article key={t.id} className={`card overflow-hidden ${t.isActive ? "" : "opacity-60"}`}>
            <div className="border-b border-border bg-muted/40 p-3">
              <CertificateSheet template={t} snapshot={sampleCertificateSnapshot(t.fields)} qrSvg={null} className="shadow-sm" />
            </div>
            <div className="space-y-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-bold">{t.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {TEMPLATE_ORIENTATION_VI[t.orientation]}
                    {t.widthPx && t.heightPx ? ` · ${t.widthPx}×${t.heightPx} px` : ""}
                    {t.backgroundKey?.startsWith("builtin/") ? " · nền dựng sẵn" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {t.isDefault && <span className="chip bg-green-100 text-green-800">Mặc định</span>}
                  {!t.isActive && <span className="chip bg-slate-200 text-ink-600">Ngừng dùng</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/lo-trinh/mau-chung-nhan/${t.id}`} className="btn-primary !px-3 !py-1.5 text-xs">{canManage ? "Mở trình dựng" : "Xem"}</Link>
                {canManage && !t.isDefault && t.isActive && <SetDefaultButton id={t.id} />}
              </div>
            </div>
          </article>
        ))}
        {list.length === 0 && <div className="card p-6 text-sm text-muted-foreground">Chưa có mẫu nào.</div>}
      </div>
      {canManage && <CreateTemplate templates={list.map((t) => ({ id: t.id, name: t.name }))} />}
    </div>
  );
}
