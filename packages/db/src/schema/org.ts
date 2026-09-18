import { pgTable, text, uuid, boolean, integer, index, uniqueIndex, timestamp, doublePrecision, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { ROOM_STATUSES, ORG_UNIT_TYPES, ORG_RELATIONSHIPS, ORG_UNIT_STATUSES } from "@satarobo/core";
import { id, timestamps } from "./_common";
import { tenantCol } from "./tenant";

export const roomStatusEnum = pgEnum("room_status", ROOM_STATUSES);
export const orgUnitTypeEnum = pgEnum("org_unit_type", ORG_UNIT_TYPES);
export const orgRelationshipEnum = pgEnum("org_relationship", ORG_RELATIONSHIPS);
export const orgUnitStatusEnum = pgEnum("org_unit_status", ORG_UNIT_STATUSES);

/** Khu vực (cây tổ chức: khu vực → cơ sở → bộ phận) */
export const regions = pgTable("regions", {
  id: id(),
  tenantId: tenantCol(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  /** Người phụ trách (users.id) — không khai FK để tránh vòng import với identity */
  managerUserId: uuid("manager_user_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const centers = pgTable("centers", {
  id: id(),
  tenantId: tenantCol(),
  code: text("code").notNull().unique(), // CS1, CS2
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  timezone: text("timezone").notNull().default("Asia/Ho_Chi_Minh"),
  /** Toạ độ chấm công (null = không kiểm tra bán kính) */
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  checkinRadiusM: integer("checkin_radius_m").notNull().default(150),
  regionId: uuid("region_id").references(() => regions.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

export const rooms = pgTable(
  "rooms",
  {
    id: id(),
    tenantId: tenantCol(),
    centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
    code: text("code").notNull(), // P302, 101
    name: text("name").notNull(),
    capacity: integer("capacity").notNull().default(12),
    /** Hoạt động / Bảo trì / Tạm ngừng — chỉ "Hoạt động" mới xếp lớp được */
    status: roomStatusEnum("status").notNull().default("active"),
    /** Thiết bị trong phòng (máy chiếu, TV, bộ kit…) */
    equipment: jsonb("equipment").$type<string[]>().notNull().default([]),
    /** Giữ để tương thích: isActive = (status = 'active') */
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("rooms_center_idx").on(t.centerId)],
);

/* ------------------------------------------------------------------ */
/* Cây tổ chức động (/to-chuc)                                         */
/* ------------------------------------------------------------------ */

/** Pháp nhân ký hợp đồng / xuất hoá đơn cho một hoặc nhiều đơn vị trong cây */
export const legalEntities = pgTable("legal_entities", {
  id: id(),
  tenantId: tenantCol(),
  legalName: text("legal_name").notNull(),
  taxCode: text("tax_code").notNull().unique(),
  address: text("address"),
  representative: text("representative"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

/**
 * Cây tổ chức động (bản gốc /to-chuc). Bổ sung BÊN CẠNH `regions` / `centers` — không thay thế:
 * phân quyền theo cơ sở vẫn chạy trên `centers`; đơn vị loại `center` được đồng bộ sang `centers`.
 *
 * `path` dạng "/root/ho/khoi-dn/cs1" quyết định ai thấy dữ liệu nhánh nào;
 * `code` và `type` không đổi được sau khi tạo; đổi `parent_id` thì path CẢ NHÁNH CON được tính lại.
 */
export const orgUnits = pgTable(
  "org_units",
  {
    id: id(),
    tenantId: tenantCol(),
    /** Không đổi sau khi tạo */
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** Không đổi sau khi tạo */
    type: orgUnitTypeEnum("type").notNull(),
    parentId: uuid("parent_id"),
    path: text("path").notNull(),
    address: text("address"),
    relationshipType: orgRelationshipEnum("relationship_type").notNull().default("owned"),
    status: orgUnitStatusEnum("status").notNull().default("active"),
    legalEntityId: uuid("legal_entity_id").references(() => legalEntities.id, { onDelete: "set null" }),
    /** Đơn vị loại `center` trỏ về bảng cơ sở đang dùng cho phân quyền */
    centerId: uuid("center_id").references(() => centers.id, { onDelete: "set null" }),
    /** Đơn vị loại `region` trỏ về khu vực đang dùng */
    regionId: uuid("region_id").references(() => regions.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    note: text("note"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("org_units_code_uq").on(t.code),
    index("org_units_path_idx").on(t.path),
    index("org_units_parent_idx").on(t.parentId),
    index("org_units_center_idx").on(t.centerId),
  ],
);
