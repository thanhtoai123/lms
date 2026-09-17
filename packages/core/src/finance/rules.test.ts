import { test } from "node:test";
import assert from "node:assert/strict";
import {
  priceOrder, packagePrice, buildInstallmentPlan, validateInstallmentPlan, orderBalance, deriveOrderStatus, canCancelOrder,
  allocateInstallments, agingBucket, dueSoon, validatePaymentDecision, receiptNumber, orderCode, transferMemo, extractOrderRef,
  maskIdNumber, refundProposal, validateRefundRequest, refundTransition, FinanceRuleError, vietQrImageUrl,
} from "./rules.js";
import { authorize, type Actor } from "../policy/policy.js";

test("định giá đơn và giảm giá", () => {
  assert.deepEqual(priceOrder([{ quantity: 1, unitPrice: 9_600_000 }], { type: "percent", value: 10 }), { subtotal: 9_600_000, discountAmount: 960_000, total: 8_640_000, errors: [] });
  assert.equal(priceOrder([{ quantity: 2, unitPrice: 100_000 }], { type: "amount", value: 50_000 }).total, 150_000);
  assert.match(priceOrder([{ quantity: 1, unitPrice: 100 }], { type: "amount", value: 500 }).errors.join(), /lớn hơn/);
  assert.match(priceOrder([], null).errors.join(), /ít nhất/);
  assert.match(priceOrder([{ quantity: 0, unitPrice: 1 }], { type: "percent", value: 120 }).errors.join(), /Số lượng.*tối đa 100%|tối đa 100%.*Số lượng/);
  assert.equal(packagePrice(9_600_000, 48, 12), 2_400_000);
});

test("kế hoạch trả góp", () => {
  const p = buildInstallmentPlan(8_640_000, 3, "2026-09-20");
  assert.deepEqual(p.map((x) => x.amount), [2_880_000, 2_880_000, 2_880_000]);
  assert.deepEqual(p.map((x) => x.dueDate), ["2026-09-20", "2026-10-20", "2026-11-19"]);
  const q = buildInstallmentPlan(1_000_500, 2, "2026-09-20");
  assert.equal(q[0]!.amount + q[1]!.amount, 1_000_500);
  assert.throws(() => buildInstallmentPlan(100, 13, "2026-09-20"), FinanceRuleError);
  assert.deepEqual(validateInstallmentPlan(300, [{ amount: 100, dueDate: "2026-01-01" }, { amount: 200, dueDate: "2026-02-01" }]), []);
  assert.match(validateInstallmentPlan(300, [{ amount: 100, dueDate: "2026-02-01" }, { amount: 100, dueDate: "2026-01-01" }]).join(), /phải bằng.*tăng dần/);
});

test("công nợ, trạng thái đơn, tuổi nợ", () => {
  const b = orderBalance(3_000_000, [{ amount: 1_000_000, status: "confirmed" }, { amount: 500_000, status: "recorded" }, { amount: 900, status: "rejected" }]);
  assert.equal(b.outstanding, 2_000_000);
  assert.equal(b.pending, 500_000);
  assert.equal(deriveOrderStatus("pending_payment", 3_000_000, 1_000_000), "partially_paid");
  assert.equal(deriveOrderStatus("partially_paid", 3_000_000, 3_000_000), "paid");
  assert.equal(deriveOrderStatus("cancelled", 3_000_000, 3_000_000), "cancelled");
  assert.match(canCancelOrder("pending_payment", 1, 0)!, /hoàn tiền/);
  assert.equal(canCancelOrder("pending_payment", 0, 0), null);
  const plan = [{ seq: 1, amount: 1000, dueDate: "2026-08-01" }, { seq: 2, amount: 1000, dueDate: "2026-09-01" }, { seq: 3, amount: 1000, dueDate: "2026-09-25" }];
  const st = allocateInstallments(plan, 1500, "2026-09-16");
  assert.deepEqual(st.map((s) => s.state), ["paid", "partial", "unpaid"]);
  assert.deepEqual(st.map((s) => s.overdueDays), [0, 15, 0]);
  assert.equal(agingBucket(15), "d1_30");
  assert.equal(agingBucket(0), "current");
  assert.equal(agingBucket(91), "d90_plus");
  assert.equal(dueSoon(st, "2026-09-16", 10).length, 1);
});

