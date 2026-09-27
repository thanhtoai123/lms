import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, ClipboardCheck, Lock } from "lucide-react";
import { watermarkText, weekdayOf, PLAN_WINDOW_BEFORE_MIN, PLAN_WINDOW_AFTER_MIN } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { Empty, WEEKDAY_VI, fmtDate } from "@/components/ui";
import { AccessCountdown, RequestAccess } from "@/components/teacher/plan-access";
import { PlanViewer } from "@/app/(admin)/scorm/buoi/[lessonId]/viewer";

export const metadata = { title: "Giáo án buổi học" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * XEM GIÁO ÁN (giao diện giáo viên) — khung chiếu SCORM / slide PDF dùng chung với khu quản trị
 * (chữ mờ, nhật ký mở, che khi có dấu hiệu chụp; nút Trình chiếu toàn màn hình nổi trong khung).
 * Mở từ một buổi dạy (`?buoi=`) thì có nút quay lại / điểm danh đúng buổi đó; luôn có buổi trước / sau của khoá.
 */
export default async function TeacherPlanView({ params, searchParams }: { params: Promise<{ lessonId: string }>; searchParams: Promise<{ buoi?: string }> }) {
  const { lessonId } = await params;
  const sp = await searchParams;
  if (!UUID.test(lessonId)) notFound();
  const buoi = sp.buoi && UUID.test(sp.buoi) ? sp.buoi : null;
  const { caller } = await getServerCaller();
  let d: Awaited<ReturnType<typeof caller.content.plan>>;
  try {
    d = await caller.content.plan({ lessonId });
  } catch (e) {
    return <Empty>{(e as Error).message}</Empty>;
  }
  const lessons = await caller.content.planLessons({ courseId: d.lesson.courseId }).catch(() => null);
  const idx = lessons?.items.findIndex((l) => l.id === lessonId) ?? -1;
  const prev = idx > 0 ? lessons!.items[idx - 1] : null;
  const next = lessons && idx >= 0 && idx < lessons.items.length - 1 ? lessons.items[idx + 1] : null;
  if (d.plan) await caller.content.planOpen({ lessonId }); // nhật ký mở (đối soát bản quyền học liệu)
  const me = d.plan ? await caller.auth.me() : null;
  const back = buoi ? { href: `/teacher/sessions/${buoi}`, label: "Buổi dạy" } : { href: `/teacher/giao-an?khoa=${d.lesson.courseId}`, label: "Giáo án của tôi" };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={back.href} className="inline-flex min-h-11 items-center text-ink-600">← {back.label}</Link>
        {buoi && <Link href={`/teacher/sessions/${buoi}#diem-danh`} className="btn-ghost min-h-11"><ClipboardCheck className="h-4 w-4" aria-hidden />Điểm danh buổi này</Link>}
      </div>
      <header>
        <h1 className="page-title">Buổi {d.lesson.sequenceNo} — {d.lesson.title}</h1>
        {d.plan && (
          <p className="text-[13px] text-ink-600">
            {d.plan.kindLabel}{d.plan.kind === "scorm" ? ` ${d.plan.scormVersion ?? "1.2"}` : ""} · v{d.plan.version} · {d.lesson.curriculumName} · nút <b>Trình chiếu</b> ở góc khung (phím F) để chiếu toàn màn hình
          </p>
        )}
      </header>

      {d.plan && d.access.until && d.access.via !== "all" && d.access.via && <AccessCountdown until={d.access.until} via={d.access.via} />}

      {!d.plan && d.locked ? (
        <section className="card space-y-4 p-4 md:p-6" aria-labelledby="khoa">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-black/5"><Lock className="h-5 w-5" aria-hidden /></span>
            <div>
              <h2 id="khoa" className="text-[17px] font-bold">Giáo án đang khoá</h2>
              <p className="text-[14px] text-ink-600">
                Giáo án {d.locked.kindLabel} chỉ mở trong ca dạy bài này ({PLAN_WINDOW_BEFORE_MIN} phút trước giờ vào lớp → {PLAN_WINDOW_AFTER_MIN} phút sau giờ tan).
              </p>
            </div>
          </div>
          <p className="rounded-xl bg-black/[0.03] px-3 py-2 text-[14px]">
            {d.access.next
              ? <>Ca dạy gần nhất: <b>{WEEKDAY_VI[weekdayOf(d.access.next.date)]} {fmtDate(d.access.next.date)}</b> · lớp {d.access.next.classCode} · giáo án tự mở lúc <b>{d.access.next.from}</b></>
              : "Bạn không có ca dạy bài này trong 30 ngày tới."}
          </p>
          <RequestAccess lessonId={lessonId} sessionId={buoi} request={d.access.request} canRequest={d.access.canRequest} />
        </section>
      ) : d.plan ? (
        <PlanViewer
          kind={d.plan.kind}
          documentId={d.plan.documentId}
          lessonId={lessonId}
          streamPath={d.plan.streamPath}
          watermark={watermarkText({ name: me?.user.fullName ?? "Sata Robo", contact: me?.user.email ?? null })}
          canReport
        />
      ) : (
        <Empty>Buổi này chưa có giáo án đang dùng — báo bộ phận đào tạo tải lên.</Empty>
      )}

      {(prev || next) && (
        <nav aria-label="Buổi khác của khoá" className="grid grid-cols-2 gap-2">
          {prev ? (
            <Link href={`/teacher/giao-an/${prev.id}`} className="card flex min-h-12 items-center gap-2 p-3 hover:border-primary/40">
              <ChevronLeft className="h-5 w-5 shrink-0 text-ink-600" aria-hidden />
              <span className="min-w-0"><span className="block text-[12px] text-ink-600">Buổi trước</span><span className="block truncate font-semibold">Buổi {prev.sequenceNo}: {prev.title}</span></span>
            </Link>
          ) : <span />}
          {next ? (
            <Link href={`/teacher/giao-an/${next.id}`} className="card flex min-h-12 items-center justify-end gap-2 p-3 text-right hover:border-primary/40">
              <span className="min-w-0"><span className="block text-[12px] text-ink-600">Buổi sau</span><span className="block truncate font-semibold">Buổi {next.sequenceNo}: {next.title}</span></span>
              <ChevronRight className="h-5 w-5 shrink-0 text-ink-600" aria-hidden />
            </Link>
          ) : <span />}
        </nav>
      )}
    </div>
  );
}
