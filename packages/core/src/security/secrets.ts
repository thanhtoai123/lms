/**
 * Khoá bí mật: không bao giờ để giá trị dự phòng cứng chạy ở production.
 *
 * Trước đây nhiều nơi dùng `process.env.X ?? "dev-only-media-secret"`. Khoá này nằm
 * trong mã nguồn nên ai cũng biết: giả được URL ảnh / tài liệu có chữ ký, giải mã được
 * CCCD & địa chỉ phụ huynh, dò được mã OTP đã băm. Ở production phải nổ ngay khi thiếu.
 */

export class MissingSecretError extends Error {
  constructor(public readonly name: string, message: string) {
    super(message);
    this.name = "MissingSecretError";
  }
}

export interface SecretOptions {
  /** Độ dài tối thiểu bắt buộc khi chạy thật */
  minLength?: number;
  /** Giá trị dùng khi phát triển (không bao giờ dùng ở production) */
  devFallback: string;
}

/**
 * Lấy khoá bí mật theo thứ tự ưu tiên `names`.
 * - production: phải có ít nhất một khoá hợp lệ, đủ dài → nếu không thì ném MissingSecretError.
 * - dev/test: rơi về `devFallback` để chạy được máy cá nhân.
 */
export function resolveSecret(
  env: Record<string, string | undefined>,
  names: readonly string[],
  opts: SecretOptions,
  isProduction: boolean,
): string {
  const minLength = opts.minLength ?? 32;
  for (const n of names) {
    const v = (env[n] ?? "").trim();
    if (!v) continue;
    if (isProduction && v.length < minLength) {
      throw new MissingSecretError(n, `Khoá ${n} quá ngắn (cần tối thiểu ${minLength} ký tự) — tạo bằng: openssl rand -base64 48`);
    }
    if (isProduction && WEAK_SECRETS.has(v.toLowerCase())) {
      throw new MissingSecretError(n, `Khoá ${n} đang dùng giá trị mẫu công khai — thay bằng khoá riêng: openssl rand -base64 48`);
    }
    return v;
  }
  if (isProduction) {
    throw new MissingSecretError(names[0] ?? "SECRET", `Thiếu biến môi trường ${names.join(" / ")} — bắt buộc khi chạy thật. Tạo bằng: openssl rand -base64 48`);
  }
  return opts.devFallback;
}

/** Những giá trị từng xuất hiện trong mã nguồn / tài liệu — cấm dùng ở production */
export const WEAK_SECRETS = new Set([
  "dev-only-media-secret",
  "dev-otp-pepper",
  "login-events",
  "changeme",
  "secret",
  "test",
]);
