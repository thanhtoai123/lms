/**
 * Bộ ghi log dùng chung — CHE DỮ LIỆU CÁ NHÂN trước khi in ra.
 *
 * Vì sao cần: đường xử lý lỗi của tRPC trước đây `console.error(path, error)` in nguyên
 * đối tượng lỗi. Lỗi từ tầng CSDL của `postgres-js` mang theo cả `query` (nguyên văn câu SQL),
 * `parameters` (giá trị tham số: SĐT, email, CCCD phụ huynh) và `detail`
 * (`Key (phone)=(0912345678) already exists`). Log máy chủ thường đi thẳng sang dịch vụ
 * bên thứ ba, nên đó là một đường rò PII trẻ em và phụ huynh ra ngoài.
 *
 * Nguyên tắc ở đây:
 *  1. Chỉ lấy `message` của lỗi; KHÔNG bao giờ chạm `query` / `parameters`.
 *  2. Xoá dấu vết SQL và tên cột khỏi chuỗi (`scrubSql`).
 *  3. Cho phần còn lại đi qua `maskPii` / `maskPiiText` (dùng lại bộ che của nhật ký audit).
 *  4. Thông báo trả cho **máy khách** thì về câu tiếng Việt chung, không kèm SQL / tên cột.
 *
 * Hàm thuần + sink tiêm được ⇒ kiểm thử không cần bắt `console`.
 */
import { maskPii, maskPiiText } from "../system/pii.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
  level: LogLevel;
  /** ISO 8601 */
  time: string;
  /** Nguồn phát: `trpc`, `worker`, `sepay-webhook`… */
  scope: string;
  msg: string;
  data?: Record<string, unknown>;
}

export type LogSink = (record: LogRecord) => void;

/* ------------------------------------------------------------------ */
/* Làm sạch lỗi                                                        */
/* ------------------------------------------------------------------ */

/** Câu trả cho người dùng khi lỗi không thuộc nghiệp vụ (không kèm SQL, tên bảng, tên cột) */
export const GENERIC_ERROR_MESSAGE = "Hệ thống gặp lỗi khi xử lý yêu cầu. Vui lòng thử lại; nếu vẫn lỗi hãy báo quản trị viên kèm thời điểm thao tác.";

/** Dấu hiệu chuỗi đang mang nguyên văn câu truy vấn */
const SQL_START = /^\s*(select|insert|update|delete|with|create|alter|drop|truncate|copy)\s/i;
const SQL_WORDS = /\b(select|insert\s+into|update|delete\s+from|inner\s+join|left\s+join|on\s+conflict|returning|group\s+by|order\s+by|values\s*\(|where\b)/gi;
/** Định danh có nháy kép: `"students"."full_name"` — lộ cấu trúc bảng */
const QUOTED_IDENT = /"[A-Za-z_][A-Za-z0-9_$]*"(\s*\.\s*"[A-Za-z_][A-Za-z0-9_$]*")?/g;
/** Tham số vị trí `$1`, `$12` */
const PLACEHOLDER = /\$\d+/g;
/** `Key (phone)=(0912345678) already exists` — vừa lộ tên cột vừa lộ giá trị thật */
const PG_KEY_DETAIL = /Key\s*\([^)]*\)\s*=\s*\([^)]*\)/gi;

/**
 * Bỏ mọi dấu vết SQL khỏi một chuỗi: nguyên văn câu truy vấn, tên bảng / cột trong nháy kép,
 * tham số vị trí, và mẫu `Key (cột)=(giá trị)` của Postgres.
 */
export function scrubSql(text: string): string {
  if (!text) return text;
  if (SQL_START.test(text)) return "«câu truy vấn đã lược bỏ»";
  const hits = text.match(SQL_WORDS);
  if (hits && hits.length >= 2) return "«câu truy vấn đã lược bỏ»";
  return text
    .replace(PG_KEY_DETAIL, "«khoá trùng»")
    .replace(QUOTED_IDENT, "«cột»")
    .replace(PLACEHOLDER, "«tham số»");
}

/** Mã lỗi SQLSTATE của Postgres luôn có 5 ký tự chữ-số */
const isPgCode = (v: unknown): v is string => typeof v === "string" && /^[0-9A-Z]{5}$/.test(v);

export interface RedactedError {
  name: string;
  /** Mã lỗi (SQLSTATE của Postgres, hoặc mã domain như `DB_UNREACHABLE`) */
  code?: string;
  /** Tên ràng buộc bị vi phạm — hữu ích cho vận hành, không phải PII */
  constraint?: string;
  msg: string;
}

/**
 * Rút lỗi về phần AN TOÀN để ghi log: tên, mã, ràng buộc và một câu thông báo
 * đã lược SQL rồi che PII. Không đụng `query` / `parameters`.
 */
export function redactErrorForLog(e: unknown): RedactedError {
  if (typeof e === "string") return { name: "Error", msg: maskPiiText(scrubSql(e)) };
  if (!e || typeof e !== "object") return { name: "Unknown", msg: String(e ?? "") };
  const o = e as { name?: unknown; message?: unknown; code?: unknown; constraint_name?: unknown; constraint?: unknown };
  const out: RedactedError = {
    name: typeof o.name === "string" ? o.name : "Error",
    msg: maskPiiText(scrubSql(typeof o.message === "string" ? o.message : "")),
  };
  if (typeof o.code === "string" && o.code) out.code = o.code;
  const c = o.constraint_name ?? o.constraint;
  if (typeof c === "string" && c) out.constraint = c;
  return out;
}

