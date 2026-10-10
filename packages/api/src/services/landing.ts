import { and, desc, eq, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { landingPages, landingPageHistory, users, type Database } from "@satarobo/db";
import {
  LANDING_TEMPLATES, sitePathOf, hasPermission, LANDING_VARIANTS, landingTemplateByKey, normalizeLanding, validImage, validSlug, validateLanding,
  type LandingDoc, type LandingVariant,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { tenantSql } from "./tenantScope";
import { getSiteChrome } from "./siteChrome";

/**
 * Landing page theo khối — dịch vụ quản trị + đọc công khai (docs/LANDING-PAGE.md).
 * Nháp và bản xuất bản tách riêng: sửa nháp không đổi trang đang chạy cho tới khi Xuất bản.
 */
type Db = ProtectedContext["db"];
const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });
const notFound = (m: string) => new TRPCError({ code: "NOT_FOUND", message: m });
const conflict = (m: string) => new TRPCError({ code: "CONFLICT", message: m });

export interface LandingSnapshot {
  title: string;
  variant: LandingVariant;
  seoTitle: string;
  seoDescription: string;
  seoImage: string;
  doc: LandingDoc;
}

const variantOf = (v: string): LandingVariant => ((LANDING_VARIANTS as readonly string[]).includes(v) ? (v as LandingVariant) : "classic");
const cut = (s: string | null | undefined, n: number) => (s ?? "").trim().slice(0, n);

type Row = typeof landingPages.$inferSelect;

function draftSnapshot(r: Row): LandingSnapshot {
  return { title: r.title, variant: variantOf(r.variant), seoTitle: r.seoTitle ?? "", seoDescription: r.seoDescription ?? "", seoImage: r.seoImage ?? "", doc: normalizeLanding(r.draft) };
}
function publishedSnapshot(raw: unknown): LandingSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  return {
    title: cut(p.title as string, 150), variant: variantOf(String(p.variant ?? "")), seoTitle: cut(p.seoTitle as string, 70),
    seoDescription: cut(p.seoDescription as string, 170), seoImage: cut(p.seoImage as string, 500), doc: normalizeLanding(p.doc),
  };
}
const same = (a: LandingSnapshot | null, b: LandingSnapshot | null) => JSON.stringify(a) === JSON.stringify(b);

function check(s: LandingSnapshot, slug: string) {
  const c = validateLanding(s.doc, { title: s.title, slug });
  if (s.seoImage && !validImage(s.seoImage)) c.errors.push("Ảnh chia sẻ (SEO) không hợp lệ");
  return c;
}

async function loadRow(db: Db, id: string): Promise<Row> {
  const r = await db.query.landingPages.findFirst({ where: eq(landingPages.id, id) });
  if (!r) throw notFound("Không tìm thấy landing page");
  return r;
}

export async function landingTemplates(ctx: ProtectedContext) {
  requirePermission(ctx, "site:read");
  return LANDING_TEMPLATES.map((t) => ({ key: t.key, label: t.label, desc: t.desc, variant: t.variant }));
}

type Cnt = { k: string | null; n: number };

