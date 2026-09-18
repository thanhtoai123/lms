import { and, eq, inArray, sql, desc, asc, isNull, or, gte, lte, ilike, ne, type SQL } from "drizzle-orm";
import {
  staff, staffPrivate, staffPositions, workShifts, shiftTemplates, shiftAssignments, attendancePunches,
  timesheetOverrides, timesheetFlagReviews, timesheetPeriods, staffRequests, rosterImports,
  centers, users, userRoles, teachers, holidays,
} from "@satarobo/db";
import {
  addDays, weekdayOf, activeOn, staffTransition, staffCode, validateShiftDef, plannedMinutesOf,
  summarizeDays, periodRange, datesBetween, lockCheck, standardUnits, maskIdNumber, isReviewableFlag,
  SHIFT_CATALOGUE, TIMESHEET_FLAGS, SHIFT_KIND_VI,
  type StaffStatus, type EmploymentType, type PositionKind, type ShiftKind, type Workplace, type ShiftSegment,
  type TimesheetFlag, type FlagReviewAction, type CellOrigin,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { todayISO } from "./sessions";
import {
  bad, pre, notFound, forbidden, rule, can, isSA, centersWith, scopeSql, reasonOf, dmy, notify, myStaff,
  periodLocked, assertOpen, buildDays, leaveBalance, vnStart, vnEnd,
  type Db,
} from "./hrShared";

export { myStaff, buildDays } from "./hrShared";

const BACKDATE_ROSTER = 31;

/* ------------------------------------------------------------------ */
/* Hồ sơ nhân sự                                                       */
/* ------------------------------------------------------------------ */

export async function listStaff(ctx: ProtectedContext, input: { q?: string; centerId?: string; status?: StaffStatus; department?: string }) {
  requirePermission(ctx, "staff:read", { centerId: input.centerId ?? null });
  const conds: SQL[] = [scopeSql(ctx, "staff:read", staff.centerId)];
  if (input.centerId) conds.push(eq(staff.centerId, input.centerId));
  if (input.status) conds.push(eq(staff.status, input.status));
  else conds.push(ne(staff.status, "resigned"));
  if (input.department) conds.push(eq(staff.department, input.department));
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`;
    conds.push(or(ilike(staff.fullName, q), ilike(staff.code, q), ilike(staff.email, q), ilike(staff.phone, q), ilike(staff.title, q))!);
  }
  const rows = await ctx.db.select({ s: staff, centerCode: centers.code, accountEmail: users.email, teacherCode: teachers.code })
    .from(staff).innerJoin(centers, eq(centers.id, staff.centerId)).leftJoin(users, eq(users.id, staff.userId)).leftJoin(teachers, eq(teachers.id, staff.teacherId))
    .where(and(...conds)).orderBy(asc(staff.code)).limit(500);
  const ids = rows.map((r) => r.s.id);
  const today = todayISO();
  const pos = ids.length ? await ctx.db.select({ p: staffPositions, centerCode: centers.code }).from(staffPositions).innerJoin(centers, eq(centers.id, staffPositions.centerId)).where(inArray(staffPositions.staffId, ids)) : [];
  const [counts] = await ctx.db.select({
    probation: sql<number>`count(*) filter (where ${staff.status} = 'probation')::int`,
    active: sql<number>`count(*) filter (where ${staff.status} = 'active')::int`,
    on_leave: sql<number>`count(*) filter (where ${staff.status} = 'on_leave')::int`,
    resigned: sql<number>`count(*) filter (where ${staff.status} = 'resigned')::int`,
  }).from(staff).where(scopeSql(ctx, "staff:read", staff.centerId));
  return {
    counts,
    canCreate: centersWith(ctx, "staff:create").length > 0,
    items: rows.map((r) => ({
      ...r.s, centerCode: r.centerCode, accountEmail: r.accountEmail, teacherCode: r.teacherCode,
      positions: activeOn(pos.filter((p) => p.p.staffId === r.s.id).map((p) => ({ ...p.p, centerCode: p.centerCode })), today),
    })),
  };
}

export async function getStaff(ctx: ProtectedContext, id: string) {
  const s = await ctx.db.query.staff.findFirst({ where: eq(staff.id, id) });
  if (!s) throw notFound("Không tìm thấy nhân sự");
  const own = s.userId === ctx.user.id;
  if (!own) requirePermission(ctx, "staff:read", { centerId: s.centerId });
  const salary = can(ctx, "staff:salary", s.centerId);
  const [center, account, teacher, priv, pos] = await Promise.all([
    ctx.db.query.centers.findFirst({ where: eq(centers.id, s.centerId), columns: { id: true, code: true, name: true } }),
    s.userId ? ctx.db.query.users.findFirst({ where: eq(users.id, s.userId), columns: { id: true, email: true, fullName: true, isActive: true } }) : null,
    s.teacherId ? ctx.db.query.teachers.findFirst({ where: eq(teachers.id, s.teacherId), columns: { id: true, code: true, fullName: true } }) : null,
    ctx.db.query.staffPrivate.findFirst({ where: eq(staffPrivate.staffId, s.id) }),
    ctx.db.select({ p: staffPositions, centerCode: centers.code }).from(staffPositions).innerJoin(centers, eq(centers.id, staffPositions.centerId)).where(eq(staffPositions.staffId, s.id)).orderBy(desc(staffPositions.effectiveFrom)),
  ]);
  const today = todayISO();
  const period = today.slice(0, 7);
  const { from, to } = periodRange(period);
  const days = (await buildDays(ctx.db, [{ id: s.id, centerId: s.centerId }], from, to)).get(s.id) ?? [];
  const reqs = await ctx.db.select().from(staffRequests).where(eq(staffRequests.staffId, s.id)).orderBy(desc(staffRequests.createdAt)).limit(20);
  return {
    ...s, center, account, teacher,
    private: priv ? {
      idNumber: maskIdNumber(priv.idNumber), hasIdNumber: !!priv.idNumber, birthDate: salary ? priv.birthDate : null,
      taxCode: salary ? priv.taxCode : null, insuranceNo: salary ? priv.insuranceNo : null, bankName: salary ? priv.bankName : null,
      bankAccount: priv.bankAccount ? (salary ? priv.bankAccount : `•••${priv.bankAccount.slice(-3)}`) : null,
      baseSalary: salary ? priv.baseSalary : null, allowance: salary ? priv.allowance : null, address: salary ? priv.address : null,
    } : null,
    positions: pos.map((p) => ({ ...p.p, centerCode: p.centerCode, active: p.p.effectiveFrom <= today && (!p.p.effectiveTo || p.p.effectiveTo >= today) })),
    leave: await leaveBalance(ctx.db, s, Number(today.slice(0, 4))),
    month: { period, summary: summarizeDays(days), days },
    requests: reqs,
    perms: { update: can(ctx, "staff:update", s.centerId), salary, own },
  };
}

export interface StaffInput {
  id?: string; fullName: string; email?: string | null; phone?: string | null; centerId: string; department: string; title: string;
  employmentType: EmploymentType; hiredAt?: string | null; annualLeaveDays: number; notes?: string | null; timesheetExempt?: boolean;
  userId?: string | null; teacherId?: string | null;
  private?: { idNumber?: string | null; birthDate?: string | null; address?: string | null; taxCode?: string | null; insuranceNo?: string | null; bankName?: string | null; bankAccount?: string | null; baseSalary?: number | null; allowance?: number | null } | null;
}

export async function upsertStaff(ctx: ProtectedContext, input: StaffInput) {
  const before = input.id ? await ctx.db.query.staff.findFirst({ where: eq(staff.id, input.id) }) : undefined;
  if (input.id && !before) throw notFound("Không tìm thấy nhân sự");
  requirePermission(ctx, before ? "staff:update" : "staff:create", { centerId: input.centerId });
  if (before && before.centerId !== input.centerId) requirePermission(ctx, "staff:update", { centerId: before.centerId });
  if (before?.status === "resigned") throw pre("Hồ sơ đã nghỉ việc — không sửa");
  if (input.private && !can(ctx, "staff:salary", input.centerId)) throw forbidden("Không có quyền sửa thông tin lương / giấy tờ");
  const email = input.email?.trim().toLowerCase() || null;
  if (input.userId) {
    const dup = await ctx.db.query.staff.findFirst({ where: and(eq(staff.userId, input.userId), input.id ? ne(staff.id, input.id) : sql`true`) });
    if (dup) throw pre(`Tài khoản đã gắn với hồ sơ ${dup.code}`);
  }
  if (input.teacherId) {
    const dup = await ctx.db.query.staff.findFirst({ where: and(eq(staff.teacherId, input.teacherId), input.id ? ne(staff.id, input.id) : sql`true`) });
    if (dup) throw pre(`Giáo viên đã gắn với hồ sơ ${dup.code}`);
  }
  if (email) {
    const dup = await ctx.db.query.staff.findFirst({ where: and(sql`lower(${staff.email}) = ${email}`, ne(staff.status, "resigned"), input.id ? ne(staff.id, input.id) : sql`true`) });
    if (dup) throw pre(`Email đã dùng cho hồ sơ ${dup.code}`);
  }
  const values = {
    fullName: input.fullName.trim(), email, phone: input.phone?.replace(/[^\d+]/g, "") || null, centerId: input.centerId, department: input.department, title: input.title.trim(),
    employmentType: input.employmentType, hiredAt: input.hiredAt || null, annualLeaveDays: input.annualLeaveDays, notes: input.notes?.trim() || null,
    timesheetExempt: input.timesheetExempt ?? before?.timesheetExempt ?? false,
    userId: input.userId ?? null, teacherId: input.teacherId ?? null,
  };
  return ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    let id: string;
    let code: string;
    if (before) {
      await tx.update(staff).set(values).where(eq(staff.id, before.id));
      id = before.id;
      code = before.code;
      await writeAudit(tx, { actorId: ctx.user.id, action: "UPDATE", module: "hr", entity: "staff", entityId: id, before: { ...before, notes: undefined }, after: values, ip: ctx.ip });
    } else {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('staff-code'))`);
      const [m] = await tx.select({ n: sql<number>`coalesce(max(substring(${staff.code} from 3)::int), 0)::int` }).from(staff).where(sql`${staff.code} ~ '^NV[0-9]+$'`);
      code = staffCode((m?.n ?? 0) + 1);
      const [row] = await tx.insert(staff).values({ ...values, code, status: "probation", createdBy: ctx.user.id }).returning({ id: staff.id });
      id = row!.id;
      await tx.insert(staffPositions).values({ staffId: id, centerId: input.centerId, title: values.title, department: input.department, kind: "primary", effectiveFrom: input.hiredAt || todayISO(), createdBy: ctx.user.id });
      await writeAudit(tx, { actorId: ctx.user.id, action: "CREATE", module: "hr", entity: "staff", entityId: id, after: { ...values, code }, ip: ctx.ip });
    }
    if (input.private) {
      const p = input.private;
      const pv = {
        idNumber: p.idNumber?.replace(/\s/g, "") || null, birthDate: p.birthDate || null, address: p.address?.trim() || null, taxCode: p.taxCode?.trim() || null,
        insuranceNo: p.insuranceNo?.trim() || null, bankName: p.bankName?.trim() || null, bankAccount: p.bankAccount?.replace(/\s/g, "") || null,
        baseSalary: p.baseSalary ?? null, allowance: p.allowance ?? null, updatedBy: ctx.user.id, updatedAt: new Date(),
      };
      const old = await tx.query.staffPrivate.findFirst({ where: eq(staffPrivate.staffId, id) });
      await tx.insert(staffPrivate).values({ staffId: id, ...pv }).onConflictDoUpdate({ target: staffPrivate.staffId, set: pv });
      await writeAudit(tx, {
        actorId: ctx.user.id, action: "UPDATE", module: "hr", entity: "staff_private", entityId: id,
        before: old ? { baseSalary: old.baseSalary, allowance: old.allowance, idNumber: maskIdNumber(old.idNumber) } : null,
        after: { baseSalary: pv.baseSalary, allowance: pv.allowance, idNumber: maskIdNumber(pv.idNumber) }, ip: ctx.ip,
      });
    }
    return { id, code };
  });
}

