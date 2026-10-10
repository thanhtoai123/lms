import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { LandingList } from "./list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Landing page" };

export default async function LandingPageList({ searchParams }: { searchParams: Promise<{ luutru?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "site:read")) return <NoAccess title="Landing page" perm="site:read" />;
  const archived = sp.luutru === "1";
  const [pages, templates] = await Promise.all([caller.landing.list({ archived }), caller.landing.templates()]);
  const canEdit = hasPermission(ctx.actor as Actor, "site:update");
  return (
    <div className="space-y-4">
      <PageHeader
        title="Landing page"
        desc="Dựng trang giới thiệu / trang đích quảng cáo theo khối và mẫu có sẵn. Sửa nháp thoải mái — chỉ khi bấm Xuất bản thì trang công khai mới đổi. Trang có đường dẫn “trang-chu” là trang chủ của website."
      />
      <LandingList
        canEdit={canEdit}
        archived={archived}
        templates={templates}
        pages={pages.map((p) => ({ ...p, publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null, updatedAt: p.updatedAt.toISOString() }))}
      />
    </div>
  );
}
