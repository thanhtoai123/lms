import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLockedPrices, lockedPriceOptions, type CoursePriceBook } from "./priceLock.js";
import { thComboOffers } from "../curriculum/thsteam.js";

const combo = thComboOffers().find((o) => o.format === "group")!;
const [l1, l2] = combo.lines as [typeof combo.lines[0], typeof combo.lines[0]];
const book = (code: string): CoursePriceBook => ({ code, listPrice: 7_500_000, totalSessions: 45, packages: [{ code: `${code}-1KEM1`, sessions: 45, price: 19_125_000 }] });
const books = { [l1.courseCode]: book(l1.courseCode), [l2.courseCode]: book(l2.courseCode) };

test("khoá đơn giá: chỉ nhận đúng giá bảng (theo buổi × hệ số, gói, combo)", () => {
  const b = books[l1.courseCode]!;
  assert.ok(lockedPriceOptions(b, 45, "group").includes(7_500_000));
  assert.ok(lockedPriceOptions(b, 45, "coach_1_1").includes(22_500_000));
  assert.ok(lockedPriceOptions(b, 45, "coach_1_1").includes(19_125_000));
  assert.deepEqual(lockedPriceOptions(b, 15, "group"), [2_500_000]);
  const line = (unitPrice: number, extra: Partial<{ sessions: number; format: "group" | "coach_1_1"; owner: string; courseCode: string }> = {}) =>
    ({ courseCode: l1.courseCode, unitPrice, sessions: 45, format: "group" as const, owner: "a", ...extra });
  assert.deepEqual(checkLockedPrices([line(7_500_000)], books), []);
  assert.deepEqual(checkLockedPrices([line(19_125_000, { format: "coach_1_1" })], books), []);
  const low = checkLockedPrices([line(5_000_000)], books);
  assert.equal(low.length, 1);
  assert.match(low[0]!, /theo bảng giá/);
  assert.match(checkLockedPrices([{ ...line(1), courseCode: "KHONG-CO" }], books)[0]!, /không có trong bảng giá/);
});

test("khoá đơn giá: giá combo cần đủ Năm 1 + Năm 2 cho cùng học viên", () => {
  const y1 = { courseCode: l1.courseCode, unitPrice: l1.unitPrice, sessions: l1.sessions, format: "group" as const, owner: "con-a" };
  const y2 = { courseCode: l2.courseCode, unitPrice: l2.unitPrice, sessions: l2.sessions, format: "group" as const, owner: "con-a" };
  assert.deepEqual(checkLockedPrices([y1, y2], books), []);
  assert.match(checkLockedPrices([y1], books)[0]!, /combo/);
  assert.equal(checkLockedPrices([y1, { ...y2, owner: "con-b" }], books).length, 2);
});

import { rebalancePlan } from "./rules.js";
test("sửa học phí: kế hoạch giữ phần đã thu, giảm trừ từ đợt cuối, tăng cộng vào đợt chưa thu", () => {
  const cur = [
    { seq: 1, amount: 3_000_000, paid: 3_000_000, dueDate: "2026-10-01" },
    { seq: 2, amount: 3_000_000, paid: 1_000_000, dueDate: "2026-11-01" },
    { seq: 3, amount: 3_000_000, paid: 0, dueDate: "2026-12-01" },
  ];
  assert.deepEqual(rebalancePlan(cur, 5_000_000, "2027-01-01")!.map((r) => r.amount), [3_000_000, 2_000_000]);
  assert.deepEqual(rebalancePlan(cur, 10_000_000, "2027-01-01")!.map((r) => r.amount), [3_000_000, 3_000_000, 4_000_000]);
  assert.equal(rebalancePlan(cur, 9_000_000, "2027-01-01"), null);
  const allPaid = [{ seq: 1, amount: 2_000_000, paid: 2_000_000, dueDate: "2026-10-01" }];
  assert.deepEqual(rebalancePlan(allPaid, 2_500_000, "2027-01-01")!.map((r) => [r.amount, r.dueDate]), [[2_000_000, "2026-10-01"], [500_000, "2027-01-01"]]);
});

import { attributedPaid, refundProposal } from "./rules.js";
test("hoàn tiền đơn nhiều con: chỉ tính tiền đã thu của con đó", () => {
  assert.equal(attributedPaid({ direct: 0, unattributed: 20_000_000, lineNet: 10_000_000, orderNet: 20_000_000 }), 10_000_000);
  assert.equal(attributedPaid({ direct: 0, unattributed: 10_000_000, lineNet: 10_000_000, orderNet: 20_000_000 }), 5_000_000);
  assert.equal(attributedPaid({ direct: 8_000_000, unattributed: 4_000_000, lineNet: 10_000_000, orderNet: 20_000_000 }), 10_000_000);
  const p = refundProposal({ paid: 20_000_000, packageValue: 10_000_000, packageSessions: 45, consumedSessions: 5, alreadyRefunded: 0 });
  assert.ok(p.refundable <= 10_000_000 - Math.round(5 * 10_000_000 / 45) + 1000);
});

import { courseCodeForInterest } from "../curriculum/thsteam.js";
test("form công khai: chuyên ngành + lớp → khoá năm 1 phù hợp", () => {
  assert.equal(courseCodeForInterest("Robotics AI", 4), "ROBO-TH-N1");
  assert.equal(courseCodeForInterest("Chưa rõ", 4), null);
  assert.equal(courseCodeForInterest("Robotics AI", null), null);
  assert.match(courseCodeForInterest("Lập trình AI", 7) ?? "", /^CODE-THCS/);
});