export async function setStaffStatus(ctx: ProtectedContext, input: { id: string; status: StaffStatus; reason?: string | null; effectiveDate?: string | null }) {
  const s = await ctx.db.query.staff.findFirst({ where: eq(staff.id, input.id) });
  if (!s) throw notFound("Không tìm thấy nhân sự");
  requirePermission(ctx, "staff:update", { centerId: s.centerId });
  const err = staffTransition(s.status, input.status);
  if (err) throw pre(err);
  if (s.userId === ctx.user.id && !isSA(ctx)) throw pre("Không tự đổi trạng thái hồ sơ của mình");
  const needReason = input.status === "resigned" || input.status === "on_leave";
  const reason = needReason ? reasonOf(input.reason) : input.reason?.trim() || null;
  const today = todayISO();
  const eff = input.effectiveDate || today;
  const warnings: string[] = [];
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.update(staff).set({ status: input.status, statusReason: reason, ...(input.status === "resigned" ? { leftAt: eff } : {}) }).where(eq(staff.id, s.id));
    if (input.status === "resigned") {
      const ended = await tx.update(staffPositions).set({ effectiveTo: eff, endReason: "Nghỉ việc" })
        .where(and(eq(staffPositions.staffId, s.id), or(isNull(staffPositions.effectiveTo), gte(staffPositions.effectiveTo, eff))!)).returning({ id: staffPositions.id });
      if (ended.length && s.userId) {
        // quyền theo vị trí hết hiệu lực cùng ngày nghỉ việc
        await tx.update(userRoles).set({ validTo: eff }).where(and(eq(userRoles.userId, s.userId), eq(userRoles.source, "position"), inArray(userRoles.staffPositionId, ended.map((x) => x.id))));
      }
      await tx.delete(shiftTemplates).where(eq(shiftTemplates.staffId, s.id));
      const del = await tx.delete(shiftAssignments).where(and(eq(shiftAssignments.staffId, s.id), sql`${shiftAssignments.date} > ${eff}`)).returning({ id: shiftAssignments.id });
      if (del.length) warnings.push(`Đã gỡ ${del.length} ca sau ngày nghỉ`);
      const pend = await tx.update(staffRequests).set({ status: "cancelled", decisionNote: "Nhân sự nghỉ việc", decidedBy: ctx.user.id, decidedAt: new Date() })
        .where(and(eq(staffRequests.staffId, s.id), eq(staffRequests.status, "pending"))).returning({ id: staffRequests.id });
      if (pend.length) warnings.push(`Đã huỷ ${pend.length} đơn chờ duyệt`);
      if (s.userId) {
        const u = await tx.query.users.findFirst({ where: eq(users.id, s.userId), columns: { isActive: true } });
        if (u?.isActive) warnings.push("Tài khoản đăng nhập vẫn đang mở — khoá ở Tài khoản người dùng");
      }
    }
    await writeAudit(tx, { actorId: ctx.user.id, action: "TRANSITION", module: "hr", entity: "staff", entityId: s.id, before: { status: s.status }, after: { status: input.status, effectiveDate: eff }, reason, ip: ctx.ip });
  });
  return { ok: true, warnings };
}

