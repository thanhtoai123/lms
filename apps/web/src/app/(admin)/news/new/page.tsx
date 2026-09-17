import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { PostEditor } from "../editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Viết bài" };

export default async function NewPost() {
  const { ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "site:create")) return <NoAccess title="Viết bài" perm="site:create" />;
  return (
    <div className="space-y-4">
      <Link href="/news" className="text-sm text-ink-600">← Tin tức</Link>
      <PageHeader title="Viết bài mới" />
      <PostEditor canEdit initial={{ title: "", slug: "", excerpt: "", body: "", coverImage: "", category: "news", seoTitle: "", seoDescription: "" }} />
    </div>
  );
}
