import { and, eq, inArray, sql, desc, asc, isNull, or, gte, lte, ilike, ne, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  staff, staffPrivate, staffPositions, workShifts, shiftAssignments, attendancePunches, timesheetOverrides, staffRequests, timesheetPeriods,
  centers, users, userRoles, userNotifications, teachers, holidays,
} from "@satarobo/db";
import {
  authorize, hasRole, addDays, weekdayOf,
  validatePosition, activeOn, staffTransition, proratedLeave, staffCode, validateShift, checkGeofence, vnParts, hhmm,
  computeDay, summarizeDays, validateRequest, requestMinutes, leaveDays, requestTransition, leaveIsPaid, periodRange, datesBetween, lockCheck,
  maskIdNumber, REQUEST_KIND_VI,
  type Permission, type StaffStatus, type EmploymentType, type PositionKind, type RequestKind, type RequestStatus, type LeaveType, type DayResult,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { todayISO } from "./sessions";

type Db = ProtectedContext["db"];
const BACKDATE_ROSTER = 31;
const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });
const pre = (m: string | string[]) => new TRPCError({ code: "PRECONDITION_FAILED", message: Array.isArray(m) ? m.join("; ") : m });
const notFound = (m: string) => new TRPCError({ code: "NOT_FOUND", message: m });

function rule<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if ((e as Error)?.name === "HrRuleError") throw pre((e as Error).message);
    throw e;
  }
}

const can = (ctx: ProtectedContext, p: Permission, centerId: string | null) => authorize(ctx.actor, p, { centerId }).allowed;
const isSA = (ctx: ProtectedContext) => hasRole(ctx.actor, "SUPER_ADMIN");

/** Danh sách cơ sở actor có quyền p (null trong mảng = toàn hệ thống) */
function centersWith(ctx: ProtectedContext, p: Permission): (string | null)[] {
  return ctx.actor.assignments.filter((a) => authorize({ userId: ctx.actor.userId, assignments: [a] }, p, { centerId: a.centerId }).allowed).map((a) => a.centerId);
}
function scopeSql(ctx: ProtectedContext, p: Permission, col: typeof staff.centerId): SQL {
  const cs = centersWith(ctx, p);
  if (cs.includes(null)) return sql`true`;
  const ids = cs.filter((c): c is string => !!c);
  return ids.length ? (inArray(col, ids) as SQL) : sql`false`;
}
const reasonOf = (r: string | null | undefined, min = 5) => {
  const t = (r ?? "").trim();
  if (t.length < min) throw bad(`Cần nhập lý do (tối thiểu ${min} ký tự)`);
  return t;
};
const vnStart = (d: string) => new Date(`${d}T00:00:00+07:00`);
const vnEnd = (d: string) => new Date(`${d}T23:59:59.999+07:00`);

async function notify(db: Db, ids: (string | null | undefined)[], title: string, body: string, link: string, priority = 2) {
  const u = [...new Set(ids.filter((x): x is string => !!x))];
  if (u.length) await db.insert(userNotifications).values(u.map((userId) => ({ userId, title, body, link, priority })));
}

async function approversOf(db: Db, centerId: string) {
  return (await db.select({ u: userRoles.userId }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(users.isActive, true), or(and(inArray(userRoles.role, ["CENTER_MANAGER", "CENTER_HR"]), eq(userRoles.centerId, centerId)), and(eq(userRoles.role, "HO_HR"), isNull(userRoles.centerId)))!))).map((r) => r.u);
}

export async function myStaff(ctx: ProtectedContext) {
  return ctx.db.query.staff.findFirst({ where: eq(staff.userId, ctx.user.id) });
}

async function periodLocked(db: Db, centerId: string, dates: string[]) {
  const ps = [...new Set(dates.map((d) => d.slice(0, 7)))];
  if (!ps.length) return null;
  const [p] = await db.select({ period: timesheetPeriods.period }).from(timesheetPeriods)
    .where(and(eq(timesheetPeriods.centerId, centerId), inArray(timesheetPeriods.period, ps), eq(timesheetPeriods.status, "locked"))).limit(1);
  return p?.period ?? null;
}
async function assertOpen(db: Db, centerId: string, dates: string[]) {
  const p = await periodLocked(db, centerId, dates);
  if (p) throw pre(`Kỳ công ${p.split("-").reverse().join("/")} đã khoá — nhờ nhân sự Hội sở mở lại`);
}

/* ------------------------------------------------------------------ */
/* Tính bảng công                                                      */
/* ------------------------------------------------------------------ */

type ShiftRow = typeof workShifts.$inferSelect;
export interface DayCell extends DayResult {
  date: string;
  shift: { id: string; code: string; name: string; startTime: string; endTime: string } | null;
  inMin: number | null;
  outMin: number | null;
  punches: number;
  requests: { id: string; kind: RequestKind; status: RequestStatus }[];
  override: { units: number; label: string; reason: string } | null;
  holidayName: string | null;
  scheduled: boolean;
}

