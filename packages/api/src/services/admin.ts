import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, sql, desc, asc, isNull, or, ilike, lte, gte, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  emailTemplates, emailLogs, otpRequests, userGroups, userGroupMembers, userGroupPermissions, regions, webhookEvents, appSettings,
  users, userRoles, userNotifications, centers, staff, students, classes, bankTransactions, parentNotifications, outbox, tenants,
  type Database,
} from "@satarobo/db";
import {
  EMAIL_EVENTS, EMAIL_EVENT_KEYS, fillTemplate, validateEmailTemplate, emailRetryDelayMs, isEmail,
  OTP_POLICY, otpPolicyFrom, otpRequestDecision, otpVerifyDecision, normalizeVnPhone,
  canReplay, safeHeaders, SETTINGS_DEFAULTS, validateSettings, validateCode, validateGroup, parseSepayPayload, hasRole, DEPARTMENT_VI,
  groupPermissionCatalog, validateGroupPermissions, GROUP_PERMISSION_ACTION_VI, otpDailyCutoff, znsCostEstimate, otpCutoffState,
  pickForTenant,
  maskPiiText, scrubSql,
  type EmailEvent, type EmailStatus, type OtpPurpose, type OtpStatus, type WebhookSource, type WebhookStatus, type AppSettings, type Department,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { sendOtpMessage, deliverySettings, otpDeliveryReady } from "./delivery";
import { pushOverview } from "./pilot";
import { getOps } from "./opsSettings";
import { writeAudit } from "./audit";
import { trangThaiTokenZalo } from "./zaloToken";
import { assertTenant, tenantCond } from "./tenantScope";
import { deliverNotifications } from "./notify";
import { ingestBankTx } from "./bank";
import { ingestExternal, parseMessengerPayload } from "./messaging";
import { xuLyLaiSuKienKenh } from "./channelAccounts";
import { xuLySuKienOa } from "./zaloOaEvents";
import { createLead } from "./leads";
import { leadInput } from "../routers/admissions";
import { otpPepper } from "../lib/secrets";
import { logger } from "../lib/logger";

type Db = ProtectedContext["db"];
const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });
const pre = (m: string | string[]) => new TRPCError({ code: "PRECONDITION_FAILED", message: Array.isArray(m) ? m.join("; ") : m });
const notFound = (m: string) => new TRPCError({ code: "NOT_FOUND", message: m });
const asDb = (d: Database) => d as unknown as Db;
const PAGE = 50;

/* ------------------------------------------------------------------ */
/* Email                                                               */
/* ------------------------------------------------------------------ */

const SAMPLE_VARS: Record<string, string> = {
  ten: "Nguyễn Văn A", email: "nhanvien@example.test", link: "https://satarobo.vn/…", het_han: "30 phút", ten_ph: "chị Lan", ten_hv: "Minh An", ten_be: "Minh An",
  so_phieu: "PT-CS1-26-000123", so_tien: "4.800.000đ", ma_don: "DH26-000045", co_so: "CS1", han: "25/09/2026", lop: "CS1.SATA4.26.001",
};

/**
 * Mẫu email của ĐÚNG trung tâm (tenant) gửi thư; không biết tenant thì lấy mẫu của
 * trung tâm mặc định — nhờ vậy thư của chuỗi không bao giờ dùng nhầm mẫu của bên nhượng quyền.
 */
async function templateFor(db: Db, event: EmailEvent, tenantId?: string | null) {
  const rows = await db.select().from(emailTemplates).where(eq(emailTemplates.eventKey, event));
  let defaultId: string | null = null;
  if (rows.length > 1) {
    const [d] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.isDefault, true)).limit(1);
    defaultId = d?.id ?? null;
  }
  // Luật chọn nằm ở @satarobo/core (có kiểm thử): của chính tenant → của tenant mặc định → dùng chung
  const t = pickForTenant(rows, tenantId ?? null, defaultId);
  const def = EMAIL_EVENTS[event];
  return t && t.isActive ? { subject: t.subject, body: t.body, custom: true } : { subject: def.subject, body: def.body, custom: false };
}

/**
 * Đưa email vào hàng đợi (dùng từ nghiệp vụ). Không ném lỗi — email là phụ.
 * `tenantId` quyết định dùng mẫu email của trung tâm nào; bỏ trống thì lấy mẫu của
 * trung tâm mặc định, nên hệ thống một-tenant chạy y như trước.
 */
export async function queueEmail(db: Db, x: { to: string; event: EmailEvent; vars: Record<string, string | number | null | undefined>; relatedType?: string; relatedId?: string; createdBy?: string | null; tenantId?: string | null }) {
  const tpl = await templateFor(db, x.event, x.tenantId ?? null);
  const allowed = EMAIL_EVENTS[x.event].vars;
  const subject = fillTemplate(tpl.subject, x.vars, allowed).text;
  const body = fillTemplate(tpl.body, x.vars, allowed).text;
  const valid = isEmail(x.to);
  const [row] = await db.insert(emailLogs).values({
    tenantId: x.tenantId ?? null,
    toEmail: x.to.trim().slice(0, 200), eventKey: x.event, subject, body, status: valid ? "queued" : "failed", error: valid ? null : "Địa chỉ email không hợp lệ",
    attempts: valid ? 0 : 1, relatedType: x.relatedType ?? null, relatedId: x.relatedId ?? null, createdBy: x.createdBy ?? null,
  }).returning({ id: emailLogs.id });
  return row!.id;
}

/** Gửi email trong hàng đợi (worker / cron). Không cấu hình nhà cung cấp → đánh dấu "không gửi". */
export async function processEmailQueue(db: Database, opts: { limit?: number; ids?: string[] } = {}) {
  const d = asDb(db);
  const conds: SQL[] = [eq(emailLogs.status, "queued"), lte(emailLogs.nextAttemptAt, new Date())];
  if (opts.ids?.length) conds.push(inArray(emailLogs.id, opts.ids));
  const batch = await d.select().from(emailLogs).where(and(...conds)).orderBy(asc(emailLogs.nextAttemptAt)).limit(opts.limit ?? 50);
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Sata Robo <no-reply@satarobo.vn>";
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const m of batch) {
    if (!key) {
      await d.update(emailLogs).set({ status: "skipped", error: "Chưa cấu hình nhà cung cấp email (RESEND_API_KEY)", attempts: m.attempts + 1 }).where(eq(emailLogs.id, m.id));
      skipped++;
      continue;
    }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [m.toEmail], subject: m.subject, text: m.body }),
        signal: AbortSignal.timeout(15_000),
      });
      const j = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) throw new Error(j.message ?? `HTTP ${res.status}`);
      await d.update(emailLogs).set({ status: "sent", provider: "resend", providerRef: j.id ?? null, error: null, attempts: m.attempts + 1, sentAt: new Date() }).where(eq(emailLogs.id, m.id));
      sent++;
    } catch (e) {
      const attempts = m.attempts + 1;
      const delay = emailRetryDelayMs(attempts);
      await d.update(emailLogs).set({ status: delay == null ? "failed" : "queued", provider: "resend", error: (e as Error).message.slice(0, 500), attempts, nextAttemptAt: new Date(Date.now() + (delay ?? 0)) }).where(eq(emailLogs.id, m.id));
      failed++;
    }
  }
  return { sent, failed, skipped };
}

