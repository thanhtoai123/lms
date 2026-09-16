import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import * as RC from "../services/reportCards";
import * as MD from "../services/media";

const uuid = z.string().uuid();

export const learningRouter = router({
  // Tiêu chí năng lực
  criteria: protectedProcedure.query(({ ctx }) => RC.criteriaByCourse(ctx)),
  upsertCriterion: protectedProcedure
    .input(z.object({ id: uuid.optional(), courseId: uuid, name: z.string().min(2, "Tên tiêu chí tối thiểu 2 ký tự").max(120), description: z.string().max(300).nullish(), isActive: z.boolean().optional() }))
    .mutation(({ ctx, input }) => RC.upsertCriterion(ctx, input)),
  moveCriterion: protectedProcedure.input(z.object({ id: uuid, direction: z.enum(["up", "down"]) })).mutation(({ ctx, input }) => RC.moveCriterion(ctx, input)),
  setNextCourse: protectedProcedure.input(z.object({ courseId: uuid, nextCourseId: uuid.nullable() })).mutation(({ ctx, input }) => RC.setNextCourse(ctx, input)),

  // Học bạ
  classReportCards: protectedProcedure.input(z.object({ classId: uuid })).query(({ ctx, input }) => RC.classReportCards(ctx, input.classId)),
  dueReportCards: protectedProcedure.query(({ ctx }) => RC.dueReportCards(ctx)),
  reportCard: protectedProcedure.input(z.object({ enrollmentId: uuid, milestoneSeq: z.number().int().min(1).max(200) })).query(({ ctx, input }) => RC.getReportCard(ctx, input)),
  saveReportCard: protectedProcedure
    .input(z.object({
      enrollmentId: uuid, milestoneSeq: z.number().int().min(1).max(200),
      scores: z.array(z.object({ criterionId: uuid, score: z.number().int().min(1).max(5).nullable(), comment: z.string().max(300).nullish() })).max(30),
      teacherComment: z.string().max(3000).nullish(), strengths: z.string().max(1000).nullish(), improvements: z.string().max(1000).nullish(),
      submit: z.boolean().optional(),
    }))
    .mutation(({ ctx, input }) => RC.saveReportCard(ctx, input)),
  reviewReportCard: protectedProcedure.input(z.object({ id: uuid, action: z.enum(["approve", "return", "publish"]), reason: z.string().max(300).optional() })).mutation(({ ctx, input }) => RC.reviewReportCard(ctx, input)),
  reviewQueue: protectedProcedure.query(({ ctx }) => RC.reviewQueue(ctx)),
  studentReportBook: protectedProcedure.input(z.object({ studentId: uuid })).query(({ ctx, input }) => RC.studentReportBook(ctx, input.studentId)),

  // Hoàn thành khoá
  completionCandidates: protectedProcedure.input(z.object({ classId: uuid })).query(({ ctx, input }) => RC.completionCandidates(ctx, input.classId)),
  completeCourse: protectedProcedure
    .input(z.object({ items: z.array(z.object({ enrollmentId: uuid, grade: z.string().min(2).max(40), teacherEvaluation: z.string().min(20, "Đánh giá tối thiểu 20 ký tự").max(3000) })).min(1).max(60) }))
    .mutation(({ ctx, input }) => RC.completeCourse(ctx, input)),
  completions: protectedProcedure.input(z.object({ centerId: uuid.optional() }).default({})).query(({ ctx, input }) => RC.listCompletions(ctx, input)),
  certificate: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => RC.getCertificate(ctx, input.id)),

  // Ảnh lớp
  media: protectedProcedure
    .input(z.object({ classId: uuid.optional(), sessionId: uuid.optional(), status: z.enum(["pending", "approved", "rejected"]).optional(), limit: z.number().int().min(1).max(300).optional() }).default({}))
    .query(({ ctx, input }) => MD.listMedia(ctx, input)),
  mediaReviewDays: protectedProcedure.query(({ ctx }) => MD.pendingReviewByDay(ctx)),
  reviewMedia: protectedProcedure.input(z.object({ ids: z.array(uuid).min(1).max(200), action: z.enum(["approve", "reject"]), reason: z.string().max(300).optional() })).mutation(({ ctx, input }) => MD.reviewMedia(ctx, input)),
  updateMediaTags: protectedProcedure.input(z.object({ id: uuid, taggedStudentIds: z.array(uuid).max(40), caption: z.string().max(500).nullish() })).mutation(({ ctx, input }) => MD.updateMediaTags(ctx, input)),
  deleteMedia: protectedProcedure.input(z.object({ id: uuid, reason: z.string().min(3).max(300) })).mutation(({ ctx, input }) => MD.deleteMedia(ctx, input)),
  uploadContext: protectedProcedure.input(z.object({ classId: uuid })).query(({ ctx, input }) => MD.uploadContext(ctx, input.classId)),
});
