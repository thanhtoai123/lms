/**
 * Độ tin cậy vận hành — logic THUẦN (không chạm CSDL, không đọc đồng hồ hệ thống trừ khi
 * được truyền `now` vào). Dùng chung cho outbox, hàng đợi email/ZNS/push và mọi việc nền khác.
 *
 * Ba nhóm quy tắc ở đây:
 *  1) Thử lại có giãn cách (exponential backoff) + hàng đợi chết.
 *  2) Chọn lô (batch) khi xuất / quét dữ liệu lớn: không đọc một lần cả bảng.
 *  3) Cắt ngưỡng đo: thủ tục chạy lâu hơn ngưỡng thì ghi log — và log KHÔNG chứa dữ liệu cá nhân.
 */

/* ------------------------------------------------------------------ */
/* 1) Thử lại có giãn cách                                             */
/* ------------------------------------------------------------------ */

export interface RetryPolicy {
  /** Giãn cách cho lần thử lại đầu tiên (ms) */
  baseMs: number;
  /** Trần giãn cách (ms) — không chờ lâu hơn mức này dù thử lại nhiều lần */
  maxMs: number;
  /** Quá số lần này mà vẫn hỏng thì đưa vào hàng đợi chết */
  maxAttempts: number;
}

/**
 * Mặc định cho outbox: 30s → 1p → 2p → 4p → 8p (trần 15 phút), hỏng 5 lần thì vào hàng đợi chết.
 * Giữ nguyên `maxAttempts = 5` như hành vi cũ (`attempts < 5`) để không đổi nghiệp vụ.
 */
export const DEFAULT_RETRY: RetryPolicy = { baseMs: 30_000, maxMs: 15 * 60_000, maxAttempts: 5 };

/**
 * Giãn cách trước lần thử KẾ TIẾP, tính từ số lần đã thử và hỏng.
 *
 * `attempts` = số lần ĐÃ thử (0 nghĩa là chưa thử lần nào — lần chạy đầu không phải chờ).
 * Công thức: `baseMs * 2^(attempts-1)`, cắt trần ở `maxMs`. Không có yếu tố ngẫu nhiên
 * để kết quả kiểm thử được và để hai worker cùng tính ra một mốc (mốc do CSDL giữ, không do worker).
 */
export function retryDelayMs(attempts: number, policy: RetryPolicy = DEFAULT_RETRY): number {
  const n = Math.floor(attempts);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // 2^30 đã vượt xa mọi trần thực tế — chặn trước để không tràn số
  const shift = Math.min(n - 1, 30);
  return Math.min(policy.baseMs * 2 ** shift, policy.maxMs);
}

/** Mốc được phép thử lại, tính từ thời điểm vừa hỏng */
export function nextAttemptAt(failedAt: Date, attempts: number, policy: RetryPolicy = DEFAULT_RETRY): Date {
  return new Date(failedAt.getTime() + retryDelayMs(attempts, policy));
}

/** Đã hỏng quá số lần cho phép → chuyển vào hàng đợi chết, thôi không thử lại */
export function isDeadLettered(attempts: number, policy: RetryPolicy = DEFAULT_RETRY): boolean {
  return Math.floor(attempts) >= policy.maxAttempts;
}

/**
 * Tính trạng thái mới của một bản ghi việc nền sau một lần chạy HỎNG.
 * Trả về đủ ba cột cần ghi xuống: số lần đã thử, mốc thử lại, có vào hàng đợi chết chưa.
 */
export function failureUpdate(
  failedAt: Date,
  attemptsBefore: number,
  error: string,
  policy: RetryPolicy = DEFAULT_RETRY,
): { attempts: number; nextAttemptAt: Date; deadLettered: boolean; lastError: string } {
  const attempts = Math.max(0, Math.floor(attemptsBefore)) + 1;
  const deadLettered = isDeadLettered(attempts, policy);
  return {
    attempts,
    nextAttemptAt: nextAttemptAt(failedAt, attempts, policy),
    deadLettered,
    // Cắt ngắn để một lỗi dài (stack trace, câu SQL) không thổi phồng bảng và không lộ dữ liệu
    lastError: truncateError(error),
  };
}

/** Lỗi lưu xuống CSDL: một dòng, tối đa 500 ký tự, bỏ xuống dòng */
export function truncateError(error: string, max = 500): string {
  const one = error.replace(/\s+/g, " ").trim();
  return one.length <= max ? one : `${one.slice(0, max - 1)}…`;
}

/* ------------------------------------------------------------------ */
/* 2) Chọn lô                                                          */
/* ------------------------------------------------------------------ */

