import { pgTable, text, uuid, boolean, date, pgEnum, index, integer, timestamp } from "drizzle-orm/pg-core";
import { id, timestamps, softDelete } from "./_common";
import { users } from "./identity";
import { centers } from "./org";

export const contractTypeEnum = pgEnum("contract_type", ["full_time", "part_time", "collaborator"]);

/** Tài khoản PH: none = chưa cấp; pending_activation = đã chốt, chờ PH nhập SĐT nhận OTP và đặt mật khẩu; active */
export const parentAccountStatusEnum = pgEnum("parent_account_status", ["none", "pending_activation", "active", "locked"]);

/** Giáo viên / trợ giảng — là hồ sơ nhân sự, liên kết (tuỳ chọn) với tài khoản đăng nhập */
export const teachers = pgTable(
  "teachers",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    centerId: uuid("center_id").references(() => centers.id),
    code: text("code").unique(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    email: text("email"),
    grade: text("grade"), // ngạch GV
    contractType: contractTypeEnum("contract_type").notNull().default("part_time"),
    maxLoadPerWeek: integer("max_load_per_week").notNull().default(20), // số buổi/tuần
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("teachers_center_idx").on(t.centerId)],
);

/**
 * Phụ huynh (khách hàng). PII nhạy cảm (CCCD, địa chỉ) tách sang parent_private
 * để mặc định không bị SELECT * lộ ra và có thể mã hoá/ghi audit riêng.
 */
export const parents = pgTable("parents", {
  id: id(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  zaloId: text("zalo_id"),
  /** Đồng ý cho đăng ảnh con (NĐ13) — enforce ở service khi publish media */
  mediaConsent: boolean("media_consent").notNull().default(false),
  mediaConsentAt: timestamp("media_consent_at", { withTimezone: true }),
  accountStatus: parentAccountStatusEnum("account_status").notNull().default("none"),
  activationRequestedAt: timestamp("activation_requested_at", { withTimezone: true }),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  ...timestamps,
  ...softDelete,
});

export const parentPrivate = pgTable("parent_private", {
  parentId: uuid("parent_id").primaryKey().references(() => parents.id, { onDelete: "cascade" }),
  nationalIdEnc: text("national_id_enc"), // mã hoá tầng ứng dụng
  addressEnc: text("address_enc"),
  ...timestamps,
});

export const studentStatusEnum = pgEnum("student_status", ["prospect", "trial", "active", "paused", "alumni", "withdrawn"]);

export const students = pgTable(
  "students",
  {
    id: id(),
    code: text("code").unique(), // CS1-26-000123
    fullName: text("full_name").notNull(),
    nickname: text("nickname"),
    dateOfBirth: date("date_of_birth"),
    grade: integer("grade"), // lớp 1..8
    school: text("school"),
    homeCenterId: uuid("home_center_id").references(() => centers.id),
    status: studentStatusEnum("status").notNull().default("prospect"),
    avatarKey: text("avatar_key"), // object key trong bucket private
    notes: text("notes"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("students_center_idx").on(t.homeCenterId), index("students_status_idx").on(t.status)],
);

/** Một học viên có thể có nhiều phụ huynh (bố/mẹ/người giám hộ) */
export const studentGuardians = pgTable(
  "student_guardians",
  {
    studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").notNull().references(() => parents.id, { onDelete: "cascade" }),
    relation: text("relation").notNull().default("parent"), // mother | father | guardian
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => [index("sg_student_idx").on(t.studentId), index("sg_parent_idx").on(t.parentId)],
);
