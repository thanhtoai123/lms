import { z } from "zod";
import { EMAIL_EVENT_KEYS, EMAIL_STATUSES, OTP_STATUSES, OTP_PURPOSES, WEBHOOK_SOURCES, WEBHOOK_STATUSES, type EmailEvent } from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import * as A from "../services/admin";
import * as Z from "../services/zaloToken";

const uuid = z.string().uuid();
const eventKey = z.enum(EMAIL_EVENT_KEYS as [EmailEvent, ...EmailEvent[]]);
const s = (n: number) => z.string().max(n);

export const adminRouter = router({
  emailTemplates: protectedProcedure.query(({ ctx }) => A.listEmailTemplates(ctx)),
  saveEmailTemplate: protectedProcedure.input(z.object({ eventKey, subject: s(200), body: s(5000), isActive: z.boolean() })).mutation(({ ctx, input }) => A.saveEmailTemplate(ctx, input)),
  resetEmailTemplate: protectedProcedure.input(z.object({ eventKey })).mutation(({ ctx, input }) => A.resetEmailTemplate(ctx, input)),
  previewEmail: protectedProcedure.input(z.object({ eventKey, subject: s(200), body: s(5000) })).mutation(({ ctx, input }) => A.previewEmail(ctx, input)),
  testEmail: protectedProcedure.input(z.object({ to: s(200), eventKey })).mutation(({ ctx, input }) => A.sendTestEmail(ctx, input)),
  emailLogs: protectedProcedure
    .input(z.object({ status: z.enum(EMAIL_STATUSES).optional(), event: s(40).optional(), q: s(100).optional(), page: z.number().int().min(1).optional() }).default({}))
    .query(({ ctx, input }) => A.listEmailLogs(ctx, input)),
  retryEmail: protectedProcedure.input(z.object({ id: uuid })).mutation(({ ctx, input }) => A.retryEmail(ctx, input)),

  otpLogs: protectedProcedure
    .input(z.object({ status: z.enum(OTP_STATUSES).optional(), purpose: z.enum(OTP_PURPOSES).optional(), q: s(20).optional(), page: z.number().int().min(1).optional() }).default({}))
    .query(({ ctx, input }) => A.listOtp(ctx, input)),

  groups: protectedProcedure.query(({ ctx }) => A.listGroups(ctx)),
  group: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => A.getGroup(ctx, input.id)),
  upsertGroup: protectedProcedure.input(z.object({ id: uuid.optional(), name: s(80), description: s(300).nullish(), centerId: uuid.nullish() })).mutation(({ ctx, input }) => A.upsertGroup(ctx, input)),
  deleteGroup: protectedProcedure.input(z.object({ id: uuid })).mutation(({ ctx, input }) => A.deleteGroup(ctx, input)),
  setGroupMembers: protectedProcedure.input(z.object({ groupId: uuid, add: z.array(uuid).max(200).optional(), remove: z.array(uuid).max(200).optional() })).mutation(({ ctx, input }) => A.setGroupMembers(ctx, input)),
  setGroupPermissions: protectedProcedure
    .input(z.object({ groupId: uuid, permissions: z.array(s(60)).max(120), reason: z.string().trim().min(5, "Lý do tối thiểu 5 ký tự").max(300) }))
    .mutation(({ ctx, input }) => A.setGroupPermissions(ctx, input)),
  announce: protectedProcedure.input(z.object({ groupId: uuid, title: s(150), body: s(1000), link: s(300).nullish(), priority: z.number().int().min(1).max(3) })).mutation(({ ctx, input }) => A.announceToGroup(ctx, input)),

  orgTree: protectedProcedure.query(({ ctx }) => A.orgTree(ctx)),
  upsertRegion: protectedProcedure.input(z.object({ id: uuid.optional(), code: s(20), name: s(100), managerUserId: uuid.nullish(), sortOrder: z.number().int().min(0).max(999).optional() })).mutation(({ ctx, input }) => A.upsertRegion(ctx, input)),
  deleteRegion: protectedProcedure.input(z.object({ id: uuid })).mutation(({ ctx, input }) => A.deleteRegion(ctx, input)),
  assignCenterRegion: protectedProcedure.input(z.object({ centerId: uuid, regionId: uuid.nullable() })).mutation(({ ctx, input }) => A.assignCenterRegion(ctx, input)),

  webhooks: protectedProcedure
    .input(z.object({ source: z.enum(WEBHOOK_SOURCES).optional(), status: z.enum(WEBHOOK_STATUSES).optional(), page: z.number().int().min(1).optional() }).default({}))
    .query(({ ctx, input }) => A.listWebhookEvents(ctx, input)),
  replayWebhook: protectedProcedure.input(z.object({ id: uuid })).mutation(({ ctx, input }) => A.replayWebhook(ctx, input)),

  integrations: protectedProcedure.query(({ ctx }) => A.integrations(ctx)),

  /* Zalo OA — vòng đời token (access token chỉ sống 25 giờ, refresh token dùng một lần) */
  zaloToken: protectedProcedure.query(({ ctx }) => Z.trangThaiTokenZalo(ctx.db as never)),
  zaloTokenRefresh: protectedProcedure.mutation(({ ctx }) => Z.lamMoiTokenTheoYeuCau(ctx)),
  zaloCredentials: protectedProcedure
    .input(z.object({ appId: z.string().trim().max(30), oaId: z.string().trim().max(30).nullish(), secretKey: z.string().trim().max(200).nullish(), refreshToken: z.string().trim().max(500).nullish() }))
    .mutation(({ ctx, input }) => Z.luuKhaiBaoZalo(ctx, input)),
  settings: protectedProcedure.query(({ ctx }) => A.settingsForAdmin(ctx)),
  saveSettings: protectedProcedure
    .input(z.object({
      brandName: s(100), legalName: s(200), hotline: s(20), supportEmail: s(200), website: s(200), headOfficeAddress: s(300),
      taxCode: s(20), receiptFooter: s(300), zaloOaId: s(50), timezone: s(50), parentAppUrl: s(200),
    }))
    .mutation(({ ctx, input }) => A.saveSettings(ctx, input)),
  publicSettings: protectedProcedure.query(({ ctx }) => A.publicSettings(ctx)),
});
