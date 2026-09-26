/**
 * CỔNG PHỤ HUYNH `/ph` — "Hôm nay của con", lịch học, yêu cầu của tôi, SataCoin, hành trình học,
 * phản hồi sau buổi (docs/PHIA-NGUOI-DUNG.md).
 *
 * PHẠM VI: mọi hàm nhận `parentId` lấy từ PHIÊN phụ huynh (cookie → `parentFromToken`), không bao giờ từ dữ liệu
 * máy khách gửi lên. Học viên phải là con của phụ huynh đó (`student_guardians`) và cùng trung tâm (tenant) —
 * `familyChildren` là cửa duy nhất để lấy danh sách con.
 *
 * KHÔNG trả: ghi chú nội bộ của buổi (`private_note`), lý do vắng GV ghi, ghi chú nội bộ của yêu cầu (sự kiện),
 * PII của học viên / phụ huynh khác, tên nhân sự ghi xu điều chỉnh.
 * Mọi thao tác ghi: transaction + `writeAudit` (actor = null, `after.parentId` ghi người thao tác) + tenant của học viên.
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, notInArray, or, sql } from "drizzle-orm";
import {
  parents, students, studentGuardians, enrollments, classes, sessions, attendance, rooms, centers, teachers, sessionEvaluations,
  parentFeedback, parentRequests, parentRequestEvents, parentNotifications, careTasks, userRoles, users, holidays, makeupRequests,
  coinTransactions, redemptions, rewardItems, certificates, learningPaths, learningPathCourses, courseCompletions, courses,
  assignments, submissions, orders, payments, type Database,
} from "@satarobo/db";
import {
  sessionLabel, isSessionEvalSnapshot, sessionAverage, sheetGlance, pickLatestSheet, validateReaction, reactionPlan, reactionEditable, reactionOf,
  sessionTone, withinMakeupWindow, validateParentRequest, requestCode, slaDue, PARENT_REQUEST_TYPE_VI, PARENT_REQUEST_STATUS_VI,
  COIN_REASON_VI, REDEMPTION_STATUS_VI, coinTier, availableBalance, pathProgress, buildJourney, certificateVerifyPath, isCertificateSnapshot,
  OBJECTIVE_RESULT_VI, SESSION_REACTION_VI, addDays, tomTatCon,
  type SessionReaction, type SessionKind, type ParentRequestType, type ParentRequestStatus, type CoinReason, type RedemptionStatus,
  type ObjectiveResult, type JourneyCourseInput, type JourneyPathCertificate,
} from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { todayISO } from "./sessions";
import { writeAudit } from "./audit";
import { deliverNotifications } from "./notify";
import { evidenceMedia } from "./sessionEvaluations";
import { buildPortfolio } from "./portfolio";
import { balances } from "./parentPortal";

type Db = ProtectedContext["db"];
const asDb = (d: Database) => d as unknown as Db;
const hhmm = (t: string | null | undefined) => (t ?? "").slice(0, 5);
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const ATTENDED = ["present", "late", "makeup"];
const ABSENT = ["absent_excused", "absent_unexcused"];

export type HubResult<T = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });

/* ------------------------------------------------------------------ */
/* Phạm vi: con của phụ huynh                                           */
/* ------------------------------------------------------------------ */

export interface FamilyChild {
  id: string;
  fullName: string;
  nickname: string | null;
  code: string | null;
  status: string;
  tenantId: string | null;
  homeCenterId: string | null;
}

/** Con của phụ huynh (đúng tenant, chưa xoá) — cửa DUY NHẤT để xác định phạm vi dữ liệu */
export async function familyChildren(db: Database, parentId: string): Promise<FamilyChild[]> {
  const d = asDb(db);
  const rows = await d
    .select({
      id: students.id, fullName: students.fullName, nickname: students.nickname, code: students.code, status: students.status,
      tenantId: students.tenantId, homeCenterId: students.homeCenterId, parentTenant: parents.tenantId,
    })
    .from(studentGuardians)
    .innerJoin(students, eq(students.id, studentGuardians.studentId))
    .innerJoin(parents, eq(parents.id, studentGuardians.parentId))
    .where(and(eq(studentGuardians.parentId, parentId), isNull(students.deletedAt), isNull(parents.deletedAt)))
    .orderBy(asc(students.fullName));
  // Cách ly trung tâm: con và phụ huynh phải cùng tenant (dữ liệu di sản chưa gắn tenant thì cho qua)
  return rows
    .filter((r) => !r.tenantId || !r.parentTenant || r.tenantId === r.parentTenant)
    .map((r) => ({ id: r.id, fullName: r.fullName, nickname: r.nickname, code: r.code, status: r.status, tenantId: r.tenantId, homeCenterId: r.homeCenterId }));
}

async function childOf(db: Database, parentId: string, studentId: string): Promise<FamilyChild | null> {
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) return null;
  return (await familyChildren(db, parentId)).find((k) => k.id === studentId) ?? null;
}

/** Số thông báo chưa đọc (chuông trên đầu trang) */
export async function parentUnread(db: Database, parentId: string): Promise<number> {
  const d = asDb(db);
  const [r] = await d.select({ n: sql<number>`count(*)::int` }).from(parentNotifications)
    .where(and(eq(parentNotifications.parentId, parentId), eq(parentNotifications.channel, "in_app"), isNull(parentNotifications.readAt), isNull(parentNotifications.hiddenAt)));
  return r?.n ?? 0;
}

const teacherNameSql = sql<string | null>`coalesce((select t.full_name from ${teachers} t where t.id = ${sessions.teacherId}), (select t.full_name from ${teachers} t where t.id = ${classes.leadTeacherId}))`;

async function careStaffOf(d: Db, centerId: string): Promise<string[]> {
  return (await d.select({ u: userRoles.userId }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(users.isActive, true), eq(userRoles.centerId, centerId), inArray(userRoles.role, ["CENTER_MANAGER", "CENTER_SALES_CSM"])))).map((r) => r.u);
}

/* ------------------------------------------------------------------ */
/* Hôm nay của con                                                      */
/* ------------------------------------------------------------------ */

async function nextSessionsOf(d: Db, studentId: string, from: string, limit: number) {
  return d
    .select({
      sessionId: sessions.id, enrollmentId: enrollments.id, date: sessions.date, start: sessions.startTime, end: sessions.endTime,
      seq: sessions.sequenceNo, kind: sessions.kind, originalSeq: sessions.originalSequenceNo, status: sessions.status,
      classCode: classes.code, className: classes.name, room: rooms.name, center: centers.name, centerAddress: centers.address, teacher: teacherNameSql,
    })
    .from(enrollments)
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(sessions, eq(sessions.classId, classes.id))
    .innerJoin(centers, eq(centers.id, classes.centerId))
    .leftJoin(rooms, eq(rooms.id, sessions.roomId))
    .where(and(
      eq(enrollments.studentId, studentId), inArray(enrollments.status, ["active", "trial"]), gte(sessions.date, from),
      inArray(sessions.status, ["scheduled", "in_progress"]), sql`${sessions.sequenceNo} >= ${enrollments.startSequenceNo}`,
    ))
    .orderBy(asc(sessions.date), asc(sessions.startTime))
    .limit(limit);
}

