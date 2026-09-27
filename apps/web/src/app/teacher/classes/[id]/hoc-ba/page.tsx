import Link from "next/link";
import { notFound } from "next/navigation";
import { ScrollText } from "lucide-react";
import { REPORT_CARD_STATUS_VI } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { RC_CHIP } from "@/components/admin-ui";
import { Empty, fmtDate } from "@/components/ui";

export const metadata = { title: "Học bạ lớp" };
export const dynamic = "force-dynamic";

/**
 * HỌC BẠ MỐC CỦA LỚP — bản giáo viên (lớp mình dạy / trợ giảng). Trước đây "Viết học bạ" dẫn sang
 * màn quản lý Học bạ & hồ sơ học tập (cần quyền đầy đủ) nên giáo viên gặp "Chưa có quyền".
 * Mỗi học viên một thẻ, mỗi mốc một chip: chạm để viết / sửa học bạ.
 */
export default async function TeacherClassReportCards({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { caller } = await getServerCaller();
  let d: Awaited<ReturnType<typeof caller.learning.classReportCards>>;
  try {
    d = await caller.learning.classReportCards({ classId: id });
  } catch (e) {
    return <Empty>{(e as Error).message}</Empty>;
  }
  const due = d.rows.reduce((n, r) => n + r.cells.filter((c) => c.due).length, 0);

  return (
    <div className="space-y-4">
      <Link href="/teacher/classes" className="inline-flex min-h-11 items-center text-ink-600">← Lớp của tôi</Link>
      <header className="card p-4">
        <h1 className="flex items-center gap-2 text-lg font-bold md:text-xl"><ScrollText className="h-5 w-5 text-brand-600" aria-hidden />Học bạ · {d.class.name}</h1>
        <p className="text-[14px] text-ink-600">{d.class.code} · {d.class.courseCode}</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[13px]">
          {d.milestones.map((m) => (
            <span key={m.seq} className="chip bg-black/5">{m.label}{m.date ? ` · ${fmtDate(m.date)}` : ""}{m.reached ? "" : " · chưa tới"}</span>
          ))}
          {due > 0 && <span className="chip bg-red-100 text-red-700">{due} học bạ cần viết</span>}
        </div>
      </header>
      {d.criteriaCount === 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Khoá {d.class.courseCode} chưa có tiêu chí năng lực — báo bộ phận đào tạo cấu hình trước khi viết học bạ.</div>}
      {d.rows.length === 0 ? <Empty>Lớp chưa có học viên.</Empty> : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {d.rows.map((r) => (
            <li key={r.enrollmentId} className="card p-3">
              <div className="font-semibold">{r.fullName}</div>
              <div className="text-[12px] text-ink-600">{r.code}{r.status === "trial" ? " · học thử" : ""}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.cells.map((c) => {
                  if (!c.applicable) return null;
                  if (!c.reached && !c.cardId) return <span key={c.seq} className="chip bg-black/[0.03] text-ink-600">B{c.seq} · chưa tới</span>;
                  return (
                    <Link key={c.seq} href={`/report-cards/${r.enrollmentId}/${c.seq}`}
                      className={`chip inline-flex min-h-9 items-center ${c.status ? RC_CHIP[c.status] : "bg-red-50 text-red-700"} ${c.due ? "ring-1 ring-red-300" : ""}`}>
                      B{c.seq} · {c.status ? REPORT_CARD_STATUS_VI[c.status] : "Viết học bạ"}{c.averageScore ? ` · ${c.averageScore}` : ""}
                    </Link>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
