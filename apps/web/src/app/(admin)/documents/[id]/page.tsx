import Link from "next/link";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader } from "@/components/admin-ui";
import { dtVN } from "@/components/care-ui";
import { DocForm, OpenDocButton, UploadVersion, DocStatusButtons } from "@/components/content-ui";
import { DOC_STATUS_CHIP, fmtSize } from "@/components/shared-format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tài liệu" };
const ACTION_VI: Record<string, string> = { download: "Tải", view: "Mở liên kết", launch: "Học SCORM", download_package: "Tải gói SCORM" };

export default async function DocumentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caller } = await getServerCaller();
  const d = await caller.content.document({ id });
  const courses = d.canEdit ? (await caller.content.documents({ page: 1 })).courses : [];
  const report = d.kind === "scorm" && d.canEdit ? await caller.content.scormReport({ id }) : null;
  const hasContent = d.kind === "link" ? !!d.url : d.currentVersion > 0;
  return (
    <div className="space-y-4">
      <Link href={d.kind === "scorm" ? "/scorm" : "/documents"} className="text-sm text-ink-600">← {d.kind === "scorm" ? "Bài giảng tương tác" : "Tài liệu giảng dạy"}</Link>
      <PageHeader
        title={d.title}
        desc={`${d.courseCode} — ${d.courseName}${d.lessonSeq ? ` · Bài ${d.lessonSeq}: ${d.lessonTitle}` : " · dùng chung cả khoá"} · ${d.categoryLabel} · ${d.audience === "student" ? "GV + HV/PH xem được" : "chỉ giáo viên"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip ${DOC_STATUS_CHIP[d.status]}`}>{d.statusLabel}</span>
            {hasContent && <OpenDocButton id={d.id} kind={d.kind} className="btn-primary" label={d.kind === "scorm" ? "Mở bài giảng" : d.kind === "link" ? "Mở liên kết" : "Tải về"} />}
            {d.canEdit && <DocForm courses={courses} doc={{ id: d.id, title: d.title, description: d.description, kind: d.kind, category: d.category, audience: d.audience, courseId: d.courseId, lessonId: d.lessonId, url: d.url, tags: d.tags }} />}
          </div>
        }
      />
      {d.description && <p className="card whitespace-pre-line p-4 text-sm">{d.description}</p>}
      {d.embed && <div className="card overflow-hidden"><iframe src={d.embed} title={d.title} className="aspect-video w-full" allow="encrypted-media; fullscreen" /></div>}
      {d.myAttempt && <p className="text-sm">Tiến độ của bạn: <b>{d.myAttempt.statusLabel}</b>{d.myAttempt.score !== null ? ` · điểm ${d.myAttempt.score}` : ""} · {Math.round(d.myAttempt.totalSeconds / 60)} phút · {d.myAttempt.launches} lần mở</p>}
      {d.canEdit && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <DocStatusButtons id={d.id} status={d.status} />
          <span className="text-xs text-ink-400">{d.stats.opens} lượt mở · {d.stats.users} người</span>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {d.kind !== "link" && (
          <section className="card space-y-3 p-4">
            <h2 className="font-semibold">Phiên bản</h2>
            {d.canEdit && d.status !== "archived" && <UploadVersion documentId={d.id} kind={d.kind} />}
            {d.versions.length === 0 ? <p className="text-sm text-amber-700">Chưa có tệp.</p> : (
              <ul className="divide-y divide-black/5 text-sm">
                {d.versions.map((v) => (
                  <li key={v.id} className="flex items-start justify-between gap-2 py-2">
                    <div>
                      <div className="font-medium">v{v.version}{v.version === d.currentVersion && <span className="chip ml-1 bg-green-100 text-green-800">hiện hành</span>} · {v.fileName}</div>
                      <div className="text-xs text-ink-400">{fmtSize(v.sizeBytes)} · {dtVN(v.createdAt)} · {v.byName ?? "—"}{v.scormVersion ? ` · SCORM ${v.scormVersion}, ${v.fileCount} tệp, mở ${v.launchPath}` : ""}</div>
                      {v.note && <div className="text-xs">{v.note}</div>}
                    </div>
                    {d.canEdit && <OpenDocButton id={d.id} kind="file" version={v.version} label="Tải" />}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {d.access.length > 0 && (
          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Nhật ký mở / tải</h2>
            <ul className="space-y-1 text-xs">{d.access.map((a, i) => <li key={i}>{dtVN(a.createdAt)} · {a.byName ?? "—"} · {ACTION_VI[a.action] ?? a.action}{a.version ? ` v${a.version}` : ""}</li>)}</ul>
          </section>
        )}
      </div>
      {report && (
        <section className="card overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 p-3">
            <h2 className="font-semibold">Tiến độ học SCORM</h2>
            <span className="text-xs text-ink-600">{report.summary.learners} người học · hoàn thành {report.summary.completed} ({report.summary.rate}%) · điểm TB {report.summary.avgScore ?? "—"} · TB {report.summary.avgMinutes} phút</span>
          </div>
          {report.items.length === 0 ? <p className="p-4 text-sm text-ink-400">Chưa có ai học.</p> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Người học</th><th className="p-3">Trạng thái</th><th className="p-3 text-right">Điểm</th><th className="p-3 text-right">Thời gian</th><th className="p-3">Cập nhật</th></tr></thead>
              <tbody className="divide-y divide-black/5">
                {report.items.map((r) => <tr key={r.id}><td className="p-3">{r.userName}<div className="text-xs text-ink-400">v{r.version} · {r.launches} lần mở</div></td><td className="p-3 text-xs">{r.statusLabel}</td><td className="p-3 text-right tabular-nums">{r.score ?? "—"}</td><td className="p-3 text-right tabular-nums">{Math.round(r.totalSeconds / 60)} phút</td><td className="p-3 text-xs">{dtVN(r.updatedAt)}</td></tr>)}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
