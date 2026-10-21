import test from "node:test";
import assert from "node:assert/strict";
import { COURSE_PREFIX, SITE_NODES, isSiteSlug, sitePathOf, siteGroupOf } from "./map.js";
import { DEFAULT_CHROME, applyChrome, chromeSections, normalizeChrome, validateChrome } from "./chrome.js";
import { SITE_DEMO_PAGES, SITE_DRAFT_SLUGS, SITE_RETIRED_SLUGS, SITE_TEMPLATES, siteDemoBySlug } from "./demo.js";
import { TH_TRACK_PAGE } from "./thsteam-content.js";
import { TH_TRACKS, TH_PROGRAMS, TH_PRICING, thProgramsOfTrack } from "../curriculum/thsteam.js";
import { TH_BRAND } from "../system/th-brand.js";
import { HOME_SLUG, normalizeLanding, validSlug, validateLanding, validUrl, type LandingDoc } from "../landing/model.js";
import { landingTemplateByKey, LANDING_TEMPLATES } from "../landing/templates.js";
import { renderBody, renderHeaderHtml, renderFooterHtml, type RenderCtx } from "../landing/render.js";
import { buildPalette, BRAND_DEFAULT_COLORS } from "../system/brand.js";

const ctx = (over: Partial<RenderCtx> = {}): RenderCtx => ({ slug: "x", variant: "classic", mode: "page", brand: { name: "TH STEAM Academy", logoUrl: "", palette: buildPalette(BRAND_DEFAULT_COLORS) }, ...over });

test("sơ đồ: đường dẫn trang suy ra từ slug, đúng với danh sách trang", () => {
  assert.equal(sitePathOf(HOME_SLUG), "/");
  assert.equal(sitePathOf("gioi-thieu"), "/gioi-thieu");
  assert.equal(sitePathOf("khoa-hoc"), "/khoa-hoc");
  assert.equal(sitePathOf("khoa-hoc-robotics-ai"), "/khoa-hoc/robotics-ai");
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
  for (const l of [...DEFAULT_CHROME.nav, ...DEFAULT_CHROME.links]) assert.ok(paths.has(l.href.split("#")[0]!), `${l.label} → ${l.href}`);
  assert.ok(paths.has(DEFAULT_CHROME.ctaUrl.split("#")[0]!));
  // thông tin liên hệ thật theo bộ nhận diện (học online nên không có địa chỉ cơ sở)
  assert.equal(DEFAULT_CHROME.phone, TH_BRAND.hotline);
  assert.equal(DEFAULT_CHROME.legal, TH_BRAND.legalName);
  assert.doesNotMatch(JSON.stringify(DEFAULT_CHROME), /sata|0837|Nguyễn Hữu Thọ|miễn phí/i);
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
  assert.ok(h.includes('class="lp-brand" href="/"') && h.includes("/#chuyen-nganh") && h.includes(`tel:${TH_BRAND.hotlineTel}`));
  assert.ok(renderHeaderHtml(header, ctx()).includes('href="#top"'));
  const f = renderFooterHtml(footer, ctx());
  assert.ok(f.includes("ClassIn") && f.includes("/chinh-sach/bao-mat") && f.includes("/chinh-sach/dieu-khoan") && f.includes(TH_BRAND.website));
});

test("trang con: đủ trang, slug đúng sơ đồ, xuất bản được; chỉ bản nháp chính sách bảo mật còn chữ [DEMO]", () => {
  const slugsInMap = new Set(SITE_NODES.filter((n) => n.slug && n.slug !== HOME_SLUG && n.group !== "system").map((n) => n.slug));
  assert.deepEqual(new Set(SITE_DEMO_PAGES.map((p) => p.slug)), slugsInMap, "mỗi trang con trong sơ đồ đều có nội dung dựng sẵn");
  for (const p of SITE_DEMO_PAGES) {
    assert.ok(isSiteSlug(p.slug), p.slug);
    const doc = normalizeLanding(p.build());
    assert.deepEqual(doc, p.build(), `${p.slug}: chuẩn hoá không làm mất chữ`);
    const r = validateLanding(doc, { title: p.title, slug: p.slug });
    assert.deepEqual(r.errors, [], p.slug);
    assert.ok(p.seoTitle.length <= 70 && p.seoDescription.length <= 170, `${p.slug} SEO`);
    const draft = SITE_DRAFT_SLUGS.includes(p.slug);
    assert.equal(/\[demo\]/i.test(JSON.stringify(doc)), draft, `${p.slug}: chữ [DEMO]`);
    assert.equal(r.warnings.length > 0, draft, `${p.slug}: ${r.warnings.join(" | ")}`);
    assert.equal(doc.sections[0]!.type, "header");
    const h = renderBody(doc, { slug: p.slug, variant: p.variant, mode: "page", brand: { name: "TH STEAM Academy", logoUrl: "", palette: buildPalette(BRAND_DEFAULT_COLORS) } });
    assert.ok(h.includes("<h1>"), `${p.slug}: có h1`);
    assert.doesNotMatch(h, /sata|0837|satarobo|miễn phí/i, `${p.slug}: không còn thương hiệu cũ / hứa miễn phí`);
  }
  for (const old of SITE_RETIRED_SLUGS) assert.equal(siteDemoBySlug(old), null, old);
});

