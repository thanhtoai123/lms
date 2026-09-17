import { randomUUID } from "node:crypto";
import { and, eq, sql, desc, asc, or, ilike, lte, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  posts, siteBlocks, siteBlockHistory, siteMedia, campaigns, campaignSpends, trackEvents, appSettings, users, centers, type Database,
} from "@satarobo/db";
import {
  authorize, visibleCenterIds,
  slugify, validatePost, postTransition, readingMinutes, renderMarkdown, validateSiteBlock, SITE_PAGES, SITE_PAGE_KEYS,
  normUtm, channelOf, validateCampaign, campaignMetrics, validAnonId, POST_STATUS_VI, POST_CATEGORY_VI, CHANNEL_VI, TRACK_EVENTS,
  normalizeRange,
  type PostStatus, type PostCategory, type PostAction, type Channel, type TrackEvent, type SitePageKey,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { putObject } from "../storage";
import { todayISO } from "./sessions";

type Db = ProtectedContext["db"];
const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });
const pre = (m: string | string[]) => new TRPCError({ code: "PRECONDITION_FAILED", message: Array.isArray(m) ? m.join("; ") : m });
const notFound = (m: string) => new TRPCError({ code: "NOT_FOUND", message: m });
const asDb = (d: Database) => d as unknown as Db;
const PAGE = 30;

function rule<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if ((e as Error)?.name === "GrowthRuleError") throw pre((e as Error).message);
    throw e;
  }
}
async function rows<T>(db: Db, q: SQL): Promise<T[]> {
  return (await db.execute(q)) as unknown as T[];
}
const IMAGE_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const SITE_MEDIA_MAX = 5 * 1024 * 1024;

/* ------------------------------------------------------------------ */
/* Tin tức                                                              */
/* ------------------------------------------------------------------ */

export async function listPosts(ctx: ProtectedContext, input: { status?: PostStatus; category?: PostCategory; q?: string; page?: number }) {
  requirePermission(ctx, "site:read");
  const conds: SQL[] = [];
  if (input.status) conds.push(eq(posts.status, input.status));
  if (input.category) conds.push(eq(posts.category, input.category));
  if (input.q?.trim()) conds.push(or(ilike(posts.title, `%${input.q.trim()}%`), ilike(posts.slug, `%${input.q.trim()}%`))!);
  const where = conds.length ? and(...conds) : undefined;
  const page = input.page ?? 1;
  const list = await ctx.db.select({ p: posts, byName: users.fullName }).from(posts).leftJoin(users, eq(users.id, posts.updatedBy))
    .where(where).orderBy(sql`case ${posts.status} when 'scheduled' then 0 when 'draft' then 1 when 'published' then 2 else 3 end`, desc(sql`coalesce(${posts.publishedAt}, ${posts.updatedAt})`))
    .limit(PAGE).offset((page - 1) * PAGE);
  const [c] = await ctx.db.select({
    total: sql<number>`count(*)::int`,
    draft: sql<number>`count(*) filter (where ${posts.status} = 'draft')::int`,
    scheduled: sql<number>`count(*) filter (where ${posts.status} = 'scheduled')::int`,
    published: sql<number>`count(*) filter (where ${posts.status} = 'published')::int`,
    archived: sql<number>`count(*) filter (where ${posts.status} = 'archived')::int`,
    views: sql<number>`coalesce(sum(${posts.views}), 0)::int`,
  }).from(posts);
  const [f] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(posts).where(where);
  return {
    page, pageSize: PAGE, total: f?.n ?? 0, counts: c, canEdit: authorize(ctx.actor, "site:update", {}).allowed,
    items: list.map((r) => ({ ...r.p, body: undefined, statusLabel: POST_STATUS_VI[r.p.status as PostStatus], categoryLabel: POST_CATEGORY_VI[r.p.category as PostCategory], byName: r.byName, minutes: readingMinutes(r.p.body) })),
  };
}

export async function getPost(ctx: ProtectedContext, id: string) {
  requirePermission(ctx, "site:read");
  const p = await ctx.db.query.posts.findFirst({ where: eq(posts.id, id) });
  if (!p) throw notFound("Không tìm thấy bài viết");
  return { ...p, statusLabel: POST_STATUS_VI[p.status as PostStatus], html: renderMarkdown(p.body), minutes: readingMinutes(p.body), canEdit: authorize(ctx.actor, "site:update", {}).allowed };
}