export async function revealStaffPrivate(ctx: ProtectedContext, input: { id: string; reason: string }) {
  const s = await ctx.db.query.staff.findFirst({ where: eq(staff.id, input.id) });
  if (!s) throw notFound("Không tìm thấy nhân sự");
  requirePermission(ctx, "staff:salary", { centerId: s.centerId });
  const reason = reasonOf(input.reason);
  const p = await ctx.db.query.staffPrivate.findFirst({ where: eq(staffPrivate.staffId, s.id) });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "PII_REVEAL", module: "hr", entity: "staff_private", entityId: s.id, reason, after: { fields: ["idNumber", "bankAccount"] }, ip: ctx.ip });
  return { idNumber: p?.idNumber ?? null, bankAccount: p?.bankAccount ?? null };
}

/** Gợi ý tài khoản / giáo viên chưa gắn hồ sơ */
export async function linkOptions(ctx: ProtectedContext, input: { centerId: string }) {
  requirePermission(ctx, "staff:create", { centerId: input.centerId });
  const accounts = await ctx.db.select({ id: users.id, email: users.email, fullName: users.fullName }).from(users)
    .where(and(eq(users.isActive, true), sql`not exists (select 1 from ${staff} s where s.user_id = ${users.id})`,
      sql`exists (select 1 from ${userRoles} r where r.user_id = ${users.id} and r.role not in ('PARENT','STUDENT'))`)).orderBy(asc(users.fullName)).limit(200);
  const tchs = await ctx.db.select({ id: teachers.id, code: teachers.code, fullName: teachers.fullName, userId: teachers.userId }).from(teachers)
    .where(and(sql`not exists (select 1 from ${staff} s where s.teacher_id = ${teachers.id})`, or(eq(teachers.centerId, input.centerId), isNull(teachers.centerId))!)).orderBy(asc(teachers.code));
  return { accounts, teachers: tchs };
}

/* ------------------------------------------------------------------ */
/* Phân công vị trí (staff_positions)                                  */
/* ------------------------------------------------------------------ */

export async function listPositions(ctx: ProtectedContext, input: { date?: string; centerId?: string; kind?: PositionKind; includeEnded?: boolean }) {
  requirePermission(ctx, "staff:read", { centerId: input.centerId ?? null });
  const date = input.date ?? todayISO();
  const conds: SQL[] = [scopeSql(ctx, "staff:read", staffPositions.centerId as unknown as typeof staff.centerId)];
  if (input.centerId) conds.push(eq(staffPositions.centerId, input.centerId));
  if (input.kind) conds.push(eq(staffPositions.kind, input.kind));
  if (!input.includeEnded) conds.push(lte(staffPositions.effectiveFrom, date), or(isNull(staffPositions.effectiveTo), gte(staffPositions.effectiveTo, date))!);
  const rows = await ctx.db.select({ p: staffPositions, staffCode: staff.code, staffName: staff.fullName, staffStatus: staff.status, centerCode: centers.code })
    .from(staffPositions).innerJoin(staff, eq(staff.id, staffPositions.staffId)).innerJoin(centers, eq(centers.id, staffPositions.centerId))
    .where(and(...conds)).orderBy(asc(centers.code), asc(staffPositions.kind), asc(staff.code)).limit(1000);
  const soon = addDays(date, 14);
  return {
    date,
    canEdit: centersWith(ctx, "staff:update").length > 0,
    items: rows.map((r) => ({ ...r.p, staffCode: r.staffCode, staffName: r.staffName, staffStatus: r.staffStatus, centerCode: r.centerCode, endingSoon: !!r.p.effectiveTo && r.p.effectiveTo >= date && r.p.effectiveTo <= soon })),
  };
}

export async function endPosition(ctx: ProtectedContext, input: { id: string; effectiveTo: string; reason: string }) {
  const p = await ctx.db.query.staffPositions.findFirst({ where: eq(staffPositions.id, input.id) });
  if (!p) throw notFound("Không tìm thấy vị trí");
  requirePermission(ctx, "staff:update", { centerId: p.centerId });
  const reason = reasonOf(input.reason);
  if (input.effectiveTo < p.effectiveFrom) throw bad("Ngày kết thúc trước ngày bắt đầu");
  if (p.effectiveTo && p.effectiveTo < todayISO()) throw pre("Vị trí đã kết thúc");
  const s = await ctx.db.query.staff.findFirst({ where: eq(staff.id, p.staffId) });
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.update(staffPositions).set({ effectiveTo: input.effectiveTo, endReason: reason }).where(eq(staffPositions.id, p.id));
    if (s?.userId) await tx.update(userRoles).set({ validTo: input.effectiveTo }).where(and(eq(userRoles.staffPositionId, p.id), eq(userRoles.source, "position")));
    await writeAudit(tx, { actorId: ctx.user.id, action: "UPDATE", module: "hr", entity: "staff_positions", entityId: p.id, before: { effectiveTo: p.effectiveTo }, after: { effectiveTo: input.effectiveTo }, reason, ip: ctx.ip });
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Danh mục mã ca                                                      */
/* ------------------------------------------------------------------ */

export async function listShifts(ctx: ProtectedContext, input: { centerId?: string; includeInactive?: boolean }) {
  const conds: SQL[] = [];
  if (input.centerId) conds.push(or(isNull(workShifts.centerId), eq(workShifts.centerId, input.centerId))!);
  if (!input.includeInactive) conds.push(eq(workShifts.isActive, true));
  const rows = await ctx.db.select({ s: workShifts, centerCode: centers.code }).from(workShifts).leftJoin(centers, eq(centers.id, workShifts.centerId))
    .where(conds.length ? and(...conds) : sql`true`).orderBy(asc(workShifts.sortOrder), asc(workShifts.code));
  const usage = await ctx.db.select({ shiftId: shiftAssignments.shiftId, n: sql<number>`count(*)::int` }).from(shiftAssignments).groupBy(shiftAssignments.shiftId);
  return rows.map((r) => ({
    ...r.s, centerCode: r.centerCode, kindLabel: SHIFT_KIND_VI[r.s.kind],
    clock: (r.s.segments ?? []).map((x) => `${x.from}–${x.to}`).join(", "),
    usedCells: usage.find((u) => u.shiftId === r.s.id)?.n ?? 0,
    canEdit: r.s.centerId ? can(ctx, "timesheet:configure", r.s.centerId) : centersWith(ctx, "timesheet:configure").includes(null),
  }));
}

export interface ShiftInput {
  id?: string; centerId: string | null; code: string; name: string; kind: ShiftKind; units: number;
  segments: ShiftSegment[]; workplace: Workplace; workplaceCenterId?: string | null; punchRequired: boolean; isActive: boolean; sortOrder?: number;
}

export async function upsertShift(ctx: ProtectedContext, input: ShiftInput) {
  if (input.centerId) requirePermission(ctx, "timesheet:configure", { centerId: input.centerId });
  else if (!centersWith(ctx, "timesheet:configure").includes(null)) throw forbidden("Mã ca dùng chung chỉ Hội sở sửa — hãy chọn cơ sở");
  const errs = validateShiftDef(input);
  if (errs.length) throw bad(errs);
  const v = {
    centerId: input.centerId, code: input.code.trim().toUpperCase(), name: input.name.trim(), kind: input.kind, units: input.units,
    segments: input.segments, plannedMinutes: plannedMinutesOf(input.segments), workplace: input.workplace,
    workplaceCenterId: input.workplace === "fixed_center" ? input.workplaceCenterId ?? null : null,
    punchRequired: input.punchRequired, isActive: input.isActive, sortOrder: input.sortOrder ?? 0,
  };
  const dup = await ctx.db.query.workShifts.findFirst({ where: and(eq(workShifts.code, v.code), input.centerId ? eq(workShifts.centerId, input.centerId) : isNull(workShifts.centerId), input.id ? ne(workShifts.id, input.id) : sql`true`) });
  if (dup) throw pre(`Mã ca ${v.code} đã có`);
  if (input.id) {
    const before = await ctx.db.query.workShifts.findFirst({ where: eq(workShifts.id, input.id) });
    if (!before) throw notFound("Không tìm thấy mã ca");
    if (before.centerId !== input.centerId) throw bad("Không đổi phạm vi của mã ca");
    const timeChanged = JSON.stringify(before.segments) !== JSON.stringify(v.segments) || before.units !== v.units || before.kind !== v.kind;
    if (timeChanged) {
      const [u] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(shiftAssignments).where(and(eq(shiftAssignments.shiftId, before.id), lte(shiftAssignments.date, todayISO())));
      if ((u?.n ?? 0) > 0) throw pre("Mã ca đã dùng cho ngày đã qua — sửa một mã không đổi lịch đã xếp; hãy tạo mã mới rồi xếp lại");
    }
    await ctx.db.update(workShifts).set(v).where(eq(workShifts.id, before.id));
    await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "hr", entity: "work_shifts", entityId: before.id, before, after: v, ip: ctx.ip });
    return { id: before.id };
  }
  const [row] = await ctx.db.insert(workShifts).values(v).returning({ id: workShifts.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "hr", entity: "work_shifts", entityId: row!.id, after: v, ip: ctx.ip });
  return { id: row!.id };
}

