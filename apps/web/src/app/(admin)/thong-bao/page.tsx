import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { NotificationCenter } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trung tâm thông báo" };

export default async function NotificationCenterPage() {
  const { ctx } = await getServerCaller();
  if (!ctx.actor || !ctx.user) return <NoAccess title="Trung tâm thông báo" perm="system:read" />;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Trung tâm thông báo"
        desc="Mọi thông báo gửi cho bạn — lọc theo nhóm nghiệp vụ và mức ưu tiên, tìm theo tiêu đề / nội dung, gom theo Hôm nay · Hôm qua · Cũ hơn."
      />
      <NotificationCenter />
    </div>
  );
}
