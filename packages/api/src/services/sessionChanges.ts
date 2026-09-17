import { and, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { sessions, classes, classEvents, attendance, rooms, makeupRequests } from "@satarobo/db";
import {
  validateSessionAdjust, validateSessionCancel, planCancelShift, sessionLabel, minutesOf, EXTRA_SEQUENCE_BASE,
  type SessionKind,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { loadSessionForAuth, todayISO } from "./sessions";
import { assertTeacherQualified } from "./teachers";
import {
  loadClass, reasonOrThrow, precondition, mapExclusion, conflictsWith, conflictMessage, holidayDates, notifyUsers, teacherUserIds,
  existingForPlan, rulesForClass, notifyClassParents, cancelTrialsFor, notifyTrialsMoved, namesFor, fmt, type Db,
} from "./classOps";

const SID = sql.raw('"sessions"."id"');
const hhmm = (t: string) => t.slice(0, 5);
const addMinutes = (t: string, m: number) => {
  const x = minutesOf(hhmm(t)) + m;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};

async function loadForChange(ctx: ProtectedContext, sessionId: string) {
  const s = await loadSessionForAuth(ctx, sessionId);
  // Điều chỉnh / huỷ buổi là việc của giáo vụ / quản lý cơ sở (GV gửi đơn), không dùng quyền "của mình"
  requirePermission(ctx, "session:update", { centerId: s.centerId });
  const cls = await loadClass(ctx.db, s.session.classId);
  if (cls.status !== "recruiting" && cls.status !== "running") throw precondition("Chỉ điều chỉnh / huỷ buổi của lớp đang tuyển sinh / đang chạy");
  const [m] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(attendance).where(eq(attendance.sessionId, sessionId));
  return { s: s.session, cls, hasAttendance: (m?.n ?? 0) > 0 };
}

/** Cập nhật bế giảng dự kiến theo buổi chính thức cuối */
async function syncEnd(db: Db, classId: string) {
  await db.execute(sql`update classes set expected_end_date = (select max(s.date) from sessions s where s.class_id = ${classId} and s.kind = 'regular' and s.sequence_no <= ${EXTRA_SEQUENCE_BASE} and s.status not in ('cancelled','rescheduled')) where id = ${classId}`);
}

/* ------------------------------------------------------------------ */
/* Điều chỉnh một buổi                                                 */
/* ------------------------------------------------------------------ */

export async function adjustSession(ctx: ProtectedContext, input: { sessionId: string; date?: string | null; startTime?: string | null; endTime?: string | null; teacherId?: string | null; roomId?: string | null; reason: string; notifyParents?: boolean }) {
  const reason = reasonOrThrow(input.reason);
  const { s, cls, hasAttendance } = await loadForChange(ctx, input.sessionId);
  const today = todayISO();
  const current = { date: s.date, startTime: hhmm(s.startTime), endTime: hhmm(s.endTime), roomId: s.roomId, teacherId: s.teacherId };
  const startTime = input.startTime || current.startTime;
  // đổi giờ bắt đầu mà không nhập giờ kết thúc → giữ nguyên thời lượng
  const endTime = input.endTime || (input.startTime ? addMinutes(input.startTime, minutesOf(current.endTime) - minutesOf(current.startTime)) : current.endTime);
  const next = {
    date: input.date || current.date, startTime, endTime,
    roomId: input.roomId === undefined || input.roomId === null ? current.roomId : input.roomId,
    teacherId: input.teacherId === undefined || input.teacherId === null ? current.teacherId : input.teacherId,
  };
  const errs = validateSessionAdjust({ status: s.status, hasAttendance, current, next, today });
  if (errs.length) throw precondition(errs);
  if (next.teacherId !== current.teacherId && next.teacherId && next.teacherId !== cls.leadTeacherId && next.teacherId !== cls.assistantTeacherId) await assertTeacherQualified(ctx.db, next.teacherId, cls.courseId);
  if (next.roomId !== current.roomId && next.roomId) {
    const r = await ctx.db.query.rooms.findFirst({ where: eq(rooms.id, next.roomId) });
    if (!r || r.centerId !== cls.centerId || !r.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Phòng không thuộc cơ sở của lớp hoặc đang ngưng" });
  }
  if (next.date !== current.date && (await holidayDates(ctx.db, cls.centerId)).includes(next.date)) throw precondition(`Ngày ${fmt(next.date)} là ngày nghỉ của cơ sở`);
  const own = await ctx.db.select({ id: sessions.id }).from(sessions)
    .where(and(eq(sessions.classId, cls.id), eq(sessions.date, next.date), sql`${sessions.id} <> ${s.id}`, sql`${sessions.status} not in ('cancelled','rescheduled')`, sql`${sessions.startTime} < ${next.endTime}::time and ${sessions.endTime} > ${next.startTime}::time`));
  if (own.length) throw new TRPCError({ code: "CONFLICT", message: "Lớp đã có buổi khác trùng giờ ngày này" });
  const conflicts = await conflictsWith(ctx.db, [{ id: s.id, ...next }], cls.id, [s.id]);
  if (conflicts.length) throw new TRPCError({ code: "CONFLICT", message: conflictMessage(conflicts) });
  const timeChanged = next.date !== current.date || next.startTime !== current.startTime || next.endTime !== current.endTime;
  const label = sessionLabel(s.sequenceNo, s.kind as SessionKind, s.originalSequenceNo);
  const names = await namesFor(ctx.db, [current.roomId, next.roomId], [current.teacherId, next.teacherId]);
  const describe = (x: typeof current) => `${fmt(x.date)} ${x.startTime}–${x.endTime} · ${x.roomId ? names.room.get(x.roomId) ?? "?" : "—"} · ${x.teacherId ? names.teacher.get(x.teacherId) ?? "?" : "—"}`;

  try {
    await ctx.db.transaction(async (tx) => {
      const db = tx as unknown as Db;
      const up = await tx.update(sessions).set({
        ...next,
        adjustReason: reason,
        ...(next.date !== current.date ? { rescheduledFromDate: s.rescheduledFromDate ?? current.date } : {}),
      }).where(and(eq(sessions.id, s.id), eq(sessions.status, "scheduled"), sql`not exists (select 1 from ${attendance} a where a.session_id = ${SID})`)).returning({ id: sessions.id });
      if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Buổi vừa thay đổi — tải lại trang" });
      if (s.kind === "regular" && next.date !== current.date) await syncEnd(db, cls.id);
      await tx.insert(classEvents).values({ classId: cls.id, event: "adjust_session", reason, actorId: ctx.user.id, meta: { sessionId: s.id, label, from: current, to: next } });
      await writeAudit(db, { actorId: ctx.user.id, action: "UPDATE", module: "academics", entity: "sessions", entityId: s.id, before: current, after: next, reason, ip: ctx.ip });
      const tUsers = await teacherUserIds(db, [current.teacherId, next.teacherId, cls.leadTeacherId, cls.assistantTeacherId]);
      await notifyUsers(db, tUsers, "Điều chỉnh buổi học", `${cls.code} · ${label}: ${describe(current)} → ${describe(next)} — ${reason}`, `/teacher/sessions/${s.id}`, 1);
      if (timeChanged) await notifyTrialsMoved(db, [s.id], `${label} dời sang ${fmt(next.date)} ${next.startTime}`, cls.code);
      if (input.notifyParents && (timeChanged || next.roomId !== current.roomId)) {
        await notifyClassParents(db, cls.id, { template: "SESSION_CHANGED", title: `Lớp ${cls.name}: đổi lịch ${label}`, body: `${label} (${fmt(current.date)} ${current.startTime}) chuyển sang ${fmt(next.date)} ${next.startTime}–${next.endTime}${next.roomId !== current.roomId && next.roomId ? ` tại phòng ${names.room.get(next.roomId) ?? ""}` : ""}. ${reason}` });
      }
    });
  } catch (e) {
    mapExclusion(e);
  }
  return { ok: true, label, from: current, to: next };
}

/* ------------------------------------------------------------------ */
/* Huỷ một buổi (có / không dời bù)                                    */
/* ------------------------------------------------------------------ */

async function buildCancel(ctx: ProtectedContext, sessionId: string, mode: "shift" | "none") {
  const { s, cls, hasAttendance } = await loadForChange(ctx, sessionId);
  const errors = validateSessionCancel({ status: s.status, hasAttendance });
  const isRegular = s.kind === "regular" && s.sequenceNo <= EXTRA_SEQUENCE_BASE;
  const today = todayISO();
  const existing = await existingForPlan(ctx.db, cls.id);
  const plan = mode === "shift" && isRegular && !errors.length
    ? planCancelShift({ sessions: existing, cancelledId: s.id, rules: await rulesForClass(ctx.db, cls), holidays: await holidayDates(ctx.db, cls.centerId), today })
    : null;
  if (mode === "shift" && !isRegular) errors.push("Buổi ngoài lộ trình chỉ huỷ, không dời bù");
  if (plan) errors.push(...plan.errors);
  const moved = plan?.moves.filter((m) => m.changed) ?? [];
  const planned = plan?.replacement ? [{ id: "replacement", ...plan.replacement }, ...moved.map((m) => ({ id: m.sessionId, ...m.to }))] : [];
  const conflicts = !errors.length && planned.length ? await conflictsWith(ctx.db, planned, cls.id, [s.id, ...moved.map((m) => m.sessionId)]) : [];
  const trialsById = new Map(existing.map((e) => [e.id, e.trials]));
  return { s, cls, plan, moved, conflicts, errors, isRegular, trials: trialsById.get(s.id) ?? 0, movedTrials: moved.reduce((n, m) => n + (trialsById.get(m.sessionId) ?? 0), 0) };
}

/** Xem trước huỷ buổi: buổi thay thế + các buổi dời một nhịp */
export async function previewCancelSession(ctx: ProtectedContext, input: { sessionId: string; mode: "shift" | "none" }) {
  const b = await buildCancel(ctx, input.sessionId, input.mode);
  return {
    label: sessionLabel(b.s.sequenceNo, b.s.kind as SessionKind, b.s.originalSequenceNo),
    date: b.s.date, isRegular: b.isRegular, errors: b.errors, warnings: b.plan?.warnings ?? [], conflicts: b.conflicts,
    replacement: b.plan?.replacement ?? null, moves: b.moved, trials: b.trials, movedTrials: b.movedTrials,
    oldEndDate: b.cls.expectedEndDate, newEndDate: b.plan?.newEndDate ?? b.cls.expectedEndDate,
  };
}

export async function cancelSession(ctx: ProtectedContext, input: { sessionId: string; reason: string; mode: "shift" | "none"; notifyParents?: boolean }) {
  const reason = reasonOrThrow(input.reason);
  const b = await buildCancel(ctx, input.sessionId, input.mode);
  if (b.errors.length) throw precondition(b.errors);
  if (b.conflicts.length) throw new TRPCError({ code: "CONFLICT", message: `Không dời bù được: ${conflictMessage(b.conflicts)}` });
  const { s, cls, plan, moved } = b;
  const label = sessionLabel(s.sequenceNo, s.kind as SessionKind, s.originalSequenceNo);
  const shift = input.mode === "shift" && !!plan?.replacement;
  const out = { trialsCancelled: 0, replacementId: null as string | null };
  try {
    await ctx.db.transaction(async (tx) => {
      const db = tx as unknown as Db;
      await tx.execute(sql`set constraints sessions_no_room_overlap, sessions_no_teacher_overlap deferred`);
      const up = await tx.update(sessions).set({
        status: "cancelled", cancelReason: reason, cancelledAt: new Date(), cancelledBy: ctx.user.id,
        ...(shift ? { sequenceNo: plan!.archiveSeq, originalSequenceNo: s.sequenceNo } : {}),
      }).where(and(eq(sessions.id, s.id), inArray(sessions.status, ["scheduled", "in_progress"]), sql`not exists (select 1 from ${attendance} a where a.session_id = ${SID})`)).returning({ id: sessions.id });
      if (!up.length) throw new TRPCError({ code: "CONFLICT", message: "Buổi vừa thay đổi (đã điểm danh / đã xử lý) — tải lại trang" });
      if (shift) {
        for (const m of moved) {
          const u = await tx.update(sessions).set({ date: m.to.date, startTime: m.to.startTime, endTime: m.to.endTime, roomId: m.to.roomId, teacherId: m.to.teacherId, rescheduledFromDate: sql`coalesce(${sessions.rescheduledFromDate}, ${m.from.date}::date)` })
            .where(and(eq(sessions.id, m.sessionId), eq(sessions.status, "scheduled"))).returning({ id: sessions.id });
          if (!u.length) throw new TRPCError({ code: "CONFLICT", message: `Buổi ${m.sequenceNo} vừa thay đổi — xem trước lại` });
        }
        const r = plan!.replacement!;
        const [row] = await tx.insert(sessions).values({
          classId: cls.id, lessonId: s.lessonId, sequenceNo: s.sequenceNo, kind: "regular", date: r.date, startTime: r.startTime, endTime: r.endTime,
          roomId: r.roomId, teacherId: r.teacherId, topic: s.topic, privateNote: s.privateNote, rescheduledFromId: s.id, rescheduledFromDate: s.date, adjustReason: `Bù cho buổi huỷ ${fmt(s.date)}: ${reason}`, createdBy: ctx.user.id,
        }).returning({ id: sessions.id });
        out.replacementId = row!.id;
        await tx.update(classes).set({ expectedEndDate: plan!.newEndDate }).where(eq(classes.id, cls.id));
      } else if (s.kind === "regular") {
        await syncEnd(db, cls.id);
      }
      out.trialsCancelled = await cancelTrialsFor(db, [s.id], `Buổi ${fmt(s.date)} bị huỷ: ${reason}`, ctx.user.id, cls.code);
      if (shift) await notifyTrialsMoved(db, moved.map((m) => m.sessionId), "buổi học dời một nhịp do có buổi huỷ", cls.code);
      // Học bù đã xếp vào buổi bị huỷ → trả về chờ xếp lại
      await tx.update(makeupRequests).set({ status: "requested", targetSessionId: null, note: `Buổi bù ${fmt(s.date)} bị huỷ — xếp lại`, updatedAt: new Date() })
        .where(and(eq(makeupRequests.targetSessionId, s.id), eq(makeupRequests.status, "approved")));
      await tx.insert(classEvents).values({
        classId: cls.id, event: "cancel_session", reason, actorId: ctx.user.id,
        meta: { sessionId: s.id, label, date: s.date, mode: input.mode, replacementId: out.replacementId, replacementDate: shift ? plan!.replacement!.date : null, moved: moved.length, trialsCancelled: out.trialsCancelled },
      });
      await writeAudit(db, {
        actorId: ctx.user.id, action: "TRANSITION", module: "academics", entity: "sessions", entityId: s.id,
        before: { status: s.status, sequenceNo: s.sequenceNo, date: s.date },
        after: { status: "cancelled", mode: input.mode, ...(shift ? { archiveSeq: plan!.archiveSeq, replacementId: out.replacementId, replacement: plan!.replacement, moved: moved.map((m) => `${m.sequenceNo}: ${m.from.date}→${m.to.date}`) } : {}), trialsCancelled: out.trialsCancelled },
        reason, ip: ctx.ip,
      });
      const tUsers = await teacherUserIds(db, [s.teacherId, cls.leadTeacherId, cls.assistantTeacherId, ...moved.map((m) => m.to.teacherId)]);
      const shiftText = shift ? ` Bù: ${fmt(plan!.replacement!.date)} ${plan!.replacement!.startTime}${moved.length ? `, ${moved.length} buổi sau dời một nhịp` : ""}.` : "";
      await notifyUsers(db, tUsers, "Huỷ buổi học", `${cls.code} · ${label} ${fmt(s.date)}: ${reason}.${shiftText}`, out.replacementId ? `/teacher/sessions/${out.replacementId}` : "/teacher/classes", 1);
      if (input.notifyParents) {
        await notifyClassParents(db, cls.id, { template: "SESSION_CANCELLED", title: `Lớp ${cls.name}: nghỉ ${label}`, body: `${label} ngày ${fmt(s.date)} ${hhmm(s.startTime)} nghỉ: ${reason}.${shiftText}` });
      }
    });
  } catch (e) {
    mapExclusion(e);
  }
  return { mode: input.mode, label, replacementId: out.replacementId, replacement: shift ? plan!.replacement : null, moved: moved.length, trialsCancelled: out.trialsCancelled, newEndDate: shift ? plan!.newEndDate : null };
}
