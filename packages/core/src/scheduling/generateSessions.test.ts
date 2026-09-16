import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSessions, expectedEndDate } from "./generateSessions.js";
import { findConflicts } from "./conflicts.js";
import { weekdayOf } from "../dates.js";

const rules = [
  { weekday: 6 as const, startTime: "15:45", endTime: "17:15", roomId: "P302", teacherId: "gv1", effectiveFrom: "2026-09-01", effectiveTo: null },
];

test("sinh đúng số buổi vào đúng thứ, bỏ qua ngày lễ", () => {
  // 2026-09-19 là Thứ Bảy
  assert.equal(weekdayOf("2026-09-19"), 6);
  const s = generateSessions({ classId: "c1", startDate: "2026-09-14", totalSessions: 4, rules, holidays: ["2026-09-26"] });
  assert.deepEqual(
    s.map((x) => x.date),
    ["2026-09-19", "2026-10-03", "2026-10-10", "2026-10-17"],
  );
  assert.equal(s[0]!.sequenceNo, 1);
  assert.equal(s[3]!.sequenceNo, 4);
  assert.equal(expectedEndDate(s), "2026-10-17");
});

test("hai ca trong cùng một ngày được sắp theo giờ", () => {
  const two = [
    { ...rules[0]!, startTime: "18:00", endTime: "19:30" },
    rules[0]!,
  ];
  const s = generateSessions({ classId: "c1", startDate: "2026-09-19", totalSessions: 2, rules: two });
  assert.equal(s[0]!.startTime, "15:45");
  assert.equal(s[1]!.startTime, "18:00");
  assert.equal(s[1]!.date, "2026-09-19");
});

test("rule hết hiệu lực thì ngừng sinh và báo lỗi nếu không đủ", () => {
  const limited = [{ ...rules[0]!, effectiveTo: "2026-09-30" }];
  assert.throws(() => generateSessions({ classId: "c1", startDate: "2026-09-14", totalSessions: 5, rules: limited, maxScanDays: 60 }));
});

test("gán lessonId theo thứ tự giáo trình", () => {
  const s = generateSessions({ classId: "c1", startDate: "2026-09-19", totalSessions: 2, rules, lessonIds: ["L1", "L2", "L3"] });
  assert.equal(s[0]!.lessonId, "L1");
  assert.equal(s[1]!.lessonId, "L2");
});

test("phát hiện trùng phòng và trùng giáo viên", () => {
  const c = findConflicts([
    { id: "a", date: "2026-09-19", startTime: "15:45", endTime: "17:15", roomId: "P302", teacherId: "gv1" },
    { id: "b", date: "2026-09-19", startTime: "16:30", endTime: "18:00", roomId: "P302", teacherId: "gv2" },
    { id: "c", date: "2026-09-19", startTime: "17:15", endTime: "18:45", roomId: "P302", teacherId: "gv1" }, // liền kề, không trùng phòng với a
    { id: "d", date: "2026-09-19", startTime: "16:00", endTime: "17:00", roomId: "P101", teacherId: "gv1" }, // trùng GV với a
  ]);
  const keys = c.map((x) => `${x.kind}:${x.a}-${x.b}`).sort();
  assert.deepEqual(keys, ["room:a-b", "room:b-c", "teacher:a-d"]);
});
