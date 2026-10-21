/**
 * Xác minh webhook đến từ đối tác (Meta Messenger, Zalo OA, SePay).
 *
 * Nguyên tắc: so khớp HMAC **không lệ thuộc thời gian**, và từ chối gói tin quá cũ
 * (chống phát lại — replay). Idempotency theo mã giao dịch vẫn do tầng nghiệp vụ lo.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** So chuỗi không lộ thời gian */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Meta: header X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, raw body) */
export function metaSignature(raw: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(raw, "utf8").digest("hex")}`;
}
export function metaSignatureOk(raw: string, header: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  return safeEqual(header, metaSignature(raw, secret));
}

/** Zalo OA: header X-ZEvent-Signature = "mac=" + SHA256(app_id + raw body + timestamp + OA secret key) */
export function zaloSignature(raw: string, appId: string, timestamp: string | number, secret: string): string {
  return `mac=${createHash("sha256").update(`${appId}${raw}${timestamp}${secret}`, "utf8").digest("hex")}`;
}

/** Cửa sổ chấp nhận cho dấu thời gian webhook (5 phút mỗi chiều) */
export const WEBHOOK_MAX_SKEW_MS = 5 * 60_000;

/**
 * Dấu thời gian còn tươi không (chống phát lại gói tin cũ đã bắt được).
 * Zalo gửi timestamp là mili-giây; chấp nhận cả giây cho chắc.
 */
export function timestampFresh(timestamp: string | number | null | undefined, nowMs: number, maxSkewMs = WEBHOOK_MAX_SKEW_MS): boolean {
  if (timestamp === null || timestamp === undefined || timestamp === "") return false;
  const n = typeof timestamp === "number" ? timestamp : Number(String(timestamp).trim());
  if (!Number.isFinite(n) || n <= 0) return false;
  // < 10^12 thì gần như chắc chắn là giây
  const ms = n < 1e12 ? n * 1000 : n;
  return Math.abs(nowMs - ms) <= maxSkewMs;
}

export function zaloSignatureOk(
  raw: string,
  header: string | null | undefined,
  appId: string | undefined,
  secret: string | undefined,
  timestamp: string | number | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!secret || !appId || !header) return false;
  if (!timestampFresh(timestamp, nowMs)) return false;
  return safeEqual(header, zaloSignature(raw, appId, timestamp as string | number, secret));
}

/**
 * SePay HMAC-SHA256 (khuyến nghị thay cho API Key): header `X-SePay-Signature: sha256=<hex>` và
 * `X-SePay-Timestamp: <giây Unix>`; chuỗi ký = `${timestamp}.${raw body}` (đúng từng byte nhận được).
 * Cửa sổ thời gian rộng 60 phút vì SePay tự gửi lại tới ~33 phút sau lần đầu; gói tin phát lại cũng không tạo trùng
 * khoản thu (chống trùng theo id giao dịch), nên cửa sổ chỉ để chặn gói tin rất cũ.
 */
export const SEPAY_MAX_SKEW_MS = 60 * 60_000;
export function sepaySignature(raw: string, timestamp: string | number, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${raw}`, "utf8").digest("hex")}`;
}
export function sepaySignatureOk(
  raw: string,
  header: string | null | undefined,
  timestamp: string | null | undefined,
  secret: string | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!secret || !header || !timestamp || !/^\d{9,11}$/.test(timestamp.trim())) return false;
  if (!timestampFresh(timestamp.trim(), nowMs, SEPAY_MAX_SKEW_MS)) return false;
  return safeEqual(header.trim().toLowerCase(), sepaySignature(raw, timestamp.trim(), secret));
}
