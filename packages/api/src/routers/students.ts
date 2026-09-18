import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import * as S from "../services/students";
import * as E from "../services/enrollments";
import * as P from "../services/parentAccounts";
import * as O from "../services/org";
import * as L from "../services/studentLifecycle";
import * as T from "../services/classTransfers";
import { ENROLLMENT_STATUSES, BLOOD_TYPES, GUARDIAN_RELATIONS, ROOM_STATUSES, TRANSFER_REQUEST_STATUSES } from "@satarobo/core";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const uuid = z.string().uuid();
const nstr = (max: number) => z.string().max(max).nullish();
const reason = z.string().trim().min(5, "Lý do tối thiểu 5 ký tự").max(500);

const address = z.object({ address: nstr(200), ward: nstr(100), district: nstr(100), city: nstr(100) });
const studentFields = {
  fullName: z.string().trim().min(2, "Họ tên tối thiểu 2 ký tự").max(120),
  nickname: nstr(60),
  dateOfBirth: isoDate.nullish(),
  gender: z.enum(["male", "female", "other"]).nullish(),
  grade: z.number().int().min(1).max(12).nullish(),
  school: nstr(200),
  homeCenterId: uuid,
  healthNotes: nstr(1000),
  interests: nstr(500),
  notes: nstr(2000),
  phone: nstr(20),
  email: z.string().trim().email("Email học viên không hợp lệ").max(120).nullish().or(z.literal("")),
  bloodType: z.enum(BLOOD_TYPES).nullish(),
  allergies: z.array(z.string().max(100)).max(20).optional(),
  preferredCenterId: uuid.nullish(),
  firstEnrolledOn: isoDate.nullish(),
  /** Mã học viên nhập tay (trống = tự sinh) */
  code: nstr(30),
  address: address.nullish(),
};
const nationalId = z.string().trim().regex(/^(\d[\s.-]?){9}(\d[\s.-]?\d[\s.-]?\d)?$/, "CCCD phải gồm 9 hoặc 12 chữ số").nullish().or(z.literal(""));
const guardian = z.object({
  fullName: z.string().trim().min(2, "Họ tên phụ huynh tối thiểu 2 ký tự").max(120), phone: z.string().min(9).max(20),
  email: z.string().trim().email("Email phụ huynh không hợp lệ").nullish().or(z.literal("")), relation: z.enum(GUARDIAN_RELATIONS).optional(), mediaConsent: z.boolean().optional(),
  nationalId,
});
const guardianPatch = z.object({
  parentId: uuid, fullName: z.string().trim().min(2).max(120).optional(), phone: z.string().min(9).max(20).optional(),
  email: z.string().trim().email("Email phụ huynh không hợp lệ").nullish().or(z.literal("")), relation: z.enum(GUARDIAN_RELATIONS).optional(), nationalId,
});
const blank = <T extends { email?: string | null; nationalId?: string | null }>(g: T) => ({ ...g, email: g.email || null, nationalId: g.nationalId || null });

