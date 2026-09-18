import test from "node:test";
import assert from "node:assert/strict";
import {
  slidingWindow,
  MemoryRateLimiter,
  CODE_ATTEMPT_MAX,
  CODE_ATTEMPT_WINDOW_MS,
  fixedWindowStart,
  fixedWindowDecision,
  rateLimitKey,
  rateLimitFor,
  RATE_LIMITS,
} from "./rateLimit.js";

test("cửa sổ trượt cho qua đủ số lượt rồi chặn", () => {
  let hits: number[] = [];
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i++) {
    const r = slidingWindow(hits, t0 + i, 3, 60_000);
    assert.equal(r.allowed, true, `lượt ${i + 1} phải được phép`);
    hits = r.hits;
  }
  const blocked = slidingWindow(hits, t0 + 3, 3, 60_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSec > 0 && blocked.retryAfterSec <= 60);
});

test("lượt cũ rơi ra khỏi cửa sổ thì được thử lại", () => {
  const t0 = 1_000_000;
  const hits = [t0, t0 + 1, t0 + 2];
  // vẫn trong cửa sổ → chặn
  assert.equal(slidingWindow(hits, t0 + 1000, 3, 60_000).allowed, false);
  // qua cửa sổ → cho lại
  const r = slidingWindow(hits, t0 + 61_000, 3, 60_000);
  assert.equal(r.allowed, true);
  assert.deepEqual(r.hits, [t0 + 61_000]);
});

test("mốc thời gian ở tương lai bị bỏ qua (chống sửa đồng hồ)", () => {
  const t0 = 1_000_000;
  const r = slidingWindow([t0 + 999_999], t0, 1, 60_000);
  assert.equal(r.allowed, true);
});

test("bộ đếm trong bộ nhớ: chặn theo khoá và reset được", () => {
  const rl = new MemoryRateLimiter();
  const now = 5_000_000;
  for (let i = 0; i < CODE_ATTEMPT_MAX; i++) {
    assert.equal(rl.hit("activate|84900000001", now + i, CODE_ATTEMPT_MAX, CODE_ATTEMPT_WINDOW_MS).allowed, true);
  }
  assert.equal(rl.hit("activate|84900000001", now + 100, CODE_ATTEMPT_MAX, CODE_ATTEMPT_WINDOW_MS).allowed, false);
  // Khoá khác không bị ảnh hưởng
  assert.equal(rl.hit("activate|84900000002", now + 100, CODE_ATTEMPT_MAX, CODE_ATTEMPT_WINDOW_MS).allowed, true);
  // Sau khi xác thực đúng thì xoá đếm
  rl.reset("activate|84900000001");
  assert.equal(rl.hit("activate|84900000001", now + 101, CODE_ATTEMPT_MAX, CODE_ATTEMPT_WINDOW_MS).allowed, true);
});

test("bộ đếm không phình vô hạn khi bị bắn nhiều khoá lạ", () => {
  const rl = new MemoryRateLimiter(50);
  for (let i = 0; i < 500; i++) rl.hit(`ip|${i}`, 1_000 + i, 5, 60_000);
  assert.ok(rl.size <= 50, `giữ tối đa 50 khoá, đang có ${rl.size}`);
});

test("dọn khoá hết hạn sau mỗi phút", () => {
  const rl = new MemoryRateLimiter();
  rl.hit("a", 0, 5, 1_000);
  assert.equal(rl.size, 1);
  // qua cửa sổ + qua chu kỳ dọn
  rl.hit("b", 120_000, 5, 1_000);
  assert.equal(rl.size, 1, "khoá a đã hết hạn phải bị dọn");
});

test("trần dò mã đủ chặt cho mã 6 chữ số", () => {
  // 8 lần / 15 phút ⇒ ~280.000 lần thử mỗi năm cho một số điện thoại
  const perYear = ((365 * 24 * 60) / (CODE_ATTEMPT_WINDOW_MS / 60_000)) * CODE_ATTEMPT_MAX;
  const years = 1_000_000 / perYear;
  assert.ok(years > 3, `quét hết 1.000.000 tổ hợp cần ${years.toFixed(1)} năm — phải trên 3 năm`);
  // Mã chỉ sống 72 giờ ⇒ trong cả đời một mã, kẻ tấn công thử được ~2.300 lần
  const perCodeLifetime = ((72 * 60) / (CODE_ATTEMPT_WINDOW_MS / 60_000)) * CODE_ATTEMPT_MAX;
  const chance = perCodeLifetime / 1_000_000;
  assert.ok(chance < 0.01, `xác suất đoán trúng trong 72 giờ là ${(chance * 100).toFixed(2)}% — phải dưới 1%`);
});

/* ------------------------------------------------------------------ */
/* Cửa sổ cố định (bộ đếm trong CSDL)                                  */
/* ------------------------------------------------------------------ */

