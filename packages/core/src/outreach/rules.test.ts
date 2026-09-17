import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateJob, jobTransition, candidateTransition, validateApplication, validateInterview, validateScore, jobCode, jobSlug,
  replyWindow, validateMessage, messageFlags, responseStats, responsePairs, maskExternalId,
  normalizeRefCode, suggestRefCode, validateAffiliate, rewardAmount, rewardTransition, readWithin, pilotVerdict,
} from "./rules.js";

test("tuyển dụng: tin và chuyển trạng thái", () => {
  assert.equal(validateJob({ title: "Giáo viên Robotics", description: "Dạy lập trình robot cho học sinh tiểu học tại cơ sở", openings: 2, salaryMin: 8e6, salaryMax: 12e6, deadline: "2026-10-01", today: "2026-09-17" }).length, 0);
  assert.equal(validateJob({ title: "GV", description: "ngắn", openings: 0, salaryMin: 9, salaryMax: 1, deadline: "2026-09-01", today: "2026-09-17" }).length, 5);
  assert.equal(jobTransition("draft", "open", { today: "2026-09-17" }), "open");
  assert.throws(() => jobTransition("draft", "paused", { today: "2026-09-17" }));
  assert.throws(() => jobTransition("closed", "open", { deadline: "2026-09-01", today: "2026-09-17" }));
  assert.equal(jobCode(2026, 4), "TD26-004");
  assert.equal(jobSlug("Giáo viên Robotics (Hà Đông)", "TD26-004"), "giao-vien-robotics-ha-dong-td26-004");
});

test("tuyển dụng: ứng viên", () => {
  assert.equal(candidateTransition("applied", "screening", { interviewsScored: 0 }), "screening");
  assert.throws(() => candidateTransition("applied", "hired", { interviewsScored: 0 }));
  assert.throws(() => candidateTransition("interview", "offer", { interviewsScored: 0 }));
  assert.equal(candidateTransition("interview", "offer", { interviewsScored: 1 }), "offer");
  assert.throws(() => candidateTransition("screening", "rejected", { interviewsScored: 0 }));
  assert.equal(candidateTransition("screening", "rejected", { reason: "Chưa đủ kinh nghiệm", interviewsScored: 0 }), "rejected");
  assert.throws(() => candidateTransition("hired", "rejected", { reason: "xxxxx", interviewsScored: 1 }));
  assert.equal(validateApplication({ fullName: "Nguyễn Văn A", phone: "0912 345 678", consent: true }).length, 0);
  assert.equal(validateApplication({ fullName: "A", phone: "123", email: "x@", consent: false }).length, 4);
  const now = new Date("2026-09-17T02:00:00Z");
  assert.equal(validateInterview({ scheduledAt: new Date("2026-09-18T02:00:00Z"), durationMin: 45, now }).length, 0);
  assert.equal(validateInterview({ scheduledAt: new Date("2026-09-16T02:00:00Z"), durationMin: 5, now }).length, 2);
  assert.equal(validateScore({ score: 4, result: "pass", feedback: "Dạy thử tốt, giao tiếp rõ" }).length, 0);
  assert.equal(validateScore({ score: 6, result: "pass", feedback: "ok" }).length, 2);
});

test("hội thoại: cửa sổ trả lời theo kênh", () => {
  const now = new Date("2026-09-17T12:00:00Z");
  const h = (n: number) => new Date(now.getTime() - n * 3600e3);
  assert.deepEqual(replyWindow("portal", null, now), { allowed: true, tag: null, expiresAt: null });
  assert.equal(replyWindow("messenger", null, now).allowed, false);
  const m1 = replyWindow("messenger", h(3), now);
  assert.ok(m1.allowed && m1.tag === null);
  const m2 = replyWindow("messenger", h(30), now);
  assert.ok(m2.allowed && m2.tag === "HUMAN_AGENT");
  assert.equal(replyWindow("messenger", h(24 * 8), now).allowed, false);
  assert.ok(replyWindow("zalo", h(24 * 6), now).allowed);
  assert.equal(replyWindow("zalo", h(24 * 8), now).allowed, false);
  assert.equal(validateMessage("  ").length, 1);
  assert.equal(validateMessage("x".repeat(2001)).length, 1);
  assert.deepEqual(messageFlags("Tôi muốn khiếu nại và đòi hoàn tiền"), ["complaint", "refund"]);
  assert.deepEqual(messageFlags("Chị chuyển khoản vào số tài khoản cá nhân của cô nhé"), ["private_payment"]);
  assert.deepEqual(messageFlags("Cảm ơn cô"), []);
  assert.equal(maskExternalId("1234567890"), "123…890");
});

