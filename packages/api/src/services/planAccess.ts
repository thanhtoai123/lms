/**
 * QUYỀN XEM GIÁO ÁN THEO CA DẠY + YÊU CẦU XEM NGOÀI CA (luật thuần: core/content/planAccess.ts).
 *
 * Mọi đường phát nội dung giáo án đều đi qua `assertPlanAccess`:
 *   - siêu dữ liệu + khung chiếu (lessonPlans.getPlan / openPlan),
 *   - luồng slide PDF (/api/content/giao-an/<bài>/tep → lessonPlans.planFileStream),
 *   - tài liệu nhóm "giáo án" mở qua kho tài liệu / SCORM (documents.loadDocForRead → getDocument,
 *     openDocument, scormLaunch, scormCommit). URL ký của gói SCORM được cắt hạn theo quyền còn lại.
 * Người đọc toàn kho (`document:read` đầy đủ) không bị giới hạn.
 */
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  lessonPlanAccessRequests, lessons, curricula, courses, centers, documents, sessions, classes, teachers, users, userRoles,
} from "@satarobo/db";
import {
  addDays, authorize, centersWith, gioVietNam, caDangMo, caSapMo, gioPhut, grantConHan, choDuyetConHan, trangThaiYeuCau, hanXem,
  loiLyDoXem, loiDuyetXem, PLAN_PENDING_MAX, PLAN_REQUEST_TTL_HOURS, PLAN_REQUEST_STATUS_VI, PLAN_GRANT_MIN,
  type PlanAccessVia, type PlanDecision, type PlanRequestStatus,
} from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { tenantCond } from "./tenantScope";
import { writeAudit } from "./audit";
import { deliverNotifications } from "./notify";
import { docReadsAll, readableCourseIds } from "./documents";

const bad = (m: string) => new TRPCError({ code: "BAD_REQUEST", message: m });
const pre = (m: string) => new TRPCError({ code: "PRECONDITION_FAILED", message: m });
const forbid = (m: string) => new TRPCError({ code: "FORBIDDEN", message: m });
const notFound = (m: string) => new TRPCError({ code: "NOT_FOUND", message: m });

export const PLAN_LOCKED_MESSAGE = "Giáo án chỉ mở trong ca dạy bài này (từ 30 phút trước giờ vào lớp đến 15 phút sau giờ tan) hoặc khi quản lý đã duyệt yêu cầu xem";
const TTL_MS = PLAN_REQUEST_TTL_HOURS * 3600_000;
/** Mốc giờ Việt Nam (ngày + phút) → Date */
const vnDate = (day: string, min: number) => new Date(`${day}T${gioPhut(min)}:00+07:00`);

async function myTeacher(ctx: ProtectedContext) {
  return (await ctx.db.query.teachers.findFirst({ where: eq(teachers.userId, ctx.user.id), columns: { id: true, centerId: true, fullName: true } })) ?? null;
}

/**
 * Buổi của tôi gắn các bài này trong [from, to]. "Của tôi" = tôi dạy buổi đó (kể cả dạy thay),
 * hoặc tôi là trợ giảng của lớp, hoặc buổi chưa gán người dạy và tôi là GV chính của lớp.
 * GV chính KHÔNG được mở khi buổi đã giao người khác dạy thay.
 */
async function mySessions(ctx: ProtectedContext, teacherId: string, lessonIds: string[], from: string, to: string) {
  if (!lessonIds.length) return [];
  return ctx.db.select({
    id: sessions.id, lessonId: sessions.lessonId, date: sessions.date, startTime: sessions.startTime, endTime: sessions.endTime,
    status: sessions.status, classId: sessions.classId, classCode: classes.code,
  })
    .from(sessions).innerJoin(classes, eq(classes.id, sessions.classId))
    .where(and(
      inArray(sessions.lessonId, lessonIds), gte(sessions.date, from), lte(sessions.date, to),
      or(eq(sessions.teacherId, teacherId), eq(classes.assistantTeacherId, teacherId), and(isNull(sessions.teacherId), eq(classes.leadTeacherId, teacherId))),
    ))
    .orderBy(asc(sessions.date), asc(sessions.startTime));
}

