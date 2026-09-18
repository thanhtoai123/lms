import { z } from "zod";
import { PARENT_REQUEST_TYPES, PARENT_REQUEST_STATUSES, CONTACT_CHANNELS, FEEDBACK_STATUSES, FEEDBACK_TAGS, SURVEY_TRIGGERS, SURVEY_STATUSES, QUESTION_TYPES, BROADCAST_CHANNELS } from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import * as C from "../services/care";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ");
const ntext = (n: number) => z.string().max(n).nullish();
const audience = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("class"), classId: uuid }),
  z.object({ kind: z.literal("center"), centerId: uuid }),
  z.object({ kind: z.literal("course"), courseId: uuid, centerId: uuid.nullish() }),
]);
const question = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,20}$/, "Mã câu hỏi chỉ gồm a-z, 0-9, _"), type: z.enum(QUESTION_TYPES), label: z.string().max(300), required: z.boolean(),
  options: z.array(z.string().max(100)).max(10).optional(),
});

export const careRouter = router({
  requests: protectedProcedure
    .input(z.object({ status: z.enum([...PARENT_REQUEST_STATUSES, "open", "overdue"]).optional(), type: z.enum(PARENT_REQUEST_TYPES).optional(), centerId: uuid.optional(), q: z.string().max(100).optional(), mine: z.boolean().optional() }).default({}))
    .query(({ ctx, input }) => C.listParentRequests(ctx, input)),
  requestContext: protectedProcedure.input(z.object({ studentId: uuid, enrollmentId: uuid.nullish() })).query(({ ctx, input }) => C.requestContext(ctx, input)),
  request: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => C.getParentRequest(ctx, input.id)),
  createRequest: protectedProcedure
    .input(z.object({
      type: z.enum(PARENT_REQUEST_TYPES), channel: z.enum(CONTACT_CHANNELS), studentId: uuid, parentId: uuid.nullish(), enrollmentId: uuid.nullish(),
      sessionId: uuid.nullish(), missedSessionId: uuid.nullish(), dateFrom: isoDate.nullish(), dateTo: isoDate.nullish(), content: z.string().max(2000), assigneeId: uuid.nullish(),
    }))
    .mutation(({ ctx, input }) => C.createParentRequest(ctx, input)),
  actRequest: protectedProcedure
    .input(z.object({ id: uuid, action: z.enum(["assign", "approve", "reject", "complete", "cancel"]), note: ntext(1000), assigneeId: uuid.nullish() }))
    .mutation(({ ctx, input }) => C.actOnParentRequest(ctx, input)),

  feedback: protectedProcedure
    .input(z.object({ status: z.enum(FEEDBACK_STATUSES).optional(), low: z.boolean().optional(), teacherId: uuid.optional(), from: isoDate.optional(), to: isoDate.optional(), centerId: uuid.optional(), classId: uuid.optional() }).default({}))
    .query(({ ctx, input }) => C.listFeedback(ctx, input)),
  recentSessions: protectedProcedure.input(z.object({ enrollmentId: uuid })).query(({ ctx, input }) => C.recentSessionsFor(ctx, input)),
  createFeedback: protectedProcedure
    .input(z.object({ studentId: uuid, enrollmentId: uuid, sessionId: uuid.nullish(), rating: z.number().int(), teacherRating: z.number().int().nullish(), tags: z.array(z.enum(FEEDBACK_TAGS)).max(7), comment: ntext(1000), channel: z.enum(CONTACT_CHANNELS) }))
    .mutation(({ ctx, input }) => C.createFeedback(ctx, input)),
  respondFeedback: protectedProcedure.input(z.object({ id: uuid, status: z.enum(["acknowledged", "resolved"]), response: ntext(1000) })).mutation(({ ctx, input }) => C.respondFeedback(ctx, input)),

  surveys: protectedProcedure.query(({ ctx }) => C.listSurveys(ctx)),
  survey: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => C.getSurvey(ctx, input.id)),
  upsertSurvey: protectedProcedure
    .input(z.object({ id: uuid.optional(), title: z.string().max(150), description: ntext(500), centerId: uuid.nullable(), trigger: z.enum(SURVEY_TRIGGERS), triggerValue: z.number().int().nullish(), questions: z.array(question).max(15) }))
    .mutation(({ ctx, input }) => C.upsertSurvey(ctx, input)),
  setSurveyStatus: protectedProcedure.input(z.object({ id: uuid, status: z.enum(SURVEY_STATUSES) })).mutation(({ ctx, input }) => C.setSurveyStatus(ctx, input)),
  sendSurvey: protectedProcedure.input(z.object({ id: uuid, classId: uuid.nullish(), centerId: uuid.nullish(), studentIds: z.array(uuid).max(500).optional() })).mutation(({ ctx, input }) => C.sendSurvey(ctx, input)),

  notifications: protectedProcedure
    .input(z.object({ status: z.enum(["queued", "sent", "failed", "read"]).optional(), channel: z.string().max(20).optional(), template: z.string().max(40).optional(), q: z.string().max(100).optional(), page: z.number().int().min(1).optional(), hidden: z.boolean().optional() }).default({}))
    .query(({ ctx, input }) => C.listParentNotifications(ctx, input)),
  previewBroadcast: protectedProcedure.input(z.object({ audience, title: z.string().max(150), body: z.string().max(1000) })).mutation(({ ctx, input }) => C.previewBroadcast(ctx, input)),
  sendBroadcast: protectedProcedure.input(z.object({ audience, title: z.string().max(150), body: z.string().max(1000), channel: z.enum(BROADCAST_CHANNELS), link: ntext(300) })).mutation(({ ctx, input }) => C.sendBroadcast(ctx, input)),
  retryNotification: protectedProcedure.input(z.object({ id: uuid })).mutation(({ ctx, input }) => C.retryNotification(ctx, input)),
  /** Ẩn / bỏ ẩn thông báo đã đăng — lý do bắt buộc, ghi nhật ký */
  hideNotification: protectedProcedure
    .input(z.object({ id: uuid, hidden: z.boolean(), reason: z.string().trim().min(5, "Lý do tối thiểu 5 ký tự").max(300) }))
    .mutation(({ ctx, input }) => C.hideNotification(ctx, input)),

  birthdays: protectedProcedure.input(z.object({ days: z.number().int().min(0).max(60).default(7), centerId: uuid.optional() }).default({ days: 7 })).query(({ ctx, input }) => C.birthdays(ctx, input)),
  greetBirthday: protectedProcedure.input(z.object({ studentId: uuid, message: ntext(500) })).mutation(({ ctx, input }) => C.sendBirthdayGreeting(ctx, input)),
});
