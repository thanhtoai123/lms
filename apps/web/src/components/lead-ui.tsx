import Link from "next/link";
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


export const LEAD_SUBNAV = [
  { href: "/ops/leads", label: "Hộp thư lead" },
  { href: "/ops/leads/board", label: "Kanban" },
  { href: "/ops/leads/bulk-convert", label: "Chốt hàng loạt" },
  { href: "/ops/leads/distribution", label: "Chia lead" },
  { href: "/ops/leads/handover", label: "Bàn giao" },
  { href: "/ops/leads/stale", label: "Lâu chưa chăm" },
  { href: "/ops/leads/transfers", label: "Sổ chuyển lead" },
  { href: "/ops/leads/settings", label: "SLA & tham số" },
];

export function LeadSubnav({ active }: { active: string }) {
  return (
    <nav className="flex gap-1 overflow-x-auto text-sm border-b border-black/5 pb-1">
      {LEAD_SUBNAV.map((n) => (
        <Link key={n.href} href={n.href} className={`px-3 py-1.5 rounded-lg whitespace-nowrap ${active === n.href ? "bg-brand-500 text-white" : "hover:bg-brand-50 text-ink-600"}`}>{n.label}</Link>
      ))}
    </nav>
  );
}
