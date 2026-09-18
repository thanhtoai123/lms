/**
 * Trần tần suất DÙNG CHUNG giữa mọi bản sao máy chủ — phần chạm CSDL.
 *
 * Thuật toán thuần (cửa sổ cố định, chuẩn hoá khoá, trần mặc định) nằm ở
 * `packages/core/src/security/rateLimit.ts` để kiểm thử không cần CSDL. Ở đây chỉ còn
 * phép tăng nguyên tử `INSERT … ON CONFLICT DO UPDATE` trên bảng `rate_limits`.
 *
 * NGUYÊN TẮC AN TOÀN VẬN HÀNH (rất quan trọng — chặn nhầm là chặn người thật):
 *  - Trần mặc định đặt RỘNG (xem `RATE_LIMITS`), chỉ để chặn máy dò.
 *  - CSDL lỗi / chưa có bảng ⇒ **cho qua** (fail-open), chỉ ghi cảnh báo. Trần tần suất
 *    không bao giờ được biến thành lý do khiến cả hệ thống không đăng nhập được.
 *  - `RATE_LIMIT_DISABLED=1` tắt toàn bộ; `RATE_LIMIT_DB=0` chỉ dùng bộ đếm trong bộ nhớ;
 *    `RATE_LIMIT_<TÊN>_MAX` nới riêng từng luồng.
 *  - Lớp bộ nhớ (cửa sổ trượt) vẫn chạy TRƯỚC như lớp thứ nhất: chặn được đợt bắn dồn
 *    mà không cần đi tới CSDL.
 */
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { eq, lte, sql } from "drizzle-orm";
import { rateLimits, type Database } from "@satarobo/db";
import {
  MemoryRateLimiter,
  createLogger,
  fixedWindowDecision,
  fixedWindowStart,
  rateLimitFor,
  rateLimitKey,
  type RateLimitName,
} from "@satarobo/core";

/**
 * Nhận cả `Database` lẫn transaction (service hay truyền `tx`). Dùng kiểu rộng để
 * nơi gọi không phải ép kiểu; `null`/`undefined` nghĩa là "không có CSDL" → bỏ qua lớp dùng chung.
 */
export type RateLimitDb = Pick<Database, "insert" | "delete"> | null | undefined;

const log = createLogger("rate-limit");

/** Lớp thứ nhất trong mỗi tiến trình — chặn đợt bắn dồn trước khi đụng CSDL */
const memory = new MemoryRateLimiter(20_000);

export interface RateDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  /** Lớp nào ra quyết định — hữu ích khi điều tra "vì sao tôi bị chặn" */
  source: "off" | "memory" | "db" | "db-unavailable";
}

const ALLOW: RateDecision = { allowed: true, remaining: Number.MAX_SAFE_INTEGER, retryAfterSec: 0, source: "off" };

/** Định danh nhạy cảm (SĐT, email) băm trước khi làm khoá — bảng đếm không được là một danh bạ */
function hashIdentifier(value: string): string {
  const pepper = process.env.OTP_PEPPER ?? process.env.MEDIA_SIGNING_SECRET ?? "";
  return createHash("sha256").update(`ratelimit|${pepper}|${value.trim().toLowerCase()}`).digest("hex").slice(0, 32);
}

export type RateKeyKind = "ip" | "user" | "phone" | "email" | "source" | "token";

/**
 * Dựng khoá đếm. `phone` / `email` được băm (có muối) nên bảng `rate_limits`
 * không lưu được danh sách số điện thoại của khách.
 */
export function rateKey(purpose: string, kind: RateKeyKind, value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  const safe = kind === "phone" || kind === "email" || kind === "token" ? (raw ? hashIdentifier(raw) : "unknown") : raw;
  return rateLimitKey(purpose, kind, safe);
}

export interface RateOptions {
  /** Ghi đè trần (chỉ dùng khi luồng chưa có tên trong `RATE_LIMITS`) */
  max?: number;
  windowMs?: number;
  now?: number;
  env?: Record<string, string | undefined>;
}

/**
 * Ghi nhận MỘT lượt cho `key` và trả quyết định.
 * Không ném lỗi trong mọi trường hợp — nơi gọi tự quyết định làm gì với `allowed`.
 */
