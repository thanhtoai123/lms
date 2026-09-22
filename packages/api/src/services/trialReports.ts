/**
 * PHIẾU ĐÁNH GIÁ BUỔI HỌC THỬ (docs/PHIEU-DANH-GIA-HOC-THU.md).
 *
 * Luồng: GV / tư vấn mở phiếu từ buổi học thử (một chạm, tự điền sẵn tên bé, khoá, buổi, GV, cơ sở)
 * → chấm nhanh + viết nhận xét → phát hành (sinh token) → gửi link qua Zalo / email
 * → phụ huynh xem trên điện thoại, bấm "Đăng ký tư vấn lộ trình" → tư vấn phụ trách nhận việc.
 *
 * Quyền:
 *  - điền / sửa: `trials:attendance` (GV đứng buổi) hoặc `trials:manage` hoặc `lead:update` tại cơ sở đó;
 *  - phát hành / thu hồi / gia hạn: `trials:manage` hoặc `lead:update`.
 * Mọi truy vấn danh sách có `tenantCond`, nạp theo id có `assertTenant`, mọi thao tác ghi có
 * `writeAudit` TRONG transaction. Token chia sẻ KHÔNG bao giờ ghi vào nhật ký.
 *
 * Hai hàm công khai (`publicTrialReport`, `publicTrialReportRespond`) nhận `db` trực tiếp như
 * `publicSurvey`: token là quyền, dữ liệu trả ra chỉ gồm trường cần cho phụ huynh.
 */
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  trialReports, trialBookings, trialClasses, trialClassSessions, trialClassEnrollments, trialAttendance,
  leads, leadChildren, leadActivities, leadTasks, sessions, classes, courses, centers, teachers, students, users, userRoles,
  type Database,
} from "@satarobo/db";
import {
  TRIAL_REPORT_TEMPLATE, TRIAL_REPORT_TOKEN_RE, TRIAL_REPORT_SHARE_DAYS_MAX,
  snapshotAnswers, applyValues, answerValues, isTrialReportAnswers, validateTrialReport,
  trialReportCode, trialReportCodePrefix, nextTrialReportSeq, clampShareDays, shareExpiresAt, shareLinkState,
  trialReportPath, trialReportShareMessage, authorize, hasPermission, visibleCenterIds, isEmail,
  type TrialReportAnswers, type TrialReportView, type TrialReadiness, type Permission,
} from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { assertTenant, tenantCond, tenantSql } from "./tenantScope";
import { writeAudit } from "./audit";
import { deliverNotifications } from "./notify";
import { queueEmail } from "./admin";

type Db = ProtectedContext["db"];
const asDb = (d: unknown) => d as Db;

const notFound = (m = "Không tìm thấy phiếu đánh giá") => new TRPCError({ code: "NOT_FOUND", message: m });
const forbidden = (m: string) => new TRPCError({ code: "FORBIDDEN", message: m });
const pre = (m: string | string[]) => new TRPCError({ code: "PRECONDITION_FAILED", message: Array.isArray(m) ? m.join("; ") : m });

/** Địa chỉ gốc của trang web (để ghép link gửi phụ huynh qua email) */
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
/** Hạn link mặc định — cấu hình bằng biến môi trường `TRIAL_REPORT_SHARE_DAYS` (mặc định 90 ngày) */
const defaultShareDays = () => clampShareDays(Number(process.env.TRIAL_REPORT_SHARE_DAYS) || undefined);

/** Thời điểm theo giờ Việt Nam từ ngày + giờ bắt đầu của buổi */
function localDateTime(date: string, time: string | null | undefined): Date {
  const t = (time ?? "00:00:00").slice(0, 8);
  return new Date(`${date}T${t.length === 5 ? `${t}:00` : t}+07:00`);
}
/** Hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD */
const todayLocal = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const dmy = (d: Date) => d.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" });
const clean = (s: string | null | undefined) => {
  const t = (s ?? "").trim();
  return t ? t : null;
};

/* ------------------------------------------------------------------ */
/* Quyền                                                               */
/* ------------------------------------------------------------------ */

export interface TrialReportScope {
  centerId: string;
  /** GV đứng buổi (teachers.id) — GV có `trials:attendance_own` điền được phiếu buổi mình dạy */
  teacherId: string | null;
  /** Tư vấn phụ trách lead (users.id) */
  assignedToId: string | null;
}

const owners = (id: string | null) => (id ? [id] : []);

/** Ba mức quyền trên MỘT phiếu: xem / điền-sửa / phát hành-thu hồi-gia hạn */
export function trialReportPerms(ctx: Pick<ProtectedContext, "actor">, s: TrialReportScope) {
  const at = (perm: Permission, ownerIds: string[] = []) => authorize(ctx.actor, perm, { centerId: s.centerId, ownerIds }).allowed;
  const publish = at("trials:manage") || at("lead:update", owners(s.assignedToId));
  const fill = publish || at("trials:attendance", owners(s.teacherId));
  const view = fill || at("trials:view", owners(s.teacherId)) || at("lead:read", owners(s.assignedToId));
  return { view, fill, publish };
}

/* ------------------------------------------------------------------ */
/* Nạp phiếu + dữ liệu hiển thị                                         */
/* ------------------------------------------------------------------ */

async function loadRow(db: Db, where: SQL) {
  const [x] = await db
    .select({
      r: trialReports,
      centerCode: centers.code, centerName: centers.name, centerAddress: centers.address, centerPhone: centers.phone, centerTenantId: centers.tenantId,
      courseName: courses.name, courseCode: courses.code,
      teacherName: teachers.fullName,
      leadParentName: leads.parentName, leadEmail: leads.email, leadAssignedToId: leads.assignedToId,
      leadProcessingRestricted: leads.processingRestricted, leadAnonymizedAt: leads.anonymizedAt, leadDeletedAt: leads.deletedAt,
      childDob: leadChildren.dateOfBirth,
      studentCode: sql<string | null>`(select st.code from ${students} st where st.id = (case when ${trialReports.childId} is not null then ${leadChildren.convertedStudentId} else ${leads.convertedStudentId} end))`,
      recommendedCourseName: sql<string | null>`(select rc.name from ${courses} rc where rc.id = ${trialReports.recommendedCourseId})`,
    })
    .from(trialReports)
    .innerJoin(centers, eq(centers.id, trialReports.centerId))
    .innerJoin(leads, eq(leads.id, trialReports.leadId))
    .leftJoin(leadChildren, eq(leadChildren.id, trialReports.childId))
    .leftJoin(courses, eq(courses.id, trialReports.courseId))
    .leftJoin(teachers, eq(teachers.id, trialReports.teacherId))
    .where(where)
    .limit(1);
  return x ?? null;
}
type Loaded = NonNullable<Awaited<ReturnType<typeof loadRow>>>;

