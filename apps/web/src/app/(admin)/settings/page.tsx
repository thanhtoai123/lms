import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { dtVN } from "@/components/care-ui";
import { SettingsForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cài đặt hệ thống" };

export default async function SettingsPage() {
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "system:read")) return <NoAccess title="Cài đặt hệ thống" perm="system:read" />;
  const d = await caller.admin.settings();
  return (
    <div className="space-y-4">
      <PageHeader title="Cài đặt hệ thống" desc={`Thông tin pháp nhân, liên hệ và nội dung in trên phiếu thu / email.${d.updatedAt ? ` Cập nhật ${dtVN(d.updatedAt)}${d.updatedBy ? ` bởi ${d.updatedBy}` : ""}.` : ""}`} />
      {!d.canEdit && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Chỉ Quản trị hệ thống được sửa cài đặt.</p>}
      <SettingsForm initial={d.settings} canEdit={d.canEdit} />
    </div>
  );
}
