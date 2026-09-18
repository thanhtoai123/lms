import { and, eq, inArray, sql, desc, asc, or, ilike, gte, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";
import {
  coinTransactions, coinRules, rewardItems, redemptions, inventoryItems, stockLevels, students, classes, centers, enrollments, sessions, attendance, users, userNotifications, userRoles,
} from "@satarobo/db";
import {
  authorize, visibleCenterIds, hasRole, hasPermission,
  validateAward, validateAdjust, revokeBlock, balanceAfter, redemptionTransition, availableBalance, validateReward, coinTier,
  validateCoinRule, coinsFor, COIN_RULE_CODES, COIN_RULE_DEFS,
  COIN_REASON_VI, REDEMPTION_STATUS_VI, COIN_LIMITS,
  type Permission, type CoinReason, type CoinLevel, type CoinRuleCode, type RedemptionStatus, type RedemptionAction,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { tenantCond } from "./tenantScope";

function requireCoinRead(ctx: ProtectedContext) {
  if (!hasPermission(ctx.actor, "coin:read")) throw new TRPCError({ code: "FORBIDDEN", message: "Không có quyền coin:read" });
}
import { writeAudit } from "./audit";
import { deliverNotifications } from "./notify";
import { todayISO } from "./sessions";
import { applyMovement, nextStockCode } from "./inventory";

type Db = ProtectedContext["db"];
const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });
const pre = (m: string | string[]) => new TRPCError({ code: "PRECONDITION_FAILED", message: Array.isArray(m) ? m.join("; ") : m });
const notFound = (m: string) => new TRPCError({ code: "NOT_FOUND", message: m });
const forbid = (m: string) => new TRPCError({ code: "FORBIDDEN", message: m });
const can = (ctx: ProtectedContext, p: Permission, centerId: string | null, ownerIds?: string[]) => authorize(ctx.actor, p, { centerId, ownerIds }).allowed;
const PAGE = 50;

function rule<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if ((e as Error)?.name === "RewardRuleError" || (e as Error)?.name === "InventoryRuleError") throw pre((e as Error).message);
    throw e;
  }
}
function scopeOn(ctx: ProtectedContext, col: AnyPgColumn): SQL {
  const v = visibleCenterIds(ctx.actor);
  if (v === null) return sql`true`;
  return v.length ? (inArray(col, v) as SQL) : sql`false`;
}
const dayStartVN = () => new Date(`${todayISO()}T00:00:00+07:00`);

/** Cấp thưởng của người dùng tại cơ sở: head (toàn hệ thống) > center > teacher (lớp mình dạy) */
function levelAt(ctx: ProtectedContext, centerId: string, teacherIds: string[]): CoinLevel | null {
  const global = ctx.actor.assignments.some((a) => a.centerId === null && authorize({ userId: ctx.actor.userId, assignments: [a] }, "coin:award", {}).allowed);
  if (global) return "head";
  if (can(ctx, "coin:award", centerId)) return "center";
  if (can(ctx, "coin:award_own", centerId, teacherIds)) return "teacher";
  return null;
}
function adjustLevel(ctx: ProtectedContext, centerId: string): CoinLevel | null {
  if (!can(ctx, "coin:adjust", centerId)) return null;
  return ctx.actor.assignments.some((a) => a.centerId === null && authorize({ userId: ctx.actor.userId, assignments: [a] }, "coin:adjust", {}).allowed) ? "head" : "center";
}