test("mốc đầu ô chia đều trục thời gian", () => {
  assert.equal(fixedWindowStart(0, 60_000), 0);
  assert.equal(fixedWindowStart(59_999, 60_000), 0);
  assert.equal(fixedWindowStart(60_000, 60_000), 60_000);
  assert.equal(fixedWindowStart(1_000_000, 900_000), 900_000);
  // windowMs rác → coi như ô 1 phút, tuyệt đối không chia cho 0
  assert.equal(fixedWindowStart(125_000, 0), 120_000);
  assert.equal(fixedWindowStart(125_000, Number.NaN), 120_000);
});

test("cho qua đúng `max` lượt rồi chặn, đếm theo số đã tăng", () => {
  const now = 1_000_000;
  for (let c = 1; c <= 5; c++) {
    const r = fixedWindowDecision(c, now, 5, 60_000);
    assert.equal(r.allowed, true, `lượt ${c} phải được phép`);
    assert.equal(r.remaining, 5 - c);
  }
  const blocked = fixedWindowDecision(6, now, 5, 60_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSec > 0 && blocked.retryAfterSec <= 60);
});

test("thời điểm hết hạn của ô đúng bằng mốc đầu ô cộng độ dài ô", () => {
  const r = fixedWindowDecision(1, 1_234_567, 10, 60_000);
  assert.equal(r.windowStart, 1_200_000);
  assert.equal(r.expiresAt, 1_260_000);
  const b = fixedWindowDecision(11, 1_234_567, 10, 60_000);
  assert.equal(b.retryAfterSec, Math.ceil((1_260_000 - 1_234_567) / 1000));
});

test("trần 0 hoặc âm vẫn cho ít nhất 1 lượt (không tự khoá chết người dùng)", () => {
  assert.equal(fixedWindowDecision(1, 0, 0, 60_000).allowed, true);
  assert.equal(fixedWindowDecision(2, 0, 0, 60_000).allowed, false);
  assert.equal(fixedWindowDecision(1, 0, -10, 60_000).allowed, true);
});

test("khoá đếm được chuẩn hoá để không tách một người thành nhiều khoá", () => {
  assert.equal(rateLimitKey("login", "email", "  An.Nguyen@Example.COM "), "login|email:an.nguyen@example.com");
  assert.equal(rateLimitKey("otp", "ip", null), "otp|ip:unknown");
  assert.equal(rateLimitKey("otp", "ip", "   "), "otp|ip:unknown");
  // Định danh dài bất thường bị cắt để không phình bảng
  assert.ok(rateLimitKey("x", "y", "z".repeat(500)).length <= 4 + 120);
});

test("trần mặc định của mọi luồng đều dương và cửa sổ hợp lệ", () => {
  for (const [name, v] of Object.entries(RATE_LIMITS)) {
    assert.ok(v.max > 0, `${name}: max phải dương`);
    assert.ok(v.windowMs > 0, `${name}: windowMs phải dương`);
  }
});

test("trần nới được bằng biến môi trường (đường thoát khi chặn nhầm)", () => {
  assert.equal(rateLimitFor("exportUser", {}).max, RATE_LIMITS.exportUser.max);
  assert.equal(rateLimitFor("exportUser", { RATE_LIMIT_EXPORT_USER_MAX: "500" }).max, 500);
  assert.equal(rateLimitFor("searchUser", { RATE_LIMIT_SEARCH_USER_MAX: "5000" }).max, 5000);
  assert.equal(rateLimitFor("staffLoginIp", { RATE_LIMIT_STAFF_LOGIN_IP_MAX: "99" }).max, 99);
  for (const bad of ["", "abc", "0", "-3"]) {
    assert.equal(rateLimitFor("otpIp", { RATE_LIMIT_OTP_IP_MAX: bad }).max, RATE_LIMITS.otpIp.max, `giá trị ${bad}`);
  }
  // Nới trần không đổi độ dài cửa sổ
  assert.equal(rateLimitFor("otpIp", { RATE_LIMIT_OTP_IP_MAX: "999" }).windowMs, RATE_LIMITS.otpIp.windowMs);
});

test("trần đăng nhập đủ rộng cho người dùng thật nhưng vẫn chặn máy dò", () => {
  // Một nhân sự gõ sai mật khẩu vài lần rồi dùng "Quên mật khẩu" — không được đụng trần
  assert.ok(RATE_LIMITS.staffLoginEmail.max >= 10, "trần theo email phải rộng hơn số lần gõ sai bình thường");
  const perDay = ((24 * 60) / (RATE_LIMITS.staffLoginEmail.windowMs / 60_000)) * RATE_LIMITS.staffLoginEmail.max;
  assert.ok(perDay < 2_000, `mỗi ngày tối đa ${perDay} lượt — phải dưới 2.000`);
});
