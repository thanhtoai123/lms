/**
 * Đơn từ nhân sự — 10 loại, 3 nhóm.
 *
 * Nguyên tắc bản gốc: **duyệt là áp ngay** trong cùng thao tác (đổi mã ca trên lưới,
 * ghi mã nghỉ, thêm mốc giờ chỉnh tay, huỷ buổi dạy hoặc gán người dạy thay).
 * Áp không được (lớp đã điểm danh, kỳ công đã khoá…) → đơn **quay lại Chờ duyệt**
 * kèm lý do, người duyệt được báo. Không bao giờ có đơn "đã duyệt" mà lịch chưa đổi.
 */
import { and, eq, inArray, sql, desc, asc, isNull, or, gte, lte, ne, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { staff, staffRequests, shiftAssignments, workShifts, attendancePunches, timesheetFlagReviews, centers, users, classes, teachers } from "@satarobo/db";
import {
  validateRequest, requestTransition, requestMinutes, leaveDays, isLateSubmission, describeRequestEffect, datesBetween, addDays,
  leaveIsPaid, leaveUsesBalance, isClassRequest, APPROVAL_SLA_DAYS,
  SHIFT_CODE_LEAVE, SHIFT_CODE_REMOTE, SHIFT_CODE_FIELD,
  REQUEST_KIND_VI, REQUEST_KIND_GROUP,
  type RequestKind, type RequestStatus, type LeaveType, type LateEarlyKind,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { todayISO } from "./sessions";
import {
  bad, pre, notFound, forbidden, rule, can, isSA, centersWith, scopeSql, reasonOf, dmy, notify, myStaff,
  approversOf, assertOpen, periodLocked, buildDays, leaveBalance, type Db,
} from "./hrShared";
import { cancelSessionForRequest, setSessionTeacherForRequest, findSession } from "./hrSessionEffects";

type RequestRow = typeof staffRequests.$inferSelect;

/* ------------------------------------------------------------------ */
/* Danh sách                                                           */
/* ------------------------------------------------------------------ */

export async function listRequests(ctx: ProtectedContext, input: { status?: RequestStatus; kind?: RequestKind; centerId?: string; mine?: boolean; applyFailed?: boolean }) {
  const me = await myStaff(ctx);
  const approverScope = scopeSql(ctx, "timesheet:read", staffRequests.centerId as unknown as typeof staff.centerId);
  const base: SQL[] = [input.mine ? (me ? eq(staffRequests.staffId, me.id) : sql`false`) : (me ? or(approverScope, eq(staffRequests.staffId, me.id))! : approverScope)];
  if (input.kind) base.push(eq(staffRequests.kind, input.kind));
  if (input.centerId) base.push(eq(staffRequests.centerId, input.centerId));
  if (input.applyFailed) base.push(sql`${staffRequests.applyError} is not null`);
  const where = input.status ? and(...base, eq(staffRequests.status, input.status)) : and(...base);
  const rows = await ctx.db.select({
    r: staffRequests, staffCode: staff.code, staffName: staff.fullName, staffUserId: staff.userId, centerCode: centers.code,
    deciderName: users.fullName, className: classes.code, targetName: sql<string | null>`(select s2.full_name from staff s2 where s2.id = ${staffRequests.targetStaffId})`,
  })
    .from(staffRequests).innerJoin(staff, eq(staff.id, staffRequests.staffId)).innerJoin(centers, eq(centers.id, staffRequests.centerId))
    .leftJoin(users, eq(users.id, staffRequests.decidedBy)).leftJoin(classes, eq(classes.id, staffRequests.classId))
    .where(where).orderBy(sql`case when ${staffRequests.status} = 'pending' then 0 else 1 end`, desc(staffRequests.createdAt)).limit(500);
  const [counts] = await ctx.db.select({
    pending: sql<number>`count(*) filter (where ${staffRequests.status} = 'pending')::int`,
    approved: sql<number>`count(*) filter (where ${staffRequests.status} = 'approved')::int`,
    rejected: sql<number>`count(*) filter (where ${staffRequests.status} = 'rejected')::int`,
    cancelled: sql<number>`count(*) filter (where ${staffRequests.status} = 'cancelled')::int`,
    late: sql<number>`count(*) filter (where ${staffRequests.status} = 'pending' and ${staffRequests.lateSubmission})::int`,
    overdue: sql<number>`count(*) filter (where ${staffRequests.status} = 'pending' and ${staffRequests.createdAt} < now() - interval '2 days')::int`,
    failed: sql<number>`count(*) filter (where ${staffRequests.status} = 'pending' and ${staffRequests.applyError} is not null)::int`,
  }).from(staffRequests).where(and(...base));
  const today = todayISO();
  return {
    counts, hasProfile: !!me, isApprover: centersWith(ctx, "timesheet:approve").length > 0,
    slaDays: APPROVAL_SLA_DAYS,
    items: rows.map((x) => {
      const mine = x.staffUserId === ctx.user.id;
      const approver = can(ctx, "timesheet:approve", x.r.centerId);
      const ageDays = Math.floor((Date.now() - x.r.createdAt.getTime()) / 86400000);
      return {
        ...x.r, staffCode: x.staffCode, staffName: x.staffName, centerCode: x.centerCode, deciderName: x.deciderName,
        className: x.className, targetName: x.targetName, mine, group: REQUEST_KIND_GROUP[x.r.kind], ageDays,
        overdue: x.r.status === "pending" && ageDays > APPROVAL_SLA_DAYS,
        canDecide: x.r.status === "pending" && approver && (!mine || isSA(ctx)),
        canCancel: (x.r.status === "pending" && (mine || approver)) || (x.r.status === "approved" && approver && !mine && x.r.dateTo >= addDays(today, -31)),
      };
    }),
  };
}

/** Dữ liệu cho form tạo đơn: mã ca, lớp của tôi, đồng nghiệp, cơ sở nhận đơn */
export async function requestFormData(ctx: ProtectedContext) {
  const me = await myStaff(ctx);
  const today = todayISO();
  const cs = await ctx.db.select({ id: centers.id, code: centers.code, name: centers.name }).from(centers).where(eq(centers.isActive, true)).orderBy(asc(centers.code));
  if (!me) return { staff: null, centers: cs, shifts: [], classes: [], colleagues: [], leave: null, isHo: false, today };
  const home = cs.find((c) => c.id === me.centerId);
  const isHo = (home?.code ?? "").toUpperCase().startsWith("HO");
  const shifts = await ctx.db.select({ id: workShifts.id, code: workShifts.code, name: workShifts.name, kind: workShifts.kind, units: workShifts.units })
    .from(workShifts).where(and(eq(workShifts.isActive, true), or(isNull(workShifts.centerId), eq(workShifts.centerId, me.centerId))!)).orderBy(asc(workShifts.sortOrder), asc(workShifts.code));
  const myClasses = me.teacherId
    ? await ctx.db.select({ id: classes.id, code: classes.code, name: classes.name }).from(classes).where(and(or(eq(classes.leadTeacherId, me.teacherId), eq(classes.assistantTeacherId, me.teacherId))!, inArray(classes.status, ["running", "recruiting"]))).orderBy(asc(classes.code))
    : [];
  const colleagues = await ctx.db.select({ id: staff.id, code: staff.code, fullName: staff.fullName, isTeacher: sql<boolean>`${staff.teacherId} is not null` })
    .from(staff).where(and(eq(staff.centerId, me.centerId), ne(staff.id, me.id), ne(staff.status, "resigned"))).orderBy(asc(staff.fullName));
  return {
    staff: { id: me.id, code: me.code, fullName: me.fullName, centerId: me.centerId, isTeacher: !!me.teacherId, exempt: me.timesheetExempt },
    centers: cs, shifts, classes: myClasses, colleagues, isHo, today,
    leave: await leaveBalance(ctx.db, me, Number(today.slice(0, 4))),
  };
}

/* ------------------------------------------------------------------ */
/* Tạo đơn                                                             */
/* ------------------------------------------------------------------ */

export interface CreateRequestInput {
  staffId?: string | null;
  kind: RequestKind;
  dateFrom: string;
  dateTo?: string | null;
  reason: string;
  classId?: string | null;
  targetStaffId?: string | null;
  requesterShiftId?: string | null;
  targetShiftId?: string | null;
  leaveType?: LeaveType | null;
  portion?: "full" | "am" | "pm" | null;
  lateEarlyKind?: LateEarlyKind | null;
  atTime?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  punchIn?: string | null;
  punchOut?: string | null;
  destination?: string | null;
  receivingCenterId?: string | null;
}

const SINGLE_DAY: RequestKind[] = ["class_change", "sub_teach", "class_off", "shift_swap", "overtime", "late_early", "timesheet_fix"];

async function shiftCodeOn(db: Db, staffId: string, date: string) {
  const [row] = await db.select({ code: workShifts.code }).from(shiftAssignments).innerJoin(workShifts, eq(workShifts.id, shiftAssignments.shiftId))
    .where(and(eq(shiftAssignments.staffId, staffId), eq(shiftAssignments.date, date))).limit(1);
  return row?.code ?? null;
}

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
  const dateTo = SINGLE_DAY.includes(input.kind) ? input.dateFrom : input.dateTo || input.dateFrom;
  const center = await ctx.db.query.centers.findFirst({ where: eq(centers.id, s.centerId) });
  const isHo = (center?.code ?? "").toUpperCase().startsWith("HO");
  const r = { ...input, dateTo, reason: input.reason ?? "", needsCenterChoice: isHo };
  const errs = rule(() => validateRequest(r, today));
  if (errs.length) throw bad(errs);
  if (isClassRequest(input.kind) && !s.teacherId) throw pre("Đơn nhóm lớp học chỉ dành cho giáo viên có lớp");
  const centerId = isHo ? input.receivingCenterId! : s.centerId;
  if (isHo) {
    const rc = await ctx.db.query.centers.findFirst({ where: eq(centers.id, centerId) });
    if (!rc) throw bad("Cơ sở nhận đơn không hợp lệ");
  }
  const dates = datesBetween(input.dateFrom, dateTo);
  await assertOpen(ctx.db, centerId, dates);

  // kiểm tra trùng đơn cùng loại cùng ngày (trừ tăng ca: được nhiều đơn / ngày)
  if (input.kind !== "overtime") {
    const [clash] = await ctx.db.select({ id: staffRequests.id, dateFrom: staffRequests.dateFrom }).from(staffRequests)
      .where(and(eq(staffRequests.staffId, s.id), eq(staffRequests.kind, input.kind), inArray(staffRequests.status, ["pending", "approved"]), lte(staffRequests.dateFrom, dateTo), gte(staffRequests.dateTo, input.dateFrom))).limit(1);
    if (clash) throw pre(`Đã có đơn ${REQUEST_KIND_VI[input.kind].toLowerCase()} trùng ngày ${dmy(clash.dateFrom)}`);
  }

  // dữ liệu riêng theo loại
  let days = 0;
  let leavePaid: boolean | null = null;
  if (input.kind === "leave") {
    const sched = await ctx.db.select({ date: shiftAssignments.date }).from(shiftAssignments)
      .where(and(eq(shiftAssignments.staffId, s.id), gte(shiftAssignments.date, input.dateFrom), lte(shiftAssignments.date, dateTo)));
    days = leaveDays(input.dateFrom, dateTo, input.portion, new Set(sched.map((x) => x.date)));
    if (days <= 0) throw pre("Không có ngày làm việc nào trong khoảng đã chọn");
    leavePaid = leaveIsPaid(input.leaveType!);
    if (leaveUsesBalance(input.leaveType!)) {
      const bal = await leaveBalance(ctx.db, s, Number(input.dateFrom.slice(0, 4)));
      if (days > bal.remaining) throw pre(`Phép năm còn ${bal.remaining} ngày (đã dùng ${bal.used}, chờ duyệt ${bal.pending}) — chọn nghỉ không lương cho phần vượt`);
    }
  }
  if (input.kind === "timesheet_fix") {
    const cell = (await buildDays(ctx.db, [s], input.dateFrom, input.dateFrom)).get(s.id)![0]!;
    if (input.punchIn && cell.inMin != null) throw pre("Ngày này đã có giờ vào");
    if (input.punchOut && cell.outMin != null) throw pre("Ngày này đã có giờ ra");
  }
  if (isClassRequest(input.kind)) {
    const cls = await ctx.db.query.classes.findFirst({ where: eq(classes.id, input.classId!) });
    if (!cls) throw notFound("Không tìm thấy lớp");
    if (!s.teacherId || (cls.leadTeacherId !== s.teacherId && cls.assistantTeacherId !== s.teacherId)) throw pre("Chỉ làm đơn cho lớp mình phụ trách");
    const ss = await findSession(ctx.db, input.classId!, input.dateFrom);
    if (!ss) throw pre(`Lớp không có buổi học ngày ${dmy(input.dateFrom)}`);
  }
  if (input.targetStaffId) {
    const t = await ctx.db.query.staff.findFirst({ where: eq(staff.id, input.targetStaffId) });
    if (!t || t.status === "resigned") throw bad("Người được chọn không hợp lệ");
    if (t.id === s.id) throw bad("Không chọn chính mình");
  }
  for (const shId of [input.requesterShiftId, input.targetShiftId]) {
    if (!shId) continue;
    const sh = await ctx.db.query.workShifts.findFirst({ where: eq(workShifts.id, shId) });
    if (!sh || !sh.isActive || (sh.centerId && sh.centerId !== centerId)) throw bad("Mã ca không hợp lệ");
  }

  const preview = describeRequestEffect(r, {
    currentShiftCode: await shiftCodeOn(ctx.db, s.id, input.dateFrom),
    newShiftCode: input.requesterShiftId ? (await ctx.db.query.workShifts.findFirst({ where: eq(workShifts.id, input.requesterShiftId) }))?.code ?? null : null,
    targetName: input.targetStaffId ? (await ctx.db.query.staff.findFirst({ where: eq(staff.id, input.targetStaffId) }))?.fullName ?? null : null,
    targetCurrentShiftCode: input.targetStaffId ? await shiftCodeOn(ctx.db, input.targetStaffId, input.dateFrom) : null,
    targetNewShiftCode: input.targetShiftId ? (await ctx.db.query.workShifts.findFirst({ where: eq(workShifts.id, input.targetShiftId) }))?.code ?? null : null,
    className: input.classId ? (await ctx.db.query.classes.findFirst({ where: eq(classes.id, input.classId) }))?.code ?? null : null,
  });
  const late = isLateSubmission({ kind: input.kind, dateFrom: input.dateFrom }, today);

  const row = await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    const [x] = await tx.insert(staffRequests).values({
      staffId: s.id, centerId, kind: input.kind, status: "pending", dateFrom: input.dateFrom, dateTo,
      classId: input.classId ?? null, targetStaffId: input.targetStaffId ?? null,
      requesterShiftId: input.requesterShiftId ?? null, targetShiftId: input.targetShiftId ?? null,
      portion: input.kind === "leave" ? input.portion ?? "full" : null,
      leaveType: input.kind === "leave" ? input.leaveType ?? null : null, leavePaid,
      lateEarlyKind: input.kind === "late_early" ? input.lateEarlyKind ?? null : null,
      atTime: input.kind === "late_early" ? input.atTime ?? null : null,
      startTime: input.kind === "overtime" ? input.startTime ?? null : null,
      endTime: input.kind === "overtime" ? input.endTime ?? null : null,
      punchIn: input.kind === "timesheet_fix" ? input.punchIn || null : null,
      punchOut: input.kind === "timesheet_fix" ? input.punchOut || null : null,
      destination: input.kind === "business_trip" ? input.destination?.trim() ?? null : null,
      days, minutes: requestMinutes(r), reason: input.reason.trim(),
      lateSubmission: late, effectPreview: preview, createdBy: ctx.user.id,
    }).returning({ id: staffRequests.id });
    const approvers = (await approversOf(tx, centerId)).filter((u) => u !== s.userId);
    await notify(tx, approvers, `Đơn ${REQUEST_KIND_VI[input.kind].toLowerCase()} chờ duyệt${late ? " (nộp muộn)" : ""}`,
      `${s.fullName} · ${dmy(input.dateFrom)}${dateTo !== input.dateFrom ? ` → ${dmy(dateTo)}` : ""} · ${preview}`, "/don-tu?status=pending", late ? 1 : 2);
    await writeAudit(tx, { actorId: ctx.user.id, action: "CREATE", module: "hr", entity: "staff_requests", entityId: x!.id, after: { staff: s.code, kind: input.kind, from: input.dateFrom, to: dateTo, days, late, preview }, ip: ctx.ip });
    return x!;
  });
  return { id: row.id, days, lateSubmission: late, preview };
}

