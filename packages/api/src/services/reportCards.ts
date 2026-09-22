import { and, eq, inArray, sql, asc, desc, isNull, lte, gt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  competencyCriteria, reportCards, reportCardScores, courseCompletions, courses, classes, enrollments, students, sessions, lessons,
  studentGuardians, parentNotifications, centers, users, sessionEvaluations, attendance,
} from "@satarobo/db";
import {
  reportCardTransition, reportCardMilestones, milestoneLabel, validateReportCard, averageScore, gradeFromAverage, certificateNumber,
  completionCheck, completionTransition, validateCompletionInput, enrollmentTransition, visibleCenterIds, authorize,
  addDays as addDaysISO, clampPageSize,
  milestonePeriod, aggregateMilestone, suggestMilestoneComment, snapshotScores, isSessionEvalSnapshot, isMilestoneAggregate, tallyAttendance,
  RUBRIC_SCALE,
  type ReportCardStatus, type CompletionStatus, type MilestoneAggregate, type EvalForAggregate,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { tenantCond } from "./tenantScope";
import { writeAudit } from "./audit";
import { emit } from "./outbox";
import { consumedSql } from "./students";
import { todayISO } from "./sessions";

type Db = ProtectedContext["db"];

/* ------------------------------------------------------------------ */
/* Tiêu chí năng lực theo khoá                                         */
/* ------------------------------------------------------------------ */

export async function criteriaByCourse(ctx: ProtectedContext) {
  requirePermission(ctx, "report_card:read", {});
  const [cs, cr] = await Promise.all([
    ctx.db.select({ id: courses.id, code: courses.code, name: courses.name, totalSessions: courses.totalSessions, nextCourseId: courses.nextCourseId }).from(courses).where(and(eq(courses.isActive, true), tenantCond(ctx, courses))).orderBy(asc(courses.code)),
    ctx.db.select().from(competencyCriteria).orderBy(asc(competencyCriteria.sortOrder), asc(competencyCriteria.createdAt)),
  ]);
  return cs.map((c) => ({ ...c, milestones: reportCardMilestones(c.totalSessions), criteria: cr.filter((x) => x.courseId === c.id) }));
}

export async function upsertCriterion(ctx: ProtectedContext, input: { id?: string; courseId: string; name: string; description?: string | null; isActive?: boolean }) {
  requirePermission(ctx, "report_card:configure", {});
  return ctx.db.transaction(async (tx) => {
    let row;
    if (input.id) {
      [row] = await tx.update(competencyCriteria).set({ name: input.name.trim(), description: input.description ?? null, ...(input.isActive !== undefined ? { isActive: input.isActive } : {}), updatedAt: new Date() }).where(eq(competencyCriteria.id, input.id)).returning();
    } else {
      const [m] = await tx.select({ n: sql<number>`coalesce(max(${competencyCriteria.sortOrder}), 0)::int` }).from(competencyCriteria).where(eq(competencyCriteria.courseId, input.courseId));
      [row] = await tx.insert(competencyCriteria).values({ courseId: input.courseId, name: input.name.trim(), description: input.description ?? null, sortOrder: (m?.n ?? 0) + 1 }).returning();
    }
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: input.id ? "UPDATE" : "CREATE", module: "report_cards", entity: "competency_criteria", entityId: row.id, after: input, ip: ctx.ip });
    return row;
  });
}

export async function moveCriterion(ctx: ProtectedContext, input: { id: string; direction: "up" | "down" }) {
  requirePermission(ctx, "report_card:configure", {});
  const cur = await ctx.db.query.competencyCriteria.findFirst({ where: eq(competencyCriteria.id, input.id) });
  if (!cur) throw new TRPCError({ code: "NOT_FOUND" });
  const list = await ctx.db.select().from(competencyCriteria).where(eq(competencyCriteria.courseId, cur.courseId)).orderBy(asc(competencyCriteria.sortOrder), asc(competencyCriteria.createdAt));
  const i = list.findIndex((x) => x.id === cur.id);
  const j = input.direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return { ok: true };
  [list[i], list[j]] = [list[j]!, list[i]!];
  await ctx.db.transaction(async (tx) => {
    for (const [k, c] of list.entries()) await tx.update(competencyCriteria).set({ sortOrder: k + 1 }).where(eq(competencyCriteria.id, c.id));
  });
  return { ok: true };
}