export async function listEmailTemplates(ctx: ProtectedContext) {
  requirePermission(ctx, "system:read");
  const rows = await ctx.db.select({ t: emailTemplates, byName: users.fullName }).from(emailTemplates).leftJoin(users, eq(users.id, emailTemplates.updatedBy)).where(tenantCond(ctx, emailTemplates));
  const [stats] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(emailLogs).where(and(gte(emailLogs.createdAt, new Date(Date.now() - 30 * 86400e3)), tenantCond(ctx, emailLogs)));
  return {
    canEdit: hasRole(ctx.actor, "SUPER_ADMIN"),
    sent30d: stats?.n ?? 0,
    items: EMAIL_EVENT_KEYS.map((k) => {
      const r = rows.find((x) => x.t.eventKey === k);
      const def = EMAIL_EVENTS[k];
      return { eventKey: k, label: def.label, vars: [...def.vars], subject: r?.t.subject ?? def.subject, body: r?.t.body ?? def.body, isActive: r?.t.isActive ?? true, custom: !!r, updatedAt: r?.t.updatedAt ?? null, updatedBy: r?.byName ?? null, defaultSubject: def.subject, defaultBody: def.body };
    }),
  };
}

export async function saveEmailTemplate(ctx: ProtectedContext, input: { eventKey: EmailEvent; subject: string; body: string; isActive: boolean }) {
  requirePermission(ctx, "system:update");
  const errs = validateEmailTemplate(input.eventKey, input.subject, input.body);
  if (errs.length) throw bad(errs);
  // Mẫu email là của TỪNG trung tâm (tenant) — khoá trùng theo cặp (tenant, sự kiện)
  const before = await ctx.db.query.emailTemplates.findFirst({ where: and(eq(emailTemplates.eventKey, input.eventKey), tenantCond(ctx, emailTemplates)) });
  const v = { subject: input.subject.trim(), body: input.body.trim(), isActive: input.isActive, updatedBy: ctx.user.id, updatedAt: new Date() };
  await ctx.db.insert(emailTemplates).values({ eventKey: input.eventKey, tenantId: ctx.tenantId, ...v }).onConflictDoUpdate({ target: [emailTemplates.tenantId, emailTemplates.eventKey], set: v });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: before ? "UPDATE" : "CREATE", module: "system", entity: "email_templates", entityId: null, before: before ? { subject: before.subject, isActive: before.isActive } : null, after: { eventKey: input.eventKey, subject: v.subject, isActive: v.isActive }, ip: ctx.ip });
  return { ok: true };
}

export async function resetEmailTemplate(ctx: ProtectedContext, input: { eventKey: EmailEvent }) {
  requirePermission(ctx, "system:update");
  // Chỉ xoá mẫu của chính trung tâm mình — không đụng mẫu của trung tâm khác
  const del = await ctx.db.delete(emailTemplates).where(and(eq(emailTemplates.eventKey, input.eventKey), tenantCond(ctx, emailTemplates))).returning({ id: emailTemplates.id });
  if (!del.length) throw pre("Mẫu đang là mặc định");
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "DELETE", module: "system", entity: "email_templates", entityId: null, after: { eventKey: input.eventKey, reset: true }, ip: ctx.ip });
  return { ok: true };
}

export async function previewEmail(ctx: ProtectedContext, input: { eventKey: EmailEvent; subject: string; body: string }) {
  requirePermission(ctx, "system:read");
  const allowed = EMAIL_EVENTS[input.eventKey].vars;
  const s = fillTemplate(input.subject, SAMPLE_VARS, allowed);
  const b = fillTemplate(input.body, SAMPLE_VARS, allowed);
  return { subject: s.text, body: b.text, unknown: [...new Set([...s.unknown, ...b.unknown])], errors: validateEmailTemplate(input.eventKey, input.subject, input.body) };
}

export async function sendTestEmail(ctx: ProtectedContext, input: { to: string; eventKey: EmailEvent }) {
  requirePermission(ctx, "system:update");
  if (!isEmail(input.to)) throw bad("Email nhận không hợp lệ");
  const id = await queueEmail(ctx.db, { to: input.to, event: input.eventKey, vars: SAMPLE_VARS, relatedType: "test", createdBy: ctx.user.id, tenantId: ctx.tenantId });
  const r = await processEmailQueue(ctx.db as unknown as Database, { ids: [id] });
  const row = await ctx.db.query.emailLogs.findFirst({ where: eq(emailLogs.id, id) });
  return { id, ...r, status: row?.status as EmailStatus, error: row?.error ?? null };
}

export async function listEmailLogs(ctx: ProtectedContext, input: { status?: EmailStatus; event?: string; q?: string; page?: number }) {
  requirePermission(ctx, "system:read");
  const conds: SQL[] = [tenantCond(ctx, emailLogs)];
  if (input.status) conds.push(eq(emailLogs.status, input.status));
  if (input.event) conds.push(eq(emailLogs.eventKey, input.event));
  if (input.q?.trim()) conds.push(or(ilike(emailLogs.toEmail, `%${input.q.trim()}%`), ilike(emailLogs.subject, `%${input.q.trim()}%`))!);
  const where = conds.length ? and(...conds) : sql`true`;
  const page = input.page ?? 1;
  const rows = await ctx.db.select({ m: emailLogs, byName: users.fullName }).from(emailLogs).leftJoin(users, eq(users.id, emailLogs.createdBy)).where(where).orderBy(desc(emailLogs.createdAt)).limit(PAGE).offset((page - 1) * PAGE);
  const [c] = await ctx.db.select({
    total: sql<number>`count(*)::int`,
    queued: sql<number>`count(*) filter (where ${emailLogs.status} = 'queued')::int`,
    sent: sql<number>`count(*) filter (where ${emailLogs.status} = 'sent')::int`,
    failed: sql<number>`count(*) filter (where ${emailLogs.status} = 'failed')::int`,
    skipped: sql<number>`count(*) filter (where ${emailLogs.status} = 'skipped')::int`,
  }).from(emailLogs).where(where);
  return { page, pageSize: PAGE, counts: c, provider: process.env.RESEND_API_KEY ? "resend" : null, items: rows.map((r) => ({ ...r.m, byName: r.byName, canRetry: r.m.status === "failed" || r.m.status === "skipped" })) };
}

export async function retryEmail(ctx: ProtectedContext, input: { id: string }) {
  requirePermission(ctx, "system:update");
  const m = await ctx.db.query.emailLogs.findFirst({ where: eq(emailLogs.id, input.id) });
  if (!m) throw notFound("Không tìm thấy email");
  assertTenant(ctx, m, "Email");
  if (m.status !== "failed" && m.status !== "skipped") throw pre("Chỉ gửi lại email lỗi / chưa gửi");
  if (!isEmail(m.toEmail)) throw pre("Địa chỉ email không hợp lệ — không gửi lại");
  await ctx.db.update(emailLogs).set({ status: "queued", attempts: 0, error: null, nextAttemptAt: new Date() }).where(eq(emailLogs.id, m.id));
  const r = await processEmailQueue(ctx.db as unknown as Database, { ids: [m.id] });
  return { ok: true, ...r };
}

/* ------------------------------------------------------------------ */
/* OTP                                                                 */
/* ------------------------------------------------------------------ */

