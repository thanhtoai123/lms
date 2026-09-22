/**
 * HỒ SƠ HỌC TẬP (portfolio) của học viên — docs/HO-SO-HOC-TAP.md.
 *
 * Gom xuyên suốt các khoá: lộ trình (khoá / lớp / cơ sở / thời gian / trạng thái), phiếu nhận xét buổi
 * đã phát hành, học bạ mốc đã gửi phụ huynh, chứng nhận đã duyệt, bộ sưu tập sản phẩm (ảnh đã duyệt +
 * phụ huynh đồng ý đăng ảnh), biểu đồ tiến bộ, chuyên cần.
 *
 * Bốn cửa vào, cùng MỘT hàm dựng dữ liệu (`buildPortfolio`) và cùng MỘT bộ component hiển thị:
 *  - nhân sự: `getPortfolio` (quyền `student:read` tại cơ sở, `assertTenant`, `redact` theo tenant);
 *  - phụ huynh đã đăng nhập cổng `/ph`: `portalPortfolio` (chỉ con của mình);
 *  - link chia sẻ `/hs/<token>`: `publicPortfolio` (token là quyền, có hạn, thu hồi được);
 *  - trang in nội bộ cho bộ xuất PDF phía máy chủ: `portfolioForRender` (chữ ký HMAC ngắn hạn).
 *
 * Dữ liệu trả ra KHÔNG BAO GIỜ gồm: SĐT / email / địa chỉ phụ huynh, ghi chú nội bộ của buổi
 * (`private_note`), lý do vắng, id nội bộ của phụ huynh.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  students, enrollments, classes, courses, centers, sessions, attendance, sessionEvaluations, reportCards, reportCardScores,
  competencyCriteria, courseCompletions, portfolioShares, portfolioExports, studentGuardians, users, certificates as certificateBook, type Database,
} from "@satarobo/db";
import {
  isSessionEvalSnapshot, sessionAverage, snapshotScores, progressSeries, tallyAttendance, sumAttendance, mean, milestoneLabel,
  inPortfolioScope, normalizePortfolioScope, validatePortfolioScope, portfolioScopeLabel, portfolioScopeQuery, clampPortfolioShareDays,
  portfolioShareExpiresAt, portfolioShareState, portfolioPath, portfolioShareMessage, isMilestoneAggregate, authorize,
  PORTFOLIO_TOKEN_RE, PORTFOLIO_SHARE_SCOPE_VI, PORTFOLIO_SHARE_STATE_VI, ENROLLMENT_STATUS_VI,
  type PortfolioScope, type PortfolioView, type PortfolioCourseView, type SessionSheetView, type MilestoneCardView,
  type PortfolioCertificate, type EnrollmentStatus, type PortfolioShareState,
  certificateVerifyPath, isCertificateSnapshot,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { assertTenant, redact, tenantCond } from "./tenantScope";
import { writeAudit } from "./audit";
import { evidenceMedia, type EvidenceMedia } from "./sessionEvaluations";
import { pdfRendererEnabled, renderPdf, PdfRenderUnavailable } from "./pdfRender";
import { putObject, signedFileUrl, signedPortfolioRenderPath } from "../storage";

type Db = ProtectedContext["db"];
const asDb = (d: unknown) => d as Db;
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
/** Hạn link mặc định — cấu hình bằng `PORTFOLIO_SHARE_DAYS` (mặc định 180 ngày) */
const defaultShareDays = () => clampPortfolioShareDays(Number(process.env.PORTFOLIO_SHARE_DAYS) || undefined);
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const dayOf = (d: Date | null | undefined) => (d ? new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10) : null);

/* ------------------------------------------------------------------ */
/* Dựng dữ liệu hồ sơ (dùng chung mọi cửa vào)                          */
/* ------------------------------------------------------------------ */