/** Phiếu nhận xét đã phát hành gần nhất của con (không có private_note; nhận xét = nhận xét cho PH) */
async function latestSheetOf(d: Db, studentId: string) {
  const rows = await d
    .select({
      id: sessionEvaluations.id, sessionId: sessionEvaluations.sessionId, snapshot: sessionEvaluations.snapshot, objectiveResult: sessionEvaluations.objectiveResult,
      highlights: sessionEvaluations.highlights, productNote: sessionEvaluations.productNote, remark: sessionEvaluations.remark, mediaIds: sessionEvaluations.mediaIds,
      publishedAt: sessionEvaluations.publishedAt, date: sessions.date, sequenceNo: sessions.sequenceNo,
    })
    .from(sessionEvaluations).innerJoin(sessions, eq(sessions.id, sessionEvaluations.sessionId))
    .where(and(eq(sessionEvaluations.studentId, studentId), eq(sessionEvaluations.status, "published")))
    .orderBy(desc(sessions.date), desc(sessions.sequenceNo))
    .limit(5);
  const latest = pickLatestSheet(rows.map((r) => ({ ...r, publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null })));
  if (!latest || !isSessionEvalSnapshot(latest.snapshot)) return null;
  const snap = latest.snapshot;
  const media = (await evidenceMedia(d, [latest.sessionId], [studentId])).get(studentId) ?? [];
  const ids = latest.mediaIds ?? [];
  const chosen = ids.length ? media.filter((m) => ids.includes(m.id)) : media.slice(0, 2);
  const criteria = snap.criteria.map((c) => ({ label: c.label, value: c.value ?? null, level: c.levels.find((l) => l.value === c.value)?.label ?? null }));
  const [fb] = await d.select({ id: parentFeedback.id, reaction: parentFeedback.reaction, rating: parentFeedback.rating, channel: parentFeedback.channel, status: parentFeedback.status, comment: parentFeedback.comment })
    .from(parentFeedback).where(and(eq(parentFeedback.sessionId, latest.sessionId), eq(parentFeedback.studentId, studentId))).limit(1);
  return {
    id: latest.id, sessionId: latest.sessionId, date: latest.date, label: snap.context.label || sessionLabel(latest.sequenceNo, "regular"),
    lessonTitle: snap.context.lessonTitle, teacherName: snap.context.teacherName, className: snap.context.className, makeup: !!snap.context.makeup,
    criteria, glance: sheetGlance(criteria), average: sessionAverage(snap),
    objective: latest.objectiveResult ? OBJECTIVE_RESULT_VI[latest.objectiveResult as ObjectiveResult] : null,
    highlights: latest.highlights ?? [], productNote: latest.productNote, remark: latest.remark,
    media: chosen.map((m) => ({ id: m.id, url: m.url, caption: m.caption })),
    reaction: fb ? { value: reactionOf({ reaction: fb.reaction, rating: fb.rating }), note: fb.comment, editable: reactionEditable(fb) } : null,
  };
}

export async function hubHome(db: Database, parentId: string, wantedChildId: string | null) {
  const d = asDb(db);
  const kids = await familyChildren(db, parentId);
  const today = todayISO();
  const child = (wantedChildId ? kids.find((k) => k.id === wantedChildId) : undefined) ?? kids[0] ?? null;

  const [nt] = await d.select({ unread: sql<number>`count(*)::int` }).from(parentNotifications)
    .where(and(eq(parentNotifications.parentId, parentId), eq(parentNotifications.channel, "in_app"), isNull(parentNotifications.readAt), isNull(parentNotifications.hiddenAt)));
  const unreadList = await d.select({ id: parentNotifications.id, title: parentNotifications.title, body: parentNotifications.body, link: parentNotifications.link, createdAt: parentNotifications.createdAt })
    .from(parentNotifications)
    .where(and(eq(parentNotifications.parentId, parentId), eq(parentNotifications.channel, "in_app"), isNull(parentNotifications.readAt), isNull(parentNotifications.hiddenAt)))
    .orderBy(desc(parentNotifications.createdAt)).limit(3);
  const bal = await balances(d, parentId);
  const due = bal.filter((b) => b.remaining > 0 && ["pending_payment", "partially_paid"].includes(b.status));
  const firstDue = due[0] ?? null;

  let focus: null | {
    next: (Awaited<ReturnType<typeof nextSessionsOf>>[number] & { label: string; absence: { code: string; status: string; statusLabel: string } | null }) | null;
    upcoming: { sessionId: string; date: string; start: string; label: string; classCode: string }[];
    sheet: Awaited<ReturnType<typeof latestSheetOf>>;
    attendance30: { total: number; present: number; rate: number | null };
    homework: { title: string; dueAt: Date | null; status: string; link: string }[];
    coins: number;
  } = null;

  if (child) {
    const [upcoming, sheet, att, hw, coin] = await Promise.all([
      nextSessionsOf(d, child.id, today, 4),
      latestSheetOf(d, child.id),
      d.select({ status: attendance.status, n: sql<number>`count(*)::int` })
        .from(attendance).innerJoin(enrollments, eq(enrollments.id, attendance.enrollmentId)).innerJoin(sessions, eq(sessions.id, attendance.sessionId))
        .where(and(eq(enrollments.studentId, child.id), gte(sessions.date, addDays(today, -30)))).groupBy(attendance.status),
      d.select({ title: assignments.title, dueAt: assignments.dueAt, status: submissions.status, token: submissions.token })
        .from(submissions).innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
        .where(and(eq(submissions.studentId, child.id), inArray(submissions.status, ["assigned", "returned"]), inArray(assignments.status, ["published"]), gte(assignments.dueAt, new Date(Date.now() - 2 * 86400e3))))
        .orderBy(asc(assignments.dueAt)).limit(3),
      d.select({ n: sql<number>`coalesce(sum(${coinTransactions.amount}), 0)::int` }).from(coinTransactions).where(eq(coinTransactions.studentId, child.id)),
    ]);
    const first = upcoming[0] ?? null;
    let absence: { code: string; status: string; statusLabel: string } | null = null;
    if (first) {
      const [r] = await d.select({ code: parentRequests.code, status: parentRequests.status }).from(parentRequests)
        .where(and(eq(parentRequests.studentId, child.id), eq(parentRequests.type, "absence"), eq(parentRequests.sessionId, first.sessionId), notInArray(parentRequests.status, ["rejected", "cancelled"])))
        .orderBy(desc(parentRequests.createdAt)).limit(1);
      if (r) absence = { code: r.code, status: r.status, statusLabel: PARENT_REQUEST_STATUS_VI[r.status as ParentRequestStatus] };
    }
    const total = att.reduce((s, x) => s + x.n, 0);
    const present = att.filter((x) => ATTENDED.includes(x.status)).reduce((s, x) => s + x.n, 0);
    focus = {
      next: first ? { ...first, start: hhmm(first.start), end: hhmm(first.end), label: sessionLabel(first.seq, first.kind as SessionKind, first.originalSeq), absence } : null,
      upcoming: upcoming.slice(1).map((u) => ({ sessionId: u.sessionId, date: u.date, start: hhmm(u.start), label: sessionLabel(u.seq, u.kind as SessionKind, u.originalSeq), classCode: u.classCode })),
      sheet,
      attendance30: { total, present, rate: total ? Math.round((present / total) * 100) : null },
      homework: hw.map((h) => ({ title: h.title, dueAt: h.dueAt, status: h.status, link: `/bt/${h.token}` })),
      coins: coin[0]?.n ?? 0,
    };
  }

  return {
    children: kids.map((k) => ({ id: k.id, fullName: k.fullName, nickname: k.nickname })),
    child: child ? { id: child.id, fullName: child.fullName, nickname: child.nickname, code: child.code } : null,
    focus,
    fees: { total: due.reduce((s, b) => s + b.remaining, 0), count: due.length, first: firstDue ? { id: firstDue.id, code: firstDue.code, remaining: firstDue.remaining, student: firstDue.student } : null },
    unread: nt?.unread ?? 0,
    notifications: unreadList.map((n) => ({ ...n, link: n.link && n.link.startsWith("/") && !n.link.startsWith("//") ? n.link : null })),
  };
}

