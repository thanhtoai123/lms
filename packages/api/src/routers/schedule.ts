import { z } from "zod";
import { ATTENDANCE_STATUSES, MAKEUP_STATUSES } from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import * as Sch from "../services/schedule";
import * as Mk from "../services/makeup";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const scheduleRouter = router({
  week: protectedProcedure
    .input(z.object({ date: isoDate.optional(), centerId: uuid.optional(), teacherId: uuid.optional(), roomId: uuid.optional() }).default({}))
    .query(({ ctx, input }) => Sch.weekCalendar(ctx, input)),
  classOptions: protectedProcedure.query(({ ctx }) => Sch.classOptions(ctx)),
  attendanceGrid: protectedProcedure.input(z.object({ classId: uuid })).query(({ ctx, input }) => Sch.attendanceGrid(ctx, input.classId)),
  correctAttendance: protectedProcedure
    .input(z.object({ sessionId: uuid, enrollmentId: uuid, status: z.enum(ATTENDANCE_STATUSES), reason: z.string().max(300).optional() }))
    .mutation(({ ctx, input }) => Sch.correctAttendance(ctx, input)),
  risks: protectedProcedure.input(z.object({ centerId: uuid.optional() }).default({})).query(({ ctx, input }) => Sch.riskOverview(ctx, input)),
  rescanRisks: protectedProcedure.input(z.object({ centerId: uuid.optional() }).default({})).mutation(({ ctx, input }) => Sch.rescanRisks(ctx, input)),
  // Học bù
  pendingAbsences: protectedProcedure.input(z.object({ centerId: uuid.optional() }).default({})).query(({ ctx, input }) => Mk.pendingAbsences(ctx, input)),
  makeups: protectedProcedure.input(z.object({ status: z.enum(MAKEUP_STATUSES).optional(), centerId: uuid.optional() }).default({})).query(({ ctx, input }) => Mk.listMakeup(ctx, input)),
  requestMakeup: protectedProcedure.input(z.object({ enrollmentId: uuid, missedSessionId: uuid, note: z.string().max(300).nullish() })).mutation(({ ctx, input }) => Mk.createMakeupRequest(ctx, input)),
  makeupCandidates: protectedProcedure.input(z.object({ requestId: uuid })).query(({ ctx, input }) => Mk.candidatesFor(ctx, input.requestId)),
  decideMakeup: protectedProcedure
    .input(z.object({ requestId: uuid, action: z.enum(["approve", "reject", "reschedule"]), targetSessionId: uuid.optional(), note: z.string().max(300).optional() }))
    .mutation(({ ctx, input }) => Mk.decideMakeup(ctx, input)),
  completeMakeup: protectedProcedure.input(z.object({ requestId: uuid })).mutation(({ ctx, input }) => Mk.completeMakeup(ctx, input)),
});
