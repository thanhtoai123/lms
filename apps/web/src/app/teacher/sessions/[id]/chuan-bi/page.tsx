import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, ClipboardCheck, FileText, Star, Target, TriangleAlert, Wrench } from "lucide-react";
import { getServerCaller } from "@/lib/trpc/server";
import { fmtDate, WEEKDAY_VI } from "@/components/ui";
import { weekdayOf, fmtDeadlineVi, type PrepTone } from "@satarobo/core";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chuẩn bị buổi dạy" };

const TONE: Record<PrepTone, string> = {
  danger: "bg-red-50 text-red-800 ring-red-200",
  warn: "bg-amber-50 text-amber-900 ring-amber-200",
  info: "bg-sky-50 text-sky-900 ring-sky-200",
  good: "bg-green-50 text-green-800 ring-green-200",
};

/**
 * CHUẨN BỊ BUỔI DẠY — mở từ thẻ buổi trên trang chủ GV:
 * bài học, mục tiêu, học cụ, tiêu chí đánh giá (trọng tâm trước) kèm mô tả 4 mức (cùng dữ liệu khối "Buổi này cần hoàn thiện"),
 * tài liệu giảng dạy của bài, học viên cần lưu ý (sức khoẻ / dị ứng, vắng buổi trước, PH cần trao đổi, học thử, thẻ nổi bật).
 */
