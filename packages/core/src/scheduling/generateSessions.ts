import type { ISODate, PlannedSession, ScheduleRule } from "../types.js";
import { addDays, compareISODate, isBetween, weekdayOf } from "../dates.js";

export interface GenerateSessionsInput {
  classId: string;
  /** Ngày khai giảng */
  startDate: ISODate;
  /** Tổng số buổi của khoá (vd 48, 12) */
  totalSessions: number;
  rules: ScheduleRule[];
  /** Ngày nghỉ lễ / nghỉ trung tâm — bị bỏ qua và dời sang buổi tiếp theo */
  holidays?: ISODate[];
  /** Bài học theo thứ tự trong giáo trình; buổi n nhận lessonIds[n-1] nếu có */
  lessonIds?: string[];
  /** Chặn vòng lặp vô hạn nếu rules không bao giờ khớp */
  maxScanDays?: number;
}

/**
 * Sinh danh sách buổi học từ lịch (rules) — "lịch học là dữ liệu, không phải chuỗi".
 * Thuật toán: duyệt từng ngày từ startDate, ngày nào khớp một rule có hiệu lực
 * và không phải ngày nghỉ thì tạo buổi, cho đến khi đủ totalSessions.
 * Hai rule cùng weekday (vd 2 ca trong một ngày) đều được tạo, theo thứ tự startTime.
 */
export function generateSessions(input: GenerateSessionsInput): PlannedSession[] {
  const { classId, startDate, totalSessions, rules } = input;
  if (totalSessions <= 0) return [];
  if (rules.length === 0) throw new Error("Lớp chưa có lịch học (rules rỗng)");

  const holidays = new Set(input.holidays ?? []);
  const lessonIds = input.lessonIds ?? [];
  const maxScanDays = input.maxScanDays ?? 730;

  const out: PlannedSession[] = [];
  let date = startDate;
  let scanned = 0;

  while (out.length < totalSessions && scanned < maxScanDays) {
    if (!holidays.has(date)) {
      const wd = weekdayOf(date);
      const todays = rules
        .filter((r) => r.weekday === wd && isBetween(date, r.effectiveFrom, r.effectiveTo))
        .sort((a, b) => (a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0));
      for (const r of todays) {
        if (out.length >= totalSessions) break;
        const seq = out.length + 1;
        out.push({
          classId,
          sequenceNo: seq,
          date,
          startTime: r.startTime,
          endTime: r.endTime,
          roomId: r.roomId,
          teacherId: r.teacherId,
          lessonId: lessonIds[seq - 1] ?? null,
        });
      }
    }
    date = addDays(date, 1);
    scanned++;
  }

  if (out.length < totalSessions) {
    throw new Error(
      `Không sinh đủ ${totalSessions} buổi trong ${maxScanDays} ngày — kiểm tra lịch/effectiveTo`,
    );
  }
  return out;
}

/** Ngày dự kiến kết thúc khoá = ngày của buổi cuối */
export function expectedEndDate(sessions: PlannedSession[]): ISODate | null {
  if (sessions.length === 0) return null;
  return sessions.reduce((acc, s) => (compareISODate(s.date, acc) > 0 ? s.date : acc), sessions[0]!.date);
}
