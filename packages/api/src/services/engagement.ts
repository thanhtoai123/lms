import { and, eq, isNull, asc, desc, sql, inArray, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  outbox, careTasks, userNotifications, parentNotifications, userRoles, students, studentGuardians, enrollments, classes, sessions, attendance, leads, leadTasks, parents,
  type Database,
} from "@satarobo/db";
import { runRules, DEFAULT_RULES, computeSla, OPEN_LEAD_STATUSES, visibleCenterIds, type DomainEvent, type Action, type Role } from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { assertTenant, tenantCond, tenantCondStrict } from "./tenantScope";
import { deliverNotifications } from "./notify";

/* ---------------------------------------------------------------------------------------------
 * WORKER: xử lý outbox theo lô. Gọi bởi `pnpm worker` (vòng lặp) hoặc route /api/cron/outbox (Vercel Cron).
 * Idempotent theo từng event: đánh dấu processedAt; lỗi thì tăng attempts, thử lại tối đa 5 lần.
 * ------------------------------------------------------------------------------------------- */

export interface WorkerResult { processed: number; failed: number; actions: number }

export async function processOutbox(db: Database, opts: { batch?: number } = {}): Promise<WorkerResult> {
  const rows = await db.select().from(outbox).where(and(isNull(outbox.processedAt), sql`${outbox.attempts} < 5`)).orderBy(asc(outbox.createdAt)).limit(opts.batch ?? 100);
  let processed = 0, failed = 0, actions = 0;
  for (const row of rows) {
    const event = { type: row.type, ...row.payload } as DomainEvent;
    try {
      const matches = runRules(event, DEFAULT_RULES);
      for (const m of matches) for (const a of m.actions) { await executeAction(db, a, event, m.rule); actions++; }
      await db.update(outbox).set({ processedAt: new Date() }).where(eq(outbox.id, row.id));
      processed++;
    } catch (e) {
      failed++;
      await db.update(outbox).set({ attempts: row.attempts + 1, lastError: (e as Error).message.slice(0, 500) }).where(eq(outbox.id, row.id));
    }
  }
  return { processed, failed, actions };
}

async function usersWithRole(db: Database, role: string, centerId: string | null | undefined) {
  const conds: SQL[] = [eq(userRoles.role, role as Role)];
  if (centerId) conds.push(sql`(${userRoles.centerId} = ${centerId} or ${userRoles.centerId} is null)`);
  return (await db.select({ userId: userRoles.userId }).from(userRoles).where(and(...conds))).map((r) => r.userId);
}

/** Cơ sở của một học viên qua enrollment → class (để định tuyến thông báo đúng cơ sở) */
async function centerOfEnrollment(db: Database, enrollmentId: string) {
  const r = await db.select({ centerId: classes.centerId }).from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).where(eq(enrollments.id, enrollmentId)).limit(1);
  return r[0]?.centerId ?? null;
}

