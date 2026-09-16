import { test } from "node:test";
import assert from "node:assert/strict";
import { transition, canTransition, isOverdue, nextStep, SessionTransitionError } from "./stateMachine.js";

const base = { enrolledCount: 10, attendanceCount: 10, hasSessionNote: true, today: "2026-09-16", sessionDate: "2026-09-16" };

test("luồng chuẩn: scheduled → attendance_done → notes_done → completed", () => {
  let s = transition("scheduled", "submit_attendance", base);
  assert.equal(s, "attendance_done");
  s = transition(s, "submit_notes", base);
  assert.equal(s, "notes_done");
  s = transition(s, "complete", base);
  assert.equal(s, "completed");
});

test("không điểm danh buổi tương lai", () => {
  assert.throws(
    () => transition("scheduled", "submit_attendance", { ...base, sessionDate: "2026-09-20" }),
    SessionTransitionError,
  );
});

test("thiếu điểm danh thì không chốt", () => {
  assert.throws(() => transition("scheduled", "submit_attendance", { ...base, attendanceCount: 7 }), /thiếu điểm danh/);
});

test("hoàn tất cần nhận xét buổi", () => {
  assert.throws(() => transition("notes_done", "complete", { ...base, hasSessionNote: false }), /nhận xét/);
});

test("chuyển không hợp lệ bị chặn", () => {
  assert.equal(canTransition("completed", "submit_attendance"), false);
  assert.throws(() => transition("completed", "submit_attendance", base));
});

test("overdue và nextStep", () => {
  assert.equal(isOverdue("scheduled", "2026-09-10", "2026-09-16"), true);
  assert.equal(isOverdue("completed", "2026-09-10", "2026-09-16"), false);
  assert.equal(isOverdue("scheduled", "2026-09-16", "2026-09-16"), false);
  assert.equal(nextStep("attendance_done"), "submit_notes");
  assert.equal(nextStep("completed"), null);
});