/** Nạp danh mục mã ca gốc (dùng chung) — mã đã có thì giữ nguyên */
export async function seedShiftCatalogue(ctx: ProtectedContext) {
  if (!centersWith(ctx, "timesheet:configure").includes(null) && !isSA(ctx)) throw forbidden("Chỉ nhân sự Hội sở nạp danh mục mã ca dùng chung");
  const existing = await ctx.db.select({ code: workShifts.code }).from(workShifts).where(isNull(workShifts.centerId));
  const have = new Set(existing.map((x) => x.code));
  const cs = await ctx.db.select({ id: centers.id, code: centers.code }).from(centers);
  const rows = SHIFT_CATALOGUE.filter((s) => !have.has(s.code)).map((s, i) => ({
    centerId: null, code: s.code, name: s.name, kind: s.kind, units: s.units, segments: s.segments,
    plannedMinutes: plannedMinutesOf(s.segments), workplace: s.workplace,
    workplaceCenterId: s.fixedCenterCode ? cs.find((c) => c.code === s.fixedCenterCode)?.id ?? null : null,
    punchRequired: s.punchRequired, sortOrder: i, isActive: true,
  }));
  if (rows.length) await ctx.db.insert(workShifts).values(rows);
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "hr", entity: "work_shifts", entityId: null, after: { seeded: rows.map((r) => r.code) }, ip: ctx.ip });
  return { created: rows.length, skipped: SHIFT_CATALOGUE.length - rows.length };
}

/* ------------------------------------------------------------------ */
/* Lưới phân ca tháng + khung ca tuần + import                          */
/* ------------------------------------------------------------------ */

function rosterPeople(db: Db, centerId: string, from: string) {
  return db.select({ id: staff.id, code: staff.code, fullName: staff.fullName, title: staff.title, status: staff.status, centerId: staff.centerId, leftAt: staff.leftAt, exempt: staff.timesheetExempt })
    .from(staff).where(and(eq(staff.centerId, centerId), or(ne(staff.status, "resigned"), gte(staff.leftAt, from))!)).orderBy(asc(staff.code));
}

/** Lưới phân ca theo tháng (mặc định) hoặc theo tuần */
export async function roster(ctx: ProtectedContext, input: { centerId: string; period?: string; weekStart?: string }) {
  requirePermission(ctx, "timesheet:read", { centerId: input.centerId });
  let from: string;
  let to: string;
  if (input.weekStart) {
    let ws = input.weekStart;
    while (weekdayOf(ws) !== 1) ws = addDays(ws, -1);
    from = ws;
    to = addDays(ws, 6);
  } else {
    const p = rule(() => periodRange(input.period ?? todayISO().slice(0, 7)));
    from = p.from;
    to = p.to;
  }
  const people = await rosterPeople(ctx.db, input.centerId, from);
  const days = await buildDays(ctx.db, people, from, to);
  const center = await ctx.db.query.centers.findFirst({ where: eq(centers.id, input.centerId) });
  const locked = await periodLocked(ctx.db, input.centerId, datesBetween(from, to));
  const hols = await ctx.db.select().from(holidays).where(and(gte(holidays.date, from), lte(holidays.date, to)));
  const tpl = await ctx.db.select().from(shiftTemplates).where(eq(shiftTemplates.centerId, input.centerId));
  const lastImport = await ctx.db.select({ i: rosterImports, byName: users.fullName }).from(rosterImports).leftJoin(users, eq(users.id, rosterImports.createdBy))
    .where(eq(rosterImports.centerId, input.centerId)).orderBy(desc(rosterImports.createdAt)).limit(3);
  const rows = people.map((p) => {
    const cells = days.get(p.id) ?? [];
    return {
      id: p.id, code: p.code, fullName: p.fullName, title: p.title, status: p.status, exempt: p.exempt,
      units: cells.reduce((n, c) => n + (c.shift && c.shift.units > 0 ? c.shift.units : 0), 0),
      offDays: cells.filter((c) => c.shift && c.shift.units === 0).length,
      days: cells.map((d) => ({ date: d.date, shift: d.shift, origin: d.origin, status: d.status, requests: d.requests, flags: d.openFlags })),
    };
  });
  return {
    from, to, period: from.slice(0, 7), dates: datesBetween(from, to), center, lockedPeriod: locked,
    holidays: hols.filter((h) => h.centerId === null || h.centerId === input.centerId).map((h) => ({ date: h.date, name: h.name })),
    canEdit: can(ctx, "timesheet:update", input.centerId), canConfigure: can(ctx, "timesheet:configure", input.centerId),
    shifts: await listShifts(ctx, { centerId: input.centerId }),
    templates: tpl.map((t) => ({ staffId: t.staffId, weekday: t.weekday, shiftId: t.shiftId })),
    imports: lastImport.map((x) => ({ ...x.i, byName: x.byName })),
    filled: rows.reduce((n, r) => n + r.days.filter((d) => d.shift).length, 0),
    manualCells: rows.reduce((n, r) => n + r.days.filter((d) => d.origin === "manual").length, 0),
    requestCells: rows.reduce((n, r) => n + r.days.filter((d) => d.origin === "request").length, 0),
    rows,
  };
}

