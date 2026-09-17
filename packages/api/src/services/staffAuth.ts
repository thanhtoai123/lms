import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { users, type Database } from "@satarobo/db";
import { maskEmail } from "./staffAuthHelpers";
import type { ProtectedContext } from "../trpc";
import { requirePermission } from "../trpc";
import { queueEmail } from "./admin";
import { writeAudit } from "./audit";

type Db = ProtectedContext["db"];

export function supabaseConfigured() {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
export function supabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Tạo liên kết đặt mật khẩu (mời lần đầu hoặc đặt lại) — trả về đường dẫn trên hệ thống của mình */
async function makeLink(admin: SupabaseClient, email: string, prefer: "invite" | "recovery"): Promise<{ link: string; type: "invite" | "recovery" }> {
  const tryType = async (type: "invite" | "recovery") => {
    const { data, error } = await admin.auth.admin.generateLink({ type, email, options: { redirectTo: `${appUrl()}/dat-mat-khau` } });
    if (error || !data?.properties?.hashed_token) return { error: error?.message ?? "Không tạo được liên kết" };
    return { link: `${appUrl()}/dat-mat-khau?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=${type}`, type };
  };
  let r = await tryType(prefer);
  if ("error" in r && prefer === "invite") r = await tryType("recovery");
  if ("error" in r) throw new Error(r.error);
  return r as { link: string; type: "invite" | "recovery" };
}

/** Quản trị gửi lời mời / đặt lại mật khẩu cho nhân sự */
export async function sendLoginLink(ctx: ProtectedContext, input: { userId: string }) {
  requirePermission(ctx, "system:update");
  const u = await ctx.db.query.users.findFirst({ where: eq(users.id, input.userId) });
  if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Không có tài khoản" });
  if (!u.isActive || u.lockedAt) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tài khoản đang khoá — mở khoá trước" });
  const admin = supabaseAdmin();
  if (!admin) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Chưa cấu hình Supabase (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)" });
  const r = await makeLink(admin, u.email, u.authSubject ? "recovery" : "invite").catch((e: Error) => {
    throw new TRPCError({ code: "BAD_GATEWAY", message: `Supabase: ${e.message.slice(0, 200)}` });
  });
  if (r.type === "invite") await queueEmail(ctx.db, { to: u.email, event: "STAFF_WELCOME", vars: { ten: u.fullName, email: u.email, link: r.link }, relatedType: "user", relatedId: u.id, createdBy: ctx.user.id });
  else await queueEmail(ctx.db, { to: u.email, event: "PASSWORD_RESET", vars: { ten: u.fullName, link: r.link, het_han: "sau 1 giờ" }, relatedType: "user", relatedId: u.id, createdBy: ctx.user.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "system", entity: "users", entityId: u.id, after: { loginLink: r.type }, ip: ctx.ip });
  return { sent: true, type: r.type, to: maskEmail(u.email) };
}

/** Nhân sự tự yêu cầu đặt lại mật khẩu — luôn trả lời chung, không tiết lộ email có tồn tại */
export async function requestPasswordReset(database: Database, input: { email: string }) {
  const db = database as unknown as Db;
  const generic = { ok: true as const, message: "Nếu email thuộc tài khoản nhân sự đang hoạt động, liên kết đặt lại mật khẩu đã được gửi." };
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return generic;
  const u = (await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1))[0];
  const admin = supabaseAdmin();
  if (!u || !u.isActive || u.lockedAt || !admin) return generic;
  try {
    const r = await makeLink(admin, u.email, "recovery");
    await queueEmail(db, { to: u.email, event: "PASSWORD_RESET", vars: { ten: u.fullName, link: r.link, het_han: "sau 1 giờ" }, relatedType: "user", relatedId: u.id });
  } catch (e) {
    console.error("[password reset]", (e as Error).message);
  }
  return generic;
}

export function authStatus() {
  return { supabase: supabaseConfigured(), adminKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY, appUrl: appUrl(), mfaRoles: (process.env.REQUIRE_MFA_ROLES ?? "SUPER_ADMIN") };
}
