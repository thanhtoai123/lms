import { and, eq, inArray, sql, asc, desc, isNull, or, lte, gte, ne, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  leads, leadActivities, leadTasks, leadAssignees, leadChildren, admissionsSettings, leadTransfers, leadDistributionLog, leadPoolEvents,
  users, centers, classes, courses, userRoles,
} from "@satarobo/db";
import {
  DEFAULT_ADMISSIONS_POLICY, DEFAULT_SLA, OPEN_LEAD_STATUSES, pickAssigneeByMode, computeSla, maskPhone, hasRole, visibleCenterIds, authorize,
  consumesRound, modeConsumesRounds, reenableRounds, roundsFloor, validateRoundAdjust, validateLeadTransfer, isConvertedLead, parseNoteTokens,
  ASSIGNMENT_SOURCE_VI, DISTRIBUTION_MODE_VI, LEAD_STATUSES,
  type AdmissionsPolicy, type DistributionMode, type LeadStatus, type SlaPolicy, type AssignmentSource, type PoolAction,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { tenantCond } from "./tenantScope";
import { tenantCond, assertTenant, assertCenterTransferAllowed } from "./tenantScope";
import { writeAudit } from "./audit";
import { emit } from "./outbox";

export type Db = ProtectedContext["db"];

const OPEN = [...OPEN_LEAD_STATUSES];
const OPEN_IN = sql.join(OPEN.map((s) => sql`${s}`), sql`, `);
const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });
const pre = (m: string) => new TRPCError({ code: "PRECONDITION_FAILED", message: m });

/** Vai trò được xem SĐT đầy đủ; còn lại bị che */
export function canSeeLeadPhone(ctx: ProtectedContext) {
  return hasRole(ctx.actor, "SUPER_ADMIN", "CENTER_MANAGER", "CENTER_SALES_CSM", "HO_SALE", "HO_MARKETING");
}

/* ------------------------------------------------------------------ */
/* Tham số tuyển sinh (SLA, chế độ chia, khử trùng) theo cơ sở        */
/* ------------------------------------------------------------------ */

/** Cơ sở → fallback toàn hệ thống (center_id null) → mặc định code */
export async function resolveAdmissionsPolicy(db: Db, centerId: string | null): Promise<AdmissionsPolicy> {
  const rows = await db.select().from(admissionsSettings).where(centerId ? or(eq(admissionsSettings.centerId, centerId), isNull(admissionsSettings.centerId))! : isNull(admissionsSettings.centerId));
  const row = rows.find((r) => r.centerId === centerId) ?? rows.find((r) => r.centerId === null);
  if (!row) return DEFAULT_ADMISSIONS_POLICY;
  const sla: SlaPolicy = { minutesByStatus: { ...DEFAULT_SLA.minutesByStatus } };
  for (const [k, v] of Object.entries(row.slaMinutes ?? {})) if (LEAD_STATUSES.includes(k as LeadStatus)) sla.minutesByStatus[k as LeadStatus] = v;
  return { distributionMode: row.distributionMode, dedupeDays: row.dedupeDays, maxTrialsPerLead: row.maxTrialsPerLead, staleAfterDays: row.staleAfterDays, sla };
}

export async function getSettings(ctx: ProtectedContext, centerId: string | null) {
  requirePermission(ctx, "lead:read", { centerId });
  const [row] = await ctx.db.select().from(admissionsSettings).where(centerId ? eq(admissionsSettings.centerId, centerId) : isNull(admissionsSettings.centerId)).limit(1);
  const effective = await resolveAdmissionsPolicy(ctx.db, centerId);
  return { row: row ?? null, effective, defaults: DEFAULT_ADMISSIONS_POLICY, inherited: !row };
}

export async function updateSettings(
  ctx: ProtectedContext,
  input: { centerId: string | null; distributionMode?: DistributionMode; dedupeDays?: number; maxTrialsPerLead?: number; staleAfterDays?: number; slaMinutes?: Record<string, number | null> },
) {
  requirePermission(ctx, "automation:*", { centerId: input.centerId });
  if (input.centerId === null && !hasRole(ctx.actor, "SUPER_ADMIN")) throw new TRPCError({ code: "FORBIDDEN", message: "Chỉ Super Admin sửa mặc định toàn hệ thống" });
  const [existing] = await ctx.db.select().from(admissionsSettings).where(input.centerId ? eq(admissionsSettings.centerId, input.centerId) : isNull(admissionsSettings.centerId)).limit(1);
  const patch = {
    ...(input.distributionMode ? { distributionMode: input.distributionMode } : {}),
    ...(input.dedupeDays !== undefined ? { dedupeDays: input.dedupeDays } : {}),
    ...(input.maxTrialsPerLead !== undefined ? { maxTrialsPerLead: input.maxTrialsPerLead } : {}),
    ...(input.staleAfterDays !== undefined ? { staleAfterDays: input.staleAfterDays } : {}),
    ...(input.slaMinutes !== undefined ? { slaMinutes: input.slaMinutes } : {}),
    updatedBy: ctx.user.id,
  };
  await ctx.db.transaction(async (tx) => {
    if (existing) await tx.update(admissionsSettings).set(patch).where(eq(admissionsSettings.id, existing.id));
    else await tx.insert(admissionsSettings).values({ centerId: input.centerId, ...patch });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "admissions", entity: "admissions_settings", entityId: input.centerId ?? null, before: existing ?? null, after: patch, ip: ctx.ip });
  });
  return getSettings(ctx, input.centerId);
}

/* ------------------------------------------------------------------ */
/* Chia lead: bảng sale, lượt, chế độ, đặt lại lượt                     */
/* ------------------------------------------------------------------ */

/** Hàng lead_assignees áp cho một cơ sở: hàng của cơ sở + hàng toàn hệ thống */
const assigneeScope = (centerId: string | null): SQL => (centerId ? or(eq(leadAssignees.centerId, centerId), isNull(leadAssignees.centerId))! : sql`true`);

async function candidateStats(db: Db, centerId: string | null, excludeUserId?: string | null) {
  return db
    .select({
      id: leadAssignees.userId,
      rowId: leadAssignees.id,
      fullName: users.fullName,
      email: users.email,
      centerId: leadAssignees.centerId,
      isAvailable: leadAssignees.isAvailable,
      weight: leadAssignees.weight,
      roundsReceived: leadAssignees.roundsReceived,
      lastAssignedAt: leadAssignees.lastAssignedAt,
      note: leadAssignees.note,
      openLeads: sql<number>`(select count(*)::int from ${leads} l where l.assigned_to_id = ${leadAssignees.userId} and l.status in (${OPEN_IN}) and l.deleted_at is null)`,
      totalAssigned: sql<number>`(select count(*)::int from ${leads} l where l.assigned_to_id = ${leadAssignees.userId} and l.deleted_at is null)`,
      converted: sql<number>`(select count(*)::int from ${leads} l where l.assigned_to_id = ${leadAssignees.userId} and l.status = 'enrolled' and l.deleted_at is null)`,
    })
    .from(leadAssignees)
    .innerJoin(users, eq(users.id, leadAssignees.userId))
    .where(and(eq(users.isActive, true), assigneeScope(centerId), excludeUserId ? ne(leadAssignees.userId, excludeUserId) : sql`true`))
    .orderBy(asc(users.fullName));
}

