import { z } from "zod";
import { APPOINTMENT_KINDS, APPOINTMENT_STATUSES, LEAD_STATUSES, DISTRIBUTION_MODES, MANUAL_LEAD_EVENTS, ASSIGNMENT_SOURCES, LEAD_IMPORT_MAX_ROWS, LEAD_DROP_REASON_MAX, HANDOVER_NOTE_MIN, CHILD_GENDERS } from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import * as L from "../services/leads";
import * as A from "../services/admissionsAdmin";
import * as I from "../services/leadImport";
import * as AP from "../services/appointments";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ");
const facebookUrl = z.string().trim().max(300).nullish();

const childInput = z.object({
  fullName: z.string().trim().min(1, "Nhập họ tên con").max(120),
  birthYear: z.number().int().min(2000).max(2030).nullish(),
  dateOfBirth: isoDate.nullish(),
  gender: z.enum(CHILD_GENDERS).nullish(),
  grade: z.number().int().min(1).max(12).nullish(),
  school: z.string().max(200).nullish(),
  interestedCourseId: uuid.nullish(),
  interestedCenterId: uuid.nullish(),
  notes: z.string().max(500).nullish(),
});

const leadInput = z.object({
  parentName: z.string().min(2).max(120),
  phone: z.string().min(9).max(20),
  email: z.string().email().nullish(),
  childName: z.string().max(120).nullish(),
  childGrade: z.number().int().min(1).max(12).nullish(),
  childBirthYear: z.number().int().min(2005).max(2025).nullish(),
  school: z.string().max(200).nullish(),
  interestedCourseId: uuid.nullish(),
  centerId: uuid.nullish(),
  source: z.string().max(60).nullish(),
  utmSource: z.string().max(100).nullish(),
  utmMedium: z.string().max(100).nullish(),
  utmCampaign: z.string().max(100).nullish(),
  notes: z.string().max(2000).nullish(),
  facebookUrl,
  consent: z.boolean().optional(),
  marketingConsent: z.boolean().optional(),
  referralCode: z.string().max(20).nullish(),
  autoAssign: z.boolean().optional(),
  assignedToId: uuid.nullish(),
  children: z.array(childInput).max(10).optional(),
  // Nguồn & theo dõi — chỉ form công khai gửi lên (IP / user agent lấy từ request, không nhận từ body)
  landingPage: z.string().max(500).nullish(),
  referrer: z.string().max(500).nullish(),
  eventId: z.string().max(100).nullish(),
});

/** Phiếu nhập nhanh của sale: không bắt buộc tên PH (điền được tới đâu lưu tới đó), SĐT bắt buộc để khử trùng */
const intakeInput = leadInput.extend({
  parentName: z.string().trim().max(120).optional(),
  phone: z.string().trim().min(9, "Nhập số điện thoại phụ huynh (dùng để kiểm tra trùng)").max(20),
  email: z.string().trim().max(200).nullish(),
});

const convertItem = z.object({
  childId: uuid.nullish(),
  studentName: z.string().trim().min(2).max(120).nullish(),
  dateOfBirth: isoDate.nullish(),
  grade: z.number().int().min(1).max(12).nullish(),
  classId: uuid,
  packageSessions: z.number().int().min(1).max(500),
  status: z.enum(["active", "trial"]).optional(),
  scholarshipFull: z.boolean().optional(),
  scholarshipReason: z.string().trim().max(300).nullish(),
});

const convertInput = z.object({
  leadId: uuid,
  parent: z.object({
    fullName: z.string().trim().min(2, "Họ tên phụ huynh tối thiểu 2 ký tự").max(120).nullish(),
    email: z.string().trim().max(200).nullish(),
    idNumber: z.string().trim().max(20).nullish(),
    address: z.string().trim().max(300).nullish(),
    province: z.string().trim().max(80).nullish(),
    ward: z.string().trim().max(80).nullish(),
  }).nullish(),
  items: z.array(convertItem).min(1, "Chọn ít nhất một học viên").max(10),
  mediaConsent: z.boolean().optional(),
  waiverReason: z.string().max(300).nullish(),
});

const bulkItem = z.object({
  leadId: uuid, childId: uuid.nullish(), classId: uuid, packageSessions: z.number().int().min(1).max(500),
  status: z.enum(["active", "trial"]).optional(), mediaConsent: z.boolean().optional(),
  paidAmount: z.number().int().min(0).max(10_000_000_000).nullish(), paidAt: isoDate.nullish(),
});

