import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reportCardTransition, ReportCardTransitionError, reportCardMilestones, milestoneInfo, milestoneLabel, validateReportCard,
  averageScore, gradeFromAverage, COMPLETION_GRADES, certificateNumber, completionCheck,
  completionTransition, CompletionTransitionError, certificateIssuable, validateCompletionInput, COMPLETION_STATUSES, COMPLETION_STATUS_VI,
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

test("mốc học bạ = buổi báo cáo cuối mỗi học phần 15 buổi (TH STEAM)", () => {
  assert.deepEqual(reportCardMilestones(45), [15, 30, 45], "năm học 3 học phần");
  assert.deepEqual(reportCardMilestones(30), [15, 30], "khoá luyện thi 30 buổi");
  assert.deepEqual(reportCardMilestones(15), [15]);
  assert.deepEqual(reportCardMilestones(20), [15, 20], "khoá lẻ có thêm mốc ở buổi cuối");
  assert.deepEqual(reportCardMilestones(0), []);
  assert.deepEqual(milestoneInfo(30), { term: 2, kind: "end" });
  assert.equal(milestoneLabel(15), "Học phần 1 · báo cáo (buổi 15)");
  assert.equal(milestoneLabel(45), "Học phần 3 · báo cáo (buổi 45)");
  // Chính sách khác vẫn dùng được (vd kỳ 12 buổi có giữa kỳ)
  const old = { termLength: 12, checkpoints: [5, 12] };
  assert.deepEqual(reportCardMilestones(24, old), [5, 12, 17, 24]);
  assert.equal(milestoneLabel(17, old), "Kỳ 2 · giữa kỳ (buổi 17)");
});

test("kiểm tra học bạ trước khi gửi duyệt", () => {
  const ok = validateReportCard({ scores: [{ criterionId: "a", score: 4 }, { criterionId: "b", score: 5 }], activeCriteria: ["a", "b"], comment: "Con tiến bộ rõ, tập trung tốt trong giờ." });
  assert.deepEqual(ok, []);
  const bad = validateReportCard({ scores: [{ criterionId: "a", score: 7 }], activeCriteria: ["a", "b"], comment: "ngắn" });
  assert.equal(bad.length, 3);
});

test("điểm trung bình, xếp loại, số chứng nhận, điều kiện hoàn thành", () => {
  assert.equal(averageScore([4, 5, null, 5]), 4.7);
  assert.equal(averageScore([null]), null);
  assert.equal(gradeFromAverage(5), "Hoàn thành tốt");
  assert.equal(gradeFromAverage(4), "Hoàn thành tốt");
  assert.equal(gradeFromAverage(3.9), "Hoàn thành");
  assert.equal(gradeFromAverage(null), "Hoàn thành");
  assert.deepEqual([...COMPLETION_GRADES], ["Hoàn thành tốt", "Hoàn thành"]);
  assert.equal(certificateNumber("robo-th-n1", 2026, 12), "TH-ROBO-TH-N1-26-000012");
  assert.deepEqual(completionCheck({ status: "active", consumed: 48, packageSessions: 48 }), { ok: true, errors: [], warnings: [] });
  const early = completionCheck({ status: "active", consumed: 40, packageSessions: 48 });
  assert.equal(early.ok, true);
  assert.equal(early.warnings.length, 1);
  assert.equal(completionCheck({ status: "paused", consumed: 1, packageSessions: 48 }).ok, false);
});

test("hoàn thành khoá theo luồng đề xuất: đề xuất → duyệt / từ chối", () => {
  assert.equal(completionTransition("proposed", "approve"), "approved");
  assert.equal(completionTransition("proposed", "reject"), "rejected");
  assert.throws(() => completionTransition("approved", "approve"), CompletionTransitionError);
  assert.throws(() => completionTransition("rejected", "approve"), CompletionTransitionError);
  // chứng nhận chỉ sinh khi được duyệt
  assert.equal(certificateIssuable("approved"), true);
  assert.equal(certificateIssuable("proposed"), false);
  assert.equal(certificateIssuable("rejected"), false);
  assert.equal(COMPLETION_STATUSES.every((s) => !!COMPLETION_STATUS_VI[s]), true);
});

test("nội dung đề xuất hoàn thành khoá: xếp loại + đánh giá GV tối thiểu 20 ký tự", () => {
  assert.deepEqual(validateCompletionInput({ grade: "Giỏi", teacherEvaluation: "Con tiến bộ rõ rệt trong cả khoá học vừa qua." }), []);
  assert.deepEqual(validateCompletionInput({ grade: "", teacherEvaluation: "ngắn" }).length, 2);
  assert.match(validateCompletionInput({ grade: "Giỏi", teacherEvaluation: "ngắn quá" })[0]!, /tối thiểu 20 ký tự/);
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
