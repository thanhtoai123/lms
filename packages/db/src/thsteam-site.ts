/**
 * ĐỒNG BỘ WEBSITE SANG TH STEAM ACADEMY (docs/KHUNG-CHUONG-TRINH.md · mục Website).
 *
 * Dùng cho `pnpm db:seed-thsteam` (chạy lại an toàn):
 *  - Khung chung (đầu / chân trang, app_settings "site_chrome") → khung mặc định TH STEAM (hotline, website, menu mới).
 *  - Khối trang /dang-ky ("register") → chữ "Đăng ký học trải nghiệm 1:1".
 *  - Trang chủ + các trang con (Giới thiệu, Chương trình học, 4 chuyên ngành, Liên hệ, 2 chính sách) → nội dung dựng từ danh mục chuẩn.
 *    Trang đã có: ghi đè NHÁP bằng nội dung mới (bản cũ vẫn nằm trong lịch sử xuất bản). `publish` = xuất bản luôn.
 *  - 5 landing chạy quảng cáo (/lp/hoc-cong-nghe-online + 4 chuyên ngành, core/landing/ads.ts): tạo / cập nhật như trên,
 *    NHƯNG trang đã có người sửa trong quản trị (updatedBy khác rỗng) thì giữ nguyên — trừ khi gọi với `forceAds`.
 *  - Trang khoá học cũ của khung website (Lập trình Robot, Luyện thi RoboSim, Học online) → "archived" (ẩn, không xoá).
 *  - Trang đã gộp vào trang chính một trang (SITE_MERGED: Giới thiệu, Liên hệ, 4 trang chuyên ngành) → "archived";
 *    đường dẫn cũ chuyển hướng 308 tới đúng phần của trang chính (apps/web/next.config.ts).
 */
import { eq, inArray, sql } from "drizzle-orm";
import { appSettings, landingPageHistory, landingPages, siteBlocks } from "./schema/index";
import { ADS_LANDINGS, DEFAULT_CHROME, HOME_PAGE, SITE_DEMO_PAGES, SITE_MERGED, SITE_RETIRED_SLUGS, TH_REGISTER_BLOCK, normalizeLanding } from "@satarobo/core";
import type { Database } from "./index";

export interface ThSiteResult { created: string[]; updated: string[]; published: string[]; archived: string[]; kept: string[] }

export async function syncThSteamWebsite(db: Database, opts: { publish: boolean; actorId?: string | null; forceAds?: boolean }): Promise<ThSiteResult> {
  const actor = opts.actorId ?? null;
  const r: ThSiteResult = { created: [], updated: [], published: [], archived: [], kept: [] };

  await db.insert(appSettings).values({ key: "site_chrome", value: DEFAULT_CHROME, updatedBy: actor })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: DEFAULT_CHROME, updatedBy: actor, updatedAt: new Date() } });

  const reg = { title: TH_REGISTER_BLOCK.title, subtitle: TH_REGISTER_BLOCK.subtitle, thankYou: TH_REGISTER_BLOCK.thankYou };
  await db.insert(siteBlocks).values({ page: "register", data: reg, updatedBy: actor })
    .onConflictDoUpdate({ target: siteBlocks.page, set: { data: reg, version: sql`${siteBlocks.version} + 1`, updatedBy: actor, updatedAt: new Date() } });

  const merged = new Set(SITE_MERGED.map((m) => m.slug));
  const pages = [
    { slug: HOME_PAGE.slug, title: HOME_PAGE.title, template: HOME_PAGE.template, variant: HOME_PAGE.variant, seoTitle: HOME_PAGE.seoTitle, seoDescription: HOME_PAGE.seoDescription, seoImage: HOME_PAGE.seoImage, ads: false, build: () => HOME_PAGE.build() },
    // Trang đã gộp vào trang chính (Giới thiệu, Liên hệ, 4 trang chuyên ngành) không dựng lại — bị lưu trữ ở cuối hàm
    ...SITE_DEMO_PAGES.filter((p) => !merged.has(p.slug)).map((p) => ({ ...p, seoImage: "", ads: false })),
    ...ADS_LANDINGS.map((p) => ({ slug: p.slug, title: p.title, template: p.template, variant: p.variant, seoTitle: p.seoTitle, seoDescription: p.seoDescription, seoImage: p.seoImage, ads: true, build: () => p.build() })),
  ];
  for (const p of pages) {
    const doc = normalizeLanding(p.build());
    // Bản xuất bản là "ảnh chụp" gồm tiêu đề, kiểu giao diện, SEO và nội dung (khớp publishedSnapshot ở packages/api)
    const snapshot = { title: p.title, variant: p.variant, seoTitle: p.seoTitle, seoDescription: p.seoDescription, seoImage: p.seoImage, doc };
    const now = new Date();
    const [have] = await db.select().from(landingPages).where(eq(landingPages.slug, p.slug)).limit(1);
    if (have && p.ads && have.updatedBy && !opts.forceAds) { r.kept.push(p.slug); continue; }
    if (!have) {
      const [row] = await db.insert(landingPages).values({
        slug: p.slug, title: p.title, template: p.template, variant: p.variant, seoTitle: p.seoTitle, seoDescription: p.seoDescription, seoImage: p.seoImage || null, draft: doc,
        createdBy: actor, updatedBy: actor,
        ...(opts.publish ? { published: snapshot, status: "published", publishedVersion: 1, publishedAt: now } : { status: "draft" }),
      }).returning({ id: landingPages.id });
      if (opts.publish) { await db.insert(landingPageHistory).values({ pageId: row!.id, version: 1, snapshot, createdBy: actor }); r.published.push(p.slug); }
      r.created.push(p.slug);
      continue;
    }
    const base = { title: p.title, template: p.template, variant: p.variant, seoTitle: p.seoTitle, seoDescription: p.seoDescription, seoImage: p.seoImage || have.seoImage, draft: doc, version: have.version + 1, updatedBy: actor, updatedAt: now };
    if (opts.publish) {
      const v = have.publishedVersion + 1;
      await db.update(landingPages).set({ ...base, published: snapshot, status: "published", publishedVersion: v, publishedAt: now }).where(eq(landingPages.id, have.id));
      await db.insert(landingPageHistory).values({ pageId: have.id, version: v, snapshot, createdBy: actor }).onConflictDoNothing();
      r.published.push(p.slug);
    } else {
      // Chỉ ghi nháp; trang đang công khai giữ bản cũ cho tới khi quản trị bấm Xuất bản
      await db.update(landingPages).set({ ...base, status: have.status === "archived" ? "draft" : have.status }).where(eq(landingPages.id, have.id));
    }
    r.updated.push(p.slug);
  }

  const old = await db.update(landingPages).set({ status: "archived", updatedBy: actor, updatedAt: new Date() })
    .where(inArray(landingPages.slug, [...SITE_RETIRED_SLUGS, ...merged])).returning({ slug: landingPages.slug });
  r.archived = old.map((o) => o.slug);
  return r;
}