const scopeOf = (x: Loaded): TrialReportScope => ({ centerId: x.r.centerId, teacherId: x.r.teacherId, assignedToId: x.leadAssignedToId });
const answersOf = (x: Loaded): TrialReportAnswers => (isTrialReportAnswers(x.r.answers) ? x.r.answers : snapshotAnswers(TRIAL_REPORT_TEMPLATE, {}));

/** Dựng dữ liệu hiển thị dùng chung — chỉ những trường in trên phiếu */
function toView(x: Loaded): TrialReportView {
  const r = x.r;
  return {
    code: r.code,
    status: r.status,
    issuedAt: (r.publishedAt ?? r.updatedAt).toISOString(),
    childName: r.childName,
    dateOfBirth: x.childDob ?? null,
    studentCode: x.studentCode ?? null,
    courseName: x.courseName ?? null,
    sessionAt: r.sessionAt ? r.sessionAt.toISOString() : null,
    teacherName: x.teacherName ?? null,
    answers: answersOf(x),
    strengths: r.strengths,
    growth: r.growth,
    productNote: r.productNote,
    readiness: r.readiness,
    recommendedCourseName: x.recommendedCourseName ?? null,
    recommendedLevel: r.recommendedLevel,
    recommendationNote: r.recommendationNote,
    pathway: r.pathway,
    competitionPotential: r.competitionPotential,
    center: { name: x.centerName, address: x.centerAddress, phone: x.centerPhone },
  };
}

async function loadForStaff(ctx: ProtectedContext, id: string) {
  const x = await loadRow(ctx.db, eq(trialReports.id, id));
  if (!x || x.leadDeletedAt) throw notFound();
  assertTenant(ctx, x.r, "Phiếu đánh giá");
  const perms = trialReportPerms(ctx, scopeOf(x));
  if (!perms.view) throw forbidden("Bạn không có quyền xem phiếu đánh giá này");
  return { x, perms };
}

/* ------------------------------------------------------------------ */
/* Nguồn phiếu: buổi thử lẻ / ghi danh lớp trải nghiệm / lead + bé      */
/* ------------------------------------------------------------------ */

export interface TrialReportSourceInput {
  trialBookingId?: string | null;
  trialClassEnrollmentId?: string | null;
  leadId?: string | null;
  childId?: string | null;
}

interface ResolvedSource {
  leadId: string;
  childId: string | null;
  childName: string | null;
  centerId: string | null;
  courseId: string | null;
  teacherId: string | null;
  sessionAt: Date | null;
  trialBookingId: string | null;
  trialClassEnrollmentId: string | null;
}

async function resolveSource(db: Db, input: TrialReportSourceInput): Promise<ResolvedSource> {
  if (input.trialBookingId) {
    const [b] = await db
      .select({
        id: trialBookings.id, leadId: trialBookings.leadId, childId: trialBookings.childId, childName: trialBookings.childName, status: trialBookings.status,
        bookingCenterId: trialBookings.centerId, date: sessions.date, startTime: sessions.startTime, sessionTeacherId: sessions.teacherId,
        classCenterId: classes.centerId, courseId: classes.courseId, leadTeacherId: classes.leadTeacherId,
      })
      .from(trialBookings)
      .innerJoin(sessions, eq(sessions.id, trialBookings.sessionId))
      .innerJoin(classes, eq(classes.id, sessions.classId))
      .where(eq(trialBookings.id, input.trialBookingId))
      .limit(1);
    if (!b) throw notFound("Không tìm thấy lượt học thử");
    if (b.status !== "attended") throw pre("Chỉ lập phiếu cho lượt học thử đã ghi nhận \"Bé đã đến học\"");
    return {
      leadId: b.leadId, childId: b.childId, childName: b.childName, centerId: b.bookingCenterId ?? b.classCenterId ?? null,
      courseId: b.courseId ?? null, teacherId: b.sessionTeacherId ?? b.leadTeacherId ?? null, sessionAt: localDateTime(b.date, b.startTime),
      trialBookingId: b.id, trialClassEnrollmentId: null,
    };
  }
  if (input.trialClassEnrollmentId) {
    const [e] = await db
      .select({
        id: trialClassEnrollments.id, leadId: trialClassEnrollments.leadId, childId: trialClassEnrollments.childId, studentName: trialClassEnrollments.studentName,
        trialClassId: trialClassEnrollments.trialClassId, centerId: trialClasses.centerId, courseId: trialClasses.courseId,
      })
      .from(trialClassEnrollments)
      .innerJoin(trialClasses, eq(trialClasses.id, trialClassEnrollments.trialClassId))
      .where(eq(trialClassEnrollments.id, input.trialClassEnrollmentId))
      .limit(1);
    if (!e) throw notFound("Không tìm thấy học viên trong lớp trải nghiệm");
    // Buổi tham chiếu: buổi gần nhất bé có mặt; chưa điểm danh thì buổi gần nhất đã diễn ra
    const attended = sql`exists (select 1 from ${trialAttendance} ta where ta.trial_session_id = ${trialClassSessions.id} and ta.enrollment_id = ${e.id} and ta.status in ('present','late'))`;
    const pick = (cond: SQL) =>
      db.select({ date: trialClassSessions.date, startTime: trialClassSessions.startTime, teacherId: trialClassSessions.teacherId })
        .from(trialClassSessions)
        .where(and(eq(trialClassSessions.trialClassId, e.trialClassId), ne(trialClassSessions.status, "cancelled"), cond))
        .orderBy(desc(trialClassSessions.date), desc(trialClassSessions.startTime))
        .limit(1);
    const [s] = await pick(attended);
    const [fallback] = s ? [s] : await pick(sql`${trialClassSessions.date} <= ${todayLocal()}`);
    const ref = s ?? fallback ?? null;
    return {
      leadId: e.leadId, childId: e.childId, childName: e.studentName, centerId: e.centerId, courseId: e.courseId ?? null,
      teacherId: ref?.teacherId ?? null, sessionAt: ref ? localDateTime(ref.date, ref.startTime) : null,
      trialBookingId: null, trialClassEnrollmentId: e.id,
    };
  }
  if (input.leadId) {
    const lead = await db.query.leads.findFirst({ where: and(eq(leads.id, input.leadId), isNull(leads.deletedAt)) });
    if (!lead) throw notFound("Không tìm thấy lead");
    const child = input.childId ? await db.query.leadChildren.findFirst({ where: and(eq(leadChildren.id, input.childId), eq(leadChildren.leadId, lead.id)) }) : null;
    if (input.childId && !child) throw new TRPCError({ code: "BAD_REQUEST", message: "Bé không thuộc lead này" });
    return {
      leadId: lead.id, childId: child?.id ?? null, childName: child?.fullName ?? lead.childName ?? null,
      centerId: child?.interestedCenterId ?? lead.centerId ?? null, courseId: child?.interestedCourseId ?? lead.interestedCourseId ?? null,
      teacherId: null, sessionAt: null, trialBookingId: null, trialClassEnrollmentId: null,
    };
  }
  throw new TRPCError({ code: "BAD_REQUEST", message: "Chọn buổi học thử hoặc lead để lập phiếu" });
}

