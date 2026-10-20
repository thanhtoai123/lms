import { test } from "node:test";
import assert from "node:assert/strict";
import { ADS_LANDINGS, ADS_TRACK_SLUG, LEAD_INTERESTS, isAdsTemplate } from "./ads.js";
import { normalizeLanding, validateLanding, validImage, rowsOf } from "./model.js";
import { renderBody, renderParts } from "./render.js";
import { LP_MEDIA_SIZE } from "./media.js";
import { jsonLdString, landingJsonLd } from "./seo.js";
import { sitePathOf } from "../site/map.js";
import { TH_TRACK_SHORT } from "../curriculum/thsteam.js";

const ctx = (slug: string) => ({ slug, variant: "classic" as const, mode: "page" as const, brand: { name: "TH STEAM Academy", logoUrl: "/icon.svg", lockupUrl: "/thsteam/logo-ngang.svg", lockupOnDarkUrl: "/thsteam/logo-ngang-trang.svg", palette: {} } });

test("5 landing quảng cáo: hợp lệ để xuất bản, SEO đúng độ dài, đường dẫn không đụng trang website", () => {
  assert.equal(ADS_LANDINGS.length, 5);
  for (const p of ADS_LANDINGS) {
    const doc = normalizeLanding(p.build());
    const chk = validateLanding(doc, { title: p.title, slug: p.slug });
    assert.deepEqual(chk.errors, [], p.slug);
    assert.deepEqual(chk.warnings, [], p.slug);
    assert.ok(p.seoTitle.length <= 60, `${p.slug}: title ${p.seoTitle.length} ký tự`);
    assert.ok(p.seoDescription.length >= 120 && p.seoDescription.length <= 160, `${p.slug}: description ${p.seoDescription.length} ký tự`);
    assert.equal(sitePathOf(p.slug), null, `${p.slug} trùng đường dẫn website`);
    assert.ok(isAdsTemplate(p.template));
    assert.ok(LP_MEDIA_SIZE[p.seoImage], `${p.slug}: thiếu ảnh chia sẻ ${p.seoImage}`);
    assert.doesNotMatch(JSON.stringify(doc), /miễn phí/i, `${p.slug}: không hứa "miễn phí"`);
  }
});

test("landing quảng cáo: một H1, form gọn ở đầu và cuối trang, thanh đăng ký nhanh, ảnh có kích thước", () => {
  for (const p of ADS_LANDINGS) {
    const doc = normalizeLanding(p.build());
    const parts = renderParts(doc, ctx(p.slug));
    const lead = parts.filter((x) => x.kind === "leadHero");
    assert.equal(lead.length, 1, p.slug);
    const forms = parts.filter((x) => x.kind === "form");
    assert.ok(forms.length === 1 && forms[0]!.kind === "form" && forms[0]!.compact, `${p.slug}: form cuối trang dùng form gọn`);
    const html = renderBody(doc, ctx(p.slug));
    assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1, `${p.slug}: đúng một H1`);
    assert.match(html, /class="lp-sticky"/);
    assert.match(html, /id="dang-ky-nhanh"/);
    for (const m of html.matchAll(/<img [^>]*>/g)) {
      assert.match(m[0], /width="\d+" height="\d+"/, `${p.slug}: ảnh thiếu kích thước ${m[0].slice(0, 90)}`);
      assert.match(m[0], /alt="[^"]+"/, `${p.slug}: ảnh thiếu alt ${m[0].slice(0, 90)}`);
    }
    assert.equal((html.match(/fetchpriority="high"/g) ?? []).length, 1, `${p.slug}: chỉ ảnh đầu trang tải ưu tiên`);
    // mọi ảnh của trang là ảnh đi kèm ứng dụng, đã đăng ký kích thước
    for (const s of doc.sections) for (const v of [...Object.values(s.data), ...Object.values(s.lists).flatMap((r) => r.flatMap((x) => Object.values(x)))]) {
      if (/^\/(lp-anh|anh-site|thsteam)\//.test(v)) { assert.ok(validImage(v), v); assert.ok(LP_MEDIA_SIZE[v], `${p.slug}: chưa có kích thước ${v}`); }
    }
  }
});

test("trang chuyên ngành chọn sẵn đúng chuyên ngành trong form; ảnh phần mềm thật có ghi nguồn", () => {
  for (const [code, slug] of Object.entries(ADS_TRACK_SLUG)) {
    const p = ADS_LANDINGS.find((x) => x.slug === slug)!;
    const doc = normalizeLanding(p.build());
    const lead = doc.sections.find((s) => s.type === "leadHero")!;
    assert.equal(lead.data.interest, TH_TRACK_SHORT[code as keyof typeof TH_TRACK_SHORT]);
    assert.ok(LEAD_INTERESTS.some((x) => x.value === lead.data.interest));
    const tools = doc.sections.find((s) => s.type === "tools");
    if (tools) for (const r of rowsOf(tools, "items")) assert.match(r.credit ?? "", /^Ảnh: /, `${slug}: ${r.name} thiếu nguồn ảnh`);
  }
});

test("JSON-LD: tổ chức, trang, breadcrumb, hỏi đáp, khoá học; an toàn khi nhúng", () => {
  const p = ADS_LANDINGS[1]!;
  const ld = landingJsonLd(normalizeLanding(p.build()), { baseUrl: "https://thsteam.edu.vn", path: `/lp/${p.slug}`, title: p.seoTitle, description: p.seoDescription, image: p.seoImage, brand: { name: "TH STEAM Academy", logo: "/thsteam/logo-ngang.png" } });
  const types = (ld["@graph"] as { "@type": string }[]).map((g) => g["@type"]);
  for (const t of ["EducationalOrganization", "WebPage", "BreadcrumbList", "FAQPage", "Course"]) assert.ok(types.includes(t), t);
  assert.ok(!jsonLdString({ a: "</script><b>" }).includes("<"));
});
