import { z } from "zod";
import {
  DOC_KINDS, DOC_AUDIENCES, DOC_STATUSES, DOC_CATEGORIES, SUBMISSION_TYPES, ASSIGNMENT_STATUSES, PROPOSAL_TYPES, PROPOSAL_STATUSES,
} from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import * as D from "../services/documents";
import * as H from "../services/assignments";
import * as P from "../services/lessonPlans";

const uuid = z.string().uuid();
const s = (n: number) => z.string().max(n);
const page = z.number().int().min(1).max(10_000).optional();

export const contentRouter = router({
  documents: protectedProcedure
    .input(z.object({ courseId: uuid.optional(), lessonId: uuid.optional(), kind: z.enum(DOC_KINDS).optional(), status: z.enum(DOC_STATUSES).optional(), category: z.enum(DOC_CATEGORIES).optional(), q: s(100).optional(), page }).default({}))
    .query(({ ctx, input }) => D.listDocuments(ctx, input)),
  document: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => D.getDocument(ctx, input.id)),
  lessonOptions: protectedProcedure.input(z.object({ courseId: uuid })).query(({ ctx, input }) => D.lessonOptions(ctx, input.courseId)),
  upsertDocument: protectedProcedure
    .input(z.object({
      id: uuid.optional(), title: s(200), description: s(2000).nullish(), kind: z.enum(DOC_KINDS), category: z.enum(DOC_CATEGORIES), audience: z.enum(DOC_AUDIENCES),
      courseId: uuid, lessonId: uuid.nullish(), url: s(1000).nullish(), tags: z.array(s(30)).max(10).optional(),
    }))
    .mutation(({ ctx, input }) => D.upsertDocument(ctx, input)),
  setDocumentStatus: protectedProcedure.input(z.object({ id: uuid, status: z.enum(DOC_STATUSES) })).mutation(({ ctx, input }) => D.setDocumentStatus(ctx, input)),
  openDocument: protectedProcedure.input(z.object({ id: uuid, version: z.number().int().min(1).optional() })).mutation(({ ctx, input }) => D.openDocument(ctx, input)),
  scormLaunch: protectedProcedure.input(z.object({ id: uuid })).mutation(({ ctx, input }) => D.scormLaunch(ctx, input)),
  scormCommit: protectedProcedure
    .input(z.object({ id: uuid, version: z.number().int().min(1), cmi: z.record(z.string(), z.string().max(64_000)), terminate: z.boolean() }))
    .mutation(({ ctx, input }) => D.scormCommit(ctx, input)),
  scormReport: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => D.scormReport(ctx, input)),
  // Giáo án của từng buổi học (trang /scorm) — xem services/lessonPlans.ts
  planCourses: protectedProcedure.query(({ ctx }) => P.planCourses(ctx)),
  planLessons: protectedProcedure.input(z.object({ courseId: uuid })).query(({ ctx, input }) => P.planLessons(ctx, input)),
  plan: protectedProcedure.input(z.object({ lessonId: uuid })).query(({ ctx, input }) => P.getPlan(ctx, input)),
  planCleanFailed: protectedProcedure.input(z.object({ lessonId: uuid })).mutation(({ ctx, input }) => P.cleanFailedPlan(ctx, input)),
  planRemove: protectedProcedure.input(z.object({ lessonId: uuid })).mutation(({ ctx, input }) => P.removePlan(ctx, input)),
  planRestore: protectedProcedure.input(z.object({ lessonId: uuid, version: z.number().int().min(1) })).mutation(({ ctx, input }) => P.restorePlanVersion(ctx, input)),
  planOpen: protectedProcedure.input(z.object({ lessonId: uuid })).mutation(({ ctx, input }) => P.openPlan(ctx, input)),
  plansNeedingAttention: protectedProcedure.input(z.object({ courseId: uuid.optional() }).default({})).query(({ ctx, input }) => P.plansNeedingAttention(ctx, input)),

  myMaterials: protectedProcedure.input(z.object({ classId: uuid.optional() }).default({})).query(({ ctx, input }) => D.myMaterials(ctx, input)),

  proposalLessons: protectedProcedure.query(({ ctx }) => D.proposalLessonOptions(ctx)),
  proposals: protectedProcedure.input(z.object({ status: z.enum(PROPOSAL_STATUSES).optional(), mine: z.boolean().optional() }).default({})).query(({ ctx, input }) => D.listProposals(ctx, input)),
  proposal: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => D.getProposal(ctx, input.id)),
  createProposal: protectedProcedure
    .input(z.object({ lessonId: uuid, type: z.enum(PROPOSAL_TYPES), reason: s(3000), patch: z.object({ title: s(200).nullish(), objectives: s(3000).nullish(), materials: s(3000).nullish() }), classId: uuid.nullish() }))
    .mutation(({ ctx, input }) => D.createProposal(ctx, input)),
  proposalAction: protectedProcedure
    .input(z.object({ id: uuid, action: z.enum(["review", "approve", "reject", "apply", "withdraw"]), note: s(1000).nullish(), force: z.boolean().optional() }))
    .mutation(({ ctx, input }) => D.proposalAction(ctx, input)),
  proposalComment: protectedProcedure.input(z.object({ id: uuid, body: s(1000) })).mutation(({ ctx, input }) => D.addProposalComment(ctx, input)),

  templates: protectedProcedure.input(z.object({ courseId: uuid.optional(), includeInactive: z.boolean().optional() }).default({})).query(({ ctx, input }) => H.listTemplates(ctx, input)),
  upsertTemplate: protectedProcedure
    .input(z.object({ id: uuid.optional(), courseId: uuid, lessonId: uuid.nullish(), title: s(200), instructions: s(5000), submissionType: z.enum(SUBMISSION_TYPES), maxScore: z.number().int(), documentIds: z.array(uuid).max(10).optional(), isActive: z.boolean().optional() }))
    .mutation(({ ctx, input }) => H.upsertTemplate(ctx, input)),
  assignments: protectedProcedure.input(z.object({ classId: uuid.optional(), status: z.enum(ASSIGNMENT_STATUSES).optional(), page }).default({})).query(({ ctx, input }) => H.listAssignments(ctx, input)),
  assignment: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => H.getAssignment(ctx, input.id)),
  upsertAssignment: protectedProcedure
    .input(z.object({
      id: uuid.optional(), classId: uuid, sessionId: uuid.nullish(), templateId: uuid.nullish(), title: s(200), instructions: s(5000), submissionType: z.enum(SUBMISSION_TYPES),
      maxScore: z.number().int(), dueAt: z.string().datetime({ offset: true }), allowLate: z.boolean(), coinReward: z.number().int(), documentIds: z.array(uuid).max(10).optional(),
    }))
    .mutation(({ ctx, input }) => H.upsertAssignment(ctx, input)),
  assignmentAction: protectedProcedure.input(z.object({ id: uuid, action: z.enum(["publish", "close", "reopen", "sync", "delete"]) })).mutation(({ ctx, input }) => H.assignmentAction(ctx, input)),
  staffSubmit: protectedProcedure
    .input(z.object({ submissionId: uuid, text: s(5000).nullish(), link: s(1000).nullish() }))
    .mutation(({ ctx, input }) => H.staffSubmit(ctx, { ...input, files: [] })),
  grade: protectedProcedure.input(z.object({ id: uuid, score: z.number().min(0).max(100), feedback: s(2000).nullish() })).mutation(({ ctx, input }) => H.gradeSubmission(ctx, input)),
  submissionAction: protectedProcedure.input(z.object({ id: uuid, action: z.enum(["return", "excuse", "reopen", "mark_missing"]), note: s(1000).nullish() })).mutation(({ ctx, input }) => H.submissionAction(ctx, input)),
  studentHomework: protectedProcedure.input(z.object({ studentId: uuid })).query(({ ctx, input }) => H.studentHomework(ctx, input.studentId)),
});
