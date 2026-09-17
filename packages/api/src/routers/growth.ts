import { z } from "zod";
import { POST_STATUSES, POST_CATEGORIES, CHANNELS, DSR_TYPES, DSR_STATUSES, SUBJECT_TYPES, CONSENT_PURPOSES, SITE_PAGE_KEYS, INCIDENT_SEVERITIES } from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import * as G from "../services/growth";
import * as C from "../services/compliance";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const s = (n: number) => z.string().max(n);
const range = { from: isoDate.optional(), to: isoDate.optional() };

export const siteRouter = router({
  posts: protectedProcedure.input(z.object({ status: z.enum(POST_STATUSES).optional(), category: z.enum(POST_CATEGORIES).optional(), q: s(100).optional(), page: z.number().int().min(1).optional() }).default({})).query(({ ctx, input }) => G.listPosts(ctx, input)),
  post: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => G.getPost(ctx, input.id)),
  upsertPost: protectedProcedure
    .input(z.object({ id: uuid.optional(), title: s(150), slug: s(80).nullish(), excerpt: s(300).nullish(), body: s(100_000), coverImage: s(500).nullish(), category: z.enum(POST_CATEGORIES), seoTitle: s(70).nullish(), seoDescription: s(170).nullish() }))
    .mutation(({ ctx, input }) => G.upsertPost(ctx, input)),
  postAction: protectedProcedure.input(z.object({ id: uuid, action: z.enum(["publish", "schedule", "unpublish", "archive", "restore"]), publishAt: z.string().datetime({ offset: true }).nullish() })).mutation(({ ctx, input }) => G.postAction(ctx, input)),
  content: protectedProcedure.query(({ ctx }) => G.siteContent(ctx)),
  saveBlock: protectedProcedure.input(z.object({ page: z.enum(SITE_PAGE_KEYS as [string, ...string[]]), data: z.record(z.string(), s(10_000)), version: z.number().int().min(0) })).mutation(({ ctx, input }) => G.saveSiteBlock(ctx, input)),
  restoreBlock: protectedProcedure.input(z.object({ page: z.enum(SITE_PAGE_KEYS as [string, ...string[]]), version: z.number().int().min(1) })).mutation(({ ctx, input }) => G.restoreSiteBlock(ctx, input)),
  media: protectedProcedure.query(({ ctx }) => G.listSiteMedia(ctx)),
});

export const marketingRouter = router({
  overview: protectedProcedure.input(z.object({ ...range, centerId: uuid.optional() }).default({})).query(({ ctx, input }) => G.marketingOverview(ctx, input)),
  saveSettings: protectedProcedure
    .input(z.object({ metaPixelId: s(20), ga4MeasurementId: s(20), trackingEnabled: z.boolean(), leadRetentionMonths: z.number().int() }))
    .mutation(({ ctx, input }) => G.saveMarketingSettings(ctx, input)),
  campaigns: protectedProcedure.input(z.object({ ...range, activeOnly: z.boolean().optional() }).default({})).query(({ ctx, input }) => G.listCampaigns(ctx, input)),
  upsertCampaign: protectedProcedure
    .input(z.object({ id: uuid.optional(), name: s(120), utmCampaign: s(80), channel: z.enum(CHANNELS), centerId: uuid.nullish(), budget: z.number().int().min(0).max(100_000_000_000), startDate: isoDate, endDate: isoDate.nullish(), landingUrl: s(500).nullish(), notes: s(1000).nullish(), isActive: z.boolean().optional() }))
    .mutation(({ ctx, input }) => G.upsertCampaign(ctx, input)),
  recordSpend: protectedProcedure
    .input(z.object({ campaignId: uuid, date: isoDate, amount: z.number().int().min(0).max(10_000_000_000), clicks: z.number().int().min(0).nullish(), impressions: z.number().int().min(0).nullish(), note: s(300).nullish() }))
    .mutation(({ ctx, input }) => G.recordSpend(ctx, input)),
  funnel: protectedProcedure.input(z.object({ ...range, utmCampaign: s(80).optional(), channel: z.enum(CHANNELS).optional() }).default({})).query(({ ctx, input }) => G.marketingFunnel(ctx, input)),
});

export const complianceRouter = router({
  overview: protectedProcedure.query(({ ctx }) => C.complianceOverview(ctx)),
  requests: protectedProcedure.input(z.object({ status: z.enum(DSR_STATUSES).optional(), open: z.boolean().optional() }).default({})).query(({ ctx, input }) => C.listRequests(ctx, input)),
  request: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => C.getRequest(ctx, input.id)),
  findSubjects: protectedProcedure.input(z.object({ phone: s(20) })).query(({ ctx, input }) => C.findSubjects(ctx, input)),
  create: protectedProcedure
    .input(z.object({ type: z.enum(DSR_TYPES), requesterName: s(120), requesterPhone: s(20), channel: s(20), details: s(3000), subjectType: z.enum(SUBJECT_TYPES).nullish(), subjectId: uuid.nullish(), centerId: uuid.nullish() }))
    .mutation(({ ctx, input }) => C.createRequest(ctx, input)),
  action: protectedProcedure.input(z.object({ id: uuid, action: z.enum(["verify", "start", "complete", "reject"]), note: s(2000).nullish() })).mutation(({ ctx, input }) => C.requestAction(ctx, input)),
  link: protectedProcedure.input(z.object({ id: uuid, subjectType: z.enum(SUBJECT_TYPES), subjectId: uuid })).mutation(({ ctx, input }) => C.linkSubject(ctx, input)),
  export: protectedProcedure.input(z.object({ id: uuid })).mutation(({ ctx, input }) => C.exportSubjectData(ctx, input)),
  setConsent: protectedProcedure.input(z.object({ id: uuid, purpose: z.enum(CONSENT_PURPOSES), granted: z.boolean() })).mutation(({ ctx, input }) => C.setConsent(ctx, input)),
  erase: protectedProcedure.input(z.object({ id: uuid, confirm: s(30) })).mutation(({ ctx, input }) => C.eraseSubject(ctx, input)),
  retention: protectedProcedure.input(z.object({ dryRun: z.boolean() })).mutation(({ ctx, input }) => C.runRetention(ctx, input)),
  extend: protectedProcedure.input(z.object({ id: uuid, reason: s(500) })).mutation(({ ctx, input }) => C.extendRequest(ctx, input)),
  incidents: protectedProcedure.query(({ ctx }) => C.listIncidents(ctx)),
  reportIncident: protectedProcedure
    .input(z.object({ title: s(150), description: s(3000), severity: z.enum(INCIDENT_SEVERITIES), detectedAt: z.string().datetime({ offset: true }), affectedCount: z.number().int().min(0).max(10_000_000), dataTypes: s(300).nullish(), centerId: uuid.nullish() }))
    .mutation(({ ctx, input }) => C.reportIncident(ctx, input)),
  updateIncident: protectedProcedure
    .input(z.object({ id: uuid, action: z.enum(["contain", "notify_authority", "notify_subjects", "close"]), containment: s(2000).nullish(), noNotifyReason: s(1000).nullish() }))
    .mutation(({ ctx, input }) => C.updateIncident(ctx, input)),
  consentHistory: protectedProcedure.input(z.object({ subjectType: z.enum(SUBJECT_TYPES), subjectId: uuid })).query(({ ctx, input }) => C.consentHistory(ctx, input)),
});
