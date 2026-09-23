import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { LeadImporter } from "./importer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nhập lead từ file" };

export default async function LeadImportPage() {
  const { ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "lead:create")) return <NoAccess title="Nhập lead từ file" perm="lead:create" />;
  return (
    <div className="space-y-4">
      <Link href="/leads" className="text-sm text-ink-600">← Danh sách lead</Link>
      <PageHeader
        title="Nhập lead từ file"
        desc="SĐT là căn cứ duy nhất để phát hiện trùng. Trùng với CRM: không ghi đè — chỉ điền ô trống, con mới được thêm, giá trị khác ghi vào ghi chú kèm ngày (tick cột Đè để lấy dữ liệu file). Lead chưa chốt sẽ được giao theo cột Sale; không có sale thì chia tự động."
        actions={<Link href="/leads/import/registered" className="btn-ghost">Nhập khách ĐÃ ĐĂNG KÝ →</Link>}
      />
      <LeadImporter mode="leads" canOverwrite={hasPermission(ctx.actor as Actor, "lead:overwrite")} />
    </div>
  );
}
