import test from "node:test";
import assert from "node:assert/strict";
import { SECTION_DEFS, SECTION_TYPES, emptySection, normalizeLanding, rowsOf, sectionVisible, validImage, validSlug, validUrl, validateLanding } from "./model.js";
import { LANDING_TEMPLATES, landingTemplateByKey } from "./templates.js";
import { landingCss, paletteStyle, renderBody, renderParts, renderStandalone, type RenderCtx } from "./render.js";
import { buildPalette, BRAND_DEFAULT_COLORS } from "../system/brand.js";

const ctx = (over: Partial<RenderCtx> = {}): RenderCtx => ({
  slug: "trang-chu", variant: "classic", mode: "page",
  brand: { name: "Sata Robo", logoUrl: "/icon.svg", palette: buildPalette(BRAND_DEFAULT_COLORS) }, ...over,
});

test("liên kết và ảnh: chỉ nhận dạng an toàn", () => {
  for (const ok of ["https://zalo.me/123", "/dang-ky", "#hoi-dap", "tel:0900000000", "mailto:a@b.vn"]) assert.ok(validUrl(ok), ok);
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "//evil.com", "http://x.vn", "/a b", "https://x.vn/\"onload=1", "vbscript:x"]) assert.ok(!validUrl(bad), bad);
  assert.ok(validImage("/api/public/site-media/abc-1.png"));
  assert.ok(validImage("https://cdn.example.com/a.jpg"));
  assert.ok(!validImage("javascript:1") && !validImage("/etc/passwd") && !validImage("http://x.vn/a.jpg"));
});

test("đường dẫn trang (slug)", () => {
  assert.equal(validSlug("hoc-thu-thang-10"), null);
  for (const bad of ["a", "Hoc-Thu", "hoc thu", "-a", "a--b", "a-", "x".repeat(61)]) assert.notEqual(validSlug(bad), null, bad);
});

test("normalize: bỏ khối lạ, cắt chuỗi, giữ đầu trang ở đầu và chân trang ở cuối, mỗi khối single một lần", () => {
  const doc = normalizeLanding({
    sections: [
      { type: "footer", data: { tagline: "x".repeat(999) } },
      { type: "khong-co", data: {} },
      { type: "hero", data: { title: "  Xin chào  " } },
      { type: "hero", data: { title: "hero hai" } },
      { type: "header", data: {} },
      { type: "faq", lists: { items: Array.from({ length: 40 }, (_, i) => ({ q: `q${i}`, a: "a", extra: "bỏ" })) } },
    ],
  });
  assert.deepEqual(doc.sections.map((s) => s.type), ["header", "hero", "faq", "footer"]);
  assert.equal(doc.sections[1]!.data.title, "Xin chào");
  assert.equal(doc.sections[3]!.data.tagline!.length, SECTION_DEFS.footer.fields.find((f) => f.key === "tagline")!.max);
  assert.equal(doc.sections[2]!.lists.items!.length, 12);
  assert.deepEqual(Object.keys(doc.sections[2]!.lists.items![0]!).sort(), ["a", "q"]);
  assert.equal(new Set(doc.sections.map((s) => s.id)).size, doc.sections.length);
  assert.deepEqual(normalizeLanding(null).sections, []);
  assert.deepEqual(normalizeLanding({ sections: "x" }).sections, []);
});

test("mọi mẫu: đủ để xuất bản ngay (không lỗi, không cảnh báo) và render ra HTML", () => {
  assert.ok(LANDING_TEMPLATES.length >= 3);
  for (const tpl of LANDING_TEMPLATES) {
    const doc = normalizeLanding(tpl.build());
    assert.equal(doc.sections.length, tpl.build().sections.length, `${tpl.key}: normalize không được làm mất khối`);
    const chk = validateLanding(doc, { title: tpl.label, slug: "thu" });
    assert.deepEqual(chk.errors, [], tpl.key);
    assert.deepEqual(chk.warnings, [], tpl.key);
    const html = renderBody(doc, ctx({ variant: tpl.variant }));
    assert.ok(html.includes("<h1>"), tpl.key);
    assert.ok(html.includes('id="dang-ky"'), `${tpl.key}: có neo #dang-ky cho nút`);
    assert.equal(landingTemplateByKey(tpl.key)?.key, tpl.key);
  }
});

test("mẫu không chứa số liệu / giá / lời phụ huynh bịa", () => {
  for (const tpl of LANDING_TEMPLATES) {
    for (const s of tpl.build().sections) {
      if (s.type === "stats" || s.type === "testimonials" || s.type === "timeline") assert.equal(rowsOf(s, "items").length, 0, `${tpl.key}/${s.type}`);
      if (s.type === "programs") for (const r of s.lists.items!) assert.equal(r.price, "", `${tpl.key}: không ghi giá khi chưa chốt`);
    }
  }
});

