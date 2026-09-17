import { test } from "node:test";
import assert from "node:assert/strict";
import {
  signedQty, validateMovement, movingAverageCost, stockTone, maxAssemblable, validateBom, validateItem, rentalDueDate, rentalOverdueDays, rentalFee,
  depositRefund, auditTransition, isLargeVariance, validateAuditSubmit, auditSummary, stockCode,
} from "./rules.js";

test("kho: số lượng có dấu, chặn tồn âm", () => {
  assert.equal(signedQty("receipt", 5, 0), 5);
  assert.equal(signedQty("issue", 2, 5), -2);
  assert.throws(() => signedQty("issue", 6, 5), /Không đủ tồn/);
  assert.equal(signedQty("adjust", -3, 5), -3);
  assert.throws(() => signedQty("adjust", -6, 5));
  assert.throws(() => signedQty("issue", -1, 5));
  assert.throws(() => signedQty("receipt", 1.5, 0));
  assert.throws(() => signedQty("receipt", 0, 0));
});

test("kho: kiểm tra phiếu", () => {
  assert.deepEqual(validateMovement({ type: "receipt", qty: 3, unitCost: 1000 }), []);
  assert.equal(validateMovement({ type: "receipt", qty: 3 }).length, 1);
  assert.equal(validateMovement({ type: "issue", qty: 1 }).length, 1);
  assert.deepEqual(validateMovement({ type: "issue", qty: 1, studentId: "s" }), []);
  assert.equal(validateMovement({ type: "damage", qty: 1, note: "gãy" }).length, 1);
  assert.equal(validateMovement({ type: "damage", qty: 0, note: "rơi vỡ khi dạy" }).length, 1);
});

test("kho: giá vốn bình quân, mức tồn, đóng bộ", () => {
  assert.equal(movingAverageCost(10, 100, 10, 200), 150);
  assert.equal(movingAverageCost(0, 0, 4, 250), 250);
  assert.equal(movingAverageCost(-2, 100, 3, 300), 300);
  assert.equal(stockTone(0, 5), "out");
  assert.equal(stockTone(5, 5), "low");
  assert.equal(stockTone(6, 5), "ok");
  assert.equal(stockTone(1, 0), "ok");
  assert.equal(maxAssemblable([{ componentId: "a", qty: 2 }, { componentId: "b", qty: 1 }], { a: 7, b: 10 }), 3);
  assert.equal(maxAssemblable([{ componentId: "a", qty: 2 }], {}), 0);
  assert.equal(maxAssemblable([], { a: 1 }), 0);
  assert.deepEqual(validateBom("k", [{ componentId: "a", qty: 2 }]), []);
  assert.ok(validateBom("k", [{ componentId: "k", qty: 1 }]).length);
  assert.ok(validateBom("k", [{ componentId: "a", qty: 1 }, { componentId: "a", qty: 1 }]).length);
  assert.ok(validateBom("k", []).length);
});

test("kho: mặt hàng", () => {
  assert.deepEqual(validateItem({ sku: "KIT-SATA1", name: "Bộ Sata 1", type: "kit", unit: "bộ", rentPrice: 100000 }), []);
  assert.ok(validateItem({ sku: "kit 1", name: "B", type: "kit", unit: "" }).length >= 3);
  assert.ok(validateItem({ sku: "LK-01", name: "Motor", type: "component", unit: "cái", rentPrice: 1 }).length);
  assert.ok(validateItem({ sku: "LK-01", name: "Motor", type: "component", unit: "cái", salePrice: -1 }).length);
});

test("kho: cho thuê", () => {
  assert.equal(rentalDueDate("2026-09-01", 30), "2026-10-01");
  assert.throws(() => rentalDueDate("2026-09-01", 0));
  assert.equal(rentalOverdueDays("2026-09-10", "2026-09-10"), 0);
  assert.equal(rentalOverdueDays("2026-09-10", "2026-09-13"), 3);
  assert.equal(rentalFee(100000, 1), 100000);
  assert.equal(rentalFee(100000, 31), 200000);
  assert.deepEqual(depositRefund(500000, 100000, 2, 10000), { refund: 380000, charged: 120000 });
  assert.deepEqual(depositRefund(100000, 900000, 0, 0), { refund: 0, charged: 100000 });
});

test("kho: kiểm kê", () => {
  assert.equal(auditTransition("draft", "submit"), "submitted");
  assert.equal(auditTransition("submitted", "approve"), "approved");
  assert.equal(auditTransition("submitted", "reopen"), "draft");
  assert.throws(() => auditTransition("draft", "approve"));
  assert.throws(() => auditTransition("approved", "cancel"));
  assert.equal(isLargeVariance(100, 95), true);
  assert.equal(isLargeVariance(100, 98), false);
  assert.equal(isLargeVariance(10, 9), true);
  assert.equal(isLargeVariance(0, 1), true);
  assert.equal(isLargeVariance(3, 3), false);
  assert.deepEqual(validateAuditSubmit([{ systemQty: 3, countedQty: 3 }]), []);
  assert.ok(validateAuditSubmit([{ systemQty: 3, countedQty: null }])[0]!.includes("chưa nhập"));
  assert.ok(validateAuditSubmit([{ systemQty: 10, countedQty: 2 }])[0]!.includes("ghi chú"));
  assert.deepEqual(validateAuditSubmit([{ systemQty: 10, countedQty: 2, note: "mất khi chuyển lớp" }]), []);
  assert.ok(validateAuditSubmit([]).length);
  assert.deepEqual(auditSummary([{ systemQty: 5, countedQty: 7, avgCost: 10 }, { systemQty: 5, countedQty: 4, avgCost: 100 }, { systemQty: 1, countedQty: null }]), { over: 2, short: 1, value: -80, diffLines: 2, counted: 2, total: 3 });
  assert.equal(stockCode("PN", "CS1", 2026, 7), "PN-CS1-26-00007");
});
