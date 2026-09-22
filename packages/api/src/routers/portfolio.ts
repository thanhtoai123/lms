import { z } from "zod";
import {
  OBJECTIVE_RESULTS, PORTFOLIO_SHARE_SCOPES, PORTFOLIO_SHARE_DAYS_MIN, PORTFOLIO_SHARE_DAYS_MAX, SESSION_EVAL_TEXT_MAX, HIGHLIGHT_MAX,
  CRITERION_NAME_MAX, CRITERION_GROUP_MAX, LEVEL_DESCRIPTOR_MAX,
} from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import * as E from "../services/sessionEvaluations";
import * as P from "../services/portfolio";
import * as C from "../services/criteria";
import * as S from "../services/portfolioStandard";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày dạng YYYY-MM-DD");
const text = z.string().max(SESSION_EVAL_TEXT_MAX, `Tối đa ${SESSION_EVAL_TEXT_MAX} ký tự`).nullish();
const scores = z.record(z.string().max(80), z.number().int().min(1).max(4).nullable());
const highlights = z.array(z.string().max(40)).max(HIGHLIGHT_MAX, `Chọn tối đa ${HIGHLIGHT_MAX} thẻ nổi bật`);

/**
 * Phiếu nhận xét buổi học (docs/HO-SO-HOC-TAP.md).
 * Quyền kiểm trong service: xem = session:read (GV: buổi mình dạy); điền / sửa = session_note:write (GV: _own).
 * Phát hành KHÔNG có thủ tục riêng: phiếu được phát hành cùng lúc khi hoàn tất buổi (academics.sessions.transition "complete").
 */
export const sessionEvaluationsRouter = router({
  /** Khối nhập liệu cho màn buổi học: tiêu chí, 4 mức, thẻ nổi bật, phiếu từng HV, điều kiện phát hành */
  board: protectedProcedure.input(z.object({ sessionId: uuid })).query(({ ctx, input }) => E.sessionEvaluationBoard(ctx, input.sessionId)),
  /** Lưu nháp tự động (nhiều HV một lần); nhận xét đồng bộ sang attendance.student_remark */
  save: protectedProcedure
    .input(z.object({
      sessionId: uuid,
      items: z.array(z.object({
        enrollmentId: uuid,
        scores: scores.optional(),
        objectiveResult: z.enum(OBJECTIVE_RESULTS).nullish(),
        highlights: highlights.optional(),
        productNote: text,
        remark: text,
        mediaIds: z.array(uuid).max(12).optional(),
      })).min(1).max(60),
    }))
    .mutation(({ ctx, input }) => E.saveEvaluations(ctx, {
      sessionId: input.sessionId,
      items: input.items.map((i) => ({
        enrollmentId: i.enrollmentId, scores: i.scores, objectiveResult: i.objectiveResult, highlights: i.highlights,
        productNote: i.productNote, remark: i.remark, mediaIds: i.mediaIds,
      })),
    })),
  /** Sửa phiếu ĐÃ phát hành — bắt buộc lý do, tăng số lần sửa, ghi nhật ký */
  amend: protectedProcedure
    .input(z.object({
      id: uuid,
      reason: z.string().trim().min(5, "Nhập lý do sửa phiếu (tối thiểu 5 ký tự)").max(300),
      scores: scores.optional(),
      objectiveResult: z.enum(OBJECTIVE_RESULTS).optional(),
      highlights: highlights.optional(),
      productNote: text,
      remark: text,
    }))
    .mutation(({ ctx, input }) => E.amendEvaluation(ctx, input)),
  /** Một phiếu (in riêng khổ A5) */
  sheet: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => E.getSessionSheet(ctx, input.id)),
  /** App GV: "Phiếu cần hoàn thiện" — buổi mình dạy còn học viên có mặt chưa có phiếu phát hành, kèm hạn */
  pending: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).optional() }).optional())
    .query(async ({ ctx, input }) => (await E.pendingEvaluationSessions(ctx, { limit: input?.limit ?? 10, mine: true })) ?? { total: 0, overdue: 0, items: [] }),
});

const filterInput = z.object({
  centerId: uuid.nullish(),
  courseId: uuid.nullish(),
  classId: uuid.nullish(),
  teacherId: uuid.nullish(),
  from: isoDate.nullish(),
  to: isoDate.nullish(),
});

