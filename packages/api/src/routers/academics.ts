import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";
import { ATTENDANCE_STATUSES, CLASS_STATUSES } from "@satarobo/core";
import * as S from "../services/sessions.js";
import * as C from "../services/classes.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "HH:mm");

export const sessionsRouter = router({
  list: protectedProcedure
    .input(z.object({ from: isoDate, to: isoDate, teacherId: z.string().uuid().optional(), centerId: z.string().uuid().optional(), classId: z.string().uuid().optional(), onlyOpen: z.boolean().optional() }))
    .query(({ ctx, input }) => S.listSessions(ctx, input)),

  overdueQueue: protectedProcedure
    .input(z.object({ centerId: z.string().uuid().optional(), limit: z.number().int().min(1).max(200).optional() }).default({}))
    .query(({ ctx, input }) => S.overdueQueue(ctx, input)),

  get: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(({ ctx, input }) => S.getSessionDetail(ctx, input.id)),

  recordAttendance: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        records: z
          .array(z.object({ enrollmentId: z.string().uuid(), status: z.enum(ATTENDANCE_STATUSES), studentRemark: z.string().max(500).nullish(), makeupForSessionId: z.string().uuid().nullish() }))
          .min(1),
      }),
    )
    .mutation(({ ctx, input }) => S.recordAttendance(ctx, input)),

  saveNote: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), note: z.string().min(10, "Nhận xét tối thiểu 10 ký tự").max(2000) }))
    .mutation(({ ctx, input }) => S.saveSessionNote(ctx, input)),

  transition: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), event: z.enum(["start", "submit_attendance", "submit_notes", "complete", "cancel", "reschedule", "reopen"]), reason: z.string().max(500).optional() }))
    .mutation(({ ctx, input }) => S.transitionSession(ctx, input)),
});

export const classesRouter = router({
  list: protectedProcedure
    .input(z.object({ centerId: z.string().uuid().optional(), status: z.enum(CLASS_STATUSES).optional(), q: z.string().max(100).optional(), teacherId: z.string().uuid().optional() }).default({}))
    .query(({ ctx, input }) => C.listClasses(ctx, input)),

  get: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(({ ctx, input }) => C.getClass(ctx, input.id)),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(3).max(120),
        courseId: z.string().uuid(),
        curriculumId: z.string().uuid().nullish(),
        centerId: z.string().uuid(),
        homeRoomId: z.string().uuid().nullish(),
        leadTeacherId: z.string().uuid().nullish(),
        capacity: z.number().int().min(1).max(30).optional(),
        startDate: isoDate,
        totalSessions: z.number().int().min(1).max(200).optional(),
        schedules: z.array(z.object({ weekday: z.number().int().min(1).max(7), startTime: hhmm, endTime: hhmm, roomId: z.string().uuid().nullish(), teacherId: z.string().uuid().nullish() })).min(1),
      }),
    )
    .mutation(({ ctx, input }) => C.createClass(ctx, input)),

  enroll: protectedProcedure
    .input(z.object({ classId: z.string().uuid(), studentId: z.string().uuid(), packageSessions: z.number().int().min(1), startSequenceNo: z.number().int().min(1).optional(), status: z.enum(["active", "trial"]).optional() }))
    .mutation(({ ctx, input }) => C.enrollStudent(ctx, input)),

  referenceData: protectedProcedure.query(({ ctx }) => C.referenceData(ctx)),
});
