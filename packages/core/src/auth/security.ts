/**
 * An ninh đăng nhập nhân sự: khoá tạm khi nhập sai nhiều lần, tự đăng xuất khi không thao tác,
 * nhật ký đăng nhập và các khuyến nghị cho trang Bảo mật hệ thống.
 */

export const LOGIN_RESULTS = ["success", "bad_password", "locked_out", "mfa_verified", "logout", "idle_logout", "password_set", "admin_unlock"] as const;
export type LoginResult = (typeof LOGIN_RESULTS)[number];

export const LOGIN_RESULT_LABEL: Record<LoginResult, string> = {
  success: "Đăng nhập",
  bad_password: "Sai mật khẩu",
  locked_out: "Bị chặn (sai quá nhiều lần)",
  mfa_verified: "Xác thực 2 lớp",
  logout: "Đăng xuất",
  idle_logout: "Tự đăng xuất (không thao tác)",
  password_set: "Đặt mật khẩu",
  admin_unlock: "Quản trị mở khoá tạm",
};
export const LOGIN_RESULT_FAILED: readonly LoginResult[] = ["bad_password", "locked_out"];

/** Sau số ngày này không đăng nhập mà vẫn còn vai trò → tài khoản "ngủ", nên khoá */
export const DORMANT_DAYS = 90;
/** Trần theo IP (chống dò mật khẩu nhiều tài khoản) */
export const LOGIN_IP_MAX_FAILS = 30;
export const LOGIN_IP_WINDOW_MIN = 15;

export interface LockInput {
  /** số lần sai của email kể từ lần đăng nhập đúng gần nhất, trong khoảng lockMinutes */
  fails: number;
  lastFailAt: Date | null;
  /** số lần sai từ IP trong LOGIN_IP_WINDOW_MIN phút */
  ipFails: number;
  now: Date;
  maxFails: number;
  lockMinutes: number;
}

export function loginLockDecision(x: LockInput): { allowed: boolean; retryAfterMin: number; reason: "ok" | "account" | "ip" } {
  if (x.ipFails >= LOGIN_IP_MAX_FAILS) return { allowed: false, retryAfterMin: LOGIN_IP_WINDOW_MIN, reason: "ip" };
  if (x.fails >= x.maxFails && x.lastFailAt) {
    const until = x.lastFailAt.getTime() + x.lockMinutes * 60_000;
    const left = Math.ceil((until - x.now.getTime()) / 60_000);
    if (left > 0) return { allowed: false, retryAfterMin: left, reason: "account" };
  }
  return { allowed: true, retryAfterMin: 0, reason: "ok" };
}

export const IDLE_MIN = 5;
export const IDLE_MAX = 480;
export const IDLE_DEFAULT = 60;

export function normalizeIdle(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return IDLE_DEFAULT;
  return Math.min(IDLE_MAX, Math.max(IDLE_MIN, Math.round(n)));
}

/** Hết phiên do không thao tác. Chưa có mốc (vừa đăng nhập / cookie cũ) → chưa hết. */
export function idleExpired(lastSeenMs: number | null | undefined, nowMs: number, idleMinutes: number): boolean {
  if (!lastSeenMs || !Number.isFinite(lastSeenMs)) return false;
  if (lastSeenMs > nowMs + 60_000) return true; // mốc ở tương lai = cookie bị sửa
  return nowMs - lastSeenMs > normalizeIdle(idleMinutes) * 60_000;
}

