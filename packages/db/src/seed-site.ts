/**
 * KHUNG WEBSITE — tạo các trang DEMO (Giới thiệu, Khoá học, 3 trang chi tiết khoá, Liên hệ, 2 trang chính sách)
 * từ packages/core/src/site/demo.ts. Mỗi khối có chữ "[DEMO]" để dễ thấy chỗ cần thay nội dung thật.
 *
 *   pnpm db:seed-site              # môi trường dev: tạo VÀ xuất bản để xem đủ khung
 *   pnpm db:seed-site --draft      # chỉ tạo bản nháp
 *   pnpm db:seed-site --publish    # ép xuất bản (kể cả production — không nên, chữ còn là DEMO)
 *
 * An toàn chạy lại: trang đã có thì giữ nguyên, không ghi đè. Khi NODE_ENV=production chỉ tạo nháp trừ khi có --publish.
 */
import "./env";
import { eq } from "drizzle-orm";
import { landingPageHistory, landingPages } from "./schema/index";
import { SITE_DEMO_PAGES, normalizeLanding } from "@satarobo/core";
import { createDb } from "./index";

const args = new Set(process.argv.slice(2));
const publish = args.has("--publish") || (!args.has("--draft") && process.env.NODE_ENV !== "production");
const db = createDb();
let made = 0;
for (const p of SITE_DEMO_PAGES) {
  const have = await db.query.landingPages.findFirst({ where: eq(landingPages.slug, p.slug) });
  if (have) { console.log(`= ${p.slug}: đã có (${have.status}) — giữ nguyên`); continue; }
  const doc = normalizeLanding(p.build());
  const now = new Date();
  const [row] = await db.insert(landingPages).values({
    slug: p.slug, title: p.title, template: p.template, variant: p.variant, seoTitle: p.seoTitle, seoDescription: p.seoDescription,
    draft: doc, ...(publish ? { published: doc, status: "published", publishedVersion: 1, publishedAt: now } : { status: "draft" }),
  }).returning();
  if (publish && row) await db.insert(landingPageHistory).values({ pageId: row.id, version: 1, snapshot: doc });
  made++;
  console.log(`+ ${p.slug}: ${publish ? "đã xuất bản (DEMO)" : "nháp"}`);
}
console.log(`✓ Xong: tạo ${made}/${SITE_DEMO_PAGES.length} trang demo.${publish ? "" : " Vào Website → Cấu trúc & khung để xem và xuất bản."}`);
process.exit(0);