async function executeAction(db: Database, a: Action, event: DomainEvent, rule: string) {
  switch (a.kind) {
    case "create_care_task": {
      const dedupeKey = `${a.enrollmentId}:${a.code}`;
      const open = await db.query.careTasks.findFirst({ where: and(eq(careTasks.dedupeKey, dedupeKey), inArray(careTasks.status, ["open", "in_progress", "escalated"])) });
      if (open) return; // đã có việc đang mở cho rủi ro này
      const centerId = await centerOfEnrollment(db, a.enrollmentId);
      await db.insert(careTasks).values({ studentId: a.studentId, enrollmentId: a.enrollmentId, centerId, code: a.code, title: a.title, severity: a.severity, dueAt: new Date(Date.now() + a.dueInHours * 3600_000), dedupeKey });
      return;
    }
    case "create_lead_task": {
      const lead = await db.query.leads.findFirst({ where: eq(leads.id, a.leadId), columns: { assignedToId: true } });
      await db.insert(leadTasks).values({ leadId: a.leadId, title: a.title, dueAt: new Date(Date.now() + a.dueInMinutes * 60_000), assigneeId: lead?.assignedToId ?? null, createdByRule: rule });
      return;
    }
    case "notify_user": {
      let targets: string[] = a.userId ? [a.userId] : [];
      if (!a.userId && a.role) {
        // định tuyến theo cơ sở của đối tượng trong event
        let centerId: string | null | undefined = a.centerId;
        if (centerId === undefined && "enrollmentId" in event) centerId = await centerOfEnrollment(db, (event as { enrollmentId: string }).enrollmentId);
        if (centerId === undefined && "leadId" in event) centerId = (await db.query.leads.findFirst({ where: eq(leads.id, (event as { leadId: string }).leadId), columns: { centerId: true } }))?.centerId ?? null;
        targets = await usersWithRole(db, a.role, centerId ?? null);
        if (a.role === "TEACHER" && "sessionId" in event) {
          const s = await db.select({ userId: sql<string | null>`(select t.user_id from teachers t where t.id = ${sessions.teacherId})` }).from(sessions).where(eq(sessions.id, (event as { sessionId: string }).sessionId)).limit(1);
          targets = s[0]?.userId ? [s[0].userId] : [];
        }
      }
      if (targets.length === 0) return;
      // gom: không tạo trùng cùng link+title chưa đọc cho cùng user
      for (const userId of new Set(targets)) {
        const dup = a.link ? await db.query.userNotifications.findFirst({ where: and(eq(userNotifications.userId, userId), eq(userNotifications.link, a.link), eq(userNotifications.title, a.title), isNull(userNotifications.readAt)) }) : null;
        if (dup) continue;
        await deliverNotifications(db, [userId], { title: a.title, body: a.body, link: a.link ?? null, priority: a.priority, type: a.notificationType ?? null });
      }
      return;
    }
    case "notify_parent": {
      // studentId "*" = mọi HV có mặt trong buổi (event session.completed)
      if (event.type !== "session.completed") return;
      const rows = await db
        .select({ studentId: enrollments.studentId, parentId: studentGuardians.parentId, status: attendance.status, remark: attendance.studentRemark, note: sessions.sessionNote, topic: sessions.topic, seq: sessions.sequenceNo, className: classes.name })
        .from(attendance)
        .innerJoin(enrollments, eq(enrollments.id, attendance.enrollmentId))
        .innerJoin(studentGuardians, eq(studentGuardians.studentId, enrollments.studentId))
        .innerJoin(sessions, eq(sessions.id, attendance.sessionId))
        .innerJoin(classes, eq(classes.id, sessions.classId))
        .where(eq(attendance.sessionId, event.sessionId));
      for (const r of rows) {
        const title = `Buổi ${r.seq} · ${r.className}`;
        const body = `${r.status === "present" || r.status === "late" || r.status === "makeup" ? "Con có mặt" : "Con vắng"}${r.remark ? ` · ${r.remark}` : ""}\n${r.note ?? ""}`.trim();
        for (const channel of a.channels) {
          await db.insert(parentNotifications).values({ parentId: r.parentId, studentId: r.studentId, channel, template: a.template, title, body, link: `/parent/comments`, params: { ...a.params, studentId: r.studentId }, status: channel === "in_app" ? "sent" : "queued", sentAt: channel === "in_app" ? new Date() : null });
        }
      }
      return;
    }
  }
}

/** Quét SLA lead định kỳ → emit lead.sla_breached (mỗi lead tối đa 1 lần/giờ nhờ nextActionAt) */
export async function scanLeadSla(db: Database): Promise<number> {
  const open = await db.select({ id: leads.id, status: leads.status, lastTouchAt: leads.lastTouchAt }).from(leads).where(and(inArray(leads.status, [...OPEN_LEAD_STATUSES]), isNull(leads.deletedAt)));
  const now = new Date().toISOString();
  let n = 0;
  for (const l of open) {
    const sla = computeSla(l.status, l.lastTouchAt.toISOString(), now);
    if (sla.level !== "overdue" || sla.overdueMinutes < 60 || sla.overdueMinutes % 60 > 5) continue; // mỗi giờ một lần
    await db.insert(outbox).values({ type: "lead.sla_breached", payload: { leadId: l.id, status: l.status, overdueMinutes: sla.overdueMinutes } });
    n++;
  }
  return n;
}

/* ---------------------------------------------------------------------------------------------
 * API cho Ops
 * ------------------------------------------------------------------------------------------- */

export async function listCareTasks(ctx: ProtectedContext, input: { status?: "open" | "in_progress" | "done" | "escalated" | "dismissed"; centerId?: string }) {
  requirePermission(ctx, "care:read", { centerId: input.centerId ?? null });
  const conds: SQL[] = [tenantCond(ctx, careTasks)];
  if (input.status) conds.push(eq(careTasks.status, input.status)); else conds.push(inArray(careTasks.status, ["open", "in_progress", "escalated"]));
  if (input.centerId) conds.push(eq(careTasks.centerId, input.centerId));
  const visible = visibleCenterIds(ctx.actor);
  if (visible !== null) conds.push(visible.length ? inArray(careTasks.centerId, visible) : sql`false`);
  const rows = await ctx.db
    .select({ id: careTasks.id, code: careTasks.code, title: careTasks.title, severity: careTasks.severity, status: careTasks.status, dueAt: careTasks.dueAt, createdAt: careTasks.createdAt, outcome: careTasks.outcome, studentId: students.id, studentName: students.fullName, studentCode: students.code, className: classes.name, classId: classes.id })
    .from(careTasks)
    .innerJoin(students, eq(students.id, careTasks.studentId))
    .leftJoin(enrollments, eq(enrollments.id, careTasks.enrollmentId))
    .leftJoin(classes, eq(classes.id, enrollments.classId))
    .where(and(...conds))
    .orderBy(asc(careTasks.severity), asc(careTasks.dueAt));
  const now = Date.now();
  return rows.map((r) => ({ ...r, overdue: r.status !== "done" && r.status !== "dismissed" && r.dueAt.getTime() < now }));
}