export async function upsertPost(ctx: ProtectedContext, input: { id?: string; title: string; slug?: string | null; excerpt?: string | null; body: string; coverImage?: string | null; category: PostCategory; seoTitle?: string | null; seoDescription?: string | null }) {
  requirePermission(ctx, input.id ? "site:update" : "site:create");
  const slug = (input.slug?.trim() || slugify(input.title)).toLowerCase();
  const v = {
    title: input.title.trim(), slug, excerpt: input.excerpt?.trim() || null, body: input.body, coverImage: input.coverImage?.trim() || null,
    category: input.category, seoTitle: input.seoTitle?.trim() || null, seoDescription: input.seoDescription?.trim() || null, updatedBy: ctx.user.id,
  };
  const errs = validatePost(v);
  if (v.coverImage && !/^(\/api\/public\/site-media\/[A-Za-z0-9._-]+|https:\/\/[^\s]+)$/.test(v.coverImage)) errs.push("Ảnh bìa không hợp lệ");
  if (errs.length) throw bad(errs);
  const dup = await ctx.db.query.posts.findFirst({ where: and(eq(posts.slug, slug), input.id ? sql`${posts.id} <> ${input.id}` : sql`true`) });
  if (dup) throw pre(`Đường dẫn /tin-tuc/${slug} đã được dùng`);
  if (input.id) {
    const old = await ctx.db.query.posts.findFirst({ where: eq(posts.id, input.id) });
    if (!old) throw notFound("Không tìm thấy bài viết");
    if (old.status === "published" && old.slug !== slug) throw pre("Bài đã đăng — không đổi đường dẫn (tránh hỏng liên kết đã chia sẻ)");
    await ctx.db.update(posts).set(v).where(eq(posts.id, old.id));
    await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "site", entity: "posts", entityId: old.id, before: { title: old.title, slug: old.slug }, after: { title: v.title, slug }, ip: ctx.ip });
    return { id: old.id, slug };
  }
  const [r] = await ctx.db.insert(posts).values({ ...v, createdBy: ctx.user.id }).returning({ id: posts.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "site", entity: "posts", entityId: r!.id, after: { title: v.title, slug }, ip: ctx.ip });
  return { id: r!.id, slug };
}

export async function postAction(ctx: ProtectedContext, input: { id: string; action: PostAction; publishAt?: string | null }) {
  requirePermission(ctx, "site:update");
  const p = await ctx.db.query.posts.findFirst({ where: eq(posts.id, input.id) });
  if (!p) throw notFound("Không tìm thấy bài viết");
  const now = new Date();
  const publishAt = input.publishAt ? new Date(input.publishAt) : null;
  const to = rule(() => postTransition(p.status as PostStatus, input.action, { publishAt, now }));
  if (to === "published" || to === "scheduled") {
    const errs = validatePost(p);
    if (errs.length) throw bad(errs);
  }
  await ctx.db.update(posts).set({
    status: to, updatedBy: ctx.user.id,
    publishAt: to === "scheduled" ? publishAt : null,
    ...(to === "published" ? { publishedAt: p.publishedAt ?? now } : {}),
  }).where(eq(posts.id, p.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "TRANSITION", module: "site", entity: "posts", entityId: p.id, before: { status: p.status }, after: { status: to, publishAt }, ip: ctx.ip });
  return { status: to };
}

/** Worker: đăng bài hẹn giờ đã tới hạn */
export async function publishDuePosts(db: Database) {
  const d = asDb(db);
  const r = await d.update(posts).set({ status: "published", publishedAt: sql`coalesce(${posts.publishedAt}, ${posts.publishAt})` })
    .where(and(eq(posts.status, "scheduled"), lte(posts.publishAt, new Date()))).returning({ id: posts.id });
  return r.length;
}