export async function listLandingPages(ctx: ProtectedContext, input: { archived?: boolean } = {}) {
  requirePermission(ctx, "site:read");
  const list = await ctx.db.select({ r: landingPages, byName: users.fullName }).from(landingPages)
    .leftJoin(users, eq(users.id, landingPages.updatedBy))
    .where(input.archived ? eq(landingPages.status, "archived") : ne(landingPages.status, "archived"))
    .orderBy(desc(landingPages.updatedAt));
  // 30 ngày gần nhất: lượt xem (theo đường dẫn) và lead (theo trang đích của lead)
  const views = (await ctx.db.execute(sql`
    select path as k, count(*)::int as n from track_events
    where event = 'page_view' and created_at > now() - interval '30 days'
      and (path like '/lp/%' or path in ('/', '/gioi-thieu', '/khoa-hoc', '/lien-he') or path like '/khoa-hoc/%' or path like '/chinh-sach/%')
    group by path`)) as unknown as Cnt[];
  const leadRows = (await ctx.db.execute(sql`
    select substring(l.landing_page from '/lp/([a-z0-9-]+)') as k, count(*)::int as n from leads l
    where l.landing_page ~ '/lp/[a-z0-9-]+' and l.created_at > now() - interval '30 days' and ${tenantSql(ctx, "l")}
    group by 1`)) as unknown as Cnt[];
  const v = new Map(views.map((x) => [x.k, x.n]));
  const ld = new Map(leadRows.map((x) => [x.k, x.n]));
  return list.map(({ r, byName }) => {
    const pub = publishedSnapshot(r.published);
    const live = r.status === "published";
    return {
      id: r.id, slug: r.slug, title: r.title, template: r.template, variant: variantOf(r.variant), status: r.status,
      path: sitePathOf(r.slug) ?? `/lp/${r.slug}`,
      isSite: sitePathOf(r.slug) !== null,
      version: r.version, publishedVersion: r.publishedVersion, publishedAt: r.publishedAt, updatedAt: r.updatedAt, updatedBy: byName,
      hasUnpublished: live && !same(draftSnapshot(r), pub),
      views30: v.get(sitePathOf(r.slug) ?? `/lp/${r.slug}`) ?? 0,
      leads30: ld.get(r.slug) ?? 0,
    };
  });
}

export async function getLandingPage(ctx: ProtectedContext, id: string) {
  requirePermission(ctx, "site:read");
  const r = await loadRow(ctx.db, id);
  const hist = await ctx.db.select({ version: landingPageHistory.version, createdAt: landingPageHistory.createdAt, byName: users.fullName })
    .from(landingPageHistory).leftJoin(users, eq(users.id, landingPageHistory.createdBy))
    .where(eq(landingPageHistory.pageId, id)).orderBy(desc(landingPageHistory.version)).limit(30);
  const draft = draftSnapshot(r);
  const live = r.status === "published";
  const check1 = check(draft, r.slug);
  return {
    id: r.id, slug: r.slug, status: r.status, template: r.template, version: r.version, publishedVersion: r.publishedVersion, publishedAt: r.publishedAt,
    path: sitePathOf(r.slug) ?? `/lp/${r.slug}`,
    isSite: sitePathOf(r.slug) !== null,
    /** Khung chung của website (chỉ trang thuộc website): đầu / chân trang hiển thị lấy từ đây, không từ khối của trang */
    siteChrome: sitePathOf(r.slug) !== null ? await getSiteChrome(ctx.db) : null,
    canRename: r.publishedVersion === 0,
    draft,
    hasUnpublished: live && !same(draft, publishedSnapshot(r.published)),
    errors: check1.errors, warnings: check1.warnings,
    history: hist,
    canEdit: hasPermission(ctx.actor, "site:update"),
  };
}

export async function createLandingPage(ctx: ProtectedContext, input: { title: string; slug: string; templateKey: string }) {
  requirePermission(ctx, "site:update");
  const title = cut(input.title, 150);
  if (title.length < 3) throw bad("Tên trang tối thiểu 3 ký tự");
  const slug = input.slug.trim().toLowerCase();
  const se = validSlug(slug);
  if (se) throw bad(se);
  const tpl = landingTemplateByKey(input.templateKey);
  if (!tpl) throw bad("Mẫu không tồn tại");
  if (await ctx.db.query.landingPages.findFirst({ where: eq(landingPages.slug, slug) })) throw conflict("Đường dẫn này đã được dùng");
  const [row] = await ctx.db.insert(landingPages).values({
    slug, title, template: tpl.key, variant: tpl.variant, draft: normalizeLanding(tpl.build()), status: "draft", createdBy: ctx.user.id, updatedBy: ctx.user.id,
  }).returning();
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "site", entity: "landing_page", entityId: row!.id, after: { slug, title, template: tpl.key }, ip: ctx.ip });
  return { id: row!.id };
}

export interface SaveDraftInput {
  id: string;
  version: number;
  title: string;
  slug?: string;
  variant: string;
  seoTitle?: string;
  seoDescription?: string;
  seoImage?: string;
  doc: unknown;
}

