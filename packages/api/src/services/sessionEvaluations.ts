/**
 * PHIẾU NHẬN XÉT BUỔI HỌC (docs/HO-SO-HOC-TAP.md).
 *
 * Luồng giáo viên (một chạm, không thêm tab): ở màn điểm danh / nhận xét buổi, mỗi học viên có mặt
 * có một khối gọn — hàng tiêu chí × 4 nút mức, 3 nút mục tiêu bài, thẻ nổi bật, ô "Sản phẩm",
 * ô nhận xét (chính là `attendance.student_remark`). Lưu nháp tự động (`saveEvaluations`).
 * Khi GV hoàn tất buổi, `publishSessionEvaluations` phát hành mọi phiếu nháp đủ điều kiện
 * TRONG CÙNG transaction chuyển trạng thái buổi; phiếu thiếu tiêu chí thì chặn hoàn tất
 * (trừ khi cấu hình vận hành `sessionRequireEvaluations` tắt).
 *
 * Quyền: xem = `session:read` (GV: buổi mình dạy); điền / sửa = `session_note:write` (GV: `_own`).
 * Mọi truy vấn danh sách có `tenantCond`; nạp theo id có `assertTenant`; mọi thao tác ghi có
 * `writeAudit` TRONG transaction.
 */
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  sessionEvaluations, sessions, classes, courses, centers, lessons, teachers, enrollments, students, attendance, competencyCriteria,
  sessionMedia, studentGuardians, parents, appSettings,
} from "@satarobo/db";
import {
  buildSessionSnapshot, applySessionScores, rebaseSnapshot, snapshotScores, isSessionEvalSnapshot, validateSessionEvaluation,
  sessionEvaluationReadiness, evaluationBlockerMessage, isEvaluableAttendance, sanitizeHighlights, highlightOptions, sessionAverage,
  sessionLabel, authorize, hasPermission, visibleCenterIds, toISODate, addDays, RUBRIC_LEVELS, SESSION_EVAL_TEXT_MAX,
  type SessionEvalSnapshot, type SessionEvalContext, type CriterionSource, type ObjectiveResult, type SessionScores, type EvalReadiness,
  type SessionSheetView, type Permission,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { assertTenant, tenantCond } from "./tenantScope";
import { writeAudit } from "./audit";
import { signedMediaUrl } from "../storage";

type Db = ProtectedContext["db"];
const asDb = (d: unknown) => d as Db;

const pre = (m: string) => new TRPCError({ code: "PRECONDITION_FAILED", message: m });
const clean = (s: string | null | undefined) => {
  const t = (s ?? "").trim();
  return t ? t.slice(0, SESSION_EVAL_TEXT_MAX) : null;
};

/** Hôm nay theo giờ Việt Nam (UTC+7) */
function todayLocal() {
  return toISODate(new Date(Date.now() + 7 * 3600e3));
}

/* ------------------------------------------------------------------ */
/* Cấu hình: thẻ nổi bật, mốc bật tính năng                             */
/* ------------------------------------------------------------------ */

export const PORTFOLIO_SETTINGS_KEY = "ho_so_hoc_tap";

export async function portfolioSettings(db: Db): Promise<{ highlights: string[]; since: string | null }> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, PORTFOLIO_SETTINGS_KEY)).limit(1);
  const v = (row?.value ?? {}) as { highlights?: unknown; since?: unknown };
  const since = typeof v.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.since) ? v.since : null;
  return { highlights: highlightOptions(Array.isArray(v.highlights) ? v.highlights : null), since };
}

/* ------------------------------------------------------------------ */
/* Nạp buổi + bối cảnh                                                 */
/* ------------------------------------------------------------------ */

async function loadSessionRow(db: Db, sessionId: string) {
  const [r] = await db
    .select({
      id: sessions.id, tenantId: sessions.tenantId, classId: sessions.classId, lessonId: sessions.lessonId, sequenceNo: sessions.sequenceNo,
      kind: sessions.kind, date: sessions.date, startTime: sessions.startTime, status: sessions.status, teacherId: sessions.teacherId,
      topic: sessions.topic, originalSequenceNo: sessions.originalSequenceNo,
      centerId: classes.centerId, courseId: classes.courseId, classCode: classes.code, className: classes.name,
      leadTeacherId: classes.leadTeacherId, assistantTeacherId: classes.assistantTeacherId,
      courseName: courses.name, courseCode: courses.code, centerName: centers.name,
    })
    .from(sessions)
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .innerJoin(courses, eq(courses.id, classes.courseId))
    .innerJoin(centers, eq(centers.id, classes.centerId))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy buổi học" });
  return { ...r, ownerIds: [r.teacherId, r.leadTeacherId, r.assistantTeacherId].filter((x): x is string => !!x) };
}
type SessionRow = Awaited<ReturnType<typeof loadSessionRow>>;