export async function buildPortfolio(db: Db, studentId: string, scopeIn: PortfolioScope, opts: { now?: Date } = {}): Promise<PortfolioView | null> {
  const scope = normalizePortfolioScope(scopeIn);
  const [st] = await db
    .select({ id: students.id, fullName: students.fullName, code: students.code, grade: students.grade, homeCenterId: students.homeCenterId, deletedAt: students.deletedAt })
    .from(students).where(eq(students.id, studentId)).limit(1);
  if (!st || st.deletedAt) return null;

  const enrs = (await db
    .select({
      id: enrollments.id, status: enrollments.status, enrolledAt: enrollments.enrolledAt, endedAt: enrollments.endedAt,
      classId: classes.id, classCode: classes.code, className: classes.name, courseId: courses.id, courseCode: courses.code, courseName: courses.name,
      courseLevel: courses.level, centerId: centers.id, centerName: centers.name,
    })
    .from(enrollments)
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(courses, eq(courses.id, classes.courseId))
    .innerJoin(centers, eq(centers.id, classes.centerId))
    .where(eq(enrollments.studentId, studentId))
    .orderBy(asc(enrollments.enrolledAt)))
    .filter((e) => scope.scope !== "course" || e.id === scope.enrollmentId);
  const enrIds = enrs.map((e) => e.id);
  const inRange = (enrollmentId: string, date: string | null) => inPortfolioScope({ enrollmentId, date }, scope);

  // Không có ghi danh nào thì truy vấn bằng id rỗng (không khớp dòng nào) — giữ một kiểu dữ liệu duy nhất
  const ids = enrIds.length ? enrIds : ["00000000-0000-0000-0000-000000000000"];
  const [evRows, attRows, cardRows, certRows] = await Promise.all([
      db.select({
        id: sessionEvaluations.id, enrollmentId: sessionEvaluations.enrollmentId, sessionId: sessionEvaluations.sessionId, status: sessionEvaluations.status,
        revision: sessionEvaluations.revision, publishedAt: sessionEvaluations.publishedAt, snapshot: sessionEvaluations.snapshot,
        objectiveResult: sessionEvaluations.objectiveResult, highlights: sessionEvaluations.highlights, productNote: sessionEvaluations.productNote,
        remark: sessionEvaluations.remark, mediaIds: sessionEvaluations.mediaIds, date: sessions.date, seq: sessions.sequenceNo,
      })
        .from(sessionEvaluations).innerJoin(sessions, eq(sessions.id, sessionEvaluations.sessionId))
        .where(and(inArray(sessionEvaluations.enrollmentId, ids), eq(sessionEvaluations.status, "published")))
        .orderBy(asc(sessions.date), asc(sessions.startTime)),
      db.select({ enrollmentId: attendance.enrollmentId, sessionId: attendance.sessionId, status: attendance.status, date: sessions.date })
        .from(attendance).innerJoin(sessions, eq(sessions.id, attendance.sessionId))
        .where(inArray(attendance.enrollmentId, ids)),
      db.select({
        id: reportCards.id, enrollmentId: reportCards.enrollmentId, seq: reportCards.milestoneSeq, publishedAt: reportCards.publishedAt, scale: reportCards.rubricScale,
        averageScore: reportCards.averageScore, teacherComment: reportCards.teacherComment, strengths: reportCards.strengths, improvements: reportCards.improvements,
        aggregate: reportCards.aggregate, authorName: users.fullName,
      })
        .from(reportCards).leftJoin(users, eq(users.id, reportCards.authorId))
        .where(and(inArray(reportCards.enrollmentId, ids), eq(reportCards.status, "published")))
        .orderBy(asc(reportCards.milestoneSeq)),
      db.select({ id: courseCompletions.id, enrollmentId: courseCompletions.enrollmentId, certificateNo: courseCompletions.certificateNo, grade: courseCompletions.grade, issuedAt: courseCompletions.issuedAt, courseName: courses.name })
        .from(courseCompletions).innerJoin(courses, eq(courses.id, courseCompletions.courseId))
        .where(and(inArray(courseCompletions.enrollmentId, ids), eq(courseCompletions.status, "approved"), isNull(courseCompletions.revokedAt))),
  ]);

  // Sổ chứng nhận (còn hiệu lực): mã QR xác thực của chứng nhận khoá + giấy chứng nhận hoàn thành lộ trình
  const certBook = await db
    .select({ kind: certificateBook.kind, courseCompletionId: certificateBook.courseCompletionId, number: certificateBook.number, issuedAt: certificateBook.issuedAt, verifyToken: certificateBook.verifyToken, snapshot: certificateBook.snapshot })
    .from(certificateBook)
    .where(and(eq(certificateBook.studentId, studentId), eq(certificateBook.status, "valid")))
    .orderBy(asc(certificateBook.issuedAt));

  const cardIds = cardRows.map((c) => c.id);
  const scoreRows = cardIds.length
    ? await db.select({ reportCardId: reportCardScores.reportCardId, criterionId: reportCardScores.criterionId, score: reportCardScores.score, comment: reportCardScores.comment, name: competencyCriteria.name, sortOrder: competencyCriteria.sortOrder })
      .from(reportCardScores).innerJoin(competencyCriteria, eq(competencyCriteria.id, reportCardScores.criterionId))
      .where(inArray(reportCardScores.reportCardId, cardIds)).orderBy(asc(competencyCriteria.sortOrder))
    : [];

  const sessionIds = [...new Set([...evRows.map((e) => e.sessionId), ...attRows.map((a) => a.sessionId)])];
  const mediaByStudent = await evidenceMedia(db, sessionIds, [studentId]);
  const allMedia: EvidenceMedia[] = mediaByStudent.get(studentId) ?? [];

  // Chân phiếu: cơ sở chính của học viên, không có thì cơ sở của khoá gần nhất
  const centerId = st.homeCenterId ?? enrs[enrs.length - 1]?.centerId ?? null;
  const [center] = centerId ? await db.select({ name: centers.name, address: centers.address, phone: centers.phone }).from(centers).where(eq(centers.id, centerId)).limit(1) : [];
  const centerView = center ?? null;

  const courseViews: PortfolioCourseView[] = [];
  const certificates: PortfolioCertificate[] = [];
  const gallery: PortfolioView["gallery"] = [];
  const progressInput: { date: string; sequenceNo: number; average: number | null; courseCode: string | null }[] = [];
  const seenMedia = new Set<string>();

  for (const e of enrs) {
    const sheetsRaw = evRows.filter((r) => r.enrollmentId === e.id && inRange(e.id, r.date) && isSessionEvalSnapshot(r.snapshot));
    const sheets: SessionSheetView[] = sheetsRaw.map((r) => {
      const snap = r.snapshot;
      const own = allMedia.filter((m) => m.sessionId === r.sessionId);
      const chosen = (r.mediaIds ?? []).length ? own.filter((m) => (r.mediaIds ?? []).includes(m.id)) : own.slice(0, 2);
      return {
        id: r.id, status: r.status, revision: r.revision, publishedAt: iso(r.publishedAt), snapshot: snap,
        objectiveResult: r.objectiveResult, highlights: r.highlights ?? [], productNote: r.productNote, remark: r.remark,
        media: chosen.map((m) => ({ id: m.id, url: m.url, caption: m.caption, date: m.date })),
        average: sessionAverage(snap), center: centerView,
      };
    });
    for (const s of sheets) progressInput.push({ date: s.snapshot.context.date, sequenceNo: s.snapshot.context.sequenceNo, average: s.average, courseCode: e.courseCode });

    const milestones: MilestoneCardView[] = cardRows
      .filter((c) => c.enrollmentId === e.id && inRange(e.id, dayOf(c.publishedAt)))
      .map((c) => {
        const agg = isMilestoneAggregate(c.aggregate) ? c.aggregate : null;
        return {
          id: c.id, milestoneSeq: c.seq, label: milestoneLabel(c.seq), publishedAt: iso(c.publishedAt), scale: c.scale,
          scores: scoreRows.filter((x) => x.reportCardId === c.id).map((x) => {
            const a = agg?.criteria.find((k) => k.criterionId === x.criterionId) ?? null;
            return { label: x.name, score: x.score, comment: x.comment, average: a?.average ?? null, trend: a?.trend ?? null };
          }),
          average: c.averageScore == null ? null : Number(c.averageScore),
          teacherComment: c.teacherComment, strengths: c.strengths, improvements: c.improvements, aggregate: agg,
          className: e.className, courseName: e.courseName, studentName: st.fullName, authorName: c.authorName ?? null,
        };
      });

    const cert = certRows.find((c) => c.enrollmentId === e.id && c.certificateNo);
    const certificate: PortfolioCertificate | null = cert && cert.certificateNo && inRange(e.id, dayOf(cert.issuedAt))
      ? {
          certificateNo: cert.certificateNo, grade: cert.grade, issuedAt: iso(cert.issuedAt), courseName: cert.courseName, kind: "course",
          verifyPath: (() => { const b = certBook.find((x) => x.courseCompletionId === cert.id); return b ? certificateVerifyPath(b.verifyToken) : null; })(),
        }
      : null;
    if (certificate) certificates.push(certificate);

    const att = tallyAttendance(attRows.filter((a) => a.enrollmentId === e.id && inRange(e.id, a.date)).map((a) => a.status));

    // Mạng nhện: điểm trung bình từng tiêu chí trong khoá (theo nhãn trong bản chụp)
    const labels: { key: string; label: string }[] = [];
    for (const s of sheets) for (const c of s.snapshot.criteria) if (!labels.some((l) => l.key === c.key)) labels.push({ key: c.key, label: c.label });
    const radar = labels.map((l) => ({ label: l.label, value: mean(sheets.map((s) => snapshotScores(s.snapshot)[l.key] ?? null)) }));

    const courseMedia = allMedia.filter((m) => sheetsRaw.some((r) => r.sessionId === m.sessionId) || attRows.some((a) => a.enrollmentId === e.id && a.sessionId === m.sessionId && inRange(e.id, a.date)));
    for (const m of courseMedia) {
      if (seenMedia.has(m.id)) continue;
      seenMedia.add(m.id);
      gallery.push({ id: m.id, url: m.url, caption: m.caption, date: m.date, courseName: e.courseName });
    }

    const hasContent = sheets.length || milestones.length || certificate || att.total;
    if (!hasContent && scope.scope === "range") continue;
    courseViews.push({
      enrollmentId: e.id, courseCode: e.courseCode, courseName: e.courseName, courseLevel: e.courseLevel ?? null,
      className: e.className, classCode: e.classCode, centerName: e.centerName, status: e.status,
      statusLabel: ENROLLMENT_STATUS_VI[e.status as EnrollmentStatus] ?? e.status,
      from: dayOf(e.enrolledAt), to: dayOf(e.endedAt),
      attendance: att, sheets, milestones, certificate, radar, average: mean(sheets.map((s) => s.average)),
    });
  }

  // Giấy chứng nhận hoàn thành LỘ TRÌNH: không gắn một khoá nào → không hiện khi hồ sơ chỉ lọc một khoá
  if (scope.scope !== "course") {
    for (const b of certBook) {
      if (b.kind !== "path" || !isCertificateSnapshot(b.snapshot)) continue;
      const day = b.snapshot.issuedDate;
      if (scope.scope === "range" && ((scope.from && day < scope.from) || (scope.to && day > scope.to))) continue;
      certificates.push({ certificateNo: b.number, grade: b.snapshot.grade ?? "", issuedAt: iso(b.issuedAt), courseName: b.snapshot.pathName, kind: "path", verifyPath: certificateVerifyPath(b.verifyToken) });
    }
  }

  const allDates = courseViews.flatMap((c) => [...c.sheets.map((s) => s.snapshot.context.date), c.from ?? "", c.to ?? ""]).filter(Boolean).sort();
  const scopeCourse = scope.scope === "course" ? enrs[0]?.courseName ?? null : null;
  return {
    student: { fullName: st.fullName, code: st.code, grade: st.grade },
    center: centerView,
    scopeLabel: portfolioScopeLabel(scope, scopeCourse),
    period: scope.scope === "range" ? { from: scope.from ?? null, to: scope.to ?? null } : { from: allDates[0] ?? null, to: allDates[allDates.length - 1] ?? null },
    generatedAt: (opts.now ?? new Date()).toISOString(),
    courses: courseViews,
    progress: progressSeries(progressInput),
    attendance: sumAttendance(courseViews.map((c) => c.attendance)),
    certificates,
    gallery: gallery.slice(0, 24),
    totals: {
      sheets: courseViews.reduce((a, c) => a + c.sheets.length, 0),
      milestones: courseViews.reduce((a, c) => a + c.milestones.length, 0),
      courses: courseViews.length,
      average: mean(courseViews.flatMap((c) => c.sheets.map((s) => s.average))),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Nhân sự                                                              */
/* ------------------------------------------------------------------ */

export async function loadStudentForStaff(ctx: ProtectedContext, studentId: string) {
  const st = await ctx.db.query.students.findFirst({ where: and(eq(students.id, studentId), isNull(students.deletedAt)) });
  if (!st) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy học viên" });
  assertTenant(ctx, st, "Học viên");
  // GV (quyền _own) xem được hồ sơ học viên lớp mình dạy
  const teacherRows = await ctx.db
    .select({ lead: classes.leadTeacherId, assistant: classes.assistantTeacherId, centerId: classes.centerId })
    .from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId))
    .where(eq(enrollments.studentId, studentId));
  const ownerIds = [...new Set(teacherRows.flatMap((r) => [r.lead, r.assistant]).filter((x): x is string => !!x))];
  const centerId = st.homeCenterId ?? teacherRows[0]?.centerId ?? null;
  return { st, ownerIds, centerId };
}

/** Chia sẻ / xuất PDF: người sửa được hồ sơ học viên hoặc người duyệt học bạ tại cơ sở */
function canShare(ctx: ProtectedContext, centerId: string | null) {
  return authorize(ctx.actor, "student:update", { centerId }).allowed || authorize(ctx.actor, "report_card:approve", { centerId }).allowed;
}

export async function getPortfolio(ctx: ProtectedContext, input: { studentId: string; enrollmentId?: string | null; from?: string | null; to?: string | null }) {
  const { st, ownerIds, centerId } = await loadStudentForStaff(ctx, input.studentId);
  requirePermission(ctx, "student:read", { centerId, ownerIds });
  const scope: PortfolioScope = input.enrollmentId
    ? { scope: "course", enrollmentId: input.enrollmentId }
    : input.from && input.to ? { scope: "range", from: input.from, to: input.to } : { scope: "all" };
  const errs = validatePortfolioScope(scope);
  if (errs.length) throw new TRPCError({ code: "BAD_REQUEST", message: errs.join("; ") });
  const view = await buildPortfolio(ctx.db, st.id, scope);
  if (!view) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy học viên" });
  const share = canShare(ctx, centerId);
  return {
    studentId: st.id,
    scopeQuery: portfolioScopeQuery(scope),
    view: redact(ctx, view, st.tenantId),
    perms: { share, export: share && pdfRendererEnabled() },
    enrollments: view.courses.map((c) => ({ id: c.enrollmentId, label: `${c.courseName} · ${c.classCode}` })),
  };
}

/** Danh sách lựa chọn khoá để chia sẻ theo khoá (kể cả khoá chưa có phiếu) */
export async function portfolioOptions(ctx: ProtectedContext, studentId: string) {
  const { st, ownerIds, centerId } = await loadStudentForStaff(ctx, studentId);
  requirePermission(ctx, "student:read", { centerId, ownerIds });
  const rows = await ctx.db
    .select({ id: enrollments.id, status: enrollments.status, classCode: classes.code, courseName: courses.name, enrolledAt: enrollments.enrolledAt })
    .from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).innerJoin(courses, eq(courses.id, classes.courseId))
    .where(eq(enrollments.studentId, st.id)).orderBy(desc(enrollments.enrolledAt));
  const [counts] = await ctx.db
    .select({ sheets: sql<number>`count(*) filter (where ${sessionEvaluations.status} = 'published')::int` })
    .from(sessionEvaluations).where(eq(sessionEvaluations.studentId, st.id));
  const share = canShare(ctx, centerId);
  return {
    studentId: st.id,
    fullName: st.fullName,
    sheets: counts?.sheets ?? 0,
    enrollments: rows.map((r) => ({ id: r.id, label: `${r.courseName} · ${r.classCode}`, status: r.status })),
    perms: { share, export: share && pdfRendererEnabled() },
    exportEnabled: pdfRendererEnabled(),
  };
}

