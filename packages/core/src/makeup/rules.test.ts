import { test } from "node:test";
import assert from "node:assert/strict";
import { makeupTransition, MakeupTransitionError, withinMakeupWindow, makeupCandidates, isRetroactiveEdit } from "./rules.js";
import { weekStart, weekDays, weekLabel, shiftOf } from "../calendar/week.js";

test("vòng đời học bù", () => {
  assert.equal(makeupTransition("requested", "approve"), "approved");
  assert.equal(makeupTransition("approved", "complete"), "done");
  assert.equal(makeupTransition("approved", "reschedule"), "approved");
  assert.throws(() => makeupTransition("done", "reject"), MakeupTransitionError);
  assert.throws(() => makeupTransition("requested", "complete"), MakeupTransitionError);
});

test("hạn xin học bù 30 ngày", () => {
  assert.equal(withinMakeupWindow("2026-09-01", "2026-09-20"), true);
  assert.equal(withinMakeupWindow("2026-07-01", "2026-09-20"), false);
  assert.equal(withinMakeupWindow("2026-09-25", "2026-09-20"), false);
});

test("buổi học bù phù hợp: cùng khoá + cùng bài, lớp khác, chưa diễn ra, còn chỗ; ưu tiên cùng cơ sở", () => {
  const base = { courseId: "S4", sequenceNo: 5, status: "scheduled" as const, enrolled: 5, capacity: 12 };
  const list = [
    { ...base, id: "a", classId: "X", centerId: "CS1", date: "2026-09-30" }, // cùng lớp → loại
    { ...base, id: "b", classId: "Y", centerId: "CS2", date: "2026-09-21" },
    { ...base, id: "c", classId: "Z", centerId: "CS1", date: "2026-09-28" },
    { ...base, id: "d", classId: "Z", centerId: "CS1", date: "2026-09-10" }, // đã qua
    { ...base, id: "e", classId: "Z", centerId: "CS1", date: "2026-09-29", sequenceNo: 6 }, // khác bài
    { ...base, id: "f", classId: "W", centerId: "CS1", date: "2026-09-22", enrolled: 12 }, // đầy
  ];
  const r = makeupCandidates({ classId: "X", courseId: "S4", centerId: "CS1", sequenceNo: 5 }, list, "2026-09-20");
  assert.deepEqual(r.map((x) => x.id), ["c", "b"]);
  const noCross = makeupCandidates({ classId: "X", courseId: "S4", centerId: "CS1", sequenceNo: 5 }, list, "2026-09-20", { requestWindowDays: 30, allowCrossCenter: false });
  assert.deepEqual(noCross.map((x) => x.id), ["c"]);
});

test("sửa điểm danh hồi tố", () => {
  assert.equal(isRetroactiveEdit("completed", "2026-09-20", "2026-09-20"), true);
  assert.equal(isRetroactiveEdit("scheduled", "2026-09-19", "2026-09-20"), true);
  assert.equal(isRetroactiveEdit("in_progress", "2026-09-20", "2026-09-20"), false);
});

test("tuần lịch bắt đầu Thứ Hai", () => {
  assert.equal(weekStart("2026-09-16"), "2026-09-14"); // Thứ Tư → Thứ Hai
  assert.equal(weekStart("2026-09-20"), "2026-09-14"); // Chủ nhật
  assert.equal(weekDays("2026-09-14").length, 7);
  assert.equal(weekLabel("2026-09-14"), "14/09 – 20/09/2026");
  assert.equal(shiftOf("08:00"), "morning");
  assert.equal(shiftOf("14:30"), "afternoon");
  assert.equal(shiftOf("18:00"), "evening");
});
