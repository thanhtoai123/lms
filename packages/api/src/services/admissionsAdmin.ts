import { and, eq, inArray, sql, asc, desc, isNull, or, lte, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { leads, leadActivities, leadTasks, leadAssignees, leadChildren, admissionsSettings, leadTransfers, users, centers, classes, courses, userRoles } from "@satarobo/db";
import {
  DEFAULT_ADMISSIONS_POLICY, DEFAULT_SLA, OPEN_LEAD_STATUSES, pickAssigneeByMode, computeSla, maskPhone, hasRole, visibleCenterIds,
  type AdmissionsPolicy, type DistributionMode, type LeadStatus, type SlaPolicy, LEAD_STATUSES,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { emit } from "./outbox";

export type Db = ProtectedContext["db"];

const OPEN = [...OPEN_LEAD_STATUSES];
const OPEN_IN = sql.join(OPEN.map((s) => sql`${s}`), sql`, `);

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

async function candidateStats(db: Db, centerId: string | null) {
  return db
    .select({
      id: leadAssignees.userId,
      fullName: users.fullName,
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
    .where(and(eq(users.isActive, true), centerId ? or(eq(leadAssignees.centerId, centerId), isNull(leadAssignees.centerId))! : sql`true`))
    .orderBy(asc(users.fullName));
}

/** Chọn sale nhận lead theo chế độ hiện hành của cơ sở */
export async function autoPickAssignee(db: Db, centerId: string | null, mode: DistributionMode): Promise<string | null> {
  const cands = await candidateStats(db, centerId);
  return pickAssigneeByMode(mode, cands.map((c) => ({ ...c, lastAssignedAt: c.lastAssignedAt?.toISOString() ?? null })));
}

/** Màn "Quản lý chia lead": chế độ + bảng sale (nhận lead, lượt, đang giữ, chốt, lần chia gần nhất) */
export async function distributionBoard(ctx: ProtectedContext, centerId: string | null) {
  requirePermission(ctx, "lead:read", { centerId });
  const [policy, board, settings] = await Promise.all([
    resolveAdmissionsPolicy(ctx.db, centerId),
    candidateStats(ctx.db, centerId),
    ctx.db.select({ roundsResetAt: admissionsSettings.roundsResetAt }).from(admissionsSettings).where(centerId ? eq(admissionsSettings.centerId, centerId) : isNull(admissionsSettings.centerId)).limit(1),
  ]);
  const [pool] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(leads).where(and(isNull(leads.assignedToId), inArray(leads.status, OPEN), isNull(leads.deletedAt), centerId ? eq(leads.centerId, centerId) : sql`true`));
  // Ứng viên có thể thêm: user có vai trò sale/CSKH ở cơ sở nhưng chưa trong bảng chia
  const candidates = await ctx.db
    .select({ id: users.id, fullName: users.fullName, role: userRoles.role })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(inArray(userRoles.role, ["CENTER_SALES_CSM", "HO_SALE", "CENTER_MANAGER"]), eq(users.isActive, true), centerId ? or(eq(userRoles.centerId, centerId), isNull(userRoles.centerId))! : sql`true`));
  const inBoard = new Set(board.map((b) => b.id));
  return {
    mode: policy.distributionMode,
    roundsResetAt: settings[0]?.roundsResetAt ?? null,
    poolSize: pool?.n ?? 0,
    board: board.map((b) => ({ ...b, conversionRate: b.totalAssigned ? Math.round((b.converted / b.totalAssigned) * 100) : null })),
    addable: candidates.filter((c) => !inBoard.has(c.id)),
  };
}

export async function upsertAssignee(ctx: ProtectedContext, input: { userId: string; centerId: string | null; isAvailable?: boolean; weight?: number; note?: string | null }) {
  requirePermission(ctx, "lead:update", { centerId: input.centerId });
  const [existing] = await ctx.db.select().from(leadAssignees).where(and(eq(leadAssignees.userId, input.userId), input.centerId ? eq(leadAssignees.centerId, input.centerId) : isNull(leadAssignees.centerId))).limit(1);
  const patch = { ...(input.isAvailable !== undefined ? { isAvailable: input.isAvailable } : {}), ...(input.weight !== undefined ? { weight: input.weight } : {}), ...(input.note !== undefined ? { note: input.note } : {}) };
  if (existing) await ctx.db.update(leadAssignees).set(patch).where(eq(leadAssignees.id, existing.id));
  else await ctx.db.insert(leadAssignees).values({ userId: input.userId, centerId: input.centerId, ...patch });
  return distributionBoard(ctx, input.centerId);
}

export async function removeAssignee(ctx: ProtectedContext, input: { userId: string; centerId: string | null }) {
  requirePermission(ctx, "lead:update", { centerId: input.centerId });
  await ctx.db.delete(leadAssignees).where(and(eq(leadAssignees.userId, input.userId), input.centerId ? eq(leadAssignees.centerId, input.centerId) : isNull(leadAssignees.centerId)));
  return distributionBoard(ctx, input.centerId);
}

/** "Đặt lại lượt toàn cơ sở": rounds_received = 0 cho mọi sale của cơ sở */
export async function resetRounds(ctx: ProtectedContext, centerId: string | null) {
  requirePermission(ctx, "lead:update", { centerId });
  await ctx.db.transaction(async (tx) => {
    await tx.update(leadAssignees).set({ roundsReceived: 0 }).where(centerId ? or(eq(leadAssignees.centerId, centerId), isNull(leadAssignees.centerId))! : sql`true`);
    const [existing] = await tx.select({ id: admissionsSettings.id }).from(admissionsSettings).where(centerId ? eq(admissionsSettings.centerId, centerId) : isNull(admissionsSettings.centerId)).limit(1);
    if (existing) await tx.update(admissionsSettings).set({ roundsResetAt: new Date(), updatedBy: ctx.user.id }).where(eq(admissionsSettings.id, existing.id));
    else await tx.insert(admissionsSettings).values({ centerId, roundsResetAt: new Date(), updatedBy: ctx.user.id });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "admissions", entity: "lead_assignees", entityId: centerId ?? null, reason: "Đặt lại lượt", ip: ctx.ip });
  });
  return distributionBoard(ctx, centerId);
}

/** Chia các lead trong pool (chưa có người phụ trách) theo chế độ hiện hành */
export async function distributePool(ctx: ProtectedContext, centerId: string | null, limit = 50) {
  requirePermission(ctx, "lead:update", { centerId });
  const policy = await resolveAdmissionsPolicy(ctx.db, centerId);
  if (policy.distributionMode === "manual") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Đang ở chế độ giao tay — hãy gán từng lead" });
  const pool = await ctx.db.select({ id: leads.id, centerId: leads.centerId }).from(leads)
    .where(and(isNull(leads.assignedToId), inArray(leads.status, OPEN), isNull(leads.deletedAt), centerId ? eq(leads.centerId, centerId) : sql`true`)).orderBy(asc(leads.createdAt)).limit(limit);
  let assigned = 0;
  for (const l of pool) {
    await ctx.db.transaction(async (tx) => {
      const to = await autoPickAssignee(tx as unknown as Db, l.centerId, policy.distributionMode);
      if (!to) return;
      await tx.update(leads).set({ assignedToId: to, assignedAt: new Date(), lastTouchAt: new Date() }).where(eq(leads.id, l.id));
      await tx.update(leadTasks).set({ assigneeId: to }).where(and(eq(leadTasks.leadId, l.id), isNull(leadTasks.doneAt)));
      await tx.update(leadAssignees).set({ roundsReceived: sql`${leadAssignees.roundsReceived} + 1`, lastAssignedAt: new Date() }).where(and(eq(leadAssignees.userId, to), l.centerId ? or(eq(leadAssignees.centerId, l.centerId), isNull(leadAssignees.centerId))! : sql`true`));
      await tx.insert(leadActivities).values({ leadId: l.id, type: "assignment", actorId: ctx.user.id, content: `Chia từ pool (${policy.distributionMode})`, meta: { to, mode: policy.distributionMode } });
      await emit(tx as unknown as Db, { type: "lead.assigned", leadId: l.id, assigneeId: to, mode: policy.distributionMode, actorId: ctx.user.id });
      assigned++;
    });
  }
  return { assigned, remaining: pool.length - assigned };
}

/* ------------------------------------------------------------------ */
/* Bàn giao lead hàng loạt (sale nguồn → sale đích, lý do)              */
/* ------------------------------------------------------------------ */

export interface HandoverInput { fromUserId: string; toUserId: string; statuses?: LeadStatus[]; utmCampaign?: string | null; centerId?: string | null; reason: string; execute: boolean }

export async function handoverLeads(ctx: ProtectedContext, input: HandoverInput) {
  requirePermission(ctx, "lead:update", { centerId: input.centerId ?? null });
  if (input.fromUserId === input.toUserId) throw new TRPCError({ code: "BAD_REQUEST", message: "Sale nguồn và đích trùng nhau" });
  const conds = [eq(leads.assignedToId, input.fromUserId), isNull(leads.deletedAt), inArray(leads.status, input.statuses?.length ? input.statuses : OPEN)];
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
    await tx.insert(leadActivities).values(ids.map((id) => ({ leadId: id, type: "assignment" as const, actorId: ctx.user.id, content: `Bàn giao: ${input.reason}`, meta: { from: input.fromUserId, to: input.toUserId, mode: "handover" } })));
    await tx.insert(leadTransfers).values(rows.map((r) => ({ leadId: r.id, kind: "handover" as const, fromUserId: input.fromUserId, toUserId: input.toUserId, fromCenterId: r.centerId, toCenterId: r.centerId, reason: input.reason, actorId: ctx.user.id })));
    for (const id of ids) await emit(tx as unknown as Db, { type: "lead.transferred", leadId: id, kind: "handover", fromUserId: input.fromUserId, toUserId: input.toUserId, toCenterId: null, reason: input.reason });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "admissions", entity: "lead_handover", entityId: input.toUserId, after: { count: ids.length, from: input.fromUserId }, reason: input.reason, ip: ctx.ip });
  });
  return { count: rows.length, byStatus, executed: true as const };
}

