import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLanding, validSlug, validateLanding, validImage, validUrl } from "./model.js";
import { HOME_PAGE, HOME_SOURCES, HOME_TRACK_KEYS, SITE_MERGED, homeFocus } from "./home.js";
import { buildPalette, BRAND_DEFAULT_COLORS } from "../system/brand.js";
import { TH_BRAND } from "../system/th-brand.js";
import { SITE_NODES } from "../site/map.js";
import { renderBody, renderParts, type RenderCtx } from "./render.js";
import { landingJsonLd } from "./seo.js";
import { LEAD_INTERESTS } from "./ads.js";

const doc = () => normalizeLanding(HOME_PAGE.build());
const ctx = (over: Partial<RenderCtx> = {}): RenderCtx => ({ slug: "trang-chu", variant: "classic", mode: "page", brand: { name: TH_BRAND.name, logoUrl: "/icon.svg", palette: buildPalette(BRAND_DEFAULT_COLORS) }, ...over });
const html = (over: Partial<RenderCtx> = {}) => renderBody(doc(), ctx(over));

test("trang chính: đường dẫn hợp lệ, xuất bản được không cảnh báo", () => {
  assert.equal(validSlug(HOME_PAGE.slug), null);
  const r = validateLanding(doc(), { title: HOME_PAGE.title, slug: HOME_PAGE.slug });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test("trang chính: mạch nỗi lo → bối cảnh → giải pháp → chuyên ngành → giá trị → bằng chứng → hành động", () => {
  const ids = doc().sections.map((s) => s.id);
  const order = ["mo-dau", "noi-lo", "tuong-lai", "sang-tao", "chuyen-nganh", "con-thay-doi", "cam-ket", "buoi-hoc", "san-pham", "giang-vien", "hoc-thu", "faq", "form"];
  assert.deepEqual(ids.filter((i) => order.includes(i)), order);
  assert.equal(ids[0], "header");
  assert.equal(ids[ids.length - 1], "footer");
  assert.equal(doc().sections.find((s) => s.id === "phan-hoi")!.enabled, false, "lời phụ huynh tắt cho tới khi có lời thật");
  assert.equal(doc().sections.filter((s) => s.type === "form").length, 1);
});

test("trang chính: không kể thông số kỹ thuật (học phần, số buổi) — chỉ nỗi lo và giá trị", () => {
  const h = html();
  for (const bad of [/học phần(?! mềm)/i, /\b45 buổi/, /\b15 buổi/, /\b90 buổi/, /Basic|Advanced|Expert/]) assert.ok(!bad.test(h), String(bad));
});

test("trang chính: không chữ giữ chỗ, không 'miễn phí', không học phí, không khẳng định cấm, không thương hiệu cũ", () => {
  const h = html();
  for (const bad of [/0\.000\.000/, /đang cập nhật/i, /miễn phí/i, /\d\.\d{3}\.\d{3}đ/, /độc quyền/i, /duy nhất/i, /số 1/i, /hàng đầu/i, /tốt nhất/i, /cam kết đầu ra/i, /24\/7/, /lorem/i, /sata/i, /satarobo/i]) assert.ok(!bad.test(h), String(bad));
});

test("trang chính: MỌI con số đều có nguồn kèm liên kết https tới đúng danh sách nguồn đã kiểm", () => {
  const known = new Set<string>(Object.values(HOME_SOURCES));
  let n = 0;
  for (const s of doc().sections.filter((x) => x.type === "insights")) {
    for (const r of s.lists.items ?? []) {
      n++;
      assert.ok(r.value && r.source, `${s.id}: ${r.label}`);
      assert.ok(known.has(r.sourceUrl ?? ""), `${s.id}: ${r.value} — nguồn ${r.sourceUrl}`);
    }
  }
  assert.ok(n >= 7);
  const h = html();
  assert.equal((h.match(/class="lp-src"/g) ?? []).length, n, "nguồn hiện cạnh từng con số");
  assert.match(h, /lp-insights lp-dark/);
});

test("trang chính: liên kết nội bộ đều tới phần có thật của trang, trang website có thật hoặc hotline", () => {
  const paths = new Set(SITE_NODES.map((n) => n.path));
  const h = html();
  const ids = new Set([...h.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  ids.add("dang-ky"); // phần form do React dựng
  for (const m of h.matchAll(/href="([^"]+)"/g)) {
    const u = m[1]!.replace(/&amp;/g, "&");
    if (u.startsWith("https://")) continue;
    if (u.startsWith("#")) { assert.ok(u === "#top" || ids.has(u.slice(1)), `neo ${u}`); continue; }
    assert.ok(validUrl(u), u);
    assert.ok(u.startsWith("tel:") || paths.has(u.split("#")[0]!), u);
  }
});

test("trang chính: 4 tab chuyên ngành, không JavaScript; ?nganh= mở đúng tab, đổi H1, chọn sẵn ngành trong form", () => {
  const h = html();
  assert.equal((h.match(/class="lp-tab-in"/g) ?? []).length, 4);
  assert.equal((h.match(/ checked/g) ?? []).length, 1);
  assert.doesNotMatch(h, /<script/i);
  assert.match(h, /<h1>Biến giờ con ngồi trước màn hình/);
  const interests = new Set(LEAD_INTERESTS.map((x) => x.value));
  for (const [i, key] of Object.values(HOME_TRACK_KEYS).entries()) {
    assert.equal(homeFocus(key.toUpperCase()), key);
    const parts = renderParts(doc(), ctx({ focus: key }));
    const lead = parts.find((p) => p.kind === "leadHero");
    assert.ok(lead && lead.kind === "leadHero");
    assert.ok(interests.has(lead.interest), `${key}: ${lead.interest}`);
    assert.doesNotMatch(lead.left, /Biến giờ con ngồi/, `${key}: H1 đổi theo ngành`);
    const form = parts.find((p) => p.kind === "form");
    assert.ok(form && form.kind === "form" && form.interest === lead.interest);
    const body = renderBody(doc(), ctx({ focus: key }));
    const radios = [...body.matchAll(/<input class="lp-tab-in"[^>]*>/g)].map((m) => m[0]);
    assert.ok(radios[i]!.includes(" checked"), `${key} mở tab ${i + 1}`);
  }
  assert.equal(homeFocus("<script>"), "");
  assert.equal(homeFocus(""), "");
});

test("trang chính: ảnh hợp lệ, có file thật, ảnh phần mềm ghi nguồn", async () => {
  const { existsSync } = await import("node:fs");
  const imgs: string[] = [];
  for (const s of doc().sections) {
    for (const k of ["image", "photo", "certImage"]) if (s.data[k]) imgs.push(s.data[k]!);
    for (const rows of Object.values(s.lists)) for (const r of rows) if (r.image) imgs.push(r.image);
  }
  assert.ok(imgs.length >= 12);
  for (const u of imgs) {
    assert.ok(validImage(u), u);
    assert.ok(existsSync(new URL(`../../../../apps/web/public${u}`, import.meta.url)), u);
  }
  const g = doc().sections.find((s) => s.id === "san-pham")!;
  assert.ok((g.lists.items ?? []).every((r) => /^(Ảnh|Minh hoạ)[:;] /.test(r.credit ?? "") && /^https:\/\//.test(r.creditUrl ?? "")));
  const t = doc().sections.find((s) => s.id === "chuyen-nganh")!;
  assert.ok((t.lists.items ?? []).every((r) => !!r.credit && !!r.imageAlt));
});

test("trang chính: SEO — tiêu đề ≤ 60–70, mô tả ≤ 160, một H1, ảnh có alt, JSON-LD có FAQ và 4 khoá học", () => {
  assert.ok(HOME_PAGE.seoTitle.length <= 70, `${HOME_PAGE.seoTitle.length}`);
  assert.ok(HOME_PAGE.seoDescription.length <= 160, `${HOME_PAGE.seoDescription.length}`);
  assert.ok(validImage(HOME_PAGE.seoImage));
  const h = html();
  assert.equal((h.match(/<h1/g) ?? []).length, 1, "đúng một H1");
  const lead = renderParts(doc(), ctx()).find((p) => p.kind === "leadHero");
  assert.ok(lead && lead.kind === "leadHero" && (lead.left.match(/<h1/g) ?? []).length === 1);
  for (const m of h.matchAll(/<img [^>]*>/g)) if (!m[0].includes("/icon.svg")) assert.match(m[0], /alt="[^"]{3,}"/, m[0]); // logo cạnh tên thương hiệu là ảnh trang trí
  const ld = landingJsonLd(doc(), { baseUrl: "https://thsteam.edu.vn", path: "/", title: HOME_PAGE.seoTitle, brand: { name: TH_BRAND.name } }) as { "@graph": { "@type": string }[] };
  const types = ld["@graph"].map((x) => x["@type"]);
  assert.ok(types.includes("FAQPage"));
  assert.equal(types.filter((x) => x === "Course").length, 4);
});

test("trang chính: thông tin liên hệ thật theo bộ nhận diện", () => {
  const h = html();
  for (const must of [TH_BRAND.hotline, `tel:${TH_BRAND.hotlineTel}`, TH_BRAND.website, TH_BRAND.legalName.replace("&", "&amp;"), TH_BRAND.taglineVi]) assert.ok(h.includes(must), must);
});

test("trang chính: chuẩn hoá không làm mất chữ (không bị cắt vì quá giới hạn)", () => {
  assert.deepEqual(doc(), HOME_PAGE.build());
});

test("trang cũ đã gộp: chuyển hướng tới phần có thật của trang chính, trang chuyên ngành mở đúng tab", () => {
  const nodes = new Map(SITE_NODES.map((n) => [n.slug, n.path]));
  const ids = new Set(doc().sections.map((s) => s.id));
  ids.add("giang-vien"); ids.add("dang-ky");
  for (const m of SITE_MERGED) {
    assert.equal(nodes.get(m.slug), m.from, m.slug);
    const [path, hash] = m.to.split("#");
    assert.ok(hash && ids.has(hash), m.to);
    const q = new URL(`https://x${path}`).searchParams.get("nganh");
    if (m.from.startsWith("/khoa-hoc/")) assert.equal(homeFocus(q), q);
  }
});

test("website một trang: trang chính, menu chung, landing quảng cáo không còn dẫn tới /khoa-hoc", async () => {
  const { DEFAULT_CHROME } = await import("../site/chrome.js");
  const { ADS_LANDINGS } = await import("./ads.js");
  const all = JSON.stringify([HOME_PAGE.build(), DEFAULT_CHROME, ...ADS_LANDINGS.map((p) => p.build())]);
  assert.doesNotMatch(all, /"\/khoa-hoc/);
  assert.ok(SITE_MERGED.some((m) => m.from === "/khoa-hoc"));
});

test("trang chính: khối buổi học trải nghiệm — 4 bước, giá trị gia đình nhận, nút đặt lịch tới form, không so sánh giá ảo", () => {
  const t = doc().sections.find((s) => s.id === "hoc-thu")!;
  assert.equal(t.type, "trial");
  assert.equal((t.lists.steps ?? []).length, 4);
  assert.ok((t.lists.gains ?? []).length >= 3);
  const h = html();
  assert.match(h, /class="lp-sec lp-trial" id="hoc-thu"/);
  assert.match(h, /lp-trial-card[\s\S]*href="#dang-ky"/);
  assert.doesNotMatch(h, /trị giá|giá gốc|1\.000\.000|0 ?đ\b/i, "không nêu giá gốc / giá trị quy đổi");
  const ld = JSON.stringify(landingJsonLd(doc(), { baseUrl: "https://thsteam.edu.vn", path: "/", title: HOME_PAGE.seoTitle, brand: { name: TH_BRAND.name } }));
  assert.match(ld, /"@type":"Service"[\s\S]*"price":"0"/);
});
