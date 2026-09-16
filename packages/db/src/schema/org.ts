import { pgTable, text, uuid, boolean, integer, index } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_common";

export const centers = pgTable("centers", {
  id: id(),
  code: text("code").notNull().unique(), // CS1, CS2
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  timezone: text("timezone").notNull().default("Asia/Ho_Chi_Minh"),
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
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("rooms_center_idx").on(t.centerId)],
);
