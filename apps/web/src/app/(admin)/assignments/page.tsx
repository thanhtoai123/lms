import Link from "next/link";
import { hasPermission, ASSIGNMENT_STATUSES, ASSIGNMENT_STATUS_VI, type Actor, type AssignmentStatus, type SubmissionType } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, Pager } from "@/components/admin-ui";
import { Kpi } from "@/components/report-ui";
import { Empty } from "@/components/ui";
import { dtVN } from "@/components/care-ui";
import { AssignmentForm, TemplateForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bài tập về nhà" };
const CHIP: Record<AssignmentStatus, string> = { draft: "bg-slate-100 text-slate-600", published: "bg-blue-100 text-blue-700", closed: "bg-green-100 text-green-800" };

type SP = { class?: string; status?: string; tab?: string; page?: string };

export default async function AssignmentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || (!hasPermission(actor, "assignment:read") && !hasPermission(actor, "assignment:configure"))) return <NoAccess title="Bài tập về nhà" perm="assignment:read" />;
  const tab = sp.tab === "templates" || !hasPermission(actor, "assignment:read") ? "templates" : "list";
  const status = ASSIGNMENT_STATUSES.includes(sp.status as AssignmentStatus) ? (sp.status as AssignmentStatus) : undefined;
  const d = hasPermission(actor, "assignment:read") ? await caller.content.assignments({ classId: sp.class || undefined, status, page: Math.max(1, Number(sp.page) || 1) }) : null;
  const tpls = tab === "templates" ? await caller.content.templates({ includeInactive: true }) : null;
  const courses = tpls?.canEdit ? (await caller.content.documents({})).courses : [];
  const creatable = (d?.classes ?? []).filter((c) => c.canCreate);
  return (
    <div className="space-y-4">
      <PageHeader title="Bài tập về nhà" desc="Giáo viên giao bài theo lớp; phụ huynh nhận liên kết nộp bài (ảnh / link / trả lời); chấm điểm, trả lại làm lại, thưởng xu khi đạt ≥ 80%; tự nhắc hạn trước 24 giờ."
        actions={<div className="flex gap-2">{creatable.length > 0 && <AssignmentForm classes={creatable} defaultClassId={sp.class} />}{tpls?.canEdit && <TemplateForm courses={courses} />}</div>} />
      {d && (
        <div className="grid grid-cols-3 gap-3">
          <Kpi label="Bài tập" value={d.total} />
          <Kpi label="Bài nộp chờ chấm" value={d.toGrade} tone={d.toGrade ? "warn" : "default"} />
          <Kpi label="Đã quá hạn (chưa đóng)" value={d.overdue} tone={d.overdue ? "bad" : "default"} />
        </div>
      )}
      <div className="flex gap-1 border-b border-black/10 text-sm">
        {d && <Link href="/assignments" className={`-mb-px border-b-2 px-3 py-2 ${tab === "list" ? "border-brand-600 font-semibold text-brand-600" : "border-transparent"}`}>Bài đã giao</Link>}
        <Link href="/assignments?tab=templates" className={`-mb-px border-b-2 px-3 py-2 ${tab === "templates" ? "border-brand-600 font-semibold text-brand-600" : "border-transparent"}`}>Mẫu bài tập</Link>
      </div>
      {tab === "list" && d && (
        <>
          <form className="flex flex-wrap gap-2" action="/assignments">
            <select name="class" defaultValue={sp.class ?? ""} className="input"><option value="">Mọi lớp</option>{d.classes.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select>
            <select name="status" defaultValue={status ?? ""} className="input"><option value="">Mọi trạng thái</option>{ASSIGNMENT_STATUSES.map((s) => <option key={s} value={s}>{ASSIGNMENT_STATUS_VI[s]}</option>)}</select>
            <button className="btn-ghost">Lọc</button>
          </form>
          {d.items.length === 0 ? <Empty>Chưa có bài tập.</Empty> : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Bài tập</th><th className="p-3">Lớp</th><th className="p-3">Hạn nộp</th><th className="p-3">Tiến độ</th><th className="p-3">Trạng thái</th></tr></thead>
                <tbody className="divide-y divide-black/5">
                  {d.items.map((a) => (
                    <tr key={a.id}>
                      <td className="p-3"><Link href={`/assignments/${a.id}`} className="font-medium hover:underline">{a.title}</Link><div className="text-xs text-ink-400">{a.typeLabel}{a.coinReward ? ` · +${a.coinReward} xu` : ""} · {a.byName ?? "—"}</div></td>
                      <td className="p-3 text-xs">{a.classCode}{a.sessionSeq ? <div className="text-ink-400">buổi {a.sessionSeq}</div> : null}</td>
                      <td className={`p-3 text-xs ${a.overdue ? "font-semibold text-red-700" : ""}`}>{dtVN(a.dueAt)}</td>
                      <td className="p-3 text-xs">
                        {a.status === "draft" ? "—" : <>
                          <div>Nộp {a.counts.submitted + a.counts.graded}/{a.counts.total} · chấm {a.counts.graded}</div>
                          {a.counts.submitted > 0 && <div className="font-semibold text-amber-700">{a.counts.submitted} chờ chấm</div>}
                          {a.counts.missing > 0 && <div className="text-red-700">{a.counts.missing} không nộp</div>}
                        </>}
                      </td>
                      <td className="p-3"><span className={`chip ${CHIP[a.status as AssignmentStatus]}`}>{a.statusLabel}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager basePath="/assignments" params={sp} page={d.page} pageSize={d.pageSize} total={d.total} />
        </>
      )}
      {tab === "templates" && tpls && (
        tpls.items.length === 0 ? <Empty>Chưa có mẫu bài tập.</Empty> : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-3">Mẫu</th><th className="p-3">Khoá / bài</th><th className="p-3">Hình thức</th><th className="p-3 text-right">Đã dùng</th><th /></tr></thead>
              <tbody className="divide-y divide-black/5">
                {tpls.items.map((t) => (
                  <tr key={t.id} className={t.isActive ? "" : "opacity-50"}>
                    <td className="p-3"><div className="font-medium">{t.title}</div><div className="line-clamp-2 text-xs text-ink-400">{t.instructions}</div></td>
                    <td className="p-3 text-xs">{t.courseCode}{t.lessonSeq ? ` · Bài ${t.lessonSeq}` : ""}</td>
                    <td className="p-3 text-xs">{t.typeLabel} · thang {t.maxScore}</td>
                    <td className="p-3 text-right tabular-nums">{t.used}</td>
                    <td className="p-3 text-right">{tpls.canEdit && <TemplateForm courses={courses} tpl={{ id: t.id, courseId: t.courseId, lessonId: t.lessonId, title: t.title, instructions: t.instructions, submissionType: t.submissionType as SubmissionType, maxScore: t.maxScore, isActive: t.isActive }} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
