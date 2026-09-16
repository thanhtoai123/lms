import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { ATTENDANCE_STATUSES, CLASS_STATUSES, SESSION_KINDS } from "@satarobo/core";
import * as CO from "../services/classOps";
import * as S from "../services/sessions";
import * as C from "../services/classes";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "Giờ dạng HH:mm");
const slot = z.object({ weekday: z.number().int().min(1).max(7), startTime: hhmm, endTime: hhmm, roomId: z.string().uuid().nullish(), teacherId: z.string().uuid().nullish() });
const fullSlot = z.object({ weekday: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)]), startTime: hhmm, endTime: hhmm, roomId: z.string().uuid().nullable().default(null), teacherId: z.string().uuid().nullable().default(null) });

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
          .array(z.object({ enrollmentId: z.string().uuid(), status: z.enum(ATTENDANCE_STATUSES), studentRemark: z.string().max(500).nullish(), makeupForSessionId: z.string().uuid().nullish(), rating: z.number().int().min(1).max(5).nullish() }))
          .min(1),
      }),
    )
    .mutation(({ ctx, input }) => S.recordAttendance(ctx, input)),

  saveNote: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), note: z.string().min(10, "Nhận xét tối thiểu 10 ký tự").max(2000) }))
    .mutation(({ ctx, input }) => S.saveSessionNote(ctx, input)),

  saveChecklist: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), checklist: z.object({ pre: z.record(z.string(), z.boolean()).optional(), post: z.record(z.string(), z.boolean()).optional() }), privateNote: z.string().max(2000).nullish() }))
    .mutation(({ ctx, input }) => S.saveSessionChecklist(ctx, input)),

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
        name: z.string().trim().min(3, "Tên lớp tối thiểu 3 ký tự").max(120),
        courseId: z.string().uuid(),
        curriculumId: z.string().uuid().nullish(),
        centerId: z.string().uuid(),
        homeRoomId: z.string().uuid().nullish(),
        leadTeacherId: z.string().uuid().nullish(),
        assistantTeacherId: z.string().uuid().nullish(),
        capacity: z.number().int().min(1).max(30).optional(),
        minCapacity: z.number().int().min(1).max(30).optional(),
        description: z.string().max(1000).nullish(),
        startDate: isoDate,
        totalSessions: z.number().int().min(1).max(200).optional(),
        schedules: z.array(slot).min(1, "Cần ít nhất một ca học"),
        mode: z.enum(["draft", "submit", "open"]).optional(),
      }),
    )
    .mutation(({ ctx, input }) => C.createClass(ctx, input)),

  workspace: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(({ ctx, input }) => CO.classWorkspace(ctx, input.id)),
  transition: protectedProcedure
    .input(z.object({ classId: z.string().uuid(), event: z.enum(["submit", "approve", "reject", "start", "finish", "cancel"]), reason: z.string().max(500).nullish() }))
    .mutation(({ ctx, input }) => CO.transitionClass(ctx, input)),
  updateInfo: protectedProcedure
    .input(z.object({
      id: z.string().uuid(), name: z.string().trim().min(3, "Tên lớp tối thiểu 3 ký tự").max(120), description: z.string().max(1000).nullish(),
      homeRoomId: z.string().uuid().nullish(), leadTeacherId: z.string().uuid().nullish(), assistantTeacherId: z.string().uuid().nullish(),
      capacity: z.number().int().min(1).max(30), minCapacity: z.number().int().min(1).max(30),
      startDate: isoDate.nullish(), plannedSessions: z.number().int().min(1).max(200).nullish(), applyTeacherToFuture: z.boolean().optional(),
    }))
    .mutation(({ ctx, input }) => CO.updateClassInfo(ctx, input)),
  saveDraftSchedule: protectedProcedure.input(z.object({ classId: z.string().uuid(), slots: z.array(fullSlot).min(1, "Cần ít nhất một ca học") })).mutation(({ ctx, input }) => CO.saveDraftSchedule(ctx, input)),
  previewSchedule: protectedProcedure.input(z.object({ classId: z.string().uuid(), slots: z.array(fullSlot).min(1, "Cần ít nhất một ca học"), fromDate: isoDate })).query(({ ctx, input }) => CO.previewScheduleChange(ctx, input)),
  applySchedule: protectedProcedure
    .input(z.object({ classId: z.string().uuid(), slots: z.array(fullSlot).min(1, "Cần ít nhất một ca học"), fromDate: isoDate, reason: z.string().max(300), notifyParents: z.boolean().optional() }))
    .mutation(({ ctx, input }) => CO.applyScheduleChange(ctx, input)),
  scheduleCheck: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(({ ctx, input }) => CO.scheduleCheck(ctx, input.id)),
  syncEndDate: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(({ ctx, input }) => CO.syncExpectedEnd(ctx, input.id)),
  addSession: protectedProcedure
    .input(z.object({
      classId: z.string().uuid(), kind: z.enum(SESSION_KINDS).exclude(["regular"]), date: isoDate, startTime: hhmm, endTime: hhmm,
      roomId: z.string().uuid().nullish(), teacherId: z.string().uuid().nullish(), topic: z.string().max(200).nullish(), privateNote: z.string().max(1000).nullish(),
    }))
    .mutation(({ ctx, input }) => CO.addExtraSession(ctx, input)),
  pendingApprovals: protectedProcedure.query(({ ctx }) => CO.pendingApprovals(ctx)),

  enroll: protectedProcedure
    .input(z.object({ classId: z.string().uuid(), studentId: z.string().uuid(), packageSessions: z.number().int().min(1), startSequenceNo: z.number().int().min(1).optional(), status: z.enum(["active", "trial"]).optional() }))
    .mutation(({ ctx, input }) => C.enrollStudent(ctx, input)),

  referenceData: protectedProcedure.query(({ ctx }) => C.referenceData(ctx)),
});