/* ------------------------------------------------------------------ */
/* Link chia sẻ                                                         */
/* ------------------------------------------------------------------ */

function shareScopeOf(r: { scope: PortfolioScope["scope"]; enrollmentId: string | null; fromDate: string | null; toDate: string | null }): PortfolioScope {
  return { scope: r.scope, enrollmentId: r.enrollmentId, from: r.fromDate, to: r.toDate };
}

export async function listShares(ctx: ProtectedContext, studentId: string) {
  const { st, ownerIds, centerId } = await loadStudentForStaff(ctx, studentId);
  requirePermission(ctx, "student:read", { centerId, ownerIds });
  const share = canShare(ctx, centerId);
  const [rows, exps] = await Promise.all([
    ctx.db
      .select({ s: portfolioShares, createdByName: users.fullName, courseName: courses.name, classCode: classes.code })
      .from(portfolioShares)
      .leftJoin(users, eq(users.id, portfolioShares.createdBy))
      .leftJoin(enrollments, eq(enrollments.id, portfolioShares.enrollmentId))
      .leftJoin(classes, eq(classes.id, enrollments.classId))
      .leftJoin(courses, eq(courses.id, classes.courseId))
      .where(and(eq(portfolioShares.studentId, st.id), tenantCond(ctx, portfolioShares)))
      .orderBy(desc(portfolioShares.createdAt))
      .limit(50),
    ctx.db
      .select({ id: portfolioExports.id, fileKey: portfolioExports.fileKey, sizeBytes: portfolioExports.sizeBytes, scope: portfolioExports.scope, enrollmentId: portfolioExports.enrollmentId, fromDate: portfolioExports.fromDate, toDate: portfolioExports.toDate, createdAt: portfolioExports.createdAt, createdByName: users.fullName })
      .from(portfolioExports).leftJoin(users, eq(users.id, portfolioExports.createdBy))
      .where(and(eq(portfolioExports.studentId, st.id), tenantCond(ctx, portfolioExports)))
      .orderBy(desc(portfolioExports.createdAt))
      .limit(20),
  ]);
  const now = new Date();
  return {
    canShare: share,
    exportEnabled: pdfRendererEnabled(),
    shares: rows.map(({ s, createdByName, courseName, classCode }) => {
      const state: PortfolioShareState = portfolioShareState(s, now);
      const url = `${appUrl()}${portfolioPath(s.token)}`;
      return {
        id: s.id, state, stateLabel: PORTFOLIO_SHARE_STATE_VI[state], scope: s.scope, scopeLabel: portfolioScopeLabel(shareScopeOf(s), courseName ? `${courseName} (${classCode ?? ""})` : null),
        label: s.label, expiresAt: s.expiresAt, revokedAt: s.revokedAt, revokeReason: s.revokeReason, viewCount: s.viewCount, lastViewedAt: s.lastViewedAt,
        createdAt: s.createdAt, createdByName: createdByName ?? null,
        // Người được chia sẻ mới cần thấy lại link (để sao chép gửi lại)
        url: share && state === "ok" ? url : null,
        message: share && state === "ok" ? portfolioShareMessage(st.fullName, url) : null,
      };
    }),
    exports: exps.map((x) => ({
      id: x.id, sizeBytes: x.sizeBytes, scopeLabel: PORTFOLIO_SHARE_SCOPE_VI[x.scope], createdAt: x.createdAt, createdByName: x.createdByName ?? null,
      url: signedFileUrl(x.fileKey, `ho-so-hoc-tap-${(st.code ?? "hv").replace(/[^A-Za-z0-9_-]/g, "")}-${x.createdAt.toISOString().slice(0, 10)}.pdf`, 900, true),
    })),
  };
}

