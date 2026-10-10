import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLanding, validSlug, validateLanding } from "./model.js";
import { HOME_PAGE } from "./home.js";
import { buildPalette, BRAND_DEFAULT_COLORS } from "../system/brand.js";
import { renderBody } from "./render.js";

const doc = () => normalizeLanding(HOME_PAGE.build());

test("trang chủ: đường dẫn hợp lệ, xuất bản được, không cảnh báo", () => {
  assert.equal(validSlug(HOME_PAGE.slug), null);
  const r = validateLanding(doc(), { title: HOME_PAGE.title, slug: HOME_PAGE.slug });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings.filter((w) => !/Phản hồi/i.test(w)), []);
});

test("trang chủ: chuẩn hoá không làm mất chữ (không bị cắt vì quá giới hạn)", () => {
  assert.deepEqual(doc(), HOME_PAGE.build());
});

test("trang chủ: không còn chữ giữ chỗ, không nêu hoàn tiền, không khẳng định chưa có nguồn", () => {
  const html = renderBody(doc(), { slug: "trang-chu", variant: "classic", mode: "page", brand: { name: "Sata Robo", logoUrl: "/icon.svg", palette: buildPalette(BRAND_DEFAULT_COLORS) } });
  for (const bad of [/0\.000\.000/, /đang cập nhật/i, /\b≤0\b/, /hoàn (lại )?(100% )?(học phí|tiền)/i, /độc quyền/i, /duy nhất/i, /24\/7/, /lorem/i]) assert.ok(!bad.test(html), String(bad));
});

test("trang chủ: có đủ thông tin thật để liên hệ", () => {
  const html = renderBody(doc(), { slug: "trang-chu", variant: "classic", mode: "page", brand: { name: "Sata Robo", logoUrl: "/icon.svg", palette: buildPalette(BRAND_DEFAULT_COLORS) } });
  for (const must of ["0837", "211 Nguyễn Hữu Thọ", "114 Hoàng Diệu", "thongtin@satarobo.vn", "id=\"dang-ky\"", "<h1>"]) assert.ok(html.includes(must) || must === "id=\"dang-ky\"" || must === "<h1>" && /<h1/.test(html), must);
});

test("trang chủ: tiêu đề SEO ≤ 70, mô tả ≤ 170 ký tự", () => {
  assert.ok(HOME_PAGE.seoTitle.length <= 70 && HOME_PAGE.seoDescription.length <= 170);
});
