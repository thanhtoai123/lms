/**
 * Áp luật cách ly trung tâm (tenant) vào tầng dữ liệu.
 *
 * Ba việc phải làm ở MỌI service:
 *  1. Truy vấn danh sách → thêm `tenantCond(ctx, bang)` vào mệnh đề WHERE;
 *  2. Nạp bản ghi theo id → `assertTenant(ctx, row)` TRƯỚC khi trả về hoặc ghi đè;
 *  3. Trả dữ liệu ra ngoài tenant → `redact(ctx, row)` (hoặc `redact(ctx, row, tenantId)`)
 *     để che PII theo cấu hình của trung tâm sở hữu dòng dữ liệu.
 *
 * Luật thuần nằm ở packages/core/src/org/tenant.ts; file này chỉ nối vào Drizzle và ngữ cảnh tRPC.
 */
import { inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { centers } from "@satarobo/db";
import {
  assertTenantScope, assertTransferAllowed, canSeePii, canSeeFinanceDetail, assertFinanceDetail, maskOutsideTenant, withSettingsDefaults,
  TenantIsolationError, type TenantRef, type TenantSettings,
} from "@satarobo/core";
import type { Context, TenantRuntime } from "../context";

type Ctx = Pick<Context, "tenantId" | "tenantIds" | "tenants">;
/** Bảng Drizzle có cột tenant_id */
type TenantTable = { tenantId: PgColumn };

/**
 * Điều kiện lọc theo tenant cho MỌI truy vấn danh sách.
 * Dòng chưa gắn tenant (dữ liệu di sản) vẫn hiện — trigger CSDL sẽ điền dần về tenant mặc định,
 * nhờ vậy hệ thống một-tenant chạy y như trước.
 */
export function tenantCond(ctx: Ctx, table: TenantTable): SQL {
  if (!ctx.tenantIds.length) return sql`true`;
  return or(isNull(table.tenantId), inArray(table.tenantId, ctx.tenantIds))!;
}

/** Chỉ đúng một tenant (dùng khi đã biết chắc tenant đích, vd bảng kê nhân bản) */
export function onlyTenant(table: TenantTable, tenantId: string): SQL {
  return inArray(table.tenantId, [tenantId]);
}

/** Chặn đọc / ghi chéo tenant sau khi nạp bản ghi theo id */
export function assertTenant(ctx: Ctx, row: { tenantId?: string | null } | null | undefined, what = "Bản ghi"): void {
  if (!row) return;
  assertTenantScope(ctx.tenantIds, row, what);
}

export function tenantById(ctx: Ctx, tenantId: string | null | undefined): TenantRuntime | null {
  if (!tenantId) return null;
  return ctx.tenants.find((t) => t.id === tenantId) ?? null;
}

/** Tenant của chính người đăng nhập */
export function myTenant(ctx: Ctx): TenantRuntime | null {
  return tenantById(ctx, ctx.tenantId);
}

function refOf(t: TenantRuntime): TenantRef {
  return { id: t.id, code: t.code, name: t.name, type: t.type, status: t.status };
}

/** Cấu hình quyền riêng tư của một tenant (thiếu dòng cấu hình thì lấy mặc định theo loại) */
export function settingsOf(ctx: Ctx, tenantId: string | null | undefined): TenantSettings {
  const t = tenantById(ctx, tenantId);
  return t ? t.settings : withSettingsDefaults("OWNED");
}

/** Người đang đăng nhập có được xem PII của tenant này không */
export function canSeePiiOf(ctx: Ctx, tenantId: string | null | undefined): boolean {
  const t = tenantById(ctx, tenantId);
  if (!t) return true; // dữ liệu chưa gắn tenant
  return canSeePii({ tenantId: ctx.tenantId, assignments: [] }, refOf(t), t.settings);
}

/** Người đang đăng nhập có được xem CHI TIẾT tài chính của tenant này không */
export function canSeeFinanceDetailOf(ctx: Ctx, tenantId: string | null | undefined): boolean {
  const t = tenantById(ctx, tenantId);
  if (!t) return true;
  return canSeeFinanceDetail({ tenantId: ctx.tenantId, assignments: [] }, refOf(t), t.settings);
}

/** Ném lỗi tiếng Việt khi cố xem chi tiết tài chính của tenant không chia sẻ */
export function assertFinanceDetailOf(ctx: Ctx, tenantId: string | null | undefined): void {
  const t = tenantById(ctx, tenantId);
  if (!t) return;
  assertFinanceDetail({ tenantId: ctx.tenantId, assignments: [] }, refOf(t), t.settings);
}

/** Che PII một bản ghi của tenant khác nếu tenant đó không chia sẻ */
export function redact<T extends { tenantId?: string | null }>(ctx: Ctx, row: T): T;
export function redact<T>(ctx: Ctx, row: T, tenantId: string | null | undefined): T;
export function redact<T>(ctx: Ctx, row: T, tenantId?: string | null): T {
  const tid = tenantId === undefined ? (row as { tenantId?: string | null })?.tenantId ?? null : tenantId;
  return canSeePiiOf(ctx, tid) ? row : maskOutsideTenant(row);
}

/** Che PII cho cả một danh sách (mỗi dòng theo tenant của chính nó) */
export function redactList<T extends { tenantId?: string | null }>(ctx: Ctx, rows: T[]): T[] {
  return rows.map((r) => redact(ctx, r));
}

/**
 * Chặn chuyển học viên / lead sang cơ sở thuộc trung tâm khác khi trung tâm đó
 * tắt "Cho phép chuyển học viên / lead sang trung tâm khác".
 */
export async function assertCenterTransferAllowed(
  ctx: Ctx & { db: Context["db"] },
  input: { fromCenterId: string | null | undefined; toCenterId: string | null | undefined; what?: string },
): Promise<void> {
  const { fromCenterId, toCenterId } = input;
  if (!fromCenterId || !toCenterId || fromCenterId === toCenterId) return;
  const rows = await ctx.db.select({ id: centers.id, tenantId: centers.tenantId }).from(centers).where(inArray(centers.id, [fromCenterId, toCenterId]));
  const from = rows.find((r) => r.id === fromCenterId)?.tenantId ?? null;
  const to = rows.find((r) => r.id === toCenterId)?.tenantId ?? null;
  assertTransferAllowed({ from, to, fromSettings: settingsOf(ctx, from), toSettings: settingsOf(ctx, to), what: input.what ?? "học viên" });
}

/** Danh sách tenantId mà người dùng KHÔNG được xem PII (giao diện dùng để hiện nhãn "đã che") */
export function maskedTenantIds(ctx: Ctx): string[] {
  return ctx.tenantIds.filter((id) => !canSeePiiOf(ctx, id));
}

export { TenantIsolationError };
