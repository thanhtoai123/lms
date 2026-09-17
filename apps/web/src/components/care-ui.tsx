import { PARENT_REQUEST_STATUS_VI, FEEDBACK_STATUS_VI, SURVEY_STATUS_VI, type ParentRequestStatus, type FeedbackStatus, type SurveyStatus } from "@satarobo/core";

const REQ: Record<ParentRequestStatus, string> = { new: "bg-amber-100 text-amber-800", in_progress: "bg-sky-100 text-sky-800", approved: "bg-indigo-100 text-indigo-800", rejected: "bg-red-100 text-red-700", done: "bg-green-100 text-green-800", cancelled: "bg-slate-100 text-slate-600" };
export function PReqChip({ status }: { status: ParentRequestStatus }) {
  return <span className={`chip ${REQ[status]}`}>{PARENT_REQUEST_STATUS_VI[status]}</span>;
}
const FB: Record<FeedbackStatus, string> = { new: "bg-amber-100 text-amber-800", acknowledged: "bg-sky-100 text-sky-800", resolved: "bg-green-100 text-green-800" };
export function FeedbackChip({ status }: { status: FeedbackStatus }) {
  return <span className={`chip ${FB[status]}`}>{FEEDBACK_STATUS_VI[status]}</span>;
}
const SV: Record<SurveyStatus, string> = { draft: "bg-slate-100 text-slate-700", active: "bg-green-100 text-green-800", closed: "bg-slate-800 text-white" };
export function SurveyChip({ status }: { status: SurveyStatus }) {
  return <span className={`chip ${SV[status]}`}>{SURVEY_STATUS_VI[status]}</span>;
}
export function Stars({ n, max = 5 }: { n: number | null | undefined; max?: number }) {
  if (n == null) return <span className="text-ink-400">—</span>;
  return <span className="whitespace-nowrap text-amber-500" title={`${n}/${max}`}>{"★".repeat(n)}<span className="text-black/15">{"★".repeat(Math.max(0, max - n))}</span></span>;
}
export function SlaBadge({ sla }: { sla: { overdue: boolean; minutesLeft: number | null } }) {
  if (sla.minutesLeft == null) return null;
  const m = Math.abs(sla.minutesLeft);
  const t = m >= 1440 ? `${Math.round(m / 1440)} ngày` : m >= 60 ? `${Math.round(m / 60)} giờ` : `${m} phút`;
  return sla.overdue ? <span className="chip bg-red-100 text-red-700">Quá hạn {t}</span> : <span className={`chip ${sla.minutesLeft < 120 ? "bg-amber-100 text-amber-800" : "bg-black/5"}`}>Còn {t}</span>;
}
export const dtVN = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