export async function saveLandingDraft(ctx: ProtectedContext, input: SaveDraftInput) {
  requirePermission(ctx, "site:update");
  const title = cut(input.title, 150);
  if (title.length < 3) throw bad("Tên trang tối thiểu 3 ký tự");
  if (!(LANDING_VARIANTS as readonly string[]).includes(input.variant)) throw bad("Kiểu giao diện không hợp lệ");
  const seoImage = cut(input.seoImage, 500);
  if (seoImage && !validImage(seoImage)) throw bad("Ảnh chia sẻ (SEO) phải tải lên từ thư viện ảnh website hoặc là https://");
  const doc = normalizeLanding(input.doc);
  return ctx.db.transaction(async (tx) => {
    const cur = await loadRow(tx as unknown as Db, input.id);
    if (cur.version !== input.version) throw conflict("Trang vừa được người khác sửa — tải lại để xem bản mới");
    let slug = cur.slug;
    if (input.slug && input.slug.trim().toLowerCase() !== cur.slug) {
      if (cur.publishedVersion > 0) throw bad("Trang đã từng xuất bản nên không đổi đường dẫn được (tránh gãy liên kết). Hãy nhân bản sang đường dẫn mới.");
      slug = input.slug.trim().toLowerCase();
      const se = validSlug(slug);
      if (se) throw bad(se);
      const dup = await tx.query.landingPages.findFirst({ where: and(eq(landingPages.slug, slug), ne(landingPages.id, cur.id)) });
      if (dup) throw conflict("Đường dẫn này đã được dùng");
    }
    const version = cur.version + 1;
    await tx.update(landingPages).set({
      slug, title, variant: input.variant, seoTitle: cut(input.seoTitle, 70) || null, seoDescription: cut(input.seoDescription, 170) || null, seoImage: seoImage || null,
      draft: doc, version, updatedBy: ctx.user.id, updatedAt: new Date(),
    }).where(eq(landingPages.id, cur.id));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "site", entity: "landing_page", entityId: cur.id, after: { slug, title, version, sections: doc.sections.length }, ip: ctx.ip });
    return { version, slug };
  });
}

/** Xuất bản: kiểm đủ nội dung → chụp bản nháp thành bản công khai + ghi lịch sử */
export async function publishLandingPage(ctx: ProtectedContext, input: { id: string }) {
  requirePermission(ctx, "site:update");
  return ctx.db.transaction(async (tx) => {
    const cur = await loadRow(tx as unknown as Db, input.id);
    const snap = draftSnapshot(cur);
    const c = check(snap, cur.slug);
    if (c.errors.length) throw bad(["Chưa thể xuất bản:", ...c.errors]);
    const publishedVersion = cur.publishedVersion + 1;
    const now = new Date();
    await tx.update(landingPages).set({ published: snap, status: "published", publishedVersion, publishedAt: now, updatedBy: ctx.user.id, updatedAt: now }).where(eq(landingPages.id, cur.id));
    await tx.insert(landingPageHistory).values({ pageId: cur.id, version: publishedVersion, snapshot: snap, createdBy: ctx.user.id });
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "site", entity: "landing_page", entityId: cur.id, after: { event: "publish", slug: cur.slug, publishedVersion }, ip: ctx.ip });
    return { publishedVersion, path: sitePathOf(cur.slug) ?? `/lp/${cur.slug}`, warnings: c.warnings };
  });
}

/** Gỡ khỏi công khai (giữ nguyên nháp và lịch sử). Đường dẫn công khai trả 404 */
export async function unpublishLandingPage(ctx: ProtectedContext, input: { id: string }) {
  requirePermission(ctx, "site:update");
  const cur = await loadRow(ctx.db, input.id);
  if (cur.status !== "published") return { ok: true };
  await ctx.db.update(landingPages).set({ status: "draft", updatedBy: ctx.user.id, updatedAt: new Date() }).where(eq(landingPages.id, cur.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "site", entity: "landing_page", entityId: cur.id, after: { event: "unpublish", slug: cur.slug }, ip: ctx.ip });
  return { ok: true };
}