/** Đặt / xoá ô lưới (sửa tay — ô này sẽ không bị sinh lại hay import đè) */
export async function assignShifts(ctx: ProtectedContext, input: { centerId: string; entries: { staffId: string; date: string; shiftId: string | null }[]; origin?: CellOrigin; note?: string | null }) {
  requirePermission(ctx, "timesheet:update", { centerId: input.centerId });
  if (!input.entries.length) return { set: 0, cleared: 0 };
  const today = todayISO();
  const origin: CellOrigin = input.origin ?? "manual";
  const ids = [...new Set(input.entries.map((e) => e.staffId))];
  const people = await ctx.db.select().from(staff).where(inArray(staff.id, ids));
  const shiftIds = [...new Set(input.entries.map((e) => e.shiftId).filter((x): x is string => !!x))];
  const shs = shiftIds.length ? await ctx.db.select().from(workShifts).where(inArray(workShifts.id, shiftIds)) : [];
  for (const e of input.entries) {
    const p = people.find((x) => x.id === e.staffId);
    if (!p || p.centerId !== input.centerId) throw bad("Nhân sự không thuộc cơ sở này");
    if (p.status === "resigned" && (!p.leftAt || e.date > p.leftAt)) throw pre(`${p.fullName} đã nghỉ việc`);
    if (e.shiftId) {
      const sh = shs.find((x) => x.id === e.shiftId);
      if (!sh || !sh.isActive || (sh.centerId && sh.centerId !== input.centerId)) throw bad("Mã ca không hợp lệ cho cơ sở này");
    }
    if (e.date < addDays(today, -BACKDATE_ROSTER)) throw pre("Không sửa ca quá 31 ngày trước — dùng chỉnh công");
  }
  await assertOpen(ctx.db, input.centerId, input.entries.map((e) => e.date));
  let set = 0;
  let cleared = 0;
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    for (const e of input.entries) {
      if (e.shiftId) {
        await tx.insert(shiftAssignments).values({ staffId: e.staffId, date: e.date, shiftId: e.shiftId, centerId: input.centerId, origin, note: input.note?.trim() || null, createdBy: ctx.user.id })
          .onConflictDoUpdate({ target: [shiftAssignments.staffId, shiftAssignments.date], set: { shiftId: e.shiftId, origin, note: input.note?.trim() || null, createdBy: ctx.user.id } });
        set++;
      } else {
        const d = await tx.delete(shiftAssignments).where(and(eq(shiftAssignments.staffId, e.staffId), eq(shiftAssignments.date, e.date))).returning({ id: shiftAssignments.id });
        cleared += d.length;
      }
    }
    await writeAudit(tx, { actorId: ctx.user.id, action: "UPDATE", module: "hr", entity: "shift_assignments", entityId: null, after: { centerId: input.centerId, origin, set, cleared, dates: [...new Set(input.entries.map((e) => e.date))].sort() }, ip: ctx.ip });
  });
  const future = input.entries.filter((e) => e.date >= today);
  const users_ = people.filter((p) => future.some((f) => f.staffId === p.id)).map((p) => p.userId);
  await notify(ctx.db, users_, "Lịch ca thay đổi", `Cập nhật ${future.length} ngày ca làm`, "/cham-cong/lich-ca", 3, "shift.brief");
  return { set, cleared };
}

/** Khung ca tuần của cơ sở (mỗi người × thứ = một mã ca) */
export async function saveTemplates(ctx: ProtectedContext, input: { centerId: string; entries: { staffId: string; weekday: number; shiftId: string | null }[] }) {
  requirePermission(ctx, "timesheet:update", { centerId: input.centerId });
  const ids = [...new Set(input.entries.map((e) => e.staffId))];
  const people = ids.length ? await ctx.db.select({ id: staff.id, centerId: staff.centerId }).from(staff).where(inArray(staff.id, ids)) : [];
  for (const e of input.entries) {
    if (e.weekday < 1 || e.weekday > 7) throw bad("Thứ trong tuần từ 1 (T2) đến 7 (CN)");
    if (!people.find((p) => p.id === e.staffId && p.centerId === input.centerId)) throw bad("Nhân sự không thuộc cơ sở này");
  }
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    for (const e of input.entries) {
      if (e.shiftId) {
        await tx.insert(shiftTemplates).values({ centerId: input.centerId, staffId: e.staffId, weekday: e.weekday, shiftId: e.shiftId, createdBy: ctx.user.id })
          .onConflictDoUpdate({ target: [shiftTemplates.staffId, shiftTemplates.weekday], set: { shiftId: e.shiftId, centerId: input.centerId, createdBy: ctx.user.id } });
      } else {
        await tx.delete(shiftTemplates).where(and(eq(shiftTemplates.staffId, e.staffId), eq(shiftTemplates.weekday, e.weekday)));
      }
    }
    await writeAudit(tx, { actorId: ctx.user.id, action: "UPDATE", module: "hr", entity: "shift_templates", entityId: null, after: { centerId: input.centerId, entries: input.entries.length }, ip: ctx.ip });
  });
  return { saved: input.entries.length };
}

/** Sinh lưới tháng từ khung ca tuần — ô sửa tay và ô từ đơn đã duyệt được giữ nguyên */
export async function generateRoster(ctx: ProtectedContext, input: { centerId: string; period: string; overwriteTemplate?: boolean }) {
  requirePermission(ctx, "timesheet:update", { centerId: input.centerId });
  const { from, to } = rule(() => periodRange(input.period));
  await assertOpen(ctx.db, input.centerId, [from]);
  const today = todayISO();
  const start = from < addDays(today, -BACKDATE_ROSTER) ? addDays(today, -BACKDATE_ROSTER) : from;
  const tpl = await ctx.db.select().from(shiftTemplates).where(eq(shiftTemplates.centerId, input.centerId));
  if (!tpl.length) throw pre("Chưa khai khung ca tuần cho cơ sở này");
  const people = await ctx.db.select({ id: staff.id, status: staff.status, leftAt: staff.leftAt, exempt: staff.timesheetExempt }).from(staff).where(eq(staff.centerId, input.centerId));
  const existing = await ctx.db.select().from(shiftAssignments).where(and(eq(shiftAssignments.centerId, input.centerId), gte(shiftAssignments.date, start), lte(shiftAssignments.date, to)));
  let created = 0;
  let updated = 0;
  let kept = 0;
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    for (const d of datesBetween(start, to)) {
      const wd = weekdayOf(d);
      for (const t of tpl) {
        if (t.weekday !== wd || !t.shiftId) continue;
        const p = people.find((x) => x.id === t.staffId);
        if (!p || p.exempt) continue;
        if (p.status === "resigned" && (!p.leftAt || d > p.leftAt)) continue;
        const cur = existing.find((x) => x.staffId === t.staffId && x.date === d);
        if (cur && (cur.origin === "manual" || cur.origin === "request") && !input.overwriteTemplate) {
          kept++;
          continue;
        }
        if (cur && cur.shiftId === t.shiftId && cur.origin === "template") continue;
        await tx.insert(shiftAssignments).values({ staffId: t.staffId, date: d, shiftId: t.shiftId, centerId: input.centerId, origin: "template", createdBy: ctx.user.id })
          .onConflictDoUpdate({ target: [shiftAssignments.staffId, shiftAssignments.date], set: { shiftId: t.shiftId, origin: "template", createdBy: ctx.user.id } });
        if (cur) updated++;
        else created++;
      }
    }
    await writeAudit(tx, { actorId: ctx.user.id, action: "CREATE", module: "hr", entity: "shift_assignments", entityId: null, after: { centerId: input.centerId, period: input.period, created, updated, kept, source: "template" }, ip: ctx.ip });
  });
  return { created, updated, kept };
}

/* ---- Nhập lịch phân ca từ CSV / dán từ Sheet (TSV) ---------------- */

export function parseRosterSheet(text: string): { header: string[]; rows: { name: string; cells: string[] }[]; errors: string[] } {
  const errors: string[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trimEnd()).filter((l) => l.trim().length);
  if (lines.length < 2) return { header: [], rows: [], errors: ["Cần ít nhất dòng tiêu đề và một dòng dữ liệu"] };
  const sep = (lines[0]!.includes("\t") ? "\t" : lines[0]!.includes(";") ? ";" : ",");
  const split = (l: string) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
  const header = split(lines[0]!);
  const rows = lines.slice(1).map((l) => {
    const c = split(l);
    return { name: c[0] ?? "", cells: c.slice(1) };
  }).filter((r) => r.name);
  if (header.length < 2) errors.push("Dòng tiêu đề phải có cột Họ tên rồi tới các ngày (1, 2, 3…)");
  return { header, rows, errors };
}

