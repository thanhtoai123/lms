import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, sql, desc, asc, or, ilike, isNull, isNotNull, gte, lte, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  conversations, messages, leads, leadActivities, parents, students, studentGuardians, teachers, users, centers, parentNotifications, appSettings, enrollments, classes, userRoles, type Database,
} from "@satarobo/db";
import {
  authorize, authorizeGlobal, centersWith, hasRole, maskPhone, normalizeVnPhone,
  replyWindow, validateMessage, messageFlags, responsePairs, responseStats, maskExternalId, readWithin, pilotVerdict, pct,
  MSG_CHANNEL_VI, CONV_STATUS_VI, FLAG_VI, FIRST_RESPONSE_SLA_MIN, READ_TARGET_HOURS, PILOT_TARGETS,
  type MsgChannel, type ConvStatus,
} from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { todayISO } from "./sessions";
import { notify } from "./finance";
import { createLead } from "./leads";

type Db = ProtectedContext["db"];
const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });
const pre = (m: string | string[]) => new TRPCError({ code: "PRECONDITION_FAILED", message: Array.isArray(m) ? m.join("; ") : m });
const notFound = (m: string) => new TRPCError({ code: "NOT_FOUND", message: m });
const forbid = (m: string) => new TRPCError({ code: "FORBIDDEN", message: m });
const asDb = (d: Database) => d as unknown as Db;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const preview = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 120);

/* ------------------------------------------------------------------ */
/* Cấu hình kênh & xác thực webhook                                     */
/* ------------------------------------------------------------------ */

export function channelConfig() {
  return {
    messenger: { verifyToken: !!process.env.META_VERIFY_TOKEN, appSecret: !!process.env.META_APP_SECRET, pageToken: !!process.env.META_PAGE_TOKEN },
    zalo: { appId: !!process.env.ZALO_APP_ID, oaSecret: !!process.env.ZALO_OA_SECRET, accessToken: !!process.env.ZALO_OA_ACCESS_TOKEN },
  };
}

