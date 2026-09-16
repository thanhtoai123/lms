import type { ISODate, Weekday, HHmm } from "./types.js";

/** Parse "YYYY-MM-DD" thành Date UTC-midnight (tránh lệch múi giờ). */
export function parseISODate(d: ISODate): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new Error(`Invalid ISO date: ${d}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function toISODate(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = parseISODate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return toISODate(x);
}

/** ISO weekday: 1=Mon … 7=Sun */
export function weekdayOf(d: ISODate): Weekday {
  const js = parseISODate(d).getUTCDay(); // 0=Sun
  return (js === 0 ? 7 : js) as Weekday;
}

export function compareISODate(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isBetween(d: ISODate, from: ISODate, to: ISODate | null): boolean {
  if (compareISODate(d, from) < 0) return false;
  if (to !== null && compareISODate(d, to) > 0) return false;
  return true;
}

export function minutesOf(t: HHmm): number {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m) throw new Error(`Invalid HH:mm: ${t}`);
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) throw new Error(`Invalid HH:mm: ${t}`);
  return h * 60 + mm;
}

/** Hai khoảng thời gian [aStart,aEnd) và [bStart,bEnd) có giao nhau không */
export function timeRangesOverlap(aStart: HHmm, aEnd: HHmm, bStart: HHmm, bEnd: HHmm): boolean {
  return minutesOf(aStart) < minutesOf(bEnd) && minutesOf(bStart) < minutesOf(aEnd);
}
