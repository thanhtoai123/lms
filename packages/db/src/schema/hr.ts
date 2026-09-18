import { pgTable, text, uuid, integer, bigint, date, timestamp, pgEnum, jsonb, index, uniqueIndex, doublePrecision, boolean } from "drizzle-orm/pg-core";
import {
  STAFF_STATUSES, EMPLOYMENT_TYPES, POSITION_KINDS, REQUEST_KINDS, REQUEST_STATUSES, LEAVE_TYPES, PERIOD_STATUS_DB,
  SHIFT_KINDS, WORKPLACES, CELL_ORIGINS, LATE_EARLY_KINDS, FLAG_REVIEW_ACTIONS, ATTENDANCE_MODES, PAY_MODES,
  type ShiftSegment, type Role,
} from "@satarobo/core";
import { id, timestamps } from "./_common";
import { users } from "./identity";
import { centers } from "./org";
import { teachers } from "./people";
import { classes, sessions } from "./academics";

const money = (name: string) => bigint(name, { mode: "number" });

export const staffStatusEnum = pgEnum("staff_status", STAFF_STATUSES);
export const employmentTypeEnum = pgEnum("employment_type", EMPLOYMENT_TYPES);
export const positionKindEnum = pgEnum("position_kind", POSITION_KINDS);
export const staffRequestKindEnum = pgEnum("staff_request_kind", REQUEST_KINDS);
export const staffRequestStatusEnum = pgEnum("staff_request_status", REQUEST_STATUSES);
export const leaveTypeEnum = pgEnum("leave_type", LEAVE_TYPES);
/** Gồm cả giá trị cũ `locked` để dữ liệu đã có vẫn đọc được (đọc lên map thành `closed`) */
export const periodStatusEnum = pgEnum("timesheet_period_status", PERIOD_STATUS_DB);
export const shiftKindEnum = pgEnum("work_shift_kind", SHIFT_KINDS);
export const workplaceEnum = pgEnum("work_shift_workplace", WORKPLACES);
export const attendanceModeEnum = pgEnum("work_shift_attendance_mode", ATTENDANCE_MODES);
export const payModeEnum = pgEnum("work_shift_pay_mode", PAY_MODES);
export const cellOriginEnum = pgEnum("shift_cell_origin", CELL_ORIGINS);
export const lateEarlyKindEnum = pgEnum("late_early_kind", LATE_EARLY_KINDS);
export const flagReviewActionEnum = pgEnum("timesheet_flag_action", FLAG_REVIEW_ACTIONS);

/**
 * Vị trí công việc = **bộ vai trò** gắn vào ghế, không gắn vào người.
 * Người nghỉ thì gỡ phân công — vị trí giữ nguyên quyền cho người kế nhiệm.
 * `reportsToId` là cây báo cáo (luồng duyệt), KHÔNG dùng để tính phạm vi dữ liệu.
 */
