import { createHmac, timingSafeEqual } from "node:crypto";
import { mediaSigningSecret } from "./lib/secrets";
import { kho } from "./kho";
import { scormNguon } from "@satarobo/core";

/**
 * Lưu trữ tệp (ảnh lớp, tài liệu, CV, bài nộp, gói SCORM).
 *
 * Nơi cất tệp do `./kho` quyết định: khai đủ bốn biến `S3_*` thì dùng kho đối tượng tương
 * thích S3 (R2 / S3 / MinIO), không thì dùng đĩa cục bộ. Tệp này chỉ còn phần **phát tệp
 * ra ngoài**: mọi tệp đều riêng tư, chỉ đi qua URL có chữ ký HMAC ngắn hạn của chính hệ
 * thống (mặc định 15 phút) — không dùng URL ký sẵn của S3, để quyền xem vẫn do hệ thống
 * quyết định chứ không do ai giữ được đường dẫn.
 */
const SECRET = mediaSigningSecret;

export async function putObject(key: string, data: Uint8Array, contentType?: string) {
  await kho().dat(key, data, contentType);
}

export async function getObject(key: string): Promise<Buffer | null> {
  return kho().lay(key);
}

export async function deleteObject(key: string) {
  await kho().xoa(key);
}

/**
 * Xoá cả một thư mục theo tiền tố khoá (vd `scorm/<id>/v3`) — dùng khi dọn bản giáo án lỗi
 * hoặc thay bản mới: gói SCORM là hàng trăm tệp, xoá từng tệp thì phải liệt kê lại cả gói.
 */
export async function deletePrefix(prefix: string) {
  await kho().xoaTheoTienTo(prefix);
}

/** Kho tệp đang dùng — trang Vận hành hiển thị, không trả khoá bí mật */
export { moTaKho, thieuBienS3 } from "./kho";

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
  // Có miền học liệu riêng (SCORM_ORIGIN) thì URL tuyệt đối sang miền đó — xem core/content/scormNguon.ts
  const nguon = scormNguon(process.env) ?? "";
  return `${nguon}/api/content/scorm/${exp}/${sign(prefix, exp)}/${documentId}/${version}/`;
}

export function verifyScormSignature(documentId: string, version: number, exp: number, sig: string) {
  return verifyMediaSignature(`scorm/${documentId}/v${version}`, exp, sig);
}

/**
 * Đường dẫn trang in NỘI BỘ của hồ sơ học tập cho bộ kết xuất PDF phía máy chủ (Playwright).
 * Trình duyệt không đầu không mang phiên đăng nhập → trang nhận chữ ký HMAC ngắn hạn (mặc định 5 phút)
 * trên đúng (học viên, phạm vi); quyền đã được kiểm ở thủ tục xuất PDF trước khi ký.
 */
export function signedPortfolioRenderPath(studentId: string, scopeQuery: string, ttlSeconds = 300) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `render-ho-so|${studentId}|${scopeQuery}`;
  return `/in-ho-so/${studentId}?${scopeQuery}${scopeQuery ? "&" : ""}exp=${exp}&sig=${sign(payload, exp)}`;
}

export function verifyPortfolioRenderSignature(studentId: string, scopeQuery: string, exp: number, sig: string) {
  return verifyMediaSignature(`render-ho-so|${studentId}|${scopeQuery}`, exp, sig);
}
