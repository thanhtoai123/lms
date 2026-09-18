import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAward, validateAdjust, revokeBlock, balanceAfter, redemptionTransition, availableBalance, validateReward, coinTier, validateCoinRule, coinsFor, COIN_RULE_CODES, COIN_RULE_DEFS } from "./rules.js";

test("xu: thưởng theo hạn mức", () => {
  assert.deepEqual(validateAward({ amount: 10, reason: "homework", level: "teacher", givenToday: 0 }), []);
  assert.ok(validateAward({ amount: 21, reason: "homework", level: "teacher", givenToday: 0 })[0]!.includes("20"));
  assert.ok(validateAward({ amount: 20, reason: "homework", level: "teacher", givenToday: 40 })[0]!.includes("50"));
  assert.deepEqual(validateAward({ amount: 200, reason: "behavior", level: "center", givenToday: 0 }), []);
  assert.ok(validateAward({ amount: 5, reason: "redeem", level: "center", givenToday: 0 }).length);
  assert.ok(validateAward({ amount: 0, reason: "homework", level: "center", givenToday: 0 }).length);
  assert.ok(validateAward({ amount: 5, reason: "competition", level: "center", givenToday: 0 }).length);
  assert.deepEqual(validateAward({ amount: 5, reason: "competition", note: "Giải nhì VEX", level: "center", givenToday: 0 }), []);
});

test("xu: điều chỉnh / thu hồi / số dư", () => {
  assert.deepEqual(validateAdjust({ amount: -5, note: "nhập nhầm lần trước", balance: 10, level: "center" }), []);
  assert.ok(validateAdjust({ amount: -15, note: "nhập nhầm lần trước", balance: 10, level: "center" }).some((x) => x.includes("Số dư")));
  assert.ok(validateAdjust({ amount: 5, note: "abc", balance: 0, level: "center" }).length);
  assert.ok(validateAdjust({ amount: 5, note: "nhập nhầm lần trước", balance: 0, level: "teacher" }).length);
  assert.equal(revokeBlock({ reason: "homework", amount: 10, revoked: false, ageDays: 1, balance: 10 }), null);
  assert.ok(revokeBlock({ reason: "homework", amount: 10, revoked: true, ageDays: 1, balance: 10 }));
  assert.ok(revokeBlock({ reason: "redeem", amount: -10, revoked: false, ageDays: 1, balance: 10 }));
  assert.ok(revokeBlock({ reason: "homework", amount: 10, revoked: false, ageDays: 31, balance: 10 }));
  assert.ok(revokeBlock({ reason: "homework", amount: 10, revoked: false, ageDays: 1, balance: 9 }));
  assert.equal(balanceAfter(10, -10), 0);
  assert.throws(() => balanceAfter(10, -11));
  assert.equal(availableBalance(100, 30), 70);
  assert.equal(availableBalance(10, 30), 0);
});

test("xu: đổi quà, hạng", () => {
  assert.equal(redemptionTransition("requested", "approve"), "approved");
  assert.equal(redemptionTransition("approved", "deliver"), "delivered");
  assert.equal(redemptionTransition("approved", "cancel"), "cancelled");
  assert.throws(() => redemptionTransition("requested", "deliver"));
  assert.throws(() => redemptionTransition("delivered", "cancel"));
  assert.deepEqual(validateReward({ name: "Bút", cost: 50, stockLimited: false }), []);
  assert.ok(validateReward({ name: "B", cost: 0, stockLimited: false }).length === 2);
  assert.equal(coinTier(0).label, "Đồng");
  assert.equal(coinTier(250).label, "Bạc");
  assert.deepEqual(coinTier(250).next, { label: "Vàng", need: 250 });
  assert.equal(coinTier(5000).next, null);
});

test("xu: luật thưởng (coin_rules)", () => {
  for (const c of COIN_RULE_CODES) assert.deepEqual(validateCoinRule({ code: c, description: COIN_RULE_DEFS[c].label, coins: COIN_RULE_DEFS[c].coins, condition: COIN_RULE_DEFS[c].condition }), [], c);
  assert.equal(validateCoinRule({ code: "KHONG_CO", description: "x", coins: 0 }).length, 3);
  assert.match(validateCoinRule({ code: "BIRTHDAY", description: "Sinh nhật", coins: 5000 }).join(), /tối đa/);
  const rules = [{ code: "ATTENDANCE_SESSION", coins: 7, isActive: true }, { code: "HOMEWORK_DONE", coins: 10, isActive: false }];
  assert.equal(coinsFor(rules, "ATTENDANCE_SESSION"), 7);
  assert.equal(coinsFor(rules, "HOMEWORK_DONE", 12), null); // luật tắt → không cộng xu
  assert.equal(coinsFor(rules, "BIRTHDAY", 20), 20); // chưa khai → giữ hành vi cũ
  assert.equal(coinsFor(rules, "BIRTHDAY"), null);
});