/* ------------------------------------------------------------------ */
/* "Các con của bạn" — thẻ tóm tắt từng con ở trang Tổng quan           */
/* ------------------------------------------------------------------ */

/**
 * Một thẻ cho mỗi con: đang học khoá nào, tới buổi bao nhiêu, đi học có đều không,
 * có bài nào đang nợ không, học phí của RIÊNG con đó đã đủ chưa.
 *
 * SQL ở đây chỉ **đếm**; ngưỡng và cách diễn đạt ("Đủ", "—", "cần chú ý") nằm ở
 * `core/portal/theCon` để có kiểm thử và để sau này đổi mốc ở một chỗ.
 */
export async function hubFamily(db: Database, parentId: string) {
  const d = asDb(db);
  const kids = await familyChildren(db, parentId);
  if (!kids.length) return { children: [] as FamilyCard[] };
  const ids = kids.map((k) => k.id);

  const [enr, att, hw, no] = await Promise.all([
    // Khoá đang theo: ưu tiên lớp bắt đầu gần đây nhất
    d.select({
      studentId: enrollments.studentId,
      enrollmentId: enrollments.id,
      status: enrollments.status,
      classCode: classes.code,
      className: classes.name,
      courseName: courses.name,
      center: centers.name,
      teacher: teachers.fullName,
      buoiTong: sql<number>`(select count(*)::int from ${sessions} s where s.class_id = ${classes.id} and s.kind = 'regular' and s.status not in ('cancelled','rescheduled') and s.sequence_no >= ${enrollments.startSequenceNo})`,
      buoiDaHoc: sql<number>`(select count(*)::int from ${attendance} a where a.enrollment_id = ${enrollments.id} and a.status in ('present','late','makeup'))`,
    })
      .from(enrollments)
      .innerJoin(classes, eq(classes.id, enrollments.classId))
      .leftJoin(courses, eq(courses.id, classes.courseId))
      .leftJoin(centers, eq(centers.id, classes.centerId))
      .leftJoin(teachers, eq(teachers.id, classes.leadTeacherId))
      .where(and(inArray(enrollments.studentId, ids), inArray(enrollments.status, ["active", "trial"])))
      .orderBy(desc(enrollments.enrolledAt)),
    // Chuyên cần: tính trên toàn bộ buổi đã điểm danh của con, không bó trong 30 ngày —
    // thẻ này nói về cả quá trình học, còn mốc 30 ngày để dành cho màn "Hôm nay của con".
    d.select({ studentId: enrollments.studentId, status: attendance.status, n: sql<number>`count(*)::int` })
      .from(attendance).innerJoin(enrollments, eq(enrollments.id, attendance.enrollmentId))
      .where(inArray(enrollments.studentId, ids)).groupBy(enrollments.studentId, attendance.status),
    d.select({ studentId: submissions.studentId, n: sql<number>`count(*)::int` })
      .from(submissions).innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
      .where(and(inArray(submissions.studentId, ids), inArray(submissions.status, ["assigned", "returned"]), eq(assignments.status, "published")))
      .groupBy(submissions.studentId),
    d.select({
      studentId: orders.studentId,
      conLai: sql<number>`coalesce(sum(greatest(0, ${orders.total} - (select coalesce(sum(p.amount), 0)::float from ${payments} p where p.order_id = ${orders.id} and p.status = 'confirmed'))), 0)::float`,
    })
      .from(orders)
      .where(and(inArray(orders.studentId, ids), inArray(orders.status, ["pending_payment", "partially_paid"])))
      .groupBy(orders.studentId),
  ]);

  return {
    children: kids.map((k): FamilyCard => {
      const e = enr.find((x) => x.studentId === k.id) ?? null;
      const a = att.filter((x) => x.studentId === k.id);
      const ccTong = a.reduce((s, x) => s + x.n, 0);
      const ccCoMat = a.filter((x) => ATTENDED.includes(x.status)).reduce((s, x) => s + x.n, 0);
      const tt = tomTatCon({
        buoiDaHoc: e?.buoiDaHoc ?? 0,
        buoiTong: e?.buoiTong ?? 0,
        chuyenCanTong: ccTong,
        chuyenCanCoMat: ccCoMat,
        baiCho: hw.find((x) => x.studentId === k.id)?.n ?? 0,
        hocPhiConLai: no.find((x) => x.studentId === k.id)?.conLai ?? 0,
      });
      return {
        id: k.id,
        fullName: k.fullName,
        nickname: k.nickname,
        code: k.code,
        lop: e ? { classCode: e.classCode, className: e.className, courseName: e.courseName, center: e.center, teacher: e.teacher, trial: e.status === "trial" } : null,
        tomTat: tt,
      };
    }),
  };
}

export interface FamilyCard {
  id: string;
  fullName: string;
  nickname: string | null;
  code: string | null;
  lop: { classCode: string; className: string; courseName: string | null; center: string | null; teacher: string | null; trial: boolean } | null;
  tomTat: ReturnType<typeof tomTatCon>;
}

/* ------------------------------------------------------------------ */
/* Nhận xét · Bài tập · Hình ảnh lớp (ba màn riêng như cổng học viên)   */
/* ------------------------------------------------------------------ */

/**
 * Danh sách phiếu nhận xét đã phát hành của một con, mới nhất trước.
 * Chỉ lấy phiếu `published` — bản nháp của giáo viên không bao giờ ra cổng phụ huynh —
 * và không kèm `private_note` (ghi chú nội bộ của buổi).
 */
export async function hubSheets(db: Database, parentId: string, studentId: string, limit = 30) {
  const child = await childOf(db, parentId, studentId);
  if (!child) return null;
  const d = asDb(db);
  const rows = await d
    .select({
      id: sessionEvaluations.id, sessionId: sessionEvaluations.sessionId, snapshot: sessionEvaluations.snapshot,
      objectiveResult: sessionEvaluations.objectiveResult, highlights: sessionEvaluations.highlights,
      remark: sessionEvaluations.remark, productNote: sessionEvaluations.productNote,
      date: sessions.date, sequenceNo: sessions.sequenceNo, kind: sessions.kind,
    })
    .from(sessionEvaluations).innerJoin(sessions, eq(sessions.id, sessionEvaluations.sessionId))
    .where(and(eq(sessionEvaluations.studentId, child.id), eq(sessionEvaluations.status, "published")))
    .orderBy(desc(sessions.date), desc(sessions.sequenceNo))
    .limit(Math.min(100, Math.max(1, limit)));

  const items = rows.flatMap((r) => {
    if (!isSessionEvalSnapshot(r.snapshot)) return [];
    const snap = r.snapshot;
    const criteria = snap.criteria.map((c) => ({ label: c.label, value: c.value ?? null, level: c.levels.find((l) => l.value === c.value)?.label ?? null }));
    return [{
      id: r.id, sessionId: r.sessionId, date: r.date,
      label: snap.context.label || sessionLabel(r.sequenceNo, r.kind as SessionKind),
      lessonTitle: snap.context.lessonTitle, teacherName: snap.context.teacherName, className: snap.context.className,
      criteria, glance: sheetGlance(criteria),
      objective: r.objectiveResult ? OBJECTIVE_RESULT_VI[r.objectiveResult as ObjectiveResult] : null,
      highlights: r.highlights ?? [], remark: r.remark, productNote: r.productNote,
    }];
  });
  return { child: { id: child.id, fullName: child.fullName, nickname: child.nickname }, items };
}

