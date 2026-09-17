/**
 * Phiên đăng nhập nhân sự (Supabase): cookie access token (ngắn hạn) + refresh token (30 ngày), tự làm mới.
 * Dùng được trong proxy.ts, route handler và server action.
 */
import { tokenNeedsRefresh } from "@satarobo/core";

export const ACCESS_COOKIE = "sb-access-token";
export const REFRESH_COOKIE = "sb-refresh-token";
export const REFRESH_DAYS = 30;
/** Mốc thao tác gần nhất (ms) và giới hạn không thao tác (phút) — tự đăng xuất */
export const SEEN_COOKIE = "sr-seen";
export const IDLE_COOKIE = "sr-idle";

export function seenCookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, path: "/", secure: secure(), maxAge: REFRESH_DAYS * 86_400 };
}
/** Có phiên Supabase (cookie) — phiên tài khoản mẫu khi phát triển không áp tự đăng xuất */
export const hasStaffSession = (get: (n: string) => string | undefined) => !!(get(ACCESS_COOKIE) || get(REFRESH_COOKIE));

export function clientMeta(h: Headers) {
  return { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null, userAgent: h.get("user-agent") };
}

export interface SupaSession { access_token: string; refresh_token: string; expires_in: number }

export const supabaseOn = () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const secure = () => process.env.NODE_ENV === "production";

export function cookieOptions(kind: "access" | "refresh", expiresIn?: number) {
  return { httpOnly: true, sameSite: "lax" as const, path: "/", secure: secure(), maxAge: kind === "access" ? Math.max(60, expiresIn ?? 3600) : REFRESH_DAYS * 86_400 };
}

async function authFetch(path: string, init: { method: string; body?: unknown; token?: string }): Promise<Response | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    return await fetch(`${url.replace(/\/$/, "")}/auth/v1/${path}`, {
      method: init.method,
      headers: { apikey: key, "Content-Type": "application/json", ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    return null;
  }
}

/** Đổi refresh token lấy phiên mới (refresh token dùng một lần — luôn lưu cái mới) */
export async function refreshSession(refreshToken: string): Promise<SupaSession | null | "network"> {
  const r = await authFetch("token?grant_type=refresh_token", { method: "POST", body: { refresh_token: refreshToken } });
  if (!r) return "network";
  if (!r.ok) return r.status >= 500 ? "network" : null;
  const j = (await r.json().catch(() => null)) as SupaSession | null;
  return j?.access_token && j.refresh_token ? j : null;
}

export async function revokeSession(accessToken: string) {
  await authFetch("logout?scope=local", { method: "POST", token: accessToken });
}

export function needsRefresh(access: string | undefined, refresh: string | undefined): boolean {
  return !!refresh && tokenNeedsRefresh(access ?? null, Date.now());
}

/** Xác minh liên kết mời / đặt lại mật khẩu (token_hash) → phiên */
export async function verifyTokenHash(tokenHash: string, type: "invite" | "recovery"): Promise<(SupaSession & { user?: { email?: string } }) | null> {
  const r = await authFetch("verify", { method: "POST", body: { type, token_hash: tokenHash } });
  if (!r || !r.ok) return null;
  const j = (await r.json().catch(() => null)) as (SupaSession & { user?: { email?: string } }) | null;
  return j?.access_token ? j : null;
}

export async function setPassword(accessToken: string, password: string): Promise<string | null> {
  const r = await authFetch("user", { method: "PUT", token: accessToken, body: { password } });
  if (!r) return "Không kết nối được máy chủ đăng nhập";
  if (r.ok) return null;
  const j = (await r.json().catch(() => ({}))) as { msg?: string; message?: string; error_description?: string };
  return j.msg ?? j.message ?? j.error_description ?? `Lỗi ${r.status}`;
}

/* ---------------- Xác thực 2 lớp (TOTP) ---------------- */
export interface MfaFactor { id: string; status: string; factor_type: string; friendly_name?: string | null; created_at?: string }

export async function listFactors(accessToken: string): Promise<MfaFactor[] | null> {
  const r = await authFetch("user", { method: "GET", token: accessToken });
  if (!r || !r.ok) return null;
  const j = (await r.json().catch(() => null)) as { factors?: MfaFactor[] } | null;
  return (j?.factors ?? []).filter((f) => f.factor_type === "totp");
}

export async function enrollTotp(accessToken: string): Promise<{ id: string; qr: string; secret: string } | { error: string }> {
  const r = await authFetch("factors", { method: "POST", token: accessToken, body: { factor_type: "totp", friendly_name: `Sata Robo ${new Date().toISOString().slice(0, 16)}` } });
  if (!r) return { error: "Không kết nối được máy chủ đăng nhập" };
  const j = (await r.json().catch(() => ({}))) as { id?: string; totp?: { qr_code?: string; secret?: string }; msg?: string; message?: string };
  if (!r.ok || !j.id || !j.totp?.qr_code) return { error: j.msg ?? j.message ?? `Lỗi ${r.status}` };
  return { id: j.id, qr: j.totp.qr_code, secret: j.totp.secret ?? "" };
}

export async function verifyTotp(accessToken: string, factorId: string, code: string): Promise<SupaSession | { error: string }> {
  const c = await authFetch(`factors/${encodeURIComponent(factorId)}/challenge`, { method: "POST", token: accessToken, body: {} });
  if (!c) return { error: "Không kết nối được máy chủ đăng nhập" };
  const cj = (await c.json().catch(() => ({}))) as { id?: string; msg?: string; message?: string };
  if (!c.ok || !cj.id) return { error: cj.msg ?? cj.message ?? `Lỗi ${c.status}` };
  const v = await authFetch(`factors/${encodeURIComponent(factorId)}/verify`, { method: "POST", token: accessToken, body: { challenge_id: cj.id, code } });
  if (!v) return { error: "Không kết nối được máy chủ đăng nhập" };
  const vj = (await v.json().catch(() => ({}))) as SupaSession & { msg?: string; message?: string };
  if (!v.ok || !vj.access_token) return { error: v.status === 422 || v.status === 400 ? "Mã không đúng hoặc đã hết hạn" : (vj.msg ?? vj.message ?? `Lỗi ${v.status}`) };
  return vj;
}

export async function unenrollFactor(accessToken: string, factorId: string): Promise<string | null> {
  const r = await authFetch(`factors/${encodeURIComponent(factorId)}`, { method: "DELETE", token: accessToken });
  if (!r) return "Không kết nối được máy chủ đăng nhập";
  if (r.ok) return null;
  const j = (await r.json().catch(() => ({}))) as { msg?: string; message?: string };
  return j.msg ?? j.message ?? `Lỗi ${r.status}`;
}