async function myRequestsFor(ctx: ProtectedContext, lessonIds: string[]) {
  if (!lessonIds.length) return [];
  return ctx.db.select().from(lessonPlanAccessRequests)
    .where(and(eq(lessonPlanAccessRequests.requestedBy, ctx.user.id), inArray(lessonPlanAccessRequests.lessonId, lessonIds), gt(lessonPlanAccessRequests.createdAt, new Date(Date.now() - 7 * 86_400_000))))
    .orderBy(desc(lessonPlanAccessRequests.createdAt));
}

export type PlanAccessState = {
  allowed: boolean;
  via: PlanAccessVia | null;
  /** Hết quyền lúc (ISO) — null khi không giới hạn */
  until: string | null;
  /** Ca gần nhất sẽ mở giáo án */
  next: { sessionId: string; date: string; from: string; classCode: string } | null;
  /** Yêu cầu gần nhất của tôi cho bài này (7 ngày) */
  request: { id: string; status: PlanRequestStatus | "expired"; statusLabel: string; reason: string; decisionNote: string | null; createdAt: string; expiresAt: string | null } | null;
  canRequest: boolean;
};

const ALL: PlanAccessState = { allowed: true, via: "all", until: null, next: null, request: null, canRequest: false };

/** Trạng thái quyền xem giáo án của MỘT bài cho người đang đăng nhập */
export async function planAccessState(ctx: ProtectedContext, lessonId: string): Promise<PlanAccessState> {
  if (docReadsAll(ctx)) return ALL;
  const now = new Date();
  const { today, nowMin } = gioVietNam(now);
  const t = await myTeacher(ctx);
  const [list, reqs] = await Promise.all([
    t ? mySessions(ctx, t.id, [lessonId], today, addDays(today, 30)) : Promise.resolve([]),
    myRequestsFor(ctx, [lessonId]),
  ]);
  const ca = caDangMo(list, today, nowMin);
  const grant = reqs.find((r) => grantConHan(r, now));
  const untils = [ca ? vnDate(today, ca.untilMin) : null, grant?.expiresAt ?? null].filter((x): x is Date => !!x);
  const until = untils.length ? new Date(Math.max(...untils.map((d) => d.getTime()))) : null;
  const via: PlanAccessVia | null = !until ? null : grant && grant.expiresAt!.getTime() === until.getTime() ? "duyet" : "ca-day";
  const nx = ca ? null : caSapMo(list, today, nowMin);
  const last = reqs[0];
  const pendingLive = reqs.some((r) => choDuyetConHan(r, now));
  return {
    allowed: !!until,
    via,
    until: until?.toISOString() ?? null,
    next: nx ? { sessionId: nx.session.id, date: nx.session.date, from: gioPhut(nx.fromMin), classCode: nx.session.classCode } : null,
    request: last ? {
      id: last.id, status: trangThaiYeuCau(last, now), statusLabel: PLAN_REQUEST_STATUS_VI[trangThaiYeuCau(last, now)], reason: last.reason,
      decisionNote: last.decisionNote, createdAt: last.createdAt.toISOString(), expiresAt: last.expiresAt?.toISOString() ?? null,
    } : null,
    canRequest: !until && !pendingLive && !!t,
  };
}

/** Chặn khi không được xem — gọi ở MỌI đường phát nội dung giáo án */
export async function assertPlanAccess(ctx: ProtectedContext, lessonId: string): Promise<PlanAccessState> {
  const s = await planAccessState(ctx, lessonId);
  if (!s.allowed) throw forbid(PLAN_LOCKED_MESSAGE);
  return s;
}

export type PlanAccessBrief = { state: "all" | "open" | "granted" | "pending" | "locked"; until: string | null; opensAt: string | null };

