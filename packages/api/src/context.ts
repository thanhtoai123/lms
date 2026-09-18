import { createClient } from "@supabase/supabase-js";
import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { getDb, users, userRoles, teachers, parents, staff, staffDeployments, userGroups, userGroupMembers, userGroupPermissions, tenants, tenantSettings, withDbErrors, type Database } from "@satarobo/db";
import {
  decodeJwtPayload, mfaRequiredRoles, mfaState, activeRoleAssignments, widenByDeployments, tenantScope, withSettingsDefaults,
  devActorAllowed, normalizeDevActor, DEV_ACTOR_HEADER,
  type Actor, type Permission, type TenantType, type TenantStatus, type TenantSettings,
} from "@satarobo/core";

/** Một trung tâm (tenant) kèm tuỳ chọn quyền riêng tư — nạp sẵn cho mỗi lượt gọi */
export interface TenantRuntime {
  id: string;
  code: string;
  name: string;
  type: TenantType;
  status: TenantStatus;
  isDefault: boolean;
  settings: TenantSettings;
}

export interface Context {
  db: Database;
  actor: Actor | null;
  /** Hồ sơ người dùng đăng nhập (đã rút gọn) */
  user: { id: string; email: string; fullName: string } | null;
  ip?: string;
  /** Cách đăng nhập + trạng thái xác thực 2 lớp */
  auth?: { via: "supabase" | "dev"; aal: string | null; mfa: { required: boolean; satisfied: boolean } };
  /** Trung tâm (tenant) của người đăng nhập */
  tenantId: string | null;
  /** Các tenantId người này được thấy dữ liệu — dùng cho `tenantCond(ctx, bang)` */
  tenantIds: string[];
  /** Toàn bộ tenant kèm cấu hình quyền riêng tư (bảng nhỏ, nạp một lần mỗi lượt gọi) */
  tenants: TenantRuntime[];
}

/**
 * Nạp danh sách tenant + cấu hình quyền riêng tư (đã điền khuyết theo loại tenant).
 * Chưa chạy migration bảng `tenants` → trả danh sách rỗng: hệ thống chạy y như trước khi có nhượng quyền.
 */
export async function loadTenants(db: Database): Promise<TenantRuntime[]> {
  try {
    return await readTenants(db);
  } catch {
    return [];
  }
}

async function readTenants(db: Database): Promise<TenantRuntime[]> {
  const rows = await db
    .select({
      id: tenants.id, code: tenants.code, name: tenants.name, type: tenants.type, status: tenants.status, isDefault: tenants.isDefault,
      hoSeesPii: tenantSettings.hoSeesPii, hoSeesFinanceDetail: tenantSettings.hoSeesFinanceDetail,
      dataRetentionYears: tenantSettings.dataRetentionYears, allowCrossCenterTransfer: tenantSettings.allowCrossCenterTransfer,
    })
    .from(tenants)
    .leftJoin(tenantSettings, eq(tenantSettings.tenantId, tenants.id));
  return rows.map((r) => ({
    id: r.id, code: r.code, name: r.name, type: r.type, status: r.status, isDefault: r.isDefault,
    settings: withSettingsDefaults(r.type, r.hoSeesPii === null ? null : {
      hoSeesPii: r.hoSeesPii, hoSeesFinanceDetail: r.hoSeesFinanceDetail!,
      dataRetentionYears: r.dataRetentionYears!, allowCrossCenterTransfer: r.allowCrossCenterTransfer!,
    }),
  }));
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

  // Dev: chỉ nhận tài khoản mẫu chọn ở trang /login (cookie x-dev-actor) — không tự đăng nhập ngầm.
  // KHÔNG BAO GIỜ nhận khi NODE_ENV=production: không còn cửa hậu bật lại bằng biến môi trường.
  if (!email && devActorAllowed(process.env)) {
    email = normalizeDevActor(opts.headers.get(DEV_ACTOR_HEADER));
  }

  const emptyTenant = { tenantId: null, tenantIds: [] as string[], tenants: [] as TenantRuntime[] };
  if (!email) return { db, actor: null, user: null, ip: opts.ip, ...emptyTenant };

  // Truy vấn ĐẦU TIÊN chạm CSDL: nếu Postgres chưa chạy thì báo bằng một câu tiếng Việt rõ ràng
  // thay vì ném nguyên câu SQL kèm tên mọi cột ra màn hình lỗi.
  const u = await withDbErrors(() => (authSubject
    ? db.query.users.findFirst({ where: eq(users.authSubject, authSubject) })
    : db.query.users.findFirst({ where: eq(users.email, email) })));
  if (!u || !u.isActive) return { db, actor: null, user: null, ip: opts.ip, ...emptyTenant };

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

  // Quyền cấp theo NHÓM người dùng — hợp nhất với quyền vai trò (chỉ cộng thêm, không bớt)
  const groupPerms = await db
    .select({ permission: userGroupPermissions.permission, centerId: userGroupPermissions.centerId, groupCenterId: userGroups.centerId, source: userGroups.name })
    .from(userGroupMembers)
    .innerJoin(userGroupPermissions, eq(userGroupPermissions.groupId, userGroupMembers.groupId))
    .innerJoin(userGroups, eq(userGroups.id, userGroupMembers.groupId))
    .where(eq(userGroupMembers.userId, u.id));

  const actor: Actor = {
    userId: u.id,
    personId: teacher?.id ?? parent?.id ?? null,
    assignments,
    extraPermissions: groupPerms.map((g) => ({
      permission: g.permission as Permission,
      // quyền của nhóm gắn cơ sở thì chỉ có hiệu lực ở cơ sở đó; nhóm toàn hệ thống thì theo dòng quyền
      centerId: g.centerId ?? g.groupCenterId ?? null,
      source: g.source,
    })),
  };
  const via = authSubject ? "supabase" as const : "dev" as const;
  const mfa = mfaState({ roles: actor.assignments.map((a) => a.role), required: mfaRequiredRoles(process.env.REQUIRE_MFA_ROLES), viaSupabase: via === "supabase", aal });

  // Trung tâm (tenant) của người đăng nhập; tài khoản cũ chưa gắn tenant → tenant mặc định của chuỗi
  const allTenants = await loadTenants(db);
  const tenantId = u.tenantId ?? allTenants.find((t) => t.isDefault)?.id ?? null;
  const tenantIds = tenantScope({ tenantId, assignments: actor.assignments }, allTenants);

  return {
    db, actor, user: { id: u.id, email: u.email, fullName: u.fullName }, ip: opts.ip, auth: { via, aal, mfa },
    tenantId, tenantIds, tenants: allTenants,
  };
}
