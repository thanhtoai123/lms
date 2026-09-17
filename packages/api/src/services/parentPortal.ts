import { createHash, randomBytes } from "node:crypto";
import { and, eq, inArray, sql, desc, asc, isNull, gte, lte, gt, or } from "drizzle-orm";
import {
  parents, parentSessions, students, studentGuardians, enrollments, classes, sessions, attendance, rooms, centers, teachers, courses,
  assignments, submissions, reportCards, reportCardScores, competencyCriteria, orders, payments, paymentMethods, parentNotifications,
  consentRecords, coinTransactions, type Database,
} from "@satarobo/db";
import {
  normalizeVnPhone, maskPhone, transferMemo, vietQrImageUrl, CONSENT_PURPOSES, CONSENT_PURPOSE_VI, CONSENT_TEXT_VERSION, ATTENDANCE_STATUS_VI,
  type ConsentPurpose, type AttendanceStatus,
} from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { requestOtp, verifyOtp } from "./admin";
import { verifyActivationCode } from "./parentAccounts";
import { todayISO } from "./sessions";
import { invoicesForParent } from "./einvoice";
import { cardForParent } from "./qrAttendance";

type Db = ProtectedContext["db"];
const asDb = (d: Database) => d as unknown as Db;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const PARENT_SESSION_DAYS = 30;
export const PARENT_COOKIE = "ph_session";

function phoneVariants(pn: string) {
  return [...new Set([pn, `0${pn.slice(2)}`])];
}
async function findParentByPhone(d: Db, phone: string) {
  const pn = normalizeVnPhone(phone);
  if (!pn) return null;
  const rows = await d.select().from(parents).where(and(inArray(parents.phone, phoneVariants(pn)), isNull(parents.deletedAt), isNull(parents.anonymizedAt))).limit(2);
  if (rows.length !== 1) return null;
  const p = rows[0]!;
  const [kid] = await d.select({ n: sql<number>`count(*)::int` }).from(studentGuardians).where(eq(studentGuardians.parentId, p.id));
  return kid?.n ? p : null;
}

/** Gửi OTP đăng nhập — không tiết lộ số có tồn tại hay không */
export async function parentRequestOtp(db: Database, input: { phone: string; ip: string | null; userAgent: string | null }) {
  const d = asDb(db);
  const p = await findParentByPhone(d, input.phone);
  if (!p || p.accountStatus === "locked" || p.processingRestricted) {
    return { ok: true as const, delivered: false, note: "Nếu số điện thoại đã đăng ký với trung tâm, mã sẽ được gửi qua Zalo." };
  }
  const r = await requestOtp(db, { phone: input.phone, purpose: "parent_login", ip: input.ip, userAgent: input.userAgent });
  if (!r.ok) return r;
  return { ok: true as const, delivered: r.delivered, note: "Nếu số điện thoại đã đăng ký với trung tâm, mã sẽ được gửi qua Zalo.", ...("devCode" in r ? { devCode: r.devCode } : {}) };
}

export async function parentLogin(db: Database, input: { phone: string; method: "otp" | "code"; code: string; ip: string | null; userAgent: string | null }) {
  const d = asDb(db);
  const p = await findParentByPhone(d, input.phone);
  const generic = { ok: false as const, error: "Số điện thoại hoặc mã không đúng" };
  if (input.method === "otp") {
    const v = await verifyOtp(db, { phone: input.phone, purpose: "parent_login", code: input.code });
    if (!v.ok) return { ok: false as const, error: v.error };
    if (!p) return generic;
  } else {
    const v = await verifyActivationCode(d, { phone: normalizeVnPhone(input.phone) ?? input.phone, code: input.code });
    if (!v.ok || !p || v.parentId !== p.id) return { ok: false as const, error: v.ok ? generic.error : v.error };
  }
  if (p.accountStatus === "locked") return { ok: false as const, error: "Tài khoản đang bị khoá — liên hệ trung tâm" };
  if (p.processingRestricted) return { ok: false as const, error: "Tài khoản đã hạn chế xử lý dữ liệu — liên hệ trung tâm" };
  const now = new Date();
  await d.update(parents).set({
    lastLoginAt: now, updatedAt: now,
    ...(p.accountStatus !== "active" ? { accountStatus: "active" as const, activatedAt: p.activatedAt ?? now, activationCodeHash: null, activationCodeExpiresAt: null } : {}),
  }).where(eq(parents.id, p.id));
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + PARENT_SESSION_DAYS * 86_400_000);
  await d.insert(parentSessions).values({ parentId: p.id, tokenHash: sha(token), method: input.method, ip: input.ip, userAgent: input.userAgent?.slice(0, 200) ?? null, expiresAt });
  return { ok: true as const, token, expiresAt, firstLogin: p.accountStatus !== "active" };
}

