import Link from "next/link";
import { hasPermission, type Actor, REPORT_CARD_STATUS_VI, type ReportCardStatus } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader, RC_CHIP } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { ReviewQueue } from "./queue";

export const dynamic = "force-dynamic";
export const metadata = { title: "Học bạ năng lực" };


export default async function ReportCardsPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor;
  const canApprove = hasPermission(actor, "report_card:approve");
  const opts = (await caller.schedule.classOptions()).filter((c) => c.status === "running" || c.status === "finished" || c.status === "recruiting");
  const classId = sp.class && opts.some((c) => c.id === sp.class) ? sp.class : undefined;
  const [data, queue, due] = await Promise.all([
    classId ? caller.learning.classReportCards({ classId }) : Promise.resolve(null),
    canApprove ? caller.learning.reviewQueue() : Promise.resolve([]),
    caller.learning.dueReportCards(),
  ]);
  const dueByClass = new Map<string, { code: string; n: number }>();
  for (const d of due) dueByClass.set(d.classId, { code: d.classCode, n: (dueByClass.get(d.classId)?.n ?? 0) + 1 });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Học bạ năng lực"
        desc="Mỗi kỳ 12 buổi có học bạ giữa kỳ (buổi 5) và cuối kỳ (buổi 12). Giáo viên chấm theo tiêu chí của khoá → giáo vụ duyệt → gửi phụ huynh."
        actions={<Link href="/report-cards/criteria" className="btn-ghost">Tiêu chí học bạ</Link>}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          <form className="flex gap-2">
            <select name="class" defaultValue={classId ?? ""} className="input max-w-lg">
              <option value="">— Chọn lớp —</option>
              {opts.map((c) => <option key={c.id} value={c.id}>{c.centerCode} · {c.code} — {c.name}{dueByClass.get(c.id) ? ` (${dueByClass.get(c.id)!.n} chưa viết)` : ""}</option>)}
            </select>
            <button className="btn-primary">Xem học viên</button>
          </form>
          {!data ? (
            <div className="card p-4">
              <h2 className="mb-2 font-bold">Lớp có học bạ chưa viết</h2>
              {dueByClass.size === 0 ? <p className="text-sm text-ink-400">Không có học bạ quá mốc chưa viết.</p> : (
                <div className="flex flex-wrap gap-2">{[...dueByClass.entries()].map(([id, v]) => <Link key={id} href={`/report-cards?class=${id}`} className="chip bg-red-50 px-3 py-1.5 text-red-700">{v.code} · {v.n}</Link>)}</div>
              )}
            </div>
          ) : (
            <>
              {data.criteriaCount === 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Khoá {data.class.courseCode} chưa có tiêu chí năng lực — <Link href="/report-cards/criteria" className="underline">cấu hình tiêu chí</Link> trước khi chấm.</div>}
              {data.rows.length === 0 ? <Empty>Lớp chưa có học viên.</Empty> : (
                <div className="card overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-ink-400">
                        <th className="p-3">Học viên</th>
                        {data.milestones.map((m) => <th key={m.seq} className="p-2 text-center font-normal"><div className="font-semibold text-ink-600">B{m.seq}</div><div className="text-[10px]">{m.date ? `${m.date.slice(8, 10)}/${m.date.slice(5, 7)}` : "—"}{m.reached ? "" : " · chưa tới"}</div></th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {data.rows.map((r) => (
                        <tr key={r.enrollmentId}>
                          <td className="p-3"><Link href={`/hoc-ba?student=${r.studentId}`} className="font-medium hover:text-brand-600">{r.fullName}</Link><div className="font-mono text-[10px] text-ink-400">{r.code}</div></td>
                          {r.cells.map((c) => (
                            <td key={c.seq} className="p-1 text-center">
                              {!c.applicable ? <span className="text-[10px] text-ink-400">—</span> : !c.reached && !c.cardId ? <span className="text-[10px] text-ink-400">chưa tới</span> : (
                                <Link href={`/report-cards/${r.enrollmentId}/${c.seq}`} className={`chip ${c.status ? RC_CHIP[c.status] : "bg-red-50 text-red-700"} ${c.due ? "ring-1 ring-red-300" : ""}`}>
                                  {c.status ? REPORT_CARD_STATUS_VI[c.status] : "Chưa viết"}{c.averageScore ? ` · ${c.averageScore}` : ""}
                                </Link>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
        {canApprove && <ReviewQueue items={queue.map((q) => ({ ...q, submittedAt: q.submittedAt?.toISOString() ?? null }))} />}
      </div>
    </div>
  );
}