function safeEq(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
/** Meta: header X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, raw body) */
export function metaSignatureOk(raw: string, header: string | null, secret: string | undefined) {
  if (!secret || !header?.startsWith("sha256=")) return false;
  return safeEq(header.slice(7), createHmac("sha256", secret).update(raw, "utf8").digest("hex"));
}
/** Zalo OA: header X-ZEvent-Signature = "mac=" + SHA256(app_id + raw body + timestamp + OA secret key) */
export function zaloSignatureOk(raw: string, header: string | null, appId: string | undefined, secret: string | undefined, timestamp: string | number | null | undefined) {
  if (!secret || !appId || !header || timestamp === null || timestamp === undefined) return false;
  const mac = header.replace(/^mac=/, "");
  return safeEq(mac, sha(`${appId}${raw}${timestamp}${secret}`));
}

export interface MessagingSettings { defaultCenterId: string | null; autoReply: string }
const MS_DEFAULTS: MessagingSettings = { defaultCenterId: null, autoReply: "" };
async function messagingSettings(db: Db): Promise<MessagingSettings> {
  const r = await db.query.appSettings.findFirst({ where: eq(appSettings.key, "messaging") });
  return { ...MS_DEFAULTS, ...((r?.value ?? {}) as Partial<MessagingSettings>) };
}

/* ------------------------------------------------------------------ */
/* Phạm vi xem                                                          */
/* ------------------------------------------------------------------ */

function scope(ctx: ProtectedContext): SQL {
  const ids = centersWith(ctx.actor, "message:read");
  const own = ctx.actor.personId && hasRole(ctx.actor, "TEACHER") ? eq(conversations.teacherId, ctx.actor.personId) : sql`false`;
  if (ids === null) return sql`true`;
  if (!ids.length) return or(own, eq(conversations.assignedTo, ctx.user.id))!;
  return or(inArray(conversations.centerId, ids), isNull(conversations.centerId), own, eq(conversations.assignedTo, ctx.user.id))!;
}
function canAct(ctx: ProtectedContext, c: { centerId: string | null; teacherId: string | null; assignedTo: string | null }, perm: "message:create" | "message:update") {
  if (c.assignedTo === ctx.user.id) return true;
  return authorize(ctx.actor, perm, { centerId: c.centerId, ownerIds: c.teacherId ? [c.teacherId] : [] }).allowed;
}
function isSupervisor(ctx: ProtectedContext, centerId?: string | null) {
  return authorize(ctx.actor, "message:audit", { centerId: centerId ?? null }).allowed || hasRole(ctx.actor, "AUDITOR");
}

/* ------------------------------------------------------------------ */
/* Hộp thư                                                              */
/* ------------------------------------------------------------------ */

export async function inbox(ctx: ProtectedContext, input: { status?: ConvStatus; channel?: MsgChannel; mine?: boolean; flagged?: boolean; q?: string; kind?: "lead" | "parent" }) {
  if (!ctx.actor.assignments.some((a) => authorize({ ...ctx.actor, assignments: [a] }, "message:read", { centerId: a.centerId, ownerIds: ctx.actor.personId ? [ctx.actor.personId] : [] }).allowed)) throw forbid("Không có quyền xem tin nhắn");
  const conds: SQL[] = [scope(ctx)];
  if (input.status) conds.push(eq(conversations.status, input.status));
  else conds.push(inArray(conversations.status, ["open", "pending"]));
  if (input.channel) conds.push(eq(conversations.channel, input.channel));
  if (input.mine) conds.push(eq(conversations.assignedTo, ctx.user.id));
  if (input.flagged) conds.push(sql`cardinality(${conversations.flags}) > 0`);
  if (input.kind === "lead") conds.push(or(isNotNull(conversations.leadId), inArray(conversations.channel, ["messenger", "zalo"]))!);
  if (input.kind === "parent") conds.push(isNotNull(conversations.parentId));
  if (input.q?.trim()) conds.push(or(ilike(conversations.displayName, `%${input.q.trim()}%`), ilike(conversations.lastPreview, `%${input.q.trim()}%`), ilike(conversations.subject, `%${input.q.trim()}%`))!);
  const r = await ctx.db.select({ c: conversations, assignee: users.fullName, centerCode: centers.code, parentName: parents.fullName, leadName: leads.parentName, leadStatus: leads.status, teacherName: teachers.fullName })
    .from(conversations).leftJoin(users, eq(users.id, conversations.assignedTo)).leftJoin(centers, eq(centers.id, conversations.centerId))
    .leftJoin(parents, eq(parents.id, conversations.parentId)).leftJoin(leads, eq(leads.id, conversations.leadId)).leftJoin(teachers, eq(teachers.id, conversations.teacherId))
    .where(and(...conds)).orderBy(sql`${conversations.waitingSince} asc nulls last`, desc(conversations.lastMessageAt)).limit(200);
  const [cnt] = await ctx.db.select({
    open: sql<number>`count(*) filter (where ${conversations.status} = 'open')::int`,
    waitingOver: sql<number>`count(*) filter (where ${conversations.waitingSince} < now() - make_interval(mins => ${FIRST_RESPONSE_SLA_MIN}::int) and ${conversations.status} <> 'closed')::int`,
    mine: sql<number>`count(*) filter (where ${conversations.assignedTo} = ${ctx.user.id} and ${conversations.status} <> 'closed')::int`,
    flagged: sql<number>`count(*) filter (where cardinality(${conversations.flags}) > 0 and ${conversations.status} <> 'closed')::int`,
  }).from(conversations).where(scope(ctx));
  const now = Date.now();
  return {
    counts: cnt, channels: channelConfig(),
    canStart: ctx.actor.assignments.some((a) => authorize({ ...ctx.actor, assignments: [a] }, "message:create", { centerId: a.centerId }).allowed) && !hasRole(ctx.actor, "TEACHER"),
    items: r.map((x) => ({
      id: x.c.id, channel: x.c.channel, channelLabel: MSG_CHANNEL_VI[x.c.channel as MsgChannel], status: x.c.status, statusLabel: CONV_STATUS_VI[x.c.status as ConvStatus],
      name: x.parentName ?? x.leadName ?? x.c.displayName ?? (x.c.externalId ? `Khách ${maskExternalId(x.c.externalId)}` : "—"),
      subject: x.c.subject, preview: x.c.lastPreview, lastMessageAt: x.c.lastMessageAt, centerCode: x.centerCode, assignee: x.assignee, teacher: x.teacherName,
      leadId: x.c.leadId, leadStatus: x.leadStatus, parentId: x.c.parentId, flags: x.c.flags.map((f) => FLAG_VI[f] ?? f),
      waitingMin: x.c.waitingSince ? Math.round((now - x.c.waitingSince.getTime()) / 60_000) : null,
    })),
  };
}

export async function getConversation(ctx: ProtectedContext, id: string) {
  const [row] = await ctx.db.select({ c: conversations }).from(conversations).where(and(eq(conversations.id, id), scope(ctx)));
  if (!row) throw notFound("Không tìm thấy hội thoại (hoặc không có quyền)");
  const c = row.c;
  const msgs = await ctx.db.select({ m: messages, by: users.fullName }).from(messages).leftJoin(users, eq(users.id, messages.senderUserId))
    .where(eq(messages.conversationId, c.id)).orderBy(asc(messages.createdAt)).limit(500);
  const lead = c.leadId ? await ctx.db.query.leads.findFirst({ where: eq(leads.id, c.leadId) }) : null;
  const parent = c.parentId ? await ctx.db.query.parents.findFirst({ where: eq(parents.id, c.parentId) }) : null;
  const kids = parent ? await ctx.db.select({ id: students.id, name: students.fullName, code: students.code }).from(studentGuardians).innerJoin(students, eq(students.id, studentGuardians.studentId)).where(eq(studentGuardians.parentId, parent.id)) : [];
  const win = replyWindow(c.channel as MsgChannel, c.lastInboundAt, new Date());
  const staff = await ctx.db.select({ id: users.id, name: users.fullName }).from(users).innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.isActive, true), inArray(userRoles.role, ["CENTER_MANAGER", "CENTER_SALES_CSM", "CENTER_CLASS_MANAGER", "HO_MARKETING", "SUPER_ADMIN"]), c.centerId ? or(eq(userRoles.centerId, c.centerId), isNull(userRoles.centerId)) : sql`true`))
    .groupBy(users.id, users.fullName).orderBy(asc(users.fullName));
  const canReply = canAct(ctx, c, "message:create");
  const leadCenters = centersWith(ctx.actor, "lead:create");
  const centerOpts = await ctx.db.select({ id: centers.id, code: centers.code }).from(centers).where(and(eq(centers.isActive, true), leadCenters === null ? sql`true` : leadCenters.length ? inArray(centers.id, leadCenters) : sql`false`)).orderBy(asc(centers.code));
  return {
    centers: centerOpts,
    id: c.id, channel: c.channel, channelLabel: MSG_CHANNEL_VI[c.channel as MsgChannel], status: c.status, statusLabel: CONV_STATUS_VI[c.status as ConvStatus], subject: c.subject,
    displayName: c.displayName, externalId: c.externalId ? maskExternalId(c.externalId) : null, centerId: c.centerId, assignedTo: c.assignedTo, teacherId: c.teacherId,
    flags: c.flags.map((f) => ({ key: f, label: FLAG_VI[f] ?? f })), portalSeenAt: c.portalSeenAt, createdAt: c.createdAt,
    lead: lead ? { id: lead.id, name: lead.parentName, phone: maskPhone(lead.phoneNormalized), status: lead.status } : null,
    parent: parent ? { id: parent.id, name: parent.fullName, phone: maskPhone(normalizeVnPhone(parent.phone) ?? parent.phone), children: kids, marketingOptOut: parent.marketingOptOut } : null,
    window: win.allowed ? { allowed: true, tag: win.tag, expiresAt: win.expiresAt, reason: null } : { allowed: false, tag: null, expiresAt: null, reason: win.reason },
    messages: msgs.map((x) => ({ id: x.m.id, direction: x.m.direction, body: x.m.body, by: x.by, status: x.m.status, error: x.m.error, tag: x.m.tag, flags: x.m.flags.map((f) => FLAG_VI[f] ?? f), createdAt: x.m.createdAt, attachments: x.m.attachments })),
    staff, can: { reply: canReply && win.allowed && c.status !== "closed", note: canReply, manage: canAct(ctx, c, "message:update"), linkLead: canAct(ctx, c, "message:update") && !c.leadId && !c.parentId && c.channel !== "portal", newLink: c.channel === "portal" && canAct(ctx, c, "message:update") },
  };
}

async function markActivity(db: Db, id: string, patch: Partial<typeof conversations.$inferInsert>) {
  await db.update(conversations).set({ ...patch, updatedAt: new Date() }).where(eq(conversations.id, id));
}

