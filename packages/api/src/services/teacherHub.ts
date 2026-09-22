/**
 * APP GIÁO VIÊN `/teacher` — "xong việc trong 5 phút sau giờ dạy" (docs/PHIA-NGUOI-DUNG.md):
 *  - phản hồi mới của phụ huynh (cảm xúc sau buổi) cho buổi mình dạy;
 *  - màn "Chuẩn bị buổi dạy": bài, mục tiêu, học cụ, tiêu chí trọng tâm + mô tả mức, tài liệu của bài, học viên cần lưu ý;
 *  - phần bổ sung của màn buổi dạy: phản hồi PH của buổi, sĩ số + đồng ý đăng ảnh để chụp & gắn ảnh nhanh;
 *  - "Lớp của tôi": tiến độ, học viên có nguy cơ, học bạ mốc sắp đến hạn.
 *
 * Phân quyền: buổi nạp qua `loadSessionForAuth` (assertTenant) rồi `session:read` theo chủ sở hữu (GV có `_own`);
 * sức khoẻ học viên cần `student:read` (GV: `student:read_own` với lớp mình); tài liệu cần `document:read`;
 * danh sách luôn kèm `tenantCond`. Toàn bộ là đọc — không ghi, không cần audit.
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import {
  parentFeedback, students, sessions, classes, courses, enrollments, attendance, sessionEvaluations, reportCards, documents, sessionMedia,
  studentGuardians, parents,
} from "@satarobo/db";
import {
  authorize, addDays, sessionLabel, reactionOf, reactionCounts, SESSION_REACTION_VI, prepNotes, studentRisk, milestonesDue, reportCardMilestones,
  isSessionEvalSnapshot, sessionAverage, completionPercent, DOC_KIND_VI, DOC_CATEGORY_VI,
  type SessionKind, type SessionReaction, type DocKind, type DocCategory,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { tenantCond } from "./tenantScope";
import { loadSessionForAuth, todayISO } from "./sessions";
import { sessionEvaluationBoard } from "./sessionEvaluations";
import { listClasses } from "./classes";

type Db = ProtectedContext["db"];
const ABSENT = ["absent_excused", "absent_unexcused"];

/* ------------------------------------------------------------------ */
/* Phản hồi mới của phụ huynh                                           */
/* ------------------------------------------------------------------ */

export async function teacherFeedbackFeed(ctx: ProtectedContext, teacherId: string, input: { days?: number; limit?: number } = {}) {
  const days = Math.min(60, Math.max(1, input.days ?? 14));
  const limit = Math.min(50, Math.max(1, input.limit ?? 12));
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await ctx.db
    .select({
      id: parentFeedback.id, reaction: parentFeedback.reaction, rating: parentFeedback.rating, comment: parentFeedback.comment, status: parentFeedback.status,
      createdAt: parentFeedback.createdAt, sessionId: sessions.id, date: sessions.date, seq: sessions.sequenceNo, kind: sessions.kind, originalSeq: sessions.originalSequenceNo,
      studentName: students.fullName, classCode: classes.code,
    })
    .from(parentFeedback)
    .innerJoin(sessions, eq(sessions.id, parentFeedback.sessionId))
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .innerJoin(students, eq(students.id, parentFeedback.studentId))
    .where(and(
      isNotNull(parentFeedback.reaction),
      or(eq(parentFeedback.teacherId, teacherId), eq(sessions.teacherId, teacherId))!,
      gte(parentFeedback.createdAt, since),
      tenantCond(ctx, classes),
    ))
    .orderBy(desc(parentFeedback.createdAt))
    .limit(limit);
  const items = rows.map((r) => {
    const reaction = reactionOf({ reaction: r.reaction, rating: r.rating });
    return {
      id: r.id, reaction, emoji: SESSION_REACTION_VI[reaction].emoji, reactionLabel: SESSION_REACTION_VI[reaction].label,
      note: r.comment, handled: r.status === "resolved", createdAt: r.createdAt, sessionId: r.sessionId, date: r.date,
      label: sessionLabel(r.seq, r.kind as SessionKind, r.originalSeq), studentName: r.studentName, classCode: r.classCode,
      fresh: Date.now() - r.createdAt.getTime() < 3 * 86_400_000,
    };
  });
  return { days, items, counts: reactionCounts(items) };
}

/* ------------------------------------------------------------------ */
/* Bổ sung cho màn buổi dạy: phản hồi PH + sĩ số chụp ảnh                */
/* ------------------------------------------------------------------ */

async function consentByStudent(db: Db, studentIds: string[]) {
  if (!studentIds.length) return new Map<string, boolean>();
  const rows = await db
    .select({ studentId: studentGuardians.studentId, consent: sql<boolean>`bool_or(${parents.mediaConsent})` })
    .from(studentGuardians).innerJoin(parents, eq(parents.id, studentGuardians.parentId))
    .where(inArray(studentGuardians.studentId, studentIds)).groupBy(studentGuardians.studentId);
  return new Map(rows.map((r) => [r.studentId, !!r.consent]));
}

