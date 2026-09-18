/**
 * Ai đọc được lead nào — một chỗ duy nhất cho mọi truy vấn lead.
 *
 * Quy tắc thuần nằm ở `@satarobo/core` (`canSeeLead`); ở đây chỉ dịch sang điều kiện SQL
 * và sang lời từ chối của tRPC.
 *
 * - Có `lead:read` đầy đủ → thấy mọi lead trong phạm vi cơ sở của mình.
 * - Chỉ có `lead:read_own` → thấy lead mình đang giữ **và** lead đã bật **dùng chung**
 *   ("Dùng chung cho CSKH cùng cơ sở") trong cơ sở của mình.
 */
import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { leads } from "@satarobo/db";
import { authorize, canSeeLead, canToggleLeadShare, hasPermission, visibleCenterIds, type LeadReaderView, type LeadShareRow } from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { tenantCond, assertTenant } from "./tenantScope";

/** Ảnh chụp quyền đọc lead của người đang đăng nhập, tại một cơ sở cụ thể */
export function leadReader(ctx: ProtectedContext, centerId: string | null = null): LeadReaderView {
  return {
    userId: ctx.user.id,
    fullRead: authorize(ctx.actor, "lead:read", { centerId }).allowed,
    centerIds: visibleCenterIds(ctx.actor),
  };
}

/** Người này có mon men được vào khu lead không (đủ quyền hoặc ít nhất `lead:read_own`) */
export function canEnterLeads(ctx: ProtectedContext, centerId: string | null = null): boolean {
  return authorize(ctx.actor, "lead:read", { centerId }).allowed || hasPermission(ctx.actor, "lead:read_own");
}

export function requireLeadsAccess(ctx: ProtectedContext, centerId: string | null = null): void {
  if (!canEnterLeads(ctx, centerId)) throw new TRPCError({ code: "FORBIDDEN", message: "Không có quyền lead:read" });
}

/**
 * Điều kiện SQL lọc bảng `leads` theo quyền đọc.
 * Gộp AND vào mệnh đề WHERE của mọi truy vấn danh sách lead.
 */
export function leadReadCondition(ctx: ProtectedContext, centerId: string | null = null): SQL {
  const visible = visibleCenterIds(ctx.actor);
  const byCenter: SQL = visible === null ? sql`true` : visible.length ? or(inArray(leads.centerId, visible), isNull(leads.centerId))! : sql`false`;
  // Cách ly trung tâm (tenant) đứng TRƯỚC mọi luật chia lead
  const inScope = and(byCenter, tenantCond(ctx, leads))!;
  if (authorize(ctx.actor, "lead:read", { centerId }).allowed) return inScope;
  if (!hasPermission(ctx.actor, "lead:read_own")) return sql`false`;
  // Chỉ `lead:read_own`: lead của mình + lead đã bật dùng chung trong cơ sở của mình
  return and(inScope, or(eq(leads.assignedToId, ctx.user.id), eq(leads.sharedWithCenter, true))!)!;
}

/** Kiểm tra quyền đọc MỘT lead đã nạp sẵn (trang chi tiết, hành động trên lead) */
export function requireLeadRead(ctx: ProtectedContext, lead: LeadShareRow & { tenantId?: string | null }): void {
  assertTenant(ctx, lead, "Lead");
  if (!canSeeLead(leadReader(ctx, lead.centerId), lead)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Lead này không thuộc phạm vi của bạn (chủ lead có thể bật “Dùng chung cho CSKH cùng cơ sở”)" });
  }
}

/** Ai được bật/tắt dùng chung: sale đang giữ lead, hoặc người có quyền sửa lead của cơ sở */
export function canShareLead(ctx: ProtectedContext, lead: LeadShareRow): boolean {
  return canToggleLeadShare({ ...leadReader(ctx, lead.centerId), canUpdateCenter: authorize(ctx.actor, "lead:update", { centerId: lead.centerId }).allowed }, lead);
}
