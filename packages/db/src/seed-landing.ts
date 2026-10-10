/**
 * LANDING THỬ NGHIỆM — tạo một landing đã xuất bản từ mẫu "Đầy đủ" để xem ngay /lp/thu-nghiem (docs/LANDING-PAGE.md).
 * Chỉ dùng khi phát triển; an toàn chạy lại (không ghi đè nếu đã có).
 *
 *   pnpm db:seed-landing
 */
import "./env";
import { eq } from "drizzle-orm";
import { landingPages, landingPageHistory } from "./schema/index";
import { LANDING_TEMPLATES, normalizeLanding } from "@satarobo/core";
import { createDb } from "./index";

if (process.env.NODE_ENV === "production") throw new Error("Không chạy seed landing ở production");
const db = createDb();
const SLUG = "thu-nghiem";
const tpl = LANDING_TEMPLATES[0]!;

const have = await db.query.landingPages.findFirst({ where: eq(landingPages.slug, SLUG) });
if (have) {
  console.log(`✓ Đã có landing /lp/${SLUG} — giữ nguyên.`);
} else {
  const doc = normalizeLanding(tpl.build());
  const snapshot = { title: "Landing thử nghiệm", variant: tpl.variant, seoTitle: "", seoDescription: "", seoImage: "", doc };
  const [row] = await db.insert(landingPages).values({
    slug: SLUG, title: "Landing thử nghiệm", template: tpl.key, variant: tpl.variant, draft: doc, published: snapshot,
    status: "published", publishedVersion: 1, publishedAt: new Date(),
  }).returning();
  await db.insert(landingPageHistory).values({ pageId: row!.id, version: 1, snapshot });
  console.log(`✓ Đã tạo landing thử nghiệm đã xuất bản: /lp/${SLUG}`);
}
process.exit(0);