export async function parentFromToken(db: Database, token: string | null | undefined) {
  if (!token || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const d = asDb(db);
  const [r] = await d.select({ s: parentSessions, p: parents }).from(parentSessions).innerJoin(parents, eq(parents.id, parentSessions.parentId))
    .where(and(eq(parentSessions.tokenHash, sha(token)), isNull(parentSessions.revokedAt), gt(parentSessions.expiresAt, new Date()))).limit(1);
  if (!r || r.p.accountStatus !== "active" || r.p.deletedAt || r.p.anonymizedAt || r.p.processingRestricted) return null;
  if (Date.now() - r.s.lastSeenAt.getTime() > 5 * 60_000) {
    await d.update(parentSessions).set({ lastSeenAt: new Date() }).where(eq(parentSessions.id, r.s.id));
    if (!r.p.lastLoginAt || Date.now() - r.p.lastLoginAt.getTime() > 3_600_000) await d.update(parents).set({ lastLoginAt: new Date() }).where(eq(parents.id, r.p.id));
  }
  return { id: r.p.id, sessionId: r.s.id, fullName: r.p.fullName, phone: maskPhone(normalizeVnPhone(r.p.phone) ?? r.p.phone), email: r.p.email };
}

export async function parentLogout(db: Database, token: string, all = false) {
  const d = asDb(db);
  const s = await d.query.parentSessions.findFirst({ where: eq(parentSessions.tokenHash, sha(token)) });
  if (!s) return;
  await d.update(parentSessions).set({ revokedAt: new Date() }).where(all ? and(eq(parentSessions.parentId, s.parentId), isNull(parentSessions.revokedAt)) : eq(parentSessions.id, s.id));
}

export async function parentSessionsList(db: Database, parentId: string, currentId: string) {
  const rows = await asDb(db).select().from(parentSessions).where(and(eq(parentSessions.parentId, parentId), isNull(parentSessions.revokedAt), gt(parentSessions.expiresAt, new Date()))).orderBy(desc(parentSessions.lastSeenAt));
  return rows.map((r) => ({ id: r.id, current: r.id === currentId, method: r.method, userAgent: r.userAgent, lastSeenAt: r.lastSeenAt, createdAt: r.createdAt }));
}
export async function revokeParentSession(db: Database, parentId: string, id: string) {
  await asDb(db).update(parentSessions).set({ revokedAt: new Date() }).where(and(eq(parentSessions.id, id), eq(parentSessions.parentId, parentId)));
}

/* ------------------------------------------------------------------ */
/* Dữ liệu                                                              */
/* ------------------------------------------------------------------ */

async function childIds(d: Db, parentId: string) {
  return (await d.select({ id: studentGuardians.studentId }).from(studentGuardians).where(eq(studentGuardians.parentId, parentId))).map((r) => r.id);
}

async function balances(d: Db, parentId: string) {
  const os = await d.select({ id: orders.id, code: orders.code, total: orders.total, status: orders.status, centerId: orders.centerId, createdAt: orders.createdAt, student: students.fullName,
    paid: sql<number>`(select coalesce(sum(p.amount), 0)::float from ${payments} p where p.order_id = ${orders.id} and p.status = 'confirmed')` })
    .from(orders).leftJoin(students, eq(students.id, orders.studentId))
    .where(or(eq(orders.parentId, parentId), inArray(orders.studentId, (await childIds(d, parentId)).concat(["00000000-0000-0000-0000-000000000000"])))!).orderBy(desc(orders.createdAt)).limit(50);
  return os.map((o) => ({ ...o, remaining: Math.max(0, o.total - o.paid) }));
}

export async function portalHome(db: Database, parentId: string) {
  const d = asDb(db);
  const ids = await childIds(d, parentId);
  const today = todayISO();
  const kids = ids.length ? await d.select({ id: students.id, fullName: students.fullName, nickname: students.nickname, code: students.code, status: students.status }).from(students).where(inArray(students.id, ids)).orderBy(asc(students.fullName)) : [];
  const upcoming = ids.length ? await d.select({ studentId: enrollments.studentId, date: sessions.date, start: sessions.startTime, end: sessions.endTime, classCode: classes.code, className: classes.name, room: rooms.name, center: centers.name, seq: sessions.sequenceNo })
    .from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).innerJoin(sessions, eq(sessions.classId, classes.id)).innerJoin(centers, eq(centers.id, classes.centerId)).leftJoin(rooms, eq(rooms.id, sessions.roomId))
    .where(and(inArray(enrollments.studentId, ids), inArray(enrollments.status, ["active", "trial"]), gte(sessions.date, today), inArray(sessions.status, ["scheduled", "in_progress"]), sql`${sessions.sequenceNo} >= ${enrollments.startSequenceNo}`))
    .orderBy(asc(sessions.date), asc(sessions.startTime)).limit(20) : [];
  const att = ids.length ? await d.select({ studentId: enrollments.studentId, status: attendance.status, n: sql<number>`count(*)::int` })
    .from(attendance).innerJoin(enrollments, eq(enrollments.id, attendance.enrollmentId)).innerJoin(sessions, eq(sessions.id, attendance.sessionId))
    .where(and(inArray(enrollments.studentId, ids), gte(sessions.date, new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10)))).groupBy(enrollments.studentId, attendance.status) : [];
  const hw = ids.length ? await d.select({ studentId: submissions.studentId, title: assignments.title, dueAt: assignments.dueAt, status: submissions.status, token: submissions.token, score: submissions.score, maxScore: assignments.maxScore })
    .from(submissions).innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .where(and(inArray(submissions.studentId, ids), inArray(submissions.status, ["assigned", "returned", "submitted", "graded"]), gte(assignments.dueAt, new Date(Date.now() - 14 * 86400e3)), inArray(assignments.status, ["published", "closed"])))
    .orderBy(asc(assignments.dueAt)).limit(30) : [];
  const [nt] = await d.select({ unread: sql<number>`count(*) filter (where ${parentNotifications.readAt} is null)::int` }).from(parentNotifications).where(and(eq(parentNotifications.parentId, parentId), eq(parentNotifications.channel, "in_app")));
  const bal = await balances(d, parentId);
  return {
    children: kids.map((k) => {
      const a = att.filter((x) => x.studentId === k.id);
      const total = a.reduce((s, x) => s + x.n, 0);
      const present = a.filter((x) => ["present", "late", "makeup"].includes(x.status)).reduce((s, x) => s + x.n, 0);
      return {
        ...k, next: upcoming.find((u) => u.studentId === k.id) ?? null, attendance30: { total, present, rate: total ? Math.round((present / total) * 100) : null },
        homework: hw.filter((h) => h.studentId === k.id && ["assigned", "returned"].includes(h.status)).map((h) => ({ title: h.title, dueAt: h.dueAt, status: h.status, link: `/bt/${h.token}` })),
      };
    }),
    upcoming: upcoming.slice(0, 8).map((u) => ({ ...u, student: kids.find((k) => k.id === u.studentId)?.fullName ?? "" })),
    debt: bal.filter((b) => b.remaining > 0 && ["pending_payment", "partially_paid"].includes(b.status)).reduce((s, b) => s + b.remaining, 0),
    unread: nt?.unread ?? 0,
  };
}

