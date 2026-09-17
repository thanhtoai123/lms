import { STAFF_STATUS_VI, REQUEST_STATUS_VI, DAY_STATUS_VI, TIMESHEET_FLAG_VI, CELL_ORIGIN_MARK, CELL_ORIGIN_VI, SHIFT_KIND_VI, type StaffStatus, type RequestStatus, type DayStatus, type TimesheetFlag, type CellOrigin, type ShiftKind } from "@satarobo/core";

const STAFF_CHIP: Record<StaffStatus, string> = { probation: "bg-amber-100 text-amber-800", active: "bg-green-100 text-green-800", on_leave: "bg-sky-100 text-sky-800", resigned: "bg-slate-100 text-slate-600" };
export function StaffChip({ status }: { status: StaffStatus }) {
  return <span className={`chip ${STAFF_CHIP[status]}`}>{STAFF_STATUS_VI[status]}</span>;
}

const REQ_CHIP: Record<RequestStatus, string> = { pending: "bg-amber-100 text-amber-800", approved: "bg-green-100 text-green-800", rejected: "bg-red-100 text-red-700", cancelled: "bg-slate-100 text-slate-600" };
export function RequestChip({ status }: { status: RequestStatus }) {
  return <span className={`chip ${REQ_CHIP[status]}`}>{REQUEST_STATUS_VI[status]}</span>;
}

export const DAY_CELL: Record<DayStatus, string> = {
  present: "bg-green-100 text-green-800", late: "bg-amber-100 text-amber-800", early: "bg-amber-100 text-amber-800", late_early: "bg-orange-100 text-orange-800",
  absent: "bg-red-100 text-red-700", excused: "bg-slate-200 text-slate-700", leave: "bg-sky-100 text-sky-800", half_leave: "bg-sky-50 text-sky-800",
  missing_in: "bg-rose-100 text-rose-700", missing_out: "bg-rose-100 text-rose-700",
  off: "text-ink-400", holiday: "bg-violet-100 text-violet-800", upcoming: "text-ink-400", working: "bg-emerald-50 text-emerald-700", override: "bg-indigo-100 text-indigo-800",
};
export function DayChip({ status }: { status: DayStatus }) {
  return <span className={`chip ${DAY_CELL[status]}`}>{DAY_STATUS_VI[status]}</span>;
}

/** Cờ chấm công — chỉ để quản lý rà, không tự trừ công */
export function FlagChip({ flag, open }: { flag: string; open?: boolean }) {
  return <span className={`chip ${open ? "bg-amber-100 text-amber-800" : "bg-black/5 text-ink-600"}`}>{TIMESHEET_FLAG_VI[flag as TimesheetFlag] ?? flag}</span>;
}
export const flagLabel = (f: string) => TIMESHEET_FLAG_VI[f as TimesheetFlag] ?? f;

/** Ký hiệu nguồn ô lưới phân ca: T sửa tay · Đ/N từ đơn hoặc import */
export const originMark = (o: string | null) => (o ? CELL_ORIGIN_MARK[o as CellOrigin] ?? "" : "");
export const originLabel = (o: string | null) => (o ? CELL_ORIGIN_VI[o as CellOrigin] ?? o : "—");
export const shiftKindLabel = (k: string) => SHIFT_KIND_VI[k as ShiftKind] ?? k;

export const hm = (m: number | null | undefined) => (m == null ? "—" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
export const dmy = (d: string | null | undefined) => (d ? d.split("-").reverse().join("/") : "—");
export const units = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
export const WD = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];
export const wdOf = (d: string) => { const x = new Date(`${d}T00:00:00Z`).getUTCDay(); return WD[x === 0 ? 7 : x]!; };
