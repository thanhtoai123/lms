/**
 * Vị trí công việc = bộ vai trò gắn vào ghế.
 *
 * - `positions`: khai vị trí + bộ vai trò + cây báo cáo (luồng duyệt).
 * - `staff_positions`: phân công người vào vị trí, có hiệu lực. Khi phân công,
 *   hệ thống cấp luôn vai trò vào `user_roles` với `source = position` và
 *   `valid_from` / `valid_to` đúng khoảng hiệu lực → **hết hạn là quyền tự tắt**.
 * - `staff_deployments`: điều động tác nghiệp chỉ mở phạm vi dữ liệu của cơ sở đó.
 */
import { and, eq, sql, asc, desc, isNull, or, gte, lte, type SQL } from "drizzle-orm";
import { staff, staffPositions, staffDeployments, positions, centers, users, userRoles } from "@satarobo/db";
import {
  validatePosition, validatePositionDef, addDays, ROLES, ROLE_LABEL_VI, POSITION_KIND_VI,
  type Role, type PositionKind,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { todayISO } from "./sessions";
import { bad, pre, notFound, forbidden, centersWith, scopeSql, reasonOf, dmy, notify, type Db } from "./hrShared";

const ASSIGNABLE_ROLES: readonly Role[] = ROLES.filter((r) => r !== "PARENT" && r !== "STUDENT");

/* ------------------------------------------------------------------ */
/* Danh mục vị trí                                                     */
/* ------------------------------------------------------------------ */

export async function listPositionDefs(ctx: ProtectedContext, input: { centerId?: string | null; includeInactive?: boolean }) {
  requirePermission(ctx, "staff:read", { centerId: input.centerId ?? null });
  const conds: SQL[] = [];
  if (input.centerId) conds.push(eq(positions.centerId, input.centerId));
  if (!input.includeInactive) conds.push(eq(positions.isActive, true));
  const rows = await ctx.db.select({ p: positions, centerCode: centers.code }).from(positions).leftJoin(centers, eq(centers.id, positions.centerId))
    .where(conds.length ? and(...conds) : sql`true`).orderBy(asc(centers.code), asc(positions.name));
  const today = todayISO();
  const holders = await ctx.db.select({ positionId: staffPositions.positionId, staffId: staffPositions.staffId, staffName: staff.fullName, kind: staffPositions.kind })
    .from(staffPositions).innerJoin(staff, eq(staff.id, staffPositions.staffId))
    .where(and(sql`${staffPositions.positionId} is not null`, lte(staffPositions.effectiveFrom, today), or(isNull(staffPositions.effectiveTo), gte(staffPositions.effectiveTo, today))!));
  return {
    canEdit: centersWith(ctx, "staff:update").length > 0,
    roles: ASSIGNABLE_ROLES.map((r) => ({ role: r, label: ROLE_LABEL_VI[r] })),
    items: rows.map((r) => ({
      ...r.p, centerCode: r.centerCode ?? "HO",
      reportsToName: rows.find((x) => x.p.id === r.p.reportsToId)?.p.name ?? null,
      roleLabels: (r.p.roles ?? []).map((x) => ROLE_LABEL_VI[x] ?? x),
      holders: holders.filter((h) => h.positionId === r.p.id).map((h) => ({ staffId: h.staffId, name: h.staffName, kind: h.kind })),
    })),
  };
}

export async function upsertPositionDef(ctx: ProtectedContext, input: { id?: string; centerId: string | null; name: string; department?: string | null; roles: Role[]; reportsToId?: string | null; isManager: boolean; isActive?: boolean; note?: string | null }) {
  if (input.centerId) requirePermission(ctx, "staff:update", { centerId: input.centerId });
  else if (!centersWith(ctx, "staff:update").includes(null)) throw forbidden("Vị trí thuộc Hội sở chỉ nhân sự Hội sở khai");
  const existing = await ctx.db.select({ id: positions.id, name: positions.name, centerId: positions.centerId, reportsToId: positions.reportsToId }).from(positions);
  const errs = validatePositionDef({ ...input, id: input.id ?? null }, existing);
  if (errs.length) throw bad(errs);
  const v = {
    centerId: input.centerId, name: input.name.trim(), department: input.department?.trim() || null,
    roles: [...new Set(input.roles)], reportsToId: input.reportsToId || null, isManager: input.isManager,
    isActive: input.isActive ?? true, note: input.note?.trim() || null,
  };
  if (input.id) {
    const before = await ctx.db.query.positions.findFirst({ where: eq(positions.id, input.id) });
    if (!before) throw notFound("Không tìm thấy vị trí");
    await ctx.db.transaction(async (txx) => {
      const tx = txx as unknown as Db;
      await tx.update(positions).set(v).where(eq(positions.id, before.id));
      // bộ vai trò đổi → cấp lại quyền cho người đang giữ vị trí
      if (JSON.stringify(before.roles ?? []) !== JSON.stringify(v.roles) || before.isActive !== v.isActive) await syncRolesOfPosition(tx, ctx, before.id, v.isActive ? v.roles : []);
      await writeAudit(tx, { actorId: ctx.user.id, action: "UPDATE", module: "hr", entity: "positions", entityId: before.id, before, after: v, ip: ctx.ip });
    });
    return { id: before.id };
  }
  const [row] = await ctx.db.insert(positions).values({ ...v, createdBy: ctx.user.id }).returning({ id: positions.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "hr", entity: "positions", entityId: row!.id, after: v, ip: ctx.ip });
  return { id: row!.id };
}

/** Cấp lại vai trò theo vị trí cho mọi phân công còn hiệu lực */
async function syncRolesOfPosition(tx: Db, ctx: ProtectedContext, positionId: string, roles: Role[]) {
  const today = todayISO();
  const rows = await tx.select({ sp: staffPositions, userId: staff.userId }).from(staffPositions).innerJoin(staff, eq(staff.id, staffPositions.staffId))
    .where(and(eq(staffPositions.positionId, positionId), or(isNull(staffPositions.effectiveTo), gte(staffPositions.effectiveTo, today))!));
  for (const r of rows) {
    await tx.delete(userRoles).where(and(eq(userRoles.staffPositionId, r.sp.id), eq(userRoles.source, "position")));
    if (!r.userId || !roles.length) continue;
    await tx.insert(userRoles).values(roles.map((role) => ({
      userId: r.userId!, role, centerId: r.sp.centerId, source: "position" as const,
      staffPositionId: r.sp.id, validFrom: r.sp.effectiveFrom, validTo: r.sp.effectiveTo, grantedBy: ctx.user.id,
    })));
  }
}

/* ------------------------------------------------------------------ */
/* Phân công người vào vị trí                                          */
/* ------------------------------------------------------------------ */

export async function assignPosition(ctx: ProtectedContext, input: { staffId: string; positionId?: string | null; centerId: string; title?: string | null; department: string; kind: PositionKind; effectiveFrom: string; effectiveTo?: string | null; decisionNo?: string | null; note?: string | null }) {
  const s = await ctx.db.query.staff.findFirst({ where: eq(staff.id, input.staffId) });
  if (!s) throw notFound("Không tìm thấy nhân sự");
  requirePermission(ctx, "staff:update", { centerId: s.centerId });
  requirePermission(ctx, "staff:update", { centerId: input.centerId });
  if (s.status === "resigned") throw pre("Nhân sự đã nghỉ việc");
  const def = input.positionId ? await ctx.db.query.positions.findFirst({ where: eq(positions.id, input.positionId) }) : null;
  if (input.positionId && !def) throw notFound("Không tìm thấy vị trí");
  if (def && !def.isActive) throw pre("Vị trí đã ngưng dùng");
  if (def && def.centerId && def.centerId !== input.centerId) throw bad(`Vị trí "${def.name}" thuộc đơn vị khác`);
  const title = (input.title?.trim() || def?.name || "").trim();
  if (!title) throw bad("Chọn vị trí hoặc nhập chức danh");
  const existing = await ctx.db.select().from(staffPositions).where(eq(staffPositions.staffId, s.id));
  const p = { kind: input.kind, centerId: input.centerId, title, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo || null };
  const errs = validatePosition(p, existing);
  if (errs.length) throw pre(errs);
  return ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    const [row] = await tx.insert(staffPositions).values({
      staffId: s.id, positionId: def?.id ?? null, ...p, department: input.department,
      decisionNo: input.decisionNo?.trim() || null, note: input.note?.trim() || null, createdBy: ctx.user.id,
    }).returning({ id: staffPositions.id });
    const roles = (def?.roles ?? []) as Role[];
    if (s.userId && roles.length) {
      await tx.insert(userRoles).values(roles.map((role) => ({
        userId: s.userId!, role, centerId: input.centerId, source: "position" as const,
        staffPositionId: row!.id, validFrom: p.effectiveFrom, validTo: p.effectiveTo, grantedBy: ctx.user.id,
      })));
    }
    if (input.kind === "primary" && input.effectiveFrom <= todayISO()) await tx.update(staff).set({ title, department: input.department, centerId: input.centerId }).where(eq(staff.id, s.id));
    await writeAudit(tx, { actorId: ctx.user.id, action: "CREATE", module: "hr", entity: "staff_positions", entityId: row!.id, after: { staff: s.code, position: def?.name ?? null, roles, decisionNo: input.decisionNo?.trim() || null, ...p }, ip: ctx.ip });
    if (s.userId && s.userId !== ctx.user.id) {
      await notify(tx, [s.userId], "Cập nhật vị trí công việc", `${title} (${POSITION_KIND_VI[input.kind].toLowerCase()}) từ ${dmy(p.effectiveFrom)}${roles.length ? ` · ${roles.length} vai trò` : ""}`, `/nhan-su/${s.id}`, 3, "hr.position_changed");
    }
    return { id: row!.id, roles };
  });
}

