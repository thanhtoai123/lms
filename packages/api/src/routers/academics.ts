import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { ATTENDANCE_STATUSES, CLASS_STATUSES, SESSION_KINDS } from "@satarobo/core";
import * as CO from "../services/classOps";
import * as S from "../services/sessions";
import * as SC from "../services/sessionChanges";
import * as C from "../services/classes";
import * as CG from "../services/classGroups";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "Giờ dạng HH:mm");
const uuid = z.string().uuid();
const reason = z.string().trim().min(5, "Lý do tối thiểu 5 ký tự").max(500);
const slot = z.object({ weekday: z.number().int().min(1).max(7), startTime: hhmm, endTime: hhmm, roomId: uuid.nullish(), teacherId: uuid.nullish() });
const fullSlot = z.object({ weekday: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)]), startTime: hhmm, endTime: hhmm, roomId: uuid.nullable().default(null), teacherId: uuid.nullable().default(null) });
const phase = z.object({ from: isoDate, to: isoDate.nullable(), note: z.string().max(200).nullish(), slots: z.array(slot).min(1, "Mỗi giai đoạn cần ít nhất một ca học").max(14) });

export const sessionsRouter = router({
  list: protectedProcedure
    .input(z.object({ from: isoDate, to: isoDate, teacherId: uuid.optional(), centerId: uuid.optional(), classId: uuid.optional(), onlyOpen: z.boolean().optional() }))
    .query(({ ctx, input }) => S.listSessions(ctx, input)),

  overdueQueue: protectedProcedure
    .input(z.object({ centerId: uuid.optional(), limit: z.number().int().min(1).max(200).optional() }).default({}))
    .query(({ ctx, input }) => S.overdueQueue(ctx, input)),

  get: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => S.getSessionDetail(ctx, input.id)),

  recordAttendance: protectedProcedure
    .input(
      z.object({
        sessionId: uuid,
        records: z
          .array(z.object({
            enrollmentId: uuid, status: z.enum(ATTENDANCE_STATUSES), studentRemark: z.string().max(500).nullish(), makeupForSessionId: uuid.nullish(),
            rating: z.number().int().min(1).max(5).nullish(),
            /** Vắng / Phép: có cần xếp học bù không (null = chưa quyết) */
            needsMakeup: z.boolean().nullish(),
            /** Lý do phụ huynh xin vắng */
            absenceReason: z.string().max(500).nullish(),
          }))
          .min(1),
      }),
    )
    .mutation(({ ctx, input }) => S.recordAttendance(ctx, input)),

  saveNote: protectedProcedure
    .input(z.object({ sessionId: uuid, note: z.string().min(10, "Nhận xét tối thiểu 10 ký tự").max(2000) }))
    .mutation(({ ctx, input }) => S.saveSessionNote(ctx, input)),

  saveChecklist: protectedProcedure
    .input(z.object({ sessionId: uuid, checklist: z.object({ pre: z.record(z.string(), z.boolean()).optional(), post: z.record(z.string(), z.boolean()).optional() }), privateNote: z.string().max(2000).nullish() }))
    .mutation(({ ctx, input }) => S.saveSessionChecklist(ctx, input)),

  /** Huỷ / điều chỉnh buổi không đi qua đây (dùng sessions.cancel / sessions.adjust) */
  transition: protectedProcedure
    .input(z.object({ sessionId: uuid, event: z.enum(["start", "submit_attendance", "submit_notes", "complete", "reopen"]), reason: z.string().max(500).optional() }))
    .mutation(({ ctx, input }) => S.transitionSession(ctx, input)),

  /** Bài học chọn được khi xác nhận bài đã dạy */
  lessonOptions: protectedProcedure.input(z.object({ sessionId: uuid })).query(({ ctx, input }) => S.lessonOptions(ctx, input.sessionId)),
  confirmLesson: protectedProcedure
    .input(z.object({ sessionId: uuid, lessonId: uuid.nullish(), topic: z.string().trim().max(200).nullish() }))
    .mutation(({ ctx, input }) => S.confirmLesson(ctx, input)),

  /** Điều chỉnh một buổi: ngày / giờ / GV / phòng (bỏ trống = giữ nguyên) */
  adjust: protectedProcedure
    .input(z.object({ sessionId: uuid, date: isoDate.nullish(), startTime: hhmm.nullish(), endTime: hhmm.nullish(), teacherId: uuid.nullish(), roomId: uuid.nullish(), reason, notifyParents: z.boolean().optional() }))
    .mutation(({ ctx, input }) => SC.adjustSession(ctx, input)),
  previewCancel: protectedProcedure
    .input(z.object({ sessionId: uuid, mode: z.enum(["shift", "none"]) }))
    .query(({ ctx, input }) => SC.previewCancelSession(ctx, input)),
  /** Huỷ buổi: shift = dời các buổi sau một nhịp + sinh buổi cuối (giữ đủ tổng buổi); none = chỉ huỷ */
  cancel: protectedProcedure
    .input(z.object({ sessionId: uuid, reason, mode: z.enum(["shift", "none"]), notifyParents: z.boolean().optional() }))
    .mutation(({ ctx, input }) => SC.cancelSession(ctx, input)),
});