export async function createShare(ctx: ProtectedContext, input: { studentId: string; scope: PortfolioScope["scope"]; enrollmentId?: string | null; from?: string | null; to?: string | null; days?: number | null; label?: string | null }) {
  const { st, centerId } = await loadStudentForStaff(ctx, input.studentId);
  if (!canShare(ctx, centerId)) throw new TRPCError({ code: "FORBIDDEN", message: "Bạn không có quyền chia sẻ hồ sơ học tập của học viên này" });
  const scope = normalizePortfolioScope({ scope: input.scope, enrollmentId: input.enrollmentId, from: input.from, to: input.to });
  const errs = validatePortfolioScope(scope);
  if (errs.length) throw new TRPCError({ code: "BAD_REQUEST", message: errs.join("; ") });
  if (scope.scope === "course") {
    const [e] = await ctx.db.select({ id: enrollments.id }).from(enrollments).where(and(eq(enrollments.id, scope.enrollmentId ?? ""), eq(enrollments.studentId, st.id))).limit(1);
    if (!e) throw new TRPCError({ code: "BAD_REQUEST", message: "Khoá học không thuộc học viên này" });
  }
  // ≥ 32 byte ngẫu nhiên, base64url (43 ký tự) — chính là quyền xem hồ sơ
  const token = randomBytes(32).toString("base64url");
  const days = clampPortfolioShareDays(input.days ?? defaultShareDays());
  const expiresAt = portfolioShareExpiresAt(new Date(), days);
  const label = (input.label ?? "").trim().slice(0, 120) || null;
  const row = await ctx.db.transaction(async (txx) => {
    const tx = asDb(txx);
    const [r] = await tx.insert(portfolioShares).values({
      tenantId: st.tenantId, centerId, studentId: st.id, token, scope: scope.scope, enrollmentId: scope.enrollmentId ?? null,
      fromDate: scope.from ?? null, toDate: scope.to ?? null, label, expiresAt, createdBy: ctx.user.id,
    }).returning({ id: portfolioShares.id });
    // Token KHÔNG ghi vào nhật ký
    await writeAudit(tx, { actorId: ctx.user.id, action: "CREATE", module: "students", entity: "portfolio_shares", entityId: r!.id, after: { studentId: st.id, scope: scope.scope, enrollmentId: scope.enrollmentId ?? null, from: scope.from ?? null, to: scope.to ?? null, days, label }, ip: ctx.ip });
    return r!;
  });
  const url = `${appUrl()}${portfolioPath(token)}`;
  return { id: row.id, url, expiresAt, message: portfolioShareMessage(st.fullName, url) };
}

