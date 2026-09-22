import Link from "next/link";
import { BookOpen, ChevronRight, Clock, MessageCircle, UsersRound } from "lucide-react";
import { getServerCaller } from "@/lib/trpc/server";
import { StatusChip, fmtTime, fmtDate, Empty, WEEKDAY_VI } from "@/components/ui";
import { weekdayOf, fmtDeadlineVi } from "@satarobo/core";

export const dynamic = "force-dynamic";

type Row = Awaited<ReturnType<Awaited<ReturnType<typeof getServerCaller>>["caller"]["teacher"]["today"]>>["todays"][number];

/** Thẻ buổi dạy: chạm vào thân thẻ mở màn buổi dạy; nút "Chuẩn bị" mở màn chuẩn bị (buổi hôm nay / sắp tới) */
function SessionCard({ s, highlight, prep }: { s: Row; highlight?: boolean; prep?: boolean }) {
  return (
    <div className={`card overflow-hidden ${highlight ? "border-brand-500/40 ring-2 ring-brand-100" : ""}`}>
      <Link href={`/teacher/sessions/${s.id}`} className="block p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[13px] text-ink-600"><Clock className="h-3.5 w-3.5" aria-hidden />{WEEKDAY_VI[weekdayOf(s.date)]} {fmtDate(s.date)} · {fmtTime(s.startTime)}–{fmtTime(s.endTime)} · {s.roomCode ?? "—"}</div>
            <div className="truncate font-semibold">{s.className}</div>
            <div className="truncate text-[14px] text-ink-600">{s.label}{s.topic ? ` · ${s.topic}` : ""}</div>
          </div>
          <StatusChip status={s.status} />
        </div>
        <div className="mt-3 flex items-center justify-between text-[13px] text-ink-600">
          <span className="inline-flex items-center gap-1"><UsersRound className="h-4 w-4" aria-hidden />Sĩ số {s.enrolled} · {s.attended}/{s.enrolled} đã điểm danh</span>
          {s.isOverdue && <span className="chip bg-red-100 text-red-700">Quá hạn</span>}
          {s.nextStep && !s.isOverdue && <span className="font-semibold text-brand-600">{s.nextStep === "submit_attendance" ? "Điểm danh →" : s.nextStep === "submit_notes" ? "Nhận xét →" : "Hoàn tất →"}</span>}
        </div>
      </Link>
      {prep && (
        <Link href={`/teacher/sessions/${s.id}/chuan-bi`} className="flex min-h-11 items-center justify-between gap-2 border-t border-black/5 bg-brand-50/60 px-4 text-[14px] font-semibold text-primary">
          <span className="inline-flex items-center gap-2"><BookOpen className="h-4 w-4" aria-hidden />Chuẩn bị buổi dạy: bài, tiêu chí, HV cần lưu ý</span>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

export default async function TeacherToday() {
  const { caller } = await getServerCaller();
  let data: Awaited<ReturnType<typeof caller.teacher.today>>;
  try {
    data = await caller.teacher.today();
  } catch (e) {
    return <Empty>{(e as Error).message}. Tài khoản này chưa gắn hồ sơ giáo viên — hãy đăng nhập bằng tài khoản GV hoặc sang <Link className="underline" href="/dashboard">Trang quản trị</Link>.</Empty>;
  }
  // Phiếu nhận xét còn thiếu của buổi mình đã dạy, kèm hạn theo chuẩn hồ sơ học tập của cơ sở
  const [sheets, fb] = await Promise.all([
    caller.academics.evaluations.pending({ limit: 10 }).catch(() => null),
    caller.teacher.feedback({ days: 14, limit: 8 }).catch(() => null),
  ]);
  const freshFb = fb?.items.filter((x) => x.fresh).length ?? 0;

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-lg font-bold">Chào {data.teacher.fullName} 👋</h1>
        <p className="text-ink-600">{WEEKDAY_VI[weekdayOf(data.today)]}, {fmtDate(data.today)}</p>
        <div className="mt-1 flex flex-wrap gap-x-4">
          <Link href="/cham-cong/lich-ca" className="inline-flex min-h-11 items-center text-[14px] font-semibold text-brand-600">Lịch ca & chấm công của tôi →</Link>
          <Link href="/huong-dan" className="inline-flex min-h-11 items-center text-[14px] text-brand-600">Hướng dẫn sử dụng →</Link>
        </div>
      </section>

      {data.overdue.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-red-700">
            Cần chốt ngay <span className="chip bg-red-100 text-red-700">{data.overdue.length}</span>
          </h2>
          {data.overdue.map((s) => <SessionCard key={s.id} s={s} highlight />)}
        </section>
      )}

      {sheets && sheets.total > 0 && (
        <section className="space-y-2" aria-label="Phiếu cần hoàn thiện">
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

      <section className="space-y-2">
        <h2 className="text-[15px] font-bold">Hôm nay</h2>
        {data.todays.length === 0 ? <Empty>Hôm nay bạn không có buổi dạy.</Empty> : data.todays.map((s) => <SessionCard key={s.id} s={s} prep={s.status === "scheduled" || s.status === "in_progress"} />)}
      </section>

      {fb && fb.items.length > 0 && (
        <section className="space-y-2" aria-label="Phản hồi mới của phụ huynh">
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

      <section className="space-y-2">
        <h2 className="text-[15px] font-bold text-ink-600">7 ngày tới</h2>
        {data.upcoming.length === 0 ? <Empty>Chưa có lịch.</Empty> : data.upcoming.map((s) => <SessionCard key={s.id} s={s} prep />)}
      </section>
    </div>
  );
}
