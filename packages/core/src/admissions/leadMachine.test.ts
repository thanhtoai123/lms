import { test } from "node:test";
import assert from "node:assert/strict";
import {
  leadTransition, computeSla, pickAssignee, pickAssigneeByMode, normalizeVnPhone, maskPhone, LeadTransitionError, leadEventsFor, LEAD_STATUSES, OPEN_LEAD_STATUSES,
  checkDropReason, leadNextStates, MANUAL_LEAD_EVENTS, DEFAULT_ADMISSIONS_POLICY,
} from "./leadMachine.js";

test("luồng chuẩn: new → contacted → trial_scheduled → trial_done → enrolled", () => {
  let s = leadTransition("new", "contact");
  s = leadTransition(s, "schedule_trial");
  s = leadTransition(s, "trial_attended");
  s = leadTransition(s, "enroll");
  assert.equal(s, "enrolled");
});

test("no-show quay về nuôi dưỡng; enrolled là trạng thái cuối", () => {
  assert.equal(leadTransition("trial_scheduled", "trial_no_show"), "nurturing");
  assert.throws(() => leadTransition("enrolled", "lose"), LeadTransitionError);
  assert.deepEqual(leadEventsFor("lost"), ["reopen", "contact"]);
});

test("SLA: lead mới quá 15 phút là overdue, gần hạn là warning", () => {
  const t0 = "2026-09-16T08:00:00Z";
  assert.equal(computeSla("new", t0, "2026-09-16T08:20:00Z").level, "overdue");
  assert.equal(computeSla("new", t0, "2026-09-16T08:13:00Z").level, "warning");
  assert.equal(computeSla("new", t0, "2026-09-16T08:02:00Z").level, "ok");
  assert.equal(computeSla("enrolled", t0, "2026-12-01T00:00:00Z").level, "ok");
  assert.equal(computeSla("new", t0, "2026-09-16T09:00:00Z").overdueMinutes, 45);
});

test("phân bổ chọn sale ít lead mở nhất và đang khả dụng", () => {
  assert.equal(pickAssignee([{ id: "a", openLeads: 5, isAvailable: true }, { id: "b", openLeads: 2, isAvailable: true }, { id: "c", openLeads: 0, isAvailable: false }]), "b");
  assert.equal(pickAssignee([{ id: "c", openLeads: 0, isAvailable: false }]), null);
});

test("chuẩn hoá và che SĐT", () => {
  assert.equal(normalizeVnPhone("0905 123 456"), "84905123456");
  assert.equal(normalizeVnPhone("+84 905123456"), "84905123456");
  assert.equal(normalizeVnPhone("905123456"), "84905123456");
  assert.equal(normalizeVnPhone("12"), null);
  assert.equal(maskPhone("84905123456"), "8490xxx3456");
});

test("Đang học thử: hẹn → bắt đầu → đã học thử; có thể chốt ngay khi đang học thử", () => {
  assert.equal(LEAD_STATUSES.length, 10);
  assert.ok(OPEN_LEAD_STATUSES.includes("trial_in_progress"));
  const s = leadTransition("trial_scheduled", "start_trial");
  assert.equal(s, "trial_in_progress");
  assert.equal(leadTransition(s, "trial_attended"), "trial_done");
  assert.equal(leadTransition(s, "enroll"), "enrolled");
  assert.equal(leadTransition(s, "trial_no_show"), "nurturing");
  assert.equal(computeSla("trial_in_progress", "2026-09-16T08:00:00Z", "2026-09-20T08:00:00Z").level, "overdue");
});

test("chia lead luân phiên: ít lượt nhất, tie → lâu chưa nhận", () => {
  const base = { isAvailable: true, openLeads: 0, totalAssigned: 0, converted: 0 };
  assert.equal(pickAssigneeByMode("round_robin", [
    { id: "a", roundsReceived: 3, lastAssignedAt: "2026-09-16T08:00:00Z", ...base },
    { id: "b", roundsReceived: 2, lastAssignedAt: "2026-09-16T09:00:00Z", ...base },
    { id: "c", roundsReceived: 2, lastAssignedAt: "2026-09-16T07:00:00Z", ...base },
  ]), "c");
  assert.equal(pickAssigneeByMode("round_robin", [{ id: "a", roundsReceived: 0, lastAssignedAt: null, ...base, isAvailable: false }]), null);
});

test("chia lead theo tỷ lệ chốt (làm trơn): sale chốt tốt được ưu tiên, sale mới vẫn có cơ hội", () => {
  const base = { isAvailable: true, roundsReceived: 0, lastAssignedAt: null };
  assert.equal(pickAssigneeByMode("by_conversion", [
    { id: "a", openLeads: 5, totalAssigned: 20, converted: 10, ...base }, // 11/22 = 0.5
    { id: "b", openLeads: 2, totalAssigned: 20, converted: 4, ...base }, // 5/22
    { id: "new", openLeads: 0, totalAssigned: 0, converted: 0, ...base }, // 1/2 = 0.5 → tie với a, ít lead mở hơn
  ]), "new");
  assert.equal(pickAssigneeByMode("manual", [{ id: "a", openLeads: 0, totalAssigned: 0, converted: 0, ...base }]), null);
});

test("lý do bắt buộc 3–500 ký tự khi nuôi dưỡng / mất; hệ thống tự chuyển thì không cần", () => {
  assert.throws(() => leadTransition("contacted", "lose"), /lý do/);
  assert.throws(() => leadTransition("contacted", "nurture", { reason: " ab " }), LeadTransitionError);
  assert.throws(() => leadTransition("contacted", "lose", { reason: "x".repeat(501) }), /500/);
  assert.equal(leadTransition("contacted", "lose", { reason: "Học phí cao" }), "lost");
  assert.equal(leadTransition("deciding", "nurture", { reason: "Chưa sắp được lịch" }), "nurturing");
  assert.equal(leadTransition("deciding", "nurture", { requireReason: false }), "nurturing");
  assert.equal(leadTransition("trial_scheduled", "trial_no_show"), "nurturing");
  assert.deepEqual(checkDropReason("  ok!  "), { ok: true, reason: "ok!" });
  assert.equal(checkDropReason(null).ok, false);
});

test("cạnh bổ sung theo bản gốc", () => {
  assert.equal(leadTransition("new", "consult"), "consulting");
  assert.equal(leadTransition("contacted", "await_decision"), "deciding");
  assert.equal(leadTransition("nurturing", "await_decision"), "deciding");
  assert.equal(leadTransition("trial_done", "nurture", { reason: "Hẹn tháng sau" }), "nurturing");
  assert.equal(leadTransition("lost", "contact"), "contacted");
  assert.equal(leadTransition("deciding", "schedule_trial"), "trial_scheduled");
});

test("ô chọn trạng thái không có 'Ghi danh'; đánh dấu sự kiện cần lý do / giờ học thử", () => {
  const next = leadNextStates("trial_done");
  assert.ok(!next.some((n) => (n.event as string) === "enroll"));
  assert.deepEqual(next.find((n) => n.event === "lose"), { event: "lose", to: "lost", needsReason: true, needsTrialAt: false });
  assert.equal(leadNextStates("contacted").find((n) => n.event === "schedule_trial")?.needsTrialAt, true);
  assert.deepEqual(leadNextStates("enrolled"), []);
  assert.ok(!(MANUAL_LEAD_EVENTS as readonly string[]).includes("enroll"));
  assert.equal(DEFAULT_ADMISSIONS_POLICY.dedupeDays, 0);
});