export async function archiveLandingPage(ctx: ProtectedContext, input: { id: string; archived: boolean }) {
  requirePermission(ctx, "site:update");
  const cur = await loadRow(ctx.db, input.id);
  if (input.archived && cur.status === "published") throw bad("Hãy gỡ khỏi công khai trước khi lưu trữ");
  await ctx.db.update(landingPages).set({ status: input.archived ? "archived" : "draft", updatedBy: ctx.user.id, updatedAt: new Date() }).where(eq(landingPages.id, cur.id));
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "site", entity: "landing_page", entityId: cur.id, after: { event: input.archived ? "archive" : "unarchive", slug: cur.slug }, ip: ctx.ip });
  return { ok: true };
}

export async function duplicateLandingPage(ctx: ProtectedContext, input: { id: string; title: string; slug: string }) {
  requirePermission(ctx, "site:update");
  const src = await loadRow(ctx.db, input.id);
  const title = cut(input.title, 150);
  if (title.length < 3) throw bad("Tên trang tối thiểu 3 ký tự");
  const slug = input.slug.trim().toLowerCase();
  const se = validSlug(slug);
  if (se) throw bad(se);
  if (await ctx.db.query.landingPages.findFirst({ where: eq(landingPages.slug, slug) })) throw conflict("Đường dẫn này đã được dùng");
  const [row] = await ctx.db.insert(landingPages).values({
    slug, title, template: src.template, variant: src.variant, seoTitle: src.seoTitle, seoDescription: src.seoDescription, seoImage: src.seoImage,
    draft: normalizeLanding(src.draft), status: "draft", createdBy: ctx.user.id, updatedBy: ctx.user.id,
  }).returning();
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "site", entity: "landing_page", entityId: row!.id, after: { slug, title, from: src.slug }, ip: ctx.ip });
  return { id: row!.id };
}

/** Đưa một phiên bản đã xuất bản trước đây về NHÁP (chưa công khai — phải bấm Xuất bản) */
export async function restoreLandingVersion(ctx: ProtectedContext, input: { id: string; version: number }) {
  requirePermission(ctx, "site:update");
  return ctx.db.transaction(async (tx) => {
    const cur = await loadRow(tx as unknown as Db, input.id);
    const h = await tx.query.landingPageHistory.findFirst({ where: and(eq(landingPageHistory.pageId, cur.id), eq(landingPageHistory.version, input.version)) });
    if (!h) throw notFound("Không tìm thấy phiên bản");
    const snap = publishedSnapshot(h.snapshot);
    if (!snap) throw bad("Phiên bản hỏng");
    const version = cur.version + 1;
    await tx.update(landingPages).set({
      title: snap.title || cur.title, variant: snap.variant, seoTitle: snap.seoTitle || null, seoDescription: snap.seoDescription || null, seoImage: snap.seoImage || null,
      draft: snap.doc, version, updatedBy: ctx.user.id, updatedAt: new Date(),
    }).where(eq(landingPages.id, cur.id));
    await writeAudit(tx as unknown as Db, { actorId: ctx.user.id, action: "UPDATE", module: "site", entity: "landing_page", entityId: cur.id, after: { event: "restore", fromVersion: input.version, version }, ip: ctx.ip });
    return { version };
  });
}

/** Dữ liệu để xuất tệp HTML độc lập: LUÔN lấy bản đang công khai, không xuất nháp chưa duyệt */
export async function landingForExport(ctx: ProtectedContext, id: string) {
  requirePermission(ctx, "site:read");
  const r = await loadRow(ctx.db, id);
  const pub = r.status === "published" ? publishedSnapshot(r.published) : null;
  if (!pub) throw bad("Trang chưa được xuất bản — hãy xuất bản trước khi tải tệp HTML");
  return { slug: r.slug, snapshot: pub };
}

/** Công khai: bản đang xuất bản theo đường dẫn (null nếu chưa xuất bản) */
export async function publicLanding(db: Database, slug: string): Promise<(LandingSnapshot & { slug: string; publishedAt: Date | null }) | null> {
  if (validSlug(slug)) return null;
  const r = await (db as unknown as Db).query.landingPages.findFirst({ where: and(eq(landingPages.slug, slug), eq(landingPages.status, "published")) });
  if (!r) return null;
  const snap = publishedSnapshot(r.published);
  return snap ? { ...snap, slug: r.slug, publishedAt: r.publishedAt } : null;
}