export async function revokeShare(ctx: ProtectedContext, input: { id: string; reason: string }) {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new TRPCError({ code: "BAD_REQUEST", message: "Nhập lý do thu hồi (tối thiểu 3 ký tự)" });
  const [s] = await ctx.db.select().from(portfolioShares).where(eq(portfolioShares.id, input.id)).limit(1);
  if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy link chia sẻ" });
  assertTenant(ctx, s, "Link chia sẻ");
  const { centerId } = await loadStudentForStaff(ctx, s.studentId);
  if (!canShare(ctx, centerId)) throw new TRPCError({ code: "FORBIDDEN", message: "Bạn không có quyền thu hồi link này" });
  if (s.revokedAt) return { ok: true, already: true };
  await ctx.db.transaction(async (txx) => {
    const tx = asDb(txx);
    await tx.update(portfolioShares).set({ revokedAt: new Date(), revokedBy: ctx.user.id, revokeReason: reason }).where(and(eq(portfolioShares.id, s.id), isNull(portfolioShares.revokedAt)));
    await writeAudit(tx, { actorId: ctx.user.id, action: "TRANSITION", module: "students", entity: "portfolio_shares", entityId: s.id, before: { revoked: false }, after: { revoked: true }, reason, ip: ctx.ip });
  });
  return { ok: true, already: false };
}

