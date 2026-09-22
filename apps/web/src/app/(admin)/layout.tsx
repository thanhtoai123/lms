import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { normalizeIdle } from "@satarobo/core";
import { IDLE_COOKIE } from "@/lib/auth-session";
import { filterMenu, pageAllowed, pagePermLabel, hasPermission, hasRole, ROLE_LABEL_VI, STAFF_ROLES, type Actor, type Role } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { ADMIN_NAV } from "@/lib/admin-nav";
import { AdminShell } from "@/components/admin-shell";
import { NoAccess } from "@/components/admin-ui";
import { PATH_REQUEST_HEADER } from "@/lib/path-header";

export const dynamic = "force-dynamic";

/** Vai trò chính để hiển thị: ưu tiên vai trò cao nhất theo thứ tự khai báo */
const PRIORITY = ["SUPER_ADMIN", "AUDITOR", "HO_ACCOUNTANT", "HO_HR", "HO_MARKETING", "HO_SALE", "TRAINING", "CENTER_MANAGER", "CENTER_CLASS_MANAGER", "CENTER_SALES_CSM", "CENTER_ACCOUNTANT", "CENTER_HR", "TEACHER", "ASSISTANT_TEACHER"] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { caller, ctx } = await getServerCaller();
  const me = await caller.auth.me();
  if (!me || !ctx.actor) redirect("/login?next=/viec-hom-nay");
  const actor = ctx.actor as Actor;
  const roles = me.assignments.map((a) => a.role);
  if (!roles.some((r) => STAFF_ROLES.includes(r))) redirect("/login?error=forbidden");
  if (me.auth?.mfa.required && !me.auth.mfa.satisfied) redirect("/bao-mat");

  const idle = me.auth?.via === "supabase" ? normalizeIdle((await cookies()).get(IDLE_COOKIE)?.value ?? 60) : null;
  // Lọc theo quyền (hàng rào hiển thị; service vẫn kiểm tra chặt). Mục trung tâm giữ các chip được phép.
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(actor, p);
  const nav = filterMenu(ADMIN_NAV, can);
  // Hàng rào trang: mở thẳng URL của mục menu đã bị ẩn với vai trò này → báo "chưa có quyền"
  // thay vì chạy trang (trước đây: trang trống, hoặc lỗi 500 khi truy vấn của trang từ chối).
  // Chỉ khớp ĐÚNG đường dẫn của mục/chip; trang chi tiết và trang ngoài menu tự kiểm quyền như cũ.
  const path = (await headers()).get(PATH_REQUEST_HEADER) ?? "";
  const blocked = path ? pageAllowed(ADMIN_NAV, path, can) === false : false;
  const main = PRIORITY.find((r) => roles.includes(r)) ?? roles[0]!;
  const initials = me.user.fullName.split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]!.toUpperCase()).join("") || "U";

  // `.admin-scope` là lớp bao của bản gốc: nó ghi đè bộ biến màu cho riêng khu
  // quản trị (tím #610b8a, vòng focus, chữ phụ, mũi tên select) — xem globals.css.
  // `contents` để lớp bao không xen vào bố cục, chỉ truyền biến CSS xuống dưới.
  return (
    <div className="admin-scope contents">
      <AdminShell
        nav={nav}
        me={{ fullName: me.user.fullName, email: me.user.email, roleLabel: ROLE_LABEL_VI[main], initials }}
        roles={[...new Set<Role>(roles)]}
        canRunWorker={hasRole(actor, "SUPER_ADMIN", "CENTER_MANAGER")}
        idleMinutes={idle}
      >
        {blocked ? <NoAccess title="Chưa có quyền" perm={pagePermLabel(ADMIN_NAV, path)} /> : children}
      </AdminShell>
    </div>
  );
}