/** Chọn sale nhận lead theo chế độ hiện hành của cơ sở (có thể loại sale đang giữ khi chia lại) */
export async function autoPickAssignee(db: Db, centerId: string | null, mode: DistributionMode, excludeUserId?: string | null): Promise<string | null> {
  const cands = await candidateStats(db, centerId, excludeUserId);
  return pickAssigneeByMode(mode, cands.map((c) => ({ ...c, lastAssignedAt: c.lastAssignedAt?.toISOString() ?? null })));
}

export interface AssignmentInput {
  leadId: string;
  centerId: string | null;
  fromUserId?: string | null;
  toUserId: string;
  source: AssignmentSource;
  mode: DistributionMode;
  actorId: string | null;
  /** Nội dung dòng timeline (mặc định theo nguồn) */
  content?: string | null;
  note?: string | null;
  /** false: người gọi đã tự cập nhật leads.assigned_to_id */
  updateLead?: boolean;
  activity?: boolean;
  emitEvent?: boolean;
}

/**
 * Điểm DUY NHẤT ghi nhận một lần giao lead: cập nhật người phụ trách, tiêu lượt (chỉ máy chia luân phiên),
 * ghi sổ chia lead (nguồn, tiêu lượt, lượt sau chia), timeline và sự kiện báo người nhận.
 */
export async function recordAssignment(tx: Db, a: AssignmentInput) {
  const consumed = consumesRound(a.source, a.mode);
  const scopeCond = and(eq(leadAssignees.userId, a.toUserId), assigneeScope(a.centerId));
  const now = new Date();
  const rows = consumed
    ? await tx.update(leadAssignees).set({ roundsReceived: sql`${leadAssignees.roundsReceived} + 1`, lastAssignedAt: now }).where(scopeCond).returning({ centerId: leadAssignees.centerId, rounds: leadAssignees.roundsReceived })
    : await tx.select({ centerId: leadAssignees.centerId, rounds: leadAssignees.roundsReceived }).from(leadAssignees).where(scopeCond);
  const roundsAfter = (rows.find((r) => r.centerId === a.centerId) ?? rows[0])?.rounds ?? null;
  if (a.updateLead !== false) {
    await tx.update(leads).set({ assignedToId: a.toUserId, assignedAt: now, lastTouchAt: now }).where(eq(leads.id, a.leadId));
    await tx.update(leadTasks).set({ assigneeId: a.toUserId }).where(and(eq(leadTasks.leadId, a.leadId), isNull(leadTasks.doneAt)));
  }
  const label = a.source === "auto" ? `${ASSIGNMENT_SOURCE_VI.auto} (${DISTRIBUTION_MODE_VI[a.mode]})` : ASSIGNMENT_SOURCE_VI[a.source];
  if (a.activity !== false) {
    await tx.insert(leadActivities).values({
      leadId: a.leadId, type: "assignment", actorId: a.actorId,
      content: a.content ?? `${label}${consumed ? " · tiêu 1 lượt" : ""}`,
      meta: { from: a.fromUserId ?? null, to: a.toUserId, mode: a.mode, source: a.source, consumedRound: consumed, roundsAfter },
    });
  }
  await tx.insert(leadDistributionLog).values({
    leadId: a.leadId, centerId: a.centerId, fromUserId: a.fromUserId ?? null, assignedToId: a.toUserId, actorId: a.actorId,
    source: a.source, mode: a.mode, consumedRound: consumed, roundsAfter, note: a.note ?? null,
  });
  if (a.emitEvent !== false) await emit(tx, { type: "lead.assigned", leadId: a.leadId, assigneeId: a.toUserId, mode: label, actorId: a.actorId });
  return { consumed, roundsAfter };
}

async function logPool(tx: Db, e: { centerId: string | null; userId: string | null; action: PoolAction; before?: Record<string, unknown> | null; after?: Record<string, unknown> | null; reason?: string | null; actorId: string }) {
  await tx.insert(leadPoolEvents).values({ centerId: e.centerId, userId: e.userId, action: e.action, before: e.before ?? null, after: e.after ?? null, reason: e.reason?.trim() || null, actorId: e.actorId });
}

/** Lượt của những người đang nhận (trừ một hàng) trong cùng phạm vi cơ sở */
async function availableRounds(db: Db, centerId: string | null, exceptRowId?: string) {
  const rows = await db.select({ rounds: leadAssignees.roundsReceived }).from(leadAssignees).innerJoin(users, eq(users.id, leadAssignees.userId))
    .where(and(eq(leadAssignees.isAvailable, true), eq(users.isActive, true), centerId ? assigneeScope(centerId) : isNull(leadAssignees.centerId), exceptRowId ? ne(leadAssignees.id, exceptRowId) : sql`true`));
  return rows.map((r) => r.rounds);
}

/** Màn "Quản lý chia lead": chế độ + bảng sale (nhận lead, lượt, đang giữ, chốt, lần chia gần nhất) */
export async function distributionBoard(ctx: ProtectedContext, centerId: string | null) {
  requirePermission(ctx, "lead:read", { centerId });
  const [policy, board, settings] = await Promise.all([
    resolveAdmissionsPolicy(ctx.db, centerId),
    candidateStats(ctx.db, centerId),
    ctx.db.select({ roundsResetAt: admissionsSettings.roundsResetAt }).from(admissionsSettings).where(centerId ? eq(admissionsSettings.centerId, centerId) : isNull(admissionsSettings.centerId)).limit(1),
  ]);
  const [pool] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(leads).where(and(isNull(leads.assignedToId), inArray(leads.status, OPEN), isNull(leads.deletedAt), tenantCond(ctx, leads), centerId ? eq(leads.centerId, centerId) : sql`true`));
  // Ứng viên có thể thêm: user có vai trò sale/CSKH ở cơ sở nhưng chưa trong bảng chia
  const candidates = await ctx.db
    .select({ id: users.id, fullName: users.fullName, role: userRoles.role })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(inArray(userRoles.role, ["CENTER_SALES_CSM", "HO_SALE", "CENTER_MANAGER"]), eq(users.isActive, true), centerId ? or(eq(userRoles.centerId, centerId), isNull(userRoles.centerId))! : sql`true`));
  const inBoard = new Set(board.map((b) => b.id));
  const floor = roundsFloor(board.filter((b) => b.isAvailable).map((b) => b.roundsReceived));
  return {
    mode: policy.distributionMode,
    consumesRounds: modeConsumesRounds(policy.distributionMode),
    roundsFloor: floor,
    roundsResetAt: settings[0]?.roundsResetAt ?? null,
    poolSize: pool?.n ?? 0,
    canManage: authorize(ctx.actor, "lead:update", { centerId }).allowed,
    board: board.map((b) => ({ ...b, conversionRate: b.totalAssigned ? Math.round((b.converted / b.totalAssigned) * 100) : null })),
    addable: [...new Map(candidates.filter((c) => !inBoard.has(c.id)).map((c) => [c.id, c])).values()],
  };
}

