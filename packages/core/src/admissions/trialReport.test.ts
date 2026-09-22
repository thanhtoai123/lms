import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRIAL_REPORT_TEMPLATE, TRIAL_READINESS, TRIAL_READINESS_VI, TRIAL_REPORT_STATUSES, TRIAL_REPORT_STATUS_VI, TRIAL_REPORT_TOKEN_RE,
  TRIAL_REPORT_SHARE_DAYS_DEFAULT, TRIAL_REPORT_SHARE_DAYS_MAX, TRIAL_REPORT_COMMENT_MIN,
  snapshotAnswers, applyValues, answerValues, missingCriteria, isTrialReportAnswers, summarizeLevels, levelIndex,
  validateTrialReport, trialReportCode, trialReportCodePrefix, nextTrialReportSeq, clampShareDays, shareExpiresAt,
  shareLinkState, isShareLinkUsable, trialReportPath, trialReportShareMessage,
  type TrialReportTemplate,
} from "./trialReport.js";

const ALL_TOP: Record<string, number> = { grasp: 3, speed: 3, computer: 3, focus: 3, communication: 3, presentation: 3, interest: 3 };
const LONG = "Bé lắp xong xe robot và tự giải thích cách chạy.";

test("mẫu mặc định: 3 nhóm, 7 tiêu chí, mọi thang có thứ tự tăng dần và ngôn từ tích cực", () => {
  const groups = TRIAL_REPORT_TEMPLATE.groups;
  assert.deepEqual(groups.map((g) => g.key), ["tech", "soft", "interest"]);
  const criteria = groups.flatMap((g) => g.criteria);
  assert.equal(criteria.length, 7);
  assert.equal(new Set(criteria.map((c) => c.key)).size, criteria.length, "khoá tiêu chí không được trùng");
  for (const c of criteria) {
    assert.equal(c.levels.length, 3, c.key);
    const values = c.levels.map((l) => l.value);
    assert.deepEqual(values, [...values].sort((a, b) => a - b), `${c.key}: thang phải tăng dần`);
    for (const l of c.levels) assert.doesNotMatch(l.label, /chưa tốt/i, "không dùng nhãn nặng nề");
  }
  const labels = (k: string) => criteria.find((c) => c.key === k)!.levels.map((l) => l.label);
  assert.deepEqual(labels("grasp"), ["Cần hỗ trợ thêm", "Khá", "Tốt"]);
  assert.deepEqual(labels("speed"), ["Cần thêm thời gian", "Vừa", "Nhanh"]);
  assert.deepEqual(labels("interest"), ["Đang làm quen", "Thích", "Rất thích"]);
});

test("nhãn trạng thái và kết quả đủ tiếng Việt", () => {
  assert.deepEqual([...TRIAL_READINESS], ["ready", "one_more_trial", "not_yet"]);
  assert.equal(TRIAL_READINESS_VI.ready, "Sẵn sàng vào học chính thức");
  for (const s of TRIAL_REPORT_STATUSES) assert.ok(TRIAL_REPORT_STATUS_VI[s].length > 0);
});

test("snapshot chụp cả mẫu lẫn giá trị; giá trị lạ bị bỏ", () => {
  const a = snapshotAnswers(TRIAL_REPORT_TEMPLATE, { grasp: 3, speed: 9, focus: 1, bogus: 2 });
  assert.equal(a.templateVersion, TRIAL_REPORT_TEMPLATE.version);
  const flat = a.groups.flatMap((g) => g.criteria);
  assert.equal(flat.find((c) => c.key === "grasp")!.value, 3);
  assert.equal(flat.find((c) => c.key === "speed")!.value, null, "9 không thuộc thang");
  assert.equal(flat.find((c) => c.key === "computer")!.value, null);
  assert.ok(!flat.some((c) => c.key === "bogus"));
  assert.equal(flat.find((c) => c.key === "speed")!.levels[2]!.label, "Nhanh");
  assert.ok(isTrialReportAnswers(a));
  assert.ok(!isTrialReportAnswers({ groups: "x" }));
  assert.ok(!isTrialReportAnswers(null));
});

