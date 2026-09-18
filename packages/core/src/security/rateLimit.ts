/**
 * Đếm lượt trong cửa sổ trượt — dùng cho chống dò mã (OTP, mã kích hoạt phụ huynh),
 * đăng nhập, xuất dữ liệu. Logic thuần để kiểm thử được; nơi gọi tự chọn kho lưu.
 *
 * Bản cũ ở apps/web dùng Map không bao giờ dọn khoá cũ (rò rỉ bộ nhớ) và chỉ đếm
 * theo IP nên đổi IP là dò tiếp được.
 */

export interface SlidingWindowResult {
  allowed: boolean;
  /** Số lượt còn lại trong cửa sổ (0 khi đã chặn) */
  remaining: number;
  /** Số giây nên chờ trước khi thử lại */
  retryAfterSec: number;
}

/**
 * Quyết định cho một lần thử: `hits` là các mốc thời gian (ms) đã ghi nhận trước đó.
 * Trả về cả danh sách mốc mới để nơi gọi lưu lại (không tự giữ trạng thái).
 */
export function slidingWindow(
  hits: readonly number[],
  now: number,
  max: number,
  windowMs: number,
): SlidingWindowResult & { hits: number[] } {
  const live = hits.filter((t) => now - t < windowMs && t <= now);
  if (live.length >= max) {
    const oldest = Math.min(...live);
    return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)), hits: live };
  }
  const next = [...live, now];
  return { allowed: true, remaining: Math.max(0, max - next.length), retryAfterSec: 0, hits: next };
}

/**
 * Bộ đếm trong bộ nhớ có giới hạn số khoá (tránh phình bộ nhớ khi bị bắn nhiều IP giả).
 * Một tiến trình một bộ đếm — ở nhiều máy chủ thì đây chỉ là lớp chặn đầu tiên,
 * lớp chặn thật nằm ở CSDL / WAF (xem docs/KIEM-DINH-BAO-MAT.md).
 */
export class MemoryRateLimiter {
  private readonly map = new Map<string, number[]>();

  constructor(private readonly maxKeys = 10_000) {}

  /** Ghi nhận một lượt thử; trả về quyết định. */
  hit(key: string, now: number, max: number, windowMs: number): SlidingWindowResult {
    this.sweep(now, windowMs);
    const r = slidingWindow(this.map.get(key) ?? [], now, max, windowMs);
    // Map giữ thứ tự chèn: xoá khoá cũ nhất khi vượt trần
    if (!this.map.has(key) && this.map.size >= this.maxKeys) {
      const oldest = this.map.keys().next();
      if (!oldest.done) this.map.delete(oldest.value);
    }
    this.map.set(key, r.hits);
    return { allowed: r.allowed, remaining: r.remaining, retryAfterSec: r.retryAfterSec };
  }

  /** Xoá đếm của một khoá (gọi sau khi xác thực đúng) */
  reset(key: string) {
    this.map.delete(key);
  }

  get size() {
    return this.map.size;
  }

  private lastSweep = 0;
  private sweep(now: number, windowMs: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [k, v] of this.map) {
      const live = v.filter((t) => now - t < windowMs);
      if (live.length) this.map.set(k, live);
      else this.map.delete(k);
    }
  }
}

/** Trần dò mã kích hoạt / OTP theo số điện thoại (không theo IP — đổi IP không thoát) */
export const CODE_ATTEMPT_MAX = 8;
export const CODE_ATTEMPT_WINDOW_MS = 15 * 60_000;
