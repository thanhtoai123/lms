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
  if (under(p, "/teacher/classes") || under(p, "/teacher/giao-an") || under(p, "/teacher/hoc-vien") || under(p, "/teacher/anh-lop") || under(p, "/classes") || under(p, "/report-cards") || under(p, "/hoc-ba-moc")) return "classes";
  if (under(p, "/cham-cong")) return "timesheet";
  return "more";
}

/**
 * Mục menu KHÔNG đưa vào "Thêm":
 *  - đã là mục chính: Lớp học → Lớp của tôi, Ca & công → Chấm công;
 *  - màn số liệu quản trị không dành cho giáo viên: Dashboard;
 *  - Hồ sơ học tập toàn trung tâm (giáo viên bấm vào sẽ báo không có quyền);
 *  - việc của văn phòng, trùng hoặc không hợp với giáo viên: "Việc hôm nay" (hộp việc lead / phiếu thu / đơn — giáo viên đã có
 *    trang Hôm nay), danh mục Chương trình học · Khoá học · Lộ trình (bộ phận đào tạo quản; giáo viên xem bài của mình ở
 *    "Giáo án của tôi") và Kho tài liệu giảng dạy (đã có "Tài liệu lớp tôi" riêng cho giáo viên).
 * Chỉ ẩn khỏi danh sách cho gọn — quyền và trang vẫn do máy chủ kiểm như cũ.
 */
export const TEACHER_MORE_SKIP = [
  "/dashboard", "/classes", "/cham-cong/lich-ca",
  "/viec-hom-nay", "/curriculums", "/courses", "/lo-trinh", "/documents",
  // Hồ sơ học tập toàn trung tâm cần quyền xem học bạ đầy đủ — giáo viên chỉ có học bạ lớp mình (Lớp của tôi → Học bạ lớp)
  "/ho-so-hoc-tap",
] as const;

/** Danh sách "Thêm": các nhóm menu đã lọc quyền, bỏ mục trùng mục chính; nhóm rỗng bị bỏ */
export function teacherMoreGroups(nav: NavGroup[]): { label: string; items: NavItem[] }[] {
  const skip = new Set<string>(TEACHER_MORE_SKIP);
  return nav
    .map((g) => ({ label: g.label, items: g.items.filter((i) => !skip.has(i.href)) }))
    .filter((g) => g.items.length > 0);
}

/* ------------------------------------------------------------------ */
/* Sidebar trái (máy tính ≥ 1024px) — cùng bố cục site giáo viên gốc      */
/* ------------------------------------------------------------------ */

export interface SidebarItem { label: string; href: string; icon: string; /** tiền tố đường dẫn con cũng tô sáng mục này */ match?: string[] }
export interface SidebarGroup { label: string | null; items: SidebarItem[] }

/**
 * Menu trái: Tổng quan · Giảng dạy · Học viên & học bạ · Ca & chấm công · Học thử.
 * Mục của giao diện giáo viên luôn có; mục lấy từ menu chung (bài tập, tài liệu, tin nhắn, học bạ, hoàn thành khoá,
 * học bù, học thử) chỉ hiện khi người dùng CÓ QUYỀN — `nav` là cây menu đã lọc quyền. Nhóm rỗng bị bỏ.
 * Mọi chức năng còn lại vẫn ở "Thêm".
 */
