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
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
export { createContext, type Context } from "./context";
export { createLead } from "./services/leads";
export { processOutbox, scanLeadSla } from "./services/engagement";
export { leadInput } from "./routers/admissions";
export { verifyActivationCode } from "./services/parentAccounts";
export { putObject, getObject, signedMediaUrl, verifyMediaSignature } from "./storage";
export { registerUploadedMedia } from "./services/media";
export { ingestBankTx } from "./services/bank";
export { publicSurvey, submitPublicSurvey, runSurveyTriggers } from "./services/care";
export { logWebhook, mapPublicLeadBody, requestOtp, verifyOtp, processEmailQueue } from "./services/admin";
