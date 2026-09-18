import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RETRY, retryDelayMs, nextAttemptAt, isDeadLettered, failureUpdate, truncateError,
  MAX_PAGE_SIZE, clampPageSize, pageCount, pageOffset, batchRanges, takeBatch,
  SLOW_PROCEDURE_MS, shouldLogSlow, slowProcedureLog, slowThresholdFromEnv,
} from "./retry.js";

test("thử lại: giãn cách tăng gấp đôi và có trần", () => {
  // Chưa thử lần nào → chạy ngay, không chờ
  assert.equal(retryDelayMs(0), 0);
  assert.equal(retryDelayMs(-3), 0);
  // 30s → 1p → 2p → 4p → 8p
  assert.equal(retryDelayMs(1), 30_000);
  assert.equal(retryDelayMs(2), 60_000);
  assert.equal(retryDelayMs(3), 120_000);
  assert.equal(retryDelayMs(4), 240_000);
  assert.equal(retryDelayMs(5), 480_000);
  // Trần 15 phút: thử lại rất nhiều lần cũng không chờ lâu hơn
  assert.equal(retryDelayMs(6), 15 * 60_000);
  assert.equal(retryDelayMs(50), 15 * 60_000);
  assert.equal(retryDelayMs(1_000_000), 15 * 60_000, "không tràn số với số lần thử lớn");
  // Đổi chính sách thì đổi theo
  assert.equal(retryDelayMs(3, { baseMs: 1_000, maxMs: 10_000, maxAttempts: 9 }), 4_000);
  assert.equal(retryDelayMs(9, { baseMs: 1_000, maxMs: 10_000, maxAttempts: 9 }), 10_000);
});

test("thử lại: mốc thử lại kế tiếp tính từ lúc vừa hỏng", () => {
  const failedAt = new Date("2026-09-18T03:00:00.000Z");
  assert.equal(nextAttemptAt(failedAt, 1).toISOString(), "2026-09-18T03:00:30.000Z");
  assert.equal(nextAttemptAt(failedAt, 3).toISOString(), "2026-09-18T03:02:00.000Z");
  // Không sửa vào đối tượng Date được truyền vào
  assert.equal(failedAt.toISOString(), "2026-09-18T03:00:00.000Z");
});

test("thử lại: hàng đợi chết sau đủ số lần", () => {
  assert.equal(isDeadLettered(0), false);
  assert.equal(isDeadLettered(4), false);
  assert.equal(isDeadLettered(5), true, "mặc định 5 lần là vào hàng đợi chết");
  assert.equal(isDeadLettered(9), true);
  assert.equal(isDeadLettered(2, { ...DEFAULT_RETRY, maxAttempts: 2 }), true);
});

test("thử lại: cập nhật sau một lần hỏng", () => {
  const at = new Date("2026-09-18T03:00:00.000Z");
  const first = failureUpdate(at, 0, "Không kết nối được nhà cung cấp ZNS");
  assert.equal(first.attempts, 1);
  assert.equal(first.deadLettered, false);
  assert.equal(first.nextAttemptAt.toISOString(), "2026-09-18T03:00:30.000Z");
  assert.equal(first.lastError, "Không kết nối được nhà cung cấp ZNS");

  const last = failureUpdate(at, 4, "vẫn hỏng");
  assert.equal(last.attempts, 5);
  assert.equal(last.deadLettered, true, "lần thứ 5 hỏng là vào hàng đợi chết");
});

test("thử lại: lỗi lưu xuống được cắt gọn về một dòng", () => {
  assert.equal(truncateError("  lỗi\n  nhiều   dòng\t "), "lỗi nhiều dòng");
  const long = truncateError("x".repeat(900));
  assert.equal(long.length, 500);
  assert.ok(long.endsWith("…"));
  assert.equal(truncateError("ngắn", 10), "ngắn");
});

test("chọn lô: cắt pageSize về trần cứng", () => {
  assert.equal(MAX_PAGE_SIZE, 200);
  assert.equal(clampPageSize(undefined), 50, "không gửi thì dùng mặc định");
  assert.equal(clampPageSize(null, 20), 20);
  assert.equal(clampPageSize(30), 30);
  assert.equal(clampPageSize(1_000_000), 200, "client hỏi quá nhiều thì cắt về trần");
  assert.equal(clampPageSize(0), 50, "0 / âm là vô nghĩa → về mặc định");
  assert.equal(clampPageSize(-5), 50);
  assert.equal(clampPageSize(Number.NaN), 50);
  assert.equal(clampPageSize(500, 50, 100), 100, "trần riêng cho từng màn hình");
  assert.equal(clampPageSize(500, 1_000), 200, "mặc định cũng không vượt trần");
});

