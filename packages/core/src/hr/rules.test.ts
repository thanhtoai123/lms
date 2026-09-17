import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validatePosition, activeOn, staffTransition, proratedLeave, hhmm, fmtMin, vnParts, validateShift, haversineM, checkGeofence,
  computeDay, summarizeDays, validateRequest, requestMinutes, leaveDays, requestTransition, periodRange, datesBetween, lockCheck, staffCode,
  type DayInput,
} from "./rules.js";

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

test("giờ, ca, toạ độ", () => {
  assert.equal(hhmm("8:05"), 485);
  assert.throws(() => hhmm("25:00"));
  assert.equal(fmtMin(485), "08:05");
  assert.deepEqual(vnParts(new Date("2026-09-16T18:30:00Z")), { date: "2026-09-17", min: 90 });
  assert.deepEqual(validateShift({ code: "HC", name: "Hành chính", startTime: "08:00", endTime: "17:00", breakMinutes: 60 }), []);
  assert.ok(validateShift({ code: "D", name: "Đêm", startTime: "22:00", endTime: "06:00", breakMinutes: 0 }).length > 0);
  const d = haversineM({ lat: 16.0544, lng: 108.2022 }, { lat: 16.0554, lng: 108.2022 });
  assert.ok(d > 100 && d < 120);
  const c = { lat: 16.0544, lng: 108.2022, radiusM: 100 };
  assert.equal(checkGeofence(c, { lat: 16.0545, lng: 108.2022, accuracy: 20 }).ok, true);
  assert.equal(checkGeofence(c, { lat: 16.06, lng: 108.2022, accuracy: 20 }).ok, false);
  assert.equal(checkGeofence(c, { lat: 16.0545, lng: 108.2022, accuracy: 500 }).ok, false);
  assert.equal(checkGeofence(c, null).ok, false);
  assert.deepEqual(checkGeofence({ lat: null, lng: null, radiusM: 100 }, null), { ok: true, distanceM: null, reason: null, checked: false });
});

const shift = { startTime: "08:00", endTime: "17:00", breakMinutes: 60 };
const day = (o: Partial<DayInput>): DayInput => ({ date: "2026-09-10", today: "2026-09-16", shift, inMin: 475, outMin: 1022, leave: null, ...o });

test("tính công ngày", () => {
  const ok = computeDay(day({}));
  assert.equal(ok.status, "present");
  assert.equal(ok.units, 1);
  assert.equal(ok.workedMin, 480);
  assert.equal(computeDay(day({ inMin: 484 })).status, "present");
  const late = computeDay(day({ inMin: 500 }));
  assert.equal(late.status, "late");
  assert.equal(late.lateMin, 20);
  assert.equal(late.units, 1);
  assert.equal(computeDay(day({ inMin: 500, excusedLateMin: 20 })).status, "present");
  const le = computeDay(day({ inMin: 500, outMin: 960 }));
  assert.equal(le.status, "late_early");
  assert.equal(le.earlyMin, 60);
  assert.equal(computeDay(day({ inMin: 780 })).units, 0.5);
  assert.equal(computeDay(day({ inMin: null, outMin: null })).status, "absent");
  assert.equal(computeDay(day({ inMin: null, outMin: null, date: "2026-09-16" })).status, "upcoming");
  assert.equal(computeDay(day({ outMin: null })).status, "missing_out");
  assert.equal(computeDay(day({ outMin: null, date: "2026-09-16" })).status, "working");
  assert.equal(computeDay(day({ inMin: null })).status, "missing_in");
  assert.equal(computeDay(day({ date: "2026-09-20" })).status, "upcoming");
  assert.equal(computeDay(day({ shift: null })).status, "off");
  const hol = computeDay(day({ holiday: true, inMin: null, outMin: null }));
  assert.equal(hol.status, "holiday");
  assert.equal(hol.holidayUnits, 1);
  const lv = computeDay(day({ leave: { portion: "full", paid: true }, inMin: null, outMin: null }));
  assert.deepEqual([lv.status, lv.units, lv.paidLeave], ["leave", 0, 1]);
  const half = computeDay(day({ leave: { portion: "pm", paid: false }, inMin: 478, outMin: 750 }));
  assert.deepEqual([half.status, half.units, half.unpaidLeave, half.earlyMin], ["half_leave", 0.5, 0.5, 0]);
  const halfAm = computeDay(day({ leave: { portion: "am", paid: true }, inMin: 760, outMin: 1022 }));
  assert.deepEqual([halfAm.status, halfAm.units, halfAm.lateMin], ["half_leave", 0.5, 0]);
  const ov = computeDay(day({ inMin: null, outMin: null, override: { units: 1, status: "Công tác", note: "Đi hội thảo" } }));
  assert.deepEqual([ov.status, ov.units], ["override", 1]);
  const sum = summarizeDays([ok, late, le, lv, half, hol, computeDay(day({ outMin: null })), computeDay(day({ inMin: null, outMin: null, otMin: 90 }))].map((d, i) => ({ ...d, scheduled: i < 7 })));
  assert.equal(sum.workUnits, 3.5);
  assert.equal(sum.paidLeave, 1);
  assert.equal(sum.unpaidLeave, 0.5);
  assert.equal(sum.payableUnits, 5.5);
  assert.equal(sum.lateCount, 2);
  assert.equal(sum.missingCount, 1);
  assert.equal(sum.absentCount, 1);
  assert.equal(sum.otMin, 90);
  assert.equal(sum.scheduled, 7);
});