export async function buildDays(db: Db, people: { id: string; centerId: string }[], from: string, to: string): Promise<Map<string, DayCell[]>> {
  const out = new Map<string, DayCell[]>();
  if (!people.length) return out;
  const ids = people.map((p) => p.id);
  const today = todayISO();
  const [asg, punches, reqs, ovs, hols] = await Promise.all([
    db.select({ a: shiftAssignments, s: workShifts }).from(shiftAssignments).innerJoin(workShifts, eq(workShifts.id, shiftAssignments.shiftId))
      .where(and(inArray(shiftAssignments.staffId, ids), gte(shiftAssignments.date, from), lte(shiftAssignments.date, to))),
    db.select({ staffId: attendancePunches.staffId, kind: attendancePunches.kind, at: attendancePunches.at }).from(attendancePunches)
      .where(and(inArray(attendancePunches.staffId, ids), gte(attendancePunches.at, vnStart(from)), lte(attendancePunches.at, vnEnd(to)))),
    db.select().from(staffRequests).where(and(inArray(staffRequests.staffId, ids), lte(staffRequests.dateFrom, to), gte(staffRequests.dateTo, from), inArray(staffRequests.status, ["pending", "approved"]))),
    db.select().from(timesheetOverrides).where(and(inArray(timesheetOverrides.staffId, ids), gte(timesheetOverrides.date, from), lte(timesheetOverrides.date, to))),
    db.select().from(holidays).where(and(gte(holidays.date, from), lte(holidays.date, to))),
  ]);
  const byKey = new Map<string, { in: number | null; out: number | null; n: number }>();
  for (const p of punches) {
    const v = vnParts(p.at);
    const k = `${p.staffId}|${v.date}`;
    const cur = byKey.get(k) ?? { in: null, out: null, n: 0 };
    cur.n++;
    if (p.kind === "in") cur.in = cur.in == null ? v.min : Math.min(cur.in, v.min);
    else cur.out = cur.out == null ? v.min : Math.max(cur.out, v.min);
    byKey.set(k, cur);
  }
  const shiftOf = new Map<string, ShiftRow>();
  for (const x of asg) shiftOf.set(`${x.a.staffId}|${x.a.date}`, x.s);
  const dates = datesBetween(from, to);
  for (const p of people) {
    const myReqs = reqs.filter((r) => r.staffId === p.id);
    const cells: DayCell[] = dates.map((date) => {
      const sh = shiftOf.get(`${p.id}|${date}`) ?? null;
      const pu = byKey.get(`${p.id}|${date}`);
      const onDay = myReqs.filter((r) => r.dateFrom <= date && r.dateTo >= date);
      const ok = onDay.filter((r) => r.status === "approved");
      const lv = ok.find((r) => r.kind === "leave");
      const le = ok.filter((r) => r.kind === "late_early");
      const ot = ok.filter((r) => r.kind === "overtime");
      const ov = ovs.find((o) => o.staffId === p.id && o.date === date);
      const hol = hols.find((h) => h.date === date && (h.centerId === null || h.centerId === p.centerId));
      const r = computeDay({
        date, today, shift: sh, inMin: pu?.in ?? null, outMin: pu?.out ?? null,
        leave: lv ? { portion: (lv.portion as "full" | "am" | "pm" | null) ?? "full", paid: leaveIsPaid(lv.leaveType ?? "annual") } : null,
        excusedLateMin: le.reduce((s, x) => s + (x.lateMin ?? 0), 0), excusedEarlyMin: le.reduce((s, x) => s + (x.earlyMin ?? 0), 0),
        otMin: ot.reduce((s, x) => s + x.minutes, 0), holiday: !!hol && !!sh,
        override: ov ? { units: ov.units, status: ov.label, note: ov.reason } : null,
      });
      return {
        ...r, date, scheduled: !!sh,
        shift: sh ? { id: sh.id, code: sh.code, name: sh.name, startTime: sh.startTime, endTime: sh.endTime } : null,
        inMin: pu?.in ?? null, outMin: pu?.out ?? null, punches: pu?.n ?? 0,
        requests: onDay.map((x) => ({ id: x.id, kind: x.kind, status: x.status })),
        override: ov ? { units: ov.units, label: ov.label, reason: ov.reason } : null,
        holidayName: hol?.name ?? null,
      };
    });
    out.set(p.id, cells);
  }
  return out;
}

async function leaveBalance(db: Db, s: { id: string; annualLeaveDays: number; hiredAt: string | null }, year: number) {
  const [u] = await db.select({
    used: sql<number>`coalesce(sum(${staffRequests.days}) filter (where ${staffRequests.status} = 'approved'), 0)::float`,
    pending: sql<number>`coalesce(sum(${staffRequests.days}) filter (where ${staffRequests.status} = 'pending'), 0)::float`,
  }).from(staffRequests).where(and(eq(staffRequests.staffId, s.id), eq(staffRequests.kind, "leave"), eq(staffRequests.leaveType, "annual"), gte(staffRequests.dateFrom, `${year}-01-01`), lte(staffRequests.dateFrom, `${year}-12-31`)));
  const entitled = proratedLeave(s.annualLeaveDays, s.hiredAt, year);
  const used = Number(u?.used ?? 0);
  const pending = Number(u?.pending ?? 0);
  return { year, entitled, used, pending, remaining: entitled - used - pending };
}

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
  employmentType: EmploymentType; hiredAt?: string | null; annualLeaveDays: number; notes?: string | null;
  userId?: string | null; teacherId?: string | null;
  private?: { idNumber?: string | null; birthDate?: string | null; address?: string | null; taxCode?: string | null; insuranceNo?: string | null; bankName?: string | null; bankAccount?: string | null; baseSalary?: number | null; allowance?: number | null } | null;
}

