/**
 * Điểm chấm công & quét QR.
 *
 * Mã QR dán tại quầy là **cố định** (ảnh chụp vẫn quét được) — thứ chặn người ở xa là
 * **định vị**: quét ngoài bán kính của điểm thì bị từ chối. Mã mang chữ ký HMAC nên
 * không ai tự chế được đường dẫn chấm công; đổi "đời khoá" là mã in cũ hết hiệu lực.
 */
import { and, eq, asc, desc, sql, gte, lte } from "drizzle-orm";
import { checkinPoints, attendancePunches, shiftAssignments, workShifts, staff, centers } from "@satarobo/db";
import {
  checkinToken, verifyCheckinToken, checkPointGeofence, validateCheckinPoint, qrSvg, vnParts, fmtMin,
  type TimesheetFlag,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { todayISO } from "./sessions";
import { bad, pre, notFound, can, centersWith, reasonOf, myStaff, assertOpen, shiftLite, vnStart, vnEnd, type Db } from "./hrShared";

const secret = () => process.env.MEDIA_SIGNING_SECRET ?? "dev-only-media-secret";
const tokenOf = (p: { id: string; keyVersion: number }) => checkinToken(secret(), p.id, p.keyVersion);

/* ------------------------------------------------------------------ */
/* Quản trị điểm chấm công                                             */
/* ------------------------------------------------------------------ */

export async function listCheckinPoints(ctx: ProtectedContext, input: { centerId?: string; includeInactive?: boolean }) {
  requirePermission(ctx, "timesheet:read", { centerId: input.centerId ?? null });
  const rows = await ctx.db.select({ p: checkinPoints, centerCode: centers.code, centerName: centers.name })
    .from(checkinPoints).innerJoin(centers, eq(centers.id, checkinPoints.centerId))
    .where(and(input.centerId ? eq(checkinPoints.centerId, input.centerId) : sql`true`, input.includeInactive ? sql`true` : eq(checkinPoints.isActive, true)))
    .orderBy(asc(centers.code), asc(checkinPoints.name));
  const today = todayISO();
  const used = await ctx.db.select({ pointId: attendancePunches.pointId, n: sql<number>`count(*)::int` }).from(attendancePunches)
    .where(and(gte(attendancePunches.at, vnStart(today)), lte(attendancePunches.at, vnEnd(today)))).groupBy(attendancePunches.pointId);
  return {
    canEdit: centersWith(ctx, "timesheet:configure").length > 0,
    items: rows.map((r) => ({
      ...r.p, centerCode: r.centerCode, centerName: r.centerName,
      token: tokenOf(r.p), qrSvg: qrSvg(tokenOf(r.p), { scale: 4, border: 2 }),
      punchesToday: used.find((u) => u.pointId === r.p.id)?.n ?? 0,
      canEdit: can(ctx, "timesheet:configure", r.p.centerId),
    })),
  };
}

export async function upsertCheckinPoint(ctx: ProtectedContext, input: { id?: string; centerId: string; name: string; lat: number | null; lng: number | null; radiusM: number; geofenceEnabled: boolean; isActive: boolean; note?: string | null }) {
  requirePermission(ctx, "timesheet:configure", { centerId: input.centerId });
  const errs = validateCheckinPoint(input);
  if (errs.length) throw bad(errs);
  const v = {
    centerId: input.centerId, name: input.name.trim(), lat: input.lat, lng: input.lng,
    radiusM: input.radiusM, geofenceEnabled: input.geofenceEnabled, isActive: input.isActive, note: input.note?.trim() || null,
  };
  if (input.id) {
    const before = await ctx.db.query.checkinPoints.findFirst({ where: eq(checkinPoints.id, input.id) });
    if (!before) throw notFound("Không tìm thấy điểm chấm công");
    if (before.centerId !== input.centerId) requirePermission(ctx, "timesheet:configure", { centerId: before.centerId });
    await ctx.db.update(checkinPoints).set(v).where(eq(checkinPoints.id, before.id));
    await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "hr", entity: "checkin_points", entityId: before.id, before, after: v, ip: ctx.ip });
    return { id: before.id };
  }
  const [row] = await ctx.db.insert(checkinPoints).values({ ...v, createdBy: ctx.user.id }).returning({ id: checkinPoints.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "hr", entity: "checkin_points", entityId: row!.id, after: v, ip: ctx.ip });
  return { id: row!.id };
}

