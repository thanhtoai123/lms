/**
 * Hệ quả của đơn từ lên buổi học (huỷ buổi dạy / đổi người dạy).
 *
 * TODO(Đợt 3): khi `services/sessionChanges.ts` (academics.sessions.adjust / cancel)
 * có trên nhánh chính, hai hàm dưới đây chỉ còn gọi sang đó để dùng chung kiểm tra
 * và thông báo. Hiện tại nhánh này chưa có file đó nên áp trực tiếp, vẫn giữ đủ
 * kiểm tra: buổi đã điểm danh / đã chốt thì không đổi được, GV nhận thay không trùng giờ.
 */
import { and, eq, ne, sql } from "drizzle-orm";
import { sessions, classes, attendance, teachers, staff } from "@satarobo/db";
import { canTransition } from "@satarobo/core";
import { writeAudit } from "./audit";
import { pre, notFound, type Db } from "./hrShared";
import type { ProtectedContext } from "../trpc";

export async function findSession(db: Db, classId: string, date: string) {
  const [row] = await db.select({ s: sessions, classCode: classes.code, className: classes.name, centerId: classes.centerId })
    .from(sessions).innerJoin(classes, eq(classes.id, sessions.classId))
    .where(and(eq(sessions.classId, classId), eq(sessions.date, date))).limit(1);
  return row ?? null;
}

async function assertChangeable(db: Db, sessionId: string) {
  const [a] = await db.select({ n: sql<number>`count(*)::int` }).from(attendance).where(eq(attendance.sessionId, sessionId));
  if ((a?.n ?? 0) > 0) throw pre("Buổi học đã điểm danh — không đổi được bằng đơn, xử lý ở màn buổi học");
}

/** Huỷ buổi dạy (đơn "Nghỉ buổi dạy") */
export async function cancelSessionForRequest(tx: Db, ctx: ProtectedContext, input: { classId: string; date: string; reason: string }) {
  const row = await findSession(tx, input.classId, input.date);
  if (!row) throw notFound(`Lớp không có buổi học ngày ${input.date.split("-").reverse().join("/")}`);
  if (!canTransition(row.s.status, "cancel")) throw pre(`Buổi học đang "${row.s.status}" — không huỷ được`);
  await assertChangeable(tx, row.s.id);
  await tx.update(sessions).set({ status: "cancelled", privateNote: [row.s.privateNote, `Huỷ theo đơn nghỉ buổi dạy: ${input.reason}`].filter(Boolean).join("\n") }).where(eq(sessions.id, row.s.id));
  await writeAudit(tx, { actorId: ctx.user.id, action: "TRANSITION", module: "academics", entity: "sessions", entityId: row.s.id, before: { status: row.s.status }, after: { status: "cancelled" }, reason: input.reason, ip: ctx.ip });
  return { sessionId: row.s.id, label: `${row.classCode}: huỷ buổi ${input.date.split("-").reverse().join("/")}` };
}

/** Đổi người dạy của một buổi (đơn "Dạy thay" / "Đổi lớp dạy") */
export async function setSessionTeacherForRequest(tx: Db, ctx: ProtectedContext, input: { classId: string; date: string; targetStaffId: string; reason: string }) {
  const row = await findSession(tx, input.classId, input.date);
  if (!row) throw notFound(`Lớp không có buổi học ngày ${input.date.split("-").reverse().join("/")}`);
  if (row.s.status === "cancelled" || row.s.status === "completed" || row.s.status === "rescheduled") throw pre(`Buổi học đang "${row.s.status}" — không đổi người dạy`);
  await assertChangeable(tx, row.s.id);
  const target = await tx.query.staff.findFirst({ where: eq(staff.id, input.targetStaffId) });
  if (!target) throw notFound("Không tìm thấy người dạy thay");
  if (!target.teacherId) throw pre(`${target.fullName} chưa có hồ sơ giáo viên — không gán được buổi dạy`);
  const t = await tx.query.teachers.findFirst({ where: eq(teachers.id, target.teacherId) });
  if (!t) throw pre("Hồ sơ giáo viên của người dạy thay không còn");
  const [clash] = await tx.select({ n: sql<number>`count(*)::int` }).from(sessions)
    .where(and(eq(sessions.teacherId, target.teacherId), eq(sessions.date, input.date), ne(sessions.id, row.s.id), ne(sessions.status, "cancelled"),
      sql`${sessions.startTime} < ${row.s.endTime} and ${sessions.endTime} > ${row.s.startTime}`));
  if ((clash?.n ?? 0) > 0) throw pre(`${target.fullName} đã có buổi dạy trùng giờ ngày ${input.date.split("-").reverse().join("/")}`);
  const before = row.s.teacherId;
  await tx.update(sessions).set({ teacherId: target.teacherId, privateNote: [row.s.privateNote, `Đổi người dạy theo đơn: ${input.reason}`].filter(Boolean).join("\n") }).where(eq(sessions.id, row.s.id));
  await writeAudit(tx, { actorId: ctx.user.id, action: "UPDATE", module: "academics", entity: "sessions", entityId: row.s.id, before: { teacherId: before }, after: { teacherId: target.teacherId }, reason: input.reason, ip: ctx.ip });
  return { sessionId: row.s.id, label: `${row.classCode}: ${target.fullName} dạy ngày ${input.date.split("-").reverse().join("/")}` };
}
