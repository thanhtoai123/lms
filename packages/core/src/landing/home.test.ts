import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLanding, validSlug, validateLanding } from "./model.js";
import { HOME_PAGE } from "./home.js";
import { buildPalette, BRAND_DEFAULT_COLORS } from "../system/brand.js";
import { TH_BRAND } from "../system/th-brand.js";
import { SITE_NODES } from "../site/map.js";
import { renderBody } from "./render.js";

const doc = () => normalizeLanding(HOME_PAGE.build());
const html = () => renderBody(doc(), { slug: "trang-chu", variant: "classic", mode: "page", brand: { name: TH_BRAND.name, logoUrl: "/icon.svg", palette: buildPalette(BRAND_DEFAULT_COLORS) } });

test("trang chủ: đường dẫn hợp lệ, xuất bản được không cảnh báo (không còn chữ mẫu)", () => {
  assert.equal(validSlug(HOME_PAGE.slug), null);
  const r = validateLanding(doc(), { title: HOME_PAGE.title, slug: HOME_PAGE.slug });
  assert.deepEqual(r.errors, []);
  // khối phản hồi phụ huynh đang tắt (chưa có lời thật) nên không bị tính
  assert.deepEqual(r.warnings, []);
  assert.doesNotMatch(JSON.stringify(doc()), /\[demo\]/i);
});

test("trang chủ: theo thứ tự các phần của trang mẫu (hero → số liệu → … → hỏi đáp → form)", () => {
  const ids = doc().sections.map((s) => s.id);
  const order = ["hero", "stats", "features", "programs", "uu-dai", "gia-tri", "buoi-hoc", "hanh-trang", "ket-luan", "lo-trinh", "steps", "he-sinh-thai", "phan-hoi", "doi-ngu", "bao-cao", "faq", "form"];
  assert.deepEqual(ids.filter((i) => order.includes(i)), order);
  assert.equal(ids[0], "header");
  assert.equal(ids[ids.length - 1], "footer");
  assert.equal(doc().sections.find((s) => s.id === "phan-hoi")!.enabled, false, "phản hồi phụ huynh tắt cho tới khi có lời thật");
});

test("trang chủ: nút kêu gọi dẫn tới form cuối trang, gọi hotline hoặc trang chuyên ngành có thật (một form mỗi trang)", () => {
  const paths = new Set(SITE_NODES.map((n) => n.path));
  const urls: string[] = [];
  for (const s of doc().sections) {
    for (const k of ["primaryUrl", "secondaryUrl", "ctaUrl"]) if (s.data[k]) urls.push(s.data[k]!);
    for (const rows of Object.values(s.lists)) for (const r of rows) if (r.url) urls.push(r.url);
  }
  assert.ok(urls.length >= 8);
  for (const u of urls) assert.ok(u === "#dang-ky" || u === `tel:${TH_BRAND.hotlineTel}` || paths.has(u), u);
  assert.equal(urls.filter((u) => u.startsWith("/khoa-hoc/")).length, 4, "đủ 4 thẻ chuyên ngành");
  assert.equal(doc().sections.filter((s) => s.type === "form").length, 1);
});

test("trang chủ: chuẩn hoá không làm mất chữ (không bị cắt vì quá giới hạn)", () => {
  assert.deepEqual(doc(), HOME_PAGE.build());
});

test("trang chủ: không chữ giữ chỗ, không 'miễn phí', không học phí, không khẳng định chưa có nguồn, không còn thương hiệu cũ", () => {
  const h = html();
  for (const bad of [/0\.000\.000/, /đang cập nhật/i, /miễn phí/i, /\d\.\d{3}\.\d{3}đ/, /hoàn (lại )?(100% )?(học phí|tiền)/i, /độc quyền/i, /duy nhất/i, /số 1/i, /24\/7/, /lorem/i, /sata/i, /0837/, /satarobo/i]) assert.ok(!bad.test(h), String(bad));
});

test("trang chủ: có thông tin liên hệ thật theo bộ nhận diện", () => {
  const h = html();
  for (const must of [TH_BRAND.hotline, `tel:${TH_BRAND.hotlineTel}`, TH_BRAND.website, TH_BRAND.legalName.replace("&", "&amp;"), 'id="dang-ky"', TH_BRAND.tagline]) assert.ok(h.includes(must), must);
  assert.match(h, /<h1/);
});

test("trang chủ: tiêu đề SEO ≤ 70, mô tả ≤ 170 ký tự", () => {
  assert.ok(HOME_PAGE.seoTitle.length <= 70 && HOME_PAGE.seoDescription.length <= 170);
});

test("trang chủ: ảnh minh hoạ hợp lệ, có đủ file trong apps/web/public/anh-site và mô tả ghi rõ là hình minh hoạ", async () => {
  const { existsSync } = await import("node:fs");
  const { validImage } = await import("./model.js");
  const imgs: string[] = [];
  for (const s of doc().sections) {
    if (s.data.image) imgs.push(s.data.image);
    for (const rows of Object.values(s.lists)) for (const r of rows) if (r.image) imgs.push(r.image);
  }
  assert.equal(imgs.length, 9);
  for (const u of imgs) {
    assert.ok(validImage(u), u);
    assert.ok(existsSync(new URL(`../../../../apps/web/public${u}`, import.meta.url)), u);
  }
  const g = doc().sections.find((s) => s.id === "buoi-hoc")!;
  assert.ok((g.lists.items ?? []).every((r) => /minh hoạ/.test(r.caption ?? "")));
});

test("ảnh minh hoạ chỉ dùng màu trong bảng màu TH STEAM (cộng màu da, tóc của nhân vật)", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const dir = new URL("../../../../apps/web/public/anh-site/", import.meta.url);
  const palette = new Set(["#1d4ed8", "#1e40af", "#4f75e1", "#dbeafe", "#10b981", "#059669", "#d1fae5", "#f59e0b", "#d97706", "#fef3c7", "#f7d27a", "#0f172a", "#f8fafc", "#ffffff", "#e2e8f0", "#475569"]);
  const skinHair = new Set(["#f3cfae", "#d9a577", "#9a6440", "#2b1b17", "#1f1f2e", "#5a3825"]);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".svg"))) {
    const cols = new Set((readFileSync(new URL(f, dir), "utf8").match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((c) => c.toLowerCase()));
    for (const c of cols) assert.ok(palette.has(c) || skinHair.has(c), `${f}: màu ${c} ngoài bảng màu`);
  }
});