export async function portalChild(db: Database, parentId: string, studentId: string) {
  const d = asDb(db);
  const ids = await childIds(d, parentId);
  if (!ids.includes(studentId)) return null;
  const st = await d.query.students.findFirst({ where: eq(students.id, studentId) });
  if (!st) return null;
  const today = todayISO();
  const enr = await d.select({ id: enrollments.id, status: enrollments.status, packageSessions: enrollments.packageSessions, classCode: classes.code, className: classes.name, course: courses.name, center: centers.name, teacher: teachers.fullName, startSeq: enrollments.startSequenceNo })
    .from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).innerJoin(courses, eq(courses.id, classes.courseId)).innerJoin(centers, eq(centers.id, classes.centerId)).leftJoin(teachers, eq(teachers.id, classes.leadTeacherId))
    .where(and(eq(enrollments.studentId, studentId), inArray(enrollments.status, ["active", "trial", "paused", "completed"]))).orderBy(desc(enrollments.enrolledAt));
  const enrIds = enr.map((e) => e.id);
  const schedule = enrIds.length ? await d.select({ date: sessions.date, start: sessions.startTime, end: sessions.endTime, seq: sessions.sequenceNo, status: sessions.status, classCode: classes.code, room: rooms.name, att: attendance.status, remark: attendance.studentRemark })
    .from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).innerJoin(sessions, eq(sessions.classId, classes.id)).leftJoin(rooms, eq(rooms.id, sessions.roomId))
    .leftJoin(attendance, and(eq(attendance.sessionId, sessions.id), eq(attendance.enrollmentId, enrollments.id)))
    .where(and(inArray(enrollments.id, enrIds), sql`${sessions.sequenceNo} >= ${enrollments.startSequenceNo}`, gte(sessions.date, new Date(Date.now() - 60 * 86400e3).toISOString().slice(0, 10)), lte(sessions.date, new Date(Date.now() + 30 * 86400e3).toISOString().slice(0, 10))))
    .orderBy(asc(sessions.date), asc(sessions.startTime)).limit(120) : [];
  const hw = await d.select({ title: assignments.title, dueAt: assignments.dueAt, status: submissions.status, token: submissions.token, score: submissions.score, maxScore: assignments.maxScore, feedback: submissions.feedback })
    .from(submissions).innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .where(and(eq(submissions.studentId, studentId), inArray(assignments.status, ["published", "closed"]))).orderBy(desc(assignments.dueAt)).limit(30);
  const rcs = enrIds.length ? await d.select({ id: reportCards.id, milestone: reportCards.milestoneSeq, comment: reportCards.teacherComment, strengths: reportCards.strengths, improvements: reportCards.improvements, avg: reportCards.averageScore, publishedAt: reportCards.publishedAt, classCode: classes.code })
    .from(reportCards).innerJoin(enrollments, eq(enrollments.id, reportCards.enrollmentId)).innerJoin(classes, eq(classes.id, enrollments.classId))
    .where(and(inArray(reportCards.enrollmentId, enrIds), eq(reportCards.status, "published"))).orderBy(desc(reportCards.publishedAt)) : [];
  const scores = rcs.length ? await d.select({ rc: reportCardScores.reportCardId, name: competencyCriteria.name, score: reportCardScores.score, comment: reportCardScores.comment })
    .from(reportCardScores).innerJoin(competencyCriteria, eq(competencyCriteria.id, reportCardScores.criterionId)).where(inArray(reportCardScores.reportCardId, rcs.map((r) => r.id))).orderBy(asc(competencyCriteria.sortOrder)) : [];
  const [coin] = await d.select({ bal: coinTransactions.balanceAfter }).from(coinTransactions).where(eq(coinTransactions.studentId, studentId)).orderBy(desc(coinTransactions.createdAt)).limit(1);
  const card = await cardForParent(d, parentId, studentId);
  return {
    id: st.id, fullName: st.fullName, code: st.code, coins: coin?.bal ?? 0, card,
    enrollments: enr.map((e) => ({ ...e, attended: schedule.filter((s) => s.classCode === e.classCode && ["present", "late", "makeup"].includes(s.att ?? "")).length })),
    upcoming: schedule.filter((s) => s.date >= today && ["scheduled", "in_progress"].includes(s.status)).slice(0, 10),
    history: schedule.filter((s) => s.date < today || s.att).reverse().slice(0, 30).map((s) => ({ ...s, attLabel: s.att ? ATTENDANCE_STATUS_VI[s.att as AttendanceStatus] ?? s.att : null })),
    homework: hw.map((h) => ({ ...h, token: undefined, link: ["assigned", "returned", "submitted"].includes(h.status) ? `/bt/${h.token}` : null })),
    reportCards: rcs.map((r) => ({ ...r, scores: scores.filter((s) => s.rc === r.id) })),
  };
}