test("đổi mẫu sau khi lưu không làm đổi phiếu cũ", () => {
  const template: TrialReportTemplate = {
    version: "cu",
    groups: [{ key: "g", title: "Nhóm cũ", kind: "skill", criteria: [{ key: "x", label: "Tiêu chí cũ", levels: [{ value: 1, label: "Thấp" }, { value: 2, label: "Cao" }] }] }],
  };
  const saved = snapshotAnswers(template, { x: 2 });
  // Sửa mẫu ở chỗ khác (giả lập đổi cấu hình)
  (template.groups[0]!.criteria[0]!.levels as { value: number; label: string }[])[1]!.label = "Nhãn mới";
  assert.equal(saved.groups[0]!.criteria[0]!.levels[1]!.label, "Cao");
  // Sửa giá trị trên bản chụp cũ giữ nguyên thang cũ
  const edited = applyValues(saved, { x: 1, khac: 3 });
  assert.equal(edited.templateVersion, "cu");
  assert.equal(edited.groups[0]!.criteria[0]!.value, 1);
  assert.equal(edited.groups[0]!.criteria[0]!.levels[1]!.label, "Cao");
  assert.deepEqual(answerValues(edited), { x: 1 });
  // Không truyền khoá → giữ giá trị cũ
  assert.equal(applyValues(saved, {}).groups[0]!.criteria[0]!.value, 2);
});

test("tóm tắt: đếm theo mức, bỏ qua mức độ yêu thích", () => {
  const a = snapshotAnswers(TRIAL_REPORT_TEMPLATE, { grasp: 3, speed: 3, computer: 2, focus: 3, communication: 3, presentation: 3, interest: 1 });
  const s = summarizeLevels(a);
  assert.equal(s.total, 6);
  assert.equal(s.answered, 6);
  assert.deepEqual(s.byLevel, [0, 1, 5]);
  assert.equal(s.top, 5);
  assert.equal(s.headline, "5/6 tiêu chí đạt mức Tốt");
  const empty = summarizeLevels(snapshotAnswers(TRIAL_REPORT_TEMPLATE, {}));
  assert.equal(empty.answered, 0);
  assert.equal(empty.headline, "");
  assert.equal(summarizeLevels(null).total, 0);
  const speed = a.groups[0]!.criteria[1]!;
  assert.equal(levelIndex(speed), 2);
  assert.equal(levelIndex({ levels: speed.levels, value: null }), -1);
});

test("validate: bản nháp cho thiếu, phát hành phải đủ", () => {
  const blank = snapshotAnswers(TRIAL_REPORT_TEMPLATE, {});
  assert.deepEqual(validateTrialReport({ mode: "draft", answers: blank }), []);
  const errs = validateTrialReport({ mode: "publish", answers: blank });
  assert.ok(errs.some((e) => e.startsWith("Chưa chấm 7 tiêu chí")));
  assert.ok(errs.some((e) => e.includes(`${TRIAL_REPORT_COMMENT_MIN} ký tự`)));
  assert.ok(errs.includes("Chọn kết quả đánh giá"));

  const full = snapshotAnswers(TRIAL_REPORT_TEMPLATE, ALL_TOP);
  assert.deepEqual(validateTrialReport({ mode: "publish", answers: full, growth: LONG, readiness: "one_more_trial" }), []);
  // Nhận xét quá ngắn (khoảng trắng không tính)
  assert.ok(validateTrialReport({ mode: "publish", answers: full, strengths: "   Giỏi lắm        ", readiness: "not_yet" }).length === 1);
  // Sẵn sàng học chính thức → bắt buộc khoá đề xuất
  assert.deepEqual(validateTrialReport({ mode: "publish", answers: full, productNote: LONG, readiness: "ready" }), ["Bé sẵn sàng vào học chính thức — hãy chọn khoá học đề xuất"]);
  assert.deepEqual(validateTrialReport({ mode: "publish", answers: full, productNote: LONG, readiness: "ready", recommendedCourseId: "c1" }), []);
});

