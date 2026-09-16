/**
 * Hồ sơ giáo viên: ngạch, trạng thái, tải dạy, khoá được dạy, đánh giá dự giờ.
 */
import { addDays, weekdayOf } from "../dates.js";

export const TEACHER_GRADES = ["intern", "junior", "advanced", "senior", "expert"] as const;
export type TeacherGrade = (typeof TEACHER_GRADES)[number];
export const TEACHER_GRADE_VI: Record<TeacherGrade, string> = { intern: "Tập sự", junior: "Junior", advanced: "Advanced", senior: "Senior", expert: "Expert" };

export const TEACHER_STATUSES = ["active", "on_leave", "stopped"] as const;
export type TeacherStatus = (typeof TEACHER_STATUSES)[number];
export const TEACHER_STATUS_VI: Record<TeacherStatus, string> = { active: "Đang dạy", on_leave: "Tạm nghỉ", stopped: "Ngưng" };

export const CONTRACT_TYPES = ["full_time", "part_time", "collaborator"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];
export const CONTRACT_TYPE_VI: Record<ContractType, string> = { full_time: "Toàn thời gian", part_time: "Bán thời gian", collaborator: "Cộng tác viên" };

/** Mã GV kế tiếp: GV001, GV002… */
export function nextTeacherCode(existing: readonly (string | null)[]): string {
  const nums = existing.map((c) => /^GV(\d+)$/.exec(c ?? "")?.[1]).filter((x): x is string => !!x).map(Number);
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `GV${String(n).padStart(3, "0")}`;
}

/** Thứ Hai của tuần chứa ngày */
export function isoWeekStart(d: string): string {
  return addDays(d, 1 - weekdayOf(d));
}

/** Tải dạy theo tuần: số buổi mỗi tuần (bắt đầu thứ Hai) */
export function weeklyLoad(sessionDates: readonly string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of sessionDates) {
    const w = isoWeekStart(d);
    m.set(w, (m.get(w) ?? 0) + 1);
  }
  return m;
}

export type LoadLevel = "ok" | "high" | "over";
export function loadLevel(load: number, max: number): LoadLevel {
  if (load > max) return "over";
  if (load >= Math.ceil(max * 0.85)) return "high";
  return "ok";
}

export function validateEvaluation(score: number, comment: string): string[] {
  const errs: string[] = [];
  if (!Number.isInteger(score) || score < 1 || score > 5) errs.push("Điểm đánh giá từ 1 đến 5 sao");
  if (comment.trim().length < 10) errs.push("Nhận xét dự giờ bắt buộc, tối thiểu 10 ký tự");
  return errs;
}

/** GV có được phân dạy khoá không (danh sách rỗng = chưa khai báo, không chặn) */
export function canTeachCourse(teacherCourseIds: readonly string[], courseId: string): boolean {
  return teacherCourseIds.length === 0 || teacherCourseIds.includes(courseId);
}

/** Chuyển trạng thái GV: tạm nghỉ / ngưng khi còn buổi sắp dạy → phải bàn giao trước */
export function validateTeacherStatusChange(to: TeacherStatus, upcomingSessions: number): string | null {
  if (to !== "active" && upcomingSessions > 0) return `Giáo viên còn ${upcomingSessions} buổi sắp dạy — bàn giao lớp trước khi chuyển "${TEACHER_STATUS_VI[to]}"`;
  return null;
}
