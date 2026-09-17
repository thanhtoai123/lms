import { pgTable, text, uuid, boolean, date, pgEnum, index, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { BLOOD_TYPES } from "@satarobo/core";
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
    grade: text("grade"), // ngạch GV: intern | junior | advanced | senior | expert
    title: text("title"), // chức danh
    contractType: contractTypeEnum("contract_type").notNull().default("part_time"),
    maxLoadPerWeek: integer("max_load_per_week").notNull().default(20), // số buổi/tuần
    /** active | on_leave | stopped — isActive = (workStatus != stopped) */
    workStatus: text("work_status").notNull().default("active"),
    hiredAt: date("hired_at"),
    notes: text("notes"),
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
  /** NĐ13: không nhận tiếp thị / hạn chế xử lý / đã ẩn danh */
  marketingOptOut: boolean("marketing_opt_out").notNull().default(false),
  processingRestricted: boolean("processing_restricted").notNull().default(false),
  anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  accountStatus: parentAccountStatusEnum("account_status").notNull().default("none"),
  activationRequestedAt: timestamp("activation_requested_at", { withTimezone: true }),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  /** Mã kích hoạt cấp tại quầy: chỉ lưu băm SHA-256, hiển thị mã gốc đúng một lần */
  activationCodeHash: text("activation_code_hash"),
  activationCodeExpiresAt: timestamp("activation_code_expires_at", { withTimezone: true }),
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
export const bloodTypeEnum = pgEnum("blood_type", BLOOD_TYPES);

export const students = pgTable(
  "students",
  {
    id: id(),
    code: text("code").unique(), // CS1-26-000123 hoặc mã nhập tay
    fullName: text("full_name").notNull(),
    nickname: text("nickname"),
    dateOfBirth: date("date_of_birth"),
    grade: integer("grade"), // lớp 1..12
    school: text("school"),
    gender: text("gender"), // male | female | other
    /** SĐT / email của chính học viên (nếu có) */
    phone: text("phone"),
    email: text("email"),
    /** Khối sức khoẻ: dị ứng, lưu ý y tế — chỉ nhân sự có quyền student:read thấy */
    healthNotes: text("health_notes"),
    bloodType: bloodTypeEnum("blood_type"),
    allergies: jsonb("allergies").$type<string[]>().notNull().default([]),
    interests: text("interests"),
    homeCenterId: uuid("home_center_id").references(() => centers.id),
    /** Đơn vị (cơ sở) phụ huynh mong muốn học */
    preferredCenterId: uuid("preferred_center_id").references(() => centers.id),
    /** Ngày đăng ký lần đầu — tự điền từ ghi danh đầu tiên nếu trống (trigger SQL + service) */
    firstEnrolledOn: date("first_enrolled_on"),
    status: studentStatusEnum("status").notNull().default("prospect"),
    avatarKey: text("avatar_key"), // object key trong bucket private
    /** Phiên bản thẻ QR điểm danh — tăng khi cấp lại thẻ (thẻ cũ hết hiệu lực) */
    cardVersion: integer("card_version").notNull().default(1),
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
    relation: text("relation").notNull().default("parent"), // GUARDIAN_RELATIONS: mother | father | grandmother | grandfather | guardian | parent
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => [index("sg_student_idx").on(t.studentId), index("sg_parent_idx").on(t.parentId)],
);

/** Địa chỉ học viên — tách bảng riêng (PII), chỉ người có quyền sửa hồ sơ mới đọc */
export const studentPrivate = pgTable("student_private", {
  studentId: uuid("student_id").primaryKey().references(() => students.id, { onDelete: "cascade" }),
  address: text("address"),
  ward: text("ward"),
  district: text("district"),
  city: text("city"),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/**
 * Đợt bảo lưu cả hồ sơ học viên (một hoặc nhiều ghi danh). Đang mở khi ended_at null.
 * expected_return null = chưa hẹn ngày — nhắc khi quá hạn bảo lưu tối đa.
 */
export const studentPauses = pgTable(
  "student_pauses",
  {
    id: id(),
    studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    enrollmentIds: jsonb("enrollment_ids").$type<string[]>().notNull().default([]),
    fromDate: date("from_date").notNull(),
    expectedReturn: date("expected_return"),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** reserve_end | withdraw — cách đợt kết thúc */
    endKind: text("end_kind"),
    reason: text("reason").notNull(),
    endNote: text("end_note"),
    createdBy: uuid("created_by").references(() => users.id),
    endedBy: uuid("ended_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("student_pauses_student_idx").on(t.studentId, t.createdAt), index("student_pauses_open_idx").on(t.endedAt, t.expectedReturn)],
);