/** So khớp băm không lệ thuộc thời gian */
const safeHashEq = (a: string | null, b: string) => {
  const x = Buffer.from(a ?? "");
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const hashOtp = (phone: string, purpose: string, code: string) => createHash("sha256").update(`${otpPepper()}|${phone}|${purpose}|${code}`).digest("hex");

export async function requestOtp(db: Database, input: { phone: string; purpose: OtpPurpose; ip: string | null; userAgent?: string | null }) {
  const d = asDb(db);
  const phone = normalizeVnPhone(input.phone);
  if (!phone) return { ok: false as const, error: "Số điện thoại không hợp lệ" };
  const now = new Date();
  const P = otpPolicyFrom(await getOps(d));
  const since = new Date(now.getTime() - Math.max(P.perIpWindowMin, P.perPhoneWindowMin) * 60_000);
  const recentPhone = await d.select({ at: otpRequests.createdAt }).from(otpRequests).where(and(eq(otpRequests.phone, phone), gte(otpRequests.createdAt, since), sql`${otpRequests.status} <> 'blocked'`));
  const recentIp = input.ip ? await d.select({ at: otpRequests.createdAt }).from(otpRequests).where(and(eq(otpRequests.ip, input.ip), gte(otpRequests.createdAt, since), sql`${otpRequests.status} <> 'blocked'`)) : [];
  const dec = otpRequestDecision({ now, phoneRecent: recentPhone.map((r) => r.at), ipRecent: recentIp.map((r) => r.at) }, P);
  if (!dec.ok) {
    await d.insert(otpRequests).values({ phone, purpose: input.purpose, codeHash: "-", channel: "none", status: "blocked", ip: input.ip, userAgent: input.userAgent?.slice(0, 200) ?? null, note: dec.reason, expiresAt: now });
    return { ok: false as const, error: dec.reason, retryAfterSec: dec.retryAfterSec };
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await d.update(otpRequests).set({ status: "expired" }).where(and(eq(otpRequests.phone, phone), eq(otpRequests.purpose, input.purpose), inArray(otpRequests.status, ["sent", "queued"])));
  const [row] = await d.insert(otpRequests).values({
    phone, purpose: input.purpose, codeHash: hashOtp(phone, input.purpose, code), channel: "zns", status: "queued",
    ip: input.ip, userAgent: input.userAgent?.slice(0, 200) ?? null, note: "Đang gửi", expiresAt: new Date(now.getTime() + P.ttlMinutes * 60_000),
  }).returning({ id: otpRequests.id, expiresAt: otpRequests.expiresAt });
  const sent = await sendOtpMessage(db, { phone, code, minutes: P.ttlMinutes, requestId: row!.id });
  await d.update(otpRequests).set({ channel: sent.channel ?? "none", status: sent.channel ? "sent" : "queued", note: sent.channel ? null : `Chưa gửi được: ${sent.error}`.slice(0, 300) }).where(eq(otpRequests.id, row!.id));
  const dev = process.env.ALLOW_DEV_ACTOR === "1" && process.env.NODE_ENV !== "production";
  return { ok: true as const, requestId: row!.id, expiresAt: row!.expiresAt, delivered: !!sent.channel, channel: sent.channel, ...(dev ? { devCode: code } : {}) };
}

export async function verifyOtp(db: Database, input: { phone: string; purpose: OtpPurpose; code: string }) {
  const d = asDb(db);
  const phone = normalizeVnPhone(input.phone);
  if (!phone || !/^\d{6}$/.test(input.code.trim())) return { ok: false as const, error: "Mã không đúng" };
  const r = await d.query.otpRequests.findFirst({ where: and(eq(otpRequests.phone, phone), eq(otpRequests.purpose, input.purpose), sql`${otpRequests.status} <> 'blocked'`), orderBy: desc(otpRequests.createdAt) });
  if (!r) return { ok: false as const, error: "Chưa có yêu cầu mã cho số này" };
  const P = otpPolicyFrom(await getOps(d));
  const dec = otpVerifyDecision({ status: r.status as OtpStatus, attempts: r.attempts, expiresAt: r.expiresAt, now: new Date(), matches: safeHashEq(r.codeHash, hashOtp(phone, input.purpose, input.code.trim())) }, P);
  await d.update(otpRequests).set({ status: dec.status, attempts: dec.attempts, ...(dec.result === "ok" ? { verifiedAt: new Date() } : {}) }).where(eq(otpRequests.id, r.id));
  const msg = { ok: "", wrong: `Mã không đúng (còn ${P.maxAttempts - dec.attempts} lần)`, expired: "Mã đã hết hạn — yêu cầu mã mới", locked: "Nhập sai quá số lần — yêu cầu mã mới", used: "Mã đã được dùng" }[dec.result];
  return dec.result === "ok" ? { ok: true as const, phone } : { ok: false as const, error: msg };
}

export async function listOtp(ctx: ProtectedContext, input: { status?: OtpStatus; purpose?: OtpPurpose; q?: string; page?: number }) {
  requirePermission(ctx, "system:read");
  const conds: SQL[] = [];
  if (input.status) conds.push(eq(otpRequests.status, input.status));
  if (input.purpose) conds.push(eq(otpRequests.purpose, input.purpose));
  const digits = (input.q ?? "").replace(/\D/g, "");
  if (digits.length >= 3) conds.push(ilike(otpRequests.phone, `%${digits}%`));
  const where = conds.length ? and(...conds) : sql`true`;
  const page = input.page ?? 1;
  const rows = await ctx.db.select({ id: otpRequests.id, phone: otpRequests.phone, purpose: otpRequests.purpose, channel: otpRequests.channel, status: otpRequests.status, attempts: otpRequests.attempts, ip: otpRequests.ip, note: otpRequests.note, expiresAt: otpRequests.expiresAt, verifiedAt: otpRequests.verifiedAt, createdAt: otpRequests.createdAt })
    .from(otpRequests).where(where).orderBy(desc(otpRequests.createdAt)).limit(PAGE).offset((page - 1) * PAGE);
  // Đếm theo NGÀY LỊCH (giờ Việt Nam) như bản gốc; giữ thêm chỉ số 24 giờ trượt đang dùng
  const VN_TODAY = sql`(${otpRequests.createdAt} at time zone 'Asia/Ho_Chi_Minh')::date = (now() at time zone 'Asia/Ho_Chi_Minh')::date`;
  const [c] = await ctx.db.select({
    total: sql<number>`count(*)::int`,
    verified: sql<number>`count(*) filter (where ${otpRequests.status} = 'verified')::int`,
    blocked24h: sql<number>`count(*) filter (where ${otpRequests.status} = 'blocked' and ${otpRequests.createdAt} > now() - interval '24 hours')::int`,
    failed24h: sql<number>`count(*) filter (where ${otpRequests.status} = 'failed' and ${otpRequests.createdAt} > now() - interval '24 hours')::int`,
    last24h: sql<number>`count(*) filter (where ${otpRequests.createdAt} > now() - interval '24 hours')::int`,
    today: sql<number>`count(*) filter (where ${VN_TODAY})::int`,
    sentToday: sql<number>`count(*) filter (where ${VN_TODAY} and ${otpRequests.status} in ('sent','verified','failed'))::int`,
    znsToday: sql<number>`count(*) filter (where ${VN_TODAY} and ${otpRequests.channel} = 'zns' and ${otpRequests.status} in ('sent','verified','failed'))::int`,
    znsRecipientErrorsToday: sql<number>`count(*) filter (where ${VN_TODAY} and ${otpRequests.channel} = 'zns' and ${otpRequests.status} in ('failed','blocked'))::int`,
    blockedToday: sql<number>`count(*) filter (where ${VN_TODAY} and ${otpRequests.status} = 'blocked')::int`,
    failedToday: sql<number>`count(*) filter (where ${VN_TODAY} and ${otpRequests.status} = 'failed')::int`,
  }).from(otpRequests).where(where);

  const ops = await getOps(ctx.db);
  const policy = otpPolicyFrom(ops);
  const cutoff = otpDailyCutoff(policy);
  const sentToday = c?.sentToday ?? 0;
  const now = Date.now();
  return {
    page, pageSize: PAGE, counts: c, policy, znsConfigured: otpDeliveryReady(await deliverySettings(ctx.db)),
    /** Thẻ số của bản gốc: tin đã gửi hôm nay · ngưỡng tự ngắt · chi phí ZNS hôm nay (ước) · ZNS lỗi người nhận hôm nay */
    daily: {
      sent: sentToday,
      zns: c?.znsToday ?? 0,
      znsRecipientErrors: c?.znsRecipientErrorsToday ?? 0,
      cutoff,
      ...otpCutoffState(sentToday, cutoff),
      unitCostVnd: ops.znsUnitCostVnd,
      estimatedCostVnd: znsCostEstimate(c?.znsToday ?? 0, ops.znsUnitCostVnd),
    },
    items: rows.map((r) => ({ ...r, phone: r.phone.replace(/^(\d{3})\d+(\d{3})$/, "$1••••$2"), status: (r.status === "sent" || r.status === "queued") && r.expiresAt.getTime() < now ? "expired" : r.status })),
  };
}

/* ------------------------------------------------------------------ */
/* Nhóm người dùng                                                     */
/* ------------------------------------------------------------------ */

export async function listGroups(ctx: ProtectedContext) {
  requirePermission(ctx, "system:read");
  const rows = await ctx.db.select({
    g: userGroups, centerCode: centers.code,
    members: sql<number>`(select count(*)::int from ${userGroupMembers} m where m.group_id = ${userGroups.id})`,
    permissions: sql<number>`(select count(*)::int from ${userGroupPermissions} p where p.group_id = ${userGroups.id})`,
  })
    .from(userGroups).leftJoin(centers, eq(centers.id, userGroups.centerId)).where(tenantCond(ctx, userGroups)).orderBy(asc(userGroups.name));
  return rows.map((r) => ({ ...r.g, centerCode: r.centerCode, members: r.members, permissions: r.permissions }));
}

export async function getGroup(ctx: ProtectedContext, id: string) {
  requirePermission(ctx, "system:read");
  const g = await ctx.db.query.userGroups.findFirst({ where: eq(userGroups.id, id) });
  if (!g) throw notFound("Không tìm thấy nhóm");
  const members = await ctx.db.select({ userId: users.id, fullName: users.fullName, email: users.email, isActive: users.isActive, addedAt: userGroupMembers.addedAt,
    roles: sql<string>`(select string_agg(distinct r.role::text, ', ') from ${userRoles} r where r.user_id = ${users.id})` })
    .from(userGroupMembers).innerJoin(users, eq(users.id, userGroupMembers.userId)).where(eq(userGroupMembers.groupId, id)).orderBy(asc(users.fullName));
  const perms = await ctx.db.select({ permission: userGroupPermissions.permission, centerId: userGroupPermissions.centerId, grantedAt: userGroupPermissions.grantedAt, reason: userGroupPermissions.reason })
    .from(userGroupPermissions).where(eq(userGroupPermissions.groupId, id)).orderBy(asc(userGroupPermissions.permission));
  return { ...g, members, permissions: perms, catalog: groupPermissionCatalog(), actionLabels: GROUP_PERMISSION_ACTION_VI };
}

/**
 * Đặt bộ quyền của một nhóm — "cấp quyền cho một nhóm người mà không sửa vai trò".
 * Thay toàn bộ danh sách; đổi bắt buộc ghi lý do và ghi nhật ký trong cùng transaction.
 */
export async function setGroupPermissions(ctx: ProtectedContext, input: { groupId: string; permissions: string[]; reason: string }) {
  requirePermission(ctx, "system:update");
  if (!hasRole(ctx.actor, "SUPER_ADMIN")) throw new TRPCError({ code: "FORBIDDEN", message: "Chỉ Quản trị tối cao cấp quyền theo nhóm" });
  const reason = input.reason.trim();
  if (reason.length < 5) throw bad("Đổi quyền của nhóm phải ghi lý do (tối thiểu 5 ký tự)");
  const wanted = [...new Set(input.permissions.map((p) => p.trim()))].filter(Boolean);
  const errs = validateGroupPermissions(wanted);
  if (errs.length) throw bad(errs);

  return ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const g = await db.query.userGroups.findFirst({ where: eq(userGroups.id, input.groupId) });
    if (!g) throw notFound("Không tìm thấy nhóm");
    const before = (await db.select({ permission: userGroupPermissions.permission }).from(userGroupPermissions).where(eq(userGroupPermissions.groupId, g.id))).map((r) => r.permission).sort();
    const after = [...wanted].sort();
    if (before.join("|") === after.join("|")) return { changed: 0, permissions: after };

    await db.delete(userGroupPermissions).where(eq(userGroupPermissions.groupId, g.id));
    if (after.length) {
      await db.insert(userGroupPermissions).values(after.map((permission) => ({ groupId: g.id, permission, centerId: g.centerId ?? null, grantedBy: ctx.user.id, reason })));
    }
    await writeAudit(db, {
      actorId: ctx.user.id, action: "UPDATE", module: "system", entity: "user_group_permissions", entityId: g.id,
      before: { permissions: before }, after: { permissions: after, scope: g.centerId ? "cơ sở" : "toàn hệ thống" }, reason, ip: ctx.ip,
    });
    return { changed: Math.abs(after.length - before.length) + after.filter((p) => !before.includes(p)).length, permissions: after };
  });
}