test("trang chuyên ngành: mỗi chuyên ngành một trang, đủ chương trình, năm học, học phần, khoá luyện thi đúng danh mục", () => {
  for (const t of TH_TRACKS) {
    const p = siteDemoBySlug(TH_TRACK_PAGE[t.code].slug)!;
    assert.ok(p, t.code);
    assert.equal(sitePathOf(p.slug), TH_TRACK_PAGE[t.code].path);
    const doc = normalizeLanding(p.build());
    const all = JSON.stringify(doc);
    for (const pr of thProgramsOfTrack(t.code)) {
      assert.ok(doc.sections.some((s) => s.id === `lo-trinh-${pr.code.toLowerCase()}`), `${pr.code}: có khối lộ trình`);
      for (const y of pr.years) { assert.ok(all.includes(y.title), `${pr.code}: ${y.title}`); for (const m of y.modules) assert.ok(all.includes(m.name), `${pr.code}: ${m.name}`); }
      for (const c of pr.contests) assert.ok(all.includes(`${c.sessions} buổi`) && all.includes(c.short), `${pr.code}: luyện thi ${c.key}`);
    }
    // thẻ chương trình neo xuống khối lộ trình có thật
    const ids = new Set(doc.sections.map((s) => s.id));
    for (const r of doc.sections.find((s) => s.id === "chuong-trinh")!.lists.items!) assert.ok(ids.has(r.url!.slice(1)), r.url);
  }
});

test("trang chương trình học: lộ trình 4 chuyên ngành × 3 cấp học, 'Chưa mở' đúng chỗ, bảng học phí đúng TH_PRICING", () => {
  const doc = normalizeLanding(siteDemoBySlug("khoa-hoc")!.build());
  const body = doc.sections.find((s) => s.id === "lo-trinh")!.data.body!;
  for (const t of TH_TRACKS) assert.ok(body.includes(`## ${t.name}`), t.name);
  assert.equal((body.match(/Chưa mở/g) ?? []).length, TH_TRACKS.length * 3 - new Set(TH_PROGRAMS.map((p) => `${p.track}/${p.level}`)).size);
  const prices = doc.sections.find((s) => s.id === "bang-gia")!.lists.items!.map((r) => r.price);
  assert.deepEqual(prices, ["5.625.000đ", "9.750.000đ", "19.125.000đ", "38.250.000đ", "3.000.000đ", "6.000.000đ"]);
  assert.equal(TH_PRICING.year.group.price, 5_625_000);
  assert.ok(doc.sections.some((s) => s.id === "hoc-phi" && s.type === "text"), "có neo #hoc-phi cho menu");
});

test("trang demo: liên kết nội bộ đều trỏ tới trang có trong sơ đồ", () => {
  const paths = new Set(SITE_NODES.map((n) => n.path));
  for (const p of SITE_DEMO_PAGES) {
    const doc = p.build();
    for (const s of doc.sections) {
      const urls = [...Object.entries(s.data), ...Object.values(s.lists).flatMap((rows) => rows.flatMap((r) => Object.entries(r)))].filter(([k, v]) => /url|href/i.test(k) && v.startsWith("/")).map(([, v]) => v);
      for (const u of urls) assert.ok(paths.has(u.split("#")[0]!), `${p.slug}: ${u} không có trong sơ đồ`);
    }
  }
});

test("mẫu tạo trang con tìm được theo khoá, không lẫn vào danh sách mẫu landing", () => {
  for (const t of SITE_TEMPLATES) assert.ok(landingTemplateByKey(t.template), t.template);
  assert.equal(LANDING_TEMPLATES.some((t) => t.key.startsWith("site-")), false);
  assert.equal(landingTemplateByKey("khong-co"), null);
});

test("trang con không có số thành tích, lời phụ huynh; giá chỉ ở trang Chương trình học", () => {
  for (const p of SITE_DEMO_PAGES) {
    const doc = p.build();
    for (const s of doc.sections.filter((x) => x.enabled)) {
      assert.ok(s.type !== "stats" && s.type !== "testimonials", `${p.slug}: khối ${s.type} phải tắt`);
      if (s.type === "programs" && !(p.slug === "khoa-hoc" && s.id === "bang-gia")) for (const r of s.lists.items!) assert.equal(r.price, "", `${p.slug}: không có giá`);
    }
  }
});