export async function setNextCourse(ctx: ProtectedContext, input: { courseId: string; nextCourseId: string | null }) {
  requirePermission(ctx, "report_card:configure", {});
  if (input.nextCourseId === input.courseId) throw new TRPCError({ code: "BAD_REQUEST", message: "Khoá tiếp theo không thể là chính nó" });
  const before = await ctx.db.query.courses.findFirst({ where: eq(courses.id, input.courseId), columns: { nextCourseId: true } });
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.update(courses).set({ nextCourseId: input.nextCourseId, updatedAt: new Date() }).where(eq(courses.id, input.courseId));
    // Lộ trình khoá học quyết định học viên được đề xuất học tiếp gì (kéo theo báo giá) — ghi nhật ký như mọi thay đổi danh mục khác
    await writeAudit(tx, { actorId: ctx.user.id, action: "UPDATE", module: "academics", entity: "courses", entityId: input.courseId, before: { nextCourseId: before?.nextCourseId ?? null }, after: { nextCourseId: input.nextCourseId }, ip: ctx.ip });
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Học bạ theo lớp                                                     */
/* ------------------------------------------------------------------ */

async function loadClass(ctx: ProtectedContext, classId: string) {
  const [c] = await ctx.db
    .select({ id: classes.id, code: classes.code, name: classes.name, centerId: classes.centerId, courseId: classes.courseId, courseCode: courses.code, totalSessions: courses.totalSessions, curriculumId: classes.curriculumId, leadTeacherId: classes.leadTeacherId, assistantTeacherId: classes.assistantTeacherId })
    .from(classes).innerJoin(courses, eq(courses.id, classes.courseId)).where(and(eq(classes.id, classId), isNull(classes.deletedAt))).limit(1);
  if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy lớp" });
  return c;
}

/** Mốc của lớp: ưu tiên bài có cờ mốc trong giáo trình; nếu không có dùng quy tắc 5/12 mỗi kỳ */
async function classMilestones(db: Db, c: { curriculumId: string | null; totalSessions: number }) {
  if (c.curriculumId) {
    const rows = await db.select({ seq: lessons.sequenceNo }).from(lessons).where(and(eq(lessons.curriculumId, c.curriculumId), eq(lessons.isReportCardMilestone, true))).orderBy(asc(lessons.sequenceNo));
    if (rows.length) return rows.map((r) => r.seq);
  }
  return reportCardMilestones(c.totalSessions);
}

/* ------------------------------------------------------------------ */
/* Học bạ mốc tự tổng hợp từ phiếu nhận xét buổi (hồ sơ học tập)        */
/* ------------------------------------------------------------------ */

/** Điểm tiêu chí quy về thang 5 trong SQL — trộn học bạ cũ (thang 5) với học bạ mới (thang 4) */
export const SCORE_TO5_SQL = sql.raw("(case when rc.rubric_scale = 4 then 1 + (s.score - 1) * 4.0 / 3 else s.score end)");

/**
 * Số liệu tổng hợp của một mốc học bạ từ các phiếu buổi ĐÃ PHÁT HÀNH trong giai đoạn
 * (từ sau buổi mốc trước đến buổi mốc này, tính theo ngày buổi học để gồm cả buổi học bù)
 * và của giai đoạn trước (để tính xu hướng). Hàm thuần `aggregateMilestone` ở packages/core.
 */
export async function milestoneAggregateFor(
  db: Db,
  input: { enrollmentId: string; classId: string; courseId: string; curriculumId: string | null; totalSessions: number; milestoneSeq: number },
): Promise<MilestoneAggregate> {
  const milestones = await classMilestones(db, { curriculumId: input.curriculumId, totalSessions: input.totalSessions });
  const period = milestonePeriod(milestones, input.milestoneSeq);
  const seqs = [period.fromSeq - 1, period.toSeq, period.previous ? period.previous.fromSeq - 1 : 0].filter((x) => x >= 1);
  const [bounds, criteria] = await Promise.all([
    seqs.length ? db.select({ seq: sessions.sequenceNo, date: sessions.date }).from(sessions).where(and(eq(sessions.classId, input.classId), inArray(sessions.sequenceNo, seqs))) : Promise.resolve([] as { seq: number; date: string }[]),
    db.select({ id: competencyCriteria.id, name: competencyCriteria.name }).from(competencyCriteria)
      .where(and(eq(competencyCriteria.courseId, input.courseId), eq(competencyCriteria.isActive, true)))
      .orderBy(asc(competencyCriteria.sortOrder)),
  ]);
  const dateOf = (seq: number) => bounds.find((b) => b.seq === seq)?.date ?? null;
  // Giai đoạn hiện tại: (ngày buổi mốc trước, ngày buổi mốc này]; giai đoạn trước: (ngày mốc trước nữa, ngày mốc trước]
  const curFrom = period.fromSeq > 1 ? dateOf(period.fromSeq - 1) : null;
  const curTo = dateOf(period.toSeq) ?? todayISO();
  const prevFrom = period.previous && period.previous.fromSeq > 1 ? dateOf(period.previous.fromSeq - 1) : null;
  const prevTo = curFrom;

  const evalRows = await db
    .select({ date: sessions.date, seq: sessions.sequenceNo, snapshot: sessionEvaluations.snapshot, objectiveResult: sessionEvaluations.objectiveResult, highlights: sessionEvaluations.highlights, remark: sessionEvaluations.remark, productNote: sessionEvaluations.productNote })
    .from(sessionEvaluations)
    .innerJoin(sessions, eq(sessions.id, sessionEvaluations.sessionId))
    .where(and(eq(sessionEvaluations.enrollmentId, input.enrollmentId), eq(sessionEvaluations.status, "published"), lte(sessions.date, curTo), prevFrom ? gt(sessions.date, prevFrom) : sql`true`));
  const toAgg = (r: (typeof evalRows)[number]): EvalForAggregate => ({
    date: r.date, sequenceNo: r.seq, scores: snapshotScores(isSessionEvalSnapshot(r.snapshot) ? r.snapshot : null),
    objectiveResult: r.objectiveResult, highlights: r.highlights ?? [], remark: r.remark, productNote: r.productNote,
  });
  const inCur = (d: string) => (!curFrom || d > curFrom) && d <= curTo;
  const current = evalRows.filter((r) => inCur(r.date)).map(toAgg);
  const previous = period.previous && prevTo ? evalRows.filter((r) => r.date <= prevTo && (!prevFrom || r.date > prevFrom)).map(toAgg) : [];

  const att = await db
    .select({ status: attendance.status })
    .from(attendance).innerJoin(sessions, eq(sessions.id, attendance.sessionId))
    .where(and(eq(attendance.enrollmentId, input.enrollmentId), lte(sessions.date, curTo), curFrom ? gt(sessions.date, curFrom) : sql`true`));
  const t = tallyAttendance(att.map((a) => a.status));
  return aggregateMilestone({
    criteria: criteria.map((c) => ({ key: c.id, criterionId: c.id, label: c.name })),
    current, previous,
    attendance: { attended: t.present + t.late + t.makeup, total: t.total, absent: t.absent, excused: t.excused, makeup: t.makeup },
    period: { fromSeq: period.fromSeq, toSeq: period.toSeq },
  });
}

export async function classReportCards(ctx: ProtectedContext, classId: string) {
  const c = await loadClass(ctx, classId);
  requirePermission(ctx, "report_card:read", { centerId: c.centerId, ownerIds: [c.leadTeacherId ?? "", c.assistantTeacherId ?? ""].filter(Boolean) });
  const milestones = await classMilestones(ctx.db, c);
  const today = todayISO();
  const [ss, roster, cards, criteria] = await Promise.all([
    ctx.db.select({ id: sessions.id, seq: sessions.sequenceNo, date: sessions.date, status: sessions.status }).from(sessions).where(and(eq(sessions.classId, classId), inArray(sessions.sequenceNo, milestones))),
    ctx.db.select({ enrollmentId: enrollments.id, studentId: students.id, fullName: students.fullName, code: students.code, status: enrollments.status, startSequenceNo: enrollments.startSequenceNo })
      .from(enrollments).innerJoin(students, eq(students.id, enrollments.studentId))
      .where(and(eq(enrollments.classId, classId), inArray(enrollments.status, ["active", "trial", "paused", "completed"]))).orderBy(asc(students.fullName)),
    ctx.db.select({ id: reportCards.id, enrollmentId: reportCards.enrollmentId, seq: reportCards.milestoneSeq, status: reportCards.status, averageScore: reportCards.averageScore })
      .from(reportCards).innerJoin(enrollments, eq(enrollments.id, reportCards.enrollmentId)).where(eq(enrollments.classId, classId)),
    ctx.db.select({ id: competencyCriteria.id }).from(competencyCriteria).where(and(eq(competencyCriteria.courseId, c.courseId), eq(competencyCriteria.isActive, true))),
  ]);
  const sessionBySeq = new Map(ss.map((s) => [s.seq, s]));
  return {
    class: c,
    criteriaCount: criteria.length,
    milestones: milestones.map((seq) => {
      const s = sessionBySeq.get(seq);
      return { seq, label: milestoneLabel(seq), sessionId: s?.id ?? null, date: s?.date ?? null, reached: !!s && (s.status === "completed" || s.date <= today) };
    }),
    rows: roster.map((r) => ({
      ...r,
      cells: milestones.map((seq) => {
        const card = cards.find((x) => x.enrollmentId === r.enrollmentId && x.seq === seq);
        const s = sessionBySeq.get(seq);
        const reached = !!s && (s.status === "completed" || s.date <= today);
        const applicable = seq >= r.startSequenceNo;
        const due = applicable && reached && (!card || card.status === "draft" || card.status === "returned");
        return { seq, cardId: card?.id ?? null, status: (card?.status ?? null) as ReportCardStatus | null, averageScore: card?.averageScore ?? null, applicable, reached, due };
      }),
    })),
  };
}

/** Điều kiện của "học bạ mốc chưa viết" — dùng chung cho danh sách và cho phép đếm */
function dueReportCardConds(ctx: ProtectedContext, today: string) {
  const visible = visibleCenterIds(ctx.actor);
  return and(
    lte(sessions.date, today),
    sql`${sessions.status} not in ('cancelled','rescheduled')`,
    visible === null ? sql`true` : visible.length ? inArray(classes.centerId, visible) : sql`false`,
    sql`not exists (select 1 from ${reportCards} rc where rc.enrollment_id = ${enrollments.id} and rc.milestone_seq = ${sessions.sequenceNo} and rc.status in ('submitted','approved','published'))`,
  );
}

/** Học bạ quá hạn chưa viết/chưa gửi (cho dashboard) */
export async function dueReportCards(ctx: ProtectedContext, input: { limit?: number } = {}) {
  requirePermission(ctx, "report_card:read", {});
  const today = todayISO();
  const rows = await ctx.db
    .select({ enrollmentId: enrollments.id, studentName: students.fullName, classId: classes.id, classCode: classes.code, seq: sessions.sequenceNo, date: sessions.date })
    .from(sessions)
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .innerJoin(lessons, and(eq(lessons.id, sessions.lessonId), eq(lessons.isReportCardMilestone, true)))
    .innerJoin(enrollments, and(eq(enrollments.classId, classes.id), inArray(enrollments.status, ["active", "trial"]), lte(enrollments.startSequenceNo, sessions.sequenceNo)))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(dueReportCardConds(ctx, today))
    .orderBy(asc(sessions.date))
    .limit(clampPageSize(input.limit, 200, 500));
  return rows;
}

/**
 * Đếm học bạ mốc chưa viết bằng `count(*)`, kèm số đã quá 3 ngày.
 *
 * Trước: hộp việc và dashboard đều gọi `dueReportCards({limit: 200 | 500})` rồi lấy `.length` —
 *        con số hiển thị BỊ CẮT ở đúng trần đó, và vẫn phải kéo về 200–500 dòng chỉ để đếm.
 * Sau:  1 truy vấn `count(*)` (không tải dòng nào) cho cả tổng lẫn số quá hạn.
 */
export async function countDueReportCards(ctx: ProtectedContext): Promise<{ total: number; overdue: number }> {
  requirePermission(ctx, "report_card:read", {});
  const today = todayISO();
  const cutoff = addDaysISO(today, -3);
  const [r] = await ctx.db
    .select({
      total: sql<number>`count(*)::int`,
      overdue: sql<number>`count(*) filter (where ${sessions.date} < ${cutoff})::int`,
    })
    .from(sessions)
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .innerJoin(lessons, and(eq(lessons.id, sessions.lessonId), eq(lessons.isReportCardMilestone, true)))
    .innerJoin(enrollments, and(eq(enrollments.classId, classes.id), inArray(enrollments.status, ["active", "trial"]), lte(enrollments.startSequenceNo, sessions.sequenceNo)))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(dueReportCardConds(ctx, today));
  return { total: r?.total ?? 0, overdue: r?.overdue ?? 0 };
}

export async function getReportCard(ctx: ProtectedContext, input: { enrollmentId: string; milestoneSeq: number }) {
  const [e] = await ctx.db
    .select({ id: enrollments.id, status: enrollments.status, studentId: students.id, studentName: students.fullName, studentCode: students.code, classId: classes.id })
    .from(enrollments).innerJoin(students, eq(students.id, enrollments.studentId)).innerJoin(classes, eq(classes.id, enrollments.classId))
    .where(eq(enrollments.id, input.enrollmentId)).limit(1);
  if (!e) throw new TRPCError({ code: "NOT_FOUND" });
  const c = await loadClass(ctx, e.classId);
  requirePermission(ctx, "report_card:read", { centerId: c.centerId, ownerIds: [c.leadTeacherId ?? "", c.assistantTeacherId ?? ""].filter(Boolean) });
  const criteria = await ctx.db.select().from(competencyCriteria).where(eq(competencyCriteria.courseId, c.courseId)).orderBy(asc(competencyCriteria.sortOrder));
  const card = await ctx.db.query.reportCards.findFirst({ where: and(eq(reportCards.enrollmentId, e.id), eq(reportCards.milestoneSeq, input.milestoneSeq)) });
  const scores = card ? await ctx.db.select().from(reportCardScores).where(eq(reportCardScores.reportCardId, card.id)) : [];
  const attRows = (await ctx.db.execute(sql`
    select count(*)::int as total, count(*) filter (where a.status in ('present','late','makeup'))::int as attended
    from attendance a join sessions s on s.id = a.session_id
    where a.enrollment_id = ${e.id} and s.sequence_no <= ${input.milestoneSeq}`)) as unknown as { total: number; attended: number }[];
  const att = attRows[0];
  const author = card?.authorId ? await ctx.db.query.users.findFirst({ where: eq(users.id, card.authorId), columns: { fullName: true } }) : null;
  // Học bạ tạo sau khi có phiếu buổi chấm theo rubric 4 mức; học bạ cũ giữ thang 5
  const scale = card ? card.rubricScale : RUBRIC_SCALE;
  const aggregate = await milestoneAggregateFor(ctx.db, { enrollmentId: e.id, classId: c.id, courseId: c.courseId, curriculumId: c.curriculumId, totalSessions: c.totalSessions, milestoneSeq: input.milestoneSeq });
  const prefill: Record<string, number> = {};
  if (scale === RUBRIC_SCALE) for (const x of aggregate.criteria) if (x.suggested != null) prefill[x.key] = x.suggested;
  return {
    enrollment: e,
    class: c,
    milestoneSeq: input.milestoneSeq,
    label: milestoneLabel(input.milestoneSeq),
    criteria: criteria.filter((x) => x.isActive || scores.some((s) => s.criterionId === x.id)),
    card: card ?? null,
    authorName: author?.fullName ?? null,
    scores,
    attendance: { total: att?.total ?? 0, attended: att?.attended ?? 0 },
    scale,
    /** Số liệu tổng hợp trực tiếp từ phiếu buổi đã phát hành (điền sẵn khi mở học bạ) */
    aggregate,
    /** Bản chụp số liệu lúc lưu học bạ gần nhất */
    savedAggregate: card && isMilestoneAggregate(card.aggregate) ? card.aggregate : null,
    /** Điểm gợi ý theo tiêu chí (chỉ khi thang 4 — cùng thang với phiếu buổi) */
    prefill,
    suggestedComment: aggregate.sessions > 0 ? suggestMilestoneComment(aggregate, e.studentName) : null,
  };
}

type SaveInput = { enrollmentId: string; milestoneSeq: number; scores: { criterionId: string; score: number | null; comment?: string | null }[]; teacherComment?: string | null; strengths?: string | null; improvements?: string | null; submit?: boolean };

/** GV/giáo vụ lưu nháp hoặc gửi duyệt */
export async function saveReportCard(ctx: ProtectedContext, input: SaveInput) {
  const d = await getReportCard(ctx, input);
  requirePermission(ctx, "report_card:write", { centerId: d.class.centerId, ownerIds: [d.class.leadTeacherId ?? "", d.class.assistantTeacherId ?? ""].filter(Boolean) });
  const from: ReportCardStatus = d.card?.status ?? "draft";
  const to = reportCardTransition(from, input.submit ? "submit" : "save");
  const active = d.criteria.filter((c) => c.isActive).map((c) => c.id);
  if (input.submit) {
    if (active.length === 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Khoá chưa cấu hình tiêu chí năng lực" });
    const errs = validateReportCard({ scores: input.scores, activeCriteria: active, comment: input.teacherComment ?? null, scale: d.scale });
    if (errs.length) throw new TRPCError({ code: "BAD_REQUEST", message: errs.join("; ") });
  }
  const valid = new Set(d.criteria.map((c) => c.id));
  const scores = input.scores.filter((s) => valid.has(s.criterionId));
  if (scores.some((s) => s.score !== null && (s.score < 1 || s.score > d.scale))) throw new TRPCError({ code: "BAD_REQUEST", message: `Điểm từ 1 đến ${d.scale}` });
  const avg = averageScore(scores.map((s) => s.score));
  const sessionRow = await ctx.db.query.sessions.findFirst({ where: and(eq(sessions.classId, d.class.id), eq(sessions.sequenceNo, input.milestoneSeq)), columns: { id: true } });

  return ctx.db.transaction(async (tx) => {
    const values = {
      teacherComment: input.teacherComment ?? null, strengths: input.strengths ?? null, improvements: input.improvements ?? null,
      averageScore: avg === null ? null : String(avg), status: to, authorId: ctx.user.id,
      // Chụp số liệu tổng hợp từ phiếu buổi cùng lần lưu — học bạ đã gửi PH không đổi khi phiếu buổi thay đổi
      ...(d.scale === RUBRIC_SCALE ? { aggregate: d.aggregate } : {}),
      ...(input.submit ? { submittedAt: new Date(), returnReason: null } : {}), updatedAt: new Date(),
    };
    const [card] = d.card
      ? await tx.update(reportCards).set(values).where(eq(reportCards.id, d.card.id)).returning()
      : await tx.insert(reportCards).values({ enrollmentId: input.enrollmentId, milestoneSeq: input.milestoneSeq, sessionId: sessionRow?.id ?? null, rubricScale: d.scale, ...values }).returning();
    await tx.delete(reportCardScores).where(eq(reportCardScores.reportCardId, card!.id));
    if (scores.length) await tx.insert(reportCardScores).values(scores.map((s) => ({ reportCardId: card!.id, criterionId: s.criterionId, score: s.score, comment: s.comment ?? null })));
    if (input.submit) await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "report_cards", entity: "report_cards", entityId: card!.id, before: { status: from }, after: { status: to, average: avg, scale: d.scale }, ip: ctx.ip });
    return card!;
  });
}