export async function upsertGroup(ctx: ProtectedContext, input: { id?: string; name: string; description?: string | null; centerId?: string | null }) {
  requirePermission(ctx, "system:update");
  const errs = validateGroup(input);
  if (errs.length) throw bad(errs);
  const dup = await ctx.db.query.userGroups.findFirst({ where: and(sql`lower(${userGroups.name}) = ${input.name.trim().toLowerCase()}`, input.id ? sql`${userGroups.id} <> ${input.id}` : sql`true`) });
  if (dup) throw pre("Tên nhóm đã tồn tại");
  const v = { name: input.name.trim(), description: input.description?.trim() || null, centerId: input.centerId ?? null };
  if (input.id) {
    const up = await ctx.db.update(userGroups).set(v).where(eq(userGroups.id, input.id)).returning({ id: userGroups.id });
    if (!up.length) throw notFound("Không tìm thấy nhóm");
    await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "system", entity: "user_groups", entityId: input.id, after: v, ip: ctx.ip });
    return { id: input.id };
  }
  const [g] = await ctx.db.insert(userGroups).values({ ...v, createdBy: ctx.user.id }).returning({ id: userGroups.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "system", entity: "user_groups", entityId: g!.id, after: v, ip: ctx.ip });
  return { id: g!.id };
}

export async function deleteGroup(ctx: ProtectedContext, input: { id: string }) {
  requirePermission(ctx, "system:delete");
  const g = await ctx.db.query.userGroups.findFirst({ where: eq(userGroups.id, input.id) });
  if (!g) throw notFound("Không tìm thấy nhóm");
  await ctx.db.delete(userGroups).where(eq(userGroups.id, g.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "DELETE", module: "system", entity: "user_groups", entityId: g.id, before: { name: g.name }, ip: ctx.ip });
  return { ok: true };
}