/* ------------------------------------------------------------------ */
/* Điều động tác nghiệp                                                */
/* ------------------------------------------------------------------ */

export async function listDeployments(ctx: ProtectedContext, input: { centerId?: string; includeEnded?: boolean }) {
  requirePermission(ctx, "staff:read", { centerId: input.centerId ?? null });
  const today = todayISO();
  const conds: SQL[] = [scopeSql(ctx, "staff:read", staffDeployments.centerId as unknown as typeof staff.centerId)];
  if (input.centerId) conds.push(eq(staffDeployments.centerId, input.centerId));
  if (!input.includeEnded) conds.push(lte(staffDeployments.effectiveFrom, today), or(isNull(staffDeployments.effectiveTo), gte(staffDeployments.effectiveTo, today))!);
  const rows = await ctx.db.select({ d: staffDeployments, staffCode: staff.code, staffName: staff.fullName, staffTitle: staff.title, homeCenter: sql<string>`(select code from centers c where c.id = ${staff.centerId})`, centerCode: centers.code })
    .from(staffDeployments).innerJoin(staff, eq(staff.id, staffDeployments.staffId)).innerJoin(centers, eq(centers.id, staffDeployments.centerId))
    .where(and(...conds)).orderBy(desc(staffDeployments.effectiveFrom)).limit(500);
  return {
    canEdit: centersWith(ctx, "staff:update").length > 0,
    items: rows.map((r) => ({ ...r.d, staffCode: r.staffCode, staffName: r.staffName, staffTitle: r.staffTitle, homeCenter: r.homeCenter, centerCode: r.centerCode, active: r.d.effectiveFrom <= today && (!r.d.effectiveTo || r.d.effectiveTo >= today) })),
  };
}