export async function publicPosts(db: Database, input: { category?: PostCategory; page?: number }) {
  const d = asDb(db);
  const page = input.page ?? 1;
  const where = and(eq(posts.status, "published"), input.category ? eq(posts.category, input.category) : sql`true`);
  const list = await d.select({ slug: posts.slug, title: posts.title, excerpt: posts.excerpt, coverImage: posts.coverImage, category: posts.category, publishedAt: posts.publishedAt, body: posts.body })
    .from(posts).where(where).orderBy(desc(posts.publishedAt)).limit(12).offset((page - 1) * 12);
  const [c] = await d.select({ n: sql<number>`count(*)::int` }).from(posts).where(where);
  return {
    page, total: c?.n ?? 0,
    items: list.map(({ body, ...x }) => ({ ...x, categoryLabel: POST_CATEGORY_VI[x.category as PostCategory], minutes: readingMinutes(body), excerpt: x.excerpt ?? body.replace(/[#>*_`\[\]()!]/g, "").slice(0, 160) })),
  };
}

export async function publicPost(db: Database, slug: string) {
  const d = asDb(db);
  const p = await d.query.posts.findFirst({ where: and(eq(posts.slug, slug), eq(posts.status, "published")) });
  if (!p) return null;
  await d.update(posts).set({ views: sql`${posts.views} + 1` }).where(eq(posts.id, p.id));
  const related = await d.select({ slug: posts.slug, title: posts.title }).from(posts)
    .where(and(eq(posts.status, "published"), eq(posts.category, p.category), sql`${posts.id} <> ${p.id}`)).orderBy(desc(posts.publishedAt)).limit(3);
  return {
    slug: p.slug, title: p.title, excerpt: p.excerpt, coverImage: p.coverImage, category: p.category, categoryLabel: POST_CATEGORY_VI[p.category as PostCategory],
    publishedAt: p.publishedAt, html: renderMarkdown(p.body), minutes: readingMinutes(p.body), seoTitle: p.seoTitle ?? p.title, seoDescription: p.seoDescription ?? p.excerpt ?? "", related,
  };
}

/* ------------------------------------------------------------------ */
/* Nội dung website & ảnh                                               */
/* ------------------------------------------------------------------ */

export async function siteContent(ctx: ProtectedContext) {
  requirePermission(ctx, "site:read");
  const [blocks, hist] = await Promise.all([
    ctx.db.select({ b: siteBlocks, byName: users.fullName }).from(siteBlocks).leftJoin(users, eq(users.id, siteBlocks.updatedBy)),
    ctx.db.select({ page: siteBlockHistory.page, version: siteBlockHistory.version, createdAt: siteBlockHistory.createdAt, byName: users.fullName })
      .from(siteBlockHistory).leftJoin(users, eq(users.id, siteBlockHistory.updatedBy)).orderBy(desc(siteBlockHistory.createdAt)).limit(100),
  ]);
  return {
    canEdit: authorize(ctx.actor, "site:update", {}).allowed,
    pages: SITE_PAGE_KEYS.map((k) => {
      const b = blocks.find((x) => x.b.page === k);
      return { key: k, ...SITE_PAGES[k]!, data: b?.b.data ?? {}, version: b?.b.version ?? 0, updatedAt: b?.b.updatedAt ?? null, updatedBy: b?.byName ?? null, history: hist.filter((h) => h.page === k).slice(0, 10) };
    }),
  };
}

export async function saveSiteBlock(ctx: ProtectedContext, input: { page: string; data: Record<string, string>; version: number }) {
  requirePermission(ctx, "site:update");
  const def = SITE_PAGES[input.page];
  if (!def) throw notFound("Trang không tồn tại");
  const data = Object.fromEntries(Object.entries(input.data).map(([k, v]) => [k, String(v ?? "").trim()]).filter(([, v]) => v !== ""));
  const errs = validateSiteBlock(input.page, data);
  if (errs.length) throw bad(errs);
  return ctx.db.transaction(async (tx) => {
    const cur = await tx.query.siteBlocks.findFirst({ where: eq(siteBlocks.page, input.page) });
    if ((cur?.version ?? 0) !== input.version) throw new TRPCError({ code: "CONFLICT", message: "Nội dung vừa được người khác sửa — tải lại trang để xem bản mới" });
    const version = (cur?.version ?? 0) + 1;
    if (cur) await tx.update(siteBlocks).set({ data, version, updatedBy: ctx.user.id, updatedAt: new Date() }).where(eq(siteBlocks.page, input.page));
    else await tx.insert(siteBlocks).values({ page: input.page, data, version, updatedBy: ctx.user.id });
    await tx.insert(siteBlockHistory).values({ page: input.page, version, data, updatedBy: ctx.user.id });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: cur ? "UPDATE" : "CREATE", module: "site", entity: "site_blocks", entityId: null, before: cur?.data ?? null, after: { page: input.page, version, data }, ip: ctx.ip });
    return { version, path: def.path };
  });
}

export async function restoreSiteBlock(ctx: ProtectedContext, input: { page: string; version: number }) {
  requirePermission(ctx, "site:update");
  const h = await ctx.db.query.siteBlockHistory.findFirst({ where: and(eq(siteBlockHistory.page, input.page), eq(siteBlockHistory.version, input.version)) });
  if (!h) throw notFound("Không tìm thấy phiên bản");
  const cur = await ctx.db.query.siteBlocks.findFirst({ where: eq(siteBlocks.page, input.page) });
  if (cur?.version === input.version) throw pre("Đây đã là phiên bản hiện hành");
  return saveSiteBlock(ctx, { page: input.page, data: h.data, version: cur?.version ?? 0 });
}

export async function publicSite(db: Database, page: SitePageKey) {
  const b = await asDb(db).query.siteBlocks.findFirst({ where: eq(siteBlocks.page, page) });
  return { page, data: b?.data ?? {}, html: page === "about" && b?.data.body ? renderMarkdown(b.data.body) : null, updatedAt: b?.updatedAt ?? null };
}

export async function uploadSiteMedia(ctx: ProtectedContext, input: { fileName: string; mime: string; bytes: Uint8Array; alt?: string | null }) {
  requirePermission(ctx, "site:update");
  const ext = IMAGE_EXT[input.mime];
  if (!ext) throw bad("Chỉ nhận ảnh JPG, PNG, WEBP");
  if (input.bytes.byteLength > SITE_MEDIA_MAX) throw bad("Ảnh tối đa 5MB");
  const head = Buffer.from(input.bytes.subarray(0, 12));
  const sigOk = (ext === "png" && head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])))
    || (ext === "jpg" && head[0] === 0xff && head[1] === 0xd8)
    || (ext === "webp" && head.subarray(0, 4).toString() === "RIFF" && head.subarray(8, 12).toString() === "WEBP");
  if (!sigOk) throw bad("Nội dung tệp không khớp định dạng ảnh");
  const name = `${randomUUID()}.${ext}`;
  const key = `site/${name}`;
  await putObject(key, input.bytes);
  await ctx.db.insert(siteMedia).values({ objectKey: key, fileName: input.fileName.slice(0, 120), mimeType: input.mime, sizeBytes: input.bytes.byteLength, alt: input.alt?.trim() || null, uploadedBy: ctx.user.id });
  return { url: `/api/public/site-media/${name}` };
}

