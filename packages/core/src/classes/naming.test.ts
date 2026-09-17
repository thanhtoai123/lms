import { test } from "node:test";
import assert from "node:assert/strict";
import { nextClassSeq, normalizeClassCode, normalizeStudentCode, suggestClassName, shortHour, buildClassCode } from "../codes.js";
import { nextExtraSequence, nextArchiveSequence, sessionLabel, isArchivedSequence, CANCELLED_SEQUENCE_BASE } from "./lifecycle.js";
import { normalizeAllergies, normalizeNationalId, BLOOD_TYPES, BLOOD_TYPE_VI, GUARDIAN_RELATION_VI } from "../people/students.js";

test("mã lớp: số thứ tự theo max của (cơ sở, khoá, năm), không theo đếm", () => {
  const codes = ["CS2.SATA3.26.004", "CS2.SATA3.26.001", "CS2.SATA3.25.009", "CS1.SATA3.26.007", "CS2.SATA4.26.010", "LOP-CU-01"];
  assert.equal(nextClassSeq(codes, "cs2", "sata3", 2026), 5);
  assert.equal(nextClassSeq(codes, "CS2", "SATA3", 2027), 1);
  assert.equal(buildClassCode("CS2", "SATA3", 2026, nextClassSeq(codes, "CS2", "SATA3", 2026)), "CS2.SATA3.26.005");
  assert.equal(normalizeClassCode(" cs2.sata3.26.004 "), "CS2.SATA3.26.004");
  assert.equal(normalizeClassCode("a b"), null);
  assert.equal(normalizeClassCode("AB"), null);
});

test("mã học viên nhập tay", () => {
  assert.equal(normalizeStudentCode(" sr.hv.001 "), "SR.HV.001");
  assert.equal(normalizeStudentCode("CS2-26-M85QCG"), "CS2-26-M85QCG");
  assert.equal(normalizeStudentCode("HV 01"), null);
  assert.equal(normalizeStudentCode("AB"), null);
  assert.equal(normalizeStudentCode("x".repeat(31)), null);
});

test("gợi ý tên lớp theo quy ước", () => {
  assert.equal(shortHour("14:00"), "14h");
  assert.equal(shortHour("09:30:00"), "9h30");
  assert.equal(suggestClassName({ courseCode: "SATA3", slots: [{ weekday: 7, startTime: "14:00" }], roomCode: "P302", centerCode: "CS2" }), "sata3.14h-CN.CS2-P302");
  assert.equal(
    suggestClassName({ courseCode: "Combo", slots: [{ weekday: 6, startTime: "15:30" }, { weekday: 1, startTime: "10:00" }, { weekday: 3, startTime: "10:00" }], roomCode: "CS2-P302", centerCode: "CS2" }),
    "combo.10h-T2&10h-T4&15h30-T7.CS2-P302",
  );
  assert.equal(suggestClassName({ courseCode: "sata1", slots: [{ weekday: 2, startTime: "18:00" }], centerCode: "CS1" }), "sata1.18h-T3.CS1");
});

test("dải số buổi: ngoài lộ trình 1001+, lưu trữ buổi huỷ 5001+", () => {
  assert.equal(nextExtraSequence([1, 1002, 5001]), 1003);
  assert.equal(nextArchiveSequence([1, 2, 1001]), CANCELLED_SEQUENCE_BASE + 1);
  assert.equal(nextArchiveSequence([5001, 5003]), 5004);
  assert.equal(isArchivedSequence(5002), true);
  assert.equal(isArchivedSequence(1002), false);
  assert.equal(sessionLabel(5002, "regular", 7), "Buổi 7 (đã huỷ)");
  assert.equal(sessionLabel(5002, "regular"), "Buổi đã huỷ #2");
});

test("hồ sơ học viên: dị ứng, CCCD, nhóm máu, quan hệ", () => {
  assert.deepEqual(normalizeAllergies(["  Tôm ", "tôm", "", null, "Đậu   phộng"]), ["Tôm", "Đậu phộng"]);
  assert.equal(normalizeAllergies(Array.from({ length: 30 }, (_, i) => `x${i}`)).length, 20);
  assert.equal(normalizeNationalId("001 234 567 890"), "001234567890");
  assert.equal(normalizeNationalId("123456789"), "123456789");
  assert.equal(normalizeNationalId("12345"), null);
  assert.equal(BLOOD_TYPES.length, 9);
  assert.equal(BLOOD_TYPE_VI.AB_NEG, "AB−");
  assert.equal(GUARDIAN_RELATION_VI.grandmother, "Bà");
});