/** Đổi đời khoá: mã QR đã in / đã chụp không dùng được nữa */
export async function rotateCheckinKey(ctx: ProtectedContext, input: { id: string; reason: string }) {
  const p = await ctx.db.query.checkinPoints.findFirst({ where: eq(checkinPoints.id, input.id) });
  if (!p) throw notFound("Không tìm thấy điểm chấm công");
  requirePermission(ctx, "timesheet:configure", { centerId: p.centerId });
  const reason = reasonOf(input.reason);
  const [row] = await ctx.db.update(checkinPoints).set({ keyVersion: sql`${checkinPoints.keyVersion} + 1` }).where(eq(checkinPoints.id, p.id)).returning({ v: checkinPoints.keyVersion });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "hr", entity: "checkin_points", entityId: p.id, before: { keyVersion: p.keyVersion }, after: { keyVersion: row!.v }, reason, ip: ctx.ip });
  const np = { id: p.id, keyVersion: row!.v };
  return { keyVersion: row!.v, token: tokenOf(np), qrSvg: qrSvg(tokenOf(np), { scale: 5, border: 3 }) };
}

/** Màn hình QR tại quầy (trình chiếu) */
export async function checkinScreen(ctx: ProtectedContext, input: { centerId: string; pointId?: string }) {
  requirePermission(ctx, "timesheet:read", { centerId: input.centerId });
  const pts = await ctx.db.select().from(checkinPoints).where(and(eq(checkinPoints.centerId, input.centerId), eq(checkinPoints.isActive, true))).orderBy(asc(checkinPoints.name));
  const point = (input.pointId ? pts.find((p) => p.id === input.pointId) : pts[0]) ?? null;
  const center = await ctx.db.query.centers.findFirst({ where: eq(centers.id, input.centerId), columns: { id: true, code: true, name: true } });
  const today = todayISO();
  const punches = await ctx.db.select({ p: attendancePunches, name: staff.fullName, code: staff.code })
    .from(attendancePunches).innerJoin(staff, eq(staff.id, attendancePunches.staffId))
    .where(and(eq(attendancePunches.centerId, input.centerId), gte(attendancePunches.at, vnStart(today)), lte(attendancePunches.at, vnEnd(today))))
    .orderBy(desc(attendancePunches.at)).limit(40);
  return {
    center, today,
    points: pts.map((p) => ({ id: p.id, name: p.name, keyVersion: p.keyVersion })),
    point: point ? {
      ...point, token: tokenOf(point), qrSvg: qrSvg(tokenOf(point), { scale: 8, border: 3 }),
      configureHref: `/cham-cong/diem-cham?center=${input.centerId}`,
    } : null,
    punches: punches.map((x) => ({ name: x.name, code: x.code, kind: x.p.kind, at: x.p.at, min: vnParts(x.p.at).min, flags: x.p.flags ?? [] })),
  };
}

/* ------------------------------------------------------------------ */
/* Quét mã & chấm công                                                 */
/* ------------------------------------------------------------------ */

async function loadPoint(db: Db, token: string) {
  const parsed = verifyCheckinToken(secret(), token, null);
  const pid: string | null = parsed.pointId;
  const point = pid ? (await db.query.checkinPoints.findFirst({ where: eq(checkinPoints.id, pid) })) ?? null : null;
  const v = verifyCheckinToken(secret(), token, point ? { id: point.id, keyVersion: point.keyVersion, isActive: point.isActive } : null);
  return { v, point };
}

