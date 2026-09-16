import { test } from "node:test";
import assert from "node:assert/strict";
import { enrollmentTransition, enrollmentEventsFor, EnrollmentTransitionError, remainingSessions, isNearingEnd, validatePause, planTransfer } from "./lifecycle.js";

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

test("kế hoạch chuyển lớp: mang số buổi còn lại, chặn lớp đầy/trùng, cảnh báo khác khoá", () => {
  const base = { packageSessions: 48, consumed: 20, sourceClassId: "A", sourceCourseId: "S4" };
  const ok = planTransfer({ ...base, target: { classId: "B", courseId: "S4", capacity: 12, enrolled: 5, status: "running" } });
  assert.deepEqual(ok, { ok: true, carrySessions: 28, errors: [], warnings: [] });
  const full = planTransfer({ ...base, target: { classId: "A", courseId: "S6", capacity: 5, enrolled: 5, status: "running" } });
  assert.equal(full.ok, false);
  assert.equal(full.errors.length, 2);
  assert.equal(full.warnings.length, 1);
});
