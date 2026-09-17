import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Mã hoá tầng ứng dụng cho PII phụ huynh (parent_private: CCCD, địa chỉ).
 * AES-256-GCM, khoá dẫn xuất từ PII_ENCRYPTION_KEY (dự phòng MEDIA_SIGNING_SECRET khi chưa khai báo).
 * Định dạng: "v1:<iv>:<tag>:<ciphertext>" (base64url).
 */
function key() {
  const secret = process.env.PII_ENCRYPTION_KEY || process.env.MEDIA_SIGNING_SECRET || "dev-only-media-secret";
  return createHash("sha256").update(`pii|${secret}`).digest();
}

export function sealPii(plain: string | null | undefined): string | null {
  const t = (plain ?? "").trim();
  if (!t) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(t, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ct.toString("base64url")}`;
}

export function openPii(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  const [v, iv, tag, ct] = sealed.split(":");
  if (v !== "v1" || !iv || !tag || ct === undefined) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