/** Tiêu chí đánh giá (rubric 4 mức có mô tả) + tiêu chí trọng tâm theo bài — drawer ở trang Khoá học / Giáo trình */
const criteriaRouter = router({
  board: protectedProcedure.input(z.object({ courseId: uuid, curriculumId: uuid.nullish() })).query(({ ctx, input }) => C.courseCriteriaBoard(ctx, input)),
  save: protectedProcedure
    .input(z.object({
      id: uuid.optional(),
      courseId: uuid,
      name: z.string().trim().min(3, "Tên tiêu chí tối thiểu 3 ký tự").max(CRITERION_NAME_MAX),
      groupName: z.string().max(CRITERION_GROUP_MAX).nullish(),
      description: z.string().max(500).nullish(),
      levelDescriptors: z.array(z.string().max(LEVEL_DESCRIPTOR_MAX)).length(4, "Cần đúng 4 mô tả mức").nullish(),
      isActive: z.boolean().optional(),
    }))
    .mutation(({ ctx, input }) => C.saveCriterion(ctx, input)),
  reorder: protectedProcedure.input(z.object({ courseId: uuid, ids: z.array(uuid).min(1).max(50) })).mutation(({ ctx, input }) => C.reorderCriteria(ctx, input)),
  applyTemplate: protectedProcedure.input(z.object({ courseId: uuid })).mutation(({ ctx, input }) => C.applyCriteriaTemplate(ctx, input)),
  setFocus: protectedProcedure.input(z.object({ lessonId: uuid, criterionIds: z.array(uuid).max(4, "Chọn tối đa 4 tiêu chí trọng tâm") })).mutation(({ ctx, input }) => C.setLessonFocus(ctx, input)),
});

/** Quản lý hồ sơ học tập theo chuẩn thông tin (trang /ho-so-hoc-tap) */
const standardRouter = router({
  board: protectedProcedure.input(filterInput).query(({ ctx, input }) => S.complianceBoard(ctx, input)),
  options: protectedProcedure.query(({ ctx }) => S.complianceOptions(ctx)),
  remind: protectedProcedure
    .input(z.object({ sessionIds: z.array(uuid).min(1).max(200), note: z.string().max(300).nullish() }))
    .mutation(({ ctx, input }) => S.remindTeachers(ctx, input)),
  /** Dải "Mức đạt chuẩn hồ sơ" trên hồ sơ một học viên — chỉ nhân sự, không in cho phụ huynh */
  student: protectedProcedure.input(z.object({ studentId: uuid })).query(({ ctx, input }) => S.studentCompliance(ctx, input.studentId)),
});

const scopeInput = {
  scope: z.enum(PORTFOLIO_SHARE_SCOPES),
  enrollmentId: uuid.nullish(),
  from: isoDate.nullish(),
  to: isoDate.nullish(),
};

/** Hồ sơ học tập của học viên: xem, chia sẻ link, thu hồi, xuất PDF lưu trữ (tuỳ chọn) */
export const portfolioRouter = router({
  criteria: criteriaRouter,
  standard: standardRouter,
  get: protectedProcedure
    .input(z.object({ studentId: uuid, enrollmentId: uuid.nullish(), from: isoDate.nullish(), to: isoDate.nullish() }))
    .query(({ ctx, input }) => P.getPortfolio(ctx, input)),
  options: protectedProcedure.input(z.object({ studentId: uuid })).query(({ ctx, input }) => P.portfolioOptions(ctx, input.studentId)),
  /** Một học bạ mốc (trang in riêng) */
  milestone: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => P.getMilestoneCardView(ctx, input.id)),
  shares: protectedProcedure.input(z.object({ studentId: uuid })).query(({ ctx, input }) => P.listShares(ctx, input.studentId)),
  createShare: protectedProcedure
    .input(z.object({
      studentId: uuid, ...scopeInput,
      days: z.number().int().min(PORTFOLIO_SHARE_DAYS_MIN).max(PORTFOLIO_SHARE_DAYS_MAX).nullish(),
      label: z.string().max(120).nullish(),
    }))
    .mutation(({ ctx, input }) => P.createShare(ctx, input)),
  revokeShare: protectedProcedure
    .input(z.object({ id: uuid, reason: z.string().trim().min(3, "Nhập lý do thu hồi (tối thiểu 3 ký tự)").max(300) }))
    .mutation(({ ctx, input }) => P.revokeShare(ctx, input)),
  exportPdf: protectedProcedure
    .input(z.object({ studentId: uuid, ...scopeInput }))
    .mutation(({ ctx, input }) => P.exportPortfolioPdf(ctx, input)),
});