export async function setGroupMembers(ctx: ProtectedContext, input: { groupId: string; add?: string[]; remove?: string[] }) {
  requirePermission(ctx, "system:update");
  const g = await ctx.db.query.userGroups.findFirst({ where: eq(userGroups.id, input.groupId) });
  if (!g) throw notFound("Không tìm thấy nhóm");
  const add = [...new Set(input.add ?? [])];
  if (add.length) {
    const ok = await ctx.db.select({ id: users.id }).from(users).where(and(inArray(users.id, add), eq(users.isActive, true)));
    if (ok.length !== add.length) throw bad("Có tài khoản không tồn tại hoặc đã khoá");
    await ctx.db.insert(userGroupMembers).values(add.map((userId) => ({ groupId: g.id, userId, addedBy: ctx.user.id }))).onConflictDoNothing();
  }
  if (input.remove?.length) await ctx.db.delete(userGroupMembers).where(and(eq(userGroupMembers.groupId, g.id), inArray(userGroupMembers.userId, input.remove)));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "system", entity: "user_group_members", entityId: g.id, after: { add, remove: input.remove ?? [] }, ip: ctx.ip });
  return { ok: true };
}

export async function announceToGroup(ctx: ProtectedContext, input: { groupId: string; title: string; body: string; link?: string | null; priority: number }) {
  requirePermission(ctx, "system:update");
  if (input.title.trim().length < 3 || input.body.trim().length < 5) throw bad("Tiêu đề ≥ 3, nội dung ≥ 5 ký tự");
  if (input.link && !/^\/[A-Za-z0-9/_?=&.-]*$/.test(input.link)) throw bad("Liên kết phải là đường dẫn nội bộ, bắt đầu bằng /");
  const mem = await ctx.db.select({ id: users.id }).from(userGroupMembers).innerJoin(users, eq(users.id, userGroupMembers.userId)).where(and(eq(userGroupMembers.groupId, input.groupId), eq(users.isActive, true)));
  if (!mem.length) throw pre("Nhóm chưa có thành viên đang hoạt động");
  await deliverNotifications(ctx.db, mem.map((m) => m.id), { title: input.title.trim(), body: input.body.trim(), link: input.link || null, priority: input.priority, type: "announcement" });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "system", entity: "user_notifications", entityId: input.groupId, after: { title: input.title, recipients: mem.length }, ip: ctx.ip });
  return { recipients: mem.length };
}

/* ------------------------------------------------------------------ */
/* Cây tổ chức                                                         */
/* ------------------------------------------------------------------ */

export async function orgTree(ctx: ProtectedContext) {
  requirePermission(ctx, "system:read");
  const [rgs, ctrs, staffRows, stu, cls, mgrs] = await Promise.all([
    ctx.db.select({ r: regions, managerName: users.fullName }).from(regions).leftJoin(users, eq(users.id, regions.managerUserId)).orderBy(asc(regions.sortOrder), asc(regions.code)),
    ctx.db.select().from(centers).orderBy(asc(centers.code)),
    ctx.db.select({ centerId: staff.centerId, department: staff.department, n: sql<number>`count(*)::int` }).from(staff).where(sql`${staff.status} <> 'resigned'`).groupBy(staff.centerId, staff.department),
    ctx.db.select({ centerId: students.homeCenterId, n: sql<number>`count(*)::int` }).from(students).where(and(inArray(students.status, ["active", "trial", "paused"]), isNull(students.deletedAt))).groupBy(students.homeCenterId),
    ctx.db.select({ centerId: classes.centerId, n: sql<number>`count(*)::int` }).from(classes).where(inArray(classes.status, ["running", "recruiting"])).groupBy(classes.centerId),
    ctx.db.select({ centerId: userRoles.centerId, fullName: users.fullName }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId)).where(and(eq(userRoles.role, "CENTER_MANAGER"), eq(users.isActive, true))),
  ]);
  const centerNode = (c: typeof ctrs[number]) => ({
    ...c,
    managers: mgrs.filter((m) => m.centerId === c.id).map((m) => m.fullName),
    students: stu.find((s) => s.centerId === c.id)?.n ?? 0,
    classes: cls.find((s) => s.centerId === c.id)?.n ?? 0,
    departments: staffRows.filter((s) => s.centerId === c.id).map((s) => ({ key: s.department, label: DEPARTMENT_VI[s.department as Department] ?? s.department, staff: s.n })).sort((a, b) => b.staff - a.staff),
    staff: staffRows.filter((s) => s.centerId === c.id).reduce((t, s) => t + s.n, 0),
  });
  const managerOptions = await ctx.db.select({ id: users.id, fullName: users.fullName }).from(users).innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.isActive, true), inArray(userRoles.role, ["SUPER_ADMIN", "CENTER_MANAGER", "HO_HR", "HO_ACCOUNTANT"]))).groupBy(users.id, users.fullName).orderBy(asc(users.fullName));
  return {
    regions: rgs.map((r) => ({ ...r.r, managerName: r.managerName, centers: ctrs.filter((c) => c.regionId === r.r.id).map(centerNode) })),
    unassigned: ctrs.filter((c) => !c.regionId || !rgs.some((r) => r.r.id === c.regionId)).map(centerNode),
    managerOptions,
    canEdit: hasRole(ctx.actor, "SUPER_ADMIN"),
  };
}

export async function upsertRegion(ctx: ProtectedContext, input: { id?: string; code: string; name: string; managerUserId?: string | null; sortOrder?: number }) {
  requirePermission(ctx, "system:update");
  const code = input.code.trim().toUpperCase();
  const err = validateCode(code, "Mã khu vực");
  if (err) throw bad(err);
  if (input.name.trim().length < 2) throw bad("Tên khu vực tối thiểu 2 ký tự");
  const dup = await ctx.db.query.regions.findFirst({ where: and(eq(regions.code, code), input.id ? sql`${regions.id} <> ${input.id}` : sql`true`) });
  if (dup) throw pre(`Mã ${code} đã có`);
  const v = { code, name: input.name.trim(), managerUserId: input.managerUserId ?? null, sortOrder: input.sortOrder ?? 0 };
  if (input.id) {
    await ctx.db.update(regions).set(v).where(eq(regions.id, input.id));
    await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "system", entity: "regions", entityId: input.id, after: v, ip: ctx.ip });
    return { id: input.id };
  }
  const [r] = await ctx.db.insert(regions).values(v).returning({ id: regions.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "system", entity: "regions", entityId: r!.id, after: v, ip: ctx.ip });
  return { id: r!.id };
}

export async function deleteRegion(ctx: ProtectedContext, input: { id: string }) {
  requirePermission(ctx, "system:delete");
  const [c] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(centers).where(eq(centers.regionId, input.id));
  if ((c?.n ?? 0) > 0) throw pre("Khu vực còn cơ sở — chuyển cơ sở sang khu vực khác trước");
  const del = await ctx.db.delete(regions).where(eq(regions.id, input.id)).returning({ code: regions.code });
  if (!del.length) throw notFound("Không tìm thấy khu vực");
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "DELETE", module: "system", entity: "regions", entityId: input.id, before: { code: del[0]!.code }, ip: ctx.ip });
  return { ok: true };
}

export async function assignCenterRegion(ctx: ProtectedContext, input: { centerId: string; regionId: string | null }) {
  requirePermission(ctx, "system:update");
  if (input.regionId && !(await ctx.db.query.regions.findFirst({ where: eq(regions.id, input.regionId) }))) throw notFound("Không tìm thấy khu vực");
  const up = await ctx.db.update(centers).set({ regionId: input.regionId }).where(eq(centers.id, input.centerId)).returning({ code: centers.code });
  if (!up.length) throw notFound("Không tìm thấy cơ sở");
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "system", entity: "centers", entityId: input.centerId, after: { regionId: input.regionId }, ip: ctx.ip });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Webhook                                                             */
/* ------------------------------------------------------------------ */