export async function sessionExtras(ctx: ProtectedContext, sessionId: string) {
  const s = await loadSessionForAuth(ctx, sessionId);
  requirePermission(ctx, "session:read", { centerId: s.centerId, ownerIds: s.ownerIds });
  const canPhoto = authorize(ctx.actor, "media:write", { centerId: s.centerId, ownerIds: s.ownerIds }).allowed;
  const [reactions, roster, media] = await Promise.all([
    ctx.db
      .select({ id: parentFeedback.id, studentId: parentFeedback.studentId, reaction: parentFeedback.reaction, rating: parentFeedback.rating, comment: parentFeedback.comment, status: parentFeedback.status, createdAt: parentFeedback.createdAt, studentName: students.fullName })
      .from(parentFeedback).innerJoin(students, eq(students.id, parentFeedback.studentId))
      .where(and(eq(parentFeedback.sessionId, s.session.id), isNotNull(parentFeedback.reaction)))
      .orderBy(desc(parentFeedback.createdAt)),
    ctx.db
      .select({ studentId: students.id, fullName: students.fullName, nickname: students.nickname, enrollmentId: enrollments.id })
      .from(enrollments).innerJoin(students, eq(students.id, enrollments.studentId))
      .where(and(eq(enrollments.classId, s.session.classId), inArray(enrollments.status, ["active", "trial"]), lte(enrollments.startSequenceNo, s.session.sequenceNo)))
      .orderBy(asc(students.fullName)),
    ctx.db
      .select({ status: sessionMedia.status, n: sql<number>`count(*)::int` })
      .from(sessionMedia).where(eq(sessionMedia.sessionId, s.session.id)).groupBy(sessionMedia.status),
  ]);
  const consent = canPhoto ? await consentByStudent(ctx.db, roster.map((r) => r.studentId)) : new Map<string, boolean>();
  const count = (st: string) => media.find((m) => m.status === st)?.n ?? 0;
  return {
    sessionId: s.session.id,
    reactions: reactions.map((r) => {
      const reaction: SessionReaction = reactionOf({ reaction: r.reaction, rating: r.rating });
      return { id: r.id, studentId: r.studentId, studentName: r.studentName, reaction, emoji: SESSION_REACTION_VI[reaction].emoji, reactionLabel: SESSION_REACTION_VI[reaction].label, note: r.comment, handled: r.status === "resolved", createdAt: r.createdAt };
    }),
    photo: {
      allowed: canPhoto,
      roster: canPhoto ? roster.map((r) => ({ studentId: r.studentId, fullName: r.fullName, nickname: r.nickname, consent: consent.get(r.studentId) === true })) : [],
      counts: { library: count("library"), pending: count("pending"), approved: count("approved"), rejected: count("rejected") },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Chuẩn bị buổi dạy                                                    */
/* ------------------------------------------------------------------ */

export async function sessionPrep(ctx: ProtectedContext, sessionId: string) {
  const s = await loadSessionForAuth(ctx, sessionId);
  requirePermission(ctx, "session:read", { centerId: s.centerId, ownerIds: s.ownerIds });
  const auth = { centerId: s.centerId, ownerIds: s.ownerIds };
  const canHealth = authorize(ctx.actor, "student:read", auth).allowed;
  const canDocs = authorize(ctx.actor, "document:read", auth).allowed;
  const today = todayISO();

  const [cls] = await ctx.db.select({ courseId: classes.courseId, courseName: courses.name, centerId: classes.centerId }).from(classes).innerJoin(courses, eq(courses.id, classes.courseId)).where(eq(classes.id, s.session.classId)).limit(1);
  const board = await sessionEvaluationBoard(ctx, sessionId);

  const roster = await ctx.db
    .select({
      enrollmentId: enrollments.id, enrollmentStatus: enrollments.status, studentId: students.id, fullName: students.fullName, nickname: students.nickname,
      healthNotes: students.healthNotes, allergies: students.allergies,
    })
    .from(enrollments).innerJoin(students, eq(students.id, enrollments.studentId))
    .where(and(eq(enrollments.classId, s.session.classId), inArray(enrollments.status, ["active", "trial"]), lte(enrollments.startSequenceNo, s.session.sequenceNo)))
    .orderBy(asc(students.fullName));
  const enrIds = roster.map((r) => r.enrollmentId);
  const studentIds = roster.map((r) => r.studentId);

  // Buổi trước của lớp (đã diễn ra, không huỷ) — trạng thái điểm danh + nhận xét chung
  const [prev] = await ctx.db
    .select({ id: sessions.id, date: sessions.date, seq: sessions.sequenceNo, kind: sessions.kind, originalSeq: sessions.originalSequenceNo, sessionNote: sessions.sessionNote, status: sessions.status })
    .from(sessions)
    .where(and(eq(sessions.classId, s.session.classId), lt(sessions.date, s.session.date), sql`${sessions.status} not in ('cancelled','rescheduled')`))
    .orderBy(desc(sessions.date), desc(sessions.startTime)).limit(1);
  const prevAtt: { enrollmentId: string; status: string }[] = prev && enrIds.length
    ? await ctx.db.select({ enrollmentId: attendance.enrollmentId, status: attendance.status }).from(attendance).where(and(eq(attendance.sessionId, prev.id), inArray(attendance.enrollmentId, enrIds)))
    : [];
  const recentSheets: { enrollmentId: string; highlights: string[] | null; date: string }[] = enrIds.length
    ? await ctx.db.select({ enrollmentId: sessionEvaluations.enrollmentId, highlights: sessionEvaluations.highlights, date: sessions.date })
      .from(sessionEvaluations).innerJoin(sessions, eq(sessions.id, sessionEvaluations.sessionId))
      .where(and(inArray(sessionEvaluations.enrollmentId, enrIds), eq(sessionEvaluations.status, "published"), gte(sessions.date, addDays(today, -30))))
      .orderBy(desc(sessions.date)).limit(300)
    : [];
  const concerns: { studentId: string }[] = studentIds.length
    ? await ctx.db.select({ studentId: parentFeedback.studentId }).from(parentFeedback)
      .where(and(inArray(parentFeedback.studentId, studentIds), eq(parentFeedback.reaction, "concern"), ne(parentFeedback.status, "resolved"), gte(parentFeedback.createdAt, new Date(Date.now() - 14 * 86_400_000))))
    : [];
  const lessonCond = s.session.lessonId ? or(eq(documents.lessonId, s.session.lessonId), isNull(documents.lessonId))! : isNull(documents.lessonId);
  const docs: { id: string; title: string; kind: string; category: string; lessonId: string | null }[] = canDocs && cls
    ? await ctx.db.select({ id: documents.id, title: documents.title, kind: documents.kind, category: documents.category, lessonId: documents.lessonId })
      .from(documents)
      .where(and(eq(documents.courseId, cls.courseId), eq(documents.status, "published"), lessonCond))
      .orderBy(asc(documents.title)).limit(30)
    : [];
  const concernSet = new Set(concerns.map((c) => c.studentId));

  const students_ = roster.map((r) => {
    const hl = recentSheets.filter((x) => x.enrollmentId === r.enrollmentId).slice(0, 3).flatMap((x) => x.highlights ?? []);
    const notes = prepNotes({
      healthNotes: canHealth ? r.healthNotes : null,
      allergies: canHealth ? r.allergies : null,
      lastStatus: prevAtt.find((a) => a.enrollmentId === r.enrollmentId)?.status ?? null,
      parentConcern: concernSet.has(r.studentId),
      trial: r.enrollmentStatus === "trial",
      highlights: hl,
    });
    return { enrollmentId: r.enrollmentId, studentId: r.studentId, fullName: r.fullName, nickname: r.nickname, notes };
  });
  const flagged = students_.filter((x) => x.notes.some((n) => n.tone === "danger" || n.tone === "warn"));

  return {
    session: {
      id: s.session.id, date: s.session.date, startTime: s.session.startTime.slice(0, 5), endTime: s.session.endTime.slice(0, 5), status: s.session.status,
      label: sessionLabel(s.session.sequenceNo, s.session.kind as SessionKind, s.session.originalSequenceNo), className: s.className, classCode: s.classCode,
      courseName: cls?.courseName ?? null, isFuture: s.session.date > today, isToday: s.session.date === today,
    },
    lesson: board.lesson,
    criteria: board.criteria,
    standardLines: board.standardLines,
    deadline: board.deadline,
    documents: docs.map((x) => ({
      id: x.id, title: x.title, kindLabel: DOC_KIND_VI[x.kind as DocKind] ?? x.kind, category: DOC_CATEGORY_VI[x.category as DocCategory] ?? x.category,
      forLesson: !!x.lessonId, href: x.kind === "scorm" ? `/scorm/${x.id}` : `/documents/${x.id}`,
    })),
    previous: prev ? { date: prev.date, label: sessionLabel(prev.seq, prev.kind as SessionKind, prev.originalSeq), note: prev.sessionNote, absent: prevAtt.filter((a) => ABSENT.includes(a.status)).length } : null,
    students: [...flagged, ...students_.filter((x) => !flagged.includes(x))],
    counts: { total: students_.length, flagged: flagged.length, trial: roster.filter((r) => r.enrollmentStatus === "trial").length },
    healthHidden: !canHealth,
  };
}

/* ------------------------------------------------------------------ */
/* Lớp của tôi: tiến độ, học viên có nguy cơ, học bạ mốc sắp đến hạn     */
/* ------------------------------------------------------------------ */

export async function classInsights(ctx: ProtectedContext, teacherId: string) {
  const all = await listClasses(ctx, { teacherId });
  const cls = all.filter((c) => c.status === "running" || c.status === "recruiting");
  const ids = cls.map((c) => c.id);
  // Không có lớp đang chạy thì truy vấn bằng id rỗng (không khớp dòng nào) — giữ một kiểu dữ liệu trả về
  const idsQ = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
  const today = todayISO();
  const [meta, enrs] = await Promise.all([
    ctx.db.select({ id: classes.id, planned: classes.plannedSessions, total: courses.totalSessions }).from(classes).innerJoin(courses, eq(courses.id, classes.courseId)).where(inArray(classes.id, idsQ)),
    ctx.db.select({ id: enrollments.id, classId: enrollments.classId, studentId: students.id, fullName: students.fullName, status: enrollments.status })
      .from(enrollments).innerJoin(students, eq(students.id, enrollments.studentId))
      .where(and(inArray(enrollments.classId, idsQ), inArray(enrollments.status, ["active", "trial"])))
      .orderBy(asc(students.fullName)),
  ]);
  const enrIds = enrs.map((e) => e.id);
  let att: { enrollmentId: string; status: string; date: string }[] = [];
  let sheets: { enrollmentId: string; snapshot: unknown; date: string }[] = [];
  let cards: { enrollmentId: string; seq: number }[] = [];
  if (enrIds.length) {
    [att, sheets, cards] = await Promise.all([
      ctx.db.select({ enrollmentId: attendance.enrollmentId, status: attendance.status, date: sessions.date })
        .from(attendance).innerJoin(sessions, eq(sessions.id, attendance.sessionId))
        .where(and(inArray(attendance.enrollmentId, enrIds), gte(sessions.date, addDays(today, -120)))).orderBy(asc(sessions.date), asc(sessions.startTime)),
      ctx.db.select({ enrollmentId: sessionEvaluations.enrollmentId, snapshot: sessionEvaluations.snapshot, date: sessions.date })
        .from(sessionEvaluations).innerJoin(sessions, eq(sessions.id, sessionEvaluations.sessionId))
        .where(and(inArray(sessionEvaluations.enrollmentId, enrIds), eq(sessionEvaluations.status, "published"), gte(sessions.date, addDays(today, -120)))).orderBy(asc(sessions.date)),
      ctx.db.select({ enrollmentId: reportCards.enrollmentId, seq: reportCards.milestoneSeq }).from(reportCards).where(inArray(reportCards.enrollmentId, enrIds)),
    ]);
  }

  return {
    classes: cls.map((c) => {
      const m = meta.find((x) => x.id === c.id);
      const planned = m?.planned ?? m?.total ?? c.sessionsTotal;
      const mine = enrs.filter((e) => e.classId === c.id);
      const risks = mine.map((e) => {
        const r = studentRisk({
          recent: att.filter((a) => a.enrollmentId === e.id).map((a) => a.status),
          averages: sheets.filter((x) => x.enrollmentId === e.id).map((x) => (isSessionEvalSnapshot(x.snapshot) ? sessionAverage(x.snapshot) : null)).filter((v): v is number => v !== null),
        });
        return { studentId: e.studentId, enrollmentId: e.id, fullName: e.fullName, ...r };
      }).filter((r) => r.level !== null).sort((a, b) => (a.level === b.level ? 0 : a.level === "high" ? -1 : 1));
      const milestones = planned ? reportCardMilestones(planned) : [];
      const missingAt = (seq: number) => mine.filter((e) => !cards.some((k) => k.enrollmentId === e.id && k.seq === seq)).length;
      const written = milestones.filter((seq) => mine.length > 0 && missingAt(seq) === 0);
      const due = milestonesDue({ done: c.sessionsDone, milestones, written }).map((x) => ({ ...x, missing: missingAt(x.seq) }));
      return {
        id: c.id, code: c.code, name: c.name, status: c.status, centerCode: c.centerCode, courseName: c.courseName, schedule: c.schedule,
        enrolled: c.enrolled, capacity: c.capacity, sessionsDone: c.sessionsDone, sessionsTotal: c.sessionsTotal,
        percent: completionPercent(c.sessionsDone, c.sessionsTotal), overdue: c.sessionsOverdue, risks, milestones: due,
      };
    }),
    others: all.filter((c) => !ids.includes(c.id)).map((c) => ({ id: c.id, code: c.code, name: c.name, status: c.status })),
  };
}
