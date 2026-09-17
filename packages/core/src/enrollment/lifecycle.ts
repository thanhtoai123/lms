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

/** Sự kiện thao tác được từ màn hồ sơ (chuyển lớp đi qua wizard riêng) */
export type ManualEnrollmentEvent = Exclude<EnrollmentEvent, "transfer_out">;

export function enrollmentEventsFor(status: EnrollmentStatus): ManualEnrollmentEvent[] {
  return (Object.keys(T[status] ?? {}) as EnrollmentEvent[]).filter((e): e is ManualEnrollmentEvent => e !== "transfer_out");
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

/** Ngày cuối được phép bảo lưu tới (from + maxPauseMonths) */
export function pauseLimitDate(fromISO: string, policy: StudentPolicy = DEFAULT_STUDENT_POLICY): string {
  const limit = new Date(fromISO + "T00:00:00Z");
  limit.setUTCMonth(limit.getUTCMonth() + policy.maxPauseMonths);
  return limit.toISOString().slice(0, 10);
}

/**
 * Kiểm tra hạn bảo lưu: trả về lỗi (chuỗi) hoặc null. Ngày dạng YYYY-MM-DD.
 * `untilISO` = null: chưa hẹn ngày trở lại (hợp lệ — hệ thống nhắc khi quá hạn tối đa).
 */
export function validatePause(fromISO: string, untilISO: string | null, policy: StudentPolicy = DEFAULT_STUDENT_POLICY): string | null {
  const from = new Date(fromISO + "T00:00:00Z");
  if (Number.isNaN(from.getTime())) return "Ngày không hợp lệ";
  if (untilISO === null) return null;
  const until = new Date(untilISO + "T00:00:00Z");
  if (Number.isNaN(until.getTime())) return "Ngày không hợp lệ";
  if (until <= from) return "Ngày học lại phải sau ngày bảo lưu";
  if (untilISO > pauseLimitDate(fromISO, policy)) return `Bảo lưu tối đa ${policy.maxPauseMonths} tháng`;
  return null;
}

/* ------------------------------------------------------------------ */
/* Vòng đời học viên (bảo lưu cả hồ sơ, nghỉ hẳn, kích hoạt lại)       */
/* ------------------------------------------------------------------ */

export type StudentLifecycleEvent = "reserve" | "end_reserve" | "withdraw" | "reactivate";

export const STUDENT_LIFECYCLE_VI: Record<StudentLifecycleEvent, string> = {
  reserve: "Bảo lưu",
  end_reserve: "Kết thúc bảo lưu",
  withdraw: "Nghỉ học hẳn",
  reactivate: "Kích hoạt lại",
};

export interface StudentLifecycleState {
  /** Trạng thái hồ sơ học viên (prospect | trial | active | paused | alumni | withdrawn) */
  status: string;
  /** Số ghi danh đang học (trial / active) */
  studying: number;
  /** Số ghi danh đang bảo lưu */
  paused: number;
  /** Có đợt bảo lưu hồ sơ đang mở */
  openPause: boolean;
}

/** Các thao tác vòng đời khả dụng */
export function studentLifecycleActions(s: StudentLifecycleState): StudentLifecycleEvent[] {
  const out: StudentLifecycleEvent[] = [];
  if (s.status !== "withdrawn" && s.studying > 0) out.push("reserve");
  if (s.openPause || s.paused > 0) out.push("end_reserve");
  if (s.status !== "withdrawn") out.push("withdraw");
  if (s.status === "withdrawn") out.push("reactivate");
  return out;
}

export class StudentLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudentLifecycleError";
  }
}

/** Kiểm tra thao tác vòng đời; lý do bắt buộc ≥ 5 ký tự (trừ kết thúc bảo lưu). Trả về lý do đã chuẩn hoá */
export function checkStudentLifecycle(s: StudentLifecycleState, event: StudentLifecycleEvent, reason?: string | null): string | null {
  if (!studentLifecycleActions(s).includes(event)) {
    throw new StudentLifecycleError(
      event === "reserve" ? "Học viên không có lớp đang học để bảo lưu"
        : event === "end_reserve" ? "Học viên không có đợt bảo lưu đang mở"
          : event === "withdraw" ? "Học viên đã nghỉ học"
            : "Chỉ kích hoạt lại học viên đã nghỉ học",
    );
  }
  const r = reason?.trim() ?? "";
  if (event !== "end_reserve" && r.length < 5) throw new StudentLifecycleError(`Cần nhập lý do ${STUDENT_LIFECYCLE_VI[event].toLowerCase()} (ít nhất 5 ký tự)`);
  if (r.length > 500) throw new StudentLifecycleError("Lý do tối đa 500 ký tự");
  return r || null;
}

export interface PauseReminder {
  kind: "return_soon" | "overdue_return" | "over_max";
  message: string;
  /** Khoá chống tạo trùng việc chăm sóc */
  dedupeKey: string;
}

/**
 * Nhắc việc cho đợt bảo lưu đang mở: sắp đến ngày dự kiến trở lại (trước N ngày),
 * đã quá ngày trở lại, hoặc (không hẹn ngày) đã quá hạn bảo lưu tối đa.
 */
