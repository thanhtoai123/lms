import { z } from "zod";
import { JOB_STATUSES, CANDIDATE_STAGES, INTERVIEW_RESULTS, EMPLOYMENT_TYPES, MSG_CHANNELS, CONV_STATUSES, AFFILIATE_TYPES, REWARD_STATUSES, DEPARTMENTS } from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import * as R from "../services/recruit";
import * as M from "../services/messaging";
import * as ZC from "../services/zaloCrm";
import * as A from "../services/affiliates";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const s = (n: number) => z.string().max(n);
const range = { from: isoDate.optional(), to: isoDate.optional() };

export const recruitRouter = router({
  jobs: protectedProcedure.input(z.object({ status: z.enum(JOB_STATUSES).optional(), q: s(100).optional() }).default({})).query(({ ctx, input }) => R.listJobs(ctx, input)),
  job: protectedProcedure.input(z.object({ id: uuid, stage: z.enum(CANDIDATE_STAGES).optional() })).query(({ ctx, input }) => R.getJob(ctx, input)),
  upsertJob: protectedProcedure
    .input(z.object({
      id: uuid.optional(), title: s(150), centerId: uuid.nullish(), department: z.enum(DEPARTMENTS), employmentType: z.enum(EMPLOYMENT_TYPES), openings: z.number().int(),
      salaryMin: z.number().int().min(0).max(1_000_000_000).nullish(), salaryMax: z.number().int().min(0).max(1_000_000_000).nullish(), salaryText: s(100).nullish(),
      description: s(10_000), requirements: s(5_000).nullish(), benefits: s(5_000).nullish(), deadline: isoDate.nullish(),
    }))
    .mutation(({ ctx, input }) => R.upsertJob(ctx, input)),
  setJobStatus: protectedProcedure.input(z.object({ id: uuid, status: z.enum(JOB_STATUSES) })).mutation(({ ctx, input }) => R.setJobStatus(ctx, input)),
  candidate: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => R.getCandidate(ctx, input.id)),
  move: protectedProcedure.input(z.object({ id: uuid, stage: z.enum(CANDIDATE_STAGES), reason: s(500).nullish() })).mutation(({ ctx, input }) => R.moveCandidate(ctx, input)),
  schedule: protectedProcedure
    .input(z.object({ candidateId: uuid, scheduledAt: z.string().datetime({ offset: true }), durationMin: z.number().int(), interviewerId: uuid, location: s(200).nullish() }))
    .mutation(({ ctx, input }) => R.scheduleInterview(ctx, input)),
  score: protectedProcedure.input(z.object({ id: uuid, score: z.number().int(), result: z.enum(INTERVIEW_RESULTS), feedback: s(3000) })).mutation(({ ctx, input }) => R.scoreInterview(ctx, input)),
  cancelInterview: protectedProcedure.input(z.object({ id: uuid })).mutation(({ ctx, input }) => R.cancelInterview(ctx, input)),
  hire: protectedProcedure.input(z.object({ id: uuid, centerId: uuid, title: s(100), department: z.enum(DEPARTMENTS), hiredAt: isoDate })).mutation(({ ctx, input }) => R.hireCandidate(ctx, input)),
  reveal: protectedProcedure.input(z.object({ id: uuid, reason: s(300) })).mutation(({ ctx, input }) => R.revealCandidate(ctx, input)),
  report: protectedProcedure.query(({ ctx }) => R.recruitReport(ctx)),
});