test("kiểm xuất bản: chặn khi thiếu trường bắt buộc / liên kết sai; nhắc số 0 và chữ giữ chỗ", () => {
  const base = normalizeLanding(landingTemplateByKey("phu-huynh-tin-cay")!.build());
  const mut = (fn: (d: ReturnType<typeof normalizeLanding>) => void) => { const d = structuredClone(base); fn(d); return validateLanding(d, { title: "Trang thử", slug: "thu" }); };

  assert.ok(mut((d) => { d.sections.find((s) => s.type === "hero")!.data.title = ""; }).errors.some((e) => e.includes("Tiêu đề lớn")));
  assert.ok(mut((d) => { d.sections.find((s) => s.type === "hero")!.data.primaryUrl = "javascript:alert(1)"; }).errors.some((e) => e.includes("Liên kết nút chính")));
  assert.ok(mut((d) => { d.sections.find((s) => s.type === "hero")!.enabled = false; }).errors.some((e) => e.includes("Hero")));
  assert.ok(mut((d) => { d.sections.find((s) => s.type === "hero")!.data.image = "http://x.vn/a.jpg"; }).errors.some((e) => e.includes("ảnh")));
  assert.ok(validateLanding(base, { title: "ab", slug: "Sai Slug" }).errors.length >= 2);

  const stats = mut((d) => {
    const st = d.sections.find((s) => s.type === "stats")!;
    st.enabled = true;
    st.lists.items = [{ value: "0+", label: "Học viên" }, { value: "1.200", label: "Giờ học" }];
  });
  assert.ok(stats.warnings.some((w) => w.includes("con số là 0")));
  const ph = mut((d) => { d.sections.find((s) => s.type === "programs")!.lists.items![0]!.price = "0.000.000đ"; });
  assert.ok(ph.warnings.some((w) => w.includes("giữ chỗ")));
  // Khối bật nhưng danh sách trống: chỉ nhắc, không chặn
  const empty = mut((d) => { d.sections.find((s) => s.type === "stats")!.enabled = true; });
  assert.deepEqual(empty.errors, []);
  assert.ok(empty.warnings.some((w) => w.includes("tự ẩn")));
});

test("hiển thị: khối rỗng / tắt không xuất hiện; dòng thiếu trường bắt buộc bị bỏ", () => {
  const doc = normalizeLanding({ sections: [
    { type: "hero", data: { title: "T", primaryLabel: "Đi", primaryUrl: "/dang-ky" } },
    { type: "stats", lists: { items: [{ value: "", label: "không giá trị" }] } },
    { type: "faq", data: { title: "Hỏi đáp" }, enabled: false, lists: { items: [{ q: "q", a: "a" }] } },
    { type: "features", data: { title: "Lợi ích" }, lists: { items: [{ title: "Một", text: "" }, { title: "", text: "mồ côi" }] } },
  ] });
  const html = renderBody(doc, ctx());
  assert.ok(!html.includes("lp-stats"));
  assert.ok(!html.includes("lp-faqs"));
  assert.ok(html.includes("<h3>Một</h3>") && !html.includes("mồ côi"));
  assert.ok(sectionVisible(doc.sections.find((s) => s.type === "hero")!));
});

