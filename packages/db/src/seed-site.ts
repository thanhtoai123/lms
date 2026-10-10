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
import { and, eq } from "drizzle-orm";
import { landingPageHistory, landingPages } from "./schema/index";
import { SITE_DEMO_PAGES, normalizeLanding } from "@satarobo/core";
import { createDb } from "./index";

const args = new Set(process.argv.slice(2));
const publish = args.has("--publish") || (!args.has("--draft") && process.env.NODE_ENV !== "production");
const db = createDb();
let made = 0;
for (const p of SITE_DEMO_PAGES) {
  const doc = normalizeLanding(p.build());
  // Bản xuất bản là "ảnh chụp" gồm tiêu đề, kiểu giao diện, SEO và nội dung (khớp publishedSnapshot ở packages/api)
  const snapshot = { title: p.title, variant: p.variant, seoTitle: p.seoTitle, seoDescription: p.seoDescription, seoImage: "", doc };
  const have = await db.query.landingPages.findFirst({ where: eq(landingPages.slug, p.slug) });
  if (have) {
    // Vá bản chạy trước đó lưu nhầm tài liệu thô: chỉ sửa trang đang xuất bản mà bản xuất bản không có "doc"
    const pub = have.published as { doc?: unknown } | null;
    if (have.status === "published" && (!pub || typeof pub !== "object" || !("doc" in pub))) {
      await db.update(landingPages).set({ published: snapshot }).where(eq(landingPages.id, have.id));
      await db.update(landingPageHistory).set({ snapshot }).where(and(eq(landingPageHistory.pageId, have.id), eq(landingPageHistory.version, 1)));
      console.log(`~ ${p.slug}: đã vá bản xuất bản`);
    } else console.log(`= ${p.slug}: đã có (${have.status}) — giữ nguyên`);
    continue;
  }
  const now = new Date();
  const [row] = await db.insert(landingPages).values({
    slug: p.slug, title: p.title, template: p.template, variant: p.variant, seoTitle: p.seoTitle, seoDescription: p.seoDescription,
    draft: doc, ...(publish ? { published: snapshot, status: "published", publishedVersion: 1, publishedAt: now } : { status: "draft" }),
  }).returning();
  if (publish && row) await db.insert(landingPageHistory).values({ pageId: row.id, version: 1, snapshot });
  made++;
  console.log(`+ ${p.slug}: ${publish ? "đã xuất bản (DEMO)" : "nháp"}`);
}
console.log(`✓ Xong: tạo ${made}/${SITE_DEMO_PAGES.length} trang demo.${publish ? "" : " Vào Website → Cấu trúc & khung để xem và xuất bản."}`);
process.exit(0);
