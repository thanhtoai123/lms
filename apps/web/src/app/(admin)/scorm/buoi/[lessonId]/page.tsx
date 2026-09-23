import Link from "next/link";
import { hasPermission, type Actor } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess } from "@/components/admin-ui";
import { PlanViewer } from "./viewer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Xem giáo án buổi học" };

/** Xem giáo án của một buổi: SCORM chạy trong trình chạy, PDF chiếu trong cùng khung. */
export default async function PlanViewPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "document:read")) return <NoAccess title="Giáo án buổi học" perm="document:read" />;
  const d = await caller.content.plan({ lessonId });
  const back = `/scorm?khoa=${d.lesson.courseId}&buoi=${lessonId}`;
  if (!d.plan) {
    return (
      <div className="space-y-3">
        <Link href={back} className="text-sm text-ink-600">← Giáo án buổi học</Link>
        <p className="card p-4 text-sm">Buổi này chưa có giáo án đang dùng.</p>
      </div>
    );
  }
  // Ghi nhật ký mở (ai xem giáo án nào, lúc nào) — dùng cho đối soát bản quyền học liệu
  await caller.content.planOpen({ lessonId });
  const me = await caller.auth.me();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={back} className="text-sm text-ink-600">← Giáo án buổi học</Link>
          <h1 className="text-xl font-bold">Buổi {d.lesson.sequenceNo} — {d.lesson.title}</h1>
          <p className="text-xs text-ink-400">
            {d.plan.kindLabel}
            {d.plan.kind === "scorm" ? ` ${d.plan.scormVersion ?? "1.2"} · ${d.plan.fileCount ?? 0} tệp` : ""}
            {" · "}{d.plan.sizeLabel} · v{d.plan.version} · {d.lesson.curriculumName}
          </p>
        </div>
        <Link href={`/documents/${d.plan.documentId}`} className="btn-ghost">Chi tiết & lượt mở</Link>
      </div>
      <PlanViewer
        kind={d.plan.kind}
        documentId={d.plan.documentId}
        fileUrl={d.plan.fileUrl}
        watermark={me?.user.fullName ?? "Sata Robo"}
      />
    </div>
  );
}