test("validate: trần độ dài áp cả bản nháp", () => {
  const blank = snapshotAnswers(TRIAL_REPORT_TEMPLATE, {});
  const e = validateTrialReport({ mode: "draft", answers: blank, strengths: "a".repeat(1001), recommendationNote: "b".repeat(301), recommendedLevel: "c".repeat(61) });
  assert.equal(e.length, 3);
  assert.ok(validateTrialReport({ mode: "draft", answers: blank, readiness: "khac" as never }).includes("Kết quả đánh giá không hợp lệ"));
});

test("mã phiếu PDG-<cơ sở>-<yy>-<6 số> và số kế tiếp theo max", () => {
  assert.equal(trialReportCode("cs1", 2026, 123), "PDG-CS1-26-000123");
  assert.equal(trialReportCodePrefix("CS2", 2027), "PDG-CS2-27-");
  const codes = ["PDG-CS1-26-000001", "PDG-CS1-26-000041", "PDG-CS2-26-000900", "PDG-CS1-25-000077", "khac", null];
  assert.equal(nextTrialReportSeq(codes, "CS1", 2026), 42);
  assert.equal(nextTrialReportSeq(codes, "CS2", 2026), 901);
  assert.equal(nextTrialReportSeq([], "HUE1", 2026), 1);
});

test("hạn link: mặc định 90 ngày, kẹp trong khoảng cho phép", () => {
  assert.equal(clampShareDays(undefined), TRIAL_REPORT_SHARE_DAYS_DEFAULT);
  assert.equal(clampShareDays(Number.NaN), TRIAL_REPORT_SHARE_DAYS_DEFAULT);
  assert.equal(clampShareDays(0), 1);
  assert.equal(clampShareDays(10_000), TRIAL_REPORT_SHARE_DAYS_MAX);
  const from = new Date("2026-09-01T00:00:00Z");
  assert.equal(shareExpiresAt(from).toISOString(), "2026-11-30T00:00:00.000Z");
  assert.equal(shareExpiresAt(from, 7).toISOString(), "2026-09-08T00:00:00.000Z");
});

test("link dùng được: đã phát hành + chưa hết hạn + chưa thu hồi", () => {
  const now = new Date("2026-09-22T10:00:00Z");
  const ok = { status: "published" as const, shareToken: "t".repeat(43), shareExpiresAt: new Date("2026-10-01T00:00:00Z"), revokedAt: null };
  assert.equal(shareLinkState(ok, now), "ok");
  assert.ok(isShareLinkUsable(ok, now));
  assert.equal(shareLinkState({ ...ok, shareExpiresAt: "2026-09-22T10:00:00Z" }, now), "expired");
  assert.equal(shareLinkState({ ...ok, status: "revoked" }, now), "revoked");
  assert.equal(shareLinkState({ ...ok, revokedAt: now }, now), "revoked");
  assert.equal(shareLinkState({ ...ok, status: "draft" }, now), "not_published");
  assert.equal(shareLinkState({ ...ok, shareToken: null }, now), "not_published");
  assert.equal(shareLinkState({ ...ok, shareExpiresAt: null }, now), "ok");
  assert.ok(!isShareLinkUsable({ ...ok, status: "draft" }, now));
});

test("token, đường dẫn và tin nhắn Zalo soạn sẵn", () => {
  assert.ok(TRIAL_REPORT_TOKEN_RE.test("A".repeat(43)));
  assert.ok(!TRIAL_REPORT_TOKEN_RE.test("ngan"));
  assert.ok(!TRIAL_REPORT_TOKEN_RE.test(`${"a".repeat(40)}/../x`));
  assert.equal(trialReportPath("abc"), "/pdg/abc");
  assert.equal(trialReportShareMessage("Bé Giang", "https://x/pdg/abc"), "Sata Robo gửi anh/chị kết quả buổi học thử của bé Giang: https://x/pdg/abc");
  assert.equal(trialReportShareMessage(null, "L"), "Sata Robo gửi anh/chị kết quả buổi học thử của bé nhà mình: L");
});
