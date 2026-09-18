/**
 * Xoá sạch lược đồ `public` rồi tạo lại — CHỈ dùng cho môi trường phát triển / kiểm thử.
 *
 * Dữ liệu mẫu (`seed.ts`) không idempotent: chạy lại trên CSDL đã có dữ liệu sẽ đụng
 * ràng buộc duy nhất. Quy trình chuẩn khi muốn làm mới máy dev:
 *
 *   pnpm db:reset && pnpm db:push && pnpm db:apply-sql && pnpm db:seed
 *
 * An toàn: từ chối chạy khi NODE_ENV=production, khi thiếu cờ ALLOW_DB_RESET=1,
 * hoặc khi DATABASE_URL không trỏ về máy cục bộ.
 */
import "./env";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL chưa được cấu hình");

if (process.env.NODE_ENV === "production") {
  throw new Error("Không xoá CSDL ở môi trường production");
}
if (process.env.ALLOW_DB_RESET !== "1") {
  throw new Error("Cần đặt ALLOW_DB_RESET=1 để xác nhận xoá sạch CSDL phát triển");
}

const host = (() => {
  try { return new URL(url).hostname; } catch { return ""; }
})();
const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal", "postgres", "db"]);
if (!LOCAL.has(host)) {
  throw new Error(`Chỉ xoá được CSDL trên máy cục bộ — DATABASE_URL đang trỏ tới "${host}"`);
}

const sql = postgres(url, { max: 1 });
try {
  await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  console.log(`✓ Đã xoá sạch và tạo lại lược đồ public trên ${host}`);
} finally {
  await sql.end();
}
