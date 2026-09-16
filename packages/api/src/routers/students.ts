import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import * as S from "../services/students";
import * as E from "../services/enrollments";
import * as P from "../services/parentAccounts";
import * as O from "../services/org";
import { ENROLLMENT_STATUSES } from "@satarobo/core";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const uuid = z.string().uuid();
const nstr = (max: number) => z.string().max(max).nullish();

const studentFields = {
  fullName: z.string().min(2, "Họ tên tối thiểu 2 ký tự").max(120),
  nickname: nstr(60),
  dateOfBirth: isoDate.nullish(),
  gender: z.enum(["male", "female", "other"]).nullish(),
  grade: z.number().int().min(1).max(12).nullish(),
  school: nstr(200),
  homeCenterId: uuid,
  status: z.enum(S.STUDENT_STATUSES).optional(),
  healthNotes: nstr(1000),
  interests: nstr(500),
  notes: nstr(2000),
};
const guardian = z.object({ fullName: z.string().min(2).max(120), phone: z.string().min(9).max(20), email: z.string().email().nullish(), relation: z.enum(["mother", "father", "guardian", "parent"]).optional(), mediaConsent: z.boolean().optional() });

export const studentsRouter = router({
  list: protectedProcedure
    .input(z.object({ q: z.string().max(100).optional(), centerId: uuid.optional(), status: z.enum(S.STUDENT_STATUSES).optional(), page: z.number().int().min(1).optional(), pageSize: z.number().int().min(1).max(100).optional() }).default({}))
    .query(({ ctx, input }) => S.listStudents(ctx, input)),
  get: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => S.getStudent(ctx, input.id)),
  pick: protectedProcedure.input(z.object({ q: z.string().min(1).max(100) })).query(({ ctx, input }) => S.pickStudents(ctx, input.q)),
  create: protectedProcedure.input(z.object({ ...studentFields, guardians: z.array(guardian).min(1, "Cần ít nhất một phụ huynh").max(3) })).mutation(({ ctx, input }) => S.createStudent(ctx, input)),
  update: protectedProcedure
    .input(z.object(studentFields).partial().extend({ id: uuid, reason: z.string().max(300).optional() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input;
      return S.updateStudent(ctx, id, rest);
    }),
  addGuardian: protectedProcedure.input(guardian.extend({ studentId: uuid })).mutation(({ ctx, input }) => S.addGuardian(ctx, input)),

  // Đăng ký học
  enrollments: protectedProcedure
    .input(z.object({ q: z.string().max(100).optional(), centerId: uuid.optional(), classId: uuid.optional(), status: z.enum(ENROLLMENT_STATUSES).optional(), page: z.number().int().min(1).optional(), pageSize: z.number().int().min(1).max(100).optional() }).default({}))
    .query(({ ctx, input }) => E.listEnrollments(ctx, input)),
  enroll: protectedProcedure
    .input(z.object({ studentId: uuid, classId: uuid, packageSessions: z.number().int().min(1).max(200), startSequenceNo: z.number().int().min(1).max(200).optional(), status: z.enum(["active", "trial"]).optional(), note: nstr(300) }))
    .mutation(({ ctx, input }) => E.createEnrollment(ctx, input)),
  enrollmentTransition: protectedProcedure
    .input(z.object({ enrollmentId: uuid, event: z.enum(["activate", "pause", "resume", "withdraw", "complete"]), reason: z.string().max(300).optional(), pauseFrom: isoDate.optional(), pauseUntil: isoDate.optional() }))
    .mutation(({ ctx, input }) => E.transitionEnrollment(ctx, input)),
  changePackage: protectedProcedure.input(z.object({ enrollmentId: uuid, packageSessions: z.number().int().min(1).max(200), reason: z.string().min(3).max(300) })).mutation(({ ctx, input }) => E.changePackage(ctx, input)),
  nearingEnd: protectedProcedure.input(z.object({ threshold: z.number().int().min(0).max(48).optional(), centerId: uuid.optional() }).default({})).query(({ ctx, input }) => E.nearingEnd(ctx, input)),
  openEnrollments: protectedProcedure.input(z.object({ studentId: uuid })).query(({ ctx, input }) => E.openEnrollmentsOf(ctx, input.studentId)),
  previewTransfer: protectedProcedure.input(z.object({ enrollmentId: uuid, targetClassId: uuid })).query(({ ctx, input }) => E.previewTransfer(ctx, input)),
  transfer: protectedProcedure.input(z.object({ enrollmentId: uuid, targetClassId: uuid, reason: z.string().min(3, "Cần nhập lý do").max(300), startSequenceNo: z.number().int().min(1).max(200).optional() })).mutation(({ ctx, input }) => E.transferEnrollment(ctx, input)),

  // Tài khoản phụ huynh
  parentAccounts: protectedProcedure
    .input(z.object({ q: z.string().max(100).optional(), status: z.enum(P.PARENT_ACCOUNT_STATUSES).optional(), page: z.number().int().min(1).optional(), pageSize: z.number().int().min(1).max(100).optional() }).default({}))
    .query(({ ctx, input }) => P.listParentAccounts(ctx, input)),
  issueActivationCode: protectedProcedure.input(z.object({ parentId: uuid })).mutation(({ ctx, input }) => P.issueActivationCode(ctx, input)),
  setParentLock: protectedProcedure.input(z.object({ parentId: uuid, locked: z.boolean(), reason: z.string().min(3).max(300) })).mutation(({ ctx, input }) => P.setParentAccountLock(ctx, input)),
});

export const orgRouter = router({
  centers: protectedProcedure.query(({ ctx }) => O.listCenters(ctx)),
  upsertCenter: protectedProcedure
    .input(z.object({ id: uuid.optional(), code: z.string().min(2).max(10).regex(/^[A-Za-z0-9]+$/, "Chỉ chữ và số"), name: z.string().min(3).max(120), address: nstr(300), phone: nstr(20), isActive: z.boolean().optional() }))
    .mutation(({ ctx, input }) => O.upsertCenter(ctx, input)),
  rooms: protectedProcedure.input(z.object({ centerId: uuid.optional() }).default({})).query(({ ctx, input }) => O.listRooms(ctx, input)),
  upsertRoom: protectedProcedure
    .input(z.object({ id: uuid.optional(), centerId: uuid, code: z.string().min(1).max(20), name: z.string().min(2).max(80), capacity: z.number().int().min(1).max(60), isActive: z.boolean().optional() }))
    .mutation(({ ctx, input }) => O.upsertRoom(ctx, input)),
});
