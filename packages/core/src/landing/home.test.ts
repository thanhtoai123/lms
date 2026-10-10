import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLanding, validSlug, validateLanding } from "./model.js";
import { HOME_PAGE } from "./home.js";
import { buildPalette, BRAND_DEFAULT_COLORS } from "../system/brand.js";
import { renderBody } from "./render.js";

const doc = () => normalizeLanding(HOME_PAGE.build());

const DEMO_IDS = ["phan-hoi", "doi-ngu", "hoc-vien"];

test("trang chủ: đường dẫn hợp lệ, xuất bản được, chỉ cảnh báo đúng 3 khối chữ mẫu", () => {
  assert.equal(validSlug(HOME_PAGE.slug), null);
  const r = validateLanding(doc(), { title: HOME_PAGE.title, slug: HOME_PAGE.slug });
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, DEMO_IDS.length);
  assert.ok(r.warnings.every((w) => /\[DEMO\]/.test(w)));
});

test("trang chủ: theo thứ tự các phần của trang mẫu (hero → số liệu → … → hỏi đáp → form)", () => {
  const ids = doc().sections.map((s) => s.id);
  const order = ["hero", "stats", "features", "programs", "uu-dai", "gia-tri", "hanh-trang", "ket-luan", "lo-trinh", "steps", "he-sinh-thai", "phan-hoi", "doi-ngu", "hoc-vien", "faq", "form"];
  assert.deepEqual(ids.filter((i) => order.includes(i)), order);
  assert.equal(ids[0], "header");
  assert.equal(ids[ids.length - 1], "footer");
});

test("trang chủ: chữ [DEMO] chỉ nằm ở 3 khối chưa có dữ liệu thật; các khối còn lại là chữ thật", () => {
  for (const s of doc().sections) {
    const has = /\[demo\]/i.test(JSON.stringify(s));
    assert.equal(has, DEMO_IDS.includes(s.id), s.id);
    if (DEMO_IDS.includes(s.id)) assert.ok(s.enabled, s.id);
  }
});

test("trang chủ: mọi nút kêu gọi đều dẫn tới form cuối trang hoặc gọi điện (chỉ một form mỗi trang)", () => {
  const urls: string[] = [];
  for (const s of doc().sections) {
    for (const k of ["primaryUrl", "secondaryUrl", "ctaUrl"]) if (s.data[k]) urls.push(s.data[k]!);
    for (const rows of Object.values(s.lists)) for (const r of rows) if (r.url) urls.push(r.url);
  }
  assert.ok(urls.length >= 8);
  assert.ok(urls.every((u) => u === "#dang-ky" || u.startsWith("tel:")), urls.join(" "));
  assert.equal(doc().sections.filter((s) => s.type === "form").length, 1);
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
