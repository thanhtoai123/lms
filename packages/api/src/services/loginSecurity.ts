import { createHmac } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { loginEvents, users, type Database } from "@satarobo/db";
import {
  authorizeGlobal, hasPermission, loginLockDecision, maskIp, deviceLabel, securityFindings, mfaRequiredRoles,
  LOGIN_IP_WINDOW_MIN, LOGIN_RESULT_LABEL, DORMANT_DAYS, type LoginResult,
} from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { getOps } from "./opsSettings";
import { maskEmail } from "./staffAuthHelpers";
import { supabaseConfigured } from "./staffAuth";
import { writeAudit } from "./audit";

type Db = ProtectedContext["db"];
const asDb = (d: Database | Db) => d as unknown as Db;

const norm = (e: string) => e.trim().toLowerCase().slice(0, 200);
export function emailHash(email: string) {
  return createHmac("sha256", process.env.OTP_PEPPER || "login-events").update(`login|${norm(email)}`).digest("hex");
}
const clip = (s: string | null | undefined, n: number) => (s ? s.slice(0, n) : null);
const firstIp = (ip: string | null | undefined) => clip(ip?.split(",")[0]?.trim(), 64);

/** Trước khi gọi Supabase: tài khoản / IP có đang bị khoá tạm không */
export async function loginPrecheck(database: Database, input: { email: string; ip: string | null }) {
  const db = asDb(database);
  const ops = await getOps(db);
  const h = emailHash(input.email);
  const ip = firstIp(input.ip);
  const r = (await db.execute(sql`
    with last_ok as (
      select coalesce(max(created_at), 'epoch'::timestamptz) as t from login_events where email_hash = ${h} and result in ('success', 'admin_unlock', 'password_set')
    )
    select
      (select count(*)::int from login_events, last_ok where email_hash = ${h} and result = 'bad_password'
         and created_at > greatest(last_ok.t, now() - make_interval(mins => ${ops.staffLoginLockMinutes}))) as fails,
      (select max(created_at) from login_events where email_hash = ${h} and result = 'bad_password') as "lastFailAt",
      (select count(*)::int from login_events where ${ip}::text is not null and ip = ${ip} and result = 'bad_password'
         and created_at > now() - make_interval(mins => ${LOGIN_IP_WINDOW_MIN})) as "ipFails"
  `)) as unknown as { fails: number; lastFailAt: string | Date | null; ipFails: number }[];
  const x = r[0] ?? { fails: 0, lastFailAt: null, ipFails: 0 };
  return loginLockDecision({
    fails: Number(x.fails), ipFails: Number(x.ipFails), lastFailAt: x.lastFailAt ? new Date(x.lastFailAt) : null,
    now: new Date(), maxFails: ops.staffLoginMaxFails, lockMinutes: ops.staffLoginLockMinutes,
  });
}

