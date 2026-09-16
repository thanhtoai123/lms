import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { teachers } from "@satarobo/db";
import { addDays, hasRole } from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import { listSessions, todayISO } from "../services/sessions";
import { listClasses } from "../services/classes";

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
});
