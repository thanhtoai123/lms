import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOTIFICATION_TYPES, NOTIFICATION_PREFIXES, NOTIFICATION_GROUPS, NOTIFICATION_PRIORITY_VI, NOTIFICATION_PRIORITY_RANK,
  notificationTypeDef, notificationLabel, notificationGroupLabel, priorityFromRank, decideDelivery,
  validateNotificationTypeReason, buildActionAlerts, previousPeriod, marketingReportOverdue,
} from "./notifications.js";
import { ROLES } from "../policy/policy.js";

test("danh mục tối thiểu 25 loại, mã duy nhất, nhóm và vai nhận hợp lệ", () => {
  assert.ok(NOTIFICATION_TYPES.length >= 25, `mới có ${NOTIFICATION_TYPES.length} loại`);
  assert.equal(new Set(NOTIFICATION_PREFIXES).size, NOTIFICATION_TYPES.length);
  for (const t of NOTIFICATION_TYPES) {
    assert.ok(t.label.length > 3, t.prefix);
    assert.ok(t.groupKey in NOTIFICATION_GROUPS, `${t.prefix} nhóm lạ`);
    assert.ok(t.priority in NOTIFICATION_PRIORITY_VI, `${t.prefix} mức lạ`);
    for (const r of t.recipients) assert.ok(ROLES.includes(r), `${t.prefix} có vai lạ ${r}`);
  }
});

test("có các loại bản gốc nêu tên", () => {
  for (const p of ["lead.moi", "class.session_changed", "request.submitted", "shift.brief", "trial.assigned", "action_required"]) {
    assert.ok(notificationTypeDef(p), `thiếu ${p}`);
  }
});

test("nhãn tiếng Việt cho mức ưu tiên", () => {
  assert.equal(NOTIFICATION_PRIORITY_VI.urgent, "Khẩn");
  assert.equal(NOTIFICATION_PRIORITY_VI.normal, "Thường");
  assert.equal(NOTIFICATION_PRIORITY_VI.info, "Tham khảo");
  assert.equal(NOTIFICATION_PRIORITY_RANK.urgent, 1);
  assert.equal(priorityFromRank(1), "urgent");
  assert.equal(priorityFromRank(2), "normal");
  assert.equal(priorityFromRank(5), "info");
});

test("nhãn tra cứu, loại lạ trả về chính mã", () => {
  assert.equal(notificationLabel("lead.moi"), "Lead mới được phân công");
  assert.equal(notificationLabel("khong.co"), "khong.co");
  assert.equal(notificationLabel(null), "Thông báo");
  assert.equal(notificationGroupLabel("finance"), "Tài chính");
  assert.equal(notificationGroupLabel("la"), "la");
});

test("thiếu khai báo thì vẫn gửi in-app nhưng không đẩy", () => {
  const d = decideDelivery("khong.khai.bao", null);
  assert.equal(d.inApp, true);
  assert.equal(d.push, false);
  const none = decideDelivery(null, null, 3);
  assert.equal(none.push, false);
  assert.equal(none.priority, 3);
});

test("cấu hình trong CSDL thắng mặc định danh mục", () => {
  assert.equal(decideDelivery("lead.moi", null).push, true); // mặc định danh mục
  assert.equal(decideDelivery("lead.moi", { prefix: "lead.moi", pushEnabled: false, isActive: true }).push, false);
  assert.equal(decideDelivery("commission.estimated", { prefix: "commission.estimated", pushEnabled: true, isActive: true }).push, true);
  const off = decideDelivery("lead.moi", { prefix: "lead.moi", pushEnabled: true, isActive: false });
  assert.equal(off.push, false);
  assert.equal(off.inApp, true);
});

test("mức ưu tiên lấy theo danh mục, không theo tham số truyền vào", () => {
  assert.equal(decideDelivery("class.session_changed", null, 3).priority, 1);
  assert.equal(decideDelivery("commission.estimated", null, 1).priority, 3);
});

test("đổi danh mục bắt buộc lý do", () => {
  assert.ok(validateNotificationTypeReason(""));
  assert.equal(validateNotificationTypeReason("Giảm ồn cho sale"), null);
});

test("kỳ trước & hạn báo cáo marketing", () => {
  assert.equal(previousPeriod("2026-01-09"), "2025-12");
  assert.equal(previousPeriod("2026-09-18"), "2026-08");
  assert.ok(marketingReportOverdue("2026-09-18"));
  assert.ok(!marketingReportOverdue("2026-09-05"));
});

test("sinh cảnh báo Cần thực hiện đúng câu chữ bản gốc", () => {
  const alerts = buildActionAlerts({
    today: "2026-09-18",
    bankUnallocated: { count: 3, amount: 12_500_000 },
    missingMarketingPeriods: ["2026-08"],
    openMarketingSpendPeriods: ["2026-09", "2026-09"],
  });
  assert.equal(alerts.length, 3);
  assert.match(alerts[0]!.body, /^3 giao dịch \(12\.500\.000 đ\) chưa rót được vào phiếu thu nào — cần đối soát tay$/);
  assert.equal(alerts[1]!.body, "Thiếu báo cáo marketing tháng 2026-08 — đã quá ngày 05");
  assert.equal(alerts[2]!.body, "Chi phí marketing kỳ 2026-09 chưa chốt");
  // khoá chống trùng gắn theo ngày
  for (const a of alerts) assert.ok(a.dedupeKey.endsWith("2026-09-18"));
});

test("không có gì để làm thì không sinh cảnh báo", () => {
  assert.deepEqual(buildActionAlerts({ today: "2026-09-18", bankUnallocated: { count: 0, amount: 0 }, missingMarketingPeriods: [], openMarketingSpendPeriods: [] }), []);
});
