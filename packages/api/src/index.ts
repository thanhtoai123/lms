import { router, createCallerFactory } from "./trpc";
import { authRouter } from "./routers/auth";
import { sessionsRouter, classesRouter } from "./routers/academics";
import { teacherRouter } from "./routers/teacher";
import { leadsRouter } from "./routers/admissions";
import { engagementRouter } from "./routers/engagement";
import { dashboardRouter } from "./routers/dashboard";
import { studentsRouter, orgRouter } from "./routers/students";
import { scheduleRouter } from "./routers/schedule";
import { learningRouter } from "./routers/learning";
import { systemRouter, reportsRouter, trialsRouter } from "./routers/system";
import { catalogRouter } from "./routers/catalog";
import { financeRouter } from "./routers/finance";
import { hrRouter } from "./routers/hr";
import { careRouter } from "./routers/care";
import { adminRouter } from "./routers/admin";
import { inventoryRouter, coinRouter } from "./routers/inventory";
import { contentRouter } from "./routers/content";
import { siteRouter, marketingRouter, complianceRouter } from "./routers/growth";
import { recruitRouter, messagingRouter, affiliateRouter } from "./routers/outreach";
import { invoiceRouter, cardRouter } from "./routers/billing";

export const appRouter = router({
  auth: authRouter,
  academics: router({
    sessions: sessionsRouter,
    classes: classesRouter,
  }),
  teacher: teacherRouter,
  admissions: router({ leads: leadsRouter, trials: trialsRouter }),
  engagement: engagementRouter,
  dashboard: dashboardRouter,
  students: studentsRouter,
  org: orgRouter,
  schedule: scheduleRouter,
  learning: learningRouter,
  system: systemRouter,
  reports: reportsRouter,
  catalog: catalogRouter,
  finance: financeRouter,
  hr: hrRouter,
  care: careRouter,
  admin: adminRouter,
  inventory: inventoryRouter,
  coin: coinRouter,
  content: contentRouter,
  site: siteRouter,
  marketing: marketingRouter,
  compliance: complianceRouter,
  recruit: recruitRouter,
  messaging: messagingRouter,
  affiliate: affiliateRouter,
  invoice: invoiceRouter,
  card: cardRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
export { createContext, type Context } from "./context";
export { createLead } from "./services/leads";
export { processOutbox, scanLeadSla } from "./services/engagement";
export { leadInput } from "./routers/admissions";
export { verifyActivationCode } from "./services/parentAccounts";
export { putObject, getObject, signedMediaUrl, verifyMediaSignature, signedFileUrl, verifyScormSignature } from "./storage";
export { registerUploadedMedia } from "./services/media";
export { ingestBankTx } from "./services/bank";
export { publicSurvey, submitPublicSurvey, runSurveyTriggers } from "./services/care";
export { logWebhook, mapPublicLeadBody, requestOtp, verifyOtp, processEmailQueue } from "./services/admin";
export { addDocumentVersion } from "./services/documents";
export { publicHomework, submitPublicHomework, staffSubmit, remindDueHomework } from "./services/assignments";
export { publicPosts, publicPost, publicSite, publicTrackingConfig, recordTrack, uploadSiteMedia, publishDuePosts, SITE_MEDIA_MAX } from "./services/growth";
export { retentionSweep } from "./services/compliance";
export { publicJobs, publicJob, applyToJob, candidateRetention, CV_MAX_BYTES } from "./services/recruit";
export { portalThread, portalPost, ingestExternal, parseMessengerPayload, parseZaloPayload, metaSignatureOk, zaloSignatureOk } from "./services/messaging";
export { syncAffiliateRewards } from "./services/affiliates";
export { healthCheck, recordHeartbeat } from "./services/ops";
export { syncInvoiceDrafts, publicInvoiceLookup } from "./services/einvoice";
export * as ParentPortal from "./services/parentPortal";
export { parentConversations, parentThread, parentPost, parentStart } from "./services/messaging";
