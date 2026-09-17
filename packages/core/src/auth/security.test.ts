import { test } from "node:test";
import assert from "node:assert/strict";
import { loginLockDecision, idleExpired, normalizeIdle, maskIp, deviceLabel, securityFindings, LOGIN_IP_MAX_FAILS, type SecurityStats } from "./security.js";

test("an ninh: khoá tạm khi sai nhiều lần", () => {
  const now = new Date("2026-09-17T10:00:00Z");
  const base = { now, maxFails: 5, lockMinutes: 15, ipFails: 0 };
  assert.equal(loginLockDecision({ ...base, fails: 4, lastFailAt: now }).allowed, true);
  const d = loginLockDecision({ ...base, fails: 5, lastFailAt: new Date(now.getTime() - 5 * 60_000) });
  assert.deepEqual(d, { allowed: false, retryAfterMin: 10, reason: "account" });
  assert.equal(loginLockDecision({ ...base, fails: 9, lastFailAt: new Date(now.getTime() - 16 * 60_000) }).allowed, true);
  assert.equal(loginLockDecision({ ...base, fails: 0, lastFailAt: null, ipFails: LOGIN_IP_MAX_FAILS }).reason, "ip");
});

test("an ninh: tự đăng xuất khi không thao tác", () => {
  const now = Date.parse("2026-09-17T10:00:00Z");
  assert.equal(idleExpired(null, now, 30), false);
  assert.equal(idleExpired(now - 29 * 60_000, now, 30), false);
  assert.equal(idleExpired(now - 31 * 60_000, now, 30), true);
  assert.equal(idleExpired(now + 10 * 60_000, now, 30), true, "mốc tương lai");
  assert.equal(normalizeIdle("1"), 5);
  assert.equal(normalizeIdle(9999), 480);
  assert.equal(normalizeIdle("abc"), 60);
});

test("an ninh: hiển thị IP và thiết bị", () => {
  assert.equal(maskIp("113.161.22.45, 10.0.0.1"), "113.161.22.x");
  assert.equal(maskIp("2001:db8:85a3:0:0:8a2e:370:7334"), "2001:db8:85a3:…");
  assert.equal(maskIp(null), "—");
  assert.equal(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"), "Chrome · Windows");
  assert.equal(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1"), "Safari · iOS");
  assert.equal(deviceLabel("Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 Safari/537.36 Edg/140.0"), "Edge · Windows");
});

test("an ninh: khuyến nghị", () => {
  const ok: SecurityStats = { superAdmins: 2, activeStaff: 20, dormant: 0, locked: 1, failed24h: 2, lockouts24h: 0, mfaRoles: ["SUPER_ADMIN", "HO_ACCOUNTANT"], supabase: true, serviceKey: true, devActor: false, production: true, idleMinutes: 60, maxFails: 5 };
  assert.deepEqual(securityFindings(ok).map((f) => f.level), ["ok"]);
  const bad = securityFindings({ ...ok, devActor: true, mfaRoles: [], dormant: 3, superAdmins: 5 });
  assert.equal(bad[0]!.level, "danger");
  assert.equal(bad.filter((f) => f.level === "danger").length, 2);
  assert.ok(bad.some((f) => f.text.includes("3 tài khoản")));
  assert.ok(securityFindings({ ...ok, mfaRoles: ["SUPER_ADMIN"] }).some((f) => f.text.includes("kế toán")));
});