export async function upsertStaff(ctx: ProtectedContext, input: StaffInput) {
  const before = input.id ? await ctx.db.query.staff.findFirst({ where: eq(staff.id, input.id) }) : undefined;
  if (input.id && !before) throw notFound("Không tìm thấy nhân sự");
  requirePermission(ctx, before ? "staff:update" : "staff:create", { centerId: input.centerId });
  if (before && before.centerId !== input.centerId) requirePermission(ctx, "staff:update", { centerId: before.centerId });
  if (before?.status === "resigned") throw pre("Hồ sơ đã nghỉ việc — không sửa");
  if (input.private && !can(ctx, "staff:salary", input.centerId)) throw new TRPCError({ code: "FORBIDDEN", message: "Không có quyền sửa thông tin lương / giấy tờ" });
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
      await tx.update(staffPositions).set({ effectiveTo: eff, endReason: "Nghỉ việc" }).where(and(eq(staffPositions.staffId, s.id), or(isNull(staffPositions.effectiveTo), gte(staffPositions.effectiveTo, eff))!));
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
/* Vị trí công việc                                                    */
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

export async function addPosition(ctx: ProtectedContext, input: { staffId: string; centerId: string; title: string; department: string; kind: PositionKind; effectiveFrom: string; effectiveTo?: string | null; note?: string | null }) {
  const s = await ctx.db.query.staff.findFirst({ where: eq(staff.id, input.staffId) });
  if (!s) throw notFound("Không tìm thấy nhân sự");
  requirePermission(ctx, "staff:update", { centerId: s.centerId });
  requirePermission(ctx, "staff:update", { centerId: input.centerId });
  if (s.status === "resigned") throw pre("Nhân sự đã nghỉ việc");
  const existing = await ctx.db.select().from(staffPositions).where(eq(staffPositions.staffId, s.id));
  const p = { kind: input.kind, centerId: input.centerId, title: input.title.trim(), effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo || null };
  const errs = validatePosition(p, existing);
  if (errs.length) throw pre(errs);
  return ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    const [row] = await tx.insert(staffPositions).values({ staffId: s.id, ...p, department: input.department, note: input.note?.trim() || null, createdBy: ctx.user.id }).returning({ id: staffPositions.id });
    if (input.kind === "primary" && input.effectiveFrom <= todayISO()) await tx.update(staff).set({ title: p.title, department: input.department, centerId: input.centerId }).where(eq(staff.id, s.id));
    await writeAudit(tx, { actorId: ctx.user.id, action: "CREATE", module: "hr", entity: "staff_positions", entityId: row!.id, after: { staff: s.code, ...p }, ip: ctx.ip });
    if (s.userId && s.userId !== ctx.user.id) await notify(tx, [s.userId], "Cập nhật vị trí công việc", `${p.title} (${input.kind === "primary" ? "chính" : input.kind === "concurrent" ? "kiêm nhiệm" : "uỷ quyền"}) từ ${p.effectiveFrom.split("-").reverse().join("/")}`, `/nhan-su/${s.id}`, 3);
    return { id: row!.id };
  });
}

export async function endPosition(ctx: ProtectedContext, input: { id: string; effectiveTo: string; reason: string }) {
  const p = await ctx.db.query.staffPositions.findFirst({ where: eq(staffPositions.id, input.id) });
  if (!p) throw notFound("Không tìm thấy vị trí");
  requirePermission(ctx, "staff:update", { centerId: p.centerId });
  const reason = reasonOf(input.reason);
  if (input.effectiveTo < p.effectiveFrom) throw bad("Ngày kết thúc trước ngày bắt đầu");
  if (p.effectiveTo && p.effectiveTo < todayISO()) throw pre("Vị trí đã kết thúc");
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.update(staffPositions).set({ effectiveTo: input.effectiveTo, endReason: reason }).where(eq(staffPositions.id, p.id));
    await writeAudit(tx, { actorId: ctx.user.id, action: "UPDATE", module: "hr", entity: "staff_positions", entityId: p.id, before: { effectiveTo: p.effectiveTo }, after: { effectiveTo: input.effectiveTo }, reason, ip: ctx.ip });
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Ca làm & phân ca                                                    */
/* ------------------------------------------------------------------ */

export async function listShifts(ctx: ProtectedContext, input: { centerId?: string }) {
  const rows = await ctx.db.select({ s: workShifts, centerCode: centers.code }).from(workShifts).leftJoin(centers, eq(centers.id, workShifts.centerId))
    .where(input.centerId ? or(isNull(workShifts.centerId), eq(workShifts.centerId, input.centerId)) : sql`true`).orderBy(asc(workShifts.startTime));
  return rows.map((r) => ({ ...r.s, centerCode: r.centerCode, canEdit: r.s.centerId ? can(ctx, "timesheet:configure", r.s.centerId) : centersWith(ctx, "timesheet:configure").includes(null) }));
}

export async function upsertShift(ctx: ProtectedContext, input: { id?: string; centerId: string | null; code: string; name: string; startTime: string; endTime: string; breakMinutes: number; isActive: boolean }) {
  if (input.centerId) requirePermission(ctx, "timesheet:configure", { centerId: input.centerId });
  else if (!centersWith(ctx, "timesheet:configure").includes(null)) throw new TRPCError({ code: "FORBIDDEN", message: "Chỉ nhân sự Hội sở tạo ca dùng chung — hãy chọn cơ sở" });
  const errs = validateShift(input);
  if (errs.length) throw bad(errs);
  const v = { centerId: input.centerId, code: input.code.trim().toUpperCase(), name: input.name.trim(), startTime: input.startTime.padStart(5, "0"), endTime: input.endTime.padStart(5, "0"), breakMinutes: input.breakMinutes, isActive: input.isActive };
  const dup = await ctx.db.query.workShifts.findFirst({ where: and(eq(workShifts.code, v.code), input.centerId ? eq(workShifts.centerId, input.centerId) : isNull(workShifts.centerId), input.id ? ne(workShifts.id, input.id) : sql`true`) });
  if (dup) throw pre(`Mã ca ${v.code} đã có`);
  if (input.id) {
    const before = await ctx.db.query.workShifts.findFirst({ where: eq(workShifts.id, input.id) });
    if (!before) throw notFound("Không tìm thấy ca");
    if (before.centerId !== input.centerId) throw bad("Không đổi phạm vi của ca");
    if (before.startTime !== v.startTime || before.endTime !== v.endTime || before.breakMinutes !== v.breakMinutes) {
      const [u] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(shiftAssignments).where(and(eq(shiftAssignments.shiftId, before.id), lte(shiftAssignments.date, todayISO())));
      if ((u?.n ?? 0) > 0) throw pre("Ca đã dùng cho ngày đã qua — không đổi giờ; tạo ca mới và tắt ca cũ");
    }
    await ctx.db.update(workShifts).set(v).where(eq(workShifts.id, before.id));
    await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "hr", entity: "work_shifts", entityId: before.id, before, after: v, ip: ctx.ip });
    return { id: before.id };
  }
  const [row] = await ctx.db.insert(workShifts).values(v).returning({ id: workShifts.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "hr", entity: "work_shifts", entityId: row!.id, after: v, ip: ctx.ip });
  return { id: row!.id };
}

