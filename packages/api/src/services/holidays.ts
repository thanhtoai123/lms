import { and, eq, inArray, sql, asc, isNull, gte, lte, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { holidays, centers, classes, sessions, classSchedules, attendance, users, classEvents, userNotifications, teachers } from "@satarobo/db";
import {
  authorize, visibleCenterIds, dateRange, planReflow, requireReason,
  type ScheduleRule, type Weekday, type ExistingSession,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { deliverNotifications } from "./notify";
import { todayISO } from "./sessions";

type Db = ProtectedContext["db"];
const bad = (m: string) => new TRPCError({ code: "BAD_REQUEST", message: m });
const fmt = (d: string) => d.split("-").reverse().join("/");

/** Ngày nghỉ toàn hệ thống cần quyền holiday:* ở phạm vi Hội sở */
function canGlobal(ctx: ProtectedContext, perm: "holiday:create" | "holiday:delete") {
  return ctx.actor.assignments.some((a) => a.centerId === null && authorize({ userId: ctx.actor.userId, assignments: [a] }, perm, {}).allowed);
}

function checkScope(ctx: ProtectedContext, perm: "holiday:create" | "holiday:delete", centerId: string | null) {
  if (centerId === null) {
    if (!canGlobal(ctx, perm)) throw new TRPCError({ code: "FORBIDDEN", message: "Chỉ Hội sở được đặt ngày nghỉ toàn hệ thống — hãy chọn cơ sở" });
  } else {
    requirePermission(ctx, perm, { centerId });
  }
}

export async function listHolidays(ctx: ProtectedContext, input: { year?: number; centerId?: string }) {
  requirePermission(ctx, "holiday:read", { centerId: input.centerId ?? null });
  const year = input.year ?? Number(todayISO().slice(0, 4));
  const conds = [gte(holidays.date, `${year}-01-01`), lte(holidays.date, `${year}-12-31`)];
  const visible = visibleCenterIds(ctx.actor);
  if (input.centerId) conds.push(or(eq(holidays.centerId, input.centerId), isNull(holidays.centerId))!);
  else if (visible !== null) conds.push(visible.length ? or(inArray(holidays.centerId, visible), isNull(holidays.centerId))! : isNull(holidays.centerId));
  const rows = await ctx.db
    .select({ id: holidays.id, date: holidays.date, name: holidays.name, centerId: holidays.centerId, centerCode: centers.code, createdByName: users.fullName, createdAt: holidays.createdAt })
    .from(holidays).leftJoin(centers, eq(centers.id, holidays.centerId)).leftJoin(users, eq(users.id, holidays.createdBy))
    .where(and(...conds)).orderBy(asc(holidays.date));
  const today = todayISO();
  return {
    year,
    today,
    canGlobal: canGlobal(ctx, "holiday:create"),
    items: rows.map((r) => ({ ...r, past: r.date < today, canDelete: r.date > today && (r.centerId === null ? canGlobal(ctx, "holiday:delete") : authorize(ctx.actor, "holiday:delete", { centerId: r.centerId }).allowed) })),
  };
}

/** Buổi học rơi vào khoảng ngày nghỉ (theo phạm vi) */
async function affectedSessions(db: Db, dates: string[], centerId: string | null) {
  if (!dates.length) return [];
  const conds = [inArray(sessions.date, dates), eq(sessions.status, "scheduled"), isNull(classes.deletedAt)];
  if (centerId) conds.push(eq(classes.centerId, centerId));
  return db
    .select({ id: sessions.id, date: sessions.date, startTime: sessions.startTime, kind: sessions.kind, sequenceNo: sessions.sequenceNo, classId: classes.id, classCode: classes.code, centerId: classes.centerId, classStatus: classes.status })
    .from(sessions).innerJoin(classes, eq(classes.id, sessions.classId))
    .where(and(...conds)).orderBy(asc(sessions.date), asc(classes.code));
}

function normalizeRange(from: string, to: string | null | undefined) {
  const end = to && to >= from ? to : from;
  const dates = dateRange(from, end, 60);
  if (dates.length === 60 && dates[59] !== end) throw bad("Mỗi lần tối đa 60 ngày");
  return dates;
}

export async function previewHoliday(ctx: ProtectedContext, input: { from: string; to?: string | null; centerId: string | null }) {
  checkScope(ctx, "holiday:create", input.centerId);
  const dates = normalizeRange(input.from, input.to);
  const affected = await affectedSessions(ctx.db, dates, input.centerId);
  const byClass = new Map<string, { classId: string; classCode: string; sessions: number; regular: number }>();
  for (const s of affected) {
    const c = byClass.get(s.classId) ?? { classId: s.classId, classCode: s.classCode, sessions: 0, regular: 0 };
    c.sessions++;
    if (s.kind === "regular") c.regular++;
    byClass.set(s.classId, c);
  }
  return { dates, pastDates: dates.filter((d) => d <= todayISO()), affected: affected.length, classes: [...byClass.values()] };
}

/**
 * Thêm ngày nghỉ (một ngày hoặc khoảng). Tuỳ chọn dời buổi bị ảnh hưởng:
 * - buổi chính thức: xếp lại theo lịch hiện hành của lớp từ ngày nghỉ đầu tiên (giữ tổng buổi, lùi bế giảng);
 * - buổi ngoài lộ trình: huỷ (không có lịch tuần để dời).
 */
export async function addHoliday(ctx: ProtectedContext, input: { from: string; to?: string | null; centerId: string | null; name: string; reschedule: boolean }) {
  checkScope(ctx, "holiday:create", input.centerId);
  const name = input.name.trim();
  if (name.length < 3) throw bad("Tên ngày nghỉ tối thiểu 3 ký tự");
  const today = todayISO();
  const dates = normalizeRange(input.from, input.to);
  if (dates[0]! <= today) throw bad("Chỉ thêm ngày nghỉ từ ngày mai trở đi (buổi hôm nay/đã qua dùng huỷ/dời buổi)");
  const existing = await ctx.db.select({ date: holidays.date }).from(holidays)
    .where(and(inArray(holidays.date, dates), input.centerId ? eq(holidays.centerId, input.centerId) : isNull(holidays.centerId)));
  const newDates = dates.filter((d) => !existing.some((e) => e.date === d));
  if (!newDates.length) throw new TRPCError({ code: "CONFLICT", message: "Các ngày này đã là ngày nghỉ" });
  const affected = await affectedSessions(ctx.db, newDates, input.centerId);
  const classIds = [...new Set(affected.map((a) => a.classId))];

  let moved = 0;
  let cancelled = 0;
  const failed: string[] = [];
  try {
    await ctx.db.transaction(async (tx) => {
      await tx.execute(sql`set constraints sessions_no_room_overlap, sessions_no_teacher_overlap deferred`);
      await tx.insert(holidays).values(newDates.map((date) => ({ date, name, centerId: input.centerId, createdBy: ctx.user.id })));
      if (input.reschedule) {
        for (const classId of classIds) {
          const cls = await tx.query.classes.findFirst({ where: eq(classes.id, classId) });
          if (!cls) continue;
          const extra = affected.filter((a) => a.classId === classId && a.kind !== "regular");
          if (extra.length) {
            await tx.update(sessions).set({ status: "cancelled", privateNote: sql`coalesce(${sessions.privateNote} || E'\\n', '') || ${"Huỷ do ngày nghỉ: " + name}` }).where(inArray(sessions.id, extra.map((e) => e.id)));
            cancelled += extra.length;
          }
          const firstRegular = affected.find((a) => a.classId === classId && a.kind === "regular");
          if (!firstRegular) continue;
          const phases = await tx.select().from(classSchedules).where(eq(classSchedules.classId, classId));
          const rules: ScheduleRule[] = phases.map((p) => ({ weekday: p.weekday as Weekday, startTime: p.startTime.slice(0, 5), endTime: p.endTime.slice(0, 5), roomId: p.roomId ?? cls.homeRoomId, teacherId: p.teacherId ?? cls.leadTeacherId, effectiveFrom: p.effectiveFrom, effectiveTo: p.effectiveTo }));
          const hol = (await tx.select({ date: holidays.date }).from(holidays).where(or(eq(holidays.centerId, cls.centerId), isNull(holidays.centerId))!)).map((h) => h.date);
          const rows = await tx.select({
            id: sessions.id, sequenceNo: sessions.sequenceNo, date: sessions.date, startTime: sessions.startTime, endTime: sessions.endTime, status: sessions.status, kind: sessions.kind, roomId: sessions.roomId, teacherId: sessions.teacherId,
            marks: sql<number>`(select count(*)::int from ${attendance} a where a.session_id = ${sql.raw('"sessions"."id"')})`,
          }).from(sessions).where(eq(sessions.classId, classId));
          const existingSessions: ExistingSession[] = rows.map((r) => ({ ...r, startTime: r.startTime.slice(0, 5), endTime: r.endTime.slice(0, 5), hasAttendance: r.marks > 0 }));
          const plan = planReflow({ sessions: existingSessions, rules, fromDate: firstRegular.date, today, holidays: hol });
          if (plan.errors.length) {
            failed.push(`${cls.code}: ${plan.errors.join("; ")}`);
            continue;
          }
          const changed = plan.changes.filter((c) => c.changed);
          for (const c of changed) {
            await tx.update(sessions).set({ date: c.to.date, startTime: c.to.startTime, endTime: c.to.endTime, roomId: c.to.roomId, teacherId: c.to.teacherId }).where(and(eq(sessions.id, c.sessionId), eq(sessions.status, "scheduled")));
          }
          moved += changed.length;
          await tx.update(classes).set({ expectedEndDate: plan.newEndDate }).where(eq(classes.id, classId));
          await tx.insert(classEvents).values({ classId, event: "holiday_reflow", fromStatus: cls.status, toStatus: cls.status, reason: `${name} (${fmt(newDates[0]!)}${newDates.length > 1 ? `–${fmt(newDates[newDates.length - 1]!)}` : ""})`, actorId: ctx.user.id, meta: { changed: changed.length, fromDate: firstRegular.date, newEndDate: plan.newEndDate } });
          const tIds = [...new Set([cls.leadTeacherId, cls.assistantTeacherId, ...changed.map((c) => c.from.teacherId)].filter((x): x is string => !!x))];
          if (tIds.length) {
            const us = (await tx.select({ u: teachers.userId }).from(teachers).where(inArray(teachers.id, tIds))).map((r) => r.u).filter((x): x is string => !!x);
            await deliverNotifications(tx, us, { title: "Lịch lớp dời do ngày nghỉ", body: `${cls.code}: ${changed.length} buổi dời — ${name}`, link: "/teacher/classes", priority: 1, type: "class.holiday_shift" });
          }
        }
        if (failed.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Không dời được: ${failed.join(" | ")}` });
      }
      await writeAudit(tx as unknown as Db, {
        actorId: ctx.user.id, action: "CREATE", module: "academics", entity: "holidays", entityId: input.centerId,
        after: { dates: newDates, name, reschedule: input.reschedule, affected: affected.length, moved, cancelled }, ip: ctx.ip,
      });
    });
  } catch (e) {
    const code = (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
    if (code === "23P01") throw new TRPCError({ code: "CONFLICT", message: "Dời buổi bị trùng phòng/giáo viên với lớp khác — dời thủ công bằng 'Áp lịch mới' ở từng lớp" });
    throw e;
  }
  return { added: newDates.length, skipped: dates.length - newDates.length, affected: affected.length, moved, cancelled };
}

export async function deleteHoliday(ctx: ProtectedContext, input: { id: string; reason: string }) {
  const h = await ctx.db.query.holidays.findFirst({ where: eq(holidays.id, input.id) });
  if (!h) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy ngày nghỉ" });
  checkScope(ctx, "holiday:delete", h.centerId);
  if (h.date <= todayISO()) throw bad("Không xoá ngày nghỉ đã qua");
  let reason: string;
  try { reason = requireReason(input.reason); } catch (e) { throw bad((e as Error).message); }
  await ctx.db.transaction(async (tx) => {
    await tx.delete(holidays).where(eq(holidays.id, h.id));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "DELETE", module: "academics", entity: "holidays", entityId: h.centerId, before: { date: h.date, name: h.name }, reason, ip: ctx.ip });
  });
  return { ok: true, hint: "Buổi đã dời không tự quay lại — dùng 'Kiểm tra lịch' ở từng lớp nếu cần" };
}


