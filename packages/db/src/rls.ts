/**
 * Đặt phạm vi trung tâm (tenant) cho MỘT giao dịch — phần ứng dụng của lớp phòng thủ RLS.
 *
 * Vì sao phải là giao dịch: pool `postgres-js` dùng chung kết nối cho nhiều lượt gọi, nên
 * `SET` ở mức phiên sẽ RÒ sang lượt gọi của người khác. `set_config(..., true)` chỉ sống trong
 * giao dịch hiện tại, nên luôn đúng người đúng việc.
 *
 * Chính sách RLS đọc hai biến này (xem packages/db/sql/0009_rls_tenant.sql).
 */
import { sql } from "drizzle-orm";
import { tenantSessionValue } from "@satarobo/core";
import type { Database } from "./index";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface TenantSessionScope {
  /** Các tenantId được thấy trong giao dịch này (thường là `ctx.tenantIds`) */
  tenantIds: readonly (string | null | undefined)[];
  /** Lệnh quản trị (migrate, seed, nhân bản tenant, worker) — bỏ qua RLS */
  bypass?: boolean;
}

/** Câu lệnh đặt biến phiên cho giao dịch hiện tại (tách riêng để test được) */
export function tenantSessionSql(scope: TenantSessionScope) {
  const ids = tenantSessionValue(scope.tenantIds);
  const bypass = scope.bypass ? "on" : "off";
  return sql`select set_config('app.tenant_ids', ${ids}, true), set_config('app.bypass_rls', ${bypass}, true)`;
}

/**
 * Chạy `fn` trong một giao dịch đã gắn phạm vi trung tâm.
 * Dùng cho các đường ghi / đọc muốn được CSDL bảo vệ thêm một lớp:
 *
 * ```ts
 * await withTenantSession(db, { tenantIds: ctx.tenantIds }, async (tx) => { ... });
 * ```
 */
export async function withTenantSession<T>(db: Database, scope: TenantSessionScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(tenantSessionSql(scope));
    return fn(tx);
  });
}

/** Giao dịch của lệnh quản trị: bỏ qua RLS, luôn ghi rõ trong nhật ký vận hành */
export async function withAdminSession<T>(db: Database, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withTenantSession(db, { tenantIds: [], bypass: true }, fn);
}
