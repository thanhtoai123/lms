import { test } from "node:test";
import assert from "node:assert/strict";
import {
  consentCheck, mediaAudience, canSubmitMedia, canRestoreRejected, restoreDeadline, isMediaOverdue, isSessionMediaMissing,
  mediaObjectKey, MEDIA_STATUSES, MEDIA_STATUS_VI, MEDIA_UPLOAD_MAX_FILES, MEDIA_RESTORE_DAYS,
} from "./consent.js";

test("đồng ý đăng ảnh: chặn khi có HV chưa được PH đồng ý", () => {
  const map = new Map([["a", true], ["b", false]]);
  assert.deepEqual(consentCheck(["a"], map), { ok: true, blocked: [] });
  assert.deepEqual(consentCheck(["a", "b"], map), { ok: false, blocked: ["b"] });
  // HV không có bản ghi đồng ý cũng bị chặn
  assert.deepEqual(consentCheck(["c"], map), { ok: false, blocked: ["c"] });
  assert.deepEqual(consentCheck([], map), { ok: true, blocked: [] });
});

test("ảnh chung cả lớp: người xem là toàn bộ học viên của lớp", () => {
  const roster = ["a", "b", "c"];
  assert.deepEqual(mediaAudience({ isClassWide: true, taggedStudentIds: ["a"] }, roster), roster);
  assert.deepEqual(mediaAudience({ isClassWide: false, taggedStudentIds: ["a", "a", "b"] }, roster), ["a", "b"]);
  // ảnh chung nhưng lớp chưa có HV → không có ai
  assert.deepEqual(mediaAudience({ isClassWide: true, taggedStudentIds: [] }, []), []);
});

test("ảnh chung cả lớp cần đồng ý của mọi PH trong lớp", () => {
  const map = new Map([["a", true], ["b", false]]);
  const audience = mediaAudience({ isClassWide: true, taggedStudentIds: [] }, ["a", "b"]);
  assert.equal(consentCheck(audience, map).ok, false);
});

test("gửi duyệt: chỉ ảnh trong kho và phải nói rõ ảnh của ai", () => {
  assert.equal(canSubmitMedia({ status: "library", isClassWide: false, taggedStudentIds: ["a"] }).ok, true);
  assert.equal(canSubmitMedia({ status: "library", isClassWide: true, taggedStudentIds: [] }).ok, true);
  const noTag = canSubmitMedia({ status: "library", isClassWide: false, taggedStudentIds: [] });
  assert.equal(noTag.ok, false);
  assert.match(noTag.error!, /Gắn thẻ học viên/);
  assert.equal(canSubmitMedia({ status: "pending", isClassWide: true, taggedStudentIds: [] }).ok, false);
  assert.equal(canSubmitMedia({ status: "approved", isClassWide: true, taggedStudentIds: [] }).ok, false);
});

test("ảnh bị loại còn khôi phục trong 7 ngày", () => {
  const rejected = new Date("2026-03-01T08:00:00Z");
  assert.equal(MEDIA_RESTORE_DAYS, 7);
  assert.equal(restoreDeadline(rejected).toISOString(), "2026-03-08T08:00:00.000Z");
  assert.equal(canRestoreRejected(rejected, new Date("2026-03-07T23:00:00Z")), true);
  assert.equal(canRestoreRejected(rejected, new Date("2026-03-08T08:00:00Z")), true);
  assert.equal(canRestoreRejected(rejected, new Date("2026-03-08T08:00:01Z")), false);
  assert.equal(canRestoreRejected(null, new Date("2026-03-02T08:00:00Z")), false);
});

test("quá hạn duyệt tính từ lúc gửi duyệt, mặc định 24 giờ", () => {
  const sent = new Date("2026-03-01T08:00:00Z");
  assert.equal(isMediaOverdue(sent, new Date("2026-03-02T07:00:00Z")), false);
  assert.equal(isMediaOverdue(sent, new Date("2026-03-02T09:00:00Z")), true);
});

test("buổi đã qua chưa có ảnh và chưa ghi nhận 'không có ảnh' là quá hạn xử lý", () => {
  const today = "2026-03-10";
  assert.equal(isSessionMediaMissing({ date: "2026-03-09", photos: 0, noMediaAt: null }, today), true);
  assert.equal(isSessionMediaMissing({ date: "2026-03-09", photos: 0, noMediaAt: new Date() }, today), false);
  assert.equal(isSessionMediaMissing({ date: "2026-03-09", photos: 2, noMediaAt: null }, today), false);
  assert.equal(isSessionMediaMissing({ date: "2026-03-10", photos: 0, noMediaAt: null }, today), false);
});

test("hằng số & khoá lưu trữ", () => {
  assert.equal(MEDIA_UPLOAD_MAX_FILES, 40);
  assert.deepEqual([...MEDIA_STATUSES], ["library", "pending", "approved", "rejected"]);
  assert.equal(MEDIA_STATUSES.every((s) => !!MEDIA_STATUS_VI[s]), true);
  assert.equal(mediaObjectKey("c1", "s1", "m1", "image/png"), "media/c1/s1/m1.png");
  assert.equal(mediaObjectKey("c1", "s1", "m1", "image/jpeg"), "media/c1/s1/m1.jpg");
});
