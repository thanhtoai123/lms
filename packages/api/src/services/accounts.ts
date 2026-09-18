import { and, eq, inArray, sql, asc, desc, ilike, or, gte, lte, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { users, userRoles, centers, teachers, auditLog } from "@satarobo/db";
import {
  ROLES, ROLE_LABEL_VI, STAFF_ROLES, ASSIGNABLE_ROLES, GLOBAL_ROLES, PERMISSION_RESOURCES,
  validateRoleGrant, validateRoleRevoke, validateLock, accessLevel, permissionsOf, authorize,
  maskPii, maskPiiText, maskEmailValue, hasPii, validateRevealReason,
  type Role,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { supabaseAdmin } from "./staffAuth";
import { writeAudit } from "./audit";
import { tenantCond, assertTenant, redact } from "./tenantScope";

type Db = ProtectedContext["db"];

function fail(errs: string[]) {
  if (errs.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: errs.join("; ") });
}

async function superAdminCount(db: Db, activeOnly: boolean) {
  const conds = [eq(userRoles.role, "SUPER_ADMIN")];
  if (activeOnly) conds.push(eq(users.isActive, true));
  const [r] = await db.select({ n: sql<number>`count(distinct ${userRoles.userId})::int` }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId)).where(and(...conds));
  return r?.n ?? 0;
}

/* ------------------------------------------------------------------ */
/* Tài khoản                                                           */
/* ------------------------------------------------------------------ */

