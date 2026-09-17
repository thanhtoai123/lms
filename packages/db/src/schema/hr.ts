import { pgTable, text, uuid, integer, bigint, date, timestamp, pgEnum, jsonb, index, uniqueIndex, doublePrecision, boolean } from "drizzle-orm/pg-core";
import { STAFF_STATUSES, EMPLOYMENT_TYPES, POSITION_KINDS, REQUEST_KINDS, REQUEST_STATUSES, LEAVE_TYPES, PERIOD_STATUSES } from "@satarobo/core";
import { id, timestamps } from "./_common";
import { users } from "./identity";
import { centers } from "./org";
import { teachers } from "./people";

const money = (name: string) => bigint(name, { mode: "number" });

export const staffStatusEnum = pgEnum("staff_status", STAFF_STATUSES);
export const employmentTypeEnum = pgEnum("employment_type", EMPLOYMENT_TYPES);
export const positionKindEnum = pgEnum("position_kind", POSITION_KINDS);
export const staffRequestKindEnum = pgEnum("staff_request_kind", REQUEST_KINDS);
export const staffRequestStatusEnum = pgEnum("staff_request_status", REQUEST_STATUSES);
export const leaveTypeEnum = pgEnum("leave_type", LEAVE_TYPES);
export const periodStatusEnum = pgEnum("timesheet_period_status", PERIOD_STATUSES);

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
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Vị trí công việc: chính / kiêm nhiệm / uỷ quyền, có hiệu lực */
export const staffPositions = pgTable(
  "staff_positions",
  {
    id: id(),
    staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
    centerId: uuid("center_id").notNull().references(() => centers.id),
    title: text("title").notNull(),
    department: text("department").notNull(),
    kind: positionKindEnum("kind").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    note: text("note"),
    endReason: text("end_reason"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("staff_positions_staff_idx").on(t.staffId, t.effectiveFrom), index("staff_positions_center_idx").on(t.centerId)],
);

/** Ca làm việc mẫu */
export const workShifts = pgTable("work_shifts", {
  id: id(),
  centerId: uuid("center_id").references(() => centers.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  breakMinutes: integer("break_minutes").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
}, (t) => [uniqueIndex("work_shifts_code_unique").on(t.centerId, t.code)]);

/** Phân ca theo ngày */
export const shiftAssignments = pgTable(
  "shift_assignments",
  {
    id: id(),
    staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    shiftId: uuid("shift_id").notNull().references(() => workShifts.id),
    centerId: uuid("center_id").notNull().references(() => centers.id),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("shift_assignments_unique").on(t.staffId, t.date), index("shift_assignments_center_idx").on(t.centerId, t.date)],
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
    /** gps | request | manual */
    source: text("source").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    accuracyM: integer("accuracy_m"),
    distanceM: integer("distance_m"),
    requestId: uuid("request_id"),
    note: text("note"),
    ip: text("ip"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("attendance_punches_staff_idx").on(t.staffId, t.at)],
);

/** Chỉnh công ngày (có lý do, ghi audit) */
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

/** Đơn từ: nghỉ, đi muộn/về sớm, làm thêm, quên chấm công */
export const staffRequests = pgTable(
  "staff_requests",
  {
    id: id(),
    staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
    centerId: uuid("center_id").notNull().references(() => centers.id),
    kind: staffRequestKindEnum("kind").notNull(),
    status: staffRequestStatusEnum("status").notNull().default("pending"),
    dateFrom: date("date_from").notNull(),
    dateTo: date("date_to").notNull(),
    portion: text("portion"),
    leaveType: leaveTypeEnum("leave_type"),
    days: doublePrecision("days").notNull().default(0),
    minutes: integer("minutes").notNull().default(0),
    lateMin: integer("late_min"),
    earlyMin: integer("early_min"),
    punchIn: text("punch_in"),
    punchOut: text("punch_out"),
    otStart: text("ot_start"),
    otEnd: text("ot_end"),
    reason: text("reason").notNull(),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("staff_requests_status_idx").on(t.status, t.centerId), index("staff_requests_staff_idx").on(t.staffId, t.dateFrom)],
);

/** Kỳ công theo cơ sở + tháng */
export const timesheetPeriods = pgTable(
  "timesheet_periods",
  {
    id: id(),
    centerId: uuid("center_id").notNull().references(() => centers.id),
    period: text("period").notNull(),
    status: periodStatusEnum("status").notNull().default("open"),
    lockedBy: uuid("locked_by").references(() => users.id),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    unlockReason: text("unlock_reason"),
    snapshot: jsonb("snapshot"),
    ...timestamps,
  },
  (t) => [uniqueIndex("timesheet_periods_unique").on(t.centerId, t.period)],
);
