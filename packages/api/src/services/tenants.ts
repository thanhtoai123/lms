/**
 * Đọc / ghi hồ sơ trung tâm (tenant) và tuỳ chọn quyền riêng tư.
 * Số liệu tổng hợp của tenant nhượng quyền LUÔN hiện cho Hội sở chuỗi;
 * chi tiết (danh sách người, từng phiếu thu) thì theo công tắc của chính tenant đó.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  tenants, tenantSettings, centers, students, classes, leads, staff, payments, orders, users,
} from "@satarobo/db";
import {
  TENANT_TYPE_VI, TENANT_STATUS_VI, TENANT_SETTING_VI, TENANT_STATUSES, validateTenantSettings, requireReason,
  type TenantSettings, type TenantStatus,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { assertTenant, canSeePiiOf, canSeeFinanceDetailOf } from "./tenantScope";

const bad = (m: string) => new TRPCError({ code: "BAD_REQUEST", message: m });

/** Thẻ trung tâm trên màn /nhuong-quyen: chỉ số TỔNG HỢP, không kèm dữ liệu cá nhân */
export async function listTenants(ctx: ProtectedContext) {
  requirePermission(ctx, "tenant:read");
  const ids = ctx.tenantIds;
  if (!ids.length) return { items: [], canProvision: false, settingLabels: TENANT_SETTING_VI };

  const rows = await ctx.db
    .select({
      id: tenants.id, code: tenants.code, name: tenants.name, type: tenants.type, status: tenants.status,
      isDefault: tenants.isDefault, address: tenants.address, contractNo: tenants.contractNo,
      contractFrom: tenants.contractFrom, contractTo: tenants.contractTo, createdAt: tenants.createdAt,
      hoSeesPii: tenantSettings.hoSeesPii, hoSeesFinanceDetail: tenantSettings.hoSeesFinanceDetail,
      dataRetentionYears: tenantSettings.dataRetentionYears, allowCrossCenterTransfer: tenantSettings.allowCrossCenterTransfer,
      centers: sql<number>`(select count(*)::int from ${centers} c where c.tenant_id = ${tenants.id} and c.is_active)`,
      students: sql<number>`(select count(*)::int from ${students} s where s.tenant_id = ${tenants.id} and s.status in ('active','trial') and s.deleted_at is null)`,
      classes: sql<number>`(select count(*)::int from ${classes} c where c.tenant_id = ${tenants.id} and c.status in ('recruiting','running') and c.deleted_at is null)`,
      leads: sql<number>`(select count(*)::int from ${leads} l where l.tenant_id = ${tenants.id} and l.deleted_at is null)`,
      staff: sql<number>`(select count(*)::int from ${staff} st where st.tenant_id = ${tenants.id} and st.status <> 'resigned')`,
      revenue30d: sql<number>`(select coalesce(sum(p.amount), 0)::bigint from ${payments} p where p.tenant_id = ${tenants.id} and p.status = 'confirmed' and p.paid_at >= (current_date - 30))`,
      // Công nợ = tổng đơn chưa thu đủ trừ tiền đã xác nhận của chính đơn đó
      debt: sql<number>`(
        select coalesce(sum(greatest(o.total - coalesce((select sum(p2.amount) from ${payments} p2 where p2.order_id = o.id and p2.status = 'confirmed'), 0), 0)), 0)::bigint
          from ${orders} o where o.tenant_id = ${tenants.id} and o.status in ('pending_payment','partially_paid')
      )`,
    })
    .from(tenants)
    .leftJoin(tenantSettings, eq(tenantSettings.tenantId, tenants.id))
    .where(inArray(tenants.id, ids))
    .orderBy(desc(tenants.isDefault), asc(tenants.code));

  return {
    items: rows.map((r) => ({
      ...r,
      typeLabel: TENANT_TYPE_VI[r.type],
      statusLabel: TENANT_STATUS_VI[r.status],
      isMine: r.id === ctx.tenantId,
      /** Người đang xem có thấy dữ liệu cá nhân của trung tâm này không */
      seesPii: canSeePiiOf(ctx, r.id),
      seesFinanceDetail: canSeeFinanceDetailOf(ctx, r.id),
      revenue30d: Number(r.revenue30d ?? 0),
      debt: Number(r.debt ?? 0),
    })),
    canProvision: ctx.actor.assignments.some((a) => a.role === "SUPER_ADMIN"),
    settingLabels: TENANT_SETTING_VI,
  };
}

