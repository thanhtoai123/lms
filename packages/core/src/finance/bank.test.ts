import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSepayPayload, parseSepayDate, checkApiKey, decideBankMatch, parseCsv, parseVnAmount, parseVnDate, parseLegacyCsv, parseStatementCsv,
} from "./bank.js";
import { pickRule, computeCommission, commissionTransition, refundAdjustment, validateRule, describeRule, type CommissionRule } from "./commission.js";

const sepay = { id: 92704, gateway: "Vietcombank", transactionDate: "2024-07-02 11:08:33", accountNumber: "0123499999", code: null, content: "SATA DH26000012 PH Lan", transferType: "in", description: "", transferAmount: 5000000, accumulated: 19077000, subAccount: null, referenceCode: "MBVCB.3278907687" };

test("parseSepayPayload chuẩn hoá payload SePay", () => {
  const r = parseSepayPayload(sepay);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.tx.externalId, "92704");
  assert.equal(r.tx.occurredAt, "2024-07-02T11:08:33+07:00");
  assert.equal(r.tx.direction, "in");
  assert.equal(r.tx.amount, 5000000);
  assert.equal(r.tx.accountNo, "0123499999");
  assert.equal(r.tx.referenceCode, "MBVCB.3278907687");
  assert.equal(parseSepayPayload({ ...sepay, transferAmount: -5 }).ok, false);
  assert.equal(parseSepayPayload({ ...sepay, transferType: "x" }).ok, false);
  assert.equal(parseSepayPayload({ ...sepay, transactionDate: "02/07/2024" }).ok, false);
  assert.equal(parseSepayPayload(null).ok, false);
  assert.equal(parseSepayDate("2024-02-30 10:00:00"), null);
  assert.equal(parseSepayDate("2024-02-29 23:59"), "2024-02-29T23:59:00+07:00");
});

test("checkApiKey", () => {
  assert.equal(checkApiKey("Apikey abc123", "abc123"), true);
  assert.equal(checkApiKey("apikey  abc123 ", "abc123"), true);
  assert.equal(checkApiKey("Apikey abc124", "abc123"), false);
  assert.equal(checkApiKey("Bearer abc123", "abc123"), false);
  assert.equal(checkApiKey("Apikey abc123", ""), false);
  assert.equal(checkApiKey(null, "abc123"), false);
});

test("decideBankMatch", () => {
  const base = { direction: "in" as const, amount: 3_000_000, content: "SATA DH26000012", accountKnown: true, accountOk: true };
  const order = { code: "DH26-000012", status: "partially_paid", total: 9_600_000, confirmed: 3_000_000, pending: [] as { id: string; amount: number }[] };
  assert.equal(decideBankMatch({ ...base, order }).kind, "confirm_new");
  assert.equal(decideBankMatch({ ...base, direction: "out", order }).kind, "ignored");
  assert.equal(decideBankMatch({ ...base, content: "chuyen tien hoc", order: null }).kind, "unmatched");
  assert.equal(decideBankMatch({ ...base, order: null }).kind, "unmatched");
  assert.equal(decideBankMatch({ ...base, accountKnown: false, order }).kind, "needs_review");
  assert.equal(decideBankMatch({ ...base, accountOk: false, order }).kind, "needs_review");
  assert.equal(decideBankMatch({ ...base, amount: 7_000_000, order }).kind, "needs_review");
  assert.equal(decideBankMatch({ ...base, order: { ...order, status: "cancelled" } }).kind, "needs_review");
  assert.equal(decideBankMatch({ ...base, order: { ...order, confirmed: 9_600_000 } }).kind, "needs_review");
  const p = decideBankMatch({ ...base, order: { ...order, pending: [{ id: "p1", amount: 3_000_000 }] } });
  assert.equal(p.kind, "confirm_pending");
  assert.equal(p.kind === "confirm_pending" && p.paymentId, "p1");
  assert.equal(decideBankMatch({ ...base, order: { ...order, pending: [{ id: "p1", amount: 5_000_000 }] } }).kind, "needs_review");
  assert.equal(decideBankMatch({ ...base, order: { ...order, pending: [{ id: "p1", amount: 1_000_000 }] } }).kind, "confirm_new");
});

