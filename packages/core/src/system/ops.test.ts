import { test } from "node:test";
import assert from "node:assert/strict";
import { OPS_DEFAULTS, OPS_GROUPS, resolveOps, validateOps, otpPolicyFrom, riskFrom } from "./ops.js";
import { otpRequestDecision, otpVerifyDecision, OTP_POLICY } from "./rules.js";
import { computeDay } from "../hr/rules.js";

test("cấu hình vận hành: mặc định, kế thừa, kiểm tra", () => {
  assert.equal(OPS_DEFAULTS.nearingEndSessions, 4);
  assert.deepEqual(otpPolicyFrom(OPS_DEFAULTS), OTP_POLICY);
  for (const fs of Object.values(OPS_GROUPS)) for (const f of fs) assert.ok(typeof f.def !== "number" || (f.def >= (f.min ?? -Infinity) && f.def <= (f.max ?? Infinity)), f.key);
  const r = resolveOps({ nearingEndSessions: 6, otpTtlMinutes: 10, bogus: 1, maxPauseMonths: "x" }, { nearingEndSessions: 2, otpTtlMinutes: 3, scanLateGraceMin: 5 });
  assert.equal(r.nearingEndSessions, 2);
  assert.equal(r.otpTtlMinutes, 10);
  assert.equal(r.maxPauseMonths, 3);
  assert.equal(r.scanLateGraceMin, 5);
  assert.equal((r as Record<string, unknown>).bogus, undefined);
  assert.deepEqual(validateOps("hoc-vien", { nearingEndSessions: 3, maxPauseMonths: null }, "center"), []);
  assert.ok(validateOps("hoc-vien", { maxPauseMonths: null }, "global")[0]!.includes("cần giá trị"));
  assert.ok(validateOps("hoc-vien", { nearingEndSessions: 99 }, "global")[0]!.includes("1–12"));
  assert.ok(validateOps("hoc-vien", { nearingEndSessions: 2.5 }, "global")[0]!.includes("số nguyên"));
  assert.ok(validateOps("otp", { otpTtlMinutes: 5 }, "center")[0]!.includes("toàn hệ thống"));
  assert.ok(validateOps("lop", { otpTtlMinutes: 5 }, "global")[0]!.includes("không thuộc nhóm"));
  assert.ok(validateOps("otp", { otpCooldownSec: 600, otpPerPhoneWindowMin: 5 }, "global").some((x) => x.includes("dài hơn")));
  assert.equal(riskFrom({ ...OPS_DEFAULTS, riskMinRatePct: 70 }).minRate, 0.7);
});

test("chính sách OTP và chấm công dùng tham số", () => {
  const now = new Date("2026-09-17T10:00:00Z");
  const p = { ...OTP_POLICY, cooldownSec: 300 };
  assert.equal(otpRequestDecision({ now, phoneRecent: [new Date(now.getTime() - 120_000)], ipRecent: [] }).ok, true);
  assert.equal(otpRequestDecision({ now, phoneRecent: [new Date(now.getTime() - 120_000)], ipRecent: [] }, p).ok, false);
  const base = { status: "sent" as const, attempts: 2, expiresAt: new Date(now.getTime() + 60_000), now, matches: false };
  assert.equal(otpVerifyDecision(base).result, "wrong");
  assert.equal(otpVerifyDecision(base, { ...OTP_POLICY, maxAttempts: 3 }).result, "locked");
  const day = {
    date: "2026-09-16", today: "2026-09-17",
    shift: { code: "HC", kind: "timed" as const, units: 1, segments: [{ from: "08:00", to: "12:00" }, { from: "13:00", to: "17:00" }], plannedMin: 480, punchRequired: true },
    inMin: 8 * 60 + 8, outMin: 17 * 60,
  };
  assert.equal(computeDay(day).lateMin, 8);
  assert.equal(computeDay({ ...day, graceMin: 10 }).lateMin, 0);
});
