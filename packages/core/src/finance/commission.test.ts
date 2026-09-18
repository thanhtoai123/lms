import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMMISSION_EVENTS, COMMISSION_SCOPES, COMMISSION_CALC_METHODS, DEFAULT_COMMISSION_TOTAL_CAP_PCT, ONE_TIME_EVENTS,
  validateCommissionPolicy, validateTiers, tierFor, computePolicyShare, computePolicy, policyPercentBps, sharePercentBps,
  describeShare, pickPolicy, scopeMatches, type CommissionPolicy,
} from "./commission.js";

const base = {
  name: "Học viên mới — khoá học",
  event: "hoc_vien_moi" as const,
  orderScope: "course" as const,
  centerId: null,
  calcMethod: "percent" as const,
  sourceRef: "SR.QD.208 · PL04 Điều 1",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  isActive: true,
};

test("chính sách hoa hồng: 4 trục đủ giá trị bản gốc", () => {
  assert.deepEqual([...COMMISSION_EVENTS], ["hoc_vien_moi", "tai_tuc", "chuyen_trung_tam", "ban_thiet_bi", "moi_nhan_su", "thuong_danh_hieu_tvv", "thuong_danh_hieu_quan_ly"]);
  assert.deepEqual([...COMMISSION_SCOPES], ["all", "course", "product"]);
  assert.deepEqual([...COMMISSION_CALC_METHODS], ["percent", "fixed", "tier"]);
  // Chuyển trung tâm chi một lần cho nhân sự trung tâm cũ
  assert.ok(ONE_TIME_EVENTS.includes("chuyen_trung_tam"));
  assert.equal(scopeMatches("all", "product"), true);
  assert.equal(scopeMatches("course", "product"), false);
});

test("trần tổng tỉ lệ 9%: nhiều vai trong cùng một chính sách", () => {
  const ok: CommissionPolicy = { ...base, shares: [{ role: "TVV", value: 500 }, { role: "QUAN_LY", value: 400 }] };
  assert.deepEqual(validateCommissionPolicy(ok), []);
  assert.equal(policyPercentBps(ok), 900);

  const over: CommissionPolicy = { ...base, shares: [{ role: "TVV", value: 500 }, { role: "QUAN_LY", value: 500 }] };
  const e = validateCommissionPolicy(over);
  assert.equal(e.length, 1);
  assert.match(e[0]!, /Tổng tỉ lệ hoa hồng/);
  assert.match(e[0]!, /10%/);
  assert.match(e[0]!, /vượt trần 9%/);
  assert.equal(DEFAULT_COMMISSION_TOTAL_CAP_PCT, 9);
  // Trần cấu hình được
  assert.deepEqual(validateCommissionPolicy(over, { capPercent: 12 }), []);
});

test("trần tổng cộng dồn với chính sách khác cùng sự kiện + loại đơn", () => {
  const existing: CommissionPolicy = { ...base, id: "p1", name: "Thưởng quản lý vùng", shares: [{ role: "QUAN_LY_VUNG", value: 600 }] };
  const added: CommissionPolicy = { ...base, id: "p2", name: "Hoa hồng TVV", shares: [{ role: "TVV", value: 400 }] };
  const e = validateCommissionPolicy(added, { others: [existing] });
  assert.match(e.join(), /đang có 6%/);
  assert.match(e.join(), /chính sách này 4%/);
  // Khác loại đơn thì không cộng dồn
  assert.deepEqual(validateCommissionPolicy({ ...added, orderScope: "product" }, { others: [existing] }), []);
  // Chính sách cũ đã tắt thì không cộng dồn
  assert.deepEqual(validateCommissionPolicy(added, { others: [{ ...existing, isActive: false }] }), []);
  // Hết hiệu lực trước khi chính sách mới bắt đầu thì không cộng dồn
  assert.deepEqual(validateCommissionPolicy(added, { others: [{ ...existing, effectiveTo: "2025-12-31" }] }), []);
});