export async function portalFinance(db: Database, parentId: string) {
  const d = asDb(db);
  const bal = await balances(d, parentId);
  const methods = await d.select().from(paymentMethods).where(and(eq(paymentMethods.isActive, true), eq(paymentMethods.kind, "bank_transfer"))).orderBy(asc(paymentMethods.sortOrder));
  const pays = bal.length ? await d.select({ orderId: payments.orderId, amount: payments.amount, paidAt: payments.paidAt, receiptNo: payments.receiptNo, status: payments.status })
    .from(payments).where(and(inArray(payments.orderId, bal.map((b) => b.id)), inArray(payments.status, ["confirmed", "recorded"]))).orderBy(desc(payments.paidAt)) : [];
  const invoices = await invoicesForParent(d, parentId);
  return {
    orders: bal.map((o) => {
      const m = methods.find((x) => x.centerId === o.centerId) ?? methods.find((x) => !x.centerId) ?? null;
      const memo = transferMemo(o.code);
      return {
        ...o, payments: pays.filter((p) => p.orderId === o.id),
        transfer: o.remaining > 0 && m?.bankBin && m.accountNo ? { bank: m.bankName, accountNo: m.accountNo, accountName: m.accountName, memo, qr: vietQrImageUrl({ bankBin: m.bankBin, accountNo: m.accountNo, accountName: m.accountName, amount: o.remaining, memo }) } : null,
      };
    }),
    invoices,
  };
}