/* ------------------------------------------------------------------ */
/* Chuyển lead liên cơ sở                                               */
/* ------------------------------------------------------------------ */

export async function transferCenter(ctx: ProtectedContext, input: { leadId: string; toCenterId: string; reason: string; toUserId?: string | null }) {
  const lead = await ctx.db.query.leads.findFirst({ where: and(eq(leads.id, input.leadId), isNull(leads.deletedAt)) });
  if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
  requirePermission(ctx, "lead:update", { centerId: lead.centerId });
  if (lead.centerId === input.toCenterId) throw new TRPCError({ code: "BAD_REQUEST", message: "Lead đã thuộc cơ sở này" });
  const target = await ctx.db.query.centers.findFirst({ where: eq(centers.id, input.toCenterId) });
  if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Cơ sở đích không tồn tại" });
  await ctx.db.transaction(async (tx) => {
    const policy = await resolveAdmissionsPolicy(tx as unknown as Db, input.toCenterId);
    const toUserId = input.toUserId ?? (await autoPickAssignee(tx as unknown as Db, input.toCenterId, policy.distributionMode));
    await tx.update(leads).set({ centerId: input.toCenterId, assignedToId: toUserId, assignedAt: toUserId ? new Date() : null, lastTouchAt: new Date() }).where(eq(leads.id, lead.id));
    await tx.update(leadTasks).set({ assigneeId: toUserId }).where(and(eq(leadTasks.leadId, lead.id), isNull(leadTasks.doneAt)));
    if (toUserId) await tx.update(leadAssignees).set({ roundsReceived: sql`${leadAssignees.roundsReceived} + 1`, lastAssignedAt: new Date() }).where(and(eq(leadAssignees.userId, toUserId), or(eq(leadAssignees.centerId, input.toCenterId), isNull(leadAssignees.centerId))!));
    await tx.insert(leadActivities).values({ leadId: lead.id, type: "assignment", actorId: ctx.user.id, content: `Chuyển sang cơ sở ${target.code}: ${input.reason}`, meta: { fromCenterId: lead.centerId, toCenterId: input.toCenterId, from: lead.assignedToId, to: toUserId, mode: "center_transfer" } });
    await tx.insert(leadTransfers).values({ leadId: lead.id, kind: "center_transfer", fromUserId: lead.assignedToId, toUserId, fromCenterId: lead.centerId, toCenterId: input.toCenterId, reason: input.reason, actorId: ctx.user.id });
    await emit(tx as unknown as Db, { type: "lead.transferred", leadId: lead.id, kind: "center_transfer", fromUserId: lead.assignedToId, toUserId, toCenterId: input.toCenterId, reason: input.reason });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "admissions", entity: "leads", entityId: lead.id, before: { centerId: lead.centerId }, after: { centerId: input.toCenterId }, reason: input.reason, ip: ctx.ip });
  });
  return { ok: true };
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
    .select({ id: leadTransfers.id, leadId: leadTransfers.leadId, parentName: leads.parentName, status: leads.status, kind: leadTransfers.kind, fromUser: fromU, toUser: toU, fromCenter: fromC, toCenter: toC, actor, reason: leadTransfers.reason, createdAt: leadTransfers.createdAt })
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
  const conds = [isNull(leads.deletedAt), inArray(leads.status, OPEN), lte(leads.lastTouchAt, cutoff)];
  if (input.centerId) conds.push(eq(leads.centerId, input.centerId));
  const visible = visibleCenterIds(ctx.actor);
  if (visible !== null) conds.push(visible.length ? or(inArray(leads.centerId, visible), isNull(leads.centerId))! : sql`false`);
  const rows = await ctx.db
    .select({ id: leads.id, parentName: leads.parentName, phoneNormalized: leads.phoneNormalized, status: leads.status, centerCode: centers.code, assigneeName: users.fullName, assignedToId: leads.assignedToId, lastTouchAt: leads.lastTouchAt, createdAt: leads.createdAt })
    .from(leads).leftJoin(centers, eq(centers.id, leads.centerId)).leftJoin(users, eq(users.id, leads.assignedToId))
    .where(and(...conds)).orderBy(asc(leads.lastTouchAt)).limit(input.limit ?? 300);
  const full = hasRole(ctx.actor, "SUPER_ADMIN", "CENTER_MANAGER", "CENTER_SALES_CSM", "HO_SALE", "HO_MARKETING");
  const now = Date.now();
  return { days, items: rows.map((r) => ({ ...r, phone: full ? r.phoneNormalized : maskPhone(r.phoneNormalized), silentDays: Math.floor((now - r.lastTouchAt.getTime()) / 86_400_000) })) };
}

