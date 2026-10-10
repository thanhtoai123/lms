import { eq } from "drizzle-orm";
import { appSettings, type Database } from "@satarobo/db";
import { normalizeChrome, type SiteChrome } from "@satarobo/core";

export const SITE_CHROME_KEY = "site_chrome";

/** Khung chung của website (đầu / chân trang). Chưa lưu gì thì dùng khung mặc định. Đọc công khai, không cần quyền. */
export async function getSiteChrome(db: Database): Promise<SiteChrome> {
  const r = await (db as unknown as { query: { appSettings: { findFirst(a: unknown): Promise<{ value: unknown } | undefined> } } }).query.appSettings.findFirst({ where: eq(appSettings.key, SITE_CHROME_KEY) });
  return normalizeChrome(r?.value ?? null);
}
