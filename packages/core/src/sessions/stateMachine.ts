import type { SessionStatus } from "../types.js";

/**
 * Vòng đời buổi học. Thay vì "buổi học chưa hoàn tất" là một quy tắc trong UI,
 * nó là một trạng thái trong DB: mọi hàng đợi/việc cần xử lý đều là truy vấn trạng thái.
 *
 *  scheduled ─start─▶ in_progress ─attendance─▶ attendance_done ─notes─▶ notes_done ─complete─▶ completed
 *      │                                                                            ▲
 *      ├─cancel─▶ cancelled                                                         │
 *      └─reschedule─▶ rescheduled                          (media là tuỳ chọn, không chặn complete)
 */
export type SessionEvent =
  | "start"
  | "submit_attendance"
  | "submit_notes"
  | "complete"
  | "cancel"
  | "reschedule"
  | "reopen";

const TRANSITIONS: Record<SessionStatus, Partial<Record<SessionEvent, SessionStatus>>> = {
  scheduled: { start: "in_progress", submit_attendance: "attendance_done", cancel: "cancelled", reschedule: "rescheduled" },
  in_progress: { submit_attendance: "attendance_done", cancel: "cancelled" },
  attendance_done: { submit_notes: "notes_done", submit_attendance: "attendance_done", reopen: "in_progress" },
  notes_done: { complete: "completed", submit_notes: "notes_done", submit_attendance: "attendance_done", reopen: "in_progress" },
  completed: { reopen: "notes_done" },
  cancelled: { reopen: "scheduled" },
  rescheduled: {},
};

export interface SessionGuardContext {
  /** Số học viên đang active trong lớp tại buổi này */
  enrolledCount: number;
  /** Số bản ghi điểm danh đã có */
  attendanceCount: number;
  /** Đã có nhận xét chung của buổi chưa */
  hasSessionNote: boolean;
  /** Ngày hiện tại và ngày buổi học, ISO */
  today: string;
  sessionDate: string;
}

export class SessionTransitionError extends Error {
  constructor(
    public readonly from: SessionStatus,
    public readonly event: SessionEvent,
    reason: string,
  ) {
    super(`Không thể ${event} từ trạng thái ${from}: ${reason}`);
    this.name = "SessionTransitionError";
  }
}

export function canTransition(from: SessionStatus, event: SessionEvent): boolean {
  return TRANSITIONS[from]?.[event] !== undefined;
}

/**
 * Trả về trạng thái mới hoặc ném SessionTransitionError.
 * Guards mã hoá các quy tắc vận hành:
 *  - Không điểm danh cho buổi trong tương lai.
 *  - Điểm danh phải đủ cho mọi học viên đang active.
 *  - Hoàn tất cần có nhận xét buổi.
 */
export function transition(from: SessionStatus, event: SessionEvent, ctx: SessionGuardContext): SessionStatus {
  const to = TRANSITIONS[from]?.[event];
  if (!to) throw new SessionTransitionError(from, event, "chuyển trạng thái không hợp lệ");

  if (event === "start" || event === "submit_attendance") {
    if (ctx.sessionDate > ctx.today) {
      throw new SessionTransitionError(from, event, "buổi học chưa diễn ra");
    }
  }
  if (event === "submit_attendance") {
    if (ctx.enrolledCount > 0 && ctx.attendanceCount < ctx.enrolledCount) {
      throw new SessionTransitionError(
        from,
        event,
        `thiếu điểm danh (${ctx.attendanceCount}/${ctx.enrolledCount})`,
      );
    }
  }
  if (event === "complete") {
    if (!ctx.hasSessionNote) throw new SessionTransitionError(from, event, "chưa có nhận xét buổi học");
  }
  return to;
}

/** Trạng thái được coi là "chưa hoàn tất" và cần nhắc GV nếu ngày đã qua */
export const OPEN_STATUSES: readonly SessionStatus[] = ["scheduled", "in_progress", "attendance_done", "notes_done"];

export function isOverdue(status: SessionStatus, sessionDate: string, today: string): boolean {
  return OPEN_STATUSES.includes(status) && sessionDate < today;
}

/** Bước tiếp theo GV cần làm — dùng để render checklist trong Teacher app */
export function nextStep(status: SessionStatus): SessionEvent | null {
  switch (status) {
    case "scheduled":
    case "in_progress":
      return "submit_attendance";
    case "attendance_done":
      return "submit_notes";
    case "notes_done":
      return "complete";
    default:
      return null;
  }
}
