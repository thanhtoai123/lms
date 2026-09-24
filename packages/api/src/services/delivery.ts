import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, sql, desc, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { appSettings, parentNotifications, parents, students, type Database } from "@satarobo/db";
import {
  authorizeGlobal, hasPermission, validateDeliverySettings, buildZnsData, renderSms, znsPhone, quietHours, failureRetryable, retryDelayMinutes, stripDiacritics, maskPhone,
  DELIVERY_DEFAULTS, DELIVERY_EVENTS, DELIVERY_EVENT_VI, DELIVERY_VARS, MAX_DELIVERY_ATTEMPTS, consentBlock,
  type DeliverySettings, type DeliveryEvent, type DeliveryFailure,
} from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { accessTokenZalo } from "./zaloToken";
import { writeAudit } from "./audit";

type Db = ProtectedContext["db"];
const asDb = (d: Database) => d as unknown as Db;
const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });
const forbid = (m: string) => new TRPCError({ code: "FORBIDDEN", message: m });

export async function deliverySettings(db: Db): Promise<DeliverySettings> {
  const r = await db.query.appSettings.findFirst({ where: eq(appSettings.key, "delivery") });
  const v = (r?.value ?? {}) as Partial<DeliverySettings>;
  return {
    ...DELIVERY_DEFAULTS, ...v,
    zns: { ...DELIVERY_DEFAULTS.zns, ...(v.zns ?? {}) },
    sms: { ...DELIVERY_DEFAULTS.sms, ...(v.sms ?? {}), templates: { ...DELIVERY_DEFAULTS.sms.templates, ...(v.sms?.templates ?? {}) } },
  };
}

const envState = () => ({
  production: process.env.NODE_ENV === "production",
  znsToken: !!process.env.ZALO_ZNS_TOKEN,
  smsApi: !!(process.env.SMS_API_URL && process.env.SMS_API_KEY),
  allowSandbox: process.env.DELIVERY_ALLOW_SANDBOX === "1",
});
const sandboxBlocked = () => envState().production && !envState().allowSandbox;

/* ------------------------------------------------------------------ */
/* Nhà cung cấp                                                         */
/* ------------------------------------------------------------------ */

export type SendResult =
  | { ok: true; ref: string; quota?: { daily: number; remaining: number } }
  | { ok: false; failure: DeliveryFailure; error: string };

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<{ status: number; json: Record<string, unknown> } | null> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    return { status: r.status, json: ((await r.json().catch(() => ({}))) ?? {}) as Record<string, unknown> };
  } catch {
    return null;
  }
}

/** Zalo ZNS gửi theo SĐT (API "message/template" — ZNS_API_URL cho phép đổi endpoint khi Zalo cập nhật) */
async function sendZns(db: Db, mode: DeliverySettings["zns"]["mode"], phone: string, templateId: string, data: Record<string, string>, trackingId: string): Promise<SendResult> {
  if (mode === "sandbox") {
    if (sandboxBlocked()) return { ok: false, failure: { kind: "provider", code: "sandbox" }, error: "Chế độ giả lập bị chặn ở production" };
    if (phone.endsWith("0000000")) return { ok: false, failure: { kind: "provider", code: -118 }, error: "Giả lập: số không dùng Zalo" };
    return { ok: true, ref: `SBX-ZNS-${trackingId.slice(0, 8)}` };
  }
  // ZNS đã hợp nhất vào ZBS Template Message (01/01/2026) và dùng CHUNG access token của OA:
  // ưu tiên token trong CSDL (tự làm mới), chưa khai báo thì về biến môi trường cũ.
  const token = (await accessTokenZalo(db as unknown as Database)) ?? process.env.ZALO_ZNS_TOKEN;
  if (!token) return { ok: false, failure: { kind: "provider", code: "config" }, error: "Chưa khai báo Zalo OA (Tích hợp → Zalo OA) hoặc ZALO_ZNS_TOKEN" };
  const url = process.env.ZNS_API_URL || "https://business.openapi.zalo.me/message/template";
  const r = await postJson(url, { access_token: token }, { phone, template_id: templateId, template_data: data, tracking_id: trackingId });
  if (!r) return { ok: false, failure: { kind: "network" }, error: "Không kết nối được Zalo" };
  if (r.status >= 400) return { ok: false, failure: { kind: "http", status: r.status }, error: `Zalo HTTP ${r.status}` };
  const code = Number(r.json.error ?? -1);
  if (code !== 0) return { ok: false, failure: { kind: "provider", code }, error: `Zalo lỗi ${code}: ${String(r.json.message ?? "").slice(0, 200)}` };
  // Từ 2026 Zalo trả kèm hạn mức ngày của OA — ghi lại để màn hình cảnh báo trước khi cạn quota
  const d = (r.json.data ?? {}) as { msg_id?: string; quota?: { dailyQuota?: string; remainingQuota?: string } };
  return { ok: true, ref: d.msg_id ?? trackingId, quota: d.quota ? { daily: Number(d.quota.dailyQuota ?? 0), remaining: Number(d.quota.remainingQuota ?? 0) } : undefined };
}

