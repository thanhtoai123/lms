import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { WebsiteStructure } from "./structure";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cấu trúc website" };

export default async function WebsitePage() {
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "site:read")) return <NoAccess title="Cấu trúc website" perm="site:read" />;
  const o = await caller.website.overview();
  return (
    <div className="space-y-4">
      <PageHeader
        title="Cấu trúc website"
        desc="Sơ đồ các trang công khai và khung chung (menu, chân trang). Nội dung các trang đang là bản DEMO có dấu “[DEMO]” — thay chữ thật rồi bấm Xuất bản từng trang."
      />
      <WebsiteStructure
        canEdit={o.canEdit}
        chrome={o.chrome}
        counts={o.counts}
        missingDemo={o.missingDemo}
        pages={o.pages.map((p) => ({ id: p.id, slug: p.slug, title: p.title, status: p.status, path: p.path, group: p.group, hasUnpublished: p.version > p.publishedVersion, updatedAt: p.updatedAt.toISOString() }))}
      />
    </div>
  );
}
