import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validatePosition, activeOn, staffTransition, proratedLeave, hhmm, fmtMin, vnParts, haversineM, checkGeofence,
  computeDay, summarizeDays, validateRequest, requestMinutes, leaveDays, requestTransition, periodRange, datesBetween, lockCheck, staffCode,
  validatePositionDef, activeRoleAssignments, roleValidOn, widenByDeployments, isLateSubmission, describeRequestEffect, standardUnits,
  leaveIsPaid, leaveUsesBalance, requestKindsOf, isClassRequest, isReviewableFlag,
  type DayInput, type DayShift, type RequestInput,
} from "./rules.js";
import { plannedMinutesOf } from "./shifts.js";

test("vị trí công việc", () => {
  const cur = [{ id: "p1", kind: "primary" as const, centerId: "cs1", title: "Tư vấn", effectiveFrom: "2026-01-01", effectiveTo: null }];
  assert.ok(validatePosition({ kind: "primary", centerId: "cs2", title: "Quản lý", effectiveFrom: "2026-09-01", effectiveTo: null }, cur)[0]!.includes("Trùng"));
  assert.deepEqual(validatePosition({ kind: "concurrent", centerId: "cs2", title: "Quản lý", effectiveFrom: "2026-09-01", effectiveTo: null }, cur), []);
  assert.ok(validatePosition({ kind: "delegated", centerId: "cs2", title: "Quyền QL", effectiveFrom: "2026-09-01", effectiveTo: null }, cur).length > 0);
  assert.ok(validatePosition({ kind: "delegated", centerId: "cs2", title: "Quyền QL", effectiveFrom: "2026-09-01", effectiveTo: "2026-12-31" }, cur).some((x) => x.includes("90")));
  assert.deepEqual(validatePosition({ kind: "primary", centerId: "cs1", title: "Kế toán", effectiveFrom: "2027-01-01", effectiveTo: null }, [{ ...cur[0]!, effectiveTo: "2026-12-31" }]), []);
  assert.ok(validatePosition({ id: "p2", kind: "concurrent", centerId: "cs1", title: "tư vấn ", effectiveFrom: "2026-05-01", effectiveTo: null }, cur).some((x) => x.includes("cùng chức danh")));
  assert.equal(activeOn([...cur, { ...cur[0]!, id: "x", effectiveTo: "2025-12-31", effectiveFrom: "2025-01-01" }], "2026-03-01").length, 1);
  assert.equal(staffTransition("resigned", "active")?.includes("nghỉ việc"), true);
  assert.equal(staffTransition("probation", "active"), null);
  assert.ok(staffTransition("active", "probation"));
  assert.equal(proratedLeave(12, "2026-07-10", 2026), 6);
  assert.equal(proratedLeave(12, "2026-08-10", 2026), 5);
  assert.equal(proratedLeave(12, "2025-08-10", 2026), 12);
  assert.equal(proratedLeave(12, "2027-01-01", 2026), 0);
  assert.equal(staffCode(7), "NV0007");
});