/**
 * Trạng thái rút gọn cho NHIỀU bài (danh sách Giáo án của tôi, thẻ buổi dạy) — 2 truy vấn cho cả danh sách.
 * `opensAt` = "HH:MM dd/mm" của ca gần nhất (để nói "mở lúc …").
 */
export async function planAccessBriefs(ctx: ProtectedContext, lessonIds: string[]): Promise<Map<string, PlanAccessBrief>> {
  const ids = [...new Set(lessonIds.filter(Boolean))];
  const out = new Map<string, PlanAccessBrief>();
  if (!ids.length) return out;
  if (docReadsAll(ctx)) {
    for (const id of ids) out.set(id, { state: "all", until: null, opensAt: null });
    return out;
  }
  const now = new Date();
  const { today, nowMin } = gioVietNam(now);
  const t = await myTeacher(ctx);
  const [list, reqs] = await Promise.all([
    t ? mySessions(ctx, t.id, ids, today, addDays(today, 30)) : Promise.resolve([]),
    myRequestsFor(ctx, ids),
  ]);
  for (const id of ids) {
    const mine = list.filter((s) => s.lessonId === id);
    const ca = caDangMo(mine, today, nowMin);
    const grant = reqs.find((r) => r.lessonId === id && grantConHan(r, now));
    const nx = caSapMo(mine, today, nowMin);
    const opensAt = nx ? `${gioPhut(nx.fromMin)} ${nx.session.date.slice(8, 10)}/${nx.session.date.slice(5, 7)}` : null;
    if (ca) out.set(id, { state: "open", until: vnDate(today, ca.untilMin).toISOString(), opensAt: null });
    else if (grant) out.set(id, { state: "granted", until: grant.expiresAt!.toISOString(), opensAt });
    else if (reqs.some((r) => r.lessonId === id && choDuyetConHan(r, now))) out.set(id, { state: "pending", until: null, opensAt });
    else out.set(id, { state: "locked", until: null, opensAt });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Giáo viên gửi / huỷ yêu cầu                                          */
/* ------------------------------------------------------------------ */

async function lessonOf(ctx: ProtectedContext, lessonId: string) {
  const [l] = await ctx.db.select({ id: lessons.id, seq: lessons.sequenceNo, title: lessons.title, courseId: curricula.courseId, courseCode: courses.code })
    .from(lessons).innerJoin(curricula, eq(curricula.id, lessons.curriculumId)).innerJoin(courses, eq(courses.id, curricula.courseId))
    .where(and(eq(lessons.id, lessonId), tenantCond(ctx, courses)));
  if (!l) throw notFound("Không tìm thấy bài học");
  return l;
}

/** Người duyệt: quản lý cơ sở của cơ sở đó (vai trò còn hiệu lực); không có ai thì quản trị tối cao */
async function approverIds(ctx: ProtectedContext, centerId: string): Promise<string[]> {
  const today = gioVietNam().today;
  const valid = and(or(isNull(userRoles.validFrom), lte(userRoles.validFrom, today)), or(isNull(userRoles.validTo), gte(userRoles.validTo, today)));
  const mgr = await ctx.db.select({ u: userRoles.userId }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.role, "CENTER_MANAGER"), eq(userRoles.centerId, centerId), eq(users.isActive, true), valid));
  const ids = mgr.map((m) => m.u).filter((u) => u !== ctx.user.id);
  if (ids.length) return ids;
  const sa = await ctx.db.select({ u: userRoles.userId }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.role, "SUPER_ADMIN"), eq(users.isActive, true), valid));
  return sa.map((m) => m.u).filter((u) => u !== ctx.user.id);
}