/* ------------------------------------------------------------------ */
/* Chốt hàng loạt                                                       */
/* ------------------------------------------------------------------ */

/** Ứng viên chốt hàng loạt: lead đã học thử / chờ quyết định / đang tư vấn có ít nhất một con chưa chốt */
export async function bulkConvertCandidates(ctx: ProtectedContext, input: { centerId?: string | null; q?: string; statuses?: LeadStatus[] }) {
  requirePermission(ctx, "enrollment:create", { centerId: input.centerId ?? null });
  const statuses = input.statuses?.length ? input.statuses : (["trial_done", "deciding", "consulting", "trial_in_progress"] as LeadStatus[]);
  const conds = [isNull(leads.deletedAt), inArray(leads.status, statuses)];
  if (input.centerId) conds.push(eq(leads.centerId, input.centerId));
  if (input.q) conds.push(or(sql`${leads.parentName} ilike ${"%" + input.q + "%"}`, sql`${leads.childName} ilike ${"%" + input.q + "%"}`)!);
  const visible = visibleCenterIds(ctx.actor);
  if (visible !== null) conds.push(visible.length ? or(inArray(leads.centerId, visible), isNull(leads.centerId))! : sql`false`);
  const rows = await ctx.db
    .select({ id: leads.id, parentName: leads.parentName, phoneNormalized: leads.phoneNormalized, status: leads.status, centerId: leads.centerId, centerCode: centers.code, childName: leads.childName, childGrade: leads.childGrade, assigneeName: users.fullName, interestedCourseId: leads.interestedCourseId })
    .from(leads).leftJoin(centers, eq(centers.id, leads.centerId)).leftJoin(users, eq(users.id, leads.assignedToId))
    .where(and(...conds)).orderBy(desc(leads.lastTouchAt)).limit(200);
  const ids = rows.map((r) => r.id);
  const kids = ids.length ? await ctx.db.select().from(leadChildren).where(and(inArray(leadChildren.leadId, ids), isNull(leadChildren.convertedStudentId))) : [];
  const classOptions = await ctx.db
    .select({ id: classes.id, code: classes.code, name: classes.name, centerId: classes.centerId, centerCode: centers.code, courseCode: courses.code, capacity: classes.capacity, status: classes.status })
    .from(classes).innerJoin(centers, eq(centers.id, classes.centerId)).leftJoin(courses, eq(courses.id, classes.courseId))
    .where(inArray(classes.status, ["recruiting", "running", "draft"])).orderBy(asc(centers.code), asc(classes.code));
  const full = hasRole(ctx.actor, "SUPER_ADMIN", "CENTER_MANAGER", "CENTER_SALES_CSM", "HO_SALE");
  return {
    items: rows.map((r) => ({ ...r, phone: full ? r.phoneNormalized : maskPhone(r.phoneNormalized), children: kids.filter((k) => k.leadId === r.id).map((k) => ({ id: k.id, fullName: k.fullName, grade: k.grade })), warnings: [!r.parentName?.trim() ? "Phiếu không có tên PH" : null, !r.assigneeName ? "Chưa có sale phụ trách → sẽ chia tự động" : null].filter(Boolean) as string[] })),
    classOptions,
  };
}

