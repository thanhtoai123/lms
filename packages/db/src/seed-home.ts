/**
 * TRANG CHỦ NGƯỜI DÙNG — tạo BẢN NHÁP /trang-chu từ nội dung kaizen (packages/core/src/landing/home.ts).
 * Chỉ tạo NHÁP, không xuất bản; không ghi đè nếu đã có. Quản trị xem trước, sửa rồi bấm Xuất bản.
 *
 *   pnpm db:seed-home                # tạo nháp nếu chưa có
 *   pnpm db:seed-home --lam-moi      # ghi lại NHÁP bằng bản chữ mới trong home.ts (chỉ khi trang CHƯA xuất bản; bản đang công khai không đụng tới)
 */
import "./env";
import { eq, sql } from "drizzle-orm";
import { landingPages } from "./schema/index";
import { HOME_PAGE, normalizeLanding } from "@satarobo/core";
import { createDb } from "./index";

const refresh = process.argv.includes("--lam-moi");
const db = createDb();
const have = await db.query.landingPages.findFirst({ where: eq(landingPages.slug, HOME_PAGE.slug) });
if (have && refresh && have.status !== "published") {
  await db.update(landingPages).set({
    title: HOME_PAGE.title, template: HOME_PAGE.template, variant: HOME_PAGE.variant, seoTitle: HOME_PAGE.seoTitle, seoDescription: HOME_PAGE.seoDescription,
    draft: normalizeLanding(HOME_PAGE.build()), version: sql`${landingPages.version} + 1`, updatedAt: new Date(),
  }).where(eq(landingPages.id, have.id));
  console.log(`✓ Đã ghi lại NHÁP trang chủ "${HOME_PAGE.slug}" bằng bản chữ mới (cấu trúc theo trang mẫu).`);
} else if (have && refresh) {
  console.log(`! Trang "${HOME_PAGE.slug}" đang công khai — không ghi đè. Muốn đổi: vào Website → Landing page, sửa nháp rồi Xuất bản.`);
} else if (have) {
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