export async function portalNotifications(db: Database, parentId: string, markRead: boolean) {
  const d = asDb(db);
  const rows = await d.select({ id: parentNotifications.id, title: parentNotifications.title, body: parentNotifications.body, link: parentNotifications.link, createdAt: parentNotifications.createdAt, readAt: parentNotifications.readAt })
    .from(parentNotifications).where(and(eq(parentNotifications.parentId, parentId), eq(parentNotifications.channel, "in_app"))).orderBy(desc(parentNotifications.createdAt)).limit(100);
  if (markRead) await d.update(parentNotifications).set({ readAt: new Date(), status: "read" }).where(and(eq(parentNotifications.parentId, parentId), eq(parentNotifications.channel, "in_app"), isNull(parentNotifications.readAt), sql`${parentNotifications.template} <> 'MESSAGE_NEW'`));
  return rows.map((r) => ({ ...r, link: r.link && r.link.startsWith("/") && !r.link.startsWith("//") ? r.link : null }));
}

export async function portalConsents(db: Database, parentId: string) {
  const r = await asDb(db).select().from(consentRecords).where(and(eq(consentRecords.subjectType, "parent"), eq(consentRecords.subjectId, parentId))).orderBy(desc(consentRecords.createdAt));
  const p = await asDb(db).query.parents.findFirst({ where: eq(parents.id, parentId) });
  return CONSENT_PURPOSES.map((k) => {
    const last = r.find((x) => x.purpose === k);
    const fallback = k === "marketing" ? !p?.marketingOptOut : k === "media" ? !!p?.mediaConsent : true;
    return { purpose: k, label: CONSENT_PURPOSE_VI[k], granted: last ? last.granted : fallback, at: last?.createdAt ?? null, editable: k !== "service" };
  });
}

/** Phụ huynh tự đổi đồng ý tiếp thị / đăng ảnh (đồng ý dịch vụ rút qua yêu cầu với trung tâm) */
export async function setParentConsent(db: Database, parentId: string, purpose: ConsentPurpose, granted: boolean) {
  if (purpose === "service") return { ok: false as const, error: "Rút đồng ý cung cấp dịch vụ cần liên hệ trung tâm (ảnh hưởng việc học của con)" };
  const d = asDb(db);
  await d.transaction(async (tx) => {
    await tx.insert(consentRecords).values({ subjectType: "parent", subjectId: parentId, purpose, granted, source: "parent_app", textVersion: CONSENT_TEXT_VERSION });
    if (purpose === "marketing") await tx.update(parents).set({ marketingOptOut: !granted }).where(eq(parents.id, parentId));
    if (purpose === "media") await tx.update(parents).set({ mediaConsent: granted, mediaConsentAt: new Date() }).where(eq(parents.id, parentId));
  });
  return { ok: true as const };
}