/** Điều kiện "cùng nguồn" để không lập hai phiếu cho một buổi thử */
function sameSource(src: ResolvedSource): SQL {
  if (src.trialBookingId) return eq(trialReports.trialBookingId, src.trialBookingId);
  if (src.trialClassEnrollmentId) return eq(trialReports.trialClassEnrollmentId, src.trialClassEnrollmentId);
  return and(
    eq(trialReports.leadId, src.leadId),
    src.childId ? eq(trialReports.childId, src.childId) : isNull(trialReports.childId),
    isNull(trialReports.trialBookingId),
    isNull(trialReports.trialClassEnrollmentId),
  )!;
}

/* ------------------------------------------------------------------ */
/* Đọc                                                                 */
/* ------------------------------------------------------------------ */

const READ_PERMS: Permission[] = ["trials:view", "trials:attendance", "trials:manage", "lead:read", "lead:update"];

export async function listTrialReports(ctx: ProtectedContext, input: { leadId?: string; centerId?: string; status?: "draft" | "published" | "revoked" }) {
  if (!READ_PERMS.some((p) => hasPermission(ctx.actor, p))) throw forbidden("Bạn không có quyền xem phiếu đánh giá học thử");
  const conds: SQL[] = [tenantCond(ctx, trialReports), isNull(leads.deletedAt)];
  if (input.leadId) conds.push(eq(trialReports.leadId, input.leadId));
  if (input.centerId) conds.push(eq(trialReports.centerId, input.centerId));
  if (input.status) conds.push(eq(trialReports.status, input.status));
  const visible = visibleCenterIds(ctx.actor);
  if (visible !== null) conds.push(visible.length ? inArray(trialReports.centerId, visible) : sql`false`);
  const rows = await ctx.db
    .select({
      id: trialReports.id, code: trialReports.code, status: trialReports.status, childName: trialReports.childName, sessionAt: trialReports.sessionAt,
      readiness: trialReports.readiness, viewCount: trialReports.viewCount, lastViewedAt: trialReports.lastViewedAt,
      parentResponse: trialReports.parentResponse, parentRespondedAt: trialReports.parentRespondedAt,
      publishedAt: trialReports.publishedAt, shareExpiresAt: trialReports.shareExpiresAt, revokedAt: trialReports.revokedAt, createdAt: trialReports.createdAt,
      leadId: trialReports.leadId, centerId: trialReports.centerId, teacherId: trialReports.teacherId, assignedToId: leads.assignedToId,
      courseCode: courses.code, centerCode: centers.code,
    })
    .from(trialReports)
    .innerJoin(leads, eq(leads.id, trialReports.leadId))
    .innerJoin(centers, eq(centers.id, trialReports.centerId))
    .leftJoin(courses, eq(courses.id, trialReports.courseId))
    .where(and(...conds))
    .orderBy(desc(trialReports.createdAt))
    .limit(200);
  const now = new Date();
  return rows
    .filter((r) => trialReportPerms(ctx, { centerId: r.centerId, teacherId: r.teacherId, assignedToId: r.assignedToId }).view)
    .map((r) => ({
      id: r.id, code: r.code, status: r.status, childName: r.childName, sessionAt: r.sessionAt, readiness: r.readiness,
      viewCount: r.viewCount, lastViewedAt: r.lastViewedAt, parentResponse: r.parentResponse, parentRespondedAt: r.parentRespondedAt,
      publishedAt: r.publishedAt, shareExpiresAt: r.shareExpiresAt, revokedAt: r.revokedAt, createdAt: r.createdAt,
      leadId: r.leadId, centerId: r.centerId, courseCode: r.courseCode, centerCode: r.centerCode,
      // Phiếu đã phát hành luôn có token (ràng buộc CSDL) — không cần kéo token ra ngoài để tính trạng thái
      linkState: shareLinkState({ status: r.status, shareToken: r.status === "published" ? "co-token" : null, shareExpiresAt: r.shareExpiresAt, revokedAt: r.revokedAt }, now),
    }));
}

