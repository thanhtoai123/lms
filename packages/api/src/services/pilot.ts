import { and, eq, inArray, sql, desc, isNull, gte, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { pushSubscriptions, parentNotifications, parents, pilotFeedback, centers, users, cutoverCenters, type Database } from "@satarobo/db";
import {
  authorize, authorizeGlobal, centersWith, pushEndpointAllowed, validPushKeys, pushPayload, pushResultKind, quietHours, pilotFbTransition, pilotFbOverdue,
  adoptionChecks, recentWeeks, CUTOVER_STAGE_VI, PILOT_FB_CATEGORY_VI, PILOT_FB_SEVERITY_VI, PILOT_FB_STATUS_VI,
  type AdoptionWeek, type PilotFbCategory, type PilotFbSeverity, type PilotFbStatus, type CutoverStage,
} from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { tenantCond } from "./tenantScope";
import { writeAudit } from "./audit";
import { todayISO } from "./sessions";
import { deliverySettings } from "./delivery";
import { sendWebPush, vapidKeysFromEnv } from "../webpush";
import { notify } from "./finance";

type Db = ProtectedContext["db"];
const asDb = (d: Database) => d as unknown as Db;
const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });
const forbid = (m: string) => new TRPCError({ code: "FORBIDDEN", message: m });
const allowLocal = () => process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_ACTOR === "1";
const MAX_DEVICES = 10;

/* ------------------------------------------------------------------ */
/* Web Push — phía phụ huynh                                            */
/* ------------------------------------------------------------------ */

export function pushPublicKey(): string | null {
  return vapidKeysFromEnv()?.publicKey ?? null;
}

export async function pushStatus(database: Database, parentId: string) {
  const [r] = await asDb(database).select({ n: sql<number>`count(*)::int` }).from(pushSubscriptions).where(and(eq(pushSubscriptions.parentId, parentId), isNull(pushSubscriptions.revokedAt)));
  return { publicKey: pushPublicKey(), devices: r?.n ?? 0 };
}

export async function subscribePush(database: Database, parentId: string, input: { endpoint: string; p256dh: string; auth: string; userAgent: string | null }) {
  const db = asDb(database);
  if (!pushPublicKey()) return { ok: false as const, error: "Trung tâm chưa bật thông báo đẩy" };
  if (!pushEndpointAllowed(input.endpoint, { allowLocal: allowLocal() })) return { ok: false as const, error: "Trình duyệt không được hỗ trợ" };
  if (!validPushKeys(input)) return { ok: false as const, error: "Khoá đăng ký không hợp lệ" };
  const [cnt] = await db.select({ n: sql<number>`count(*)::int` }).from(pushSubscriptions).where(and(eq(pushSubscriptions.parentId, parentId), isNull(pushSubscriptions.revokedAt), sql`${pushSubscriptions.endpoint} <> ${input.endpoint}`));
  if ((cnt?.n ?? 0) >= MAX_DEVICES) return { ok: false as const, error: `Tối đa ${MAX_DEVICES} thiết bị — tắt thông báo ở thiết bị cũ trước` };
  const vals = { parentId, p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent?.slice(0, 200) ?? null, failures: 0, revokedAt: null, createdAt: new Date() };
  await db.insert(pushSubscriptions).values({ endpoint: input.endpoint, ...vals }).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: vals });
  return { ok: true as const };
}

export async function unsubscribePush(database: Database, parentId: string, endpoint: string) {
  await asDb(database).update(pushSubscriptions).set({ revokedAt: new Date() }).where(and(eq(pushSubscriptions.parentId, parentId), eq(pushSubscriptions.endpoint, endpoint)));
  return { ok: true as const };
}