async function sessionContextBase(db: Db, s: SessionRow) {
  const [lesson] = s.lessonId ? await db.select({ title: lessons.title, objectives: lessons.objectives }).from(lessons).where(eq(lessons.id, s.lessonId)).limit(1) : [];
  const tid = s.teacherId ?? s.leadTeacherId;
  const [teacher] = tid ? await db.select({ fullName: teachers.fullName }).from(teachers).where(eq(teachers.id, tid)).limit(1) : [];
  const criteria = await db
    .select({ id: competencyCriteria.id, name: competencyCriteria.name, description: competencyCriteria.description })
    .from(competencyCriteria)
    .where(and(eq(competencyCriteria.courseId, s.courseId), eq(competencyCriteria.isActive, true)))
    .orderBy(asc(competencyCriteria.sortOrder), asc(competencyCriteria.createdAt));
  return {
    criteria: criteria as CriterionSource[],
    teacherId: tid ?? null,
    base: {
      date: s.date,
      startTime: s.startTime ?? null,
      sequenceNo: s.sequenceNo,
      label: sessionLabel(s.sequenceNo, s.kind, s.originalSequenceNo),
      lessonTitle: lesson?.title ?? s.topic ?? null,
      lessonObjectives: lesson?.objectives ?? null,
      teacherName: teacher?.fullName ?? null,
      className: s.className,
      classCode: s.classCode,
      courseName: s.courseName,
      courseCode: s.courseCode,
      centerName: s.centerName,
    },
  };
}

function contextFor(base: Awaited<ReturnType<typeof sessionContextBase>>["base"], s: SessionRow, student: { fullName: string; code: string | null }, attendanceStatus: string | null): SessionEvalContext {
  return { ...base, makeup: s.kind === "makeup" || attendanceStatus === "makeup", studentName: student.fullName, studentCode: student.code };
}

/** Danh sách lớp của buổi (như màn điểm danh) kèm điểm danh + phiếu hiện có */
async function rosterWithEvaluations(db: Db, s: SessionRow) {
  const rows = await db
    .select({
      enrollmentId: enrollments.id, studentId: students.id, fullName: students.fullName, code: students.code,
      attendanceStatus: attendance.status, studentRemark: attendance.studentRemark,
    })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .leftJoin(attendance, and(eq(attendance.enrollmentId, enrollments.id), eq(attendance.sessionId, s.id)))
    .where(and(eq(enrollments.classId, s.classId), inArray(enrollments.status, ["active", "trial"]), sql`${enrollments.startSequenceNo} <= ${s.sequenceNo}`))
    .orderBy(asc(students.fullName));
  const evs = rows.length
    ? await db.select().from(sessionEvaluations).where(and(eq(sessionEvaluations.sessionId, s.id), inArray(sessionEvaluations.enrollmentId, rows.map((r) => r.enrollmentId))))
    : [];
  const byEnr = new Map(evs.map((e) => [e.enrollmentId, e]));
  return rows.map((r) => ({ ...r, evaluation: byEnr.get(r.enrollmentId) ?? null }));
}

/** Điều kiện phát hành phiếu của cả buổi (dùng cho "Hoàn tất buổi" và cho khối nhập liệu) */
export async function sessionEvaluationStatus(db: Db, sessionId: string): Promise<EvalReadiness & { message: string | null }> {
  const s = await loadSessionRow(db, sessionId);
  const roster = await rosterWithEvaluations(db, s);
  const r = sessionEvaluationReadiness(roster.map((x) => ({
    name: x.fullName,
    attendanceStatus: x.attendanceStatus,
    evaluation: x.evaluation
      ? { status: x.evaluation.status, snapshot: isSessionEvalSnapshot(x.evaluation.snapshot) ? x.evaluation.snapshot : null, objectiveResult: x.evaluation.objectiveResult }
      : null,
  })));
  return { ...r, message: evaluationBlockerMessage(r) };
}

