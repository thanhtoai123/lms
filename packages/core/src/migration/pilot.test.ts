import { test } from "node:test";
import assert from "node:assert/strict";
import { pushEndpointAllowed, validPushKeys, pushPayload, pushResultKind, pilotFbTransition, pilotFbOverdue, adoptionChecks, recentWeeks } from "./pilot.js";
import { cutoverBlockers, CUTOVER_CHECKLIST } from "./rules.js";

test("web push: endpoint, khoá, nội dung", () => {
  assert.equal(pushEndpointAllowed("https://fcm.googleapis.com/fcm/send/abc"), true);
  assert.equal(pushEndpointAllowed("https://updates.push.services.mozilla.com/wpush/v2/x"), true);
  assert.equal(pushEndpointAllowed("https://wns2-par02p.notify.windows.com/w/?token=x"), true);
  assert.equal(pushEndpointAllowed("https://web.push.apple.com/abc"), true);
  assert.equal(pushEndpointAllowed("https://evil.com/fcm.googleapis.com"), false);
  assert.equal(pushEndpointAllowed("https://fcm.googleapis.com.evil.com/x"), false);
  assert.equal(pushEndpointAllowed("http://fcm.googleapis.com/x"), false);
  assert.equal(pushEndpointAllowed("https://fcm.googleapis.com:8443/x"), false);
  assert.equal(pushEndpointAllowed("http://localhost:3000/api/dev/push-sink"), false);
  assert.equal(pushEndpointAllowed("http://localhost:3000/api/dev/push-sink", { allowLocal: true }), true);
  assert.equal(pushEndpointAllowed("http://10.0.0.1/x", { allowLocal: true }), false);
  assert.equal(validPushKeys({ p256dh: "B".repeat(87), auth: "a".repeat(22) }), true);
  assert.equal(validPushKeys({ p256dh: "B".repeat(20), auth: "a".repeat(22) }), false);
  assert.equal(validPushKeys({ p256dh: "B".repeat(87), auth: "a+b/".repeat(6) }), false);
  const p = pushPayload({ title: "", body: "x ".repeat(200), link: "https://evil.com", template: "MESSAGE_NEW", id: "12345678-aaaa" });
  assert.equal(p.title, "Sata Robo");
  assert.equal(p.body.length, 160);
  assert.equal(p.url, "/ph/tin-nhan");
  assert.equal(pushPayload({ title: "a", body: "b", link: "/ph/tin-nhan?id=1", template: "X", id: "1" }).url, "/ph/tin-nhan?id=1");
  assert.equal(pushPayload({ title: "a", body: "b", link: "/phx", template: "X", id: "1" }).url, "/ph/thong-bao");
  assert.deepEqual([201, 404, 410, 429, 503, 400].map(pushResultKind), ["ok", "gone", "gone", "retry", "retry", "fail"]);
});

test("phản hồi pilot", () => {
  assert.deepEqual(pilotFbTransition("open", "in_progress", null), []);
  assert.equal(pilotFbTransition("open", "resolved", "ngắn").length, 1);
  assert.deepEqual(pilotFbTransition("in_progress", "resolved", "Đã sửa quyền kế toán"), []);
  assert.equal(pilotFbTransition("resolved", "in_progress", null).length, 1);
  const now = new Date("2026-09-17T10:00:00Z");
  assert.equal(pilotFbOverdue({ status: "open", severity: "high", createdAt: new Date("2026-09-17T05:00:00Z") }, now), true);
  assert.equal(pilotFbOverdue({ status: "open", severity: "medium", createdAt: new Date("2026-09-17T05:00:00Z") }, now), false);
  assert.equal(pilotFbOverdue({ status: "resolved", severity: "high", createdAt: new Date("2026-09-01T05:00:00Z") }, now), false);
  const all = Object.fromEntries(CUTOVER_CHECKLIST.map((c) => [c.key, true]));
  const base = { stage: "live" as const, checklist: all, streak: 5, parallelDays: 5, openIssues: 0 };
  assert.deepEqual(cutoverBlockers(base, "legacy_readonly"), []);
  assert.ok(cutoverBlockers({ ...base, openHighFeedback: 2 }, "legacy_readonly")[0]!.includes("phản hồi pilot"));
  assert.ok(cutoverBlockers({ ...base, stage: "parallel", openHighFeedback: 1 }, "live").some((x) => x.includes("phản hồi pilot")));
});

test("mức độ sử dụng", () => {
  const r = adoptionChecks({ sessionsDone: 20, sessionsOnTime: 19, paymentsConfirmed: 10, paymentsAuto: 5, invoicesDue: 0, invoicesIssued: 0, parentsTotal: 40, parentsActive: 30, otpTotal: 10, otpSent: 10, messagesTotal: 20, messagesFailed: 2 });
  const m = Object.fromEntries(r.map((x) => [x.key, x]));
  assert.equal(m.attendanceOnTime!.ok, true);
  assert.equal(m.autoMatch!.ok, false);
  assert.equal(m.invoiceCoverage!.rate, null);
  assert.equal(m.parentActive!.rate, 0.75);
  assert.equal(m.messageDelivery!.ok, false);
  assert.deepEqual(recentWeeks("2026-09-17", 3), ["2026-08-31", "2026-09-07", "2026-09-14"]);
  assert.deepEqual(recentWeeks("2026-09-14", 1), ["2026-09-14"]);
  assert.deepEqual(recentWeeks("2026-09-20", 1), ["2026-09-14"]);
});