/** Gửi ra kênh ngoài. Không cấu hình khoá → lưu "skipped" (hiển thị rõ cho nhân viên) */
async function deliver(channel: MsgChannel, externalId: string | null, body: string, tag: string | null): Promise<{ status: "sent" | "skipped" | "failed"; externalId?: string; error?: string }> {
  if (channel === "portal") return { status: "sent" };
  if (!externalId) return { status: "failed", error: "Thiếu mã người nhận" };
  try {
    if (channel === "messenger") {
      const token = process.env.META_PAGE_TOKEN;
      if (!token) return { status: "skipped", error: "Chưa cấu hình META_PAGE_TOKEN — tin chỉ lưu nội bộ" };
      const payload: Record<string, unknown> = { recipient: { id: externalId }, message: { text: body }, messaging_type: tag ? "MESSAGE_TAG" : "RESPONSE" };
      if (tag) payload.tag = tag;
      const r = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) });
      const j = (await r.json().catch(() => ({}))) as { message_id?: string; error?: { message?: string } };
      return r.ok ? { status: "sent", externalId: j.message_id } : { status: "failed", error: j.error?.message ?? `HTTP ${r.status}` };
    }
    const token = process.env.ZALO_OA_ACCESS_TOKEN;
    if (!token) return { status: "skipped", error: "Chưa cấu hình ZALO_OA_ACCESS_TOKEN — tin chỉ lưu nội bộ" };
    const r = await fetch("https://openapi.zalo.me/v3.0/oa/message/cs", { method: "POST", headers: { "Content-Type": "application/json", access_token: token }, body: JSON.stringify({ recipient: { user_id: externalId }, message: { text: body } }), signal: AbortSignal.timeout(10_000) });
    const j = (await r.json().catch(() => ({}))) as { error?: number; message?: string; data?: { message_id?: string } };
    return r.ok && !j.error ? { status: "sent", externalId: j.data?.message_id } : { status: "failed", error: j.message ?? `Lỗi Zalo ${j.error ?? r.status}` };
  } catch (e) {
    return { status: "failed", error: (e as Error).message.slice(0, 200) };
  }
}

export async function sendMessage(ctx: ProtectedContext, input: { id: string; body: string; note?: boolean }) {
  const c = await ctx.db.query.conversations.findFirst({ where: eq(conversations.id, input.id) });
  if (!c) throw notFound("Không tìm thấy hội thoại");
  const [vis] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(conversations).where(and(eq(conversations.id, c.id), scope(ctx)));
  if (!vis?.n || !canAct(ctx, c, "message:create")) throw forbid("Không có quyền nhắn trong hội thoại này");
  const errs = validateMessage(input.body);
  if (errs.length) throw bad(errs);
  const body = input.body.trim();
  const now = new Date();
  if (input.note) {
    await ctx.db.insert(messages).values({ conversationId: c.id, direction: "note", body, senderUserId: ctx.user.id, status: "sent" });
    return { status: "sent" as const };
  }
  if (c.status === "closed") throw pre("Hội thoại đã đóng — mở lại trước khi nhắn");
  const win = replyWindow(c.channel as MsgChannel, c.lastInboundAt, now);
  if (!win.allowed) throw pre(win.reason);
  if (c.parentId) {
    const p = await ctx.db.query.parents.findFirst({ where: eq(parents.id, c.parentId) });
    if (p?.processingRestricted) throw pre("Phụ huynh đã yêu cầu hạn chế xử lý dữ liệu — không nhắn qua hệ thống");
  }
  const d = await deliver(c.channel as MsgChannel, c.externalId, body, win.tag);
  const flags = messageFlags(body).filter((f) => f === "private_payment" || f === "abuse");
  await ctx.db.insert(messages).values({ conversationId: c.id, direction: "out", body, senderUserId: ctx.user.id, status: d.status, externalId: d.externalId ?? null, error: d.error ?? null, tag: win.tag, flags });
  await markActivity(ctx.db, c.id, {
    lastOutboundAt: now, lastMessageAt: now, lastPreview: preview(body), waitingSince: null, status: "pending", assignedTo: c.assignedTo ?? ctx.user.id,
    ...(flags.length ? { flags: [...new Set([...c.flags, ...flags])] } : {}),
  });
  if (flags.length) await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "message", entity: "messages", entityId: c.id, after: { flags }, reason: "Tin nhắn nhân viên bị gắn cờ", ip: ctx.ip });
  if (c.channel === "portal" && c.parentId) {
    await ctx.db.insert(parentNotifications).values({ parentId: c.parentId, channel: "in_app", template: "MESSAGE_NEW", title: "Tin nhắn mới từ Sata Robo", body: preview(body), link: `/ph/tin-nhan?id=${c.id}`, status: "sent", sentAt: now, createdBy: ctx.user.id });
  }
  return { status: d.status, error: d.error ?? null, tag: win.tag };
}

export async function updateConversation(ctx: ProtectedContext, input: { id: string; status?: ConvStatus; assignedTo?: string | null; clearFlags?: boolean }) {
  const c = await ctx.db.query.conversations.findFirst({ where: eq(conversations.id, input.id) });
  if (!c) throw notFound("Không tìm thấy hội thoại");
  if (!canAct(ctx, c, "message:update")) throw forbid("Không có quyền");
  if (input.clearFlags && !isSupervisor(ctx, c.centerId)) throw forbid("Chỉ quản lý gỡ cờ");
  const patch: Partial<typeof conversations.$inferInsert> = {};
  if (input.status) {
    patch.status = input.status;
    patch.closedAt = input.status === "closed" ? new Date() : null;
    if (input.status === "closed") patch.waitingSince = null;
  }
  if (input.assignedTo !== undefined) {
    if (input.assignedTo) {
      const u = await ctx.db.query.users.findFirst({ where: eq(users.id, input.assignedTo) });
      if (!u?.isActive) throw bad("Người nhận không hợp lệ");
      if (input.assignedTo !== ctx.user.id) await notify(ctx.db, [input.assignedTo], "Được giao hội thoại", c.lastPreview ?? "", `/tin-nhan?id=${c.id}`, 2);
    }
    patch.assignedTo = input.assignedTo;
  }
  if (input.clearFlags) patch.flags = [];
  await markActivity(ctx.db, c.id, patch);
  await ctx.db.insert(messages).values({ conversationId: c.id, direction: "note", body: `[Hệ thống] ${input.status ? `Trạng thái: ${CONV_STATUS_VI[input.status]}` : ""}${input.assignedTo !== undefined ? " Giao lại người phụ trách" : ""}${input.clearFlags ? " Gỡ cờ" : ""}`.trim(), senderUserId: ctx.user.id, status: "sent" });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Cổng phụ huynh (liên kết riêng, không cần đăng nhập)                 */
/* ------------------------------------------------------------------ */

function newToken() {
  return randomBytes(18).toString("base64url");
}

export async function startParentConversation(ctx: ProtectedContext, input: { studentId: string; subject: string; body: string; includeTeacher?: boolean }) {
  const [g] = await ctx.db.select({ parentId: studentGuardians.parentId }).from(studentGuardians)
    .where(eq(studentGuardians.studentId, input.studentId)).orderBy(desc(studentGuardians.isPrimary)).limit(1);
  if (!g) throw pre("Học viên chưa có phụ huynh liên hệ");
  const p = await ctx.db.query.parents.findFirst({ where: eq(parents.id, g.parentId) });
  if (!p || p.deletedAt) throw notFound("Không tìm thấy phụ huynh");
  if (p.anonymizedAt || p.processingRestricted) throw pre("Phụ huynh đã yêu cầu hạn chế / xoá dữ liệu");
  const [cur] = await ctx.db.select({ centerId: classes.centerId, teacherId: classes.leadTeacherId }).from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId))
    .where(and(eq(enrollments.studentId, input.studentId), inArray(enrollments.status, ["active", "trial", "paused"]))).orderBy(desc(enrollments.enrolledAt)).limit(1);
  const st = await ctx.db.query.students.findFirst({ where: eq(students.id, input.studentId) });
  const centerId = cur?.centerId ?? st?.homeCenterId ?? null;
  const isTeacher = hasRole(ctx.actor, "TEACHER") && !authorize(ctx.actor, "message:create", { centerId }).allowed;
  const teacherId = isTeacher ? ctx.actor.personId ?? null : input.includeTeacher ? cur?.teacherId ?? null : null;
  if (isTeacher && (!cur || cur.teacherId !== ctx.actor.personId)) throw forbid("Học viên không thuộc lớp bạn dạy chính");
  if (!authorize(ctx.actor, "message:create", { centerId, ownerIds: teacherId ? [teacherId] : [] }).allowed) throw forbid("Không có quyền nhắn phụ huynh này");
  const errs = [...validateMessage(input.body), ...(input.subject.trim().length < 3 ? ["Chủ đề tối thiểu 3 ký tự"] : [])];
  if (errs.length) throw bad(errs);
  const token = newToken();
  const now = new Date();
  const [c] = await ctx.db.insert(conversations).values({
    channel: "portal", displayName: p.fullName, centerId, parentId: p.id, teacherId, assignedTo: ctx.user.id, status: "pending", subject: input.subject.trim(),
    portalTokenHash: sha(token), lastOutboundAt: now, lastMessageAt: now, lastPreview: preview(input.body), createdBy: ctx.user.id,
  }).returning({ id: conversations.id });
  await ctx.db.insert(messages).values({ conversationId: c!.id, direction: "out", body: input.body.trim(), senderUserId: ctx.user.id, status: "sent" });
  const link = `/tn/${token}`;
  await ctx.db.insert(parentNotifications).values({ parentId: p.id, channel: "in_app", template: "MESSAGE_NEW", title: `Sata Robo: ${input.subject.trim()}`, body: preview(input.body), link, status: "sent", sentAt: now, createdBy: ctx.user.id });
  return { id: c!.id, link };
}