export async function roster(ctx: ProtectedContext, input: { centerId: string; weekStart: string }) {
  requirePermission(ctx, "timesheet:read", { centerId: input.centerId });
  let ws = input.weekStart;
  while (weekdayOf(ws) !== 1) ws = addDays(ws, -1);
  const we = addDays(ws, 6);
  const people = await ctx.db.select({ id: staff.id, code: staff.code, fullName: staff.fullName, title: staff.title, status: staff.status, centerId: staff.centerId, leftAt: staff.leftAt })
    .from(staff).where(and(eq(staff.centerId, input.centerId), or(ne(staff.status, "resigned"), gte(staff.leftAt, ws))!)).orderBy(asc(staff.code));
  const days = await buildDays(ctx.db, people, ws, we);
  const center = await ctx.db.query.centers.findFirst({ where: eq(centers.id, input.centerId) });
  const locked = await periodLocked(ctx.db, input.centerId, datesBetween(ws, we));
  return {
    weekStart: ws, weekEnd: we, dates: datesBetween(ws, we), center, lockedPeriod: locked,
    canEdit: can(ctx, "timesheet:update", input.centerId), canConfigure: can(ctx, "timesheet:configure", input.centerId),
    shifts: await listShifts(ctx, { centerId: input.centerId }),
    rows: people.map((p) => ({ ...p, days: (days.get(p.id) ?? []).map((d) => ({ date: d.date, shift: d.shift, status: d.status, requests: d.requests })) })),
  };
}

export async function assignShifts(ctx: ProtectedContext, input: { centerId: string; entries: { staffId: string; date: string; shiftId: string | null }[] }) {
  requirePermission(ctx, "timesheet:update", { centerId: input.centerId });
  if (!input.entries.length) return { set: 0, cleared: 0 };
  const today = todayISO();
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
      if (!sh || !sh.isActive || (sh.centerId && sh.centerId !== input.centerId)) throw bad("Ca không hợp lệ cho cơ sở này");
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
        await tx.insert(shiftAssignments).values({ staffId: e.staffId, date: e.date, shiftId: e.shiftId, centerId: input.centerId, createdBy: ctx.user.id })
          .onConflictDoUpdate({ target: [shiftAssignments.staffId, shiftAssignments.date], set: { shiftId: e.shiftId, createdBy: ctx.user.id } });
        set++;
      } else {
        const d = await tx.delete(shiftAssignments).where(and(eq(shiftAssignments.staffId, e.staffId), eq(shiftAssignments.date, e.date))).returning({ id: shiftAssignments.id });
        cleared += d.length;
      }
    }
    await writeAudit(tx, { actorId: ctx.user.id, action: "UPDATE", module: "hr", entity: "shift_assignments", entityId: null, after: { centerId: input.centerId, set, cleared, dates: [...new Set(input.entries.map((e) => e.date))].sort() }, ip: ctx.ip });
  });
  const future = input.entries.filter((e) => e.date >= today);
  const users_ = people.filter((p) => future.some((f) => f.staffId === p.id)).map((p) => p.userId);
  await notify(ctx.db, users_, "Lịch ca thay đổi", `Cập nhật ${future.length} ngày ca làm`, "/cham-cong/lich-ca", 3);
  return { set, cleared };
}

export async function copyWeek(ctx: ProtectedContext, input: { centerId: string; fromWeek: string; toWeek: string; overwrite: boolean }) {
  requirePermission(ctx, "timesheet:update", { centerId: input.centerId });
  if (weekdayOf(input.fromWeek) !== 1 || weekdayOf(input.toWeek) !== 1) throw bad("Chọn ngày thứ Hai đầu tuần");
  if (input.toWeek <= input.fromWeek) throw bad("Tuần đích phải sau tuần nguồn");
  const src = await ctx.db.select().from(shiftAssignments).where(and(eq(shiftAssignments.centerId, input.centerId), gte(shiftAssignments.date, input.fromWeek), lte(shiftAssignments.date, addDays(input.fromWeek, 6))));
  const people = await ctx.db.select({ id: staff.id, status: staff.status }).from(staff).where(eq(staff.centerId, input.centerId));
  const shift = (d: string) => addDays(d, Math.round((Date.parse(input.toWeek) - Date.parse(input.fromWeek)) / 86400000));
  const target = src.filter((a) => people.find((p) => p.id === a.staffId && p.status !== "resigned"));
  const existing = await ctx.db.select({ staffId: shiftAssignments.staffId, date: shiftAssignments.date }).from(shiftAssignments)
    .where(and(eq(shiftAssignments.centerId, input.centerId), gte(shiftAssignments.date, input.toWeek), lte(shiftAssignments.date, addDays(input.toWeek, 6))));
  const entries = target.map((a) => ({ staffId: a.staffId, date: shift(a.date), shiftId: a.shiftId }))
    .filter((e) => input.overwrite || !existing.some((x) => x.staffId === e.staffId && x.date === e.date));
  const r = await assignShifts(ctx, { centerId: input.centerId, entries });
  return { ...r, skipped: target.length - entries.length };
}

