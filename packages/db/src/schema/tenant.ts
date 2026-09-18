import { pgTable, text, uuid, boolean, integer, timestamp, date, index, uniqueIndex, pgEnum } from "drizzle-orm/pg-core";
import { TENANT_TYPES, TENANT_STATUSES } from "@satarobo/core";
import { id, timestamps } from "./_common";

export const tenantTypeEnum = pgEnum("tenant_type", TENANT_TYPES);
export const tenantStatusEnum = pgEnum("tenant_status", TENANT_STATUSES);

/**
 * Trung tâm (tenant) — đơn vị CÁCH LY dữ liệu cao nhất.
 *
 * `OWNED` = do chuỗi tự vận hành (Hội sở nhìn xuyên suốt).
 * `FRANCHISE` = bên nhận nhượng quyền: dữ liệu riêng tư, Hội sở chỉ thấy số liệu
 * tổng hợp và PII bị che, trừ khi tenant bật công tắc trong `tenant_settings`.
 *
 * Đúng MỘT dòng có `is_default = true` — tenant gốc `SATA`, nơi mọi dữ liệu cũ được gán về.
 */
export const tenants = pgTable(
  "tenants",
  {
    id: id(),
    /** Mã ngắn IN HOA, không đổi sau khi tạo — vd SATA, FR_HUE */
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    type: tenantTypeEnum("type").notNull().default("OWNED"),
    status: tenantStatusEnum("status").notNull().default("active"),
    /** Tenant gốc của chuỗi — dữ liệu chưa gắn tenant được backfill về đây */
    isDefault: boolean("is_default").notNull().default(false),
    /** Tenant chuỗi đã sinh ra tenant này (nhân bản một chạm) */
    parentTenantId: uuid("parent_tenant_id"),
    /** Mô hình mẫu đã dùng khi nhân bản */
    provisionedFromTenantId: uuid("provisioned_from_tenant_id"),
    legalName: text("legal_name"),
    taxCode: text("tax_code"),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    /** Hợp đồng nhượng quyền */
    contractNo: text("contract_no"),
    contractFrom: date("contract_from"),
    contractTo: date("contract_to"),
    note: text("note"),
    createdBy: uuid("created_by"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("tenants_code_uq").on(t.code),
    index("tenants_type_idx").on(t.type, t.status),
  ],
);

/**
 * Tuỳ chọn quyền riêng tư của từng tenant — mặc định theo loại tenant
 * (xem `defaultTenantSettings` ở packages/core): OWNED mở hết, FRANCHISE đóng hết.
 */
export const tenantSettings = pgTable("tenant_settings", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  /** Hội sở chuỗi được xem dữ liệu cá nhân của tenant này */
  hoSeesPii: boolean("ho_sees_pii").notNull().default(false),
  /** Hội sở chuỗi được xem chi tiết tài chính (từng phiếu thu) */
  hoSeesFinanceDetail: boolean("ho_sees_finance_detail").notNull().default(false),
  /** Số năm giữ dữ liệu cá nhân */
  dataRetentionYears: integer("data_retention_years").notNull().default(5),
  /** Cho phép chuyển học viên / lead sang cơ sở thuộc tenant khác */
  allowCrossCenterTransfer: boolean("allow_cross_center_transfer").notNull().default(false),
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Cột tenant chuẩn — thêm vào MỌI bảng hay được lọc trực tiếp để lọc rẻ (một cột, một index).
 * Để rỗng được: trigger `fill_tenant_id` (packages/db/sql/0005_nhuong_quyen.sql) tự điền
 * theo cơ sở của dòng, hoặc về tenant mặc định — nhờ vậy mọi đường ghi cũ chạy y như trước.
 */
export const tenantCol = () => uuid("tenant_id").references(() => tenants.id, { onDelete: "restrict" });
