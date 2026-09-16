import { router, createCallerFactory } from "./trpc";
import { authRouter } from "./routers/auth";
import { sessionsRouter, classesRouter } from "./routers/academics";
import { teacherRouter } from "./routers/teacher";
import { leadsRouter } from "./routers/admissions";
import { engagementRouter } from "./routers/engagement";
import { dashboardRouter } from "./routers/dashboard";
import { studentsRouter, orgRouter } from "./routers/students";
import { scheduleRouter } from "./routers/schedule";

export const appRouter = router({
  auth: authRouter,
  academics: router({
    sessions: sessionsRouter,
    classes: classesRouter,
  }),
  teacher: teacherRouter,
  admissions: router({ leads: leadsRouter }),
  engagement: engagementRouter,
  dashboard: dashboardRouter,
  students: studentsRouter,
  org: orgRouter,
  schedule: scheduleRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
export { createContext, type Context } from "./context";
export { createLead } from "./services/leads";
export { processOutbox, scanLeadSla } from "./services/engagement";
export { leadInput } from "./routers/admissions";
export { verifyActivationCode } from "./services/parentAccounts";