test("parseCsv / số tiền / ngày", () => {
  assert.deepEqual(parseCsv('﻿a;b;c\n1;"x;y";"he said ""hi"""\r\n\n2;;3'), [["a", "b", "c"], ["1", "x;y", 'he said "hi"'], ["2", "", "3"]]);
  assert.deepEqual(parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
  assert.equal(parseVnAmount("1.200.000"), 1200000);
  assert.equal(parseVnAmount("1,200,000 VND"), 1200000);
  assert.equal(parseVnAmount("1200000đ"), 1200000);
  assert.equal(parseVnAmount("-500"), null);
  assert.equal(parseVnAmount(""), null);
  assert.equal(parseVnAmount("0"), null);
  assert.equal(parseVnDate("25/03/2024"), "2024-03-25");
  assert.equal(parseVnDate("5-3-2024 14:02"), "2024-03-05");
  assert.equal(parseVnDate("2024-03-25"), "2024-03-25");
  assert.equal(parseVnDate("31/02/2024"), null);
  assert.equal(parseVnDate("hôm qua"), null);
});

test("parseLegacyCsv", () => {
  const csv = [
    "Mã đơn,Mã HV,Mã lớp,Tổng đơn,Số tiền,Ngày thu,Phương thức,Số phiếu,Người nộp,Ghi chú",
    "DH25-000123,,,,\"2.000.000\",15/08/2025,TM-CS1,PT001,Chị Lan,",
    ",HV0001,CS1.SATA4,9.600.000,4.800.000,16/08/2025,CK-VCB,PT002,,đợt 1",
    ",HV0001,,,1000,16/08/2025,CK-VCB,PT003,,",
    "SATA DH25000124,,,,abc,40/08/2025,,PT001,,",
    ",,,,100000,01/01/2030,TM,PT009,,",
  ].join("\n");
  const r = parseLegacyCsv(csv, "2026-09-16");
  assert.deepEqual(r.headerErrors, []);
  assert.equal(r.rows.length, 5);
  assert.equal(r.rows[0]!.row?.orderCode, "DH25-000123");
  assert.equal(r.rows[0]!.row?.amount, 2000000);
  assert.equal(r.rows[1]!.row?.orderTotal, 9600000);
  assert.equal(r.rows[1]!.row?.paidAt, "2025-08-16");
  assert.ok(r.rows[2]!.errors.some((e) => e.includes("mã HV + mã lớp")));
  assert.ok(r.rows[3]!.errors.includes("Số tiền không hợp lệ"));
  assert.ok(r.rows[3]!.errors.includes("Số phiếu bị lặp trong file"));
  assert.ok(r.rows[3]!.errors.includes("Thiếu phương thức"));
  assert.ok(r.rows[4]!.errors.includes("Ngày thu ở tương lai"));
  assert.ok(parseLegacyCsv("so_tien,ngay_thu\n1,2", "2026-01-01").headerErrors.length > 0);
});

test("parseStatementCsv", () => {
  const csv = "Ngày GD;Số tiền ghi nợ;Số tiền ghi có;Nội dung;Mã GD\n02/07/2024;;5.000.000;SATA DH26000012;FT001\n02/07/2024;200.000;;phi;FT002\n03/07/2024;;1.000.000;ck hoc phi;\n03/07/2024;;xx;loi;FT004";
  const r = parseStatementCsv(csv, "0123499999", "VCB");
  assert.deepEqual(r.headerErrors, []);
  assert.equal(r.txs.length, 2);
  assert.equal(r.skippedOut, 1);
  assert.equal(r.errors.length, 1);
  assert.equal(r.txs[0]!.externalId, "0123499999:FT001");
  assert.ok(r.txs[1]!.externalId.startsWith("0123499999:2024-07-03:1000000:"));
});

const rule = (o: Partial<CommissionRule>): CommissionRule => ({ id: "r", kind: "sale", centerId: null, orderType: null, rateType: "percent", value: 500, maxAmount: null, minOrderTotal: 0, effectiveFrom: "2026-01-01", effectiveTo: null, isActive: true, ...o });

test("hoa hồng: chọn quy tắc, tính tiền, trạng thái", () => {
  const rules = [rule({ id: "g" }), rule({ id: "c1", centerId: "cs1", value: 700 }), rule({ id: "old", centerId: "cs1", effectiveFrom: "2025-01-01", effectiveTo: "2025-12-31" }), rule({ id: "ref", kind: "referrer", rateType: "fixed", value: 300000, minOrderTotal: 5_000_000 })];
  const q = { kind: "sale" as const, centerId: "cs1", orderType: "course", date: "2026-05-01", total: 9_600_000 };
  assert.equal(pickRule(rules, q)?.id, "c1");
  assert.equal(pickRule(rules, { ...q, centerId: "cs2" })?.id, "g");
  assert.equal(pickRule(rules, { ...q, date: "2025-06-01" })?.id, "old");
  assert.equal(pickRule(rules, { ...q, kind: "referrer", total: 4_000_000 }), null);
  assert.equal(pickRule(rules, { ...q, kind: "referrer" })?.id, "ref");
  assert.equal(computeCommission(rule({ value: 500 }), 9_630_000), 481000);
  assert.equal(computeCommission(rule({ value: 500, maxAmount: 300000 }), 9_600_000), 300000);
  assert.equal(computeCommission(rule({ rateType: "fixed", value: 250000 }), 1), 250000);
  assert.equal(computeCommission(rule({}), 0), 0);
  assert.equal(describeRule(rule({ value: 550, maxAmount: 1_000_000 })), "5,5% (tối đa 1.000.000đ)");
  assert.equal(commissionTransition("accrued", "approve"), "approved");
  assert.equal(commissionTransition("approved", "pay"), "paid");
  assert.throws(() => commissionTransition("accrued", "pay"));
  assert.throws(() => commissionTransition("paid", "cancel"));
  assert.ok(validateRule({ ...rule({ value: 6000 }) }).length > 0);
  assert.ok(validateRule({ ...rule({ effectiveTo: "2025-01-01" }) }).length > 0);
});

test("hoa hồng: điều chỉnh khi hoàn tiền", () => {
  assert.deepEqual(refundAdjustment({ status: "accrued", originalAmount: 480000, net: 480000, baseAmount: 9_600_000 }, 1_000_000), { mode: "reduce", delta: 50000 });
  assert.deepEqual(refundAdjustment({ status: "paid", originalAmount: 480000, net: 480000, baseAmount: 9_600_000 }, 9_600_000), { mode: "clawback", delta: 480000 });
  assert.deepEqual(refundAdjustment({ status: "paid", originalAmount: 480000, net: 100000, baseAmount: 9_600_000 }, 9_600_000), { mode: "clawback", delta: 100000 });
  assert.equal(refundAdjustment({ status: "cancelled", originalAmount: 480000, net: 480000, baseAmount: 9_600_000 }, 100).mode, "none");
});