export const studentsRouter = router({
  list: protectedProcedure
    .input(z.object({ q: z.string().max(100).optional(), centerId: uuid.optional(), status: z.enum(S.STUDENT_STATUSES).optional(), grade: z.number().int().min(1).max(12).optional(), page: z.number().int().min(1).optional(), pageSize: z.number().int().min(1).max(100).optional() }).default({}))
    .query(({ ctx, input }) => S.listStudents(ctx, input)),
  get: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => S.getStudent(ctx, input.id)),
  pick: protectedProcedure.input(z.object({ q: z.string().min(1).max(100), centerId: uuid.optional() })).query(({ ctx, input }) => S.pickStudents(ctx, input.q, input.centerId)),
  create: protectedProcedure
    .input(z.object({ ...studentFields, guardians: z.array(guardian).min(1, "Cần ít nhất một phụ huynh").max(3) }))
    .mutation(({ ctx, input }) => S.createStudent(ctx, { ...input, email: input.email || null, guardians: input.guardians.map(blank) })),
  update: protectedProcedure
    .input(z.object(studentFields).partial().extend({
      id: uuid, reason: z.string().max(300).optional(),
      guardians: z.array(guardianPatch).max(3).optional(),
      addGuardians: z.array(guardian).max(2).optional(),
    }))
    .mutation(({ ctx, input }) => {
      const { id, guardians, addGuardians, email, ...rest } = input;
      return S.updateStudent(ctx, id, {
        ...rest,
        ...(email !== undefined ? { email: email || null } : {}),
        guardians: guardians?.map(blank), addGuardians: addGuardians?.map(blank),
      });
    }),
  addGuardian: protectedProcedure.input(guardian.extend({ studentId: uuid })).mutation(({ ctx, input }) => S.addGuardian(ctx, blank(input))),
  /** Xem đầy đủ CCCD phụ huynh + địa chỉ (lý do bắt buộc, ghi nhật ký) */
  revealPrivate: protectedProcedure.input(z.object({ studentId: uuid, reason })).mutation(({ ctx, input }) => S.revealStudentPrivate(ctx, input)),

  // Vòng đời học viên
  reserve: protectedProcedure
    .input(z.object({ studentId: uuid, enrollmentId: uuid.nullish(), reason, from: isoDate.nullish(), expectedReturn: isoDate.nullish() }))
    .mutation(({ ctx, input }) => L.reserveStudent(ctx, input)),
  endReserve: protectedProcedure.input(z.object({ studentId: uuid, note: nstr(500) })).mutation(({ ctx, input }) => L.endStudentReserve(ctx, input)),
  withdraw: protectedProcedure.input(z.object({ studentId: uuid, reason })).mutation(({ ctx, input }) => L.withdrawStudent(ctx, input)),
  reactivate: protectedProcedure.input(z.object({ studentId: uuid, reason })).mutation(({ ctx, input }) => L.reactivateStudent(ctx, input)),

  // Chuyển lớp có yêu cầu / duyệt
  eligibleClasses: protectedProcedure
    .input(z.object({ enrollmentId: uuid, toCenterId: uuid.nullish(), includeOtherCourses: z.boolean().optional() }))
    .query(({ ctx, input }) => T.listEligibleClasses(ctx, input)),
  transferRequests: protectedProcedure
    .input(z.object({ status: z.union([z.enum(TRANSFER_REQUEST_STATUSES), z.literal("open")]).optional(), centerId: uuid.nullish() }).default({}))
    .query(({ ctx, input }) => T.listTransferRequests(ctx, input)),
  createTransferRequest: protectedProcedure
    .input(z.object({ enrollmentId: uuid, toClassId: uuid, reason, waiverReason: z.string().trim().max(300).nullish(), startSequenceNo: z.number().int().min(1).max(200).nullish() }))
    .mutation(({ ctx, input }) => T.createTransferRequest(ctx, input)),
  approveTransfer: protectedProcedure
    .input(z.object({ requestId: uuid, note: nstr(300), startSequenceNo: z.number().int().min(1).max(200).nullish() }))
    .mutation(({ ctx, input }) => T.approveTransfer(ctx, input)),
  rejectTransfer: protectedProcedure.input(z.object({ requestId: uuid, reason })).mutation(({ ctx, input }) => T.rejectTransfer(ctx, input)),
  cancelTransferRequest: protectedProcedure.input(z.object({ requestId: uuid, reason: nstr(300) })).mutation(({ ctx, input }) => T.cancelTransferRequest(ctx, input)),

  // Đăng ký học
  enrollments: protectedProcedure
    .input(z.object({ q: z.string().max(100).optional(), centerId: uuid.optional(), classId: uuid.optional(), status: z.enum(ENROLLMENT_STATUSES).optional(), page: z.number().int().min(1).optional(), pageSize: z.number().int().min(1).max(100).optional() }).default({}))
    .query(({ ctx, input }) => E.listEnrollments(ctx, input)),
  enrollment: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => E.getEnrollmentDetail(ctx, input.id)),
  enroll: protectedProcedure
    .input(z.object({ studentId: uuid, classId: uuid, packageSessions: z.number().int().min(1).max(200), startSequenceNo: z.number().int().min(1).max(200).optional(), status: z.enum(["active", "trial"]).optional(), note: nstr(300), waiverReason: nstr(300) }))
    .mutation(({ ctx, input }) => E.createEnrollment(ctx, input)),
  enrollmentTransition: protectedProcedure
    .input(z.object({ enrollmentId: uuid, event: z.enum(["activate", "pause", "resume", "withdraw", "complete"]), reason: z.string().max(300).optional(), pauseFrom: isoDate.optional(), pauseUntil: isoDate.nullish() }))
    .mutation(({ ctx, input }) => E.transitionEnrollment(ctx, input)),
  changePackage: protectedProcedure.input(z.object({ enrollmentId: uuid, packageSessions: z.number().int().min(1).max(200), reason: z.string().min(3).max(300) })).mutation(({ ctx, input }) => E.changePackage(ctx, input)),
  nearingEnd: protectedProcedure.input(z.object({ threshold: z.number().int().min(0).max(48).optional(), centerId: uuid.optional() }).default({})).query(({ ctx, input }) => E.nearingEnd(ctx, input)),
  openEnrollments: protectedProcedure.input(z.object({ studentId: uuid })).query(({ ctx, input }) => E.openEnrollmentsOf(ctx, input.studentId)),
  previewTransfer: protectedProcedure
    .input(z.object({ enrollmentId: uuid, targetClassId: uuid, waiverReason: z.string().max(300).nullish(), allowWaitlist: z.boolean().optional() }))
    .query(({ ctx, input }) => E.previewTransfer(ctx, input)),
  /** Chuyển lớp trực tiếp — chỉ người có quyền duyệt lớp; người khác tạo yêu cầu */
  transfer: protectedProcedure.input(z.object({ enrollmentId: uuid, targetClassId: uuid, reason: z.string().trim().min(5, "Lý do tối thiểu 5 ký tự").max(300), startSequenceNo: z.number().int().min(1).max(200).optional(), waiverReason: z.string().max(300).nullish() })).mutation(({ ctx, input }) => E.transferEnrollment(ctx, input)),

  // Tài khoản phụ huynh
  parentAccounts: protectedProcedure
    .input(z.object({ q: z.string().max(100).optional(), status: z.enum(P.PARENT_ACCOUNT_STATUSES).optional(), page: z.number().int().min(1).optional(), pageSize: z.number().int().min(1).max(100).optional() }).default({}))
    .query(({ ctx, input }) => P.listParentAccounts(ctx, input)),
  issueActivationCode: protectedProcedure.input(z.object({ parentId: uuid })).mutation(({ ctx, input }) => P.issueActivationCode(ctx, input)),
  resendActivationCodes: protectedProcedure.input(z.object({ parentIds: z.array(uuid).min(1, "Chọn ít nhất một phụ huynh").max(300) })).mutation(({ ctx, input }) => P.resendActivationCodes(ctx, input)),
  setParentLock: protectedProcedure.input(z.object({ parentId: uuid, locked: z.boolean(), reason: z.string().min(3).max(300) })).mutation(({ ctx, input }) => P.setParentAccountLock(ctx, input)),
});

export const orgRouter = router({
  centers: protectedProcedure.query(({ ctx }) => O.listCenters(ctx)),
  upsertCenter: protectedProcedure
    .input(z.object({ id: uuid.optional(), code: z.string().min(2).max(10).regex(/^[A-Za-z0-9]+$/, "Chỉ chữ và số"), name: z.string().min(3).max(120), address: nstr(300), phone: nstr(20), isActive: z.boolean().optional() }))
    .mutation(({ ctx, input }) => O.upsertCenter(ctx, input)),
  rooms: protectedProcedure.input(z.object({ centerId: uuid.optional() }).default({})).query(({ ctx, input }) => O.listRooms(ctx, input)),
  upsertRoom: protectedProcedure
    .input(z.object({
      id: uuid.optional(), centerId: uuid, code: z.string().min(1).max(20), name: z.string().min(2).max(80), capacity: z.number().int().min(1).max(60),
      status: z.enum(ROOM_STATUSES).optional(), equipment: z.array(z.string().max(60)).max(20).optional(), isActive: z.boolean().optional(),
    }))
    .mutation(({ ctx, input }) => O.upsertRoom(ctx, input)),
});
