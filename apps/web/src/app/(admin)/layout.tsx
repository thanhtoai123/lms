import { redirect } from "next/navigation";
import { hasRole } from "@satarobo/core";
import { AdminShell } from "@/components/admin-shell";
import { TeacherShell } from "@/components/teacher-shell";
import { NoAccess } from "@/components/admin-ui";
import { loadShell } from "@/lib/shell";

export const dynamic = "force-dynamic";

/**
 * Khung của mọi trang nghiệp vụ. Chọn khung theo NGƯỜI DÙNG, không theo đường dẫn:
 * - giáo viên / trợ giảng (và người kiêm nhiệm đang ở chế độ giáo viên) → khung giáo viên
 *   (TeacherShell): chấm công, học bạ, bài tập, tin nhắn… mở ngay trong giao diện giáo viên;
 * - còn lại → khung quản trị (AdminShell, sidebar đầy đủ).
 * Menu đã lọc quyền và hàng rào trang dùng chung cho cả hai khung (lib/shell.ts).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await loadShell();
  if (!s) redirect("/login?next=/viec-hom-nay");
  if (!s.isStaff) redirect("/login?error=forbidden");
  // Vai trò bắt buộc xác thực 2 lớp mà chưa xác thực: chỉ được ở trang Bảo mật, không khung, không menu
  if (s.mfaPending) {
    if (s.path !== "/bao-mat") redirect("/bao-mat");
    return <div className="admin-scope contents"><main id="main" className="mx-auto w-full max-w-2xl px-4 py-5 sm:p-6">{children}</main></div>;
  }
  const body = s.blocked ? <NoAccess title="Chưa có quyền" perm={s.blockedPerm} /> : children;

  // `.admin-scope` là lớp bao của bản gốc: nó ghi đè bộ biến màu (tím #610b8a, vòng focus, chữ phụ,
  // mũi tên select) — xem globals.css. `contents` để lớp bao không xen vào bố cục.
  if (s.teacherMode) {
    return (
      <div className="admin-scope contents">
        <TeacherShell nav={s.nav} me={s.me} canAdmin={!s.teacherOnly} idleMinutes={s.idle}>{body}</TeacherShell>
      </div>
    );
  }
  return (
    <div className="admin-scope contents">
      <AdminShell nav={s.nav} me={s.me} roles={s.roles} canRunWorker={hasRole(s.actor, "SUPER_ADMIN", "CENTER_MANAGER")} idleMinutes={s.idle}>
        {body}
      </AdminShell>
    </div>
  );
}
