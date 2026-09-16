/**
 * Lớp Trial: xếp lead (hoặc con trong lead) vào một buổi học có sẵn để học thử.
 * Luật: còn chỗ, chưa quá số lần thử cho mỗi lead, buổi chưa diễn ra; đổi lịch/huỷ phải có lý do;
 * chỉ ghi kết quả khi buổi đã tới ngày; kết quả đẩy trạng thái lead.
 */
export const TRIAL_STATUSES = ["booked", "attended", "no_show", "cancelled", "rescheduled"] as const;
export type TrialStatus = (typeof TRIAL_STATUSES)[number];

export const TRIAL_STATUS_VI: Record<TrialStatus, string> = {
  booked: "Đã xếp",
  attended: "Đã học thử",
  no_show: "Không đến",
  cancelled: "Đã huỷ",
  rescheduled: "Đã đổi lịch",
};

export type TrialEvent = "attend" | "no_show" | "cancel" | "reschedule" | "undo";

const T: Record<TrialStatus, Partial<Record<TrialEvent, TrialStatus>>> = {
  booked: { attend: "attended", no_show: "no_show", cancel: "cancelled", reschedule: "rescheduled" },
  attended: { undo: "booked" },
  no_show: { undo: "booked" },
  cancelled: {},
  rescheduled: {},
};

export class TrialTransitionError extends Error {
  constructor(public readonly from: TrialStatus, public readonly event: TrialEvent) {
    super(`Không thể thực hiện "${event}" với buổi thử đang ở trạng thái "${TRIAL_STATUS_VI[from]}"`);
    this.name = "TrialTransitionError";
  }
}

export function trialTransition(from: TrialStatus, event: TrialEvent): TrialStatus {
  const to = T[from]?.[event];
  if (!to) throw new TrialTransitionError(from, event);
  return to;
}

/** Trạng thái chiếm chỗ trong buổi */
export const TRIAL_SEAT_STATUSES: readonly TrialStatus[] = ["booked", "attended", "no_show"];
/** Trạng thái tính là "một lần thử" của lead (đổi lịch/huỷ không tính) */
export const TRIAL_COUNTED_STATUSES: readonly TrialStatus[] = ["booked", "attended", "no_show"];

export interface TrialBookingCheck {
  capacity: number;
  enrolled: number;
  trialsInSession: number;
  trialsUsedByLead: number;
  maxTrialsPerLead: number;
  sessionStatus: string;
  sessionDate: string; // YYYY-MM-DD
  sessionStart: string; // HH:MM[:SS]
  /** thời điểm hiện tại theo giờ vận hành, "YYYY-MM-DDTHH:MM" */
  nowLocal: string;
  leadStatus: string;
  alreadyBookedInSession: boolean;
}

export function seatsLeft(c: { capacity: number; enrolled: number; trialsInSession: number }): number {
  return Math.max(0, c.capacity - c.enrolled - c.trialsInSession);
}

/** Trả về danh sách lỗi (rỗng = hợp lệ) */
export function validateTrialBooking(c: TrialBookingCheck): string[] {
  const errs: string[] = [];
  if (c.leadStatus === "enrolled" || c.leadStatus === "lost") errs.push("Lead đã đăng ký hoặc đã mất — không xếp học thử");
  if (c.sessionStatus !== "scheduled") errs.push("Buổi học không còn nhận học thử");
  const start = `${c.sessionDate}T${c.sessionStart.slice(0, 5)}`;
  if (start <= c.nowLocal) errs.push("Buổi học đã bắt đầu hoặc đã qua");
  if (c.alreadyBookedInSession) errs.push("Lead đã được xếp vào buổi này");
  if (seatsLeft(c) <= 0) errs.push("Buổi học đã đủ chỗ");
  if (c.trialsUsedByLead >= c.maxTrialsPerLead) errs.push(`Lead đã dùng hết ${c.maxTrialsPerLead} lần học thử`);
  return errs;
}

/** Ghi kết quả chỉ khi buổi đã tới ngày */
export function canRecordTrialResult(sessionDate: string, todayISO: string): boolean {
  return sessionDate <= todayISO;
}

/** Sự kiện lead tương ứng kết quả buổi thử (null = không đổi trạng thái lead) */
export function leadEventForTrial(result: "attend" | "no_show", leadStatus: string): "trial_attended" | "trial_no_show" | null {
  if (leadStatus !== "trial_scheduled" && leadStatus !== "trial_in_progress") return null;
  return result === "attend" ? "trial_attended" : "trial_no_show";
}

export function requireReason(reason: string | null | undefined, min = 5): string {
  const r = (reason ?? "").trim();
  if (r.length < min) throw new Error(`Cần nhập lý do (tối thiểu ${min} ký tự)`);
  return r;
}
