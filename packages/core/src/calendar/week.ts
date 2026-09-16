import type { ISODate } from "../types.js";
import { addDays, weekdayOf } from "../dates.js";

/** Thứ Hai của tuần chứa ngày d */
export function weekStart(d: ISODate): ISODate {
  return addDays(d, 1 - weekdayOf(d));
}

/** 7 ngày Thứ Hai → Chủ nhật */
export function weekDays(start: ISODate): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export const WEEKDAY_SHORT_VI = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;

/** Nhãn tuần: "15/09 – 21/09/2026" */
export function weekLabel(start: ISODate): string {
  const end = addDays(start, 6);
  const f = (x: ISODate) => `${x.slice(8, 10)}/${x.slice(5, 7)}`;
  return `${f(start)} – ${f(end)}/${end.slice(0, 4)}`;
}

/** Ca học theo giờ bắt đầu: sáng < 12h, chiều < 17h, tối còn lại */
export function shiftOf(startTime: string): "morning" | "afternoon" | "evening" {
  const h = Number(startTime.slice(0, 2));
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
