import { hasPermission, TENANT_SETTING_VI, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { TenantCards, NewTenantPanel } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nhượng quyền" };

/**
 * Một màn hình duy nhất cho cả chuỗi nhượng quyền:
 * danh sách trung tâm (thẻ) + nút lớn "Tạo trung tâm nhượng quyền" mở panel một bước.
 * Cài đặt quyền riêng tư nằm ngay trong panel chi tiết của từng thẻ — không có trang riêng.
 */
export default async function NhuongQuyenPage() {
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !hasPermission(actor, "tenant:read")) return <NoAccess title="Nhượng quyền" perm="tenant:read" />;

  const [data, templates] = await Promise.all([caller.tenants.list(), caller.tenants.templates()]);
  const franchises = data.items.filter((t) => t.type === "FRANCHISE").length;
  const totalStudents = data.items.reduce((a, t) => a + t.students, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Nhượng quyền"
        desc={`${data.items.length} trung tâm · ${franchises} nhượng quyền · ${totalStudents.toLocaleString("vi-VN")} học viên đang học. Dữ liệu của mỗi trung tâm được cách ly: Hội sở chuỗi chỉ thấy số liệu tổng hợp, dữ liệu cá nhân bị che trừ khi trung tâm đó cho phép.`}
        actions={data.canProvision && templates.length > 0 ? <NewTenantPanel templates={templates} /> : null}
      />

      {data.items.length === 0 ? (
        <Empty>Chưa có trung tâm nào trong phạm vi của bạn.</Empty>
      ) : (
        <TenantCards items={data.items} labels={data.settingLabels ?? TENANT_SETTING_VI} />
      )}

      <p className="text-xs text-muted-foreground">
        Mỗi trung tâm nhượng quyền là một <b>tenant</b> riêng: lead, học viên, nhân sự, tài chính không lẫn sang trung tâm khác.
        Tài liệu: <code className="font-mono">docs/NHUONG-QUYEN.md</code>.
      </p>
    </div>
  );
}