export async function recordLogin(database: Database, input: { email?: string | null; userId?: string | null; result: LoginResult; ip?: string | null; userAgent?: string | null }) {
  const db = asDb(database);
  try {
    let email = input.email ?? null;
    let userId = input.userId ?? null;
    if (!email && userId) email = (await db.query.users.findFirst({ where: eq(users.id, userId), columns: { email: true } }))?.email ?? null;
    if (!email) return;
    if (!userId) userId = (await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${norm(email)}`).limit(1))[0]?.id ?? null;
    await db.insert(loginEvents).values({
      userId, emailHash: emailHash(email), emailMasked: maskEmail(norm(email)), result: input.result,
      ip: firstIp(input.ip), userAgent: clip(input.userAgent, 300),
    });
    if (userId && input.result === "success") await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  } catch (e) {
    console.error("[login-events]", (e as Error).message);
  }
}

/** Người dùng có email này và đang bị khoá / ngưng? (không gọi Supabase cho tài khoản đã khoá) */
export async function staffBlocked(database: Database, email: string) {
  const u = (await asDb(database).select({ isActive: users.isActive, lockedAt: users.lockedAt }).from(users).where(sql`lower(${users.email}) = ${norm(email)}`).limit(1))[0];
  return !!u && (!u.isActive || !!u.lockedAt);
}

export async function setMfaEnabled(database: Database, userEmail: string, on: boolean) {
  await asDb(database).update(users).set({ mfaEnabled: on }).where(sql`lower(${users.email}) = ${norm(userEmail)}`);
}

export async function staffIdleMinutes(database: Database) {
  return (await getOps(asDb(database))).staffIdleMinutes;
}

const view = (e: typeof loginEvents.$inferSelect & { name?: string | null }) => ({
  id: e.id, at: e.createdAt, result: e.result, label: LOGIN_RESULT_LABEL[e.result as LoginResult] ?? e.result,
  failed: e.result === "bad_password" || e.result === "locked_out", ip: maskIp(e.ip), device: deviceLabel(e.userAgent),
  who: e.name ?? e.emailMasked, userId: e.userId,
});

export async function myLoginHistory(ctx: ProtectedContext) {
  const rows = await ctx.db.select().from(loginEvents).where(eq(loginEvents.userId, ctx.user.id)).orderBy(desc(loginEvents.createdAt)).limit(15);
  const u = await ctx.db.query.users.findFirst({ where: eq(users.id, ctx.user.id), columns: { email: true } });
  const failsSinceOk = u ? (await loginPrecheck(ctx.db as unknown as Database, { email: u.email, ip: null })) : null;
  return { items: rows.map(view), lockedNow: failsSinceOk ? !failsSinceOk.allowed : false };
}

export async function userLoginHistory(ctx: ProtectedContext, input: { userId: string }) {
  if (!hasPermission(ctx.actor, "system:read")) throw new TRPCError({ code: "FORBIDDEN", message: "Không có quyền" });
  const rows = await ctx.db.select().from(loginEvents).where(eq(loginEvents.userId, input.userId)).orderBy(desc(loginEvents.createdAt)).limit(20);
  return rows.map(view);
}

/** Quản trị mở khoá tạm: ghi mốc "admin_unlock" — các lần sai trước mốc không còn tính (không xoá nhật ký) */
export async function clearLoginLock(ctx: ProtectedContext, input: { userId: string }) {
  if (!authorizeGlobal(ctx.actor, "system:update")) throw new TRPCError({ code: "FORBIDDEN", message: "Chỉ quản trị Hội sở mở khoá đăng nhập" });
  const u = await ctx.db.query.users.findFirst({ where: eq(users.id, input.userId) });
  if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Không có tài khoản" });
  await recordLogin(ctx.db as unknown as Database, { email: u.email, userId: u.id, result: "admin_unlock", ip: ctx.ip ?? null });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "system", entity: "users", entityId: u.id, after: { loginLockCleared: true }, ip: ctx.ip });
  return { ok: true };
}

export async function securityOverview(ctx: ProtectedContext) {
  if (!authorizeGlobal(ctx.actor, "system:read")) throw new TRPCError({ code: "FORBIDDEN", message: "Chỉ quản trị Hội sở xem trang này" });
  const ops = await getOps(ctx.db);
  const c = ((await ctx.db.execute(sql`
    select
      (select count(distinct u.id)::int from users u join user_roles r on r.user_id = u.id where r.role = 'SUPER_ADMIN' and u.is_active and u.locked_at is null) as "superAdmins",
      (select count(distinct u.id)::int from users u join user_roles r on r.user_id = u.id where r.role = 'SUPER_ADMIN' and u.is_active and u.locked_at is null and not u.mfa_enabled) as "superNoMfa",
      (select count(distinct u.id)::int from users u join user_roles r on r.user_id = u.id where u.is_active and u.locked_at is null) as "activeStaff",
      (select count(*)::int from users u where u.locked_at is not null or not u.is_active) as locked,
      (select count(*)::int from users u where u.mfa_enabled and u.is_active) as "mfaUsers",
      (select count(*)::int from login_events where result = 'bad_password' and created_at > now() - interval '24 hours') as "failed24h",
      (select count(*)::int from login_events where result = 'locked_out' and created_at > now() - interval '24 hours') as "lockouts24h",
      (select count(*)::int from login_events where result = 'success' and created_at > now() - interval '24 hours') as "success24h"
  `)) as unknown as Record<string, number>[])[0] ?? {};
  const dormant = (await ctx.db.execute(sql`
    select u.id, u.full_name as name, u.last_login_at as "lastLoginAt", u.created_at as "createdAt",
      (select string_agg(distinct r.role::text, ', ') from user_roles r where r.user_id = u.id) as roles
    from users u
    where u.is_active and u.locked_at is null and exists (select 1 from user_roles r where r.user_id = u.id)
      and coalesce(u.last_login_at, u.created_at) < now() - make_interval(days => ${DORMANT_DAYS})
    order by coalesce(u.last_login_at, u.created_at) limit 50
  `)) as unknown as { id: string; name: string; lastLoginAt: string | null; createdAt: string; roles: string }[];
  const topIps = (await ctx.db.execute(sql`
    select ip, count(*)::int as fails, count(distinct email_hash)::int as accounts, max(created_at) as last
    from login_events where result in ('bad_password', 'locked_out') and created_at > now() - interval '24 hours' and ip is not null
    group by ip order by fails desc limit 10
  `)) as unknown as { ip: string; fails: number; accounts: number; last: string }[];
  const recent = await ctx.db.select({ e: loginEvents, name: users.fullName }).from(loginEvents).leftJoin(users, eq(users.id, loginEvents.userId))
    .orderBy(desc(loginEvents.createdAt)).limit(50);
  const mfaRoles = mfaRequiredRoles(process.env.REQUIRE_MFA_ROLES);
  const findings = securityFindings({
    superAdmins: Number(c.superAdmins ?? 0), activeStaff: Number(c.activeStaff ?? 0), dormant: dormant.length, locked: Number(c.locked ?? 0),
    failed24h: Number(c.failed24h ?? 0), lockouts24h: Number(c.lockouts24h ?? 0), mfaRoles: [...mfaRoles],
    supabase: supabaseConfigured(), serviceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY, devActor: process.env.ALLOW_DEV_ACTOR === "1",
    production: process.env.NODE_ENV === "production", idleMinutes: ops.staffIdleMinutes, maxFails: ops.staffLoginMaxFails,
  });
  if (Number(c.superNoMfa ?? 0) > 0 && supabaseConfigured()) findings.unshift({ level: "danger", text: `${c.superNoMfa} tài khoản Quản trị hệ thống chưa bật xác thực 2 lớp.`, href: "/users" });
  return {
    counts: c,
    findings,
    dormant: dormant.map((d) => ({ ...d, lastLoginAt: d.lastLoginAt ? new Date(d.lastLoginAt) : null })),
    topIps: topIps.map((t) => ({ ...t, ip: maskIp(t.ip) })),
    recent: recent.map((r) => view({ ...r.e, name: r.name })),
    policy: { mfaRoles: [...mfaRoles], idleMinutes: ops.staffIdleMinutes, maxFails: ops.staffLoginMaxFails, lockMinutes: ops.staffLoginLockMinutes, dormantDays: DORMANT_DAYS },
  };
}

/** Dọn nhật ký đăng nhập cũ (giữ 1 năm) */
export async function pruneLoginEvents(database: Database) {
  const r = await asDb(database).delete(loginEvents).where(sql`${loginEvents.createdAt} < now() - interval '365 days'`).returning({ id: loginEvents.id });
  return r.length;
}
