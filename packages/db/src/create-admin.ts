/**
 * Tạo (hoặc bảo đảm) MỘT quản trị tối cao THẬT cho hệ thống chạy thật.
 *
 *   EMAIL=admin@thsteam.vn TEN="Phan Thành Toại" pnpm --filter @satarobo/db exec tsx src/create-admin.ts
 *
 * Chỉ tạo hàng `users` + vai trò SUPER_ADMIN toàn hệ thống (không kèm cơ sở). KHÔNG đặt mật khẩu ở đây:
 * người này vào trang đăng nhập, dùng Supabase (email đã bật xác nhận) — lần đăng nhập đầu hệ thống tự
 * liên kết tài khoản Supabase với hàng users theo email đã xác nhận (xem packages/api/src/context.ts).
 *
 * Chạy lại an toàn: đã có user theo email thì chỉ bảo đảm vai trò SUPER_ADMIN và mở khoá, không tạo trùng.
 */
import "./env";
import { and, eq, isNull, sql } from "drizzle-orm";
import { users, userRoles } from "./schema/index";
import { createDb } from "./index";
import { defaultTenantId } from "./thsteam-sync";

const email = (process.env.EMAIL ?? "").trim().toLowerCase();
const ten = (process.env.TEN ?? "Quản trị hệ thống").trim();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Thiếu EMAIL hợp lệ. Ví dụ: EMAIL=admin@thsteam.vn TEN="Tên quản trị" pnpm --filter @satarobo/db exec tsx src/create-admin.ts');
  process.exit(1);
}

const db = createDb(undefined, { max: 1 });
{
  const tenantId = await defaultTenantId(db).catch(() => null);
  const existing = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` });
  let userId: string;
  if (existing) {
    userId = existing.id;
    if (!existing.isActive) await db.update(users).set({ isActive: true, lockedAt: null, lockedReason: null }).where(eq(users.id, existing.id));
    console.log(`• Đã có tài khoản ${email} — bảo đảm vai trò quản trị.`);
  } else {
    const [u] = await db.insert(users).values({ email, fullName: ten, isActive: true, ...(tenantId ? { tenantId } : {}) }).returning({ id: users.id });
    userId = u!.id;
    console.log(`• Tạo tài khoản quản trị ${email}.`);
  }
  const role = await db.query.userRoles.findFirst({ where: and(eq(userRoles.userId, userId), eq(userRoles.role, "SUPER_ADMIN"), isNull(userRoles.centerId)) });
  if (!role) {
    await db.insert(userRoles).values({ userId, role: "SUPER_ADMIN", centerId: null, source: "manual", ...(tenantId ? { tenantId } : {}) });
    console.log("• Cấp vai trò SUPER_ADMIN toàn hệ thống.");
  }
  console.log(`\n✔ Xong. Người này vào trang /login đăng nhập bằng email ${email} (qua Supabase) là vào được quản trị.`);
  console.log("  Nhớ: trên Supabase phải TẮT đăng ký tự do và BẬT xác nhận email; email đăng nhập phải trùng email trên.");
}
process.exit(0);
