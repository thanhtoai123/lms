import { router, protectedProcedure } from "../trpc";
import { adminOverview } from "../services/dashboard";

export const dashboardRouter = router({
  overview: protectedProcedure.query(({ ctx }) => adminOverview(ctx)),
});