test("vị trí = bộ vai trò, hiệu lực và điều động", () => {
  const existing = [
    { id: "v1", name: "Quản lý cơ sở 1", centerId: "cs1", reportsToId: null },
    { id: "v2", name: "Giáo vụ CS1", centerId: "cs1", reportsToId: "v1" },
  ];
  assert.deepEqual(validatePositionDef({ name: "Kế toán CS1", centerId: "cs1", roles: ["CENTER_ACCOUNTANT"], isManager: false }, existing), []);
  assert.ok(validatePositionDef({ name: "quản lý cơ sở 1", centerId: "cs1", roles: ["CENTER_MANAGER"], isManager: true }, existing).some((x) => x.includes("cùng tên")));
  assert.ok(validatePositionDef({ name: "Mới", centerId: "cs1", roles: [], isManager: false }, existing).some((x) => x.includes("ít nhất một vai trò")));
  assert.ok(validatePositionDef({ name: "Mới", centerId: "cs1", roles: ["PARENT"], isManager: false }, existing).some((x) => x.includes("Phụ huynh")));
  assert.ok(validatePositionDef({ id: "v1", name: "Quản lý cơ sở 1", centerId: "cs1", roles: ["CENTER_MANAGER"], isManager: true, reportsToId: "v2" }, existing).some((x) => x.includes("vòng lặp")));

  assert.equal(roleValidOn({ validFrom: "2026-01-01", validTo: null }, "2026-09-17"), true);
  assert.equal(roleValidOn({ validFrom: "2026-01-01", validTo: "2026-09-16" }, "2026-09-17"), false);
  assert.equal(roleValidOn({ validFrom: "2026-10-01", validTo: null }, "2026-09-17"), false);
  const rows = [
    { role: "CENTER_MANAGER" as const, centerId: "cs1", validFrom: "2026-01-01", validTo: null },
    { role: "CENTER_HR" as const, centerId: "cs1", validFrom: "2026-01-01", validTo: "2026-09-16" },
    { role: "CENTER_MANAGER" as const, centerId: "cs1", validFrom: null, validTo: null },
  ];
  assert.deepEqual(activeRoleAssignments(rows, "2026-09-17"), [{ role: "CENTER_MANAGER", centerId: "cs1" }]);

  const base = [{ role: "TEACHER" as const, centerId: "ho" }, { role: "TRAINING" as const, centerId: null }];
  const wide = widenByDeployments(base, [{ centerId: "cs2", effectiveFrom: "2026-09-01", effectiveTo: "2026-12-31" }], "2026-09-17");
  assert.deepEqual(wide, [...base, { role: "TEACHER", centerId: "cs2" }]);
  assert.deepEqual(widenByDeployments(base, [{ centerId: "cs2", effectiveFrom: "2026-09-01", effectiveTo: "2026-09-16" }], "2026-09-17"), base);
});

test("giờ, toạ độ", () => {
  assert.equal(hhmm("8:05"), 485);
  assert.throws(() => hhmm("25:00"));
  assert.equal(fmtMin(485), "08:05");
  assert.deepEqual(vnParts(new Date("2026-09-16T18:30:00Z")), { date: "2026-09-17", min: 90 });
  const d = haversineM({ lat: 16.0544, lng: 108.2022 }, { lat: 16.0554, lng: 108.2022 });
  assert.ok(d > 100 && d < 120);
  const c = { lat: 16.0544, lng: 108.2022, radiusM: 100 };
  assert.equal(checkGeofence(c, { lat: 16.0545, lng: 108.2022, accuracy: 20 }).ok, true);
  assert.equal(checkGeofence(c, { lat: 16.06, lng: 108.2022, accuracy: 20 }).ok, false);
  assert.equal(checkGeofence(c, { lat: 16.0545, lng: 108.2022, accuracy: 500 }).ok, false);
  assert.equal(checkGeofence(c, null).ok, false);
  assert.deepEqual(checkGeofence({ lat: null, lng: null, radiusM: 100 }, null), { ok: true, distanceM: null, reason: null, checked: false });
});

const hc: DayShift = { code: "HC", kind: "timed", units: 1, segments: [{ from: "08:00", to: "11:30" }, { from: "13:30", to: "17:30" }], plannedMin: 450, punchRequired: true };
const day = (o: Partial<DayInput>): DayInput => ({ date: "2026-09-10", today: "2026-09-16", shift: hc, inMin: 478, outMin: 1052, ...o });

