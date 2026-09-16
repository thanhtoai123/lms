import { test } from "node:test";
import assert from "node:assert/strict";
import { runRules } from "./automation.js";

test("session.completed → thông báo phụ huynh", () => {
  const r = runRules({ type: "session.completed", sessionId: "s1", classId: "c1", date: "2026-09-16", teacherId: null });
  assert.equal(r.length, 1);
  assert.equal(r[0]!.actions[0]!.kind, "notify_parent");
});

test("risk.detected → việc chăm sóc + báo CSKH; severity 1 hạn 24h", () => {
  const r = runRules({ type: "risk.detected", studentId: "st", enrollmentId: "en", code: "CONSECUTIVE_ABSENCE", severity: 1, detail: "Nghỉ 2 buổi liên tiếp" });
  const a = r.flatMap((x) => x.actions);
  const task = a.find((x) => x.kind === "create_care_task");
  assert.ok(task && task.kind === "create_care_task" && task.dueInHours === 24);
  assert.ok(a.some((x) => x.kind === "notify_user"));
});

test("SLA breach dưới 60 phút không escalate", () => {
  assert.equal(runRules({ type: "lead.sla_breached", leadId: "l", status: "new", overdueMinutes: 30 }).length, 0);
  assert.equal(runRules({ type: "lead.sla_breached", leadId: "l", status: "new", overdueMinutes: 90 }).length, 1);
});

test("lead.status_changed chỉ bắt khi sang trial_done", () => {
  assert.equal(runRules({ type: "lead.status_changed", leadId: "l", from: "new", to: "contacted", actorId: null }).length, 0);
  assert.equal(runRules({ type: "lead.status_changed", leadId: "l", from: "trial_scheduled", to: "trial_done", actorId: null }).length, 1);
});
