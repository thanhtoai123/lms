import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parentRequestTransition, validateParentRequest, slaDue, slaState, requestCode, feedbackPriority, validateFeedback, ratingStats,
  validateSurvey, validateAnswers, npsScore, npsGroup, renderTemplate, unknownVars, nextBirthday, type SurveyQuestion,
} from "./rules.js";

test("yêu cầu phụ huynh: trạng thái", () => {
  assert.equal(parentRequestTransition("absence", "new", "approve"), "approved");
  assert.equal(parentRequestTransition("absence", "approved", "complete"), "done");
  assert.throws(() => parentRequestTransition("absence", "new", "complete"));
  assert.equal(parentRequestTransition("complaint", "in_progress", "complete"), "done");
  assert.throws(() => parentRequestTransition("complaint", "new", "approve"));
  assert.equal(parentRequestTransition("pause", "new", "assign"), "in_progress");
  assert.throws(() => parentRequestTransition("pause", "approved", "cancel"));
  assert.throws(() => parentRequestTransition("pause", "rejected", "approve"));
  assert.equal(parentRequestTransition("other", "new", "cancel"), "cancelled");
});

test("yêu cầu phụ huynh: kiểm tra & SLA", () => {
  const today = "2026-09-17";
  assert.deepEqual(validateParentRequest({ type: "absence", content: "Con bị ốm", enrollmentId: "e", sessionId: "s" }, today), []);
  assert.ok(validateParentRequest({ type: "absence", content: "Con bị ốm", enrollmentId: "e" }, today).includes("Chọn buổi xin nghỉ"));
  assert.ok(validateParentRequest({ type: "pause", content: "Đi xa", enrollmentId: "e", dateFrom: "2026-10-01", dateTo: "2026-09-30" }, today).length > 0);
  assert.ok(validateParentRequest({ type: "makeup", content: "Học bù giúp", enrollmentId: "e" }, today).length > 0);
  assert.deepEqual(validateParentRequest({ type: "complaint", content: "Phòng học nóng" }, today), []);
  assert.ok(validateParentRequest({ type: "complaint", content: "x" }, today).length > 0);
  const c = new Date("2026-09-17T01:00:00Z");
  const due = slaDue(c, "absence");
  assert.equal(due.toISOString(), "2026-09-17T05:00:00.000Z");
  assert.deepEqual(slaState(due, new Date("2026-09-17T06:00:00Z"), "new"), { overdue: true, minutesLeft: -60 });
  assert.deepEqual(slaState(due, new Date("2026-09-17T06:00:00Z"), "done"), { overdue: false, minutesLeft: null });
  assert.equal(requestCode(2026, 42), "YC26-00042");
});

test("đánh giá", () => {
  assert.equal(feedbackPriority(5, 2), "urgent");
  assert.equal(feedbackPriority(3), "follow_up");
  assert.equal(feedbackPriority(4, 5), "normal");
  assert.ok(validateFeedback({ rating: 2, comment: "" }).length > 0);
  assert.deepEqual(validateFeedback({ rating: 5, tags: ["teacher"] }), []);
  assert.ok(validateFeedback({ rating: 6 }).length > 0);
  assert.ok(validateFeedback({ rating: 5, tags: ["x"] }).length > 0);
  assert.deepEqual(ratingStats([5, 4, 4, 2]), { count: 4, avg: 3.75, dist: [0, 1, 0, 2, 1] });
  assert.deepEqual(ratingStats([]), { count: 0, avg: null, dist: [0, 0, 0, 0, 0] });
});

const qs: SurveyQuestion[] = [
  { id: "q1", type: "nps", label: "Giới thiệu cho bạn bè?", required: true },
  { id: "q2", type: "rating", label: "Hài lòng về GV?", required: true },
  { id: "q3", type: "choice", label: "Kênh biết đến?", required: false, options: ["Facebook", "Bạn bè"] },
  { id: "q4", type: "text", label: "Góp ý thêm", required: false },
];

test("khảo sát", () => {
  assert.deepEqual(validateSurvey({ title: "Khảo sát buổi 4", trigger: "session_n", triggerValue: 4, questions: qs }), []);
  assert.ok(validateSurvey({ title: "KS", trigger: "session_n", questions: qs }).length >= 2);
  assert.ok(validateSurvey({ title: "Khảo sát", trigger: "manual", questions: [...qs, { ...qs[0]!, id: "q9" }] }).some((x) => x.includes("NPS")));
  assert.ok(validateSurvey({ title: "Khảo sát", trigger: "manual", questions: [{ id: "c", type: "choice", label: "Chọn đi", required: true, options: ["A", "A"] }] }).length > 0);
  const ok = validateAnswers(qs, { q1: "9", q2: 4, q3: "Bạn bè", q4: "  Tốt  " });
  assert.deepEqual(ok, { errors: [], clean: { q1: 9, q2: 4, q3: "Bạn bè", q4: "Tốt" }, nps: 9 });
  const bad = validateAnswers(qs, { q1: 11, q3: "TikTok" });
  assert.equal(bad.errors.length, 3);
  assert.equal(npsGroup(8), "passive");
  assert.deepEqual(npsScore([10, 9, 8, 6, 3]), { count: 5, promoters: 2, passives: 1, detractors: 2, nps: 0 });
  assert.equal(npsScore([]).nps, null);
  assert.equal(npsScore([10, 10, 7]).nps, 67);
});

test("mẫu thông báo & sinh nhật", () => {
  assert.deepEqual(renderTemplate("Chào {ten_ph}, lớp {lop} nghỉ {x}.", { ten_ph: "chị Lan", lop: "SATA4" }), { text: "Chào chị Lan, lớp SATA4 nghỉ .", missing: ["x"] });
  assert.deepEqual(unknownVars("{ten_hv} {abc} {lop}"), ["abc"]);
  assert.deepEqual(nextBirthday("2016-09-20", "2026-09-17"), { date: "2026-09-20", age: 10, daysUntil: 3 });
  assert.deepEqual(nextBirthday("2016-09-10", "2026-09-17"), { date: "2027-09-10", age: 11, daysUntil: 358 });
  assert.equal(nextBirthday("2016-02-29", "2027-01-01").date, "2027-02-28");
  assert.equal(nextBirthday("2016-09-17", "2026-09-17").daysUntil, 0);
});
