import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SHIFT_CATALOGUE, validateShiftDef, plannedMinutesOf, workSegments, shiftClock, shiftCounts, shiftHasClock,
  isProtectedCell, isTemplateProtected, CELL_ORIGINS, attendanceModeOf, isLeaveShift, nominalMinutesOf,
  classifyRosterCell, emptyRosterTally, ROSTER_CELL_RESULTS, ROSTER_CELL_RESULT_VI, ROSTER_CELL_RESULT_NOTE,
  ATTENDANCE_MODES, PAY_MODES, SHIFT_EDIT_WARNING, type ShiftDef, type RosterCellInput,
} from "./shifts.js";

const def = (o: Partial<ShiftDef>): ShiftDef => ({
  code: "HC", name: "Hành chính", kind: "timed", units: 1,
  segments: [{ from: "08:00", to: "11:30" }, { from: "13:30", to: "17:30" }], workplace: "assigned", punchRequired: true, ...o,
});

test("khai báo mã ca", () => {
  assert.deepEqual(validateShiftDef(def({})), []);
  assert.ok(validateShiftDef(def({ code: "" })).length > 0);
  assert.ok(validateShiftDef(def({ name: "x" })).length > 0);
  assert.ok(validateShiftDef(def({ units: 0.75 })).some((x) => x.includes("Số công")));
  assert.ok(validateShiftDef(def({ kind: "off", units: 1, segments: [], punchRequired: false })).some((x) => x.includes("0 công")));
  assert.deepEqual(validateShiftDef(def({ code: "X", name: "Nghỉ", kind: "off", units: 0, segments: [], punchRequired: false, workplace: "flexible" })), []);
  assert.ok(validateShiftDef(def({ segments: [] })).some((x) => x.includes("ít nhất một đoạn giờ")));
  assert.ok(validateShiftDef(def({ punchRequired: false })).some((x) => x.includes("bắt buộc quét")));
  assert.ok(validateShiftDef(def({ segments: [{ from: "22:00", to: "06:00" }] })).some((x) => x.includes("qua đêm")));
  assert.ok(validateShiftDef(def({ segments: [{ from: "08:00", to: "12:00" }, { from: "11:00", to: "17:00" }] })).some((x) => x.includes("chồng nhau")));
  assert.ok(validateShiftDef(def({ segments: [{ from: "8h", to: "12:00" }] })).some((x) => x.includes("HH:MM")));
  assert.ok(validateShiftDef(def({ kind: "flexible", segments: [{ from: "08:00", to: "09:00" }], punchRequired: false, units: 1 })).some((x) => x.includes("không khai đoạn giờ")));
  assert.deepEqual(validateShiftDef(def({ code: "LD", name: "Linh động", kind: "flexible", segments: [], punchRequired: false, workplace: "flexible" })), []);
});

test("giờ kế hoạch tính từ đoạn giờ", () => {
  assert.equal(plannedMinutesOf([{ from: "09:00", to: "11:30" }, { from: "14:00", to: "17:45" }]), 375);
  assert.equal(plannedMinutesOf([{ from: "14:00", to: "21:00" }]), 420);
  assert.equal(plannedMinutesOf([{ from: "08:00", to: "17:00" }, { from: "12:00", to: "13:00", paid: false }]), 540);
  assert.deepEqual(workSegments([{ from: "13:30", to: "17:30" }, { from: "08:00", to: "11:30" }]), [{ from: 480, to: 690 }, { from: 810, to: 1050 }]);
  assert.equal(shiftClock([{ from: "09:00", to: "11:30" }, { from: "14:00", to: "17:45" }]), "09:00–11:30, 14:00–17:45");
  assert.equal(shiftCounts("leave"), false);
  assert.equal(shiftCounts("location_only"), true);
  assert.equal(shiftHasClock("location_only"), false);
});

test("danh mục mã ca bản gốc hợp lệ", () => {
  assert.equal(SHIFT_CATALOGUE.length, 22);
  assert.equal(new Set(SHIFT_CATALOGUE.map((s) => s.code)).size, SHIFT_CATALOGUE.length);
  for (const s of SHIFT_CATALOGUE) assert.deepEqual(validateShiftDef(s), [], `mã ca ${s.code}`);
  const by = (c: string) => SHIFT_CATALOGUE.find((s) => s.code === c)!;
  assert.equal(plannedMinutesOf(by("CG").segments), 375); // 6h15
  assert.equal(plannedMinutesOf(by("CS").segments), 420); // 7h00
  assert.equal(plannedMinutesOf(by("CCT").segments), 465); // 7h45
  assert.equal(plannedMinutesOf(by("CGD").segments), 495); // 8h15
  assert.equal(plannedMinutesOf(by("HC").segments), 450); // 7h30
  assert.equal(plannedMinutesOf(by("S").segments), 225); // 3h45
  assert.equal(plannedMinutesOf(by("CT").segments), 435); // 7h15
  assert.equal(plannedMinutesOf(by("SCT").segments), 660); // 11h00
  assert.equal(by("SCT").units, 1.5);
  assert.equal(by("S").units, 0.5);
  assert.equal(by("X").units, 0);
  assert.equal(by("P").kind, "leave");
  assert.equal(by("D1").kind, "location_only");
  assert.equal(by("LD").kind, "flexible");
  assert.equal(by("NG").workplace, "field");
});

