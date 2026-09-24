import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { piiEncryptionSecret } from "../lib/secrets";

/**
 * Mã hoá tầng ứng dụng cho PII phụ huynh (parent_private: CCCD, địa chỉ).
 * AES-256-GCM, khoá dẫn xuất từ PII_ENCRYPTION_KEY (dự phòng MEDIA_SIGNING_SECRET khi chưa khai báo).
 * Định dạng: "v1:<iv>:<tag>:<ciphertext>" (base64url).
 */
function key(label = "pii") {
  return createHash("sha256").update(`${label}|${piiEncryptionSecret()}`).digest();
}

/**
 * Mã hoá / giải mã cho những bí mật KHÁC PII nhưng cũng không được để trần trong CSDL
 * (token Zalo OA, secret_key ứng dụng…). Dùng nhãn riêng nên khoá dẫn xuất khác nhau:
 * lộ một nhãn không kéo theo nhãn còn lại.
 */
export function sealWith(label: string, plain: string | null | undefined): string | null {
  const t = (plain ?? "").trim();
  if (!t) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(label), iv);
  const ct = Buffer.concat([cipher.update(t, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ct.toString("base64url")}`;
}

export function openWith(label: string, sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  const [v, iv, tag, ct] = sealed.split(":");
  if (v !== "v1" || !iv || !tag || ct === undefined) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", key(label), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
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

/** Bí danh tương thích (dùng ở hồ sơ học viên) */
export const encryptPii = sealPii;
export const decryptPii = openPii;