/** Trần cứng cho `pageSize` của mọi thủ tục danh sách — chặn client hỏi 1 triệu dòng */
export const MAX_PAGE_SIZE = 200;

/** Cắt `pageSize` do client gửi lên về khoảng hợp lệ [1, max] */
export function clampPageSize(requested: number | null | undefined, fallback = 50, max = MAX_PAGE_SIZE): number {
  const n = Math.floor(requested ?? fallback);
  if (!Number.isFinite(n) || n < 1) return Math.min(fallback, max);
  return Math.min(n, max);
}

/** Số trang tính từ tổng số dòng — luôn ≥ 1 để giao diện không hiện "trang 1/0" */
export function pageCount(total: number, pageSize: number): number {
  if (pageSize < 1) return 1;
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

/** `offset` của một trang; trang < 1 coi như trang 1 */
export function pageOffset(page: number | null | undefined, pageSize: number): number {
  const p = Math.max(1, Math.floor(page ?? 1));
  return (p - 1) * pageSize;
}

/**
 * Chia một khối lượng lớn thành các lô `limit`/`offset` để xuất dữ liệu theo nhiều lượt đọc.
 * Lô cuối là phần dư. Tổng ≤ 0 thì không có lô nào (không đọc CSDL lần nào).
 */
export function batchRanges(total: number, batchSize: number): { offset: number; limit: number }[] {
  const t = Math.floor(total);
  const size = Math.floor(batchSize);
  if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(size) || size < 1) return [];
  const out: { offset: number; limit: number }[] = [];
  for (let offset = 0; offset < t; offset += size) out.push({ offset, limit: Math.min(size, t - offset) });
  return out;
}

/**
 * Còn lô nào nữa không, khi đọc theo con trỏ: đọc `batchSize + 1` dòng, nếu về đủ thì còn trang sau.
 * Trả về đúng `batchSize` dòng để trả cho người gọi, kèm cờ `hasMore`.
 */
export function takeBatch<T>(rows: readonly T[], batchSize: number): { items: T[]; hasMore: boolean } {
  const size = Math.max(1, Math.floor(batchSize));
  return { items: rows.slice(0, size), hasMore: rows.length > size };
}

/* ------------------------------------------------------------------ */
/* 3) Cắt ngưỡng đo                                                    */
/* ------------------------------------------------------------------ */

/** Ngưỡng mặc định: thủ tục chạy lâu hơn 1000 ms thì ghi log */
export const SLOW_PROCEDURE_MS = 1000;

/** Có ghi log cho lượt chạy này không? (>= ngưỡng, ngưỡng ≤ 0 nghĩa là ghi tất) */
export function shouldLogSlow(durationMs: number, thresholdMs: number = SLOW_PROCEDURE_MS): boolean {
  if (!Number.isFinite(durationMs) || durationMs < 0) return false;
  if (thresholdMs <= 0) return true;
  return durationMs >= thresholdMs;
}

export interface SlowLogInput {
  /** Tên thủ tục tRPC, vd "inbox.today" */
  path: string;
  durationMs: number;
  /** Số truy vấn CSDL đã chạy trong lượt đó */
  queries: number;
  ok?: boolean;
}

/**
 * Dòng log cho một thủ tục chậm — CHỈ tên thủ tục, thời lượng, số truy vấn.
 * KHÔNG kèm tham số, không id, không tên người, không SĐT: log chảy ra tệp / dịch vụ ngoài.
 *
 * Tên thủ tục phải đúng dạng `router.procedure`; sai dạng (có tham số, có xuống dòng…) thì
 * ghi `unknown` chứ KHÔNG cắt bớt ký tự lạ — cắt bớt vẫn để lọt phần số của một SĐT bị nhét vào.
 */
const PROCEDURE_PATH = /^[a-zA-Z][a-zA-Z0-9_-]*(\.[a-zA-Z][a-zA-Z0-9_-]*)*$/;

export function slowProcedureLog(input: SlowLogInput): string {
  const raw = input.path.trim();
  const path = raw.length > 0 && raw.length <= 80 && PROCEDURE_PATH.test(raw) ? raw : "unknown";
  const ms = Math.round(Math.max(0, input.durationMs));
  const q = Math.max(0, Math.floor(input.queries));
  return `slow-procedure path=${path} ms=${ms} queries=${q} ok=${input.ok === false ? "false" : "true"}`;
}

/** Đọc ngưỡng từ biến môi trường; giá trị sai / thiếu thì về mặc định */
export function slowThresholdFromEnv(raw: string | undefined, fallback = SLOW_PROCEDURE_MS): number {
  if (raw === undefined || raw === null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}
