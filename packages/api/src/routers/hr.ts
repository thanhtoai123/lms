import { z } from "zod";
import {
  STAFF_STATUSES, EMPLOYMENT_TYPES, DEPARTMENTS, POSITION_KINDS, REQUEST_KINDS, REQUEST_STATUSES, LEAVE_TYPES,
  SHIFT_KINDS, WORKPLACES, CELL_ORIGINS, LATE_EARLY_KINDS, FLAG_REVIEW_ACTIONS, ROLES,
} from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import * as H from "../services/hr";
import * as P from "../services/hrPositions";
import * as C from "../services/hrCheckin";
import * as R from "../services/hrRequests";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ");
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Kỳ công dạng YYYY-MM");
const hm = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Giờ dạng HH:MM");
const ntext = (n: number) => z.string().max(n).nullish();
const segment = z.object({ from: hm, to: hm, paid: z.boolean().optional() });
const assignableRole = z.enum(ROLES).refine((r) => r !== "PARENT" && r !== "STUDENT", "Vị trí công việc không gán vai trò Phụ huynh / Học viên");

export const hrRouter = router({
  /* ---- Hồ sơ nhân sự ---- */
  staff: protectedProcedure
    .input(z.object({ q: z.string().max(100).optional(), centerId: uuid.optional(), status: z.enum(STAFF_STATUSES).optional(), department: z.enum(DEPARTMENTS).optional() }).default({}))
    .query(({ ctx, input }) => H.listStaff(ctx, input)),
  staffDetail: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => H.getStaff(ctx, input.id)),
  linkOptions: protectedProcedure.input(z.object({ centerId: uuid })).query(({ ctx, input }) => H.linkOptions(ctx, input)),
  upsertStaff: protectedProcedure
    .input(z.object({
      id: uuid.optional(), fullName: z.string().trim().min(2, "Họ tên tối thiểu 2 ký tự").max(120), email: z.string().trim().email("Email không hợp lệ").max(200).nullish().or(z.literal("")),
      phone: ntext(20), centerId: uuid, department: z.enum(DEPARTMENTS), title: z.string().trim().min(2, "Chức danh tối thiểu 2 ký tự").max(80),
      employmentType: z.enum(EMPLOYMENT_TYPES), hiredAt: isoDate.nullish().or(z.literal("")), annualLeaveDays: z.number().min(0).max(30), notes: ntext(1000),
      timesheetExempt: z.boolean().optional(), userId: uuid.nullish(), teacherId: uuid.nullish(),
      private: z.object({
        idNumber: z.string().regex(/^\d{9}$|^\d{12}$|^$/, "CCCD 12 số (hoặc CMND 9 số)").nullish(), birthDate: isoDate.nullish().or(z.literal("")), address: ntext(300),
        taxCode: ntext(20), insuranceNo: ntext(20), bankName: ntext(80), bankAccount: ntext(30),
        baseSalary: z.number().int().min(0).max(1_000_000_000).nullish(), allowance: z.number().int().min(0).max(1_000_000_000).nullish(),
      }).nullish(),
    }))
    .mutation(({ ctx, input }) => H.upsertStaff(ctx, { ...input, email: input.email || null, hiredAt: input.hiredAt || null, private: input.private ? { ...input.private, birthDate: input.private.birthDate || null } : null })),
  setStaffStatus: protectedProcedure.input(z.object({ id: uuid, status: z.enum(STAFF_STATUSES), reason: ntext(300), effectiveDate: isoDate.nullish() })).mutation(({ ctx, input }) => H.setStaffStatus(ctx, input)),
  revealStaff: protectedProcedure.input(z.object({ id: uuid, reason: z.string().max(300) })).mutation(({ ctx, input }) => H.revealStaffPrivate(ctx, input)),

  /* ---- Vị trí công việc: danh mục (bộ vai trò) + phân công + điều động ---- */
  positions: protectedProcedure
    .input(z.object({ date: isoDate.optional(), centerId: uuid.optional(), kind: z.enum(POSITION_KINDS).optional(), includeEnded: z.boolean().optional() }).default({}))
    .query(({ ctx, input }) => H.listPositions(ctx, input)),
  positionDefs: protectedProcedure.input(z.object({ centerId: uuid.nullish(), includeInactive: z.boolean().optional() }).default({})).query(({ ctx, input }) => P.listPositionDefs(ctx, input)),
  upsertPositionDef: protectedProcedure
    .input(z.object({
      id: uuid.optional(), centerId: uuid.nullable(), name: z.string().trim().min(2, "Tên vị trí tối thiểu 2 ký tự").max(80),
      department: z.enum(DEPARTMENTS).nullish(), roles: z.array(assignableRole).min(1, "Chọn ít nhất một vai trò").max(12),
      reportsToId: uuid.nullish(), isManager: z.boolean(), isActive: z.boolean().optional(), note: ntext(300),
    }))
    .mutation(({ ctx, input }) => P.upsertPositionDef(ctx, input)),
  assignPosition: protectedProcedure
    .input(z.object({
      staffId: uuid, positionId: uuid.nullish(), centerId: uuid, title: z.string().trim().max(80).nullish(), department: z.enum(DEPARTMENTS),
      kind: z.enum(POSITION_KINDS), effectiveFrom: isoDate, effectiveTo: isoDate.nullish(), note: ntext(300),
    }))
    .mutation(({ ctx, input }) => P.assignPosition(ctx, input)),
  endPosition: protectedProcedure.input(z.object({ id: uuid, effectiveTo: isoDate, reason: z.string().max(300) })).mutation(({ ctx, input }) => H.endPosition(ctx, input)),
  rolesOfStaff: protectedProcedure.input(z.object({ staffId: uuid })).query(({ ctx, input }) => P.rolesOfStaff(ctx, input.staffId)),
  assignableStaff: protectedProcedure.input(z.object({ centerId: uuid.optional() }).default({})).query(({ ctx, input }) => P.assignableStaff(ctx, input)),
  deployments: protectedProcedure.input(z.object({ centerId: uuid.optional(), includeEnded: z.boolean().optional() }).default({})).query(({ ctx, input }) => P.listDeployments(ctx, input)),
  addDeployment: protectedProcedure
    .input(z.object({ staffId: uuid, centerId: uuid, effectiveFrom: isoDate, effectiveTo: isoDate.nullish(), reason: z.string().max(300), note: ntext(300) }))
    .mutation(({ ctx, input }) => P.addDeployment(ctx, input)),
  endDeployment: protectedProcedure.input(z.object({ id: uuid, effectiveTo: isoDate, reason: z.string().max(300) })).mutation(({ ctx, input }) => P.endDeployment(ctx, input)),

  /* ---- Danh mục mã ca ---- */
  shifts: protectedProcedure.input(z.object({ centerId: uuid.optional(), includeInactive: z.boolean().optional() }).default({})).query(({ ctx, input }) => H.listShifts(ctx, input)),
  upsertShift: protectedProcedure
    .input(z.object({
      id: uuid.optional(), centerId: uuid.nullable(), code: z.string().trim().min(1).max(12), name: z.string().trim().min(2).max(60),
      kind: z.enum(SHIFT_KINDS), units: z.number().min(0).max(1.5), segments: z.array(segment).max(4),
      workplace: z.enum(WORKPLACES), workplaceCenterId: uuid.nullish(), punchRequired: z.boolean(), isActive: z.boolean(), sortOrder: z.number().int().min(0).max(999).optional(),
    }))
    .mutation(({ ctx, input }) => H.upsertShift(ctx, input)),
  seedShiftCatalogue: protectedProcedure.mutation(({ ctx }) => H.seedShiftCatalogue(ctx)),

  /* ---- Lưới phân ca ---- */
  roster: protectedProcedure.input(z.object({ centerId: uuid, period: period.optional(), weekStart: isoDate.optional() })).query(({ ctx, input }) => H.roster(ctx, input)),
  assignShifts: protectedProcedure
    .input(z.object({ centerId: uuid, entries: z.array(z.object({ staffId: uuid, date: isoDate, shiftId: uuid.nullable() })).max(500), origin: z.enum(CELL_ORIGINS).optional(), note: ntext(200) }))
    .mutation(({ ctx, input }) => H.assignShifts(ctx, input)),
  saveTemplates: protectedProcedure
    .input(z.object({ centerId: uuid, entries: z.array(z.object({ staffId: uuid, weekday: z.number().int().min(1).max(7), shiftId: uuid.nullable() })).max(500) }))
    .mutation(({ ctx, input }) => H.saveTemplates(ctx, input)),
  generateRoster: protectedProcedure.input(z.object({ centerId: uuid, period, overwriteTemplate: z.boolean().optional() })).mutation(({ ctx, input }) => H.generateRoster(ctx, input)),
  importRoster: protectedProcedure
    .input(z.object({ centerId: uuid, period, content: z.string().min(5).max(500_000), dryRun: z.boolean().optional() }))
    .mutation(({ ctx, input }) => H.importRoster(ctx, input)),

  /* ---- Bảng công & kỳ công ---- */
  timesheet: protectedProcedure
    .input(z.object({ centerId: uuid, period, q: z.string().max(100).optional(), filter: z.enum(["all", "flag", "no_punch", "override"]).optional() }))
    .query(({ ctx, input }) => H.timesheet(ctx, input)),
  dayDetail: protectedProcedure.input(z.object({ staffId: uuid, date: isoDate })).query(({ ctx, input }) => H.dayDetail(ctx, input)),
  overrideDay: protectedProcedure
    .input(z.object({ staffId: uuid, date: isoDate, units: z.number().nullable(), label: ntext(60), reason: z.string().max(300) }))
    .mutation(({ ctx, input }) => H.overrideDay(ctx, input)),
  reviewFlag: protectedProcedure
    .input(z.object({ staffId: uuid, date: isoDate, flag: z.string().min(1).max(40), action: z.enum(FLAG_REVIEW_ACTIONS), note: ntext(300) }))
    .mutation(({ ctx, input }) => H.reviewFlag(ctx, input)),
  setPeriodStandard: protectedProcedure
    .input(z.object({ centerId: uuid, period, standardUnits: z.number().min(0).max(31).nullable(), note: ntext(200) }))
    .mutation(({ ctx, input }) => H.setPeriodStandard(ctx, input)),
  lockPeriod: protectedProcedure.input(z.object({ centerId: uuid, period })).mutation(({ ctx, input }) => H.lockPeriod(ctx, input)),
  unlockPeriod: protectedProcedure.input(z.object({ centerId: uuid, period, reason: z.string().max(300) })).mutation(({ ctx, input }) => H.unlockPeriod(ctx, input)),

  /* ---- Của tôi ---- */
  me: protectedProcedure.input(z.object({ period: period.optional() }).default({})).query(({ ctx, input }) => H.myAttendance(ctx, input)),

  /* ---- Điểm chấm công & quét QR ---- */
  checkinPoints: protectedProcedure.input(z.object({ centerId: uuid.optional(), includeInactive: z.boolean().optional() }).default({})).query(({ ctx, input }) => C.listCheckinPoints(ctx, input)),
  upsertCheckinPoint: protectedProcedure
    .input(z.object({
      id: uuid.optional(), centerId: uuid, name: z.string().trim().min(2).max(80),
      lat: z.number().min(-90).max(90).nullable(), lng: z.number().min(-180).max(180).nullable(),
      radiusM: z.number().int().min(20).max(2000), geofenceEnabled: z.boolean(), isActive: z.boolean(), note: ntext(300),
    }))
    .mutation(({ ctx, input }) => C.upsertCheckinPoint(ctx, input)),
  rotateCheckinKey: protectedProcedure.input(z.object({ id: uuid, reason: z.string().max(300) })).mutation(({ ctx, input }) => C.rotateCheckinKey(ctx, input)),
  checkinScreen: protectedProcedure.input(z.object({ centerId: uuid, pointId: uuid.optional() })).query(({ ctx, input }) => C.checkinScreen(ctx, input)),
  checkinInfo: protectedProcedure.input(z.object({ token: z.string().min(10).max(200) })).query(({ ctx, input }) => C.checkinInfo(ctx, input)),
  punch: protectedProcedure
    .input(z.object({
      token: z.string().min(10).max(200), kind: z.enum(["in", "out"]),
      lat: z.number().min(-90).max(90).nullish(), lng: z.number().min(-180).max(180).nullish(), accuracy: z.number().min(0).max(100000).nullish(),
    }))
    .mutation(({ ctx, input }) => C.punch(ctx, input)),
  addManualPunch: protectedProcedure
    .input(z.object({ staffId: uuid, date: isoDate, kind: z.enum(["in", "out"]), time: hm, reason: z.string().max(300) }))
    .mutation(({ ctx, input }) => C.addManualPunch(ctx, input)),

  /* ---- Đơn từ ---- */
  requests: protectedProcedure
    .input(z.object({ status: z.enum(REQUEST_STATUSES).optional(), kind: z.enum(REQUEST_KINDS).optional(), centerId: uuid.optional(), mine: z.boolean().optional(), applyFailed: z.boolean().optional() }).default({}))
    .query(({ ctx, input }) => R.listRequests(ctx, input)),
  requestForm: protectedProcedure.query(({ ctx }) => R.requestFormData(ctx)),
  previewRequest: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => R.previewRequest(ctx, input)),
  createRequest: protectedProcedure
    .input(z.object({
      staffId: uuid.nullish(), kind: z.enum(REQUEST_KINDS), dateFrom: isoDate, dateTo: isoDate.nullish(), reason: z.string().max(500),
      classId: uuid.nullish(), targetStaffId: uuid.nullish(), requesterShiftId: uuid.nullish(), targetShiftId: uuid.nullish(),
      leaveType: z.enum(LEAVE_TYPES).nullish(), portion: z.enum(["full", "am", "pm"]).nullish(),
      lateEarlyKind: z.enum(LATE_EARLY_KINDS).nullish(), atTime: hm.nullish().or(z.literal("")),
      startTime: hm.nullish().or(z.literal("")), endTime: hm.nullish().or(z.literal("")),
      punchIn: hm.nullish().or(z.literal("")), punchOut: hm.nullish().or(z.literal("")),
      destination: ntext(120), receivingCenterId: uuid.nullish(),
    }))
    .mutation(({ ctx, input }) => R.createRequest(ctx, {
      ...input, atTime: input.atTime || null, startTime: input.startTime || null, endTime: input.endTime || null,
      punchIn: input.punchIn || null, punchOut: input.punchOut || null,
    })),
  decideRequest: protectedProcedure
    .input(z.object({ id: uuid, action: z.enum(["approve", "reject", "cancel"]), note: ntext(300), targetStaffId: uuid.nullish() }))
    .mutation(({ ctx, input }) => R.decideRequest(ctx, input)),
});
