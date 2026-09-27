import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock, MonitorPlay } from "lucide-react";
import { addDays, dauTuan, gioVietNam, phutTrongNgay, weekdayOf } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { Empty, StatusChip, WEEKDAY_VI, fmtTime } from "@/components/ui";
import { SessionCard, planButton, type CardRow } from "@/components/teacher/session-card";

export const metadata = { title: "Lịch dạy" };
export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Mục gọn trong cột ngày (máy tính): giờ, lớp, buổi + 2 nút nhỏ */
function MiniSession({ s }: { s: CardRow }) {
  const huy = s.status === "cancelled" || s.status === "rescheduled";
  const pb = planButton(s);
  return (
    <div className={`rounded-lg border border-black/10 bg-white text-[13px] ${huy ? "opacity-60" : ""}`}>
      <Link href={`/teacher/sessions/${s.id}`} className="block space-y-0.5 p-2 hover:bg-brand-50/50">
        <div className="font-bold tabular-nums">{fmtTime(s.startTime)}–{fmtTime(s.endTime)}</div>
        <div className="line-clamp-2 font-semibold leading-snug">{s.className}</div>
        <div className="line-clamp-2 text-ink-600">{s.label}{s.topic ? ` · ${s.topic}` : ""}</div>
        <div className="flex flex-wrap items-center gap-1 pt-0.5"><StatusChip status={s.status} />{s.roomCode && <span className="text-[12px] text-ink-600">P.{s.roomCode}</span>}</div>
      </Link>
      {!huy && (
        <div className="grid grid-cols-2 border-t border-black/5 text-[12px] font-semibold">
          {pb ? (
            <Link href={pb.href} className={`flex min-h-9 items-center justify-center gap-1 hover:bg-brand-50 ${pb.locked ? "text-ink-600" : "text-primary"}`} title={pb.label}>
              {pb.locked ? <Lock className="h-3.5 w-3.5" aria-hidden /> : <MonitorPlay className="h-3.5 w-3.5" aria-hidden />}Giáo án
            </Link>
          ) : <span className="flex min-h-9 items-center justify-center text-[11px] text-ink-600">Chưa có GA</span>}
          <Link href={`/teacher/sessions/${s.id}/chuan-bi`} className="flex min-h-9 items-center justify-center border-l border-black/5 text-primary hover:bg-brand-50">Chuẩn bị</Link>
        </div>
      )}
    </div>
  );
}

/**
 * LỊCH DẠY THEO TUẦN (T2 → CN). `?tuan=<ngày bất kỳ trong tuần>`; lùi / tiến tuần, về tuần này.
 * Máy tính: 7 cột ngày. Điện thoại / máy tính bảng: danh sách theo ngày, ngày trống thu thành một dòng.
 * Mỗi buổi có nút Giáo án (khi bài đã có giáo án) và Chuẩn bị.
 */
export default async function TeacherSchedule({ searchParams }: { searchParams: Promise<{ tuan?: string }> }) {
  const sp = await searchParams;
  const { today, nowMin } = gioVietNam();
  const start = dauTuan(sp.tuan && ISO.test(sp.tuan) ? sp.tuan : today);
  const end = addDays(start, 6);
  const { caller } = await getServerCaller();
  let d: Awaited<ReturnType<typeof caller.teacher.range>>;
  try {
    d = await caller.teacher.range({ from: start, to: end });
  } catch (e) {
    return <Empty>{(e as Error).message}</Empty>;
  }
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const byDay = new Map(days.map((x) => [x, d.items.filter((s) => s.date === x)]));
  const active = d.items.filter((s) => s.status !== "cancelled" && s.status !== "rescheduled");
  const phut = active.reduce((n, s) => n + phutTrongNgay(s.endTime) - phutTrongNgay(s.startTime), 0);
  const conLai = active.filter((s) => s.date > today || (s.date === today && phutTrongNgay(s.startTime) > nowMin)).length;
  const thisWeek = dauTuan(today) === start;
  const q = (iso: string) => `/teacher/lich?tuan=${iso}`;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Lịch dạy</h1>
          <p className="text-[14px] text-ink-600">{active.length} buổi · {Math.round((phut / 60) * 10) / 10} giờ dạy{thisWeek && conLai > 0 ? ` · còn ${conLai} buổi tuần này` : ""}</p>
        </div>
        <nav aria-label="Chọn tuần" className="flex items-center gap-1">
          <Link href={q(addDays(start, -7))} className="btn-ghost !min-h-11 !px-3" aria-label="Tuần trước"><ChevronLeft className="h-5 w-5" aria-hidden /></Link>
          <span className="min-w-[132px] text-center text-[14px] font-semibold tabular-nums">{dm(start)} – {dm(end)}/{end.slice(0, 4)}</span>
          <Link href={q(addDays(start, 7))} className="btn-ghost !min-h-11 !px-3" aria-label="Tuần sau"><ChevronRight className="h-5 w-5" aria-hidden /></Link>
          {!thisWeek && <Link href="/teacher/lich" className="btn-ghost !min-h-11 !px-3 text-[14px]">Tuần này</Link>}
        </nav>
      </header>

      {thisWeek && conLai === 0 && (
        <Link href={q(addDays(start, 7))} className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 text-[15px] font-semibold text-brand-700">
          Tuần này không còn buổi dạy nào — xem lịch tuần sau<ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
        </Link>
      )}

      {/* Máy tính: 7 cột */}
      <div className="hidden gap-2 lg:grid lg:grid-cols-7">
        {days.map((x) => {
          const list = byDay.get(x) ?? [];
          const isToday = x === today;
          return (
            <section key={x} aria-label={`${WEEKDAY_VI[weekdayOf(x)]} ${dm(x)}`} className={`min-h-40 rounded-xl p-2 ${isToday ? "bg-brand-50 ring-2 ring-brand-200" : "bg-black/[0.03]"}`}>
              <h2 className={`mb-2 flex items-baseline justify-between px-1 text-[13px] font-bold ${isToday ? "text-brand-700" : "text-ink-600"}`}>
                <span>{WEEKDAY_VI[weekdayOf(x)]}</span><span className="tabular-nums">{dm(x)}{isToday ? " · hôm nay" : ""}</span>
              </h2>
              <div className="space-y-2">
                {list.length ? list.map((s) => <MiniSession key={s.id} s={s} />) : <p className="px-1 text-[12px] text-ink-600">Không có buổi</p>}
              </div>
            </section>
          );
        })}
      </div>

      {/* Điện thoại / máy tính bảng: theo ngày */}
      <div className="space-y-4 lg:hidden">
        {days.map((x) => {
          const list = byDay.get(x) ?? [];
          const isToday = x === today;
          if (!list.length) {
            return <p key={x} className={`rounded-lg px-3 py-2 text-[14px] ${isToday ? "bg-brand-50 font-semibold text-brand-700" : "bg-black/[0.03] text-ink-600"}`}>{WEEKDAY_VI[weekdayOf(x)]} {dm(x)}{isToday ? " (hôm nay)" : ""} · không có buổi</p>;
          }
          return (
            <section key={x} aria-label={`${WEEKDAY_VI[weekdayOf(x)]} ${dm(x)}`} className="space-y-2">
              <h2 className={`text-[15px] font-bold ${isToday ? "text-brand-700" : ""}`}>{WEEKDAY_VI[weekdayOf(x)]} {dm(x)}{isToday ? " · hôm nay" : ""}</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{list.map((s) => <SessionCard key={s.id} s={s} showDate={false} highlight={s.status === "in_progress"} />)}</div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
