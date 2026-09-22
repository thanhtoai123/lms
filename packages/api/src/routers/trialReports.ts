import { z } from "zod";
import {
  TRIAL_READINESS, TRIAL_REPORT_STATUSES, TRIAL_REPORT_COMMENT_MAX, TRIAL_REPORT_NOTE_MAX, TRIAL_REPORT_LEVEL_MAX,
  TRIAL_REPORT_SHARE_DAYS_MIN, TRIAL_REPORT_SHARE_DAYS_MAX,
} from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import * as R from "../services/trialReports";

const uuid = z.string().uuid();
const comment = z.string().max(TRIAL_REPORT_COMMENT_MAX, `Mỗi ô nhận xét tối đa ${TRIAL_REPORT_COMMENT_MAX} ký tự`).nullish();
const days = z.number().int().min(TRIAL_REPORT_SHARE_DAYS_MIN).max(TRIAL_REPORT_SHARE_DAYS_MAX);

/** Nguồn phiếu: đúng MỘT trong ba — buổi thử lẻ, ghi danh lớp trải nghiệm, hoặc lead (+ bé) */
const sourceInput = z
  .object({ trialBookingId: uuid.nullish(), trialClassEnrollmentId: uuid.nullish(), leadId: uuid.nullish(), childId: uuid.nullish(), fresh: z.boolean().optional() })
  .refine((v) => [v.trialBookingId, v.trialClassEnrollmentId, v.leadId].filter(Boolean).length === 1, "Chọn đúng một buổi học thử (hoặc một lead) để lập phiếu");

/**
 * Phiếu đánh giá buổi học thử (docs/PHIEU-DANH-GIA-HOC-THU.md).
 * Quyền kiểm trong service: điền/sửa = trials:attendance | trials:manage | lead:update tại cơ sở;
 * phát hành / thu hồi / gia hạn = trials:manage | lead:update.
 */
export const trialReportsRouter = router({
  list: protectedProcedure
    .input(z.object({ leadId: uuid.optional(), centerId: uuid.optional(), status: z.enum(TRIAL_REPORT_STATUSES).optional() }).default({}))
    .query(({ ctx, input }) => R.listTrialReports(ctx, input)),
  get: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => R.getTrialReport(ctx, input.id)),
  /** Một chạm: trả phiếu đang có của buổi thử, chưa có thì tạo bản nháp điền sẵn */
  open: protectedProcedure.input(sourceInput).mutation(({ ctx, input }) => R.openTrialReport(ctx, input)),
  update: protectedProcedure
    .input(z.object({
      id: uuid,
      values: z.record(z.string().max(40), z.number().int().min(1).max(10).nullable()).optional(),
      strengths: comment,
      growth: comment,
      productNote: comment,
      readiness: z.enum(TRIAL_READINESS).nullish(),
      recommendedCourseId: uuid.nullish(),
      recommendedLevel: z.string().max(TRIAL_REPORT_LEVEL_MAX, `Cấp độ bắt đầu tối đa ${TRIAL_REPORT_LEVEL_MAX} ký tự`).nullish(),
      recommendationNote: z.string().max(TRIAL_REPORT_NOTE_MAX, `Lý do đề xuất tối đa ${TRIAL_REPORT_NOTE_MAX} ký tự`).nullish(),
      pathway: z.boolean().optional(),
      competitionPotential: z.boolean().optional(),
      courseId: uuid.nullish(),
    }))
    .mutation(({ ctx, input }) => R.updateTrialReport(ctx, input)),
  publish: protectedProcedure.input(z.object({ id: uuid, days: days.nullish() })).mutation(({ ctx, input }) => R.publishTrialReport(ctx, input)),
  revoke: protectedProcedure
    .input(z.object({ id: uuid, reason: z.string().trim().min(3, "Nhập lý do thu hồi (tối thiểu 3 ký tự)").max(300) }))
    .mutation(({ ctx, input }) => R.revokeTrialReport(ctx, input)),
  extend: protectedProcedure.input(z.object({ id: uuid, days })).mutation(({ ctx, input }) => R.extendTrialReport(ctx, input)),
});
