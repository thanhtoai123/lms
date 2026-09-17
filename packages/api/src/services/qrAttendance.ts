import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, sql, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { students, enrollments, classes, attendance, centers, studentGuardians, parents } from "@satarobo/db";
import { authorize, cardPayload, parseCardPayload, scanStatus, qrSvg, visibleCenterIds } from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { loadSessionForAuth, recordAttendance, todayISO } from "./sessions";
import { writeAudit } from "./audit";
import { getOps } from "./opsSettings";

const secret = () => process.env.MEDIA_SIGNING_SECRET ?? "dev-only-media-secret";
export function cardSig(studentId: string, version: number) {
  return createHmac("sha256", secret()).update(`card|${studentId}|${version}`).digest("hex").slice(0, 16);
}
export function cardCode(studentId: string, version: number) {
  return cardPayload(studentId, version, cardSig(studentId, version));
}

/** Quét thẻ học viên trong một buổi → ghi có mặt / đi muộn */
export async function scanCard(ctx: ProtectedContext, input: { sessionId: string; code: string }) {
  const s = await loadSessionForAuth(ctx, input.sessionId);
  requirePermission(ctx, "attendance:write", { centerId: s.centerId, ownerIds: s.ownerIds });
  if (s.session.date !== todayISO()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Chỉ quét thẻ trong ngày diễn ra buổi học" });
  if (!["scheduled", "in_progress", "attendance_done"].includes(s.session.status)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Buổi học đã chốt / huỷ — sửa điểm danh ở trang điểm danh" });
  const p = parseCardPayload(input.code);
  if (!p) return { ok: false as const, reason: "Mã không phải thẻ học viên Sata Robo" };
  const expect = cardSig(p.studentId, p.version);
  if (expect.length !== p.sig.length || !timingSafeEqual(Buffer.from(expect), Buffer.from(p.sig))) return { ok: false as const, reason: "Thẻ không hợp lệ (sai chữ ký)" };
  const st = await ctx.db.query.students.findFirst({ where: eq(students.id, p.studentId) });
  if (!st || st.deletedAt) return { ok: false as const, reason: "Không tìm thấy học viên" };
  if (st.cardVersion !== p.version) return { ok: false as const, reason: "Thẻ cũ đã bị thay — dùng thẻ mới nhất" };
  const enr = await ctx.db.query.enrollments.findFirst({
    where: and(eq(enrollments.studentId, st.id), eq(enrollments.classId, s.session.classId), inArray(enrollments.status, ["active", "trial"])),
  });
  if (!enr) return { ok: false as const, reason: `${st.fullName} không thuộc lớp ${s.classCode} (hoặc đang bảo lưu)`, student: st.fullName };
  if (enr.startSequenceNo > s.session.sequenceNo) return { ok: false as const, reason: `${st.fullName} bắt đầu học từ buổi ${enr.startSequenceNo}`, student: st.fullName };
  const existing = await ctx.db.query.attendance.findFirst({ where: and(eq(attendance.sessionId, s.session.id), eq(attendance.enrollmentId, enr.id)) });
  if (existing && ["present", "late", "makeup"].includes(existing.status)) return { ok: true as const, duplicate: true, student: st.fullName, status: existing.status };
  const status = scanStatus(s.session.date, s.session.startTime, new Date(), (await getOps(ctx.db, s.centerId)).scanLateGraceMin);
  await recordAttendance(ctx, { sessionId: s.session.id, records: [{ enrollmentId: enr.id, status, studentRemark: existing?.studentRemark ?? null, rating: existing?.rating ?? null }] });
  return { ok: true as const, duplicate: false, student: st.fullName, status, previous: existing?.status ?? null };
}

/** Thẻ QR cho in ấn (theo lớp hoặc danh sách học viên) */
export async function cardsForPrint(ctx: ProtectedContext, input: { classId?: string; studentIds?: string[] }) {
  if (!input.classId && !input.studentIds?.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Chọn lớp hoặc học viên" });
  const v = visibleCenterIds(ctx.actor);
  const rows = await ctx.db.select({ id: students.id, code: students.code, fullName: students.fullName, cardVersion: students.cardVersion, centerId: students.homeCenterId, centerName: centers.name, classCode: classes.code, className: classes.name })
    .from(students).leftJoin(centers, eq(centers.id, students.homeCenterId))
    .leftJoin(enrollments, and(eq(enrollments.studentId, students.id), inArray(enrollments.status, ["active", "trial", "paused"]), input.classId ? eq(enrollments.classId, input.classId) : sql`true`))
    .leftJoin(classes, eq(classes.id, enrollments.classId))
    .where(and(input.classId ? eq(enrollments.classId, input.classId) : inArray(students.id, input.studentIds!), sql`${students.deletedAt} is null`))
    .orderBy(asc(students.fullName)).limit(300);
  const seen = new Set<string>();
  const out = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    if (!authorize(ctx.actor, "student:read", { centerId: r.centerId }).allowed) continue;
    if (v !== null && r.centerId && !v.includes(r.centerId)) continue;
    out.push({ ...r, svg: qrSvg(cardCode(r.id, r.cardVersion), { scale: 3, border: 2 }) });
  }
  if (!out.length) throw new TRPCError({ code: "FORBIDDEN", message: "Không có học viên nào để in thẻ" });
  return out;
}

export async function reissueCard(ctx: ProtectedContext, input: { studentId: string; reason: string }) {
  const st = await ctx.db.query.students.findFirst({ where: eq(students.id, input.studentId) });
  if (!st) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy học viên" });
  requirePermission(ctx, "student:update", { centerId: st.homeCenterId });
  if (input.reason.trim().length < 5) throw new TRPCError({ code: "BAD_REQUEST", message: "Ghi lý do cấp lại thẻ (mất thẻ, hỏng…)" });
  const [r] = await ctx.db.update(students).set({ cardVersion: sql`${students.cardVersion} + 1` }).where(eq(students.id, st.id)).returning({ v: students.cardVersion });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "students", entity: "students", entityId: st.id, before: { cardVersion: st.cardVersion }, after: { cardVersion: r!.v }, reason: input.reason.trim(), ip: ctx.ip });
  return { cardVersion: r!.v };
}

/** Thẻ của con (cổng phụ huynh) */
export async function cardForParent(db: ProtectedContext["db"], parentId: string, studentId: string) {
  const [g] = await db.select({ id: students.id, v: students.cardVersion, name: students.fullName }).from(studentGuardians).innerJoin(students, eq(students.id, studentGuardians.studentId))
    .innerJoin(parents, eq(parents.id, studentGuardians.parentId)).where(and(eq(studentGuardians.parentId, parentId), eq(studentGuardians.studentId, studentId))).limit(1);
  if (!g) return null;
  return { name: g.name, svg: qrSvg(cardCode(g.id, g.v), { scale: 5, border: 3 }) };
}
