import Link from "next/link";
import { ChevronLeft, ChevronRight, MapPin, UserRound } from "lucide-react";
import { getDb } from "@satarobo/db";
import { familyChildren, hubSchedule, type ScheduleEntry } from "@satarobo/api";
import { monthGrid, weekGrid, normalizeMonth, shiftMonth, monthOf, pickChild, childShortName, addDays, weekdayOf, type CalendarDay } from "@satarobo/core";
import { requireParent } from "@/lib/parent-session";
import { PhMain, ChildChips, dayPh, todayPh } from "@/components/ph-ui";
import { AbsenceButton, MakeupButton } from "@/components/ph/actions";
import { TONE_STYLE, ToneChip } from "@/components/ph/bits";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lịch học — Sata Robo", robots: { index: false } };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const WD_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/**
 * LỊCH HỌC CỦA CON — tháng (lưới + danh sách) hoặc tuần: buổi thường, học bù, nghỉ lễ, trạng thái điểm danh từng buổi;
 * xin nghỉ buổi sắp tới / xin học bù buổi đã vắng ngay trên từng buổi.
 */
export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ con?: string; thang?: string; xem?: string; ngay?: string }> }) {
  const sp = await searchParams;
  const p = await requireParent();
  const db = getDb();
  const kids = await familyChildren(db, p.id);
  const kid = pickChild(kids, sp.con);
  const today = todayPh();
  const week = sp.xem === "tuan";
  const anchor = sp.ngay && DAY.test(sp.ngay) ? sp.ngay : today;
  const month = week ? monthOf(anchor) : normalizeMonth(sp.thang, today);

  if (!kid) {
    return (
      <>
        <PhMain><div className="card p-5">Chưa có học viên gắn với tài khoản này.</div></PhMain>
      </>
    );
  }
  const name = childShortName(kid);
  // Khoảng ngày cần tải: trọn lưới tháng (kể cả ngày đệm) hoặc 7 ngày của tuần
  const skeleton = week ? weekGrid(anchor, [], [], today) : monthGrid(month, [], [], today).weeks.flat();
  const range = { from: skeleton[0]!.date, to: skeleton[skeleton.length - 1]!.date };
  const s = await hubSchedule(db, p.id, kid.id, range);
  const entries = s?.entries ?? [];
  const hols = s?.holidays ?? [];
  const base = `/ph/lich?con=${kid.id}`;
  const weekStart = addDays(anchor, 1 - weekdayOf(anchor));

  return (
    <>
      <PhMain className="space-y-4">
        <ChildChips kids={kids} activeId={kid.id} hrefFor={(id) => `/ph/lich?con=${id}${week ? `&xem=tuan&ngay=${anchor}` : `&thang=${month}`}`} />

        {/* Máy tính: lưới lịch đứng yên bên trái, danh sách buổi cuộn bên phải — điện thoại vẫn xếp chồng */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-4 lg:sticky lg:top-24">
        <div className="flex items-center gap-2">
          <div className="grid flex-1 grid-cols-2 rounded-2xl bg-black/5 p-1 text-[15px] font-semibold" role="tablist" aria-label="Kiểu xem lịch">
            <Link role="tab" aria-selected={!week} href={`${base}&thang=${month}`} className={`flex min-h-11 items-center justify-center rounded-xl ${!week ? "bg-white shadow-sm" : "text-ink-600"}`}>Tháng</Link>
            <Link role="tab" aria-selected={week} href={`${base}&xem=tuan&ngay=${week ? anchor : today}`} className={`flex min-h-11 items-center justify-center rounded-xl ${week ? "bg-white shadow-sm" : "text-ink-600"}`}>Tuần</Link>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Link aria-label={week ? "Tuần trước" : "Tháng trước"} href={week ? `${base}&xem=tuan&ngay=${addDays(weekStart, -7)}` : `${base}&thang=${shiftMonth(month, -1)}`} className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-white"><ChevronLeft className="h-5 w-5" aria-hidden /></Link>
          <div className="text-center">
            <div className="text-[17px] font-bold">{week ? `Tuần ${weekStart.slice(8, 10)}/${weekStart.slice(5, 7)} – ${addDays(weekStart, 6).slice(8, 10)}/${addDays(weekStart, 6).slice(5, 7)}` : `Tháng ${Number(month.slice(5, 7))}/${month.slice(0, 4)}`}</div>
            {(week ? anchor !== today && (today < weekStart || today > addDays(weekStart, 6)) : month !== monthOf(today)) && (
              <Link href={week ? `${base}&xem=tuan&ngay=${today}` : `${base}&thang=${monthOf(today)}`} className="text-[13px] font-semibold text-primary">Về hôm nay</Link>
            )}
          </div>
          <Link aria-label={week ? "Tuần sau" : "Tháng sau"} href={week ? `${base}&xem=tuan&ngay=${addDays(weekStart, 7)}` : `${base}&thang=${shiftMonth(month, 1)}`} className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-white"><ChevronRight className="h-5 w-5" aria-hidden /></Link>
        </div>

        {s && (
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="card p-2"><dt className="text-[12px] text-ink-600">Đã học</dt><dd className="text-[20px] font-extrabold text-green-700">{s.summary.attended}</dd></div>
            <div className="card p-2"><dt className="text-[12px] text-ink-600">Vắng</dt><dd className="text-[20px] font-extrabold text-red-700">{s.summary.absent}</dd></div>
            <div className="card p-2"><dt className="text-[12px] text-ink-600">Sắp học</dt><dd className="text-[20px] font-extrabold text-primary">{s.summary.upcoming}</dd></div>
          </dl>
        )}

        {!week && <MonthGrid grid={monthGrid(month, entries, hols, today).weeks} />}

        <Legend />
        </div>

        {/* Danh sách buổi */}
        <section aria-label="Các buổi học" className="space-y-3">
          {week
            ? weekGrid(anchor, entries, hols, today).map((day) => <DayBlock key={day.date} day={day} today={today} kidId={kid.id} name={name} showEmpty />)
            : monthGrid(month, entries, hols, today).weeks.flat().filter((day) => day.inMonth && (day.entries.length > 0 || day.holiday)).map((day) => <DayBlock key={day.date} day={day} today={today} kidId={kid.id} name={name} />)}
          {!week && entries.filter((e) => e.date.startsWith(month)).length === 0 && <div className="card p-4 text-ink-600">Tháng này {name} chưa có buổi học nào.</div>}
        </section>
        </div>
      </PhMain>
    </>
  );
}

function MonthGrid({ grid }: { grid: CalendarDay<ScheduleEntry>[][] }) {
  return (
    <div className="card p-2" role="grid" aria-label="Lịch tháng">
      <div className="grid grid-cols-7 text-center text-[12px] font-semibold text-ink-600" role="row">
        {WD_SHORT.map((w) => <div key={w} role="columnheader" className="py-1">{w}</div>)}
      </div>
      {grid.map((week, i) => (
        <div key={i} className="grid grid-cols-7" role="row">
          {week.map((day) => {
            const has = day.entries.length > 0;
            const cell = (
              <>
                <span className={`grid h-7 w-7 place-items-center rounded-full text-[14px] ${day.isToday ? "bg-primary font-bold text-white" : day.inMonth ? "" : "text-black/30"} ${day.holiday && !day.isToday ? "text-accent-700 font-bold" : ""}`}>{Number(day.date.slice(8, 10))}</span>
                <span className="flex h-2 gap-0.5" aria-hidden>
                  {day.entries.slice(0, 3).map((e) => <span key={e.sessionId} className={`h-1.5 w-1.5 rounded-full ${TONE_STYLE[e.tone].dot}`} />)}
                </span>
              </>
            );
            const label = `${day.date.slice(8, 10)}/${day.date.slice(5, 7)}${day.holiday ? `, nghỉ: ${day.holiday}` : ""}${has ? `, ${day.entries.map((e) => `${e.start} ${e.toneLabel}`).join("; ")}` : ""}`;
            return has || day.holiday ? (
              <a key={day.date} role="gridcell" href={`#ngay-${day.date}`} aria-label={label} className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl hover:bg-primary-soft">{cell}</a>
            ) : (
              <div key={day.date} role="gridcell" aria-label={label} className="flex min-h-12 flex-col items-center justify-center gap-0.5">{cell}</div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Legend() {
  const items: [keyof typeof TONE_STYLE, string][] = [["done", "Có mặt"], ["absent", "Vắng"], ["excused", "Có phép"], ["makeup", "Học bù"], ["upcoming", "Sắp học"], ["requested", "Đã xin nghỉ"]];
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-[13px] text-ink-600" aria-label="Chú thích màu">
      {items.map(([t, l]) => <li key={t} className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${TONE_STYLE[t].dot}`} aria-hidden />{l}</li>)}
    </ul>
  );
}

function DayBlock({ day, today, kidId, name, showEmpty = false }: { day: CalendarDay<ScheduleEntry>; today: string; kidId: string; name: string; showEmpty?: boolean }) {
  if (!showEmpty && !day.entries.length && !day.holiday) return null;
  return (
    <div id={`ngay-${day.date}`} className="scroll-mt-20">
      <h3 className={`mb-1 px-1 text-[14px] font-bold ${day.isToday ? "text-primary" : "text-ink-600"}`}>{dayPh(day.date, today)}</h3>
      {day.holiday && <div className="mb-2 rounded-2xl bg-accent-50 px-3 py-2 text-[14px] font-semibold text-accent-700">Nghỉ: {day.holiday}</div>}
      {day.entries.length === 0 && showEmpty && !day.holiday && <div className="rounded-2xl border border-dashed border-black/10 px-3 py-2 text-[14px] text-ink-600">Không có buổi học</div>}
      <ul className="space-y-2">
        {day.entries.map((e) => (
          <li key={e.sessionId} className={`card p-4 ${e.tone === "cancelled" ? "opacity-70" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[17px] font-bold">{e.start}–{e.end}</div>
                <div className="truncate font-semibold">{e.className}</div>
                <div className="text-[14px] text-ink-600">{e.label}{e.kind === "makeup" ? "" : ` · ${e.classCode}`}</div>
              </div>
              <ToneChip tone={e.tone} label={e.toneLabel} />
            </div>
            <div className="mt-2 space-y-1 text-[14px] text-ink-600">
              <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{e.room ? `${e.room} · ` : ""}{e.center}</div>
              {e.teacher && <div className="flex items-start gap-2"><UserRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />GV {e.teacher}</div>}
            </div>
            {(e.canAbsent || e.canMakeup || e.requestCode) && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {e.canAbsent && <AbsenceButton variant="solid" studentId={kidId} sessionId={e.sessionId} childName={name} when={`${dayPh(e.date, today)} · ${e.start}–${e.end}`} />}
                {e.canMakeup && <MakeupButton studentId={kidId} sessionId={e.sessionId} when={`${dayPh(e.date, today)} · ${e.start}`} />}
                {e.requestCode && <Link href="/ph/yeu-cau" className="inline-flex min-h-11 items-center text-[14px] font-semibold text-primary">Yêu cầu {e.requestCode} →</Link>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
