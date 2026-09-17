import { z } from "zod";
import { ROLES, TRIAL_STATUSES } from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import * as Acc from "../services/accounts";
import * as Rep from "../services/reports";
import * as Tr from "../services/trials";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ");
const roleAssign = z.object({ role: z.enum(ROLES), centerId: uuid.nullable() });

export const systemRouter = router({
  users: protectedProcedure
    .input(z.object({ q: z.string().max(100).optional(), role: z.enum(ROLES).optional(), centerId: uuid.optional(), status: z.enum(["active", "locked"]).optional(), page: z.number().int().min(1).optional() }).default({}))
    .query(({ ctx, input }) => Acc.listUsers(ctx, input)),
  user: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => Acc.getUser(ctx, input.id)),
  roleOptions: protectedProcedure.query(({ ctx }) => Acc.roleOptions(ctx)),
  createUser: protectedProcedure
    .input(z.object({
      email: z.string().trim().email("Email không hợp lệ").max(200),
      fullName: z.string().trim().min(2, "Họ tên tối thiểu 2 ký tự").max(120),
      phone: z.string().trim().max(20).nullish(),
      roles: z.array(roleAssign).min(1, "Chọn ít nhất một vai trò").max(20),
    }))
    .mutation(({ ctx, input }) => Acc.createUser(ctx, input)),
  updateUser: protectedProcedure
    .input(z.object({ id: uuid, email: z.string().trim().email("Email không hợp lệ").max(200), fullName: z.string().trim().min(2, "Họ tên tối thiểu 2 ký tự").max(120), phone: z.string().trim().max(20).nullish() }))
    .mutation(({ ctx, input }) => Acc.updateUser(ctx, input)),
  grantRole: protectedProcedure.input(roleAssign.extend({ userId: uuid })).mutation(({ ctx, input }) => Acc.grantRole(ctx, input)),
  revokeRole: protectedProcedure.input(z.object({ roleId: uuid, reason: z.string().max(300).nullish() })).mutation(({ ctx, input }) => Acc.revokeRole(ctx, input)),
  setLock: protectedProcedure.input(z.object({ userId: uuid, lock: z.boolean(), reason: z.string().max(300).nullish() })).mutation(({ ctx, input }) => Acc.setUserLock(ctx, input)),
  roles: protectedProcedure.query(({ ctx }) => Acc.rolesMatrix(ctx)),
  audit: protectedProcedure
    .input(z.object({
      module: z.string().max(60).optional(), entity: z.string().max(60).optional(), action: z.string().max(30).optional(),
      actorId: uuid.optional(), entityId: uuid.optional(), from: isoDate.optional(), to: isoDate.optional(), q: z.string().max(100).optional(), page: z.number().int().min(1).optional(),
    }).default({}))
    .query(({ ctx, input }) => Acc.listAudit(ctx, input)),
  auditOptions: protectedProcedure.query(({ ctx }) => Acc.auditFilterOptions(ctx)),
});

const reportInput = z.object({ from: isoDate.optional(), to: isoDate.optional(), centerId: uuid.optional() }).default({});

export const reportsRouter = router({
  leads: protectedProcedure.input(reportInput).query(({ ctx, input }) => Rep.leadReport(ctx, input)),
  trials: protectedProcedure.input(reportInput).query(({ ctx, input }) => Rep.trialReport(ctx, input)),
  training: protectedProcedure.input(reportInput).query(({ ctx, input }) => Rep.trainingReport(ctx, input)),
  teachers: protectedProcedure.input(reportInput).query(({ ctx, input }) => Rep.teacherReport(ctx, input)),
  center: protectedProcedure.input(reportInput).query(({ ctx, input }) => Rep.centerReport(ctx, input)),
  revenue: protectedProcedure.input(z.object({ year: z.number().int().min(2020).max(2100).optional(), centerId: uuid.optional() }).default({})).query(({ ctx, input }) => Rep.revenueVsTarget(ctx, input)),
  cohort: protectedProcedure.input(z.object({ from: isoDate.optional(), to: isoDate.optional(), centerId: uuid.optional(), courseId: uuid.optional() }).default({})).query(({ ctx, input }) => Rep.cohortReport(ctx, input)),
  churn: protectedProcedure.input(reportInput).query(({ ctx, input }) => Rep.churnReport(ctx, input)),
  setTarget: protectedProcedure
    .input(z.object({ centerId: uuid, period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), amount: z.number().int().min(0).max(100_000_000_000), newEnrollments: z.number().int().min(0).max(10_000).nullish(), note: z.string().max(300).nullish() }))
    .mutation(({ ctx, input }) => Rep.setRevenueTarget(ctx, input)),
});

export const trialsRouter = router({
  list: protectedProcedure
    .input(z.object({ from: isoDate.optional(), to: isoDate.optional(), centerId: uuid.optional(), status: z.enum(TRIAL_STATUSES).optional(), q: z.string().max(100).optional(), mine: z.boolean().optional() }).default({}))
    .query(({ ctx, input }) => Tr.listTrials(ctx, input)),
  slots: protectedProcedure
    .input(z.object({ centerId: uuid.optional(), courseId: uuid.optional(), days: z.number().int().min(1).max(60).optional(), leadId: uuid.optional() }).default({}))
    .query(({ ctx, input }) => Tr.trialSlots(ctx, input)),
  leadOptions: protectedProcedure.input(z.object({ q: z.string().max(100).optional(), centerId: uuid.optional(), id: uuid.optional() }).default({})).query(({ ctx, input }) => Tr.trialLeadOptions(ctx, input)),
  book: protectedProcedure
    .input(z.object({ leadId: uuid, childId: uuid.nullish(), sessionId: uuid, note: z.string().max(300).nullish() }))
    .mutation(({ ctx, input }) => Tr.bookTrial(ctx, input)),
  reschedule: protectedProcedure
    .input(z.object({ bookingId: uuid, newSessionId: uuid, reason: z.string().max(300) }))
    .mutation(({ ctx, input }) => Tr.rescheduleTrial(ctx, input)),
  cancel: protectedProcedure.input(z.object({ bookingId: uuid, reason: z.string().max(300) })).mutation(({ ctx, input }) => Tr.cancelTrial(ctx, input)),
  result: protectedProcedure
    .input(z.object({ bookingId: uuid, result: z.enum(["attend", "no_show"]), note: z.string().max(500).nullish() }))
    .mutation(({ ctx, input }) => Tr.recordTrialResult(ctx, input)),
  undo: protectedProcedure.input(z.object({ bookingId: uuid, reason: z.string().max(300) })).mutation(({ ctx, input }) => Tr.undoTrialResult(ctx, input)),
});