export async function resolveCareTask(ctx: ProtectedContext, input: { id: string; status: "in_progress" | "done" | "escalated" | "dismissed"; outcome?: string }) {
  const t = await ctx.db.query.careTasks.findFirst({ where: eq(careTasks.id, input.id) });
  if (!t) throw new TRPCError({ code: "NOT_FOUND" });
  assertTenant(ctx, t, "Việc chăm sóc");
  requirePermission(ctx, "care:update", { centerId: t.centerId });
  await ctx.db.update(careTasks).set({ status: input.status, outcome: input.outcome ?? t.outcome, ...(input.status === "done" || input.status === "dismissed" ? { resolvedAt: new Date(), resolvedBy: ctx.user.id } : {}), assigneeId: t.assigneeId ?? ctx.user.id }).where(eq(careTasks.id, t.id));
  return { ok: true };
}

export async function myNotifications(ctx: ProtectedContext, input: { unreadOnly?: boolean; limit?: number }) {
  const conds = [eq(userNotifications.userId, ctx.user.id)];
  if (input.unreadOnly) conds.push(isNull(userNotifications.readAt));
  const items = await ctx.db.select().from(userNotifications).where(and(...conds)).orderBy(asc(userNotifications.priority), desc(userNotifications.createdAt)).limit(input.limit ?? 30);
  const [c] = await ctx.db.select({ n: sql<number>`count(*)::int`, p1: sql<number>`count(*) filter (where priority = 1)::int` }).from(userNotifications).where(and(eq(userNotifications.userId, ctx.user.id), isNull(userNotifications.readAt)));
  return { items, unread: c?.n ?? 0, hasPriority1: (c?.p1 ?? 0) > 0 };
}

export async function markRead(ctx: ProtectedContext, input: { ids?: string[]; all?: boolean }) {
  const conds = [eq(userNotifications.userId, ctx.user.id), isNull(userNotifications.readAt)];
  if (!input.all && input.ids?.length) conds.push(inArray(userNotifications.id, input.ids));
  await ctx.db.update(userNotifications).set({ readAt: new Date() }).where(and(...conds));
  return { ok: true };
}

/** Thông báo phụ huynh (cho cổng PH sau này và để Ops kiểm tra) */
export async function parentFeed(ctx: ProtectedContext, input: { parentId: string; limit?: number }) {
  const p = await ctx.db.query.parents.findFirst({ where: eq(parents.id, input.parentId), columns: { id: true, tenantId: true } });
  if (!p) throw new TRPCError({ code: "NOT_FOUND" });
  assertTenant(ctx, p, "Phụ huynh");
  requirePermission(ctx, "student:read", { ownerIds: [input.parentId] });
  return ctx.db.select().from(parentNotifications).where(and(eq(parentNotifications.parentId, input.parentId), eq(parentNotifications.channel, "in_app"), tenantCond(ctx, parentNotifications))).orderBy(desc(parentNotifications.createdAt)).limit(input.limit ?? 50);
}

/** Thống kê outbox cho trang Hệ thống */
export async function outboxStats(ctx: ProtectedContext) {
  requirePermission(ctx, "automation:read");
  const [r] = await ctx.db.select({
    pending: sql<number>`count(*) filter (where processed_at is null and attempts < 5)::int`,
    dead: sql<number>`count(*) filter (where processed_at is null and attempts >= 5)::int`,
    processed24h: sql<number>`count(*) filter (where processed_at > now() - interval '24 hours')::int`,
  }).from(outbox).where(tenantCondStrict(ctx, outbox));
  const dead = await ctx.db.select({ id: outbox.id, type: outbox.type, lastError: outbox.lastError, createdAt: outbox.createdAt }).from(outbox).where(and(isNull(outbox.processedAt), sql`${outbox.attempts} >= 5`, tenantCondStrict(ctx, outbox))).orderBy(desc(outbox.createdAt)).limit(20);
  return { ...r!, dead };
}

