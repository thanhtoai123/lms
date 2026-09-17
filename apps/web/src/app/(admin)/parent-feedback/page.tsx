import { hasPermission, FEEDBACK_STATUSES, FEEDBACK_STATUS_VI, FEEDBACK_TAG_VI, CONTACT_CHANNEL_VI, type Actor, type FeedbackStatus, type FeedbackTag } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader, StatTabs } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { FeedbackChip, Stars, dtVN } from "@/components/care-ui";
import { CsvButton } from "@/components/csv-button";
import { NewFeedback, RespondFeedback } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Đánh giá phụ huynh" };

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ status?: string; low?: string; from?: string; to?: string; teacher?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  if (!ctx.actor || !hasPermission(ctx.actor as Actor, "care:read")) return <NoAccess title="Đánh giá phụ huynh" perm="care:read" />;
  const status = FEEDBACK_STATUSES.includes(sp.status as FeedbackStatus) ? (sp.status as FeedbackStatus) : undefined;
  const d = await caller.care.feedback({ status, low: sp.low === "1", from: sp.from || undefined, to: sp.to || undefined, teacherId: sp.teacher || undefined });
  const canCreate = hasPermission(ctx.actor as Actor, "care:create");
  const pct = (n: number, t: number) => (t ? Math.round((n / t) * 100) : 0);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Đánh giá phụ huynh"
        desc="Đánh giá buổi học và giáo viên (1–5 sao). Đánh giá ≤ 2 sao tự tạo việc chăm sóc gọi lại trong 24h; phản hồi xong việc chăm sóc tự đóng và phụ huynh nhận được trả lời."
        actions={<CsvButton filename="danh-gia-phu-huynh" headers={["Ngày", "Học viên", "Lớp", "Buổi", "GV", "Hài lòng", "Điểm GV", "Nhãn", "Ý kiến", "Trạng thái", "Phản hồi"]} rows={d.items.map((f) => [dtVN(f.createdAt), f.studentName, f.classCode, f.sessionNo, f.teacherName, f.rating, f.teacherRating, f.tags.map((t) => FEEDBACK_TAG_VI[t as FeedbackTag] ?? t).join("; "), f.comment, FEEDBACK_STATUS_VI[f.status], f.response])} />}
      />
      <div className="grid gap-3 md:grid-cols-4">
        <div className="card p-3"><div className="text-xs text-ink-400">Hài lòng chung</div><b className="text-2xl">{d.stats.overall.avg ?? "—"}</b><span className="text-xs text-ink-400"> / 5 · {d.stats.overall.count} lượt</span>
          <div className="mt-2 space-y-0.5">{[5, 4, 3, 2, 1].map((n) => <div key={n} className="flex items-center gap-1 text-[11px]"><span className="w-3">{n}</span><div className="h-1.5 flex-1 rounded bg-black/5"><div className={`h-1.5 rounded ${n <= 2 ? "bg-red-400" : n === 3 ? "bg-amber-400" : "bg-green-500"}`} style={{ width: `${pct(d.stats.overall.dist[n - 1]!, d.stats.overall.count)}%` }} /></div><span className="w-6 text-right">{d.stats.overall.dist[n - 1]}</span></div>)}</div>
        </div>
        <div className="card p-3"><div className="text-xs text-ink-400">Điểm giáo viên</div><b className="text-2xl">{d.stats.teacher.avg ?? "—"}</b><span className="text-xs text-ink-400"> / 5</span></div>
        <div className="card p-3"><div className="text-xs text-ink-400">Chưa phản hồi</div><b className="text-2xl">{d.stats.pending}</b><div className="text-xs text-red-700">{d.stats.lowPending} đánh giá thấp</div></div>
        <div className="card p-3 text-xs"><div className="text-ink-400">Nhãn hay gặp</div>{d.tagCounts.slice(0, 5).map((t) => <div key={t.tag} className="flex justify-between"><span>{t.label}</span><b>{t.n}</b></div>)}</div>
      </div>
      {d.byTeacher.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400"><tr><th className="p-2">Giáo viên</th><th className="p-2">Điểm GV</th><th className="p-2">Hài lòng chung</th><th className="p-2 text-right">Lượt</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {d.byTeacher.map((t) => (
                <tr key={t.teacherId}><td className="p-2"><a className="text-brand-700" href={`/parent-feedback?teacher=${t.teacherId}`}>{t.teacherName}</a></td><td className="p-2">{t.teacher.avg ?? "—"}</td><td className="p-2">{t.overall.avg ?? "—"}</td><td className="p-2 text-right">{t.overall.count}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canCreate && <NewFeedback />}
      <form className="flex flex-wrap items-end gap-2" action="/parent-feedback">
        {status && <input type="hidden" name="status" value={status} />}
        <label className="text-xs text-ink-600">Từ<input type="date" name="from" defaultValue={sp.from} className="input mt-1" /></label>
        <label className="text-xs text-ink-600">Đến<input type="date" name="to" defaultValue={sp.to} className="input mt-1" /></label>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="low" value="1" defaultChecked={sp.low === "1"} /> Chỉ đánh giá ≤ 3 sao</label>
        <button className="btn-ghost">Lọc</button>
      </form>
      <StatTabs basePath="/parent-feedback" params={sp} active={status ?? ""} tabs={[{ key: "", label: "Tất cả" }, ...FEEDBACK_STATUSES.map((s) => ({ key: s, label: FEEDBACK_STATUS_VI[s] }))]} />
      {d.items.length === 0 ? <Empty>Chưa có đánh giá.</Empty> : (
        <div className="space-y-2">
          {d.items.map((f) => (
            <div key={f.id} className={`card p-3 text-sm ${f.priority === "urgent" && f.status !== "resolved" ? "border-l-4 border-l-red-400" : f.priority === "follow_up" && f.status !== "resolved" ? "border-l-4 border-l-amber-400" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><b>{f.studentName}</b> <span className="text-xs text-ink-400">{f.classCode}{f.sessionNo ? ` · buổi ${f.sessionNo}` : ""}{f.teacherName ? ` · GV ${f.teacherName}` : ""} · PH {f.parentName ?? "—"} · {CONTACT_CHANNEL_VI[f.channel]} · {dtVN(f.createdAt)}</span></div>
                <FeedbackChip status={f.status} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3"><span>Chung <Stars n={f.rating} /></span>{f.teacherRating != null && <span>GV <Stars n={f.teacherRating} /></span>}{f.tags.map((t) => <span key={t} className="chip bg-black/5">{FEEDBACK_TAG_VI[t as FeedbackTag] ?? t}</span>)}</div>
              {f.comment && <p className="mt-1">“{f.comment}”</p>}
              {f.response && <p className="mt-1 rounded-lg bg-green-50 p-2 text-xs">↳ {f.responderName}: {f.response}</p>}
              {f.canRespond && <RespondFeedback id={f.id} status={f.status} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
