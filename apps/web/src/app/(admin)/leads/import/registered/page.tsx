import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { LeadImporter } from "../importer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nhập khách đã đăng ký" };

export default async function RegisteredImportPage() {
  const { ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "lead:create")) return <NoAccess title="Nhập khách đã đăng ký" perm="lead:create" />;
  return (
    <div className="space-y-4">
      <Link href="/leads/import" className="text-sm text-ink-600">← Nhập lead từ file</Link>
      <PageHeader
        title="Nhập danh sách ĐÃ ĐĂNG KÝ"
        desc="Mỗi SĐT là một khách ở trạng thái “Đã đăng ký”; mỗi dòng là một học viên (một khách nhiều con thì lặp SĐT). Cột “Đã đóng” / “Hạn đợt 2” được ghi vào ghi chú của từng bé (ĐãĐóng=, HạnĐợt2=) để màn Chốt hàng loạt đọc lại. Bắt buộc xem trước rồi mới ghi."
        actions={<Link href="/leads/bulk-convert" className="btn-ghost">Chốt hàng loạt →</Link>}
      />
      <LeadImporter mode="registered" />
    </div>
  );
}