export const messagingRouter = router({
  inbox: protectedProcedure
    .input(z.object({ status: z.enum(CONV_STATUSES).optional(), channel: z.enum(MSG_CHANNELS).optional(), mine: z.boolean().optional(), flagged: z.boolean().optional(), q: s(100).optional(), kind: z.enum(["lead", "parent"]).optional() }).default({}))
    .query(({ ctx, input }) => M.inbox(ctx, input)),
  conversation: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => M.getConversation(ctx, input.id)),
  send: protectedProcedure.input(z.object({ id: uuid, body: s(4000), note: z.boolean().optional() })).mutation(({ ctx, input }) => M.sendMessage(ctx, input)),
  update: protectedProcedure.input(z.object({ id: uuid, status: z.enum(CONV_STATUSES).optional(), assignedTo: uuid.nullish(), clearFlags: z.boolean().optional() })).mutation(({ ctx, input }) => M.updateConversation(ctx, input)),
  startParent: protectedProcedure.input(z.object({ studentId: uuid, subject: s(150), body: s(4000), includeTeacher: z.boolean().optional() })).mutation(({ ctx, input }) => M.startParentConversation(ctx, input)),
  renewLink: protectedProcedure.input(z.object({ id: uuid })).mutation(({ ctx, input }) => M.renewPortalLink(ctx, input)),
  link: protectedProcedure
    .input(z.object({ id: uuid, leadId: uuid.nullish(), parentId: uuid.nullish(), create: z.object({ parentName: s(120), phone: s(20), childName: s(120).nullish(), centerId: uuid.nullish(), consent: z.boolean() }).nullish() }))
    .mutation(({ ctx, input }) => M.linkConversation(ctx, input)),
  crm: protectedProcedure.query(({ ctx }) => M.messengerCrm(ctx)),
  /** Zalo CRM — kênh Zalo trên một màn: kết nối, khung 48 giờ, ZNS, lead từ Zalo */
  zaloCrm: protectedProcedure.input(z.object({ days: z.number().int().min(7).max(180).optional() }).default({})).query(({ ctx, input }) => ZC.zaloCrm(ctx, input)),
  myStudents: protectedProcedure.query(({ ctx }) => M.myStudentsForChat(ctx)),
  supervision: protectedProcedure.input(z.object({ ...range, centerId: uuid.optional() }).default({})).query(({ ctx, input }) => M.supervision(ctx, input)),
  settings: protectedProcedure.query(({ ctx }) => M.getMessagingSettings(ctx)),
  saveSettings: protectedProcedure.input(z.object({ defaultCenterId: uuid.nullable(), autoReply: s(500) })).mutation(({ ctx, input }) => M.saveMessagingSettings(ctx, input)),
  pilot: protectedProcedure.input(z.object(range).default({})).query(({ ctx, input }) => M.chatPilotReport(ctx, input)),
  savePilot: protectedProcedure.input(z.object({ classIds: z.array(uuid).max(50), startDate: isoDate.nullable(), note: s(500) })).mutation(({ ctx, input }) => M.savePilot(ctx, input)),
});

export const affiliateRouter = router({
  list: protectedProcedure.input(z.object({ q: s(100).optional(), active: z.boolean().optional() }).default({})).query(({ ctx, input }) => A.listAffiliates(ctx, input)),
  get: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => A.getAffiliate(ctx, input.id)),
  upsert: protectedProcedure
    .input(z.object({
      id: uuid.optional(), name: s(120), code: s(20), type: z.enum(AFFILIATE_TYPES), phone: s(20).nullish(), email: s(200).nullish(), centerId: uuid.nullish(),
      rule: z.object({ kind: z.enum(["fixed", "percent"]), value: z.number().min(0), cap: z.number().int().min(0).nullish() }),
      payoutInfo: s(300).nullish(), notes: s(1000).nullish(), isActive: z.boolean().optional(), parentPhone: s(20).nullish(), staffId: uuid.nullish(),
    }))
    .mutation(({ ctx, input }) => A.upsertAffiliate(ctx, input)),
  rewards: protectedProcedure.input(z.object({ status: z.enum(REWARD_STATUSES).optional() }).default({})).query(({ ctx, input }) => A.listRewards(ctx, input)),
  rewardAction: protectedProcedure.input(z.object({ id: uuid, action: z.enum(["approve", "pay", "cancel"]), reason: s(500).nullish(), paymentRef: s(100).nullish() })).mutation(({ ctx, input }) => A.rewardAction(ctx, input)),
});