/** Trang /cham-cong/checkin?t= — kiểm mã trước khi cho bấm chấm công */
export async function checkinInfo(ctx: ProtectedContext, input: { token: string }) {
  type Punch = { kind: "in" | "out"; at: Date; time: string; source: string };
  const noPunch: Punch[] = [];
  const { v, point } = await loadPoint(ctx.db, input.token);
  if (!v.ok) return { ok: false as const, reason: v.reason, point: null, staff: null, today: todayISO(), punches: noPunch, shift: null, nextKind: "in" as const };
  const center = await ctx.db.query.centers.findFirst({ where: eq(centers.id, point!.centerId), columns: { id: true, code: true, name: true } });
  const s = await myStaff(ctx);
  const today = todayISO();
  if (!s) return { ok: true as const, reason: null, point: { id: point!.id, name: point!.name, center, radiusM: point!.radiusM, geofenceEnabled: point!.geofenceEnabled }, staff: null, today, punches: noPunch, shift: null, nextKind: "in" as const };
  const punches = await ctx.db.select({ kind: attendancePunches.kind, at: attendancePunches.at, source: attendancePunches.source })
    .from(attendancePunches).where(and(eq(attendancePunches.staffId, s.id), gte(attendancePunches.at, vnStart(today)), lte(attendancePunches.at, vnEnd(today)))).orderBy(asc(attendancePunches.at));
  const asg = await ctx.db.select({ a: shiftAssignments, s: workShifts }).from(shiftAssignments).innerJoin(workShifts, eq(workShifts.id, shiftAssignments.shiftId))
    .where(and(eq(shiftAssignments.staffId, s.id), eq(shiftAssignments.date, today))).limit(1);
  const sh = asg[0]?.s ?? null;
  return {
    ok: true as const, reason: null,
    point: { id: point!.id, name: point!.name, center, radiusM: point!.radiusM, geofenceEnabled: point!.geofenceEnabled },
    staff: { id: s.id, code: s.code, fullName: s.fullName, centerId: s.centerId, exempt: s.timesheetExempt },
    today,
    punches: punches.map((p) => ({ kind: p.kind, at: p.at, time: fmtMin(vnParts(p.at).min), source: p.source })),
    // giờ + số công theo ảnh chụp lúc xếp ô (sửa mã ca không đổi lịch đã xếp)
    shift: sh ? { code: sh.code, name: sh.name, clock: (asg[0]!.a.segmentsSnapshot?.length ? asg[0]!.a.segmentsSnapshot : sh.segments ?? []).map((x) => `${x.from}–${x.to}`).join(", "), units: asg[0]!.a.unitsSnapshot ?? sh.units, punchRequired: sh.punchRequired } : null,
    nextKind: punches.some((p) => p.kind === "in") ? ("out" as const) : ("in" as const),
  };
}

/**
 * Chấm công: bắt buộc quét mã QR hợp lệ tại quầy + qua kiểm định vị.
 * Lượt chấm chỉ **ghi nhận + sinh cờ**, không tự đổi công của ngày.
 */