/** Chốt N lead trong một lần; mỗi dòng là một transaction riêng, trả kết quả từng dòng (không chặn cả lô vì 1 lỗi) */
export async function bulkConvert(
  ctx: ProtectedContext,
  input: { items: { leadId: string; childId?: string | null; classId: string; packageSessions: number; mediaConsent?: boolean; paidAmount?: number | null; paidAt?: string | null; status?: "active" | "trial" }[] },
  convertOne: (ctx: ProtectedContext, item: { leadId: string; childId?: string | null; classId: string; packageSessions: number; mediaConsent?: boolean; paidAmount?: number | null; paidAt?: string | null; status?: "active" | "trial" }) => Promise<{ studentId: string; enrollmentId: string; parentId: string; leadClosed: boolean; accountPending: boolean }>,
) {
  const results: { leadId: string; ok: boolean; message: string; studentId?: string; accountPending?: boolean }[] = [];
  for (const item of input.items) {
    try {
      const r = await convertOne(ctx, item);
      results.push({ leadId: item.leadId, ok: true, message: r.accountPending ? "Đã chốt · tài khoản PH chờ kích hoạt" : "Đã chốt", studentId: r.studentId, accountPending: r.accountPending });
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
  const conds = [isNull(leads.deletedAt), gte(leads.createdAt, since)];
  if (input.centerId) conds.push(eq(leads.centerId, input.centerId));
  const visible = visibleCenterIds(ctx.actor);
  if (visible !== null) conds.push(visible.length ? or(inArray(leads.centerId, visible), isNull(leads.centerId))! : sql`false`);
  const [byStatus, bySource, bySale, sla] = await Promise.all([
    ctx.db.select({ status: leads.status, n: sql<number>`count(*)::int` }).from(leads).where(and(...conds)).groupBy(leads.status),
    ctx.db.select({ source: leads.source, n: sql<number>`count(*)::int`, enrolled: sql<number>`count(*) filter (where ${leads.status} = 'enrolled')::int` }).from(leads).where(and(...conds)).groupBy(leads.source).orderBy(desc(sql`count(*)`)).limit(10),
    ctx.db.select({ userId: leads.assignedToId, name: users.fullName, n: sql<number>`count(*)::int`, enrolled: sql<number>`count(*) filter (where ${leads.status} = 'enrolled')::int`, open: sql<number>`count(*) filter (where ${leads.status} in (${OPEN_IN}))::int` })
      .from(leads).leftJoin(users, eq(users.id, leads.assignedToId)).where(and(...conds)).groupBy(leads.assignedToId, users.fullName).orderBy(desc(sql`count(*)`)),
    ctx.db.select({ status: leads.status, lastTouchAt: leads.lastTouchAt, centerId: leads.centerId }).from(leads).where(and(isNull(leads.deletedAt), inArray(leads.status, OPEN), input.centerId ? eq(leads.centerId, input.centerId) : sql`true`)),
  ]);
  const policy = await resolveAdmissionsPolicy(ctx.db, input.centerId ?? null);
  const now = new Date().toISOString();
  const overdue = sla.filter((l) => computeSla(l.status, l.lastTouchAt.toISOString(), now, policy.sla).level === "overdue").length;
  const total = byStatus.reduce((a, b) => a + b.n, 0);
  const enrolled = byStatus.find((b) => b.status === "enrolled")?.n ?? 0;
  return { days: input.days ?? 30, total, enrolled, conversionRate: total ? Math.round((enrolled / total) * 100) : 0, overdueOpen: overdue, byStatus, bySource, bySale: bySale.map((s) => ({ ...s, rate: s.n ? Math.round((s.enrolled / s.n) * 100) : 0 })) };
}