test("công ngày tính theo ca đã xếp, lượt quét chỉ sinh cờ", () => {
  const ok = computeDay(day({}));
  assert.equal(ok.status, "present");
  assert.equal(ok.units, 1);
  assert.equal(ok.plannedMin, 450);
  assert.equal(ok.workedMin, 450);
  assert.deepEqual(ok.flags, []);

  // đi muộn / về sớm: vẫn đủ công, chỉ gắn cờ
  const late = computeDay(day({ inMin: 500 }));
  assert.equal(late.units, 1);
  assert.equal(late.lateMin, 20);
  assert.equal(late.status, "late");
  assert.ok(late.flags.includes("late"));
  assert.ok(late.flags.includes("short_hours"));
  const early = computeDay(day({ outMin: 960 }));
  assert.equal(early.units, 1);
  assert.equal(early.earlyMin, 90);
  assert.ok(early.flags.includes("early"));
  const both = computeDay(day({ inMin: 500, outMin: 960 }));
  assert.equal(both.status, "late_early");
  assert.equal(both.units, 1);

  // dung sai: 5 phút đầu không tính muộn
  assert.equal(computeDay(day({ inMin: 484 })).lateMin, 0);
  assert.equal(computeDay(day({ inMin: 484 })).status, "present");

  // thiếu lượt
  const noOut = computeDay(day({ outMin: null }));
  assert.equal(noOut.units, 1);
  assert.equal(noOut.status, "missing_out");
  assert.ok(noOut.flags.includes("missing_out"));
  const noIn = computeDay(day({ inMin: null }));
  assert.equal(noIn.units, 1);
  assert.ok(noIn.flags.includes("missing_in"));
  assert.equal(computeDay(day({ outMin: null, date: "2026-09-16" })).status, "working");

  // thiếu buổi chiều
  const amOnly = computeDay(day({ inMin: 478, outMin: 690 }));
  assert.ok(amOnly.flags.includes("missing_pm"));
  assert.equal(amOnly.units, 1);

  // không quét lượt nào → 0 công + cờ
  const none = computeDay(day({ inMin: null, outMin: null }));
  assert.equal(none.units, 0);
  assert.equal(none.status, "absent");
  assert.deepEqual(none.flags, ["no_punch"]);
  const exc = computeDay(day({ inMin: null, outMin: null, excused: true }));
  assert.equal(exc.status, "excused");
  assert.ok(exc.flags.includes("excused"));
  assert.equal(computeDay(day({ inMin: null, outMin: null, date: "2026-09-16" })).status, "upcoming");
  assert.equal(computeDay(day({ date: "2026-09-20", inMin: null, outMin: null })).status, "upcoming");

  // không có ca
  const off = computeDay(day({ shift: null }));
  assert.equal(off.units, 0);
  assert.equal(off.status, "off");
  assert.ok(off.flags.includes("off_schedule"));
  assert.deepEqual(computeDay(day({ shift: null, inMin: null, outMin: null })).flags, []);

  // ca nghỉ / nghỉ phép
  const x: DayShift = { code: "X", kind: "off", units: 0, segments: [], plannedMin: 0, punchRequired: false };
  assert.equal(computeDay(day({ shift: x, inMin: null, outMin: null })).units, 0);
  const p: DayShift = { code: "P", kind: "leave", units: 0, segments: [], plannedMin: 0, punchRequired: false };
  const lv = computeDay(day({ shift: p, inMin: null, outMin: null }));
  assert.deepEqual([lv.status, lv.units, lv.paidLeave], ["leave", 0, 1]);
  const lvUnpaid = computeDay(day({ shift: p, inMin: null, outMin: null, leavePaid: false }));
  assert.equal(lvUnpaid.unpaidLeave, 1);

  // chỉ nơi làm / linh động → đủ công, không xét giờ
  const d1: DayShift = { code: "D1", kind: "location_only", units: 1, segments: [], plannedMin: 0, punchRequired: false };
  const cell = computeDay(day({ shift: d1, inMin: null, outMin: null }));
  assert.deepEqual([cell.status, cell.units, cell.flags], ["present", 1, []]);
  const ld: DayShift = { code: "LD", kind: "flexible", units: 1, segments: [], plannedMin: 0, punchRequired: false };
  assert.equal(computeDay(day({ shift: ld, inMin: null, outMin: null })).units, 1);
  const mustPunch: DayShift = { ...d1, punchRequired: true };
  assert.ok(computeDay(day({ shift: mustPunch, inMin: null, outMin: null })).flags.includes("no_punch"));

  // ca nửa công / 1,5 công
  const s: DayShift = { code: "S", kind: "timed", units: 0.5, segments: [{ from: "07:45", to: "11:30" }], plannedMin: 225, punchRequired: true };
  assert.equal(computeDay(day({ shift: s, inMin: 465, outMin: 690 })).units, 0.5);
  const sct: DayShift = { code: "SCT", kind: "timed", units: 1.5, segments: [{ from: "07:45", to: "11:30" }, { from: "13:45", to: "21:00" }], plannedMin: 660, punchRequired: true };
  assert.equal(computeDay(day({ shift: sct, inMin: 465, outMin: 1260 })).units, 1.5);

  // ngày lễ, ghi đè
  const hol = computeDay(day({ holiday: true, inMin: null, outMin: null }));
  assert.deepEqual([hol.status, hol.holidayUnits, hol.units], ["holiday", 1, 0]);
  assert.ok(computeDay(day({ holiday: true })).flags.includes("holiday_work"));
  const ov = computeDay(day({ inMin: null, outMin: null, override: { units: 1, label: "Công tác", note: "Đi hội thảo" } }));
  assert.deepEqual([ov.status, ov.units], ["override", 1]);
  assert.ok(ov.flags.includes("manual_fix"));

  // cờ từ lượt quét đưa vào
  assert.ok(computeDay(day({ punchFlags: ["outside_geofence"] })).flags.includes("outside_geofence"));
  assert.ok(computeDay(day({ manualPunch: true })).flags.includes("manual_fix"));
  assert.equal(isReviewableFlag("late"), true);
  assert.equal(isReviewableFlag("manual_fix"), false);

  const sum = summarizeDays([ok, late, early, none, lv, hol, noOut].map((d, i) => ({ ...d, scheduled: i !== 5 })));
  assert.equal(sum.workUnits, 4);
  assert.equal(sum.paidLeave, 1);
  assert.equal(sum.holiday, 1);
  assert.equal(sum.payableUnits, 6);
  assert.equal(sum.lateCount, 1);
  assert.equal(sum.earlyCount, 1);
  assert.equal(sum.absentCount, 1);
  assert.equal(sum.noPunchCount, 1);
  assert.equal(sum.missingCount, 1);
  assert.equal(sum.scheduled, 6);
  assert.ok(sum.flagDays >= 4);
});

