/**
 * ĐIỀU HƯỚNG GIAO DIỆN GIÁO VIÊN — 5 mục chính cố định, mọi chức năng khác (theo quyền) nằm ở "Thêm".
 *
 * Mọi trang giáo viên mở (kể cả trang nghiệp vụ chung như chấm công, học bạ, bài tập) đều ở trong
 * khung giáo viên; hàm `teacherTabOf` cho biết mục chính nào đang sáng với một đường dẫn.
 */
import type { NavGroup, NavItem } from "./menu.js";

export type TeacherTab = "today" | "schedule" | "classes" | "timesheet" | "more";

export const TEACHER_PRIMARY: { key: TeacherTab; label: string; href: string }[] = [
  { key: "today", label: "Hôm nay", href: "/teacher" },
  { key: "schedule", label: "Lịch dạy", href: "/teacher/lich" },
  { key: "classes", label: "Lớp của tôi", href: "/teacher/classes" },
  { key: "timesheet", label: "Chấm công", href: "/cham-cong/lich-ca" },
  { key: "more", label: "Thêm", href: "/teacher/them" },
];

const under = (p: string, base: string) => p === base || p.startsWith(`${base}/`);

/** Mục chính đang sáng. Trang không thuộc 4 mục đầu → "Thêm" (đi từ danh sách chức năng). */
export function teacherTabOf(pathname: string): TeacherTab {
  const p = pathname.split(/[?#]/)[0] || "/";
  if (p === "/teacher" || under(p, "/teacher/sessions")) return "today";
  if (under(p, "/teacher/lich")) return "schedule";
  if (under(p, "/teacher/classes") || under(p, "/teacher/giao-an") || under(p, "/classes") || under(p, "/report-cards") || under(p, "/hoc-ba-moc")) return "classes";
  if (under(p, "/cham-cong")) return "timesheet";
  return "more";
}

/**
 * Mục menu KHÔNG đưa vào "Thêm": đã là mục chính (Lớp học → Lớp của tôi, Ca & công → Chấm công),
 * hoặc là màn số liệu quản trị không dành cho giáo viên (Dashboard).
 */
export const TEACHER_MORE_SKIP = ["/dashboard", "/classes", "/cham-cong/lich-ca"] as const;

/** Danh sách "Thêm": các nhóm menu đã lọc quyền, bỏ mục trùng mục chính; nhóm rỗng bị bỏ */
export function teacherMoreGroups(nav: NavGroup[]): { label: string; items: NavItem[] }[] {
  const skip = new Set<string>(TEACHER_MORE_SKIP);
  return nav
    .map((g) => ({ label: g.label, items: g.items.filter((i) => !skip.has(i.href)) }))
    .filter((g) => g.items.length > 0);
}

/* ------------------------------------------------------------------ */
/* Buổi nổi bật: đang dạy / buổi tiếp theo                              */
/* ------------------------------------------------------------------ */

export interface BuoiGon { id: string; date: string; startTime: string; endTime: string; status: string }

export type BuoiNoiBat<T extends BuoiGon> =
  | { kind: "dang-day"; session: T; minutesLeft: number }
  | { kind: "sap-toi"; session: T; minutesUntil: number | null };

/** "09:45" | "09:45:00" → 585 */
export function phutTrongNgay(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

const BO_QUA = new Set(["cancelled", "rescheduled"]);
const XONG = new Set(["completed", "notes_done"]);

/**
 * Buổi cần đưa lên đầu trang "Hôm nay":
 * - ĐANG DẠY: buổi hôm nay đã bấm "Bắt đầu" (in_progress), hoặc đang trong khung giờ mà chưa hoàn tất;
 *   `minutesLeft` âm = đã quá giờ kết thúc mà chưa chốt.
 * - SẮP TỚI: buổi sớm nhất chưa bắt đầu — còn trong hôm nay (`minutesUntil` = số phút) hoặc ngày sau (`null`).
 * `today` (YYYY-MM-DD) và `nowMin` (phút trong ngày) theo giờ Việt Nam do nơi gọi truyền vào — hàm thuần, dễ kiểm thử.
 */
export function buoiNoiBat<T extends BuoiGon>(list: readonly T[], today: string, nowMin: number): BuoiNoiBat<T> | null {
  const sorted = [...list].filter((s) => !BO_QUA.has(s.status)).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const homNay = sorted.filter((s) => s.date === today);
  const dang = homNay.find((s) => s.status === "in_progress")
    ?? homNay.find((s) => !XONG.has(s.status) && phutTrongNgay(s.startTime) <= nowMin && nowMin < phutTrongNgay(s.endTime));
  if (dang) return { kind: "dang-day", session: dang, minutesLeft: phutTrongNgay(dang.endTime) - nowMin };
  const next = sorted.find((s) => s.status === "scheduled" && (s.date > today || (s.date === today && phutTrongNgay(s.startTime) > nowMin)));
  if (!next) return null;
  return { kind: "sap-toi", session: next, minutesUntil: next.date === today ? phutTrongNgay(next.startTime) - nowMin : null };
}

/** "còn 1 giờ 5 phút" / "còn 40 phút" */
export function thoiLuongVi(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h} giờ${r ? ` ${r} phút` : ""}` : `${r} phút`;
}

/** Thứ Hai của tuần chứa ngày `iso` (YYYY-MM-DD) — trang Lịch dạy xem theo tuần T2 → CN */
export function dauTuan(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7; // T2 = 0
  d.setUTCDate(d.getUTCDate() - wd);
  return d.toISOString().slice(0, 10);
}

/** Giờ Việt Nam hiện tại: ngày YYYY-MM-DD + phút trong ngày (không phụ thuộc múi giờ máy chủ / máy khách) */
export function gioVietNam(d: Date = new Date()): { today: string; nowMin: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { today: `${p.year}-${p.month}-${p.day}`, nowMin: Number(p.hour) * 60 + Number(p.minute) };
}