export async function requestPlanAccess(ctx: ProtectedContext, input: { lessonId: string; reason: string; sessionId?: string | null }) {
  const err = loiLyDoXem(input.reason);
  if (err) throw bad(err);
  if (docReadsAll(ctx)) throw pre("Bạn xem được mọi giáo án — không cần gửi yêu cầu");
  const l = await lessonOf(ctx, input.lessonId);
  const readable = await readableCourseIds(ctx);
  if (readable !== null && !readable.includes(l.courseId)) throw forbid("Bài này không thuộc khoá bạn dạy");
  const doc = await ctx.db.query.documents.findFirst({
    where: and(eq(documents.lessonId, l.id), eq(documents.category, "lesson_plan"), sql`${documents.status} <> 'archived'`, gt(documents.currentVersion, 0)),
    columns: { id: true },
  });
  if (!doc) throw pre("Bài này chưa có giáo án để xem");
  const t = await myTeacher(ctx);
  if (!t) throw forbid("Tài khoản chưa gắn hồ sơ giáo viên");
  const state = await planAccessState(ctx, l.id);
  if (state.allowed) throw pre("Bạn đang xem được giáo án này — không cần gửi yêu cầu");

  const now = new Date();
  // Yêu cầu chờ quá hạn: đóng lại để không chặn yêu cầu mới (chỉ mục duy nhất theo người + bài)
  await ctx.db.update(lessonPlanAccessRequests)
    .set({ status: "cancelled", decisionNote: `Hết hạn chờ duyệt (${PLAN_REQUEST_TTL_HOURS} giờ)`, updatedAt: now })
    .where(and(eq(lessonPlanAccessRequests.requestedBy, ctx.user.id), eq(lessonPlanAccessRequests.status, "pending"), lt(lessonPlanAccessRequests.createdAt, new Date(now.getTime() - TTL_MS))));
  const [{ n } = { n: 0 }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(lessonPlanAccessRequests)
    .where(and(eq(lessonPlanAccessRequests.requestedBy, ctx.user.id), eq(lessonPlanAccessRequests.status, "pending")));
  if (n >= PLAN_PENDING_MAX) throw pre(`Bạn đang có ${n} yêu cầu chờ duyệt — chờ quản lý xử lý hoặc huỷ bớt trước khi gửi thêm`);

  // Cơ sở duyệt: cơ sở của hồ sơ giáo viên; chưa gắn thì cơ sở của lớp đang dạy khoá này
  let centerId = t.centerId;
  if (!centerId) {
    const [c] = await ctx.db.select({ c: classes.centerId }).from(classes)
      .where(and(eq(classes.courseId, l.courseId), or(eq(classes.leadTeacherId, t.id), eq(classes.assistantTeacherId, t.id)))).limit(1);
    centerId = c?.c ?? null;
  }
  if (!centerId) throw pre("Chưa xác định được cơ sở của bạn để gửi quản lý duyệt — báo nhân sự gắn cơ sở cho hồ sơ giáo viên");
  const [center] = await ctx.db.select({ id: centers.id, code: centers.code, tenantId: centers.tenantId }).from(centers).where(and(eq(centers.id, centerId), tenantCond(ctx, centers)));
  if (!center) throw forbid("Cơ sở không thuộc phạm vi của bạn");

  // Buổi liên quan (tuỳ chọn): chỉ nhận buổi của chính mình gắn đúng bài này
  let sessionId: string | null = null;
  if (input.sessionId) {
    const s = (await mySessions(ctx, t.id, [l.id], "2000-01-01", "2999-12-31")).find((x) => x.id === input.sessionId);
    sessionId = s?.id ?? null;
  }

  let row: { id: string } | undefined;
  try {
    [row] = await ctx.db.insert(lessonPlanAccessRequests).values({
      tenantId: center.tenantId ?? null, lessonId: l.id, courseId: l.courseId, centerId: center.id, requestedBy: ctx.user.id, teacherId: t.id,
      sessionId, reason: input.reason.trim(), status: "pending",
    }).returning({ id: lessonPlanAccessRequests.id });
  } catch (e) {
    if (String((e as { code?: string })?.code) === "23505" || /plan_access_req_pending_uq/.test(String(e))) throw pre("Bạn đã có yêu cầu đang chờ duyệt cho bài này");
    throw e;
  }
  const who = await approverIds(ctx, center.id);
  await deliverNotifications(ctx.db, who, {
    title: `${t.fullName} xin xem giáo án ${l.courseCode} · Buổi ${l.seq}`,
    body: `${l.title} — ${input.reason.trim().slice(0, 160)}`,
    link: `/duyet-xem-giao-an?id=${row!.id}`, priority: 2, type: "plan_access.requested", tenantId: center.tenantId ?? null,
  });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "content", entity: "lesson_plan_access_requests", entityId: row!.id, after: { lessonId: l.id, centerId: center.id, sessionId, reason: input.reason.trim() }, ip: ctx.ip });
  return { id: row!.id };
}