test("đơn từ — 10 loại", () => {
  const today = "2026-09-16";
  const base = { dateFrom: "2026-09-20", dateTo: "2026-09-20", reason: "Việc gia đình" };
  const v = (o: Partial<RequestInput> & { kind: RequestInput["kind"] }) => validateRequest({ ...base, ...o }, today);

  assert.deepEqual(v({ kind: "class_change", classId: "c1" }), []);
  assert.ok(v({ kind: "class_change" }).includes("Chọn lớp"));
  assert.ok(v({ kind: "class_off", classId: "c1", dateTo: "2026-09-21" }).some((x) => x.includes("một ngày")));
  assert.deepEqual(v({ kind: "sub_teach", classId: "c1", targetStaffId: "s2" }), []);
  assert.ok(v({ kind: "sub_teach", classId: "c1", targetStaffId: "s2", targetShiftId: "sh1" }).length > 0);

  assert.deepEqual(v({ kind: "shift_swap", requesterShiftId: "sh1" }), []);
  assert.ok(v({ kind: "shift_swap" }).includes("Chọn mã ca mới"));
  assert.ok(v({ kind: "shift_swap", requesterShiftId: "sh1", targetShiftId: "sh2" }).some((x) => x.includes("người nhận ca")));

  assert.deepEqual(v({ kind: "overtime", startTime: "17:30", endTime: "19:30" }), []);
  assert.ok(v({ kind: "overtime", startTime: "17:30", endTime: "17:40" }).length > 0);
  assert.ok(v({ kind: "overtime" }).some((x) => x.includes("HH:MM")));

  assert.deepEqual(v({ kind: "late_early", lateEarlyKind: "late", atTime: "09:15" }), []);
  assert.ok(v({ kind: "late_early", atTime: "09:15" }).some((x) => x.includes("hình thức")));

  assert.deepEqual(validateRequest({ ...base, dateFrom: "2026-09-14", dateTo: "2026-09-14", kind: "timesheet_fix", punchOut: "17:05" }, today), []);
  assert.ok(validateRequest({ ...base, kind: "timesheet_fix", punchOut: "17:05" }, today).some((x) => x.includes("chưa tới")));
  assert.ok(validateRequest({ ...base, dateFrom: today, dateTo: today, kind: "timesheet_fix" }, today).some((x) => x.includes("giờ vào hoặc giờ ra")));
  assert.ok(validateRequest({ ...base, dateFrom: today, dateTo: today, kind: "timesheet_fix", punchIn: "17:05", punchOut: "08:00" }, today).length > 0);
  // chỉnh công được lùi tới 31 ngày, các đơn khác chỉ 7 ngày
  assert.deepEqual(validateRequest({ ...base, dateFrom: "2026-08-25", dateTo: "2026-08-25", kind: "timesheet_fix", punchIn: "08:00" }, today), []);
  assert.ok(validateRequest({ ...base, dateFrom: "2026-08-25", dateTo: "2026-08-25", kind: "late_early", lateEarlyKind: "late", atTime: "09:00" }, today).some((x) => x.includes("7 ngày")));

  assert.deepEqual(v({ kind: "leave", leaveType: "annual" }), []);
  assert.ok(v({ kind: "leave" }).includes("Chọn loại nghỉ"));
  assert.ok(v({ kind: "leave", leaveType: "annual", portion: "am", dateTo: "2026-09-21" }).length > 0);
  assert.ok(v({ kind: "leave", leaveType: "annual", dateTo: "2026-11-30" }).some((x) => x.includes("31 ngày")));
  assert.deepEqual(v({ kind: "remote", dateTo: "2026-09-25" }), []);
  assert.deepEqual(v({ kind: "business_trip", destination: "Cơ sở 2" }), []);
  assert.ok(v({ kind: "business_trip" }).includes("Nhập nơi đến"));

  assert.ok(v({ kind: "leave", leaveType: "annual", reason: "x" }).some((x) => x.includes("lý do")));
  assert.ok(v({ kind: "leave", leaveType: "annual", needsCenterChoice: true }).includes("Chọn cơ sở nhận đơn"));
  assert.deepEqual(v({ kind: "leave", leaveType: "annual", needsCenterChoice: true, receivingCenterId: "cs1" }), []);

  assert.equal(leaveIsPaid("annual"), true);
  assert.equal(leaveIsPaid("unpaid"), false);
  assert.equal(leaveIsPaid("maternity"), false);
  assert.equal(leaveIsPaid("bereavement"), true);
  assert.equal(leaveUsesBalance("annual"), true);
  assert.equal(leaveUsesBalance("compensatory"), false);
  assert.deepEqual(requestKindsOf("class"), ["class_change", "sub_teach", "class_off"]);
  assert.equal(isClassRequest("sub_teach"), true);
  assert.equal(isClassRequest("leave"), false);
});

