import { z } from "zod";
import { STAFF_STATUSES, EMPLOYMENT_TYPES, DEPARTMENTS, POSITION_KINDS, REQUEST_KINDS, REQUEST_STATUSES, LEAVE_TYPES } from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import * as H from "../services/hr";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ");
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Kỳ công dạng YYYY-MM");
const hm = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Giờ dạng HH:MM");
const ntext = (n: number) => z.string().max(n).nullish();

export const hrRouter = router({
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
      userId: uuid.nullish(), teacherId: uuid.nullish(),
      private: z.object({
        idNumber: z.string().regex(/^\d{9}$|^\d{12}$|^$/, "CCCD 12 số (hoặc CMND 9 số)").nullish(), birthDate: isoDate.nullish().or(z.literal("")), address: ntext(300),
        taxCode: ntext(20), insuranceNo: ntext(20), bankName: ntext(80), bankAccount: ntext(30),
        baseSalary: z.number().int().min(0).max(1_000_000_000).nullish(), allowance: z.number().int().min(0).max(1_000_000_000).nullish(),
      }).nullish(),
    }))
    .mutation(({ ctx, input }) => H.upsertStaff(ctx, { ...input, email: input.email || null, hiredAt: input.hiredAt || null, private: input.private ? { ...input.private, birthDate: input.private.birthDate || null } : null })),
  setStaffStatus: protectedProcedure.input(z.object({ id: uuid, status: z.enum(STAFF_STATUSES), reason: ntext(300), effectiveDate: isoDate.nullish() })).mutation(({ ctx, input }) => H.setStaffStatus(ctx, input)),
  revealStaff: protectedProcedure.input(z.object({ id: uuid, reason: z.string().max(300) })).mutation(({ ctx, input }) => H.revealStaffPrivate(ctx, input)),

  positions: protectedProcedure
    .input(z.object({ date: isoDate.optional(), centerId: uuid.optional(), kind: z.enum(POSITION_KINDS).optional(), includeEnded: z.boolean().optional() }).default({}))
    .query(({ ctx, input }) => H.listPositions(ctx, input)),
  addPosition: protectedProcedure
    .input(z.object({ staffId: uuid, centerId: uuid, title: z.string().trim().min(2).max(80), department: z.enum(DEPARTMENTS), kind: z.enum(POSITION_KINDS), effectiveFrom: isoDate, effectiveTo: isoDate.nullish(), note: ntext(300) }))
    .mutation(({ ctx, input }) => H.addPosition(ctx, input)),
  endPosition: protectedProcedure.input(z.object({ id: uuid, effectiveTo: isoDate, reason: z.string().max(300) })).mutation(({ ctx, input }) => H.endPosition(ctx, input)),

  shifts: protectedProcedure.input(z.object({ centerId: uuid.optional() }).default({})).query(({ ctx, input }) => H.listShifts(ctx, input)),
  upsertShift: protectedProcedure
    .input(z.object({ id: uuid.optional(), centerId: uuid.nullable(), code: z.string().trim().min(1).max(12), name: z.string().trim().min(2).max(60), startTime: hm, endTime: hm, breakMinutes: z.number().int().min(0).max(240), isActive: z.boolean() }))
    .mutation(({ ctx, input }) => H.upsertShift(ctx, input)),
  roster: protectedProcedure.input(z.object({ centerId: uuid, weekStart: isoDate })).query(({ ctx, input }) => H.roster(ctx, input)),
  assignShifts: protectedProcedure
    .input(z.object({ centerId: uuid, entries: z.array(z.object({ staffId: uuid, date: isoDate, shiftId: uuid.nullable() })).max(500) }))
    .mutation(({ ctx, input }) => H.assignShifts(ctx, input)),
  copyWeek: protectedProcedure.input(z.object({ centerId: uuid, fromWeek: isoDate, toWeek: isoDate, overwrite: z.boolean() })).mutation(({ ctx, input }) => H.copyWeek(ctx, input)),
  setGeofence: protectedProcedure
    .input(z.object({ centerId: uuid, latitude: z.number().nullable(), longitude: z.number().nullable(), radiusM: z.number().int() }))
    .mutation(({ ctx, input }) => H.setCenterGeofence(ctx, input)),

  me: protectedProcedure.input(z.object({ period: period.optional() }).default({})).query(({ ctx, input }) => H.myAttendance(ctx, input)),
  punch: protectedProcedure
    .input(z.object({ kind: z.enum(["in", "out"]), lat: z.number().min(-90).max(90).nullish(), lng: z.number().min(-180).max(180).nullish(), accuracy: z.number().min(0).max(100000).nullish() }))
    .mutation(({ ctx, input }) => H.punch(ctx, input)),

  timesheet: protectedProcedure.input(z.object({ centerId: uuid, period, q: z.string().max(100).optional() })).query(({ ctx, input }) => H.timesheet(ctx, input)),
  dayDetail: protectedProcedure.input(z.object({ staffId: uuid, date: isoDate })).query(({ ctx, input }) => H.dayDetail(ctx, input)),
  overrideDay: protectedProcedure
    .input(z.object({ staffId: uuid, date: isoDate, units: z.number().nullable(), label: ntext(60), reason: z.string().max(300) }))
    .mutation(({ ctx, input }) => H.overrideDay(ctx, input)),
  lockPeriod: protectedProcedure.input(z.object({ centerId: uuid, period })).mutation(({ ctx, input }) => H.lockPeriod(ctx, input)),
  unlockPeriod: protectedProcedure.input(z.object({ centerId: uuid, period, reason: z.string().max(300) })).mutation(({ ctx, input }) => H.unlockPeriod(ctx, input)),

  requests: protectedProcedure
    .input(z.object({ status: z.enum(REQUEST_STATUSES).optional(), kind: z.enum(REQUEST_KINDS).optional(), centerId: uuid.optional(), mine: z.boolean().optional() }).default({}))
    .query(({ ctx, input }) => H.listRequests(ctx, input)),
  createRequest: protectedProcedure
    .input(z.object({
      staffId: uuid.nullish(), kind: z.enum(REQUEST_KINDS), dateFrom: isoDate, dateTo: isoDate, portion: z.enum(["full", "am", "pm"]).nullish(), leaveType: z.enum(LEAVE_TYPES).nullish(),
      lateMin: z.number().int().min(0).max(600).nullish(), earlyMin: z.number().int().min(0).max(600).nullish(),
      punchIn: hm.nullish().or(z.literal("")), punchOut: hm.nullish().or(z.literal("")), otStart: hm.nullish(), otEnd: hm.nullish(), reason: z.string().max(500),
    }))
    .mutation(({ ctx, input }) => H.createRequest(ctx, { ...input, punchIn: input.punchIn || null, punchOut: input.punchOut || null })),
  decideRequest: protectedProcedure.input(z.object({ id: uuid, action: z.enum(["approve", "reject", "cancel"]), note: ntext(300) })).mutation(({ ctx, input }) => H.decideRequest(ctx, input)),
});
