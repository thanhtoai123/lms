import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { teachers } from "@satarobo/db";
import { addDays, hasRole } from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import { listSessions, todayISO } from "../services/sessions";
import { listClasses } from "../services/classes";
import { teacherFeedbackFeed, sessionExtras, sessionPrep, classInsights } from "../services/teacherHub";

const uuid = z.string().uuid();

async function myTeacherId(ctx: { db: import("@satarobo/db").Database; user: { id: string }; actor: import("@satarobo/core").Actor }) {
  const t = await ctx.db.query.teachers.findFirst({ where: eq(teachers.userId, ctx.user.id), columns: { id: true, fullName: true, centerId: true } });
  if (!t) throw new TRPCError({ code: "FORBIDDEN", message: "Tài khoản chưa gắn hồ sơ giáo viên" });
  return t;
}

/** API cho Teacher app: mọi thứ đều "của tôi" */
export const teacherRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const t = await myTeacherId(ctx);
    return { ...t, user: ctx.user, roles: ctx.actor.assignments.map((a) => a.role) };
  }),

  /** Hôm nay + việc quá hạn + 7 ngày tới */
  today: protectedProcedure.input(z.object({ date: z.string().optional() }).default({})).query(async ({ ctx, input }) => {
    const t = await myTeacherId(ctx);
    const today = input.date ?? todayISO();
    const [todays, overdue, upcoming] = await Promise.all([
      listSessions(ctx, { from: today, to: today, teacherId: t.id }),
      listSessions(ctx, { from: addDays(today, -60), to: addDays(today, -1), teacherId: t.id, onlyOpen: true }),
      listSessions(ctx, { from: addDays(today, 1), to: addDays(today, 7), teacherId: t.id }),
    ]);
    return { teacher: t, today, todays, overdue, upcoming };
  }),

  myClasses: protectedProcedure.query(async ({ ctx }) => {
    const t = await myTeacherId(ctx);
    return listClasses(ctx, { teacherId: t.id });
  }),

  isTeacher: protectedProcedure.query(({ ctx }) => hasRole(ctx.actor, "TEACHER", "ASSISTANT_TEACHER")),

  /** Phản hồi mới của phụ huynh (cảm xúc sau buổi) cho buổi mình dạy — docs/PHIA-NGUOI-DUNG.md */
  feedback: protectedProcedure.input(z.object({ days: z.number().int().min(1).max(60).optional(), limit: z.number().int().min(1).max(50).optional() }).default({})).query(async ({ ctx, input }) => {
    const t = await myTeacherId(ctx);
    return teacherFeedbackFeed(ctx, t.id, input);
  }),

  /** Màn "Chuẩn bị buổi dạy": bài, mục tiêu, học cụ, tiêu chí + mô tả mức, tài liệu, học viên cần lưu ý */
  prep: protectedProcedure.input(z.object({ sessionId: uuid })).query(({ ctx, input }) => sessionPrep(ctx, input.sessionId)),

  /** Bổ sung màn buổi dạy: phản hồi PH của buổi + sĩ số kèm đồng ý đăng ảnh (chụp & gắn ảnh nhanh) */
  sessionExtras: protectedProcedure.input(z.object({ sessionId: uuid })).query(({ ctx, input }) => sessionExtras(ctx, input.sessionId)),

  /** Lớp của tôi: tiến độ, học viên có nguy cơ, học bạ mốc sắp đến hạn */
  classInsights: protectedProcedure.query(async ({ ctx }) => {
    const t = await myTeacherId(ctx);
    return classInsights(ctx, t.id);
  }),
});
