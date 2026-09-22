import { pgTable, text, uuid, integer, date, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { SESSION_EVAL_STATUSES, OBJECTIVE_RESULTS, PORTFOLIO_SHARE_SCOPES, type SessionEvalSnapshot } from "@satarobo/core";
import { id, timestamps } from "./_common";
import { tenantCol } from "./tenant";
import { centers } from "./org";
import { users } from "./identity";
import { teachers, students } from "./people";
import { sessions, enrollments, classes, courses, lessons } from "./academics";

/**
 * HỒ SƠ HỌC TẬP (docs/HO-SO-HOC-TAP.md) — ràng buộc, trigger tenant, RLS ở packages/db/sql/0011_ho_so_hoc_tap.sql.
 *
 * PHIẾU NHẬN XÉT BUỔI HỌC: một phiếu cho mỗi học viên CÓ MẶT ở mỗi buổi (vắng thì không có phiếu;
 * học bù vẫn có phiếu, ghi rõ "Học bù"). GV chấm nhanh theo rubric 4 mức → nháp tự lưu →
 * khi hoàn tất buổi mọi phiếu nháp đủ điều kiện được phát hành cùng lúc (một transaction).
 * Phiếu đã phát hành là BẤT BIẾN; sửa sau phát hành bắt buộc lý do, ghi nhật ký, tăng `revision`.
 */
export const sessionEvaluations = pgTable(
  "session_evaluations",
  {
    id: id(),
    tenantId: tenantCol(),
    /** Cơ sở của lớp — để trigger tự điền tenant và kiểm tra quyền theo cơ sở */
    centerId: uuid("center_id").notNull().references(() => centers.id),
    sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    enrollmentId: uuid("enrollment_id").notNull().references(() => enrollments.id, { onDelete: "cascade" }),
    studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    classId: uuid("class_id").notNull().references(() => classes.id),
    courseId: uuid("course_id").notNull().references(() => courses.id),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    teacherId: uuid("teacher_id").references(() => teachers.id),
    status: text("status", { enum: SESSION_EVAL_STATUSES }).notNull().default("draft"),
    /** 0 khi còn nháp; 1 khi phát hành; +1 mỗi lần sửa sau phát hành */
    revision: integer("revision").notNull().default(0),
    /** Bản chụp tiêu chí + mô tả mức + điểm + bối cảnh buổi (chụp lại lúc phát hành) */
    snapshot: jsonb("snapshot").$type<SessionEvalSnapshot>().notNull(),
    objectiveResult: text("objective_result", { enum: OBJECTIVE_RESULTS }),
    highlights: text("highlights").array().notNull().default([]),
    /** Bé làm được gì trong buổi */
    productNote: text("product_note"),
    /** Nhận xét cho phụ huynh — đồng bộ hai chiều với attendance.student_remark */
    remark: text("remark"),
    /** Ảnh đã duyệt có gắn bé (chỉ ảnh qua kiểm tra đồng ý đăng ảnh) */
    mediaIds: uuid("media_ids").array().notNull().default([]),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: uuid("published_by").references(() => users.id),
    /** Lần sửa gần nhất sau phát hành (lý do bắt buộc; lịch sử đầy đủ ở audit_log) */
    amendedAt: timestamp("amended_at", { withTimezone: true }),
    amendedBy: uuid("amended_by").references(() => users.id),
    amendReason: text("amend_reason"),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("session_evaluations_session_enrollment_uq").on(t.sessionId, t.enrollmentId),
    index("session_evaluations_student_idx").on(t.studentId, t.status),
    index("session_evaluations_enrollment_idx").on(t.enrollmentId, t.status),
    index("session_evaluations_center_status_idx").on(t.centerId, t.status),
  ],
);

/**
 * Link chia sẻ hồ sơ học tập `/hs/<token>`: token ≥ 32 byte base64url, có hạn, thu hồi có lý do,
 * đếm lượt xem. Phạm vi: toàn bộ | một khoá (một ghi danh) | một khoảng ngày.
 */
export const portfolioShares = pgTable(
  "portfolio_shares",
  {
    id: id(),
    tenantId: tenantCol(),
    /** Cơ sở chính của học viên lúc tạo link — để trigger tự điền tenant */
    centerId: uuid("center_id").references(() => centers.id),
    studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    scope: text("scope", { enum: PORTFOLIO_SHARE_SCOPES }).notNull().default("all"),
    /** scope = course: link một khoá mất ý nghĩa khi ghi danh bị xoá → xoá theo */
    enrollmentId: uuid("enrollment_id").references(() => enrollments.id, { onDelete: "cascade" }),
    fromDate: date("from_date"),
    toDate: date("to_date"),
    /** Ghi chú nội bộ: gửi cho ai (vd "Gửi bà ngoại") — không hiện trên trang công khai */
    label: text("label"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id),
    revokeReason: text("revoke_reason"),
    viewCount: integer("view_count").notNull().default(0),
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("portfolio_shares_token_uq").on(t.token),
    index("portfolio_shares_student_idx").on(t.studentId, t.createdAt),
  ],
);

/** Bản PDF lưu trữ xuất phía máy chủ (tuỳ chọn, PDF_RENDERER=playwright) */
export const portfolioExports = pgTable(
  "portfolio_exports",
  {
    id: id(),
    tenantId: tenantCol(),
    centerId: uuid("center_id").references(() => centers.id),
    studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    /** Khoá tệp trong kho lưu trữ (portfolio/<studentId>/<id>.pdf) */
    fileKey: text("file_key").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    scope: text("scope", { enum: PORTFOLIO_SHARE_SCOPES }).notNull().default("all"),
    enrollmentId: uuid("enrollment_id").references(() => enrollments.id, { onDelete: "set null" }),
    fromDate: date("from_date"),
    toDate: date("to_date"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("portfolio_exports_student_idx").on(t.studentId, t.createdAt)],
);