export async function checkRateLimit(
  db: RateLimitDb,
  name: RateLimitName,
  key: string,
  opts: RateOptions = {},
): Promise<RateDecision> {
  const env = opts.env ?? process.env;
  if (env.RATE_LIMIT_DISABLED === "1") return ALLOW;
  const base = rateLimitFor(name, env);
  const max = opts.max ?? base.max;
  const windowMs = opts.windowMs ?? base.windowMs;
  const now = opts.now ?? Date.now();

  // Lớp 1 — trong bộ nhớ, cửa sổ trượt
  const local = memory.hit(key, now, max, windowMs);
  if (!local.allowed) return { ...local, source: "memory" };

  // Lớp 2 — dùng chung trong CSDL, cửa sổ cố định
  if (env.RATE_LIMIT_DB === "0" || !db) return { ...local, source: "memory" };
  const windowStart = fixedWindowStart(now, windowMs);
  const expiresAt = windowStart + windowMs;
  try {
    const rows = await db
      .insert(rateLimits)
      .values({ key, windowStart: new Date(windowStart), count: 1, expiresAt: new Date(expiresAt) })
      .onConflictDoUpdate({
        target: [rateLimits.key, rateLimits.windowStart],
        set: { count: sql`${rateLimits.count} + 1` },
      })
      .returning({ count: rateLimits.count });
    const count = Number(rows?.[0]?.count ?? 1);
    const d = fixedWindowDecision(count, now, max, windowMs);
    return { allowed: d.allowed, remaining: d.remaining, retryAfterSec: d.retryAfterSec, source: "db" };
  } catch (e) {
    // Fail-open có chủ đích: mất CSDL thì đã hỏng nặng hơn nhiều, đừng khoá luôn cửa đăng nhập
    log.warn("không ghi được bộ đếm dùng chung, tạm dùng bộ đếm trong bộ nhớ", { err: e, limit: name });
    return { ...local, source: "db-unavailable" };
  }
}

/** Xoá đếm của một khoá — gọi sau khi xác thực THÀNH CÔNG để lần sau không bị dính trần */
export async function resetRateLimit(db: RateLimitDb, key: string): Promise<void> {
  memory.reset(key);
  if (!db) return;
  try {
    await db.delete(rateLimits).where(eq(rateLimits.key, key));
  } catch (e) {
    log.warn("không xoá được bộ đếm dùng chung", { err: e });
  }
}

/**
 * Dọn dòng hết hạn. Worker gọi định kỳ; không gọi được cũng chỉ tốn chỗ chứ không sai kết quả
 * (dòng cũ thuộc ô thời gian khác nên không ảnh hưởng quyết định).
 */
export async function pruneRateLimits(db: RateLimitDb, now = new Date()): Promise<number> {
  if (!db) return 0;
  try {
    const rows = await db.delete(rateLimits).where(lte(rateLimits.expiresAt, now)).returning({ key: rateLimits.key });
    return rows.length;
  } catch (e) {
    log.warn("không dọn được bộ đếm hết hạn", { err: e });
    return 0;
  }
}

/**
 * Dùng trong service tRPC: đụng trần thì ném `TOO_MANY_REQUESTS` kèm câu tiếng Việt.
 * KHÔNG dùng cho luồng xác thực (đăng nhập, OTP) — ở đó phải trả lời mơ hồ giống nhau
 * dù đúng hay sai để không lộ tài khoản nào có thật.
 */
export async function assertRateLimit(
  db: RateLimitDb,
  name: RateLimitName,
  key: string,
  what: string,
  opts: RateOptions = {},
): Promise<void> {
  const d = await checkRateLimit(db, name, key, opts);
  if (!d.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: tooManyMessage(d, what) });
}

/** Thông báo tiếng Việt chuẩn khi đụng trần */
export function tooManyMessage(d: RateDecision, what = "thao tác"): string {
  const min = Math.ceil(d.retryAfterSec / 60);
  return min > 1
    ? `Bạn đã ${what} quá nhiều lần. Vui lòng thử lại sau khoảng ${min} phút.`
    : `Bạn đã ${what} quá nhiều lần. Vui lòng thử lại sau ít phút.`;
}
