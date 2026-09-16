/**
 * Kiểu dữ liệu domain dùng chung. Đây là "ngôn ngữ chung" (ubiquitous language)
 * giữa DB, API và UI. Không import bất kỳ thư viện nào.
 */

export type ISODate = string; // "2026-09-16"
export type ISODateTime = string; // "2026-09-16T08:00:00+07:00"
export type HHmm = string; // "15:45"

/** 1 = Thứ Hai … 7 = Chủ Nhật (ISO-8601) */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const SESSION_STATUSES = [
  "scheduled",
  "in_progress",
  "attendance_done",
  "notes_done",
  "completed",
  "cancelled",
  "rescheduled",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const ATTENDANCE_STATUSES = [
  "present",
  "late",
  "absent_excused",
  "absent_unexcused",
  "makeup", // học bù (buổi này thay thế buổi đã vắng)
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ENROLLMENT_STATUSES = [
  "trial",
  "active",
  "paused",
  "completed",
  "withdrawn",
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const CLASS_STATUSES = ["draft", "recruiting", "running", "finished", "cancelled"] as const;
export type ClassStatus = (typeof CLASS_STATUSES)[number];

export interface ScheduleRule {
  weekday: Weekday;
  startTime: HHmm;
  endTime: HHmm;
  roomId: string | null;
  teacherId: string | null;
  /** Ngày hiệu lực đầu tiên (inclusive) */
  effectiveFrom: ISODate;
  /** Ngày hiệu lực cuối (inclusive), null = vô hạn */
  effectiveTo: ISODate | null;
}

export interface PlannedSession {
  classId: string;
  sequenceNo: number; // buổi thứ n trong khoá (1-based)
  date: ISODate;
  startTime: HHmm;
  endTime: HHmm;
  roomId: string | null;
  teacherId: string | null;
  lessonId: string | null;
}

export interface AttendanceRecord {
  sessionDate: ISODate;
  sequenceNo: number;
  status: AttendanceStatus;
}
