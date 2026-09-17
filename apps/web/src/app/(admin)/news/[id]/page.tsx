import Link from "next/link";
import type { PostCategory, PostStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { dtVN } from "@/components/care-ui";
import { PostEditor } from "../editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bài viết" };

export default async function EditPost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller } = await getServerCaller();
  const p = await caller.site.post({ id });
  return (
    <div className="space-y-4">
      <Link href="/news" className="text-sm text-ink-600">← Tin tức</Link>
      <PageHeader title={p.title} desc={`${p.statusLabel}${p.publishedAt ? ` · đăng ${dtVN(p.publishedAt)}` : ""}${p.status === "scheduled" && p.publishAt ? ` · hẹn ${dtVN(p.publishAt)}` : ""} · ${p.views} lượt xem · cập nhật ${dtVN(p.updatedAt)}`} />
      <PostEditor
        key={p.updatedAt.toISOString()}
        canEdit={p.canEdit}
        initial={{ id: p.id, title: p.title, slug: p.slug, excerpt: p.excerpt ?? "", body: p.body, coverImage: p.coverImage ?? "", category: p.category as PostCategory, seoTitle: p.seoTitle ?? "", seoDescription: p.seoDescription ?? "", status: p.status as PostStatus, publishAt: p.publishAt?.toISOString() ?? null }}
      />
    </div>
  );
}
