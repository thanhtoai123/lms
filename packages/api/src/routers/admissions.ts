import { z } from "zod";
import { LEAD_STATUSES, DISTRIBUTION_MODES } from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import * as L from "../services/leads";
import * as A from "../services/admissionsAdmin";

const childInput = z.object({
  fullName: z.string().min(1).max(120),
  birthYear: z.number().int().min(2005).max(2026).nullish(),
  grade: z.number().int().min(1).max(12).nullish(),
  school: z.string().max(200).nullish(),
  interestedCourseId: z.string().uuid().nullish(),
  notes: z.string().max(500).nullish(),
});

const leadInput = z.object({
  parentName: z.string().min(2).max(120),
  phone: z.string().min(9).max(20),
  email: z.string().email().nullish(),
  childName: z.string().max(120).nullish(),
  childGrade: z.number().int().min(1).max(12).nullish(),
  childBirthYear: z.number().int().min(2005).max(2025).nullish(),
  school: z.string().max(200).nullish(),
  interestedCourseId: z.string().uuid().nullish(),
  centerId: z.string().uuid().nullish(),
  source: z.string().max(60).nullish(),
  utmSource: z.string().max(100).nullish(),
  utmMedium: z.string().max(100).nullish(),
  utmCampaign: z.string().max(100).nullish(),
  notes: z.string().max(2000).nullish(),
  consent: z.boolean().optional(),
  autoAssign: z.boolean().optional(),
  assignedToId: z.string().uuid().nullish(),
  children: z.array(childInput).max(10).optional(),
});

const convertInput = z.object({
  leadId: z.string().uuid(), classId: z.string().uuid(), packageSessions: z.number().int().min(1).max(200),
  studentName: z.string().min(2).max(120).optional(), grade: z.number().int().min(1).max(12).nullish(), status: z.enum(["active", "trial"]).optional(),
  childId: z.string().uuid().nullish(), mediaConsent: z.boolean().optional(), paidAmount: z.number().int().min(0).nullish(), paidAt: z.string().nullish(),
});
const centerIdInput = z.object({ centerId: z.string().uuid().nullable() });
export type LeadInput = z.infer<typeof leadInput>;
export { leadInput };