/** Che bớt IP khi hiển thị: IPv4 giữ 3 khối đầu, IPv6 giữ 3 nhóm đầu */
export function maskIp(ip: string | null | undefined): string {
  const s = (ip ?? "").split(",")[0]!.trim();
  if (!s) return "—";
  const v4 = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.x`;
  if (s.includes(":")) return `${s.split(":").slice(0, 3).join(":")}:…`;
  return "—";
}

/** Tên thiết bị ngắn gọn từ User-Agent */
export function deviceLabel(ua: string | null | undefined): string {
  const s = ua ?? "";
  if (!s) return "Không rõ thiết bị";
  const browser = /Edg\//.test(s) ? "Edge" : /OPR\/|Opera/.test(s) ? "Opera" : /CocCoc|coc_coc/i.test(s) ? "Cốc Cốc" : /Zalo/i.test(s) ? "Zalo" : /Firefox\//.test(s) ? "Firefox" : /Chrome\//.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : /curl\//i.test(s) ? "curl" : "Trình duyệt khác";
  const os = /Windows/.test(s) ? "Windows" : /Android/.test(s) ? "Android" : /iPhone|iPad|iOS/.test(s) ? "iOS" : /Mac OS X|Macintosh/.test(s) ? "macOS" : /Linux/.test(s) ? "Linux" : "";
  return os ? `${browser} · ${os}` : browser;
}

export interface SecurityStats {
  superAdmins: number;
  activeStaff: number;
  dormant: number;
  locked: number;
  failed24h: number;
  lockouts24h: number;
  mfaRoles: string[];
  supabase: boolean;
  serviceKey: boolean;
  devActor: boolean;
  production: boolean;
  idleMinutes: number;
  maxFails: number;
}

export interface Finding { level: "danger" | "warn" | "ok"; text: string; href?: string }

export function securityFindings(s: SecurityStats): Finding[] {
  const f: Finding[] = [];
  if (s.production && s.devActor) f.push({ level: "danger", text: "Đang bật đăng nhập bằng tài khoản mẫu (ALLOW_DEV_ACTOR) trên môi trường chạy thật — tắt ngay.", href: "/van-hanh" });
  if (s.production && !s.supabase) f.push({ level: "danger", text: "Chưa cấu hình Supabase: nhân sự không đăng nhập bằng mật khẩu được.", href: "/van-hanh" });
  if (s.supabase && !s.serviceKey) f.push({ level: "warn", text: "Thiếu SUPABASE_SERVICE_ROLE_KEY: không gửi được lời mời, khoá tài khoản không chặn được đăng nhập.", href: "/van-hanh" });
  if (!s.mfaRoles.includes("SUPER_ADMIN")) f.push({ level: "danger", text: "Quản trị hệ thống không bắt buộc xác thực 2 lớp (REQUIRE_MFA_ROLES)." });
  else if (!s.mfaRoles.some((r) => r.includes("ACCOUNTANT"))) f.push({ level: "warn", text: "Nên bắt buộc xác thực 2 lớp cho kế toán (HO_ACCOUNTANT, CENTER_ACCOUNTANT) vì thao tác với tiền." });
  if (s.superAdmins > 3) f.push({ level: "warn", text: `Có ${s.superAdmins} tài khoản Quản trị hệ thống — nên giữ tối đa 2–3.`, href: "/users" });
  if (s.superAdmins === 0) f.push({ level: "danger", text: "Không còn tài khoản Quản trị hệ thống đang hoạt động." , href: "/users" });
  if (s.dormant > 0) f.push({ level: "warn", text: `${s.dormant} tài khoản còn vai trò nhưng không đăng nhập quá ${DORMANT_DAYS} ngày — xem xét khoá.` });
  if (s.lockouts24h > 0) f.push({ level: "warn", text: `${s.lockouts24h} lần đăng nhập bị chặn do sai mật khẩu nhiều lần trong 24 giờ qua.` });
  if (s.failed24h >= 20) f.push({ level: "warn", text: `${s.failed24h} lần đăng nhập sai trong 24 giờ qua — kiểm tra các IP bên dưới.` });
  if (s.idleMinutes > 120) f.push({ level: "warn", text: `Tự đăng xuất sau ${s.idleMinutes} phút không thao tác là dài — nên ≤ 60 phút cho máy dùng chung.`, href: "/cau-hinh-van-hanh?tab=otp" });
  if (s.maxFails > 10) f.push({ level: "warn", text: `Cho phép sai mật khẩu ${s.maxFails} lần trước khi khoá tạm — nên ≤ 10.`, href: "/cau-hinh-van-hanh?tab=otp" });
  if (!f.length) f.push({ level: "ok", text: "Không có vấn đề cần xử lý." });
  const order = { danger: 0, warn: 1, ok: 2 };
  return f.sort((a, b) => order[a.level] - order[b.level]);
}
