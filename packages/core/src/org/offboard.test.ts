import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OFFBOARD_ACTIONS, OFFBOARD_ACTION_VI, OFFBOARD_EFFECT_VI,
  nextOffboardStatus, locksAccounts, lockReasonFor, validateOffboardConfirm,
  retentionUntil, offboardExportName, offboardWarnings, offboardNextSteps,
  TenantOffboardError,
} from "./offboard.js";

/* ------------------------------------------------------------------ */
/* Chuyển trạng thái                                                   */
/* ------------------------------------------------------------------ */

test("tạm ngừng rồi đóng: trạng thái đi đúng đường", () => {
  assert.equal(nextOffboardStatus("active", "suspend"), "suspended");
  assert.equal(nextOffboardStatus("suspended", "close"), "closed");
  assert.equal(nextOffboardStatus("active", "close"), "closed");
  assert.equal(nextOffboardStatus("onboarding", "close"), "closed");
});

test("mở lại được trung tâm đang tạm ngừng hoặc đã đóng", () => {
  assert.equal(nextOffboardStatus("suspended", "reopen"), "active");
  assert.equal(nextOffboardStatus("closed", "reopen"), "active");
  assert.throws(() => nextOffboardStatus("active", "reopen"), TenantOffboardError);
  assert.throws(() => nextOffboardStatus("onboarding", "reopen"), TenantOffboardError);
});

test("không bao giờ đụng được vào trung tâm gốc của chuỗi", () => {
  for (const a of OFFBOARD_ACTIONS) {
    assert.throws(() => nextOffboardStatus("active", a, { isDefault: true }), TenantOffboardError);
  }
  assert.throws(
    () => nextOffboardStatus("active", "close", { isDefault: true }),
    /trung tâm gốc/i,
  );
});

test("không tạm ngừng hai lần, không đóng hai lần", () => {
  assert.throws(() => nextOffboardStatus("suspended", "suspend"), /đang ở trạng thái Tạm ngừng/);
  assert.throws(() => nextOffboardStatus("closed", "close"), /đã đóng/i);
  assert.throws(() => nextOffboardStatus("closed", "suspend"), /Mở lại trước/);
});

test("chỉ tạm ngừng và đóng mới khoá tài khoản", () => {
  assert.equal(locksAccounts("suspend"), true);
  assert.equal(locksAccounts("close"), true);
  assert.equal(locksAccounts("reopen"), false);
});

test("lý do khoá ghi rõ mã trung tâm và phân biệt tạm ngừng / kết thúc hợp đồng", () => {
  assert.match(lockReasonFor("close", "FR_HUE"), /FR_HUE/);
  assert.match(lockReasonFor("close", "FR_HUE"), /kết thúc/i);
  assert.match(lockReasonFor("suspend", "FR_HUE"), /tạm ngừng/i);
});

test("mọi hành động đều có nhãn và mô tả tiếng Việt", () => {
  for (const a of OFFBOARD_ACTIONS) {
    assert.ok(OFFBOARD_ACTION_VI[a].length > 0);
    assert.ok(OFFBOARD_EFFECT_VI[a].length > 20);
  }
});

/* ------------------------------------------------------------------ */
/* Xác nhận bằng cách gõ lại mã trung tâm                              */
/* ------------------------------------------------------------------ */

test("phải gõ đúng mã trung tâm mới xác nhận được", () => {
  assert.equal(validateOffboardConfirm("FR_HUE", "FR_HUE"), null);
  assert.equal(validateOffboardConfirm("FR_HUE", " fr_hue "), null, "bỏ khoảng trắng, không phân biệt hoa thường");
  assert.match(validateOffboardConfirm("FR_HUE", "") ?? "", /Gõ lại mã trung tâm FR_HUE/);
  assert.match(validateOffboardConfirm("FR_HUE", null) ?? "", /FR_HUE/);
  assert.match(validateOffboardConfirm("FR_HUE", "FR_HUE2") ?? "", /không khớp/);
  assert.match(validateOffboardConfirm("FR_HUE", "SATA") ?? "", /không khớp/);
});

/* ------------------------------------------------------------------ */
/* Mốc giữ dữ liệu                                                     */
/* ------------------------------------------------------------------ */

test("giữ dữ liệu đúng số năm cam kết", () => {
  assert.equal(retentionUntil("2026-09-18", 5), "2031-09-18");
  assert.equal(retentionUntil("2026-09-18", 10), "2036-09-18");
  assert.equal(retentionUntil("2026-09-18T10:30:00.000Z", 1), "2027-09-18");
});

test("29/02 cộng năm không nhuận lùi về 28/02", () => {
  assert.equal(retentionUntil("2028-02-29", 1), "2029-02-28");
  assert.equal(retentionUntil("2028-02-29", 4), "2032-02-29");
});

test("số năm âm hoặc 0 thì mốc giữ dữ liệu là chính ngày đóng", () => {
  assert.equal(retentionUntil("2026-09-18", 0), "2026-09-18");
  assert.equal(retentionUntil("2026-09-18", -3), "2026-09-18");
});

test("ngày đóng không hợp lệ thì báo lỗi tiếng Việt", () => {
  assert.throws(() => retentionUntil("không-phải-ngày", 5), TenantOffboardError);
});

/* ------------------------------------------------------------------ */
/* Tên tệp bàn giao & cảnh báo                                         */
/* ------------------------------------------------------------------ */

test("tên tệp bàn giao gọn, không dấu, không ký tự lạ", () => {
  assert.equal(offboardExportName("FR_HUE", "2026-09-18"), "FR_HUE-ban-giao-2026-09-18.zip");
  assert.equal(offboardExportName(" fr-hue/../ ", "2026-09-18T00:00:00Z"), "FRHUE-ban-giao-2026-09-18.zip");
  assert.equal(offboardExportName("///", "2026-09-18"), "TENANT-ban-giao-2026-09-18.zip");
});

test("cảnh báo trước khi đóng: còn lớp, còn học viên, còn công nợ", () => {
  assert.deepEqual(offboardWarnings({ openClasses: 0, activeStudents: 0, debt: 0, openOrders: 0 }), []);
  const w = offboardWarnings({ openClasses: 3, activeStudents: 42, debt: 12_500_000, openOrders: 7 });
  assert.equal(w.length, 3);
  assert.match(w[0]!, /3 lớp/);
  assert.match(w[1]!, /42 học viên/);
  assert.match(w[2]!, /12\.500\.000đ/);
  assert.match(w[2]!, /7 đơn hàng/);
});

test("việc phải làm sau khi đóng nhắc đúng mã trung tâm và ngày hết hạn giữ dữ liệu", () => {
  const steps = offboardNextSteps("FR_HUE", "2031-09-18");
  assert.ok(steps.length >= 4);
  assert.ok(steps.some((s) => s.includes("FR_HUE")));
  assert.ok(steps.some((s) => s.includes("18/09/2031")));
});
