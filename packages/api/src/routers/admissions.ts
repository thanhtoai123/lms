import { z } from "zod";
import { LEAD_STATUSES } from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import * as L from "../services/leads";

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
});
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
    .input(z.object({ leadId: z.string().uuid(), event: z.enum(["contact", "nurture", "schedule_trial", "trial_attended", "trial_no_show", "consult", "await_decision", "enroll", "lose", "reopen"]), note: z.string().max(1000).optional(), lostReason: z.string().max(200).optional(), trialAt: z.string().datetime().optional() }))
    .mutation(({ ctx, input }) => L.transitionLead(ctx, input)),
  assign: protectedProcedure.input(z.object({ leadId: z.string().uuid(), assigneeId: z.string().uuid().nullable() })).mutation(({ ctx, input }) => L.assignLead(ctx, input)),
  completeTask: protectedProcedure.input(z.object({ taskId: z.string().uuid(), note: z.string().max(500).optional() })).mutation(({ ctx, input }) => L.completeTask(ctx, input)),
  convert: protectedProcedure
    .input(z.object({ leadId: z.string().uuid(), classId: z.string().uuid(), packageSessions: z.number().int().min(1).max(200), studentName: z.string().min(2).max(120).optional(), grade: z.number().int().min(1).max(12).nullish(), status: z.enum(["active", "trial"]).optional() }))
    .mutation(({ ctx, input }) => L.convertLead(ctx, input)),
  myTasks: protectedProcedure.query(({ ctx }) => L.myLeadTasks(ctx)),
  assigneeOptions: protectedProcedure.input(z.object({ centerId: z.string().uuid().nullish() }).default({})).query(({ ctx, input }) => L.assigneeOptions(ctx, input.centerId)),
});
