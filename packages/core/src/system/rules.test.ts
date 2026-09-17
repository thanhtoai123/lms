import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMAIL_EVENTS, fillTemplate, validateEmailTemplate, templateVars, emailRetryDelayMs, isEmail,
  otpRequestDecision, otpVerifyDecision, canReplay, safeHeaders, validateSettings, SETTINGS_DEFAULTS,
  validateCode, validateGroup, attainment, monthProgress, monthsOf,
} from "./rules.js";

test("mẫu email", () => {
  const r = fillTemplate(EMAIL_EVENTS.RECEIPT_ISSUED.subject, { so_phieu: "PT-CS1-26-000001" }, EMAIL_EVENTS.RECEIPT_ISSUED.vars);
  assert.equal(r.text, "Sata Robo xác nhận thanh toán PT-CS1-26-000001");
  assert.deepEqual(fillTemplate("Chào {ten} {x}", { ten: "An" }, ["ten"]), { text: "Chào An {x}", missing: ["x"], unknown: ["x"] });
  assert.deepEqual(templateVars("{a} {b} {a}"), ["a", "b"]);
  assert.deepEqual(validateEmailTemplate("TEST", "Email thử", "Xin chào {ten}, thử nghiệm."), []);
  assert.ok(validateEmailTemplate("TEST", "Email thử", "Xin chào {ten_ph}, thử nghiệm.")[0]!.includes("{ten_ph}"));
  assert.ok(validateEmailTemplate("TEST", "E", "ngắn").length >= 2);
  for (const [k, v] of Object.entries(EMAIL_EVENTS)) assert.deepEqual(validateEmailTemplate(k as keyof typeof EMAIL_EVENTS, v.subject, v.body), [], k);
  assert.equal(emailRetryDelayMs(0), 60_000);
  assert.equal(emailRetryDelayMs(3), null);
  assert.equal(isEmail("a@b.vn"), true);
  assert.equal(isEmail("a@b"), false);
});

test("OTP", () => {
  const now = new Date("2026-09-17T10:00:00Z");
  const ago = (s: number) => new Date(now.getTime() - s * 1000);
  assert.deepEqual(otpRequestDecision({ now, phoneRecent: [], ipRecent: [] }), { ok: true });
  const cd = otpRequestDecision({ now, phoneRecent: [ago(20)], ipRecent: [] });
  assert.equal(cd.ok, false);
  assert.equal(!cd.ok && cd.retryAfterSec, 40);
  const many = otpRequestDecision({ now, phoneRecent: [ago(100), ago(300), ago(600)], ipRecent: [] });
  assert.equal(many.ok, false);
  assert.equal(!many.ok && many.retryAfterSec, 300);
  assert.equal(otpRequestDecision({ now, phoneRecent: [ago(100), ago(300), ago(1000)], ipRecent: [] }).ok, true);
  assert.equal(otpRequestDecision({ now, phoneRecent: [], ipRecent: Array.from({ length: 10 }, (_, i) => ago(60 * i + 70)) }).ok, false);
  const exp = new Date(now.getTime() + 60_000);
  assert.deepEqual(otpVerifyDecision({ status: "sent", attempts: 0, expiresAt: exp, now, matches: true }), { result: "ok", status: "verified", attempts: 1 });
  assert.deepEqual(otpVerifyDecision({ status: "sent", attempts: 3, expiresAt: exp, now, matches: false }), { result: "wrong", status: "sent", attempts: 4 });
  assert.deepEqual(otpVerifyDecision({ status: "sent", attempts: 4, expiresAt: exp, now, matches: false }), { result: "locked", status: "failed", attempts: 5 });
  assert.equal(otpVerifyDecision({ status: "sent", attempts: 0, expiresAt: ago(1), now, matches: true }).result, "expired");
  assert.equal(otpVerifyDecision({ status: "verified", attempts: 1, expiresAt: exp, now, matches: true }).result, "used");
});

test("webhook & cài đặt & khác", () => {
  assert.equal(canReplay("failed", 0), null);
  assert.ok(canReplay("rejected", 0));
  assert.ok(canReplay("failed", 10));
  assert.deepEqual(safeHeaders({ Authorization: "Apikey x", "Content-Type": "application/json", "X-Secret": "y" }), { authorization: "[ẩn]", "content-type": "application/json" });
  assert.deepEqual(validateSettings(SETTINGS_DEFAULTS), []);
  assert.equal(validateSettings({ ...SETTINGS_DEFAULTS, supportEmail: "x", website: "satarobo.vn", taxCode: "123" }).length, 3);
  assert.equal(validateCode("MIEN-TRUNG"), null);
  assert.ok(validateCode("mt"));
  assert.ok(validateGroup({ name: "ab" }).length);
  assert.deepEqual(attainment(90, 100), { pct: 90, tone: "warn" });
  assert.deepEqual(attainment(120, 100), { pct: 120, tone: "good" });
  assert.deepEqual(attainment(10, 0), { pct: null, tone: "none" });
  assert.equal(monthProgress("2026-09", "2026-09-15"), 0.5);
  assert.equal(monthProgress("2026-08", "2026-09-15"), 1);
  assert.deepEqual(monthsOf("2025-11-20", "2026-02-01"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
});
