import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPTURE_KINDS, captureAction, captureRisk, maskContact, parseCaptureAction, watermarkText } from "./protect.js";

test("nhãn thao tác nghi vấn đi và về đúng", () => {
  for (const k of CAPTURE_KINDS) {
    assert.equal(parseCaptureAction(captureAction(k)), k);
  }
  assert.equal(parseCaptureAction("view"), null);
  assert.equal(parseCaptureAction("capture:khong-co"), null);
});

test("chữ mờ có tên, liên hệ đã che và giờ phút", () => {
  const at = new Date(2026, 8, 23, 9, 5);
  assert.equal(watermarkText({ name: "Nguyễn Văn A", contact: "0912345678" }, at), "Nguyễn Văn A · 091***678 · 23/09 09:05");
  assert.equal(watermarkText({ name: "Cô B" }, at), "Cô B · 23/09 09:05");
  assert.equal(maskContact("giaovien@satarobo.vn"), "gi***@satarobo.vn");
  assert.equal(maskContact("12345"), "12345");
});

test("mức cảnh báo theo số lần nghi vấn", () => {
  assert.equal(captureRisk(0).level, "ok");
  assert.equal(captureRisk(2).level, "ok");
  assert.equal(captureRisk(3).level, "watch");
  assert.equal(captureRisk(12).level, "alert");
});