/** SMS brandname qua cổng HTTP chung: POST SMS_API_URL {to, brandname, text, ref} → {id} */
async function sendSms(mode: DeliverySettings["sms"]["mode"], brandname: string, phone: string, text: string, ref: string): Promise<SendResult> {
  if (mode === "sandbox") {
    if (sandboxBlocked()) return { ok: false, failure: { kind: "provider", code: "sandbox" }, error: "Chế độ giả lập bị chặn ở production" };
    return { ok: true, ref: `SBX-SMS-${ref.slice(0, 8)}` };
  }
  const url = process.env.SMS_API_URL;
  const key = process.env.SMS_API_KEY;
  if (!url || !key) return { ok: false, failure: { kind: "provider", code: "config" }, error: "Chưa cấu hình SMS_API_URL / SMS_API_KEY" };
  const r = await postJson(url, { Authorization: `Bearer ${key}`, "Idempotency-Key": ref }, { to: phone, brandname: brandname.trim(), text, ref });
  if (!r) return { ok: false, failure: { kind: "network" }, error: "Không kết nối được cổng SMS" };
  if (r.status >= 400) return { ok: false, failure: { kind: "http", status: r.status }, error: `SMS HTTP ${r.status}: ${String(r.json.error ?? "").slice(0, 200)}` };
  return { ok: true, ref: String(r.json.id ?? ref) };
}

/* ------------------------------------------------------------------ */
/* OTP                                                                  */
/* ------------------------------------------------------------------ */

/** Gửi OTP ngay (không theo giờ yên lặng): ZNS trước, SMS dự phòng. Trả kênh đã gửi hoặc null */
export async function sendOtpMessage(db: Database, input: { phone: string; code: string; minutes: number; requestId: string }): Promise<{ channel: "zns" | "sms" | null; error: string | null }> {
  const s = await deliverySettings(asDb(db));
  const vars = { otp: input.code, phut: String(input.minutes) };
  const to = znsPhone(input.phone);
  if (!to) return { channel: null, error: "SĐT không hợp lệ" };
  let err: string | null = null;
  const tpl = s.zns.templates.OTP;
  if (s.zns.mode !== "off" && tpl) {
    const z = buildZnsData(tpl, vars);
    const r = await sendZns(asDb(db), s.zns.mode, to, tpl.templateId, z.data, input.requestId);
    if (r.ok) return { channel: "zns", error: null };
    err = r.error;
  }
  const smsTpl = s.sms.templates.OTP;
  if (s.sms.mode !== "off" && smsTpl && (s.sms.fallback || s.zns.mode === "off" || !tpl)) {
    const r = await sendSms(s.sms.mode, s.sms.brandname, to, renderSms(smsTpl, vars).text, input.requestId);
    if (r.ok) return { channel: "sms", error: null };
    err = [err, r.error].filter(Boolean).join(" · ");
  }
  return { channel: null, error: err ?? "Chưa bật kênh gửi OTP (Cấu hình vận hành → Tin Zalo)" };
}

export function otpDeliveryReady(s: DeliverySettings) {
  return (s.zns.mode !== "off" && !!s.zns.templates.OTP) || (s.sms.mode !== "off" && !!s.sms.templates.OTP);
}

/* ------------------------------------------------------------------ */
/* Hàng đợi thông báo phụ huynh                                         */
/* ------------------------------------------------------------------ */

function eventOf(template: string): DeliveryEvent {
  return (DELIVERY_EVENTS as readonly string[]).includes(template) ? (template as DeliveryEvent) : "BROADCAST";
}


/**
 * NHẬN MỘT LÔ TIN CHỜ GỬI — có khoá dòng.
 *
 * Trước đây worker chỉ `select ... limit 100`: chạy hai worker (hoặc worker + cron) là cùng đọc
 * đúng một lô và **gửi trùng tin ZNS mất tiền thật**. Nay nhận việc bằng `for update skip locked`
 * trong một transaction rồi đẩy `next_attempt_at` ra `visibilityMs`, nên:
 *  - worker khác bỏ qua lô đang giữ thay vì xếp hàng chờ;
 *  - nếu tiến trình chết giữa chừng, lô tự quay lại hàng đợi sau khoảng đó chứ không kẹt vĩnh viễn.
 * Cùng cách làm với `claimOutboxBatch` của rule engine.
 */
