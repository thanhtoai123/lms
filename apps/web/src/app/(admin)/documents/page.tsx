import Link from "next/link";
import { hasPermission, DOC_KINDS, DOC_KIND_VI, DOC_STATUSES, DOC_STATUS_VI, DOC_CATEGORIES, DOC_CATEGORY_VI, type Actor, type DocKind, type DocStatus, type DocCategory } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, Pager } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { fmtD } from "@/components/finance-ui";
import { DocForm, OpenDocButton, DOC_STATUS_CHIP, fmtSize } from "@/components/content-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tài liệu giảng dạy" };

type SP = { course?: string; kind?: string; status?: string; category?: string; q?: string; page?: string };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "document:read")) return <NoAccess title="Tài liệu giảng dạy" perm="document:read" />;
  const pick = <T extends string>(arr: readonly T[], v?: string) => (arr.includes(v as T) ? (v as T) : undefined);
  const d = await caller.content.documents({
    courseId: sp.course || undefined, kind: pick<DocKind>(DOC_KINDS, sp.kind), status: pick<DocStatus>(DOC_STATUSES, sp.status), category: pick<DocCategory>(DOC_CATEGORIES, sp.category),
    q: sp.q || undefined, page: Math.max(1, Number(sp.page) || 1),
  });
  return (
    <div className="space-y-4">
      <PageHeader title="Tài liệu giảng dạy" desc="Kho tài liệu theo khoá / bài: giáo án, slide, phiếu bài tập, video, SCORM. Có phiên bản, phân quyền theo khoá giáo viên dạy, ghi nhật ký mở / tải." actions={d.canEdit ? <DocForm courses={d.courses} /> : null} />
      <form className="flex flex-wrap gap-2" action="/documents">
        <select name="course" defaultValue={sp.course ?? ""} className="input"><option value="">Mọi khoá</option>{d.courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select>
        <select name="category" defaultValue={sp.category ?? ""} className="input"><option value="">Mọi nhóm</option>{DOC_CATEGORIES.map((k) => <option key={k} value={k}>{DOC_CATEGORY_VI[k]}</option>)}</select>
        <select name="kind" defaultValue={sp.kind ?? ""} className="input"><option value="">Mọi loại</option>{DOC_KINDS.map((k) => <option key={k} value={k}>{DOC_KIND_VI[k]}</option>)}</select>
        {d.canEdit && <select name="status" defaultValue={sp.status ?? ""} className="input"><option value="">Mọi trạng thái</option>{DOC_STATUSES.map((k) => <option key={k} value={k}>{DOC_STATUS_VI[k]}</option>)}</select>}
        <input name="q" defaultValue={sp.q} placeholder="Tiêu đề / thẻ" className="input w-48" />
        <button className="btn-ghost">Lọc</button>
      </form>
      {d.items.length === 0 ? <Empty>Chưa có tài liệu phù hợp.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Tài liệu</th><th className="p-3">Khoá / bài</th><th className="p-3">Loại</th><th className="p-3">Phiên bản</th><th className="p-3">Trạng thái</th><th className="p-3 text-right">Lượt mở</th><th /></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.items.map((x) => (
                <tr key={x.id}>
                  <td className="p-3"><Link href={`/documents/${x.id}`} className="font-medium hover:underline">{x.title}</Link><div className="text-xs text-ink-400">{x.categoryLabel}{x.audience === "student" ? " · HV/PH xem được" : ""}{x.tags.length ? ` · #${x.tags.join(" #")}` : ""}</div></td>
                  <td className="p-3 text-xs">{x.courseCode}{x.lessonSeq ? <div className="text-ink-400">Bài {x.lessonSeq}: {x.lessonTitle}</div> : <div className="text-ink-400">Chung</div>}</td>
                  <td className="p-3 text-xs">{x.kindLabel}</td>
                  <td className="p-3 text-xs">{x.kind === "link" ? "—" : x.currentVersion ? <>v{x.currentVersion} · {fmtSize(x.sizeBytes)}<div className="text-ink-400">{fmtD(x.versionAt)}</div></> : <span className="text-amber-700">Chưa có tệp</span>}</td>
                  <td className="p-3"><span className={`chip ${DOC_STATUS_CHIP[x.status]}`}>{x.statusLabel}</span></td>
                  <td className="p-3 text-right tabular-nums">{x.opens}</td>
                  <td className="p-3 text-right">{x.hasContent && <OpenDocButton id={x.id} kind={x.kind} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager basePath="/documents" params={sp} page={d.page} pageSize={d.pageSize} total={d.total} />
    </div>
  );
}
