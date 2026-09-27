import { eq, inArray } from "drizzle-orm";
import { centers, staff, teachers, users } from "@satarobo/db";
import { ROLE_LABEL_VI, type Role } from "@satarobo/core";
import type { ProtectedContext } from "../trpc";

/**
 * HỒ SƠ TÀI KHOẢN của chính người đang đăng nhập — chỉ đọc.
 *
 * Họ tên, số điện thoại, chức danh… thuộc hồ sơ nhân sự / hồ sơ giáo viên do bộ phận nhân sự
 * quản lý (có nhật ký); trang này cho mỗi người xem mình đang là ai trong hệ thống: vai trò ở
 * cơ sở nào, đã gắn hồ sơ nhân sự / giáo viên chưa — để biết vì sao thấy hay không thấy một màn hình.
 */
export async function myProfile(ctx: ProtectedContext) {
  const [u, t, s] = await Promise.all([
    ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.user.id),
      columns: { fullName: true, email: true, phone: true, mfaEnabled: true, lastLoginAt: true, createdAt: true },
    }),
    ctx.db.query.teachers.findFirst({ where: eq(teachers.userId, ctx.user.id), columns: { code: true, fullName: true, title: true, centerId: true, workStatus: true } }),
    ctx.db.query.staff.findFirst({ where: eq(staff.userId, ctx.user.id), columns: { code: true, fullName: true, title: true, department: true, centerId: true } }),
  ]);

  const centerIds = [...new Set([...ctx.actor.assignments.map((a) => a.centerId), t?.centerId ?? null, s?.centerId ?? null].filter((x): x is string => !!x))];
  const cs = centerIds.length ? await ctx.db.select({ id: centers.id, code: centers.code, name: centers.name }).from(centers).where(inArray(centers.id, centerIds)) : [];
  const centerLabel = (id: string | null) => {
    if (!id) return "Toàn hệ thống";
    const c = cs.find((x) => x.id === id);
    return c ? `${c.code} · ${c.name}` : "Cơ sở khác";
  };

  const seen = new Set<string>();
  const roles = ctx.actor.assignments
    .filter((a) => { const k = `${a.role}|${a.centerId ?? ""}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .map((a) => ({ role: a.role, label: ROLE_LABEL_VI[a.role as Role] ?? a.role, scope: centerLabel(a.centerId) }));

  return {
    fullName: u?.fullName ?? ctx.user.fullName,
    email: u?.email ?? ctx.user.email,
    phone: u?.phone ?? null,
    mfaEnabled: !!u?.mfaEnabled,
    lastLoginAt: u?.lastLoginAt ?? null,
    createdAt: u?.createdAt ?? null,
    roles,
    teacher: t ? { code: t.code, fullName: t.fullName, title: t.title, center: centerLabel(t.centerId), workStatus: t.workStatus } : null,
    staff: s ? { code: s.code, fullName: s.fullName, title: s.title, department: s.department, center: centerLabel(s.centerId) } : null,
  };
}

/** Tài khoản có gắn hồ sơ giáo viên không — menu tài khoản chỉ hiện "Giao diện giáo viên" khi có */
export async function hasTeacherProfile(ctx: ProtectedContext): Promise<boolean> {
  const t = await ctx.db.query.teachers.findFirst({ where: eq(teachers.userId, ctx.user.id), columns: { id: true } });
  return !!t;
}
