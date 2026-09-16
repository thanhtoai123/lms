import type { SessionStatus, AttendanceStatus } from "@satarobo/core";

export const SESSION_LABEL: Record<SessionStatus, string> = {
  scheduled: "Chưa điểm danh",
  in_progress: "Đang học",
  attendance_done: "Đã điểm danh",
  notes_done: "Đã nhận xét",
  completed: "Hoàn tất",
  cancelled: "Đã huỷ",
  rescheduled: "Đã dời",
};

export const SESSION_CHIP: Record<SessionStatus, string> = {
  scheduled: "bg-black/5 text-ink-600",
  in_progress: "bg-blue-100 text-blue-700",
  attendance_done: "bg-amber-100 text-amber-800",
  notes_done: "bg-violet-100 text-violet-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-700",
  rescheduled: "bg-black/5 text-ink-400",
};

export const ATT_LABEL: Record<AttendanceStatus, string> = {
  present: "Có mặt",
  late: "Muộn",
  absent_excused: "Vắng P",
  absent_unexcused: "Vắng KP",
  makeup: "Học bù",
};

export const ATT_STYLE: Record<AttendanceStatus, string> = {
  present: "bg-green-500 text-white",
  late: "bg-amber-500 text-white",
  absent_excused: "bg-slate-500 text-white",
  absent_unexcused: "bg-red-500 text-white",
  makeup: "bg-violet-500 text-white",
};

export function StatusChip({ status }: { status: SessionStatus }) {
  return <span className={`chip ${SESSION_CHIP[status]}`}>{SESSION_LABEL[status]}</span>;
}

export function fmtTime(t: string) {
  return t.slice(0, 5);
}

export function fmtDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export const WEEKDAY_VI = ["", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "CN"];

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card p-6 text-center text-sm text-ink-400">{children}</div>;
}
