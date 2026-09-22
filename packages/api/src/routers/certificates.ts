import { z } from "zod";
import { TEMPLATE_ORIENTATIONS } from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import * as C from "../services/certificates";

const uuid = z.string().uuid();

/** Ô trường của mẫu — kiểm tra kỹ ở service (normalizeTemplateFields + validateTemplateFields) */
const templateField = z.object({
  key: z.string().max(40),
  enabled: z.boolean(),
  x: z.number().finite(), y: z.number().finite(), w: z.number().finite(), h: z.number().finite(),
  fontSize: z.number().finite(),
  bold: z.boolean(), italic: z.boolean(), uppercase: z.boolean(),
  color: z.string().max(9),
  align: z.string().max(10),
  font: z.string().max(20),
  dateFormat: z.string().max(10).optional(),
  place: z.string().max(60).optional(),
  text: z.string().max(300).optional(),
  prefix: z.string().max(40).optional(),
});

/**
 * Giấy chứng nhận & lộ trình học (docs/CHUNG-NHAN-LO-TRINH.md).
 * Tải ảnh nền mẫu đi qua route multipart `/api/chung-nhan/nen` (gọi `uploadTemplateBackground`).
 */
export const certificatesRouter = router({
  templates: router({
    list: protectedProcedure.input(z.object({ includeInactive: z.boolean().optional() }).default({})).query(({ ctx, input }) => C.listTemplates(ctx, input)),
    get: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => C.getTemplate(ctx, input.id)),
    create: protectedProcedure
      .input(z.object({ name: z.string().trim().min(2, "Tên mẫu tối thiểu 2 ký tự").max(120), orientation: z.enum(TEMPLATE_ORIENTATIONS), copyFromId: uuid.nullish() }))
      .mutation(({ ctx, input }) => C.createTemplate(ctx, input)),
    update: protectedProcedure
      .input(z.object({
        id: uuid, name: z.string().trim().min(2).max(120).optional(), orientation: z.enum(TEMPLATE_ORIENTATIONS).optional(),
        fields: z.array(templateField).max(20).optional(), isActive: z.boolean().optional(),
      }))
      .mutation(({ ctx, input }) => C.updateTemplate(ctx, input)),
    setDefault: protectedProcedure.input(z.object({ id: uuid })).mutation(({ ctx, input }) => C.setDefaultTemplate(ctx, input.id)),
  }),

  paths: router({
    list: protectedProcedure.input(z.object({ includeInactive: z.boolean().optional() }).default({})).query(({ ctx, input }) => C.listPaths(ctx, input)),
    get: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => C.getPath(ctx, input.id)),
    options: protectedProcedure.query(({ ctx }) => C.pathFormOptions(ctx)),
    upsert: protectedProcedure
      .input(z.object({
        id: uuid.optional(),
        code: z.string().trim().min(2, "Mã lộ trình tối thiểu 2 ký tự").max(30),
        name: z.string().trim().min(3, "Tên lộ trình tối thiểu 3 ký tự").max(160),
        description: z.string().max(2000).nullish(),
        criteriaText: z.string().max(600, "Điều kiện đạt tối đa 600 ký tự").nullish(),
        certificateTemplateId: uuid.nullish(),
        isActive: z.boolean().optional(),
        courses: z.array(z.object({ courseId: uuid, required: z.boolean() })).min(1, "Chọn ít nhất một khoá").max(20),
      }))
      .mutation(({ ctx, input }) => C.upsertPath(ctx, input)),
    students: protectedProcedure.input(z.object({ pathId: uuid })).query(({ ctx, input }) => C.pathStudents(ctx, input.pathId)),
  }),

  listEligible: protectedProcedure.input(z.object({ pathId: uuid })).query(({ ctx, input }) => C.listEligible(ctx, input.pathId)),
  issue: protectedProcedure
    .input(z.object({ pathId: uuid, studentIds: z.array(uuid).min(1, "Chọn ít nhất một học viên").max(200), templateId: uuid.nullish() }))
    .mutation(({ ctx, input }) => C.issuePathCertificates(ctx, input)),
  revoke: protectedProcedure
    .input(z.object({ id: uuid, reason: z.string().trim().min(5, "Nhập lý do thu hồi (tối thiểu 5 ký tự)").max(500) }))
    .mutation(({ ctx, input }) => C.revokeCertificate(ctx, input)),
  get: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => C.getCertificate(ctx, input.id)),
  print: protectedProcedure.input(z.object({ ids: z.array(uuid).min(1).max(200) })).query(({ ctx, input }) => C.printCertificates(ctx, input.ids)),
  listForStudent: protectedProcedure.input(z.object({ studentId: uuid })).query(({ ctx, input }) => C.listForStudent(ctx, input.studentId)),
});
