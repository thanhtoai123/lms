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

/* ------------------------------------------------------------------ */
/* Cửa sổ cố định — dùng cho bộ đếm trong CSDL                         */
/* ------------------------------------------------------------------ */

/**
 * Bộ đếm trong bộ nhớ ở trên chỉ đúng cho MỘT tiến trình: chạy nhiều bản sao
 * (Vercel, k8s, PM2 cluster) thì trần thực tế nhân lên theo số bản sao, còn khởi động lại
 * là mất sạch đếm. Trần dùng chung phải nằm ở kho chung — ở đây là bảng `rate_limits`
 * trong Postgres, tăng nguyên tử bằng `insert … on conflict do update`.
 *
 * Cửa sổ TRƯỢT cần giữ từng mốc thời gian nên không tăng nguyên tử được bằng một câu lệnh.
 * Vì vậy phần chạm CSDL dùng **cửa sổ cố định**: chia trục thời gian thành các ô đều nhau,
 * mỗi ô một dòng `(khoá, mốc đầu ô)`, mỗi lượt là `count = count + 1`.
 *
 * Đánh đổi đã biết: ngay ranh giới hai ô, kẻ tấn công có thể bắn tối đa `2 × max` lượt
 * trong một khoảng bằng `windowMs`. Với mục đích ở đây (chống dò mã, chống quét) thì chấp nhận
 * được, và lớp `MemoryRateLimiter` (cửa sổ trượt) vẫn chạy trước như lớp thứ nhất.
 */
export interface FixedWindowResult extends SlidingWindowResult {
  /** Mốc đầu ô (ms) — chính là khoá phụ của dòng trong CSDL */
  windowStart: number;
  /** Thời điểm ô hết hiệu lực (ms) — dùng cho cột `expires_at` và dọn dòng cũ */
  expiresAt: number;
}

/** Mốc đầu ô chứa `now` (ms). `windowMs` không hợp lệ thì coi như ô 1 phút. */
export function fixedWindowStart(now: number, windowMs: number): number {
  const w = Number.isFinite(windowMs) && windowMs > 0 ? Math.floor(windowMs) : 60_000;
  return Math.floor(now / w) * w;
}

/**
 * Quyết định cho một lượt, biết `count` LÀ SỐ ĐẾM SAU KHI ĐÃ TĂNG (giá trị `returning` trả về).
 * Tách khỏi CSDL để kiểm thử được bằng số thuần.
 */
export function fixedWindowDecision(count: number, now: number, max: number, windowMs: number): FixedWindowResult {
  const w = Number.isFinite(windowMs) && windowMs > 0 ? Math.floor(windowMs) : 60_000;
  const start = fixedWindowStart(now, w);
  const expiresAt = start + w;
  const limit = Math.max(1, Math.floor(max));
  const allowed = count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - count),
    retryAfterSec: allowed ? 0 : Math.max(1, Math.ceil((expiresAt - now) / 1000)),
    windowStart: start,
    expiresAt,
  };
}

/**
 * Dựng khoá đếm: `<mục đích>|<loại định danh>:<giá trị>`.
 * Chuẩn hoá để cùng một người không tách thành nhiều khoá (chữ hoa/thường, khoảng trắng),
 * và cắt ngắn để một định danh dài bất thường không làm phình dòng trong bảng.
 */
export function rateLimitKey(purpose: string, kind: string, value: string | null | undefined): string {
  const v = String(value ?? "unknown").trim().toLowerCase().slice(0, 120) || "unknown";
  return `${purpose}|${kind}:${v}`;
}

/** Trần mặc định cho từng luồng nhạy cảm — đặt RỘNG RÃI, chỉ để chặn máy dò, không chặn người thật */
export const RATE_LIMITS = {
  /** Đăng nhập nhân sự theo IP (khoá theo tài khoản đã có `loginLockDecision` trong CSDL) */
  staffLoginIp: { max: 60, windowMs: 15 * 60_000 },
  /** Đăng nhập nhân sự theo email */
  staffLoginEmail: { max: 15, windowMs: 15 * 60_000 },
  /** Cổng phụ huynh: xin OTP / đăng nhập */
  parentLoginIp: { max: 40, windowMs: 15 * 60_000 },
  /** Xin mã OTP công khai theo IP */
  otpIp: { max: 30, windowMs: 60 * 60_000 },
  /** Quên mật khẩu theo IP / theo email */
  passwordResetIp: { max: 10, windowMs: 60 * 60_000 },
  passwordResetEmail: { max: 5, windowMs: 60 * 60_000 },
  /** Dò mã kích hoạt phụ huynh theo SỐ ĐIỆN THOẠI */
  activationPhone: { max: CODE_ATTEMPT_MAX, windowMs: CODE_ATTEMPT_WINDOW_MS },
  /** Xuất dữ liệu (CSV học viên / lead) theo người dùng — một nhân sự bình thường xuất vài lần/ngày */
  exportUser: { max: 40, windowMs: 60 * 60_000 },
  /** Tìm kiếm toàn cục theo người dùng — Ctrl+K gõ tới đâu tìm tới đó nên phải rất rộng */
  searchUser: { max: 900, windowMs: 5 * 60_000 },
  /** Webhook theo nguồn + IP — nhà cung cấp gửi lại nhiều lần khi lỗi, không được chặn nhầm */
  webhookIp: { max: 1_200, windowMs: 60_000 },
} as const satisfies Record<string, { max: number; windowMs: number }>;

export type RateLimitName = keyof typeof RATE_LIMITS;

/**
 * Cho phép nới trần bằng biến môi trường `RATE_LIMIT_<TÊN>_MAX` (ví dụ `RATE_LIMIT_EXPORT_USER_MAX=200`)
 * — đường thoát khi trần mặc định chặn nhầm nghiệp vụ thật hoặc bộ kiểm thử tự động.
 */
export function rateLimitFor(name: RateLimitName, env: Record<string, string | undefined> = {}): { max: number; windowMs: number } {
  const base = RATE_LIMITS[name];
  const envKey = `RATE_LIMIT_${name.replace(/([A-Z])/g, "_$1").toUpperCase()}_MAX`;
  const raw = Number(env[envKey]);
  const max = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : base.max;
  return { max, windowMs: base.windowMs };
}