export async function logWebhook(db: Database, x: { source: WebhookSource; status: WebhookStatus; httpStatus: number; payload: unknown; headers?: Record<string, string>; externalId?: string | null; result?: unknown; error?: string | null; ip?: string | null }) {
  try {
    const payload = x.payload && typeof x.payload === "object" ? x.payload : { raw: String(x.payload ?? "").slice(0, 2000) };
    await asDb(db).insert(webhookEvents).values({
      source: x.source, status: x.status, httpStatus: x.httpStatus, payload, headers: x.headers ? safeHeaders(x.headers) : null, externalId: x.externalId ?? null,
      // Thông báo lỗi có thể là lỗi tầng CSDL (kèm câu SQL + giá trị tham số) → lược trước khi lưu
      result: (x.result ?? null) as never, error: x.error ? maskPiiText(scrubSql(x.error)).slice(0, 1000) : null, ip: x.ip ?? null,
    });
  } catch (e) {
    logger.child("webhook-log").error("không ghi được nhật ký webhook", { err: e, source: x.source });
  }
}

/** Chuẩn hoá body form đăng ký học thử công khai */
export function mapPublicLeadBody(body: Record<string, unknown>) {
  return leadInput.safeParse({
    parentName: body.hoTenPh ?? body.parentName,
    phone: body.sdt ?? body.phone,
    email: body.email || null,
    childName: body.hoTenCon ?? body.childName ?? null,
    childGrade: body.lop ? Number(body.lop) : (body.childGrade as number | undefined) ?? null,
    school: body.truong ?? body.school ?? null,
    interestedCourseId: body.interestedCourseId ?? null,
    centerId: body.centerId ?? null,
    source: (body.source as string | undefined) ?? "web-form",
    utmSource: body.utm_source ?? body.utmSource ?? null,
    utmMedium: body.utm_medium ?? body.utmMedium ?? null,
    utmCampaign: body.utm_campaign ?? body.utmCampaign ?? null,
    notes: body.ghiChu ?? body.notes ?? null,
    consent: body.consent === true || body.consent === "on" || body.consent === "1",
    referralCode: typeof body.ref === "string" ? body.ref : typeof body.referralCode === "string" ? body.referralCode : null,
    marketingConsent: body.marketingConsent === true || body.marketingConsent === "on" || body.marketingConsent === "1",
    // Nguồn & theo dõi — chỉ có ở form công khai
    landingPage: body.landingPage ?? body.landing_page ?? body.page ?? null,
    referrer: body.referrer ?? body.ref_url ?? null,
    eventId: body.eventId ?? body.event_id ?? body.fbclid ?? body.gclid ?? null,
  });
}

export async function listWebhookEvents(ctx: ProtectedContext, input: { source?: WebhookSource; status?: WebhookStatus; page?: number }) {
  requirePermission(ctx, "system:read");
  const conds: SQL[] = [];
  if (input.source) conds.push(eq(webhookEvents.source, input.source));
  if (input.status) conds.push(eq(webhookEvents.status, input.status));
  const where = conds.length ? and(...conds) : sql`true`;
  const page = input.page ?? 1;
  const rows = await ctx.db.select({ w: webhookEvents, byName: users.fullName }).from(webhookEvents).leftJoin(users, eq(users.id, webhookEvents.replayedBy)).where(where).orderBy(desc(webhookEvents.receivedAt)).limit(PAGE).offset((page - 1) * PAGE);
  const [c] = await ctx.db.select({
    total: sql<number>`count(*)::int`,
    processed: sql<number>`count(*) filter (where ${webhookEvents.status} = 'processed')::int`,
    failed: sql<number>`count(*) filter (where ${webhookEvents.status} = 'failed')::int`,
    rejected: sql<number>`count(*) filter (where ${webhookEvents.status} = 'rejected')::int`,
    duplicate: sql<number>`count(*) filter (where ${webhookEvents.status} = 'duplicate')::int`,
  }).from(webhookEvents).where(input.source ? eq(webhookEvents.source, input.source) : sql`true`);
  return {
    page, pageSize: PAGE, counts: c, canReplay: hasRole(ctx.actor, "SUPER_ADMIN"),
    items: rows.map((r) => ({ ...r.w, byName: r.byName, replayBlock: canReplay(r.w.status as WebhookStatus, r.w.attempts) })),
  };
}

export async function replayWebhook(ctx: ProtectedContext, input: { id: string }) {
  requirePermission(ctx, "system:update");
  const w = await ctx.db.query.webhookEvents.findFirst({ where: eq(webhookEvents.id, input.id) });
  if (!w) throw notFound("Không tìm thấy sự kiện");
  const block = canReplay(w.status as WebhookStatus, w.attempts);
  if (block) throw pre(block);
  let status: WebhookStatus = "failed";
  let result: unknown = null;
  let error: string | null = null;
  try {
    if (w.source === "sepay") {
      const p = parseSepayPayload(w.payload);
      if (!p.ok) { status = "rejected"; error = p.error; }
      else {
        const r = await ingestBankTx(ctx.db, p.tx, "sepay", w.payload, null, ctx.user.id);
        status = r.duplicate ? "duplicate" : "processed";
        result = r;
      }
    } else if (w.source === "public_lead") {
      const p = mapPublicLeadBody((w.payload ?? {}) as Record<string, unknown>);
      if (!p.success) { status = "rejected"; error = "Dữ liệu form không hợp lệ"; }
      else {
        const r = await createLead(ctx.db, p.data, ctx.user.id);
        status = r.duplicated ? "duplicate" : "processed";
        result = { leadId: r.lead?.id ?? null, duplicated: r.duplicated };
      }
    } else if (w.source === "messenger") {
      const tins = parseMessengerPayload(w.payload);
      if (!tins.length) { status = "rejected"; error = "Payload không có tin nào để chạy lại"; }
      else {
        const rs = [] as { ok: boolean; duplicate?: boolean }[];
        for (const t of tins) rs.push(await ingestExternal(ctx.db as never, { channel: "messenger", senderId: t.senderId, text: t.text, messageId: t.messageId, at: t.at, attachments: t.attachments }));
        status = rs.every((r) => r.ok && r.duplicate) ? "duplicate" : rs.some((r) => r.ok) ? "processed" : "rejected";
        result = { soTin: rs.length };
      }
    } else if (w.source === "zalo") {
      const r = await xuLySuKienOa(ctx.db as never, w.payload, ctx.user.id);
      if (!r.ok) { status = "rejected"; error = r.error ?? "Không xử lý được sự kiện Zalo"; }
      else { status = r.duplicate ? "duplicate" : "processed"; result = r; }
    } else if (w.source === "zalo_ca_nhan") {
      // `external_id` của dòng nhật ký chính là slug nick đã nhận sự kiện
      const r = await xuLyLaiSuKienKenh(ctx.db as never, { slug: w.externalId, body: w.payload });
      if (!r.ok) { status = "rejected"; error = r.error; }
      else { status = r.status === "duplicate" ? "duplicate" : "processed"; result = r; }
    } else {
      throw pre("Nguồn không hỗ trợ chạy lại");
    }
  } catch (e) {
    if (e instanceof TRPCError && e.code === "PRECONDITION_FAILED") throw e;
    status = "failed";
    error = (e as Error).message.slice(0, 1000);
  }
  await ctx.db.update(webhookEvents).set({ status, result: result as never, error, attempts: w.attempts + 1, lastAttemptAt: new Date(), replayedBy: ctx.user.id }).where(eq(webhookEvents.id, w.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "TRANSITION", module: "system", entity: "webhook_events", entityId: w.id, before: { status: w.status }, after: { status, error }, ip: ctx.ip });
  return { status, error };
}

/* ------------------------------------------------------------------ */
/* Tích hợp & cài đặt                                                  */
/* ------------------------------------------------------------------ */