/**
 * Nhập lưới tháng: cột đầu là họ tên / mã NV, các cột sau là ngày 1..31 với mã ca.
 * Ô sửa tay và ô từ đơn đã duyệt **không bị file đè**; chạy lại cùng file là an toàn.
 */
export async function importRoster(ctx: ProtectedContext, input: { centerId: string; period: string; content: string; dryRun?: boolean }) {
  requirePermission(ctx, "timesheet:update", { centerId: input.centerId });
  const { from, to } = rule(() => periodRange(input.period));
  await assertOpen(ctx.db, input.centerId, [from]);
  const parsed = parseRosterSheet(input.content);
  if (parsed.errors.length) throw bad(parsed.errors);
  const people = await ctx.db.select({ id: staff.id, code: staff.code, fullName: staff.fullName, status: staff.status, leftAt: staff.leftAt }).from(staff).where(eq(staff.centerId, input.centerId));
  const shifts = await ctx.db.select().from(workShifts).where(and(or(isNull(workShifts.centerId), eq(workShifts.centerId, input.centerId))!, eq(workShifts.isActive, true)));
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const existing = await ctx.db.select().from(shiftAssignments).where(and(eq(shiftAssignments.centerId, input.centerId), gte(shiftAssignments.date, from), lte(shiftAssignments.date, to)));
  const dayOf = (idx: number) => {
    const h = parsed.header[idx + 1] ?? "";
    const n = Number((h.match(/\d+/) ?? [])[0] ?? idx + 1);
    return n >= 1 && n <= 31 ? `${input.period}-${String(n).padStart(2, "0")}` : null;
  };
  const plan: { staffId: string; date: string; shiftId: string; action: "create" | "update" }[] = [];
  const kept: string[] = [];
  const unknownNames: string[] = [];
  const unknownCodes = new Set<string>();
  for (const r of parsed.rows) {
    const p = people.find((x) => norm(x.fullName) === norm(r.name) || x.code.toLowerCase() === norm(r.name));
    if (!p) {
      unknownNames.push(r.name);
      continue;
    }
    r.cells.forEach((cell, i) => {
      const code = cell.trim().toUpperCase();
      if (!code || code === "—" || code === "-") return;
      const date = dayOf(i);
      if (!date || date > to) return;
      if (p.status === "resigned" && (!p.leftAt || date > p.leftAt)) return;
      const sh = shifts.find((x) => x.code.toUpperCase() === code);
      if (!sh) {
        unknownCodes.add(code);
        return;
      }
      const cur = existing.find((x) => x.staffId === p.id && x.date === date);
      if (cur && (cur.origin === "manual" || cur.origin === "request")) {
        kept.push(`${p.fullName} ${dmy(date)}`);
        return;
      }
      if (cur && cur.shiftId === sh.id) return;
      plan.push({ staffId: p.id, date, shiftId: sh.id, action: cur ? "update" : "create" });
    });
  }
  const summary = {
    created: plan.filter((x) => x.action === "create").length,
    updated: plan.filter((x) => x.action === "update").length,
    keptManual: kept.length,
    skipped: unknownNames.length,
    unknownNames: [...new Set(unknownNames)].slice(0, 20),
    unknownCodes: [...unknownCodes].slice(0, 20),
  };
  if (input.dryRun) return { ...summary, applied: false };
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    for (const x of plan) {
      await tx.insert(shiftAssignments).values({ staffId: x.staffId, date: x.date, shiftId: x.shiftId, centerId: input.centerId, origin: "import", createdBy: ctx.user.id })
        .onConflictDoUpdate({ target: [shiftAssignments.staffId, shiftAssignments.date], set: { shiftId: x.shiftId, origin: "import", createdBy: ctx.user.id } });
    }
    await tx.insert(rosterImports).values({
      centerId: input.centerId, period: input.period, created: summary.created, updated: summary.updated,
      keptManual: summary.keptManual, skipped: summary.skipped, detail: { unknownNames: summary.unknownNames, unknownCodes: summary.unknownCodes }, createdBy: ctx.user.id,
    });
    await writeAudit(tx, { actorId: ctx.user.id, action: "CREATE", module: "hr", entity: "shift_assignments", entityId: null, after: { centerId: input.centerId, period: input.period, ...summary, source: "import" }, ip: ctx.ip });
  });
  return { ...summary, applied: true };
}

/* ------------------------------------------------------------------ */
/* Bảng công, rà cờ, kỳ công                                           */
/* ------------------------------------------------------------------ */

export async function timesheet(ctx: ProtectedContext, input: { centerId: string; period: string; q?: string; filter?: "all" | "flag" | "no_punch" | "override" }) {
  requirePermission(ctx, "timesheet:read", { centerId: input.centerId });
  const { from, to } = rule(() => periodRange(input.period));
  const conds: SQL[] = [eq(staff.centerId, input.centerId), or(ne(staff.status, "resigned"), gte(staff.leftAt, from))!];
  if (input.q?.trim()) conds.push(or(ilike(staff.fullName, `%${input.q.trim()}%`), ilike(staff.code, `%${input.q.trim()}%`))!);
  const people = await ctx.db.select({ id: staff.id, code: staff.code, fullName: staff.fullName, title: staff.title, status: staff.status, centerId: staff.centerId, exempt: staff.timesheetExempt })
    .from(staff).where(and(...conds)).orderBy(asc(staff.code));
  const days = await buildDays(ctx.db, people, from, to);
  const p = await ctx.db.query.timesheetPeriods.findFirst({ where: and(eq(timesheetPeriods.centerId, input.centerId), eq(timesheetPeriods.period, input.period)) });
  const [pend] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(staffRequests)
    .where(and(eq(staffRequests.centerId, input.centerId), eq(staffRequests.status, "pending"), lte(staffRequests.dateFrom, to), gte(staffRequests.dateTo, from)));
  const all = people.map((x) => {
    const d = days.get(x.id) ?? [];
    const openFlags = d.reduce((n, c) => n + c.openFlags.length, 0);
    return {
      ...x, summary: summarizeDays(d), openFlagCount: openFlags,
      flagDays: d.filter((c) => c.openFlags.length).map((c) => c.date),
      days: d.map((c) => ({
        date: c.date, status: c.status, units: c.units, lateMin: c.lateMin, earlyMin: c.earlyMin, inMin: c.inMin, outMin: c.outMin,
        shiftCode: c.shift?.code ?? null, punches: c.punches, otMin: c.otMin, paidLeave: c.paidLeave, unpaidLeave: c.unpaidLeave, holiday: c.holidayUnits,
        flags: c.flags, openFlags: c.openFlags, hasRequest: c.requests.some((r) => r.status === "pending"), override: !!c.override, plannedMin: c.plannedMin, workedMin: c.workedMin,
      })),
    };
  });
  const rows = all.filter((r) => {
    if (input.filter === "flag") return r.openFlagCount > 0;
    if (input.filter === "no_punch") return r.summary.noPunchCount > 0;
    if (input.filter === "override") return r.summary.overrideCount > 0;
    return true;
  });
  const unreviewedFlagDays = all.reduce((n, r) => n + r.flagDays.length, 0);
  const noPunchDays = all.reduce((n, r) => n + r.summary.noPunchCount, 0);
  const check = lockCheck({ pendingRequests: pend?.n ?? 0, unreviewedFlagDays, noPunchDays, periodEnd: to, today: todayISO() });
  const unlockAllowed = centersWith(ctx, "timesheet:lock").includes(null) || isSA(ctx);
  const hols = await ctx.db.select().from(holidays).where(and(gte(holidays.date, from), lte(holidays.date, to)));
  const std = p?.standardUnits ?? standardUnits(input.period, [7], hols.filter((h) => h.centerId === null || h.centerId === input.centerId).map((h) => h.date));
  return {
    period: input.period, from, to, dates: datesBetween(from, to),
    status: p?.status ?? "open", lockedAt: p?.lockedAt ?? null, unlockReason: p?.unlockReason ?? null,
    standardUnits: std, standardNote: p?.standardNote ?? null,
    pendingRequests: pend?.n ?? 0, lockCheck: check,
    kpi: {
      scheduled: all.reduce((n, r) => n + r.summary.scheduled, 0),
      punched: all.reduce((n, r) => n + r.days.filter((d) => d.punches > 0).length, 0),
      openFlags: all.reduce((n, r) => n + r.openFlagCount, 0),
      flagPeople: all.filter((r) => r.openFlagCount > 0).length,
      noPunch: noPunchDays,
      overrides: all.reduce((n, r) => n + r.summary.overrideCount, 0),
      payableUnits: all.reduce((n, r) => n + r.summary.payableUnits, 0),
    },
    perms: { update: can(ctx, "timesheet:update", input.centerId), lock: can(ctx, "timesheet:lock", input.centerId), unlock: unlockAllowed },
    rows,
  };
}