async function nhanLoTinCho(db: Db, channels: ("zns" | "sms")[], limit: number, now: Date, visibilityMs: number): Promise<string[]> {
  return db.transaction(async (tx) => {
    const picked = (await tx.execute(sql`
      select id from ${parentNotifications}
       where status = 'queued'
         and channel = any(string_to_array(${channels.join(",")}, ',')::text[]::notification_channel[])
         and (next_attempt_at is null or next_attempt_at <= ${now})
       order by created_at
       limit ${limit}
       for update skip locked
    `)) as unknown as { id: string }[];
    const ids = picked.map((r) => r.id);
    if (!ids.length) return [];
    await tx.update(parentNotifications).set({ nextAttemptAt: new Date(now.getTime() + visibilityMs) }).where(inArray(parentNotifications.id, ids));
    return ids;
  });
}

/** Gửi các tin ZNS / SMS đang chờ. Gọi từ worker / cron. */
export async function dispatchParentMessages(database: Database, opts: { limit?: number; now?: Date } = {}) {
  const db = asDb(database);
  const s = await deliverySettings(db);
  const now = opts.now ?? new Date();
  const res = { sent: 0, failed: 0, retried: 0, fallback: 0, deferred: 0, skipped: 0 };
  const channels = [...(s.zns.mode !== "off" ? ["zns" as const] : []), ...(s.sms.mode !== "off" ? ["sms" as const] : [])];
  if (!channels.length) return res;
  const q = quietHours(now, s.quietStart, s.quietEnd);
  // Một lô phải gửi xong trong vài phút; quá thì coi như tiến trình chết và trả việc lại hàng đợi
  const ids = await nhanLoTinCho(db, channels, opts.limit ?? 100, now, 5 * 60_000);
  if (!ids.length) return res;
  const rows = await db.select({ n: parentNotifications, phone: parents.phone, parentName: parents.fullName, optOut: parents.marketingOptOut, restricted: parents.processingRestricted, studentName: students.fullName })
    .from(parentNotifications).innerJoin(parents, eq(parents.id, parentNotifications.parentId)).leftJoin(students, eq(students.id, parentNotifications.studentId))
    .where(inArray(parentNotifications.id, ids))
    .orderBy(parentNotifications.createdAt);
  const dayStart = new Date(`${new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10)}T00:00:00+07:00`);
  /*
   * Số tin đã gửi hôm nay cho từng phụ huynh (trần chống làm phiền).
   * Trước: 1 truy vấn `count(*)` CHO MỖI dòng trong lô — lô 100 tin là 100 truy vấn thừa mỗi
   *        nhịp worker (10 giây/lần).
   * Sau:  1 truy vấn `group by parent_id` cho cả lô, rồi cộng dồn tại chỗ khi gửi thành công —
   *       giữ nguyên hành vi cũ: phụ huynh có 2 tin trong cùng lô vẫn bị chặn ở tin thứ hai.
   */
  const parentIds = [...new Set(rows.map((r) => r.n.parentId))];
  const sentToday = new Map<string, number>();
  if (parentIds.length) {
    const counted = await db
      .select({ parentId: parentNotifications.parentId, c: sql<number>`count(*)::int` })
      .from(parentNotifications)
      .where(and(
        inArray(parentNotifications.parentId, parentIds),
        inArray(parentNotifications.channel, ["zns", "sms"]),
        eq(parentNotifications.status, "sent"),
        gte(parentNotifications.sentAt, dayStart),
      ))
      .groupBy(parentNotifications.parentId);
    for (const r of counted) sentToday.set(r.parentId, r.c);
  }
  for (const { n, phone, parentName, optOut, restricted, studentName } of rows) {
    const ev = eventOf(n.template);
    // Đồng ý nhận tin: "hạn chế xử lý dữ liệu" chặn tất; "từ chối tiếp thị" chỉ chặn thông báo chung.
    // Trước đây cột optOut có đọc lên nhưng KHÔNG dùng — phụ huynh đã từ chối vẫn nhận tin quảng bá.
    const chan = consentBlock(ev, { optOut, restricted });
    if (chan) {
      await db.update(parentNotifications).set({ status: "failed", error: chan }).where(eq(parentNotifications.id, n.id));
      res.skipped++;
      continue;
    }
    if (q.quiet) {
      await db.update(parentNotifications).set({ nextAttemptAt: q.resumeAt }).where(eq(parentNotifications.id, n.id));
      res.deferred++;
      continue;
    }
    if ((sentToday.get(n.parentId) ?? 0) >= s.maxPerParentPerDay) {
      await db.update(parentNotifications).set({ nextAttemptAt: new Date(dayStart.getTime() + 86_400_000 + 7 * 3600_000) }).where(eq(parentNotifications.id, n.id));
      res.deferred++;
      continue;
    }
    const vars: Record<string, string> = { ten_ph: parentName, ten_hv: studentName ?? "", tieu_de: n.title, noi_dung: n.body, ...(n.params ?? {}) };
    const to = znsPhone(phone);
    let result: SendResult;
    if (!to) result = { ok: false, failure: { kind: "provider", code: "phone" }, error: "SĐT không hợp lệ" };
    else if (n.channel === "zns") {
      const tpl = s.zns.templates[ev];
      if (!tpl) result = { ok: false, failure: { kind: "provider", code: "template" }, error: `Chưa khai báo mẫu ZNS cho "${DELIVERY_EVENT_VI[ev]}"` };
      else {
        const z = buildZnsData(tpl, vars);
        result = z.missing.length ? { ok: false, failure: { kind: "provider", code: "params" }, error: `Thiếu biến ${z.missing.join(", ")}` } : await sendZns(db, s.zns.mode, to, tpl.templateId, z.data, n.id);
      }
    } else {
      const tpl = s.sms.templates[ev];
      const text = tpl ? renderSms(tpl, vars) : { text: stripDiacritics(`Sata Robo: ${n.title}. ${n.body}`).slice(0, 300), missing: [] };
      result = text.missing.length ? { ok: false, failure: { kind: "provider", code: "params" }, error: `Thiếu biến ${text.missing.join(", ")}` } : await sendSms(s.sms.mode, s.sms.brandname, to, text.text, n.id);
    }
    if (result.ok) {
      await db.update(parentNotifications).set({ status: "sent", sentAt: new Date(), providerRef: result.ref, error: null, attempts: n.attempts + 1, nextAttemptAt: null }).where(eq(parentNotifications.id, n.id));
      // Cộng dồn tại chỗ để trần "mỗi phụ huynh mỗi ngày" vẫn đúng trong cùng một lô
      sentToday.set(n.parentId, (sentToday.get(n.parentId) ?? 0) + 1);
      res.sent++;
      continue;
    }
    const attempts = n.attempts + 1;
    if (failureRetryable(result.failure) && attempts < MAX_DELIVERY_ATTEMPTS) {
      await db.update(parentNotifications).set({ attempts, error: result.error, nextAttemptAt: new Date(now.getTime() + retryDelayMinutes(attempts) * 60_000) }).where(eq(parentNotifications.id, n.id));
      res.retried++;
      continue;
    }
    await db.update(parentNotifications).set({ status: "failed", attempts, error: result.error, nextAttemptAt: null }).where(eq(parentNotifications.id, n.id));
    res.failed++;
    const configError = result.failure.kind === "provider" && ["template", "params", "config", "sandbox"].includes(String(result.failure.code));
    if (n.channel === "zns" && s.sms.fallback && s.sms.mode !== "off" && !configError && !n.fallbackOf) {
      await db.insert(parentNotifications).values({
        parentId: n.parentId, studentId: n.studentId, channel: "sms", template: n.template, title: n.title, body: n.body, link: n.link, params: n.params,
        status: "queued", broadcastId: n.broadcastId, createdBy: n.createdBy, fallbackOf: n.id,
      });
      res.fallback++;
    }
  }
  return res;
}