export async function integrations(ctx: ProtectedContext) {
  requirePermission(ctx, "system:read");
  const e = process.env;
  // Token Zalo nay nằm trong CSDL (tự làm mới) — biến môi trường chỉ là đường lui cho bản cũ
  const zt = await trangThaiTokenZalo(ctx.db as never);
  const zaloToken = zt.usable;
  const [bank] = await ctx.db.select({ last: sql<string | null>`max(${bankTransactions.receivedAt})::text`, n24: sql<number>`count(*) filter (where ${bankTransactions.receivedAt} > now() - interval '24 hours')::int` }).from(bankTransactions).where(eq(bankTransactions.source, "sepay"));
  const [wh] = await ctx.db.select({ failed: sql<number>`count(*) filter (where ${webhookEvents.status} = 'failed')::int`, rejected24: sql<number>`count(*) filter (where ${webhookEvents.status} = 'rejected' and ${webhookEvents.receivedAt} > now() - interval '24 hours')::int` }).from(webhookEvents);
  const [em] = await ctx.db.select({ queued: sql<number>`count(*) filter (where ${emailLogs.status} = 'queued')::int`, failed: sql<number>`count(*) filter (where ${emailLogs.status} = 'failed')::int`, sent7: sql<number>`count(*) filter (where ${emailLogs.status} = 'sent' and ${emailLogs.sentAt} > now() - interval '7 days')::int` }).from(emailLogs);
  const [zn] = await ctx.db.select({ queued: sql<number>`count(*) filter (where ${parentNotifications.channel} = 'zns' and ${parentNotifications.status} = 'queued')::int` }).from(parentNotifications);
  const [ob] = await ctx.db.select({ pending: sql<number>`count(*) filter (where ${outbox.processedAt} is null)::int`, last: sql<string | null>`max(${outbox.processedAt})::text` }).from(outbox);
  const [otp] = await ctx.db.select({ n24: sql<number>`count(*) filter (where ${otpRequests.createdAt} > now() - interval '24 hours')::int` }).from(otpRequests);
  const ds = await deliverySettings(ctx.db);
  const pu = await pushOverview(ctx.db);
  type Item = { key: string; name: string; purpose: string; status: "ok" | "warn" | "off"; details: string[]; env: string[]; href?: string; test?: "email" | "zns" | "sms" | null };
  const items: Item[] = [
    { key: "sepay", name: "SePay", purpose: "Biến động số dư → tự khớp đơn", status: e.SEPAY_API_KEY ? (wh?.rejected24 ? "warn" : "ok") : "off", env: ["SEPAY_API_KEY"], href: "/bien-dong-so-du",
      details: [`Webhook: /api/webhooks/sepay`, `Lần nhận gần nhất: ${bank?.last ?? "chưa có"}`, `24h: ${bank?.n24 ?? 0} giao dịch · bị từ chối ${wh?.rejected24 ?? 0}`] },
    { key: "email", name: "Email (Resend)", purpose: "Phiếu thu, nhắc học phí, đặt lại mật khẩu", status: e.RESEND_API_KEY ? (em?.failed ? "warn" : "ok") : "off", env: ["RESEND_API_KEY", "EMAIL_FROM"], href: "/email-logs",
      details: [`Người gửi: ${e.EMAIL_FROM ?? "Sata Robo <no-reply@satarobo.vn>"}`, `7 ngày: ${em?.sent7 ?? 0} đã gửi · chờ ${em?.queued ?? 0} · lỗi ${em?.failed ?? 0}`] },
    { key: "zns", name: "Zalo ZNS / SMS", purpose: "Thông báo & OTP qua Zalo, SMS dự phòng", status: ds.zns.mode === "live" ? (e.ZALO_ZNS_TOKEN ? "ok" : "warn") : ds.zns.mode === "sandbox" ? "warn" : "off", env: ["ZALO_ZNS_TOKEN", "ZNS_API_URL", "SMS_API_URL", "SMS_API_KEY"], href: "/cau-hinh-van-hanh?tab=zalo",
      details: [`ZNS: ${ds.zns.mode} · SMS: ${ds.sms.mode}${ds.sms.fallback ? " (dự phòng)" : ""}`, `Thông báo ZNS chờ gửi: ${zn?.queued ?? 0}`, `OTP 24h: ${otp?.n24 ?? 0}`] },
    { key: "webpush", name: "Thông báo đẩy (Web Push)", purpose: "Đẩy tin mới tới điện thoại phụ huynh đã bật thông báo ở cổng /ph", status: e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY ? "ok" : "off", env: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"], href: "/bao-cao/sau-go-live",
      details: [`Thiết bị đang nhận: ${pu.devices} (${pu.parents} phụ huynh)`, `Đăng ký đã hết hạn / tắt: ${pu.revoked}`] },
    { key: "messenger", name: "Facebook Messenger", purpose: "Hộp thư Messenger CRM, tạo lead từ hội thoại", status: e.META_APP_SECRET && e.META_VERIFY_TOKEN ? (e.META_PAGE_TOKEN ? "ok" : "warn") : "off", env: ["META_VERIFY_TOKEN", "META_APP_SECRET", "META_PAGE_TOKEN"], href: "/crm/messenger",
      details: ["Webhook: /api/webhooks/messenger (kiểm tra X-Hub-Signature-256)", e.META_PAGE_TOKEN ? "Gửi trả lời: bật" : "Chưa có page token — trả lời chỉ lưu nội bộ"] },
    { key: "zalo_oa", name: "Zalo OA (tin tư vấn)", purpose: "Nhận / trả lời tin nhắn Zalo OA trong khung 48 giờ", status: e.ZALO_APP_ID && e.ZALO_OA_SECRET ? (zaloToken ? "ok" : "warn") : "off", env: ["ZALO_APP_ID", "ZALO_OA_SECRET"], href: "/tin-nhan?channel=zalo",
      details: [
        "Webhook: /api/webhooks/zalo (kiểm tra X-ZEvent-Signature)",
        zaloToken ? "Gửi tin tư vấn: bật" : "Chưa có access token — trả lời chỉ lưu nội bộ",
        "Access token sống 25 giờ, hệ thống tự làm mới trước 2 giờ",
      ] },
    { key: "auth", name: "Supabase Auth", purpose: "Đăng nhập nhân sự / phụ huynh", status: e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "ok" : e.ALLOW_DEV_ACTOR === "1" ? "warn" : "off", env: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
      details: [e.ALLOW_DEV_ACTOR === "1" ? "Đang bật đăng nhập tài khoản mẫu (ALLOW_DEV_ACTOR=1) — TẮT ở production" : "Tài khoản mẫu đã tắt"] },
    { key: "storage", name: "Lưu trữ ảnh", purpose: "Ảnh lớp học (URL ký, hết hạn)", status: e.MEDIA_SIGNING_SECRET ? "ok" : "warn", env: ["STORAGE_DIR", "MEDIA_SIGNING_SECRET"],
      details: [`Thư mục: ${e.STORAGE_DIR ? "đã cấu hình" : ".data/uploads (mặc định)"}`, e.MEDIA_SIGNING_SECRET ? "Khoá ký URL: đã đặt" : "Khoá ký URL: đang dùng khoá dev"] },
    { key: "cron", name: "Worker / Cron", purpose: "Outbox, SLA lead, khảo sát tự động, email", status: (ob?.pending ?? 0) > 100 ? "warn" : e.CRON_SECRET ? "ok" : "warn", env: ["CRON_SECRET", "WORKER_INTERVAL_MS"],
      details: [`Outbox chờ: ${ob?.pending ?? 0}`, `Xử lý gần nhất: ${ob?.last ?? "chưa có"}`, e.CRON_SECRET ? "Route /api/cron/outbox có bảo vệ" : "CRON_SECRET chưa đặt — route cron đang mở"] },
    { key: "otp", name: "OTP", purpose: "Kích hoạt / quên mật khẩu", status: e.OTP_PEPPER ? "ok" : "warn", env: ["OTP_PEPPER"], href: "/otp-logs",
      details: [e.OTP_PEPPER ? "Khoá băm OTP: đã đặt" : "Khoá băm OTP: đang dùng khoá dev", `Giới hạn: ${OTP_POLICY.perPhoneMax} mã / ${OTP_POLICY.perPhoneWindowMin} phút mỗi SĐT`] },
    { key: "forms", name: "Form công khai", purpose: "Đăng ký học thử từ website", status: e.PUBLIC_FORM_ORIGINS ? "ok" : "warn", env: ["PUBLIC_FORM_ORIGINS"], href: "/crm/webhook-replay",
      details: [`Nguồn cho phép: ${e.PUBLIC_FORM_ORIGINS ?? "mặc định (satarobo.vn, localhost)"}`, `Sự kiện lỗi chờ chạy lại: ${wh?.failed ?? 0}`] },
  ];

  // Rate limit — ghi rõ đang đếm ở đâu
  const redis = e.UPSTASH_REDIS_REST_URL || e.REDIS_URL;
  items.push({
    key: "ratelimit", name: "Rate limit (chống spam / dò mật khẩu)", purpose: "Giới hạn lần gửi OTP, đăng nhập, form công khai, tin nhắn phụ huynh",
    status: redis ? "ok" : "warn", env: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "REDIS_URL"], href: "/cau-hinh-van-hanh?tab=otp",
    details: [
      redis ? "Kho đếm: Redis (Upstash) — dùng chung cho mọi phiên bản máy chủ" : "Kho đếm: Postgres cho OTP / đăng nhập (bảng otp_requests, login_events) + bộ nhớ tiến trình cho route công khai",
      redis ? "" : "Chưa có Redis: chạy nhiều phiên bản thì hạn mức route công khai đếm riêng từng phiên bản",
      `Hạn mức OTP hiện hành: ${OTP_POLICY.perPhoneMax} mã / ${OTP_POLICY.perPhoneWindowMin} phút mỗi SĐT · ${OTP_POLICY.perIpMax} mã / giờ mỗi IP`,
    ].filter(Boolean),
  });

  // MISA AMIS (kế toán)
  const misaReady = !!(e.MISA_CLIENT_ID && e.MISA_CLIENT_SECRET && e.MISA_API_URL);
  items.push({
    key: "misa", name: "MISA AMIS (kế toán)", purpose: "Đẩy phiếu thu / hoá đơn sang phần mềm kế toán",
    status: misaReady ? "ok" : "off", env: ["MISA_CLIENT_ID", "MISA_CLIENT_SECRET", "MISA_API_URL"], href: "/hoa-don",
    details: misaReady
      ? [`Điểm cuối: ${e.MISA_API_URL}`, "Đồng bộ chạy theo lô cùng hàng đợi hoá đơn điện tử"]
      : ["Chưa cấu hình — phiếu thu và hoá đơn hiện chỉ lưu trong hệ thống", "Thiếu credential thì dừng an toàn: không gọi ra ngoài, không mất dữ liệu"],
  });

  for (const it of items) {
    if (it.key === "email") it.test = "email";
    if (it.key === "zns") it.test = "zns";
  }

  // Bảng log lỗi nhà cung cấp gần nhất (email · ZNS/SMS · webhook)
  const [emailErr, znsErr, whErr] = await Promise.all([
    ctx.db.select({ at: emailLogs.createdAt, target: emailLogs.toEmail, ref: emailLogs.eventKey, error: emailLogs.error, provider: emailLogs.provider })
      .from(emailLogs).where(and(eq(emailLogs.status, "failed"), sql`${emailLogs.error} is not null`)).orderBy(desc(emailLogs.createdAt)).limit(10),
    ctx.db.select({ at: parentNotifications.createdAt, target: parentNotifications.template, ref: parentNotifications.channel, error: parentNotifications.error, providerRef: parentNotifications.providerRef })
      .from(parentNotifications).where(and(eq(parentNotifications.status, "failed"), sql`${parentNotifications.error} is not null`)).orderBy(desc(parentNotifications.createdAt)).limit(10),
    ctx.db.select({ at: webhookEvents.receivedAt, source: webhookEvents.source, status: webhookEvents.status, httpStatus: webhookEvents.httpStatus, error: webhookEvents.error })
      .from(webhookEvents).where(inArray(webhookEvents.status, ["failed", "rejected"])).orderBy(desc(webhookEvents.receivedAt)).limit(10),
  ]);
  const providerErrors = [
    ...emailErr.map((r) => ({ at: r.at, provider: r.provider ?? "email", target: r.target, code: r.ref, message: r.error ?? "" })),
    ...znsErr.map((r) => ({ at: r.at, provider: r.ref, target: r.target, code: r.providerRef ?? "—", message: r.error ?? "" })),
    ...whErr.map((r) => ({ at: r.at, provider: r.source, target: r.status, code: r.httpStatus ? String(r.httpStatus) : "—", message: r.error ?? "" })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 20);

  return { items, providerErrors };
}