export async function dayDetail(ctx: ProtectedContext, input: { staffId: string; date: string }) {
  const s = await ctx.db.query.staff.findFirst({ where: eq(staff.id, input.staffId) });
  if (!s) throw notFound("Không tìm thấy nhân sự");
  if (s.userId !== ctx.user.id) requirePermission(ctx, "timesheet:read", { centerId: s.centerId });
  const cell = (await buildDays(ctx.db, [s], input.date, input.date)).get(s.id)![0]!;
  const punches = await ctx.db.select({ p: attendancePunches, byName: users.fullName }).from(attendancePunches).leftJoin(users, eq(users.id, attendancePunches.createdBy))
    .where(and(eq(attendancePunches.staffId, s.id), gte(attendancePunches.at, vnStart(input.date)), lte(attendancePunches.at, vnEnd(input.date)))).orderBy(asc(attendancePunches.at));
  const reqs = await ctx.db.select().from(staffRequests).where(and(eq(staffRequests.staffId, s.id), lte(staffRequests.dateFrom, input.date), gte(staffRequests.dateTo, input.date))).orderBy(desc(staffRequests.createdAt));
  const reviews = await ctx.db.select({ r: timesheetFlagReviews, byName: users.fullName }).from(timesheetFlagReviews).leftJoin(users, eq(users.id, timesheetFlagReviews.reviewedBy))
    .where(and(eq(timesheetFlagReviews.staffId, s.id), eq(timesheetFlagReviews.date, input.date)));
  const locked = await periodLocked(ctx.db, s.centerId, [input.date]);
  const mine = s.userId === ctx.user.id;
  return {
    staff: { id: s.id, code: s.code, fullName: s.fullName, centerId: s.centerId }, cell, locked,
    punches: punches.map((x) => ({ ...x.p, byName: x.byName })), requests: reqs,
    reviews: reviews.map((x) => ({ ...x.r, byName: x.byName })),
    canOverride: can(ctx, "timesheet:update", s.centerId) && !locked && !mine,
    canReview: can(ctx, "timesheet:update", s.centerId) && !mine,
  };
}

export async function overrideDay(ctx: ProtectedContext, input: { staffId: string; date: string; units: number | null; label?: string | null; reason: string }) {
  const s = await ctx.db.query.staff.findFirst({ where: eq(staff.id, input.staffId) });
  if (!s) throw notFound("Không tìm thấy nhân sự");
  requirePermission(ctx, "timesheet:update", { centerId: s.centerId });
  if (s.userId === ctx.user.id && !isSA(ctx)) throw pre("Không tự chỉnh công của mình");
  if (input.date > todayISO()) throw bad("Không chỉnh công ngày chưa tới");
  const reason = reasonOf(input.reason);
  await assertOpen(ctx.db, s.centerId, [input.date]);
  const before = await ctx.db.query.timesheetOverrides.findFirst({ where: and(eq(timesheetOverrides.staffId, s.id), eq(timesheetOverrides.date, input.date)) });
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    if (input.units === null) {
      if (!before) throw pre("Ngày này chưa ghi đè công");
      await tx.delete(timesheetOverrides).where(eq(timesheetOverrides.id, before.id));
    } else {
      if (input.units < 0 || input.units > 1.5 || (input.units * 2) % 1 !== 0) throw bad("Công ghi đè là 0; 0,5; 1 hoặc 1,5");
      const label = (input.label ?? "").trim() || "Ghi đè công";
      await tx.insert(timesheetOverrides).values({ staffId: s.id, date: input.date, units: input.units, label, reason, createdBy: ctx.user.id })
        .onConflictDoUpdate({ target: [timesheetOverrides.staffId, timesheetOverrides.date], set: { units: input.units, label, reason, createdBy: ctx.user.id, updatedAt: new Date() } });
    }
    await writeAudit(tx, { actorId: ctx.user.id, action: before ? (input.units === null ? "DELETE" : "UPDATE") : "CREATE", module: "hr", entity: "timesheet_overrides", entityId: s.id, before: before ? { units: before.units, label: before.label } : null, after: { date: input.date, units: input.units, label: input.label }, reason, ip: ctx.ip });
    if (s.userId) await notify(tx, [s.userId], "Công ngày được ghi đè", `${dmy(input.date)}: ${input.units === null ? "bỏ ghi đè" : `${input.units} công`} — ${reason}`, "/cham-cong/lich-ca", 3, "timesheet.override");
  });
  return { ok: true };
}

/** Kết luận rà cờ: ghi nhận có lý do / gỡ kết luận / vắng có lý do */
export async function reviewFlag(ctx: ProtectedContext, input: { staffId: string; date: string; flag: string; action: FlagReviewAction; note?: string | null }) {
  const s = await ctx.db.query.staff.findFirst({ where: eq(staff.id, input.staffId) });
  if (!s) throw notFound("Không tìm thấy nhân sự");
  requirePermission(ctx, "timesheet:update", { centerId: s.centerId });
  if (s.userId === ctx.user.id && !isSA(ctx)) throw pre("Không tự kết luận cờ chấm công của mình");
  if (input.flag !== "*" && !(TIMESHEET_FLAGS as readonly string[]).includes(input.flag)) throw bad("Cờ không hợp lệ");
  if (input.flag !== "*" && !isReviewableFlag(input.flag as TimesheetFlag)) throw bad("Cờ này chỉ để ghi nhận, không cần kết luận");
  if (input.date > todayISO()) throw bad("Không rà cờ cho ngày chưa tới");
  const before = await ctx.db.query.timesheetFlagReviews.findFirst({ where: and(eq(timesheetFlagReviews.staffId, s.id), eq(timesheetFlagReviews.date, input.date), eq(timesheetFlagReviews.flag, input.flag)) });
  if (input.action === "dismiss" && !before) throw pre("Ngày này chưa có kết luận để gỡ");
  const note = input.action === "dismiss" ? input.note?.trim() || "Gỡ kết luận" : reasonOf(input.note);
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    if (input.action === "dismiss") {
      await tx.delete(timesheetFlagReviews).where(eq(timesheetFlagReviews.id, before!.id));
    } else {
      await tx.insert(timesheetFlagReviews).values({ staffId: s.id, centerId: s.centerId, date: input.date, flag: input.flag, action: input.action, note, reviewedBy: ctx.user.id })
        .onConflictDoUpdate({ target: [timesheetFlagReviews.staffId, timesheetFlagReviews.date, timesheetFlagReviews.flag], set: { action: input.action, note, reviewedBy: ctx.user.id, updatedAt: new Date() } });
    }
    await writeAudit(tx, { actorId: ctx.user.id, action: input.action === "dismiss" ? "DELETE" : "UPDATE", module: "hr", entity: "timesheet_flag_reviews", entityId: s.id, before: before ? { action: before.action, note: before.note } : null, after: { date: input.date, flag: input.flag, action: input.action }, reason: note, ip: ctx.ip });
  });
  return { ok: true };
}

