import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SHIFT_CATALOGUE, validateShiftDef, plannedMinutesOf, workSegments, shiftClock, shiftCounts, shiftHasClock,
  isProtectedCell, CELL_ORIGINS, type ShiftDef,
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
  assert.equal(isProtectedCell("import"), false);
});