export async function setCenterGeofence(ctx: ProtectedContext, input: { centerId: string; latitude: number | null; longitude: number | null; radiusM: number }) {
  requirePermission(ctx, "timesheet:configure", { centerId: input.centerId });
  if ((input.latitude == null) !== (input.longitude == null)) throw bad("Nhập đủ vĩ độ và kinh độ, hoặc để trống cả hai");
  if (input.latitude != null && (Math.abs(input.latitude) > 90 || Math.abs(input.longitude!) > 180)) throw bad("Toạ độ không hợp lệ");
  if (input.radiusM < 30 || input.radiusM > 2000) throw bad("Bán kính 30–2000m");
  const before = await ctx.db.query.centers.findFirst({ where: eq(centers.id, input.centerId) });
  await ctx.db.update(centers).set({ latitude: input.latitude, longitude: input.longitude, checkinRadiusM: input.radiusM }).where(eq(centers.id, input.centerId));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "hr", entity: "centers", entityId: input.centerId, before: { lat: before?.latitude, lng: before?.longitude, r: before?.checkinRadiusM }, after: input, ip: ctx.ip });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Chấm công cá nhân                                                   */
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
  const punches = await ctx.db.select({ kind: attendancePunches.kind, at: attendancePunches.at, source: attendancePunches.source, distanceM: attendancePunches.distanceM })
    .from(attendancePunches).where(and(eq(attendancePunches.staffId, s.id), gte(attendancePunches.at, vnStart(today)), lte(attendancePunches.at, vnEnd(today)))).orderBy(asc(attendancePunches.at));
  const reqs = await ctx.db.select().from(staffRequests).where(eq(staffRequests.staffId, s.id)).orderBy(desc(staffRequests.createdAt)).limit(30);
  return {
    staff: { id: s.id, code: s.code, fullName: s.fullName, title: s.title, status: s.status, centerId: s.centerId },
    center: center ? { code: center.code, name: center.name, hasGeofence: center.latitude != null, radiusM: center.checkinRadiusM } : null,
    today, todayCell, punches, period,
    weeks: all.filter((d) => d.date >= ws && d.date <= addDays(ws, 13)),
    month, summary: summarizeDays(month),
    leave: await leaveBalance(ctx.db, s, Number(today.slice(0, 4))),
    requests: reqs,
  };
}

export async function punch(ctx: ProtectedContext, input: { kind: "in" | "out"; lat?: number | null; lng?: number | null; accuracy?: number | null }) {
  const s = await myStaff(ctx);
  if (!s) throw pre("Tài khoản chưa gắn hồ sơ nhân sự — liên hệ nhân sự");
  if (s.status === "resigned") throw pre("Hồ sơ đã nghỉ việc");
  const today = todayISO();
  const asg = await ctx.db.query.shiftAssignments.findFirst({ where: and(eq(shiftAssignments.staffId, s.id), eq(shiftAssignments.date, today)) });
  const centerId = asg?.centerId ?? s.centerId;
  const center = await ctx.db.query.centers.findFirst({ where: eq(centers.id, centerId) });
  if (!center) throw pre("Không tìm thấy cơ sở");
  const pos = input.lat != null && input.lng != null ? { lat: input.lat, lng: input.lng, accuracy: input.accuracy ?? null } : null;
  const g = checkGeofence({ lat: center.latitude, lng: center.longitude, radiusM: center.checkinRadiusM }, pos);
  if (!g.ok) throw pre(g.reason ?? "Ngoài bán kính chấm công");
  await assertOpen(ctx.db, centerId, [today]);
  const [recent] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(attendancePunches)
    .where(and(eq(attendancePunches.staffId, s.id), eq(attendancePunches.kind, input.kind), gte(attendancePunches.at, new Date(Date.now() - 60_000))));
  if ((recent?.n ?? 0) > 0) throw pre("Bạn vừa chấm công — thử lại sau 1 phút");
  const now = new Date();
  const [row] = await ctx.db.insert(attendancePunches).values({
    staffId: s.id, centerId, kind: input.kind, at: now, source: "gps", lat: pos?.lat ?? null, lng: pos?.lng ?? null,
    accuracyM: pos?.accuracy != null ? Math.round(pos.accuracy) : null, distanceM: g.distanceM, ip: ctx.ip ?? null, createdBy: ctx.user.id,
    note: g.checked ? null : "Cơ sở chưa đặt toạ độ — không kiểm tra bán kính",
  }).returning({ id: attendancePunches.id });
  const warn = !asg ? "Hôm nay bạn không có ca — lượt chấm vẫn được lưu" : input.kind === "out" && vnParts(now).min < hhmm((await ctx.db.query.workShifts.findFirst({ where: eq(workShifts.id, asg.shiftId) }))!.endTime) ? "Chấm ra trước giờ kết thúc ca" : null;
  return { id: row!.id, at: now, distanceM: g.distanceM, checked: g.checked, warning: warn };
}

/* ------------------------------------------------------------------ */
/* Bảng công, chỉnh công, kỳ công                                      */
/* ------------------------------------------------------------------ */