export async function upsertAssignee(ctx: ProtectedContext, input: { userId: string; centerId: string | null; isAvailable?: boolean; weight?: number; note?: string | null; reason?: string | null }) {
  requirePermission(ctx, "lead:update", { centerId: input.centerId });
  const target = await ctx.db.query.users.findFirst({ where: eq(users.id, input.userId), columns: { id: true, isActive: true } });
  if (!target?.isActive) throw bad("Tài khoản không tồn tại hoặc đã khoá");
  await ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const [existing] = await tx.select().from(leadAssignees).where(and(eq(leadAssignees.userId, input.userId), input.centerId ? eq(leadAssignees.centerId, input.centerId) : isNull(leadAssignees.centerId))).limit(1);
    if (!existing) {
      // Người mới vào pool bắt đầu ở mức lượt thấp nhất để không bị dồn lead
      const rounds = reenableRounds(0, await availableRounds(db, input.centerId));
      const isAvailable = input.isAvailable ?? true;
      await tx.insert(leadAssignees).values({ userId: input.userId, centerId: input.centerId, isAvailable, weight: input.weight ?? 1, note: input.note ?? null, roundsReceived: rounds });
      await logPool(db, { centerId: input.centerId, userId: input.userId, action: "add", after: { isAvailable, rounds }, reason: input.reason, actorId: ctx.user.id });
      return;
    }
    const patch: Partial<typeof leadAssignees.$inferInsert> = {};
    if (input.weight !== undefined && input.weight !== existing.weight) patch.weight = input.weight;
    if (input.note !== undefined) patch.note = input.note;
    let toggle: PoolAction | null = null;
    if (input.isAvailable !== undefined && input.isAvailable !== existing.isAvailable) {
      patch.isAvailable = input.isAvailable;
      toggle = input.isAvailable ? "enable" : "disable";
      // Tắt: bộ đếm đóng băng. Bật lại: về mức thấp nhất của người đang nhận
      if (input.isAvailable) patch.roundsReceived = reenableRounds(existing.roundsReceived, await availableRounds(db, existing.centerId, existing.id));
    }
    if (!Object.keys(patch).length) return;
    await tx.update(leadAssignees).set(patch).where(eq(leadAssignees.id, existing.id));
    if (toggle) {
      await logPool(db, {
        centerId: existing.centerId, userId: existing.userId, action: toggle, reason: input.reason, actorId: ctx.user.id,
        before: { isAvailable: existing.isAvailable, rounds: existing.roundsReceived },
        after: { isAvailable: patch.isAvailable, rounds: patch.roundsReceived ?? existing.roundsReceived },
      });
    }
    if (patch.weight !== undefined) {
      await logPool(db, { centerId: existing.centerId, userId: existing.userId, action: "adjust", before: { weight: existing.weight }, after: { weight: patch.weight }, reason: input.reason, actorId: ctx.user.id });
    }
  });
  return distributionBoard(ctx, input.centerId);
}

export async function removeAssignee(ctx: ProtectedContext, input: { userId: string; centerId: string | null; reason?: string | null }) {
  requirePermission(ctx, "lead:update", { centerId: input.centerId });
  await ctx.db.transaction(async (tx) => {
    const removed = await tx.delete(leadAssignees).where(and(eq(leadAssignees.userId, input.userId), input.centerId ? eq(leadAssignees.centerId, input.centerId) : isNull(leadAssignees.centerId))).returning();
    for (const r of removed) {
      await logPool(tx as unknown as Db, { centerId: r.centerId, userId: r.userId, action: "remove", before: { isAvailable: r.isAvailable, rounds: r.roundsReceived, weight: r.weight }, reason: input.reason, actorId: ctx.user.id });
    }
  });
  return distributionBoard(ctx, input.centerId);
}

