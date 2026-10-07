import "server-only";
import { cookies, headers } from "next/headers";
import { applyModules, centersWith, filterMenu, hasPermission, normalizeIdle, pageAllowed, pagePermLabel, ROLE_LABEL_VI, STAFF_ROLES, type Actor, type Role } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { ADMIN_NAV } from "@/lib/admin-nav";
import { IDLE_COOKIE } from "@/lib/auth-session";
import { PATH_REQUEST_HEADER } from "@/lib/path-header";
import { laChiGiaoVien } from "@/lib/account";
import { GIAO_DIEN_COOKIE, cheDoGiaoVien } from "@/lib/giao-dien";

/** Vai trò chính để hiển thị: ưu tiên vai trò cao nhất theo thứ tự khai báo */
const PRIORITY = ["SUPER_ADMIN", "AUDITOR", "HO_ACCOUNTANT", "HO_HR", "HO_MARKETING", "HO_SALE", "TRAINING", "CENTER_MANAGER", "CENTER_CLASS_MANAGER", "CENTER_SALES_CSM", "CENTER_ACCOUNTANT", "CENTER_HR", "TEACHER", "ASSISTANT_TEACHER"] as const;

/**
 * Dữ liệu dựng khung (quản trị hoặc giáo viên) — dùng chung cho `(admin)/layout` và `teacher/layout`
 * để hai khung luôn cùng một menu đã lọc quyền, cùng hàng rào trang, cùng thông tin tài khoản.
 * Trả null khi chưa đăng nhập.
 */
export async function loadShell() {
  const { caller, ctx } = await getServerCaller();
  const me = await caller.auth.me();
  if (!me || !ctx.actor) return null;
  const actor = ctx.actor as Actor;
  const roles = [...new Set<Role>(me.assignments.map((a) => a.role))];
  const isStaff = roles.some((r) => STAFF_ROLES.includes(r));
  const mfaPending = !!me.auth?.mfa.required && !me.auth.mfa.satisfied;
  const jar = await cookies();
  const idle = me.auth?.via === "supabase" ? normalizeIdle(jar.get(IDLE_COOKIE)?.value ?? 60) : null;

  // Lọc theo quyền (hàng rào hiển thị; service vẫn kiểm tra chặt). Mục trung tâm giữ các chip được phép.
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(actor, p);
  // Quyền đầy đủ (không tính `_own`) ở ít nhất một cơ sở — cho các mục `strict` của menu
  const strictCan = (p: Parameters<typeof hasPermission>[1]) => { const c = centersWith(actor, p); return c === null || c.length > 0; };
  // Module tắt (Cài đặt → Bật / tắt module) chỉ ẩn khỏi MENU; hàng rào trang bên dưới vẫn dùng cây đầy đủ
  const modState = await caller.admin.moduleState().catch(() => null);
  const filtered = filterMenu(ADMIN_NAV, can, strictCan);
  const nav = modState ? applyModules(filtered, modState, roles) : filtered;
  // Hàng rào trang: mở thẳng URL của mục menu đã bị ẩn với vai trò này → báo "chưa có quyền".
  const path = (await headers()).get(PATH_REQUEST_HEADER) ?? "";
  const blocked = path ? pageAllowed(ADMIN_NAV, path, can, strictCan) === false : false;

  const teacherOnly = laChiGiaoVien(roles);
  const isTeacher = await caller.auth.hasTeacherProfile().catch(() => false);
  const teacherMode = cheDoGiaoVien({ teacherOnly, isTeacher, cookie: jar.get(GIAO_DIEN_COOKIE)?.value });
  const main = PRIORITY.find((r) => roles.includes(r)) ?? roles[0]!;
  const initials = me.user.fullName.split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]!.toUpperCase()).join("") || "U";

  return {
    caller, actor, roles, isStaff, mfaPending, idle, nav, path, blocked,
    blockedPerm: (blocked ? pagePermLabel(ADMIN_NAV, path) : null) ?? "",
    teacherOnly, isTeacher, teacherMode,
    me: { fullName: me.user.fullName, email: me.user.email, roleLabel: ROLE_LABEL_VI[main], initials, isTeacher },
  };
}
