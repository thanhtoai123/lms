import { z } from "zod";
import { TEACHER_GRADES, TEACHER_STATUSES, CONTRACT_TYPES, CURRICULUM_STATUSES } from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import * as Cat from "../services/catalog";
import * as T from "../services/teachers";
import * as H from "../services/holidays";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ");
const ntext = (n: number) => z.string().max(n).nullish();

export const catalogRouter = router({
  courses: protectedProcedure.input(z.object({ q: z.string().max(100).optional(), active: z.boolean().optional() }).default({})).query(({ ctx, input }) => Cat.listCourses(ctx, input)),
  courseOptions: protectedProcedure.query(({ ctx }) => Cat.courseOptions(ctx)),
  upsertCourse: protectedProcedure
    .input(z.object({
      id: uuid.optional(), code: z.string().trim().min(2, "Mã khoá tối thiểu 2 ký tự").max(20), name: z.string().trim().min(3, "Tên khoá tối thiểu 3 ký tự").max(120),
      gradeFrom: z.number().int().min(1).max(12).nullish(), gradeTo: z.number().int().min(1).max(12).nullish(),
      totalSessions: z.number().int().min(1).max(200), sessionMinutes: z.number().int().min(30).max(300), listPrice: z.number().min(0).max(1_000_000_000),
      nextCourseId: uuid.nullish(), description: ntext(2000), level: ntext(60), isActive: z.boolean().optional(),
    }))
    .mutation(({ ctx, input }) => Cat.upsertCourse(ctx, input)),
  coursePackages: protectedProcedure
    .input(z.object({ q: z.string().max(100).optional(), courseId: uuid.optional(), active: z.boolean().optional() }).default({}))
    .query(({ ctx, input }) => Cat.listCoursePackages(ctx, input)),
  coursePackageOptions: protectedProcedure.query(({ ctx }) => Cat.coursePackageOptions(ctx)),
  upsertCoursePackage: protectedProcedure
    .input(z.object({
      id: uuid.optional(), courseId: uuid, code: z.string().trim().min(2, "Mã gói tối thiểu 2 ký tự").max(30), name: z.string().trim().min(3, "Tên gói tối thiểu 3 ký tự").max(150),
      level: ntext(60), sessions: z.number().int().min(1).max(500),
      listPrice: z.number().int("Giá phải là số nguyên đồng").min(0).max(10_000_000_000),
      salePrice: z.number().int("Giá phải là số nguyên đồng").min(0).max(10_000_000_000).nullish(),
      description: ntext(2000), isFeatured: z.boolean().optional(), isActive: z.boolean().optional(), sortOrder: z.number().int().min(0).max(999).optional(),
    }))
    .mutation(({ ctx, input }) => Cat.upsertCoursePackage(ctx, input)),
  setCoursePackageActive: protectedProcedure
    .input(z.object({ id: uuid, isActive: z.boolean(), reason: ntext(300) }))
    .mutation(({ ctx, input }) => Cat.setCoursePackageActive(ctx, input)),

  prerequisites: protectedProcedure.query(({ ctx }) => Cat.listPrerequisites(ctx)),
  addPrerequisite: protectedProcedure.input(z.object({ courseId: uuid, requiredCourseId: uuid, note: ntext(300) })).mutation(({ ctx, input }) => Cat.addPrerequisite(ctx, input)),
  removePrerequisite: protectedProcedure.input(z.object({ id: uuid })).mutation(({ ctx, input }) => Cat.removePrerequisite(ctx, input)),
  prerequisiteStatus: protectedProcedure.input(z.object({ studentId: uuid.nullish(), classId: uuid })).query(({ ctx, input }) => Cat.prerequisiteStatus(ctx, input)),

  curricula: protectedProcedure.input(z.object({ courseId: uuid.optional(), status: z.enum(CURRICULUM_STATUSES).optional() }).default({})).query(({ ctx, input }) => Cat.listCurricula(ctx, input)),
  curriculum: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => Cat.getCurriculum(ctx, input.id)),
  upsertCurriculum: protectedProcedure.input(z.object({ id: uuid.optional(), courseId: uuid, name: z.string().trim().min(3, "Tên giáo trình tối thiểu 3 ký tự").max(120), description: ntext(2000) })).mutation(({ ctx, input }) => Cat.upsertCurriculum(ctx, input)),
  setCurriculumStatus: protectedProcedure.input(z.object({ id: uuid, status: z.enum(CURRICULUM_STATUSES) })).mutation(({ ctx, input }) => Cat.setCurriculumStatus(ctx, input)),
  cloneCurriculum: protectedProcedure.input(z.object({ id: uuid, name: z.string().max(120).optional() })).mutation(({ ctx, input }) => Cat.cloneCurriculum(ctx, input)),
  upsertLesson: protectedProcedure
    .input(z.object({ id: uuid.optional(), curriculumId: uuid, title: z.string().trim().min(3, "Tên bài tối thiểu 3 ký tự").max(200), objectives: ntext(2000), materials: ntext(1000), isReportCardMilestone: z.boolean().optional() }))
    .mutation(({ ctx, input }) => Cat.upsertLesson(ctx, input)),
  moveLesson: protectedProcedure.input(z.object({ curriculumId: uuid, lessonId: uuid, dir: z.enum(["up", "down"]) })).mutation(({ ctx, input }) => Cat.moveLessonOrder(ctx, input)),
  deleteLesson: protectedProcedure.input(z.object({ curriculumId: uuid, lessonId: uuid })).mutation(({ ctx, input }) => Cat.deleteLesson(ctx, input)),

  teachers: protectedProcedure
    .input(z.object({ q: z.string().max(100).optional(), centerId: uuid.optional(), grade: z.enum(TEACHER_GRADES).optional(), status: z.enum(TEACHER_STATUSES).optional(), courseId: uuid.optional() }).default({}))
    .query(({ ctx, input }) => T.listTeachers(ctx, input)),
  teacher: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => T.getTeacher(ctx, input.id)),
  upsertTeacher: protectedProcedure
    .input(z.object({
      id: uuid.optional(), fullName: z.string().trim().min(2, "Họ tên tối thiểu 2 ký tự").max(120), email: z.string().trim().email("Email không hợp lệ").max(200).nullish().or(z.literal("")),
      phone: ntext(20), title: ntext(80), centerId: uuid.nullish(), grade: z.enum(TEACHER_GRADES).nullish(), contractType: z.enum(CONTRACT_TYPES),
      maxLoadPerWeek: z.number().int().min(1).max(60), hiredAt: isoDate.nullish().or(z.literal("")), notes: ntext(2000), userId: uuid.nullish(), courseIds: z.array(uuid).max(50).optional(),
    }))
    .mutation(({ ctx, input }) => T.upsertTeacher(ctx, { ...input, email: input.email || null, hiredAt: input.hiredAt || null })),
  setTeacherStatus: protectedProcedure.input(z.object({ id: uuid, status: z.enum(TEACHER_STATUSES), reason: ntext(300) })).mutation(({ ctx, input }) => T.setTeacherStatus(ctx, input)),
  addEvaluation: protectedProcedure
    .input(z.object({ teacherId: uuid, score: z.number().int().min(1, "Điểm từ 1 đến 5").max(5, "Điểm từ 1 đến 5"), comment: z.string().max(2000), observedOn: isoDate, sessionId: uuid.nullish() }))
    .mutation(({ ctx, input }) => T.addEvaluation(ctx, input)),
  linkableAccounts: protectedProcedure.input(z.object({ teacherId: uuid.optional() }).default({})).query(({ ctx, input }) => T.linkableAccounts(ctx, input.teacherId)),

  holidays: protectedProcedure.input(z.object({ year: z.number().int().min(2020).max(2100).optional(), centerId: uuid.optional() }).default({})).query(({ ctx, input }) => H.listHolidays(ctx, input)),
  previewHoliday: protectedProcedure.input(z.object({ from: isoDate, to: isoDate.nullish(), centerId: uuid.nullable() })).query(({ ctx, input }) => H.previewHoliday(ctx, input)),
  addHoliday: protectedProcedure
    .input(z.object({ from: isoDate, to: isoDate.nullish(), centerId: uuid.nullable(), name: z.string().trim().min(3, "Tên ngày nghỉ tối thiểu 3 ký tự").max(120), reschedule: z.boolean() }))
    .mutation(({ ctx, input }) => H.addHoliday(ctx, input)),
  deleteHoliday: protectedProcedure.input(z.object({ id: uuid, reason: z.string().max(300) })).mutation(({ ctx, input }) => H.deleteHoliday(ctx, input)),
});