/** "Đặt lại lượt toàn cơ sở": mọi người ĐANG NHẬN về mức thấp nhất hiện tại (không về 0) */
export async function resetRounds(ctx: ProtectedContext, centerId: string | null, reason?: string | null) {
  requirePermission(ctx, "lead:update", { centerId });
  await ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"lead-rounds:" + (centerId ?? "all")}))`);
    const rows = await tx.select().from(leadAssignees).where(and(assigneeScope(centerId), eq(leadAssignees.isAvailable, true)));
    const floor = roundsFloor(rows.map((r) => r.roundsReceived)) ?? 0;
    for (const r of rows.filter((x) => x.roundsReceived !== floor)) {
      await tx.update(leadAssignees).set({ roundsReceived: floor }).where(eq(leadAssignees.id, r.id));
      await logPool(db, { centerId: r.centerId, userId: r.userId, action: "reset", before: { rounds: r.roundsReceived }, after: { rounds: floor }, reason: reason ?? "Đặt lại lượt toàn cơ sở", actorId: ctx.user.id });
    }
    const [existing] = await tx.select({ id: admissionsSettings.id }).from(admissionsSettings).where(centerId ? eq(admissionsSettings.centerId, centerId) : isNull(admissionsSettings.centerId)).limit(1);
    if (existing) await tx.update(admissionsSettings).set({ roundsResetAt: new Date(), updatedBy: ctx.user.id }).where(eq(admissionsSettings.id, existing.id));
    else await tx.insert(admissionsSettings).values({ centerId, roundsResetAt: new Date(), updatedBy: ctx.user.id });
    await writeAudit(db, { actorId: ctx.user.id, action: "UPDATE", module: "admissions", entity: "lead_assignees", entityId: centerId ?? null, after: { floor, affected: rows.length }, reason: reason?.trim() || "Đặt lại lượt", ip: ctx.ip });
  });
  return distributionBoard(ctx, centerId);
}

/** Chỉnh lượt một người (có lý do, ghi lịch sử pool) */
export async function adjustRounds(ctx: ProtectedContext, input: { userId: string; centerId: string | null; rounds: number; reason: string }) {
  requirePermission(ctx, "lead:update", { centerId: input.centerId });
  await ctx.db.transaction(async (tx) => {
    const [row] = await tx.select().from(leadAssignees).where(and(eq(leadAssignees.userId, input.userId), input.centerId ? eq(leadAssignees.centerId, input.centerId) : isNull(leadAssignees.centerId))).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Người này chưa có trong pool chia lead" });
    const errs = validateRoundAdjust(row.roundsReceived, input.rounds, input.reason);
    if (errs.length) throw bad(errs);
    await tx.update(leadAssignees).set({ roundsReceived: input.rounds }).where(eq(leadAssignees.id, row.id));
    await logPool(tx as unknown as Db, { centerId: row.centerId, userId: row.userId, action: "adjust", before: { rounds: row.roundsReceived }, after: { rounds: input.rounds }, reason: input.reason, actorId: ctx.user.id });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "admissions", entity: "lead_assignees", entityId: row.id, before: { rounds: row.roundsReceived }, after: { rounds: input.rounds }, reason: input.reason.trim(), ip: ctx.ip });
  });
  return distributionBoard(ctx, input.centerId);
}

/** Chia các lead trong pool (chưa có người phụ trách) theo chế độ hiện hành */
export async function distributePool(ctx: ProtectedContext, centerId: string | null, limit = 50) {
  requirePermission(ctx, "lead:update", { centerId });
  const policy = await resolveAdmissionsPolicy(ctx.db, centerId);
  if (policy.distributionMode === "manual") throw pre("Đang ở chế độ giao tay — hãy gán từng lead");
  const pool = await ctx.db.select({ id: leads.id, centerId: leads.centerId }).from(leads)
    .where(and(isNull(leads.assignedToId), inArray(leads.status, OPEN), isNull(leads.deletedAt), tenantCond(ctx, leads), centerId ? eq(leads.centerId, centerId) : sql`true`)).orderBy(asc(leads.createdAt)).limit(limit);
  let assigned = 0;
  for (const l of pool) {
    await ctx.db.transaction(async (tx) => {
      const db = tx as unknown as Db;
      const lp = l.centerId === centerId ? policy : await resolveAdmissionsPolicy(db, l.centerId);
      if (lp.distributionMode === "manual") return;
      const to = await autoPickAssignee(db, l.centerId, lp.distributionMode);
      if (!to) return;
      await recordAssignment(db, { leadId: l.id, centerId: l.centerId, toUserId: to, source: "auto", mode: lp.distributionMode, actorId: ctx.user.id, content: `Chia từ pool (${DISTRIBUTION_MODE_VI[lp.distributionMode]})` });
      assigned++;
    });
  }
  return { assigned, remaining: pool.length - assigned };
}

/** Nút "Phân công" trên thẻ Kanban: chia tự động một lead chưa có sale */
export async function distributeOne(ctx: ProtectedContext, input: { leadId: string }) {
  const lead = await ctx.db.query.leads.findFirst({ where: and(eq(leads.id, input.leadId), isNull(leads.deletedAt)) });
  if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy lead" });
  requirePermission(ctx, "lead:update", { centerId: lead.centerId });
  if (lead.assignedToId) throw pre("Lead đã có sale phụ trách");
  if (isConvertedLead(lead)) throw pre("Lead đã chốt");
  const policy = await resolveAdmissionsPolicy(ctx.db, lead.centerId);
  if (policy.distributionMode === "manual") throw pre("Cơ sở đang ở chế độ Quản lý giao tay — hãy gán sale trực tiếp");
  const to = await ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const pick = await autoPickAssignee(db, lead.centerId, policy.distributionMode);
    if (!pick) throw pre("Không phân công được — cơ sở chưa có sale nào đang nhận lead");
    await recordAssignment(db, { leadId: lead.id, centerId: lead.centerId, toUserId: pick, source: "auto", mode: policy.distributionMode, actorId: ctx.user.id });
    return pick;
  });
  const u = await ctx.db.query.users.findFirst({ where: eq(users.id, to), columns: { fullName: true } });
  return { assigneeId: to, assigneeName: u?.fullName ?? null };
}

/* ------------------------------------------------------------------ */
/* Sổ chia lead & lịch sử pool                                          */
/* ------------------------------------------------------------------ */

const userName = (col: SQL | typeof leadDistributionLog.assignedToId) => sql<string | null>`(select u.full_name from ${users} u where u.id = ${col})`;

export async function distributionLog(
  ctx: ProtectedContext,
  input: { centerId?: string | null; from?: string; to?: string; saleId?: string | null; source?: AssignmentSource; consumed?: boolean; page?: number; all?: boolean },
) {
  requirePermission(ctx, "lead:read", { centerId: input.centerId ?? null });
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const from = input.from ?? new Date(Date.now() + 7 * 3600e3 - 30 * 86_400_000).toISOString().slice(0, 10);
  const to = input.to ?? today;
  const conds: SQL[] = [gte(leadDistributionLog.createdAt, new Date(`${from}T00:00:00+07:00`)), lte(leadDistributionLog.createdAt, new Date(`${to}T23:59:59.999+07:00`))];
  if (input.centerId) conds.push(eq(leadDistributionLog.centerId, input.centerId));
  if (input.saleId) conds.push(eq(leadDistributionLog.assignedToId, input.saleId));
  if (input.source) conds.push(eq(leadDistributionLog.source, input.source));
  if (input.consumed !== undefined) conds.push(eq(leadDistributionLog.consumedRound, input.consumed));
  const visible = visibleCenterIds(ctx.actor);
  if (visible !== null) conds.push(visible.length ? or(inArray(leadDistributionLog.centerId, visible), isNull(leadDistributionLog.centerId))! : sql`false`);
  const where = and(...conds);
  const pageSize = input.all ? 5000 : 50;
  const page = input.all ? 1 : Math.max(1, input.page ?? 1);
  const [tot] = await ctx.db.select({ n: sql<number>`count(*)::int`, consumed: sql<number>`count(*) filter (where ${leadDistributionLog.consumedRound})::int` }).from(leadDistributionLog).where(where);
  const rows = await ctx.db
    .select({
      id: leadDistributionLog.id, createdAt: leadDistributionLog.createdAt, leadId: leadDistributionLog.leadId, parentName: leads.parentName, phoneNormalized: leads.phoneNormalized,
      centerCode: centers.code, source: leadDistributionLog.source, mode: leadDistributionLog.mode, consumedRound: leadDistributionLog.consumedRound, roundsAfter: leadDistributionLog.roundsAfter, note: leadDistributionLog.note,
      assigneeName: userName(leadDistributionLog.assignedToId),
      creatorName: sql<string | null>`coalesce((select u.full_name from ${users} u where u.id = ${leads.createdBy}), (select u.full_name from ${users} u where u.id = ${leadDistributionLog.actorId}))`,
    })
    .from(leadDistributionLog)
    .innerJoin(leads, eq(leads.id, leadDistributionLog.leadId))
    .leftJoin(centers, eq(centers.id, leadDistributionLog.centerId))
    .where(where)
    .orderBy(desc(leadDistributionLog.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const full = canSeeLeadPhone(ctx);
  return {
    from, to, page, pageSize, total: tot?.n ?? 0, consumedCount: tot?.consumed ?? 0,
    items: rows.map(({ phoneNormalized, ...r }) => ({ ...r, phone: full ? phoneNormalized : maskPhone(phoneNormalized) })),
  };
}

export async function poolHistory(ctx: ProtectedContext, input: { centerId?: string | null; page?: number }) {
  requirePermission(ctx, "lead:read", { centerId: input.centerId ?? null });
  const conds: SQL[] = [];
  if (input.centerId) conds.push(or(eq(leadPoolEvents.centerId, input.centerId), isNull(leadPoolEvents.centerId))!);
  const visible = visibleCenterIds(ctx.actor);
  if (visible !== null) conds.push(visible.length ? or(inArray(leadPoolEvents.centerId, visible), isNull(leadPoolEvents.centerId))! : sql`false`);
  const where = conds.length ? and(...conds) : sql`true`;
  const pageSize = 20;
  const page = Math.max(1, input.page ?? 1);
  const [tot] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(leadPoolEvents).where(where);
  const rows = await ctx.db
    .select({
      id: leadPoolEvents.id, createdAt: leadPoolEvents.createdAt, action: leadPoolEvents.action, before: leadPoolEvents.before, after: leadPoolEvents.after, reason: leadPoolEvents.reason,
      centerCode: centers.code, userName: userName(sql`${leadPoolEvents.userId}`), actorName: userName(sql`${leadPoolEvents.actorId}`),
    })
    .from(leadPoolEvents)
    .leftJoin(centers, eq(centers.id, leadPoolEvents.centerId))
    .where(where)
    .orderBy(desc(leadPoolEvents.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { page, pageSize, total: tot?.n ?? 0, items: rows };
}

/* ------------------------------------------------------------------ */
/* Bàn giao lead hàng loạt (sale nguồn → sale đích, lý do)              */
/* ------------------------------------------------------------------ */

export interface HandoverInput { fromUserId: string; toUserId: string; statuses?: LeadStatus[]; utmCampaign?: string | null; centerId?: string | null; reason: string; execute: boolean }

export async function handoverLeads(ctx: ProtectedContext, input: HandoverInput) {
  requirePermission(ctx, "lead:update", { centerId: input.centerId ?? null });
  if (input.fromUserId === input.toUserId) throw bad("Sale nguồn và đích trùng nhau");
  const conds = [eq(leads.assignedToId, input.fromUserId), isNull(leads.deletedAt), tenantCond(ctx, leads), inArray(leads.status, input.statuses?.length ? input.statuses : OPEN)];
  if (input.utmCampaign) conds.push(eq(leads.utmCampaign, input.utmCampaign));
  if (input.centerId) conds.push(eq(leads.centerId, input.centerId));
  const visible = visibleCenterIds(ctx.actor);
  if (visible !== null) conds.push(visible.length ? or(inArray(leads.centerId, visible), isNull(leads.centerId))! : sql`false`);
  const rows = await ctx.db.select({ id: leads.id, status: leads.status, centerId: leads.centerId }).from(leads).where(and(...conds));
  const byStatus = Object.fromEntries(LEAD_STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]));
  if (!input.execute) return { count: rows.length, byStatus, executed: false as const };

  await ctx.db.transaction(async (tx) => {
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return;
    await tx.update(leads).set({ assignedToId: input.toUserId, assignedAt: new Date(), lastTouchAt: new Date() }).where(inArray(leads.id, ids));
    await tx.update(leadTasks).set({ assigneeId: input.toUserId }).where(and(inArray(leadTasks.leadId, ids), isNull(leadTasks.doneAt)));
    await tx.insert(leadActivities).values(ids.map((id) => ({ leadId: id, type: "handover" as const, actorId: ctx.user.id, content: `Bàn giao: ${input.reason}`, meta: { from: input.fromUserId, to: input.toUserId, mode: "handover" } })));
    await tx.insert(leadTransfers).values(rows.map((r) => ({ leadId: r.id, kind: "handover" as const, fromUserId: input.fromUserId, toUserId: input.toUserId, fromCenterId: r.centerId, toCenterId: r.centerId, reason: input.reason, actorId: ctx.user.id })));
    await tx.insert(leadDistributionLog).values(rows.map((r) => ({ leadId: r.id, centerId: r.centerId, fromUserId: input.fromUserId, assignedToId: input.toUserId, actorId: ctx.user.id, source: "manager" as const, consumedRound: false, note: `Bàn giao hàng loạt: ${input.reason}` })));
    for (const id of ids) await emit(tx as unknown as Db, { type: "lead.transferred", leadId: id, kind: "handover", fromUserId: input.fromUserId, toUserId: input.toUserId, toCenterId: null, reason: input.reason });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "admissions", entity: "lead_handover", entityId: input.toUserId, after: { count: ids.length, from: input.fromUserId }, reason: input.reason, ip: ctx.ip });
  });
  return { count: rows.length, byStatus, executed: true as const };
}

/* ------------------------------------------------------------------ */
/* Chuyển lead (note bàn giao) · chia lại · phân bổ lead nguội          */
/* ------------------------------------------------------------------ */

/** Sale nhận có thuộc cơ sở đích không (vai trò tại cơ sở / toàn hệ thống, hoặc có trong pool chia) */
async function assertReceiver(db: Db, userId: string, centerId: string | null) {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true, isActive: true, fullName: true } });
  if (!u?.isActive) throw bad("Sale nhận không tồn tại hoặc đã khoá");
  if (!centerId) return u;
  const [role] = await db.select({ id: userRoles.userId }).from(userRoles).where(and(eq(userRoles.userId, userId), or(eq(userRoles.centerId, centerId), isNull(userRoles.centerId))!)).limit(1);
  const [pool] = await db.select({ id: leadAssignees.id }).from(leadAssignees).where(and(eq(leadAssignees.userId, userId), assigneeScope(centerId))).limit(1);
  if (!role && !pool) throw bad("Sale nhận không làm việc ở cơ sở đích");
  return u;
}

export async function transferLead(ctx: ProtectedContext, input: { leadId: string; toCenterId?: string | null; toUserId?: string | null; handoverNote: string; reason?: string | null }) {
  const lead = await ctx.db.query.leads.findFirst({ where: and(eq(leads.id, input.leadId), isNull(leads.deletedAt)) });
  if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy lead" });
  requirePermission(ctx, "lead:update", { centerId: lead.centerId });
  if (lead.status === "enrolled") throw pre("Lead đã chốt — không chuyển được");
  const errs = validateLeadTransfer({ fromCenterId: lead.centerId, fromUserId: lead.assignedToId, toCenterId: input.toCenterId ?? null, toUserId: input.toUserId ?? null, handoverNote: input.handoverNote });
  if (errs.length) throw bad(errs);
  const targetCenterId = input.toCenterId ?? lead.centerId;
  const centerChanged = targetCenterId !== lead.centerId;
  const target = input.toCenterId ? await ctx.db.query.centers.findFirst({ where: eq(centers.id, input.toCenterId), columns: { id: true, code: true } }) : null;
  if (input.toCenterId && !target) throw new TRPCError({ code: "NOT_FOUND", message: "Cơ sở đích không tồn tại" });
  // Cách ly trung tâm: chuyển sang cơ sở của trung tâm khác phải được trung tâm đó cho phép
  assertTenant(ctx, lead, "Lead");
  await assertCenterTransferAllowed(ctx, { fromCenterId: lead.centerId, toCenterId: targetCenterId, what: "lead" });
  if (input.toUserId) await assertReceiver(ctx.db, input.toUserId, targetCenterId);
  const note = input.handoverNote.trim();
  const reason = input.reason?.trim() || null;
  const result = await ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const policy = await resolveAdmissionsPolicy(db, targetCenterId);
    let to = input.toUserId ?? null;
    let source: AssignmentSource = "manager";
    if (!to && centerChanged && policy.distributionMode !== "manual") {
      to = await autoPickAssignee(db, targetCenterId, policy.distributionMode, lead.assignedToId);
      source = "auto";
    }
    if (!to && !centerChanged) throw bad("Chọn sale nhận");
    const now = new Date();
    await tx.update(leads).set({ centerId: targetCenterId, assignedToId: to, assignedAt: to ? now : null, lastTouchAt: now }).where(eq(leads.id, lead.id));
    await tx.update(leadTasks).set({ assigneeId: to }).where(and(eq(leadTasks.leadId, lead.id), isNull(leadTasks.doneAt)));
    if (to) await recordAssignment(db, { leadId: lead.id, centerId: targetCenterId, fromUserId: lead.assignedToId, toUserId: to, source, mode: policy.distributionMode, actorId: ctx.user.id, updateLead: false, activity: false, emitEvent: false, note: centerChanged ? `Chuyển cơ sở${target ? ` → ${target.code}` : ""}` : "Bàn giao lead" });
    await tx.insert(leadActivities).values({
      leadId: lead.id, type: "handover", actorId: ctx.user.id,
      content: `${centerChanged ? `Chuyển sang cơ sở ${target?.code ?? ""}. ` : ""}Bàn giao: ${note}${reason ? ` (Lý do: ${reason})` : ""}`,
      meta: { fromCenterId: lead.centerId, toCenterId: targetCenterId, from: lead.assignedToId, to, kind: centerChanged ? "center_transfer" : "handover", source },
    });
    await tx.insert(leadTransfers).values({ leadId: lead.id, kind: centerChanged ? "center_transfer" : "handover", fromUserId: lead.assignedToId, toUserId: to, fromCenterId: lead.centerId, toCenterId: targetCenterId, reason, handoverNote: note, actorId: ctx.user.id });
    await emit(db, { type: "lead.transferred", leadId: lead.id, kind: centerChanged ? "center_transfer" : "handover", fromUserId: lead.assignedToId, toUserId: to, toCenterId: centerChanged ? targetCenterId : null, reason: note });
    await writeAudit(db, { actorId: ctx.user.id, action: "UPDATE", module: "admissions", entity: "leads", entityId: lead.id, before: { centerId: lead.centerId, assignedToId: lead.assignedToId }, after: { centerId: targetCenterId, assignedToId: to }, reason: reason ?? note, ip: ctx.ip });
    return { toUserId: to, centerChanged };
  });
  return { ok: true, ...result };
}

/** "Chia lại lead": chia tự động theo cấu hình cơ sở, bỏ qua sale đang giữ */
export async function redistributeLead(ctx: ProtectedContext, input: { leadId: string; reason: string }) {
  const lead = await ctx.db.query.leads.findFirst({ where: and(eq(leads.id, input.leadId), isNull(leads.deletedAt)) });
  if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy lead" });
  requirePermission(ctx, "lead:update", { centerId: lead.centerId });
  if (isConvertedLead(lead)) throw pre("Lead đã chốt — giữ người phụ trách");
  if (!OPEN.includes(lead.status)) throw pre("Chỉ chia lại lead đang mở");
  const reason = input.reason.trim();
  if (reason.length < 3) throw bad("Nhập lý do chia lại (tối thiểu 3 ký tự)");
  const policy = await resolveAdmissionsPolicy(ctx.db, lead.centerId);
  if (policy.distributionMode === "manual") throw pre("Cơ sở đang ở chế độ Quản lý giao tay — hãy gán sale trực tiếp");
  const to = await ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const pick = await autoPickAssignee(db, lead.centerId, policy.distributionMode, lead.assignedToId);
    if (!pick) throw pre("Không có sale khác đang nhận lead ở cơ sở này");
    await recordAssignment(db, { leadId: lead.id, centerId: lead.centerId, fromUserId: lead.assignedToId, toUserId: pick, source: "auto", mode: policy.distributionMode, actorId: ctx.user.id, content: `Chia lại theo cấu hình cơ sở: ${reason}`, note: reason });
    await tx.insert(leadTransfers).values({ leadId: lead.id, kind: "redistribute", fromUserId: lead.assignedToId, toUserId: pick, fromCenterId: lead.centerId, toCenterId: lead.centerId, reason, actorId: ctx.user.id });
    await writeAudit(db, { actorId: ctx.user.id, action: "UPDATE", module: "admissions", entity: "leads", entityId: lead.id, before: { assignedToId: lead.assignedToId }, after: { assignedToId: pick }, reason, ip: ctx.ip });
    return pick;
  });
  const u = await ctx.db.query.users.findFirst({ where: eq(users.id, to), columns: { fullName: true } });
  return { assigneeId: to, assigneeName: u?.fullName ?? null };
}

/** Phân bổ lại nhiều lead (lead lâu ngày chưa chăm) cho một tư vấn viên; bỏ qua lead đã chốt */
export async function reassignLeads(ctx: ProtectedContext, input: { leadIds: string[]; toUserId: string; reason: string }) {
  const reason = input.reason.trim();
  if (reason.length < 3) throw bad("Nhập lý do phân bổ lại (tối thiểu 3 ký tự)");
  const ids = [...new Set(input.leadIds)];
  if (!ids.length) throw bad("Chưa chọn lead");
  const rows = await ctx.db.select({ id: leads.id, status: leads.status, centerId: leads.centerId, assignedToId: leads.assignedToId, convertedAt: leads.convertedAt })
    .from(leads).where(and(inArray(leads.id, ids), isNull(leads.deletedAt), tenantCond(ctx, leads)));
  const skipped: { leadId: string; reason: string }[] = ids.filter((id) => !rows.some((r) => r.id === id)).map((leadId) => ({ leadId, reason: "Không tìm thấy" }));
  const eligible: typeof rows = [];
  for (const r of rows) {
    if (!authorize(ctx.actor, "lead:update", { centerId: r.centerId }).allowed) skipped.push({ leadId: r.id, reason: "Không có quyền" });
    else if (isConvertedLead(r)) skipped.push({ leadId: r.id, reason: "Đã chốt" });
    else if (r.assignedToId === input.toUserId) skipped.push({ leadId: r.id, reason: "Đã thuộc tư vấn viên này" });
    else eligible.push(r);
  }
  for (const c of [...new Set(eligible.map((r) => r.centerId))]) await assertReceiver(ctx.db, input.toUserId, c);
  if (eligible.length) {
    await ctx.db.transaction(async (tx) => {
      const db = tx as unknown as Db;
      const eids = eligible.map((r) => r.id);
      const now = new Date();
      await tx.update(leads).set({ assignedToId: input.toUserId, assignedAt: now, lastTouchAt: now }).where(inArray(leads.id, eids));
      await tx.update(leadTasks).set({ assigneeId: input.toUserId }).where(and(inArray(leadTasks.leadId, eids), isNull(leadTasks.doneAt)));
      for (const r of eligible) {
        await recordAssignment(db, { leadId: r.id, centerId: r.centerId, fromUserId: r.assignedToId, toUserId: input.toUserId, source: "manager", mode: "manual", actorId: ctx.user.id, updateLead: false, emitEvent: false, content: `Phân bổ lại lead lâu ngày chưa chăm: ${reason}`, note: reason });
        await emit(db, { type: "lead.transferred", leadId: r.id, kind: "handover", fromUserId: r.assignedToId, toUserId: input.toUserId, toCenterId: null, reason });
      }
      await tx.insert(leadTransfers).values(eligible.map((r) => ({ leadId: r.id, kind: "handover" as const, fromUserId: r.assignedToId, toUserId: input.toUserId, fromCenterId: r.centerId, toCenterId: r.centerId, reason, actorId: ctx.user.id })));
      await writeAudit(db, { actorId: ctx.user.id, action: "UPDATE", module: "admissions", entity: "lead_reassign", entityId: input.toUserId, after: { count: eids.length, leadIds: eids }, reason, ip: ctx.ip });
    });
  }
  return { done: eligible.length, skipped: skipped.length, skippedDetails: skipped };
}

/** Báo cáo "Chuyển lead liên cơ sở" / sổ bàn giao theo tháng */
export async function transfersReport(ctx: ProtectedContext, input: { month: string; kind?: "handover" | "center_transfer" | "redistribute" }) {
  requirePermission(ctx, "lead:read", { centerId: null });
  const start = new Date(`${input.month}-01T00:00:00+07:00`);
  const end = new Date(start); end.setMonth(end.getMonth() + 1);
  const fromU = sql<string | null>`(select full_name from users u where u.id = ${leadTransfers.fromUserId})`;
  const toU = sql<string | null>`(select full_name from users u where u.id = ${leadTransfers.toUserId})`;
  const fromC = sql<string | null>`(select code from centers c where c.id = ${leadTransfers.fromCenterId})`;
  const toC = sql<string | null>`(select code from centers c where c.id = ${leadTransfers.toCenterId})`;
  const actor = sql<string | null>`(select full_name from users u where u.id = ${leadTransfers.actorId})`;
  const rows = await ctx.db
    .select({ id: leadTransfers.id, leadId: leadTransfers.leadId, parentName: leads.parentName, status: leads.status, kind: leadTransfers.kind, fromUser: fromU, toUser: toU, fromCenter: fromC, toCenter: toC, actor, reason: sql<string | null>`coalesce(${leadTransfers.reason} || coalesce(' — ' || ${leadTransfers.handoverNote}, ''), ${leadTransfers.handoverNote})`, createdAt: leadTransfers.createdAt })
    .from(leadTransfers)
    .innerJoin(leads, eq(leads.id, leadTransfers.leadId))
    .where(and(gte(leadTransfers.createdAt, start), lte(leadTransfers.createdAt, end), input.kind ? eq(leadTransfers.kind, input.kind) : sql`true`))
    .orderBy(desc(leadTransfers.createdAt))
    .limit(500);
  return rows;
}

/* ------------------------------------------------------------------ */
/* Lead lâu ngày chưa chăm                                              */
/* ------------------------------------------------------------------ */

export async function staleLeads(ctx: ProtectedContext, input: { sinceDays?: number; centerId?: string | null; limit?: number }) {
  requirePermission(ctx, "lead:read", { centerId: input.centerId ?? null });
  const policy = await resolveAdmissionsPolicy(ctx.db, input.centerId ?? null);
  const days = input.sinceDays ?? policy.staleAfterDays;
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const conds = [isNull(leads.deletedAt), tenantCond(ctx, leads), inArray(leads.status, OPEN), lte(leads.lastTouchAt, cutoff)];
  if (input.centerId) conds.push(eq(leads.centerId, input.centerId));
  const visible = visibleCenterIds(ctx.actor);
  if (visible !== null) conds.push(visible.length ? or(inArray(leads.centerId, visible), isNull(leads.centerId))! : sql`false`);
  const rows = await ctx.db
    .select({ id: leads.id, parentName: leads.parentName, phoneNormalized: leads.phoneNormalized, status: leads.status, centerId: leads.centerId, centerCode: centers.code, assigneeName: users.fullName, assignedToId: leads.assignedToId, lastTouchAt: leads.lastTouchAt, createdAt: leads.createdAt, convertedAt: leads.convertedAt })
    .from(leads).leftJoin(centers, eq(centers.id, leads.centerId)).leftJoin(users, eq(users.id, leads.assignedToId))
    .where(and(...conds)).orderBy(asc(leads.lastTouchAt)).limit(input.limit ?? 300);
  const full = canSeeLeadPhone(ctx);
  const now = Date.now();
  return {
    days,
    items: rows.map(({ phoneNormalized, ...r }) => ({
      ...r,
      phone: full ? phoneNormalized : maskPhone(phoneNormalized),
      silentDays: Math.floor((now - r.lastTouchAt.getTime()) / 86_400_000),
      canReassign: !isConvertedLead(r) && authorize(ctx.actor, "lead:update", { centerId: r.centerId }).allowed,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Chốt hàng loạt                                                       */
/* ------------------------------------------------------------------ */

/**
 * Ứng viên chốt hàng loạt: lead đã học thử / chờ quyết định / đang tư vấn / đang học thử,
 * và lead "Đã đăng ký" (từ file khách đã đăng ký) còn con chưa chốt.
 */
export async function bulkConvertCandidates(ctx: ProtectedContext, input: { centerId?: string | null; q?: string; statuses?: LeadStatus[] }) {
  requirePermission(ctx, "enrollment:create", { centerId: input.centerId ?? null });
  const statuses = input.statuses?.length ? input.statuses : (["trial_done", "deciding", "consulting", "trial_in_progress", "enrolled"] as LeadStatus[]);
  const conds = [isNull(leads.deletedAt), tenantCond(ctx, leads), inArray(leads.status, statuses)];
  if (input.centerId) conds.push(eq(leads.centerId, input.centerId));
  if (input.q) {
    const digits = input.q.replace(/\D/g, "").replace(/^0/, "");
    conds.push(or(sql`${leads.parentName} ilike ${"%" + input.q + "%"}`, sql`${leads.childName} ilike ${"%" + input.q + "%"}`, digits.length >= 4 ? sql`${leads.phoneNormalized} like ${"%" + digits + "%"}` : sql`false`)!);
  }
  const visible = visibleCenterIds(ctx.actor);
  if (visible !== null) conds.push(visible.length ? or(inArray(leads.centerId, visible), isNull(leads.centerId))! : sql`false`);
  // Lead đã đăng ký chỉ lấy khi còn con chưa chốt
  conds.push(sql`(${leads.status} <> 'enrolled' or exists (select 1 from ${leadChildren} k where k.lead_id = ${leads.id} and k.converted_student_id is null))`);
  const rows = await ctx.db
    .select({ id: leads.id, parentName: leads.parentName, phoneNormalized: leads.phoneNormalized, status: leads.status, centerId: leads.centerId, centerCode: centers.code, childName: leads.childName, childGrade: leads.childGrade, assigneeName: users.fullName, interestedCourseId: leads.interestedCourseId, createdAt: leads.createdAt, notes: leads.notes })
    .from(leads).leftJoin(centers, eq(centers.id, leads.centerId)).leftJoin(users, eq(users.id, leads.assignedToId))
    .where(and(...conds)).orderBy(desc(leads.lastTouchAt)).limit(300);
  const ids = rows.map((r) => r.id);
  const kids = ids.length ? await ctx.db.select().from(leadChildren).where(and(inArray(leadChildren.leadId, ids), isNull(leadChildren.convertedStudentId))).orderBy(asc(leadChildren.createdAt)) : [];
  const classOptions = await ctx.db
    .select({ id: classes.id, code: classes.code, name: classes.name, centerId: classes.centerId, centerCode: centers.code, courseId: classes.courseId, courseCode: courses.code, listPrice: courses.listPrice, totalSessions: courses.totalSessions, capacity: classes.capacity, status: classes.status })
    .from(classes).innerJoin(centers, eq(centers.id, classes.centerId)).leftJoin(courses, eq(courses.id, classes.courseId))
    .where(and(inArray(classes.status, ["recruiting", "running", "draft"]), isNull(classes.deletedAt), tenantCond(ctx, classes), visible === null ? sql`true` : visible.length ? inArray(classes.centerId, visible) : sql`false`))
    .orderBy(asc(centers.code), asc(classes.code));
  const full = canSeeLeadPhone(ctx);
  return {
    items: rows.map(({ phoneNormalized, notes, ...r }) => {
      const children = kids.filter((k) => k.leadId === r.id).map((k) => ({ id: k.id, fullName: k.fullName, grade: k.grade, interestedCourseId: k.interestedCourseId, tokens: parseNoteTokens(k.notes) }));
      const unpaidAllowed = r.status === "enrolled" || authorize(ctx.actor, "finance:approve", { centerId: r.centerId }).allowed;
      return {
        ...r,
        phone: full ? phoneNormalized : maskPhone(phoneNormalized),
        children,
        tokens: parseNoteTokens(notes),
        unpaidAllowed,
        warnings: [
          !r.parentName?.trim() ? "Phiếu không có tên PH" : null,
          !r.assigneeName ? "Chưa có sale phụ trách" : null,
          !unpaidAllowed ? "Cần nhập số tiền đã đóng (chưa có đơn đã ghi nhận thu thì không chốt được)" : null,
        ].filter(Boolean) as string[],
      };
    }),
    classOptions: classOptions.map((c) => ({ ...c, listPrice: Number(c.listPrice ?? 0), totalSessions: c.totalSessions ?? 0 })),
  };
}

export interface BulkConvertItem { leadId: string; childId?: string | null; classId: string; packageSessions: number; mediaConsent?: boolean; paidAmount?: number | null; paidAt?: string | null; status?: "active" | "trial" }
type ConvertOne = (ctx: ProtectedContext, item: BulkConvertItem) => Promise<{ studentId: string; enrollmentId: string; parentId: string; leadClosed: boolean; accountPending: boolean; orderCode?: string | null }>;

/** Chốt N lead trong một lần; mỗi dòng là một transaction riêng, trả kết quả từng dòng (không chặn cả lô vì 1 lỗi) */
export async function bulkConvert(ctx: ProtectedContext, input: { items: BulkConvertItem[] }, convertOne: ConvertOne) {
  const results: { leadId: string; ok: boolean; message: string; studentId?: string; accountPending?: boolean }[] = [];
  for (const item of input.items) {
    try {
      const r = await convertOne(ctx, item);
      results.push({ leadId: item.leadId, ok: true, message: ["Đã chốt", r.orderCode ? `đơn ${r.orderCode} (khoản thu chờ kế toán)` : null, r.accountPending ? "tài khoản PH chờ kích hoạt" : null].filter(Boolean).join(" · "), studentId: r.studentId, accountPending: r.accountPending });
    } catch (e) {
      results.push({ leadId: item.leadId, ok: false, message: (e as Error).message });
    }
  }
  return { results, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
}

/* ------------------------------------------------------------------ */
/* CRM dashboard nhỏ: phễu + hiệu suất sale                             */
/* ------------------------------------------------------------------ */

export async function crmSummary(ctx: ProtectedContext, input: { centerId?: string | null; days?: number }) {
  requirePermission(ctx, "lead:read", { centerId: input.centerId ?? null });
  const since = new Date(Date.now() - (input.days ?? 30) * 86_400_000);
  const conds = [isNull(leads.deletedAt), tenantCond(ctx, leads), gte(leads.createdAt, since)];
  if (input.centerId) conds.push(eq(leads.centerId, input.centerId));
  const visible = visibleCenterIds(ctx.actor);
  if (visible !== null) conds.push(visible.length ? or(inArray(leads.centerId, visible), isNull(leads.centerId))! : sql`false`);
  const [byStatus, bySource, bySale, sla] = await Promise.all([
    ctx.db.select({ status: leads.status, n: sql<number>`count(*)::int` }).from(leads).where(and(...conds)).groupBy(leads.status),
    ctx.db.select({ source: leads.source, n: sql<number>`count(*)::int`, enrolled: sql<number>`count(*) filter (where ${leads.status} = 'enrolled')::int` }).from(leads).where(and(...conds)).groupBy(leads.source).orderBy(desc(sql`count(*)`)).limit(10),
    ctx.db.select({ userId: leads.assignedToId, name: users.fullName, n: sql<number>`count(*)::int`, enrolled: sql<number>`count(*) filter (where ${leads.status} = 'enrolled')::int`, open: sql<number>`count(*) filter (where ${leads.status} in (${OPEN_IN}))::int` })
      .from(leads).leftJoin(users, eq(users.id, leads.assignedToId)).where(and(...conds)).groupBy(leads.assignedToId, users.fullName).orderBy(desc(sql`count(*)`)),
    ctx.db.select({ status: leads.status, lastTouchAt: leads.lastTouchAt, centerId: leads.centerId }).from(leads).where(and(isNull(leads.deletedAt), tenantCond(ctx, leads), inArray(leads.status, OPEN), input.centerId ? eq(leads.centerId, input.centerId) : sql`true`)),
  ]);
  const policy = await resolveAdmissionsPolicy(ctx.db, input.centerId ?? null);
  const now = new Date().toISOString();
  const overdue = sla.filter((l) => computeSla(l.status, l.lastTouchAt.toISOString(), now, policy.sla).level === "overdue").length;
  const total = byStatus.reduce((a, b) => a + b.n, 0);
  const enrolled = byStatus.find((b) => b.status === "enrolled")?.n ?? 0;
  return { days: input.days ?? 30, total, enrolled, conversionRate: total ? Math.round((enrolled / total) * 100) : 0, overdueOpen: overdue, byStatus, bySource, bySale: bySale.map((s) => ({ ...s, rate: s.n ? Math.round((s.enrolled / s.n) * 100) : 0 })) };
}
