/**
 * ĐIỀU HƯỚNG GIAO DIỆN GIÁO VIÊN — 4 mục chính cố định, mọi chức năng khác (theo quyền) nằm ở "Thêm".
 *
 * Mọi trang giáo viên mở (kể cả trang nghiệp vụ chung như chấm công, học bạ, bài tập) đều ở trong
 * khung giáo viên; hàm `teacherTabOf` cho biết mục chính nào đang sáng với một đường dẫn.
 */
import type { NavGroup, NavItem } from "./menu.js";

export type TeacherTab = "today" | "classes" | "timesheet" | "more";

export const TEACHER_PRIMARY: { key: TeacherTab; label: string; href: string }[] = [
  { key: "today", label: "Hôm nay", href: "/teacher" },
  { key: "classes", label: "Lớp của tôi", href: "/teacher/classes" },
  { key: "timesheet", label: "Chấm công", href: "/cham-cong/lich-ca" },
  { key: "more", label: "Thêm", href: "/teacher/them" },
];

const under = (p: string, base: string) => p === base || p.startsWith(`${base}/`);

/** Mục chính đang sáng. Trang không thuộc 3 mục đầu → "Thêm" (đi từ danh sách chức năng). */
export function teacherTabOf(pathname: string): TeacherTab {
  const p = pathname.split(/[?#]/)[0] || "/";
  if (p === "/teacher" || under(p, "/teacher/sessions")) return "today";
  if (under(p, "/teacher/classes") || under(p, "/classes") || under(p, "/report-cards") || under(p, "/hoc-ba-moc")) return "classes";
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
