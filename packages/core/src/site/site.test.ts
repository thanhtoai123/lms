import test from "node:test";
import assert from "node:assert/strict";
import { COURSE_PREFIX, SITE_NODES, isSiteSlug, sitePathOf, siteGroupOf } from "./map.js";
import { DEFAULT_CHROME, applyChrome, chromeSections, normalizeChrome, validateChrome } from "./chrome.js";
import { SITE_DEMO_PAGES, SITE_TEMPLATES, siteDemoBySlug } from "./demo.js";
import { HOME_SLUG, normalizeLanding, validSlug, validateLanding, validUrl, type LandingDoc } from "../landing/model.js";
import { landingTemplateByKey, LANDING_TEMPLATES } from "../landing/templates.js";
import { renderBody, renderHeaderHtml, renderFooterHtml, type RenderCtx } from "../landing/render.js";
import { buildPalette, BRAND_DEFAULT_COLORS } from "../system/brand.js";

const ctx = (over: Partial<RenderCtx> = {}): RenderCtx => ({ slug: "x", variant: "classic", mode: "page", brand: { name: "Sata Robo", logoUrl: "", palette: buildPalette(BRAND_DEFAULT_COLORS) }, ...over });

test("sơ đồ: đường dẫn trang suy ra từ slug, đúng với danh sách trang", () => {
  assert.equal(sitePathOf(HOME_SLUG), "/");
  assert.equal(sitePathOf("gioi-thieu"), "/gioi-thieu");
  assert.equal(sitePathOf("khoa-hoc"), "/khoa-hoc");
  assert.equal(sitePathOf("khoa-hoc-lap-trinh-robot"), "/khoa-hoc/lap-trinh-robot");
  assert.equal(sitePathOf("chinh-sach-bao-mat"), "/chinh-sach/bao-mat");
  assert.equal(sitePathOf("thu-nghiem"), null, "landing quảng cáo không thuộc khung website");
  assert.equal(sitePathOf(COURSE_PREFIX), null);
  assert.equal(isSiteSlug("khoa-hoc"), true);
  assert.equal(siteGroupOf("khoa-hoc-x"), "course");
  for (const n of SITE_NODES) {
    if (n.slug) { assert.equal(sitePathOf(n.slug), n.path, n.key); assert.equal(validSlug(n.slug), null, n.key); }
    assert.ok(n.path.startsWith("/"));
  }
  const keys = SITE_NODES.map((n) => n.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(new Set(SITE_NODES.map((n) => n.path)).size, SITE_NODES.length, "không trùng đường dẫn");
});

test("khung chung: mặc định hợp lệ, menu trỏ tới trang có thật trong sơ đồ", () => {
  assert.deepEqual(validateChrome(DEFAULT_CHROME), []);
  const paths = new Set(SITE_NODES.map((n) => n.path));
  for (const l of [...DEFAULT_CHROME.nav, ...DEFAULT_CHROME.links]) assert.ok(paths.has(l.href), `${l.label} → ${l.href}`);
  assert.ok(paths.has(DEFAULT_CHROME.ctaUrl));
});

test("khung chung: chuẩn hoá cắt chuỗi, bỏ dòng rỗng, chặn liên kết nguy hiểm", () => {
  const c = normalizeChrome({ ...DEFAULT_CHROME, nav: [{ label: "A", href: "javascript:alert(1)" }, { label: "", href: "" }, ...Array.from({ length: 9 }, (_, i) => ({ label: `M${i}`, href: "/x" }))], ctaLabel: "x".repeat(200) });
  assert.equal(c.ctaLabel.length, 40);
  assert.equal(c.nav.length, 6);
  const errs = validateChrome(c);
  assert.ok(errs.some((e) => /Menu #1/.test(e)));
  assert.ok(!validUrl("javascript:alert(1)"));
  assert.deepEqual(normalizeChrome(null), DEFAULT_CHROME);
  assert.equal(validateChrome({ ...DEFAULT_CHROME, ctaLabel: "" }).length > 0, true);
  assert.equal(validateChrome({ ...DEFAULT_CHROME, email: "khong-phai-email" }).length > 0, true);
});

test("khung chung: thay đầu / chân trang, giữ khối ở giữa và id", () => {
  const doc: LandingDoc = normalizeLanding(siteDemoBySlug("gioi-thieu")!.build());
  const changed = applyChrome(doc, { ...DEFAULT_CHROME, phone: "0900 000 111", nav: [{ label: "Chỉ một mục", href: "/x" }] });
  assert.equal(changed.sections[0]!.type, "header");
  assert.equal(changed.sections.at(-1)!.type, "footer");
  assert.equal(changed.sections.length, doc.sections.length);
  assert.equal(changed.sections[0]!.data.phone, "0900 000 111");
  assert.equal(changed.sections[0]!.lists.nav!.length, 1);
  assert.equal(changed.sections[0]!.id, doc.sections[0]!.id);
  // không đổi khối giữa
  assert.deepEqual(changed.sections.slice(1, -1), doc.sections.slice(1, -1));
  // áp lên tài liệu thiếu đầu / chân trang thì tự thêm
  const bare = applyChrome({ sections: [] }, DEFAULT_CHROME);
  assert.deepEqual(bare.sections.map((s) => s.type), ["header", "footer"]);
});

test("khung chung: dựng được đầu / chân trang HTML, logo về trang chủ", () => {
  const { header, footer } = chromeSections(DEFAULT_CHROME);
  const h = renderHeaderHtml(header, ctx({ homeHref: "/" }));
  assert.ok(h.includes('class="lp-brand" href="/"') && h.includes("/gioi-thieu") && h.includes("tel:0837312860"));
  assert.ok(renderHeaderHtml(header, ctx()).includes('href="#top"'));
  const f = renderFooterHtml(footer, ctx());
  assert.ok(f.includes("211 Nguyễn Hữu Thọ") && f.includes("/chinh-sach/bao-mat") && f.includes("thongtin@satarobo.vn"));
});

test("trang demo: đủ trang, slug đúng sơ đồ, xuất bản được, mỗi khối có dấu [DEMO]", () => {
  const slugsInMap = new Set(SITE_NODES.filter((n) => n.slug && n.slug !== HOME_SLUG && n.group !== "system").map((n) => n.slug));
  assert.deepEqual(new Set(SITE_DEMO_PAGES.map((p) => p.slug)), slugsInMap, "mỗi trang con trong sơ đồ đều có bản demo");
  for (const p of SITE_DEMO_PAGES) {
    assert.ok(isSiteSlug(p.slug), p.slug);
    const doc = normalizeLanding(p.build());
    assert.deepEqual(doc, p.build(), `${p.slug}: chuẩn hoá không làm mất chữ`);
    const r = validateLanding(doc, { title: p.title, slug: p.slug });
    assert.deepEqual(r.errors, [], p.slug);
    assert.ok(p.seoTitle.length <= 70 && p.seoDescription.length <= 170, `${p.slug} SEO`);
    // mọi khối đang bật (trừ đầu / chân trang) có chữ [DEMO] ở đâu đó → được nhắc khi xuất bản
    for (const s of doc.sections.filter((x) => x.enabled && x.type !== "header" && x.type !== "footer" && x.type !== "form")) {
      const all = [...Object.values(s.data), ...Object.values(s.lists).flatMap((rows) => rows.flatMap((x) => Object.values(x)))].join(" ");
      assert.ok(/\[DEMO\]/.test(all), `${p.slug}/${s.id} thiếu dấu [DEMO]`);
    }
    assert.ok(r.warnings.length > 0, `${p.slug}: phải nhắc còn chữ demo`);
    assert.equal(doc.sections[0]!.type, "header");
    assert.ok(renderBody(doc, { slug: p.slug, variant: p.variant, mode: "page", brand: { name: "Sata Robo", logoUrl: "", palette: buildPalette(BRAND_DEFAULT_COLORS) } }).includes("<h1>"), `${p.slug}: có h1`);
  }
});

test("trang demo: liên kết nội bộ đều trỏ tới trang có trong sơ đồ", () => {
  const paths = new Set(SITE_NODES.map((n) => n.path));
  for (const p of SITE_DEMO_PAGES) {
    const doc = p.build();
    for (const s of doc.sections) {
      const urls = [...Object.entries(s.data), ...Object.values(s.lists).flatMap((rows) => rows.flatMap((r) => Object.entries(r)))].filter(([k, v]) => /url|href/i.test(k) && v.startsWith("/")).map(([, v]) => v);
      for (const u of urls) assert.ok(paths.has(u), `${p.slug}: ${u} không có trong sơ đồ`);
    }
  }
});

test("mẫu tạo trang con tìm được theo khoá, không lẫn vào danh sách mẫu landing", () => {
  for (const t of SITE_TEMPLATES) assert.ok(landingTemplateByKey(t.template), t.template);
  assert.equal(LANDING_TEMPLATES.some((t) => t.key.startsWith("site-")), false);
  assert.equal(landingTemplateByKey("khong-co"), null);
});

test("nội dung demo không có số thành tích, giá, lời phụ huynh", () => {
  for (const p of SITE_DEMO_PAGES) {
    const doc = p.build();
    for (const s of doc.sections.filter((x) => x.enabled)) {
      assert.ok(s.type !== "stats" && s.type !== "testimonials", `${p.slug}: khối ${s.type} phải tắt`);
      if (s.type === "programs") for (const r of s.lists.items!) assert.equal(r.price, "", `${p.slug}: không có giá`);
    }
  }
});