/** Đẩy thông báo tới thiết bị: tin kênh "push" đang chờ + tin trong app mới (≤ 12 giờ) chưa đẩy */
export async function dispatchPush(database: Database, opts: { limit?: number; now?: Date } = {}) {
  const res = { pushed: 0, failed: 0, gone: 0, deferred: 0 };
  const keys = vapidKeysFromEnv();
  if (!keys) return res;
  const db = asDb(database);
  const now = opts.now ?? new Date();
  const s = await deliverySettings(db);
  const q = quietHours(now, s.quietStart, s.quietEnd);
  const since = new Date(now.getTime() - 12 * 3_600_000);
  const hasSub = sql`exists (select 1 from push_subscriptions ps where ps.parent_id = ${parentNotifications.parentId} and ps.revoked_at is null)`;
  const rows = await db.select({ n: parentNotifications, restricted: parents.processingRestricted }).from(parentNotifications).innerJoin(parents, eq(parents.id, parentNotifications.parentId))
    .where(and(
      or(
        and(eq(parentNotifications.channel, "push"), eq(parentNotifications.status, "queued")),
        and(eq(parentNotifications.channel, "in_app"), isNull(parentNotifications.pushedAt), isNull(parentNotifications.readAt), gte(parentNotifications.createdAt, since), hasSub),
      ),
    ))
    .orderBy(parentNotifications.createdAt).limit(opts.limit ?? 100);
  for (const { n, restricted } of rows) {
    const isQueue = n.channel === "push";
    if (restricted) {
      await db.update(parentNotifications).set(isQueue ? { status: "failed", error: "Phụ huynh đã hạn chế xử lý dữ liệu" } : { pushedAt: now }).where(eq(parentNotifications.id, n.id));
      continue;
    }
    if (q.quiet) {
      res.deferred++;
      continue;
    }
    const subs = await db.select().from(pushSubscriptions).where(and(eq(pushSubscriptions.parentId, n.parentId), isNull(pushSubscriptions.revokedAt)));
    const payload = pushPayload({ title: n.title, body: n.body, link: n.link, template: n.template, id: n.id });
    let okAny = false;
    let lastErr = subs.length ? "" : "Phụ huynh chưa bật thông báo trên thiết bị nào";
    for (const sub of subs) {
      if (!pushEndpointAllowed(sub.endpoint, { allowLocal: allowLocal() })) {
        await db.update(pushSubscriptions).set({ revokedAt: now }).where(eq(pushSubscriptions.id, sub.id));
        continue;
      }
      const r = await sendWebPush(sub, payload, keys, { urgency: n.template === "MESSAGE_NEW" ? "high" : "normal" });
      const kind = r ? pushResultKind(r.status) : "retry";
      if (kind === "ok") {
        okAny = true;
        await db.update(pushSubscriptions).set({ lastSuccessAt: now, failures: 0 }).where(eq(pushSubscriptions.id, sub.id));
      } else if (kind === "gone") {
        res.gone++;
        await db.update(pushSubscriptions).set({ revokedAt: now }).where(eq(pushSubscriptions.id, sub.id));
      } else {
        lastErr = r ? `Dịch vụ đẩy trả HTTP ${r.status}` : "Không kết nối được dịch vụ đẩy";
        const failures = sub.failures + 1;
        await db.update(pushSubscriptions).set({ failures, ...(failures >= 5 ? { revokedAt: now } : {}) }).where(eq(pushSubscriptions.id, sub.id));
      }
    }
    if (okAny) res.pushed++;
    else res.failed++;
    if (isQueue) {
      await db.update(parentNotifications).set(okAny ? { status: "sent", sentAt: now, pushedAt: now, error: null, attempts: n.attempts + 1 } : { status: "failed", error: lastErr || "Không đẩy được", attempts: n.attempts + 1 }).where(eq(parentNotifications.id, n.id));
    } else {
      await db.update(parentNotifications).set({ pushedAt: now }).where(eq(parentNotifications.id, n.id));
    }
  }
  return res;
}

export async function pushOverview(db: Db) {
  const [r] = await db.select({
    devices: sql<number>`count(*) filter (where ${pushSubscriptions.revokedAt} is null)::int`,
    parents: sql<number>`count(distinct ${pushSubscriptions.parentId}) filter (where ${pushSubscriptions.revokedAt} is null)::int`,
    revoked: sql<number>`count(*) filter (where ${pushSubscriptions.revokedAt} is not null)::int`,
  }).from(pushSubscriptions);
  return { configured: !!vapidKeysFromEnv(), devices: r?.devices ?? 0, parents: r?.parents ?? 0, revoked: r?.revoked ?? 0 };
}

