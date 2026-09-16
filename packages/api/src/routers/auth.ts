import { router, publicProcedure } from "../trpc.js";
import { visibleCenterIds } from "@satarobo/core";

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => {
    if (!ctx.actor || !ctx.user) return null;
    return { user: ctx.user, assignments: ctx.actor.assignments, personId: ctx.actor.personId ?? null, visibleCenterIds: visibleCenterIds(ctx.actor) };
  }),
});
