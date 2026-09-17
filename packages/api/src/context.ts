import { createClient } from "@supabase/supabase-js";
import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { getDb, users, userRoles, teachers, parents, staff, staffDeployments, type Database } from "@satarobo/db";
import { decodeJwtPayload, mfaRequiredRoles, mfaState, activeRoleAssignments, widenByDeployments, type Actor } from "@satarobo/core";

export interface Context {
  db: Database;
  actor: Actor | null;
  /** Hồ sơ người dùng đăng nhập (đã rút gọn) */
  user: { id: string; email: string; fullName: string } | null;
  ip?: string;
  /** Cách đăng nhập + trạng thái xác thực 2 lớp */
  auth?: { via: "supabase" | "dev"; aal: string | null; mfa: { required: boolean; satisfied: boolean } };
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
  let aal: string | null = null;

  if (auth?.startsWith("Bearer ") && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await supabase.auth.getUser(auth.slice(7));
    if (data.user) {
      authSubject = data.user.id;
      email = data.user.email ?? null;
      aal = decodeJwtPayload(auth.slice(7))?.aal ?? null;
    }
  }

  // Dev: chỉ nhận tài khoản mẫu chọn ở trang /login (cookie x-dev-actor) — không tự đăng nhập ngầm
  // Không bao giờ nhận tài khoản mẫu khi chạy production (trừ khi cố ý bật cho môi trường thử nghiệm)
  const devAllowed = process.env.ALLOW_DEV_ACTOR === "1" && (process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_ACTOR_IN_PRODUCTION === "1");
  if (!email && devAllowed) {
    email = opts.headers.get("x-dev-actor");
  }

  if (!email) return { db, actor: null, user: null, ip: opts.ip };

  const u = authSubject
    ? await db.query.users.findFirst({ where: eq(users.authSubject, authSubject) })
    : await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!u || !u.isActive) return { db, actor: null, user: null, ip: opts.ip };

  // Liên kết auth_subject lần đầu đăng nhập qua Supabase
  if (authSubject && !u.authSubject) await db.update(users).set({ authSubject, lastLoginAt: new Date() }).where(eq(users.id, u.id));
  else if (!u.lastLoginAt || Date.now() - u.lastLoginAt.getTime() > 3_600_000) await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));

  // Ngày hiện tại theo giờ Việt Nam: vai trò hết hiệu lực là quyền tự tắt ngay lần truy cập này
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const roles = await db.select({ role: userRoles.role, centerId: userRoles.centerId, validFrom: userRoles.validFrom, validTo: userRoles.validTo })
    .from(userRoles).where(eq(userRoles.userId, u.id));
  const teacher = await db.query.teachers.findFirst({ where: eq(teachers.userId, u.id), columns: { id: true } });
  const parent = teacher ? null : await db.query.parents.findFirst({ where: eq(parents.userId, u.id), columns: { id: true } });

  let assignments = activeRoleAssignments(roles, today);
  // Điều động tác nghiệp: mở phạm vi dữ liệu của cơ sở được điều động trong đúng khoảng thời gian
  const st = await db.query.staff.findFirst({ where: eq(staff.userId, u.id), columns: { id: true } });
  if (st) {
    const deps = await db.select({ centerId: staffDeployments.centerId, effectiveFrom: staffDeployments.effectiveFrom, effectiveTo: staffDeployments.effectiveTo })
      .from(staffDeployments)
      .where(and(eq(staffDeployments.staffId, st.id), lte(staffDeployments.effectiveFrom, today), or(isNull(staffDeployments.effectiveTo), gte(staffDeployments.effectiveTo, today))));
    if (deps.length) assignments = widenByDeployments(assignments, deps, today);
  }

  const actor: Actor = {
    userId: u.id,
    personId: teacher?.id ?? parent?.id ?? null,
    assignments,
  };
  const via = authSubject ? "supabase" as const : "dev" as const;
  const mfa = mfaState({ roles: actor.assignments.map((a) => a.role), required: mfaRequiredRoles(process.env.REQUIRE_MFA_ROLES), viaSupabase: via === "supabase", aal });
  return { db, actor, user: { id: u.id, email: u.email, fullName: u.fullName }, ip: opts.ip, auth: { via, aal, mfa } };
}