/* ------------------------------------------------------------------ */
/* Ảnh minh chứng: ảnh đã duyệt có gắn bé + phụ huynh đồng ý đăng ảnh    */
/* ------------------------------------------------------------------ */

async function consentByStudent(db: Db, studentIds: string[]) {
  if (!studentIds.length) return new Map<string, boolean>();
  const rows = await db
    .select({ studentId: studentGuardians.studentId, consent: sql<boolean>`bool_or(${parents.mediaConsent})` })
    .from(studentGuardians).innerJoin(parents, eq(parents.id, studentGuardians.parentId))
    .where(inArray(studentGuardians.studentId, studentIds)).groupBy(studentGuardians.studentId);
  return new Map(rows.map((r) => [r.studentId, !!r.consent]));
}

export interface EvidenceMedia { id: string; sessionId: string; url: string; caption: string | null; date: string | null; objectKey: string }

/**
 * Ảnh đã duyệt của các buổi, theo từng học viên: ảnh có gắn thẻ bé hoặc ảnh chung cả lớp,
 * và CHỈ khi phụ huynh của bé đang đồng ý đăng ảnh (kiểm tra lại mỗi lần hiển thị — rút đồng ý là ảnh ẩn ngay).
 */
export async function evidenceMedia(db: Db, sessionIds: string[], studentIds: string[]): Promise<Map<string, EvidenceMedia[]>> {
  const out = new Map<string, EvidenceMedia[]>();
  if (!sessionIds.length || !studentIds.length) return out;
  const [rows, consent] = await Promise.all([
    db.select({ id: sessionMedia.id, sessionId: sessionMedia.sessionId, objectKey: sessionMedia.objectKey, caption: sessionMedia.caption, takenAt: sessionMedia.takenAt, isClassWide: sessionMedia.isClassWide, tagged: sessionMedia.taggedStudentIds })
      .from(sessionMedia)
      .where(and(inArray(sessionMedia.sessionId, sessionIds), eq(sessionMedia.status, "approved")))
      .orderBy(asc(sessionMedia.createdAt))
      .limit(2000),
    consentByStudent(db, studentIds),
  ]);
  for (const st of studentIds) {
    if (consent.get(st) !== true) continue;
    const list = rows
      .filter((m) => m.isClassWide || (Array.isArray(m.tagged) && m.tagged.includes(st)))
      .map((m) => ({ id: m.id, sessionId: m.sessionId, url: signedMediaUrl(m.objectKey, 3600), caption: m.caption, date: m.takenAt ?? null, objectKey: m.objectKey }));
    if (list.length) out.set(st, list);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Đọc: khối nhập liệu cho màn buổi học                                 */
/* ------------------------------------------------------------------ */

export async function sessionEvaluationBoard(ctx: ProtectedContext, sessionId: string) {
  const s = await loadSessionRow(ctx.db, sessionId);
  assertTenant(ctx, s, "Buổi học");
  requirePermission(ctx, "session:read", { centerId: s.centerId, ownerIds: s.ownerIds });
  const canWrite = authorize(ctx.actor, "session_note:write", { centerId: s.centerId, ownerIds: s.ownerIds }).allowed;
  const [roster, cfg, cb] = await Promise.all([rosterWithEvaluations(ctx.db, s), portfolioSettings(ctx.db), sessionContextBase(ctx.db, s)]);
  const media = await evidenceMedia(ctx.db, [s.id], roster.map((r) => r.studentId));
  const fresh = buildSessionSnapshot({ criteria: cb.criteria, context: contextFor(cb.base, s, { fullName: "", code: null }, null) });
  const readiness = sessionEvaluationReadiness(roster.map((x) => ({
    name: x.fullName,
    attendanceStatus: x.attendanceStatus,
    evaluation: x.evaluation ? { status: x.evaluation.status, snapshot: isSessionEvalSnapshot(x.evaluation.snapshot) ? x.evaluation.snapshot : null, objectiveResult: x.evaluation.objectiveResult } : null,
  })));
  return {
    sessionId: s.id,
    sessionStatus: s.status,
    lesson: { title: cb.base.lessonTitle, objectives: cb.base.lessonObjectives },
    /** Tiêu chí hiện hành của khoá (phiếu nháp mới dùng bộ này; phiếu đã phát hành giữ bản chụp riêng) */
    criteria: fresh.criteria.map((c) => ({ key: c.key, label: c.label, description: c.description, levels: c.levels })),
    levels: RUBRIC_LEVELS.map((l) => ({ ...l })),
    highlightOptions: cfg.highlights,
    canWrite,
    readiness: { ...readiness, message: evaluationBlockerMessage(readiness) },
    items: roster.map((r) => {
      const e = r.evaluation;
      const snap = e && isSessionEvalSnapshot(e.snapshot) ? e.snapshot : null;
      return {
        enrollmentId: r.enrollmentId,
        studentId: r.studentId,
        fullName: r.fullName,
        code: r.code,
        attendanceStatus: r.attendanceStatus,
        evaluable: r.attendanceStatus == null || isEvaluableAttendance(r.attendanceStatus),
        evaluation: e
          ? {
            id: e.id, status: e.status, revision: e.revision, publishedAt: e.publishedAt,
            scores: snapshotScores(snap), criteria: snap ? snap.criteria.map((c) => ({ key: c.key, label: c.label })) : null,
            objectiveResult: e.objectiveResult, highlights: e.highlights ?? [], productNote: e.productNote ?? "",
            remark: e.remark ?? r.studentRemark ?? "", mediaIds: e.mediaIds ?? [], average: sessionAverage(snap),
          }
          : null,
        remark: r.studentRemark ?? "",
        media: (media.get(r.studentId) ?? []).map((m) => ({ id: m.id, url: m.url, caption: m.caption })),
      };
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Ghi: lưu nháp tự động (nhiều học viên một lần)                       */
/* ------------------------------------------------------------------ */

export interface EvaluationDraftInput {
  enrollmentId: string;
  scores?: SessionScores;
  objectiveResult?: ObjectiveResult | null;
  highlights?: string[];
  productNote?: string | null;
  remark?: string | null;
  mediaIds?: string[];
}

export async function saveEvaluations(ctx: ProtectedContext, input: { sessionId: string; items: EvaluationDraftInput[] }) {
  const s = await loadSessionRow(ctx.db, input.sessionId);
  assertTenant(ctx, s, "Buổi học");
  requirePermission(ctx, "session_note:write", { centerId: s.centerId, ownerIds: s.ownerIds });
  if (s.status === "cancelled" || s.status === "rescheduled") throw pre("Buổi học đã huỷ / dời — không lập phiếu nhận xét");
  if (s.date > todayLocal()) throw pre("Buổi học chưa diễn ra");
  const [roster, cfg, cb] = await Promise.all([rosterWithEvaluations(ctx.db, s), portfolioSettings(ctx.db), sessionContextBase(ctx.db, s)]);
  const byEnr = new Map(roster.map((r) => [r.enrollmentId, r]));
  const media = await evidenceMedia(ctx.db, [s.id], roster.map((r) => r.studentId));

  const skipped: { enrollmentId: string; reason: string }[] = [];
  let saved = 0;
  await ctx.db.transaction(async (txx) => {
    const tx = asDb(txx);
    const changed: string[] = [];
    for (const it of input.items) {
      const r = byEnr.get(it.enrollmentId);
      if (!r) { skipped.push({ enrollmentId: it.enrollmentId, reason: "Học viên không thuộc lớp của buổi này" }); continue; }
      if (r.attendanceStatus && !isEvaluableAttendance(r.attendanceStatus)) { skipped.push({ enrollmentId: it.enrollmentId, reason: `${r.fullName} vắng — không lập phiếu` }); continue; }
      const allowedMedia = new Set((media.get(r.studentId) ?? []).map((m) => m.id));
      const mediaIds = it.mediaIds ? [...new Set(it.mediaIds)].filter((m) => allowedMedia.has(m)).slice(0, 6) : undefined;
      const e = r.evaluation;
      if (e?.status === "published") {
        // Phiếu đã phát hành là bất biến — chỉ gắn thêm ảnh minh chứng; sửa nội dung dùng "Sửa phiếu" (bắt buộc lý do)
        if (mediaIds && JSON.stringify(mediaIds) !== JSON.stringify(e.mediaIds ?? [])) {
          await tx.update(sessionEvaluations).set({ mediaIds, updatedBy: ctx.user.id }).where(eq(sessionEvaluations.id, e.id));
          changed.push(e.id);
          saved += 1;
        } else if (it.scores || it.objectiveResult !== undefined || it.highlights || it.productNote !== undefined || it.remark !== undefined) {
          skipped.push({ enrollmentId: it.enrollmentId, reason: `Phiếu của ${r.fullName} đã phát hành — dùng "Sửa phiếu" và ghi lý do` });
        }
        continue;
      }
      const base: SessionEvalSnapshot = e && isSessionEvalSnapshot(e.snapshot)
        ? e.snapshot
        : buildSessionSnapshot({ criteria: cb.criteria, context: contextFor(cb.base, s, r, r.attendanceStatus) });
      const snapshot = it.scores ? applySessionScores(base, it.scores) : base;
      const next = {
        snapshot,
        objectiveResult: it.objectiveResult === undefined ? e?.objectiveResult ?? null : it.objectiveResult,
        highlights: it.highlights ? sanitizeHighlights(it.highlights, cfg.highlights) : e?.highlights ?? [],
        productNote: it.productNote === undefined ? e?.productNote ?? null : clean(it.productNote),
        remark: it.remark === undefined ? e?.remark ?? r.studentRemark ?? null : clean(it.remark),
        mediaIds: mediaIds ?? e?.mediaIds ?? [],
      };
      const errs = validateSessionEvaluation({ mode: "draft", ...next });
      if (errs.length) { skipped.push({ enrollmentId: it.enrollmentId, reason: `${r.fullName}: ${errs.join("; ")}` }); continue; }
      if (e) {
        await tx.update(sessionEvaluations).set({ ...next, updatedBy: ctx.user.id }).where(and(eq(sessionEvaluations.id, e.id), eq(sessionEvaluations.status, "draft")));
        changed.push(e.id);
      } else {
        const [row] = await tx
          .insert(sessionEvaluations)
          .values({
            tenantId: s.tenantId, centerId: s.centerId, sessionId: s.id, enrollmentId: r.enrollmentId, studentId: r.studentId, classId: s.classId,
            courseId: s.courseId, lessonId: s.lessonId, teacherId: cb.teacherId, status: "draft", revision: 0, ...next,
            createdBy: ctx.user.id, updatedBy: ctx.user.id,
          })
          .onConflictDoNothing({ target: [sessionEvaluations.sessionId, sessionEvaluations.enrollmentId] })
          .returning({ id: sessionEvaluations.id });
        if (row) changed.push(row.id);
      }
      // Nhận xét cho phụ huynh = attendance.student_remark (đồng bộ hai chiều, không nhập hai lần)
      if (it.remark !== undefined && r.attendanceStatus) {
        await tx.update(attendance).set({ studentRemark: next.remark }).where(and(eq(attendance.sessionId, s.id), eq(attendance.enrollmentId, r.enrollmentId)));
      }
      saved += 1;
    }
    if (changed.length) {
      await writeAudit(tx, {
        actorId: ctx.user.id, action: "UPDATE", module: "academics", entity: "session_evaluations", entityId: s.id,
        after: { sessionId: s.id, drafts: changed.length, ids: changed.slice(0, 50) }, ip: ctx.ip,
      });
    }
  });
  return { saved, skipped, board: await sessionEvaluationBoard(ctx, input.sessionId) };
}

/**
 * Đồng bộ chiều ngược: GV sửa nhận xét nhanh ở màn điểm danh → cập nhật ô nhận xét của phiếu NHÁP.
 * Phiếu đã phát hành không đổi (bất biến). Gọi TRONG transaction của `recordAttendance`.
 */
export async function syncRemarksFromAttendance(tx: Db, sessionId: string, records: { enrollmentId: string; status: string; studentRemark?: string | null }[]) {
  for (const r of records) {
    if (r.studentRemark === undefined) continue;
    await tx.update(sessionEvaluations)
      .set({ remark: clean(r.studentRemark) })
      .where(and(eq(sessionEvaluations.sessionId, sessionId), eq(sessionEvaluations.enrollmentId, r.enrollmentId), eq(sessionEvaluations.status, "draft")));
  }
}

/* ------------------------------------------------------------------ */
/* Phát hành khi hoàn tất buổi                                          */
/* ------------------------------------------------------------------ */

/**
 * Phát hành mọi phiếu nháp đủ điều kiện của buổi — gọi TRONG transaction hoàn tất buổi.
 * Chụp lại bối cảnh mới nhất (bài đã xác nhận, GV, tiêu chí đang dùng) và mang điểm sang;
 * phiếu nháp của học viên cuối cùng vắng thì xoá (không có phiếu cho HV vắng).
 */
export async function publishSessionEvaluations(tx: Db, input: { sessionId: string; actorId: string; ip?: string }) {
  const s = await loadSessionRow(tx, input.sessionId);
  const [roster, cb] = await Promise.all([rosterWithEvaluations(tx, s), sessionContextBase(tx, s)]);
  const now = new Date();
  const published: string[] = [];
  const removed: string[] = [];
  const pending: string[] = [];
  for (const r of roster) {
    const e = r.evaluation;
    if (!e || e.status !== "draft") continue;
    if (!isEvaluableAttendance(r.attendanceStatus)) {
      await tx.delete(sessionEvaluations).where(and(eq(sessionEvaluations.id, e.id), eq(sessionEvaluations.status, "draft")));
      removed.push(e.id);
      continue;
    }
    const fresh = buildSessionSnapshot({ criteria: cb.criteria, context: contextFor(cb.base, s, r, r.attendanceStatus), now });
    const snapshot = rebaseSnapshot(isSessionEvalSnapshot(e.snapshot) ? e.snapshot : null, fresh);
    const errs = validateSessionEvaluation({ mode: "publish", snapshot, objectiveResult: e.objectiveResult, productNote: e.productNote, remark: e.remark, highlights: e.highlights });
    if (errs.length) { pending.push(r.fullName); continue; }
    await tx.update(sessionEvaluations)
      .set({ status: "published", revision: 1, snapshot, lessonId: s.lessonId, teacherId: cb.teacherId, publishedAt: now, publishedBy: input.actorId, remark: e.remark ?? r.studentRemark ?? null, updatedBy: input.actorId })
      .where(and(eq(sessionEvaluations.id, e.id), eq(sessionEvaluations.status, "draft")));
    published.push(e.id);
  }
  if (published.length || removed.length) {
    await writeAudit(tx, {
      actorId: input.actorId, action: "TRANSITION", module: "academics", entity: "session_evaluations", entityId: s.id,
      before: { status: "draft" }, after: { status: "published", sessionId: s.id, published: published.length, removedAbsent: removed.length, stillDraft: pending.length },
      reason: "Hoàn tất buổi học — phát hành phiếu nhận xét", ip: input.ip,
    });
  }
  return { published: published.length, removed: removed.length, pending };
}

/* ------------------------------------------------------------------ */
/* Sửa phiếu đã phát hành (bắt buộc lý do, tăng revision)               */
/* ------------------------------------------------------------------ */

async function loadEvaluation(ctx: ProtectedContext, id: string) {
  const [e] = await ctx.db.select().from(sessionEvaluations).where(eq(sessionEvaluations.id, id)).limit(1);
  if (!e) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy phiếu nhận xét" });
  assertTenant(ctx, e, "Phiếu nhận xét");
  const s = await loadSessionRow(ctx.db, e.sessionId);
  return { e, s };
}

export async function amendEvaluation(ctx: ProtectedContext, input: {
  id: string; reason: string; scores?: SessionScores; objectiveResult?: ObjectiveResult; highlights?: string[]; productNote?: string | null; remark?: string | null;
}) {
  const reason = input.reason.trim();
  if (reason.length < 5) throw new TRPCError({ code: "BAD_REQUEST", message: "Nhập lý do sửa phiếu (tối thiểu 5 ký tự)" });
  const { e, s } = await loadEvaluation(ctx, input.id);
  requirePermission(ctx, "session_note:write", { centerId: s.centerId, ownerIds: s.ownerIds });
  if (e.status !== "published") throw pre("Phiếu còn là bản nháp — sửa trực tiếp ở màn buổi học");
  if (!isSessionEvalSnapshot(e.snapshot)) throw pre("Phiếu hỏng dữ liệu — liên hệ quản trị");
  const cfg = await portfolioSettings(ctx.db);
  const snapshot = input.scores ? applySessionScores(e.snapshot, input.scores) : e.snapshot;
  const next = {
    snapshot,
    objectiveResult: input.objectiveResult ?? e.objectiveResult,
    highlights: input.highlights ? sanitizeHighlights(input.highlights, cfg.highlights) : e.highlights,
    productNote: input.productNote === undefined ? e.productNote : clean(input.productNote),
    remark: input.remark === undefined ? e.remark : clean(input.remark),
  };
  const errs = validateSessionEvaluation({ mode: "publish", ...next });
  if (errs.length) throw pre(`Phiếu đã phát hành phải giữ đủ nội dung: ${errs.join("; ")}`);
  const before = { scores: snapshotScores(e.snapshot), objectiveResult: e.objectiveResult, highlights: e.highlights, productNote: e.productNote, remark: e.remark, revision: e.revision };
  const after = { scores: snapshotScores(snapshot), objectiveResult: next.objectiveResult, highlights: next.highlights, productNote: next.productNote, remark: next.remark, revision: e.revision + 1 };
  if (JSON.stringify({ ...before, revision: 0 }) === JSON.stringify({ ...after, revision: 0 })) return { ok: true, changed: false, revision: e.revision };
  await ctx.db.transaction(async (txx) => {
    const tx = asDb(txx);
    const up = await tx.update(sessionEvaluations)
      .set({ ...next, revision: e.revision + 1, amendedAt: new Date(), amendedBy: ctx.user.id, amendReason: reason, updatedBy: ctx.user.id })
      .where(and(eq(sessionEvaluations.id, e.id), eq(sessionEvaluations.revision, e.revision)))
      .returning({ id: sessionEvaluations.id });
    if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Phiếu vừa được người khác sửa — tải lại rồi thử lại" });
    if (input.remark !== undefined) {
      await tx.update(attendance).set({ studentRemark: next.remark }).where(and(eq(attendance.sessionId, e.sessionId), eq(attendance.enrollmentId, e.enrollmentId)));
    }
    await writeAudit(tx, { actorId: ctx.user.id, action: "UPDATE", module: "academics", entity: "session_evaluations", entityId: e.id, before, after, reason: `Sửa phiếu đã phát hành: ${reason}`, ip: ctx.ip });
  });
  return { ok: true, changed: true, revision: e.revision + 1 };
}

/* ------------------------------------------------------------------ */
/* Xem / in một phiếu                                                   */
/* ------------------------------------------------------------------ */

/** Quyền xem phiếu của một học viên: người dạy buổi đó, hoặc người xem được hồ sơ học viên tại cơ sở */
function canViewSheet(ctx: ProtectedContext, s: SessionRow) {
  return authorize(ctx.actor, "session:read", { centerId: s.centerId, ownerIds: s.ownerIds }).allowed
    || authorize(ctx.actor, "student:read", { centerId: s.centerId }).allowed;
}

export async function getSessionSheet(ctx: ProtectedContext, id: string): Promise<SessionSheetView & { studentId: string; sessionId: string; canAmend: boolean }> {
  const { e, s } = await loadEvaluation(ctx, id);
  if (!canViewSheet(ctx, s)) throw new TRPCError({ code: "FORBIDDEN", message: "Bạn không có quyền xem phiếu nhận xét này" });
  if (!isSessionEvalSnapshot(e.snapshot)) throw pre("Phiếu hỏng dữ liệu — liên hệ quản trị");
  const [center] = await ctx.db.select({ name: centers.name, address: centers.address, phone: centers.phone }).from(centers).where(eq(centers.id, s.centerId)).limit(1);
  const media = await evidenceMedia(ctx.db, [e.sessionId], [e.studentId]);
  const all = media.get(e.studentId) ?? [];
  const chosen = (e.mediaIds ?? []).length ? all.filter((m) => (e.mediaIds ?? []).includes(m.id)) : all.slice(0, 2);
  return {
    id: e.id, studentId: e.studentId, sessionId: e.sessionId, status: e.status, revision: e.revision,
    publishedAt: e.publishedAt ? e.publishedAt.toISOString() : null,
    snapshot: e.snapshot, objectiveResult: e.objectiveResult, highlights: e.highlights ?? [], productNote: e.productNote, remark: e.remark,
    media: chosen.map((m) => ({ id: m.id, url: m.url, caption: m.caption, date: m.date })),
    average: sessionAverage(e.snapshot),
    center: center ?? null,
    canAmend: e.status === "published" && authorize(ctx.actor, "session_note:write", { centerId: s.centerId, ownerIds: s.ownerIds }).allowed,
  };
}

/* ------------------------------------------------------------------ */
/* "Việc hôm nay": buổi đã diễn ra, HV có mặt, chưa có phiếu phát hành   */
/* ------------------------------------------------------------------ */

const PENDING_WINDOW_DAYS = 30;

export interface PendingEvaluationSession {
  sessionId: string;
  classId: string;
  classCode: string;
  label: string;
  date: string;
  startTime: string;
  centerCode: string;
  teacherName: string | null;
  missing: number;
}

function anywhere(ctx: ProtectedContext, perm: Permission) {
  if (authorize(ctx.actor, perm, {}).allowed) return true;
  return ctx.actor.assignments.some((a) => authorize(ctx.actor, perm, { centerId: a.centerId }).allowed);
}

/**
 * `null` = người dùng không có quyền với nhóm việc này. GV chỉ có quyền `_own` thấy buổi mình dạy.
 * Chỉ tính buổi từ mốc bật tính năng (app_settings "ho_so_hoc_tap".since) và trong 30 ngày gần nhất.
 */
export async function pendingEvaluationSessions(ctx: ProtectedContext, input: { limit?: number } = {}): Promise<{ total: number; overdue: number; items: PendingEvaluationSession[] } | null> {
  if (!hasPermission(ctx.actor, "session_note:write")) return null;
  const broad = anywhere(ctx, "session_note:write");
  const own: SQL = broad
    ? sql`true`
    : ctx.actor.personId
      ? sql`(${sessions.teacherId} = ${ctx.actor.personId} or ${classes.leadTeacherId} = ${ctx.actor.personId} or ${classes.assistantTeacherId} = ${ctx.actor.personId})`
      : sql`false`;
  const today = todayLocal();
  const cfg = await portfolioSettings(ctx.db);
  const windowFrom = addDays(today, -PENDING_WINDOW_DAYS);
  const from = cfg.since && cfg.since > windowFrom ? cfg.since : windowFrom;
  const visible = visibleCenterIds(ctx.actor);
  const conds: SQL[] = [
    tenantCond(ctx, sessions),
    sql`${sessions.date} >= ${from}`,
    sql`${sessions.date} <= ${today}`,
    sql`${sessions.status} in ('in_progress','attendance_done','notes_done','completed')`,
    visible === null ? sql`true` : visible.length ? inArray(classes.centerId, visible) : sql`false`,
    own,
  ];
  const missingExpr = sql<number>`(
    select count(*)::int from ${attendance} a
     where a.session_id = ${sessions.id} and a.status in ('present','late','makeup')
       and not exists (select 1 from ${sessionEvaluations} se where se.session_id = a.session_id and se.enrollment_id = a.enrollment_id and se.status = 'published'))`;
  const where = and(...conds, sql`${missingExpr} > 0`);
  const yesterday = addDays(today, -1);
  const [counts] = await ctx.db
    .select({ total: sql<number>`count(*)::int`, overdue: sql<number>`count(*) filter (where ${sessions.date} < ${yesterday})::int` })
    .from(sessions).innerJoin(classes, eq(classes.id, sessions.classId))
    .where(where);
  const total = counts?.total ?? 0;
  if (!total) return { total: 0, overdue: 0, items: [] };
  const rows = await ctx.db
    .select({
      sessionId: sessions.id, classId: classes.id, classCode: classes.code, seq: sessions.sequenceNo, kind: sessions.kind, originalSequenceNo: sessions.originalSequenceNo,
      date: sessions.date, startTime: sessions.startTime, centerCode: centers.code, teacherName: teachers.fullName, missing: missingExpr,
    })
    .from(sessions)
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .innerJoin(centers, eq(centers.id, classes.centerId))
    .leftJoin(teachers, eq(teachers.id, sessions.teacherId))
    .where(where)
    .orderBy(asc(sessions.date), asc(sessions.startTime))
    .limit(Math.min(100, Math.max(1, input.limit ?? 25)));
  return {
    total,
    overdue: counts?.overdue ?? 0,
    items: rows.map((r) => ({
      sessionId: r.sessionId, classId: r.classId, classCode: r.classCode, label: sessionLabel(r.seq, r.kind, r.originalSequenceNo), date: r.date, startTime: r.startTime,
      centerCode: r.centerCode, teacherName: r.teacherName ?? null, missing: r.missing,
    })),
  };
}

/** Phiếu đã phát hành gần nhất của một học viên (khối trên trang học viên) */
export async function recentSheets(ctx: ProtectedContext, studentId: string, limit = 5) {
  return ctx.db
    .select({ id: sessionEvaluations.id, publishedAt: sessionEvaluations.publishedAt, snapshot: sessionEvaluations.snapshot })
    .from(sessionEvaluations)
    .where(and(eq(sessionEvaluations.studentId, studentId), eq(sessionEvaluations.status, "published"), tenantCond(ctx, sessionEvaluations)))
    .orderBy(desc(sessionEvaluations.publishedAt))
    .limit(limit);
}