/** Bài tập của tất cả các con: đang chờ trước, rồi đến bài đã nộp / đã chấm */
export async function hubHomework(db: Database, parentId: string) {
  const d = asDb(db);
  const kids = await familyChildren(db, parentId);
  if (!kids.length) return { children: [], items: [] as HubHomework[] };
  const ids = kids.map((k) => k.id);
  const rows = await d
    .select({
      studentId: submissions.studentId, title: assignments.title, dueAt: assignments.dueAt, maxScore: assignments.maxScore,
      status: submissions.status, score: submissions.score, token: submissions.token, submittedAt: submissions.submittedAt,
      className: classes.name,
    })
    .from(submissions)
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .leftJoin(classes, eq(classes.id, assignments.classId))
    .where(and(inArray(submissions.studentId, ids), inArray(assignments.status, ["published", "closed"])))
    .orderBy(desc(assignments.dueAt))
    .limit(200);

  const CHO = ["assigned", "returned"];
  const items: HubHomework[] = rows.map((r) => ({
    studentId: r.studentId,
    studentName: kids.find((k) => k.id === r.studentId)?.fullName ?? "",
    title: r.title, className: r.className, dueAt: r.dueAt, submittedAt: r.submittedAt,
    status: r.status, dangCho: CHO.includes(r.status),
    score: r.score, maxScore: r.maxScore, link: `/bt/${r.token}`,
  }));
  items.sort((a, b) => Number(b.dangCho) - Number(a.dangCho) || (b.dueAt?.getTime() ?? 0) - (a.dueAt?.getTime() ?? 0));
  return { children: kids.map((k) => ({ id: k.id, fullName: k.fullName, nickname: k.nickname })), items };
}

export interface HubHomework {
  studentId: string;
  studentName: string;
  title: string;
  className: string | null;
  dueAt: Date | null;
  submittedAt: Date | null;
  status: string;
  dangCho: boolean;
  score: number | null;
  maxScore: number | null;
  link: string;
}

/**
 * Ảnh lớp của một con — chỉ ảnh **đã duyệt**, và chỉ khi gia đình đã đồng ý cho đăng ảnh
 * (`evidenceMedia` tự kiểm điều này). Gom theo buổi học để phụ huynh biết ảnh của hôm nào.
 */
export async function hubPhotos(db: Database, parentId: string, studentId: string, limit = 120) {
  const child = await childOf(db, parentId, studentId);
  if (!child) return null;
  const d = asDb(db);
  const ses = await d
    .select({ id: sessions.id, date: sessions.date, seq: sessions.sequenceNo, kind: sessions.kind, className: classes.name })
    .from(attendance)
    .innerJoin(enrollments, eq(enrollments.id, attendance.enrollmentId))
    .innerJoin(sessions, eq(sessions.id, attendance.sessionId))
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .where(and(eq(enrollments.studentId, child.id), inArray(attendance.status, ATTENDED)))
    .orderBy(desc(sessions.date))
    .limit(60);
  if (!ses.length) return { child: { id: child.id, fullName: child.fullName, nickname: child.nickname }, buoi: [] };

  const media = (await evidenceMedia(d, ses.map((s) => s.id), [child.id])).get(child.id) ?? [];
  const buoi = ses
    .map((s) => ({
      sessionId: s.id, date: s.date, className: s.className,
      label: sessionLabel(s.seq, s.kind as SessionKind),
      anh: media.filter((m) => m.sessionId === s.id).map((m) => ({ id: m.id, url: m.url, caption: m.caption })),
    }))
    .filter((b) => b.anh.length > 0);
  let con = Math.max(1, limit);
  const cat = buoi.filter((b) => { if (con <= 0) return false; con -= b.anh.length; return true; });
  return { child: { id: child.id, fullName: child.fullName, nickname: child.nickname }, buoi: cat };
}

/* ------------------------------------------------------------------ */
/* Lịch học của con (tháng / tuần)                                      */
/* ------------------------------------------------------------------ */

export interface ScheduleEntry {
  sessionId: string;
  enrollmentId: string;
  date: string;
  start: string;
  end: string;
  label: string;
  classCode: string;
  className: string;
  room: string | null;
  center: string;
  teacher: string | null;
  kind: "regular" | "makeup";
  tone: ReturnType<typeof sessionTone>["tone"];
  toneLabel: string;
  canAbsent: boolean;
  canMakeup: boolean;
  requestCode: string | null;
}