export async function getTenant(ctx: ProtectedContext, id: string) {
  requirePermission(ctx, "tenant:read");
  assertTenant(ctx, { tenantId: id }, "Trung tâm");
  const row = await ctx.db.query.tenants.findFirst({ where: eq(tenants.id, id) });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy trung tâm" });
  const settings = ctx.tenants.find((t) => t.id === id)?.settings ?? null;
  const centerRows = await ctx.db
    .select({ id: centers.id, code: centers.code, name: centers.name, address: centers.address, isActive: centers.isActive })
    .from(centers).where(eq(centers.tenantId, id)).orderBy(asc(centers.code));
  const [admin] = await ctx.db
    .select({ id: users.id, email: users.email, fullName: users.fullName, isActive: users.isActive, lockedReason: users.lockedReason })
    .from(users).where(and(eq(users.tenantId, id), eq(users.isActive, false))).limit(1);
  return {
    ...row,
    typeLabel: TENANT_TYPE_VI[row.type],
    statusLabel: TENANT_STATUS_VI[row.status],
    settings,
    settingLabels: TENANT_SETTING_VI,
    centers: centerRows,
    pendingAdmin: admin ?? null,
    isMine: row.id === ctx.tenantId,
    seesPii: canSeePiiOf(ctx, row.id),
    seesFinanceDetail: canSeeFinanceDetailOf(ctx, row.id),
    canEditSettings: canEditSettings(ctx, id),
  };
}

/**
 * Ai được đổi công tắc quyền riêng tư: CHÍNH trung tâm đó (quản trị của tenant).
 * Hội sở chuỗi không tự mở quyền xem dữ liệu của bên nhượng quyền — đó là điểm mấu chốt của cách ly.
 */
export function canEditSettings(ctx: ProtectedContext, tenantId: string): boolean {
  return ctx.tenantId === tenantId && ctx.actor.assignments.some((a) => a.role === "SUPER_ADMIN" && a.centerId === null);
}

export async function updateSettings(
  ctx: ProtectedContext,
  input: { tenantId: string } & Partial<TenantSettings> & { status?: TenantStatus; reason: string },
) {
  requirePermission(ctx, "tenant:update");
  assertTenant(ctx, { tenantId: input.tenantId }, "Trung tâm");
  const reason = requireReason(input.reason, 5);
  const cur = ctx.tenants.find((t) => t.id === input.tenantId);
  if (!cur) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy trung tâm" });
  if (!canEditSettings(ctx, input.tenantId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Chỉ quản trị của chính trung tâm đó mới đổi được tuỳ chọn quyền riêng tư — Hội sở chuỗi không tự mở quyền xem dữ liệu",
    });
  }
  const patch: Partial<TenantSettings> = {};
  for (const k of ["hoSeesPii", "hoSeesFinanceDetail", "allowCrossCenterTransfer"] as const) {
    if (input[k] !== undefined) patch[k] = input[k]!;
  }
  if (input.dataRetentionYears !== undefined) patch.dataRetentionYears = input.dataRetentionYears;
  const err = validateTenantSettings(patch);
  if (err) throw bad(err);
  if (input.status && !TENANT_STATUSES.includes(input.status)) throw bad("Trạng thái không hợp lệ");

  await ctx.db.transaction(async (tx) => {
    if (Object.keys(patch).length) {
      await tx.insert(tenantSettings).values({ tenantId: input.tenantId, ...cur.settings, ...patch, updatedBy: ctx.user.id })
        .onConflictDoUpdate({ target: tenantSettings.tenantId, set: { ...patch, updatedBy: ctx.user.id, updatedAt: new Date() } });
    }
    if (input.status) await tx.update(tenants).set({ status: input.status, updatedAt: new Date() }).where(eq(tenants.id, input.tenantId));
    await writeAudit(tx as unknown as ProtectedContext["db"], {
      actorId: ctx.user.id, action: "UPDATE", module: "tenant", entity: "tenant_settings", entityId: input.tenantId,
      before: cur.settings, after: { ...patch, ...(input.status ? { status: input.status } : {}) }, reason, ip: ctx.ip,
      tenantId: input.tenantId,
    });
  });
  return { ok: true };
}

/** Danh sách mô hình mẫu chọn được khi nhân bản (tenant OWNED trong phạm vi) */
export async function templateOptions(ctx: ProtectedContext) {
  requirePermission(ctx, "tenant:read");
  return ctx.tenants
    .filter((t) => ctx.tenantIds.includes(t.id) && t.type === "OWNED" && t.status !== "closed")
    .map((t) => ({ id: t.id, code: t.code, name: t.name, isDefault: t.isDefault }));
}
