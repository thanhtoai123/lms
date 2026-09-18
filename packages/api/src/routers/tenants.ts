import { z } from "zod";
import { TENANT_STATUSES, TENANT_TYPES, DATA_RETENTION_YEARS_MIN, DATA_RETENTION_YEARS_MAX } from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import * as T from "../services/tenants";
import { previewProvision, provision } from "../services/provisionTenant";
import { previewOffboard, exportTenantData, suspendTenant, closeTenant, reopenTenant } from "../services/tenantOffboard";

const uuid = z.string().uuid();
const s = (n: number) => z.string().trim().max(n);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ");

/** Lý do bắt buộc — mọi thao tác đổi quyền riêng tư / nhân bản đều vào nhật ký */
const reason = z.string().trim().min(5, "Lý do tối thiểu 5 ký tự").max(300);
const provisionReason = z.string().trim().min(10, "Lý do tối thiểu 10 ký tự").max(500);

/** Thao tác nguy hiểm: lý do dài + gõ lại mã trung tâm để xác nhận */
const offboardInput = z.object({
  tenantId: uuid,
  confirm: z.string().trim().min(2, "Gõ lại mã trung tâm để xác nhận").max(12),
  reason: provisionReason,
});

export const tenantsRouter = router({
  /** Danh sách trung tâm + chỉ số tổng hợp (mọi procedure đều kiểm tra quyền trong service) */
  list: protectedProcedure.query(({ ctx }) => T.listTenants(ctx)),
  get: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => T.getTenant(ctx, input.id)),
  templates: protectedProcedure.query(({ ctx }) => T.templateOptions(ctx)),

  /** Tuỳ chọn quyền riêng tư — chỉ chính trung tâm đó đổi được */
  updateSettings: protectedProcedure
    .input(z.object({
      tenantId: uuid,
      hoSeesPii: z.boolean().optional(),
      hoSeesFinanceDetail: z.boolean().optional(),
      allowCrossCenterTransfer: z.boolean().optional(),
      dataRetentionYears: z.number().int().min(DATA_RETENTION_YEARS_MIN).max(DATA_RETENTION_YEARS_MAX).optional(),
      status: z.enum(TENANT_STATUSES).optional(),
      reason,
    }))
    .mutation(({ ctx, input }) => T.updateSettings(ctx, input)),

  /** Bước 1: bảng kê "sẽ tạo những gì, bao nhiêu bản ghi" */
  previewProvision: protectedProcedure
    .input(z.object({ sourceTenantId: uuid, roomCount: z.number().int().min(0).max(10).optional() }))
    .query(({ ctx, input }) => previewProvision(ctx, input)),

  /** Bước 2: nhân bản thật — một transaction, bắt buộc lý do */
  provision: protectedProcedure
    .input(z.object({
      sourceTenantId: uuid,
      type: z.enum(TENANT_TYPES).optional(),
      code: s(12).min(2, "Mã trung tâm tối thiểu 2 ký tự"),
      name: s(120).min(3, "Tên trung tâm tối thiểu 3 ký tự"),
      legalName: s(200).nullish(),
      taxCode: s(20).nullish(),
      address: s(300).nullish(),
      phone: s(20).nullish(),
      email: s(200).nullish(),
      contractNo: s(50).nullish(),
      contractFrom: isoDate.nullish(),
      contractTo: isoDate.nullish(),
      centerCode: s(20).min(2, "Mã cơ sở tối thiểu 2 ký tự"),
      centerName: s(120).min(3, "Tên cơ sở tối thiểu 3 ký tự"),
      centerAddress: s(300).nullish(),
      roomCount: z.number().int().min(0).max(10).optional(),
      adminEmail: z.string().trim().email("Email quản trị không hợp lệ").max(200),
      adminFullName: s(120).min(2, "Họ tên quản trị tối thiểu 2 ký tự"),
      reason: provisionReason,
    }))
    .mutation(({ ctx, input }) => provision(ctx, input)),

  /* ---------------- Kết thúc hợp đồng: bàn giao và khoá dữ liệu ---------------- */

  /** Bảng kê "sẽ khoá những gì, bao nhiêu bản ghi, ai mất quyền truy cập" (không ghi gì) */
  previewOffboard: protectedProcedure
    .input(z.object({ tenantId: uuid }))
    .query(({ ctx, input }) => previewOffboard(ctx, input)),

  /** Xuất toàn bộ dữ liệu của trung tâm ra một tệp .zip — bắt buộc lý do, có ghi nhật ký */
  exportData: protectedProcedure
    .input(z.object({ tenantId: uuid, reason: provisionReason }))
    .mutation(({ ctx, input }) => exportTenantData(ctx, input)),

  /** Tạm ngừng: khoá mọi tài khoản của trung tâm, dữ liệu giữ nguyên */
  suspend: protectedProcedure.input(offboardInput).mutation(({ ctx, input }) => suspendTenant(ctx, input)),
  /** Đóng hẳn: kết thúc hợp đồng, giữ dữ liệu theo số năm đã cam kết */
  close: protectedProcedure.input(offboardInput).mutation(({ ctx, input }) => closeTenant(ctx, input)),
  /** Mở lại trung tâm đang tạm ngừng / đã đóng nhầm */
  reopen: protectedProcedure.input(offboardInput).mutation(({ ctx, input }) => reopenTenant(ctx, input)),
});
