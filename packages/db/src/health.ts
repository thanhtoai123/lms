/**
 * Nhận diện lỗi "không kết nối được cơ sở dữ liệu" và đổi thành thông báo tiếng Việt dễ hiểu.
 *
 * Khi Postgres chưa chạy (thường là Docker Desktop đang tắt), thư viện ném ra lỗi kèm
 * NGUYÊN VĂN câu truy vấn và tên mọi cột — vừa khó hiểu với người vận hành, vừa lộ cấu trúc
 * bảng nếu lọt ra ngoài. Hàm này gói lại thành một câu nói rõ nguyên nhân và cách xử lý.
 */

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