test("nguồn ô lưới phân ca", () => {
  assert.deepEqual([...CELL_ORIGINS], ["template", "manual", "request", "import"]);
  assert.equal(isProtectedCell("manual"), true);
  assert.equal(isProtectedCell("request"), true);
  assert.equal(isProtectedCell("template"), false);
  // import lại từ Sheet được đè ô do chính file cũ tạo…
  assert.equal(isProtectedCell("import"), false);
  // …nhưng sinh lưới từ khung thì ô import cũng được bảo vệ
  assert.equal(isTemplateProtected("import"), true);
  assert.equal(isTemplateProtected("manual"), true);
  assert.equal(isTemplateProtected("request"), true);
  assert.equal(isTemplateProtected("template"), false);
});

test("mã ca đúng model gốc: cách chấm công gộp, mã nghỉ, phút định mức", () => {
  assert.deepEqual([...ATTENDANCE_MODES], ["timed", "location_only", "admin_hours", "any_center"]);
  assert.deepEqual([...PAY_MODES], ["normal", "paid_break"]);
  assert.equal(attendanceModeOf("timed", "own_center"), "timed");
  assert.equal(attendanceModeOf("timed", "assigned"), "admin_hours");
  assert.equal(attendanceModeOf("timed", "any_center"), "any_center");
  assert.equal(attendanceModeOf("timed", "field"), "timed");
  assert.equal(attendanceModeOf("location_only", "fixed_center"), "location_only");
  assert.equal(attendanceModeOf("flexible", "flexible"), "location_only");
  assert.equal(attendanceModeOf("off", "flexible"), "location_only");
  assert.equal(isLeaveShift("leave"), true);
  assert.equal(isLeaveShift("off"), false);
  // CG: 09:00–11:30 + 14:00–17:45 = 6h15 dù chạy từ 09:00 tới 17:45
  assert.equal(nominalMinutesOf([{ from: "09:00", to: "11:30" }, { from: "14:00", to: "17:45" }]), 375);
  // paid_break: nghỉ giữa giờ vẫn tính công → tính trọn từ đầu tới cuối
  assert.equal(nominalMinutesOf([{ from: "09:00", to: "11:30" }, { from: "14:00", to: "17:45" }], "paid_break"), 525);
  assert.equal(nominalMinutesOf([], "paid_break"), 0);
  assert.match(SHIFT_EDIT_WARNING, /lịch đã xếp giữ nguyên/);
});

/* ---- Sinh lưới phân ca: 8 nhóm kết quả ---- */

const cell = (o: Partial<RosterCellInput>): RosterCellInput => ({
  date: "2026-09-20", today: "2026-09-18", templateCode: "HC", currentCode: null, currentOrigin: null, inScope: true, knownCode: true, ...o,
});

test("8 nhóm kết quả sinh lưới đúng như bản gốc", () => {
  assert.equal(ROSTER_CELL_RESULTS.length, 8);
  assert.deepEqual(ROSTER_CELL_RESULTS.map((k) => ROSTER_CELL_RESULT_VI[k]), [
    "Ô mới", "Ô đổi mã", "Ô giữ nguyên", "Ô bị xoá", "Ô được bảo vệ", "Ô chừa lại", "Ô ngoài quyền", "Mã lạ",
  ]);
  assert.match(ROSTER_CELL_RESULT_NOTE.skipped_past, /chỉ áp từ NGÀY MAI/);
  assert.match(ROSTER_CELL_RESULT_NOTE.protected, /sửa tay \/ đơn đã duyệt \/ file import/);
  assert.match(ROSTER_CELL_RESULT_NOTE.out_of_scope, /khối không được xếp/);
  assert.match(ROSTER_CELL_RESULT_NOTE.unknown_code, /không có trong danh mục/);
  assert.deepEqual(emptyRosterTally(), { created: 0, recoded: 0, kept: 0, removed: 0, protected: 0, skipped_past: 0, out_of_scope: 0, unknown_code: 0 });
});

test("xếp ô vào đúng một nhóm", () => {
  // ô mới / đổi mã / giữ nguyên / bị xoá
  assert.equal(classifyRosterCell(cell({})), "created");
  assert.equal(classifyRosterCell(cell({ currentCode: "CG", currentOrigin: "template" })), "recoded");
  assert.equal(classifyRosterCell(cell({ currentCode: "HC", currentOrigin: "template" })), "kept");
  assert.equal(classifyRosterCell(cell({ templateCode: null, currentCode: "HC", currentOrigin: "template" })), "removed");
  assert.equal(classifyRosterCell(cell({ templateCode: null, currentCode: null })), "kept");
  // ô được bảo vệ: sửa tay / đơn đã duyệt / file import — thắng cả "đổi mã"
  for (const o of ["manual", "request", "import"] as const) {
    assert.equal(classifyRosterCell(cell({ currentCode: "CG", currentOrigin: o })), "protected", o);
  }
  // lưới chỉ áp từ NGÀY MAI: hôm nay và ngày đã qua đều chừa lại
  assert.equal(classifyRosterCell(cell({ date: "2026-09-18" })), "skipped_past");
  assert.equal(classifyRosterCell(cell({ date: "2026-09-01" })), "skipped_past");
  assert.equal(classifyRosterCell(cell({ date: "2026-09-19" })), "created");
  // ngoài quyền thắng tất cả
  assert.equal(classifyRosterCell(cell({ inScope: false, date: "2026-09-01", currentOrigin: "manual" })), "out_of_scope");
  // mã lạ chỉ tính khi khung có mã
  assert.equal(classifyRosterCell(cell({ knownCode: false })), "unknown_code");
  assert.equal(classifyRosterCell(cell({ templateCode: null, knownCode: false, currentCode: "HC", currentOrigin: "template" })), "removed");
  // ô được bảo vệ thắng mã lạ (lưới không đụng vào ô đó dù khung sai mã)
  assert.equal(classifyRosterCell(cell({ knownCode: false, currentCode: "CG", currentOrigin: "manual" })), "protected");
});
