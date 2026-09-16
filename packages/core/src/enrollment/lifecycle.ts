import type { EnrollmentStatus } from "../types.js";

/**
 * Vòng đời ghi danh (Đăng ký học). Hệ cũ có 7 trạng thái hiển thị; hệ mới giữ 5 trạng thái lưu trữ
 * + sự kiện có mốc thời gian (enrollment_events) để dựng lại đúng lịch sử.
 */
export type EnrollmentEvent = "activate" | "pause" | "resume" | "withdraw" | "complete" | "transfer_out";

export const ENROLLMENT_STATUS_VI: Record<EnrollmentStatus, string> = {
  trial: "Học thử",
  active: "Đang học",
  paused: "Bảo lưu",
  completed: "Hoàn thành",
  withdrawn: "Đã nghỉ",
};

export const ENROLLMENT_EVENT_VI: Record<EnrollmentEvent, string> = {
  activate: "Chuyển chính thức",
  pause: "Bảo lưu",
  resume: "Học lại",
  withdraw: "Nghỉ học",
  complete: "Hoàn thành khoá",
  transfer_out: "Chuyển lớp",
};

const T: Record<EnrollmentStatus, Partial<Record<EnrollmentEvent, EnrollmentStatus>>> = {
  trial: { activate: "active", withdraw: "withdrawn", transfer_out: "withdrawn" },
  active: { pause: "paused", withdraw: "withdrawn", complete: "completed", transfer_out: "withdrawn" },
  paused: { resume: "active", withdraw: "withdrawn", transfer_out: "withdrawn" },
  completed: {},
  withdrawn: {},
};

/** Sự kiện cần lý do bắt buộc (ghi audit) */
export const EVENTS_REQUIRING_REASON: readonly EnrollmentEvent[] = ["pause", "withdraw", "transfer_out"];

export class EnrollmentTransitionError extends Error {
  constructor(public readonly from: EnrollmentStatus, public readonly event: EnrollmentEvent) {
    super(`Không thể "${ENROLLMENT_EVENT_VI[event]}" khi đăng ký đang ở trạng thái "${ENROLLMENT_STATUS_VI[from]}"`);
    this.name = "EnrollmentTransitionError";
  }
}

export function enrollmentTransition(from: EnrollmentStatus, event: EnrollmentEvent): EnrollmentStatus {
  const to = T[from]?.[event];
  if (!to) throw new EnrollmentTransitionError(from, event);
  return to;
}

export function enrollmentEventsFor(status: EnrollmentStatus): EnrollmentEvent[] {
  return (Object.keys(T[status] ?? {}) as EnrollmentEvent[]).filter((e) => e !== "transfer_out");
}

export const OPEN_ENROLLMENT_STATUSES: readonly EnrollmentStatus[] = ["trial", "active", "paused"];

export interface StudentPolicy {
  /** Còn ≤ N buổi thì vào danh sách "Sắp hết khoá" */
  nearingEndSessions: number;
  /** Bảo lưu tối đa (tháng) */
  maxPauseMonths: number;
}
export const DEFAULT_STUDENT_POLICY: StudentPolicy = { nearingEndSessions: 4, maxPauseMonths: 3 };

export function remainingSessions(packageSessions: number, consumed: number): number {
  return Math.max(0, packageSessions - consumed);
}

export function isNearingEnd(remaining: number, status: EnrollmentStatus, policy: StudentPolicy = DEFAULT_STUDENT_POLICY): boolean {
  return status === "active" && remaining <= policy.nearingEndSessions;
}

/** Kiểm tra hạn bảo lưu: trả về lỗi (chuỗi) hoặc null. Ngày dạng YYYY-MM-DD. */
export function validatePause(fromISO: string, untilISO: string, policy: StudentPolicy = DEFAULT_STUDENT_POLICY): string | null {
  const from = new Date(fromISO + "T00:00:00Z");
  const until = new Date(untilISO + "T00:00:00Z");
  if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime())) return "Ngày không hợp lệ";
  if (until <= from) return "Ngày học lại phải sau ngày bảo lưu";
  const limit = new Date(from);
  limit.setUTCMonth(limit.getUTCMonth() + policy.maxPauseMonths);
  if (until > limit) return `Bảo lưu tối đa ${policy.maxPauseMonths} tháng`;
  return null;
}

/**
 * Kế hoạch chuyển lớp/cơ sở: số buổi mang sang = gói − đã tiêu thụ.
 * Lớp đích phải còn chỗ và khác lớp hiện tại; nếu khác khoá thì cảnh báo (không chặn).
 */
export interface TransferPlanInput {
  packageSessions: number;
  consumed: number;
  sourceClassId: string;
  target: { classId: string; courseId: string; capacity: number; enrolled: number; status: string };
  sourceCourseId: string;
}
export interface TransferPlan {
  ok: boolean;
  carrySessions: number;
  errors: string[];
  warnings: string[];
}
export function planTransfer(i: TransferPlanInput): TransferPlan {
  const errors: string[] = [];
  const warnings: string[] = [];
  const carry = remainingSessions(i.packageSessions, i.consumed);
  if (i.target.classId === i.sourceClassId) errors.push("Lớp đích trùng lớp hiện tại");
  if (i.target.enrolled >= i.target.capacity) errors.push(`Lớp đích đã đủ ${i.target.capacity} học viên`);
  if (i.target.status === "finished" || i.target.status === "cancelled") errors.push("Lớp đích đã kết thúc hoặc bị huỷ");
  if (carry === 0) errors.push("Học viên đã học hết số buổi trong gói — không còn buổi để chuyển");
  if (i.target.courseId !== i.sourceCourseId) warnings.push("Lớp đích khác khoá học — kiểm tra lại chênh lệch học phí");
  return { ok: errors.length === 0, carrySessions: carry, errors, warnings };
}