export async function getTrialReport(ctx: ProtectedContext, id: string) {
  const { x, perms } = await loadForStaff(ctx, id);
  const r = x.r;
  const answers = answersOf(x);
  const now = new Date();
  const path = r.shareToken ? trialReportPath(r.shareToken) : null;
  const url = path ? `${appUrl()}${path}` : null;
  const courseOptions = await ctx.db
    .select({ id: courses.id, code: courses.code, name: courses.name, level: courses.level })
    .from(courses)
    .where(and(eq(courses.isActive, true), tenantCond(ctx, courses)))
    .orderBy(asc(courses.code))
    .limit(300);
  return {
    id: r.id,
    code: r.code,
    status: r.status,
    leadId: r.leadId,
    childId: r.childId,
    centerId: r.centerId,
    trialBookingId: r.trialBookingId,
    trialClassEnrollmentId: r.trialClassEnrollmentId,
    childName: r.childName,
    courseId: r.courseId,
    sessionAt: r.sessionAt,
    answers,
    values: answerValues(answers),
    strengths: r.strengths ?? "",
    growth: r.growth ?? "",
    productNote: r.productNote ?? "",
    readiness: r.readiness,
    recommendedCourseId: r.recommendedCourseId,
    recommendedLevel: r.recommendedLevel ?? "",
    recommendationNote: r.recommendationNote ?? "",
    pathway: r.pathway,
    competitionPotential: r.competitionPotential,
    updatedAt: r.updatedAt,
    share: {
      state: shareLinkState(r, now),
      path,
      url,
      message: url ? trialReportShareMessage(r.childName, url) : null,
      expiresAt: r.shareExpiresAt,
      publishedAt: r.publishedAt,
      revokedAt: r.revokedAt,
      revokeReason: r.revokeReason,
      viewCount: r.viewCount,
      firstViewedAt: r.firstViewedAt,
      lastViewedAt: r.lastViewedAt,
      parentResponse: r.parentResponse,
      parentRespondedAt: r.parentRespondedAt,
    },
    view: toView(x),
    courses: courseOptions,
    perms: {
      view: perms.view,
      edit: perms.fill && r.status !== "revoked",
      publish: perms.publish && r.status === "draft",
      manageLink: perms.publish && r.status === "published",
      /** Lập phiếu mới thay phiếu đã thu hồi */
      recreate: perms.fill && r.status === "revoked",
    },
  };
}

/* ------------------------------------------------------------------ */
/* Ghi                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Mở phiếu cho một buổi học thử — MỘT CHẠM: đã có phiếu (chưa thu hồi) thì trả phiếu đó,
 * chưa có thì tạo bản nháp điền sẵn tên bé, khoá, buổi, GV, cơ sở. Phiếu cũ của cùng buổi
 * đã bị thu hồi thì bản nháp mới chép lại nội dung để sửa nhanh.
 */