/* ------------------------------------------------------------------ */
/* Áp hệ quả khi duyệt                                                 */
/* ------------------------------------------------------------------ */

async function shiftByCode(tx: Db, centerId: string, code: string) {
  const [sh] = await tx.select().from(workShifts)
    .where(and(eq(workShifts.code, code), eq(workShifts.isActive, true), or(isNull(workShifts.centerId), eq(workShifts.centerId, centerId))!))
    .orderBy(asc(workShifts.centerId)).limit(1);
  if (!sh) throw pre(`Danh mục chưa có mã ca "${code}" — khai ở Cấu hình → Mã ca rồi duyệt lại`);
  return sh;
}

async function setCell(tx: Db, ctx: ProtectedContext, p: { staffId: string; centerId: string; date: string; shiftId: string; requestId: string; note: string }) {
  await tx.insert(shiftAssignments).values({
    staffId: p.staffId, date: p.date, shiftId: p.shiftId, centerId: p.centerId,
    origin: "request", sourceRequestId: p.requestId, note: p.note, createdBy: ctx.user.id,
  }).onConflictDoUpdate({
    target: [shiftAssignments.staffId, shiftAssignments.date],
    set: { shiftId: p.shiftId, origin: "request", sourceRequestId: p.requestId, note: p.note, createdBy: ctx.user.id },
  });
}

