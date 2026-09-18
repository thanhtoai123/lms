import type { AttendanceStatus, ISODate, SessionStatus } from "../types.js";

/**
 * Học bù: HV vắng một buổi → yêu cầu → giáo vụ chọn buổi bù (cùng bài, lớp khác, còn chỗ) → duyệt → ghi nhận đã bù.
 */
export const MAKEUP_STATUSES = ["requested", "approved", "rejected", "done"] as const;
export type MakeupStatus = (typeof MAKEUP_STATUSES)[number];
export type MakeupEvent = "approve" | "reject" | "complete" | "reschedule";

export const MAKEUP_STATUS_VI: Record<MakeupStatus, string> = { requested: "Chờ xếp", approved: "Đã xếp buổi bù", rejected: "Từ chối", done: "Đã học bù" };

const T: Record<MakeupStatus, Partial<Record<MakeupEvent, MakeupStatus>>> = {
  requested: { approve: "approved", reject: "rejected" },
  approved: { complete: "done", reschedule: "approved", reject: "rejected" },
  rejected: {},
  done: {},
};

export class MakeupTransitionError extends Error {
  constructor(public readonly from: MakeupStatus, public readonly event: MakeupEvent) {
    super(`Không thể thực hiện "${event}" khi yêu cầu học bù đang "${MAKEUP_STATUS_VI[from]}"`);
    this.name = "MakeupTransitionError";
  }
}

export function makeupTransition(from: MakeupStatus, event: MakeupEvent): MakeupStatus {
  const to = T[from]?.[event];
  if (!to) throw new MakeupTransitionError(from, event);
  return to;
}

export interface MakeupPolicy {
  /** Được xin học bù trong N ngày kể từ buổi vắng */
  requestWindowDays: number;
  /** Cho học bù ở cơ sở khác */
  allowCrossCenter: boolean;
}
export const DEFAULT_MAKEUP_POLICY: MakeupPolicy = { requestWindowDays: 30, allowCrossCenter: true };

/** Buổi vắng còn trong hạn xin học bù? */
export function withinMakeupWindow(missedDate: ISODate, today: ISODate, policy: MakeupPolicy = DEFAULT_MAKEUP_POLICY): boolean {
  const diff = (Date.parse(today + "T00:00:00Z") - Date.parse(missedDate + "T00:00:00Z")) / 86_400_000;
  return diff >= 0 && diff <= policy.requestWindowDays;
}

export interface MakeupCandidateInput {
  id: string;
  classId: string;
  courseId: string;
  centerId: string;
  sequenceNo: number;
  date: ISODate;
  status: SessionStatus;
  enrolled: number;
  capacity: number;
}

/**
 * Buổi có thể dùng để học bù: cùng khoá, cùng số thứ tự bài, lớp khác, chưa diễn ra (≥ hôm nay),
 * chưa huỷ/dời, còn chỗ; ưu tiên cùng cơ sở rồi ngày gần nhất.
 */
export function makeupCandidates(
  missed: { classId: string; courseId: string; centerId: string; sequenceNo: number },
  sessions: MakeupCandidateInput[],
  today: ISODate,
  policy: MakeupPolicy = DEFAULT_MAKEUP_POLICY,
): MakeupCandidateInput[] {
  return sessions
    .filter((s) => s.courseId === missed.courseId && s.sequenceNo === missed.sequenceNo && s.classId !== missed.classId)
    .filter((s) => s.date >= today && s.status !== "cancelled" && s.status !== "rescheduled" && s.status !== "completed")
    .filter((s) => s.enrolled < s.capacity)
    .filter((s) => policy.allowCrossCenter || s.centerId === missed.centerId)
    .sort((a, b) => Number(b.centerId === missed.centerId) - Number(a.centerId === missed.centerId) || a.date.localeCompare(b.date));
}

/**
 * Buổi vắng có vào danh sách "Chờ xếp bù" không.
 * GV chốt tại màn điểm danh (`needsMakeup` = true/false) thì theo GV; chưa quyết (null — dữ liệu cũ)
 * thì suy diễn như trước: cứ vắng (có phép hay không) là chờ xếp bù.
 */
export function needsMakeupFor(status: AttendanceStatus, needsMakeup: boolean | null | undefined): boolean {
  const absent = status === "absent_excused" || status === "absent_unexcused";
  if (!absent) return false;
  return needsMakeup === null || needsMakeup === undefined ? true : needsMakeup;
}

/** Sửa điểm danh là "hồi tố" khi buổi đã hoàn tất hoặc đã qua ngày — bắt buộc lý do và báo GV */
export function isRetroactiveEdit(status: SessionStatus, sessionDate: ISODate, today: ISODate): boolean {
  return status === "completed" || sessionDate < today;
}
