import Link from "next/link";
import { hasPermission, type Actor, REPORT_CARD_STATUS_VI } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { PageHeader, RC_CHIP } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { ReviewQueue } from "./review-queue";

/**
 * Chip "Học bạ mốc cần viết / duyệt" của trang Học bạ & hồ sơ học tập (trước đây là trang /report-cards
 * "Học bạ năng lực" — đường cũ chuyển hướng 308 về đây, giữ nguyên ?class=).
 * Lưới học bạ mốc theo lớp + hàng đợi duyệt (Chờ duyệt → Đã duyệt, chờ gửi PH). Viết / duyệt từng học bạ
 * ở trang chi tiết /report-cards/<ghi danh>/<buổi mốc>.
 */
export async function MilestoneView({ classParam }: { classParam?: string }) {
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor;
  const canApprove = hasPermission(actor, "report_card:approve");
  const opts = (await caller.schedule.classOptions()).filter((c) => c.status === "running" || c.status === "finished" || c.status === "recruiting");
  const classId = classParam && opts.some((c) => c.id === classParam) ? classParam : undefined;
  const [data, queue, due] = await Promise.all([
    classId ? caller.learning.classReportCards({ classId }) : Promise.resolve(null),
    canApprove ? caller.learning.reviewQueue() : Promise.resolve([]),
    caller.learning.dueReportCards(),
  ]);
  const dueByClass = new Map<string, { code: string; n: number }>();
  for (const d of due) dueByClass.set(d.classId, { code: d.classCode, n: (dueByClass.get(d.classId)?.n ?? 0) + 1 });
  const classHref = (id: string) => `/ho-so-hoc-tap?xem=hoc-ba-moc&class=${id}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Học bạ mốc cần viết / duyệt"
        desc="Mỗi kỳ 12 buổi có học bạ giữa kỳ (buổi 5) và cuối kỳ (buổi 12). Học bạ tự điền sẵn trung bình các phiếu buổi của giai đoạn — giáo viên xác nhận và viết nhận xét → giáo vụ duyệt → gửi phụ huynh."
        actions={<Link href="/report-cards/criteria" className="btn-ghost">Tiêu chí học bạ</Link>}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          <form className="flex gap-2" action="/ho-so-hoc-tap">
            <input type="hidden" name="xem" value="hoc-ba-moc" />
            <select name="class" defaultValue={classId ?? ""} className="input max-w-lg" aria-label="Lớp">
              <option value="">— Chọn lớp —</option>
              {opts.map((c) => {
                const n = dueByClass.get(c.id)?.n;
                return <option key={c.id} value={c.id}>{c.centerCode} · {c.code} — {c.name}{n ? ` (${n} chưa viết)` : ""}</option>;
              })}
            </select>
            <button className="btn-primary">Xem học viên</button>
          </form>
          {!data ? (
            <div className="card p-4">
              <h2 className="mb-2 font-bold">Lớp có học bạ chưa viết</h2>
              {dueByClass.size === 0 ? <p className="text-sm text-ink-400">Không có học bạ quá mốc chưa viết.</p> : (
                <div className="flex flex-wrap gap-2">{[...dueByClass.entries()].map(([id, v]) => <Link key={id} href={classHref(id)} className="chip bg-red-50 px-3 py-1.5 text-red-700">{v.code} · {v.n}</Link>)}</div>
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
                          <td className="p-3">
                            <Link href={`/ho-so-hoc-tap/${r.studentId}?enrollmentId=${r.enrollmentId}`} className="font-medium hover:text-brand-600" title="Mở hồ sơ học tập khoá này">{r.fullName}</Link>
                            <div className="font-mono text-[10px] text-ink-400">{r.code}</div>
                          </td>
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
