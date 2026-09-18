import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { isSafeObjectKey } from "@satarobo/core";
import { mediaSigningSecret } from "./lib/secrets";

/**
 * Lưu trữ ảnh lớp. Dev: đĩa cục bộ (STORAGE_DIR). Production: thay bằng R2/S3 cùng giao diện.
 * Ảnh không bao giờ công khai: chỉ phát qua URL có chữ ký, hết hạn (mặc định 15 phút).
 */
const ROOT = () => process.env.STORAGE_DIR ?? path.join(process.cwd(), ".data", "uploads");
const SECRET = mediaSigningSecret;

function safePath(key: string) {
  // isSafeObjectKey chặn cả "..", "//", đường dẫn tuyệt đối và ký tự lạ
  if (!isSafeObjectKey(key)) throw new Error("Khoá lưu trữ không hợp lệ");
  const p = path.join(ROOT(), key);
  // Lớp chặn cuối: đường dẫn phải nằm trong thư mục gốc sau khi chuẩn hoá
  const root = path.resolve(ROOT());
  if (!path.resolve(p).startsWith(root + path.sep)) throw new Error("Khoá lưu trữ không hợp lệ");
  return p;
}

export async function putObject(key: string, data: Uint8Array) {
  const p = safePath(key);
  await mkdir(/* turbopackIgnore: true */ path.dirname(p), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ p, data);
}

export async function getObject(key: string): Promise<Buffer | null> {
  try {
    return await readFile(/* turbopackIgnore: true */ safePath(key));
  } catch {
    return null;
  }
}

export async function deleteObject(key: string) {
  try { await unlink(/* turbopackIgnore: true */ safePath(key)); } catch { /* đã xoá */ }
}

function sign(key: string, exp: number) {
  return createHmac("sha256", SECRET()).update(`${key}|${exp}`).digest("base64url");
}

export function signedMediaUrl(key: string, ttlSeconds = 900) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `/api/media/file?key=${encodeURIComponent(key)}&exp=${exp}&sig=${sign(key, exp)}`;
}

export function verifyMediaSignature(key: string, exp: number, sig: string) {
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const a = Buffer.from(sign(key, exp));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** URL tải tài liệu (có chữ ký, hết hạn) */
export function signedFileUrl(key: string, fileName: string, ttlSeconds = 900, inline = false) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const name = fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100);
  return `/api/content/file?key=${encodeURIComponent(key)}&exp=${exp}&sig=${sign(key, exp)}&name=${encodeURIComponent(name)}${inline ? "&inline=1" : ""}`;
}

/** Tiền tố có chữ ký cho cả thư mục SCORM: đường dẫn tương đối trong gói vẫn chạy được */
export function signedScormBase(documentId: string, version: number, ttlSeconds = 4 * 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const prefix = `scorm/${documentId}/v${version}`;
  return `/api/content/scorm/${exp}/${sign(prefix, exp)}/${documentId}/${version}/`;
}

export function verifyScormSignature(documentId: string, version: number, exp: number, sig: string) {
  return verifyMediaSignature(`scorm/${documentId}/v${version}`, exp, sig);
}