/** Áp hệ quả của đơn đã duyệt. Ném lỗi → đơn quay lại chờ duyệt kèm `applyError`. */
export async function applyRequest(tx: Db, ctx: ProtectedContext, r: RequestRow, s: typeof staff.$inferSelect): Promise<{ label: string }> {
  const dates = datesBetween(r.dateFrom, r.dateTo);
  const note = `Đơn ${REQUEST_KIND_VI[r.kind].toLowerCase()} — duyệt bởi ${ctx.user.fullName}`;
  const locked = await periodLocked(tx, r.centerId, dates);
  if (locked) throw pre(`Kỳ công ${locked} đã khoá — mở lại kỳ rồi duyệt`);
  switch (r.kind) {
    case "class_off": {
      const res = await cancelSessionForRequest(tx, ctx, { classId: r.classId!, date: r.dateFrom, reason: r.reason });
      await tx.update(staffRequests).set({ sessionId: res.sessionId }).where(eq(staffRequests.id, r.id));
      return { label: res.label };
    }
    case "sub_teach":
    case "class_change": {
      if (!r.targetStaffId) throw pre("Chưa chỉ định người dạy thay — chọn người rồi duyệt lại");
      const res = await setSessionTeacherForRequest(tx, ctx, { classId: r.classId!, date: r.dateFrom, targetStaffId: r.targetStaffId, reason: r.reason });
      await tx.update(staffRequests).set({ sessionId: res.sessionId }).where(eq(staffRequests.id, r.id));
      return { label: res.label };
    }
    case "shift_swap": {
      if (!r.requesterShiftId) throw pre("Đơn thiếu mã ca mới");
      const mineBefore = await tx.select({ shiftId: shiftAssignments.shiftId }).from(shiftAssignments)
        .where(and(eq(shiftAssignments.staffId, r.staffId), eq(shiftAssignments.date, r.dateFrom))).limit(1);
      await setCell(tx, ctx, { staffId: r.staffId, centerId: r.centerId, date: r.dateFrom, shiftId: r.requesterShiftId, requestId: r.id, note });
      let extra = "";
      if (r.targetStaffId) {
        const t = await tx.query.staff.findFirst({ where: eq(staff.id, r.targetStaffId) });
        if (!t || t.status === "resigned") throw pre("Người nhận ca đã nghỉ việc — chọn người khác");
        const targetShiftId = r.targetShiftId ?? mineBefore[0]?.shiftId ?? null;
        if (!targetShiftId) throw pre("Người nộp chưa có ca ngày này — chọn mã ca cho người nhận");
        await setCell(tx, ctx, { staffId: t.id, centerId: t.centerId, date: r.dateFrom, shiftId: targetShiftId, requestId: r.id, note });
        if (t.userId) await notify(tx, [t.userId], "Bạn nhận ca theo đơn đã duyệt", `${dmy(r.dateFrom)} — ${note}`, "/cham-cong/lich-ca", 3);
        extra = ` · ${t.fullName} nhận ca`;
      }
      const code = (await tx.query.workShifts.findFirst({ where: eq(workShifts.id, r.requesterShiftId) }))?.code ?? "?";
      return { label: `Ca ${dmy(r.dateFrom)} → ${code}${extra}` };
    }
    case "leave": {
      if (r.portion && r.portion !== "full") return { label: `Nghỉ nửa ngày ${dmy(r.dateFrom)} — giữ ca, trừ 0,5 ngày phép` };
      const sh = await shiftByCode(tx, r.centerId, SHIFT_CODE_LEAVE);
      let n = 0;
      for (const d of dates) {
        await setCell(tx, ctx, { staffId: r.staffId, centerId: r.centerId, date: d, shiftId: sh.id, requestId: r.id, note });
        n++;
      }
      return { label: `${n} ngày ghi mã ${sh.code}` };
    }
    case "remote":
    case "business_trip": {
      const sh = await shiftByCode(tx, r.centerId, r.kind === "remote" ? SHIFT_CODE_REMOTE : SHIFT_CODE_FIELD);
      for (const d of dates) await setCell(tx, ctx, { staffId: r.staffId, centerId: r.centerId, date: d, shiftId: sh.id, requestId: r.id, note: `${note}${r.destination ? ` · ${r.destination}` : ""}` });
      return { label: `${dates.length} ngày ghi mã ${sh.code}${r.destination ? ` · ${r.destination}` : ""}` };
    }
    case "timesheet_fix": {
      const add = (kind: "in" | "out", t: string) => ({
        staffId: s.id, centerId: r.centerId, kind, at: new Date(`${r.dateFrom}T${t.padStart(5, "0")}:00+07:00`),
        source: "request", pointId: null, flags: ["manual_fix"], requestId: r.id,
        note: `Đơn chỉnh công — duyệt bởi ${ctx.user.fullName}`, createdBy: ctx.user.id,
      });
      const rows = [...(r.punchIn ? [add("in", r.punchIn)] : []), ...(r.punchOut ? [add("out", r.punchOut)] : [])];
      if (!rows.length) throw pre("Đơn không có mốc giờ nào để ghi");
      await tx.insert(attendancePunches).values(rows);
      return { label: `Thêm ${rows.length} mốc giờ ngày ${dmy(r.dateFrom)}` };
    }
    case "late_early": {
      const flag = r.lateEarlyKind === "early" ? "early" : "late";
      await tx.insert(timesheetFlagReviews).values({
        staffId: r.staffId, centerId: r.centerId, date: r.dateFrom, flag, action: "ack",
        note: `Đơn ${REQUEST_KIND_VI[r.kind].toLowerCase()} đã duyệt: ${r.reason}`, reviewedBy: ctx.user.id,
      }).onConflictDoUpdate({
        target: [timesheetFlagReviews.staffId, timesheetFlagReviews.date, timesheetFlagReviews.flag],
        set: { action: "ack", note: `Đơn ${REQUEST_KIND_VI[r.kind].toLowerCase()} đã duyệt: ${r.reason}`, reviewedBy: ctx.user.id, updatedAt: new Date() },
      });
      return { label: `Bỏ qua cờ ${flag === "late" ? "đi muộn" : "về sớm"} ngày ${dmy(r.dateFrom)}` };
    }
    case "overtime":
      return { label: `Ghi nhận ${r.minutes} phút tăng ca ngày ${dmy(r.dateFrom)}` };
    default:
      throw pre(`Chưa hỗ trợ áp đơn loại "${r.kind}"`);
  }
}

