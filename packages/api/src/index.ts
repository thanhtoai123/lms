import { router, createCallerFactory } from "./trpc";
import { authRouter } from "./routers/auth";
import { sessionsRouter, classesRouter } from "./routers/academics";
import { teacherRouter } from "./routers/teacher";
import { leadsRouter } from "./routers/admissions";
import { engagementRouter } from "./routers/engagement";
import { dashboardRouter } from "./routers/dashboard";
import { inboxRouter } from "./routers/inbox";
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
import { migrationRouter, cutoverRouter, deliveryRouter, pilotRouter, readinessRouter, opsConfigRouter } from "./routers/golive";
import { tenantsRouter } from "./routers/tenants";
import { trialReportsRouter } from "./routers/trialReports";
import { portfolioRouter, sessionEvaluationsRouter } from "./routers/portfolio";
import { certificatesRouter } from "./routers/certificates";

export const appRouter = router({
  auth: authRouter,
  academics: router({
    sessions: sessionsRouter,
    classes: classesRouter,
    /** Phiếu nhận xét buổi học (hồ sơ học tập) */
    evaluations: sessionEvaluationsRouter,
  }),
  teacher: teacherRouter,
  admissions: router({ leads: leadsRouter, trials: trialsRouter, trialReports: trialReportsRouter }),
  engagement: engagementRouter,
  dashboard: dashboardRouter,
  inbox: inboxRouter,
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
  migration: migrationRouter,
  cutover: cutoverRouter,
  delivery: deliveryRouter,
  pilot: pilotRouter,
  readiness: readinessRouter,
  opsConfig: opsConfigRouter,
  card: cardRouter,
  tenants: tenantsRouter,
  /** Hồ sơ học tập (portfolio) của học viên */
  portfolio: portfolioRouter,
  /** Giấy chứng nhận, lộ trình học, mẫu chứng nhận */
  certificates: certificatesRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
export { createContext, type Context } from "./context";
export { previewProvision, provision } from "./services/provisionTenant";
export { createLead } from "./services/leads";
export { processOutbox, scanLeadSla } from "./services/engagement";
export { buildActionRequiredAlerts, deliverNotifications, notifyTyped } from "./services/notify";
export { leadInput } from "./routers/admissions";
export { verifyActivationCode } from "./services/parentAccounts";
export { putObject, getObject, signedMediaUrl, verifyMediaSignature, signedFileUrl, verifyScormSignature } from "./storage";
export { registerUploadedMedia } from "./services/media";
export { ingestBankTx } from "./services/bank";
export { publicSurvey, submitPublicSurvey, runSurveyTriggers } from "./services/care";
export { publicTrialReport, publicTrialReportRespond, CONSULT_RECEIVED_MESSAGE, type PublicTrialReportResult } from "./services/trialReports";
export { publicPortfolio, portalPortfolio, portfolioForRender, type PublicPortfolioResult } from "./services/portfolio";
export { verifyPortfolioRenderSignature } from "./storage";
export { publicCertificate, portalCertificate, uploadTemplateBackground, type PublicCertificateResult, type PublicCertificateView, type PrintableCertificate } from "./services/certificates";
export { logWebhook, mapPublicLeadBody, requestOtp, verifyOtp, processEmailQueue } from "./services/admin";
export { addDocumentVersion } from "./services/documents";
export { uploadPlan, sweepStuckPlanVersions, planFileStream } from "./services/lessonPlans";
export { publicHomework, submitPublicHomework, staffSubmit, remindDueHomework } from "./services/assignments";
export { publicPosts, publicPost, publicSite, publicTrackingConfig, recordTrack, uploadSiteMedia, publishDuePosts, SITE_MEDIA_MAX } from "./services/growth";
export { retentionSweep } from "./services/compliance";
export { publicJobs, publicJob, applyToJob, candidateRetention, CV_MAX_BYTES } from "./services/recruit";
export { portalThread, portalPost, ingestExternal, parseMessengerPayload, parseZaloPayload, metaSignatureOk, zaloSignatureOk } from "./services/messaging";
export { syncAffiliateRewards } from "./services/affiliates";
export { healthCheck, recordHeartbeat } from "./services/ops";
export { syncInvoiceDrafts, publicInvoiceLookup } from "./services/einvoice";
export * as ParentPortal from "./services/parentPortal";
export {
  familyChildren, parentUnread, hubHome, hubSchedule, hubRequests, parentSubmitRequest, parentCancelRequest, parentReact, hubCoins, hubJourney,
  type ScheduleEntry, type HubResult, type ParentHubRequestInput,
} from "./services/parentHub";
export { parentConversations, parentThread, parentPost, parentStart } from "./services/messaging";
export { dispatchParentMessages } from "./services/delivery";
export { parallelReminders } from "./services/cutover";
export { pushStatus, subscribePush, unsubscribePush, dispatchPush } from "./services/pilot";
export { generateVapidKeys } from "./webpush";
export { requestPasswordReset, supabaseAdmin, supabaseConfigured } from "./services/staffAuth";
export { loginPrecheck, recordLogin, staffBlocked, setMfaEnabled, staffIdleMinutes, pruneLoginEvents } from "./services/loginSecurity";
export { remindPauseEnding } from "./services/studentLifecycle";
export { checkRateLimit, resetRateLimit, pruneRateLimits, assertRateLimit, rateKey, tooManyMessage, type RateDecision } from "./lib/rateLimit";
export { logger, apiLogger } from "./lib/logger";