/** Giáo vụ duyệt / trả lại / gửi PH */
export async function reviewReportCard(ctx: ProtectedContext, input: { id: string; action: "approve" | "return" | "publish"; reason?: string }) {
  const [r] = await ctx.db
    .select({ card: reportCards, centerId: classes.centerId, studentId: enrollments.studentId, className: classes.name })
    .from(reportCards).innerJoin(enrollments, eq(enrollments.id, reportCards.enrollmentId)).innerJoin(classes, eq(classes.id, enrollments.classId))
    .where(eq(reportCards.id, input.id)).limit(1);
  if (!r) throw new TRPCError({ code: "NOT_FOUND" });
  requirePermission(ctx, "report_card:approve", { centerId: r.centerId });
  if (input.action === "return" && !input.reason?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Cần nhập lý do trả lại" });
  if ((input.action === "approve" || input.action === "publish") && r.card.authorId === ctx.user.id && !ctx.actor.assignments.some((a) => a.role === "SUPER_ADMIN")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Người viết học bạ không tự duyệt được" });
  }
  const to = reportCardTransition(r.card.status, input.action);
  await ctx.db.transaction(async (tx) => {
    await tx.update(reportCards).set({
      status: to,
      ...(input.action === "publish" ? { publishedAt: new Date() } : { reviewedBy: ctx.user.id, reviewedAt: new Date() }),
      ...(input.action === "return" ? { returnReason: input.reason! } : {}),
      updatedAt: new Date(),
    }).where(eq(reportCards.id, r.card.id));
    if (to === "published") {
      const guardians = await tx.select({ parentId: studentGuardians.parentId }).from(studentGuardians).where(eq(studentGuardians.studentId, r.studentId));
      for (const g of guardians) {
        await tx.insert(parentNotifications).values({ parentId: g.parentId, studentId: r.studentId, channel: "in_app", template: "REPORT_CARD", title: `Học bạ ${milestoneLabel(r.card.milestoneSeq)} · ${r.className}`, body: (r.card.teacherComment ?? "").slice(0, 300), link: `/parent/report-cards/${r.card.id}`, params: { reportCardId: r.card.id }, status: "sent", sentAt: new Date() });
      }
      await emit(tx as unknown as Db, { type: "report_card.published", reportCardId: r.card.id, enrollmentId: r.card.enrollmentId, studentId: r.studentId });
    }
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "report_cards", entity: "report_cards", entityId: r.card.id, before: { status: r.card.status }, after: { status: to }, reason: input.reason ?? null, ip: ctx.ip });
  });
  return { status: to };
}