export const positions = pgTable(
  "positions",
  {
    id: id(),
    /** null = đơn vị Hội sở / toàn hệ thống */
    centerId: uuid("center_id").references(() => centers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    department: text("department"),
    roles: jsonb("roles").$type<Role[]>().notNull().default([]),
    reportsToId: uuid("reports_to_id"),
    isManager: boolean("is_manager").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("positions_name_unique").on(t.centerId, t.name), index("positions_center_idx").on(t.centerId)],
);

/** Hồ sơ nhân sự (mọi nhân viên, kể cả GV — liên kết teacherId) */
export const staff = pgTable(
  "staff",
  {
    id: id(),
    code: text("code").notNull().unique(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    teacherId: uuid("teacher_id").references(() => teachers.id, { onDelete: "set null" }),
    fullName: text("full_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    centerId: uuid("center_id").notNull().references(() => centers.id),
    department: text("department").notNull(),
    title: text("title").notNull(),
    employmentType: employmentTypeEnum("employment_type").notNull().default("full_time"),
    status: staffStatusEnum("status").notNull().default("probation"),
    hiredAt: date("hired_at"),
    leftAt: date("left_at"),
    statusReason: text("status_reason"),
    annualLeaveDays: doublePrecision("annual_leave_days").notNull().default(12),
    /** Miễn tính công (không lên lưới phân ca, không cần quét) */
    timesheetExempt: boolean("timesheet_exempt").notNull().default(false),
    /** Ảnh đại diện (đường dẫn) */
    avatarUrl: text("avatar_url"),
    /** Giới thiệu (Markdown) — hiển thị ở trang công khai khi bật `isPublic` */
    bio: text("bio"),
    /** Hiển thị public trên website */
    isPublic: boolean("is_public").notNull().default(false),
    /** Thứ tự hiển thị trong danh sách công khai */
    displayOrder: integer("display_order").notNull().default(0),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("staff_user_unique").on(t.userId),
    uniqueIndex("staff_teacher_unique").on(t.teacherId),
    index("staff_center_idx").on(t.centerId, t.status),
  ],
);

/** Dữ liệu nhạy cảm: chỉ HR / Kế toán / Super Admin (staff:salary) */
export const staffPrivate = pgTable("staff_private", {
  staffId: uuid("staff_id").primaryKey().references(() => staff.id, { onDelete: "cascade" }),
  idNumber: text("id_number"),
  birthDate: date("birth_date"),
  address: text("address"),
  taxCode: text("tax_code"),
  insuranceNo: text("insurance_no"),
  bankName: text("bank_name"),
  bankAccount: text("bank_account"),
  baseSalary: money("base_salary"),
  allowance: money("allowance"),
  /** Ngạch lương (SR.QD.200, 1–9) */
  salaryRank: integer("salary_rank"),
  /** Bậc lương (1–5) */
  salaryLevel: integer("salary_level"),
  /** Mức lương đóng BHXH (VNĐ) */
  bhxhBase: money("bhxh_base"),
  /** Liên hệ khẩn cấp: "Tên - Quan hệ - SĐT" */
  emergencyContact: text("emergency_contact"),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Phân công người vào vị trí: chính / kiêm nhiệm / uỷ quyền, có hiệu lực */
export const staffPositions = pgTable(
  "staff_positions",
  {
    id: id(),
    staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
    /** Vị trí (bộ vai trò). Null = phân công cũ chỉ có chức danh chữ. */
    positionId: uuid("position_id").references(() => positions.id, { onDelete: "set null" }),
    centerId: uuid("center_id").notNull().references(() => centers.id),
    title: text("title").notNull(),
    department: text("department").notNull(),
    kind: positionKindEnum("kind").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    /** Số quyết định phân công (bản gốc để chung ô ghi chú — tách riêng cho dễ tra) */
    decisionNo: text("decision_no"),
    note: text("note"),
    endReason: text("end_reason"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("staff_positions_staff_idx").on(t.staffId, t.effectiveFrom), index("staff_positions_center_idx").on(t.centerId), index("staff_positions_position_idx").on(t.positionId)],
);

/**
 * Điều động tác nghiệp: mở **phạm vi dữ liệu** của cơ sở khác trong một khoảng thời gian.
 * Không đổi biên chế, không đổi vai trò; hết hạn là mất truy cập ngay.
 */
export const staffDeployments = pgTable(
  "staff_deployments",
  {
    id: id(),
    staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
    centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    reason: text("reason").notNull(),
    /** Số quyết định điều động */
    decisionNo: text("decision_no"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("staff_deployments_staff_idx").on(t.staffId, t.effectiveFrom), index("staff_deployments_center_idx").on(t.centerId)],
);

/** Danh mục mã ca (centerId null = dùng chung, chỉ Hội sở sửa) */
export const workShifts = pgTable(
  "work_shifts",
  {
    id: id(),
    centerId: uuid("center_id").references(() => centers.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: shiftKindEnum("kind").notNull().default("timed"),
    /** Số công của mã ca: 0 / 0,5 / 1 / 1,5 */
    units: doublePrecision("units").notNull().default(1),
    /** Các đoạn giờ (ca gãy nhiều đoạn); đoạn paid=false là nghỉ giữa giờ không tính công */
    segments: jsonb("segments").$type<ShiftSegment[]>().notNull().default([]),
    /** Giờ kế hoạch (phút) — tính từ các đoạn giờ */
    plannedMinutes: integer("planned_minutes").notNull().default(0),
    workplace: workplaceEnum("workplace").notNull().default("own_center"),
    /** Cơ sở cố định khi workplace = fixed_center */
    workplaceCenterId: uuid("workplace_center_id").references(() => centers.id, { onDelete: "set null" }),
    punchRequired: boolean("punch_required").notNull().default(true),
    /** Số công theo tên của bản gốc (giữ đồng bộ với `units`) */
    dayCredit: doublePrecision("day_credit").notNull().default(1),
    /** Mã nghỉ phép (P) — 0 công nhưng vào cột ngày nghỉ */
    isLeave: boolean("is_leave").notNull().default(false),
    /** Phút định mức (Giờ KH của bản gốc) — 0 = lấy theo các đoạn giờ */
    nominalMinutes: integer("nominal_minutes").notNull().default(0),
    /** `paid_break` = nghỉ giữa giờ vẫn tính công (CS, CT của bản gốc) */
    payMode: payModeEnum("pay_mode").notNull().default("normal"),
    /** Cột gộp hiển thị một dòng như bản gốc — suy ra từ kind + workplace */
    attendanceMode: attendanceModeEnum("attendance_mode").notNull().default("timed"),
    note: text("note"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("work_shifts_code_unique").on(t.centerId, t.code)],
);

/** Khung ca tuần: sinh lưới phân ca tháng theo thứ */
export const shiftTemplates = pgTable(
  "shift_templates",
  {
    id: id(),
    centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
    /** 1 = Thứ Hai … 7 = Chủ nhật */
    weekday: integer("weekday").notNull(),
    shiftId: uuid("shift_id").references(() => workShifts.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("shift_templates_unique").on(t.staffId, t.weekday), index("shift_templates_center_idx").on(t.centerId)],
);

/** Ô lưới phân ca theo ngày — `origin` quyết định ô có bị sinh lại / import đè hay không */
export const shiftAssignments = pgTable(
  "shift_assignments",
  {
    id: id(),
    staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    shiftId: uuid("shift_id").notNull().references(() => workShifts.id),
    centerId: uuid("center_id").notNull().references(() => centers.id),
    origin: cellOriginEnum("origin").notNull().default("manual"),
    /**
     * Ảnh chụp giờ + số công của mã ca **lúc xếp ô này**.
     * Bản gốc: "Đổi giờ/số công chỉ áp cho ô xếp SAU khi lưu — lịch đã xếp giữ nguyên."
     * Tính công đọc từ đây, chỉ khi rỗng mới quay về danh mục mã ca.
     */
    unitsSnapshot: doublePrecision("units_snapshot"),
    minutesSnapshot: integer("minutes_snapshot"),
    segmentsSnapshot: jsonb("segments_snapshot").$type<ShiftSegment[]>(),
    /** Đơn đã duyệt sinh ra ô này */
    sourceRequestId: uuid("source_request_id"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("shift_assignments_unique").on(t.staffId, t.date), index("shift_assignments_center_idx").on(t.centerId, t.date)],
);

/** Lần nhập lịch phân ca (CSV / dán từ Sheet) */
export const rosterImports = pgTable(
  "roster_imports",
  {
    id: id(),
    centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    created: integer("created").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    keptManual: integer("kept_manual").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    detail: jsonb("detail"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("roster_imports_center_idx").on(t.centerId, t.createdAt)],
);

/** Điểm chấm công: mã QR cố định dán tại quầy + vùng định vị */
export const checkinPoints = pgTable(
  "checkin_points",
  {
    id: id(),
    centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    radiusM: integer("radius_m").notNull().default(100),
    geofenceEnabled: boolean("geofence_enabled").notNull().default(true),
    /** Đời khoá: tăng lên là mã cũ hết hiệu lực (in lại mã mới) */
    keyVersion: integer("key_version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("checkin_points_center_idx").on(t.centerId, t.isActive)],
);

/** Lượt chấm công thô — chỉ thêm (trigger SQL) */
export const attendancePunches = pgTable(
  "attendance_punches",
  {
    id: id(),
    staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
    centerId: uuid("center_id").notNull().references(() => centers.id),
    kind: text("kind", { enum: ["in", "out"] }).notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    /** qr | request | manual */
    source: text("source").notNull(),
    pointId: uuid("point_id").references(() => checkinPoints.id, { onDelete: "set null" }),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    accuracyM: integer("accuracy_m"),
    distanceM: integer("distance_m"),
    /** Cờ phát hiện lúc chấm (ngoài vùng, GPS kém, bấm trùng…) */
    flags: jsonb("flags").$type<string[]>().notNull().default([]),
    requestId: uuid("request_id"),
    note: text("note"),
    ip: text("ip"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("attendance_punches_staff_idx").on(t.staffId, t.at), index("attendance_punches_point_idx").on(t.pointId, t.at)],
);

/** Chỉnh công ngày (ghi đè công — có lý do, ghi audit) */
export const timesheetOverrides = pgTable(
  "timesheet_overrides",
  {
    id: id(),
    staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    units: doublePrecision("units").notNull(),
    label: text("label").notNull(),
    reason: text("reason").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("timesheet_overrides_unique").on(t.staffId, t.date)],
);

/** Kết luận rà cờ chấm công (ghi nhận có lý do / gỡ kết luận / vắng có lý do) */
export const timesheetFlagReviews = pgTable(
  "timesheet_flag_reviews",
  {
    id: id(),
    staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
    centerId: uuid("center_id").notNull().references(() => centers.id),
    date: date("date").notNull(),
    /** Mã cờ (TIMESHEET_FLAGS) — "*" = kết luận cho cả ngày */
    flag: text("flag").notNull(),
    action: flagReviewActionEnum("action").notNull(),
    note: text("note").notNull(),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("timesheet_flag_reviews_unique").on(t.staffId, t.date, t.flag), index("timesheet_flag_reviews_center_idx").on(t.centerId, t.date)],
);

/**
 * Đơn từ — 10 loại, 3 nhóm. Duyệt là **áp ngay** lên lịch ca / buổi dạy / lượt chấm;
 * áp không được thì đơn quay lại Chờ duyệt kèm `applyError`.
 */
export const staffRequests = pgTable(
  "staff_requests",
  {
    id: id(),
    staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
    /** Cơ sở chịu công ngày đó = cơ sở nhận đơn */
    centerId: uuid("center_id").notNull().references(() => centers.id),
    kind: staffRequestKindEnum("kind").notNull(),
    status: staffRequestStatusEnum("status").notNull().default("pending"),
    dateFrom: date("date_from").notNull(),
    dateTo: date("date_to").notNull(),
    /** Nhóm lớp học */
    classId: uuid("class_id").references(() => classes.id, { onDelete: "set null" }),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
    /** Người dạy thay / người nhận ca */
    targetStaffId: uuid("target_staff_id").references(() => staff.id, { onDelete: "set null" }),
    /** Mã ca mới của người nộp / của người nhận ca */
    requesterShiftId: uuid("requester_shift_id").references(() => workShifts.id, { onDelete: "set null" }),
    targetShiftId: uuid("target_shift_id").references(() => workShifts.id, { onDelete: "set null" }),
    portion: text("portion"),
    leaveType: leaveTypeEnum("leave_type"),
    leavePaid: boolean("leave_paid"),
    lateEarlyKind: lateEarlyKindEnum("late_early_kind"),
    atTime: text("at_time"),
    startTime: text("start_time"),
    endTime: text("end_time"),
    punchIn: text("punch_in"),
    punchOut: text("punch_out"),
    destination: text("destination"),
    days: doublePrecision("days").notNull().default(0),
    minutes: integer("minutes").notNull().default(0),
    reason: text("reason").notNull(),
    /** Nộp sát ngày áp dụng hơn hạn báo trước */
    lateSubmission: boolean("late_submission").notNull().default(false),
    /** Xem trước hệ quả khi duyệt (cột "Thay đổi") */
    effectPreview: text("effect_preview"),
    /** Lần duyệt gần nhất không áp được */
    applyError: text("apply_error"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    appliedEffect: jsonb("applied_effect"),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("staff_requests_status_idx").on(t.status, t.centerId),
    index("staff_requests_staff_idx").on(t.staffId, t.dateFrom),
    index("staff_requests_class_idx").on(t.classId, t.dateFrom),
  ],
);

/** Kỳ công theo cơ sở + tháng */
export const timesheetPeriods = pgTable(
  "timesheet_periods",
  {
    id: id(),
    centerId: uuid("center_id").notNull().references(() => centers.id),
    period: text("period").notNull(),
    status: periodStatusEnum("status").notNull().default("open"),
    /** Số công chuẩn của kỳ (để trống = tự tính) */
    standardUnits: doublePrecision("standard_units"),
    standardNote: text("standard_note"),
    lockedBy: uuid("locked_by").references(() => users.id),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    unlockReason: text("unlock_reason"),
    /** Bản chốt gần nhất; các bản trước vẫn nằm trong nhật ký thao tác */
    snapshot: jsonb("snapshot"),
    /** Số lần đã chốt — chốt lại sau khi mở lại sẽ ghi một bản mới */
    closeCount: integer("close_count").notNull().default(0),
    reopenedBy: uuid("reopened_by").references(() => users.id),
    reopenedAt: timestamp("reopened_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("timesheet_periods_unique").on(t.centerId, t.period)],
);
