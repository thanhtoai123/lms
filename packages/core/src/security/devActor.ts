/**
 * Cổng duy nhất quyết định có chấp nhận "tài khoản mẫu" (dev actor) hay không.
 *
 * Quy tắc bất di bất dịch: khi NODE_ENV=production thì KHÔNG BAO GIỜ nhận,
 * dù biến môi trường nào được đặt. Trước đây có cửa hậu ALLOW_DEV_ACTOR_IN_PRODUCTION
 * cho phép bật lại ở môi trường chạy thật — chỉ cần gửi header/cookie `x-dev-actor`
 * là mạo danh được bất kỳ ai, kể cả quản trị tối cao.
 */
export interface DevActorEnv {
  ALLOW_DEV_ACTOR?: string | undefined;
  NODE_ENV?: string | undefined;
}

/** Tên header / cookie mang email tài khoản mẫu */
export const DEV_ACTOR_HEADER = "x-dev-actor";

export function isProductionEnv(env: DevActorEnv): boolean {
  return (env.NODE_ENV ?? "").trim().toLowerCase() === "production";
}

/** Chỉ bật khi ALLOW_DEV_ACTOR=1 **và** không phải production. Không có ngoại lệ. */
export function devActorAllowed(env: DevActorEnv): boolean {
  if (isProductionEnv(env)) return false;
  return (env.ALLOW_DEV_ACTOR ?? "").trim() === "1";
}

/**
 * Email tài khoản mẫu được chấp nhận từ một nguồn tin cậy (cookie do máy chủ đọc),
 * sau khi đã kiểm tra `devActorAllowed`. Trả về null nếu không hợp lệ.
 * Chặn luôn giá trị rác / quá dài để không dùng làm vector khác.
 */
export function normalizeDevActor(value: string | null | undefined): string | null {
  const s = (value ?? "").trim();
  if (!s || s.length > 200) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s.toLowerCase() : null;
}