export async function listSiteMedia(ctx: ProtectedContext) {
  requirePermission(ctx, "site:read");
  const r = await ctx.db.select().from(siteMedia).orderBy(desc(siteMedia.createdAt)).limit(60);
  return r.map((m) => ({ ...m, url: `/api/public/site-media/${m.objectKey.slice(5)}` }));
}

/* ------------------------------------------------------------------ */
/* Tracking & marketing                                                 */
/* ------------------------------------------------------------------ */

export interface MarketingSettings { metaPixelId: string; ga4MeasurementId: string; trackingEnabled: boolean; leadRetentionMonths: number }
const MK_DEFAULTS: MarketingSettings = { metaPixelId: "", ga4MeasurementId: "", trackingEnabled: true, leadRetentionMonths: 24 };

export async function getMarketingSettings(db: Db): Promise<MarketingSettings> {
  const r = await db.query.appSettings.findFirst({ where: eq(appSettings.key, "marketing") });
  return { ...MK_DEFAULTS, ...((r?.value ?? {}) as Partial<MarketingSettings>) };
}

export async function saveMarketingSettings(ctx: ProtectedContext, input: MarketingSettings) {
  requirePermission(ctx, "marketing:configure");
  const e: string[] = [];
  if (input.metaPixelId && !/^\d{10,20}$/.test(input.metaPixelId)) e.push("Meta Pixel ID gồm 10–20 chữ số");
  if (input.ga4MeasurementId && !/^G-[A-Z0-9]{6,12}$/.test(input.ga4MeasurementId)) e.push("GA4 Measurement ID dạng G-XXXXXXX");
  if (!Number.isInteger(input.leadRetentionMonths) || input.leadRetentionMonths < 6 || input.leadRetentionMonths > 120) e.push("Thời hạn lưu lead 6–120 tháng");
  if (e.length) throw bad(e);
  const v: MarketingSettings = { metaPixelId: input.metaPixelId.trim(), ga4MeasurementId: input.ga4MeasurementId.trim(), trackingEnabled: !!input.trackingEnabled, leadRetentionMonths: input.leadRetentionMonths };
  await ctx.db.insert(appSettings).values({ key: "marketing", value: v as unknown as Record<string, unknown>, updatedBy: ctx.user.id })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: v as unknown as Record<string, unknown>, updatedBy: ctx.user.id, updatedAt: new Date() } });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "marketing", entity: "app_settings", entityId: null, after: v, ip: ctx.ip });
  return { ok: true };
}