const importRow = z.object({
  line: z.number().int().min(1),
  parentName: z.string().max(200), phone: z.string().max(40), email: z.string().max(200), childName: z.string().max(200), childAge: z.string().max(10),
  centerCode: z.string().max(20), course: z.string().max(200), source: z.string().max(100), notes: z.string().max(4000), sale: z.string().max(200),
  paid: z.string().max(40), dueDate2: z.string().max(40), registeredAt: z.string().max(40),
});
const importMode = z.enum(["leads", "registered"]);

const centerIdInput = z.object({ centerId: uuid.nullable() });
const reason = (min: number, max = 500) => z.string().trim().min(min, `Nhập lý do (tối thiểu ${min} ký tự)`).max(max);
export type LeadInput = z.infer<typeof leadInput>;
export { leadInput };

const leadFilterInput = z.object({
  scope: z.enum(["mine", "center", "all"]).default("all"), status: z.enum(LEAD_STATUSES).optional(), allStatuses: z.boolean().optional(),
  centerId: z.string().uuid().optional(), q: z.string().max(100).optional(),
  assignedToId: z.union([z.string().uuid(), z.literal("none")]).optional(), source: z.string().max(100).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const leadsRouter = router({
  inbox: protectedProcedure
    .input(leadFilterInput.extend({
      limit: z.number().int().min(1).max(500).optional(), page: z.number().int().min(1).max(10_000).optional(), pageSize: z.number().int().min(10).max(200).optional(),
    }).default({ scope: "all" }))
    .query(({ ctx, input }) => L.leadInbox(ctx, input)),
  /** Xuất CSV toàn bộ kết quả lọc (không chỉ trang hiện tại) — tối đa 10.000 dòng, SĐT che theo quyền */
  exportRows: protectedProcedure.input(leadFilterInput.default({ scope: "all" })).query(({ ctx, input }) => L.exportLeads(ctx, input)),
  /** Bật / tắt "Dùng chung cho CSKH cùng cơ sở" */
  setShared: protectedProcedure.input(z.object({ leadId: uuid, shared: z.boolean() })).mutation(({ ctx, input }) => L.setLeadShared(ctx, input)),
  get: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => L.getLead(ctx, input.id)),
  create: protectedProcedure.input(intakeInput).mutation(({ ctx, input }) => L.createLead(ctx.db, { ...input, email: input.email || null }, ctx.user.id)),
  update: protectedProcedure
    .input(z.object({
      leadId: uuid, parentName: z.string().trim().min(2, "Tên phụ huynh tối thiểu 2 ký tự").max(120), phone: z.string().trim().min(9, "Số điện thoại không hợp lệ").max(20),
      email: z.string().trim().max(200).nullish(), centerId: uuid.nullish(), source: z.string().max(60).nullish(), notes: z.string().max(4000).nullish(),
      facebookUrl, childName: z.string().max(120).nullish(), childGrade: z.number().int().min(1).max(12).nullish(),
    }))
    .mutation(({ ctx, input }) => L.updateLead(ctx, { ...input, email: input.email || null })),
  delete: protectedProcedure.input(z.object({ leadId: uuid, reason: reason(3, LEAD_DROP_REASON_MAX) })).mutation(({ ctx, input }) => L.deleteLead(ctx, input)),
  addActivity: protectedProcedure
    .input(z.object({
      leadId: uuid, type: z.enum(["note", "call", "message", "email"]), content: z.string().trim().min(1, "Nhập nội dung hoạt động").max(2000), nextActionAt: z.string().datetime().nullish(),
      meta: z.object({
        caller: z.string().max(120).nullish(), durationMin: z.number().int().min(0).max(600).nullish(), platform: z.enum(["SMS", "Zalo", "Messenger"]).nullish(),
        to: z.string().max(200).nullish(), subject: z.string().max(200).nullish(),
      }).nullish(),
    }))
    .mutation(({ ctx, input }) => L.addActivity(ctx, input)),
  // "Ghi danh" (enroll) không nhận ở đây — chỉ qua convert (có kiểm tra thu tiền)
  transition: protectedProcedure
    .input(z.object({ leadId: uuid, event: z.enum(MANUAL_LEAD_EVENTS), note: z.string().max(1000).optional(), reason: z.string().trim().max(LEAD_DROP_REASON_MAX).optional(), lostReason: z.string().max(LEAD_DROP_REASON_MAX).optional(), trialAt: z.string().datetime().optional() }))
    .mutation(({ ctx, input }) => L.transitionLead(ctx, input)),
  assign: protectedProcedure.input(z.object({ leadId: uuid, assigneeId: uuid.nullable(), reason: z.string().max(300).optional() })).mutation(({ ctx, input }) => L.assignLead(ctx, input)),
  distributeOne: protectedProcedure.input(z.object({ leadId: uuid })).mutation(({ ctx, input }) => A.distributeOne(ctx, input)),
  addChild: protectedProcedure.input(childInput.extend({ leadId: uuid })).mutation(({ ctx, input }) => L.addLeadChild(ctx, input)),
  updateChild: protectedProcedure.input(childInput.partial().extend({ leadId: uuid, childId: uuid })).mutation(({ ctx, input }) => L.updateLeadChild(ctx, input)),
  removeChild: protectedProcedure.input(z.object({ leadId: uuid, childId: uuid })).mutation(({ ctx, input }) => L.removeLeadChild(ctx, input)),
  transfer: protectedProcedure
    .input(z.object({
      leadId: uuid, toCenterId: uuid.nullish(), toUserId: uuid.nullish(),
      handoverNote: z.string().trim().min(HANDOVER_NOTE_MIN, "Bắt buộc ghi đã tư vấn gì cho khách").max(2000), reason: z.string().trim().max(300).nullish(),
    }))
    .mutation(({ ctx, input }) => A.transferLead(ctx, input)),
  redistribute: protectedProcedure.input(z.object({ leadId: uuid, reason: reason(3, 300) })).mutation(({ ctx, input }) => A.redistributeLead(ctx, input)),
  reassign: protectedProcedure.input(z.object({ leadIds: z.array(uuid).min(1, "Chưa chọn lead").max(200), toUserId: uuid, reason: reason(3, 300) })).mutation(({ ctx, input }) => A.reassignLeads(ctx, input)),
  completeTask: protectedProcedure.input(z.object({ taskId: uuid, note: z.string().max(500).optional() })).mutation(({ ctx, input }) => L.completeTask(ctx, input)),
  convert: protectedProcedure.input(convertInput).mutation(({ ctx, input }) => L.convertLead(ctx, {
    ...input,
    parent: input.parent ? { ...input.parent, email: input.parent.email || null, idNumber: input.parent.idNumber || null } : null,
  })),
  bulkConvertCandidates: protectedProcedure
    .input(z.object({ centerId: uuid.nullish(), q: z.string().max(100).optional(), statuses: z.array(z.enum(LEAD_STATUSES)).optional() }).default({}))
    .query(({ ctx, input }) => A.bulkConvertCandidates(ctx, input)),
  bulkConvert: protectedProcedure.input(z.object({ items: z.array(bulkItem).min(1).max(100) })).mutation(({ ctx, input }) => A.bulkConvert(ctx, input, L.convertBulkItem)),
  stale: protectedProcedure.input(z.object({ sinceDays: z.number().int().min(1).max(730).optional(), centerId: uuid.nullish(), limit: z.number().int().max(1000).optional() }).default({})).query(({ ctx, input }) => A.staleLeads(ctx, input)),
  handover: protectedProcedure
    .input(z.object({ fromUserId: uuid, toUserId: uuid, statuses: z.array(z.enum(LEAD_STATUSES)).optional(), utmCampaign: z.string().max(100).nullish(), centerId: uuid.nullish(), reason: z.string().min(3).max(300), execute: z.boolean() }))
    .mutation(({ ctx, input }) => A.handoverLeads(ctx, input)),
  transfersReport: protectedProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), kind: z.enum(["handover", "center_transfer", "redistribute"]).optional() })).query(({ ctx, input }) => A.transfersReport(ctx, input)),
  summary: protectedProcedure.input(z.object({ centerId: uuid.nullish(), days: z.number().int().min(1).max(365).optional() }).default({})).query(({ ctx, input }) => A.crmSummary(ctx, input)),
  // Nhập lead từ file (CSV / dán từ Excel)
  importPreview: protectedProcedure
    .input(z.object({ rows: z.array(importRow).max(LEAD_IMPORT_MAX_ROWS), mode: importMode.default("leads") }))
    .mutation(({ ctx, input }) => I.previewLeadImport(ctx, input)),
  importCommit: protectedProcedure
    .input(z.object({ rows: z.array(importRow).min(1).max(LEAD_IMPORT_MAX_ROWS), overwriteLines: z.array(z.number().int()).max(LEAD_IMPORT_MAX_ROWS).default([]), note: z.string().trim().max(300), mode: importMode.default("leads"), fileName: z.string().max(200).nullish(), batchId: uuid.nullish() }))
    .mutation(({ ctx, input }) => I.commitLeadImport(ctx, input)),
  // Cấu hình chia lead + SLA
  settings: protectedProcedure.input(centerIdInput).query(({ ctx, input }) => A.getSettings(ctx, input.centerId)),
  updateSettings: protectedProcedure
    .input(centerIdInput.extend({ distributionMode: z.enum(DISTRIBUTION_MODES).optional(), dedupeDays: z.number().int().min(0).max(365).optional(), maxTrialsPerLead: z.number().int().min(1).max(10).optional(), staleAfterDays: z.number().int().min(1).max(90).optional(), slaMinutes: z.record(z.string(), z.number().int().min(1).nullable()).optional() }))
    .mutation(({ ctx, input }) => A.updateSettings(ctx, input)),
  distribution: protectedProcedure.input(centerIdInput).query(({ ctx, input }) => A.distributionBoard(ctx, input.centerId)),
  upsertAssignee: protectedProcedure
    .input(centerIdInput.extend({ userId: uuid, isAvailable: z.boolean().optional(), weight: z.number().int().min(1).max(10).optional(), note: z.string().max(200).nullish(), reason: z.string().trim().max(300).nullish() }))
    .mutation(({ ctx, input }) => A.upsertAssignee(ctx, input)),
  removeAssignee: protectedProcedure.input(centerIdInput.extend({ userId: uuid, reason: z.string().trim().max(300).nullish() })).mutation(({ ctx, input }) => A.removeAssignee(ctx, input)),
  resetRounds: protectedProcedure.input(centerIdInput.extend({ reason: z.string().trim().max(300).nullish() })).mutation(({ ctx, input }) => A.resetRounds(ctx, input.centerId, input.reason)),
  adjustRounds: protectedProcedure.input(centerIdInput.extend({ userId: uuid, rounds: z.number().int().min(0).max(100_000), reason: reason(3, 300) })).mutation(({ ctx, input }) => A.adjustRounds(ctx, input)),
  distributePool: protectedProcedure.input(centerIdInput.extend({ limit: z.number().int().min(1).max(200).optional() })).mutation(({ ctx, input }) => A.distributePool(ctx, input.centerId, input.limit)),
  distributionLog: protectedProcedure
    .input(z.object({ centerId: uuid.nullish(), from: isoDate.optional(), to: isoDate.optional(), saleId: uuid.nullish(), source: z.enum(ASSIGNMENT_SOURCES).optional(), consumed: z.boolean().optional(), page: z.number().int().min(1).optional(), all: z.boolean().optional() }).default({}))
    .query(({ ctx, input }) => A.distributionLog(ctx, input)),
  poolHistory: protectedProcedure.input(z.object({ centerId: uuid.nullish(), page: z.number().int().min(1).optional() }).default({})).query(({ ctx, input }) => A.poolHistory(ctx, input)),
  myTasks: protectedProcedure.query(({ ctx }) => L.myLeadTasks(ctx)),
  assigneeOptions: protectedProcedure.input(z.object({ centerId: uuid.nullish() }).default({})).query(({ ctx, input }) => L.assigneeOptions(ctx, input.centerId)),
});

