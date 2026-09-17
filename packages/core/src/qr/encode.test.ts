import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeQr, qrSvg, cardPayload, parseCardPayload, scanStatus } from "./encode.js";

test("QR: kích thước, phiên bản, mẫu định vị", () => {
  const a = encodeQr("HELLO");
  assert.equal(a.version, 1);
  assert.equal(a.size, 21);
  // góc định vị: viền tối, vòng sáng, lõi tối
  assert.equal(a.modules[0]![0], true);
  assert.equal(a.modules[1]![1], false);
  assert.equal(a.modules[3]![3], true);
  assert.equal(a.modules[13]![8], true, "dark module");
  const long = encodeQr(cardPayload("0b2f6d4e-1c3a-4b5c-8d9e-0f1a2b3c4d5e", 2, "0123456789abcdef"));
  assert.ok(long.version >= 3 && long.version <= 5);
  assert.equal(long.size, long.version * 4 + 17);
  assert.throws(() => encodeQr("x".repeat(300)));
  const v7 = encodeQr("y".repeat(120));
  assert.equal(v7.version, 7);
  assert.ok(qrSvg("abc").startsWith("<svg"));
});

test("thẻ học viên: định dạng, kiểm tra, trạng thái quét", () => {
  const p = cardPayload("0b2f6d4e-1c3a-4b5c-8d9e-0f1a2b3c4d5e", 3, "0123456789abcdef");
  assert.equal(p, "SR1.0b2f6d4e1c3a4b5c8d9e0f1a2b3c4d5e.3.0123456789abcdef");
  assert.deepEqual(parseCardPayload(p), { studentId: "0b2f6d4e-1c3a-4b5c-8d9e-0f1a2b3c4d5e", version: 3, sig: "0123456789abcdef" });
  assert.equal(parseCardPayload("SR1.xyz.1.abc"), null);
  assert.equal(parseCardPayload("https://evil"), null);
  assert.equal(scanStatus("2026-09-17", "17:30:00", new Date("2026-09-17T10:40:00Z")), "present");
  assert.equal(scanStatus("2026-09-17", "17:30", new Date("2026-09-17T10:46:00Z")), "late");
});