export async function renewPortalLink(ctx: ProtectedContext, input: { id: string }) {
  const c = await ctx.db.query.conversations.findFirst({ where: eq(conversations.id, input.id) });
  if (!c || c.channel !== "portal") throw notFound("Không tìm thấy hội thoại cổng PH");
  if (!canAct(ctx, c, "message:update")) throw forbid("Không có quyền");
  const token = newToken();
  await markActivity(ctx.db, c.id, { portalTokenHash: sha(token) });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "message", entity: "conversations", entityId: c.id, reason: "Cấp lại liên kết cổng phụ huynh (liên kết cũ hết hiệu lực)", ip: ctx.ip });
  return { link: `/tn/${token}` };
}

async function byToken(db: Db, token: string) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null;
  return db.query.conversations.findFirst({ where: and(eq(conversations.portalTokenHash, sha(token)), eq(conversations.channel, "portal")) });
}

export async function portalThread(db: Database, token: string) {
  const d = asDb(db);
  const c = await byToken(d, token);
  if (!c) return null;
  const now = new Date();
  await d.update(conversations).set({ portalSeenAt: now }).where(eq(conversations.id, c.id));
  if (c.parentId) await d.update(parentNotifications).set({ readAt: now, status: "read" }).where(and(eq(parentNotifications.parentId, c.parentId), eq(parentNotifications.template, "MESSAGE_NEW"), isNull(parentNotifications.readAt), gte(parentNotifications.createdAt, c.createdAt)));
  const msgs = await d.select({ direction: messages.direction, body: messages.body, at: messages.createdAt, by: users.fullName }).from(messages).leftJoin(users, eq(users.id, messages.senderUserId))
    .where(and(eq(messages.conversationId, c.id), inArray(messages.direction, ["in", "out"]))).orderBy(asc(messages.createdAt)).limit(300);
  const t = c.teacherId ? await d.query.teachers.findFirst({ where: eq(teachers.id, c.teacherId) }) : null;
  const ctr = c.centerId ? await d.query.centers.findFirst({ where: eq(centers.id, c.centerId) }) : null;
  return {
    subject: c.subject, closed: c.status === "closed", teacher: t?.fullName ?? null, center: ctr?.name ?? null, parentName: c.displayName,
    messages: msgs.map((m) => ({ mine: m.direction === "in", body: m.body, at: m.at, by: m.direction === "out" ? (m.by ?? "Sata Robo") : "Phụ huynh" })),
  };
}

export async function portalPost(db: Database, token: string, body: string) {
  const d = asDb(db);
  const c = await byToken(d, token);
  if (!c) return { ok: false as const, status: 404, error: "Liên kết không đúng hoặc đã được cấp lại" };
  const errs = validateMessage(body);
  if (errs.length) return { ok: false as const, status: 422, error: errs[0]! };
  await recordInbound(d, c, body.trim(), null, new Date());
  return { ok: true as const };
}

async function recordInbound(d: Db, c: typeof conversations.$inferSelect, body: string, externalId: string | null, at: Date, attachments?: { type: string; url: string }[] | null) {
  const flags = messageFlags(body);
  const inserted = await d.insert(messages).values({ conversationId: c.id, direction: "in", body, externalId, status: "received", flags, attachments: attachments ?? null, createdAt: at })
    .onConflictDoNothing({ target: messages.externalId }).returning({ id: messages.id });
  if (!inserted.length) return { duplicate: true };
  await d.update(conversations).set({
    lastInboundAt: at, lastMessageAt: at, lastPreview: preview(body), status: "open", closedAt: null,
    waitingSince: c.waitingSince ?? at, flags: flags.length ? [...new Set([...c.flags, ...flags])] : c.flags, updatedAt: new Date(),
  }).where(eq(conversations.id, c.id));
  const targets = c.assignedTo ? [c.assignedTo] : [];
  if (flags.length && c.centerId) {
    const mgrs = await d.select({ u: userRoles.userId }).from(userRoles).where(and(eq(userRoles.role, "CENTER_MANAGER"), eq(userRoles.centerId, c.centerId)));
    targets.push(...mgrs.map((m) => m.u));
  }
  await notify(d, targets, flags.length ? `Tin nhắn cần chú ý: ${flags.map((f) => FLAG_VI[f]).join(", ")}` : "Tin nhắn mới", `${c.displayName ?? "Khách"}: ${preview(body)}`, `/tin-nhan?id=${c.id}`, flags.length ? 1 : 3);
  return { duplicate: false };
}

/* ------------------------------------------------------------------ */
/* Webhook Messenger / Zalo                                             */
/* ------------------------------------------------------------------ */

