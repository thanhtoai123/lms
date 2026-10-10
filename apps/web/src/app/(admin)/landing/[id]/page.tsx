import { notFound } from "next/navigation";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess } from "@/components/admin-ui";
import { loadBrand } from "@/lib/brand";
import { LandingEditor } from "./editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Soạn landing page" };

export default async function LandingEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "site:read")) return <NoAccess title="Landing page" perm="site:read" />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [page, brand] = await Promise.all([caller.landing.get({ id }).catch(() => null), loadBrand()]);
  if (!page) notFound();
  return (
    <LandingEditor
      key={`${page.id}-${page.version}-${page.publishedVersion}-${page.status}`}
      brand={{ name: brand.name, primary: brand.primary, accent: brand.accent, logoUrl: brand.logoUrl }}
      page={{
        id: page.id, slug: page.slug, status: page.status, path: page.path, version: page.version, publishedVersion: page.publishedVersion,
        publishedAt: page.publishedAt ? page.publishedAt.toISOString() : null, canRename: page.canRename, canEdit: page.canEdit, hasUnpublished: page.hasUnpublished,
        draft: page.draft,
        history: page.history.map((h) => ({ version: h.version, createdAt: h.createdAt.toISOString(), byName: h.byName })),
      }}
    />
  );
}