/** Công khai: cấu hình tracking cho website (không lộ bí mật) */
export async function publicTrackingConfig(db: Database) {
  const s = await getMarketingSettings(asDb(db));
  return { trackingEnabled: s.trackingEnabled, metaPixelId: s.metaPixelId || null, ga4MeasurementId: s.ga4MeasurementId || null };
}

export async function recordTrack(db: Database, input: { event: string; anonId: string; path: string; utmSource?: string | null; utmMedium?: string | null; utmCampaign?: string | null; referrer?: string | null; leadId?: string | null }) {
  const d = asDb(db);
  if (!(TRACK_EVENTS as readonly string[]).includes(input.event)) return { ok: false as const, error: "Sự kiện không hợp lệ" };
  if (!validAnonId(input.anonId)) return { ok: false as const, error: "Mã ẩn danh không hợp lệ" };
  const s = await getMarketingSettings(d);
  if (!s.trackingEnabled) return { ok: true as const, skipped: true };
  const path = (input.path || "/").split(/[?#]/)[0]!.slice(0, 200);
  if (!path.startsWith("/")) return { ok: false as const, error: "Đường dẫn không hợp lệ" };
  let refHost: string | null = null;
  try { refHost = input.referrer ? new URL(input.referrer).hostname.slice(0, 100) : null; } catch { refHost = null; }
  await d.insert(trackEvents).values({
    event: input.event as TrackEvent, anonId: input.anonId, path, utmSource: normUtm(input.utmSource), utmMedium: normUtm(input.utmMedium), utmCampaign: normUtm(input.utmCampaign),
    referrerHost: refHost, leadId: input.leadId ?? null,
  });
  return { ok: true as const };
}

function mkRange(input: { from?: string; to?: string }) {
  const r = normalizeRange(input.from, input.to, todayISO());
  return { ...r, fromTs: `${r.from}T00:00:00+07:00`, toTs: `${r.to}T23:59:59.999+07:00` };
}
function centerFilter(ctx: ProtectedContext, col: SQL, centerId?: string): SQL {
  const v = visibleCenterIds(ctx.actor);
  if (centerId) {
    if (v !== null && !v.includes(centerId)) throw new TRPCError({ code: "FORBIDDEN", message: "Không có quyền xem cơ sở này" });
    return sql`${col} = ${centerId}`;
  }
  if (v === null) return sql`true`;
  return v.length ? sql`(${col} in (${sql.join(v.map((x) => sql`${x}`), sql`, `)}) or ${col} is null)` : sql`false`;
}

type LeadAgg = { key: string | null; leads: number; contacted: number; trials: number; enrolled: number; revenue: number; opted_out: number };

async function leadAgg(ctx: ProtectedContext, groupExpr: SQL, r: ReturnType<typeof mkRange>, centerSql: SQL) {
  return rows<LeadAgg>(ctx.db, sql`
    select ${groupExpr} as key, count(*)::int as leads,
      count(*) filter (where l.status <> 'new')::int as contacted,
      count(*) filter (where exists (select 1 from trial_bookings tb where tb.lead_id = l.id))::int as trials,
      count(*) filter (where l.converted_at is not null)::int as enrolled,
      coalesce(sum((select coalesce(sum(p.amount), 0) from payments p join orders o on o.id = p.order_id where p.status = 'confirmed' and o.student_id = l.converted_student_id)), 0)::float as revenue,
      count(*) filter (where l.marketing_opt_out)::int as opted_out
    from leads l
    where l.deleted_at is null and l.created_at between ${r.fromTs}::timestamptz and ${r.toTs}::timestamptz and ${centerSql}
    group by 1 order by 2 desc`);
}

export async function marketingOverview(ctx: ProtectedContext, input: { from?: string; to?: string; centerId?: string }) {
  requirePermission(ctx, "marketing:read", input.centerId ? { centerId: input.centerId } : undefined);
  const r = mkRange(input);
  const cs = centerFilter(ctx, sql`l.center_id`, input.centerId);
  const [bySource, byCampaign, byMedium] = await Promise.all([
    leadAgg(ctx, sql`coalesce(l.utm_source, l.source, '(không rõ)')`, r, cs),
    leadAgg(ctx, sql`l.utm_campaign`, r, cs),
    leadAgg(ctx, sql`coalesce(l.utm_medium, '(không có)')`, r, cs),
  ]);
  const channels = new Map<Channel, { leads: number; contacted: number; trials: number; enrolled: number; revenue: number }>();
  for (const x of bySource) {
    const ch = channelOf(x.key, x.key);
    const cur = channels.get(ch) ?? { leads: 0, contacted: 0, trials: 0, enrolled: 0, revenue: 0 };
    channels.set(ch, { leads: cur.leads + x.leads, contacted: cur.contacted + x.contacted, trials: cur.trials + x.trials, enrolled: cur.enrolled + x.enrolled, revenue: cur.revenue + x.revenue });
  }
  const ev = await rows<{ event: string; n: number; uniq: number }>(ctx.db, sql`
    select event, count(*)::int as n, count(distinct anon_id)::int as uniq from track_events where created_at between ${r.fromTs}::timestamptz and ${r.toTs}::timestamptz group by 1`);
  const topPages = await rows<{ path: string; views: number; visitors: number }>(ctx.db, sql`
    select path, count(*)::int as views, count(distinct anon_id)::int as visitors from track_events where event = 'page_view' and created_at between ${r.fromTs}::timestamptz and ${r.toTs}::timestamptz group by 1 order by 2 desc limit 10`);
  const totals = bySource.reduce((a, x) => ({ leads: a.leads + x.leads, enrolled: a.enrolled + x.enrolled, revenue: a.revenue + x.revenue, optedOut: a.optedOut + x.opted_out }), { leads: 0, enrolled: 0, revenue: 0, optedOut: 0 });
  const untracked = byCampaign.find((x) => x.key === null)?.leads ?? 0;
  const s = await getMarketingSettings(ctx.db);
  const ctrs = await ctx.db.select({ id: centers.id, code: centers.code, name: centers.name }).from(centers).where(eq(centers.isActive, true)).orderBy(asc(centers.code));
  const vis = visibleCenterIds(ctx.actor);
  return {
    range: { from: r.from, to: r.to }, centerId: input.centerId ?? null, centers: vis === null ? ctrs : ctrs.filter((c) => vis.includes(c.id)),
    totals: { ...totals, untracked, trackedShare: totals.leads ? Math.round(((totals.leads - untracked) / totals.leads) * 100) : 0 },
    events: Object.fromEntries(ev.map((e) => [e.event, { n: e.n, uniq: e.uniq }])) as Record<string, { n: number; uniq: number }>,
    topPages,
    byChannel: [...channels.entries()].map(([k, v]) => ({ key: k, label: CHANNEL_VI[k], ...v, closeRate: v.leads ? Math.round((v.enrolled / v.leads) * 100) : 0 })).sort((a, b) => b.leads - a.leads),
    bySource, byMedium, byCampaign: byCampaign.filter((x) => x.key !== null),
    settings: {
      ...s,
      capiConfigured: !!process.env.META_CAPI_TOKEN,
      ga4ApiConfigured: !!process.env.GA4_API_SECRET,
      canConfigure: authorize(ctx.actor, "marketing:configure", {}).allowed,
    },
  };
}

export async function listCampaigns(ctx: ProtectedContext, input: { from?: string; to?: string; activeOnly?: boolean }) {
  requirePermission(ctx, "marketing:read");
  const r = mkRange(input);
  const cs = await ctx.db.select({ c: campaigns, centerCode: centers.code }).from(campaigns).leftJoin(centers, eq(centers.id, campaigns.centerId))
    .where(input.activeOnly ? eq(campaigns.isActive, true) : undefined).orderBy(desc(campaigns.startDate));
  const agg = await leadAgg(ctx, sql`l.utm_campaign`, r, sql`true`);
  const spend = await rows<{ campaign_id: string; spend: number; clicks: number; impressions: number }>(ctx.db, sql`
    select campaign_id, coalesce(sum(amount), 0)::float as spend, coalesce(sum(clicks), 0)::int as clicks, coalesce(sum(impressions), 0)::int as impressions
    from campaign_spends where date between ${r.from}::date and ${r.to}::date group by 1`);
  const visits = await rows<{ c: string; visitors: number; submits: number }>(ctx.db, sql`
    select utm_campaign as c, count(distinct anon_id) filter (where event = 'page_view')::int as visitors, count(*) filter (where event = 'form_submit')::int as submits
    from track_events where utm_campaign is not null and created_at between ${r.fromTs}::timestamptz and ${r.toTs}::timestamptz group by 1`);
  return {
    range: { from: r.from, to: r.to }, canEdit: authorize(ctx.actor, "marketing:configure", {}).allowed,
    items: cs.map(({ c, centerCode }) => {
      const a = agg.find((x) => x.key === c.utmCampaign);
      const sp = spend.find((x) => x.campaign_id === c.id);
      const v = visits.find((x) => x.c === c.utmCampaign);
      const base = { spend: sp?.spend ?? 0, visits: v?.visitors ?? 0, leads: a?.leads ?? 0, trials: a?.trials ?? 0, enrolled: a?.enrolled ?? 0, revenue: a?.revenue ?? 0 };
      return {
        ...c, channelLabel: CHANNEL_VI[c.channel as Channel], centerCode, ...base, clicks: sp?.clicks ?? 0, impressions: sp?.impressions ?? 0, submits: v?.submits ?? 0,
        budgetUsed: c.budget ? Math.round((base.spend / c.budget) * 100) : null, ...campaignMetrics(base),
      };
    }),
  };
}

export async function upsertCampaign(ctx: ProtectedContext, input: { id?: string; name: string; utmCampaign: string; channel: Channel; centerId?: string | null; budget: number; startDate: string; endDate?: string | null; landingUrl?: string | null; notes?: string | null; isActive?: boolean }) {
  requirePermission(ctx, "marketing:configure");
  const utm = normUtm(input.utmCampaign) ?? "";
  const errs = validateCampaign({ ...input, utmCampaign: utm });
  if (input.landingUrl && !/^https:\/\/[^\s]+$/.test(input.landingUrl)) errs.push("Trang đích phải bắt đầu bằng https://");
  if (errs.length) throw bad(errs);
  const dup = await ctx.db.query.campaigns.findFirst({ where: and(eq(campaigns.utmCampaign, utm), input.id ? sql`${campaigns.id} <> ${input.id}` : sql`true`) });
  if (dup) throw pre(`utm_campaign "${utm}" đã dùng cho chiến dịch ${dup.name}`);
  const v = { name: input.name.trim(), utmCampaign: utm, channel: input.channel, centerId: input.centerId ?? null, budget: input.budget, startDate: input.startDate, endDate: input.endDate ?? null, landingUrl: input.landingUrl?.trim() || null, notes: input.notes?.trim() || null, isActive: input.isActive ?? true };
  if (input.id) {
    const old = await ctx.db.query.campaigns.findFirst({ where: eq(campaigns.id, input.id) });
    if (!old) throw notFound("Không tìm thấy chiến dịch");
    if (old.utmCampaign !== utm) {
      const [n] = await rows<{ n: number }>(ctx.db, sql`select count(*)::int as n from leads where utm_campaign = ${old.utmCampaign}`);
      if ((n?.n ?? 0) > 0) throw pre("Đã có lead gắn utm_campaign này — không đổi mã (tạo chiến dịch mới)");
    }
    await ctx.db.update(campaigns).set(v).where(eq(campaigns.id, old.id));
    await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "marketing", entity: "campaigns", entityId: old.id, before: { budget: old.budget, utm: old.utmCampaign }, after: v, ip: ctx.ip });
    return { id: old.id };
  }
  const [r] = await ctx.db.insert(campaigns).values({ ...v, createdBy: ctx.user.id }).returning({ id: campaigns.id });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "marketing", entity: "campaigns", entityId: r!.id, after: v, ip: ctx.ip });
  return { id: r!.id };
}

