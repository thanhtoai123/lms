import { pgTable, text, uuid, boolean, integer, index, doublePrecision, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { ROOM_STATUSES } from "@satarobo/core";
import { id, timestamps } from "./_common";

export const roomStatusEnum = pgEnum("room_status", ROOM_STATUSES);

/** Khu vực (cây tổ chức: khu vực → cơ sở → bộ phận) */
export const regions = pgTable("regions", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  /** Người phụ trách (users.id) — không khai FK để tránh vòng import với identity */
  managerUserId: uuid("manager_user_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const centers = pgTable("centers", {
  id: id(),
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