export default async function PrepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { caller } = await getServerCaller();
  let d: Awaited<ReturnType<typeof caller.teacher.prep>>;
  try {
    d = await caller.teacher.prep({ sessionId: id });
  } catch (e) {
    return <div className="card p-6 text-danger">{(e as Error).message}</div>;
  }
  const s = d.session;
  const focus = d.criteria.filter((c) => c.focus);
  const others = d.criteria.filter((c) => !c.focus);

  return (
    <div className="space-y-4">
      <Link href="/teacher" className="inline-flex min-h-11 items-center text-ink-600">← Hôm nay</Link>

      <header className="card p-4">
        <div className="text-[13px] text-ink-600">{WEEKDAY_VI[weekdayOf(s.date)]} {fmtDate(s.date)} · {s.startTime}–{s.endTime}</div>
        <h1 className="text-[18px] font-bold">{s.className}</h1>
        <div className="text-ink-600">{s.label}{s.courseName ? ` · ${s.courseName}` : ""}</div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-black/[0.03] p-2"><div className="text-[12px] text-ink-600">Sĩ số</div><div className="text-[18px] font-extrabold">{d.counts.total}</div></div>
          <div className="rounded-xl bg-amber-50 p-2"><div className="text-[12px] text-amber-900">Cần lưu ý</div><div className="text-[18px] font-extrabold text-amber-900">{d.counts.flagged}</div></div>
          <div className="rounded-xl bg-sky-50 p-2"><div className="text-[12px] text-sky-900">Học thử</div><div className="text-[18px] font-extrabold text-sky-900">{d.counts.trial}</div></div>
        </div>
        <Link href={`/teacher/sessions/${s.id}`} className="btn-primary mt-3 min-h-11 w-full">
          <ClipboardCheck className="h-5 w-5" aria-hidden /> {s.isToday ? "Vào buổi dạy: điểm danh & phiếu" : "Mở màn buổi dạy"}
        </Link>
      </header>

      {/* Bài học */}
      <section className="card space-y-3 p-4" aria-label="Bài học">
        <h2 className="flex items-center gap-2 font-bold"><BookOpen className="h-5 w-5 text-brand-600" aria-hidden />{d.lesson.sequenceNo ? `Bài ${d.lesson.sequenceNo}: ` : ""}{d.lesson.title ?? "Chưa gắn bài giảng"}</h2>
        {d.lesson.objectives && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-[13px] font-semibold uppercase tracking-wide text-ink-600"><Target className="h-4 w-4" aria-hidden />Mục tiêu</div>
            <p className="whitespace-pre-line">{d.lesson.objectives}</p>
          </div>
        )}
        {d.lesson.materials && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-[13px] font-semibold uppercase tracking-wide text-ink-600"><Wrench className="h-4 w-4" aria-hidden />Học cụ</div>
            <p className="whitespace-pre-line">{d.lesson.materials}</p>
          </div>
        )}
        {d.previous && (
          <div className="rounded-xl bg-black/[0.03] p-3 text-[14px]">
            <div className="font-semibold">Buổi trước · {d.previous.label} · {fmtDate(d.previous.date)}{d.previous.absent ? ` · vắng ${d.previous.absent}` : ""}</div>
            {d.previous.note && <p className="mt-1 text-ink-600">{d.previous.note}</p>}
          </div>
        )}
        <p className="text-[13px] text-ink-600">Hạn hoàn thiện phiếu nhận xét: {fmtDeadlineVi(new Date(d.deadline))}</p>
      </section>

      {/* Học viên cần lưu ý */}
      <section className="card p-4" aria-label="Học viên">
        <h2 className="mb-2 flex items-center gap-2 font-bold"><TriangleAlert className="h-5 w-5 text-amber-600" aria-hidden />Học viên ({d.counts.total})</h2>
        {d.healthHidden && <p className="mb-2 text-[13px] text-ink-600">Ghi chú sức khoẻ chỉ hiện với giáo viên phụ trách lớp.</p>}
        <ul className="divide-y divide-black/5">
          {d.students.map((x) => (
            <li key={x.enrollmentId} className="py-2">
              <div className="font-semibold">{x.fullName}{x.nickname ? <span className="font-normal text-ink-600"> ({x.nickname})</span> : null}</div>
              {x.notes.length > 0 ? (
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {x.notes.map((n, i) => <li key={i} className={`rounded-full px-2.5 py-0.5 text-[13px] ring-1 ${TONE[n.tone]}`}>{n.text}</li>)}
                </ul>
              ) : <div className="text-[13px] text-ink-600">Không có lưu ý</div>}
            </li>
          ))}
          {d.students.length === 0 && <li className="py-2 text-ink-600">Lớp chưa có học viên.</li>}
        </ul>
      </section>

      {/* Tiêu chí đánh giá */}
      <section className="card space-y-3 p-4" aria-label="Tiêu chí đánh giá">
        <h2 className="flex items-center gap-2 font-bold"><Star className="h-5 w-5 text-brand-600" aria-hidden />Tiêu chí đánh giá{focus.length ? ` · ${focus.length} trọng tâm` : ""}</h2>
        {[...focus, ...others].map((c) => (
          <details key={c.key} className="rounded-xl ring-1 ring-black/5" open={c.focus}>
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 font-semibold">
              {c.focus && <span className="chip bg-brand-100 text-brand-700">Trọng tâm</span>}{c.label}
            </summary>
            <ol className="space-y-1 px-3 pb-3 text-[14px]">
              {c.levels.map((l) => <li key={l.value}><b>{l.value}. {l.label}:</b> <span className="text-ink-600">{l.hint}</span></li>)}
            </ol>
          </details>
        ))}
        {d.standardLines.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-ink-600">{d.standardLines.map((l, i) => <li key={i}>{l}</li>)}</ul>
        )}
      </section>

      {/* Tài liệu */}
      <section className="card p-4" aria-label="Tài liệu giảng dạy">
        <h2 className="mb-2 flex items-center gap-2 font-bold"><FileText className="h-5 w-5 text-brand-600" aria-hidden />Tài liệu giảng dạy</h2>
        {d.documents.length === 0 ? <p className="text-ink-600">Chưa có tài liệu đã phát hành cho bài này.</p> : (
          <ul className="divide-y divide-black/5">
            {d.documents.map((x) => (
              <li key={x.id}>
                <Link href={x.href} className="flex min-h-11 items-center justify-between gap-2 py-2">
                  <span className="min-w-0"><span className="block truncate font-semibold text-brand-600">{x.title}</span><span className="block text-[13px] text-ink-600">{x.category} · {x.kindLabel}{x.forLesson ? " · của bài này" : " · chung của khoá"}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