test("an toàn: chữ người dùng bị escape, liên kết / ảnh xấu bị loại, không có <script>", () => {
  const evil = `<script>alert(1)</script>"><img src=x onerror=alert(2)>`;
  const doc = normalizeLanding({ sections: [
    { type: "header", data: { phone: evil, ctaLabel: evil, ctaUrl: "javascript:alert(3)" }, lists: { nav: [{ label: evil, href: "data:text/html,x" }] } },
    { type: "hero", data: { title: evil, subtitle: evil, primaryLabel: evil, primaryUrl: "javascript:alert(4)", image: "javascript:alert(5)" } },
    { type: "text", data: { title: evil, body: `${evil}\n\n[bấm](javascript:alert(6)) ![x](javascript:alert(7))` } },
    { type: "faq", data: { title: evil }, lists: { items: [{ q: evil, a: evil }] } },
    { type: "footer", data: { tagline: evil, email: evil }, lists: { links: [{ label: evil, href: "javascript:alert(8)" }] } },
  ] });
  for (const mode of ["page", "export"] as const) {
    const html = mode === "page" ? renderBody(doc, ctx()) : renderStandalone(doc, ctx({ baseUrl: "https://app.example.com" }), { title: evil, description: evil });
    assert.ok(!/<script/i.test(html), `${mode}: không có <script`);
    assert.ok(!/onerror=/i.test(html.replace(/&quot;|&lt;|&gt;/g, "")) || !/<img[^>]+onerror/i.test(html), `${mode}: không có thuộc tính onerror thật`);
    assert.ok(!/href="javascript:/i.test(html), `${mode}: không có href javascript`);
    assert.ok(!/src="javascript:/i.test(html), `${mode}: không có src javascript`);
    assert.ok(!/href="data:/i.test(html), `${mode}: không có href data`);
  }
});

test("export: HTML độc lập, CSS nhúng, liên kết nội bộ thành tuyệt đối, form dẫn về hệ thống", () => {
  const doc = normalizeLanding(landingTemplateByKey("phu-huynh-tin-cay")!.build());
  const html = renderStandalone(doc, ctx({ baseUrl: "https://app.example.com" }), { title: "Sata Robo", description: "Mô tả", image: "/api/public/site-media/a.png" });
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes("<style>") && html.includes(".lp-hero"));
  assert.ok(html.includes('src="https://app.example.com/icon.svg"'));
  assert.ok(html.includes('href="https://app.example.com/dang-ky?lp=trang-chu"'));
  assert.ok(html.includes('content="https://app.example.com/api/public/site-media/a.png"'));
  assert.ok(html.includes("--primary:"));
  assert.ok(!html.includes("data-lp-form"));
  assert.ok(!/<script/i.test(html));
});

test("trang công khai: form được chừa chỗ để ghép thành phần React", () => {
  const doc = normalizeLanding(landingTemplateByKey("mot-man-hinh")!.build());
  const parts = renderParts(doc, ctx());
  const forms = parts.filter((p) => p.kind === "form");
  assert.equal(forms.length, 1);
  const i = parts.findIndex((p) => p.kind === "form");
  assert.equal(parts[i - 1]!.kind, "html");
  assert.equal(parts[i + 1]!.kind, "html");
});

test("định nghĩa khối: đủ nhãn, trường có giới hạn, danh sách có tối đa; mọi kiểu có hàm hiển thị", () => {
  for (const type of SECTION_TYPES) {
    const def = SECTION_DEFS[type];
    assert.ok(def.label && def.desc, type);
    for (const f of def.fields) assert.ok(f.max > 0 && f.label, `${type}.${f.key}`);
    for (const l of def.lists) { assert.ok(l.max > 0 && l.fields.length > 0, `${type}.${l.key}`); for (const f of l.fields) assert.ok(f.max > 0, `${type}.${l.key}.${f.key}`); }
    if (def.needs) assert.ok(def.lists.some((l) => l.key === def.needs), `${type}.needs`);
    const e = emptySection(type, `${type}-t`);
    assert.equal(Object.keys(e.data).length, def.fields.length);
  }
  // Mỗi kiểu khối render được khi có dữ liệu tối thiểu (không ném lỗi)
  for (const type of SECTION_TYPES) {
    const e = emptySection(type, `${type}-t`);
    const def = SECTION_DEFS[type];
    for (const f of def.fields) e.data[f.key] = f.type === "url" ? "/x" : f.type === "image" ? "https://x.vn/a.png" : "Chữ";
    for (const l of def.lists) e.lists[l.key] = [Object.fromEntries(l.fields.map((f) => [f.key, f.type === "url" ? "/x" : f.type === "image" ? "https://x.vn/a.png" : "Chữ"]))];
    assert.doesNotThrow(() => renderBody({ sections: [e] }, ctx()), type);
  }
});

test("CSS và biến màu", () => {
  const css = landingCss();
  assert.ok(css.includes(".lp-hero") && css.includes("@media (max-width:860px)"));
  const st = paletteStyle({ "--primary": "#610b8a", "--bad key": "x", "--x": "red;background:url(javascript:1)" });
  assert.ok(st.includes("--primary:#610b8a") && !st.includes("bad key") && !st.includes(";background"));
});

test("nền xen kẽ theo thứ tự hiển thị (không dựa vào CSS nth-of-type)", () => {
  const doc = normalizeLanding(landingTemplateByKey("phu-huynh-tin-cay")!.build());
  const html = renderBody(doc, ctx());
  const secs = [...html.matchAll(/<section class="(lp-sec[^"]*)"/g)].map((m) => m[1]!);
  const content = secs.filter((c) => !/lp-hero|lp-cta/.test(c));
  assert.ok(content.length >= 4);
  content.forEach((c, i) => assert.equal(c.includes("lp-alt"), i % 2 === 1, `khối nội dung #${i}: ${c}`));
  assert.ok(!landingCss().includes("nth-of-type"));
});