export async function getSettings(db: Db): Promise<AppSettings> {
  const r = await db.query.appSettings.findFirst({ where: eq(appSettings.key, "general") });
  return { ...SETTINGS_DEFAULTS, ...((r?.value ?? {}) as Partial<AppSettings>) };
}

export async function settingsForAdmin(ctx: ProtectedContext) {
  requirePermission(ctx, "system:read");
  const r = await ctx.db.select({ s: appSettings, byName: users.fullName }).from(appSettings).leftJoin(users, eq(users.id, appSettings.updatedBy)).where(eq(appSettings.key, "general"));
  return { settings: await getSettings(ctx.db), updatedAt: r[0]?.s.updatedAt ?? null, updatedBy: r[0]?.byName ?? null, canEdit: hasRole(ctx.actor, "SUPER_ADMIN") };
}

export async function saveSettings(ctx: ProtectedContext, input: AppSettings) {
  requirePermission(ctx, "system:update");
  const v: AppSettings = Object.fromEntries(Object.keys(SETTINGS_DEFAULTS).map((k) => [k, String((input as unknown as Record<string, unknown>)[k] ?? "").trim()])) as unknown as AppSettings;
  const errs = validateSettings(v);
  if (errs.length) throw bad(errs);
  const before = await getSettings(ctx.db);
  await ctx.db.insert(appSettings).values({ key: "general", value: v, updatedBy: ctx.user.id }).onConflictDoUpdate({ target: appSettings.key, set: { value: v, updatedBy: ctx.user.id, updatedAt: new Date() } });
  const changed = Object.keys(v).filter((k) => (before as unknown as Record<string, string>)[k] !== (v as unknown as Record<string, string>)[k]);
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "system", entity: "app_settings", entityId: null, after: { changed }, ip: ctx.ip });
  return { ok: true, changed };
}

/** Cho mọi nhân sự: thông tin hiển thị (tên, hotline, chân phiếu thu) */
export async function publicSettings(ctx: ProtectedContext) {
  const s = await getSettings(ctx.db);
  return { brandName: s.brandName, legalName: s.legalName, hotline: s.hotline, supportEmail: s.supportEmail, website: s.website, taxCode: s.taxCode, receiptFooter: s.receiptFooter, headOfficeAddress: s.headOfficeAddress };
}

