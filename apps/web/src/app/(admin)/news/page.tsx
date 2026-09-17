import Link from "next/link";
import { hasPermission, POST_STATUSES, POST_STATUS_VI, POST_CATEGORIES, POST_CATEGORY_VI, type Actor, type PostStatus, type PostCategory } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, Pager } from "@/components/admin-ui";
import { Kpi } from "@/components/report-ui";
import { Empty } from "@/components/ui";
import { dtVN } from "@/components/care-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tin tức" };
const CHIP: Record<PostStatus, string> = { draft: "bg-slate-100 text-slate-600", scheduled: "bg-amber-100 text-amber-800", published: "bg-green-100 text-green-800", archived: "bg-red-100 text-red-700" };

type SP = { status?: string; category?: string; q?: string; page?: string };

export default async function NewsAdmin({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "site:read")) return <NoAccess title="Tin tức" perm="site:read" />;
  const status = POST_STATUSES.includes(sp.status as PostStatus) ? (sp.status as PostStatus) : undefined;
  const category = POST_CATEGORIES.includes(sp.category as PostCategory) ? (sp.category as PostCategory) : undefined;
  const d = await caller.site.posts({ status, category, q: sp.q || undefined, page: Math.max(1, Number(sp.page) || 1) });
  const c = d.counts;
  return (
    <div className="space-y-4">
      <PageHeader title="Tin tức" desc="Bài viết website: nháp → hẹn giờ / đăng → gỡ. Nội dung viết bằng markdown (tự lọc mã độc), trang công khai /tin-tuc và API cho satarobo.vn." actions={<div className="flex gap-2"><Link href="/tin-tuc" target="_blank" className="btn-ghost">Xem trang tin</Link>{d.canEdit && <Link href="/news/new" className="btn-primary">+ Viết bài</Link>}</div>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Đã đăng" value={c?.published ?? 0} tone="good" />
        <Kpi label="Hẹn giờ" value={c?.scheduled ?? 0} tone="warn" />
        <Kpi label="Nháp" value={c?.draft ?? 0} />
        <Kpi label="Đã gỡ" value={c?.archived ?? 0} />
        <Kpi label="Lượt xem" value={(c?.views ?? 0).toLocaleString("vi-VN")} tone="brand" />
      </div>
      <form className="flex flex-wrap gap-2" action="/news">
        <select name="status" defaultValue={status ?? ""} className="input"><option value="">Mọi trạng thái</option>{POST_STATUSES.map((s) => <option key={s} value={s}>{POST_STATUS_VI[s]}</option>)}</select>
        <select name="category" defaultValue={category ?? ""} className="input"><option value="">Mọi chuyên mục</option>{POST_CATEGORIES.map((s) => <option key={s} value={s}>{POST_CATEGORY_VI[s]}</option>)}</select>
        <input name="q" defaultValue={sp.q} placeholder="Tiêu đề / đường dẫn" className="input w-56" />
        <button className="btn-ghost">Lọc</button>
      </form>
      {d.items.length === 0 ? <Empty>Chưa có bài viết.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Bài viết</th><th className="p-3">Chuyên mục</th><th className="p-3">Trạng thái</th><th className="p-3 text-right">Lượt xem</th><th className="p-3">Cập nhật</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((p) => (
                <tr key={p.id}>
                  <td className="p-3"><Link href={`/news/${p.id}`} className="font-medium hover:underline">{p.title}</Link><div className="font-mono text-xs text-ink-400">/tin-tuc/{p.slug} · {p.minutes} phút đọc</div></td>
                  <td className="p-3 text-xs">{p.categoryLabel}</td>
                  <td className="p-3"><span className={`chip ${CHIP[p.status as PostStatus]}`}>{p.statusLabel}</span>{p.status === "scheduled" && p.publishAt && <div className="text-xs text-ink-400">{dtVN(p.publishAt)}</div>}{p.status === "published" && p.publishedAt && <div className="text-xs text-ink-400">{dtVN(p.publishedAt)}</div>}</td>
                  <td className="p-3 text-right tabular-nums">{p.views}</td>
                  <td className="p-3 text-xs">{dtVN(p.updatedAt)}<div className="text-ink-400">{p.byName ?? "—"}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager basePath="/news" params={sp} page={d.page} pageSize={d.pageSize} total={d.total} />
    </div>
  );
}
