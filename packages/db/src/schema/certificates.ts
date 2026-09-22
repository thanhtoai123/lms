import { pgTable, text, uuid, integer, boolean, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  CERTIFICATE_KINDS, CERTIFICATE_STATUSES, TEMPLATE_ORIENTATIONS,
  type TemplateField, type CertificateSnapshot,
} from "@satarobo/core";
import { id, timestamps } from "./_common";
import { tenantCol } from "./tenant";
import { centers } from "./org";
import { users } from "./identity";
import { students } from "./people";
import { courses, courseCompletions } from "./academics";

/**
 * GIẤY CHỨNG NHẬN & LỘ TRÌNH HỌC (docs/CHUNG-NHAN-LO-TRINH.md) — ràng buộc, trigger tenant, RLS, backfill
 * ở packages/db/sql/0012_chung_nhan_lo_trinh.sql.
 *
 * "Chứng nhận" — KHÔNG phải "chứng chỉ": trung tâm ngoài công lập cấp giấy chứng nhận hoàn thành,
 * chứng chỉ là văn bằng thuộc hệ thống giáo dục quốc dân.
 */

/** Mẫu giấy chứng nhận: ảnh nền (thiết kế trên Canva) + các ô trường đặt theo % khung */
export const certificateTemplates = pgTable(
  "certificate_templates",
  {
    id: id(),
    tenantId: tenantCol(),
    name: text("name").notNull(),
    orientation: text("orientation", { enum: TEMPLATE_ORIENTATIONS }).notNull().default("landscape"),
    /** Khoá tệp ảnh nền trong kho tệp (certificates/…png|jpg) hoặc nền dựng sẵn (builtin/…svg); rỗng = chưa tải */
    backgroundKey: text("background_key"),
    widthPx: integer("width_px"),
    heightPx: integer("height_px"),
    fields: jsonb("fields").$type<TemplateField[]>().notNull().default([]),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    // Mỗi trung tâm tối đa MỘT mẫu mặc định
    uniqueIndex("certificate_templates_one_default").on(t.tenantId).where(sql`is_default`),
  ],
);

/** Lộ trình học: chuỗi khoá có thứ tự; hoàn thành mọi khoá bắt buộc → đủ điều kiện nhận chứng nhận */
export const learningPaths = pgTable(
  "learning_paths",
  {
    id: id(),
    tenantId: tenantCol(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** "Điều kiện đạt" — in lên chứng nhận và trang xác thực (Open Badges: criteria) */
    criteriaText: text("criteria_text"),
    certificateTemplateId: uuid("certificate_template_id").references(() => certificateTemplates.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("learning_paths_code_tenant_uq").on(t.tenantId, t.code)],
);

export const learningPathCourses = pgTable(
  "learning_path_courses",
  {
    id: id(),
    pathId: uuid("path_id").notNull().references(() => learningPaths.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "restrict" }),
    seq: integer("seq").notNull(),
    required: boolean("required").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("learning_path_courses_uq").on(t.pathId, t.courseId),
    index("learning_path_courses_course_idx").on(t.courseId),
  ],
);

/**
 * Giấy chứng nhận đã cấp — một dòng cho mỗi lần cấp (lộ trình hoặc khoá).
 * `verify_token` (≥ 24 byte ngẫu nhiên) nằm trong mã QR → trang công khai /cn/<token>;
 * `snapshot` = mọi chữ đã in, để bản in lại luôn giống bản gốc.
 */
export const certificates = pgTable(
  "certificates",
  {
    id: id(),
    tenantId: tenantCol(),
    kind: text("kind", { enum: CERTIFICATE_KINDS }).notNull(),
    learningPathId: uuid("learning_path_id").references(() => learningPaths.id, { onDelete: "restrict" }),
    courseCompletionId: uuid("course_completion_id").references(() => courseCompletions.id, { onDelete: "restrict" }),
    studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "restrict" }),
    /** Cơ sở cấp — để trigger tự điền tenant, phân quyền theo cơ sở và in thông tin đơn vị cấp */
    centerId: uuid("center_id").references(() => centers.id),
    /** Mẫu dùng khi in; rỗng = mẫu mặc định của trung tâm */
    templateId: uuid("template_id").references(() => certificateTemplates.id, { onDelete: "set null" }),
    number: text("number").notNull(),
    verifyToken: text("verify_token").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    issuedBy: uuid("issued_by").references(() => users.id),
    status: text("status", { enum: CERTIFICATE_STATUSES }).notNull().default("valid"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id),
    revokeReason: text("revoke_reason"),
    snapshot: jsonb("snapshot").$type<CertificateSnapshot>().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("certificates_number_uq").on(t.number),
    uniqueIndex("certificates_verify_token_uq").on(t.verifyToken),
    // Một học viên chỉ có MỘT chứng nhận còn hiệu lực cho mỗi lộ trình / mỗi bản ghi hoàn thành khoá
    uniqueIndex("certificates_path_student_valid_uq").on(t.learningPathId, t.studentId).where(sql`status = 'valid' and learning_path_id is not null`),
    uniqueIndex("certificates_completion_valid_uq").on(t.courseCompletionId).where(sql`status = 'valid' and course_completion_id is not null`),
    index("certificates_student_idx").on(t.studentId, t.issuedAt),
    index("certificates_path_idx").on(t.learningPathId, t.status),
  ],
);