/** Hàng đợi duyệt học bạ */
export async function reviewQueue(ctx: ProtectedContext) {
  requirePermission(ctx, "report_card:approve", {});
  const visible = visibleCenterIds(ctx.actor);
  return ctx.db
    .select({ id: reportCards.id, status: reportCards.status, seq: reportCards.milestoneSeq, submittedAt: reportCards.submittedAt, averageScore: reportCards.averageScore, enrollmentId: enrollments.id, studentName: students.fullName, classId: classes.id, classCode: classes.code, authorName: users.fullName })
    .from(reportCards)
    .innerJoin(enrollments, eq(enrollments.id, reportCards.enrollmentId))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .leftJoin(users, eq(users.id, reportCards.authorId))
    .where(and(inArray(reportCards.status, ["submitted", "approved"]), visible === null ? sql`true` : visible.length ? inArray(classes.centerId, visible) : sql`false`))
    .orderBy(asc(reportCards.submittedAt));
}

/** Màn "Học bạ": toàn bộ học bạ + chứng nhận của một học viên */
export async function studentReportBook(ctx: ProtectedContext, studentId: string) {
  const st = await ctx.db.query.students.findFirst({ where: eq(students.id, studentId) });
  if (!st) throw new TRPCError({ code: "NOT_FOUND" });
  requirePermission(ctx, "report_card:read", { centerId: st.homeCenterId });
  const cards = await ctx.db
    .select({ id: reportCards.id, seq: reportCards.milestoneSeq, status: reportCards.status, averageScore: reportCards.averageScore, rubricScale: reportCards.rubricScale, teacherComment: reportCards.teacherComment, strengths: reportCards.strengths, improvements: reportCards.improvements, publishedAt: reportCards.publishedAt, updatedAt: reportCards.updatedAt, enrollmentId: enrollments.id, classCode: classes.code, className: classes.name, courseCode: courses.code, authorName: users.fullName })
    .from(reportCards)
    .innerJoin(enrollments, eq(enrollments.id, reportCards.enrollmentId))
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(courses, eq(courses.id, classes.courseId))
    .leftJoin(users, eq(users.id, reportCards.authorId))
    .where(eq(enrollments.studentId, studentId))
    .orderBy(desc(reportCards.milestoneSeq));
  const ids = cards.map((c) => c.id);
  const scores = ids.length
    ? await ctx.db.select({ reportCardId: reportCardScores.reportCardId, score: reportCardScores.score, comment: reportCardScores.comment, name: competencyCriteria.name, sortOrder: competencyCriteria.sortOrder })
        .from(reportCardScores).innerJoin(competencyCriteria, eq(competencyCriteria.id, reportCardScores.criterionId))
        .where(inArray(reportCardScores.reportCardId, ids)).orderBy(asc(competencyCriteria.sortOrder))
    : [];
  const completions = await ctx.db
    .select({ id: courseCompletions.id, grade: courseCompletions.grade, certificateNo: courseCompletions.certificateNo, issuedAt: courseCompletions.issuedAt, courseCode: courses.code, courseName: courses.name })
    .from(courseCompletions).innerJoin(enrollments, eq(enrollments.id, courseCompletions.enrollmentId)).innerJoin(courses, eq(courses.id, courseCompletions.courseId))
    .where(and(eq(enrollments.studentId, studentId), eq(courseCompletions.status, "approved"), isNull(courseCompletions.revokedAt)));
  return {
    student: { id: st.id, fullName: st.fullName, code: st.code, grade: st.grade },
    cards: cards.map((c) => ({ ...c, label: milestoneLabel(c.seq), scores: scores.filter((s) => s.reportCardId === c.id) })),
    completions,
  };
}

