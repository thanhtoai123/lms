import { test } from "node:test";
import assert from "node:assert/strict";
import { trialTransition, TrialTransitionError, validateTrialBooking, seatsLeft, canRecordTrialResult, leadEventForTrial, requireReason } from "./rules.js";
import { buildFunnel, furthestStage, dropoffByStage, attendanceRate, pct, monthsBetween, normalizeRange, toCsv } from "../reports/metrics.js";
import { validateRoleGrant, validateRoleRevoke, validateLock, accessLevel } from "../policy/accounts.js";
import type { Actor } from "../policy/policy.js";

const base = {
  capacity: 12, enrolled: 8, trialsInSession: 1, trialsUsedByLead: 0, maxTrialsPerLead: 2,
  sessionStatus: "scheduled", sessionDate: "2026-09-20", sessionStart: "09:00:00", nowLocal: "2026-09-16T10:00",
  leadStatus: "contacted", alreadyBookedInSession: false,
};

test("xếp học thử hợp lệ và các trường hợp bị chặn", () => {
  assert.deepEqual(validateTrialBooking(base), []);
  assert.equal(seatsLeft(base), 3);
  assert.match(validateTrialBooking({ ...base, enrolled: 11 }).join(), /đủ chỗ/);
  assert.match(validateTrialBooking({ ...base, trialsUsedByLead: 2 }).join(), /hết 2 lần/);
  assert.match(validateTrialBooking({ ...base, nowLocal: "2026-09-20T09:00" }).join(), /đã bắt đầu/);
  assert.match(validateTrialBooking({ ...base, leadStatus: "enrolled" }).join(), /đã đăng ký/);
  assert.match(validateTrialBooking({ ...base, sessionStatus: "cancelled" }).join(), /không còn nhận/);
  assert.match(validateTrialBooking({ ...base, alreadyBookedInSession: true }).join(), /đã được xếp/);
});

test("vòng đời buổi thử", () => {
  assert.equal(trialTransition("booked", "attend"), "attended");
  assert.equal(trialTransition("attended", "undo"), "booked");
  assert.throws(() => trialTransition("cancelled", "attend"), TrialTransitionError);
  assert.throws(() => trialTransition("attended", "reschedule"), TrialTransitionError);
  assert.equal(canRecordTrialResult("2026-09-16", "2026-09-16"), true);
  assert.equal(canRecordTrialResult("2026-09-17", "2026-09-16"), false);
  assert.equal(leadEventForTrial("attend", "trial_scheduled"), "trial_attended");
  assert.equal(leadEventForTrial("no_show", "trial_in_progress"), "trial_no_show");
  assert.equal(leadEventForTrial("attend", "consulting"), null);
  assert.throws(() => requireReason("  ab "), /lý do/);
  assert.equal(requireReason(" PH bận việc "), "PH bận việc");
});

test("phễu lead và rụng theo bậc", () => {
  assert.equal(furthestStage(["new", "contacted", "trial_scheduled", "lost"]), 2);
  const f = buildFunnel([0, 1, 2, 3, 4, 4, 1, 0]);
  assert.deepEqual(f.map((r) => r.count), [8, 6, 4, 3, 2]);
  assert.equal(f[4]!.fromTop, 25);
  assert.equal(f[1]!.fromPrev, 75);
  assert.deepEqual(dropoffByStage([0, 0, 2, 3]).map((d) => d.count), [2, 0, 1, 1]);
  assert.equal(pct(1, 0), 0);
  assert.equal(attendanceRate({ present: 7, late: 1, absent: 1, excused: 1, makeup: 0 }), 80);
});

test("khoảng ngày, tháng, CSV", () => {
  assert.deepEqual(monthsBetween("2025-11-15", "2026-02-01"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  assert.deepEqual(normalizeRange(undefined, undefined, "2026-09-16"), { from: "2026-06-19", to: "2026-09-16" });
  assert.deepEqual(normalizeRange("2026-10-01", "2026-09-16", "2026-09-16"), { from: "2026-09-16", to: "2026-09-16" });
  const csv = toCsv(["Tên", "Số"], [["=HYPERLINK()", 3], ['a "b"', null]]);
  assert.ok(csv.startsWith("﻿"));
  assert.match(csv, /'=HYPERLINK\(\)/);
  assert.match(csv, /"a ""b"""/);
});

const admin: Actor = { userId: "u-admin", assignments: [{ role: "SUPER_ADMIN", centerId: null }] };
const mgr: Actor = { userId: "u-mgr", assignments: [{ role: "CENTER_MANAGER", centerId: "c1" }] };

test("cấp / gỡ vai trò và khoá tài khoản", () => {
  assert.deepEqual(validateRoleGrant({ actor: admin, role: "TEACHER", centerId: "c1", targetUserId: "x" }), []);
  assert.match(validateRoleGrant({ actor: admin, role: "TEACHER", centerId: null, targetUserId: "x" }).join(), /chọn cơ sở/);
  assert.match(validateRoleGrant({ actor: admin, role: "HO_SALE", centerId: "c1", targetUserId: "x" }).join(), /toàn hệ thống/);
  assert.match(validateRoleGrant({ actor: mgr, role: "SUPER_ADMIN", centerId: null, targetUserId: "x" }).join(), /Chỉ Quản trị tối cao/);
  assert.match(validateRoleGrant({ actor: admin, role: "PARENT", centerId: null, targetUserId: "x" }).join(), /không gán/);
  assert.match(validateRoleRevoke({ actor: admin, role: "SUPER_ADMIN", targetUserId: "u-admin", remainingSuperAdmins: 2 }).join(), /chính mình/);
  assert.match(validateRoleRevoke({ actor: admin, role: "SUPER_ADMIN", targetUserId: "y", remainingSuperAdmins: 1 }).join(), /ít nhất một/);
  assert.deepEqual(validateRoleRevoke({ actor: admin, role: "TEACHER", targetUserId: "u-admin", remainingSuperAdmins: 1 }), []);
  assert.match(validateLock({ actor: admin, targetUserId: "u-admin", targetIsSuperAdmin: true, activeSuperAdmins: 3, lock: true, reason: "nghỉ việc" }).join(), /chính mình/);
  assert.match(validateLock({ actor: admin, targetUserId: "y", targetIsSuperAdmin: false, activeSuperAdmins: 3, lock: true, reason: "" }).join(), /lý do/);
  assert.deepEqual(validateLock({ actor: admin, targetUserId: "y", targetIsSuperAdmin: false, activeSuperAdmins: 3, lock: false }), []);
});

test("ma trận quyền", () => {
  assert.equal(accessLevel("SUPER_ADMIN", "finance").level, "full");
  assert.equal(accessLevel("AUDITOR", "finance").level, "read");
  assert.equal(accessLevel("TEACHER", "session").level, "own");
  assert.equal(accessLevel("CENTER_SALES_CSM", "student").level, "write");
  assert.equal(accessLevel("CENTER_SALES_CSM", "timesheet").level, "none");
});
