/**
 * TRANG CHỦ NGƯỜI DÙNG — tạo BẢN NHÁP /trang-chu từ nội dung kaizen (packages/core/src/landing/home.ts).
 * Chỉ tạo NHÁP, không xuất bản; không ghi đè nếu đã có. Quản trị xem trước, sửa rồi bấm Xuất bản.
 *
 *   pnpm db:seed-home
 */
import "./env";
import { eq } from "drizzle-orm";
import { landingPages } from "./schema/index";
import { HOME_PAGE, normalizeLanding } from "@satarobo/core";
import { createDb } from "./index";

const db = createDb();
const have = await db.query.landingPages.findFirst({ where: eq(landingPages.slug, HOME_PAGE.slug) });
if (have) {
  console.log(`✓ Đã có trang "${HOME_PAGE.slug}" (${have.status}) — giữ nguyên, không ghi đè.`);
} else {
  await db.insert(landingPages).values({
    slug: HOME_PAGE.slug, title: HOME_PAGE.title, template: HOME_PAGE.template, variant: HOME_PAGE.variant,
    seoTitle: HOME_PAGE.seoTitle, seoDescription: HOME_PAGE.seoDescription,
    draft: normalizeLanding(HOME_PAGE.build()), status: "draft",
  });
  console.log(`✓ Đã tạo BẢN NHÁP trang chủ "${HOME_PAGE.slug}". Vào Website → Landing page để xem trước và Xuất bản.`);
}
process.exit(0);