test("bậc doanh thu: hợp lệ, chồng lấn bị chặn, tra bậc", () => {
  const tiers = [
    { from: 0, to: 49_999_999, amount: 0, percent: null },
    { from: 50_000_000, to: 99_999_999, amount: 2_000_000, percent: null },
    { from: 100_000_000, to: null, amount: 5_000_000, percent: null },
  ];
  // Bậc 1 thưởng 0 đồng vẫn là một mức hợp lệ (khai rõ "chưa tới bậc thưởng")
  assert.deepEqual(validateTiers(tiers.slice(1)), []);
  assert.equal(tierFor(tiers, 70_000_000)!.amount, 2_000_000);
  assert.equal(tierFor(tiers, 500_000_000)!.amount, 5_000_000);
  assert.equal(tierFor(tiers.slice(1), 10_000_000), null);

  assert.match(validateTiers([]).join(), /ít nhất một bậc/);
  // Chồng lấn
  const overlap = [{ from: 0, to: 60_000_000, amount: 1_000_000 }, { from: 50_000_000, to: 90_000_000, amount: 2_000_000 }];
  assert.match(validateTiers(overlap).join(), /chồng lấn/);
  // Bậc cuối không giới hạn trên thì không được có bậc sau
  assert.match(validateTiers([{ from: 0, to: null, amount: 1000 }, { from: 10, to: 20, amount: 2000 }]).join(), /bậc cuối/);
  // Mốc cuối phải lớn hơn mốc đầu
  assert.match(validateTiers([{ from: 100, to: 50, amount: 1000 }]).join(), /lớn hơn mốc đầu/);
  // Chỉ chọn một trong hai mức thưởng
  assert.match(validateTiers([{ from: 0, to: null, amount: 1000, percent: 200 }]).join(), /chỉ chọn một/);
  assert.match(validateTiers([{ from: 0, to: null }]).join(), /cần mức thưởng/);
});

test("tính hoa hồng theo từng cách tính", () => {
  // percent: % trên số tiền thực thu, làm tròn xuống nghìn
  const pc = { calcMethod: "percent" as const };
  assert.equal(computePolicyShare(pc, { role: "TVV", value: 500 }, { base: 9_600_000 }), 480_000);
  assert.equal(computePolicyShare(pc, { role: "TVV", value: 333 }, { base: 1_000_000 }), 33_000);
  assert.equal(computePolicyShare(pc, { role: "TVV", value: 500, maxAmount: 100_000 }, { base: 9_600_000 }), 100_000);
  assert.equal(computePolicyShare(pc, { role: "TVV", value: 500 }, { base: 0 }), 0);

  // fixed: số tiền cố định mỗi đơn vị
  const fx = { calcMethod: "fixed" as const };
  assert.equal(computePolicyShare(fx, { role: "TVV", value: 200_000 }, { base: 9_600_000 }), 200_000);
  assert.equal(computePolicyShare(fx, { role: "TVV", value: 200_000 }, { base: 9_600_000, units: 3 }), 600_000);

  // tier: thưởng theo bậc doanh thu
  const tr = { calcMethod: "tier" as const };
  const share = {
    role: "QUAN_LY",
    value: 0,
    tiers: [
      { from: 50_000_000, to: 99_999_999, amount: 2_000_000, percent: null },
      { from: 100_000_000, to: null, amount: null, percent: 300 },
    ],
  };
  assert.equal(computePolicyShare(tr, share, { base: 10_000_000, revenue: 70_000_000 }), 2_000_000);
  // Bậc theo %: 3% trên số tiền thực thu của đơn
  assert.equal(computePolicyShare(tr, share, { base: 10_000_000, revenue: 150_000_000 }), 300_000);
  // Ngoài mọi bậc → không thưởng
  assert.equal(computePolicyShare(tr, share, { base: 10_000_000, revenue: 1_000_000 }), 0);

  assert.deepEqual(computePolicy({ calcMethod: "percent", shares: [{ role: "TVV", value: 500 }, { role: "QL", value: 200 }] }, { base: 10_000_000 }),
    [{ role: "TVV", amount: 500_000 }, { role: "QL", amount: 200_000 }]);
});