/* ------------------------------------------------------------------ */
/* Duyệt / từ chối / huỷ                                               */
/* ------------------------------------------------------------------ */

export async function decideRequest(ctx: ProtectedContext, input: { id: string; action: "approve" | "reject" | "cancel"; note?: string | null; targetStaffId?: string | null }) {
  const r = await ctx.db.query.staffRequests.findFirst({ where: eq(staffRequests.id, input.id) });
  if (!r) throw notFound("Không tìm thấy đơn");
  const s = (await ctx.db.query.staff.findFirst({ where: eq(staff.id, r.staffId) }))!;
  const isRequester = s.userId === ctx.user.id;
  const isApprover = can(ctx, "timesheet:approve", r.centerId);
  if (!isRequester && !isApprover) throw forbidden("Không có quyền timesheet:approve");
  const to = rule(() => requestTransition(r.status, input.action, { isRequester, isApprover, isSuperAdmin: isSA(ctx) }));
  // Từ chối bắt buộc nhập lý do — người nộp đọc nguyên văn
  const note = input.action === "reject" || (input.action === "cancel" && r.status === "approved") ? reasonOf(input.note) : input.note?.trim() || null;
  if (input.action === "approve" && r.kind === "leave" && r.leaveType && leaveUsesBalance(r.leaveType)) {
    const bal = await leaveBalance(ctx.db, s, Number(r.dateFrom.slice(0, 4)));
    if (bal.used + r.days > bal.entitled) throw pre(`Vượt phép năm: còn ${bal.entitled - bal.used} ngày`);
  }
  if (input.action !== "approve") await assertOpen(ctx.db, r.centerId, datesBetween(r.dateFrom, r.dateTo));

  const out: { applyError: string | null; applied: string | null } = { applyError: null, applied: null };
  await ctx.db.transaction(async (txx) => {
    const tx = txx as unknown as Db;
    if (input.action === "approve" && input.targetStaffId && !r.targetStaffId) {
      await tx.update(staffRequests).set({ targetStaffId: input.targetStaffId }).where(eq(staffRequests.id, r.id));
      r.targetStaffId = input.targetStaffId;
    }
    if (input.action === "approve") {
      // Áp hệ quả trong savepoint: áp hỏng thì đơn ở lại Chờ duyệt, phần đã ghi được huỷ
      try {
        await tx.transaction(async (spx) => {
          const sp = spx as unknown as Db;
          const res = await applyRequest(sp, ctx, r, s);
          out.applied = res.label;
          const up = await sp.update(staffRequests).set({
            status: "approved", decidedBy: ctx.user.id, decidedAt: new Date(), decisionNote: note,
            appliedAt: new Date(), appliedEffect: { label: res.label }, applyError: null,
          }).where(and(eq(staffRequests.id, r.id), eq(staffRequests.status, "pending"))).returning({ id: staffRequests.id });
          if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Đơn vừa được xử lý" });
        });
      } catch (e) {
        out.applyError = e instanceof Error && e.message ? e.message : "Không áp được đơn";
      }
      const err = out.applyError;
      if (err) {
        await tx.update(staffRequests).set({ status: "pending", applyError: err, decisionNote: note }).where(eq(staffRequests.id, r.id));
        await writeAudit(tx, { actorId: ctx.user.id, action: "TRANSITION", module: "hr", entity: "staff_requests", entityId: r.id, before: { status: r.status }, after: { status: "pending", applyError: err }, reason: note, ip: ctx.ip });
        await notify(tx, [ctx.user.id], "Duyệt đơn không áp được", `${REQUEST_KIND_VI[r.kind]} của ${s.fullName} ${dmy(r.dateFrom)}: ${err}`, "/don-tu?status=pending", 1);
        return;
      }
    } else {
      const up = await tx.update(staffRequests).set({ status: to, decidedBy: ctx.user.id, decidedAt: new Date(), decisionNote: note })
        .where(and(eq(staffRequests.id, r.id), eq(staffRequests.status, r.status))).returning({ id: staffRequests.id });
      if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Đơn vừa được xử lý" });
      if (to === "cancelled" && r.status === "approved") await undoRequest(tx, ctx, r);
    }
    await writeAudit(tx, { actorId: ctx.user.id, action: "TRANSITION", module: "hr", entity: "staff_requests", entityId: r.id, before: { status: r.status }, after: { status: to, applied: out.applied }, reason: note, ip: ctx.ip });
    if (!isRequester) {
      const title = to === "approved" ? "Đơn đã được duyệt" : to === "rejected" ? "Đơn bị từ chối" : "Đơn đã bị huỷ";
      await notify(tx, [s.userId], title, `${REQUEST_KIND_VI[r.kind]} ${dmy(r.dateFrom)}${note ? ` — ${note}` : ""}${out.applied ? ` · ${out.applied}` : ""}`, "/cham-cong/lich-ca", to === "approved" ? 3 : 1);
    }
  });
  if (out.applyError) throw pre(`Không áp được đơn: ${out.applyError} — đơn vẫn ở Chờ duyệt`);
  return { status: to, applied: out.applied, warning: to === "cancelled" && r.kind === "timesheet_fix" ? "Lượt chấm đã thêm từ đơn vẫn giữ (sổ chấm công chỉ thêm) — dùng ghi đè công nếu cần" : null };
}

