import { router, createCallerFactory } from "./trpc.js";
import { authRouter } from "./routers/auth.js";
import { sessionsRouter, classesRouter } from "./routers/academics.js";
import { teacherRouter } from "./routers/teacher.js";

export const appRouter = router({
  auth: authRouter,
  academics: router({
    sessions: sessionsRouter,
    classes: classesRouter,
  }),
  teacher: teacherRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
export { createContext, type Context } from "./context.js";
