"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, ClipboardCheck, MonitorPlay, Radio, TimerReset } from "lucide-react";
import { buoiNoiBat, gioVietNam, thoiLuongVi, weekdayOf } from "@satarobo/core";
import { WEEKDAY_VI, fmtDate } from "@/components/ui";

export type NowRow = {
  id: string; date: string; startTime: string; endTime: string; status: string;
  className: string; label: string; topic: string | null; roomCode: string | null;
  enrolled: number; attended: number; lessonId: string | null; plan: "scorm" | "pdf" | null;
};

export const planHref = (r: { id: string; lessonId: string | null }) => (r.lessonId ? `/teacher/giao-an/${r.lessonId}?buoi=${r.id}` : null);

/**
 * THẺ "ĐANG DẠY / BUỔI TIẾP THEO" đầu trang Hôm nay — việc cần làm ngay, 3 nút lớn:
 * Mở giáo án · Điểm danh & nhận xét · Chuẩn bị. Tự cập nhật mỗi 30 giây (đếm ngược, chuyển trạng thái).
 * Lần vẽ đầu dùng giờ máy chủ truyền xuống để không lệch khi hydrate.
 */
export function NowCard({ rows, initial }: { rows: NowRow[]; initial: { today: string; nowMin: number } }) {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    const tick = () => setNow(gioVietNam());
    tick();
    const t = window.setInterval(tick, 30_000);
    return () => window.clearInterval(t);
  }, []);
  const hit = buoiNoiBat(rows, now.today, now.nowMin);
  if (!hit) {
    return (
      <section className="card flex items-center gap-3 p-4 text-ink-600" aria-label="Buổi dạy tiếp theo">
        <TimerReset className="h-5 w-5 shrink-0" aria-hidden />
        <span>Không có buổi dạy nào trong 7 ngày tới. Xem <Link href="/teacher/lich" className="font-semibold text-brand-600">Lịch dạy</Link> để xem các tuần sau.</span>
      </section>
    );
  }
  const s = hit.session;
  const dang = hit.kind === "dang-day";
  const chot = hit.kind === "can-chot";
  const plan = planHref(s);
  const tieuDe = hit.kind === "dang-day"
    ? hit.minutesLeft >= 0 ? `Đang dạy · còn ${thoiLuongVi(hit.minutesLeft)}` : `Đang dạy · quá giờ ${thoiLuongVi(-hit.minutesLeft)}`
    : hit.kind === "can-chot"
      ? `Buổi hôm nay chưa chốt · kết thúc ${thoiLuongVi(hit.minutesAgo)} trước`
      : hit.minutesUntil !== null
      ? hit.minutesUntil <= 60 ? `Sắp dạy · bắt đầu sau ${thoiLuongVi(hit.minutesUntil)}` : `Buổi tiếp theo · hôm nay ${s.startTime.slice(0, 5)}`
      : `Buổi tiếp theo · ${WEEKDAY_VI[weekdayOf(s.date)]} ${fmtDate(s.date)}`;

  return (
    <section aria-label={dang ? "Buổi đang dạy" : chot ? "Buổi cần chốt" : "Buổi dạy tiếp theo"}
      className={`overflow-hidden rounded-2xl border ${dang ? "border-brand-500/40 bg-brand-50" : chot ? "border-amber-300 bg-amber-50" : "border-black/10 bg-card"} shadow-sm`}>
      <div className="p-4 md:p-5">
        <div className={`flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide ${dang ? "text-brand-700" : chot ? "text-amber-900" : "text-ink-600"}`}>
          {dang && <Radio className="h-4 w-4 animate-pulse" aria-hidden />}{tieuDe}
        </div>
        <h2 className="mt-1 text-[19px] font-extrabold leading-tight md:text-[22px]">{s.className}</h2>
        <p className="text-ink-600">{s.label}{s.topic ? ` · ${s.topic}` : ""}</p>
        <p className="mt-1 text-[14px] text-ink-600">
          {s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)} · Phòng {s.roomCode ?? "—"} · Sĩ số {s.enrolled} · {s.attended}/{s.enrolled} đã điểm danh
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 border-t border-black/5 bg-white/60 p-3 sm:grid-cols-3">
        {plan && s.plan ? (
          <Link href={plan} className="btn-primary min-h-12 text-[15px]"><MonitorPlay className="h-5 w-5" aria-hidden />Mở giáo án {s.plan === "scorm" ? "SCORM" : "(slide)"}</Link>
        ) : (
          <span className="flex min-h-12 items-center justify-center rounded-xl border-2 border-dashed border-black/10 px-3 text-center text-[14px] text-ink-600">Buổi này chưa có giáo án</span>
        )}
        <Link href={`/teacher/sessions/${s.id}`} className={`${dang || chot ? "btn-primary" : "btn-ghost"} min-h-12 text-[15px]`}><ClipboardCheck className="h-5 w-5" aria-hidden />{dang || chot ? "Điểm danh & nhận xét" : "Mở buổi dạy"}</Link>
        <Link href={`/teacher/sessions/${s.id}/chuan-bi`} className="btn-ghost min-h-12 text-[15px]"><BookOpen className="h-5 w-5" aria-hidden />Chuẩn bị buổi dạy</Link>
      </div>
    </section>
  );
}