export function pauseReminder(p: { id: string; fromDate: string; expectedReturn: string | null; today: string; leadDays?: number }, policy: StudentPolicy = DEFAULT_STUDENT_POLICY): PauseReminder | null {
  const lead = p.leadDays ?? 3;
  const fmt = (d: string) => d.split("-").reverse().join("/");
  if (p.expectedReturn) {
    if (p.today > p.expectedReturn) return { kind: "overdue_return", message: `Đã quá ngày dự kiến trở lại ${fmt(p.expectedReturn)} — liên hệ phụ huynh`, dedupeKey: `pause:${p.id}:overdue` };
    const soon = new Date(p.expectedReturn + "T00:00:00Z");
    soon.setUTCDate(soon.getUTCDate() - lead);
    if (p.today >= soon.toISOString().slice(0, 10)) return { kind: "return_soon", message: `Sắp hết bảo lưu — dự kiến trở lại ${fmt(p.expectedReturn)}`, dedupeKey: `pause:${p.id}:return` };
    return null;
  }
  const limit = pauseLimitDate(p.fromDate, policy);
  if (p.today > limit) return { kind: "over_max", message: `Bảo lưu quá ${policy.maxPauseMonths} tháng (từ ${fmt(p.fromDate)}) mà chưa hẹn ngày trở lại`, dedupeKey: `pause:${p.id}:max` };
  return null;
}

/**
 * Kế hoạch chuyển lớp/cơ sở: số buổi mang sang = gói − đã tiêu thụ.
 * - Lớp đích phải cùng khoá (khác khoá chỉ được khi quản lý miễn kèm lý do).
 * - Không vượt tiến độ: lớp đích không được học trước học viên quá `progressTolerance` bài.
 * - Lớp đích đầy: vào danh sách chờ nếu cho phép (allowWaitlist), ngược lại là lỗi.
 */
export interface TransferPlanInput {
  packageSessions: number;
  consumed: number;
  sourceClassId: string;
  target: { classId: string; courseId: string; capacity: number; enrolled: number; status: string; lessonsDone?: number };
  sourceCourseId: string;
  /** Số bài học viên đã đi qua ở lớp hiện tại (buổi chính thức đã hoàn tất của lớp nguồn) */
  sourceProgress?: number;
  /** Quản lý miễn điều kiện cùng khoá */
  waiverReason?: string | null;
  progressTolerance?: number;
  allowWaitlist?: boolean;
}
export interface TransferPlan {
  ok: boolean;
  carrySessions: number;
  errors: string[];
  warnings: string[];
  /** Lớp đích hết chỗ → yêu cầu vào danh sách chờ */
  waitlist: boolean;
  /** Gợi ý vào lớp đích từ buổi (buổi chính thức chưa học kế tiếp) */
  startSequenceNo: number | null;
}
export function planTransfer(i: TransferPlanInput): TransferPlan {
  const errors: string[] = [];
  const warnings: string[] = [];
  const carry = remainingSessions(i.packageSessions, i.consumed);
  let waitlist = false;
  const sameCourse = i.target.courseId === i.sourceCourseId;
  if (i.target.classId === i.sourceClassId) errors.push("Lớp đích trùng lớp hiện tại");
  if (i.target.status === "finished" || i.target.status === "cancelled") errors.push("Lớp đích đã kết thúc hoặc bị huỷ");
  if (carry === 0) errors.push("Học viên đã học hết số buổi trong gói — không còn buổi để chuyển");
  if (!sameCourse) {
    if ((i.waiverReason ?? "").trim().length >= 5) warnings.push(`Khác khoá học — đã miễn: ${i.waiverReason!.trim()}`);
    else errors.push("Lớp đích phải cùng khoá học (quản lý có thể miễn kèm lý do)");
  }
  const tol = i.progressTolerance ?? 2;
  if (sameCourse && i.target.lessonsDone !== undefined && i.sourceProgress !== undefined && i.target.lessonsDone > i.sourceProgress + tol) {
    errors.push(`Lớp đích đã học vượt tiến độ học viên (${i.target.lessonsDone} bài > ${i.sourceProgress} bài đã học)`);
  }
  if (i.target.enrolled >= i.target.capacity) {
    if (i.allowWaitlist) {
      waitlist = true;
      warnings.push(`Lớp đích đã đủ ${i.target.capacity} học viên — yêu cầu sẽ vào danh sách chờ`);
    } else errors.push(`Lớp đích đã đủ ${i.target.capacity} học viên`);
  }
  const startSequenceNo = i.target.lessonsDone !== undefined ? i.target.lessonsDone + 1 : null;
  return { ok: errors.length === 0, carrySessions: carry, errors, warnings, waitlist, startSequenceNo };
}

export const TRANSFER_REQUEST_STATUSES = ["pending", "waitlisted", "approved", "rejected", "cancelled"] as const;
export type TransferRequestStatus = (typeof TRANSFER_REQUEST_STATUSES)[number];
export const TRANSFER_REQUEST_VI: Record<TransferRequestStatus, string> = {
  pending: "Chờ quản lý duyệt",
  waitlisted: "Danh sách chờ",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  cancelled: "Đã huỷ",
};

/** Thứ tự danh sách chờ: rank nhỏ trước, rồi tạo trước */
export function nextWaitlistRank(existing: readonly number[]): number {
  return (existing.length ? Math.max(...existing) : 0) + 1;
}