test("nộp muộn, quy đổi, chuyển trạng thái đơn", () => {
  // nghỉ phép cần báo trước 3 ngày
  assert.equal(isLateSubmission({ kind: "leave", dateFrom: "2026-09-20" }, "2026-09-16"), false);
  assert.equal(isLateSubmission({ kind: "leave", dateFrom: "2026-09-18" }, "2026-09-16"), true);
  // tăng ca không cần báo trước — chỉ lùi ngày mới là muộn
  assert.equal(isLateSubmission({ kind: "overtime", dateFrom: "2026-09-16" }, "2026-09-16"), false);
  assert.equal(isLateSubmission({ kind: "overtime", dateFrom: "2026-09-15" }, "2026-09-16"), true);
  assert.equal(isLateSubmission({ kind: "timesheet_fix", dateFrom: "2026-09-14" }, "2026-09-16"), true);

  assert.equal(requestMinutes({ kind: "overtime", startTime: "17:30", endTime: "19:00" }), 90);
  assert.equal(requestMinutes({ kind: "leave", startTime: null, endTime: null }), 0);
  assert.equal(leaveDays("2026-09-14", "2026-09-20", "full"), 6);
  assert.equal(leaveDays("2026-09-14", "2026-09-20", "full", new Set(["2026-09-19", "2026-09-20"])), 2);
  assert.equal(leaveDays("2026-09-14", "2026-09-14", "am"), 0.5);

  assert.equal(requestTransition("pending", "approve", { isRequester: false, isApprover: true }), "approved");
  assert.throws(() => requestTransition("pending", "approve", { isRequester: true, isApprover: true }));
  assert.equal(requestTransition("pending", "approve", { isRequester: true, isApprover: true, isSuperAdmin: true }), "approved");
  assert.equal(requestTransition("pending", "cancel", { isRequester: true, isApprover: false }), "cancelled");
  assert.throws(() => requestTransition("approved", "cancel", { isRequester: true, isApprover: false }));
  assert.equal(requestTransition("approved", "cancel", { isRequester: false, isApprover: true }), "cancelled");
  assert.throws(() => requestTransition("rejected", "approve", { isRequester: false, isApprover: true }));
  assert.throws(() => requestTransition("pending", "reject", { isRequester: false, isApprover: false }));

  const eff = describeRequestEffect({ kind: "shift_swap", dateFrom: "2026-09-20", dateTo: "2026-09-20" }, { currentShiftCode: "S", newShiftCode: "CG", targetName: "Trần B", targetCurrentShiftCode: "CG", targetNewShiftCode: "S" });
  assert.equal(eff, "S → CG · Trần B: CG → S");
  assert.equal(describeRequestEffect({ kind: "leave", dateFrom: "2026-09-20", dateTo: "2026-09-20", portion: "am" }, { currentShiftCode: "HC" }), "HC → P (sáng)");
  assert.ok(describeRequestEffect({ kind: "timesheet_fix", dateFrom: "2026-09-14", dateTo: "2026-09-14", punchOut: "17:05" }, {}).includes("ra 17:05"));
  assert.ok(describeRequestEffect({ kind: "class_off", dateFrom: "2026-09-20", dateTo: "2026-09-20" }, { className: "sata3.14h" }).includes("huỷ buổi"));
});

