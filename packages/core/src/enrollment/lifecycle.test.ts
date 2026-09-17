import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enrollmentTransition, enrollmentEventsFor, EnrollmentTransitionError, remainingSessions, isNearingEnd, validatePause, planTransfer,
  pauseLimitDate, pauseReminder, studentLifecycleActions, checkStudentLifecycle, StudentLifecycleError, nextWaitlistRank,
} from "./lifecycle.js";

test("vòng đời ghi danh: học thử → chính thức → bảo lưu → học lại → hoàn thành", () => {
  let s = enrollmentTransition("trial", "activate");
  s = enrollmentTransition(s, "pause");
  assert.equal(s, "paused");
  s = enrollmentTransition(s, "resume");
  assert.equal(enrollmentTransition(s, "complete"), "completed");
  assert.throws(() => enrollmentTransition("completed", "resume"), EnrollmentTransitionError);
  assert.throws(() => enrollmentTransition("paused", "complete"), EnrollmentTransitionError);
  assert.deepEqual(enrollmentEventsFor("paused").sort(), ["resume", "withdraw"]);
});

test("số buổi còn lại và sắp hết khoá", () => {
  assert.equal(remainingSessions(48, 45), 3);
  assert.equal(remainingSessions(12, 15), 0);
  assert.equal(isNearingEnd(3, "active"), true);
  assert.equal(isNearingEnd(3, "paused"), false);
  assert.equal(isNearingEnd(10, "active"), false);
});

test("bảo lưu tối đa 3 tháng", () => {
  assert.equal(validatePause("2026-09-01", "2026-11-30"), null);
  assert.match(validatePause("2026-09-01", "2026-12-15") ?? "", /tối đa 3 tháng/);
  assert.match(validatePause("2026-09-01", "2026-08-01") ?? "", /phải sau/);
});

test("kế hoạch chuyển lớp: mang số buổi còn lại, chặn lớp đầy/trùng, khác khoá phải được miễn", () => {
  const base = { packageSessions: 48, consumed: 20, sourceClassId: "A", sourceCourseId: "S4" };
  const ok = planTransfer({ ...base, target: { classId: "B", courseId: "S4", capacity: 12, enrolled: 5, status: "running" } });
  assert.deepEqual(ok, { ok: true, carrySessions: 28, errors: [], warnings: [], waitlist: false, startSequenceNo: null });
  const full = planTransfer({ ...base, target: { classId: "A", courseId: "S6", capacity: 5, enrolled: 5, status: "running" } });
  assert.equal(full.ok, false);
  assert.equal(full.errors.length, 3); // trùng lớp, khác khoá chưa miễn, lớp đầy
  const waived = planTransfer({ ...base, waiverReason: "Học vượt theo đánh giá GV", target: { classId: "B", courseId: "S6", capacity: 12, enrolled: 5, status: "running" } });
  assert.equal(waived.ok, true);
  assert.match(waived.warnings.join(), /đã miễn/);
  assert.equal(planTransfer({ ...base, waiverReason: "ab", target: { classId: "B", courseId: "S6", capacity: 12, enrolled: 5, status: "running" } }).ok, false);
});

test("chuyển lớp: không vượt tiến độ, lớp đầy vào danh sách chờ, gợi ý buổi vào", () => {
  const base = { packageSessions: 48, consumed: 10, sourceClassId: "A", sourceCourseId: "S4", sourceProgress: 12 };
  const ahead = planTransfer({ ...base, target: { classId: "B", courseId: "S4", capacity: 12, enrolled: 3, status: "running", lessonsDone: 20 } });
  assert.equal(ahead.ok, false);
  assert.match(ahead.errors[0]!, /vượt tiến độ/);
  const near = planTransfer({ ...base, target: { classId: "B", courseId: "S4", capacity: 12, enrolled: 3, status: "running", lessonsDone: 14 } });
  assert.equal(near.ok, true);
  assert.equal(near.startSequenceNo, 15);
  const full = planTransfer({ ...base, allowWaitlist: true, target: { classId: "B", courseId: "S4", capacity: 3, enrolled: 3, status: "recruiting", lessonsDone: 0 } });
  assert.equal(full.ok, true);
  assert.equal(full.waitlist, true);
  assert.equal(planTransfer({ ...base, target: { classId: "B", courseId: "S4", capacity: 3, enrolled: 3, status: "recruiting", lessonsDone: 0 } }).ok, false);
  assert.equal(nextWaitlistRank([]), 1);
  assert.equal(nextWaitlistRank([1, 3]), 4);
});

test("bảo lưu không hẹn ngày trở lại + nhắc việc", () => {
  assert.equal(validatePause("2026-09-01", null), null);
  assert.equal(pauseLimitDate("2026-09-01"), "2026-12-01");
  const r = { id: "p1", fromDate: "2026-09-01", expectedReturn: "2026-10-10" };
  assert.equal(pauseReminder({ ...r, today: "2026-10-01" }), null);
  assert.equal(pauseReminder({ ...r, today: "2026-10-07" })?.kind, "return_soon");
  assert.equal(pauseReminder({ ...r, today: "2026-10-11" })?.kind, "overdue_return");
  assert.equal(pauseReminder({ ...r, expectedReturn: null, today: "2026-11-30" }), null);
  const over = pauseReminder({ ...r, expectedReturn: null, today: "2026-12-02" });
  assert.equal(over?.kind, "over_max");
  assert.equal(over?.dedupeKey, "pause:p1:max");
  assert.equal(pauseReminder({ ...r, expectedReturn: null, today: "2026-12-02" }, { nearingEndSessions: 4, maxPauseMonths: 6 }), null);
});

test("vòng đời học viên: bảo lưu, kết thúc bảo lưu, nghỉ hẳn, kích hoạt lại", () => {
  const studying = { status: "active", studying: 2, paused: 0, openPause: false };
  assert.deepEqual(studentLifecycleActions(studying), ["reserve", "withdraw"]);
  assert.deepEqual(studentLifecycleActions({ status: "paused", studying: 0, paused: 2, openPause: true }), ["end_reserve", "withdraw"]);
  assert.deepEqual(studentLifecycleActions({ status: "withdrawn", studying: 0, paused: 0, openPause: false }), ["reactivate"]);
  assert.equal(checkStudentLifecycle(studying, "reserve", "  Đi du lịch hè "), "Đi du lịch hè");
  assert.throws(() => checkStudentLifecycle(studying, "reserve", "abc"), StudentLifecycleError);
  assert.throws(() => checkStudentLifecycle(studying, "end_reserve"), /không có đợt bảo lưu/);
  assert.equal(checkStudentLifecycle({ status: "paused", studying: 0, paused: 1, openPause: true }, "end_reserve"), null);
  assert.throws(() => checkStudentLifecycle(studying, "reactivate", "Quay lại học"), /Chỉ kích hoạt lại/);
});
