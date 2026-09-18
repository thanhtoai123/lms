/**
 * Điểm duy nhất lấy khoá bí mật của máy chủ.
 *
 * Trước đây mỗi nơi tự viết `process.env.X ?? "dev-only-media-secret"`. Khoá dự phòng
 * nằm trong mã nguồn nên ở production ai đọc repo cũng ký được URL ảnh / tài liệu,
 * giải mã được CCCD phụ huynh và dò được OTP đã băm. Nay thiếu khoá ở production là
 * nổ ngay lúc dùng, thay vì âm thầm chạy bằng khoá công khai.
 */
import { resolveSecret, isProductionEnv } from "@satarobo/core";

const isProd = () => isProductionEnv(process.env);

/** Khoá ký URL ảnh / tài liệu / mã QR điểm danh */
export const mediaSigningSecret = () =>
  resolveSecret(process.env, ["MEDIA_SIGNING_SECRET"], { devFallback: "dev-only-media-secret", minLength: 32 }, isProd());

/** Khoá mã hoá PII phụ huynh (CCCD, địa chỉ) */
export const piiEncryptionSecret = () =>
  resolveSecret(process.env, ["PII_ENCRYPTION_KEY", "MEDIA_SIGNING_SECRET"], { devFallback: "dev-only-media-secret", minLength: 32 }, isProd());

/** Muối băm OTP */
export const otpPepper = () =>
  resolveSecret(process.env, ["OTP_PEPPER"], { devFallback: "dev-otp-pepper", minLength: 16 }, isProd());

/** Khoá băm định danh trong nhật ký đăng nhập */
export const loginEventSecret = () =>
  resolveSecret(process.env, ["OTP_PEPPER", "MEDIA_SIGNING_SECRET"], { devFallback: "login-events", minLength: 16 }, isProd());
