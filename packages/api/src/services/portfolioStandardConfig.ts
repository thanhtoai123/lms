/**
 * CHUẨN HỒ SƠ HỌC TẬP — đọc cấu hình vận hành (nhóm "Hồ sơ học tập", theo tenant, cơ sở ghi đè được)
 * và dựng biểu thức SQL theo cơ sở (hạn hoàn thiện phiếu, hạn học bạ mốc, ngưỡng) để tổng hợp bằng SQL.
 * Không phụ thuộc service khác (tránh vòng import).
 */
import { eq, like, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { appSettings, type Database } from "@satarobo/db";
import { resolveOps, standardFromOps, type PortfolioStandard } from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { getOps } from "./opsSettings";

type Db = ProtectedContext["db"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StandardSet {
  global: PortfolioStandard;
  /** Cơ sở có cấu hình riêng (ghi đè) */
  byCenter: Map<string, PortfolioStandard>;
}

/** Chuẩn hiệu lực của một cơ sở (mặc định ← toàn hệ thống ← cơ sở) */
export async function standardFor(db: Db | Database, centerId: string | null): Promise<PortfolioStandard> {
  return standardFromOps(await getOps(db, centerId));
}

/** Chuẩn của toàn hệ thống + mọi cơ sở có ghi đè — MỘT truy vấn (dùng cho báo cáo nhiều cơ sở) */
export async function loadStandards(db: Db | Database): Promise<StandardSet> {
  const d = db as unknown as Db;
  const rows = await d.select({ key: appSettings.key, value: appSettings.value }).from(appSettings)
    .where(or(eq(appSettings.key, "ops"), like(appSettings.key, "ops:%")));
  const g = (rows.find((r) => r.key === "ops")?.value ?? null) as Record<string, unknown> | null;
  const byCenter = new Map<string, PortfolioStandard>();
  for (const r of rows) {
    const id = r.key.startsWith("ops:") ? r.key.slice(4) : "";
    if (!UUID_RE.test(id)) continue;
    byCenter.set(id, standardFromOps(resolveOps(g, (r.value ?? null) as Record<string, unknown> | null)));
  }
  return { global: standardFromOps(resolveOps(g, null)), byCenter };
}

export function standardOf(set: StandardSet, centerId: string | null | undefined): PortfolioStandard {
  return (centerId ? set.byCenter.get(centerId) : undefined) ?? set.global;
}

type PickFn = (s: PortfolioStandard) => number | boolean;

/** Hằng số an toàn cho SQL — chỉ số nguyên / bool đã qua `resolveOps`, không bao giờ là dữ liệu người dùng */
function lit(v: number | boolean): SQL {
  if (typeof v === "boolean") return sql.raw(v ? "true" : "false");
  return sql.raw(String(Number.isFinite(v) ? Math.trunc(v) : 0));
}

/**
 * Giá trị chuẩn theo cơ sở trong SQL: `case <cột cơ sở> when '<id>' then … else <toàn hệ thống> end`.
 * Chỉ liệt kê cơ sở có giá trị KHÁC toàn hệ thống — không có ghi đè thì là một hằng số.
 */
export function perCenter(centerCol: AnyPgColumn | SQL, set: StandardSet, pick: PickFn): SQL {
  const g = pick(set.global);
  const diff = [...set.byCenter.entries()].filter(([, s]) => pick(s) !== g);
  if (!diff.length) return lit(g);
  return sql`(case ${centerCol} ${sql.join(diff.map(([id, s]) => sql`when ${id}::uuid then ${lit(pick(s))}`), sql` `)} else ${lit(g)} end)`;
}

/** Hạn hoàn thiện phiếu = (ngày + giờ kết thúc buổi, giờ Việt Nam) + `sheetDeadlineHours` giờ — cùng quy tắc `sheetDeadline` ở core */
export function sheetDeadlineSql(dateCol: AnyPgColumn | SQL, endTimeCol: AnyPgColumn | SQL, centerCol: AnyPgColumn | SQL, set: StandardSet): SQL {
  return sql`((((${dateCol})::date + coalesce((${endTimeCol})::time, time '23:59')) at time zone 'Asia/Ho_Chi_Minh') + make_interval(hours => ${perCenter(centerCol, set, (s) => s.sheetDeadlineHours)}))`;
}

/** Hạn học bạ mốc = cuối ngày buổi mốc (giờ Việt Nam) + `milestoneDeadlineDays` ngày — cùng quy tắc `milestoneDeadline` ở core */
export function milestoneDeadlineSql(dateCol: AnyPgColumn | SQL, centerCol: AnyPgColumn | SQL, set: StandardSet): SQL {
  return sql`((((${dateCol})::date + time '23:59') at time zone 'Asia/Ho_Chi_Minh') + make_interval(days => ${perCenter(centerCol, set, (s) => s.milestoneDeadlineDays)}))`;
}

/** Hạn học bạ mốc dạng NGÀY (so với "hôm nay" theo giờ Việt Nam) */
export function milestoneDueDateSql(dateCol: AnyPgColumn | SQL, centerCol: AnyPgColumn | SQL, set: StandardSet): SQL {
  return sql`((${dateCol})::date + ${perCenter(centerCol, set, (s) => s.milestoneDeadlineDays)})`;
}
