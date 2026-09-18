/**
 * Cổng gửi thông báo nội bộ — mọi `notify(` / `notifyUsers(` trong hệ thống đi qua đây.
 *
 * Việc của file này:
 *  1. tra **danh mục loại thông báo** (bảng `notification_types`, mặc định trong `@satarobo/core`)
 *     để quyết định mức ưu tiên và **có đẩy (push) hay không** — loại chưa khai báo thì vẫn gửi
 *     trong app nhưng không đẩy;
 *  2. chống tạo trùng theo `dedupeKey` (dùng cho thông báo sinh tự động "Cần thực hiện").
 */
import { and, desc, eq, gte, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { userNotifications, notificationTypes, users, userRoles, bankTransactions, campaigns, campaignSpends, type Database } from "@satarobo/db";
import {
  decideDelivery, authorizeGlobal, buildActionAlerts, marketingReportOverdue, previousPeriod, notificationTypeDef, notificationLabel,
  validateNotificationTypeReason, priorityFromRank,
  NOTIFICATION_TYPES, NOTIFICATION_GROUPS, NOTIFICATION_PRIORITY_RANK, NOTIFICATION_PRIORITY_VI,
  type NotificationTypeRow, type NotificationPriority,
} from "@satarobo/core";
import type { ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";

type Db = ProtectedContext["db"];
const asDb = (d: Db | Database) => d as unknown as Db;

/** Bộ nhớ đệm ngắn cho danh mục — tránh một truy vấn mỗi lần gửi thông báo */
let cache: { at: number; rows: Map<string, NotificationTypeRow> } | null = null;
const CACHE_MS = 60_000;

export function invalidateNotificationCatalog() {
  cache = null;
}

export async function notificationCatalog(db: Db | Database): Promise<Map<string, NotificationTypeRow>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  try {
    const rows = await asDb(db)
      .select({ prefix: notificationTypes.prefix, pushEnabled: notificationTypes.pushEnabled, isActive: notificationTypes.isActive })
      .from(notificationTypes);
    cache = { at: Date.now(), rows: new Map(rows.map((r) => [r.prefix, r])) };
  } catch {
    // Chưa chạy migration bảng danh mục → rơi về mặc định trong core; thông báo không bao giờ bị mất
    cache = { at: Date.now(), rows: new Map() };
  }
  return cache.rows;
}

export interface NotifyPayload {
  title: string;
  body?: string | null;
  link?: string | null;
  /** Mức ưu tiên dự phòng khi loại chưa khai báo (1 cao nhất) */
  priority?: number;
  /** Mã loại trong danh mục, vd `lead.moi` */
  type?: string | null;
  /** Không tạo lại nếu người đó đã có thông báo cùng khoá này */
  dedupeKey?: string | null;
}

/**
 * Ghi thông báo trong app cho danh sách người dùng. Trả về số dòng đã ghi và quyết định đẩy.
 * Gọi trong cùng transaction với nghiệp vụ (truyền `tx` vào) như các helper cũ.
 */
export async function deliverNotifications(db: Db | Database, userIds: (string | null | undefined)[], x: NotifyPayload) {
  const d = asDb(db);
  let ids = [...new Set(userIds.filter((u): u is string => !!u))];
  if (!ids.length) return { inserted: 0, push: false, priority: x.priority ?? 2 };

  const decision = decideDelivery(x.type, (await notificationCatalog(d)).get(x.type ?? "") ?? null, x.priority ?? 2);

  if (x.dedupeKey) {
    const existing = await d
      .select({ userId: userNotifications.userId })
      .from(userNotifications)
      .where(and(inArray(userNotifications.userId, ids), eq(userNotifications.dedupeKey, x.dedupeKey)));
    const had = new Set(existing.map((e) => e.userId));
    ids = ids.filter((i) => !had.has(i));
    if (!ids.length) return { inserted: 0, push: false, priority: decision.priority };
  }

  await d.insert(userNotifications).values(
    ids.map((userId) => ({
      userId,
      title: x.title,
      body: x.body ?? null,
      link: x.link ?? null,
      priority: decision.priority,
      type: x.type ?? null,
      dedupeKey: x.dedupeKey ?? null,
    })),
  );
  return { inserted: ids.length, push: decision.push, priority: decision.priority };
}

/** Dạng gọn cho các service: `notifyTyped(db, "lead.moi", ids, "Tiêu đề", "Nội dung", "/leads")` */
export async function notifyTyped(
  db: Db | Database,
  type: string | null,
  userIds: (string | null | undefined)[],
  title: string,
  body: string,
  link: string,
  priority = 2,
) {
  return deliverNotifications(db, userIds, { title, body, link, priority, type });
}

/* ------------------------------------------------------------------ */
/* Danh mục: đọc & lưu (tab trong Cấu hình vận hành)                   */
/* ------------------------------------------------------------------ */

/** Danh mục hiệu lực = mặc định trong core, ghi đè bằng dòng trong CSDL */
export async function effectiveCatalog(db: Db | Database) {
  const rows = await asDb(db).select().from(notificationTypes);
  const byPrefix = new Map(rows.map((r) => [r.prefix, r]));
  return NOTIFICATION_TYPES.map((def) => {
    const row = byPrefix.get(def.prefix);
    return {
      prefix: def.prefix,
      label: row?.label ?? def.label,
      groupKey: row?.groupKey ?? def.groupKey,
      priority: (row?.priority ?? def.priority) as (typeof def)["priority"],
      recipients: (row?.recipients as string[] | undefined) ?? [...def.recipients],
      pushEnabled: row?.pushEnabled ?? def.pushEnabled,
      isActive: row?.isActive ?? true,
      configured: !!row,
    };
  });
}

/** Số dòng thông báo chưa đọc theo loại — dùng cho bộ lọc ở /thong-bao */
export async function unreadByType(db: Db | Database, userId: string) {
  return asDb(db)
    .select({ type: userNotifications.type, n: sql<number>`count(*)::int` })
    .from(userNotifications)
    .where(and(eq(userNotifications.userId, userId), isNull(userNotifications.readAt)))
    .groupBy(userNotifications.type);
}

/** Lưu cấu hình một loại thông báo — đổi BẮT BUỘC ghi lý do (giống mọi tab Cấu hình vận hành) */
export async function saveNotificationType(ctx: ProtectedContext, input: { prefix: string; pushEnabled: boolean; isActive: boolean; reason: string }) {
  if (!authorizeGlobal(ctx.actor, "system:configure")) throw new TRPCError({ code: "FORBIDDEN", message: "Chỉ quản trị Hội sở đổi danh mục thông báo" });
  const err = validateNotificationTypeReason(input.reason);
  if (err) throw new TRPCError({ code: "BAD_REQUEST", message: err });
  const def = notificationTypeDef(input.prefix);
  if (!def) throw new TRPCError({ code: "NOT_FOUND", message: `Không có loại thông báo ${input.prefix}` });

  return ctx.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const [cur] = await db.select().from(notificationTypes).where(eq(notificationTypes.prefix, input.prefix)).limit(1);
    const before = cur ? { pushEnabled: cur.pushEnabled, isActive: cur.isActive } : { pushEnabled: def.pushEnabled, isActive: true };
    const after = { pushEnabled: input.pushEnabled, isActive: input.isActive };
    if (before.pushEnabled === after.pushEnabled && before.isActive === after.isActive) return { changed: false };

    const values = {
      prefix: def.prefix, label: def.label, groupKey: def.groupKey, groupLabel: NOTIFICATION_GROUPS[def.groupKey],
      priority: def.priority, recipients: [...def.recipients], ...after, updatedBy: ctx.user.id,
    };
    await db.insert(notificationTypes).values(values)
      .onConflictDoUpdate({ target: notificationTypes.prefix, set: { ...after, updatedBy: ctx.user.id, updatedAt: new Date() } });
    await writeAudit(db, { actorId: ctx.user.id, action: "UPDATE", module: "system", entity: "notification_types", entityId: null, before, after: { prefix: def.prefix, ...after }, reason: input.reason.trim(), ip: ctx.ip });
    invalidateNotificationCatalog();
    return { changed: true };
  });
}

