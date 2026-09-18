/**
 * Nạp biến môi trường cho các lệnh chạy bằng `pnpm --filter @satarobo/db …`.
 *
 * `dotenv/config` chỉ đọc `.env` ở thư mục hiện tại; khi chạy qua pnpm filter thì
 * thư mục hiện tại là `packages/db`, trong khi `.env` của dự án nằm ở gốc monorepo.
 * File này đọc `.env` gần nhất trước, rồi đi ngược lên tới gốc — giá trị gần nhất thắng.
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// 1) .env ở thư mục đang chạy lệnh
config();

// 2) đi ngược từ packages/db lên gốc monorepo
let dir = dirname(fileURLToPath(import.meta.url));
for (let i = 0; i < 6; i++) {
  const p = join(dir, ".env");
  if (existsSync(p)) config({ path: p });
  const up = dirname(dir);
  if (up === dir) break;
  dir = up;
}