/* ------------------------------------------------------------------ */
/* Xuất PDF phía máy chủ (tuỳ chọn)                                      */
/* ------------------------------------------------------------------ */

export async function exportPortfolioPdf(ctx: ProtectedContext, input: { studentId: string; scope: PortfolioScope["scope"]; enrollmentId?: string | null; from?: string | null; to?: string | null }) {
  const { st, centerId } = await loadStudentForStaff(ctx, input.studentId);
  if (!canShare(ctx, centerId)) throw new TRPCError({ code: "FORBIDDEN", message: "Bạn không có quyền xuất hồ sơ học tập của học viên này" });
  if (!pdfRendererEnabled()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Chưa bật xuất PDF phía máy chủ — dùng nút \"In / Lưu PDF\"" });
  const scope = normalizePortfolioScope({ scope: input.scope, enrollmentId: input.enrollmentId, from: input.from, to: input.to });
  const errs = validatePortfolioScope(scope);
  if (errs.length) throw new TRPCError({ code: "BAD_REQUEST", message: errs.join("; ") });
  let pdf: Uint8Array;
  try {
    pdf = await renderPdf(signedPortfolioRenderPath(st.id, portfolioScopeQuery(scope)));
  } catch (e) {
    if (e instanceof PdfRenderUnavailable || (e as { name?: string })?.name === "PdfRenderUnavailable") throw new TRPCError({ code: "PRECONDITION_FAILED", message: (e as Error).message });
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Không xuất được PDF — thử lại sau ít phút", cause: e as Error });
  }
  const id = randomUUID();
  const key = `portfolio/${st.id}/${id}.pdf`;
  await putObject(key, pdf);
  await ctx.db.transaction(async (txx) => {
    const tx = asDb(txx);
    await tx.insert(portfolioExports).values({
      id, tenantId: st.tenantId, centerId, studentId: st.id, fileKey: key, sizeBytes: pdf.byteLength, scope: scope.scope,
      enrollmentId: scope.enrollmentId ?? null, fromDate: scope.from ?? null, toDate: scope.to ?? null, createdBy: ctx.user.id,
    });
    await writeAudit(tx, { actorId: ctx.user.id, action: "CREATE", module: "students", entity: "portfolio_exports", entityId: id, after: { studentId: st.id, scope: scope.scope, sizeBytes: pdf.byteLength }, ip: ctx.ip });
  });
  return { id, sizeBytes: pdf.byteLength, url: signedFileUrl(key, `ho-so-hoc-tap-${(st.code ?? "hv").replace(/[^A-Za-z0-9_-]/g, "")}.pdf`, 900, true) };
}

