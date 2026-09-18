import test from "node:test";
import assert from "node:assert/strict";
import {
  API_CSP,
  REQUIRED_SECURITY_HEADERS,
  base64Encode,
  buildCsp,
  cspHeaderName,
  generateNonce,
  isValidNonce,
  nonceFromBytes,
  securityHeaderOptions,
  securityHeaders,
} from "./headers.js";

/* ---------------------------- nonce ---------------------------- */

test("base64 tự viết khớp với Buffer của Node", () => {
  for (const n of [0, 1, 2, 3, 4, 5, 16, 17, 31, 64]) {
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) bytes[i] = (i * 37 + 11) % 256;
    assert.equal(base64Encode(bytes), Buffer.from(bytes).toString("base64"), `độ dài ${n}`);
  }
});

test("nonce sinh từ byte cố định là tất định và hợp lệ", () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  const n = nonceFromBytes(bytes);
  assert.equal(n, Buffer.from(bytes).toString("base64"));
  assert.equal(isValidNonce(n), true);
});

test("mỗi lần sinh một nonce khác nhau, đủ dài", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const n = generateNonce();
    assert.equal(isValidNonce(n), true, `nonce không hợp lệ: ${n}`);
    // 16 byte ⇒ 24 ký tự base64
    assert.equal(n.length, 24);
    seen.add(n);
  }
  assert.equal(seen.size, 200, "không được trùng nonce giữa các yêu cầu");
});

test("nonce rỗng / quá ngắn / có ký tự lạ đều bị loại", () => {
  for (const bad of ["", "abc", "a b c d e f g h", "nonce'; script-src *", null, undefined, 123, "<script>"]) {
    assert.equal(isValidNonce(bad), false, `phải loại: ${String(bad)}`);
  }
});

test("hàm sinh nonce dùng đúng nguồn ngẫu nhiên được tiêm", () => {
  const n = generateNonce((b) => b.fill(0xab));
  assert.equal(n, Buffer.alloc(16, 0xab).toString("base64"));
});

/* ----------------------------- CSP ----------------------------- */

const directives = (csp: string) =>
  Object.fromEntries(csp.split("; ").map((d) => {
    const [k, ...v] = d.split(" ");
    return [k!, v];
  })) as Record<string, string[]>;

test("script-src KHÔNG còn 'unsafe-inline' và có nonce của yêu cầu", () => {
  const nonce = generateNonce();
  const d = directives(buildCsp({ nonce }));
  assert.ok(!d["script-src"]!.includes("'unsafe-inline'"), "script-src vẫn còn 'unsafe-inline'");
  assert.ok(d["script-src"]!.includes(`'nonce-${nonce}'`), "thiếu nonce trong script-src");
  assert.ok(d["script-src"]!.includes("'strict-dynamic'"), "thiếu 'strict-dynamic' — Next nạp chunk sẽ bị chặn");
});

test("không có nonce thì không tự ý mở 'unsafe-inline'", () => {
  const d = directives(buildCsp({}));
  assert.deepEqual(d["script-src"], ["'self'"]);
  assert.ok(!d["script-src"]!.includes("'strict-dynamic'"), "'strict-dynamic' vô nghĩa khi chưa có nonce");
});

test("nonce giả mạo (chuỗi rác) bị bỏ qua, không chèn được directive mới", () => {
  const csp = buildCsp({ nonce: "x'; script-src *; '" });
  assert.ok(!csp.includes("script-src *"), "nonce bẩn chèn được vào CSP");
  assert.ok(!csp.includes("'nonce-"), "nonce không hợp lệ không được đưa vào");
});

test("đường thoát CSP_ALLOW_UNSAFE_INLINE bật lại 'unsafe-inline' khi cần mở gấp", () => {
  const d = directives(buildCsp({ nonce: generateNonce(), allowUnsafeInlineScripts: true }));
  assert.ok(d["script-src"]!.includes("'unsafe-inline'"));
});

test("'unsafe-eval' chỉ có ở môi trường phát triển", () => {
  assert.ok(buildCsp({ nonce: generateNonce(), dev: true }).includes("'unsafe-eval'"));
  assert.ok(!buildCsp({ nonce: generateNonce(), dev: false }).includes("'unsafe-eval'"));
});

test("style-src vẫn nới lỏng (lý do ghi trong tài liệu) nhưng script-src-attr thì khoá chặt", () => {
  const d = directives(buildCsp({ nonce: generateNonce() }));
  assert.ok(d["style-src"]!.includes("'unsafe-inline'"), "bỏ 'unsafe-inline' ở style-src sẽ vỡ giao diện");
  assert.deepEqual(d["script-src-attr"], ["'none'"], "phải chặn onclick=… — nonce không che được thuộc tính sự kiện");
});

