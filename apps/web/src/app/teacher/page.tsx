import Link from "next/link";
import { FlaskConical, MessageCircle } from "lucide-react";
import { getServerCaller } from "@/lib/trpc/server";
import { fmtDate, Empty, WEEKDAY_VI } from "@/components/ui";
import { SessionCard } from "@/components/teacher/session-card";
import { NowCard } from "@/components/teacher/now-card";
import { weekdayOf, fmtDeadlineVi, gioVietNam } from "@satarobo/core";

export const dynamic = "force-dynamic";

export default async function TeacherToday() {
  const { caller } = await getServerCaller();
  let data: Awaited<ReturnType<typeof caller.teacher.today>>;
  try {
    data = await caller.teacher.today();
  } catch (e) {
    return <Empty>{(e as Error).message}. Tài khoản này chưa gắn hồ sơ giáo viên — hãy đăng nhập bằng tài khoản GV hoặc sang <Link className="underline" href="/dashboard">Trang quản trị</Link>.</Empty>;
  }
  // Phiếu nhận xét còn thiếu của buổi mình đã dạy, kèm hạn theo chuẩn hồ sơ học tập của cơ sở
  const [sheets, fb, trial] = await Promise.all([
    caller.academics.evaluations.pending({ limit: 10 }).catch(() => null),
    caller.teacher.feedback({ days: 14, limit: 8 }).catch(() => null),
    caller.teacher.trialPending().catch(() => null),
  ]);
  const freshFb = fb?.items.filter((x) => x.fresh).length ?? 0;
  const hasSide = (!!sheets && sheets.total > 0) || (!!fb && fb.items.length > 0) || (!!trial && trial.total > 0);

  return (
    <div className="space-y-6">
      <section className="md:flex md:items-end md:justify-between md:gap-4">
        <div>
          <h1 className="page-title">Chào {data.teacher.fullName} 👋</h1>
          <p className="text-ink-600">{WEEKDAY_VI[weekdayOf(data.today)]}, {fmtDate(data.today)}</p>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4">
          <Link href="/huong-dan" className="inline-flex min-h-11 items-center text-[14px] text-brand-600">Hướng dẫn sử dụng →</Link>
        </div>
      </section>

      <NowCard rows={[...data.todays, ...data.upcoming]} initial={gioVietNam()} />

      {/* Điện thoại: một cột theo thứ tự việc gấp (order-*). Màn rộng: trái = buổi dạy, phải = phiếu + phản hồi */}
      <div className={`flex flex-col gap-6 ${hasSide ? "lg:grid lg:grid-cols-3 lg:items-start" : ""}`}>
      <div className={hasSide ? "contents lg:col-span-2 lg:block lg:space-y-6" : "contents"}>
      {data.overdue.length > 0 && (
        <section className="order-1 space-y-2">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-red-700">
            Cần chốt ngay <span className="chip bg-red-100 text-red-700">{data.overdue.length}</span>
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{data.overdue.map((s) => <SessionCard key={s.id} s={s} highlight />)}</div>
        </section>
      )}

      <section className="order-3 space-y-2">
        <h2 className="text-[15px] font-bold">Hôm nay</h2>
        {data.todays.length === 0 ? <Empty>Hôm nay bạn không có buổi dạy.</Empty> : <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{data.todays.map((s) => <SessionCard key={s.id} s={s} showDate={false} />)}</div>}
      </section>

      <section className="order-5 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-bold text-ink-600">Sắp tới</h2>
          <Link href="/teacher/lich" className="inline-flex min-h-11 items-center text-[14px] font-semibold text-brand-600">Cả lịch dạy →</Link>
        </div>
        {/* Chỉ vài buổi gần nhất — lịch đầy đủ ở mục Lịch dạy */}
        {data.upcoming.length === 0 ? <Empty>Không có buổi dạy trong 7 ngày tới.</Empty> : <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{data.upcoming.slice(0, 4).map((s) => <SessionCard key={s.id} s={s} />)}</div>}
      </section>
      </div>
      <div className="contents lg:block lg:space-y-6">
      {sheets && sheets.total > 0 && (
        <section className="order-2 space-y-2" aria-label="Phiếu cần hoàn thiện">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            Phiếu cần hoàn thiện <span className="chip bg-amber-100 text-amber-800">{sheets.total}</span>
            {sheets.overdue > 0 && <span className="chip bg-red-100 text-red-700">{sheets.overdue} quá hạn</span>}
          </h2>
          <div className="card divide-y divide-black/5">
            {sheets.items.map((p) => (
              <Link key={p.sessionId} href={`/teacher/sessions/${p.sessionId}#can-hoan-thien`} className="flex min-h-11 items-center justify-between gap-3 p-3 hover:bg-black/[0.02]">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{p.className} · {p.label}</div>
                  <div className="text-[13px] text-ink-600">{fmtDate(p.date)} · {p.missing} học viên chưa có phiếu</div>
                </div>
                <span className={`chip shrink-0 ${p.overdue ? "bg-red-100 text-red-700" : "bg-amber-50 text-amber-800"}`}>
                  {p.overdue ? "Quá hạn" : "Hạn"} {fmtDeadlineVi(new Date(p.deadline))}
                </span>
              </Link>
            ))}
          </div>
          {sheets.total > sheets.items.length && <p className="text-[13px] text-ink-600">Còn {sheets.total - sheets.items.length} buổi khác — hoàn thiện các buổi trên trước.</p>}
        </section>
      )}

      {trial && trial.total > 0 && (
        <section className="order-3 space-y-2" aria-label="Học thử chờ đánh giá">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <FlaskConical className="h-4 w-4 text-brand-600" aria-hidden /> Học thử chờ đánh giá <span className="chip bg-amber-100 text-amber-800">{trial.total}</span>
            {trial.overdue > 0 && <span className="chip bg-red-100 text-red-700">{trial.overdue} quá 48 giờ</span>}
          </h2>
          <div className="card divide-y divide-black/5">
            {trial.items.map((t) => (
              <div key={t.id} className="flex min-h-11 items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{t.childName}</div>
                  <div className="truncate text-[13px] text-ink-600">{[t.classLabel, t.centerCode, t.hasDraft ? "có bản nháp" : null].filter(Boolean).join(" · ")}</div>
                </div>
                <span className={`chip shrink-0 ${t.overdue ? "bg-red-100 text-red-700" : "bg-amber-50 text-amber-800"}`}>{t.hoursAgo >= 48 ? `${Math.floor(t.hoursAgo / 24)} ngày trước` : `${t.hoursAgo} giờ trước`}</span>
              </div>
            ))}
          </div>
          <p className="text-[13px] text-ink-600">Buổi học thử đã qua 24 giờ mà chưa gửi phiếu cho phụ huynh. Phiếu do quản lý / tư vấn cơ sở mở và gửi — hãy nhắn nhận xét của bạn về bé cho họ.{trial.total > trial.items.length ? ` Còn ${trial.total - trial.items.length} bé khác.` : ""}</p>
        </section>
      )}

      {fb && fb.items.length > 0 && (
        <section className="order-4 space-y-2" aria-label="Phản hồi mới của phụ huynh">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <MessageCircle className="h-4 w-4 text-brand-600" aria-hidden /> Phản hồi của phụ huynh
            {freshFb > 0 && <span className="chip bg-brand-100 text-brand-700">{freshFb} mới</span>}
            {fb.counts.concern > 0 && <span className="chip bg-accent-100 text-accent-700">😟 {fb.counts.concern} cần trao đổi</span>}
          </h2>
          <ul className="card divide-y divide-black/5">
            {fb.items.map((x) => (
              <li key={x.id}>
                <Link href={`/teacher/sessions/${x.sessionId}#phan-hoi-ph`} className="flex min-h-11 items-start gap-3 p-3 hover:bg-black/[0.02]">
                  <span className="text-[22px] leading-none" role="img" aria-label={x.reactionLabel}>{x.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{x.studentName} <span className="font-normal text-ink-600">· {x.classCode} · {x.label}</span></span>
                    {x.note ? <span className="line-clamp-2 block text-[14px]">“{x.note}”</span> : <span className="block text-[14px] text-ink-600">{x.reactionLabel}</span>}
                    {x.reaction === "concern" && <span className="block text-[12px] text-accent-700">{x.handled ? "CSKH đã phản hồi phụ huynh" : "CSKH sẽ gọi lại phụ huynh trong 24 giờ"}</span>}
                  </span>
                  <span className="shrink-0 text-[12px] text-ink-600">{fmtDate(x.date)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
      </div>
    </div>
  );
}