/* ------------------------------------------------------------------ */
/* Quản trị                                                             */
/* ------------------------------------------------------------------ */

export async function getDeliveryConfig(ctx: ProtectedContext) {
  if (!hasPermission(ctx.actor, "system:read")) throw forbid("Không có quyền");
  const s = await deliverySettings(ctx.db);
  const since = new Date(Date.now() - 7 * 86_400_000);
  const stats = await ctx.db.select({ channel: parentNotifications.channel, status: parentNotifications.status, n: sql<number>`count(*)::int` })
    .from(parentNotifications).where(and(inArray(parentNotifications.channel, ["zns", "sms"]), gte(parentNotifications.createdAt, since)))
    .groupBy(parentNotifications.channel, parentNotifications.status);
  const errors = await ctx.db.select({ error: parentNotifications.error, channel: parentNotifications.channel, n: sql<number>`count(*)::int` })
    .from(parentNotifications).where(and(eq(parentNotifications.status, "failed"), inArray(parentNotifications.channel, ["zns", "sms"]), gte(parentNotifications.createdAt, since)))
    .groupBy(parentNotifications.error, parentNotifications.channel).orderBy(desc(sql`count(*)`)).limit(8);
  const env = envState();
  return {
    settings: s, env: { znsToken: env.znsToken, smsApi: env.smsApi, production: env.production, sandboxAllowed: !sandboxBlocked() },
    events: DELIVERY_EVENTS.map((e) => ({ key: e, label: DELIVERY_EVENT_VI[e], vars: DELIVERY_VARS[e] })),
    stats, errors, canEdit: authorizeGlobal(ctx.actor, "system:configure"), otpReady: otpDeliveryReady(s),
  };
}