/** Huỷ đơn đã duyệt: gỡ ô lưới sinh từ đơn (lượt chấm giữ nguyên vì sổ chỉ thêm) */
async function undoRequest(tx: Db, ctx: ProtectedContext, r: RequestRow) {
  const cells = await tx.delete(shiftAssignments).where(and(eq(shiftAssignments.sourceRequestId, r.id), gte(shiftAssignments.date, todayISO()))).returning({ id: shiftAssignments.id });
  if (["late_early"].includes(r.kind)) {
    await tx.delete(timesheetFlagReviews).where(and(eq(timesheetFlagReviews.staffId, r.staffId), eq(timesheetFlagReviews.date, r.dateFrom), inArray(timesheetFlagReviews.flag, ["late", "early"])));
  }
  if (cells.length) await writeAudit(tx, { actorId: ctx.user.id, action: "DELETE", module: "hr", entity: "shift_assignments", entityId: r.id, after: { removed: cells.length, reason: "huỷ đơn đã duyệt" }, ip: ctx.ip });
}

/** Xem trước hệ quả (cột "Thay đổi") — tính lại theo dữ liệu hiện tại */
export async function previewRequest(ctx: ProtectedContext, input: { id: string }) {
  const r = await ctx.db.query.staffRequests.findFirst({ where: eq(staffRequests.id, input.id) });
  if (!r) throw notFound("Không tìm thấy đơn");
  requirePermission(ctx, "timesheet:read", { centerId: r.centerId });
  const cur = await shiftCodeOn(ctx.db, r.staffId, r.dateFrom);
  const newCode = r.requesterShiftId ? (await ctx.db.query.workShifts.findFirst({ where: eq(workShifts.id, r.requesterShiftId) }))?.code ?? null : null;
  const target = r.targetStaffId ? await ctx.db.query.staff.findFirst({ where: eq(staff.id, r.targetStaffId) }) : null;
  const cls = r.classId ? await ctx.db.query.classes.findFirst({ where: eq(classes.id, r.classId) }) : null;
  const label = describeRequestEffect({ ...r, portion: r.portion as "full" | "am" | "pm" | null }, {
    currentShiftCode: cur, newShiftCode: newCode, targetName: target?.fullName ?? null,
    targetCurrentShiftCode: r.targetStaffId ? await shiftCodeOn(ctx.db, r.targetStaffId, r.dateFrom) : null,
    targetNewShiftCode: r.targetShiftId ? (await ctx.db.query.workShifts.findFirst({ where: eq(workShifts.id, r.targetShiftId) }))?.code ?? null : null,
    className: cls?.code ?? null,
  });
  const session = r.classId ? await findSession(ctx.db, r.classId, r.dateFrom) : null;
  return {
    label, currentShiftCode: cur, newShiftCode: newCode,
    session: session ? { id: session.s.id, status: session.s.status, sequenceNo: session.s.sequenceNo, startTime: session.s.startTime, endTime: session.s.endTime, classCode: session.classCode } : null,
    applyError: r.applyError, lateSubmission: r.lateSubmission,
    teacherOfTarget: target?.teacherId ? (await ctx.db.query.teachers.findFirst({ where: eq(teachers.id, target.teacherId), columns: { code: true, fullName: true } })) ?? null : null,
  };
}
