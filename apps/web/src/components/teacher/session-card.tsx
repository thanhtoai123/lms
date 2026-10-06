import Link from "next/link";
import { BookOpen, Clock, Lock, MonitorPlay, UsersRound } from "lucide-react";
import { gioPhut, phutTrongNgay, weekdayOf, PLAN_WINDOW_BEFORE_MIN, type SessionStatus } from "@satarobo/core";
import { StatusChip, fmtTime, fmtDate, WEEKDAY_VI } from "@/components/ui";

export type CardRow = {
  id: string; date: string; startTime: string; endTime: string; status: SessionStatus;
  className: string; label: string; topic: string | null; roomCode: string | null;
  enrolled: number; attended: number; lessonId: string | null; plan: "scorm" | "pdf" | null;
  isOverdue?: boolean; nextStep?: string | null;
  planAccess?: { state: "all" | "open" | "granted" | "pending" | "locked"; until: string | null; opensAt: string | null } | null;
};

/** Nhãn nút giáo án theo quyền xem: mở được ngay, hay khoá (mở lúc … / chờ duyệt) */
export function planButton(s: CardRow): { href: string; label: string; locked: boolean } | null {
  if (!s.lessonId || !s.plan) return null;
  const href = `/teacher/giao-an/${s.lessonId}?buoi=${s.id}`;
  const st = s.planAccess?.state ?? "all";
  const loai = s.plan === "scorm" ? " SCORM" : "";
  if (st === "all" || st === "open" || st === "granted") return { href, label: `Giáo án${loai}`, locked: false };
  if (st === "pending") return { href, label: "Chờ duyệt xem", locked: true };
  return { href, label: `Giáo án mở ${gioPhut(phutTrongNgay(s.startTime) - PLAN_WINDOW_BEFORE_MIN)}`, locked: true };
}

const BUOC: Record<string, string> = { submit_attendance: "Điểm danh →", submit_notes: "Nhận xét →" };

/**
 * THẺ BUỔI DẠY — dùng chung cho Hôm nay và Lịch dạy.
 * Thân thẻ mở màn buổi dạy; hàng nút dưới: **Giáo án** (mở thẳng khung chiếu, khi bài đã có giáo án)
 * và **Chuẩn bị** (bài, tiêu chí, học viên cần lưu ý). Nút cao ≥ 44px để bấm bằng ngón tay.
 */
export function SessionCard({ s, highlight, compact, showDate = true }: { s: CardRow; highlight?: boolean; compact?: boolean; showDate?: boolean }) {
  const huy = s.status === "cancelled" || s.status === "rescheduled";
  const pb = planButton(s);
  return (
    <div className={`card overflow-hidden ${highlight ? "border-brand-500/40 ring-2 ring-brand-100" : ""} ${huy ? "opacity-60" : ""}`}>
      <Link href={`/teacher/sessions/${s.id}`} className={`block ${compact ? "p-3" : "p-4"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[13px] text-ink-600"><Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />{showDate ? `${WEEKDAY_VI[weekdayOf(s.date)]} ${fmtDate(s.date)} · ` : ""}{fmtTime(s.startTime)}–{fmtTime(s.endTime)} · {s.roomCode ?? "—"}</div>
            <div className="truncate font-semibold">{s.className}</div>
            <div className="line-clamp-2 text-[14px] text-ink-600">{s.label}{s.topic ? ` · ${s.topic}` : ""}</div>
          </div>
          {/* Đã ghi điểm danh cho một số em (vd. quét QR) nhưng chưa bấm chốt bước → "Đang điểm danh", không phải "Chưa điểm danh" */}
          {(s.status === "scheduled" || s.status === "in_progress") && s.attended > 0
            ? <span className="chip bg-amber-100 text-amber-800">Đang điểm danh</span>
            : <StatusChip status={s.status} />}
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
          {pb ? (
            <Link href={pb.href} className={`flex min-h-11 items-center justify-center gap-2 hover:bg-brand-50 ${pb.locked ? "text-ink-600" : "text-primary"}`} title={pb.locked ? "Giáo án chỉ mở trong ca dạy — hoặc xin quản lý duyệt" : undefined}>
              {pb.locked ? <Lock className="h-4 w-4" aria-hidden /> : <MonitorPlay className="h-4 w-4" aria-hidden />}{pb.label}
            </Link>
          ) : (
            <span className="flex min-h-11 items-center justify-center gap-2 text-[13px] font-normal text-ink-600" title="Bài của buổi này chưa có giáo án — báo bộ phận đào tạo">Chưa có giáo án</span>
          )}
          <Link href={`/teacher/sessions/${s.id}/chuan-bi`} className="flex min-h-11 items-center justify-center gap-2 border-l border-black/5 text-primary hover:bg-brand-50"><BookOpen className="h-4 w-4" aria-hidden />Chuẩn bị</Link>
        </div>
      )}
    </div>
  );
}
