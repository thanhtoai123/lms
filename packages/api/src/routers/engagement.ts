import { z } from "zod";
import { router, protectedProcedure, requirePermission } from "../trpc";
import * as E from "../services/engagement";

export const engagementRouter = router({
  careTasks: protectedProcedure
    .input(z.object({ status: z.enum(["open", "in_progress", "done", "escalated", "dismissed"]).optional(), centerId: z.string().uuid().optional() }).default({}))
    .query(({ ctx, input }) => E.listCareTasks(ctx, input)),
  resolveCareTask: protectedProcedure
    .input(z.object({ id: z.string().uuid(), status: z.enum(["in_progress", "done", "escalated", "dismissed"]), outcome: z.string().max(1000).optional() }))
    .mutation(({ ctx, input }) => E.resolveCareTask(ctx, input)),
  myNotifications: protectedProcedure.input(z.object({ unreadOnly: z.boolean().optional(), limit: z.number().int().min(1).max(100).optional() }).default({})).query(({ ctx, input }) => E.myNotifications(ctx, input)),
  markRead: protectedProcedure.input(z.object({ ids: z.array(z.string().uuid()).optional(), all: z.boolean().optional() })).mutation(({ ctx, input }) => E.markRead(ctx, input)),
  parentFeed: protectedProcedure.input(z.object({ parentId: z.string().uuid(), limit: z.number().int().min(1).max(200).optional() })).query(({ ctx, input }) => E.parentFeed(ctx, input)),
  outboxStats: protectedProcedure.query(({ ctx }) => E.outboxStats(ctx)),
  /** Chạy worker thủ công (dev/ops) */
  runWorker: protectedProcedure.mutation(async ({ ctx }) => {
    requirePermission(ctx, "automation:run");
    const sla = await E.scanLeadSla(ctx.db);
    const r = await E.processOutbox(ctx.db);
    return { ...r, slaEvents: sla };
  }),
});