/* ------------------------------------------------------------------ */
/* Hoàn thành khoá & chứng nhận                                         */
/* ------------------------------------------------------------------ */

/** Ghi danh + khoá + cơ sở, dùng chung cho đề xuất và duyệt hoàn thành khoá */
async function loadCompletionTarget(ctx: ProtectedContext, enrollmentId: string) {
  const [e] = await ctx.db
    .select({
      id: enrollments.id, status: enrollments.status, packageSessions: enrollments.packageSessions, studentId: enrollments.studentId, consumed: consumedSql,
      classId: classes.id, centerId: classes.centerId, courseId: classes.courseId, courseCode: courses.code, nextCourseId: courses.nextCourseId,
      leadTeacherId: classes.leadTeacherId, assistantTeacherId: classes.assistantTeacherId,
    })
    .from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).innerJoin(courses, eq(courses.id, classes.courseId))
    .where(eq(enrollments.id, enrollmentId)).limit(1);
  if (!e) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy đăng ký" });
  return { ...e, ownerIds: [e.leadTeacherId ?? "", e.assistantTeacherId ?? ""].filter(Boolean) };
}

/** Điểm trung bình tiêu chí từ các học bạ đã duyệt / đã gửi PH */
async function completionAverage(ctx: ProtectedContext, enrollmentId: string): Promise<string | null> {
  const rows = (await ctx.db.execute(sql`
    select round(avg(${SCORE_TO5_SQL})::numeric, 1)::text as v from report_card_scores s join report_cards rc on rc.id = s.report_card_id
    where rc.enrollment_id = ${enrollmentId} and rc.status in ('approved','published')`)) as unknown as { v: string | null }[];
  return rows[0]?.v ?? null;
}