test("chọn lô: số trang và offset", () => {
  assert.equal(pageCount(0, 20), 1, "không có dòng nào vẫn là trang 1/1");
  assert.equal(pageCount(20, 20), 1);
  assert.equal(pageCount(21, 20), 2);
  assert.equal(pageCount(301, 100), 4);
  assert.equal(pageCount(10, 0), 1);
  assert.equal(pageOffset(1, 20), 0);
  assert.equal(pageOffset(3, 20), 40);
  assert.equal(pageOffset(0, 20), 0, "trang < 1 coi như trang 1");
  assert.equal(pageOffset(undefined, 25), 0);
});

test("chọn lô: chia khối lượng lớn thành nhiều lượt đọc", () => {
  assert.deepEqual(batchRanges(0, 100), []);
  assert.deepEqual(batchRanges(-5, 100), []);
  assert.deepEqual(batchRanges(100, 0), []);
  assert.deepEqual(batchRanges(100, 100), [{ offset: 0, limit: 100 }]);
  assert.deepEqual(batchRanges(250, 100), [
    { offset: 0, limit: 100 },
    { offset: 100, limit: 100 },
    { offset: 200, limit: 50 },
  ]);
  // Tổng các lô đúng bằng tổng số dòng — không đọc thiếu, không đọc thừa
  const rs = batchRanges(10_000, 500);
  assert.equal(rs.length, 20);
  assert.equal(rs.reduce((n, r) => n + r.limit, 0), 10_000);
});

test("chọn lô: đọc dư một dòng để biết còn trang sau", () => {
  const rows = [1, 2, 3, 4, 5, 6];
  const a = takeBatch(rows, 5);
  assert.deepEqual(a.items, [1, 2, 3, 4, 5]);
  assert.equal(a.hasMore, true);
  const b = takeBatch([1, 2, 3], 5);
  assert.deepEqual(b.items, [1, 2, 3]);
  assert.equal(b.hasMore, false);
  const c = takeBatch([], 5);
  assert.deepEqual(c.items, []);
  assert.equal(c.hasMore, false);
});

test("đo hiệu năng: cắt ngưỡng ghi log", () => {
  assert.equal(SLOW_PROCEDURE_MS, 1000);
  assert.equal(shouldLogSlow(999), false);
  assert.equal(shouldLogSlow(1000), true, "đúng bằng ngưỡng là ghi");
  assert.equal(shouldLogSlow(1500), true);
  assert.equal(shouldLogSlow(120, 100), true);
  assert.equal(shouldLogSlow(120, 0), true, "ngưỡng 0 = ghi tất");
  assert.equal(shouldLogSlow(-1), false);
  assert.equal(shouldLogSlow(Number.NaN), false);
});

test("đo hiệu năng: dòng log không chứa dữ liệu cá nhân", () => {
  const line = slowProcedureLog({ path: "inbox.today", durationMs: 1234.6, queries: 27 });
  assert.equal(line, "slow-procedure path=inbox.today ms=1235 queries=27 ok=true");
  assert.equal(
    slowProcedureLog({ path: "leads.inbox", durationMs: 2000, queries: 5, ok: false }),
    "slow-procedure path=leads.inbox ms=2000 queries=5 ok=false",
  );
  // Tên thủ tục bị nhét chuỗi lạ (SĐT, xuống dòng) → lọc sạch, log vẫn một dòng
  const dirty = slowProcedureLog({ path: "leads.get?phone=84901234567\nFAKE", durationMs: 10, queries: 1 });
  assert.ok(!dirty.includes("\n"));
  assert.ok(!dirty.includes("84901234567"), "không để lọt SĐT vào log");
  assert.ok(!dirty.includes("?"));
  assert.ok(dirty.includes("path=unknown"));
  assert.equal(slowProcedureLog({ path: "!!!", durationMs: 10, queries: 1 }).includes("path=unknown"), true);
  assert.equal(slowProcedureLog({ path: "", durationMs: 10, queries: 1 }).includes("path=unknown"), true);
  assert.equal(slowProcedureLog({ path: "x".repeat(200), durationMs: 10, queries: 1 }).includes("path=unknown"), true);
  // Tên thủ tục thật vẫn giữ nguyên
  assert.ok(slowProcedureLog({ path: "hr.don-tu.list", durationMs: 10, queries: 1 }).includes("path=hr.don-tu.list"));
});

test("đo hiệu năng: đọc ngưỡng từ biến môi trường", () => {
  assert.equal(slowThresholdFromEnv(undefined), 1000);
  assert.equal(slowThresholdFromEnv(""), 1000);
  assert.equal(slowThresholdFromEnv("  "), 1000);
  assert.equal(slowThresholdFromEnv("250"), 250);
  assert.equal(slowThresholdFromEnv("0"), 0, "đặt 0 để ghi mọi thủ tục khi cần soi");
  assert.equal(slowThresholdFromEnv("-1"), 1000);
  assert.equal(slowThresholdFromEnv("abc"), 1000);
});
