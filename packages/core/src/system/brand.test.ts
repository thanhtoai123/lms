import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHex, mix, contrast, readableOn, inkFor, buildPalette, brandCss, validateBrandColors, brandColorWarnings,
  dominantColor, suggestAccent, svgUnsafeReason, BRAND_DEFAULT_COLORS, luminance,
} from "./brand.js";

test("chuẩn hoá mã màu", () => {
  assert.equal(normalizeHex("#ABC"), "#aabbcc");
  assert.equal(normalizeHex("610B8A"), "#610b8a");
  assert.equal(normalizeHex("#12345"), null);
  assert.equal(normalizeHex("tím"), null);
  assert.equal(normalizeHex(""), null);
});

test("tương phản: trắng/đen = 21, cùng màu = 1", () => {
  assert.ok(Math.abs(contrast("#ffffff", "#000000") - 21) < 0.01);
  assert.equal(contrast("#123456", "#123456"), 1);
  assert.ok(luminance("#ffffff") > luminance("#000000"));
});

test("chữ trên nền: nền đậm → chữ trắng, nền vàng nhạt → chữ tối", () => {
  assert.equal(readableOn("#610b8a"), "#ffffff");
  assert.equal(readableOn("#ffe066"), "#171717");
});

test("màu chữ thương hiệu luôn đạt tương phản 4.5 trên nền trắng, kể cả màu nhạt", () => {
  for (const c of ["#610b8a", "#ff8f2d", "#ffe066", "#7cd6ff", "#22c55e", "#f472b6"]) {
    assert.ok(contrast(inkFor(c), "#ffffff") >= 4.5, c);
  }
});

test("bảng màu mặc định khớp tím + cam hiện tại", () => {
  const p = buildPalette(BRAND_DEFAULT_COLORS);
  assert.equal(p["--primary"], "#610b8a");
  assert.equal(p["--accent"], "#ff8f2d");
  assert.equal(p["--primary-foreground"], "#ffffff");
});

test("bảng màu: đủ biến, sắc thái nhạt dần, nền nhạt hơn nền đậm", () => {
  const p = buildPalette({ primary: "#0f766e", accent: "#f59e0b" });
  for (const k of ["--primary", "--primary-dark", "--primary-darker", "--primary-soft", "--primary-ink", "--ring", "--brand-50", "--brand-100", "--brand-200", "--brand-300", "--brand-400", "--brand-500", "--brand-900", "--accent", "--accent-50", "--accent-700"]) assert.ok(p[k], k);
  assert.ok(luminance(p["--brand-50"]!) > luminance(p["--brand-100"]!));
  assert.ok(luminance(p["--brand-100"]!) > luminance(p["--brand-300"]!));
  assert.ok(luminance(p["--primary-darker"]!) < luminance(p["--primary-dark"]!));
  assert.match(p["--primary-soft"]!, /^#0f766e[0-9a-f]{2}$/);
});

test("màu không hợp lệ rơi về mặc định, không phát sinh CSS hỏng", () => {
  const css = brandCss({ primary: "javascript:alert(1)", accent: "}body{display:none" });
  assert.ok(css.startsWith("html:root,.admin-scope.admin-scope{"));
  assert.ok(!/javascript|display:none/.test(css));
  assert.ok(css.includes("--primary:#610b8a"));
});

test("kiểm tra đầu vào màu", () => {
  assert.deepEqual(validateBrandColors({ primary: "#112233", accent: "#445566" }), []);
  assert.equal(validateBrandColors({ primary: "xanh", accent: "#445566" }).length, 1);
  assert.equal(validateBrandColors({ primary: "xanh", accent: "đỏ" }).length, 2);
});

test("cảnh báo: màu nhấn trùng màu chủ đạo, màu quá nhạt", () => {
  assert.ok(brandColorWarnings({ primary: "#112233", accent: "#112233" }).some((s) => /gần/.test(s)));
  assert.ok(brandColorWarnings({ primary: "#fafad2", accent: "#ff0000" }).length >= 1);
  assert.deepEqual(brandColorWarnings(BRAND_DEFAULT_COLORS), []);
});

test("lấy màu chủ đạo từ logo: bỏ nền trắng/trong suốt/đen/xám", () => {
  const px: number[] = [];
  const add = (r: number, g: number, b: number, a: number, n: number) => { for (let i = 0; i < n; i++) px.push(r, g, b, a); };
  add(255, 255, 255, 255, 500); // nền trắng
  add(0, 0, 0, 0, 500);          // trong suốt
  add(20, 20, 20, 255, 300);     // viền đen
  add(120, 120, 120, 255, 300);  // xám
  add(97, 11, 138, 255, 100);    // tím
  add(255, 143, 45, 255, 40);    // cam
  const d = dominantColor(px)!;
  assert.ok(Math.abs(contrast(d, "#610b8a") - 1) < 0.1, d);
  assert.equal(dominantColor([255, 255, 255, 255, 0, 0, 0, 0]), null);
});

test("gợi ý màu nhấn là đối màu, khác màu chủ đạo", () => {
  const a = suggestAccent("#610b8a");
  assert.ok(normalizeHex(a));
  assert.notEqual(a, "#610b8a");
  assert.ok(contrast("#610b8a", a) > 1.3);
});

test("SVG: nhận hình tĩnh, chặn script / sự kiện / tham chiếu ngoài", () => {
  assert.equal(svgUnsafeReason('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"/></defs><rect fill="url(#g)" width="10" height="10"/></svg>'), null);
  assert.ok(svgUnsafeReason("<html></html>"));
  assert.ok(svgUnsafeReason("<svg><script>alert(1)</script></svg>"));
  assert.ok(svgUnsafeReason('<svg onload="x()"></svg>'));
  assert.ok(svgUnsafeReason('<svg><foreignObject><div/></foreignObject></svg>'));
  assert.ok(svgUnsafeReason('<svg><a href="javascript:alert(1)"><rect/></a></svg>'));
  assert.ok(svgUnsafeReason('<svg><image href="https://evil.test/x.png"/></svg>'));
  assert.ok(svgUnsafeReason('<svg><rect style="fill:url(https://evil.test/x)"/></svg>'));
  assert.ok(svgUnsafeReason('<!DOCTYPE svg [<!ENTITY x "y">]><svg></svg>'));
});

test("pha trộn: 0 giữ nguyên, 1 thành màu kia", () => {
  assert.equal(mix("#102030", "#ffffff", 0), "#102030");
  assert.equal(mix("#102030", "#ffffff", 1), "#ffffff");
});
