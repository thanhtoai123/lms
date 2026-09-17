import { test } from "node:test";
import assert from "node:assert/strict";
import { TRAINING_MODULES, modulesForRoles, gradeQuiz, publicModule, trainingStatus, preflightSummary, PREFLIGHT_CHECKS } from "./training.js";

test("bài hướng dẫn theo vai trò", () => {
  const keys = new Set(TRAINING_MODULES.map((m) => m.key));
  assert.equal(keys.size, TRAINING_MODULES.length);
  for (const m of TRAINING_MODULES) {
    assert.ok(m.quiz.length >= 2, m.key);
    for (const q of m.quiz) assert.ok(q.answer >= 0 && q.answer < q.options.length, `${m.key}: ${q.q}`);
  }
  assert.deepEqual(modulesForRoles(["TEACHER"]).map((m) => m.key), ["basics", "teacher_session"]);
  assert.ok(modulesForRoles(["CENTER_MANAGER"]).some((m) => m.key === "manager_golive"));
  assert.deepEqual(modulesForRoles(["SUPER_ADMIN"]), []);
  const t = TRAINING_MODULES.find((m) => m.key === "teacher_session")!;
  assert.deepEqual(gradeQuiz(t, [1, 1]), { passed: true, wrong: [] });
  assert.deepEqual(gradeQuiz(t, [0, 1]).wrong, [0]);
  assert.equal(gradeQuiz(t, [1]).passed, false);
  assert.equal("answer" in publicModule(t).quiz[0]!, false);
  const st = trainingStatus([
    { userId: "a", name: "A", roles: ["TEACHER"], required: ["basics", "teacher_session"], done: ["basics", "teacher_session"] },
    { userId: "b", name: "B", roles: ["CENTER_ACCOUNTANT"], required: ["basics", "accounting"], done: ["basics"] },
    { userId: "c", name: "C", roles: [], required: [], done: [] },
  ]);
  assert.equal(st.ok, false);
  assert.equal(st.trained, 1);
  assert.equal(st.total, 2);
  assert.deepEqual(st.rows[1]!.missing, ["accounting"]);
  assert.equal(trainingStatus([]).ok, false);
});

test("kiểm tra dữ liệu trước pilot", () => {
  const zero = Object.fromEntries(PREFLIGHT_CHECKS.map((c) => [c.key, 0])) as Parameters<typeof preflightSummary>[0];
  assert.equal(preflightSummary(zero).ok, true);
  const s = preflightSummary({ ...zero, parentsBadPhone: 3 });
  assert.equal(s.ok, true);
  assert.equal(s.warns, 1);
  const b = preflightSummary({ ...zero, noManager: 1, studentsNoGuardian: 2 });
  assert.equal(b.ok, false);
  assert.equal(b.blocks, 2);
});