/* ------------------------------------------------------------------ */
/* Sổ phản hồi pilot                                                    */
/* ------------------------------------------------------------------ */

function feedbackCenters(ctx: ProtectedContext): string[] | null {
  const c = centersWith(ctx.actor, "cutover:read");
  if (c !== null && !c.length) throw forbid("Không có quyền");
  return c;
}

export async function listFeedback(ctx: ProtectedContext, input: { centerId?: string | null; status?: PilotFbStatus | null }) {
  const ids = feedbackCenters(ctx);
  const conds = [ids === null ? sql`true` : inArray(pilotFeedback.centerId, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])];
  if (input.centerId) conds.push(eq(pilotFeedback.centerId, input.centerId));
  if (input.status) conds.push(eq(pilotFeedback.status, input.status));
  const by = sql<string | null>`(select full_name from users u where u.id = ${pilotFeedback.createdBy})`;
  const handler = sql<string | null>`(select full_name from users u where u.id = ${pilotFeedback.handledBy})`;
  const rows = await ctx.db.select({ f: pilotFeedback, center: centers.code, by, handler }).from(pilotFeedback).innerJoin(centers, eq(centers.id, pilotFeedback.centerId))
    .where(and(...conds)).orderBy(sql`case ${pilotFeedback.status} when 'open' then 0 when 'in_progress' then 1 else 2 end`, sql`case ${pilotFeedback.severity} when 'high' then 0 when 'medium' then 1 else 2 end`, desc(pilotFeedback.createdAt)).limit(200);
  const now = new Date();
  return {
    canHandle: authorizeGlobal(ctx.actor, "cutover:approve"),
    items: rows.map((r) => ({
      ...r.f, centerCode: r.center, by: r.by, handler: r.handler,
      categoryLabel: PILOT_FB_CATEGORY_VI[r.f.category as PilotFbCategory], severityLabel: PILOT_FB_SEVERITY_VI[r.f.severity as PilotFbSeverity], statusLabel: PILOT_FB_STATUS_VI[r.f.status as PilotFbStatus],
      overdue: pilotFbOverdue({ status: r.f.status as PilotFbStatus, severity: r.f.severity as PilotFbSeverity, createdAt: r.f.createdAt }, now),
    })),
  };
}

export async function createFeedback(ctx: ProtectedContext, input: { centerId: string; category: PilotFbCategory; severity: PilotFbSeverity; title: string; detail?: string | null; pageUrl?: string | null }) {
  if (!authorize(ctx.actor, "cutover:read", { centerId: input.centerId }).allowed) throw forbid("Không có quyền với cơ sở này");
  if (input.title.trim().length < 5) throw bad("Tiêu đề tối thiểu 5 ký tự");
  const pageUrl = input.pageUrl && /^\/[^\s]*$/.test(input.pageUrl) ? input.pageUrl.slice(0, 300) : null;
  const [r] = await ctx.db.insert(pilotFeedback).values({ centerId: input.centerId, category: input.category, severity: input.severity, title: input.title.trim().slice(0, 200), detail: input.detail?.trim().slice(0, 3000) || null, pageUrl, createdBy: ctx.user.id }).returning({ id: pilotFeedback.id });
  if (input.severity === "high") {
    const admins = await ctx.db.select({ id: users.id }).from(users).where(sql`exists (select 1 from user_roles r where r.user_id = ${users.id} and r.role = 'SUPER_ADMIN')`);
    await notify(ctx.db, admins.map((a) => a.id), "Pilot: sự cố chặn công việc", input.title.trim().slice(0, 120), `/go-live?tab=phan-hoi`, 1, "pilot.blocker");
  }
  return { id: r!.id };
}