export const leadsRouter = router({
  inbox: protectedProcedure
    .input(z.object({ scope: z.enum(["mine", "center", "all"]).default("all"), status: z.enum(LEAD_STATUSES).optional(), centerId: z.string().uuid().optional(), q: z.string().max(100).optional(), limit: z.number().int().min(1).max(500).optional() }).default({ scope: "all" }))
    .query(({ ctx, input }) => L.leadInbox(ctx, input)),
  get: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(({ ctx, input }) => L.getLead(ctx, input.id)),
  create: protectedProcedure.input(leadInput).mutation(({ ctx, input }) => L.createLead(ctx.db, input, ctx.user.id)),
  addActivity: protectedProcedure
    .input(z.object({ leadId: z.string().uuid(), type: z.enum(["note", "call", "message"]), content: z.string().min(1).max(2000), nextActionAt: z.string().datetime().nullish() }))
    .mutation(({ ctx, input }) => L.addActivity(ctx, input)),
  transition: protectedProcedure
    .input(z.object({ leadId: z.string().uuid(), event: z.enum(["contact", "nurture", "schedule_trial", "start_trial", "trial_attended", "trial_no_show", "consult", "await_decision", "enroll", "lose", "reopen"]), note: z.string().max(1000).optional(), lostReason: z.string().max(200).optional(), trialAt: z.string().datetime().optional() }))
    .mutation(({ ctx, input }) => L.transitionLead(ctx, input)),
  assign: protectedProcedure.input(z.object({ leadId: z.string().uuid(), assigneeId: z.string().uuid().nullable(), reason: z.string().max(300).optional() })).mutation(({ ctx, input }) => L.assignLead(ctx, input)),
  addChild: protectedProcedure.input(childInput.extend({ leadId: z.string().uuid() })).mutation(({ ctx, input }) => L.addLeadChild(ctx, input)),
  removeChild: protectedProcedure.input(z.object({ leadId: z.string().uuid(), childId: z.string().uuid() })).mutation(({ ctx, input }) => L.removeLeadChild(ctx, input)),
  transferCenter: protectedProcedure.input(z.object({ leadId: z.string().uuid(), toCenterId: z.string().uuid(), reason: z.string().min(3).max(300), toUserId: z.string().uuid().nullish() })).mutation(({ ctx, input }) => A.transferCenter(ctx, input)),
  completeTask: protectedProcedure.input(z.object({ taskId: z.string().uuid(), note: z.string().max(500).optional() })).mutation(({ ctx, input }) => L.completeTask(ctx, input)),
  convert: protectedProcedure.input(convertInput).mutation(({ ctx, input }) => L.convertLead(ctx, input)),
  bulkConvertCandidates: protectedProcedure
    .input(z.object({ centerId: z.string().uuid().nullish(), q: z.string().max(100).optional(), statuses: z.array(z.enum(LEAD_STATUSES)).optional() }).default({}))
    .query(({ ctx, input }) => A.bulkConvertCandidates(ctx, input)),
  bulkConvert: protectedProcedure.input(z.object({ items: z.array(convertInput).min(1).max(100) })).mutation(({ ctx, input }) => A.bulkConvert(ctx, input, L.convertLead)),
  stale: protectedProcedure.input(z.object({ sinceDays: z.number().int().min(1).max(365).optional(), centerId: z.string().uuid().nullish(), limit: z.number().int().max(1000).optional() }).default({})).query(({ ctx, input }) => A.staleLeads(ctx, input)),
  handover: protectedProcedure
    .input(z.object({ fromUserId: z.string().uuid(), toUserId: z.string().uuid(), statuses: z.array(z.enum(LEAD_STATUSES)).optional(), utmCampaign: z.string().max(100).nullish(), centerId: z.string().uuid().nullish(), reason: z.string().min(3).max(300), execute: z.boolean() }))
    .mutation(({ ctx, input }) => A.handoverLeads(ctx, input)),
  transfersReport: protectedProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), kind: z.enum(["handover", "center_transfer", "redistribute"]).optional() })).query(({ ctx, input }) => A.transfersReport(ctx, input)),
  summary: protectedProcedure.input(z.object({ centerId: z.string().uuid().nullish(), days: z.number().int().min(1).max(365).optional() }).default({})).query(({ ctx, input }) => A.crmSummary(ctx, input)),
  // Cấu hình chia lead + SLA
  settings: protectedProcedure.input(centerIdInput).query(({ ctx, input }) => A.getSettings(ctx, input.centerId)),
  updateSettings: protectedProcedure
    .input(centerIdInput.extend({ distributionMode: z.enum(DISTRIBUTION_MODES).optional(), dedupeDays: z.number().int().min(0).max(365).optional(), maxTrialsPerLead: z.number().int().min(1).max(10).optional(), staleAfterDays: z.number().int().min(1).max(90).optional(), slaMinutes: z.record(z.string(), z.number().int().min(1).nullable()).optional() }))
    .mutation(({ ctx, input }) => A.updateSettings(ctx, input)),
  distribution: protectedProcedure.input(centerIdInput).query(({ ctx, input }) => A.distributionBoard(ctx, input.centerId)),
  upsertAssignee: protectedProcedure.input(centerIdInput.extend({ userId: z.string().uuid(), isAvailable: z.boolean().optional(), weight: z.number().int().min(1).max(10).optional(), note: z.string().max(200).nullish() })).mutation(({ ctx, input }) => A.upsertAssignee(ctx, input)),
  removeAssignee: protectedProcedure.input(centerIdInput.extend({ userId: z.string().uuid() })).mutation(({ ctx, input }) => A.removeAssignee(ctx, input)),
  resetRounds: protectedProcedure.input(centerIdInput).mutation(({ ctx, input }) => A.resetRounds(ctx, input.centerId)),
  distributePool: protectedProcedure.input(centerIdInput.extend({ limit: z.number().int().min(1).max(200).optional() })).mutation(({ ctx, input }) => A.distributePool(ctx, input.centerId, input.limit)),
  myTasks: protectedProcedure.query(({ ctx }) => L.myLeadTasks(ctx)),
  assigneeOptions: protectedProcedure.input(z.object({ centerId: z.string().uuid().nullish() }).default({})).query(({ ctx, input }) => L.assigneeOptions(ctx, input.centerId)),
});
