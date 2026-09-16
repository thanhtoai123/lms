import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, sessionsConsumed, detectRisks } from "./rules.js";
import type { AttendanceRecord } from "../types.js";

const r = (seq: number, status: AttendanceRecord["status"]): AttendanceRecord => ({ sequenceNo: seq, sessionDate: `2026-09-${String(seq).padStart(2, "0")}`, status });

test("summarize tính chuyên cần và học bù chờ", () => {
  const s = summarize([r(1, "present"), r(2, "late"), r(3, "absent_excused"), r(4, "absent_unexcused"), r(5, "makeup"), r(6, "present")]);
  assert.equal(s.total, 6);
  assert.equal(s.attended, 4);
  assert.equal(Math.round(s.rate * 100), 67);
  assert.equal(s.pendingMakeup, 1);
});

test("sessionsConsumed theo quy ước", () => {
  const recs = [r(1, "present"), r(2, "absent_excused"), r(3, "absent_unexcused"), r(4, "makeup")];
  assert.equal(sessionsConsumed(recs), 2);
  assert.equal(sessionsConsumed(recs, { countExcusedAbsence: true }), 3);
});

test("detectRisks: nghỉ 2 buổi liên tiếp", () => {
  const risks = detectRisks([r(1, "present"), r(2, "present"), r(3, "absent_unexcused"), r(4, "absent_excused")]);
  assert.ok(risks.some((x) => x.code === "CONSECUTIVE_ABSENCE"));
});

test("detectRisks: không cảnh báo khi buổi cuối có mặt", () => {
  const risks = detectRisks([r(1, "absent_unexcused"), r(2, "absent_excused"), r(3, "present"), r(4, "present")]);
  assert.ok(!risks.some((x) => x.code === "CONSECUTIVE_ABSENCE"));
});

test("detectRisks: chuyên cần thấp chỉ tính khi đủ 4 buổi", () => {
  assert.equal(detectRisks([r(1, "absent_unexcused"), r(2, "present")]).some((x) => x.code === "LOW_ATTENDANCE"), false);
  const low = detectRisks([r(1, "absent_unexcused"), r(2, "present"), r(3, "absent_excused"), r(4, "present"), r(5, "present")]);
  assert.ok(low.some((x) => x.code === "LOW_ATTENDANCE"));
});
