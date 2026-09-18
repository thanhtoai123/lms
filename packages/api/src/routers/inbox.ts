import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import * as I from "../services/inbox";

const groupKey = z.enum(I.INBOX_GROUP_KEYS);

/**
 * "Việc hôm nay" — hộp việc gộp của người đang đăng nhập.
 * Không có quyền riêng: mỗi nhóm việc bên trong tự lọc theo quyền và cơ sở nhìn thấy.
 */
export const inboxRouter = router({
  today: protectedProcedure.query(({ ctx }) => I.inboxToday(ctx)),
  act: protectedProcedure
    .input(z.object({ group: groupKey, ids: z.array(z.string()).min(1, "Chưa chọn việc nào").max(50), note: z.string().max(500).nullish() }))
    .mutation(({ ctx, input }) => I.inboxAct(ctx, input)),
  undo: protectedProcedure
    .input(z.object({ group: groupKey, ids: z.array(z.string()).min(1).max(50) }))
    .mutation(({ ctx, input }) => I.inboxUndo(ctx, input)),
});
