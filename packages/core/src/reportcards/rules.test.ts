import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reportCardTransition, ReportCardTransitionError, reportCardMilestones, milestoneInfo, milestoneLabel, validateReportCard,
  averageScore, gradeFromAverage, certificateNumber, completionCheck,
} from "./rules.js";
import { consentCheck, isMediaOverdue, mediaObjectKey } from "../media/consent.js";

test("luồng học bạ: nháp → chờ duyệt → trả lại → gửi lại → duyệt → gửi PH", () => {
  let s = reportCardTransition("draft", "submit");
  s = reportCardTransition(s, "return");
  assert.equal(s, "returned");
  s = reportCardTransition(s, "submit");
  s = reportCardTransition(s, "approve");
  assert.equal(reportCardTransition(s, "publish"), "published");
  assert.throws(() => reportCardTransition("published", "save"), ReportCardTransitionError);
  assert.throws(() => reportCardTransition("draft", "approve"), ReportCardTransitionError);
});

test("mốc học bạ theo kỳ 12 buổi (buổi 5 và 12 mỗi kỳ)", () => {
  assert.deepEqual(reportCardMilestones(12), [5, 12]);
  assert.deepEqual(reportCardMilestones(48), [5, 12, 17, 24, 29, 36, 41, 48]);
  assert.deepEqual(reportCardMilestones(8), [5]);
  assert.deepEqual(milestoneInfo(17), { term: 2, kind: "mid" });
  assert.deepEqual(milestoneInfo(24), { term: 2, kind: "end" });
  assert.equal(milestoneLabel(5), "Kỳ 1 · giữa kỳ (buổi 5)");
});

test("kiểm tra học bạ trước khi gửi duyệt", () => {
  const ok = validateReportCard({ scores: [{ criterionId: "a", score: 4 }, { criterionId: "b", score: 5 }], activeCriteria: ["a", "b"], comment: "Con tiến bộ rõ, tập trung tốt trong giờ." });
  assert.deepEqual(ok, []);
  const bad = validateReportCard({ scores: [{ criterionId: "a", score: 7 }], activeCriteria: ["a", "b"], comment: "ngắn" });
  assert.equal(bad.length, 3);
});

test("điểm trung bình, xếp loại, số chứng chỉ, điều kiện hoàn thành", () => {
  assert.equal(averageScore([4, 5, null, 5]), 4.7);
  assert.equal(averageScore([null]), null);
  assert.equal(gradeFromAverage(4.7), "Xuất sắc");
  assert.equal(gradeFromAverage(3.6), "Giỏi");
  assert.equal(gradeFromAverage(2.5), "Khá");
  assert.equal(gradeFromAverage(null), "Hoàn thành");
  assert.equal(certificateNumber("sata4", 2026, 12), "SR-SATA4-26-000012");
  assert.deepEqual(completionCheck({ status: "active", consumed: 48, packageSessions: 48 }), { ok: true, errors: [], warnings: [] });
  const early = completionCheck({ status: "active", consumed: 40, packageSessions: 48 });
  assert.equal(early.ok, true);
  assert.equal(early.warnings.length, 1);
  assert.equal(completionCheck({ status: "paused", consumed: 1, packageSessions: 48 }).ok, false);
});

test("ảnh lớp: chặn khi có HV chưa đồng ý đăng ảnh; quá hạn duyệt 24h; khoá lưu trữ", () => {
  const consent = new Map([["s1", true], ["s2", false]]);
  assert.deepEqual(consentCheck(["s1"], consent), { ok: true, blocked: [] });
  assert.deepEqual(consentCheck(["s1", "s2", "s3"], consent), { ok: false, blocked: ["s2", "s3"] });
  assert.deepEqual(consentCheck([], consent), { ok: true, blocked: [] });
  const now = new Date("2026-09-16T12:00:00Z");
  assert.equal(isMediaOverdue(new Date("2026-09-15T11:00:00Z"), now), true);
  assert.equal(isMediaOverdue(new Date("2026-09-16T01:00:00Z"), now), false);
  assert.equal(mediaObjectKey("c", "s", "i", "image/png"), "media/c/s/i.png");
});
