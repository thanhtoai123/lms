import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";
import { queryCountingLogger } from "./metrics";

export * from "./schema/index";
export * from "./health";
export * from "./metrics";
export { schema };

export type Database = ReturnType<typeof createDb>;

let _db: Database | undefined;

/** Đọc một biến môi trường dạng số; thiếu / sai thì dùng mặc định */
function num(raw: string | undefined, fallback: number, min = 1): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min) return fallback;
  return Math.floor(n);
}

/**
 * Giới hạn kết nối và thời gian chờ — đặt ở MỘT chỗ để mọi tiến trình (web, worker, script)
 * đều chung luật, và chỉnh được bằng biến môi trường khi lên máy thật.
 *
 *  - `max`: số kết nối mỗi tiến trình. Mặc định 10. Postgres mặc định chỉ có 100 kết nối,
 *    nên nhiều tiến trình web × 10 là chạm trần rất nhanh → đặt DB_POOL_MAX theo số tiến trình.
 *  - `statement_timeout`: một câu truy vấn chạy quá lâu bị Postgres huỷ, KHÔNG giữ kết nối
 *    mãi mãi rồi làm cạn pool (trước đây một truy vấn tải cả bảng có thể treo vô hạn).
 *  - `idle_in_transaction_session_timeout`: transaction bị bỏ quên không giữ khoá mãi.
 *  - `connect_timeout` / `idle_timeout`: mất mạng thì báo lỗi nhanh thay vì treo người dùng.
 */
export interface DbPoolOptions {
  max: number;
  connectTimeoutSec: number;
  idleTimeoutSec: number;
  statementTimeoutMs: number;
  idleInTransactionTimeoutMs: number;
}

export function poolOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): DbPoolOptions {
  return {
    max: num(env.DB_POOL_MAX, 10),
    connectTimeoutSec: num(env.DB_CONNECT_TIMEOUT_SEC, 10),
    idleTimeoutSec: num(env.DB_IDLE_TIMEOUT_SEC, 30),
    // 15 giây: mọi màn hình của hệ đều phải trả lời nhanh hơn thế rất nhiều.
    // Việc nền cần lâu hơn thì tự đặt `set local statement_timeout` trong transaction của nó.
    statementTimeoutMs: num(env.DB_STATEMENT_TIMEOUT_MS, 15_000),
    idleInTransactionTimeoutMs: num(env.DB_IDLE_TX_TIMEOUT_MS, 30_000),
  };
}

/**
 * `overrides` dành cho tiến trình nền: worker có việc quét / ẩn danh hoá chạy lâu hơn
 * một màn hình web, nên nó tự nới `statementTimeoutMs` thay vì nới cho cả hệ.
 */
export function createDb(url = process.env.DATABASE_URL, overrides: Partial<DbPoolOptions> = {}) {
  if (!url) throw new Error("DATABASE_URL chưa được cấu hình");
  const o = { ...poolOptionsFromEnv(), ...overrides };
  // prepare:false để tương thích PgBouncer/Supabase pooler (transaction mode)
  const client = postgres(url, {
    prepare: false,
    max: o.max,
    connect_timeout: o.connectTimeoutSec,
    idle_timeout: o.idleTimeoutSec,
    connection: {
      statement_timeout: String(o.statementTimeoutMs),
      idle_in_transaction_session_timeout: String(o.idleInTransactionTimeoutMs),
    },
  });
  // `logger` ở đây KHÔNG in gì — chỉ đếm số truy vấn cho phần đo thủ tục chậm (xem metrics.ts)
  return drizzle(client, { schema, casing: "snake_case", logger: queryCountingLogger });
}

/** Singleton cho runtime Next.js (tránh mở nhiều pool khi HMR) */
export function getDb(): Database {
  if (!_db) _db = createDb();
  return _db;
}