export async function ingestExternal(db: Database, input: { channel: "messenger" | "zalo"; senderId: string; displayName?: string | null; text: string; messageId: string; at: Date; attachments?: { type: string; url: string }[] | null }) {
  const d = asDb(db);
  if (!/^[A-Za-z0-9_.-]{3,64}$/.test(input.senderId)) return { ok: false as const, error: "senderId không hợp lệ" };
  const settings = await messagingSettings(d);
  let c = await d.query.conversations.findFirst({ where: and(eq(conversations.channel, input.channel), eq(conversations.externalId, input.senderId)) });
  if (!c) {
    const [row] = await d.insert(conversations).values({
      channel: input.channel, externalId: input.senderId, displayName: input.displayName?.slice(0, 120) ?? null, centerId: settings.defaultCenterId, status: "open",
      subject: input.channel === "messenger" ? "Tin nhắn Facebook" : "Tin nhắn Zalo OA",
    }).onConflictDoNothing().returning();
    c = row ?? (await d.query.conversations.findFirst({ where: and(eq(conversations.channel, input.channel), eq(conversations.externalId, input.senderId)) }));
  }
  if (!c) return { ok: false as const, error: "Không tạo được hội thoại" };
  const text = input.text.trim() || (input.attachments?.length ? `[${input.attachments.length} tệp đính kèm]` : "[tin trống]");
  const r = await recordInbound(d, c, text.slice(0, 4000), `${input.channel}:${input.messageId}`, input.at, input.attachments);
  return { ok: true as const, conversationId: c.id, duplicate: r.duplicate };
}

/** Parse payload Messenger (object=page) → danh sách tin khách gửi (bỏ echo / delivery / read) */
export function parseMessengerPayload(body: unknown): { senderId: string; messageId: string; text: string; at: Date; attachments: { type: string; url: string }[] }[] {
  const b = body as { object?: string; entry?: { messaging?: { sender?: { id?: string }; timestamp?: number; message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: { type?: string; payload?: { url?: string } }[] } }[] }[] };
  if (b?.object !== "page" || !Array.isArray(b.entry)) return [];
  const out: ReturnType<typeof parseMessengerPayload> = [];
  for (const e of b.entry) for (const m of e.messaging ?? []) {
    if (!m.message || m.message.is_echo || !m.sender?.id || !m.message.mid) continue;
    out.push({
      senderId: m.sender.id, messageId: m.message.mid, text: m.message.text ?? "", at: new Date(m.timestamp ?? Date.now()),
      attachments: (m.message.attachments ?? []).filter((a) => a.payload?.url?.startsWith("https://")).map((a) => ({ type: a.type ?? "file", url: a.payload!.url! })),
    });
  }
  return out;
}
/** Parse payload Zalo OA (event_name = user_send_text / user_send_image …) */
export function parseZaloPayload(body: unknown): { senderId: string; messageId: string; text: string; at: Date; timestamp: string | null } | null {
  const b = body as { event_name?: string; sender?: { id?: string }; message?: { msg_id?: string; text?: string }; timestamp?: string | number };
  if (!b?.event_name?.startsWith("user_send_") || !b.sender?.id || !b.message?.msg_id) return null;
  const ts = b.timestamp != null ? String(b.timestamp) : null;
  return { senderId: b.sender.id, messageId: b.message.msg_id, text: b.message.text ?? `[${b.event_name.replace("user_send_", "")}]`, at: new Date(ts ? Number(ts) : Date.now()), timestamp: ts };
}

/* ------------------------------------------------------------------ */
/* Messenger CRM: gắn / tạo lead                                        */
/* ------------------------------------------------------------------ */

export async function linkConversation(ctx: ProtectedContext, input: { id: string; leadId?: string | null; parentId?: string | null; create?: { parentName: string; phone: string; childName?: string | null; centerId?: string | null; consent: boolean } | null }) {
  const c = await ctx.db.query.conversations.findFirst({ where: eq(conversations.id, input.id) });
  if (!c) throw notFound("Không tìm thấy hội thoại");
  if (!canAct(ctx, c, "message:update")) throw forbid("Không có quyền");
  if (c.channel === "portal") throw pre("Hội thoại cổng PH đã gắn phụ huynh");
  let leadId = input.leadId ?? null;
  let parentId = input.parentId ?? null;
  if (input.create) {
    if (!authorize(ctx.actor, "lead:create", { centerId: input.create.centerId ?? c.centerId }).allowed) throw forbid("Không có quyền tạo lead");
    if (!input.create.consent) throw bad("Cần xác nhận khách đã đồng ý để lại thông tin liên hệ");
    const r = await createLead(ctx.db, {
      parentName: input.create.parentName, phone: input.create.phone, childName: input.create.childName ?? null, centerId: input.create.centerId ?? c.centerId,
      source: c.channel === "messenger" ? "facebook-messenger" : "zalo-oa", utmSource: c.channel === "messenger" ? "facebook" : "zalo", utmMedium: "chat", consent: true,
      notes: `Tạo từ hội thoại ${MSG_CHANNEL_VI[c.channel as MsgChannel]}`,
    }, ctx.user.id);
    leadId = r.lead.id;
  }
  if (leadId) {
    const l = await ctx.db.query.leads.findFirst({ where: eq(leads.id, leadId) });
    if (!l) throw notFound("Không tìm thấy lead");
    if (!authorize(ctx.actor, "lead:read", { centerId: l.centerId, ownerIds: l.assignedToId ? [l.assignedToId] : [] }).allowed) throw forbid("Không xem được lead này");
  }
  if (parentId) {
    const p = await ctx.db.query.parents.findFirst({ where: eq(parents.id, parentId) });
    if (!p) throw notFound("Không tìm thấy phụ huynh");
  }
  const lead = leadId ? await ctx.db.query.leads.findFirst({ where: eq(leads.id, leadId) }) : null;
  await markActivity(ctx.db, c.id, { leadId, parentId, centerId: c.centerId ?? lead?.centerId ?? null, assignedTo: c.assignedTo ?? lead?.assignedToId ?? ctx.user.id });
  if (leadId) {
    await ctx.db.insert(leadActivities).values({ leadId, type: "message", content: `Gắn hội thoại ${MSG_CHANNEL_VI[c.channel as MsgChannel]}: ${c.lastPreview ?? ""}`, meta: { conversationId: c.id }, actorId: ctx.user.id });
  }
  return { leadId, parentId };
}

