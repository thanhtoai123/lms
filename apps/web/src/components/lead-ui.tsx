import type { LeadStatus } from "@satarobo/core";
import { LEAD_STATUS_VI } from "@satarobo/core";

export const LEAD_CHIP: Record<LeadStatus, string> = {
  new: "bg-blue-100 text-blue-800",
  contacted: "bg-sky-100 text-sky-800",
  nurturing: "bg-slate-100 text-slate-700",
  trial_scheduled: "bg-violet-100 text-violet-800",
  trial_in_progress: "bg-fuchsia-100 text-fuchsia-800",
  trial_done: "bg-indigo-100 text-indigo-800",
  consulting: "bg-amber-100 text-amber-800",
  deciding: "bg-orange-100 text-orange-800",
  enrolled: "bg-green-100 text-green-800",
  lost: "bg-red-100 text-red-700",
};

export function LeadChip({ status }: { status: LeadStatus }) {
  return <span className={`chip ${LEAD_CHIP[status]}`}>{LEAD_STATUS_VI[status]}</span>;
}

export function SlaChip({ sla }: { sla: { level: "ok" | "warning" | "overdue"; overdueMinutes: number; dueAt: string | null } }) {
  if (sla.level === "overdue") return <span className="chip bg-red-100 text-red-700">Quá hạn {fmtMinutes(sla.overdueMinutes)}</span>;
  if (sla.level === "warning") return <span className="chip bg-amber-100 text-amber-800">Sắp đến hạn</span>;
  return <span className="chip bg-green-50 text-green-700">Đúng hạn</span>;
}

export function fmtMinutes(m: number) {
  if (m < 60) return `${m} phút`;
  if (m < 60 * 24) return `${Math.round(m / 60)} giờ`;
  return `${Math.round(m / 60 / 24)} ngày`;
}

export function fmtDateTime(d: Date | string) {
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

/** Loại hoạt động trên timeline lead */
export const ACTIVITY_VI: Record<string, { label: string; chip: string }> = {
  call: { label: "Gọi điện", chip: "bg-sky-100 text-sky-800" },
  message: { label: "Nhắn tin", chip: "bg-violet-100 text-violet-800" },
  email: { label: "Email", chip: "bg-indigo-100 text-indigo-800" },
  note: { label: "Ghi chú", chip: "bg-slate-100 text-slate-700" },
  status_change: { label: "Đổi trạng thái", chip: "bg-amber-100 text-amber-800" },
  assignment: { label: "Phân bổ", chip: "bg-teal-100 text-teal-800" },
  handover: { label: "Bàn giao", chip: "bg-orange-100 text-orange-800" },
  trial_booked: { label: "Học thử", chip: "bg-fuchsia-100 text-fuchsia-800" },
  task_done: { label: "Xong việc", chip: "bg-green-100 text-green-800" },
  system: { label: "Hệ thống", chip: "bg-black/5 text-ink-600" },
};

export function fmtDay(d: Date | string | null | undefined) {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" });
}

export const EVENT_VI: Record<string, string> = {
  contact: "Đã liên hệ",
  nurture: "Nuôi dưỡng",
  schedule_trial: "Hẹn học thử",
  start_trial: "Bắt đầu học thử",
  trial_attended: "Đã học thử",
  trial_no_show: "Không đến",
  consult: "Tư vấn",
  await_decision: "Chờ quyết định",
  enroll: "Ghi danh",
  lose: "Mất",
  reopen: "Mở lại",
};
