import { router, publicProcedure, protectedProcedure } from "../trpc";
import { myLoginHistory } from "../services/loginSecurity";
import { myProfile, hasTeacherProfile } from "../services/myAccount";
import { visibleCenterIds } from "@satarobo/core";

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => {
    if (!ctx.actor || !ctx.user) return null;
    return { user: ctx.user, assignments: ctx.actor.assignments, personId: ctx.actor.personId ?? null, visibleCenterIds: visibleCenterIds(ctx.actor), auth: ctx.auth ?? null };
  }),
  myLogins: protectedProcedure.query(({ ctx }) => myLoginHistory(ctx)),
  /** Hồ sơ tài khoản của chính mình (chỉ đọc) — menu tài khoản → Hồ sơ tài khoản */
  myProfile: protectedProcedure.query(({ ctx }) => myProfile(ctx)),
  hasTeacherProfile: protectedProcedure.query(({ ctx }) => hasTeacherProfile(ctx)),
});
