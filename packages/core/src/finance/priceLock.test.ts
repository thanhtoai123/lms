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