export async function updateFeedback(ctx: ProtectedContext, input: { id: string; status: PilotFbStatus; resolution?: string | null }) {
  if (!authorizeGlobal(ctx.actor, "cutover:approve")) throw forbid("Chỉ Hội sở xử lý phản hồi pilot");
  const f = await ctx.db.query.pilotFeedback.findFirst({ where: eq(pilotFeedback.id, input.id) });
  if (!f) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy phản hồi" });
  const errs = pilotFbTransition(f.status as PilotFbStatus, input.status, input.resolution ?? null);
  if (errs.length) throw bad(errs);
  const done = input.status === "resolved" || input.status === "wontfix";
  await ctx.db.update(pilotFeedback).set({ status: input.status, resolution: done ? input.resolution!.trim().slice(0, 2000) : f.resolution, handledBy: ctx.user.id, resolvedAt: done ? new Date() : null, updatedAt: new Date() }).where(eq(pilotFeedback.id, f.id));
  if (done && f.createdBy) {
    await notify(ctx.db, [f.createdBy], `Phản hồi pilot: ${PILOT_FB_STATUS_VI[input.status]}`, `${f.title.slice(0, 80)} — ${input.resolution!.trim().slice(0, 120)}`, `/go-live?tab=phan-hoi`, 2, "pilot.feedback");
  }
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "TRANSITION", module: "migration", entity: "pilot_feedback", entityId: f.id, before: { status: f.status }, after: { status: input.status }, reason: input.resolution ?? null, ip: ctx.ip });
  return { ok: true };
}

export async function openHighFeedback(db: Db, centerId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(pilotFeedback).where(and(eq(pilotFeedback.centerId, centerId), eq(pilotFeedback.severity, "high"), inArray(pilotFeedback.status, ["open", "in_progress"])));
  return r?.n ?? 0;
}

/* ------------------------------------------------------------------ */
/* Báo cáo sau go-live                                                  */
/* ------------------------------------------------------------------ */