/** LỊCH HẸN — gọi lại / hẹn tư vấn / hẹn học thử; "24 giờ tới" và "quá hạn" hiện ngay cạnh hộp thư */
export const appointmentsRouter = router({
  list: protectedProcedure
    .input(z.object({ view: z.enum(["sap_toi", "qua_han", "hom_nay", "tat_ca", "cua_toi"]).optional(), status: z.enum(APPOINTMENT_STATUSES).optional(), q: z.string().trim().max(100).optional() }).default({}))
    .query(({ ctx, input }) => AP.dsLichHen(ctx, input)),
  save: protectedProcedure
    .input(z.object({
      id: uuid.nullish(), title: z.string().trim().min(3).max(120), at: z.string().min(10), kind: z.enum(APPOINTMENT_KINDS).optional(),
      durationMin: z.number().int().min(5).max(480).nullish(), leadId: uuid.nullish(), parentId: uuid.nullish(), conversationId: uuid.nullish(),
      note: z.string().trim().max(1000).nullish(), assignedTo: uuid.nullish(), centerId: uuid.nullish(),
    }))
    .mutation(({ ctx, input }) => AP.luuLichHen(ctx, input)),
  setStatus: protectedProcedure
    .input(z.object({ id: uuid, status: z.enum(APPOINTMENT_STATUSES), note: z.string().trim().max(1000).nullish() }))
    .mutation(({ ctx, input }) => AP.doiTrangThaiLichHen(ctx, input)),
  upcoming: protectedProcedure.input(z.object({ soNgaySinhNhat: z.number().int().min(1).max(30).optional() }).default({})).query(({ ctx, input }) => AP.suKienSapToi(ctx, input)),
  forConversation: protectedProcedure.input(z.object({ conversationId: uuid })).query(({ ctx, input }) => AP.goiYGanHen(ctx, input)),
});
