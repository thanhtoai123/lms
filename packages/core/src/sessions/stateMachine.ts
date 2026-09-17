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
  // Huỷ buổi đi qua luồng riêng (lý do, dời bù, dải số lưu trữ) — không mở lại buổi đã huỷ
  cancelled: {},
  rescheduled: {},
};

export interface SessionGuardContext {
  /** Số học viên đang active trong lớp tại buổi này */
  enrolledCount: number;
  /** Số bản ghi điểm danh đã có */
  attendanceCount: number;
  /** Đã có nhận xét chung của buổi chưa (dùng khi không truyền completionBlockers) */
  hasSessionNote?: boolean;
  /** Điều kiện hoàn tất còn thiếu (từ completionBlockers) — thay cho kiểm tra nhận xét chung */
  completionBlockers?: readonly string[];
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
    if (ctx.completionBlockers) {
      if (ctx.completionBlockers.length) throw new SessionTransitionError(from, event, ctx.completionBlockers.join("; "));
    } else if (!ctx.hasSessionNote) throw new SessionTransitionError(from, event, "chưa có nhận xét buổi học");
  }
  return to;
}

/* ------------------------------------------------------------------ */
/* Điều kiện hoàn tất buổi (quy trình sau buổi)                        */
/* ------------------------------------------------------------------ */

export interface CompletionInput {
  /** Số HV phải điểm danh / đã điểm danh */
  enrolledCount: number;
  attendanceCount: number;
  /** Đã xác nhận bài đã dạy (gắn bài giảng / chủ đề) */
  lessonConfirmed: boolean;
  /** Có nhận xét chung của buổi */
  hasSessionNote: boolean;
  /** Số HV có mặt / đi muộn / học bù chưa có nhận xét riêng */
  presentWithoutRemark: number;
  /** Cấu hình: bắt buộc nhận xét từng HV có mặt */
  requireRemarks: boolean;
  /** Số ảnh / video của buổi trong kho */
  mediaCount: number;
  /** Cấu hình: bắt buộc có ảnh */
  requireMedia: boolean;
  /** Nhãn các mục bắt buộc chưa tick trong checklist sau buổi */
  checklistMissing: readonly string[];
  /** Có giao bài tập về nhà cho buổi (tuỳ chọn) */
  assignmentCount?: number;
}

export interface CompletionStep {
  key: "attendance" | "lesson" | "note" | "remarks" | "media" | "checklist" | "homework";
  label: string;
  done: boolean;
  required: boolean;
  hint?: string;
}

/** Các bước của quy trình sau buổi, tự tick theo dữ liệu thật */
export function completionChecklist(i: CompletionInput): CompletionStep[] {
  return [
    { key: "attendance", label: "Điểm danh xong", required: true, done: i.enrolledCount === 0 || i.attendanceCount >= i.enrolledCount, hint: `${i.attendanceCount}/${i.enrolledCount} học viên` },
    { key: "lesson", label: "Xác nhận bài đã dạy", required: true, done: i.lessonConfirmed },
    { key: "note", label: "Nhận xét chung của buổi", required: true, done: i.hasSessionNote },
    { key: "remarks", label: "Nhận xét từng học viên có mặt", required: i.requireRemarks, done: i.presentWithoutRemark === 0, hint: i.presentWithoutRemark ? `còn ${i.presentWithoutRemark} học viên chưa có nhận xét` : undefined },
    { key: "media", label: "Ảnh / video lớp trong kho", required: i.requireMedia, done: i.mediaCount > 0, hint: `${i.mediaCount} tệp` },
    { key: "checklist", label: "Checklist sau buổi (mục bắt buộc)", required: true, done: i.checklistMissing.length === 0, hint: i.checklistMissing.length ? `còn: ${i.checklistMissing.join(", ")}` : undefined },
    { key: "homework", label: "Giao bài tập", required: false, done: (i.assignmentCount ?? 0) > 0 },
  ];
}

/** Lý do chưa hoàn tất được buổi (rỗng = hoàn tất được) */
export function completionBlockers(i: CompletionInput): string[] {
  return completionChecklist(i)
    .filter((s) => s.required && !s.done)
    .map((s) => (s.key === "attendance" ? `Chưa điểm danh đủ (${i.attendanceCount}/${i.enrolledCount})` : s.key === "remarks" ? `Chưa nhận xét ${i.presentWithoutRemark} học viên có mặt` : s.key === "media" ? "Chưa có ảnh / video của buổi trong kho" : s.key === "checklist" ? `Chưa hoàn thành checklist sau buổi: ${i.checklistMissing.join("; ")}` : s.key === "lesson" ? "Chưa xác nhận bài đã dạy" : "Chưa có nhận xét chung của buổi"));
}

/* ------------------------------------------------------------------ */
/* Điều chỉnh / huỷ từng buổi                                          */
/* ------------------------------------------------------------------ */

export interface SessionAdjustInput {
  status: SessionStatus;
  hasAttendance: boolean;
  current: { date: string; startTime: string; endTime: string; roomId: string | null; teacherId: string | null };
  next: { date: string; startTime: string; endTime: string; roomId: string | null; teacherId: string | null };
  today: string;
}

/** Kiểm tra điều chỉnh một buổi (ngày / giờ / GV / phòng). Trả về danh sách lỗi */
export function validateSessionAdjust(i: SessionAdjustInput): string[] {
  const e: string[] = [];
  if (i.status !== "scheduled") e.push("Chỉ điều chỉnh buổi chưa diễn ra (trạng thái Đã lên lịch)");
  if (i.hasAttendance) e.push("Buổi đã có điểm danh — không điều chỉnh");
  if (i.next.date < i.today) e.push("Không dời buổi về ngày đã qua");
  if (i.current.date < i.today) e.push("Buổi đã qua ngày — hãy hoàn tất hoặc huỷ buổi");
  if (!/^\d{2}:\d{2}$/.test(i.next.startTime) || !/^\d{2}:\d{2}$/.test(i.next.endTime) || i.next.endTime <= i.next.startTime) e.push("Giờ kết thúc phải sau giờ bắt đầu");
  const c = i.current;
  const n = i.next;
  if (c.date === n.date && c.startTime.slice(0, 5) === n.startTime && c.endTime.slice(0, 5) === n.endTime && c.roomId === n.roomId && c.teacherId === n.teacherId) e.push("Không có thay đổi nào");
  return e;
}

/** Huỷ buổi: chỉ buổi chưa có điểm danh, chưa hoàn tất */
export function validateSessionCancel(i: { status: SessionStatus; hasAttendance: boolean }): string[] {
  const e: string[] = [];
  if (i.status !== "scheduled" && i.status !== "in_progress") e.push("Chỉ huỷ buổi chưa hoàn tất (Đã lên lịch / Đang diễn ra)");
  if (i.hasAttendance) e.push("Buổi đã có điểm danh — không huỷ được, hãy sửa điểm danh");
  return e;
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
