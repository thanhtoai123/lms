import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { BlockEditor } from "./editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nội dung website" };

export default async function SiteContentPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "site:read")) return <NoAccess title="Nội dung website" perm="site:read" />;
  const d = await caller.site.content();
  const sel = d.pages.find((p) => p.key === sp.page) ?? d.pages[0]!;
  return (
    <div className="space-y-4">
      <PageHeader title="Nội dung website" desc="Tiêu đề, mô tả, ảnh của từng trang công khai. Lưu xong trang /dang-ky, /gioi-thieu và API /api/public/site/… trả nội dung mới ngay; mỗi lần lưu giữ lại một phiên bản để khôi phục." />
      <div className="flex flex-wrap gap-2 text-sm">
        {d.pages.map((p) => (
          <a key={p.key} href={`/site-content?page=${p.key}`} className={`chip ${sel.key === p.key ? "bg-brand-600 text-white" : "bg-black/5"}`}>{p.label}{p.version ? ` · v${p.version}` : " · chưa có"}</a>
        ))}
      </div>
      <BlockEditor
        key={`${sel.key}-${sel.version}`}
        page={{ key: sel.key, label: sel.label, path: sel.path, fields: sel.fields, data: sel.data, version: sel.version, updatedAt: sel.updatedAt?.toISOString() ?? null, updatedBy: sel.updatedBy }}
        history={sel.history.map((h) => ({ version: h.version, createdAt: h.createdAt.toISOString(), byName: h.byName }))}
        canEdit={d.canEdit}
      />
    </div>
  );
}