test("đơn từ", () => {
  const today = "2026-09-16";
  const base = { dateFrom: today, dateTo: today, reason: "Việc gia đình" };
  assert.deepEqual(validateRequest({ ...base, kind: "leave", leaveType: "annual" }, today), []);
  assert.ok(validateRequest({ ...base, kind: "leave" }, today).includes("Chọn loại nghỉ"));
  assert.ok(validateRequest({ ...base, kind: "leave", leaveType: "annual", portion: "am", dateTo: "2026-09-17" }, today).length > 0);
  assert.ok(validateRequest({ ...base, kind: "leave", leaveType: "annual", dateFrom: "2026-09-01" }, today).some((x) => x.includes("7 ngày")));
  assert.ok(validateRequest({ ...base, kind: "leave", leaveType: "annual", reason: "x" }, today).length > 0);
  assert.ok(validateRequest({ ...base, kind: "late_early" }, today).length > 0);
  assert.deepEqual(validateRequest({ ...base, kind: "late_early", lateMin: 30 }, today), []);
  assert.deepEqual(validateRequest({ ...base, kind: "overtime", otStart: "17:30", otEnd: "19:30" }, today), []);
  assert.ok(validateRequest({ ...base, kind: "overtime", otStart: "17:30", otEnd: "17:40" }, today).length > 0);
  assert.deepEqual(validateRequest({ ...base, kind: "missing_punch", punchOut: "17:05" }, today), []);
  assert.ok(validateRequest({ ...base, kind: "missing_punch", dateFrom: "2026-09-17", dateTo: "2026-09-17", punchOut: "17:05" }, today).length > 0);
  assert.ok(validateRequest({ ...base, kind: "missing_punch", punchIn: "17:05", punchOut: "08:00" }, today).length > 0);
  assert.equal(requestMinutes({ kind: "overtime", otStart: "17:30", otEnd: "19:00" }), 90);
  assert.equal(requestMinutes({ kind: "late_early", lateMin: 15, earlyMin: 10 }), 25);
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
});

test("kỳ công", () => {
  assert.deepEqual(periodRange("2026-02"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(periodRange("2026-12"), { from: "2026-12-01", to: "2026-12-31" });
  assert.throws(() => periodRange("2026-13"));
  assert.equal(datesBetween("2026-02-27", "2026-03-02").length, 4);
  assert.deepEqual(lockCheck({ pendingRequests: 0, missingPunches: 2, periodEnd: "2026-08-31", today: "2026-09-16" }).blockers, []);
  assert.equal(lockCheck({ pendingRequests: 1, missingPunches: 0, periodEnd: "2026-09-30", today: "2026-09-16" }).blockers.length, 2);
});