export async function hubSchedule(db: Database, parentId: string, studentId: string, range: { from: string; to: string }) {
  const child = await childOf(db, parentId, studentId);
  if (!child) return null;
  const d = asDb(db);
  const today = todayISO();
  const cols = {
    sessionId: sessions.id, enrollmentId: enrollments.id, enrollmentStatus: enrollments.status, date: sessions.date, start: sessions.startTime, end: sessions.endTime,
    seq: sessions.sequenceNo, kind: sessions.kind, originalSeq: sessions.originalSequenceNo, status: sessions.status,
    classCode: classes.code, className: classes.name, centerId: classes.centerId, room: rooms.name, center: centers.name, teacher: teacherNameSql,
  };
  const [regular, makeupDone, makeupPlanned, reqs] = await Promise.all([
    // Buổi của các lớp con đang học (lớp đã rời chỉ hiện buổi có điểm danh)
    d.select({ ...cols, att: attendance.status })
      .from(enrollments)
      .innerJoin(classes, eq(classes.id, enrollments.classId))
      .innerJoin(sessions, eq(sessions.classId, classes.id))
      .innerJoin(centers, eq(centers.id, classes.centerId))
      .leftJoin(rooms, eq(rooms.id, sessions.roomId))
      .leftJoin(attendance, and(eq(attendance.sessionId, sessions.id), eq(attendance.enrollmentId, enrollments.id)))
      .where(and(
        eq(enrollments.studentId, child.id), gte(sessions.date, range.from), lte(sessions.date, range.to),
        sql`${sessions.sequenceNo} >= ${enrollments.startSequenceNo}`,
        or(inArray(enrollments.status, ["active", "trial"]), isNotNull(attendance.id))!,
      ))
      .orderBy(asc(sessions.date), asc(sessions.startTime)).limit(200),
    // Đã học bù ở lớp khác
    d.select({ ...cols, att: attendance.status })
      .from(attendance)
      .innerJoin(enrollments, eq(enrollments.id, attendance.enrollmentId))
      .innerJoin(sessions, eq(sessions.id, attendance.sessionId))
      .innerJoin(classes, eq(classes.id, sessions.classId))
      .innerJoin(centers, eq(centers.id, classes.centerId))
      .leftJoin(rooms, eq(rooms.id, sessions.roomId))
      .where(and(eq(enrollments.studentId, child.id), ne(sessions.classId, enrollments.classId), gte(sessions.date, range.from), lte(sessions.date, range.to)))
      .limit(60),
    // Học bù đã xếp (chưa học)
    d.select({ ...cols })
      .from(makeupRequests)
      .innerJoin(enrollments, eq(enrollments.id, makeupRequests.enrollmentId))
      .innerJoin(sessions, eq(sessions.id, makeupRequests.targetSessionId))
      .innerJoin(classes, eq(classes.id, sessions.classId))
      .innerJoin(centers, eq(centers.id, classes.centerId))
      .leftJoin(rooms, eq(rooms.id, sessions.roomId))
      .where(and(eq(enrollments.studentId, child.id), eq(makeupRequests.status, "approved"), gte(sessions.date, range.from), lte(sessions.date, range.to)))
      .limit(60),
    d.select({ type: parentRequests.type, code: parentRequests.code, sessionId: parentRequests.sessionId, missedSessionId: parentRequests.missedSessionId })
      .from(parentRequests)
      .where(and(eq(parentRequests.studentId, child.id), inArray(parentRequests.type, ["absence", "makeup"]), notInArray(parentRequests.status, ["rejected", "cancelled"])))
      .orderBy(desc(parentRequests.createdAt)).limit(200),
  ]);
  const absenceReq = new Map(reqs.filter((r) => r.type === "absence" && r.sessionId).map((r) => [r.sessionId!, r.code]));
  const makeupReq = new Map(reqs.filter((r) => r.type === "makeup" && r.missedSessionId).map((r) => [r.missedSessionId!, r.code]));

  const seen = new Set<string>();
  const entries: ScheduleEntry[] = [];
  const push = (r: (typeof regular)[number] | ((typeof makeupPlanned)[number] & { att?: string | null }), kind: "regular" | "makeup") => {
    if (seen.has(r.sessionId)) return;
    seen.add(r.sessionId);
    const att = "att" in r ? r.att ?? null : null;
    const requested = absenceReq.get(r.sessionId) ?? null;
    const t = sessionTone({ date: r.date, today, sessionStatus: r.status, attendance: att, absenceRequested: kind === "regular" && !!requested });
    const active = r.enrollmentStatus === "active" || r.enrollmentStatus === "trial";
    entries.push({
      sessionId: r.sessionId, enrollmentId: r.enrollmentId, date: r.date, start: hhmm(r.start), end: hhmm(r.end),
      label: kind === "makeup" ? `Học bù · ${r.classCode}` : sessionLabel(r.seq, r.kind as SessionKind, r.originalSeq),
      classCode: r.classCode, className: r.className, room: r.room, center: r.center, teacher: r.teacher, kind, tone: t.tone, toneLabel: t.label,
      canAbsent: kind === "regular" && active && !att && !requested && r.status === "scheduled" && r.date >= today,
      canMakeup: kind === "regular" && active && !!att && ABSENT.includes(att) && withinMakeupWindow(r.date, today) && !makeupReq.has(r.sessionId),
      requestCode: requested ?? makeupReq.get(r.sessionId) ?? null,
    });
  };
  for (const r of makeupDone) push(r, "makeup");
  for (const r of makeupPlanned) push(r, "makeup");
  for (const r of regular) push(r, "regular");
  entries.sort((a, b) => (a.date === b.date ? (a.start < b.start ? -1 : 1) : a.date < b.date ? -1 : 1));

  const centerIds = [...new Set([...regular, ...makeupDone, ...makeupPlanned].map((r) => r.centerId).concat(child.homeCenterId ? [child.homeCenterId] : []))];
  const hol = await d.select({ date: holidays.date, name: holidays.name }).from(holidays)
    .where(and(gte(holidays.date, range.from), lte(holidays.date, range.to), centerIds.length ? or(isNull(holidays.centerId), inArray(holidays.centerId, centerIds))! : isNull(holidays.centerId)))
    .orderBy(asc(holidays.date));

  const past = entries.filter((e) => e.date <= today);
  return {
    child: { id: child.id, fullName: child.fullName, nickname: child.nickname },
    entries,
    holidays: hol,
    summary: {
      attended: past.filter((e) => e.tone === "done" || e.tone === "late" || e.tone === "makeup").length,
      absent: past.filter((e) => e.tone === "absent" || e.tone === "excused").length,
      upcoming: entries.filter((e) => e.tone === "upcoming" || e.tone === "requested").length,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Yêu cầu của tôi: xin nghỉ, xin học bù, huỷ                           */
/* ------------------------------------------------------------------ */

export async function hubRequests(db: Database, parentId: string) {
  const d = asDb(db);
  const kids = await familyChildren(db, parentId);
  // Không có con thì lọc bằng id rỗng (không khớp dòng nào) — giữ một kiểu dữ liệu trả về
  const kidIds = kids.length ? kids.map((k) => k.id) : ["00000000-0000-0000-0000-000000000000"];
  const rows = await d
    .select({
      id: parentRequests.id, code: parentRequests.code, type: parentRequests.type, status: parentRequests.status, channel: parentRequests.channel,
      studentId: parentRequests.studentId, parentId: parentRequests.parentId, content: parentRequests.content, resolution: parentRequests.resolution,
      createdAt: parentRequests.createdAt, completedAt: parentRequests.completedAt, decidedAt: parentRequests.decidedAt,
      sessionDate: sql<string | null>`(select s.date::text from ${sessions} s where s.id = ${parentRequests.sessionId})`,
      missedDate: sql<string | null>`(select s.date::text from ${sessions} s where s.id = ${parentRequests.missedSessionId})`,
    })
    .from(parentRequests)
    .where(inArray(parentRequests.studentId, kidIds))
    .orderBy(desc(parentRequests.createdAt))
    .limit(60);
  // Chỉ mốc trạng thái — KHÔNG trả ghi chú sự kiện (có thể là ghi chú nội bộ của CSKH)
  const events = rows.length
    ? await d.select({ requestId: parentRequestEvents.requestId, toStatus: parentRequestEvents.toStatus, createdAt: parentRequestEvents.createdAt })
      .from(parentRequestEvents).where(and(inArray(parentRequestEvents.requestId, rows.map((r) => r.id)), isNotNull(parentRequestEvents.toStatus)))
      .orderBy(asc(parentRequestEvents.createdAt))
    : [];
  return {
    children: kids.map((k) => ({ id: k.id, fullName: k.fullName, nickname: k.nickname })),
    items: rows.map((r) => ({
      id: r.id, code: r.code, type: r.type, typeLabel: PARENT_REQUEST_TYPE_VI[r.type as ParentRequestType], status: r.status,
      statusLabel: PARENT_REQUEST_STATUS_VI[r.status as ParentRequestStatus], viaApp: r.channel === "app",
      studentId: r.studentId, studentName: kids.find((k) => k.id === r.studentId)?.fullName ?? "",
      content: r.content, resolution: r.resolution, createdAt: r.createdAt, sessionDate: r.sessionDate, missedDate: r.missedDate,
      canCancel: r.channel === "app" && r.parentId === parentId && r.status === "new",
      timeline: events.filter((e) => e.requestId === r.id).map((e) => ({ status: e.toStatus, label: e.toStatus ? PARENT_REQUEST_STATUS_VI[e.toStatus as ParentRequestStatus] : "", at: e.createdAt })),
    })),
  };
}

export interface ParentHubRequestInput {
  kind: "absence" | "makeup";
  studentId: string;
  sessionId: string;
  /** Xin nghỉ: có cần xếp học bù không */
  needsMakeup?: boolean | null;
  reason?: string | null;
}

/** Phụ huynh tự tạo yêu cầu xin nghỉ buổi sắp tới / xin học bù buổi đã vắng (kênh "App phụ huynh") */
export async function parentSubmitRequest(db: Database, parentId: string, input: ParentHubRequestInput, meta: { ip?: string } = {}): Promise<HubResult<{ id: string; code: string }>> {
  const child = await childOf(db, parentId, input.studentId);
  if (!child) return fail("Không tìm thấy học viên");
  if (!/^[0-9a-f-]{36}$/i.test(input.sessionId)) return fail("Buổi học không hợp lệ");
  const d = asDb(db);
  const today = todayISO();
  const reason = (input.reason ?? "").trim().slice(0, 500);
  const [s] = await d
    .select({ id: sessions.id, date: sessions.date, start: sessions.startTime, status: sessions.status, seq: sessions.sequenceNo, kind: sessions.kind, originalSeq: sessions.originalSequenceNo, classId: sessions.classId, classCode: classes.code, centerId: classes.centerId })
    .from(sessions).innerJoin(classes, eq(classes.id, sessions.classId)).where(eq(sessions.id, input.sessionId)).limit(1);
  if (!s) return fail("Không tìm thấy buổi học");
  const [e] = await d.select({ id: enrollments.id, status: enrollments.status, startSeq: enrollments.startSequenceNo }).from(enrollments)
    .where(and(eq(enrollments.studentId, child.id), eq(enrollments.classId, s.classId), inArray(enrollments.status, ["active", "trial"]))).limit(1);
  if (!e || s.seq < e.startSeq) return fail("Buổi học không thuộc lớp của con");
  const label = sessionLabel(s.seq, s.kind as SessionKind, s.originalSeq);
  let type: ParentRequestType;
  let content: string;
  if (input.kind === "absence") {
    if (s.date < today || s.status !== "scheduled") return fail("Chỉ xin nghỉ buổi sắp tới chưa diễn ra");
    const [dup] = await d.select({ code: parentRequests.code }).from(parentRequests)
      .where(and(eq(parentRequests.enrollmentId, e.id), eq(parentRequests.sessionId, s.id), notInArray(parentRequests.status, ["rejected", "cancelled"]))).limit(1);
    if (dup) return fail(`Buổi này đã có yêu cầu ${dup.code}`);
    type = "absence";
    const mk = input.needsMakeup === true ? "Cần xếp học bù." : input.needsMakeup === false ? "Không cần học bù." : "";
    content = `Phụ huynh xin cho con nghỉ ${label} (${s.classCode}) ngày ${dmy(s.date)}${reason ? `: ${reason}` : ""}. ${mk}`.trim();
  } else {
    const [a] = await d.select({ status: attendance.status }).from(attendance).where(and(eq(attendance.sessionId, s.id), eq(attendance.enrollmentId, e.id))).limit(1);
    if (!a || !ABSENT.includes(a.status)) return fail("Con không vắng buổi này");
    if (!withinMakeupWindow(s.date, today)) return fail("Buổi vắng đã quá hạn xin học bù — nhắn trung tâm để được hỗ trợ");
    const [dup] = await d.select({ code: parentRequests.code }).from(parentRequests)
      .where(and(eq(parentRequests.enrollmentId, e.id), eq(parentRequests.missedSessionId, s.id), eq(parentRequests.type, "makeup"), notInArray(parentRequests.status, ["rejected", "cancelled"]))).limit(1);
    if (dup) return fail(`Buổi này đã có yêu cầu ${dup.code}`);
    type = "makeup";
    content = `Phụ huynh xin cho con học bù ${label} (${s.classCode}) ngày ${dmy(s.date)}${reason ? `: ${reason}` : "."}`;
  }
  const errs = validateParentRequest({ type, content, enrollmentId: e.id, sessionId: type === "absence" ? s.id : null, missedSessionId: type === "makeup" ? s.id : null }, today);
  if (errs.length) return fail(errs.join("; "));

  const now = new Date();
  return d.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    const yr = Number(today.slice(0, 4));
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"preq:" + yr}))`);
    const prefix = requestCode(yr, 0).slice(0, 5);
    const [m] = await tx.select({ n: sql<number>`coalesce(max(substring(${parentRequests.code} from 6)::int), 0)::int` }).from(parentRequests).where(sql`${parentRequests.code} like ${prefix + "%"}`);
    const code = requestCode(yr, (m?.n ?? 0) + 1);
    const [r] = await tx.insert(parentRequests).values({
      code, type, status: "new", channel: "app", centerId: s.centerId, studentId: child.id, parentId, enrollmentId: e.id,
      sessionId: type === "absence" ? s.id : null, missedSessionId: type === "makeup" ? s.id : null,
      content, dueAt: slaDue(now, type), createdBy: null,
    }).returning({ id: parentRequests.id });
    await tx.insert(parentRequestEvents).values({ requestId: r!.id, action: "create", toStatus: "new", note: content, actorId: null });
    await deliverNotifications(tx, await careStaffOf(tx, s.centerId), {
      title: `Yêu cầu PH (app): ${PARENT_REQUEST_TYPE_VI[type]}`, body: `${code} · ${child.fullName} · ${dmy(s.date)} ${hhmm(s.start)}`,
      link: `/parent-requests/${r!.id}`, priority: type === "absence" ? 1 : 2, type: "parent_request.new",
    });
    await tx.insert(parentNotifications).values({
      parentId, studentId: child.id, channel: "in_app", template: "REQUEST_RECEIVED", title: "Trung tâm đã nhận yêu cầu",
      body: `${PARENT_REQUEST_TYPE_VI[type]} (${code}) — chúng tôi sẽ phản hồi sớm`, link: "/ph/yeu-cau", status: "sent", sentAt: now,
    });
    await writeAudit(tx, {
      actorId: null, action: "CREATE", module: "care", entity: "parent_requests", entityId: r!.id,
      after: { code, type, studentId: child.id, sessionId: s.id, via: "parent_app", parentId }, ip: meta.ip, tenantId: child.tenantId,
    });
    return { ok: true as const, id: r!.id, code };
  });
}

/** Huỷ yêu cầu do chính phụ huynh tạo trên app, khi trung tâm chưa xử lý */
export async function parentCancelRequest(db: Database, parentId: string, requestId: string, meta: { ip?: string } = {}): Promise<HubResult> {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return fail("Yêu cầu không hợp lệ");
  const d = asDb(db);
  const [r] = await d.select().from(parentRequests).where(eq(parentRequests.id, requestId)).limit(1);
  const kids = await familyChildren(db, parentId);
  const child = r ? kids.find((k) => k.id === r.studentId) : undefined;
  if (!r || !child) return fail("Không tìm thấy yêu cầu");
  if (r.channel !== "app" || r.parentId !== parentId) return fail("Yêu cầu do trung tâm ghi nhận — nhắn trung tâm để huỷ");
  if (r.status !== "new") return fail("Trung tâm đã bắt đầu xử lý — nhắn trung tâm để thay đổi");
  await d.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.update(parentRequests).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(parentRequests.id, r.id), eq(parentRequests.status, "new")));
    await tx.insert(parentRequestEvents).values({ requestId: r.id, action: "cancel", fromStatus: "new", toStatus: "cancelled", note: "Phụ huynh huỷ trên app", actorId: null });
    await writeAudit(tx, { actorId: null, action: "TRANSITION", module: "care", entity: "parent_requests", entityId: r.id, before: { status: "new" }, after: { status: "cancelled", via: "parent_app", parentId }, ip: meta.ip, tenantId: child.tenantId });
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Phản hồi sau buổi (cảm xúc một chạm)                                  */
/* ------------------------------------------------------------------ */

export async function parentReact(
  db: Database, parentId: string, input: { studentId: string; sessionId: string; reaction: SessionReaction; note?: string | null }, meta: { ip?: string } = {},
): Promise<HubResult<{ reaction: SessionReaction; careTaskId: string | null }>> {
  const child = await childOf(db, parentId, input.studentId);
  if (!child) return fail("Không tìm thấy học viên");
  if (!/^[0-9a-f-]{36}$/i.test(input.sessionId)) return fail("Buổi học không hợp lệ");
  const d = asDb(db);
  // Con phải có mặt ở buổi đó (điểm danh của CHÍNH ghi danh của con)
  const [row] = await d
    .select({
      sessionId: sessions.id, date: sessions.date, seq: sessions.sequenceNo, kind: sessions.kind, originalSeq: sessions.originalSequenceNo,
      classId: sessions.classId, centerId: classes.centerId, teacherId: sql<string | null>`coalesce(${sessions.teacherId}, ${classes.leadTeacherId})`,
      enrollmentId: enrollments.id, att: attendance.status,
    })
    .from(attendance)
    .innerJoin(enrollments, eq(enrollments.id, attendance.enrollmentId))
    .innerJoin(sessions, eq(sessions.id, attendance.sessionId))
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .where(and(eq(attendance.sessionId, input.sessionId), eq(enrollments.studentId, child.id)))
    .limit(1);
  if (!row || !ATTENDED.includes(row.att)) return fail("Chỉ phản hồi buổi con đã học");
  const errs = validateReaction({ reaction: input.reaction, note: input.note }, row.date, todayISO());
  if (errs.length) return fail(errs.join("; "));
  const [existing] = await d.select().from(parentFeedback).where(and(eq(parentFeedback.sessionId, row.sessionId), eq(parentFeedback.studentId, child.id))).limit(1);
  if (existing && !reactionEditable(existing)) return fail("Trung tâm đã ghi nhận ý kiến của gia đình cho buổi này");
  const label = sessionLabel(row.seq, row.kind as SessionKind, row.originalSeq);
  const plan = reactionPlan(input.reaction, input.note, { studentName: child.fullName, sessionLabel: `${label} (${dmy(row.date)})` });

  return d.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    let id: string;
    if (existing) {
      await tx.update(parentFeedback).set({ rating: plan.rating, reaction: plan.reaction, comment: plan.comment, parentId }).where(eq(parentFeedback.id, existing.id));
      id = existing.id;
    } else {
      const [f] = await tx.insert(parentFeedback).values({
        centerId: row.centerId, studentId: child.id, parentId, classId: row.classId, sessionId: row.sessionId, teacherId: row.teacherId,
        rating: plan.rating, reaction: plan.reaction, tags: [], comment: plan.comment, channel: "app", createdBy: null,
      }).returning({ id: parentFeedback.id });
      id = f!.id;
    }
    let careTaskId: string | null = existing?.careTaskId ?? null;
    if (plan.care && !careTaskId) {
      const dedupeKey = `feedback:${id}`;
      const [open] = await tx.select({ id: careTasks.id }).from(careTasks).where(and(eq(careTasks.dedupeKey, dedupeKey), inArray(careTasks.status, ["open", "in_progress", "escalated"]))).limit(1);
      if (open) careTaskId = open.id;
      else {
        const [t] = await tx.insert(careTasks).values({
          studentId: child.id, enrollmentId: row.enrollmentId, centerId: row.centerId, code: plan.care.code, title: plan.care.title, severity: 2,
          dueAt: new Date(Date.now() + plan.care.hours * 3600e3), dedupeKey,
        }).returning({ id: careTasks.id });
        careTaskId = t!.id;
      }
      await tx.update(parentFeedback).set({ careTaskId }).where(eq(parentFeedback.id, id));
      await deliverNotifications(tx, await careStaffOf(tx, row.centerId), {
        title: "Phụ huynh cần trao đổi sau buổi học", body: `${child.fullName} · ${label}${plan.comment ? ` — ${plan.comment}` : ""}`.slice(0, 200),
        link: "/parent-feedback?low=1", priority: 1, type: "feedback.low",
      });
    }
    // Báo giáo viên đứng buổi khi phụ huynh cần trao đổi (thẻ trên app GV hiện mọi phản hồi)
    if (plan.reaction === "concern" && row.teacherId) {
      const [t] = await tx.select({ userId: teachers.userId }).from(teachers).where(eq(teachers.id, row.teacherId)).limit(1);
      if (t?.userId) {
        await deliverNotifications(tx, [t.userId], {
          title: `${SESSION_REACTION_VI.concern.emoji} Phụ huynh cần trao đổi`, body: `${child.fullName} · ${label}`, link: `/teacher/sessions/${row.sessionId}#phan-hoi-ph`, priority: 2,
          dedupeKey: `ph-concern:${id}`,
        });
      }
    }
    await writeAudit(tx, {
      actorId: null, action: existing ? "UPDATE" : "CREATE", module: "care", entity: "parent_feedback", entityId: id,
      before: existing ? { reaction: existing.reaction, rating: existing.rating } : null,
      after: { reaction: plan.reaction, rating: plan.rating, priority: plan.priority, via: "parent_app", parentId }, ip: meta.ip, tenantId: child.tenantId,
    });
    return { ok: true as const, reaction: plan.reaction, careTaskId };
  });
}