test("CSP có frame-ancestors, object-src none, base-uri self", () => {
  const d = directives(buildCsp({ nonce: generateNonce() }));
  assert.deepEqual(d["frame-ancestors"], ["'self'"]);
  assert.deepEqual(d["object-src"], ["'none'"]);
  assert.deepEqual(d["base-uri"], ["'self'"]);
  assert.deepEqual(d["form-action"], ["'self'"]);
});

test("frame-ancestors đặt được thành 'none' và kéo theo X-Frame-Options DENY", () => {
  const h = new Map(securityHeaders({ nonce: generateNonce(), frameAncestors: "'none'" }));
  assert.ok(h.get("Content-Security-Policy")!.includes("frame-ancestors 'none'"));
  assert.equal(h.get("X-Frame-Options"), "DENY");
});

test("connect-src mở cả HTTPS và WSS của Supabase", () => {
  const d = directives(buildCsp({ nonce: generateNonce(), supabaseUrl: "https://abc.supabase.co" }));
  assert.ok(d["connect-src"]!.includes("https://abc.supabase.co"));
  assert.ok(d["connect-src"]!.includes("wss://abc.supabase.co"));
});

test("route trả JSON / tệp dùng CSP khoá hết", () => {
  assert.ok(API_CSP.includes("default-src 'none'"));
  assert.ok(API_CSP.includes("frame-ancestors 'none'"));
});

/* --------------------- bộ header bắt buộc ---------------------- */

test("đủ bộ header bảo mật bắt buộc", () => {
  const names = securityHeaders({ nonce: generateNonce() }).map(([k]) => k);
  for (const required of REQUIRED_SECURITY_HEADERS) {
    assert.ok(names.includes(required), `thiếu header bắt buộc: ${required}`);
  }
});

test("giá trị từng header đúng như thiết kế", () => {
  const h = new Map(securityHeaders({ nonce: generateNonce() }));
  assert.equal(h.get("X-Content-Type-Options"), "nosniff");
  assert.equal(h.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(h.get("Cross-Origin-Opener-Policy"), "same-origin");
  assert.equal(h.get("Cross-Origin-Resource-Policy"), "same-site");
  assert.equal(h.get("Strict-Transport-Security"), "max-age=63072000; includeSubDomains");
  const pp = h.get("Permissions-Policy")!;
  for (const off of ["microphone=()", "payment=()", "usb=()", "interest-cohort=()"]) {
    assert.ok(pp.includes(off), `Permissions-Policy thiếu ${off}`);
  }
  // Điểm danh bằng mã QR cần camera, chấm công cần định vị
  assert.ok(pp.includes("camera=(self)"));
  assert.ok(pp.includes("geolocation=(self)"));
});

test("HSTS có preload khi bật, và không bao giờ nhận max-age âm", () => {
  assert.ok(new Map(securityHeaders({ hstsPreload: true })).get("Strict-Transport-Security")!.endsWith("; preload"));
  assert.equal(new Map(securityHeaders({ hstsMaxAge: -5 })).get("Strict-Transport-Security"), "max-age=0; includeSubDomains");
});

test("chế độ chỉ báo cáo đổi tên header, không đổi nội dung chính sách", () => {
  const nonce = generateNonce();
  assert.equal(cspHeaderName(true), "Content-Security-Policy-Report-Only");
  assert.equal(cspHeaderName(false), "Content-Security-Policy");
  const h = new Map(securityHeaders({ nonce, reportOnly: true }));
  assert.equal(h.has("Content-Security-Policy"), false);
  assert.equal(h.get("Content-Security-Policy-Report-Only"), buildCsp({ nonce }));
});

/* --------------------- đọc biến môi trường --------------------- */

test("mặc định môi trường trống là chính sách chặt", () => {
  const o = securityHeaderOptions({});
  assert.equal(o.allowUnsafeInlineScripts, false);
  assert.equal(o.reportOnly, false);
  assert.equal(o.strictDynamic, true);
  assert.equal(o.dev, false);
});

test("biến môi trường mở được từng đường thoát", () => {
  const o = securityHeaderOptions({
    NODE_ENV: "development",
    CSP_ALLOW_UNSAFE_INLINE: "1",
    CSP_REPORT_ONLY: "1",
    CSP_STRICT_DYNAMIC: "0",
    CSP_SCRIPT_SRC_EXTRA: "https://cdn.example.vn",
    HSTS_MAX_AGE: "300",
  }, "Tm9uY2VOb25jZU5vbmNl");
  assert.equal(o.allowUnsafeInlineScripts, true);
  assert.equal(o.reportOnly, true);
  assert.equal(o.strictDynamic, false);
  assert.equal(o.dev, true);
  assert.equal(o.hstsMaxAge, 300);
  assert.ok(buildCsp(o).includes("https://cdn.example.vn"));
});

test("HSTS_MAX_AGE rác thì quay về mặc định 2 năm", () => {
  for (const v of ["", "abc", "-1", "0"]) {
    assert.equal(securityHeaderOptions({ HSTS_MAX_AGE: v }).hstsMaxAge, undefined, `giá trị ${v}`);
  }
});