/* ------------------------------------------------------------------ */
/* Một học bạ mốc (in riêng)                                             */
/* ------------------------------------------------------------------ */

export async function getMilestoneCardView(ctx: ProtectedContext, reportCardId: string): Promise<MilestoneCardView & { status: string; studentId: string; enrollmentId: string; center: { name: string; address: string | null; phone: string | null } | null }> {
  const [r] = await ctx.db
    .select({
      card: reportCards, studentId: students.id, studentName: students.fullName, studentTenantId: students.tenantId,
      className: classes.name, centerId: classes.centerId, leadTeacherId: classes.leadTeacherId, assistantTeacherId: classes.assistantTeacherId,
      courseName: courses.name, authorName: users.fullName, centerName: centers.name, centerAddress: centers.address, centerPhone: centers.phone,
    })
    .from(reportCards)
    .innerJoin(enrollments, eq(enrollments.id, reportCards.enrollmentId))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .innerJoin(courses, eq(courses.id, classes.courseId))
    .innerJoin(centers, eq(centers.id, classes.centerId))
    .leftJoin(users, eq(users.id, reportCards.authorId))
    .where(eq(reportCards.id, reportCardId))
    .limit(1);
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy học bạ" });
  assertTenant(ctx, { tenantId: r.studentTenantId }, "Học bạ");
  requirePermission(ctx, "report_card:read", { centerId: r.centerId, ownerIds: [r.leadTeacherId ?? "", r.assistantTeacherId ?? ""].filter(Boolean) });
  const scores = await ctx.db
    .select({ criterionId: reportCardScores.criterionId, score: reportCardScores.score, comment: reportCardScores.comment, name: competencyCriteria.name })
    .from(reportCardScores).innerJoin(competencyCriteria, eq(competencyCriteria.id, reportCardScores.criterionId))
    .where(eq(reportCardScores.reportCardId, r.card.id)).orderBy(asc(competencyCriteria.sortOrder));
  const agg = isMilestoneAggregate(r.card.aggregate) ? r.card.aggregate : null;
  return {
    id: r.card.id, status: r.card.status, studentId: r.studentId, enrollmentId: r.card.enrollmentId,
    milestoneSeq: r.card.milestoneSeq, label: milestoneLabel(r.card.milestoneSeq), publishedAt: iso(r.card.publishedAt), scale: r.card.rubricScale,
    scores: scores.map((x) => {
      const a = agg?.criteria.find((k) => k.criterionId === x.criterionId) ?? null;
      return { label: x.name, score: x.score, comment: x.comment, average: a?.average ?? null, trend: a?.trend ?? null };
    }),
    average: r.card.averageScore == null ? null : Number(r.card.averageScore),
    teacherComment: r.card.teacherComment, strengths: r.card.strengths, improvements: r.card.improvements, aggregate: agg,
    className: r.className, courseName: r.courseName, studentName: r.studentName, authorName: r.authorName ?? null,
    center: { name: r.centerName, address: r.centerAddress, phone: r.centerPhone },
  };
}

