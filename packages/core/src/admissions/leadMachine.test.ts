import { test } from "node:test";
import assert from "node:assert/strict";
import { leadTransition, computeSla, pickAssignee, normalizeVnPhone, maskPhone, LeadTransitionError, leadEventsFor } from "./leadMachine.js";

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
  assert.deepEqual(leadEventsFor("lost"), ["reopen"]);
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