export const classesRouter = router({
  list: protectedProcedure
    .input(z.object({ centerId: uuid.optional(), status: z.enum(CLASS_STATUSES).optional(), q: z.string().max(100).optional(), teacherId: uuid.optional(), courseId: uuid.optional(), classGroupId: uuid.optional() }).default({}))
    .query(({ ctx, input }) => C.listClasses(ctx, input)),

  /** Nhóm lớp (nhãn tổ chức gom nhiều lớp) */
  groups: protectedProcedure
    .input(z.object({ centerId: uuid.optional(), includeInactive: z.boolean().optional() }).default({}))
    .query(({ ctx, input }) => CG.listClassGroups(ctx, input)),
  upsertGroup: protectedProcedure
    .input(z.object({
      id: uuid.optional(), code: z.string().trim().min(2, "Mã nhóm lớp tối thiểu 2 ký tự").max(30),
      name: z.string().trim().min(3, "Tên nhóm lớp tối thiểu 3 ký tự").max(120),
      centerId: uuid.nullish(), note: z.string().max(500).nullish(), isActive: z.boolean().optional(),
    }))
    .mutation(({ ctx, input }) => CG.upsertClassGroup(ctx, input)),
  deleteGroup: protectedProcedure.input(z.object({ id: uuid, reason })).mutation(({ ctx, input }) => CG.deleteClassGroup(ctx, input)),

  get: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => C.getClass(ctx, input.id)),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(3, "Tên lớp tối thiểu 3 ký tự").max(120),
        code: z.string().trim().max(40).nullish(),
        courseId: uuid,
        curriculumId: uuid.nullish(),
        centerId: uuid,
        homeRoomId: uuid.nullish(),
        leadTeacherId: uuid.nullish(),
        assistantTeacherId: uuid.nullish(),
        capacity: z.number().int().min(1).max(30).optional(),
        minCapacity: z.number().int().min(1).max(30).optional(),
        description: z.string().max(1000).nullish(),
        startDate: isoDate,
        totalSessions: z.number().int().min(1).max(200).optional(),
        schedules: z.array(slot).optional(),
        phases: z.array(phase).max(12).optional(),
        mode: z.enum(["draft", "submit", "open"]).optional(),
      }).refine((x) => (x.phases?.length ?? 0) > 0 || (x.schedules?.length ?? 0) > 0, { message: "Cần ít nhất một ca học", path: ["schedules"] }),
    )
    .mutation(({ ctx, input }) => C.createClass(ctx, input)),
  codeTaken: protectedProcedure.input(z.object({ code: z.string().max(40) })).query(({ ctx, input }) => CO.classCodeTaken(ctx, input.code)),

  workspace: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => CO.classWorkspace(ctx, input.id)),
  transition: protectedProcedure
    .input(z.object({ classId: uuid, event: z.enum(["submit", "approve", "reject", "start", "finish", "cancel"]), reason: z.string().max(500).nullish() }))
    .mutation(({ ctx, input }) => CO.transitionClass(ctx, input)),
  /** Xem trước huỷ lớp dây chuyền */
  previewCancel: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => CO.previewCancelClass(ctx, input.id)),
  updateInfo: protectedProcedure
    .input(z.object({
      id: uuid, name: z.string().trim().min(3, "Tên lớp tối thiểu 3 ký tự").max(120), description: z.string().max(1000).nullish(),
      homeRoomId: uuid.nullish(), leadTeacherId: uuid.nullish(), assistantTeacherId: uuid.nullish(),
      capacity: z.number().int().min(1).max(30), minCapacity: z.number().int().min(1).max(30),
      startDate: isoDate.nullish(), plannedSessions: z.number().int().min(1).max(200).nullish(), classGroupId: uuid.nullish(), applyTeacherToFuture: z.boolean().optional(),
    }))
    .mutation(({ ctx, input }) => CO.updateClassInfo(ctx, input)),
  saveDraftSchedule: protectedProcedure.input(z.object({ classId: uuid, slots: z.array(fullSlot).min(1, "Cần ít nhất một ca học") })).mutation(({ ctx, input }) => CO.saveDraftSchedule(ctx, input)),
  /** Kế hoạch lịch nhiều giai đoạn (lớp nháp / chờ duyệt) */
  savePhases: protectedProcedure
    .input(z.object({ classId: uuid, phases: z.array(phase).min(1, "Cần ít nhất một giai đoạn").max(12), reason: z.string().max(300).nullish() }))
    .mutation(({ ctx, input }) => CO.saveDraftPhases(ctx, input)),
  previewSchedule: protectedProcedure.input(z.object({ classId: uuid, slots: z.array(fullSlot).min(1, "Cần ít nhất một ca học"), fromDate: isoDate })).query(({ ctx, input }) => CO.previewScheduleChange(ctx, input)),
  applySchedule: protectedProcedure
    .input(z.object({ classId: uuid, slots: z.array(fullSlot).min(1, "Cần ít nhất một ca học"), fromDate: isoDate, reason: z.string().max(300), notifyParents: z.boolean().optional() }))
    .mutation(({ ctx, input }) => CO.applyScheduleChange(ctx, input)),
  /** "Xếp lại buổi theo lịch" — neo lại cả dãy từ ngày khai giảng */
  reanchorPreview: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => CO.reanchorPreview(ctx, input.id)),
  reanchorApply: protectedProcedure
    .input(z.object({ classId: uuid, reason, notifyParents: z.boolean().optional() }))
    .mutation(({ ctx, input }) => CO.reanchorApply(ctx, input)),
  scheduleCheck: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => CO.scheduleCheck(ctx, input.id)),
  /** Kiểm tra lịch buổi học toàn hệ thống (chỉ lớp lệch) */
  scheduleDriftAll: protectedProcedure.input(z.object({ centerId: uuid.nullish() }).default({})).query(({ ctx, input }) => CO.scheduleDriftAll(ctx, input)),
  syncEndDate: protectedProcedure.input(z.object({ id: uuid })).mutation(({ ctx, input }) => CO.syncExpectedEnd(ctx, input.id)),
  addSession: protectedProcedure
    .input(z.object({
      classId: uuid, kind: z.enum(SESSION_KINDS).exclude(["regular"]), date: isoDate, startTime: hhmm, endTime: hhmm,
      roomId: uuid.nullish(), teacherId: uuid.nullish(), topic: z.string().max(200).nullish(), privateNote: z.string().max(1000).nullish(),
    }))
    .mutation(({ ctx, input }) => CO.addExtraSession(ctx, input)),
  pendingApprovals: protectedProcedure.query(({ ctx }) => CO.pendingApprovals(ctx)),

  enroll: protectedProcedure
    .input(z.object({ classId: uuid, studentId: uuid, packageSessions: z.number().int().min(1), startSequenceNo: z.number().int().min(1).optional(), status: z.enum(["active", "trial"]).optional() }))
    .mutation(({ ctx, input }) => C.enrollStudent(ctx, input)),

  referenceData: protectedProcedure.query(({ ctx }) => C.referenceData(ctx)),
});
