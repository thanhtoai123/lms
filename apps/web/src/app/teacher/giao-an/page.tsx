import Link from "next/link";
import { CalendarClock, ChevronRight, FileText, Lock, MonitorPlay } from "lucide-react";
import { addDays, gioVietNam, weekdayOf } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { Empty, WEEKDAY_VI, fmtDate } from "@/components/ui";
import { ClassTabs } from "@/components/teacher/class-tabs";

export const metadata = { title: "Giáo án của tôi" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const hm = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });

/** Trạng thái xem giáo án của bài: đang mở (trong ca / được duyệt), chờ duyệt, hay khoá */
function AccessChip({ a }: { a: { state: string; until: string | null; opensAt: string | null } }) {
  if (a.state === "all") return null;
  if (a.state === "open") return <span className="chip bg-green-100 text-green-800">Đang mở · trong ca đến {a.until ? hm(a.until) : ""}</span>;
  if (a.state === "granted") return <span className="chip bg-green-100 text-green-800">Được duyệt · đến {a.until ? hm(a.until) : ""}</span>;
  if (a.state === "pending") return <span className="chip bg-amber-100 text-amber-900">Chờ quản lý duyệt</span>;
  return <span className="chip bg-black/5 text-ink-600"><Lock className="mr-1 h-3 w-3" aria-hidden />{a.opensAt ? `Mở ${a.opensAt}` : "Khoá · xin xem"}</span>;
}

/**
 * GIÁO ÁN CỦA TÔI — khoá mình dạy → từng buổi: có giáo án chưa (SCORM / slide), buổi nào sắp dạy.
 * Chỉ để XEM (đổi giáo án là việc của bộ phận đào tạo ở Kho tài liệu). Chạm một buổi → khung chiếu.
 */
