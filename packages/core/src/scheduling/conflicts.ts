import type { HHmm, ISODate } from "../types.js";
import { timeRangesOverlap } from "../dates.js";

export interface Slot {
  id: string;
  date: ISODate;
  startTime: HHmm;
  endTime: HHmm;
  roomId: string | null;
  teacherId: string | null;
}

export type ConflictKind = "room" | "teacher";

export interface Conflict {
  kind: ConflictKind;
  a: string;
  b: string;
  date: ISODate;
  resourceId: string;
}

/**
 * Phát hiện trùng phòng / trùng giáo viên giữa các slot cùng ngày.
 * Dùng ở tầng ứng dụng trước khi ghi; DB còn có EXCLUDE constraint làm lớp chặn cuối.
 * O(n^2) theo ngày — đủ tốt cho vài trăm buổi/ngày.
 */
export function findConflicts(slots: Slot[]): Conflict[] {
  const byDate = new Map<ISODate, Slot[]>();
  for (const s of slots) {
    const arr = byDate.get(s.date) ?? [];
    arr.push(s);
    byDate.set(s.date, arr);
  }
  const conflicts: Conflict[] = [];
  for (const [date, arr] of byDate) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i]!;
        const b = arr[j]!;
        if (!timeRangesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) continue;
        if (a.roomId && a.roomId === b.roomId) {
          conflicts.push({ kind: "room", a: a.id, b: b.id, date, resourceId: a.roomId });
        }
        if (a.teacherId && a.teacherId === b.teacherId) {
          conflicts.push({ kind: "teacher", a: a.id, b: b.id, date, resourceId: a.teacherId });
        }
      }
    }
  }
  return conflicts;
}
