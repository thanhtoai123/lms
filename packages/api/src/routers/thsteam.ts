import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import * as TH from "../services/thsteamCatalog";

/** Khung chương trình chuẩn TH STEAM: trạng thái trong CSDL + đồng bộ danh mục (Đào tạo → Khung chương trình) */
export const thsteamRouter = router({
  overview: protectedProcedure.query(({ ctx }) => TH.thCatalogOverview(ctx)),
  sync: protectedProcedure.input(z.object({ retireOthers: z.boolean().default(false) })).mutation(({ ctx, input }) => TH.thCatalogSync(ctx, input)),
});