export async function adoptionReport(ctx: ProtectedContext, input: { weeks?: number }) {
  const ids = centersWith(ctx.actor, "report:read");
  if (ids !== null && !ids.length) throw forbid("Không có quyền xem báo cáo");
  const weeks = recentWeeks(todayISO(), Math.min(Math.max(input.weeks ?? 8, 1), 26));
  const from = weeks[0]!;
  const list = await ctx.db.select({ id: centers.id, code: centers.code, name: centers.name, stage: cutoverCenters.stage, liveAt: cutoverCenters.liveAt, parallelFrom: cutoverCenters.parallelFrom })
    .from(centers).leftJoin(cutoverCenters, eq(cutoverCenters.centerId, centers.id))
    .where(and(ids === null ? sql`true` : inArray(centers.id, ids), tenantCond(ctx, centers))).orderBy(centers.code);
  const ein = (await ctx.db.execute(sql`select value from app_settings where key = 'einvoice'`)) as unknown as { value: { enabled?: boolean; startDate?: string | null } }[];
  const einvoiceOn = !!ein[0]?.value?.enabled;
  const einStart = ein[0]?.value?.startDate ?? "2000-01-01";
  const out = [];
  for (const c of list) {
    const rows = (await ctx.db.execute(sql`
      with w as (select unnest(${weeks}::date[]) as ws),
      kids as (select distinct e.student_id from enrollments e join classes cl on cl.id = e.class_id where cl.center_id = ${c.id}::uuid and e.status in ('trial','active','paused')),
      pars as (select distinct g.parent_id from student_guardians g join kids k on k.student_id = g.student_id)
      select to_char(w.ws, 'YYYY-MM-DD') as week,
        (select count(*)::int from sessions s join classes cl on cl.id = s.class_id where cl.center_id = ${c.id}::uuid and s.date >= w.ws and s.date < w.ws + 7 and s.date < ${todayISO()}::date and s.status <> 'cancelled' and s.status <> 'rescheduled') as "sessionsDone",
        (select count(*)::int from sessions s join classes cl on cl.id = s.class_id where cl.center_id = ${c.id}::uuid and s.date >= w.ws and s.date < w.ws + 7 and s.date < ${todayISO()}::date and s.status <> 'cancelled' and s.status <> 'rescheduled'
            and (select min(a.recorded_at at time zone 'Asia/Ho_Chi_Minh')::date from attendance a where a.session_id = s.id) <= s.date) as "sessionsOnTime",
        (select count(*)::int from payments p where p.center_id = ${c.id}::uuid and p.status = 'confirmed' and p.paid_at >= w.ws and p.paid_at < w.ws + 7 and p.source <> 'legacy') as "paymentsConfirmed",
        (select count(*)::int from payments p where p.center_id = ${c.id}::uuid and p.status = 'confirmed' and p.paid_at >= w.ws and p.paid_at < w.ws + 7 and p.source = 'sepay') as "paymentsAuto",
        (select count(*)::int from payments p where ${einvoiceOn}::boolean and p.center_id = ${c.id}::uuid and p.status = 'confirmed' and p.paid_at >= w.ws and p.paid_at < w.ws + 7 and p.paid_at >= ${einStart}::date and p.source <> 'legacy') as "invoicesDue",
        (select count(*)::int from payments p where ${einvoiceOn}::boolean and p.center_id = ${c.id}::uuid and p.status = 'confirmed' and p.paid_at >= w.ws and p.paid_at < w.ws + 7 and p.paid_at >= ${einStart}::date and p.source <> 'legacy'
            and exists (select 1 from einvoices e where e.payment_id = p.id and e.kind = 'original' and e.status in ('issued','adjusted','replaced'))) as "invoicesIssued",
        (select count(*)::int from pars) as "parentsTotal",
        (select count(*)::int from parents pa join pars on pars.parent_id = pa.id where pa.last_login_at >= (w.ws + 7)::timestamp - interval '30 days' and pa.last_login_at < (w.ws + 7)::timestamp) as "parentsActive",
        (select count(*)::int from otp_requests o where o.created_at >= w.ws and o.created_at < w.ws + 7 and o.status <> 'blocked'
            and o.phone in (select pa.phone from parents pa join pars on pars.parent_id = pa.id)) as "otpTotal",
        (select count(*)::int from otp_requests o where o.created_at >= w.ws and o.created_at < w.ws + 7 and o.channel in ('zns','sms') and o.status in ('sent','verified','expired')
            and o.phone in (select pa.phone from parents pa join pars on pars.parent_id = pa.id)) as "otpSent",
        (select count(*)::int from parent_notifications n join pars on pars.parent_id = n.parent_id where n.channel in ('zns','sms','push') and n.created_at >= w.ws and n.created_at < w.ws + 7 and n.status in ('sent','failed','read')) as "messagesTotal",
        (select count(*)::int from parent_notifications n join pars on pars.parent_id = n.parent_id where n.channel in ('zns','sms','push') and n.created_at >= w.ws and n.created_at < w.ws + 7 and n.status = 'failed') as "messagesFailed"
      from w order by w.ws`)) as unknown as (AdoptionWeek & { week: string })[];
    const [fb] = await ctx.db.select({
      open: sql<number>`count(*) filter (where ${pilotFeedback.status} in ('open','in_progress'))::int`,
      high: sql<number>`count(*) filter (where ${pilotFeedback.status} in ('open','in_progress') and ${pilotFeedback.severity} = 'high')::int`,
      total: sql<number>`count(*)::int`,
    }).from(pilotFeedback).where(and(eq(pilotFeedback.centerId, c.id), gte(pilotFeedback.createdAt, new Date(`${from}T00:00:00+07:00`))));
    const weeksOut = rows.map((r) => ({ week: r.week, raw: r, checks: adoptionChecks(Object.fromEntries(Object.entries(r).filter(([k]) => k !== "week").map(([k, v]) => [k, Number(v)])) as unknown as AdoptionWeek) }));
    const last = weeksOut[weeksOut.length - 1];
    const prev = weeksOut[weeksOut.length - 2];
    out.push({
      ...c, stageLabel: c.stage ? CUTOVER_STAGE_VI[c.stage as CutoverStage] : "Chưa bắt đầu", weeks: weeksOut,
      summary: (last?.checks ?? []).map((x) => ({ ...x, prev: prev?.checks.find((p) => p.key === x.key)?.rate ?? null })),
      feedback: fb ?? { open: 0, high: 0, total: 0 },
    });
  }
  return { weeks, centers: out, einvoiceOn, push: await pushOverview(ctx.db) };
}