export async function listUsers(ctx: ProtectedContext, input: { q?: string; role?: Role; centerId?: string; status?: "active" | "locked"; page?: number; pageSize?: number }) {
  requirePermission(ctx, "system:read");
  const pageSize = Math.min(100, input.pageSize ?? 30);
  const page = Math.max(1, input.page ?? 1);
  const conds = [tenantCond(ctx, users)];
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`;
    conds.push(or(ilike(users.fullName, q), ilike(users.email, q), ilike(users.phone, q))!);
  }
  if (input.status === "active") conds.push(eq(users.isActive, true));
  if (input.status === "locked") conds.push(eq(users.isActive, false));
  const roleFilter = [];
  if (input.role) roleFilter.push(sql`ur.role = ${input.role}`);
  if (input.centerId) roleFilter.push(sql`ur.center_id = ${input.centerId}`);
  if (roleFilter.length) {
    conds.push(sql`exists (select 1 from ${userRoles} ur where ur.user_id = ${sql.raw('"users"."id"')} and ${sql.join(roleFilter, sql` and `)})`);
  }
  const where = conds.length ? and(...conds) : undefined;
  const [tot] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(users).where(where);
  const rows = await ctx.db
    .select({ id: users.id, email: users.email, fullName: users.fullName, phone: users.phone, isActive: users.isActive, lastLoginAt: users.lastLoginAt, lockedReason: users.lockedReason, createdAt: users.createdAt, tenantId: users.tenantId, hasAuth: sql<boolean>`${users.authSubject} is not null` })
    .from(users).where(where).orderBy(asc(users.fullName)).limit(pageSize).offset((page - 1) * pageSize);
  const ids = rows.map((r) => r.id);
  const roles = ids.length
    ? await ctx.db.select({ id: userRoles.id, userId: userRoles.userId, role: userRoles.role, centerId: userRoles.centerId, centerCode: centers.code })
        .from(userRoles).leftJoin(centers, eq(centers.id, userRoles.centerId)).where(inArray(userRoles.userId, ids)).orderBy(asc(userRoles.createdAt))
    : [];
  const [counts] = await ctx.db.select({
    total: sql<number>`count(*)::int`,
    active: sql<number>`count(*) filter (where ${users.isActive})::int`,
    locked: sql<number>`count(*) filter (where not ${users.isActive})::int`,
  }).from(users).where(tenantCond(ctx, users));
  return {
    total: tot?.n ?? 0, page, pageSize,
    counts: counts ?? { total: 0, active: 0, locked: 0 },
    items: rows.map((r) => redact(ctx, { ...r, roles: roles.filter((x) => x.userId === r.id).map((x) => ({ ...x, label: ROLE_LABEL_VI[x.role] })) }, r.tenantId)),
  };
}

export async function getUser(ctx: ProtectedContext, id: string) {
  requirePermission(ctx, "system:read");
  const u = await ctx.db.query.users.findFirst({ where: eq(users.id, id) });
  if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy tài khoản" });
  assertTenant(ctx, u, "Tài khoản");
  const [roles, teacher, history, acted] = await Promise.all([
    ctx.db.select({ id: userRoles.id, role: userRoles.role, centerId: userRoles.centerId, centerCode: centers.code, centerName: centers.name, createdAt: userRoles.createdAt, grantedByName: sql<string | null>`(select full_name from ${users} g where g.id = ${userRoles.grantedBy})` })
      .from(userRoles).leftJoin(centers, eq(centers.id, userRoles.centerId)).where(eq(userRoles.userId, id)).orderBy(asc(userRoles.createdAt)),
    ctx.db.query.teachers.findFirst({ where: eq(teachers.userId, id), columns: { id: true, code: true, fullName: true } }),
    ctx.db.select({ id: auditLog.id, action: auditLog.action, entity: auditLog.entity, before: auditLog.before, after: auditLog.after, reason: auditLog.reason, createdAt: auditLog.createdAt, actorName: users.fullName })
      .from(auditLog).leftJoin(users, eq(users.id, auditLog.actorId))
      .where(and(eq(auditLog.module, "system"), inArray(auditLog.entity, ["users", "user_roles"]), eq(auditLog.entityId, id)))
      .orderBy(desc(auditLog.createdAt)).limit(30),
    ctx.db.select({ n: sql<number>`count(*)::int`, last: sql<Date | null>`max(${auditLog.createdAt})` }).from(auditLog).where(eq(auditLog.actorId, id)),
  ]);
  const { authSubject, ...rest } = u;
  return {
    ...rest,
    hasAuth: !!authSubject,
    isSelf: id === ctx.user.id,
    roles: roles.map((r) => ({ ...r, label: ROLE_LABEL_VI[r.role] })),
    teacher: teacher ?? null,
    history,
    activity: { actions: acted[0]?.n ?? 0, lastActionAt: acted[0]?.last ?? null },
  };
}

export async function roleOptions(ctx: ProtectedContext) {
  requirePermission(ctx, "system:read");
  const cs = await ctx.db.select({ id: centers.id, code: centers.code, name: centers.name }).from(centers).where(tenantCond(ctx, centers)).orderBy(asc(centers.code));
  return {
    roles: ASSIGNABLE_ROLES.map((r) => ({ role: r, label: ROLE_LABEL_VI[r], global: GLOBAL_ROLES.includes(r) })),
    centers: cs,
  };
}

function normEmail(e: string) {
  return e.trim().toLowerCase();
}

export async function createUser(ctx: ProtectedContext, input: { email: string; fullName: string; phone?: string | null; roles: { role: Role; centerId: string | null }[] }) {
  requirePermission(ctx, "system:create");
  const email = normEmail(input.email);
  const dup = (await ctx.db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1))[0];
  if (dup) throw new TRPCError({ code: "CONFLICT", message: "Email đã có tài khoản" });
  if (!input.roles.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Chọn ít nhất một vai trò" });
  const errs = input.roles.flatMap((r) => validateRoleGrant({ actor: ctx.actor, role: r.role, centerId: r.centerId, targetUserId: "new" }));
  fail([...new Set(errs)]);
  const id = await ctx.db.transaction(async (tx) => {
    // Tài khoản mới thuộc đúng trung tâm (tenant) của người tạo
    const [u] = await tx.insert(users).values({ email, fullName: input.fullName.trim(), phone: input.phone?.trim() || null, tenantId: ctx.tenantId }).returning({ id: users.id });
    const uniq = new Map(input.roles.map((r) => [`${r.role}:${r.centerId ?? ""}`, r]));
    await tx.insert(userRoles).values([...uniq.values()].map((r) => ({ userId: u!.id, role: r.role, centerId: r.centerId, grantedBy: ctx.user.id })));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "system", entity: "users", entityId: u!.id, after: { email, fullName: input.fullName, roles: [...uniq.values()] }, ip: ctx.ip });
    return u!.id;
  });
  return { id };
}

export async function updateUser(ctx: ProtectedContext, input: { id: string; fullName: string; phone?: string | null; email: string }) {
  requirePermission(ctx, "system:update");
  const u = await ctx.db.query.users.findFirst({ where: eq(users.id, input.id) });
  if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy tài khoản" });
  const email = normEmail(input.email);
  if (email !== u.email.toLowerCase()) {
    if (u.authSubject) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tài khoản đã liên kết đăng nhập — không đổi email tại đây" });
    const dup = (await ctx.db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1))[0];
    if (dup) throw new TRPCError({ code: "CONFLICT", message: "Email đã có tài khoản" });
  }
  const after = { fullName: input.fullName.trim(), phone: input.phone?.trim() || null, email };
  await ctx.db.transaction(async (tx) => {
    await tx.update(users).set(after).where(eq(users.id, u.id));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "system", entity: "users", entityId: u.id, before: { fullName: u.fullName, phone: u.phone, email: u.email }, after, ip: ctx.ip });
  });
  return { ok: true };
}

export async function grantRole(ctx: ProtectedContext, input: { userId: string; role: Role; centerId: string | null }) {
  requirePermission(ctx, "system:update");
  const u = await ctx.db.query.users.findFirst({ where: eq(users.id, input.userId), columns: { id: true } });
  if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy tài khoản" });
  fail(validateRoleGrant({ actor: ctx.actor, role: input.role, centerId: input.centerId, targetUserId: input.userId }));
  const exists = await ctx.db.query.userRoles.findFirst({
    where: and(eq(userRoles.userId, input.userId), eq(userRoles.role, input.role), input.centerId ? eq(userRoles.centerId, input.centerId) : isNull(userRoles.centerId)),
  });
  if (exists) throw new TRPCError({ code: "CONFLICT", message: "Tài khoản đã có vai trò này ở phạm vi này" });
  await ctx.db.transaction(async (tx) => {
    const [r] = await tx.insert(userRoles).values({ userId: input.userId, role: input.role, centerId: input.centerId, grantedBy: ctx.user.id }).returning({ id: userRoles.id });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "system", entity: "user_roles", entityId: input.userId, after: { roleId: r!.id, role: input.role, centerId: input.centerId }, ip: ctx.ip });
  });
  return { ok: true };
}

export async function revokeRole(ctx: ProtectedContext, input: { roleId: string; reason?: string | null }) {
  requirePermission(ctx, "system:update");
  const r = await ctx.db.query.userRoles.findFirst({ where: eq(userRoles.id, input.roleId) });
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy vai trò" });
  const remaining = await superAdminCount(ctx.db, false);
  fail(validateRoleRevoke({ actor: ctx.actor, role: r.role, targetUserId: r.userId, remainingSuperAdmins: remaining }));
  const [left] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(userRoles).where(eq(userRoles.userId, r.userId));
  if ((left?.n ?? 0) <= 1) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tài khoản phải còn ít nhất một vai trò — muốn ngừng dùng thì khoá tài khoản" });
  await ctx.db.transaction(async (tx) => {
    await tx.delete(userRoles).where(eq(userRoles.id, r.id));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "DELETE", module: "system", entity: "user_roles", entityId: r.userId, before: { roleId: r.id, role: r.role, centerId: r.centerId }, reason: input.reason ?? null, ip: ctx.ip });
  });
  return { ok: true };
}

export async function setUserLock(ctx: ProtectedContext, input: { userId: string; lock: boolean; reason?: string | null }) {
  requirePermission(ctx, "system:update");
  const u = await ctx.db.query.users.findFirst({ where: eq(users.id, input.userId) });
  if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy tài khoản" });
  if (u.isActive === !input.lock) return { changed: false };
  const isSA = !!(await ctx.db.query.userRoles.findFirst({ where: and(eq(userRoles.userId, u.id), eq(userRoles.role, "SUPER_ADMIN")) }));
  fail(validateLock({ actor: ctx.actor, targetUserId: u.id, targetIsSuperAdmin: isSA, activeSuperAdmins: await superAdminCount(ctx.db, true), lock: input.lock, reason: input.reason }));
  await ctx.db.transaction(async (tx) => {
    await tx.update(users).set(input.lock ? { isActive: false, lockedAt: new Date(), lockedReason: input.reason!.trim() } : { isActive: true, lockedAt: null, lockedReason: null }).where(eq(users.id, u.id));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "system", entity: "users", entityId: u.id, before: { isActive: u.isActive }, after: { isActive: !input.lock }, reason: input.reason ?? null, ip: ctx.ip });
  });
  // Khoá cả tài khoản đăng nhập Supabase (chặn làm mới phiên); mở khoá thì gỡ chặn
  let authSynced: boolean | null = null;
  const admin = supabaseAdmin();
  if (admin && u.authSubject) {
    const { error } = await admin.auth.admin.updateUserById(u.authSubject, { ban_duration: input.lock ? "876000h" : "none" });
    authSynced = !error;
    if (error) console.error("[lock supabase]", error.message);
  }
  return { changed: true, authSynced };
}

/* ------------------------------------------------------------------ */
/* Vai trò & quyền                                                     */
/* ------------------------------------------------------------------ */

export async function rolesMatrix(ctx: ProtectedContext) {
  requirePermission(ctx, "system:read");
  const counts = await ctx.db.select({ role: userRoles.role, n: sql<number>`count(distinct ${userRoles.userId})::int` }).from(userRoles).groupBy(userRoles.role);
  const cmap = new Map(counts.map((c) => [c.role, c.n]));
  const roles = ROLES.map((r) => ({
    role: r,
    label: ROLE_LABEL_VI[r],
    scope: GLOBAL_ROLES.includes(r) ? "Toàn hệ thống" : STAFF_ROLES.includes(r) ? "Theo cơ sở" : "Ứng dụng PH/HV",
    staff: STAFF_ROLES.includes(r),
    users: cmap.get(r) ?? 0,
    permissions: [...permissionsOf(r)],
    cells: Object.fromEntries(PERMISSION_RESOURCES.map((res) => [res.key, accessLevel(r, res.key)])),
  }));
  return { resources: PERMISSION_RESOURCES, roles };
}

/* ------------------------------------------------------------------ */
/* Audit Log                                                           */
/* ------------------------------------------------------------------ */

export interface AuditQuery { module?: string; entity?: string; action?: string; actorId?: string; entityId?: string; from?: string; to?: string; q?: string; page?: number; pageSize?: number }

export async function listAudit(ctx: ProtectedContext, input: AuditQuery) {
  requirePermission(ctx, "audit:read");
  const pageSize = Math.min(100, input.pageSize ?? 50);
  const page = Math.max(1, input.page ?? 1);
  // Nhật ký chỉ hiển thị trong phạm vi trung tâm (tenant) của người xem
  const conds = [tenantCond(ctx, auditLog)];
  if (input.module) conds.push(eq(auditLog.module, input.module));
  if (input.entity) conds.push(eq(auditLog.entity, input.entity));
  if (input.action) conds.push(eq(auditLog.action, input.action));
  if (input.actorId) conds.push(eq(auditLog.actorId, input.actorId));
  if (input.entityId) conds.push(eq(auditLog.entityId, input.entityId));
  if (input.from) conds.push(gte(auditLog.createdAt, new Date(`${input.from}T00:00:00+07:00`)));
  if (input.to) conds.push(lte(auditLog.createdAt, new Date(`${input.to}T23:59:59.999+07:00`)));
  if (input.q?.trim()) conds.push(or(ilike(auditLog.reason, `%${input.q.trim()}%`), sql`${auditLog.after}::text ilike ${"%" + input.q.trim() + "%"}`, sql`${auditLog.before}::text ilike ${"%" + input.q.trim() + "%"}`)!);
  const where = conds.length ? and(...conds) : undefined;
  const [tot] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(where);
  const rows = await ctx.db
    .select({ id: auditLog.id, action: auditLog.action, module: auditLog.module, entity: auditLog.entity, entityId: auditLog.entityId, before: auditLog.before, after: auditLog.after, reason: auditLog.reason, ip: auditLog.ip, createdAt: auditLog.createdAt, actorId: auditLog.actorId, actorName: users.fullName, actorEmail: users.email })
    .from(auditLog).leftJoin(users, eq(users.id, auditLog.actorId))
    .where(where).orderBy(desc(auditLog.createdAt)).limit(pageSize).offset((page - 1) * pageSize);

  // PII che MẶC ĐỊNH ở lớp đọc: SĐT `09***67`, email `a***@x.com`.
  // Muốn xem đầy đủ phải bấm "Xem đầy đủ" (break-glass: bắt buộc lý do + ghi audit PII_REVEAL).
  const canReveal = authorize(ctx.actor, "audit:view_pii", {}).allowed;
  const items = rows.map((r) => ({
    ...r,
    before: maskPii(r.before),
    after: maskPii(r.after),
    reason: r.reason ? maskPiiText(r.reason) : r.reason,
    actorEmail: r.actorEmail ? maskEmailValue(r.actorEmail) : r.actorEmail,
    masked: hasPii(r.before) || hasPii(r.after) || hasPii(r.reason ?? "") || hasPii(r.actorEmail ?? ""),
  }));
  return { total: tot?.n ?? 0, page, pageSize, canReveal, items };
}

/**
 * "Xem đầy đủ" một dòng nhật ký — break-glass:
 * bắt buộc lý do, chỉ vai trò có `audit:view_pii`, và mỗi lần xem ghi một bản ghi audit `PII_REVEAL`.
 */
export async function revealAuditEntry(ctx: ProtectedContext, input: { id: string; reason: string }) {
  requirePermission(ctx, "audit:read");
  if (!authorize(ctx.actor, "audit:view_pii", {}).allowed) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Không có quyền xem đầy đủ dữ liệu cá nhân trong nhật ký" });
  }
  const err = validateRevealReason(input.reason);
  if (err) throw new TRPCError({ code: "BAD_REQUEST", message: err });

  return ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const [row] = await db
      .select({ id: auditLog.id, action: auditLog.action, module: auditLog.module, entity: auditLog.entity, entityId: auditLog.entityId, before: auditLog.before, after: auditLog.after, reason: auditLog.reason, ip: auditLog.ip, createdAt: auditLog.createdAt, actorId: auditLog.actorId, tenantId: auditLog.tenantId, actorName: users.fullName, actorEmail: users.email })
      .from(auditLog).leftJoin(users, eq(users.id, auditLog.actorId)).where(eq(auditLog.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy dòng nhật ký" });
    // Nhật ký của trung tâm khác không mở "Xem đầy đủ" được
    assertTenant(ctx, row, "Dòng nhật ký");
    await writeAudit(db, {
      actorId: ctx.user.id, action: "PII_REVEAL", module: "system", entity: "audit_log", entityId: row.id,
      after: { xem: `${row.module}/${row.entity}`, banGhi: row.entityId, luc: row.createdAt.toISOString() },
      reason: input.reason.trim(), ip: ctx.ip,
    });
    return { ...row, masked: false };
  });
}

export async function auditFilterOptions(ctx: ProtectedContext) {
  requirePermission(ctx, "audit:read");
  const [mods, ents, acts, actors] = await Promise.all([
    ctx.db.selectDistinct({ v: auditLog.module }).from(auditLog).where(tenantCond(ctx, auditLog)).orderBy(asc(auditLog.module)),
    ctx.db.selectDistinct({ v: auditLog.entity, m: auditLog.module }).from(auditLog).where(tenantCond(ctx, auditLog)).orderBy(asc(auditLog.entity)),
    ctx.db.selectDistinct({ v: auditLog.action }).from(auditLog).where(tenantCond(ctx, auditLog)).orderBy(asc(auditLog.action)),
    ctx.db.select({ id: users.id, name: users.fullName }).from(users).where(and(tenantCond(ctx, users), sql`exists (select 1 from ${auditLog} a where a.actor_id = ${sql.raw('"users"."id"')})`)).orderBy(asc(users.fullName)),
  ]);
  return { modules: mods.map((m) => m.v), entities: ents, actions: acts.map((a) => a.v), actors };
}

