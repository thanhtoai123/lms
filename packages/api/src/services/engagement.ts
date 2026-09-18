import { and, eq, isNull, asc, desc, sql, inArray, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  outbox, careTasks, userNotifications, parentNotifications, userRoles, students, studentGuardians, enrollments, classes, sessions, attendance, leads, leadTasks, parents,
  type Database,
} from "@satarobo/db";
import {
  runRules, DEFAULT_RULES, DEFAULT_SLA, OPEN_LEAD_STATUSES, visibleCenterIds,
  DEFAULT_RETRY, failureUpdate, clampPageSize, type RetryPolicy,
  type DomainEvent, type Action, type Role,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { deliverNotifications } from "./notify";
import { slaOverdueMinutesSql, slaOverdueSql } from "./leadSlaSql";

/* ---------------------------------------------------------------------------------------------
 * WORKER: xử lý outbox theo lô. Gọi bởi `pnpm worker` (vòng lặp) hoặc route /api/cron/outbox (Vercel Cron).
 *
 * Ba bảo đảm (đợt tối ưu hiệu năng / độ tin cậy):
 *  1) CHỐNG CHẠY TRÙNG — nhận việc bằng `select … for update skip locked` trong một transaction
 *     ngắn, đồng thời đẩy `next_attempt_at` ra trước một khoảng "đang chạy". Hai worker
 *     (hoặc worker + /api/cron/outbox) chạy song song sẽ lấy hai lô khác nhau, không bao giờ
 *     gửi hai lần cùng một thông báo cho phụ huynh.
 *  2) THỬ LẠI CÓ GIÃN CÁCH — hỏng lần n thì `next_attempt_at = now + 30s·2^(n-1)` (trần 15 phút),
 *     thay cho việc gọi lại sau đúng 10 giây và nện liên tục vào nhà cung cấp đang sập.
 *  3) HÀNG ĐỢI CHẾT — hỏng quá 5 lần thì đặt `dead_letter_at`, worker thôi đọc; trang Hệ thống
 *     vẫn xem được và `retryDeadLetter` đẩy lại khi đã sửa nguyên nhân.
 *
 * Truy vấn: trước = 1 lần đọc cả hàng đợi (không khoá) + 1 update cho mỗi dòng.
 *           sau  = 1 transaction nhận lô (1 select + 1 update) + 1 update cho mỗi dòng.
 * ------------------------------------------------------------------------------------------- */

export interface WorkerResult { processed: number; failed: number; actions: number; deadLettered: number }

/** Một dòng outbox đang được worker này giữ */
type OutboxClaim = { id: string; type: string; payload: Record<string, unknown>; attempts: number };

/**
 * Nhận (khoá) một lô việc còn sống và đã tới hạn.
 * `for update skip locked` bỏ qua dòng worker khác đang giữ thay vì xếp hàng chờ.
 * Việc nhận xong được đẩy `next_attempt_at` ra `visibilityMs` để nếu tiến trình chết giữa chừng
 * thì lô đó tự quay lại hàng đợi sau khoảng đó chứ không kẹt vĩnh viễn.
 */
async function claimOutboxBatch(db: Database, batch: number, visibilityMs: number): Promise<OutboxClaim[]> {
  return db.transaction(async (tx) => {
    const picked = (await tx.execute(sql`
      select id from ${outbox}
       where processed_at is null and dead_letter_at is null and next_attempt_at <= now()
       order by created_at
       limit ${batch}
       for update skip locked
    `)) as unknown as { id: string }[];
    const ids = picked.map((r) => r.id);
    if (ids.length === 0) return [];
    const rows = await tx
      .update(outbox)
      .set({ lastAttemptAt: new Date(), nextAttemptAt: sql`now() + make_interval(secs => ${visibilityMs / 1000})` })
      .where(inArray(outbox.id, ids))
      .returning({ id: outbox.id, type: outbox.type, payload: outbox.payload, attempts: outbox.attempts });
    // Giữ đúng thứ tự cũ-trước như câu select ở trên
    const order = new Map(ids.map((x, i) => [x, i]));
    return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  });
}

export async function processOutbox(db: Database, opts: { batch?: number; retry?: RetryPolicy } = {}): Promise<WorkerResult> {
  const policy = opts.retry ?? DEFAULT_RETRY;
  const batch = Math.max(1, opts.batch ?? 100);
  // Một lô 100 việc phải xong trong vài phút; quá thì coi như tiến trình chết và trả việc lại hàng đợi
  const rows = await claimOutboxBatch(db, batch, 5 * 60_000);
  let processed = 0, failed = 0, actions = 0, deadLettered = 0;
  for (const row of rows) {
    const event = { type: row.type, ...row.payload } as DomainEvent;
    try {
      const matches = runRules(event, DEFAULT_RULES);
      for (const m of matches) for (const a of m.actions) { await executeAction(db, a, event, m.rule); actions++; }
      await db.update(outbox).set({ processedAt: new Date() }).where(eq(outbox.id, row.id));
      processed++;
    } catch (e) {
      failed++;
      const f = failureUpdate(new Date(), row.attempts, e instanceof Error ? e.message : String(e), policy);
      if (f.deadLettered) deadLettered++;
      await db
        .update(outbox)
        .set({
          attempts: f.attempts,
          lastError: f.lastError,
          nextAttemptAt: f.nextAttemptAt,
          deadLetterAt: f.deadLettered ? new Date() : null,
        })
        .where(eq(outbox.id, row.id));
    }
  }
  return { processed, failed, actions, deadLettered };
}

/**
 * Đẩy việc trong hàng đợi chết trở lại hàng đợi sống (sau khi đã sửa nguyên nhân).
 * Không truyền `ids` = đẩy lại tất cả. Đếm số dòng đã đẩy.
 */
export async function retryDeadLetter(ctx: ProtectedContext, input: { ids?: string[] } = {}) {
  requirePermission(ctx, "automation:update");
  const conds: SQL[] = [isNull(outbox.processedAt), sql`${outbox.deadLetterAt} is not null`];
  if (input.ids?.length) conds.push(inArray(outbox.id, input.ids.slice(0, 500)));
  const rows = await ctx.db
    .update(outbox)
    .set({ deadLetterAt: null, attempts: 0, nextAttemptAt: new Date(), lastError: null })
    .where(and(...conds))
    .returning({ id: outbox.id });
  return { requeued: rows.length };
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
      // gom: không tạo trùng cùng link+title chưa đọc cho cùng user.
      // Trước: 1 truy vấn kiểm tra trùng CHO MỖI người nhận (một rule bắn cho cả cơ sở ⇒ hàng chục truy vấn).
      // Sau:  1 truy vấn `inArray` lấy hết người đã có thông báo trùng, rồi tra trong Set.
      const uniqueTargets = [...new Set(targets)];
      const already = a.link
        ? new Set(
          (await db
            .select({ userId: userNotifications.userId })
            .from(userNotifications)
            .where(and(
              inArray(userNotifications.userId, uniqueTargets),
              eq(userNotifications.link, a.link),
              eq(userNotifications.title, a.title),
              isNull(userNotifications.readAt),
            ))).map((r) => r.userId),
        )
        : new Set<string>();
      for (const userId of uniqueTargets) {
        if (already.has(userId)) continue;
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

/**
 * Quét SLA lead định kỳ → emit `lead.sla_breached`, tối đa MỘT sự kiện cho mỗi lead mỗi giờ.
 *
 * Trước: tải TOÀN BỘ lead đang mở (không `limit`) mỗi 10 giây rồi lọc bằng `computeSla` trong JS —
 *        1 truy vấn quét cả bảng mỗi nhịp, và vì cửa sổ "quá hạn ≡ 0..5 phút (mod 60)" rộng 6 phút
 *        nên cùng một lead bị phát tới ~36 sự kiện mỗi giờ (ngập outbox, phụ huynh bị nhắc nhiều lần).
 * Sau:  1 truy vấn lọc thẳng trong SQL (chỉ trả về lead THỰC SỰ cần phát, tối đa 500 dòng/nhịp) +
 *       1 câu insert gộp. Điều kiện "trong 1 giờ qua đã phát cho lead này chưa" cũng nằm trong SQL,
 *       dùng chỉ mục `outbox_lead_sla_idx` (0006) — đúng với câu chú thích vốn đã ghi "mỗi giờ một lần".
 */
export async function scanLeadSla(db: Database): Promise<number> {
  const now = new Date();
  const overdueMin = slaOverdueMinutesSql(DEFAULT_SLA, leads.status, leads.lastTouchAt, now);
  const due = await db
    .select({ id: leads.id, status: leads.status, overdueMinutes: overdueMin })
    .from(leads)
    .where(and(
      inArray(leads.status, [...OPEN_LEAD_STATUSES]),
      isNull(leads.deletedAt),
      slaOverdueSql(DEFAULT_SLA, leads.status, leads.lastTouchAt, now),
      sql`${overdueMin} >= 60`,
      sql`(${overdueMin} % 60) <= 5`,
      // Đã phát cho lead này trong 1 giờ qua thì thôi
      sql`not exists (
        select 1 from ${outbox} o
         where o.type = 'lead.sla_breached'
           and o.payload ->> 'leadId' = ${leads.id}::text
           and o.created_at > ${now.toISOString()}::timestamptz - interval '1 hour'
      )`,
    ))
    .orderBy(asc(leads.lastTouchAt))
    .limit(500);
  if (due.length === 0) return 0;
  await db.insert(outbox).values(
    due.map((l) => ({ type: "lead.sla_breached", payload: { leadId: l.id, status: l.status, overdueMinutes: l.overdueMinutes ?? 0 } })),
  );
  return due.length;
}

/* ---------------------------------------------------------------------------------------------
 * API cho Ops
 * ------------------------------------------------------------------------------------------- */

/** Điều kiện lọc dùng chung cho danh sách việc chăm sóc và cho phần đếm của hộp việc */
function careTaskConds(ctx: ProtectedContext, input: { status?: "open" | "in_progress" | "done" | "escalated" | "dismissed"; centerId?: string }): SQL[] {
  const conds: SQL[] = [];
  if (input.status) conds.push(eq(careTasks.status, input.status)); else conds.push(inArray(careTasks.status, ["open", "in_progress", "escalated"]));
  if (input.centerId) conds.push(eq(careTasks.centerId, input.centerId));
  const visible = visibleCenterIds(ctx.actor);
  if (visible !== null) conds.push(visible.length ? inArray(careTasks.centerId, visible) : sql`false`);
  return conds;
}

/** Cột "quá hạn" tính bằng SQL (trước tính trong JS sau khi đã tải hết bảng về) */
const careOverdueSql = sql<boolean>`(${careTasks.status} not in ('done','dismissed') and ${careTasks.dueAt} < now())`;

/** Trần cứng cho màn "Việc chăm sóc học viên" — trước đây KHÔNG có `limit` nào */
const CARE_TASK_MAX_ROWS = 500;

export async function listCareTasks(
  ctx: ProtectedContext,
  input: { status?: "open" | "in_progress" | "done" | "escalated" | "dismissed"; centerId?: string; limit?: number } = {},
) {
  requirePermission(ctx, "care:read", { centerId: input.centerId ?? null });
  const rows = await ctx.db
    .select({ id: careTasks.id, code: careTasks.code, title: careTasks.title, severity: careTasks.severity, status: careTasks.status, dueAt: careTasks.dueAt, createdAt: careTasks.createdAt, outcome: careTasks.outcome, studentId: students.id, studentName: students.fullName, studentCode: students.code, className: classes.name, classId: classes.id, overdue: careOverdueSql })
    .from(careTasks)
    .innerJoin(students, eq(students.id, careTasks.studentId))
    .leftJoin(enrollments, eq(enrollments.id, careTasks.enrollmentId))
    .leftJoin(classes, eq(classes.id, enrollments.classId))
    .where(and(...careTaskConds(ctx, input)))
    .orderBy(asc(careTasks.severity), asc(careTasks.dueAt))
    .limit(clampPageSize(input.limit, CARE_TASK_MAX_ROWS, CARE_TASK_MAX_ROWS));
  return rows;
}

/**
 * Nhóm "Việc chăm sóc học viên tới hạn" của hộp việc hôm nay.
 * Trước: tải TOÀN BỘ việc đang mở rồi lọc `overdue || escalated` trong JS và lấy `.length` làm tổng.
 * Sau:  1 truy vấn `count(*)` + 1 truy vấn lấy đúng `limit` dòng để hiển thị.
 */
export async function careTaskInbox(ctx: ProtectedContext, input: { limit?: number } = {}) {
  requirePermission(ctx, "care:read", { centerId: null });
  const conds = [...careTaskConds(ctx, {}), sql`(${careOverdueSql} or ${careTasks.status} = 'escalated')`];
  const where = and(...conds);
  const [[c], items] = await Promise.all([
    ctx.db.select({ total: sql<number>`count(*)::int`, overdue: sql<number>`count(*) filter (where ${careOverdueSql})::int` }).from(careTasks).where(where),
    ctx.db
      .select({ id: careTasks.id, title: careTasks.title, dueAt: careTasks.dueAt, studentName: students.fullName, className: classes.name, overdue: careOverdueSql })
      .from(careTasks)
      .innerJoin(students, eq(students.id, careTasks.studentId))
      .leftJoin(enrollments, eq(enrollments.id, careTasks.enrollmentId))
      .leftJoin(classes, eq(classes.id, enrollments.classId))
      .where(where)
      .orderBy(asc(careTasks.severity), asc(careTasks.dueAt))
      .limit(clampPageSize(input.limit, 25, 100)),
  ]);
  return { total: c?.total ?? 0, overdue: c?.overdue ?? 0, items };
}

export async function resolveCareTask(ctx: ProtectedContext, input: { id: string; status: "in_progress" | "done" | "escalated" | "dismissed"; outcome?: string }) {
  const t = await ctx.db.query.careTasks.findFirst({ where: eq(careTasks.id, input.id) });
  if (!t) throw new TRPCError({ code: "NOT_FOUND" });
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
  const p = await ctx.db.query.parents.findFirst({ where: eq(parents.id, input.parentId), columns: { id: true } });
  if (!p) throw new TRPCError({ code: "NOT_FOUND" });
  requirePermission(ctx, "student:read", { ownerIds: [input.parentId] });
  return ctx.db.select().from(parentNotifications).where(and(eq(parentNotifications.parentId, input.parentId), eq(parentNotifications.channel, "in_app"))).orderBy(desc(parentNotifications.createdAt)).limit(input.limit ?? 50);
}

/** Thống kê outbox cho trang Hệ thống */
export async function outboxStats(ctx: ProtectedContext) {
  requirePermission(ctx, "automation:read");
  const [r] = await ctx.db.select({
    pending: sql<number>`count(*) filter (where processed_at is null and dead_letter_at is null)::int`,
    dead: sql<number>`count(*) filter (where processed_at is null and dead_letter_at is not null)::int`,
    processed24h: sql<number>`count(*) filter (where processed_at > now() - interval '24 hours')::int`,
    /** Việc đã tới hạn mà chưa ai chạy — con số này tăng nghĩa là worker đang chết hoặc chạy không kịp */
    ready: sql<number>`count(*) filter (where processed_at is null and dead_letter_at is null and next_attempt_at <= now())::int`,
    /** Việc chờ lâu nhất (giây) — dùng cho /api/ready */
    oldestPendingSec: sql<number>`coalesce(extract(epoch from (now() - min(created_at) filter (where processed_at is null and dead_letter_at is null)))::int, 0)`,
  }).from(outbox);
  const dead = await ctx.db
    .select({ id: outbox.id, type: outbox.type, lastError: outbox.lastError, createdAt: outbox.createdAt, attempts: outbox.attempts, deadLetterAt: outbox.deadLetterAt })
    .from(outbox)
    .where(and(isNull(outbox.processedAt), sql`${outbox.deadLetterAt} is not null`))
    .orderBy(desc(outbox.createdAt))
    .limit(20);
  return { ...r!, dead };
}

