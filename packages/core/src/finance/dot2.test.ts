/**
 * Đợt 2 — Tài chính hằng ngày: trả góp 1–12 đợt + cọc + sửa kế hoạch, dòng đơn (coach / giảm theo dòng),
 * trạng thái đơn suy từ tiền, phân bổ giao dịch cho nhiều con, công nợ theo ghi danh, nhập giao dịch cũ.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPlan, buildModulePlan, buildMonthlyPlan, addMonthsISO, validateInstallmentPlan, replanInstallments,
  COACH_MULTIPLIER, formatUnitPrice, priceLine, priceLines, orderDisplayState,
  enrollmentDebtChip, agingBucketBy, agingBucketLabels, FinanceRuleError,
} from "./rules.js";
import { planAllocation, normalizeName, normalizeLegacyPhone, matchLegacyStudent, parseLegacyTuitionTable, legacyLineStatus } from "./bank.js";

test("Đợt 2 · trả góp 1–12 đợt, cọc, học phần, theo tháng", () => {
  const p12 = buildPlan(12_000_000, 12, "2026-01-10");
  assert.equal(p12.length, 12);
  assert.equal(p12.reduce((s, x) => s + x.amount, 0), 12_000_000);
  assert.ok(p12.every((x) => Number.isInteger(x.amount) && x.kind === "installment"));
  assert.throws(() => buildPlan(100, 13, "2026-01-10"), FinanceRuleError);

  // cọc đứng đầu, phần còn lại chia đều, đợt 1 lùi một nhịp
  const dep = buildPlan(9_600_000, 3, "2026-01-10", { deposit: 600_000 });
  assert.equal(dep[0]!.kind, "deposit");
  assert.equal(dep[0]!.amount, 600_000);
  assert.deepEqual(dep.map((x) => x.seq), [1, 2, 3, 4]);
  assert.equal(dep.reduce((s, x) => s + x.amount, 0), 9_600_000);
  assert.equal(dep[1]!.dueDate, "2026-02-09");
  assert.throws(() => buildPlan(1000, 2, "2026-01-10", { deposit: 2000 }), FinanceRuleError);

  // 48 buổi = 4 học phần, mốc cách 30 ngày (SR.QD.223)
  const mod = buildModulePlan(9_600_000, 4, "2026-01-10");
  assert.deepEqual(mod.map((x) => x.amount), [2_400_000, 2_400_000, 2_400_000, 2_400_000]);
  assert.deepEqual(mod.map((x) => x.dueDate), ["2026-01-10", "2026-02-09", "2026-03-11", "2026-04-10"]);

  // chia theo tháng (SR.QD.219 Điều 2) — kẹp về ngày cuối tháng
  const mon = buildMonthlyPlan(3_000_000, 3, "2026-01-31");
  assert.deepEqual(mon.map((x) => x.dueDate), ["2026-01-31", "2026-02-28", "2026-03-31"]);
  assert.throws(() => buildMonthlyPlan(100, 13, "2026-01-10"), FinanceRuleError);
  assert.equal(addMonthsISO("2026-12-15", 1), "2027-01-15");
});

test("Đợt 2 · kiểm tra kế hoạch: cọc tối đa 1 và đứng đầu, tổng khớp", () => {
  assert.deepEqual(validateInstallmentPlan(1000, [{ amount: 300, dueDate: "2026-01-01", kind: "deposit" }, { amount: 700, dueDate: "2026-02-01" }]), []);
  assert.match(validateInstallmentPlan(1000, [{ amount: 700, dueDate: "2026-01-01" }, { amount: 300, dueDate: "2026-02-01", kind: "deposit" }]).join(), /cọc phải là phiếu đầu tiên/);
  assert.match(validateInstallmentPlan(1000, [{ amount: 300, dueDate: "2026-01-01", kind: "deposit" }, { amount: 400, dueDate: "2026-02-01", kind: "deposit" }, { amount: 300, dueDate: "2026-03-01" }]).join(), /một khoản cọc/);
  assert.match(validateInstallmentPlan(1000, [{ amount: 900, dueDate: "2026-01-01" }]).join(), /Tổng các phiếu phải bằng .* đang lệch 100đ/);
  const many = Array.from({ length: 13 }, (_, i) => ({ amount: 100, dueDate: `2026-01-${String(i + 1).padStart(2, "0")}` }));
  assert.match(validateInstallmentPlan(1300, many).join(), /từ 1 đến 12 đợt/);
  assert.match(validateInstallmentPlan(100, [{ amount: 100, dueDate: "" }]).join(), /chọn ngày hẹn đóng/);
});

test("Đợt 2 · sửa kế hoạch: đợt đã thu được bảo vệ", () => {
  const current = [{ seq: 1, amount: 3_000_000, paid: 3_000_000 }, { seq: 2, amount: 3_000_000, paid: 0 }, { seq: 3, amount: 3_000_000, paid: 1_000_000 }];
  // giữ hai đợt đã thu, tách đợt 2 (chưa thu) thành hai đợt mới
  assert.deepEqual(
    replanInstallments(9_000_000, current, [
      { seq: 1, amount: 3_000_000, dueDate: "2026-01-10" },
      { seq: 3, amount: 3_000_000, dueDate: "2026-02-10" },
      { amount: 1_500_000, dueDate: "2026-03-10" },
      { amount: 1_500_000, dueDate: "2026-04-10" },
    ]),
    [],
  );
  assert.match(replanInstallments(6_000_000, current, [{ seq: 1, amount: 3_000_000, dueDate: "2026-01-10" }, { amount: 3_000_000, dueDate: "2026-02-10" }]).join(), /Đợt 3 đã thu .*không được xoá/);
  assert.match(replanInstallments(9_000_000, current, [
    { seq: 1, amount: 3_000_000, dueDate: "2026-01-10" },
    { seq: 3, amount: 500_000, dueDate: "2026-02-10" },
    { amount: 5_500_000, dueDate: "2026-03-10" },
  ]).join(), /không được nhỏ hơn/);
  assert.match(replanInstallments(1000, current, [{ seq: 9, amount: 1000, dueDate: "2026-01-10" }]).join(), /Đợt 9 không có trong kế hoạch hiện tại/);
});

test("Đợt 2 · định giá dòng: hệ số coach, giảm cộng dồn, gói cố định", () => {
  assert.equal(COACH_MULTIPLIER.coach_1_1, 2);
  assert.equal(formatUnitPrice(9_600_000, "coach_1_2"), 17_280_000);
  assert.equal(formatUnitPrice(1_000_001, "coach_1_4"), 1_500_002); // luôn là số nguyên VND
  const ok = priceLine({ unitPrice: 10_560_000, quantity: 1, discounts: [{ kind: "percent", value: 5, reason: "Giới thiệu" }] });
  assert.deepEqual([ok.gross, ok.discount, ok.net, ok.errors], [10_560_000, 528_000, 10_032_000, []]);
  const two = priceLine({ unitPrice: 1_000_000, quantity: 2, discounts: [{ kind: "percent", value: 10, reason: "Ưu đãi hè" }, { kind: "amount", value: 100_000, reason: "Học bổng" }] });
  assert.deepEqual([two.gross, two.discount, two.net], [2_000_000, 300_000, 1_700_000]);
  assert.match(priceLine({ unitPrice: 100, quantity: 1, discounts: [{ kind: "percent", value: 60, reason: "quá trần" }] }).errors.join(), /1–50%/);
  assert.deepEqual(priceLine({ unitPrice: 100, quantity: 1, discounts: [{ kind: "percent", value: 60, reason: "trần cơ sở" }], maxPercent: 70 }).errors, []);
  assert.match(priceLine({ unitPrice: 100, quantity: 1, discounts: [{ kind: "amount", value: 50, reason: "" }] }).errors.join(), /lý do/);
  const over = priceLine({ unitPrice: 100_000, quantity: 1, discounts: [{ kind: "amount", value: 200_000, reason: "nhập sai" }] });
  assert.equal(over.net, 0);
  assert.match(over.errors.join(), /vượt thành tiền/);
  assert.match(priceLine({ unitPrice: 100, quantity: 1, fixedPackage: true, format: "coach_1_1", sessions: 5, courseSessions: 5 }).errors.join(), /không bán dạng coach/);
  assert.match(priceLine({ unitPrice: 100, quantity: 1, fixedPackage: true, sessions: 3, courseSessions: 5 }).errors.join(), /không bán lẻ buổi/);
  const order = priceLines([
    { unitPrice: 5_000_000, quantity: 1, discounts: [{ kind: "amount", value: 500_000, reason: "Anh chị em" }] },
    { unitPrice: 4_000_000, quantity: 1 },
  ]);
  assert.deepEqual([order.subtotal, order.discountAmount, order.total, order.errors], [9_000_000, 500_000, 8_500_000, []]);
  assert.match(priceLines([]).errors.join(), /ít nhất một dòng/);
  assert.match(priceLines([{ unitPrice: 100, quantity: 0 }]).errors.join(), /^Dòng 1: /);
});

test("Đợt 2 · trạng thái đơn suy từ tiền", () => {
  const s = (confirmed: number, pending: number, total = 1_000_000, status: "pending_payment" | "cancelled" | "refunded" = "pending_payment") =>
    orderDisplayState({ status, total, confirmed, pending, installments: 2, paidInstallments: 1 });
  assert.equal(s(0, 0).key, "unpaid");
  assert.equal(s(400_000, 0).key, "paying");
  assert.equal(s(400_000, 100_000).pendingNote, true);
  // "tiền đã về là đã về": đủ nhưng kế toán chưa đối soát
  assert.equal(s(400_000, 600_000).key, "paid_pending");
  assert.equal(s(1_000_000, 0).key, "paid_confirmed");
  assert.equal(s(1_200_000, 0).key, "overpaid");
  assert.equal(s(0, 0, 0).key, "zero");
  assert.equal(s(500_000, 0, 1_000_000, "cancelled").key, "cancelled");
  assert.equal(s(500_000, 0, 1_000_000, "refunded").key, "refunded");
  // công nợ phụ huynh vẫn chỉ trừ khoản đã xác nhận
  assert.equal(s(400_000, 600_000).outstanding, 600_000);
  assert.equal(s(400_000, 600_000).received, 1_000_000);
  assert.equal(s(0, 0).installmentsLabel, "Trả góp 2 đợt · Đã đóng đợt 1");
  assert.equal(orderDisplayState({ status: "pending_payment", total: 100, confirmed: 0, pending: 0 }).installmentsLabel, null);
});

test("Đợt 2 · chip công nợ theo ghi danh + tuổi nợ theo mốc cấu hình", () => {
  assert.equal(enrollmentDebtChip({ hasFee: false, total: 0, confirmed: 0, recorded: 0 }), "no_fee");
  assert.equal(enrollmentDebtChip({ hasFee: true, total: 1000, confirmed: 0, recorded: 0 }), "zero");
  assert.equal(enrollmentDebtChip({ hasFee: true, total: 1000, confirmed: 200, recorded: 0 }), "short");
  assert.equal(enrollmentDebtChip({ hasFee: true, total: 1000, confirmed: 200, recorded: 800 }), "paid_pending");
  assert.equal(enrollmentDebtChip({ hasFee: true, total: 1000, confirmed: 1000, recorded: 0 }), "paid");
  assert.equal(enrollmentDebtChip({ hasFee: true, total: 1000, confirmed: 1200, recorded: 0 }), "overpaid");
  assert.deepEqual([agingBucketBy(0), agingBucketBy(1), agingBucketBy(7), agingBucketBy(8), agingBucketBy(30), agingBucketBy(31)], ["current", "b1", "b1", "b2", "b2", "b3"]);
  assert.equal(agingBucketBy(10, [14, 45]), "b1");
  assert.equal(agingBucketLabels().b2, "Quá hạn 8–30 ngày");
});

test("Đợt 2 · phân bổ một giao dịch cho từng con", () => {
  const lines = [{ orderItemId: "a", outstanding: 3_000_000, label: "Bé An" }, { orderItemId: "b", outstanding: 2_000_000, label: "Bé Bình" }];
  const exact = planAllocation(5_000_000, lines, [{ orderItemId: "a", amount: 3_000_000 }, { orderItemId: "b", amount: 2_000_000 }]);
  assert.deepEqual([exact.allocated, exact.surplus, exact.fit, exact.errors], [5_000_000, 0, "exact", []]);
  const sur = planAllocation(6_000_000, lines, [{ orderItemId: "a", amount: 3_000_000 }, { orderItemId: "b", amount: 2_000_000 }]);
  assert.deepEqual([sur.surplus, sur.fit], [1_000_000, "surplus"]);
  const over = planAllocation(5_000_000, lines, [{ orderItemId: "a", amount: 4_000_000 }]);
  assert.match(over.errors.join(), /Bé An: rót .* vượt số còn thiếu/);
  assert.match(planAllocation(1_000_000, lines, [{ orderItemId: "a", amount: 600_000 }, { orderItemId: "b", amount: 600_000 }]).errors.join(), /vượt số tiền giao dịch/);
  assert.match(planAllocation(1_000_000, lines, [{ orderItemId: "zz", amount: 1000 }]).errors.join(), /không thuộc đơn này/);
  assert.match(planAllocation(1_000_000, lines, [{ orderItemId: "a", amount: 1000 }, { orderItemId: "a", amount: 1000 }]).errors.join(), /một lần/);
  // dòng 0đ được bỏ qua, không sinh khoản thu rỗng
  assert.deepEqual(planAllocation(1000, lines, [{ orderItemId: "a", amount: 0 }]).allocations, []);
});

test("Đợt 2 · nhập giao dịch cũ: khớp SĐT phụ huynh + họ tên", () => {
  assert.equal(normalizeName("  Nguyễn  Hoàng  ĐỨc "), "nguyen hoang duc");
  assert.equal(normalizeLegacyPhone("0905.123.456"), "84905123456");
  assert.equal(normalizeLegacyPhone("905123456"), "84905123456");
  assert.equal(normalizeLegacyPhone("123"), null);
  const cands = [
    { id: "e1", fullName: "Nguyễn Hoàng Đức", parentPhones: ["84905123456"] },
    { id: "e2", fullName: "Nguyễn Hoàng Đức", parentPhones: ["84912000000"] },
    { id: "e3", fullName: "Trần Bảo Ngọc", parentPhones: ["84905123456"] },
  ];
  assert.deepEqual(matchLegacyStudent({ name: "nguyen hoang duc", phone: "0905123456" }, cands), { kind: "one", ids: ["e1"] });
  assert.deepEqual(matchLegacyStudent({ name: "Nguyễn Hoàng Đức", phone: null }, cands), { kind: "many", ids: ["e1", "e2"] });
  assert.deepEqual(matchLegacyStudent({ name: "Không Có Ai", phone: "0988888888" }, cands), { kind: "none", ids: [] });
  // SĐT đúng nhưng tên lệch → vẫn đưa về hồ sơ theo SĐT
  assert.deepEqual(matchLegacyStudent({ name: "Tên Khác", phone: "0912000000" }, cands), { kind: "one", ids: ["e2"] });

  assert.equal(legacyLineStatus({ matched: "none", existingPaid: 0, amount: 100 }), "not_found");
  assert.equal(legacyLineStatus({ matched: "many", existingPaid: 0, amount: 100 }), "needs_choice");
  assert.equal(legacyLineStatus({ matched: "one", existingPaid: 100, amount: 100 }), "already_paid");
  assert.equal(legacyLineStatus({ matched: "one", existingPaid: 100, amount: 100, forced: true }), "will_write");
  assert.equal(legacyLineStatus({ matched: "one", existingPaid: 50, amount: 100 }), "will_write");
});

test("Đợt 2 · đọc bảng học phí cũ (CSV / dán từ Excel)", () => {
  const csv = [
    "mã hv,họ và tên học viên,số điện thoại,tình trạng,ngày,khóa học đăng ký,cơ sở,học phí,ghi chú",
    "HV001,Nguyễn Hoàng Đức,0905123456,Đang học,15/08/2026,SATA4,CS1,4.800.000,Đợt 1",
    "HV002,Trần Bảo Ngọc,0912000000,Đang học,2026-08-20,SATA2,CS2,2000000,",
    "HV003,,0912000000,,15/08/2026,,,100000,",
    "HV004,Lê Minh,0912000000,,15/08/2030,,,100000,",
  ].join("\n");
  const r = parseLegacyTuitionTable(csv, "2026-09-17");
  assert.deepEqual(r.headerErrors, []);
  assert.equal(r.rows.length, 4);
  assert.deepEqual(
    [r.rows[0]!.row!.name, r.rows[0]!.row!.phone, r.rows[0]!.row!.amount, r.rows[0]!.row!.paidAt, r.rows[0]!.row!.courseText, r.rows[0]!.row!.note],
    ["Nguyễn Hoàng Đức", "84905123456", 4_800_000, "2026-08-15", "SATA4", "Đợt 1"],
  );
  assert.equal(r.rows[1]!.row!.paidAt, "2026-08-20");
  assert.match(r.rows[2]!.errors.join(), /họ tên/);
  assert.match(r.rows[3]!.errors.join(), /tương lai/);
  assert.match(parseLegacyTuitionTable("a,b\n1,2", "2026-09-17").headerErrors.join(), /Thiếu cột họ và tên|Thiếu cột học phí/);
  // sheet theo tháng / cơ sở được gắn vào từng dòng
  assert.equal(parseLegacyTuitionTable(csv, "2026-09-17", { sheet: "Tháng 8 2026 CS1" }).rows[0]!.row!.sheet, "Tháng 8 2026 CS1");
});