/** Khoá theo học viên trong transaction rồi đọc số dư mới nhất */
async function lockedBalance(tx: Db, studentId: string): Promise<number> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`coin:${studentId}`}))`);
  const [r] = await tx.select({ b: coinTransactions.balanceAfter }).from(coinTransactions).where(eq(coinTransactions.studentId, studentId)).orderBy(desc(coinTransactions.createdAt), desc(coinTransactions.id)).limit(1);
  return r?.b ?? 0;
}
async function postTx(tx: Db, x: { studentId: string; centerId: string; amount: number; reason: CoinReason; note?: string | null; classId?: string | null; sessionId?: string | null; redemptionId?: string | null; revokesId?: string | null; userId: string | null }) {
  const bal = await lockedBalance(tx, x.studentId);
  const after = rule(() => balanceAfter(bal, x.amount));
  const [row] = await tx.insert(coinTransactions).values({
    studentId: x.studentId, centerId: x.centerId, amount: x.amount, balanceAfter: after, reason: x.reason, note: x.note?.trim() || null,
    classId: x.classId ?? null, sessionId: x.sessionId ?? null, redemptionId: x.redemptionId ?? null, revokesId: x.revokesId ?? null, createdBy: x.userId,
  }).returning();
  return row!;
}
async function balancesOf(db: Db, ids: string[]) {
  if (!ids.length) return new Map<string, { balance: number; earned: number; held: number }>();
  const rows = await db.select({
    studentId: coinTransactions.studentId,
    balance: sql<number>`coalesce(sum(${coinTransactions.amount}), 0)::int`,
    earned: sql<number>`coalesce(sum(${coinTransactions.amount}) filter (where ${coinTransactions.amount} > 0 and ${coinTransactions.reason} not in ('redeem_refund')), 0)::int`,
  }).from(coinTransactions).where(inArray(coinTransactions.studentId, ids)).groupBy(coinTransactions.studentId);
  const held = await db.select({ studentId: redemptions.studentId, n: sql<number>`coalesce(sum(${redemptions.cost}), 0)::int` }).from(redemptions)
    .where(and(inArray(redemptions.studentId, ids), eq(redemptions.status, "requested"))).groupBy(redemptions.studentId);
  return new Map<string, { balance: number; earned: number; held: number }>(ids.map((id) => {
    const r = rows.find((x) => x.studentId === id);
    return [id, { balance: r?.balance ?? 0, earned: r?.earned ?? 0, held: held.find((h) => h.studentId === id)?.n ?? 0 }];
  }));
}

/* ------------------------------------------------------------------ */
/* Tra cứu                                                              */
/* ------------------------------------------------------------------ */

export async function leaderboard(ctx: ProtectedContext, input: { centerId?: string; classId?: string; q?: string; page?: number }) {
  requireCoinRead(ctx);
  const teacherOnly = !ctx.actor.assignments.some((a) => authorize({ userId: ctx.actor.userId, assignments: [a] }, "coin:read", {}).allowed);
  const conds: SQL[] = [inArray(students.status, ["active", "trial", "paused"]), tenantCond(ctx, students)];
  if (input.q?.trim()) conds.push(or(ilike(students.fullName, `%${input.q.trim()}%`), ilike(students.code, `%${input.q.trim()}%`))!);
  let classScope: SQL = sql`true`;
  if (input.classId) classScope = sql`exists (select 1 from ${enrollments} e where e.student_id = ${students.id} and e.class_id = ${input.classId} and e.status in ('active','trial'))`;
  if (teacherOnly) {
    const tid = ctx.actor.personId ?? "00000000-0000-0000-0000-000000000000";
    conds.push(sql`exists (select 1 from ${enrollments} e join ${classes} c on c.id = e.class_id where e.student_id = ${students.id} and e.status in ('active','trial') and (c.lead_teacher_id = ${tid} or c.assistant_teacher_id = ${tid}))`);
  } else {
    conds.push(scopeOn(ctx, students.homeCenterId));
  }
  if (input.centerId) conds.push(eq(students.homeCenterId, input.centerId));
  const bal = sql<number>`coalesce((select sum(t.amount) from ${coinTransactions} t where t.student_id = ${students.id}), 0)::int`;
  const page = input.page ?? 1;
  const where = and(...conds, classScope);
  const rows = await ctx.db.select({ id: students.id, code: students.code, fullName: students.fullName, centerId: students.homeCenterId, centerCode: centers.code, balance: bal })
    .from(students).leftJoin(centers, eq(centers.id, students.homeCenterId)).where(where).orderBy(desc(bal), asc(students.fullName)).limit(PAGE).offset((page - 1) * PAGE);
  const [c] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(students).where(where);
  const m = await balancesOf(ctx.db, rows.map((r) => r.id));
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [kpi] = await ctx.db.select({
    issued30: sql<number>`coalesce(sum(${coinTransactions.amount}) filter (where ${coinTransactions.amount} > 0 and ${coinTransactions.reason} <> 'redeem_refund'), 0)::int`,
    spent30: sql<number>`coalesce(-sum(${coinTransactions.amount}) filter (where ${coinTransactions.reason} = 'redeem'), 0)::int`,
    tx30: sql<number>`count(*)::int`,
  }).from(coinTransactions).where(and(gte(coinTransactions.createdAt, since), teacherOnly ? eq(coinTransactions.createdBy, ctx.user.id) : scopeOn(ctx, coinTransactions.centerId), input.centerId ? eq(coinTransactions.centerId, input.centerId) : sql`true`));
  const [pend] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(redemptions).where(and(inArray(redemptions.status, ["requested", "approved"]), scopeOn(ctx, redemptions.centerId), input.centerId ? eq(redemptions.centerId, input.centerId) : sql`true`));
  const ctrs = await ctx.db.select({ id: centers.id, code: centers.code, name: centers.name }).from(centers).where(and(eq(centers.isActive, true), scopeOn(ctx, centers.id))).orderBy(asc(centers.code));
  const cls = await ctx.db.select({ id: classes.id, code: classes.code, centerId: classes.centerId }).from(classes)
    .where(and(inArray(classes.status, ["running", "recruiting"]), teacherOnly ? sql`(${classes.leadTeacherId} = ${ctx.actor.personId ?? null} or ${classes.assistantTeacherId} = ${ctx.actor.personId ?? null})` : scopeOn(ctx, classes.centerId))).orderBy(asc(classes.code));
  const recentSessions = input.classId
    ? await ctx.db.select({ id: sessions.id, sequenceNo: sessions.sequenceNo, date: sessions.date, status: sessions.status,
        awarded: sql<number>`(select count(*)::int from ${coinTransactions} t where t.session_id = ${sessions.id} and t.reason = 'attendance')` })
      .from(sessions).where(and(eq(sessions.classId, input.classId), inArray(sessions.status, ["in_progress", "attendance_done", "notes_done", "completed"]))).orderBy(desc(sessions.date)).limit(6)
    : [];
  return {
    page, pageSize: PAGE, total: c?.n ?? 0, teacherOnly, centers: ctrs, classes: cls, recentSessions,
    kpi: { issued30: kpi?.issued30 ?? 0, spent30: kpi?.spent30 ?? 0, tx30: kpi?.tx30 ?? 0, pendingRedemptions: pend?.n ?? 0 },
    limits: COIN_LIMITS,
    canAdjust: ctrs.some((x) => can(ctx, "coin:adjust", x.id)),
    canRedeem: ctrs.some((x) => can(ctx, "coin:redeem", x.id)),
    items: rows.map((r, i) => {
      const b = m.get(r.id)!;
      return { ...r, rank: (page - 1) * PAGE + i + 1, earned: b.earned, held: b.held, available: availableBalance(b.balance, b.held), tier: coinTier(b.earned) };
    }),
  };
}

export async function studentCoins(ctx: ProtectedContext, studentId: string) {
  const s = await ctx.db.query.students.findFirst({ where: eq(students.id, studentId) });
  if (!s) throw notFound("Không tìm thấy học viên");
  const teacherIds = await teachersOfStudent(ctx.db, s.id);
  if (!can(ctx, "coin:read", s.homeCenterId) && !can(ctx, "coin:read_own", s.homeCenterId, teacherIds)) throw forbid("Không có quyền xem xu của học viên này");
  const b = (await balancesOf(ctx.db, [s.id])).get(s.id)!;
  const history = await ctx.db.select({ t: coinTransactions, byName: users.fullName, classCode: classes.code }).from(coinTransactions)
    .leftJoin(users, eq(users.id, coinTransactions.createdBy)).leftJoin(classes, eq(classes.id, coinTransactions.classId))
    .where(eq(coinTransactions.studentId, s.id)).orderBy(desc(coinTransactions.createdAt)).limit(100);
  const revoked = new Set(history.map((h) => h.t.revokesId).filter(Boolean));
  const reds = await ctx.db.select({ r: redemptions, rewardName: rewardItems.name }).from(redemptions).innerJoin(rewardItems, eq(rewardItems.id, redemptions.rewardId))
    .where(eq(redemptions.studentId, s.id)).orderBy(desc(redemptions.createdAt)).limit(30);
  const center = s.homeCenterId ?? "";
  const adj = s.homeCenterId ? adjustLevel(ctx, s.homeCenterId) : null;
  return {
    student: { id: s.id, code: s.code, fullName: s.fullName, centerId: s.homeCenterId },
    ...b, available: availableBalance(b.balance, b.held), tier: coinTier(b.earned),
    canAward: !!(s.homeCenterId && levelAt(ctx, center, teacherIds)), canAdjust: !!adj, canRedeem: !!(s.homeCenterId && can(ctx, "coin:redeem", s.homeCenterId)),
    history: history.map((h) => {
      const age = (Date.now() - h.t.createdAt.getTime()) / 86_400_000;
      return { ...h.t, reasonLabel: COIN_REASON_VI[h.t.reason as CoinReason], byName: h.byName, classCode: h.classCode, revoked: revoked.has(h.t.id),
        revokeBlock: adj ? revokeBlock({ reason: h.t.reason as CoinReason, amount: h.t.amount, revoked: revoked.has(h.t.id), ageDays: Math.floor(age), balance: b.balance }) : "Không có quyền" };
    }),
    redemptions: reds.map((r) => ({ ...r.r, rewardName: r.rewardName, statusLabel: REDEMPTION_STATUS_VI[r.r.status as RedemptionStatus] })),
  };
}

async function teachersOfStudent(db: Db, studentId: string): Promise<string[]> {
  const rows = await db.select({ a: classes.leadTeacherId, b: classes.assistantTeacherId }).from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId))
    .where(and(eq(enrollments.studentId, studentId), inArray(enrollments.status, ["active", "trial"])));
  return [...new Set(rows.flatMap((r) => [r.a, r.b]).filter((x): x is string => !!x))];
}

export async function coinLedger(ctx: ProtectedContext, input: { centerId?: string; reason?: CoinReason; mine?: boolean; page?: number }) {
  requireCoinRead(ctx);
  const conds: SQL[] = [];
  const teacherOnly = !ctx.actor.assignments.some((a) => authorize({ userId: ctx.actor.userId, assignments: [a] }, "coin:read", {}).allowed);
  if (teacherOnly || input.mine) conds.push(eq(coinTransactions.createdBy, ctx.user.id));
  else conds.push(scopeOn(ctx, coinTransactions.centerId));
  if (input.centerId) conds.push(eq(coinTransactions.centerId, input.centerId));
  if (input.reason) conds.push(eq(coinTransactions.reason, input.reason));
  const page = input.page ?? 1;
  const rows = await ctx.db.select({ t: coinTransactions, studentName: students.fullName, studentCode: students.code, byName: users.fullName, classCode: classes.code, centerCode: centers.code })
    .from(coinTransactions).innerJoin(students, eq(students.id, coinTransactions.studentId)).innerJoin(centers, eq(centers.id, coinTransactions.centerId))
    .leftJoin(users, eq(users.id, coinTransactions.createdBy)).leftJoin(classes, eq(classes.id, coinTransactions.classId))
    .where(and(...conds)).orderBy(desc(coinTransactions.createdAt)).limit(PAGE).offset((page - 1) * PAGE);
  const [c] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(coinTransactions).where(and(...conds));
  return { page, pageSize: PAGE, total: c?.n ?? 0, items: rows.map((r) => ({ ...r.t, reasonLabel: COIN_REASON_VI[r.t.reason as CoinReason], studentName: r.studentName, studentCode: r.studentCode, byName: r.byName, classCode: r.classCode, centerCode: r.centerCode })) };
}

/* ------------------------------------------------------------------ */
/* Thưởng / điều chỉnh / thu hồi                                        */
/* ------------------------------------------------------------------ */

export async function awardCoins(ctx: ProtectedContext, input: { studentIds: string[]; amount: number; reason: CoinReason; note?: string | null; classId?: string | null; sessionId?: string | null }, opts: { skipOverDailyLimit?: boolean; attendedSessionId?: string } = {}) {
  const ids = [...new Set(input.studentIds)];
  if (!ids.length || ids.length > 60) throw bad("Chọn 1–60 học viên");
  let cls: { id: string; centerId: string; leadTeacherId: string | null; assistantTeacherId: string | null } | null = null;
  if (input.classId) {
    cls = (await ctx.db.query.classes.findFirst({ where: eq(classes.id, input.classId), columns: { id: true, centerId: true, leadTeacherId: true, assistantTeacherId: true } })) ?? null;
    if (!cls) throw notFound("Không tìm thấy lớp");
  }
  if (input.sessionId) {
    const se = await ctx.db.query.sessions.findFirst({ where: eq(sessions.id, input.sessionId) });
    if (!se || (cls && se.classId !== cls.id)) throw bad("Buổi học không thuộc lớp đã chọn");
  }
  const stus = await ctx.db.select({ id: students.id, fullName: students.fullName, homeCenterId: students.homeCenterId, status: students.status }).from(students).where(inArray(students.id, ids));
  if (stus.length !== ids.length) throw bad("Có học viên không tồn tại");
  if (cls && !opts.attendedSessionId) {
    const inClass = await ctx.db.select({ s: enrollments.studentId }).from(enrollments).where(and(eq(enrollments.classId, cls.id), inArray(enrollments.studentId, ids), inArray(enrollments.status, ["active", "trial", "completed"])));
    if (inClass.length !== ids.length) throw bad("Có học viên không thuộc lớp");
  }
  const given = await ctx.db.select({ s: coinTransactions.studentId, n: sql<number>`coalesce(sum(${coinTransactions.amount}), 0)::int` }).from(coinTransactions)
    .where(and(inArray(coinTransactions.studentId, ids), eq(coinTransactions.createdBy, ctx.user.id), gte(coinTransactions.createdAt, dayStartVN()), sql`${coinTransactions.amount} > 0`, sql`${coinTransactions.reason} not in ('adjust','redeem_refund')`))
    .groupBy(coinTransactions.studentId);
  const plan = stus.map((s) => {
    const centerId = cls?.centerId ?? s.homeCenterId;
    if (!centerId) throw pre(`${s.fullName} chưa có cơ sở`);
    const teacherIds = cls ? [cls.leadTeacherId, cls.assistantTeacherId].filter((x): x is string => !!x) : [];
    const level = levelAt(ctx, centerId, teacherIds);
    if (!level) throw forbid(cls ? "Chỉ giáo viên của lớp / giáo vụ / quản lý cơ sở được thưởng xu" : "Không có quyền thưởng xu (giáo viên cần chọn lớp)");
    const base = validateAward({ amount: input.amount, reason: input.reason, note: input.note, level, givenToday: 0 });
    if (base.length) throw bad(`${s.fullName}: ${base.join("; ")}`);
    const errs = validateAward({ amount: input.amount, reason: input.reason, note: input.note, level, givenToday: given.find((g) => g.s === s.id)?.n ?? 0 });
    if (errs.length && !opts.skipOverDailyLimit) throw bad(`${s.fullName}: ${errs.join("; ")}`);
    return { s, centerId, level, skip: errs.length > 0 };
  }).filter((p) => !p.skip);
  const skipped = stus.length - plan.length;
  if (!plan.length) throw pre("Tất cả học viên đã đạt hạn mức xu hôm nay");
  const out = await ctx.db.transaction(async (tx) => {
    const res: { studentId: string; balance: number }[] = [];
    for (const p of plan) {
      const t = await postTx(tx as unknown as Db, { studentId: p.s.id, centerId: p.centerId, amount: input.amount, reason: input.reason, note: input.note, classId: cls?.id, sessionId: input.sessionId, userId: ctx.user.id });
      res.push({ studentId: p.s.id, balance: t.balanceAfter });
    }
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "coin", entity: "coin_transactions", entityId: cls?.id ?? ids[0], after: { students: ids.length, amount: input.amount, reason: input.reason, level: plan[0]!.level }, ip: ctx.ip });
    return res;
  });
  return { awarded: out.length, skipped, total: out.length * input.amount, balances: out };
}

/**
 * Thưởng chuyên cần cho cả buổi: mọi HV có mặt / muộn / học bù, bỏ qua HV đã được thưởng buổi này.
 * Số xu lấy theo luật `ATTENDANCE_SESSION` khi không truyền `amount`; luật tắt thì không thưởng.
 */
export async function awardSession(ctx: ProtectedContext, input: { sessionId: string; amount?: number | null }) {
  const ruleCoins = await coinsForEvent(ctx.db, "ATTENDANCE_SESSION", COIN_RULE_DEFS.ATTENDANCE_SESSION.coins);
  if (ruleCoins === null) throw pre("Luật thưởng chuyên cần đang tắt — bật ở SataCoin → Luật thưởng xu");
  const amount = input.amount ?? ruleCoins;
  const se = await ctx.db.query.sessions.findFirst({ where: eq(sessions.id, input.sessionId) });
  if (!se) throw notFound("Không tìm thấy buổi học");
  if (!["in_progress", "attendance_done", "notes_done", "completed"].includes(se.status)) throw pre("Chỉ thưởng cho buổi đã bắt đầu / đã điểm danh");
  const present = await ctx.db.select({ s: enrollments.studentId }).from(attendance).innerJoin(enrollments, eq(enrollments.id, attendance.enrollmentId))
    .where(and(eq(attendance.sessionId, se.id), inArray(attendance.status, ["present", "late", "makeup"])));
  const done = await ctx.db.select({ s: coinTransactions.studentId }).from(coinTransactions).where(and(eq(coinTransactions.sessionId, se.id), eq(coinTransactions.reason, "attendance")));
  const ids = [...new Set(present.map((p) => p.s))].filter((id) => !done.some((d) => d.s === id));
  if (!ids.length) throw pre(present.length ? "Học viên có mặt đều đã được thưởng buổi này" : "Buổi chưa có học viên có mặt");
  return awardCoins(ctx, { studentIds: ids, amount, reason: "attendance", classId: se.classId, sessionId: se.id, note: `Chuyên cần buổi ${se.sequenceNo}` }, { skipOverDailyLimit: true, attendedSessionId: se.id });
}

export async function adjustCoins(ctx: ProtectedContext, input: { studentId: string; amount: number; note: string }) {
  const s = await ctx.db.query.students.findFirst({ where: eq(students.id, input.studentId) });
  if (!s?.homeCenterId) throw notFound("Không tìm thấy học viên / chưa có cơ sở");
  const level = adjustLevel(ctx, s.homeCenterId);
  if (!level) throw forbid("Chỉ quản lý cơ sở / Hội sở được điều chỉnh xu");
  const bal = (await balancesOf(ctx.db, [s.id])).get(s.id)!.balance;
  const errs = validateAdjust({ amount: input.amount, note: input.note, balance: bal, level });
  if (errs.length) throw bad(errs);
  return ctx.db.transaction(async (tx) => {
    const t = await postTx(tx as unknown as Db, { studentId: s.id, centerId: s.homeCenterId!, amount: input.amount, reason: "adjust", note: input.note, userId: ctx.user.id });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "coin", entity: "coin_transactions", entityId: t.id, after: { studentId: s.id, amount: input.amount }, reason: input.note, ip: ctx.ip });
    return { balance: t.balanceAfter };
  });
}

export async function revokeCoins(ctx: ProtectedContext, input: { txId: string; note: string }) {
  const t = await ctx.db.query.coinTransactions.findFirst({ where: eq(coinTransactions.id, input.txId) });
  if (!t) throw notFound("Không tìm thấy giao dịch");
  if (!adjustLevel(ctx, t.centerId)) throw forbid("Chỉ quản lý cơ sở / Hội sở được thu hồi xu");
  if (input.note.trim().length < 10) throw bad("Thu hồi cần lý do ≥ 10 ký tự");
  const already = await ctx.db.query.coinTransactions.findFirst({ where: eq(coinTransactions.revokesId, t.id) });
  const bal = (await balancesOf(ctx.db, [t.studentId])).get(t.studentId)!.balance;
  const block = revokeBlock({ reason: t.reason as CoinReason, amount: t.amount, revoked: !!already, ageDays: Math.floor((Date.now() - t.createdAt.getTime()) / 86_400_000), balance: bal });
  if (block) throw pre(block);
  try {
    return await ctx.db.transaction(async (tx) => {
      const r = await postTx(tx as unknown as Db, { studentId: t.studentId, centerId: t.centerId, amount: -t.amount, reason: "revoke", note: input.note, classId: t.classId, sessionId: t.sessionId, revokesId: t.id, userId: ctx.user.id });
      await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "coin", entity: "coin_transactions", entityId: r.id, before: { txId: t.id, amount: t.amount }, reason: input.note, ip: ctx.ip });
      if (t.createdBy && t.createdBy !== ctx.user.id) {
        await deliverNotifications(tx, [t.createdBy], { title: "Xu thưởng bị thu hồi", body: `${t.amount} xu (${COIN_REASON_VI[t.reason as CoinReason]}) đã bị thu hồi: ${input.note.trim()}`, link: `/satacoin?student=${t.studentId}`, priority: 3, type: "coin.revoked" });
      }
      return { balance: r.balanceAfter };
    });
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    if (err.code === "23505" || err.cause?.code === "23505") throw pre("Giao dịch đã bị thu hồi");
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* Luật thưởng xu                                                       */
/* ------------------------------------------------------------------ */

/** Đọc luật thưởng đang khai (dùng cả trong luồng nghiệp vụ, không đòi quyền coin:read) */
export async function loadCoinRules(db: Db): Promise<{ code: string; coins: number; isActive: boolean }[]> {
  return db.select({ code: coinRules.code, coins: coinRules.coins, isActive: coinRules.isActive }).from(coinRules);
}

/** Số xu áp dụng cho một sự kiện; null = luật đang tắt (không cộng xu) */
export async function coinsForEvent(db: Db, code: CoinRuleCode, fallback: number | null = null) {
  return coinsFor(await loadCoinRules(db), code, fallback);
}

/**
 * Cộng xu theo luật tự động (không phải thưởng tay nên không tính hạn mức theo vai trò).
 * Luật tắt / chưa bật → không làm gì. Trả số xu đã cộng.
 */
export async function awardByRule(tx: Db, x: { code: CoinRuleCode; studentId: string; centerId: string; note: string; actorId: string | null; classId?: string | null; sessionId?: string | null }) {
  const coins = coinsFor(await loadCoinRules(tx), x.code, null);
  if (!coins || coins < 1) return 0;
  await postTx(tx, {
    studentId: x.studentId, centerId: x.centerId, amount: coins, reason: COIN_RULE_DEFS[x.code].reason,
    note: x.note, classId: x.classId ?? null, sessionId: x.sessionId ?? null, userId: x.actorId,
  });
  return coins;
}

export async function listCoinRules(ctx: ProtectedContext) {
  requireCoinRead(ctx);
  const rows = await ctx.db.select({ r: coinRules, byName: users.fullName }).from(coinRules).leftJoin(users, eq(users.id, coinRules.updatedBy));
  return {
    canEdit: ctx.actor.assignments.some((a) => can(ctx, "coin:adjust", a.centerId)),
    items: COIN_RULE_CODES.map((code) => {
      const def = COIN_RULE_DEFS[code];
      const r = rows.find((x) => x.r.code === code);
      return {
        code, label: def.label, reason: def.reason, defaultCoins: def.coins, defaultCondition: def.condition,
        description: r?.r.description ?? def.label, coins: r?.r.coins ?? def.coins, condition: r?.r.condition ?? def.condition,
        isActive: r?.r.isActive ?? true, configured: !!r, updatedAt: r?.r.updatedAt ?? null, updatedByName: r?.byName ?? null,
      };
    }),
  };
}

export async function upsertCoinRule(ctx: ProtectedContext, input: { code: CoinRuleCode; description: string; coins: number; condition?: string | null; isActive: boolean }) {
  if (!ctx.actor.assignments.some((a) => can(ctx, "coin:adjust", a.centerId))) throw forbid("Chỉ quản lý cơ sở / Hội sở được sửa luật thưởng xu");
  const errs = validateCoinRule(input);
  if (errs.length) throw bad(errs);
  const before = await ctx.db.query.coinRules.findFirst({ where: eq(coinRules.code, input.code) });
  const v = { description: input.description.trim(), coins: input.coins, condition: input.condition?.trim() || null, isActive: input.isActive, updatedBy: ctx.user.id, updatedAt: new Date() };
  await ctx.db.insert(coinRules).values({ code: input.code, ...v }).onConflictDoUpdate({ target: coinRules.code, set: v });
  await writeAudit(ctx.db, {
    actorId: ctx.user.id, action: before ? "UPDATE" : "CREATE", module: "coin", entity: "coin_rules", entityId: before?.id ?? null,
    before: before ? { coins: before.coins, isActive: before.isActive, condition: before.condition } : null,
    after: { code: input.code, coins: v.coins, isActive: v.isActive, condition: v.condition }, ip: ctx.ip,
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Quà & đổi quà                                                        */
/* ------------------------------------------------------------------ */

export async function listRewards(ctx: ProtectedContext, input: { includeInactive?: boolean }) {
  requireCoinRead(ctx);
  const rows = await ctx.db.select({ r: rewardItems, sku: inventoryItems.sku, itemName: inventoryItems.name,
    stock: sql<number | null>`case when ${rewardItems.inventoryItemId} is null then null else (select coalesce(sum(on_hand), 0)::int from ${stockLevels} sl where sl.item_id = ${rewardItems.inventoryItemId}) end` })
    .from(rewardItems).leftJoin(inventoryItems, eq(inventoryItems.id, rewardItems.inventoryItemId))
    .where(input.includeInactive ? undefined : eq(rewardItems.isActive, true)).orderBy(asc(rewardItems.sortOrder), asc(rewardItems.cost));
  const options = await ctx.db.select({ id: inventoryItems.id, sku: inventoryItems.sku, name: inventoryItems.name }).from(inventoryItems).where(and(eq(inventoryItems.isActive, true), inArray(inventoryItems.type, ["product", "material"]))).orderBy(asc(inventoryItems.sku));
  return { items: rows.map((x) => ({ ...x.r, sku: x.sku, itemName: x.itemName, stock: x.stock })), inventoryOptions: options, canEdit: hasRole(ctx.actor, "SUPER_ADMIN") };
}

export async function upsertReward(ctx: ProtectedContext, input: { id?: string; name: string; description?: string | null; cost: number; inventoryItemId?: string | null; isActive: boolean; sortOrder?: number }) {
  if (!hasRole(ctx.actor, "SUPER_ADMIN")) throw forbid("Danh mục quà dùng chung — chỉ Quản trị hệ thống sửa");
  const errs = validateReward({ name: input.name, cost: input.cost, stockLimited: !!input.inventoryItemId });
  if (errs.length) throw bad(errs);
  const v = { name: input.name.trim(), description: input.description?.trim() || null, cost: input.cost, inventoryItemId: input.inventoryItemId ?? null, isActive: input.isActive, sortOrder: input.sortOrder ?? 0 };
  if (input.id) {
    const up = await ctx.db.update(rewardItems).set(v).where(eq(rewardItems.id, input.id)).returning({ id: rewardItems.id });
    if (!up.length) throw notFound("Không tìm thấy quà");
    await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "coin", entity: "reward_items", entityId: input.id, after: v, ip: ctx.ip });
    return { id: input.id };
  }
  const [r] = await ctx.db.insert(rewardItems).values(v).returning({ id: rewardItems.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "coin", entity: "reward_items", entityId: r!.id, after: v, ip: ctx.ip });
  return { id: r!.id };
}

export async function listRedemptions(ctx: ProtectedContext, input: { status?: RedemptionStatus; centerId?: string }) {
  requirePermission(ctx, "coin:read", input.centerId ? { centerId: input.centerId } : undefined);
  const conds: SQL[] = [scopeOn(ctx, redemptions.centerId)];
  if (input.status) conds.push(eq(redemptions.status, input.status));
  else conds.push(inArray(redemptions.status, ["requested", "approved"]));
  if (input.centerId) conds.push(eq(redemptions.centerId, input.centerId));
  const rows = await ctx.db.select({ r: redemptions, rewardName: rewardItems.name, inventoryItemId: rewardItems.inventoryItemId, studentName: students.fullName, studentCode: students.code, centerCode: centers.code, byName: users.fullName })
    .from(redemptions).innerJoin(rewardItems, eq(rewardItems.id, redemptions.rewardId)).innerJoin(students, eq(students.id, redemptions.studentId))
    .innerJoin(centers, eq(centers.id, redemptions.centerId)).leftJoin(users, eq(users.id, redemptions.requestedBy))
    .where(and(...conds)).orderBy(asc(redemptions.createdAt)).limit(200);
  const [c] = await ctx.db.select({
    requested: sql<number>`count(*) filter (where ${redemptions.status} = 'requested')::int`,
    approved: sql<number>`count(*) filter (where ${redemptions.status} = 'approved')::int`,
    delivered: sql<number>`count(*) filter (where ${redemptions.status} = 'delivered')::int`,
  }).from(redemptions).where(and(scopeOn(ctx, redemptions.centerId), input.centerId ? eq(redemptions.centerId, input.centerId) : sql`true`));
  return {
    counts: c,
    items: rows.map((x) => ({
      ...x.r, rewardName: x.rewardName, studentName: x.studentName, studentCode: x.studentCode, centerCode: x.centerCode, byName: x.byName, statusLabel: REDEMPTION_STATUS_VI[x.r.status as RedemptionStatus],
      canDecide: x.r.status === "requested" && can(ctx, "coin:approve", x.r.centerId),
      canDeliver: x.r.status === "approved" && can(ctx, "coin:redeem", x.r.centerId),
      canCancel: (x.r.status === "requested" && (x.r.requestedBy === ctx.user.id || can(ctx, "coin:approve", x.r.centerId))) || (x.r.status === "approved" && can(ctx, "coin:approve", x.r.centerId)),
    })),
  };
}

async function nextRedemptionCode(db: Db, centerCode: string) {
  return nextStockCode(db, "DQ", centerCode);
}

export async function requestRedemption(ctx: ProtectedContext, input: { studentId: string; rewardId: string; note?: string | null }) {
  const s = await ctx.db.query.students.findFirst({ where: eq(students.id, input.studentId) });
  if (!s?.homeCenterId) throw notFound("Không tìm thấy học viên / chưa có cơ sở");
  requirePermission(ctx, "coin:redeem", { centerId: s.homeCenterId });
  const rw = await ctx.db.query.rewardItems.findFirst({ where: eq(rewardItems.id, input.rewardId) });
  if (!rw || !rw.isActive) throw pre("Quà không còn áp dụng");
  const b = (await balancesOf(ctx.db, [s.id])).get(s.id)!;
  const avail = availableBalance(b.balance, b.held);
  if (avail < rw.cost) throw pre(`Không đủ xu: khả dụng ${avail}, cần ${rw.cost}${b.held ? ` (đang giữ ${b.held} cho yêu cầu chờ duyệt)` : ""}`);
  if (rw.inventoryItemId) {
    const lv = await ctx.db.query.stockLevels.findFirst({ where: and(eq(stockLevels.itemId, rw.inventoryItemId), eq(stockLevels.centerId, s.homeCenterId)) });
    if ((lv?.onHand ?? 0) < 1) throw pre("Quà đã hết tại cơ sở");
  }
  const center = await ctx.db.query.centers.findFirst({ where: eq(centers.id, s.homeCenterId) });
  return ctx.db.transaction(async (tx) => {
    const code = await nextRedemptionCode(tx as unknown as Db, center?.code ?? "CS");
    const [r] = await tx.insert(redemptions).values({ code, studentId: s.id, centerId: s.homeCenterId!, rewardId: rw.id, cost: rw.cost, note: input.note?.trim() || null, requestedBy: ctx.user.id }).returning({ id: redemptions.id });
    const mgrs = await tx.select({ u: userRoles.userId }).from(userRoles).where(and(eq(userRoles.centerId, s.homeCenterId!), eq(userRoles.role, "CENTER_MANAGER")));
    await deliverNotifications(tx, mgrs.map((m) => m.u), { title: "Yêu cầu đổi quà", body: `${s.fullName} đổi "${rw.name}" (${rw.cost} xu)`, link: "/satacoin?tab=redeem", priority: 3, type: "coin.redeem" });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "CREATE", module: "coin", entity: "redemptions", entityId: r!.id, after: { code, reward: rw.name, cost: rw.cost }, ip: ctx.ip });
    return { id: r!.id, code };
  });
}

export async function decideRedemption(ctx: ProtectedContext, input: { id: string; action: RedemptionAction; note?: string | null }) {
  const r = await ctx.db.query.redemptions.findFirst({ where: eq(redemptions.id, input.id) });
  if (!r) throw notFound("Không tìm thấy yêu cầu đổi quà");
  const to = rule(() => redemptionTransition(r.status as RedemptionStatus, input.action));
  const rw = await ctx.db.query.rewardItems.findFirst({ where: eq(rewardItems.id, r.rewardId) });
  if (input.action === "approve" || input.action === "reject") requirePermission(ctx, "coin:approve", { centerId: r.centerId });
  if (input.action === "deliver") requirePermission(ctx, "coin:redeem", { centerId: r.centerId });
  if (input.action === "cancel") {
    const own = r.status === "requested" && r.requestedBy === ctx.user.id;
    if (!own) requirePermission(ctx, "coin:approve", { centerId: r.centerId });
  }
  if ((input.action === "reject" || input.action === "cancel") && (input.note ?? "").trim().length < 5) throw bad("Cần ghi lý do (≥ 5 ký tự)");
  if (input.action === "approve" && r.requestedBy === ctx.user.id && !hasRole(ctx.actor, "SUPER_ADMIN")) throw forbid("Người tạo yêu cầu không tự duyệt");
  return ctx.db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const now = new Date();
    if (input.action === "approve") {
      await postTx(t, { studentId: r.studentId, centerId: r.centerId, amount: -r.cost, reason: "redeem", note: `Đổi quà ${r.code}: ${rw?.name ?? ""}`, redemptionId: r.id, userId: ctx.user.id });
    }
    if (input.action === "cancel" && r.status === "approved") {
      await postTx(t, { studentId: r.studentId, centerId: r.centerId, amount: r.cost, reason: "redeem_refund", note: `Huỷ đổi quà ${r.code}`, redemptionId: r.id, userId: ctx.user.id });
    }
    if (input.action === "deliver" && rw?.inventoryItemId) {
      await applyMovement(t, { code: r.code, itemId: rw.inventoryItemId, centerId: r.centerId, type: "issue", qty: 1, studentId: r.studentId, refType: "redemption", refId: r.id, note: `Trao quà ${rw.name}`, userId: ctx.user.id });
    }
    await tx.update(redemptions).set({
      status: to,
      ...(input.action === "approve" || input.action === "reject" ? { decidedBy: ctx.user.id, decidedAt: now } : {}),
      ...(input.action === "deliver" ? { deliveredBy: ctx.user.id, deliveredAt: now } : {}),
      ...(input.note?.trim() ? { decisionNote: input.note.trim() } : {}),
    }).where(eq(redemptions.id, r.id));
    await writeAudit(t, { actorId: ctx.user.id, action: "TRANSITION", module: "coin", entity: "redemptions", entityId: r.id, before: { status: r.status }, after: { status: to }, reason: input.note ?? null, ip: ctx.ip });
    return { status: to };
  });
}

/** Tóm tắt xu cho trang học viên / dashboard */
export async function coinSummaryForStudents(db: Db, ids: string[]) {
  return balancesOf(db, ids);
}