export async function timesheet(ctx: ProtectedContext, input: { centerId: string; period: string; q?: string }) {
  requirePermission(ctx, "timesheet:read", { centerId: input.centerId });
  const { from, to } = rule(() => periodRange(input.period));
  const conds: SQL[] = [eq(staff.centerId, input.centerId), or(ne(staff.status, "resigned"), gte(staff.leftAt, from))!];
  if (input.q?.trim()) conds.push(or(ilike(staff.fullName, `%${input.q.trim()}%`), ilike(staff.code, `%${input.q.trim()}%`))!);
  const people = await ctx.db.select({ id: staff.id, code: staff.code, fullName: staff.fullName, title: staff.title, status: staff.status, centerId: staff.centerId })
    .from(staff).where(and(...conds)).orderBy(asc(staff.code));
  const days = await buildDays(ctx.db, people, from, to);
  const p = await ctx.db.query.timesheetPeriods.findFirst({ where: and(eq(timesheetPeriods.centerId, input.centerId), eq(timesheetPeriods.period, input.period)) });
  const [pend] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(staffRequests)
    .where(and(eq(staffRequests.centerId, input.centerId), eq(staffRequests.status, "pending"), lte(staffRequests.dateFrom, to), gte(staffRequests.dateTo, from)));
  const rows = people.map((x) => {
    const d = days.get(x.id) ?? [];
    return { ...x, summary: summarizeDays(d), days: d.map((c) => ({ date: c.date, status: c.status, units: c.units, lateMin: c.lateMin, earlyMin: c.earlyMin, inMin: c.inMin, outMin: c.outMin, shiftCode: c.shift?.code ?? null, otMin: c.otMin, paidLeave: c.paidLeave, unpaidLeave: c.unpaidLeave, holiday: c.holidayUnits, hasRequest: c.requests.some((r) => r.status === "pending"), override: !!c.override })) };
  });
  const missing = rows.reduce((s, r) => s + r.summary.missingCount, 0);
  const check = lockCheck({ pendingRequests: pend?.n ?? 0, missingPunches: missing, periodEnd: to, today: todayISO() });
  const unlockAllowed = centersWith(ctx, "timesheet:lock").includes(null) || isSA(ctx);
  return {
    period: input.period, from, to, dates: datesBetween(from, to),
    status: p?.status ?? "open", lockedAt: p?.lockedAt ?? null, unlockReason: p?.unlockReason ?? null,
    pendingRequests: pend?.n ?? 0, lockCheck: check,
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
  const locked = await periodLocked(ctx.db, s.centerId, [input.date]);
  return {
    staff: { id: s.id, code: s.code, fullName: s.fullName }, cell, locked,
    punches: punches.map((x) => ({ ...x.p, byName: x.byName })), requests: reqs,
    canOverride: can(ctx, "timesheet:update", s.centerId) && !locked && s.userId !== ctx.user.id,
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
      if (!before) throw pre("Ngày này chưa chỉnh công");
      await tx.delete(timesheetOverrides).where(eq(timesheetOverrides.id, before.id));
    } else {
      if (input.units < 0 || input.units > 1.5 || (input.units * 2) % 1 !== 0) throw bad("Công chỉnh là 0; 0,5; 1 hoặc 1,5");
      const label = (input.label ?? "").trim() || "Chỉnh công";
      await tx.insert(timesheetOverrides).values({ staffId: s.id, date: input.date, units: input.units, label, reason, createdBy: ctx.user.id })
        .onConflictDoUpdate({ target: [timesheetOverrides.staffId, timesheetOverrides.date], set: { units: input.units, label, reason, createdBy: ctx.user.id, updatedAt: new Date() } });
    }
    await writeAudit(tx, { actorId: ctx.user.id, action: before ? (input.units === null ? "DELETE" : "UPDATE") : "CREATE", module: "hr", entity: "timesheet_overrides", entityId: s.id, before: before ? { units: before.units, label: before.label } : null, after: { date: input.date, units: input.units, label: input.label }, reason, ip: ctx.ip });
    if (s.userId) await notify(tx, [s.userId], "Công ngày được chỉnh", `${input.date.split("-").reverse().join("/")}: ${input.units === null ? "bỏ chỉnh" : `${input.units} công`} — ${reason}`, "/cham-cong/lich-ca", 3);
  });
  return { ok: true };
}

export async function lockPeriod(ctx: ProtectedContext, input: { centerId: string; period: string }) {
  requirePermission(ctx, "timesheet:lock", { centerId: input.centerId });
  const t = await timesheet(ctx, { centerId: input.centerId, period: input.period });
  if (t.status === "locked") throw pre("Kỳ công đã khoá");
  if (t.lockCheck.blockers.length) throw pre(t.lockCheck.blockers);
  const snapshot = { rows: t.rows.map((r) => ({ staffId: r.id, code: r.code, fullName: r.fullName, ...r.summary })), warnings: t.lockCheck.warnings, lockedBy: ctx.user.fullName };
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    await tx.insert(timesheetPeriods).values({ centerId: input.centerId, period: input.period, status: "locked", lockedBy: ctx.user.id, lockedAt: new Date(), snapshot })
      .onConflictDoUpdate({ target: [timesheetPeriods.centerId, timesheetPeriods.period], set: { status: "locked", lockedBy: ctx.user.id, lockedAt: new Date(), snapshot } });
    await writeAudit(tx, { actorId: ctx.user.id, action: "TRANSITION", module: "hr", entity: "timesheet_periods", entityId: input.centerId, after: { period: input.period, status: "locked", staff: snapshot.rows.length }, ip: ctx.ip });
  });
  return { ok: true, warnings: t.lockCheck.warnings };
}

