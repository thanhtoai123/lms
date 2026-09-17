import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classTransition, ClassTransitionError, classEventsFor, classReadiness, canFinishClass,
  nextExtraSequence, sessionLabel, missingRequiredChecklist,
} from "./lifecycle.js";
import { planScheduleChange, checkScheduleDrift, validateWeeklySlots, type ExistingSession } from "../scheduling/replan.js";
import { generateSessions } from "../scheduling/generateSessions.js";

test("vòng đời lớp: nháp → chờ duyệt → tuyển sinh → chạy → kết thúc", () => {
  let s = classTransition("draft", "submit");
  assert.equal(s, "pending_approval");
  assert.equal(classTransition(s, "reject"), "draft");
  s = classTransition(s, "approve");
  s = classTransition(s, "start");
  assert.equal(classTransition(s, "finish"), "finished");
  assert.equal(classTransition("running", "cancel"), "cancelled"); // huỷ dây chuyền
  assert.throws(() => classTransition("finished", "cancel"), ClassTransitionError);
  assert.throws(() => classTransition("draft", "approve"), /Duyệt mở lớp/);
  assert.deepEqual(classEventsFor("pending_approval").sort(), ["approve", "cancel", "reject"]);
  assert.equal(canFinishClass(2), "Còn 2 buổi chưa hoàn tất/huỷ");
  assert.equal(canFinishClass(0), null);
});

test("điều kiện gửi duyệt lớp", () => {
  const ok = { scheduleCount: 2, startDate: "2026-10-01", leadTeacherId: "t", capacity: 12, minCapacity: 4, totalSessions: 48 };
  assert.deepEqual(classReadiness(ok), []);
  const bad = classReadiness({ ...ok, scheduleCount: 0, leadTeacherId: null, capacity: 3 });
  assert.equal(bad.length, 3);
});

test("loại buổi, số buổi ngoài lộ trình, checklist", () => {
  assert.equal(nextExtraSequence([1, 2, 3]), 1001);
  assert.equal(nextExtraSequence([1, 1001, 1003]), 1004);
  assert.equal(sessionLabel(5, "regular"), "Buổi 5");
  assert.equal(sessionLabel(1002, "coach_1_1"), "Coach 1-1 #2");
  assert.deepEqual(missingRequiredChecklist({ post: { cleanup: true } }).map((i) => i.key), ["handover"]);
  assert.equal(missingRequiredChecklist({ post: { cleanup: true, handover: true } }).length, 0);
  assert.equal(missingRequiredChecklist(null).length, 2);
});

// Lớp 8 buổi, CN 09:45 + T4 18:00 từ 2026-09-02 (T4)
const rules = [
  { weekday: 3 as const, startTime: "18:00", endTime: "19:30", roomId: "r1", teacherId: "t1", effectiveFrom: "2026-09-02", effectiveTo: null },
  { weekday: 7 as const, startTime: "09:45", endTime: "11:15", roomId: "r1", teacherId: "t1", effectiveFrom: "2026-09-02", effectiveTo: null },
];
const planned = generateSessions({ classId: "c", startDate: "2026-09-02", totalSessions: 8, rules });
const existing = (): ExistingSession[] => planned.map((p) => ({
  id: `s${p.sequenceNo}`, sequenceNo: p.sequenceNo, date: p.date, startTime: p.startTime, endTime: p.endTime,
  status: p.date < "2026-09-16" ? "completed" : "scheduled", kind: "regular", roomId: p.roomId, teacherId: p.teacherId, hasAttendance: p.date < "2026-09-16",
}));

test("áp lịch mới: chỉ dời buổi chưa diễn ra, giữ đủ tổng buổi, bỏ ngày nghỉ", () => {
  const r = planScheduleChange({
    sessions: existing(),
    slots: [{ weekday: 6, startTime: "15:45", endTime: "17:15", roomId: "r2", teacherId: "t1" }],
    fromDate: "2026-09-17", today: "2026-09-16", holidays: ["2026-09-26"],
  });
  assert.deepEqual(r.errors, []);
  const done = existing().filter((s) => s.status === "completed").length;
  assert.equal(r.movable, 8 - done - 1); // buổi T4 16/09 = hôm nay không nằm trong khoảng từ 17/09
  assert.ok(r.changes.every((c) => c.to.date >= "2026-09-17" && c.to.date !== "2026-09-26"));
  assert.ok(r.changes.every((c) => c.to.startTime === "15:45" && c.to.roomId === "r2"));
  assert.deepEqual(r.changes.map((c) => c.to.date), ["2026-09-19", "2026-10-03", "2026-10-10", "2026-10-17"].slice(0, r.movable));
  assert.equal(r.newEndDate, r.changes[r.changes.length - 1]!.to.date);
});

test("áp lịch mới: chặn ngày áp dụng không hợp lệ và ca sai", () => {
  assert.match(planScheduleChange({ sessions: existing(), slots: rules, fromDate: "2026-09-16", today: "2026-09-16" }).errors.join(), /sau hôm nay/);
  assert.match(validateWeeklySlots([{ weekday: 1, startTime: "10:00", endTime: "09:00", roomId: null, teacherId: null }]).join(), /sau giờ bắt đầu/);
  assert.match(validateWeeklySlots([]).join(), /ít nhất một ca/);
  assert.match(planScheduleChange({ sessions: existing(), slots: rules, fromDate: "2027-09-17", today: "2026-09-16" }).errors.join(), /Không có buổi/);
});

test("kiểm tra lệch lịch", () => {
  const ok = checkScheduleDrift({ startDate: "2026-09-02", totalSessions: 8, rules, sessions: existing() });
  assert.equal(ok.ok, true);
  const ss = existing();
  ss[3] = { ...ss[3]!, startTime: "08:00" };
  ss[5] = { ...ss[5]!, date: "2026-09-01" };
  const bad = checkScheduleDrift({ startDate: "2026-09-02", totalSessions: 9, rules, holidays: [ss[1]!.date], sessions: ss });
  const codes = bad.issues.map((i) => i.code);
  assert.equal(bad.ok, false);
  for (const c of ["COUNT", "HOLIDAY", "OFF_SCHEDULE", "ORDER", "BEFORE_START"]) assert.ok(codes.includes(c as never), c);
  const moved = existing();
  moved[2] = { ...moved[2]!, startTime: "08:00", moved: true };
  const m = checkScheduleDrift({ startDate: "2026-09-02", totalSessions: 8, rules, sessions: moved });
  assert.equal(m.ok, true);
  assert.equal(m.issues[0]!.severity, "info");
});

import { authorize, type Actor } from "../policy/policy.js";
test("giáo vụ tạo/sửa lớp nhưng không tự duyệt; quản lý cơ sở duyệt được", () => {
  const gv: Actor = { userId: "g", assignments: [{ role: "CENTER_CLASS_MANAGER", centerId: "c1" }] };
  const ql: Actor = { userId: "q", assignments: [{ role: "CENTER_MANAGER", centerId: "c1" }] };
  assert.equal(authorize(gv, "class:create", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(gv, "class:approve", { centerId: "c1" }).allowed, false);
  assert.equal(authorize(ql, "class:approve", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(ql, "class:approve", { centerId: "c2" }).allowed, false);
});