export async function cancelPlanAccess(ctx: ProtectedContext, input: { id: string }) {
  const [r] = await ctx.db.update(lessonPlanAccessRequests).set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(lessonPlanAccessRequests.id, input.id), eq(lessonPlanAccessRequests.requestedBy, ctx.user.id), eq(lessonPlanAccessRequests.status, "pending")))
    .returning({ id: lessonPlanAccessRequests.id });
  if (!r) throw pre("Không huỷ được — yêu cầu không còn chờ duyệt");
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "content", entity: "lesson_plan_access_requests", entityId: r.id, after: { status: "cancelled" }, ip: ctx.ip });
  return { ok: true };
}

/** Yêu cầu của tôi (14 ngày) — giáo viên xem lại trạng thái */
export async function myPlanAccessRequests(ctx: ProtectedContext) {
  const now = new Date();
  const rows = await ctx.db.select({ r: lessonPlanAccessRequests, seq: lessons.sequenceNo, title: lessons.title, courseCode: courses.code, decider: users.fullName })
    .from(lessonPlanAccessRequests)
    .innerJoin(lessons, eq(lessons.id, lessonPlanAccessRequests.lessonId))
    .innerJoin(courses, eq(courses.id, lessonPlanAccessRequests.courseId))
    .leftJoin(users, eq(users.id, lessonPlanAccessRequests.decidedBy))
    .where(and(eq(lessonPlanAccessRequests.requestedBy, ctx.user.id), gt(lessonPlanAccessRequests.createdAt, new Date(now.getTime() - 14 * 86_400_000))))
    .orderBy(desc(lessonPlanAccessRequests.createdAt)).limit(20);
  return rows.map((x) => {
    const st = trangThaiYeuCau(x.r, now);
    return {
      id: x.r.id, lessonId: x.r.lessonId, label: `${x.courseCode} · Buổi ${x.seq}: ${x.title}`, reason: x.r.reason, status: st, statusLabel: PLAN_REQUEST_STATUS_VI[st],
      decisionNote: x.r.decisionNote, decider: x.decider, createdAt: x.r.createdAt.toISOString(), expiresAt: x.r.expiresAt?.toISOString() ?? null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Quản lý duyệt                                                        */
/* ------------------------------------------------------------------ */

function approveScope(ctx: ProtectedContext): string[] | null {
  const c = centersWith(ctx.actor, "plan_access:approve");
  if (c !== null && !c.length) throw forbid("Không có quyền duyệt yêu cầu xem giáo án");
  return c;
}

/** Hàng đợi duyệt: đang chờ (còn hạn chờ) + đã xử lý 14 ngày gần đây, trong phạm vi cơ sở được duyệt */
export async function planAccessQueue(ctx: ProtectedContext) {
  const scope = approveScope(ctx);
  const now = new Date();
  const requester = users;
  const base = and(
    tenantCond(ctx, courses),
    scope === null ? sql`true` : inArray(lessonPlanAccessRequests.centerId, scope),
  );
  const cols = {
    r: lessonPlanAccessRequests, seq: lessons.sequenceNo, title: lessons.title, courseCode: courses.code, centerCode: centers.code,
    requester: requester.fullName, teacherName: teachers.fullName,
    decider: sql<string | null>`(select u.full_name from ${users} u where u.id = ${lessonPlanAccessRequests.decidedBy})`,
  };
  const q = () => ctx.db.select(cols).from(lessonPlanAccessRequests)
    .innerJoin(lessons, eq(lessons.id, lessonPlanAccessRequests.lessonId))
    .innerJoin(courses, eq(courses.id, lessonPlanAccessRequests.courseId))
    .innerJoin(centers, eq(centers.id, lessonPlanAccessRequests.centerId))
    .innerJoin(requester, eq(requester.id, lessonPlanAccessRequests.requestedBy))
    .leftJoin(teachers, eq(teachers.id, lessonPlanAccessRequests.teacherId));
  const [pending, recent] = await Promise.all([
    q().where(and(base, eq(lessonPlanAccessRequests.status, "pending"), gt(lessonPlanAccessRequests.createdAt, new Date(now.getTime() - TTL_MS))))
      .orderBy(asc(lessonPlanAccessRequests.createdAt)).limit(100),
    q().where(and(base, sql`${lessonPlanAccessRequests.status} <> 'pending'`, gt(lessonPlanAccessRequests.updatedAt, new Date(now.getTime() - 14 * 86_400_000))))
      .orderBy(desc(lessonPlanAccessRequests.updatedAt)).limit(50),
  ]);
  // Ngữ cảnh cho người duyệt: giáo viên có buổi nào gắn bài này trong 14 ngày tới không
  const tIds = [...new Set(pending.map((p) => p.r.teacherId).filter((x): x is string => !!x))];
  const today = gioVietNam(now).today;
  const upcoming = tIds.length
    ? await ctx.db.select({ lessonId: sessions.lessonId, teacherId: sessions.teacherId, lead: classes.leadTeacherId, asst: classes.assistantTeacherId, date: sessions.date, start: sessions.startTime, classCode: classes.code })
      .from(sessions).innerJoin(classes, eq(classes.id, sessions.classId))
      .where(and(inArray(sessions.lessonId, pending.map((p) => p.r.lessonId)), gte(sessions.date, today), lte(sessions.date, addDays(today, 14)), sql`${sessions.status} not in ('cancelled','rescheduled')`))
      .orderBy(asc(sessions.date), asc(sessions.startTime))
    : [];
  const view = (x: (typeof pending)[number]) => {
    const st = trangThaiYeuCau(x.r, now);
    const t = x.r.teacherId;
    const up = t ? upcoming.find((u) => u.lessonId === x.r.lessonId && (u.teacherId === t || u.asst === t || (!u.teacherId && u.lead === t))) : undefined;
    return {
      id: x.r.id, lessonId: x.r.lessonId, lesson: `${x.courseCode} · Buổi ${x.seq}: ${x.title}`, centerCode: x.centerCode,
      requester: x.teacherName ?? x.requester, requestedBy: x.r.requestedBy, reason: x.r.reason, status: st, statusLabel: PLAN_REQUEST_STATUS_VI[st],
      createdAt: x.r.createdAt.toISOString(), decidedAt: x.r.decidedAt?.toISOString() ?? null, expiresAt: x.r.expiresAt?.toISOString() ?? null,
      decider: x.decider, decisionNote: x.r.decisionNote,
      upcoming: up ? { date: up.date, start: up.start.slice(0, 5), classCode: up.classCode } : null,
      mine: x.r.requestedBy === ctx.user.id,
    };
  };
  return { pending: pending.map(view), recent: recent.map(view), grantMinutes: PLAN_GRANT_MIN };
}

export async function decidePlanAccess(ctx: ProtectedContext, input: { id: string; action: PlanDecision; note?: string | null }) {
  const r = await ctx.db.query.lessonPlanAccessRequests.findFirst({ where: eq(lessonPlanAccessRequests.id, input.id) });
  if (!r) throw notFound("Không tìm thấy yêu cầu");
  if (!authorize(ctx.actor, "plan_access:approve", { centerId: r.centerId }).allowed) throw forbid("Không có quyền duyệt yêu cầu của cơ sở này");
  const [c] = await ctx.db.select({ id: centers.id }).from(centers).where(and(eq(centers.id, r.centerId), tenantCond(ctx, centers)));
  if (!c) throw forbid("Yêu cầu không thuộc phạm vi của bạn");
  const now = new Date();
  const err = loiDuyetXem(r, input.action, ctx.user.id, input.note, now);
  if (err) throw pre(err);
  const note = (input.note ?? "").trim() || null;
  const T = lessonPlanAccessRequests;
  const set = input.action === "approve"
    ? { status: "approved", decidedBy: ctx.user.id, decidedAt: now, expiresAt: hanXem(now), decisionNote: note, updatedAt: now }
    : input.action === "reject"
      ? { status: "rejected", decidedBy: ctx.user.id, decidedAt: now, decisionNote: note, updatedAt: now }
      : { status: "revoked", decidedBy: ctx.user.id, decidedAt: now, expiresAt: now, decisionNote: note ?? "Thu hồi sớm", updatedAt: now };
  // Điều kiện trạng thái ngay trong câu UPDATE: hai người duyệt cùng lúc thì chỉ một người thành công
  const cond = input.action === "revoke" ? and(eq(T.id, r.id), eq(T.status, "approved"), gt(T.expiresAt, now)) : and(eq(T.id, r.id), eq(T.status, "pending"));
  const [u] = await ctx.db.update(T).set(set).where(cond).returning({ id: T.id, expiresAt: T.expiresAt });
  if (!u) throw pre("Yêu cầu vừa được người khác xử lý — tải lại trang");
  const l = await lessonOf(ctx, r.lessonId).catch(() => null);
  const what = l ? `${l.courseCode} · Buổi ${l.seq}` : "giáo án";
  const hh = u.expiresAt ? u.expiresAt.toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }) : "";
  await deliverNotifications(ctx.db, [r.requestedBy], {
    title: input.action === "approve" ? `Được duyệt xem giáo án ${what} đến ${hh}` : input.action === "reject" ? `Yêu cầu xem giáo án ${what} bị từ chối` : `Quyền xem giáo án ${what} đã bị thu hồi`,
    body: note ?? (input.action === "approve" ? `Mở trong ${PLAN_GRANT_MIN / 60} giờ kể từ lúc duyệt.` : ""),
    link: `/teacher/giao-an/${r.lessonId}`, priority: 2, type: "plan_access.decided", tenantId: r.tenantId ?? null,
  });
  await writeAudit(ctx.db, {
    actorId: ctx.user.id, action: "UPDATE", module: "content", entity: "lesson_plan_access_requests", entityId: r.id,
    before: { status: r.status, expiresAt: r.expiresAt }, after: { status: set.status, expiresAt: u.expiresAt, note }, reason: note, ip: ctx.ip,
  });
  return { ok: true, expiresAt: u.expiresAt?.toISOString() ?? null };
}

/** Số yêu cầu đang chờ trong phạm vi duyệt (hộp việc, huy hiệu menu) */
export async function pendingPlanAccessCount(ctx: ProtectedContext): Promise<number> {
  const c = centersWith(ctx.actor, "plan_access:approve");
  if (c !== null && !c.length) return 0;
  const [{ n } = { n: 0 }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(lessonPlanAccessRequests)
    .innerJoin(courses, eq(courses.id, lessonPlanAccessRequests.courseId))
    .where(and(tenantCond(ctx, courses), eq(lessonPlanAccessRequests.status, "pending"), gt(lessonPlanAccessRequests.createdAt, new Date(Date.now() - TTL_MS)),
      c === null ? sql`true` : inArray(lessonPlanAccessRequests.centerId, c)));
  return n;
}