test("bậc theo % cũng tính vào trần tổng (lấy bậc cao nhất)", () => {
  const p: CommissionPolicy = {
    ...base,
    calcMethod: "tier",
    shares: [{ role: "TVV", value: 0, tiers: [{ from: 0, to: 99, amount: null, percent: 400 }, { from: 100, to: null, amount: null, percent: 1000 }] }],
  };
  // Trần phải đúng cả ở bậc xấu nhất → lấy bậc % cao nhất
  assert.equal(sharePercentBps("tier", p.shares[0]!), 1000);
  assert.match(validateCommissionPolicy(p).join(), /vượt trần 9%/);
  // Bậc cao nhất 7% thì vẫn trong trần
  const under: CommissionPolicy = { ...p, shares: [{ role: "TVV", value: 0, tiers: [{ from: 0, to: null, amount: null, percent: 700 }] }] };
  assert.deepEqual(validateCommissionPolicy(under), []);
  // Bậc thưởng bằng số tiền thì không chiếm trần %
  const money: CommissionPolicy = { ...p, shares: [{ role: "TVV", value: 0, tiers: [{ from: 0, to: null, amount: 9_000_000, percent: null }] }] };
  assert.equal(policyPercentBps(money), 0);
  assert.deepEqual(validateCommissionPolicy(money), []);
});

test("chính sách hoa hồng: các lỗi khai báo khác", () => {
  assert.match(validateCommissionPolicy({ ...base, name: "ab", shares: [{ role: "TVV", value: 100 }] }).join(), /tối thiểu 3 ký tự/);
  assert.match(validateCommissionPolicy({ ...base, shares: [] }).join(), /ít nhất một vai/);
  assert.match(validateCommissionPolicy({ ...base, shares: [{ role: "TVV", value: 100 }, { role: "TVV", value: 200 }] }).join(), /khai hai lần/);
  assert.match(validateCommissionPolicy({ ...base, shares: [{ role: "TVV", value: 0 }] }).join(), /phải là số nguyên > 0/);
  assert.match(validateCommissionPolicy({ ...base, effectiveTo: "2025-01-01", shares: [{ role: "TVV", value: 100 }] }).join(), /sau ngày bắt đầu/);
  assert.match(validateCommissionPolicy({ ...base, shares: [{ role: "TVV", value: 100, maxAmount: 0 }] }).join(), /mức trần phải/);
  assert.match(validateCommissionPolicy({ ...base, calcMethod: "tier", shares: [{ role: "TVV", value: 0 }] }).join(), /ít nhất một bậc/);
  // Chính sách đang tắt thì không bị chặn bởi trần
  assert.deepEqual(validateCommissionPolicy({ ...base, isActive: false, shares: [{ role: "TVV", value: 5000 }] }), []);
});

test("mô tả mức và chọn chính sách áp dụng", () => {
  assert.equal(describeShare("percent", { role: "TVV", value: 500 }), "5%");
  assert.match(describeShare("fixed", { role: "TVV", value: 200_000 }), /200\.000đ\/đơn vị/);
  assert.equal(describeShare("tier", { role: "TVV", value: 0, tiers: [{ from: 0, to: null, amount: 1 }, { from: 0, to: null, amount: 1 }] }), "Theo bậc doanh thu (2 bậc)");

  const chung: CommissionPolicy = { ...base, id: "chung", orderScope: "all", shares: [{ role: "TVV", value: 300 }] };
  const rieng: CommissionPolicy = { ...base, id: "rieng", centerId: "c1", shares: [{ role: "TVV", value: 500 }] };
  const q = { event: "hoc_vien_moi" as const, centerId: "c1", orderType: "course", date: "2026-06-01" };
  // Riêng cơ sở thắng dùng chung
  assert.equal(pickPolicy([chung, rieng], q)!.id, "rieng");
  assert.equal(pickPolicy([chung, rieng], { ...q, centerId: "c2" })!.id, "chung");
  // Riêng loại đơn thắng "tất cả"
  assert.equal(pickPolicy([chung, { ...base, id: "khoa", shares: [{ role: "TVV", value: 1 }] }], { ...q, centerId: "c2" })!.id, "khoa");
  // Ngoài khoảng hiệu lực
  assert.equal(pickPolicy([chung], { ...q, date: "2025-06-01" }), null);
  assert.equal(pickPolicy([{ ...chung, isActive: false }], q), null);
});
