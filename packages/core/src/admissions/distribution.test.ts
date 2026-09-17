import { test } from "node:test";
import assert from "node:assert/strict";
import {
  consumesRound, modeConsumesRounds, intakeAssignmentSource, reenableRounds, roundsFloor, validateRoundAdjust, validateLeadTransfer, isConvertedLead,
  ASSIGNMENT_SOURCES, ASSIGNMENT_SOURCE_VI, POOL_ACTIONS, POOL_ACTION_VI,
} from "./distribution.js";
import { nextClassSeq, buildClassCode, buildStudentCode } from "../codes.js";

test("chỉ lead máy chia ở chế độ luân phiên mới tiêu lượt", () => {
  assert.equal(consumesRound("auto", "round_robin"), true);
  assert.equal(consumesRound("auto", "by_conversion"), false);
  for (const s of ASSIGNMENT_SOURCES.filter((x) => x !== "auto")) assert.equal(consumesRound(s, "round_robin"), false, s);
  assert.equal(modeConsumesRounds("manual"), false);
  assert.equal(Object.keys(ASSIGNMENT_SOURCE_VI).length, ASSIGNMENT_SOURCES.length);
  assert.equal(Object.keys(POOL_ACTION_VI).length, POOL_ACTIONS.length);
});

test("nguồn phân lead khi nhập phiếu", () => {
  assert.equal(intakeAssignmentSource({ actorId: "u1", assignedToId: "u1" }), "self");
  assert.equal(intakeAssignmentSource({ actorId: "m1", assignedToId: "u1" }), "manager");
  assert.equal(intakeAssignmentSource({ actorId: null, assignedToId: "u1" }), "manager");
  assert.equal(intakeAssignmentSource({ actorId: "u1", assignedToId: null }), "auto");
  assert.equal(intakeAssignmentSource({ actorId: null, assignedToId: null, referral: true }), "affiliate");
});

test("bật lại người nhận: lượt về mức thấp nhất của người đang nhận (không về 0, không dồn lead)", () => {
  assert.equal(reenableRounds(3, [23, 25, 24]), 23);
  assert.equal(reenableRounds(30, [23]), 23);
  assert.equal(reenableRounds(7, []), 7);
  assert.equal(roundsFloor([]), null);
  assert.equal(roundsFloor([4, 2, 9]), 2);
});

test("chỉnh lượt tay cần lý do và phải khác số hiện tại", () => {
  assert.deepEqual(validateRoundAdjust(5, 7, "Bù lượt nghỉ phép"), []);
  assert.deepEqual(validateRoundAdjust(5, 5, "abc"), ["Bằng số hiện tại — không có gì để điều chỉnh"]);
  assert.deepEqual(validateRoundAdjust(5, -1, ""), ["Lượt phải là số nguyên từ 0", "Nhập lý do chỉnh lượt (tối thiểu 3 ký tự)"]);
});

test("chuyển lead: note bàn giao bắt buộc, không tự bàn giao, không trùng nguồn", () => {
  const base = { fromCenterId: "cs1", fromUserId: "s1" };
  assert.deepEqual(validateLeadTransfer({ ...base, toUserId: "s2", handoverNote: "Đã tư vấn Sata3, PH hỏi lịch T7" }), []);
  assert.deepEqual(validateLeadTransfer({ ...base, toCenterId: "cs2", handoverNote: "Đã tư vấn Sata3, PH ở gần CS2" }), []);
  assert.deepEqual(validateLeadTransfer({ ...base, toUserId: "s2", handoverNote: "ngắn" }), ["Bắt buộc ghi đã tư vấn gì cho khách (tối thiểu 10 ký tự)"]);
  assert.deepEqual(validateLeadTransfer({ ...base, toUserId: "s1", toCenterId: "cs2", handoverNote: "Đã tư vấn đầy đủ" }), ["Sale nhận phải khác sale đang phụ trách — không thể bàn giao cho chính mình."]);
  assert.deepEqual(validateLeadTransfer({ ...base, toCenterId: "cs1", handoverNote: "Đã tư vấn đầy đủ" }), ["Cơ sở và sale đích trùng nguồn — chọn cơ sở khác hoặc sale khác để bàn giao."]);
  assert.deepEqual(validateLeadTransfer({ ...base, handoverNote: "Đã tư vấn đầy đủ" }), ["Cơ sở và sale đích trùng nguồn — chọn cơ sở khác hoặc sale khác để bàn giao."]);
  // lead chưa có sale: giao cho sale bất kỳ là hợp lệ
  assert.deepEqual(validateLeadTransfer({ fromCenterId: "cs1", fromUserId: null, toUserId: "s1", handoverNote: "Khách hỏi học phí" }), []);
});

test("lead đã chốt không phân bổ lại", () => {
  assert.equal(isConvertedLead({ status: "enrolled" }), true);
  assert.equal(isConvertedLead({ status: "deciding", convertedAt: "2026-09-01T00:00:00Z" }), true);
  assert.equal(isConvertedLead({ status: "deciding", convertedAt: null }), false);
});

test("số thứ tự mã lớp theo max trong (cơ sở, khoá, năm) — không đếm lớp", () => {
  const codes = ["CS2.SATA3.26.004", "CS2.SATA3.26.002", "CS2.SATA3.25.009", "CS1.SATA3.26.011", "CS2.SATA4.26.020", null, "legacy-x"];
  assert.equal(nextClassSeq(codes, "cs2", "sata3", 2026), 5);
  assert.equal(nextClassSeq(codes, "CS2", "SATA3", 2027), 1);
  assert.equal(buildClassCode("CS2", "SATA3", 2026, nextClassSeq(codes, "CS2", "SATA3", 2026)), "CS2.SATA3.26.005");
  assert.equal(buildStudentCode("cs2", 2026, 42), "CS2-26-000042");
  // mã khoá có ký tự ngoài [A-Z0-9] vẫn tính đúng; số thứ tự > 999
  assert.equal(nextClassSeq(["CS1.SATA-X.26.007", "cs1.sata-x.26.1002"], "CS1", "SATA-X", 2026), 1003);
});