/** Trang in nội bộ cho bộ xuất PDF (đã xác thực bằng chữ ký HMAC ở trang) */
export async function portfolioForRender(db: Database, studentId: string, scope: PortfolioScope): Promise<PortfolioView | null> {
  return buildPortfolio(asDb(db), studentId, scope);
}

/* ------------------------------------------------------------------ */
/* Phụ huynh đã đăng nhập cổng /ph                                       */
/* ------------------------------------------------------------------ */

export async function portalPortfolio(db: Database, parentId: string, studentId: string, scope: PortfolioScope = { scope: "all" }): Promise<PortfolioView | null> {
  const d = asDb(db);
  const [g] = await d.select({ id: studentGuardians.studentId }).from(studentGuardians).where(and(eq(studentGuardians.parentId, parentId), eq(studentGuardians.studentId, studentId))).limit(1);
  if (!g) return null;
  return buildPortfolio(d, studentId, scope);
}

/* ------------------------------------------------------------------ */
/* CÔNG KHAI — link chia sẻ /hs/<token> (token là quyền)                */
/* ------------------------------------------------------------------ */

export type PublicPortfolioResult =
  | { state: "not_found" }
  | { state: "expired" | "revoked"; center: { name: string; phone: string | null } | null }
  | { state: "ok"; view: PortfolioView };

export async function publicPortfolio(db: Database, token: string): Promise<PublicPortfolioResult> {
  if (!PORTFOLIO_TOKEN_RE.test(token)) return { state: "not_found" };
  const d = asDb(db);
  const [s] = await d.select().from(portfolioShares).where(eq(portfolioShares.token, token)).limit(1);
  if (!s) return { state: "not_found" };
  const st = portfolioShareState(s, new Date());
  if (st !== "ok") {
    const [c] = s.centerId ? await d.select({ name: centers.name, phone: centers.phone }).from(centers).where(eq(centers.id, s.centerId)).limit(1) : [];
    return { state: st, center: c ?? null };
  }
  const view = await buildPortfolio(d, s.studentId, shareScopeOf(s));
  if (!view) return { state: "not_found" };
  try {
    // SQL thô để không chạm updated_at (xem không phải là sửa)
    await d.execute(sql`update portfolio_shares set view_count = view_count + 1, first_viewed_at = coalesce(first_viewed_at, now()), last_viewed_at = now() where id = ${s.id}`);
  } catch {
    // Đếm lượt xem là phụ — lỗi cũng không chặn người xem
  }
  return { state: "ok", view };
}

