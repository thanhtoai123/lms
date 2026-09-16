import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCourse, normalizeCourseCode, validatePrerequisite, missingPrerequisites, moveLesson, curriculumReadiness } from "./catalog.js";
import { nextTeacherCode, weeklyLoad, isoWeekStart, loadLevel, validateEvaluation, canTeachCourse, validateTeacherStatusChange } from "../people/teachers.js";
import { planReflow, dateRange, type ExistingSession } from "../scheduling/replan.js";
import { authorize, type Actor } from "../policy/policy.js";

test("khoá học", () => {
  assert.equal(normalizeCourseCode(" sata 9 "), "SATA9");
  assert.deepEqual(validateCourse({ code: "SATA9", name: "Sata9 AI", totalSessions: 48, sessionMinutes: 90, listPrice: 1, gradeFrom: 5, gradeTo: 7 }), []);
  assert.equal(validateCourse({ code: "!", name: "a", totalSessions: 0, sessionMinutes: 10, listPrice: -1, gradeFrom: 9, gradeTo: 3 }).length, 6);
});

test("khoá tiên quyết: chặn tự tham chiếu, trùng, vòng lặp", () => {
  const edges = [{ courseId: "B", requiredCourseId: "A" }, { courseId: "C", requiredCourseId: "B" }];
  assert.equal(validatePrerequisite(edges, { courseId: "D", requiredCourseId: "C" }), null);
  assert.match(validatePrerequisite(edges, { courseId: "A", requiredCourseId: "C" })!, /vòng lặp/);
  assert.match(validatePrerequisite(edges, { courseId: "A", requiredCourseId: "A" })!, /chính nó/);
  assert.match(validatePrerequisite(edges, { courseId: "B", requiredCourseId: "A" })!, /Đã có/);
  assert.deepEqual(missingPrerequisites(["A", "B"], ["A"]), ["B"]);
});

test("giáo trình: đổi thứ tự bài, điều kiện dùng", () => {
  const ls = [{ id: "x", sequenceNo: 1 }, { id: "y", sequenceNo: 2 }, { id: "z", sequenceNo: 3 }];
  assert.deepEqual(moveLesson(ls, "z", "up").map((l) => l.id), ["x", "z", "y"]);
  assert.deepEqual(moveLesson(ls, "x", "up").map((l) => l.id), ["x", "y", "z"]);
  assert.equal(curriculumReadiness(0, 12).length, 1);
  assert.match(curriculumReadiness(13, 12).join(), /nhiều hơn/);
});

test("giáo viên: mã, tải tuần, đánh giá, trạng thái", () => {
  assert.equal(nextTeacherCode(["GV001", "GV009", null, "X1"]), "GV010");
  assert.equal(nextTeacherCode([]), "GV001");
  assert.equal(isoWeekStart("2026-09-20"), "2026-09-14");
  const w = weeklyLoad(["2026-09-14", "2026-09-20", "2026-09-21"]);
  assert.equal(w.get("2026-09-14"), 2);
  assert.equal(loadLevel(21, 20), "over");
  assert.equal(loadLevel(17, 20), "high");
  assert.equal(loadLevel(5, 20), "ok");
  assert.equal(validateEvaluation(6, "ngắn").length, 2);
  assert.equal(canTeachCourse([], "c"), true);
  assert.equal(canTeachCourse(["a"], "c"), false);
  assert.match(validateTeacherStatusChange("stopped", 3)!, /3 buổi/);
  assert.equal(validateTeacherStatusChange("active", 3), null);
});

test("ngày nghỉ: dời buổi bị ảnh hưởng theo lịch hiện hành", () => {
  const rules = [{ weekday: 7 as const, startTime: "09:45", endTime: "11:15", roomId: "r", teacherId: "t", effectiveFrom: "2026-09-01", effectiveTo: null }];
  const ss: ExistingSession[] = ["2026-09-20", "2026-09-27", "2026-10-04"].map((d, i) => ({ id: `s${i}`, sequenceNo: i + 5, date: d, startTime: "09:45:00", endTime: "11:15:00", status: "scheduled", kind: "regular", roomId: "r", teacherId: "t", hasAttendance: false }));
  const r = planReflow({ sessions: ss, rules, fromDate: "2026-09-20", today: "2026-09-16", holidays: ["2026-09-27"] });
  assert.deepEqual(r.changes.map((c) => c.to.date), ["2026-09-20", "2026-10-04", "2026-10-11"]);
  assert.deepEqual(r.changes.map((c) => c.changed), [false, true, true]);
  assert.equal(dateRange("2026-09-01", "2026-09-03").length, 3);
});

test("quyền mới: đánh giá GV, ngày nghỉ, khoá học", () => {
  const ql: Actor = { userId: "q", assignments: [{ role: "CENTER_MANAGER", centerId: "c1" }] };
  const gv: Actor = { userId: "g", assignments: [{ role: "CENTER_CLASS_MANAGER", centerId: "c1" }] };
  const dt: Actor = { userId: "d", assignments: [{ role: "TRAINING", centerId: null }] };
  assert.equal(authorize(ql, "teacher:evaluate", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(ql, "holiday:create", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(ql, "holiday:create", { centerId: null }).allowed, true); // scope null = không chỉ định → service kiểm tra toàn hệ thống riêng
  assert.equal(authorize(gv, "holiday:create", { centerId: "c1" }).allowed, false);
  assert.equal(authorize(ql, "course:update").allowed, false);
  assert.equal(authorize(dt, "course:update").allowed, true);
  assert.equal(authorize(dt, "teacher:update").allowed, false);
});