export async function recordSpend(ctx: ProtectedContext, input: { campaignId: string; date: string; amount: number; clicks?: number | null; impressions?: number | null; note?: string | null }) {
  requirePermission(ctx, "marketing:configure");
  const c = await ctx.db.query.campaigns.findFirst({ where: eq(campaigns.id, input.campaignId) });
  if (!c) throw notFound("Không tìm thấy chiến dịch");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw bad("Ngày không hợp lệ");
  if (input.date < c.startDate || (c.endDate && input.date > c.endDate)) throw bad("Ngày chi nằm ngoài thời gian chiến dịch");
  if (input.date > todayISO()) throw bad("Không ghi chi phí cho ngày tương lai");
  if (!Number.isInteger(input.amount) || input.amount < 0) throw bad("Số tiền là số nguyên ≥ 0");
  const v = { amount: input.amount, clicks: input.clicks ?? null, impressions: input.impressions ?? null, note: input.note?.trim() || null, createdBy: ctx.user.id };
  await ctx.db.insert(campaignSpends).values({ campaignId: c.id, date: input.date, ...v })
    .onConflictDoUpdate({ target: [campaignSpends.campaignId, campaignSpends.date], set: v });
  const [t] = await ctx.db.select({ s: sql<number>`coalesce(sum(${campaignSpends.amount}), 0)::float` }).from(campaignSpends).where(eq(campaignSpends.campaignId, c.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "marketing", entity: "campaign_spends", entityId: c.id, after: { date: input.date, amount: input.amount }, ip: ctx.ip });
  return { total: t?.s ?? 0, overBudget: c.budget > 0 && (t?.s ?? 0) > c.budget };
}

