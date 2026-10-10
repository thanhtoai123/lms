import { and, desc, eq, inArray, like, ne, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { appSettings, jobPostings, landingPages, posts, users, type Database } from "@satarobo/db";
import {
  COURSE_PREFIX, POLICY_PREFIX, SITE_DEMO_PAGES, SITE_NODES, hasPermission, isSiteSlug, normalizeChrome, normalizeLanding, sitePathOf, siteGroupOf, slugify, validateChrome,
  type SiteChrome,
} from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";
import { writeAudit } from "./audit";
import { createLandingPage } from "./landing";
import { getSiteChrome, SITE_CHROME_KEY } from "./siteChrome";

/**
 * Cấu trúc website: sơ đồ trang, khung chung (menu / chân trang), tạo trang demo (docs/WEBSITE-STRUCTURE.md).
 * Trang dựng khối dùng lại bảng `landing_pages`; khung chung lưu ở `app_settings`.
 */
const bad = (m: string | string[]) => new TRPCError({ code: "BAD_REQUEST", message: Array.isArray(m) ? m.join("; ") : m });

export async function websiteOverview(ctx: ProtectedContext) {
  requirePermission(ctx, "site:read");
  const rows = await ctx.db.select({
    id: landingPages.id, slug: landingPages.slug, title: landingPages.title, status: landingPages.status, version: landingPages.version,
    publishedVersion: landingPages.publishedVersion, publishedAt: landingPages.publishedAt, updatedAt: landingPages.updatedAt, byName: users.fullName,
  }).from(landingPages).leftJoin(users, eq(users.id, landingPages.updatedBy))
    .where(and(ne(landingPages.status, "archived"), or(
      inArray(landingPages.slug, SITE_NODES.flatMap((n) => (n.slug ? [n.slug] : []))),
      like(landingPages.slug, `${COURSE_PREFIX}%`), like(landingPages.slug, `${POLICY_PREFIX}%`),
    )))
    .orderBy(desc(landingPages.updatedAt));
  const pages = rows.filter((r) => isSiteSlug(r.slug)).map((r) => ({
    id: r.id, slug: r.slug, title: r.title, status: r.status, path: sitePathOf(r.slug)!, group: siteGroupOf(r.slug)!,
    version: r.version, publishedVersion: r.publishedVersion, publishedAt: r.publishedAt, updatedAt: r.updatedAt, updatedBy: r.byName,
  }));
  const have = new Set(pages.map((p) => p.slug));
  const [news] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(posts).where(eq(posts.status, "published"));
  const [jobs] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(jobPostings).where(eq(jobPostings.status, "open"));
  return {
    pages,
    chrome: await getSiteChrome(ctx.db),
    missingDemo: SITE_DEMO_PAGES.filter((p) => !have.has(p.slug)).map((p) => ({ slug: p.slug, title: p.title })),
    counts: { news: news?.n ?? 0, jobs: jobs?.n ?? 0 },
    canEdit: hasPermission(ctx.actor, "site:update"),
  };
}

export async function saveSiteChrome(ctx: ProtectedContext, input: { chrome: unknown }) {
  requirePermission(ctx, "site:update");
  const next: SiteChrome = normalizeChrome(input.chrome);
  const errors = validateChrome(next);
  if (errors.length) throw bad(errors);
  const before = await getSiteChrome(ctx.db);
  if (JSON.stringify(before) === JSON.stringify(next)) return { ok: true, changed: false };
  await ctx.db.insert(appSettings).values({ key: SITE_CHROME_KEY, value: next, updatedBy: ctx.user.id })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: next, updatedBy: ctx.user.id, updatedAt: new Date() } });
  await writeAudit(ctx.db, { actorId: ctx.user.id, action: "UPDATE", module: "site", entity: "site_chrome", entityId: null, before, after: next, ip: ctx.ip });
  return { ok: true, changed: true };
}

/** Tạo (dạng NHÁP, chưa xuất bản) các trang demo còn thiếu của khung website */
export async function createDemoPages(ctx: ProtectedContext, input: { slugs?: string[] } = {}) {
  requirePermission(ctx, "site:update");
  const want = SITE_DEMO_PAGES.filter((p) => !input.slugs || input.slugs.includes(p.slug));
  const existing = new Set((await ctx.db.select({ slug: landingPages.slug }).from(landingPages).where(inArray(landingPages.slug, want.map((p) => p.slug)))).map((r) => r.slug));
  const created: string[] = [];
  for (const p of want) {
    if (existing.has(p.slug)) continue;
    const [row] = await ctx.db.insert(landingPages).values({
      slug: p.slug, title: p.title, template: p.template, variant: p.variant, seoTitle: p.seoTitle, seoDescription: p.seoDescription,
      draft: normalizeLanding(p.build()), status: "draft", createdBy: ctx.user.id, updatedBy: ctx.user.id,
    }).returning();
    await writeAudit(ctx.db, { actorId: ctx.user.id, action: "CREATE", module: "site", entity: "landing_page", entityId: row!.id, after: { slug: p.slug, title: p.title, template: p.template, demo: true }, ip: ctx.ip });
    created.push(p.slug);
  }
  return { created };
}

/** Thêm một khoá học / trang chính sách mới (nháp) từ mẫu trang con */
export async function createSitePage(ctx: ProtectedContext, input: { group: "course" | "policy"; name: string; slug: string }) {
  requirePermission(ctx, "site:update");
  const tail = slugify(input.slug || input.name);
  if (tail.length < 2) throw bad("Đường dẫn quá ngắn");
  const prefix = input.group === "course" ? COURSE_PREFIX : POLICY_PREFIX;
  return createLandingPage(ctx, { title: input.name, slug: prefix + tail, templateKey: input.group === "course" ? "site-khoa-hoc-chi-tiet" : "site-chinh-sach" });
}

/** Sơ đồ trang công khai (cho sitemap.xml): trang dựng khối đã xuất bản + bài tin tức + tin tuyển dụng đang mở */
export async function publicSitemap(db: Database) {
  const d = db as unknown as ProtectedContext["db"];
  const pages = await d.select({ slug: landingPages.slug, at: landingPages.publishedAt, up: landingPages.updatedAt }).from(landingPages).where(eq(landingPages.status, "published"));
  const news = await d.select({ slug: posts.slug, at: posts.publishedAt }).from(posts).where(eq(posts.status, "published")).orderBy(desc(posts.publishedAt)).limit(500);
  const jobs = await d.select({ slug: jobPostings.slug }).from(jobPostings).where(eq(jobPostings.status, "open")).limit(200);
  return {
    pages: pages.flatMap((p) => { const path = sitePathOf(p.slug); return path ? [{ path, lastModified: p.at ?? p.up }] : []; }),
    news: news.map((n) => ({ path: `/tin-tuc/${n.slug}`, lastModified: n.at })),
    jobs: jobs.map((j) => ({ path: `/tuyen-dung/${j.slug}`, lastModified: null as Date | null })),
  };
}
