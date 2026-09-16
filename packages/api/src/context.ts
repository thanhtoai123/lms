import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { getDb, users, userRoles, teachers, parents, type Database } from "@satarobo/db";
import type { Actor } from "@satarobo/core";

export interface Context {
  db: Database;
  actor: Actor | null;
  /** Hồ sơ người dùng đăng nhập (đã rút gọn) */
  user: { id: string; email: string; fullName: string } | null;
  ip?: string;
}

/**
 * Xác thực: ưu tiên Supabase JWT (Authorization: Bearer <access_token>),
 * hoặc cookie x-dev-actor (tài khoản mẫu chọn ở /login) khi ALLOW_DEV_ACTOR=1.
 */
export async function createContext(opts: { headers: Headers; ip?: string }): Promise<Context> {
  const db = getDb();
  const auth = opts.headers.get("authorization");
  let email: string | null = null;
  let authSubject: string | null = null;

  if (auth?.startsWith("Bearer ") && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await supabase.auth.getUser(auth.slice(7));
    if (data.user) {
      authSubject = data.user.id;
      email = data.user.email ?? null;
    }
  }

  // Dev: chỉ nhận tài khoản mẫu chọn ở trang /login (cookie x-dev-actor) — không tự đăng nhập ngầm
  if (!email && process.env.ALLOW_DEV_ACTOR === "1") {
    email = opts.headers.get("x-dev-actor");
  }

  if (!email) return { db, actor: null, user: null, ip: opts.ip };

  const u = authSubject
    ? await db.query.users.findFirst({ where: eq(users.authSubject, authSubject) })
    : await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!u || !u.isActive) return { db, actor: null, user: null, ip: opts.ip };

  // Liên kết auth_subject lần đầu đăng nhập qua Supabase
  if (authSubject && !u.authSubject) await db.update(users).set({ authSubject, lastLoginAt: new Date() }).where(eq(users.id, u.id));

  const roles = await db.select({ role: userRoles.role, centerId: userRoles.centerId }).from(userRoles).where(eq(userRoles.userId, u.id));
  const teacher = await db.query.teachers.findFirst({ where: eq(teachers.userId, u.id), columns: { id: true } });
  const parent = teacher ? null : await db.query.parents.findFirst({ where: eq(parents.userId, u.id), columns: { id: true } });

  const actor: Actor = {
    userId: u.id,
    personId: teacher?.id ?? parent?.id ?? null,
    assignments: roles.map((r) => ({ role: r.role, centerId: r.centerId })),
  };
  return { db, actor, user: { id: u.id, email: u.email, fullName: u.fullName }, ip: opts.ip };
}