/* ------------------------------------------------------------------ */
/* SataCoin của con (chỉ đọc)                                           */
/* ------------------------------------------------------------------ */

/** Lý do mà ghi chú là của nhân sự (điều chỉnh / thu hồi) — không hiện ghi chú cho phụ huynh */
const INTERNAL_NOTE_REASONS = new Set(["adjust", "revoke"]);

export async function hubCoins(db: Database, parentId: string, studentId: string) {
  const child = await childOf(db, parentId, studentId);
  if (!child) return null;
  const d = asDb(db);
  const [sum] = await d.select({
    balance: sql<number>`coalesce(sum(${coinTransactions.amount}), 0)::int`,
    earned: sql<number>`coalesce(sum(${coinTransactions.amount}) filter (where ${coinTransactions.amount} > 0 and ${coinTransactions.reason} not in ('redeem_refund')), 0)::int`,
  }).from(coinTransactions).where(eq(coinTransactions.studentId, child.id));
  const [held] = await d.select({ n: sql<number>`coalesce(sum(${redemptions.cost}), 0)::int` }).from(redemptions).where(and(eq(redemptions.studentId, child.id), eq(redemptions.status, "requested")));
  const history = await d.select({ id: coinTransactions.id, amount: coinTransactions.amount, reason: coinTransactions.reason, note: coinTransactions.note, createdAt: coinTransactions.createdAt, classCode: classes.code })
    .from(coinTransactions).leftJoin(classes, eq(classes.id, coinTransactions.classId))
    .where(eq(coinTransactions.studentId, child.id)).orderBy(desc(coinTransactions.createdAt)).limit(50);
  const reds = await d.select({ id: redemptions.id, code: redemptions.code, status: redemptions.status, cost: redemptions.cost, createdAt: redemptions.createdAt, rewardName: rewardItems.name })
    .from(redemptions).innerJoin(rewardItems, eq(rewardItems.id, redemptions.rewardId)).where(eq(redemptions.studentId, child.id)).orderBy(desc(redemptions.createdAt)).limit(20);
  const rewards = await d.select({ id: rewardItems.id, name: rewardItems.name, description: rewardItems.description, cost: rewardItems.cost })
    .from(rewardItems).where(eq(rewardItems.isActive, true)).orderBy(asc(rewardItems.sortOrder), asc(rewardItems.cost)).limit(30);
  const balance = sum?.balance ?? 0;
  const available = availableBalance(balance, held?.n ?? 0);
  return {
    child: { id: child.id, fullName: child.fullName, nickname: child.nickname },
    balance, held: held?.n ?? 0, available, earned: sum?.earned ?? 0, tier: coinTier(sum?.earned ?? 0),
    history: history.map((h) => ({
      id: h.id, amount: h.amount, reasonLabel: COIN_REASON_VI[h.reason as CoinReason] ?? h.reason,
      note: INTERNAL_NOTE_REASONS.has(h.reason) ? null : h.note, createdAt: h.createdAt, classCode: h.classCode,
    })),
    redemptions: reds.map((r) => ({ ...r, statusLabel: REDEMPTION_STATUS_VI[r.status as RedemptionStatus] ?? r.status })),
    rewards: rewards.map((r) => ({ ...r, affordable: available >= r.cost, need: Math.max(0, r.cost - available) })),
  };
}