test("hội thoại: thống kê phản hồi", () => {
  const t = (m: number) => new Date(Date.UTC(2026, 8, 17, 1, m));
  const pairs = responsePairs([
    { direction: "in", at: t(0) }, { direction: "in", at: t(5) }, { direction: "note", at: t(6) }, { direction: "out", at: t(20) },
    { direction: "out", at: t(21) }, { direction: "in", at: t(30) }, { direction: "out", at: t(130) }, { direction: "in", at: t(200) },
  ]);
  assert.equal(pairs.length, 3);
  assert.equal(pairs[0]!.inboundAt.getTime(), t(0).getTime());
  const s = responseStats(pairs, t(300));
  assert.deepEqual(s, { total: 3, answered: 2, medianMin: 60, withinSla: 50, waiting: 1, waitingOverSla: 1 });
  assert.equal(responseStats([], t(0)).medianMin, null);
});

test("nguồn giới thiệu", () => {
  assert.equal(normalizeRefCode(" ph-an 01 "), "PHAN01");
  assert.equal(normalizeRefCode("ab"), null);
  assert.equal(suggestRefCode("Nguyễn Thị Hoa", 7), "NTH007");
  assert.equal(suggestRefCode("Đạt", 12), "DAT012");
  assert.equal(validateAffiliate({ name: "Trường TH A", code: "THA01", type: "partner", rule: { kind: "percent", value: 10, cap: 500000 } }).length, 0);
  assert.equal(validateAffiliate({ name: "A", phone: "12", code: "x", type: "partner", rule: { kind: "percent", value: 50 } }).length, 4);
  assert.equal(rewardAmount({ kind: "fixed", value: 300000 }, 5_000_000), 300000);
  assert.equal(rewardAmount({ kind: "percent", value: 10, cap: 400000 }, 5_000_000), 400000);
  assert.equal(rewardAmount({ kind: "percent", value: 5 }, 3_333_000), 167000);
  assert.equal(rewardTransition("pending", "approve", {}), "approved");
  assert.throws(() => rewardTransition("pending", "pay", { paymentRef: "UNC01" }));
  assert.throws(() => rewardTransition("approved", "pay", { paymentRef: "" }));
  assert.throws(() => rewardTransition("approved", "pay", { paymentRef: "UNC01", sameUserAsApprover: true }));
  assert.equal(rewardTransition("approved", "pay", { paymentRef: "UNC01" }), "paid");
  assert.throws(() => rewardTransition("paid", "cancel", { reason: "Nhầm lẫn" }));
  assert.equal(rewardTransition("approved", "cancel", { reason: "Học viên hoàn tiền" }), "cancelled");
});

test("pilot chat", () => {
  const c = new Date("2026-09-10T00:00:00Z");
  assert.ok(readWithin(c, new Date("2026-09-11T23:00:00Z")));
  assert.ok(!readWithin(c, new Date("2026-09-12T01:00:00Z")));
  assert.ok(!readWithin(c, null));
  assert.deepEqual(pilotVerdict({ activation: 80, engaged: 60, read48h: 90, withinSla: null }), { pass: true, misses: [] });
  assert.equal(pilotVerdict({ activation: 40, engaged: 60, read48h: 70, withinSla: 50 }).misses.length, 3);
});