/**
 * Thông báo trả cho MÁY KHÁCH. Lỗi nghiệp vụ (do service tự ném, câu tiếng Việt) giữ nguyên;
 * lỗi từ tầng CSDL / lỗi lập trình thì về câu chung — máy khách không được thấy SQL,
 * tên bảng, tên cột hay giá trị tham số.
 */
export function clientSafeMessage(e: unknown, fallback = GENERIC_ERROR_MESSAGE): string {
  if (!e || typeof e !== "object") return fallback;
  const o = e as { message?: unknown; code?: unknown };
  const msg = typeof o.message === "string" ? o.message.trim() : "";
  if (!msg) return fallback;
  // Lỗi Postgres (SQLSTATE) → không bao giờ chuyển nguyên văn ra ngoài
  if (isPgCode(o.code)) return fallback;
  if (SQL_START.test(msg)) return fallback;
  if (QUOTED_IDENT.test(msg)) {
    QUOTED_IDENT.lastIndex = 0;
    return fallback;
  }
  QUOTED_IDENT.lastIndex = 0;
  const hits = msg.match(SQL_WORDS);
  if (hits && hits.length >= 2) return fallback;
  if (/violates|constraint|relation .* does not exist|column .* does not exist|duplicate key/i.test(msg)) return fallback;
  if (msg.length > 300) return fallback;
  return msg;
}

/* ------------------------------------------------------------------ */
/* Dựng bản ghi log                                                    */
/* ------------------------------------------------------------------ */

/** Độ sâu tối đa khi đi vào dữ liệu kèm log — sâu hơn thì cắt, log không phải nơi đổ cả đối tượng */
const MAX_LOG_DEPTH = 6;

/**
 * Bản sao an toàn: cắt vòng lặp tham chiếu và cắt độ sâu.
 * Không có bước này, một đối tượng tự trỏ vào chính nó (rất hay gặp ở lỗi có `cause`)
 * làm `maskPii` đệ quy vô hạn và **giết tiến trình máy chủ** — biến một dòng log thành sự cố.
 */
function safeClone(value: unknown, seen: WeakSet<object>, depth = 0): unknown {
  if (!value || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (depth >= MAX_LOG_DEPTH) return "«quá sâu»";
  const o = value as object;
  if (seen.has(o)) return "«tham chiếu vòng»";
  seen.add(o);
  try {
    if (Array.isArray(value)) return value.slice(0, 100).map((v) => safeClone(v, seen, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = safeClone(v, seen, depth + 1);
    return out;
  } finally {
    seen.delete(o);
  }
}

const looksLikeError = (v: unknown): boolean =>
  v instanceof Error || (!!v && typeof v === "object" && "message" in (v as object) && "name" in (v as object));

/** Đổi mọi lỗi nằm trong `data` thành dạng đã lược, rồi che PII toàn bộ */
export function normalizeLogData(data?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const seen = new WeakSet<object>();
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = looksLikeError(v) ? redactErrorForLog(v) : safeClone(v, seen);
  }
  return maskPii(out);
}

/** Dựng một bản ghi log đã che PII (hàm thuần — `now` truyền vào để kiểm thử) */
export function buildLogRecord(
  level: LogLevel,
  scope: string,
  msg: string,
  data?: Record<string, unknown>,
  now: number = Date.now(),
): LogRecord {
  const rec: LogRecord = {
    level,
    time: new Date(now).toISOString(),
    scope,
    msg: maskPiiText(scrubSql(String(msg ?? ""))),
  };
  const d = normalizeLogData(data);
  if (d && Object.keys(d).length) rec.data = d;
  return rec;
}

/** Một dòng JSON cho mỗi bản ghi — dễ gom vào dịch vụ log tập trung */
export function formatLogRecord(r: LogRecord): string {
  try {
    return JSON.stringify(r);
  } catch {
    return JSON.stringify({ level: r.level, time: r.time, scope: r.scope, msg: r.msg, data: "«không tuần tự hoá được»" });
  }
}

/* ------------------------------------------------------------------ */
/* Logger                                                              */
/* ------------------------------------------------------------------ */

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  /** Logger con cùng gốc: `log.child("outbox")` → scope `worker:outbox` */
  child(sub: string): Logger;
}

/** Đích mặc định: `console` — dòng JSON, `warn`/`error` ra stderr */
export const consoleSink: LogSink = (r) => {
  const line = formatLogRecord(r);
  if (r.level === "error") console.error(line);
  else if (r.level === "warn") console.warn(line);
  else console.log(line);
};

/**
 * Tạo logger cho một phạm vi. MỌI chỗ ghi log của `packages/api` và `apps/web`
 * phải đi qua đây thay vì gọi thẳng `console.*`.
 */
export function createLogger(scope: string, sink: LogSink = consoleSink): Logger {
  const emit = (level: LogLevel) => (msg: string, data?: Record<string, unknown>) => sink(buildLogRecord(level, scope, msg, data));
  return {
    debug: emit("debug"),
    info: emit("info"),
    warn: emit("warn"),
    error: emit("error"),
    child: (sub: string) => createLogger(`${scope}:${sub}`, sink),
  };
}
