/**
 * Đăng nhập nhân sự (Supabase Auth): giải mã JWT để biết hạn / mức xác thực, chính sách mật khẩu, yêu cầu 2 lớp.
 * Chỉ đọc phần thân JWT — việc xác minh chữ ký luôn do Supabase làm (auth.getUser).
 */
import type { Role } from "../policy/policy.js";

export interface JwtClaims { sub?: string; email?: string; exp?: number; iat?: number; aal?: string; session_id?: string }

export function decodeJwtPayload(token: string | null | undefined): JwtClaims | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = typeof atob === "function" ? decodeURIComponent(escape(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)))) : "";
    const v = JSON.parse(json) as unknown;
    return v && typeof v === "object" ? (v as JwtClaims) : null;
  } catch {
    return null;
  }
}

/** Cần làm mới khi không có token, token hỏng, hoặc còn dưới `skewSec` giây */
export function tokenNeedsRefresh(token: string | null | undefined, nowMs: number, skewSec = 120): boolean {
  const c = decodeJwtPayload(token);
  if (!c?.exp) return true;
  return c.exp * 1000 - nowMs <= skewSec * 1000;
}

export const PASSWORD_MIN = 10;
export function passwordProblems(pw: string, email?: string | null): string[] {
  const e: string[] = [];
  if (pw.length < PASSWORD_MIN) e.push(`Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự`);
  if (pw.length > 128) e.push("Mật khẩu tối đa 128 ký tự");
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) e.push("Cần cả chữ và số");
  const local = (email ?? "").split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && pw.toLowerCase().includes(local)) e.push("Không dùng tên email trong mật khẩu");
  if (/^(.)\1+$/.test(pw) || /^(0123456789|1234567890|matkhau|password)/i.test(pw)) e.push("Mật khẩu quá dễ đoán");
  return e;
}

/** Vai trò phải bật xác thực 2 lớp (đọc từ biến môi trường REQUIRE_MFA_ROLES, mặc định SUPER_ADMIN) */
export function mfaRequiredRoles(env: string | undefined): Role[] {
  const raw = (env ?? "SUPER_ADMIN").split(",").map((x) => x.trim()).filter(Boolean);
  return raw as Role[];
}

export function mfaState(x: { roles: readonly Role[]; required: readonly Role[]; viaSupabase: boolean; aal: string | null | undefined }): { required: boolean; satisfied: boolean } {
  const required = x.viaSupabase && x.roles.some((r) => x.required.includes(r));
  return { required, satisfied: !required || x.aal === "aal2" };
}

/** Liên kết đặt mật khẩu chỉ được quay về trang nội bộ */
export const AUTH_LINK_TYPES = ["invite", "recovery"] as const;
export type AuthLinkType = (typeof AUTH_LINK_TYPES)[number];
export function validTokenHash(s: string | null | undefined): boolean {
  return !!s && /^[A-Za-z0-9_-]{20,128}$/.test(s);
}
