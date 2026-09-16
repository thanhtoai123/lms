/**
 * Áp dụng các file SQL trong ./sql theo thứ tự tên file.
 * Dùng: pnpm --filter @satarobo/db exec tsx src/apply-sql.ts
 */
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "sql");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL chưa được cấu hình");

const sql = postgres(url, { max: 1 });
try {
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    console.log(`→ ${f}`);
    await sql.unsafe(readFileSync(join(dir, f), "utf8"));
  }
  console.log("✔ SQL applied");
} finally {
  await sql.end();
}
