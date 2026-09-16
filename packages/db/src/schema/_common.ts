import { timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** Cột chuẩn cho mọi bảng nghiệp vụ */
export const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Soft-delete + audit "ai tạo/sửa" — dùng cho bảng có dữ liệu cá nhân */
export const softDelete = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};