export default async function MyLessonPlans({ searchParams }: { searchParams: Promise<{ khoa?: string }> }) {
  const sp = await searchParams;
  const { caller } = await getServerCaller();
  const { today } = gioVietNam();
  const [courses, upcoming, mine] = await Promise.all([
    caller.content.planCourses().catch(() => []),
    caller.teacher.range({ from: today, to: addDays(today, 41) }).then((r) => r.items).catch(() => []),
    caller.content.planAccessMine().catch(() => []),
  ]);
  // Khoá mặc định: khoá của buổi dạy gần nhất, nếu không thì khoá đầu tiên
  const nextCourse = upcoming.find((s) => s.status !== "cancelled" && s.status !== "rescheduled")?.courseId;
  const courseId = sp.khoa && UUID.test(sp.khoa) && courses.some((c) => c.id === sp.khoa) ? sp.khoa : (courses.find((c) => c.id === nextCourse) ?? courses[0])?.id;
  const lessons = courseId ? await caller.content.planLessons({ courseId }).catch(() => null) : null;
  // Buổi dạy sắp tới của từng bài (gần nhất)
  const nextByLesson = new Map<string, { id: string; date: string; startTime: string; className: string }>();
  for (const s of upcoming) if (s.lessonId && s.status !== "cancelled" && s.status !== "rescheduled" && !nextByLesson.has(s.lessonId)) nextByLesson.set(s.lessonId, s);

  return (
    <div className="space-y-4">
      <ClassTabs active="giao-an" />
      <header>
        <h1 className="text-lg font-bold md:text-xl">Giáo án của tôi</h1>
        <p className="text-[14px] text-ink-600">Giáo án của từng buổi thuộc khoá bạn dạy. Giáo án tự mở trong ca dạy bài đó (30 phút trước giờ vào lớp đến 15 phút sau giờ tan); ngoài ca, mở bài và gửi yêu cầu để quản lý duyệt xem 2 giờ.</p>
      </header>

      {courses.length === 0 ? <Empty>Bạn chưa được phân công khoá nào nên chưa có giáo án để xem.</Empty> : (
        <>
          {courses.length > 1 && (
            <nav aria-label="Chọn khoá học" className="flex flex-wrap gap-1.5">
              {courses.map((c) => (
                <Link key={c.id} href={`/teacher/giao-an?khoa=${c.id}`} aria-current={c.id === courseId ? "page" : undefined}
                  className={`inline-flex min-h-10 items-center rounded-full border px-3 text-[14px] ${c.id === courseId ? "border-primary bg-primary-soft font-semibold text-primary" : "border-border bg-card text-ink-600 hover:border-primary/40"}`}>
                  {c.code}
                </Link>
              ))}
            </nav>
          )}
          {lessons && (
            <p className="text-[13px] text-ink-600">
              {courses.find((c) => c.id === courseId)?.name} · {lessons.curriculumName ?? "—"} · đã có giáo án <b>{lessons.coverage.done}/{lessons.coverage.total}</b> buổi
            </p>
          )}
          {!lessons || lessons.items.length === 0 ? <Empty>Khoá này chưa có khung chương trình đang dùng.</Empty> : (
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {lessons.items.map((l) => {
                const next = nextByLesson.get(l.id);
                const body = (
                  <>
                    <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${l.hasPlan ? "bg-brand-50 text-brand-700" : "bg-black/[0.04] text-ink-600"}`}>
                      {l.planKind === "scorm" ? <MonitorPlay className="h-5 w-5" aria-hidden /> : <FileText className="h-5 w-5" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold leading-snug">Buổi {l.sequenceNo}: {l.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px]">
                        {l.hasPlan ? <span className="chip bg-brand-50 text-brand-700">{l.planKind === "scorm" ? "SCORM" : "Slide PDF"}</span> : <span className="chip bg-black/5 text-ink-600">Chưa có giáo án</span>}
                        {l.hasPlan && l.access && <AccessChip a={l.access} />}
                        {next && <span className="chip bg-amber-100 text-amber-900"><CalendarClock className="mr-1 h-3 w-3" aria-hidden />Dạy {next.date === today ? "hôm nay" : `${WEEKDAY_VI[weekdayOf(next.date)]} ${fmtDate(next.date).slice(0, 5)}`} {next.startTime.slice(0, 5)}</span>}
                      </span>
                    </span>
                    {l.hasPlan && <ChevronRight className="h-4 w-4 shrink-0 text-ink-600" aria-hidden />}
                  </>
                );
                return (
                  <li key={l.id}>
                    {l.hasPlan ? (
                      <Link href={`/teacher/giao-an/${l.id}${next ? `?buoi=${next.id}` : ""}`} className={`card flex min-h-14 items-center gap-3 p-3 hover:border-primary/40 ${next ? "ring-1 ring-amber-200" : ""}`}>{body}</Link>
                    ) : (
                      <div className="card flex min-h-14 items-center gap-3 p-3 opacity-70">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {mine.length > 0 && (
        <section className="space-y-2" aria-labelledby="yeu-cau">
          <h2 id="yeu-cau" className="text-[15px] font-bold">Yêu cầu xem ngoài ca của tôi (14 ngày)</h2>
          <ul className="card divide-y divide-black/5">
            {mine.map((r) => (
              <li key={r.id}>
                <Link href={`/teacher/giao-an/${r.lessonId}`} className="flex min-h-12 flex-wrap items-center justify-between gap-2 px-3 py-2 hover:bg-black/[0.02]">
                  <span className="min-w-0">
                    <span className="block font-semibold">{r.label}</span>
                    <span className="block text-[13px] text-ink-600">“{r.reason}”{r.decisionNote ? ` · ↳ ${r.decisionNote}` : ""}</span>
                  </span>
                  <span className={`chip shrink-0 ${r.status === "approved" ? "bg-green-100 text-green-800" : r.status === "pending" ? "bg-amber-100 text-amber-900" : r.status === "rejected" || r.status === "revoked" ? "bg-red-100 text-red-700" : "bg-black/5 text-ink-600"}`}>
                    {r.statusLabel}{r.status === "approved" && r.expiresAt ? ` đến ${hm(r.expiresAt)}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