export async function unlockPeriod(ctx: ProtectedContext, input: { centerId: string; period: string; reason: string }) {
  if (!centersWith(ctx, "timesheet:lock").includes(null) && !isSA(ctx)) throw new TRPCError({ code: "FORBIDDEN", message: "Chỉ nhân sự Hội sở mở lại kỳ công đã khoá" });
  const reason = reasonOf(input.reason);
  const p = await ctx.db.query.timesheetPeriods.findFirst({ where: and(eq(timesheetPeriods.centerId, input.centerId), eq(timesheetPeriods.period, input.period)) });
  if (!p || p.status !== "locked") throw pre("Kỳ công chưa khoá");
  await ctx.db.update(timesheetPeriods).set({ status: "open", unlockReason: reason }).where(eq(timesheetPeriods.id, p.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "TRANSITION", module: "hr", entity: "timesheet_periods", entityId: input.centerId, before: { status: "locked" }, after: { period: input.period, status: "open" }, reason, ip: ctx.ip });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Đơn từ                                                              */
/* ------------------------------------------------------------------ */

export async function listRequests(ctx: ProtectedContext, input: { status?: RequestStatus; kind?: RequestKind; centerId?: string; mine?: boolean }) {
  const me = await myStaff(ctx);
  const approverScope = scopeSql(ctx, "timesheet:read", staffRequests.centerId as unknown as typeof staff.centerId);
  const base: SQL[] = [input.mine ? (me ? eq(staffRequests.staffId, me.id) : sql`false`) : (me ? or(approverScope, eq(staffRequests.staffId, me.id))! : approverScope)];
  if (input.kind) base.push(eq(staffRequests.kind, input.kind));
  if (input.centerId) base.push(eq(staffRequests.centerId, input.centerId));
  const where = input.status ? and(...base, eq(staffRequests.status, input.status)) : and(...base);
  const rows = await ctx.db.select({ r: staffRequests, staffCode: staff.code, staffName: staff.fullName, staffUserId: staff.userId, centerCode: centers.code, deciderName: users.fullName })
    .from(staffRequests).innerJoin(staff, eq(staff.id, staffRequests.staffId)).innerJoin(centers, eq(centers.id, staffRequests.centerId)).leftJoin(users, eq(users.id, staffRequests.decidedBy))
    .where(where).orderBy(sql`case when ${staffRequests.status} = 'pending' then 0 else 1 end`, desc(staffRequests.createdAt)).limit(500);
  const [counts] = await ctx.db.select({
    pending: sql<number>`count(*) filter (where ${staffRequests.status} = 'pending')::int`,
    approved: sql<number>`count(*) filter (where ${staffRequests.status} = 'approved')::int`,
    rejected: sql<number>`count(*) filter (where ${staffRequests.status} = 'rejected')::int`,
    cancelled: sql<number>`count(*) filter (where ${staffRequests.status} = 'cancelled')::int`,
  }).from(staffRequests).where(and(...base));
  const today = todayISO();
  return {
    counts, hasProfile: !!me, isApprover: centersWith(ctx, "timesheet:approve").length > 0,
    items: rows.map((x) => {
      const mine = x.staffUserId === ctx.user.id;
      const approver = can(ctx, "timesheet:approve", x.r.centerId);
      return {
        ...x.r, staffCode: x.staffCode, staffName: x.staffName, centerCode: x.centerCode, deciderName: x.deciderName, mine,
        canDecide: x.r.status === "pending" && approver && (!mine || isSA(ctx)),
        canCancel: (x.r.status === "pending" && (mine || approver)) || (x.r.status === "approved" && approver && !mine && x.r.dateTo >= addDays(today, -BACKDATE_ROSTER)),
      };
    }),
  };
}

export type CreateRequestInput = {
  staffId?: string | null;
  kind: RequestKind; dateFrom: string; dateTo: string; portion?: "full" | "am" | "pm" | null; leaveType?: LeaveType | null;
  lateMin?: number | null; earlyMin?: number | null; punchIn?: string | null; punchOut?: string | null; otStart?: string | null; otEnd?: string | null; reason: string;
};

export async function createRequest(ctx: ProtectedContext, input: CreateRequestInput) {
  const me = await myStaff(ctx);
  let s = me;
  if (input.staffId && input.staffId !== me?.id) {
    s = await ctx.db.query.staff.findFirst({ where: eq(staff.id, input.staffId) });
    if (!s) throw notFound("Không tìm thấy nhân sự");
    requirePermission(ctx, "timesheet:update", { centerId: s.centerId });
  }
  if (!s) throw pre("Tài khoản chưa gắn hồ sơ nhân sự — liên hệ nhân sự");
  if (s.status === "resigned") throw pre("Hồ sơ đã nghỉ việc");
  const today = todayISO();
  const dateTo = input.kind === "leave" ? input.dateTo : input.dateFrom;
  const r = { ...input, dateTo, reason: input.reason ?? "" };
  const errs = validateRequest(r, today);
  if (errs.length) throw bad(errs);
  const dates = datesBetween(input.dateFrom, dateTo);
  await assertOpen(ctx.db, s.centerId, dates);
  const clash = await ctx.db.select({ id: staffRequests.id, kind: staffRequests.kind, dateFrom: staffRequests.dateFrom }).from(staffRequests)
    .where(and(eq(staffRequests.staffId, s.id), eq(staffRequests.kind, input.kind), inArray(staffRequests.status, ["pending", "approved"]), lte(staffRequests.dateFrom, dateTo), gte(staffRequests.dateTo, input.dateFrom))).limit(1);
  if (clash[0] && input.kind !== "overtime") throw pre(`Đã có đơn ${REQUEST_KIND_VI[input.kind].toLowerCase()} trùng ngày ${clash[0].dateFrom.split("-").reverse().join("/")}`);
  let days = 0;
  if (input.kind === "leave") {
    const sched = await ctx.db.select({ date: shiftAssignments.date }).from(shiftAssignments).where(and(eq(shiftAssignments.staffId, s.id), gte(shiftAssignments.date, input.dateFrom), lte(shiftAssignments.date, dateTo)));
    days = leaveDays(input.dateFrom, dateTo, input.portion, new Set(sched.map((x) => x.date)));
    if (days <= 0) throw pre("Không có ngày làm việc nào trong khoảng đã chọn");
    if (input.leaveType === "annual") {
      const bal = await leaveBalance(ctx.db, s, Number(input.dateFrom.slice(0, 4)));
      if (days > bal.remaining) throw pre(`Phép năm còn ${bal.remaining} ngày (đã dùng ${bal.used}, chờ duyệt ${bal.pending}) — chọn nghỉ không lương cho phần vượt`);
    }
  }
  if (input.kind === "missing_punch") {
    const cell = (await buildDays(ctx.db, [s], input.dateFrom, input.dateFrom)).get(s.id)![0]!;
    if (input.punchIn && cell.inMin != null) throw pre("Ngày này đã có giờ vào");
    if (input.punchOut && cell.outMin != null) throw pre("Ngày này đã có giờ ra");
  }
  const row = await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    const [x] = await tx.insert(staffRequests).values({
      staffId: s.id, centerId: s.centerId, kind: input.kind, status: "pending", dateFrom: input.dateFrom, dateTo,
      portion: input.kind === "leave" ? input.portion ?? "full" : null, leaveType: input.kind === "leave" ? input.leaveType ?? null : null,
      days, minutes: requestMinutes(r), lateMin: input.kind === "late_early" ? input.lateMin || null : null, earlyMin: input.kind === "late_early" ? input.earlyMin || null : null,
      punchIn: input.kind === "missing_punch" ? input.punchIn || null : null, punchOut: input.kind === "missing_punch" ? input.punchOut || null : null,
      otStart: input.kind === "overtime" ? input.otStart ?? null : null, otEnd: input.kind === "overtime" ? input.otEnd ?? null : null,
      reason: input.reason.trim(), createdBy: ctx.user.id,
    }).returning({ id: staffRequests.id });
    const approvers = (await approversOf(tx, s.centerId)).filter((u) => u !== s.userId);
    await notify(tx, approvers, `Đơn ${REQUEST_KIND_VI[input.kind].toLowerCase()} chờ duyệt`, `${s.fullName} · ${input.dateFrom.split("-").reverse().join("/")}${dateTo !== input.dateFrom ? ` → ${dateTo.split("-").reverse().join("/")}` : ""}`, "/don-tu?status=pending", 2);
    await writeAudit(tx, { actorId: ctx.user.id, action: "CREATE", module: "hr", entity: "staff_requests", entityId: x!.id, after: { staff: s.code, kind: input.kind, from: input.dateFrom, to: dateTo, days }, ip: ctx.ip });
    return x!;
  });
  return { id: row.id, days };
}

