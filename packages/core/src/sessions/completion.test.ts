import { test } from "node:test";
import assert from "node:assert/strict";
import { completionBlockers, completionChecklist, transition, validateSessionAdjust, validateSessionCancel, canTransition, type CompletionInput } from "./stateMachine.js";

const ready: CompletionInput = {
  enrolledCount: 8, attendanceCount: 8, lessonConfirmed: true, hasSessionNote: true,
  presentWithoutRemark: 0, requireRemarks: true, mediaCount: 0, requireMedia: false, checklistMissing: [],
};

test("điều kiện hoàn tất buổi: đủ thì không còn chặn", () => {
  assert.deepEqual(completionBlockers(ready), []);
  const steps = completionChecklist(ready);
  assert.equal(steps.find((s) => s.key === "media")?.required, false);
  assert.equal(steps.find((s) => s.key === "homework")?.required, false);
});

test("điều kiện hoàn tất buổi: điểm danh, xác nhận bài, nhận xét từng HV, ảnh, checklist", () => {
  const b = completionBlockers({ ...ready, attendanceCount: 6, lessonConfirmed: false, presentWithoutRemark: 3, requireMedia: true, checklistMissing: ["Bàn giao HV"] });
  assert.equal(b.length, 5);
  assert.match(b.join("|"), /6\/8/);
  assert.match(b.join("|"), /xác nhận bài/);
  assert.match(b.join("|"), /3 học viên/);
  assert.match(b.join("|"), /ảnh/);
  assert.match(b.join("|"), /Bàn giao HV/);
  // tắt yêu cầu nhận xét từng HV theo cấu hình cơ sở
  assert.deepEqual(completionBlockers({ ...ready, presentWithoutRemark: 3, requireRemarks: false }), []);
  assert.deepEqual(completionBlockers({ ...ready, requireMedia: true, mediaCount: 2 }), []);
  assert.match(completionBlockers({ ...ready, hasSessionNote: false }).join(), /nhận xét chung/);
  // lớp không có HV: điểm danh coi như xong
  assert.deepEqual(completionBlockers({ ...ready, enrolledCount: 0, attendanceCount: 0 }), []);
});

test("state machine dùng danh sách chặn thay cho nhận xét chung", () => {
  const ctx = { enrolledCount: 1, attendanceCount: 1, today: "2026-09-16", sessionDate: "2026-09-16" };
  assert.equal(transition("notes_done", "complete", { ...ctx, completionBlockers: [] }), "completed");
  assert.throws(() => transition("notes_done", "complete", { ...ctx, completionBlockers: ["Chưa xác nhận bài đã dạy"] }), /xác nhận bài/);
  assert.equal(canTransition("cancelled", "reopen"), false);
});

test("điều chỉnh / huỷ từng buổi", () => {
  const cur = { date: "2026-09-20", startTime: "09:45:00", endTime: "11:15:00", roomId: "r", teacherId: "t" };
  const base = { status: "scheduled" as const, hasAttendance: false, current: cur, today: "2026-09-16" };
  assert.deepEqual(validateSessionAdjust({ ...base, next: { ...cur, startTime: "09:45", endTime: "11:15", teacherId: "t2" } }), []);
  assert.match(validateSessionAdjust({ ...base, next: { ...cur, startTime: "09:45", endTime: "11:15" } }).join(), /Không có thay đổi/);
  assert.match(validateSessionAdjust({ ...base, next: { ...cur, date: "2026-09-10", startTime: "09:45", endTime: "11:15" } }).join(), /ngày đã qua/);
  assert.match(validateSessionAdjust({ ...base, next: { ...cur, startTime: "11:00", endTime: "10:00" } }).join(), /sau giờ bắt đầu/);
  assert.match(validateSessionAdjust({ ...base, status: "completed", next: { ...cur, startTime: "10:00", endTime: "11:30" } }).join(), /chưa diễn ra/);
  assert.match(validateSessionAdjust({ ...base, current: { ...cur, date: "2026-09-12" }, next: { ...cur, startTime: "10:00", endTime: "11:30" } }).join(), /đã qua ngày/);
  assert.deepEqual(validateSessionCancel({ status: "scheduled", hasAttendance: false }), []);
  assert.equal(validateSessionCancel({ status: "completed", hasAttendance: false }).length, 1);
  assert.equal(validateSessionCancel({ status: "in_progress", hasAttendance: true }).length, 1);
});