export async function messengerCrm(ctx: ProtectedContext) {
  const base = await inbox(ctx, { kind: "lead" });
  const [st] = (await ctx.db.execute(sql`
    select count(*)::int as total,
      count(*) filter (where c.lead_id is not null)::int as linked,
      count(*) filter (where c.lead_id is null and c.status <> 'closed')::int as unlinked,
      count(l.id) filter (where l.status = 'enrolled')::int as enrolled
    from conversations c left join leads l on l.id = c.lead_id
    where c.channel in ('messenger','zalo') and c.created_at > now() - interval '90 days'`)) as unknown as { total: number; linked: number; unlinked: number; enrolled: number }[];
  return { ...base, stats: st ?? { total: 0, linked: 0, unlinked: 0, enrolled: 0 } };
}

/* ------------------------------------------------------------------ */
/* Giám sát hội thoại                                                   */
/* ------------------------------------------------------------------ */

export async function supervision(ctx: ProtectedContext, input: { from?: string; to?: string; centerId?: string }) {
  if (!ctx.actor.assignments.some((a) => authorize({ ...ctx.actor, assignments: [a] }, "message:audit", { centerId: a.centerId }).allowed) && !hasRole(ctx.actor, "AUDITOR")) throw forbid("Chỉ quản lý / kiểm soát giám sát hội thoại");
  const to = input.to ?? todayISO();
  const from = input.from ?? new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86400e3).toISOString().slice(0, 10);
  const ids = hasRole(ctx.actor, "AUDITOR") ? null : centersWith(ctx.actor, "message:audit");
  const scopeC = ids === null ? sql`true` : ids.length ? sql`(c.center_id is null or c.center_id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}))` : sql`false`;
  const centerC = input.centerId ? sql`c.center_id = ${input.centerId}::uuid` : sql`true`;
  const rows = (await ctx.db.execute(sql`
    select m.conversation_id as cid, m.direction, m.created_at as at, m.sender_user_id as uid, c.channel
    from messages m join conversations c on c.id = m.conversation_id
    where ${scopeC} and ${centerC} and m.created_at between ${`${from}T00:00:00+07:00`}::timestamptz and ${`${to}T23:59:59+07:00`}::timestamptz
    order by m.created_at`)) as unknown as { cid: string; direction: "in" | "out" | "note"; at: string | Date; uid: string | null; channel: MsgChannel }[];
  const now = new Date();
  const byConv = new Map<string, { channel: MsgChannel; msgs: { direction: "in" | "out" | "note"; at: Date; uid: string | null }[] }>();
  for (const r of rows) {
    const e = byConv.get(r.cid) ?? { channel: r.channel, msgs: [] };
    e.msgs.push({ direction: r.direction, at: new Date(r.at), uid: r.uid });
    byConv.set(r.cid, e);
  }
  const allPairs: ReturnType<typeof responsePairs> = [];
  const channelPairs = new Map<MsgChannel, ReturnType<typeof responsePairs>>();
  const staffPairs = new Map<string, ReturnType<typeof responsePairs>>();
  for (const [, v] of byConv) {
    const pairs = responsePairs(v.msgs);
    allPairs.push(...pairs);
    channelPairs.set(v.channel, [...(channelPairs.get(v.channel) ?? []), ...pairs]);
    for (const p of pairs) {
      if (!p.replyAt) continue;
      const replier = v.msgs.find((m) => m.direction === "out" && m.at.getTime() === p.replyAt!.getTime())?.uid;
      if (replier) staffPairs.set(replier, [...(staffPairs.get(replier) ?? []), p]);
    }
  }
  const names = staffPairs.size ? await ctx.db.select({ id: users.id, name: users.fullName }).from(users).where(inArray(users.id, [...staffPairs.keys()])) : [];
  const sent = (await ctx.db.execute(sql`
    select m.sender_user_id as uid, count(*)::int as n, count(*) filter (where m.status = 'failed')::int as failed, count(*) filter (where m.status = 'skipped')::int as skipped
    from messages m join conversations c on c.id = m.conversation_id
    where ${scopeC} and ${centerC} and m.direction = 'out' and m.created_at between ${`${from}T00:00:00+07:00`}::timestamptz and ${`${to}T23:59:59+07:00`}::timestamptz group by 1`)) as unknown as { uid: string; n: number; failed: number; skipped: number }[];
  const flagged = await ctx.db.select({ id: conversations.id, name: conversations.displayName, flags: conversations.flags, preview: conversations.lastPreview, at: conversations.lastMessageAt, channel: conversations.channel, centerCode: centers.code })
    .from(conversations).leftJoin(centers, eq(centers.id, conversations.centerId))
    .where(and(sql`cardinality(${conversations.flags}) > 0`, ids === null ? sql`true` : ids.length ? or(inArray(conversations.centerId, ids), isNull(conversations.centerId)) : sql`false`)).orderBy(desc(conversations.lastMessageAt)).limit(50);
  const waiting = await ctx.db.select({ id: conversations.id, name: conversations.displayName, since: conversations.waitingSince, channel: conversations.channel, assignee: users.fullName, preview: conversations.lastPreview })
    .from(conversations).leftJoin(users, eq(users.id, conversations.assignedTo))
    .where(and(isNotNull(conversations.waitingSince), sql`${conversations.status} <> 'closed'`, lte(conversations.waitingSince, new Date(Date.now() - FIRST_RESPONSE_SLA_MIN * 60_000)),
      ids === null ? sql`true` : ids.length ? or(inArray(conversations.centerId, ids), isNull(conversations.centerId)) : sql`false`)).orderBy(asc(conversations.waitingSince)).limit(50);
  const ctrs = await ctx.db.select({ id: centers.id, code: centers.code, name: centers.name }).from(centers).where(eq(centers.isActive, true)).orderBy(asc(centers.code));
  return {
    range: { from, to }, centerId: input.centerId ?? null, centers: ids === null ? ctrs : ctrs.filter((c) => ids.includes(c.id)), slaMin: FIRST_RESPONSE_SLA_MIN,
    totals: { conversations: byConv.size, ...responseStats(allPairs, now) },
    byChannel: [...channelPairs.entries()].map(([k, v]) => ({ key: k, label: MSG_CHANNEL_VI[k], ...responseStats(v, now) })),
    byStaff: [...staffPairs.entries()].map(([uid, v]) => ({ uid, name: names.find((n) => n.id === uid)?.name ?? "—", ...responseStats(v, now), sent: sent.find((s) => s.uid === uid)?.n ?? 0, failed: sent.find((s) => s.uid === uid)?.failed ?? 0 }))
      .sort((a, b) => (a.medianMin ?? 0) - (b.medianMin ?? 0)),
    delivery: { sent: sent.reduce((a, s) => a + s.n, 0), failed: sent.reduce((a, s) => a + s.failed, 0), skipped: sent.reduce((a, s) => a + s.skipped, 0) },
    flagged: flagged.map((f) => ({ ...f, flags: f.flags.map((x) => FLAG_VI[x] ?? x) })),
    waiting: waiting.map((w) => ({ ...w, waitingMin: Math.round((now.getTime() - (w.since?.getTime() ?? now.getTime())) / 60_000) })),
    channels: channelConfig(),
  };
}