export async function decideRequest(ctx: ProtectedContext, input: { id: string; action: "approve" | "reject" | "cancel"; note?: string | null }) {
  const r = await ctx.db.query.staffRequests.findFirst({ where: eq(staffRequests.id, input.id) });
  if (!r) throw notFound("Không tìm thấy đơn");
  const s = (await ctx.db.query.staff.findFirst({ where: eq(staff.id, r.staffId) }))!;
  const isRequester = s.userId === ctx.user.id;
  const isApprover = can(ctx, "timesheet:approve", r.centerId);
  if (!isRequester && !isApprover) throw new TRPCError({ code: "FORBIDDEN", message: "Không có quyền timesheet:approve" });
  const to = rule(() => requestTransition(r.status, input.action, { isRequester, isApprover, isSuperAdmin: isSA(ctx) }));
  const note = input.action === "reject" || (input.action === "cancel" && r.status === "approved") ? reasonOf(input.note) : input.note?.trim() || null;
  await assertOpen(ctx.db, r.centerId, datesBetween(r.dateFrom, r.dateTo));
  if (input.action === "approve" && r.kind === "leave" && r.leaveType === "annual") {
    const bal = await leaveBalance(ctx.db, s, Number(r.dateFrom.slice(0, 4)));
    if (bal.used + r.days > bal.entitled) throw pre(`Vượt phép năm: còn ${bal.entitled - bal.used} ngày`);
  }
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    const up = await tx.update(staffRequests).set({ status: to, decidedBy: ctx.user.id, decidedAt: new Date(), decisionNote: note })
      .where(and(eq(staffRequests.id, r.id), eq(staffRequests.status, r.status))).returning({ id: staffRequests.id });
    if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Đơn vừa được xử lý" });
    if (input.action === "approve" && r.kind === "missing_punch") {
      const add = (kind: "in" | "out", t: string) => ({ staffId: s.id, centerId: r.centerId, kind, at: new Date(`${r.dateFrom}T${t.padStart(5, "0")}:00+07:00`), source: "request", requestId: r.id, note: `Đơn quên chấm công — duyệt bởi ${ctx.user.fullName}`, createdBy: ctx.user.id });
      const rows = [...(r.punchIn ? [add("in", r.punchIn)] : []), ...(r.punchOut ? [add("out", r.punchOut)] : [])];
      if (rows.length) await tx.insert(attendancePunches).values(rows);
    }
    await writeAudit(tx, { actorId: ctx.user.id, action: "TRANSITION", module: "hr", entity: "staff_requests", entityId: r.id, before: { status: r.status }, after: { status: to }, reason: note, ip: ctx.ip });
    if (!isRequester) {
      const title = to === "approved" ? "Đơn đã được duyệt" : to === "rejected" ? "Đơn bị từ chối" : "Đơn đã bị huỷ";
      await notify(tx, [s.userId], title, `${REQUEST_KIND_VI[r.kind]} ${r.dateFrom.split("-").reverse().join("/")}${note ? ` — ${note}` : ""}`, "/cham-cong/lich-ca", to === "approved" ? 3 : 1);
    }
  });
  if (input.action === "cancel" && r.status === "approved" && r.kind === "missing_punch") {
    return { status: to, warning: "Lượt chấm đã thêm từ đơn vẫn giữ (sổ chấm công chỉ thêm) — dùng chỉnh công nếu cần" };
  }
  return { status: to, warning: null as string | null };
}

export async function hrQueues(ctx: ProtectedContext) {
  const out: { key: string; title: string; count: number; overdue: number; href: string }[] = [];
  const cs = centersWith(ctx, "timesheet:approve");
  if (!cs.length) return out;
  const [r] = await ctx.db.select({ n: sql<number>`count(*)::int`, old: sql<number>`count(*) filter (where ${staffRequests.createdAt} < now() - interval '48 hours' or ${staffRequests.dateFrom} <= current_date)::int` })
    .from(staffRequests).innerJoin(staff, eq(staff.id, staffRequests.staffId))
    .where(and(eq(staffRequests.status, "pending"), scopeSql(ctx, "timesheet:approve", staffRequests.centerId as unknown as typeof staff.centerId), or(isNull(staff.userId), ne(staff.userId, ctx.user.id))!));
  out.push({ key: "staff_requests", title: "Đơn từ nhân sự chờ duyệt", count: r?.n ?? 0, overdue: r?.old ?? 0, href: "/don-tu?status=pending" });
  return out;
}

