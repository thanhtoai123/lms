import { z } from "zod";
import { CUTOVER_STAGES, DELIVERY_EVENTS, DELIVERY_MODES, PARALLEL_METRICS, RECON_METRICS, PILOT_FB_CATEGORIES, PILOT_FB_SEVERITIES, PILOT_FB_STATUSES } from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import * as M from "../services/migration";
import * as C from "../services/cutover";
import * as D from "../services/delivery";
import * as P from "../services/pilot";
import * as R from "../services/readiness";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const csv = z.string().min(1, "File trống").max(5_000_000);
const num = z.number().finite().min(0).max(1e13);

export const migrationRouter = router({
  batches: protectedProcedure.query(({ ctx }) => M.migrationBatches(ctx)),
  previewStudents: protectedProcedure.input(z.object({ csv })).mutation(({ ctx, input }) => M.previewStudents(ctx, input)),
  importStudents: protectedProcedure.input(z.object({ csv, note: z.string().max(300), fileName: z.string().max(200).nullish() })).mutation(({ ctx, input }) => M.importStudents(ctx, input)),
  previewEnrollments: protectedProcedure.input(z.object({ csv })).mutation(({ ctx, input }) => M.previewEnrollments(ctx, input)),
  importEnrollments: protectedProcedure.input(z.object({ csv, note: z.string().max(300), fileName: z.string().max(200).nullish() })).mutation(({ ctx, input }) => M.importEnrollments(ctx, input)),
  recon: protectedProcedure.input(z.object({ centerId: uuid.nullish() }).default({})).query(({ ctx, input }) => M.reconOverview(ctx, input)),
  saveRecon: protectedProcedure
    .input(z.object({ centerId: uuid.nullable(), legacy: z.object(Object.fromEntries(RECON_METRICS.map((m) => [m, num.nullish()])) as Record<(typeof RECON_METRICS)[number], z.ZodOptional<z.ZodNullable<typeof num>>>), note: z.string().max(300).nullish() }))
    .mutation(({ ctx, input }) => M.saveRecon(ctx, input)),
  compareStudents: protectedProcedure.input(z.object({ csv, centerId: uuid.nullish() })).mutation(({ ctx, input }) => M.compareStudents(ctx, input)),
});

export const cutoverRouter = router({
  overview: protectedProcedure.query(({ ctx }) => C.cutoverOverview(ctx)),
  logDay: protectedProcedure
    .input(z.object({ centerId: uuid, date: isoDate, legacy: z.object(Object.fromEntries(PARALLEL_METRICS.map((m) => [m, num])) as Record<(typeof PARALLEL_METRICS)[number], typeof num>), note: z.string().max(500).nullish() }))
    .mutation(({ ctx, input }) => C.logParallelDay(ctx, input)),
  explain: protectedProcedure.input(z.object({ id: uuid, explanation: z.string().max(1000) })).mutation(({ ctx, input }) => C.explainParallelDay(ctx, input)),
  check: protectedProcedure.input(z.object({ centerId: uuid, key: z.string().max(40), done: z.boolean() })).mutation(({ ctx, input }) => C.setChecklist(ctx, input)),
  setStage: protectedProcedure.input(z.object({ centerId: uuid, stage: z.enum(CUTOVER_STAGES), reason: z.string().max(500) })).mutation(({ ctx, input }) => C.setStage(ctx, input)),
});

const tpl = z.object({ templateId: z.string().max(20), params: z.record(z.string().max(30), z.string().max(30)) });
export const deliveryRouter = router({
  config: protectedProcedure.query(({ ctx }) => D.getDeliveryConfig(ctx)),
  save: protectedProcedure
    .input(z.object({
      zns: z.object({ mode: z.enum(DELIVERY_MODES), templates: z.record(z.enum(DELIVERY_EVENTS), tpl.optional()) }),
      sms: z.object({ mode: z.enum(DELIVERY_MODES), brandname: z.string().max(20), fallback: z.boolean(), templates: z.record(z.enum(DELIVERY_EVENTS), z.string().max(600).optional()) }),
      quietStart: z.string().max(5), quietEnd: z.string().max(5), maxPerParentPerDay: z.number().int(),
    }))
    .mutation(({ ctx, input }) => D.saveDeliveryConfig(ctx, input)),
  test: protectedProcedure.input(z.object({ channel: z.enum(["zns", "sms"]), event: z.enum(DELIVERY_EVENTS), phone: z.string().max(20) })).mutation(({ ctx, input }) => D.testDelivery(ctx, input)),
});

export const pilotRouter = router({
  feedback: protectedProcedure.input(z.object({ centerId: uuid.nullish(), status: z.enum(PILOT_FB_STATUSES).nullish() }).default({})).query(({ ctx, input }) => P.listFeedback(ctx, input)),
  createFeedback: protectedProcedure
    .input(z.object({ centerId: uuid, category: z.enum(PILOT_FB_CATEGORIES), severity: z.enum(PILOT_FB_SEVERITIES), title: z.string().max(200), detail: z.string().max(3000).nullish(), pageUrl: z.string().max(300).nullish() }))
    .mutation(({ ctx, input }) => P.createFeedback(ctx, input)),
  updateFeedback: protectedProcedure.input(z.object({ id: uuid, status: z.enum(PILOT_FB_STATUSES), resolution: z.string().max(2000).nullish() })).mutation(({ ctx, input }) => P.updateFeedback(ctx, input)),
  adoption: protectedProcedure.input(z.object({ weeks: z.number().int().min(1).max(26).optional() }).default({})).query(({ ctx, input }) => P.adoptionReport(ctx, input)),
});

export const readinessRouter = router({
  myTraining: protectedProcedure.query(({ ctx }) => R.myTraining(ctx)),
  complete: protectedProcedure.input(z.object({ key: z.string().max(40), answers: z.array(z.number().int().min(0).max(10)).max(20) })).mutation(({ ctx, input }) => R.completeModule(ctx, input)),
  center: protectedProcedure.input(z.object({ centerId: uuid })).query(({ ctx, input }) => R.centerReadiness(ctx, input)),
});