/* ------------------------------------------------------------------ */
/* Hành trình học                                                       */
/* ------------------------------------------------------------------ */

export async function hubJourney(db: Database, parentId: string, studentId: string) {
  const child = await childOf(db, parentId, studentId);
  if (!child) return null;
  const d = asDb(db);
  const view = await buildPortfolio(d, child.id, { scope: "all" });
  if (!view) return null;
  const enrIds = view.courses.map((c) => c.enrollmentId);
  const [prog, certRows, enrRows] = await Promise.all([
    enrIds.length
      ? d.select({
        id: enrollments.id,
        total: sql<number>`(select count(*)::int from ${sessions} s where s.class_id = ${enrollments.classId} and s.kind = 'regular' and s.status not in ('cancelled','rescheduled') and s.sequence_no >= ${enrollments.startSequenceNo})`,
      }).from(enrollments).where(inArray(enrollments.id, enrIds))
      : Promise.resolve([] as { id: string; total: number }[]),
    d.select({ id: certificates.id, number: certificates.number, kind: certificates.kind, verifyToken: certificates.verifyToken, snapshot: certificates.snapshot, issuedAt: certificates.issuedAt })
      .from(certificates).where(and(eq(certificates.studentId, child.id), eq(certificates.status, "valid"))).orderBy(asc(certificates.issuedAt)),
    d.select({ courseId: classes.courseId, status: enrollments.status }).from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).where(eq(enrollments.studentId, child.id)),
  ]);
  const certId = new Map(certRows.map((c) => [c.number, c.id]));
  // Đặt tên khác `courses` để không che mất bảng `courses` của Drizzle dùng ở truy vấn lộ trình bên dưới
  const journeyCourses: JourneyCourseInput[] = view.courses.map((c) => ({
    enrollmentId: c.enrollmentId, courseName: c.courseName, courseCode: c.courseCode, className: c.className, status: c.status, statusLabel: c.statusLabel,
    from: c.from, to: c.to,
    sessionsDone: c.attendance.present + c.attendance.late + c.attendance.makeup,
    sessionsTotal: Math.max(prog.find((p) => p.id === c.enrollmentId)?.total ?? 0, c.attendance.total),
    milestones: c.milestones.map((m) => ({ id: m.id, label: m.label, date: m.publishedAt ? m.publishedAt.slice(0, 10) : null, average: m.average })),
    certificate: c.certificate ? { number: c.certificate.certificateNo, issuedAt: c.certificate.issuedAt ? c.certificate.issuedAt.slice(0, 10) : null, verifyPath: c.certificate.verifyPath ?? null, certificateId: certId.get(c.certificate.certificateNo) ?? null } : null,
  }));
  const pathCerts: JourneyPathCertificate[] = certRows.filter((c) => c.kind === "path" && isCertificateSnapshot(c.snapshot)).map((c) => ({
    number: c.number, title: isCertificateSnapshot(c.snapshot) ? c.snapshot.pathName : "", issuedAt: isCertificateSnapshot(c.snapshot) ? c.snapshot.issuedDate : null,
    verifyPath: certificateVerifyPath(c.verifyToken), certificateId: c.id,
  }));

  // Lộ trình có chứa khoá con đã / đang học (cùng tenant với học viên)
  const courseIds = [...new Set(enrRows.map((e) => e.courseId))];
  const pathLinks = courseIds.length
    ? await d.select({ pathId: learningPathCourses.pathId }).from(learningPathCourses).innerJoin(learningPaths, eq(learningPaths.id, learningPathCourses.pathId))
      .where(and(inArray(learningPathCourses.courseId, courseIds), eq(learningPaths.isActive, true), child.tenantId ? or(isNull(learningPaths.tenantId), eq(learningPaths.tenantId, child.tenantId))! : sql`true`))
    : [];
  const pathIds = [...new Set(pathLinks.map((p) => p.pathId))].slice(0, 5);
  let pathRows: { id: string; code: string; name: string }[] = [];
  let pathCourseRows: { pathId: string; courseId: string; seq: number; required: boolean; name: string; code: string }[] = [];
  let completions: { courseId: string; status: string; revokedAt: Date | null }[] = [];
  if (pathIds.length) {
    [pathRows, pathCourseRows, completions] = await Promise.all([
      d.select({ id: learningPaths.id, code: learningPaths.code, name: learningPaths.name }).from(learningPaths).where(inArray(learningPaths.id, pathIds)),
      d.select({ pathId: learningPathCourses.pathId, courseId: learningPathCourses.courseId, seq: learningPathCourses.seq, required: learningPathCourses.required, name: courses.name, code: courses.code })
        .from(learningPathCourses).innerJoin(courses, eq(courses.id, learningPathCourses.courseId)).where(inArray(learningPathCourses.pathId, pathIds)),
      d.select({ courseId: courseCompletions.courseId, status: courseCompletions.status, revokedAt: courseCompletions.revokedAt })
        .from(courseCompletions).innerJoin(enrollments, eq(enrollments.id, courseCompletions.enrollmentId)).where(eq(enrollments.studentId, child.id)),
    ]);
  }
  const activeCourseIds = enrRows.filter((e) => ["active", "trial", "paused"].includes(e.status)).map((e) => e.courseId);
  const paths = pathRows.map((p) => {
    const pr = pathProgress(pathCourseRows.filter((x) => x.pathId === p.id), completions, activeCourseIds);
    return { id: p.id, code: p.code, name: p.name, percent: pr.percent, completed: pr.requiredCompleted, total: pr.requiredTotal, eligible: pr.eligible, courses: pr.courses.map((c) => ({ name: c.name ?? "", state: c.state, required: c.required })) };
  });

  return {
    child: { id: child.id, fullName: child.fullName, nickname: child.nickname },
    view,
    journey: buildJourney(journeyCourses, pathCerts),
    paths,
    certificates: certRows.map((c) => ({
      id: c.id, number: c.number, kind: c.kind, title: isCertificateSnapshot(c.snapshot) ? c.snapshot.pathName : c.number,
      issuedAt: c.issuedAt, verifyPath: certificateVerifyPath(c.verifyToken),
    })),
  };
}
