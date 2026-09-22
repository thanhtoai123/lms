import Link from "next/link";
import { ScrollText, TriangleAlert } from "lucide-react";
import { getServerCaller } from "@/lib/trpc/server";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * LỚP CỦA TÔI — mỗi lớp: tiến độ (buổi x/y), học viên có nguy cơ (vắng nhiều / vắng liên tiếp, mức đánh giá giảm),
 * học bạ mốc đã tới hạn chưa viết hoặc sắp tới. Chạm tên lớp mở trang lớp (quản trị) như trước.
 */
export default async function MyClasses() {
  const { caller } = await getServerCaller();
  const d = await caller.teacher.classInsights().catch(() => null);
  if (!d || (d.classes.length === 0 && d.others.length === 0)) return <Empty>Bạn chưa được phân công lớp nào.</Empty>;
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Lớp của tôi</h1>
      {d.classes.map((c) => (
        <section key={c.id} className="card space-y-3 p-4" aria-label={c.name}>
          <Link href={`/classes/${c.id}`} className="block">
            <div className="flex justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-semibold">{c.name}</div>
                <div className="text-[13px] text-ink-600">{c.code} · {c.centerCode} · {c.schedule ?? "chưa có lịch"}</div>
              </div>
              {c.overdue > 0 && <span className="chip h-fit bg-red-100 text-red-700">{c.overdue} quá hạn</span>}
            </div>
            <div className="mt-2 flex justify-between text-[13px] text-ink-600"><span>{c.enrolled}/{c.capacity} HV</span><span>{c.sessionsDone}/{c.sessionsTotal} buổi{c.percent !== null ? ` · ${c.percent}%` : ""}</span></div>
            <div className="mt-1 h-2 rounded-full bg-black/5" role="progressbar" aria-label={`Tiến độ lớp ${c.code}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.percent ?? 0}>
              <div className="h-2 rounded-full bg-brand-500" style={{ width: `${c.percent ?? 0}%` }} />
            </div>
          </Link>

          {c.milestones.length > 0 && (
            <ul className="space-y-1">
              {c.milestones.map((m) => (
                <li key={m.seq} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-[14px] ${m.state === "due" ? "bg-violet-50 text-violet-900" : "bg-black/[0.03]"}`}>
                  <ScrollText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    Học bạ mốc buổi {m.seq}: {m.state === "due" ? <b>đã tới hạn · còn {m.missing} em chưa có</b> : <>còn {m.left} buổi nữa{m.missing ? ` · ${m.missing} em sẽ cần học bạ` : ""}</>}
                  </span>
                </li>
              ))}
              {c.milestones.some((m) => m.state === "due") && <li><Link href="/report-cards" className="inline-flex min-h-11 items-center px-1 text-[14px] font-semibold text-brand-600">Viết học bạ →</Link></li>}
            </ul>
          )}

          {c.risks.length > 0 ? (
            <div>
              <div className="mb-1 flex items-center gap-1 text-[14px] font-semibold text-amber-800"><TriangleAlert className="h-4 w-4" aria-hidden />Cần quan tâm ({c.risks.length})</div>
              <ul className="divide-y divide-black/5">
                {c.risks.map((r) => (
                  <li key={r.enrollmentId} className="flex items-start justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="block font-semibold">{r.fullName}</span>
                      <span className="block text-[13px] text-ink-600">{r.reasons.join(" · ")}</span>
                    </span>
                    <span className={`chip shrink-0 ${r.level === "high" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{r.level === "high" ? "Cao" : "Theo dõi"}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : <p className="text-[13px] text-green-800">Không có học viên nào cần lưu ý đặc biệt.</p>}
        </section>
      ))}
      {d.others.length > 0 && (
        <details className="card p-4">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-ink-600">Lớp khác ({d.others.length})</summary>
          <ul className="mt-1 divide-y divide-black/5">
            {d.others.map((c) => <li key={c.id}><Link href={`/classes/${c.id}`} className="flex min-h-11 items-center justify-between gap-2"><span className="truncate">{c.name}</span><span className="text-[13px] text-ink-600">{c.code}</span></Link></li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