export async function punch(ctx: ProtectedContext, input: { token: string; kind: "in" | "out"; lat?: number | null; lng?: number | null; accuracy?: number | null }) {
  const s = await myStaff(ctx);
  if (!s) throw pre("Tài khoản chưa gắn hồ sơ nhân sự — liên hệ nhân sự");
  if (s.status === "resigned") throw pre("Hồ sơ đã nghỉ việc");
  const { v, point } = await loadPoint(ctx.db, input.token);
  if (!v.ok || !point) throw pre(v.ok ? "Không tìm thấy điểm chấm công" : v.reason);
  const pos = input.lat != null && input.lng != null ? { lat: input.lat, lng: input.lng, accuracy: input.accuracy ?? null } : null;
  const g = checkPointGeofence({ lat: point.lat, lng: point.lng, radiusM: point.radiusM, geofenceEnabled: point.geofenceEnabled }, pos);
  if (!g.ok) throw pre(g.reason ?? "Ngoài bán kính chấm công");
  const today = todayISO();
  await assertOpen(ctx.db, s.centerId, [today]);
  const flags: TimesheetFlag[] = [...(g.flags as TimesheetFlag[])];
  if (!pos && !point.geofenceEnabled) flags.push("no_gps");
  const [recent] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(attendancePunches)
    .where(and(eq(attendancePunches.staffId, s.id), eq(attendancePunches.kind, input.kind), gte(attendancePunches.at, new Date(Date.now() - 60_000))));
  if ((recent?.n ?? 0) > 0) throw pre("Bạn vừa chấm công — thử lại sau 1 phút");
  const [todayCount] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(attendancePunches)
    .where(and(eq(attendancePunches.staffId, s.id), gte(attendancePunches.at, vnStart(today)), lte(attendancePunches.at, vnEnd(today))));
  if ((todayCount?.n ?? 0) >= 10) flags.push("over_limit");
  const asg = await ctx.db.select({ a: shiftAssignments, s: workShifts }).from(shiftAssignments).innerJoin(workShifts, eq(workShifts.id, shiftAssignments.shiftId))
    .where(and(eq(shiftAssignments.staffId, s.id), eq(shiftAssignments.date, today))).limit(1);
  const sh = asg[0]?.s ?? null;
  if (!sh) flags.push("off_schedule");
  else if (sh.workplace === "fixed_center" && sh.workplaceCenterId && sh.workplaceCenterId !== point.centerId) flags.push("wrong_place");
  else if (sh.workplace === "own_center" && point.centerId !== s.centerId) flags.push("wrong_place");
  const now = new Date();
  const [row] = await ctx.db.insert(attendancePunches).values({
    staffId: s.id, centerId: point.centerId, kind: input.kind, at: now, source: "qr", pointId: point.id,
    lat: pos?.lat ?? null, lng: pos?.lng ?? null, accuracyM: pos?.accuracy != null ? Math.round(pos.accuracy) : null,
    distanceM: g.distanceM, flags: [...new Set(flags)], ip: ctx.ip ?? null, createdBy: ctx.user.id,
    note: g.checked ? null : "Điểm chấm công chưa khai toạ độ — không kiểm bán kính",
  }).returning({ id: attendancePunches.id });
  const cell = sh ? shiftLite(sh, asg[0]!.a) : null;
  const warn = !sh ? "Hôm nay bạn không có ca — lượt chấm vẫn được ghi nhận"
    : flags.includes("wrong_place") ? "Bạn đang chấm ở cơ sở khác nơi làm của ca — quản lý sẽ rà lại"
      : input.kind === "out" && cell && cell.segments.length && vnParts(now).min < Math.max(...cell.segments.map((x) => Number(x.to.slice(0, 2)) * 60 + Number(x.to.slice(3, 5)))) ? "Chấm ra trước giờ kết thúc ca"
        : null;
  return { id: row!.id, at: now, time: fmtMin(vnParts(now).min), distanceM: g.distanceM, checked: g.checked, flags: [...new Set(flags)], warning: warn, point: point.name };
}

/** Sửa giờ quét tay (quản lý) — lượt quét thật vẫn giữ để đối chiếu */
export async function addManualPunch(ctx: ProtectedContext, input: { staffId: string; date: string; kind: "in" | "out"; time: string; reason: string }) {
  const s = await ctx.db.query.staff.findFirst({ where: eq(staff.id, input.staffId) });
  if (!s) throw notFound("Không tìm thấy nhân sự");
  requirePermission(ctx, "timesheet:update", { centerId: s.centerId });
  if (s.userId === ctx.user.id) throw pre("Không tự thêm lượt chấm cho mình — nộp đơn chỉnh công");
  const reason = reasonOf(input.reason);
  if (input.date > todayISO()) throw bad("Không thêm lượt chấm cho ngày chưa tới");
  await assertOpen(ctx.db, s.centerId, [input.date]);
  const at = new Date(`${input.date}T${input.time.padStart(5, "0")}:00+07:00`);
  const [row] = await ctx.db.insert(attendancePunches).values({
    staffId: s.id, centerId: s.centerId, kind: input.kind, at, source: "manual", flags: ["manual_fix"],
    note: `Sửa tay: ${reason}`, createdBy: ctx.user.id, ip: ctx.ip ?? null,
  }).returning({ id: attendancePunches.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "hr", entity: "attendance_punches", entityId: row!.id, after: { staff: s.code, date: input.date, kind: input.kind, time: input.time }, reason, ip: ctx.ip });
  return { id: row!.id };
}