export async function addDeployment(ctx: ProtectedContext, input: { staffId: string; centerId: string; effectiveFrom: string; effectiveTo?: string | null; reason: string; decisionNo?: string | null; note?: string | null }) {
  const s = await ctx.db.query.staff.findFirst({ where: eq(staff.id, input.staffId) });
  if (!s) throw notFound("Không tìm thấy nhân sự");
  requirePermission(ctx, "staff:update", { centerId: s.centerId });
  requirePermission(ctx, "staff:update", { centerId: input.centerId });
  if (s.status === "resigned") throw pre("Nhân sự đã nghỉ việc");
  if (s.centerId === input.centerId) throw bad("Điều động tới chính cơ sở biên chế — không cần khai");
  const reason = reasonOf(input.reason);
  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) throw bad("Ngày kết thúc phải sau ngày bắt đầu");
  if (input.effectiveTo && input.effectiveTo > addDays(input.effectiveFrom, 365)) throw bad("Điều động tối đa 12 tháng — gia hạn bằng bản ghi mới");
  const dup = await ctx.db.select({ id: staffDeployments.id }).from(staffDeployments)
    .where(and(eq(staffDeployments.staffId, s.id), eq(staffDeployments.centerId, input.centerId),
      lte(staffDeployments.effectiveFrom, input.effectiveTo ?? "9999-12-31"), or(isNull(staffDeployments.effectiveTo), gte(staffDeployments.effectiveTo, input.effectiveFrom))!)).limit(1);
  if (dup.length) throw pre("Đã có điều động tới cơ sở này trong khoảng thời gian trên");
  const [row] = await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    const r = await tx.insert(staffDeployments).values({
      staffId: s.id, centerId: input.centerId, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo || null, reason,
      decisionNo: input.decisionNo?.trim() || null, note: input.note?.trim() || null, createdBy: ctx.user.id,
    }).returning({ id: staffDeployments.id });
    await writeAudit(tx, { actorId: ctx.user.id, action: "CREATE", module: "hr", entity: "staff_deployments", entityId: r[0]!.id, after: { staff: s.code, centerId: input.centerId, from: input.effectiveFrom, to: input.effectiveTo ?? null, decisionNo: input.decisionNo?.trim() || null }, reason, ip: ctx.ip });
    return r;
  });
  if (s.userId) await notify(ctx.db, [s.userId], "Điều động tác nghiệp", `Làm việc tại cơ sở khác từ ${dmy(input.effectiveFrom)}${input.effectiveTo ? ` đến ${dmy(input.effectiveTo)}` : ""}`, "/cham-cong/lich-ca", 3, "hr.position_changed");
  return { id: row!.id };
}