export function teacherSidebar(nav: NavGroup[]): SidebarGroup[] {
  const all = nav.flatMap((g) => g.items);
  const has = (href: string) => all.some((i) => i.href === href || (i.tabs ?? []).some((t) => t.href === href));
  const hasAny = (...hrefs: string[]) => hrefs.find(has);
  const opt = (label: string, icon: string, href: string | undefined, match?: string[]): SidebarItem[] => (href ? [{ label, href, icon, match }] : []);
  const groups: SidebarGroup[] = [
    { label: null, items: [{ label: "Tổng quan", href: "/teacher", icon: "layout-dashboard", match: ["/teacher/sessions"] }] },
    {
      label: "Giảng dạy",
      items: [
        { label: "Lớp của tôi", href: "/teacher/classes", icon: "users", match: ["/classes"] },
        { label: "Lịch làm việc", href: "/teacher/lich", icon: "calendar-days" },
        { label: "Giáo án", href: "/teacher/giao-an", icon: "book-open" },
        ...opt("Bài tập", "notebook-pen", hasAny("/assignments"), ["/assignments"]),
        ...opt("Tài liệu", "presentation", hasAny("/teaching-materials"), ["/teaching-materials"]),
        ...opt("Tin nhắn", "message-circle", hasAny("/tin-nhan"), ["/tin-nhan"]),
      ],
    },
    {
      label: "Học thử",
      items: [
        ...opt("Lớp trial", "flask-conical", hasAny("/lop-trial"), ["/lop-trial"]),
        ...opt("Học bù", "refresh-cw", hasAny("/hoc-bu"), ["/hoc-bu"]),
      ],
    },
    {
      label: "Học viên & học bạ",
      items: [
        { label: "Học viên", href: "/teacher/hoc-vien", icon: "graduation-cap", match: ["/students"] },
        ...opt("Hoàn thành khoá", "award", hasAny("/hoan-thanh-khoa"), ["/hoan-thanh-khoa"]),
        { label: "Ảnh lớp", href: "/teacher/anh-lop", icon: "image" },
      ],
    },
    { label: "Ca & chấm công", items: [{ label: "Chấm công", href: "/cham-cong/lich-ca", icon: "clock", match: ["/cham-cong", "/don-tu"] }] },
    { label: null, items: [{ label: "Thêm chức năng", href: "/teacher/them", icon: "layout-dashboard" }] },
  ];
  return groups.filter((g) => g.items.length > 0);
}

/** Mục sidebar đang sáng: khớp tiền tố dài nhất (Tổng quan chỉ khớp đúng /teacher + các tiền tố khai báo) */
export function sidebarActiveHref(pathname: string, groups: readonly SidebarGroup[]): string | null {
  const p = pathname.split(/[?#]/)[0] || "/";
  let best: { href: string; len: number } | null = null;
  for (const g of groups) for (const i of g.items) {
    const prefixes = [i.href, ...(i.match ?? [])];
    for (const x of prefixes) {
      const hit = i.href === "/teacher" && x === "/teacher" ? p === "/teacher" : p === x || p.startsWith(`${x}/`);
      if (hit && (!best || x.length > best.len)) best = { href: i.href, len: x.length };
    }
  }
  return best?.href ?? null;
}

/* ------------------------------------------------------------------ */
/* Buổi nổi bật: đang dạy / buổi tiếp theo                              */
/* ------------------------------------------------------------------ */

export interface BuoiGon { id: string; date: string; startTime: string; endTime: string; status: string }

export type BuoiNoiBat<T extends BuoiGon> =
  | { kind: "dang-day"; session: T; minutesLeft: number }
  | { kind: "can-chot"; session: T; minutesAgo: number }
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
 * - SẮP TỚI trong 60 phút tới (hôm nay) — ưu tiên chuẩn bị.
 * - CẦN CHỐT: buổi hôm nay đã hết giờ mà chưa hoàn tất (quên điểm danh / nhận xét) — `minutesAgo` từ lúc kết thúc.
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
  const nextUntil = next && next.date === today ? phutTrongNgay(next.startTime) - nowMin : null;
  if (next && nextUntil !== null && nextUntil <= 60) return { kind: "sap-toi", session: next, minutesUntil: nextUntil };
  const chot = [...homNay].reverse().find((s) => !XONG.has(s.status) && phutTrongNgay(s.endTime) <= nowMin);
  if (chot) return { kind: "can-chot", session: chot, minutesAgo: nowMin - phutTrongNgay(chot.endTime) };
  if (!next) return null;
  return { kind: "sap-toi", session: next, minutesUntil: nextUntil };
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