test("xác nhận thanh toán: tách vai, lý do", () => {
  const base = { status: "recorded" as const, recordedBy: "sale", actorId: "kt", isSuperAdmin: false, amount: 1000 };
  assert.deepEqual(validatePaymentDecision({ ...base, decision: "confirm" }), []);
  assert.match(validatePaymentDecision({ ...base, actorId: "sale", decision: "confirm" }).join(), /không tự xác nhận/);
  assert.deepEqual(validatePaymentDecision({ ...base, actorId: "sale", isSuperAdmin: true, decision: "confirm" }), []);
  assert.match(validatePaymentDecision({ ...base, decision: "reject" }).join(), /lý do/);
  assert.match(validatePaymentDecision({ ...base, decision: "adjust", adjustedAmount: 1000, reason: "chuyển thiếu" }).join(), /trùng/);
  assert.match(validatePaymentDecision({ ...base, status: "confirmed", decision: "confirm" }).join(), /đã được xử lý/);
});

test("mã chứng từ, nội dung CK, che CCCD, QR", () => {
  assert.equal(receiptNumber("CS1", 2026, 123), "PT-CS1-26-000123");
  const code = orderCode(2026, 12);
  assert.equal(code, "DH26-000012");
  assert.equal(transferMemo(code), "SATA DH26000012");
  assert.equal(extractOrderRef("MBVCB.123 SATA DH26000012 nop hoc phi"), code);
  assert.equal(extractOrderRef("sata dh26-000005 be An"), "DH26-000005");
  assert.equal(extractOrderRef("DH260000123"), null);
  assert.equal(extractOrderRef("chuyen tien"), null);
  assert.equal(maskIdNumber("048123456789"), "048*******89");
  assert.match(vietQrImageUrl({ bankBin: "970436", accountNo: "0123", amount: 1000, memo: "SATA X" }), /970436-0123-compact2\.png\?amount=1000&addInfo=SATA\+X/);
});

test("hoàn tiền theo buổi", () => {
  const r = refundProposal({ paid: 9_600_000, packageValue: 9_600_000, packageSessions: 48, consumedSessions: 12, alreadyRefunded: 0 });
  assert.equal(r.perSession, 200_000);
  assert.equal(r.refundable, 7_200_000);
  assert.equal(refundProposal({ paid: 1_000_000, packageValue: 9_600_000, packageSessions: 48, consumedSessions: 12, alreadyRefunded: 0 }).refundable, 0);
  assert.equal(refundProposal({ paid: 9_600_000, packageValue: 9_600_000, packageSessions: 48, consumedSessions: 60, alreadyRefunded: 0 }).remainingSessions, 0);
  assert.deepEqual(validateRefundRequest(7_000_000, 7_200_000, "Chuyển nhà"), []);
  assert.equal(validateRefundRequest(8_000_000, 7_200_000, "ngắn").length, 2);
  assert.equal(refundTransition("pending", "approve"), "approved");
  assert.equal(refundTransition("approved", "pay"), "paid");
  assert.throws(() => refundTransition("pending", "pay"), FinanceRuleError);
});

test("quyền tài chính", () => {
  const sale: Actor = { userId: "s", assignments: [{ role: "CENTER_SALES_CSM", centerId: "c1" }] };
  const kt: Actor = { userId: "k", assignments: [{ role: "CENTER_ACCOUNTANT", centerId: "c1" }] };
  const ql: Actor = { userId: "q", assignments: [{ role: "CENTER_MANAGER", centerId: "c1" }] };
  assert.equal(authorize(sale, "finance:create", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(sale, "finance:confirm", { centerId: "c1" }).allowed, false);
  assert.equal(authorize(kt, "finance:confirm", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(kt, "finance:confirm", { centerId: "c2" }).allowed, false);
  assert.equal(authorize(ql, "finance:approve", { centerId: "c1" }).allowed, true);
  assert.equal(authorize(ql, "finance:confirm", { centerId: "c1" }).allowed, false);
  assert.equal(authorize(ql, "finance:configure", { centerId: "c1" }).allowed, false);
});