export async function setPeriodStandard(ctx: ProtectedContext, input: { centerId: string; period: string; standardUnits: number | null; note?: string | null }) {
  requirePermission(ctx, "timesheet:lock", { centerId: input.centerId });
  if (input.standardUnits != null && (input.standardUnits < 0 || input.standardUnits > 31 || (input.standardUnits * 2) % 1 !== 0)) throw bad("Số công chuẩn 0–31, bước 0,5");
  const v = { standardUnits: input.standardUnits, standardNote: input.note?.trim().slice(0, 200) || null };
  await ctx.db.insert(timesheetPeriods).values({ centerId: input.centerId, period: input.period, ...v })
    .onConflictDoUpdate({ target: [timesheetPeriods.centerId, timesheetPeriods.period], set: v });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "hr", entity: "timesheet_periods", entityId: input.centerId, after: { period: input.period, ...v }, ip: ctx.ip });
  return { ok: true };
}

export async function lockPeriod(ctx: ProtectedContext, input: { centerId: string; period: string }) {
  requirePermission(ctx, "timesheet:lock", { centerId: input.centerId });
  const t = await timesheet(ctx, { centerId: input.centerId, period: input.period });
  if (t.status === "locked") throw pre("Kỳ công đã khoá");
  if (t.lockCheck.blockers.length) throw pre(t.lockCheck.blockers);
  const snapshot = { rows: t.rows.map((r) => ({ staffId: r.id, code: r.code, fullName: r.fullName, openFlags: r.openFlagCount, ...r.summary })), warnings: t.lockCheck.warnings, standardUnits: t.standardUnits, lockedBy: ctx.user.fullName };
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.insert(timesheetPeriods).values({ centerId: input.centerId, period: input.period, status: "locked", lockedBy: ctx.user.id, lockedAt: new Date(), snapshot })
      .onConflictDoUpdate({ target: [timesheetPeriods.centerId, timesheetPeriods.period], set: { status: "locked", lockedBy: ctx.user.id, lockedAt: new Date(), snapshot } });
    await writeAudit(tx, { actorId: ctx.user.id, action: "TRANSITION", module: "hr", entity: "timesheet_periods", entityId: input.centerId, after: { period: input.period, status: "locked", staff: snapshot.rows.length }, ip: ctx.ip });
  });
  return { ok: true, warnings: t.lockCheck.warnings };
}

export async function unlockPeriod(ctx: ProtectedContext, input: { centerId: string; period: string; reason: string }) {
  if (!centersWith(ctx, "timesheet:lock").includes(null) && !isSA(ctx)) throw forbidden("Chỉ nhân sự Hội sở mở lại kỳ công đã khoá");
  const reason = reasonOf(input.reason);
  const p = await ctx.db.query.timesheetPeriods.findFirst({ where: and(eq(timesheetPeriods.centerId, input.centerId), eq(timesheetPeriods.period, input.period)) });
  if (!p || p.status !== "locked") throw pre("Kỳ công chưa khoá");
  await ctx.db.update(timesheetPeriods).set({ status: "open", unlockReason: reason }).where(eq(timesheetPeriods.id, p.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "TRANSITION", module: "hr", entity: "timesheet_periods", entityId: input.centerId, before: { status: "locked" }, after: { period: input.period, status: "open" }, reason, ip: ctx.ip });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Chấm công cá nhân (Của tôi)                                         */
/* ------------------------------------------------------------------ */

export async function myAttendance(ctx: ProtectedContext, input: { period?: string }) {
  const s = await myStaff(ctx);
  if (!s) return { staff: null };
  const today = todayISO();
  const period = input.period ?? today.slice(0, 7);
  const { from, to } = rule(() => periodRange(period));
  let ws = today;
  while (weekdayOf(ws) !== 1) ws = addDays(ws, -1);
  const rangeFrom = from < ws ? from : ws;
  const rangeTo = to > addDays(ws, 13) ? to : addDays(ws, 13);
  const all = (await buildDays(ctx.db, [s], rangeFrom, rangeTo)).get(s.id) ?? [];
  const month = all.filter((d) => d.date >= from && d.date <= to);
  const todayCell = all.find((d) => d.date === today) ?? null;
  const center = await ctx.db.query.centers.findFirst({ where: eq(centers.id, s.centerId) });
  const punches = await ctx.db.select({ kind: attendancePunches.kind, at: attendancePunches.at, source: attendancePunches.source, distanceM: attendancePunches.distanceM, flags: attendancePunches.flags })
    .from(attendancePunches).where(and(eq(attendancePunches.staffId, s.id), gte(attendancePunches.at, vnStart(today)), lte(attendancePunches.at, vnEnd(today)))).orderBy(asc(attendancePunches.at));
  const reqs = await ctx.db.select().from(staffRequests).where(eq(staffRequests.staffId, s.id)).orderBy(desc(staffRequests.createdAt)).limit(30);
  const locked = await periodLocked(ctx.db, s.centerId, [from]);
  return {
    staff: { id: s.id, code: s.code, fullName: s.fullName, title: s.title, status: s.status, centerId: s.centerId, exempt: s.timesheetExempt },
    center: center ? { code: center.code, name: center.name } : null,
    today, todayCell, punches, period, lockedPeriod: locked,
    weeks: all.filter((d) => d.date >= ws && d.date <= addDays(ws, 13)),
    month, summary: summarizeDays(month),
    leave: await leaveBalance(ctx.db, s, Number(today.slice(0, 4))),
    requests: reqs,
  };
}

export async function hrQueues(ctx: ProtectedContext) {
  const out: { key: string; title: string; count: number; overdue: number; href: string }[] = [];
  const cs = centersWith(ctx, "timesheet:approve");
  if (!cs.length) return out;
  const [r] = await ctx.db.select({
    n: sql<number>`count(*)::int`,
    old: sql<number>`count(*) filter (where ${staffRequests.createdAt} < now() - interval '48 hours' or ${staffRequests.dateFrom} <= current_date)::int`,
  }).from(staffRequests).innerJoin(staff, eq(staff.id, staffRequests.staffId))
    .where(and(eq(staffRequests.status, "pending"), scopeSql(ctx, "timesheet:approve", staffRequests.centerId as unknown as typeof staff.centerId), or(isNull(staff.userId), ne(staff.userId, ctx.user.id))!));
  out.push({ key: "staff_requests", title: "Đơn từ nhân sự chờ duyệt", count: r?.n ?? 0, overdue: r?.old ?? 0, href: "/don-tu?status=pending" });
  const [f] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(staffRequests).where(and(eq(staffRequests.status, "pending"), sql`${staffRequests.applyError} is not null`, scopeSql(ctx, "timesheet:approve", staffRequests.centerId as unknown as typeof staff.centerId)));
  if ((f?.n ?? 0) > 0) out.push({ key: "staff_requests_failed", title: "Đơn duyệt nhưng áp thất bại", count: f!.n, overdue: f!.n, href: "/don-tu?status=pending&apply=failed" });
  return out;
}