/**
 * Cấp chứng nhận (một giao dịch): sinh số chứng nhận liên tục, đóng ghi danh,
 * chuyển HV sang cựu HV nếu hết lớp, phát sự kiện tư vấn tái tục.
 * `existingId` có giá trị = duyệt một đề xuất đang chờ; không có = hoàn thành trực tiếp.
 */
async function issueCompletion(
  ctx: ProtectedContext,
  e: Awaited<ReturnType<typeof loadCompletionTarget>>,
  input: { grade: string; teacherEvaluation: string; existingId?: string; proposedBy?: string | null; proposedAt?: Date | null },
) {
  const avg = await completionAverage(ctx, e.id);
  return ctx.db.transaction(async (tx) => {
    const year = new Date().getFullYear();
    const prefix = `SR-${e.courseCode.toUpperCase()}-${String(year).slice(-2)}-`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${prefix}))`);
    const [mx] = await tx.select({ m: sql<string | null>`max(${courseCompletions.certificateNo})` }).from(courseCompletions).where(sql`${courseCompletions.certificateNo} like ${prefix + "%"}`);
    const certNo = certificateNumber(e.courseCode, year, mx?.m ? Number(mx.m.slice(prefix.length)) + 1 : 1);
    const now = new Date();
    const to = enrollmentTransition(e.status, "complete");
    await tx.update(enrollments).set({ status: to, endedAt: now, endReason: "Hoàn thành khoá", updatedAt: now }).where(eq(enrollments.id, e.id));
    const values = {
      status: "approved" as const, grade: input.grade.trim(), teacherEvaluation: input.teacherEvaluation.trim(), averageScore: avg,
      certificateNo: certNo, nextCourseId: e.nextCourseId, decidedBy: ctx.user.id, decidedAt: now, rejectReason: null,
      issuedAt: now, issuedBy: ctx.user.id, updatedAt: now,
    };
    if (input.existingId) {
      await tx.update(courseCompletions).set(values).where(eq(courseCompletions.id, input.existingId));
    } else {
      await tx.insert(courseCompletions).values({
        enrollmentId: e.id, courseId: e.courseId, ...values,
        proposedBy: input.proposedBy ?? ctx.user.id, proposedAt: input.proposedAt ?? now,
      });
    }
    const others = await tx.select({ s: enrollments.status }).from(enrollments).where(and(eq(enrollments.studentId, e.studentId), inArray(enrollments.status, ["active", "trial", "paused"])));
    if (others.length === 0) await tx.update(students).set({ status: "alumni" }).where(eq(students.id, e.studentId));
    await emit(tx as unknown as Db, { type: "course.completed", enrollmentId: e.id, studentId: e.studentId, courseId: e.courseId, nextCourseId: e.nextCourseId });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "enrollments", entity: "course_completions", entityId: input.existingId ?? e.id, before: input.existingId ? { status: "proposed" } : undefined, after: { status: "approved", certificateNo: certNo, grade: input.grade }, ip: ctx.ip });
    return certNo;
  });
}

export async function completionCandidates(ctx: ProtectedContext, classId: string) {
  const c = await loadClass(ctx, classId);
  const ownerIds = [c.leadTeacherId ?? "", c.assistantTeacherId ?? ""].filter(Boolean);
  // Giáo vụ / quản lý vào bằng enrollment:read; giáo viên vào lớp mình bằng completion:read_own
  if (!authorize(ctx.actor, "enrollment:read", { centerId: c.centerId }).allowed) requirePermission(ctx, "completion:read", { centerId: c.centerId, ownerIds });
  const canApprove = authorize(ctx.actor, "completion:approve", { centerId: c.centerId }).allowed;
  const canPropose = canApprove || authorize(ctx.actor, "completion:propose", { centerId: c.centerId, ownerIds }).allowed;
  const rows = await ctx.db
    .select({
      enrollmentId: enrollments.id, status: enrollments.status, packageSessions: enrollments.packageSessions, consumed: consumedSql,
      studentId: students.id, fullName: students.fullName, code: students.code,
      // Thang 5 chung: học bạ mới (thang 4) được quy đổi trước khi lấy trung bình để xếp loại cuối khoá
      avg: sql<string | null>`(select round(avg(${SCORE_TO5_SQL})::numeric, 1)::text from ${reportCardScores} s join ${reportCards} rc on rc.id = s.report_card_id where rc.enrollment_id = ${enrollments.id} and rc.status in ('approved','published'))`,
      completed: sql<boolean>`exists (select 1 from ${courseCompletions} cc where cc.enrollment_id = ${enrollments.id} and cc.status = 'approved' and cc.revoked_at is null)`,
      proposed: sql<boolean>`exists (select 1 from ${courseCompletions} cc where cc.enrollment_id = ${enrollments.id} and cc.status = 'proposed')`,
    })
    .from(enrollments).innerJoin(students, eq(students.id, enrollments.studentId))
    .where(and(eq(enrollments.classId, classId), inArray(enrollments.status, ["active", "completed"])))
    .orderBy(asc(students.fullName));
  return {
    class: c,
    canApprove,
    canPropose,
    items: rows.map((r) => {
      const avg = r.avg === null ? null : Number(r.avg);
      const check = completionCheck(r);
      return { ...r, avg, suggestedGrade: gradeFromAverage(avg), ...check };
    }),
  };
}

/** Kiểm tra chung cho cả đề xuất và hoàn thành trực tiếp */
async function assertCompletable(ctx: ProtectedContext, e: Awaited<ReturnType<typeof loadCompletionTarget>>, it: { grade: string; teacherEvaluation: string }) {
  const chk = completionCheck(e);
  if (!chk.ok) throw new TRPCError({ code: "PRECONDITION_FAILED", message: chk.errors.join("; ") });
  const errs = validateCompletionInput(it);
  if (errs.length) throw new TRPCError({ code: "BAD_REQUEST", message: errs.join("; ") });
  const existing = await ctx.db.query.courseCompletions.findFirst({ where: and(eq(courseCompletions.enrollmentId, e.id), sql`${courseCompletions.status} <> 'rejected'`) });
  if (existing) throw new TRPCError({ code: "CONFLICT", message: existing.status === "proposed" ? "Đã có đề xuất chờ duyệt cho học viên này" : "Học viên đã có chứng nhận" });
  return chk;
}

/**
 * Giáo viên tạo ĐỀ XUẤT hoàn thành khoá: chưa sinh chứng nhận, ghi danh chưa đóng.
 * Người có quyền duyệt dùng `completeCourse` để hoàn thành thẳng.
 */
export async function proposeCompletion(ctx: ProtectedContext, input: { items: { enrollmentId: string; grade: string; teacherEvaluation: string }[] }) {
  const results: { enrollmentId: string; ok: boolean; message: string }[] = [];
  for (const it of input.items) {
    try {
      const e = await loadCompletionTarget(ctx, it.enrollmentId);
      requirePermission(ctx, "completion:propose", { centerId: e.centerId, ownerIds: e.ownerIds });
      const chk = await assertCompletable(ctx, e, it);
      const avg = await completionAverage(ctx, e.id);
      await ctx.db.transaction(async (tx) => {
        const [row] = await tx.insert(courseCompletions).values({
          enrollmentId: e.id, courseId: e.courseId, status: "proposed", grade: it.grade.trim(), teacherEvaluation: it.teacherEvaluation.trim(),
          averageScore: avg, nextCourseId: e.nextCourseId, proposedBy: ctx.user.id, proposedAt: new Date(),
        }).returning();
        await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "enrollments", entity: "course_completions", entityId: row!.id, after: { status: "proposed", grade: it.grade, enrollmentId: e.id }, ip: ctx.ip });
      });
      results.push({ enrollmentId: it.enrollmentId, ok: true, message: chk.warnings.length ? `Đã gửi đề xuất (${chk.warnings.join("; ")})` : "Đã gửi đề xuất chờ duyệt" });
    } catch (err) {
      results.push({ enrollmentId: it.enrollmentId, ok: false, message: (err as Error).message });
    }
  }
  return { results, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
}

/**
 * Đề xuất hoàn thành khoá đang chờ duyệt (trong phạm vi cơ sở của người dùng).
 * Trước: KHÔNG có `limit` — nối 6 bảng và kéo về mọi đề xuất đang chờ của toàn chuỗi.
 * Sau:  trần cứng 300 dòng (mặc định), chỉnh được qua `limit`.
 */
export async function pendingCompletions(ctx: ProtectedContext, input: { limit?: number } = {}) {
  requirePermission(ctx, "completion:approve", {});
  const visible = visibleCenterIds(ctx.actor);
  const rows = await ctx.db
    .select({
      id: courseCompletions.id, grade: courseCompletions.grade, teacherEvaluation: courseCompletions.teacherEvaluation, averageScore: courseCompletions.averageScore,
      proposedAt: courseCompletions.proposedAt, proposedByName: users.fullName,
      enrollmentId: enrollments.id, enrollmentStatus: enrollments.status, packageSessions: enrollments.packageSessions, consumed: consumedSql,
      studentId: students.id, studentName: students.fullName, studentCode: students.code,
      classId: classes.id, classCode: classes.code, className: classes.name, centerId: classes.centerId, centerCode: centers.code, courseCode: courses.code,
    })
    .from(courseCompletions)
    .innerJoin(enrollments, eq(enrollments.id, courseCompletions.enrollmentId))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(centers, eq(centers.id, classes.centerId))
    .innerJoin(courses, eq(courses.id, courseCompletions.courseId))
    .leftJoin(users, eq(users.id, courseCompletions.proposedBy))
    .where(and(eq(courseCompletions.status, "proposed"), visible === null ? sql`true` : visible.length ? inArray(classes.centerId, visible) : sql`false`))
    .orderBy(asc(courseCompletions.proposedAt))
    .limit(clampPageSize(input.limit, 300, 500));
  return rows.filter((r) => authorize(ctx.actor, "completion:approve", { centerId: r.centerId }).allowed);
}

/** Duyệt (sinh chứng nhận) hoặc Từ chối (bắt buộc lý do) một đề xuất hoàn thành khoá */
export async function decideCompletion(ctx: ProtectedContext, input: { id: string; action: "approve" | "reject"; reason?: string }) {
  const [row] = await ctx.db
    .select({ c: courseCompletions, centerId: classes.centerId })
    .from(courseCompletions).innerJoin(enrollments, eq(enrollments.id, courseCompletions.enrollmentId)).innerJoin(classes, eq(classes.id, enrollments.classId))
    .where(eq(courseCompletions.id, input.id)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy đề xuất" });
  requirePermission(ctx, "completion:approve", { centerId: row.centerId });
  if (input.action === "reject" && !input.reason?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Cần nhập lý do từ chối" });
  const to: CompletionStatus = completionTransition(row.c.status, input.action);

  if (to === "rejected") {
    await ctx.db.transaction(async (tx) => {
      await tx.update(courseCompletions).set({ status: to, decidedBy: ctx.user.id, decidedAt: new Date(), rejectReason: input.reason!.trim(), updatedAt: new Date() }).where(eq(courseCompletions.id, row.c.id));
      await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "TRANSITION", module: "enrollments", entity: "course_completions", entityId: row.c.id, before: { status: "proposed" }, after: { status: to }, reason: input.reason!.trim(), ip: ctx.ip });
    });
    return { status: to, certificateNo: null };
  }

  const e = await loadCompletionTarget(ctx, row.c.enrollmentId);
  const chk = completionCheck(e);
  if (!chk.ok) throw new TRPCError({ code: "PRECONDITION_FAILED", message: chk.errors.join("; ") });
  const certNo = await issueCompletion(ctx, e, {
    grade: row.c.grade, teacherEvaluation: row.c.teacherEvaluation, existingId: row.c.id,
    proposedBy: row.c.proposedBy, proposedAt: row.c.proposedAt,
  });
  return { status: to, certificateNo: certNo };
}

/** Người có quyền duyệt hoàn thành khoá cho nhiều học viên một lần (cấp chứng nhận ngay) */
export async function completeCourse(ctx: ProtectedContext, input: { items: { enrollmentId: string; grade: string; teacherEvaluation: string }[] }) {
  const results: { enrollmentId: string; ok: boolean; message: string; certificateNo?: string }[] = [];
  for (const it of input.items) {
    try {
      const e = await loadCompletionTarget(ctx, it.enrollmentId);
      requirePermission(ctx, "completion:approve", { centerId: e.centerId });
      const chk = await assertCompletable(ctx, e, it);
      const cert = await issueCompletion(ctx, e, it);
      results.push({ enrollmentId: it.enrollmentId, ok: true, message: chk.warnings.length ? `Đã cấp (${chk.warnings.join("; ")})` : "Đã cấp chứng nhận", certificateNo: cert });
    } catch (err) {
      results.push({ enrollmentId: it.enrollmentId, ok: false, message: (err as Error).message });
    }
  }
  return { results, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
}

export async function listCompletions(ctx: ProtectedContext, input: { centerId?: string; limit?: number }) {
  requirePermission(ctx, "enrollment:read", { centerId: input.centerId ?? null });
  const visible = visibleCenterIds(ctx.actor);
  const next = sql<string | null>`(select code from ${courses} n where n.id = ${courseCompletions.nextCourseId})`;
  return ctx.db
    .select({ id: courseCompletions.id, grade: courseCompletions.grade, certificateNo: courseCompletions.certificateNo, issuedAt: courseCompletions.issuedAt, averageScore: courseCompletions.averageScore, studentId: students.id, studentName: students.fullName, studentCode: students.code, courseCode: courses.code, classCode: classes.code, centerCode: centers.code, nextCourseCode: next })
    .from(courseCompletions)
    .innerJoin(enrollments, eq(enrollments.id, courseCompletions.enrollmentId))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(centers, eq(centers.id, classes.centerId))
    .innerJoin(courses, eq(courses.id, courseCompletions.courseId))
    .where(and(eq(courseCompletions.status, "approved"), isNull(courseCompletions.revokedAt), input.centerId ? eq(classes.centerId, input.centerId) : sql`true`, visible === null ? sql`true` : visible.length ? inArray(classes.centerId, visible) : sql`false`))
    .orderBy(desc(courseCompletions.issuedAt))
    .limit(input.limit ?? 200);
}

export async function getCertificate(ctx: ProtectedContext, id: string) {
  const [r] = await ctx.db
    .select({ id: courseCompletions.id, status: courseCompletions.status, grade: courseCompletions.grade, certificateNo: courseCompletions.certificateNo, issuedAt: courseCompletions.issuedAt, teacherEvaluation: courseCompletions.teacherEvaluation, revokedAt: courseCompletions.revokedAt, studentName: students.fullName, studentCode: students.code, dateOfBirth: students.dateOfBirth, courseName: courses.name, courseCode: courses.code, totalSessions: courses.totalSessions, centerName: centers.name, centerId: centers.id })
    .from(courseCompletions)
    .innerJoin(enrollments, eq(enrollments.id, courseCompletions.enrollmentId))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(centers, eq(centers.id, classes.centerId))
    .innerJoin(courses, eq(courses.id, courseCompletions.courseId))
    .where(eq(courseCompletions.id, id)).limit(1);
  if (!r) throw new TRPCError({ code: "NOT_FOUND" });
  requirePermission(ctx, "enrollment:read", { centerId: r.centerId });
  if (r.status !== "approved" || !r.certificateNo) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Đề xuất hoàn thành khoá chưa được duyệt — chưa có chứng nhận" });
  return { ...r, certificateNo: r.certificateNo };
}
