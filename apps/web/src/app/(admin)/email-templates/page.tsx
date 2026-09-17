import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { TemplateEditor } from "./editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mẫu email" };

export default async function EmailTemplatesPage() {
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "system:read")) return <NoAccess title="Mẫu email" perm="system:read" />;
  const d = await caller.admin.emailTemplates();
  return (
    <div className="space-y-4">
      <PageHeader title="Mẫu email" desc={`Nội dung email theo từng sự kiện. Chưa sửa thì dùng mẫu mặc định. Biến đặt trong {ngoặc nhọn}; mỗi sự kiện chỉ nhận biến của nó. ${d.sent30d} email trong 30 ngày qua.`} />
      <div className="space-y-3">
        {d.items.map((t) => <TemplateEditor key={t.eventKey} t={t} canEdit={d.canEdit} />)}
      </div>
    </div>
  );
}
