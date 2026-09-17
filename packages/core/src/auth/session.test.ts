import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeJwtPayload, tokenNeedsRefresh, passwordProblems, mfaRequiredRoles, mfaState, validTokenHash } from "./session.js";

const jwt = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;

test("JWT: giải mã và hạn", () => {
  const t = jwt({ sub: "u1", email: "a@b.vn", exp: 2_000_000_000, aal: "aal2", name: "Nguyễn" });
  assert.equal(decodeJwtPayload(t)?.aal, "aal2");
  assert.equal(decodeJwtPayload("abc"), null);
  assert.equal(decodeJwtPayload(`x.${Buffer.from("[").toString("base64url")}.y`), null);
  const now = 2_000_000_000 * 1000;
  assert.equal(tokenNeedsRefresh(t, now - 3600_000), false);
  assert.equal(tokenNeedsRefresh(t, now - 60_000), true);
  assert.equal(tokenNeedsRefresh(null, now), true);
  assert.equal(tokenNeedsRefresh(jwt({ sub: "x" }), now), true);
});

test("mật khẩu, 2 lớp, liên kết", () => {
  assert.deepEqual(passwordProblems("Satarobo2026x", "an.nguyen@x.vn"), []);
  assert.ok(passwordProblems("abc123", null)[0]!.includes("10"));
  assert.ok(passwordProblems("abcdefghijkl", null).some((x) => x.includes("chữ và số")));
  assert.ok(passwordProblems("annguyen2026", "annguyen@x.vn").some((x) => x.includes("email")));
  assert.ok(passwordProblems("1111111111", null).some((x) => x.includes("dễ đoán")));
  assert.deepEqual(mfaRequiredRoles(undefined), ["SUPER_ADMIN"]);
  assert.deepEqual(mfaRequiredRoles("SUPER_ADMIN, HO_ACCOUNTANT"), ["SUPER_ADMIN", "HO_ACCOUNTANT"]);
  const req = mfaRequiredRoles(undefined);
  assert.deepEqual(mfaState({ roles: ["SUPER_ADMIN"], required: req, viaSupabase: true, aal: "aal1" }), { required: true, satisfied: false });
  assert.deepEqual(mfaState({ roles: ["SUPER_ADMIN"], required: req, viaSupabase: true, aal: "aal2" }), { required: true, satisfied: true });
  assert.deepEqual(mfaState({ roles: ["SUPER_ADMIN"], required: req, viaSupabase: false, aal: null }), { required: false, satisfied: true });
  assert.deepEqual(mfaState({ roles: ["TEACHER"], required: req, viaSupabase: true, aal: "aal1" }), { required: false, satisfied: true });
  assert.equal(validTokenHash("pkce_" + "a".repeat(40)), true);
  assert.equal(validTokenHash("abc"), false);
  assert.equal(validTokenHash("a".repeat(30) + "<script>"), false);
});