export async function openTrialReport(ctx: ProtectedContext, input: TrialReportSourceInput & { fresh?: boolean }) {
  const src = await resolveSource(ctx.db, input);
  const lead = await ctx.db.query.leads.findFirst({ where: and(eq(leads.id, src.leadId), isNull(leads.deletedAt)) });
  if (!lead) throw notFound("Không tìm thấy lead");
  assertTenant(ctx, lead, "Lead");
  const centerId = src.centerId;
  if (!centerId) throw pre("Lead chưa gắn cơ sở — gắn cơ sở cho lead trước khi lập phiếu");
  const perms = trialReportPerms(ctx, { centerId, teacherId: src.teacherId, assignedToId: lead.assignedToId });

  const [existing] = await ctx.db
    .select({ id: trialReports.id })
    .from(trialReports)
    .where(and(sameSource(src), ne(trialReports.status, "revoked")))
    .orderBy(desc(trialReports.createdAt))
    .limit(1);
  if (existing) {
    if (!perms.view) throw forbidden("Bạn không có quyền xem phiếu đánh giá này");
    return { id: existing.id, created: false };
  }
  if (!perms.fill) throw forbidden("Bạn không có quyền lập phiếu đánh giá cho buổi học thử này");

  const center = await ctx.db.query.centers.findFirst({ where: eq(centers.id, centerId) });
  if (!center) throw notFound("Không tìm thấy cơ sở");
  assertTenant(ctx, center, "Cơ sở");
  const child = src.childId ? await ctx.db.query.leadChildren.findFirst({ where: eq(leadChildren.id, src.childId) }) : null;
  const childName = clean(src.childName) ?? clean(child?.fullName) ?? clean(lead.childName) ?? "Bé";
  const [prev] = await ctx.db
    .select({
      answers: trialReports.answers, strengths: trialReports.strengths, growth: trialReports.growth, productNote: trialReports.productNote,
      readiness: trialReports.readiness, recommendedCourseId: trialReports.recommendedCourseId, recommendedLevel: trialReports.recommendedLevel,
      recommendationNote: trialReports.recommendationNote, pathway: trialReports.pathway, competitionPotential: trialReports.competitionPotential,
    })
    .from(trialReports)
    .where(and(sameSource(src), eq(trialReports.status, "revoked")))
    .orderBy(desc(trialReports.createdAt))
    .limit(1);
  const copy = input.fresh ? undefined : prev;
  const year = Number(todayLocal().slice(0, 4));

  return ctx.db.transaction(async (txx) => {
    const tx = asDb(txx);
    // Khoá theo cơ sở: hai người bấm cùng lúc không tạo trùng phiếu / trùng số
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"trial-report:" + center.id}))`);
    const [again] = await tx.select({ id: trialReports.id }).from(trialReports).where(and(sameSource(src), ne(trialReports.status, "revoked"))).limit(1);
    if (again) return { id: again.id, created: false };
    const prefix = trialReportCodePrefix(center.code, year);
    const [last] = await tx
      .select({ code: trialReports.code })
      .from(trialReports)
      .where(sql`left(${trialReports.code}, ${prefix.length}) = ${prefix}`)
      .orderBy(desc(trialReports.code))
      .limit(1);
    const code = trialReportCode(center.code, year, nextTrialReportSeq([last?.code], center.code, year));
    const [row] = await tx
      .insert(trialReports)
      .values({
        tenantId: center.tenantId,
        centerId: center.id,
        leadId: lead.id,
        childId: src.childId,
        trialBookingId: src.trialBookingId,
        trialClassEnrollmentId: src.trialClassEnrollmentId,
        courseId: src.courseId,
        teacherId: src.teacherId,
        code,
        status: "draft",
        childName,
        sessionAt: src.sessionAt,
        answers: copy && isTrialReportAnswers(copy.answers) ? copy.answers : snapshotAnswers(TRIAL_REPORT_TEMPLATE, {}),
        strengths: copy?.strengths ?? null,
        growth: copy?.growth ?? null,
        productNote: copy?.productNote ?? null,
        readiness: copy?.readiness ?? null,
        recommendedCourseId: copy?.recommendedCourseId ?? null,
        recommendedLevel: copy?.recommendedLevel ?? null,
        recommendationNote: copy?.recommendationNote ?? null,
        pathway: copy?.pathway ?? false,
        competitionPotential: copy?.competitionPotential ?? false,
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      })
      .returning({ id: trialReports.id });
    await writeAudit(tx, {
      actorId: ctx.user.id, action: "CREATE", module: "admissions", entity: "trial_reports", entityId: row!.id,
      after: { code, leadId: lead.id, childId: src.childId, trialBookingId: src.trialBookingId, trialClassEnrollmentId: src.trialClassEnrollmentId, copiedFromRevoked: !!copy },
      ip: ctx.ip,
    });
    return { id: row!.id, created: true };
  });
}

export interface TrialReportPatch {
  id: string;
  values?: Record<string, number | null>;
  strengths?: string | null;
  growth?: string | null;
  productNote?: string | null;
  readiness?: TrialReadiness | null;
  recommendedCourseId?: string | null;
  recommendedLevel?: string | null;
  recommendationNote?: string | null;
  pathway?: boolean;
  competitionPotential?: boolean;
  courseId?: string | null;
}

async function assertCourse(ctx: ProtectedContext, courseId: string | null | undefined, what: string) {
  if (!courseId) return;
  const c = await ctx.db.query.courses.findFirst({ where: eq(courses.id, courseId) });
  if (!c) throw notFound(`Không tìm thấy ${what}`);
  assertTenant(ctx, c, what);
}

/** Lưu phiếu (nháp hoặc đã phát hành). Sửa phiếu đã phát hành phải còn đủ điều kiện phát hành và được ghi nhật ký. */
export async function updateTrialReport(ctx: ProtectedContext, input: TrialReportPatch) {
  const { x, perms } = await loadForStaff(ctx, input.id);
  const r = x.r;
  if (!perms.fill) throw forbidden("Bạn không có quyền sửa phiếu đánh giá này");
  if (r.status === "revoked") throw pre("Phiếu đã thu hồi — không sửa được, hãy lập phiếu mới");
  const answers = input.values ? applyValues(answersOf(x), input.values) : answersOf(x);
  const pick = <T>(v: T | undefined, cur: T): T => (v === undefined ? cur : v);
  const next = {
    strengths: input.strengths === undefined ? r.strengths : clean(input.strengths),
    growth: input.growth === undefined ? r.growth : clean(input.growth),
    productNote: input.productNote === undefined ? r.productNote : clean(input.productNote),
    readiness: pick(input.readiness, r.readiness),
    recommendedCourseId: pick(input.recommendedCourseId, r.recommendedCourseId),
    recommendedLevel: input.recommendedLevel === undefined ? r.recommendedLevel : clean(input.recommendedLevel),
    recommendationNote: input.recommendationNote === undefined ? r.recommendationNote : clean(input.recommendationNote),
    pathway: pick(input.pathway, r.pathway),
    competitionPotential: pick(input.competitionPotential, r.competitionPotential),
    courseId: pick(input.courseId, r.courseId),
  };
  if (next.recommendedCourseId !== r.recommendedCourseId) await assertCourse(ctx, next.recommendedCourseId, "Khoá học đề xuất");
  if (next.courseId !== r.courseId) await assertCourse(ctx, next.courseId, "Khoá trải nghiệm");
  const errs = validateTrialReport({ mode: r.status === "published" ? "publish" : "draft", answers, ...next });
  if (errs.length) throw pre(r.status === "published" ? ["Phiếu đã gửi phụ huynh phải giữ đủ nội dung", ...errs] : errs);

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const cur: Record<string, unknown> = { ...r };
  for (const [k, v] of Object.entries(next)) {
    if (cur[k] !== v) { before[k] = cur[k] ?? null; after[k] = v; }
  }
  if (JSON.stringify(answers) !== JSON.stringify(r.answers)) { before.answers = answerValues(answersOf(x)); after.answers = answerValues(answers); }
  if (!Object.keys(after).length) return { ok: true, changed: 0, status: r.status };

  await ctx.db.transaction(async (txx) => {
    const tx = asDb(txx);
    const up = await tx
      .update(trialReports)
      .set({ ...next, answers, updatedBy: ctx.user.id })
      .where(and(eq(trialReports.id, r.id), eq(trialReports.status, r.status)))
      .returning({ id: trialReports.id });
    if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Phiếu vừa được người khác cập nhật — tải lại rồi sửa tiếp" });
    if (r.status === "published") {
      await tx.insert(leadActivities).values({
        leadId: r.leadId, type: "note", actorId: ctx.user.id,
        content: `Cập nhật nội dung phiếu đánh giá học thử ${r.code} (phụ huynh thấy nội dung mới ngay trên link)`,
        meta: { event: "trial_report_updated", trialReportId: r.id, code: r.code, fields: Object.keys(after) },
      });
    }
    await writeAudit(tx, {
      actorId: ctx.user.id, action: "UPDATE", module: "admissions", entity: "trial_reports", entityId: r.id, before, after,
      reason: r.status === "published" ? "Sửa phiếu đã phát hành cho phụ huynh" : null, ip: ctx.ip,
    });
  });
  return { ok: true, changed: Object.keys(after).length, status: r.status };
}

/** Phát hành: kiểm đủ nội dung, sinh token, ghi mốc; có email phụ huynh thì xếp thư. Trả link. */
export async function publishTrialReport(ctx: ProtectedContext, input: { id: string; days?: number | null }) {
  const { x, perms } = await loadForStaff(ctx, input.id);
  const r = x.r;
  if (!perms.publish) throw forbidden("Chỉ tư vấn / quản lý tuyển sinh của cơ sở được phát hành phiếu cho phụ huynh");
  if (r.status === "revoked") throw pre("Phiếu đã thu hồi — hãy lập phiếu mới");
  if (r.status === "published" && r.shareToken) {
    const path = trialReportPath(r.shareToken);
    const url = `${appUrl()}${path}`;
    return { already: true, path, url, expiresAt: r.shareExpiresAt, message: trialReportShareMessage(r.childName, url), emailQueued: false };
  }
  const errs = validateTrialReport({
    mode: "publish", answers: answersOf(x), strengths: r.strengths, growth: r.growth, productNote: r.productNote, readiness: r.readiness,
    recommendedCourseId: r.recommendedCourseId, recommendedLevel: r.recommendedLevel, recommendationNote: r.recommendationNote,
  });
  if (errs.length) throw pre(errs);

  // ≥ 32 byte ngẫu nhiên, base64url (43 ký tự) — chính là quyền xem phiếu
  const token = randomBytes(32).toString("base64url");
  const days = clampShareDays(input.days ?? defaultShareDays());
  const now = new Date();
  const expiresAt = shareExpiresAt(now, days);
  const path = trialReportPath(token);
  const url = `${appUrl()}${path}`;
  const canEmail = !!x.leadEmail && isEmail(x.leadEmail) && !x.leadProcessingRestricted && !x.leadAnonymizedAt;

  await ctx.db.transaction(async (txx) => {
    const tx = asDb(txx);
    const up = await tx
      .update(trialReports)
      .set({ status: "published", shareToken: token, shareExpiresAt: expiresAt, publishedAt: now, publishedBy: ctx.user.id, updatedBy: ctx.user.id })
      .where(and(eq(trialReports.id, r.id), eq(trialReports.status, "draft")))
      .returning({ id: trialReports.id });
    if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Phiếu vừa được người khác cập nhật — tải lại rồi thử lại" });
    await tx.insert(leadActivities).values({
      leadId: r.leadId, type: "note", actorId: ctx.user.id,
      content: `Đã gửi phiếu đánh giá học thử ${r.code} của ${r.childName} (link hiệu lực đến ${dmy(expiresAt)})`,
      meta: { event: "trial_report_published", trialReportId: r.id, code: r.code, emailQueued: canEmail },
    });
    if (canEmail) {
      await queueEmail(tx, {
        to: x.leadEmail!, event: "TRIAL_REPORT_PUBLISHED",
        vars: { ten_ph: x.leadParentName, ten_be: r.childName, link: url, co_so: x.centerName },
        relatedType: "trial_report", relatedId: r.id, createdBy: ctx.user.id, tenantId: r.tenantId ?? x.centerTenantId ?? null,
      });
    }
    await writeAudit(tx, {
      actorId: ctx.user.id, action: "TRANSITION", module: "admissions", entity: "trial_reports", entityId: r.id,
      before: { status: r.status }, after: { status: "published", shareExpiresAt: expiresAt.toISOString(), days, emailQueued: canEmail }, ip: ctx.ip,
    });
  });
  return { already: false, path, url, expiresAt, message: trialReportShareMessage(r.childName, url), emailQueued: canEmail };
}

/** Thu hồi link (bắt buộc lý do) — link ngừng hiệu lực ngay, phụ huynh mở sẽ thấy thông báo lịch sự */
export async function revokeTrialReport(ctx: ProtectedContext, input: { id: string; reason: string }) {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new TRPCError({ code: "BAD_REQUEST", message: "Nhập lý do thu hồi (tối thiểu 3 ký tự)" });
  const { x, perms } = await loadForStaff(ctx, input.id);
  const r = x.r;
  if (!perms.publish) throw forbidden("Bạn không có quyền thu hồi link phiếu này");
  if (r.status !== "published") throw pre("Chỉ thu hồi được phiếu đang phát hành");
  await ctx.db.transaction(async (txx) => {
    const tx = asDb(txx);
    const up = await tx
      .update(trialReports)
      .set({ status: "revoked", revokedAt: new Date(), revokedBy: ctx.user.id, revokeReason: reason, updatedBy: ctx.user.id })
      .where(and(eq(trialReports.id, r.id), eq(trialReports.status, "published")))
      .returning({ id: trialReports.id });
    if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Phiếu vừa được người khác cập nhật" });
    await tx.insert(leadActivities).values({
      leadId: r.leadId, type: "note", actorId: ctx.user.id,
      content: `Thu hồi link phiếu đánh giá học thử ${r.code} — ${reason}`,
      meta: { event: "trial_report_revoked", trialReportId: r.id, code: r.code },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id, action: "TRANSITION", module: "admissions", entity: "trial_reports", entityId: r.id,
      before: { status: "published" }, after: { status: "revoked" }, reason, ip: ctx.ip,
    });
  });
  return { ok: true };
}

/** Gia hạn link thêm N ngày (tính từ hạn cũ hoặc từ hôm nay nếu đã hết hạn), không quá trần */
export async function extendTrialReport(ctx: ProtectedContext, input: { id: string; days: number }) {
  const { x, perms } = await loadForStaff(ctx, input.id);
  const r = x.r;
  if (!perms.publish) throw forbidden("Bạn không có quyền gia hạn link phiếu này");
  if (r.status !== "published") throw pre("Chỉ gia hạn được phiếu đang phát hành");
  const now = new Date();
  const base = r.shareExpiresAt && r.shareExpiresAt.getTime() > now.getTime() ? r.shareExpiresAt : now;
  const cap = shareExpiresAt(now, TRIAL_REPORT_SHARE_DAYS_MAX);
  const wanted = shareExpiresAt(base, input.days);
  const expiresAt = wanted.getTime() > cap.getTime() ? cap : wanted;
  await ctx.db.transaction(async (txx) => {
    const tx = asDb(txx);
    await tx.update(trialReports).set({ shareExpiresAt: expiresAt, updatedBy: ctx.user.id }).where(and(eq(trialReports.id, r.id), eq(trialReports.status, "published")));
    await writeAudit(tx, {
      actorId: ctx.user.id, action: "UPDATE", module: "admissions", entity: "trial_reports", entityId: r.id,
      before: { shareExpiresAt: r.shareExpiresAt?.toISOString() ?? null }, after: { shareExpiresAt: expiresAt.toISOString() }, ip: ctx.ip,
    });
  });
  return { ok: true, expiresAt };
}

/* ------------------------------------------------------------------ */
/* "Việc hôm nay": buổi học thử quá 24 giờ chưa có phiếu phát hành      */
/* ------------------------------------------------------------------ */

/** Chỉ nhắc buổi thử trong 30 ngày gần nhất — lịch sử cũ hơn không còn giá trị gửi phụ huynh */
const PENDING_WINDOW_DAYS = 30;

export interface PendingTrialReport {
  kind: "booking" | "enrollment";
  sourceId: string;
  leadId: string;
  childName: string;
  sessionAt: Date;
  centerCode: string;
  classLabel: string;
  trialClassId: string | null;
  hasDraft: boolean;
}

function anywhere(ctx: ProtectedContext, perm: Permission) {
  if (authorize(ctx.actor, perm, {}).allowed) return true;
  return ctx.actor.assignments.some((a) => authorize(ctx.actor, perm, { centerId: a.centerId }).allowed);
}

/**
 * Buổi học thử đã diễn ra quá 24 giờ (lượt thử lẻ đã ghi "đến học" / học viên lớp trải nghiệm đã có mặt)
 * mà chưa có phiếu `published`. `null` = người dùng không có quyền với nhóm việc này.
 */
export async function pendingTrialReports(ctx: ProtectedContext, input: { limit?: number } = {}): Promise<{ total: number; overdue: number; items: PendingTrialReport[] } | null> {
  const broad = anywhere(ctx, "trials:manage") || anywhere(ctx, "trials:attendance") || anywhere(ctx, "lead:update");
  let own: SQL = sql`true`;
  if (!broad) {
    if (hasPermission(ctx.actor, "lead:update")) own = sql`src.assigned_to_id = ${ctx.user.id}`;
    // GV chỉ có quyền "của mình": chỉ buổi lớp trải nghiệm mình đứng (trang học thử buổi lẻ cần quyền xem lead)
    else if (hasPermission(ctx.actor, "trials:attendance") && ctx.actor.personId) own = sql`src.teacher_id = ${ctx.actor.personId} and src.kind = 'enrollment'`;
    else return null;
  }
  const visible = visibleCenterIds(ctx.actor);
  const centerScope = visible === null ? sql`true` : visible.length ? sql`src.center_id in (${sql.join(visible.map((v) => sql`${v}::uuid`), sql`, `)})` : sql`false`;
  const limit = Math.min(100, Math.max(1, input.limit ?? 25));
  const base = sql`
    with src as (
      select 'booking'::text as kind, tb.id as source_id, tb.lead_id, coalesce(tb.child_name, l.child_name, 'Bé') as child_name,
             ((s.date + s.start_time) at time zone 'Asia/Ho_Chi_Minh') as session_at,
             coalesce(tb.center_id, c.center_id) as center_id, c.code as class_label, null::uuid as trial_class_id,
             l.assigned_to_id, coalesce(s.teacher_id, c.lead_teacher_id) as teacher_id
        from trial_bookings tb
        join sessions s on s.id = tb.session_id
        join classes c on c.id = s.class_id
        join leads l on l.id = tb.lead_id
       where tb.status = 'attended' and l.deleted_at is null and ${tenantSql(ctx, "l")}
         and s.date >= (current_date - ${PENDING_WINDOW_DAYS + 1}::int)
      union all
      select 'enrollment'::text, e.id, e.lead_id, e.student_name, x.session_at,
             tc.center_id, tc.name, tc.id, l.assigned_to_id, x.teacher_id
        from trial_class_enrollments e
        join trial_classes tc on tc.id = e.trial_class_id
        join leads l on l.id = e.lead_id
        join lateral (
          select ((ts.date + ts.start_time) at time zone 'Asia/Ho_Chi_Minh') as session_at, ts.teacher_id
            from trial_class_sessions ts
            join trial_attendance ta on ta.trial_session_id = ts.id and ta.enrollment_id = e.id and ta.status in ('present', 'late')
           where ts.status <> 'cancelled'
           order by ts.date desc, ts.start_time desc
           limit 1
        ) x on true
       where e.status = 'enrolled' and tc.status <> 'cancelled' and tc.deleted_at is null and l.deleted_at is null
         and ${tenantSql(ctx, "tc")}
    )
    select src.*, ce.code as center_code,
           exists (select 1 from trial_reports d where d.status = 'draft'
                     and ((src.kind = 'booking' and d.trial_booking_id = src.source_id) or (src.kind = 'enrollment' and d.trial_class_enrollment_id = src.source_id))) as has_draft
      from src
      join centers ce on ce.id = src.center_id
     where src.session_at < now() - interval '24 hours'
       and src.session_at > now() - make_interval(days => ${PENDING_WINDOW_DAYS})
       and not exists (select 1 from trial_reports p where p.status = 'published'
                         and ((src.kind = 'booking' and p.trial_booking_id = src.source_id) or (src.kind = 'enrollment' and p.trial_class_enrollment_id = src.source_id)))
       and ${centerScope}
       and ${own}`;
  const [counts] = (await ctx.db.execute(sql`
    select count(*)::int as total, count(*) filter (where q.session_at < now() - interval '48 hours')::int as overdue
      from (${base}) q`)) as unknown as { total: number; overdue: number }[];
  const total = counts?.total ?? 0;
  if (!total) return { total: 0, overdue: 0, items: [] };
  const rows = (await ctx.db.execute(sql`select * from (${base}) q order by q.session_at asc limit ${limit}`)) as unknown as {
    kind: "booking" | "enrollment"; source_id: string; lead_id: string; child_name: string; session_at: Date | string; center_code: string;
    class_label: string; trial_class_id: string | null; has_draft: boolean;
  }[];
  return {
    total,
    overdue: counts?.overdue ?? 0,
    items: rows.map((r) => ({
      kind: r.kind, sourceId: r.source_id, leadId: r.lead_id, childName: r.child_name,
      sessionAt: r.session_at instanceof Date ? r.session_at : new Date(r.session_at),
      centerCode: r.center_code, classLabel: r.class_label, trialClassId: r.trial_class_id, hasDraft: !!r.has_draft,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* CÔNG KHAI (không đăng nhập) — token là quyền                         */
/* ------------------------------------------------------------------ */

export type PublicTrialReportResult =
  | { state: "not_found" }
  | { state: "expired" | "revoked"; center: { name: string; phone: string | null } }
  | { state: "ok"; report: TrialReportView; responded: boolean };

/**
 * Phiếu cho phụ huynh xem. Chỉ trả trường in trên phiếu (không SĐT / email phụ huynh, không id nội bộ).
 * Mỗi lần mở tăng `view_count` và ghi mốc xem.
 */
export async function publicTrialReport(db: Database, token: string): Promise<PublicTrialReportResult> {
  if (!TRIAL_REPORT_TOKEN_RE.test(token)) return { state: "not_found" };
  const d = asDb(db);
  const x = await loadRow(d, eq(trialReports.shareToken, token));
  if (!x || x.leadDeletedAt || x.leadAnonymizedAt) return { state: "not_found" };
  const center = { name: x.centerName, phone: x.centerPhone };
  const st = shareLinkState(x.r, new Date());
  if (st === "not_published") return { state: "not_found" };
  if (st === "revoked" || st === "expired") return { state: st, center };
  try {
    // SQL thô để không chạm cột updated_at (xem không phải là sửa phiếu)
    await d.execute(sql`update trial_reports set view_count = view_count + 1, first_viewed_at = coalesce(first_viewed_at, now()), last_viewed_at = now() where id = ${x.r.id}`);
  } catch {
    // Đếm lượt xem là phụ — lỗi cũng không được chặn phụ huynh xem phiếu
  }
  return { state: "ok", report: toView(x), responded: !!x.r.parentResponse };
}

async function consultRecipients(db: Db, centerId: string, assignedToId: string | null) {
  if (assignedToId) return [assignedToId];
  const rows = await db
    .select({ u: userRoles.userId })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(users.isActive, true), eq(userRoles.centerId, centerId), inArray(userRoles.role, ["CENTER_MANAGER", "CENTER_SALES_CSM"])));
  return [...new Set(rows.map((r) => r.u))];
}

export const CONSULT_RECEIVED_MESSAGE = "Trung tâm đã nhận yêu cầu. Tư vấn viên sẽ liên hệ anh/chị trong thời gian sớm nhất.";

/**
 * Phụ huynh bấm "Đăng ký tư vấn lộ trình": ghi nhận MỘT lần cho mỗi link, tạo hoạt động + việc gọi lại
 * trên lead và báo tư vấn phụ trách (chưa có người phụ trách thì báo quản lý / tư vấn của cơ sở).
 */
export async function publicTrialReportRespond(db: Database, token: string): Promise<{ ok: true; already: boolean; message: string } | { ok: false; error: string }> {
  if (!TRIAL_REPORT_TOKEN_RE.test(token)) return { ok: false, error: "Liên kết không hợp lệ" };
  const d = asDb(db);
  const x = await loadRow(d, eq(trialReports.shareToken, token));
  if (!x || x.leadDeletedAt || x.leadAnonymizedAt) return { ok: false, error: "Liên kết không hợp lệ" };
  const st = shareLinkState(x.r, new Date());
  if (st !== "ok") return { ok: false, error: "Liên kết đã hết hạn hoặc đã được thu hồi. Anh/chị vui lòng gọi cho cơ sở để được hỗ trợ." };
  if (x.r.parentResponse) return { ok: true, already: true, message: CONSULT_RECEIVED_MESSAGE };
  const r = x.r;
  return d.transaction(async (txx) => {
    const tx = asDb(txx);
    const up = (await tx.execute(sql`
      update trial_reports set parent_response = 'consult_requested', parent_responded_at = now()
       where id = ${r.id} and parent_response is null and status = 'published'
       returning id`)) as unknown as { id: string }[];
    if (!up.length) return { ok: true as const, already: true, message: CONSULT_RECEIVED_MESSAGE };
    await tx.insert(leadActivities).values({
      leadId: r.leadId, type: "system", actorId: null,
      content: `Phụ huynh bấm "Đăng ký tư vấn lộ trình" trên phiếu đánh giá học thử ${r.code} của ${r.childName}`,
      meta: { event: "trial_report_consult_requested", trialReportId: r.id, code: r.code },
    });
    await tx.insert(leadTasks).values({
      leadId: r.leadId, title: `Gọi tư vấn lộ trình cho ${r.childName} (PH đăng ký từ phiếu đánh giá)`,
      dueAt: new Date(Date.now() + 2 * 3600e3), assigneeId: x.leadAssignedToId, createdByRule: "TRIAL_REPORT_CONSULT",
    });
    await tx.update(leads).set({ nextActionAt: new Date() }).where(and(eq(leads.id, r.leadId), isNull(leads.nextActionAt)));
    await deliverNotifications(tx, await consultRecipients(tx, r.centerId, x.leadAssignedToId), {
      title: "Phụ huynh đăng ký tư vấn lộ trình",
      body: `${r.childName} · phiếu ${r.code} — gọi lại trong 2 giờ`,
      link: `/leads/${r.leadId}`,
      priority: 1,
      type: "trial.consult_requested",
      dedupeKey: `pdg-consult:${r.id}`,
      tenantId: r.tenantId,
    });
    await writeAudit(tx, {
      actorId: null, action: "UPDATE", module: "admissions", entity: "trial_reports", entityId: r.id,
      before: { parentResponse: null }, after: { parentResponse: "consult_requested" }, reason: "Phụ huynh bấm trên link công khai", tenantId: r.tenantId,
    });
    return { ok: true as const, already: false, message: CONSULT_RECEIVED_MESSAGE };
  });
}