export async function saveDeliveryConfig(ctx: ProtectedContext, input: DeliverySettings) {
  if (!authorizeGlobal(ctx.actor, "system:configure")) throw forbid("Chỉ quản trị Hội sở cấu hình kênh gửi");
  const clean: DeliverySettings = {
    ...input,
    zns: { mode: input.zns.mode, templates: Object.fromEntries(Object.entries(input.zns.templates).filter(([, t]) => t && t.templateId.trim()).map(([k, t]) => [k, { templateId: t!.templateId.trim(), params: t!.params }])) },
    sms: { ...input.sms, brandname: input.sms.brandname.trim(), templates: Object.fromEntries(Object.entries(input.sms.templates).filter(([, t]) => t && t.trim()).map(([k, t]) => [k, t!.trim()])) },
  };
  const errs = validateDeliverySettings(clean, envState());
  if (errs.length) throw bad(errs);
  const before = await deliverySettings(ctx.db);
  await ctx.db.insert(appSettings).values({ key: "delivery", value: clean as unknown as Record<string, unknown>, updatedBy: ctx.user.id })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: clean as unknown as Record<string, unknown>, updatedBy: ctx.user.id, updatedAt: new Date() } });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "system", entity: "app_settings", entityId: null, before: { delivery: { zns: before.zns.mode, sms: before.sms.mode } }, after: { delivery: { zns: clean.zns.mode, sms: clean.sms.mode, znsTemplates: Object.keys(clean.zns.templates) } }, ip: ctx.ip });
  return { ok: true };
}

/** Gửi thử một sự kiện tới SĐT nhập tay (dữ liệu mẫu) */
export async function testDelivery(ctx: ProtectedContext, input: { channel: "zns" | "sms"; event: DeliveryEvent; phone: string }) {
  if (!authorizeGlobal(ctx.actor, "system:configure")) throw forbid("Chỉ quản trị Hội sở");
  const s = await deliverySettings(ctx.db);
  const to = znsPhone(input.phone);
  if (!to) throw bad("SĐT không hợp lệ");
  const sample: Record<string, string> = { otp: "123456", phut: "5", ten_ph: "Phụ huynh", ten_hv: "Học viên", so_tien: "1.000.000đ", han: "20/09", ma_don: "DH26-000001", lop: "CS1.SATA4", ngay: "20/09", gio: "09:45", co_so: "CS1", nhan_xet: "Con tích cực", so_hd: "1", ky_hieu: "1C26TSR", ma_tra_cuu: "ABC123", moc: "Buổi 12", tieu_de: "Thông báo thử", noi_dung: "Nội dung thử" };
  const ref = randomUUID();
  let r: SendResult;
  if (input.channel === "zns") {
    const tpl = s.zns.templates[input.event];
    if (s.zns.mode === "off" || !tpl) throw bad("ZNS đang tắt hoặc chưa có mẫu cho sự kiện này");
    r = await sendZns(ctx.db, s.zns.mode, to, tpl.templateId, buildZnsData(tpl, sample).data, ref);
  } else {
    const tpl = s.sms.templates[input.event];
    if (s.sms.mode === "off" || !tpl) throw bad("SMS đang tắt hoặc chưa có nội dung cho sự kiện này");
    r = await sendSms(s.sms.mode, s.sms.brandname, to, renderSms(tpl, sample).text, ref);
  }
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "system", entity: "delivery_test", entityId: null, after: { channel: input.channel, event: input.event, to: maskPhone(to), ok: r.ok, phoneHash: createHash("sha256").update(to).digest("hex").slice(0, 12) }, ip: ctx.ip });
  return r.ok ? { ok: true as const, ref: r.ref } : { ok: false as const, error: r.error };
}
