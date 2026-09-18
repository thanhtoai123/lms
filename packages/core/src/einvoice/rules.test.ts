import { test } from "node:test";
import assert from "node:assert/strict";
import { computeInvoiceTotals, linesForPayment, validateBuyer, validateTaxCode, validateSerial, invoiceTransition, validateCorrection, issueDeadlineState, vndInWords } from "./rules.js";

test("hoá đơn: tính tiền, tách thuế", () => {
  const t = computeInvoiceTotals([
    { name: "Học phí", unit: "Khoá", quantity: 1, unitPrice: 3_600_000, amount: 3_600_000, taxRate: "KCT" },
    { name: "Bộ học cụ", unit: "Bộ", quantity: 1, unitPrice: 1_100_000, amount: 1_100_000, taxRate: "10" },
  ]);
  assert.deepEqual({ s: t.subtotal, v: t.vat, t: t.total }, { s: 4_600_000, v: 100_000, t: 4_700_000 });
  assert.equal(t.byRate.KCT!.base, 3_600_000);
  const ex = computeInvoiceTotals([{ name: "x", unit: "c", quantity: 1, unitPrice: 1_000_000, amount: 1_000_000, taxRate: "8" }], false);
  assert.equal(ex.total, 1_080_000);
});

test("hoá đơn: dòng theo khoản thu", () => {
  const items = [{ description: "Khoá SATA4 48 buổi", quantity: 1, unitPrice: 9_600_000, amount: 9_600_000, isCourse: true }, { description: "Bộ học cụ", quantity: 1, unitPrice: 1_000_000, amount: 1_000_000, isCourse: false }];
  const full = linesForPayment({ orderCode: "DH1", orderType: "course", orderTotal: 10_070_000, paymentAmount: 10_070_000, items, courseRate: "KCT", goodsRate: "10" });
  assert.equal(full.length, 2);
  assert.equal(full.reduce((a, l) => a + l.amount, 0), 10_070_000);
  assert.equal(full[0]!.taxRate, "KCT");
  assert.equal(full[1]!.taxRate, "10");
  assert.throws(() => linesForPayment({ orderCode: "DH1", orderType: "course", orderTotal: 10_070_000, paymentAmount: 5_000_000, items, courseRate: "KCT", goodsRate: "10" }));
  const part = linesForPayment({ orderCode: "DH2", orderType: "course", orderTotal: 9_600_000, paymentAmount: 4_800_000, installmentLabel: "đợt 1/2", items: [items[0]!], courseRate: "KCT", goodsRate: "10" });
  assert.deepEqual(part, [{ name: "Học phí đợt 1/2 — đơn DH2", unit: "Lần", quantity: 1, unitPrice: 4_800_000, amount: 4_800_000, taxRate: "KCT" }]);
  assert.throws(() => linesForPayment({ orderCode: "DH2", orderType: "course", orderTotal: 100, paymentAmount: 200, items, courseRate: "KCT", goodsRate: "10" }));
});

test("hoá đơn: người mua, MST, ký hiệu", () => {
  assert.ok(validateTaxCode("0101234567"));
  assert.ok(validateTaxCode("0101234567-001"));
  assert.ok(!validateTaxCode("12345"));
  assert.equal(validateBuyer({ name: "PH A", company: null, taxCode: null, address: null, email: null, phone: null, noInvoiceRequested: false }).length, 0);
  assert.equal(validateBuyer({ name: null, company: null, taxCode: null, address: null, email: null, phone: null, noInvoiceRequested: true }).length, 0);
  assert.equal(validateBuyer({ name: null, company: null, taxCode: "123", address: null, email: "x@", phone: null, noInvoiceRequested: false }).length, 4);
  // Hai chiều của quy tắc gốc: có MST thì phải có tên đơn vị, và ghi tên đơn vị thì phải có MST
  assert.match(validateBuyer({ name: "PH A", company: null, taxCode: "0101234567", address: "1 Nguyễn Hữu Thọ", email: null, phone: null, noInvoiceRequested: false }).join(), /cần tên đơn vị/);
  assert.match(validateBuyer({ name: "PH A", company: "Công ty TNHH ABC", taxCode: null, address: "1 Nguyễn Hữu Thọ", email: null, phone: null, noInvoiceRequested: false }).join(), /tên đơn vị thì bắt buộc có mã số thuế/);
  // Khai đủ đơn vị + MST + địa chỉ thì hợp lệ
  assert.deepEqual(validateBuyer({ name: "PH A", company: "Công ty TNHH ABC", taxCode: "0101234567", address: "1 Nguyễn Hữu Thọ", email: "ke-toan@abc.vn", phone: null, noInvoiceRequested: false }), []);
  // Chỉ ghi tên đơn vị, thiếu cả MST lẫn địa chỉ → báo MST (địa chỉ chỉ kiểm khi đã có MST)
  assert.equal(validateBuyer({ name: null, company: "Công ty TNHH ABC", taxCode: null, address: null, email: null, phone: null, noInvoiceRequested: false }).length, 1);
  assert.deepEqual(validateSerial("1C26TSR", 2026), []);
  assert.equal(validateSerial("1C25TSR", 2026).length, 1);
  assert.equal(validateSerial("C26", 2026).length, 1);
});

test("hoá đơn: trạng thái, điều chỉnh, hạn lập", () => {
  assert.equal(invoiceTransition("draft", "issue"), "issuing");
  assert.equal(invoiceTransition("issuing", "issued"), "issued");
  assert.equal(invoiceTransition("failed", "retry"), "issuing");
  assert.throws(() => invoiceTransition("issued", "cancel"), /điều chỉnh hoặc thay thế/);
  assert.equal(invoiceTransition("issued", "mark_replaced"), "replaced");
  assert.throws(() => invoiceTransition("replaced", "mark_adjusted"));
  const l = [{ name: "Giảm học phí", unit: "Lần", quantity: 1, unitPrice: -500_000, amount: -500_000, taxRate: "KCT" as const }];
  assert.equal(validateCorrection({ kind: "adjustment", originalStatus: "issued", agreementNote: "Biên bản số 01/2026", reason: "Giảm giá bổ sung cho PH", lines: l }).length, 0);
  assert.equal(validateCorrection({ kind: "replacement", originalStatus: "draft", agreementNote: "x", reason: "y", lines: l }).length, 5);
  assert.equal(issueDeadlineState("2026-09-17", false, "2026-09-17"), "due_today");
  assert.equal(issueDeadlineState("2026-09-16", false, "2026-09-17"), "late");
  assert.equal(issueDeadlineState("2026-09-16", true, "2026-09-17"), "ok");
});

test("số tiền bằng chữ", () => {
  assert.equal(vndInWords(0), "Không đồng");
  assert.equal(vndInWords(15), "Mười lăm đồng");
  assert.equal(vndInWords(21), "Hai mươi mốt đồng");
  assert.equal(vndInWords(105), "Một trăm lẻ năm đồng");
  assert.equal(vndInWords(3_600_000), "Ba triệu sáu trăm nghìn đồng");
  assert.equal(vndInWords(10_070_000), "Mười triệu không trăm bảy mươi nghìn đồng");
  assert.equal(vndInWords(1_000_005), "Một triệu không trăm lẻ năm đồng");
  assert.equal(vndInWords(2_500_000_000), "Hai tỷ năm trăm triệu đồng");
  assert.equal(vndInWords(1_000_000_000_000), "Một nghìn tỷ đồng");
  assert.equal(vndInWords(24_000), "Hai mươi tư nghìn đồng");
  assert.equal(vndInWords(-500_000), "Âm năm trăm nghìn đồng");
});