/* ------------------------------------------------------------------ */
/* Trung tâm thông báo /thong-bao                                      */
/* ------------------------------------------------------------------ */

const PAGE = 30;

/** Hôm nay / Hôm qua / Cũ hơn theo giờ Việt Nam */
function bucketOf(at: Date, todayVn: string): "today" | "yesterday" | "older" {
  const d = new Date(at.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
  if (d === todayVn) return "today";
  const y = new Date(new Date(`${todayVn}T00:00:00Z`).getTime() - 86400e3).toISOString().slice(0, 10);
  return d === y ? "yesterday" : "older";
}

export interface NotificationCenterInput {
  groupKey?: string;
  priority?: NotificationPriority;
  q?: string;
  unreadOnly?: boolean;
  page?: number;
}

/** Danh sách mọi thông báo của người đang đăng nhập — lọc theo nhóm / mức / từ khoá, có "Tải thêm" */
export async function notificationCenter(ctx: ProtectedContext, input: NotificationCenterInput) {
  const page = Math.max(1, input.page ?? 1);
  const conds = [eq(userNotifications.userId, ctx.user.id)];
  if (input.unreadOnly) conds.push(isNull(userNotifications.readAt));
  if (input.priority) conds.push(eq(userNotifications.priority, NOTIFICATION_PRIORITY_RANK[input.priority]));
  if (input.groupKey) {
    const prefixes = NOTIFICATION_TYPES.filter((t) => t.groupKey === input.groupKey).map((t) => t.prefix);
    conds.push(prefixes.length ? inArray(userNotifications.type, prefixes) : sql`false`);
  }
  const q = (input.q ?? "").trim();
  if (q.length >= 2) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conds.push(or(ilike(userNotifications.title, like), ilike(userNotifications.body, like))!);
  }
  const where = and(...conds);

  const rows = await ctx.db.select().from(userNotifications).where(where)
    .orderBy(desc(userNotifications.createdAt)).limit(PAGE + 1).offset((page - 1) * PAGE);
  const hasMore = rows.length > PAGE;
  const items = rows.slice(0, PAGE);

  const [counts] = await ctx.db
    .select({
      total: sql<number>`count(*)::int`,
      unread: sql<number>`count(*) filter (where ${userNotifications.readAt} is null)::int`,
      urgent: sql<number>`count(*) filter (where ${userNotifications.priority} = 1 and ${userNotifications.readAt} is null)::int`,
      actionRequired: sql<number>`count(*) filter (where ${userNotifications.type} = 'action_required' and ${userNotifications.readAt} is null)::int`,
    })
    .from(userNotifications).where(eq(userNotifications.userId, ctx.user.id));

  const todayVn = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  return {
    page, pageSize: PAGE, hasMore, counts: counts ?? { total: 0, unread: 0, urgent: 0, actionRequired: 0 },
    items: items.map((n) => ({
      id: n.id, title: n.title, body: n.body, link: n.link, readAt: n.readAt, createdAt: n.createdAt,
      type: n.type, typeLabel: notificationLabel(n.type),
      groupKey: notificationTypeDef(n.type)?.groupKey ?? null,
      groupLabel: notificationTypeDef(n.type) ? NOTIFICATION_GROUPS[notificationTypeDef(n.type)!.groupKey] : "Khác",
      priority: priorityFromRank(n.priority),
      priorityLabel: NOTIFICATION_PRIORITY_VI[priorityFromRank(n.priority)],
      bucket: bucketOf(n.createdAt, todayVn),
      actionRequired: n.type === "action_required",
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Job rà "Cần thực hiện"                                              */
/* ------------------------------------------------------------------ */

/** Người nhận cảnh báo theo vai trò khai trong danh mục */
async function recipientsFor(db: Db, prefix: string) {
  const def = notificationTypeDef(prefix);
  const roles = (def?.recipients ?? []) as string[];
  if (!roles.length) return [];
  const rows = await db.select({ id: users.id }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(inArray(userRoles.role, roles as never[]), eq(users.isActive, true)));
  return [...new Set(rows.map((r) => r.id))];
}

/**
 * Job rà soát sinh thông báo loại "Cần thực hiện" — gọi được từ cron sẵn có.
 * Không tạo trùng trong cùng ngày (khoá `dedupeKey` gắn ngày).
 */
export async function buildActionRequiredAlerts(database: Database) {
  const db = asDb(database);
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

  // 1) Giao dịch tiền vào chưa rót được vào phiếu thu nào
  const [bank] = await db
    .select({ count: sql<number>`count(*)::int`, amount: sql<number>`coalesce(sum(${bankTransactions.amount}), 0)::bigint` })
    .from(bankTransactions)
    .where(and(
      eq(bankTransactions.direction, "in"),
      inArray(bankTransactions.status, ["unmatched", "needs_review"]),
      isNull(bankTransactions.paymentId),
    ));

  // 2) & 3) Marketing: kỳ trước đã quá ngày chốt
  const period = previousPeriod(today);
  const periodStart = `${period}-01`;
  // ngày đầu của kỳ kế tiếp — tránh dựng ngày không tồn tại kiểu "2026-02-31"
  const periodEndExclusive = `${today.slice(0, 7)}-01`;
  const missingMarketingPeriods: string[] = [];
  const openMarketingSpendPeriods: string[] = [];
  if (marketingReportOverdue(today)) {
    const running = await db.select({ id: campaigns.id }).from(campaigns)
      .where(and(lt(campaigns.startDate, periodEndExclusive), or(isNull(campaigns.endDate), gte(campaigns.endDate, periodStart))!));
    if (running.length) {
      const spends = await db.select({ campaignId: campaignSpends.campaignId }).from(campaignSpends)
        .where(and(gte(campaignSpends.date, periodStart), lt(campaignSpends.date, periodEndExclusive)));
      const reported = new Set(spends.map((s) => s.campaignId));
      if (reported.size === 0) missingMarketingPeriods.push(period);
      else if (running.some((c) => !reported.has(c.id))) openMarketingSpendPeriods.push(period);
    }
  }

  const alerts = buildActionAlerts({
    today,
    bankUnallocated: { count: bank?.count ?? 0, amount: Number(bank?.amount ?? 0) },
    missingMarketingPeriods,
    openMarketingSpendPeriods,
  });
  if (!alerts.length) return { created: 0, alerts: 0 };

  const targets = await recipientsFor(db, "action_required");
  if (!targets.length) return { created: 0, alerts: alerts.length };

  let created = 0;
  for (const a of alerts) {
    const r = await deliverNotifications(db, targets, {
      title: a.title, body: a.body, link: a.link, type: "action_required", dedupeKey: a.dedupeKey, priority: 1,
    });
    created += r.inserted;
  }
  return { created, alerts: alerts.length };
}
