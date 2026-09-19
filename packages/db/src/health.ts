/**
 * Nhận diện lỗi "không kết nối được cơ sở dữ liệu" và đổi thành thông báo tiếng Việt dễ hiểu.
 *
 * Khi Postgres chưa chạy (thường là Docker Desktop đang tắt), thư viện ném ra lỗi kèm
 * NGUYÊN VĂN câu truy vấn và tên mọi cột — vừa khó hiểu với người vận hành, vừa lộ cấu trúc
 * bảng nếu lọt ra ngoài. Hàm này gói lại thành một câu nói rõ nguyên nhân và cách xử lý.
 */

import { sql, type SQL } from "drizzle-orm";
import { outbox } from "./schema/index";

/** Mã lỗi của tầng mạng / driver khi không mở được kết nối tới Postgres */
const CONNECTION_CODES = new Set([
  "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH", "EPIPE", "ETIMEDOUT",
  "CONNECT_TIMEOUT", "CONNECTION_CLOSED", "CONNECTION_DESTROYED", "CONNECTION_ENDED", "CONNECTION_REFUSED",
]);

function codesOf(e: unknown, depth = 0): string[] {
  if (!e || typeof e !== "object" || depth > 4) return [];
  const o = e as { code?: unknown; cause?: unknown; errors?: unknown };
  const out: string[] = [];
  if (typeof o.code === "string") out.push(o.code);
  if (o.cause) out.push(...codesOf(o.cause, depth + 1));
  if (Array.isArray(o.errors)) for (const x of o.errors) out.push(...codesOf(x, depth + 1));
  return out;
}

/** Lỗi này là do không kết nối được CSDL (chứ không phải truy vấn sai)? */
export function isDbUnreachable(e: unknown): boolean {
  return codesOf(e).some((c) => CONNECTION_CODES.has(c));
}

export const DB_UNREACHABLE_MESSAGE =
  "Không kết nối được cơ sở dữ liệu. Hãy bật Docker Desktop rồi chạy `pnpm khoi-dong` (hoặc `docker compose up -d`) và tải lại trang.";

export class DbUnreachableError extends Error {
  readonly code = "DB_UNREACHABLE";
  constructor() {
    super(DB_UNREACHABLE_MESSAGE);
    this.name = "DbUnreachableError";
  }
}

/**
 * Bọc một truy vấn: mất kết nối thì ném lỗi tiếng Việt rõ ràng (không kèm câu SQL),
 * còn mọi lỗi khác giữ nguyên để không che mất lỗi lập trình thật.
 */
export async function withDbErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (isDbUnreachable(e)) throw new DbUnreachableError();
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* Thăm dò "sẵn sàng nhận lưu lượng" (readiness)                        */
/* ------------------------------------------------------------------ */

export interface ReadinessProbe {
  /** Số việc nền còn chờ (chưa xử lý, chưa vào hàng đợi chết) */
  pending: number;
  /** Việc chờ lâu nhất, tính bằng giây */
  oldestSec: number;
}

/**
 * Một câu truy vấn nhẹ vừa xác nhận CSDL còn trả lời, vừa đo tồn đọng việc nền.
 *
 * Đặt ở gói `db` (chứ không ở route của web) để `drizzle-orm` không bị kéo vào
 * danh sách phụ thuộc của ứng dụng web chỉ vì một endpoint kiểm tra sức khoẻ.
 */
export async function readinessProbe(db: {
  execute: (q: SQL) => Promise<unknown>;
}): Promise<ReadinessProbe> {
  const rows = (await db.execute(sql`
    select
      count(*) filter (where processed_at is null and dead_letter_at is null)::int as pending,
      coalesce(extract(epoch from (now() - min(created_at) filter (where processed_at is null and dead_letter_at is null)))::int, 0) as oldest_sec
    from ${outbox}
  `)) as unknown as { pending: number; oldest_sec: number }[];
  const r = rows[0] ?? { pending: 0, oldest_sec: 0 };
  return { pending: Number(r.pending ?? 0), oldestSec: Number(r.oldest_sec ?? 0) };
}
