import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { DocForm } from "@/components/content-ui";
import { DOC_STATUS_CHIP } from "@/components/shared-format";

export const dynamic = "force-dynamic";
export const metadata = { title: "SCORM / Bài giảng tương tác" };

export default async function ScormListPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "document:read")) return <NoAccess title="SCORM" perm="document:read" />;
  const d = await caller.content.documents({ kind: "scorm", courseId: sp.course || undefined });
  return (
    <div className="space-y-4">
      <PageHeader title="SCORM / Bài giảng tương tác" desc="Gói SCORM 1.2 / 2004 chạy trực tiếp trong hệ thống; ghi nhận tiến độ, điểm, thời gian học của từng người. Dùng cho bồi dưỡng giáo viên và bài giảng mẫu." actions={d.canEdit ? <DocForm courses={d.courses} /> : null} />
      <form className="flex gap-2" action="/scorm">
        <select name="course" defaultValue={sp.course ?? ""} className="input"><option value="">Mọi khoá</option>{d.courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select>
        <button className="btn-ghost">Lọc</button>
      </form>
      {d.items.length === 0 ? <Empty>Chưa có bài giảng tương tác. {d.canEdit ? "Thêm tài liệu loại SCORM rồi tải gói .zip." : ""}</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {d.items.map((x) => (
            <div key={x.id} className="card flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/documents/${x.id}`} className="font-semibold hover:underline">{x.title}</Link>
                <span className={`chip ${DOC_STATUS_CHIP[x.status]}`}>{x.statusLabel}</span>
              </div>
              <div className="text-xs text-ink-400">{x.courseCode}{x.lessonSeq ? ` · Bài ${x.lessonSeq}` : ""} · {x.currentVersion ? `v${x.currentVersion}` : "chưa có gói"} · {x.opens} lượt mở</div>
              {x.description && <p className="line-clamp-2 text-sm text-ink-600">{x.description}</p>}
              <div className="mt-auto flex gap-2">
                {x.currentVersion > 0 && <Link href={`/scorm/${x.id}`} className="btn-primary !py-1">Học</Link>}
                <Link href={`/documents/${x.id}`} className="btn-ghost !py-1">Chi tiết</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
