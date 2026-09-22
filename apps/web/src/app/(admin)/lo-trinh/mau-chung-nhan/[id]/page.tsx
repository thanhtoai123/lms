import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess } from "@/components/admin-ui";
import { TemplateEditor } from "./editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trình dựng mẫu giấy chứng nhận" };

export default async function CertificateTemplateEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !(hasPermission(actor, "course:read") || hasPermission(actor, "completion:read") || hasPermission(actor, "enrollment:read"))) {
    return <NoAccess title="Mẫu giấy chứng nhận" perm="course:read" />;
  }
  const t = await caller.certificates.templates.get({ id });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/lo-trinh/mau-chung-nhan" className="text-brand-600 underline">Mẫu giấy chứng nhận</Link>
        <span className="text-ink-400">/</span>
        <span className="font-semibold">{t.name}</span>
      </div>
      <TemplateEditor template={t} canManage={hasPermission(actor, "course:update")} />
    </div>
  );
}
