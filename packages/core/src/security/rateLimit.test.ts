import test from "node:test";
import assert from "node:assert/strict";
import { slidingWindow, MemoryRateLimiter, CODE_ATTEMPT_MAX, CODE_ATTEMPT_WINDOW_MS } from "./rateLimit.js";

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
