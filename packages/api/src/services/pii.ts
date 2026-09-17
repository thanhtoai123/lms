import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Mã hoá tầng ứng dụng cho PII (CCCD phụ huynh…): AES-256-GCM, khoá dẫn từ PII_ENCRYPTION_KEY
 * (dự phòng MEDIA_SIGNING_SECRET khi chưa khai báo). Định dạng lưu: "v1:<iv>:<tag>:<ciphertext>" (base64url).
 * Đổi khoá thì dữ liệu cũ không đọc được — chỉ đặt một lần khi triển khai.
 */
function key() {
  const secret = process.env.PII_ENCRYPTION_KEY ?? process.env.MEDIA_SIGNING_SECRET ?? "dev-only-pii-key";
  return createHash("sha256").update(`pii|${secret}`).digest();
}

export function encryptPii(plain: string | null | undefined): string | null {
  if (!plain) return null;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(":");
}

/** Giải mã; dữ liệu không đúng định dạng / sai khoá → null (không ném lỗi ra giao diện) */
export function decryptPii(enc: string | null | undefined): string | null {
  if (!enc) return null;
  const [v, iv, tag, ct] = enc.split(":");
  if (v !== "v1" || !iv || !tag || !ct) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