export async function saveMessagingSettings(ctx: ProtectedContext, input: MessagingSettings) {
  if (!authorizeGlobal(ctx.actor, "message:audit") && !authorizeGlobal(ctx.actor, "system:update")) throw forbid("Chỉ Hội sở cấu hình kênh nhắn tin");
  if (input.defaultCenterId) {
    const c = await ctx.db.query.centers.findFirst({ where: eq(centers.id, input.defaultCenterId) });
    if (!c) throw bad("Cơ sở không tồn tại");
  }
  const v = { defaultCenterId: input.defaultCenterId || null, autoReply: input.autoReply.trim().slice(0, 500) };
  await ctx.db.insert(appSettings).values({ key: "messaging", value: v, updatedBy: ctx.user.id })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: v, updatedBy: ctx.user.id, updatedAt: new Date() } });
  return { ok: true };
}
export async function getMessagingSettings(ctx: ProtectedContext) {
  return { ...(await messagingSettings(ctx.db)), channels: channelConfig(), canEdit: authorizeGlobal(ctx.actor, "message:audit") || authorizeGlobal(ctx.actor, "system:update") };
}

/* ------------------------------------------------------------------ */
/* Đo pilot chat                                                        */
/* ------------------------------------------------------------------ */

export interface PilotSettings { classIds: string[]; startDate: string | null; note: string }
async function pilotSettings(db: Db): Promise<PilotSettings> {
  const r = await db.query.appSettings.findFirst({ where: eq(appSettings.key, "chat_pilot") });
  return { classIds: [], startDate: null, note: "", ...((r?.value ?? {}) as Partial<PilotSettings>) };
}

export async function savePilot(ctx: ProtectedContext, input: PilotSettings) {
  if (!ctx.actor.assignments.some((a) => authorize({ ...ctx.actor, assignments: [a] }, "message:audit", { centerId: a.centerId }).allowed)) throw forbid("Không có quyền cấu hình pilot");
  if (input.classIds.length > 50) throw bad("Tối đa 50 lớp pilot");
  if (input.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) throw bad("Ngày bắt đầu không hợp lệ");
  const cls = input.classIds.length ? await ctx.db.select({ id: classes.id, centerId: classes.centerId }).from(classes).where(inArray(classes.id, input.classIds)) : [];
  if (cls.length !== input.classIds.length) throw bad("Có lớp không tồn tại");
  for (const c of cls) if (!authorize(ctx.actor, "message:audit", { centerId: c.centerId }).allowed) throw forbid("Có lớp ngoài phạm vi quản lý");
  const v = { classIds: [...new Set(input.classIds)], startDate: input.startDate || null, note: input.note.trim().slice(0, 500) };
  await ctx.db.insert(appSettings).values({ key: "chat_pilot", value: v, updatedBy: ctx.user.id })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: v, updatedBy: ctx.user.id, updatedAt: new Date() } });
  return { ok: true };
}

export async function chatPilotReport(ctx: ProtectedContext, input: { from?: string; to?: string }) {
  if (!authorize(ctx.actor, "report:read", {}).allowed) throw forbid("Không có quyền xem báo cáo");
  const s = await pilotSettings(ctx.db);
  const to = input.to ?? todayISO();
  const from = input.from ?? s.startDate ?? new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86400e3).toISOString().slice(0, 10);
  const fromTs = new Date(`${from}T00:00:00+07:00`);
  const toTs = new Date(`${to}T23:59:59+07:00`);
  const vis = centersWith(ctx.actor, "report:read");
  const allClasses = await ctx.db.select({ id: classes.id, code: classes.code, name: classes.name, centerId: classes.centerId, status: classes.status }).from(classes)
    .where(and(inArray(classes.status, ["running", "recruiting"]), vis === null ? sql`true` : vis.length ? inArray(classes.centerId, vis) : sql`false`)).orderBy(asc(classes.code));
  const pilot = allClasses.filter((c) => s.classIds.includes(c.id));
  const canConfigure = ctx.actor.assignments.some((a) => authorize({ ...ctx.actor, assignments: [a] }, "message:audit", { centerId: a.centerId }).allowed);
  if (!pilot.length) return { settings: s, range: { from, to }, classes: allClasses, rows: [], totals: null, verdict: null, targets: PILOT_TARGETS, canConfigure };
  const members = await ctx.db.select({ classId: enrollments.classId, parentId: parents.id, status: parents.accountStatus, lastLogin: users.lastLoginAt })
    .from(enrollments).innerJoin(studentGuardians, eq(studentGuardians.studentId, enrollments.studentId)).innerJoin(parents, eq(parents.id, studentGuardians.parentId))
    .leftJoin(users, eq(users.id, parents.userId))
    .where(and(inArray(enrollments.classId, pilot.map((c) => c.id)), inArray(enrollments.status, ["active", "trial", "paused"]), isNull(parents.anonymizedAt)));
  const parentIds = [...new Set(members.map((m) => m.parentId))];
  const convs = parentIds.length ? await ctx.db.select({ id: conversations.id, parentId: conversations.parentId, seen: conversations.portalSeenAt }).from(conversations).where(inArray(conversations.parentId, parentIds)) : [];
  const convIds = convs.map((c) => c.id);
  const msgs = convIds.length ? await ctx.db.select({ cid: messages.conversationId, direction: messages.direction, at: messages.createdAt }).from(messages)
    .where(and(inArray(messages.conversationId, convIds), gte(messages.createdAt, fromTs), lte(messages.createdAt, toTs))) : [];
  const notes = parentIds.length ? await ctx.db.select({ parentId: parentNotifications.parentId, createdAt: parentNotifications.createdAt, readAt: parentNotifications.readAt }).from(parentNotifications)
    .where(and(inArray(parentNotifications.parentId, parentIds), eq(parentNotifications.channel, "in_app"), gte(parentNotifications.createdAt, fromTs), lte(parentNotifications.createdAt, toTs))) : [];
  const now = new Date();
  const convOf = (pid: string) => convs.filter((c) => c.parentId === pid);
  const calc = (pids: string[]) => {
    const ms = members.filter((m) => pids.includes(m.parentId));
    const uniq = [...new Set(ms.map((m) => m.parentId))];
    const activated = uniq.filter((p) => ms.find((m) => m.parentId === p)?.status === "active").length;
    const loggedIn = uniq.filter((p) => { const l = ms.find((m) => m.parentId === p)?.lastLogin; return !!l && l >= fromTs; }).length;
    const opened = uniq.filter((p) => convOf(p).some((c) => c.seen && c.seen >= fromTs)).length;
    const engaged = uniq.filter((p) => convOf(p).some((c) => msgs.some((m) => m.cid === c.id && m.direction === "in"))).length;
    const ns = notes.filter((n) => uniq.includes(n.parentId));
    const read48 = ns.filter((n) => readWithin(n.createdAt, n.readAt)).length;
    const cids = uniq.flatMap((p) => convOf(p).map((c) => c.id));
    const pairs = cids.flatMap((cid) => responsePairs(msgs.filter((m) => m.cid === cid).map((m) => ({ direction: m.direction, at: m.at }))));
    const rs = responseStats(pairs, now);
    return {
      parents: uniq.length, activated, loggedIn, opened, engaged, notifications: ns.length, read48,
      activation: pct(activated, uniq.length, 0), engagedPct: pct(Math.max(engaged, opened), uniq.length, 0), read48Pct: pct(read48, ns.length, 0),
      medianReplyMin: rs.medianMin, withinSla: rs.withinSla, waiting: rs.waiting,
    };
  };
  const rows = pilot.map((c) => ({ ...c, ...calc(members.filter((m) => m.classId === c.id).map((m) => m.parentId)) }));
  const totals = calc(parentIds);
  const verdict = pilotVerdict({ activation: totals.activation, engaged: totals.engagedPct, read48h: totals.notifications ? totals.read48Pct : 0, withinSla: totals.withinSla });
  return { settings: s, range: { from, to }, classes: allClasses, rows, totals, verdict, targets: PILOT_TARGETS, readHours: READ_TARGET_HOURS, canConfigure };
}