test("kỳ công", () => {
  assert.deepEqual(periodRange("2026-02"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(periodRange("2026-12"), { from: "2026-12-01", to: "2026-12-31" });
  assert.throws(() => periodRange("2026-13"));
  assert.equal(datesBetween("2026-02-27", "2026-03-02").length, 4);
  assert.deepEqual(lockCheck({ pendingRequests: 0, unreviewedFlagDays: 2, noPunchDays: 1, periodEnd: "2026-08-31", today: "2026-09-16" }).blockers, []);
  assert.equal(lockCheck({ pendingRequests: 0, unreviewedFlagDays: 2, noPunchDays: 1, periodEnd: "2026-08-31", today: "2026-09-16" }).warnings.length, 2);
  assert.equal(lockCheck({ pendingRequests: 1, unreviewedFlagDays: 0, noPunchDays: 0, periodEnd: "2026-09-30", today: "2026-09-16" }).blockers.length, 2);
  // tháng 9/2026: 30 ngày, 4 chủ nhật (6, 13, 20, 27), 1 ngày lễ
  assert.equal(standardUnits("2026-09", [7], ["2026-09-02"]), 25);
  assert.equal(plannedMinutesOf([{ from: "08:00", to: "11:30" }, { from: "13:30", to: "17:30" }]), 450);
});
