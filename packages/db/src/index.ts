import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

export * from "./schema/index";
export * from "./health";
export { schema };

export type Database = ReturnType<typeof createDb>;

let _db: Database | undefined;

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL chưa được cấu hình");
  // prepare:false để tương thích PgBouncer/Supabase pooler (transaction mode)
  const client = postgres(url, { prepare: false, max: 10 });
  return drizzle(client, { schema, casing: "snake_case" });
}

/** Singleton cho runtime Next.js (tránh mở nhiều pool khi HMR) */
export function getDb(): Database {
  if (!_db) _db = createDb();
  return _db;
}
