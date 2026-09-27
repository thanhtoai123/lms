import Link from "next/link";
import { BookOpen, Clock, MonitorPlay, UsersRound } from "lucide-react";
import { weekdayOf, type SessionStatus } from "@satarobo/core";
import { StatusChip, fmtTime, fmtDate, WEEKDAY_VI } from "@/components/ui";

export type CardRow = {
  id: string; date: string; startTime: string; endTime: string; status: SessionStatus;
  className: string; label: string; topic: string | null; roomCode: string | null;
  enrolled: number; attended: number; lessonId: string | null; plan: "scorm" | "pdf" | null;
  isOverdue?: boolean; nextStep?: string | null;
};

const BUOC: Record<string, string> = { submit_attendance: "Điểm danh →", submit_notes: "Nhận xét →" };

/**
 * THẺ BUỔI DẠY — dùng chung cho Hôm nay và Lịch dạy.
 * Thân thẻ mở màn buổi dạy; hàng nút dưới: **Giáo án** (mở thẳng khung chiếu, khi bài đã có giáo án)
 * và **Chuẩn bị** (bài, tiêu chí, học viên cần lưu ý). Nút cao ≥ 44px để bấm bằng ngón tay.
 */
export function SessionCard({ s, highlight, compact, showDate = true }: { s: CardRow; highlight?: boolean; compact?: boolean; showDate?: boolean }) {
  const huy = s.status === "cancelled" || s.status === "rescheduled";
  const plan = s.lessonId && s.plan ? `/teacher/giao-an/${s.lessonId}?buoi=${s.id}` : null;
  return (
    <div className={`card overflow-hidden ${highlight ? "border-brand-500/40 ring-2 ring-brand-100" : ""} ${huy ? "opacity-60" : ""}`}>
      <Link href={`/teacher/sessions/${s.id}`} className={`block ${compact ? "p-3" : "p-4"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[13px] text-ink-600"><Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />{showDate ? `${WEEKDAY_VI[weekdayOf(s.date)]} ${fmtDate(s.date)} · ` : ""}{fmtTime(s.startTime)}–{fmtTime(s.endTime)} · {s.roomCode ?? "—"}</div>
            <div className="truncate font-semibold">{s.className}</div>
            <div className="line-clamp-2 text-[14px] text-ink-600">{s.label}{s.topic ? ` · ${s.topic}` : ""}</div>
          </div>
          <StatusChip status={s.status} />
        </div>
        {!compact && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-600">
            <span className="inline-flex items-center gap-1"><UsersRound className="h-4 w-4" aria-hidden />Sĩ số {s.enrolled} · {s.attended}/{s.enrolled} đã điểm danh</span>
            {s.isOverdue && <span className="chip bg-red-100 text-red-700">Quá hạn</span>}
            {s.nextStep && !s.isOverdue && <span className="font-semibold text-brand-600">{BUOC[s.nextStep] ?? "Hoàn tất →"}</span>}
          </div>
        )}
      </Link>
      {!huy && (
        <div className="grid grid-cols-2 border-t border-black/5 text-[14px] font-semibold">
          {plan ? (
            <Link href={plan} className="flex min-h-11 items-center justify-center gap-2 text-primary hover:bg-brand-50"><MonitorPlay className="h-4 w-4" aria-hidden />Giáo án{s.plan === "scorm" ? " SCORM" : ""}</Link>
          ) : (
            <span className="flex min-h-11 items-center justify-center gap-2 text-[13px] font-normal text-ink-600" title="Bài của buổi này chưa có giáo án — báo bộ phận đào tạo">Chưa có giáo án</span>
          )}
          <Link href={`/teacher/sessions/${s.id}/chuan-bi`} className="flex min-h-11 items-center justify-center gap-2 border-l border-black/5 text-primary hover:bg-brand-50"><BookOpen className="h-4 w-4" aria-hidden />Chuẩn bị</Link>
        </div>
      )}
    </div>
  );
}