/** Học viên lớp mình dạy chính (GV nhắn phụ huynh) */
export async function myStudentsForChat(ctx: ProtectedContext) {
  if (!ctx.actor.personId || !hasRole(ctx.actor, "TEACHER")) return [];
  return ctx.db.select({ id: students.id, fullName: students.fullName, code: students.code, classCode: classes.code })
    .from(enrollments).innerJoin(classes, eq(classes.id, enrollments.classId)).innerJoin(students, eq(students.id, enrollments.studentId))
    .where(and(eq(classes.leadTeacherId, ctx.actor.personId), inArray(enrollments.status, ["active", "trial", "paused"]))).orderBy(asc(classes.code), asc(students.fullName)).limit(300);
}

/* ------------------------------------------------------------------ */
/* Phụ huynh đã đăng nhập (cổng /ph)                                    */
/* ------------------------------------------------------------------ */

export async function parentConversations(database: Database, parentId: string) {
  const db = asDb(database);
  return db.select({ id: conversations.id, subject: conversations.subject, status: conversations.status, lastMessageAt: conversations.lastMessageAt, lastPreview: conversations.lastPreview,
    unread: sql<boolean>`(${conversations.lastOutboundAt} is not null and (${conversations.portalSeenAt} is null or ${conversations.portalSeenAt} < ${conversations.lastOutboundAt}))`, teacher: teachers.fullName })
    .from(conversations).leftJoin(teachers, eq(teachers.id, conversations.teacherId))
    .where(and(eq(conversations.parentId, parentId), eq(conversations.channel, "portal"))).orderBy(desc(conversations.lastMessageAt)).limit(50);
}

export async function parentThread(database: Database, parentId: string, id: string) {
  const db = asDb(database);
  const c = await db.query.conversations.findFirst({ where: and(eq(conversations.id, id), eq(conversations.parentId, parentId), eq(conversations.channel, "portal")) });
  if (!c) return null;
  await db.update(conversations).set({ portalSeenAt: new Date() }).where(eq(conversations.id, c.id));
  await db.update(parentNotifications).set({ readAt: new Date(), status: "read" }).where(and(eq(parentNotifications.parentId, parentId), eq(parentNotifications.template, "MESSAGE_NEW"), isNull(parentNotifications.readAt), gte(parentNotifications.createdAt, c.createdAt)));
  const msgs = await db.select({ direction: messages.direction, body: messages.body, at: messages.createdAt, by: users.fullName }).from(messages).leftJoin(users, eq(users.id, messages.senderUserId))
    .where(and(eq(messages.conversationId, c.id), inArray(messages.direction, ["in", "out"]))).orderBy(asc(messages.createdAt)).limit(300);
  return { id: c.id, subject: c.subject, closed: c.status === "closed", messages: msgs.map((m) => ({ mine: m.direction === "in", body: m.body, at: m.at, by: m.direction === "out" ? (m.by ?? "Sata Robo") : "Tôi" })) };
}

export async function parentPost(database: Database, parentId: string, id: string, body: string) {
  const db = asDb(database);
  const c = await db.query.conversations.findFirst({ where: and(eq(conversations.id, id), eq(conversations.parentId, parentId), eq(conversations.channel, "portal")) });
  if (!c) return { ok: false as const, error: "Không tìm thấy hội thoại" };
  const errs = validateMessage(body);
  if (errs.length) return { ok: false as const, error: errs[0]! };
  await recordInbound(db, c, body.trim(), null, new Date());
  return { ok: true as const };
}

/** Phụ huynh tự mở câu hỏi mới → giao cho cơ sở của con */
export async function parentStart(database: Database, parentId: string, input: { studentId: string; subject: string; body: string }) {
  const db = asDb(database);
  const [g] = await db.select({ centerId: classes.centerId, teacherId: classes.leadTeacherId, name: parents.fullName, home: students.homeCenterId })
    .from(studentGuardians).innerJoin(parents, eq(parents.id, studentGuardians.parentId)).innerJoin(students, eq(students.id, studentGuardians.studentId))
    .leftJoin(enrollments, and(eq(enrollments.studentId, students.id), inArray(enrollments.status, ["active", "trial", "paused"])))
    .leftJoin(classes, eq(classes.id, enrollments.classId))
    .where(and(eq(studentGuardians.parentId, parentId), eq(studentGuardians.studentId, input.studentId))).limit(1);
  if (!g) return { ok: false as const, error: "Không tìm thấy học viên" };
  const errs = [...validateMessage(input.body), ...(input.subject.trim().length < 3 ? ["Chủ đề tối thiểu 3 ký tự"] : [])];
  if (errs.length) return { ok: false as const, error: errs.join("; ") };
  const now = new Date();
  const [c] = await db.insert(conversations).values({
    channel: "portal", displayName: g.name, centerId: g.centerId ?? g.home, parentId, teacherId: g.teacherId, status: "open", subject: input.subject.trim().slice(0, 150),
    lastMessageAt: now, lastPreview: preview(input.body), portalSeenAt: now,
  }).returning();
  await recordInbound(db, c!, input.body.trim(), null, now);
  if (c!.centerId) {
    const staff = await db.select({ u: userRoles.userId }).from(userRoles).where(and(inArray(userRoles.role, ["CENTER_SALES_CSM", "CENTER_MANAGER"]), eq(userRoles.centerId, c!.centerId)));
    await notify(db, staff.map((s) => s.u), "Phụ huynh gửi câu hỏi mới", `${g.name}: ${preview(input.body)}`, `/tin-nhan?id=${c!.id}`, 2);
  }
  return { ok: true as const, id: c!.id };
}