export async function endDeployment(ctx: ProtectedContext, input: { id: string; effectiveTo: string; reason: string }) {
  const d = await ctx.db.query.staffDeployments.findFirst({ where: eq(staffDeployments.id, input.id) });
  if (!d) throw notFound("Không tìm thấy điều động");
  requirePermission(ctx, "staff:update", { centerId: d.centerId });
  const reason = reasonOf(input.reason);
  if (input.effectiveTo < d.effectiveFrom) throw bad("Ngày kết thúc trước ngày bắt đầu");
  await ctx.db.update(staffDeployments).set({ effectiveTo: input.effectiveTo, note: [d.note, reason].filter(Boolean).join(" · ") }).where(eq(staffDeployments.id, d.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "hr", entity: "staff_deployments", entityId: d.id, before: { effectiveTo: d.effectiveTo }, after: { effectiveTo: input.effectiveTo }, reason, ip: ctx.ip });
  return { ok: true };
}

/** Vai trò đang có của một người (để trang vị trí hiển thị nguồn quyền) */
export async function rolesOfStaff(ctx: ProtectedContext, staffId: string) {
  const s = await ctx.db.query.staff.findFirst({ where: eq(staff.id, staffId) });
  if (!s) throw notFound("Không tìm thấy nhân sự");
  requirePermission(ctx, "staff:read", { centerId: s.centerId });
  if (!s.userId) return { userId: null, roles: [] };
  const today = todayISO();
  const rows = await ctx.db.select({ r: userRoles, centerCode: centers.code }).from(userRoles).leftJoin(centers, eq(centers.id, userRoles.centerId)).where(eq(userRoles.userId, s.userId));
  return {
    userId: s.userId,
    roles: rows.map((x) => ({
      role: x.r.role, label: ROLE_LABEL_VI[x.r.role], centerCode: x.centerCode ?? "Toàn hệ thống", source: x.r.source,
      validFrom: x.r.validFrom, validTo: x.r.validTo,
      active: (!x.r.validFrom || x.r.validFrom <= today) && (!x.r.validTo || x.r.validTo >= today),
    })),
  };
}

/** Người có thể chọn để phân công (trong phạm vi quyền) */
export async function assignableStaff(ctx: ProtectedContext, input: { centerId?: string }) {
  requirePermission(ctx, "staff:read", { centerId: input.centerId ?? null });
  const conds: SQL[] = [scopeSql(ctx, "staff:read", staff.centerId), sql`${staff.status} <> 'resigned'`];
  if (input.centerId) conds.push(eq(staff.centerId, input.centerId));
  const rows = await ctx.db.select({ id: staff.id, code: staff.code, fullName: staff.fullName, title: staff.title, centerId: staff.centerId, hasAccount: sql<boolean>`${staff.userId} is not null` })
    .from(staff).where(and(...conds)).orderBy(asc(staff.code)).limit(500);
  return rows;
}

export { ASSIGNABLE_ROLES };