/** Phễu marketing: truy cập → xem form → bắt đầu → gửi → lead → liên hệ → học thử → đăng ký → thanh toán */
export async function marketingFunnel(ctx: ProtectedContext, input: { from?: string; to?: string; utmCampaign?: string; channel?: Channel }) {
  requirePermission(ctx, "marketing:read");
  const r = mkRange(input);
  const utm = input.utmCampaign ? normUtm(input.utmCampaign) : null;
  const evWhere = sql`created_at between ${r.fromTs}::timestamptz and ${r.toTs}::timestamptz ${utm ? sql`and utm_campaign = ${utm}` : sql``}`;
  const [ev] = await rows<{ visitors: number; form_view: number; form_start: number; form_submit: number }>(ctx.db, sql`
    select count(distinct anon_id) filter (where event = 'page_view')::int as visitors,
      count(distinct anon_id) filter (where event = 'form_view')::int as form_view,
      count(distinct anon_id) filter (where event = 'form_start')::int as form_start,
      count(distinct anon_id) filter (where event = 'form_submit')::int as form_submit
    from track_events where ${evWhere}`);
  const leadRows = await rows<{ source: string | null; utm_source: string | null; status: string; trial: boolean; attended: boolean; converted: boolean; paid: boolean }>(ctx.db, sql`
    select l.source, l.utm_source, l.status,
      exists (select 1 from trial_bookings tb where tb.lead_id = l.id) as trial,
      exists (select 1 from trial_bookings tb where tb.lead_id = l.id and tb.status = 'attended') as attended,
      l.converted_at is not null as converted,
      exists (select 1 from payments p join orders o on o.id = p.order_id where p.status = 'confirmed' and o.student_id = l.converted_student_id) as paid
    from leads l where l.deleted_at is null and l.created_at between ${r.fromTs}::timestamptz and ${r.toTs}::timestamptz ${utm ? sql`and l.utm_campaign = ${utm}` : sql``}`);
  const ls = input.channel ? leadRows.filter((x) => channelOf(x.utm_source, x.source) === input.channel) : leadRows;
  const steps = [
    { key: "visitors", label: "Người truy cập", n: ev?.visitors ?? 0, web: true },
    { key: "form_view", label: "Xem form đăng ký", n: ev?.form_view ?? 0, web: true },
    { key: "form_start", label: "Bắt đầu điền form", n: ev?.form_start ?? 0, web: true },
    { key: "form_submit", label: "Gửi form", n: ev?.form_submit ?? 0, web: true },
    { key: "leads", label: "Lead", n: ls.length, web: false },
    { key: "contacted", label: "Đã liên hệ", n: ls.filter((x) => x.status !== "new").length, web: false },
    { key: "trial", label: "Hẹn học thử", n: ls.filter((x) => x.trial).length, web: false },
    { key: "attended", label: "Đã học thử", n: ls.filter((x) => x.attended).length, web: false },
    { key: "enrolled", label: "Đăng ký", n: ls.filter((x) => x.converted).length, web: false },
    { key: "paid", label: "Đã thanh toán", n: ls.filter((x) => x.paid).length, web: false },
  ];
  const withRates = steps.map((s, i) => {
    const prev = i > 0 ? steps[i - 1]!.n : s.n;
    return { ...s, fromPrev: i === 0 || !prev ? null : Math.round((s.n / prev) * 1000) / 10, fromLeads: s.web || !ls.length ? null : Math.round((s.n / ls.length) * 1000) / 10 };
  });
  const cmp = await ctx.db.select({ utmCampaign: campaigns.utmCampaign, name: campaigns.name }).from(campaigns).orderBy(desc(campaigns.startDate));
  const biggestDrop = withRates.filter((s) => s.fromPrev !== null && s.key !== "leads").sort((a, b) => (a.fromPrev ?? 100) - (b.fromPrev ?? 100))[0] ?? null;
  return { range: { from: r.from, to: r.to }, utmCampaign: utm, channel: input.channel ?? null, steps: withRates, campaigns: cmp, biggestDrop };
}
