import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RUBRIC_LEVELS, RUBRIC_SCALE, DEFAULT_HIGHLIGHTS, OBJECTIVE_RESULTS, OBJECTIVE_RESULT_VI, scoreLabel, rubricLevelsFor,
  buildSessionSnapshot, applySessionScores, rebaseSnapshot, snapshotScores, missingSessionCriteria, sessionAverage, isSessionEvalSnapshot,
  validateSessionEvaluation, sessionEvaluationReadiness, evaluationBlockerMessage, isEvaluableAttendance, sanitizeHighlights, highlightOptions,
  copyScoresToAll, sessionCriteriaFrom, DEFAULT_SESSION_CRITERIA,
  type SessionEvalContext,
} from "./rubric.js";
import {
  round1, mean, trendOf, normalizeTo5, milestonePeriod, aggregateMilestone, suggestMilestoneComment, isMilestoneAggregate,
  type EvalForAggregate,
} from "./aggregate.js";
import {
  validatePortfolioScope, normalizePortfolioScope, inPortfolioScope, portfolioScopeLabel, clampPortfolioShareDays, portfolioShareExpiresAt,
  portfolioShareState, portfolioPath, PORTFOLIO_TOKEN_RE, PORTFOLIO_SHARE_DAYS_DEFAULT, portfolioShareMessage,
} from "./share.js";
import { progressSeries, bucketSeries, lineChart, radarChart, polarPoint } from "./chart.js";
import { tallyAttendance, sumAttendance, pairSheets } from "./view.js";
import { completionBlockers, completionChecklist, type CompletionInput } from "../sessions/stateMachine.js";
import { validateReportCard } from "../reportcards/rules.js";
import { OPS_DEFAULTS } from "../system/ops.js";
import { rateLimitFor } from "../security/rateLimit.js";

const ctx: SessionEvalContext = {
  date: "2026-09-20", startTime: "09:45:00", sequenceNo: 7, label: "Buổi 7", makeup: false,
  lessonTitle: "Robot tránh vật cản", lessonObjectives: "Dùng cảm biến siêu âm để dừng robot", teacherName: "Cô Mẫu",
  className: "Sata4 sáng CN", classCode: "CS1.SATA4.26.001", courseName: "Sata4", courseCode: "SATA4", centerName: "Cơ sở 1",
  studentName: "Học viên mẫu 1", studentCode: "CS1-26-000001",
};
const crit = [
  { id: "c1", name: "Tư duy lập trình", description: "Viết chương trình điều khiển robot" },
  { id: "c2", name: "Lắp ráp & cơ khí" },
  { id: "c3", name: "Làm việc nhóm" },
];

/* ------------------------------ Rubric ------------------------------ */

test("rubric 4 mức có thứ tự, ngôn từ tích cực, mỗi mức có mô tả", () => {
  assert.equal(RUBRIC_SCALE, 4);
  assert.deepEqual(RUBRIC_LEVELS.map((l) => l.value), [1, 2, 3, 4]);
  assert.deepEqual(RUBRIC_LEVELS.map((l) => l.label), ["Đang làm quen", "Cần hỗ trợ", "Đạt", "Vượt mong đợi"]);
  for (const l of RUBRIC_LEVELS) {
    assert.ok(l.hint.length > 10, "mỗi mức phải có mô tả");
    assert.doesNotMatch(l.label, /kém|chưa tốt|yếu/i);
  }
  const prog = rubricLevelsFor("Tư duy lập trình");
  assert.equal(prog.length, 4);
  assert.match(prog[3]!.hint, /vòng lặp/);
  assert.equal(rubricLevelsFor("Tiêu chí lạ")[0]!.hint, RUBRIC_LEVELS[0]!.hint, "không khớp từ khoá → mô tả chung");
  assert.equal(scoreLabel(4), "Vượt mong đợi");
  assert.equal(scoreLabel(5, 5), "Xuất sắc");
  assert.equal(scoreLabel(null), "Chưa chấm");
  assert.equal(OBJECTIVE_RESULTS.length, 3);
  assert.ok(OBJECTIVE_RESULTS.every((o) => OBJECTIVE_RESULT_VI[o].length > 0));
});

test("snapshot chụp tiêu chí + mô tả mức + điểm + bối cảnh; điểm ngoài thang bị bỏ", () => {
  const s = buildSessionSnapshot({ criteria: crit, scores: { c1: 3, c2: 9, c3: 2.5, bogus: 4 }, context: ctx, now: new Date("2026-09-20T05:00:00Z") });
  assert.equal(s.scale, 4);
  assert.equal(s.criteria.length, 3);
  assert.equal(s.criteria[0]!.value, 3);
  assert.equal(s.criteria[1]!.value, null, "9 ngoài thang");
  assert.equal(s.criteria[2]!.value, null, "không nhận số lẻ");
  assert.equal(s.criteria[0]!.description, "Viết chương trình điều khiển robot");
  assert.equal(s.criteria[0]!.levels.length, 4);
  assert.equal(s.context.lessonTitle, "Robot tránh vật cản");
  assert.equal(s.takenAt, "2026-09-20T05:00:00.000Z");
  assert.ok(isSessionEvalSnapshot(s));
  assert.ok(!isSessionEvalSnapshot({ version: "x", criteria: "no", context: {} }));
  assert.ok(!isSessionEvalSnapshot(null));
  assert.deepEqual(missingSessionCriteria(s), ["Lắp ráp & cơ khí", "Làm việc nhóm"]);
});

test("khoá chưa cấu hình tiêu chí → dùng bộ tiêu chí mặc định", () => {
  const c = sessionCriteriaFrom([]);
  assert.equal(c.length, DEFAULT_SESSION_CRITERIA.length);
  const s = buildSessionSnapshot({ criteria: [], scores: { "mac-dinh:lap-trinh": 4 }, context: ctx });
  assert.equal(s.criteria.find((x) => x.key === "mac-dinh:lap-trinh")!.value, 4);
  assert.equal(s.criteria.every((x) => x.criterionId === null), true);
});

test("đổi tiêu chí sau khi phát hành không làm đổi phiếu cũ; phát hành chụp lại bối cảnh mới nhưng giữ điểm", () => {
  const src = [{ id: "c1", name: "Tư duy lập trình" }];
  const saved = buildSessionSnapshot({ criteria: src, scores: { c1: 4 }, context: ctx });
  src[0]!.name = "Tên mới";
  assert.equal(saved.criteria[0]!.label, "Tư duy lập trình");
  const fresh = buildSessionSnapshot({ criteria: [{ id: "c1", name: "Tư duy lập trình" }, { id: "c9", name: "Tiêu chí mới" }], context: { ...ctx, lessonTitle: "Bài đã xác nhận" } });
  const re = rebaseSnapshot(saved, fresh);
  assert.equal(re.context.lessonTitle, "Bài đã xác nhận");
  assert.deepEqual(snapshotScores(re), { c1: 4, c9: null });
  assert.equal(rebaseSnapshot(null, fresh), fresh);
  const upd = applySessionScores(saved, { c1: 2 });
  assert.equal(upd.criteria[0]!.value, 2);
  assert.equal(saved.criteria[0]!.value, 4, "không sửa bản chụp gốc");
  assert.equal(applySessionScores(saved, {}).criteria[0]!.value, 4, "khoá không gửi thì giữ nguyên");
});

test("điểm trung bình phiếu, thẻ nổi bật chỉ nhận danh sách cho phép", () => {
  const s = buildSessionSnapshot({ criteria: crit, scores: { c1: 4, c2: 3, c3: 3 }, context: ctx });
  assert.equal(sessionAverage(s), 3.3);
  assert.equal(sessionAverage(buildSessionSnapshot({ criteria: crit, context: ctx })), null);
  assert.deepEqual(sanitizeHighlights(["Sáng tạo", "Lạ", "Sáng tạo", " Kiên trì "]), ["Sáng tạo", "Kiên trì"]);
  assert.equal(DEFAULT_HIGHLIGHTS.length, 6);
  assert.deepEqual(highlightOptions(null), [...DEFAULT_HIGHLIGHTS]);
  assert.deepEqual(highlightOptions(["A", "A", " ", 3, "B"]), ["A", "B"]);
});

/* ---------------------- Điều kiện phát hành buổi ---------------------- */

test("kiểm tra phiếu: nháp cho thiếu, phát hành cần đủ tiêu chí + mục tiêu bài", () => {
  const partial = buildSessionSnapshot({ criteria: crit, scores: { c1: 3 }, context: ctx });
  assert.deepEqual(validateSessionEvaluation({ mode: "draft", snapshot: partial }), []);
  const errs = validateSessionEvaluation({ mode: "publish", snapshot: partial });
  assert.equal(errs.length, 2);
  assert.match(errs[0]!, /Lắp ráp/);
  assert.match(errs[1]!, /mục tiêu bài/);
  const full = buildSessionSnapshot({ criteria: crit, scores: { c1: 3, c2: 3, c3: 4 }, context: ctx });
  assert.deepEqual(validateSessionEvaluation({ mode: "publish", snapshot: full, objectiveResult: "achieved" }), []);
  assert.equal(validateSessionEvaluation({ mode: "draft", snapshot: full, remark: "x".repeat(1001) }).length, 1);
});

test("điều kiện hoàn tất buổi: HV vắng không cần phiếu, HV có mặt thiếu phiếu bị nêu tên", () => {
  const full = buildSessionSnapshot({ criteria: crit, scores: { c1: 3, c2: 3, c3: 4 }, context: ctx });
  const half = buildSessionSnapshot({ criteria: crit, scores: { c1: 3 }, context: ctx });
  const r = sessionEvaluationReadiness([
    { name: "An", attendanceStatus: "present", evaluation: { status: "draft", snapshot: full, objectiveResult: "achieved" } },
    { name: "Bình", attendanceStatus: "late", evaluation: { status: "draft", snapshot: half, objectiveResult: null } },
    { name: "Chi", attendanceStatus: "absent_excused", evaluation: null },
    { name: "Dũng", attendanceStatus: "makeup", evaluation: null },
    { name: "Em", attendanceStatus: "present", evaluation: { status: "published", snapshot: full, objectiveResult: "partial" } },
  ]);
  assert.equal(r.required, 4);
  assert.equal(r.ready, 2);
  assert.deepEqual(r.missing.map((m) => m.name), ["Bình", "Dũng"]);
  const msg = evaluationBlockerMessage(r)!;
  assert.match(msg, /2 học viên/);
  assert.match(msg, /Bình/);
  assert.match(msg, /Dũng \(chưa có phiếu\)/);
  assert.equal(evaluationBlockerMessage({ required: 1, ready: 1, missing: [] }), null);
  assert.equal(isEvaluableAttendance("absent_unexcused"), false);
  assert.equal(isEvaluableAttendance("makeup"), true);
});

test("hoàn tất buổi bị chặn khi thiếu phiếu (mặc định), cấu hình vận hành cho phép bỏ chặn", () => {
  const base: CompletionInput = { enrolledCount: 3, attendanceCount: 3, lessonConfirmed: true, hasSessionNote: true, presentWithoutRemark: 0, requireRemarks: true, mediaCount: 0, requireMedia: false, checklistMissing: [] };
  assert.deepEqual(completionBlockers(base), [], "không truyền thông tin phiếu → như cũ");
  const miss = "Chưa đủ phiếu nhận xét cho 1 học viên có mặt: Bình (chưa có phiếu)";
  assert.deepEqual(completionBlockers({ ...base, evaluationsMissing: miss, evaluationsReady: { ready: 2, required: 3 } }), [miss]);
  assert.deepEqual(completionBlockers({ ...base, evaluationsMissing: miss, requireEvaluations: false }), []);
  const step = completionChecklist({ ...base, evaluationsMissing: null, evaluationsReady: { ready: 3, required: 3 } }).find((s) => s.key === "evaluations");
  assert.equal(step?.done, true);
  assert.equal(OPS_DEFAULTS.sessionRequireEvaluations, true, "mặc định: chặn");
});

test("chép mức cho cả lớp không đụng nhận xét riêng", () => {
  type D = { scores: Record<string, number | null>; objectiveResult: "achieved" | "partial" | "not_yet" | null; remark: string };
  const all: Record<string, D> = { a: { scores: { c1: 1 }, objectiveResult: null, remark: "A" }, b: { scores: {}, objectiveResult: "partial", remark: "B" } };
  const out = copyScoresToAll({ scores: { c1: 3, c2: 4 }, objectiveResult: "achieved" }, all);
  assert.deepEqual(out.a!.scores, { c1: 3, c2: 4 });
  assert.equal(out.b!.objectiveResult, "achieved");
  assert.equal(out.b!.remark, "B");
  const only = copyScoresToAll({ scores: { c1: 2 }, objectiveResult: "not_yet" }, all, ["b"]);
  assert.deepEqual(only.a!.scores, { c1: 1 });
});

/* ------------------------ Học bạ mốc tự tổng hợp ------------------------ */

const ev = (date: string, seq: number, scores: Record<string, number | null>, extra: Partial<EvalForAggregate> = {}): EvalForAggregate => ({
  date, sequenceNo: seq, scores, objectiveResult: "achieved", highlights: [], remark: null, ...extra,
});

test("làm tròn, trung bình, xu hướng với ngưỡng ±0,3, quy thang 5", () => {
  assert.equal(round1(3.25), 3.3);
  assert.equal(round1(2.349999), 2.3);
  assert.equal(mean([3, 4, null, 4]), 3.7);
  assert.equal(mean([]), null);
  assert.equal(trendOf(3.3, 3.0), "up");
  assert.equal(trendOf(3.2, 3.0), "flat");
  assert.equal(trendOf(2.7, 3.0), "down");
  assert.equal(trendOf(2.8, 3.0), "flat");
  assert.equal(trendOf(3, null), null);
  assert.equal(normalizeTo5(4), 5);
  assert.equal(normalizeTo5(1), 1);
  assert.equal(normalizeTo5(3), 3.7);
  assert.equal(normalizeTo5(4, 5), 4);
});

test("giai đoạn của mốc: từ sau mốc trước đến mốc này, kèm giai đoạn trước", () => {
  assert.deepEqual(milestonePeriod([5, 12, 17, 24], 5), { fromSeq: 1, toSeq: 5, previous: null });
  assert.deepEqual(milestonePeriod([5, 12, 17, 24], 12), { fromSeq: 6, toSeq: 12, previous: { fromSeq: 1, toSeq: 5 } });
  assert.deepEqual(milestonePeriod([24, 5, 12, 17], 17), { fromSeq: 13, toSeq: 17, previous: { fromSeq: 6, toSeq: 12 } });
});

test("tổng hợp học bạ mốc: trung bình, xu hướng, bỏ tiêu chí trống, mục tiêu bài, thẻ nổi bật, gợi ý nhận xét", () => {
  const criteria = [{ key: "c1", criterionId: "c1", label: "Tư duy lập trình" }, { key: "c2", criterionId: "c2", label: "Lắp ráp" }, { key: "c3", criterionId: "c3", label: "Thuyết trình" }];
  const previous = [ev("2026-08-01", 1, { c1: 2, c2: 3 }), ev("2026-08-08", 2, { c1: 3, c2: 3 })];
  const current = [
    ev("2026-08-22", 7, { c1: 3, c2: 3 }, { highlights: ["Sáng tạo", "Kiên trì"], remark: "Con lắp nhanh", objectiveResult: "partial" }),
    ev("2026-08-15", 6, { c1: 3, c2: 2 }, { highlights: ["Sáng tạo"], remark: "Con hỏi nhiều", productNote: "Xe dò line" }),
    ev("2026-08-29", 8, { c1: 4, c2: 3 }, { highlights: ["Giúp đỡ bạn", "Sáng tạo"], remark: "Con lắp nhanh" }),
  ];
  const a = aggregateMilestone({
    criteria, current, previous, attendance: { attended: 3, total: 4, absent: 1, excused: 0, makeup: 0 }, period: { fromSeq: 6, toSeq: 12 }, now: new Date("2026-09-01T00:00:00Z"),
  });
  const c1 = a.criteria.find((c) => c.key === "c1")!;
  assert.equal(c1.average, 3.3);
  assert.equal(c1.previousAverage, 2.5);
  assert.equal(c1.trend, "up");
  assert.equal(c1.suggested, 3);
  assert.equal(c1.count, 3);
  const c2 = a.criteria.find((c) => c.key === "c2")!;
  assert.equal(c2.average, 2.7);
  assert.equal(c2.trend, "down");
  const c3 = a.criteria.find((c) => c.key === "c3")!;
  assert.equal(c3.average, null, "không có dữ liệu");
  assert.equal(c3.suggested, null);
  assert.equal(c3.trend, null);
  assert.equal(a.overall.average, 3, "điểm chung bỏ qua tiêu chí trống: (3.3 + 2.7) / 2");
  assert.equal(a.sessions, 3);
  assert.deepEqual(a.period, { fromSeq: 6, toSeq: 12, fromDate: "2026-08-15", toDate: "2026-08-29" });
  assert.deepEqual(a.objective, { achieved: 2, partial: 1, notYet: 0, rate: 0.67 });
  assert.deepEqual(a.topHighlights[0], { label: "Sáng tạo", count: 3 });
  assert.deepEqual(a.remarkSuggestions, ["Con lắp nhanh", "Con hỏi nhiều"], "mới nhất trước, bỏ trùng");
  assert.deepEqual(a.products, ["Xe dò line"]);
  assert.ok(isMilestoneAggregate(a));
  const text = suggestMilestoneComment(a, "Học viên mẫu 1");
  assert.match(text, /buổi 6–12/);
  assert.match(text, /3\/4 buổi/);
  assert.match(text, /Tiến bộ rõ ở Tư duy lập trình/);
  assert.match(text, /sáng tạo/);
});

test("tổng hợp khi không có phiếu nào: không lỗi, mọi số null", () => {
  const a = aggregateMilestone({ criteria: [{ key: "c1", criterionId: null, label: "X" }], current: [], attendance: { attended: 0, total: 0, absent: 0, excused: 0, makeup: 0 }, period: { fromSeq: 1, toSeq: 5 } });
  assert.equal(a.overall.average, null);
  assert.equal(a.objective.rate, null);
  assert.deepEqual(a.topHighlights, []);
});

test("học bạ mốc mới chấm theo thang 4; học bạ cũ giữ thang 5", () => {
  const scores = [{ criterionId: "a", score: 4 }, { criterionId: "b", score: 3 }];
  assert.deepEqual(validateReportCard({ scores, activeCriteria: ["a", "b"], comment: "Con tiến bộ rõ, tập trung tốt trong giờ.", scale: 4 }), []);
  assert.match(validateReportCard({ scores: [{ criterionId: "a", score: 5 }], activeCriteria: ["a"], comment: "Con tiến bộ rõ, tập trung tốt trong giờ.", scale: 4 })[0]!, /1 đến 4/);
  assert.deepEqual(validateReportCard({ scores: [{ criterionId: "a", score: 5 }], activeCriteria: ["a"], comment: "Con tiến bộ rõ, tập trung tốt trong giờ." }), []);
});

/* ---------------------------- Chia sẻ ---------------------------- */

test("phạm vi chia sẻ: toàn bộ / một khoá / khoảng ngày", () => {
  assert.deepEqual(validatePortfolioScope({ scope: "all" }), []);
  assert.equal(validatePortfolioScope({ scope: "course" }).length, 1);
  assert.equal(validatePortfolioScope({ scope: "range", from: "2026-09-01", to: "2026-08-01" }).length, 1);
  assert.equal(validatePortfolioScope({ scope: "range", from: "x" }).length, 2);
  assert.deepEqual(validatePortfolioScope({ scope: "bogus" as "all" }), ["Phạm vi chia sẻ không hợp lệ"]);
  assert.deepEqual(normalizePortfolioScope({ scope: "all", enrollmentId: "e1", from: "2026-01-01" }), { scope: "all", enrollmentId: null, from: null, to: null });
  const course = { scope: "course" as const, enrollmentId: "e1" };
  assert.equal(inPortfolioScope({ enrollmentId: "e1", date: "2026-01-01" }, course), true);
  assert.equal(inPortfolioScope({ enrollmentId: "e2", date: "2026-01-01" }, course), false);
  const range = { scope: "range" as const, from: "2026-09-01", to: "2026-09-30" };
  assert.equal(inPortfolioScope({ enrollmentId: "e1", date: "2026-09-30T10:00:00.000Z" }, range), true);
  assert.equal(inPortfolioScope({ enrollmentId: "e1", date: "2026-10-01" }, range), false);
  assert.equal(inPortfolioScope({ enrollmentId: "e1", date: null }, range), false);
  assert.equal(inPortfolioScope({ enrollmentId: "e9", date: null }, { scope: "all" }), true);
  assert.equal(portfolioScopeLabel(range), "Từ 01/09/2026 đến 30/09/2026");
  assert.equal(portfolioScopeLabel(course, "Sata4"), "Khoá Sata4");
});

test("link chia sẻ: hạn mặc định 180 ngày, kẹp trần, thu hồi / hết hạn, định dạng token", () => {
  assert.equal(PORTFOLIO_SHARE_DAYS_DEFAULT, 180);
  assert.equal(clampPortfolioShareDays(undefined), 180);
  assert.equal(clampPortfolioShareDays(9999), 365);
  assert.equal(clampPortfolioShareDays(0), 1);
  const now = new Date("2026-09-22T00:00:00Z");
  const exp = portfolioShareExpiresAt(now);
  assert.equal(Math.round((exp.getTime() - now.getTime()) / 86_400_000), 180);
  assert.equal(portfolioShareState({ expiresAt: exp }, now), "ok");
  assert.equal(portfolioShareState({ expiresAt: now }, now), "expired");
  assert.equal(portfolioShareState({ expiresAt: exp, revokedAt: now }, now), "revoked");
  assert.equal(portfolioShareState({ expiresAt: "khong-phai-ngay" }, now), "expired");
  assert.equal(portfolioPath("abc"), "/hs/abc");
  assert.ok(PORTFOLIO_TOKEN_RE.test("xem-thu-ho-so-hoc-tap-sata-robo-mau"));
  assert.ok(!PORTFOLIO_TOKEN_RE.test("ngan"));
  assert.ok(!PORTFOLIO_TOKEN_RE.test("a".repeat(40) + "/"));
  assert.match(portfolioShareMessage("Học viên mẫu 2", "https://x/hs/t"), /bé Học viên mẫu 2/);
  assert.equal(rateLimitFor("portfolioViewIp").max, 300);
});

/* ---------------------------- Biểu đồ ---------------------------- */

test("dữ liệu biểu đồ tiến bộ: bỏ phiếu chưa chấm, xếp theo ngày, gộp khi quá dài", () => {
  const s = progressSeries([
    { date: "2026-09-10", sequenceNo: 2, average: 3.25 },
    { date: "2026-09-03", sequenceNo: 1, average: 2 },
    { date: "2026-09-17", sequenceNo: 3, average: null },
  ]);
  assert.deepEqual(s.map((p) => p.average), [2, 3.3]);
  assert.equal(s[0]!.label, "03/09");
  const many = Array.from({ length: 50 }, (_, i) => ({ date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`, average: 2, label: "", courseCode: null }));
  assert.ok(bucketSeries(many, 24).length <= 25);
  assert.equal(bucketSeries(s, 24).length, 2);
});

test("toạ độ biểu đồ đường nằm trong khung, điểm cao hơn thì y nhỏ hơn", () => {
  const pts = progressSeries([{ date: "2026-09-01", sequenceNo: 1, average: 1 }, { date: "2026-09-08", sequenceNo: 2, average: 4 }]);
  const c = lineChart(pts, { width: 200, height: 100, pad: 10 });
  assert.equal(c.dots.length, 2);
  assert.equal(c.dots[0]!.cy, 90);
  assert.equal(c.dots[1]!.cy, 10);
  assert.equal(c.dots[0]!.cx, 10);
  assert.equal(c.dots[1]!.cx, 190);
  assert.match(c.path, /^M10 90 L190 10$/);
  assert.equal(c.grid.length, 4);
  const one = lineChart(pts.slice(0, 1), { width: 200, height: 100, pad: 10 });
  assert.equal(one.dots[0]!.cx, 100, "một điểm thì đặt giữa");
  assert.equal(lineChart([]).path, "");
});

test("mạng nhện: đỉnh đầu tiên hướng lên, giá trị tối đa chạm vòng ngoài, thiếu dữ liệu về tâm", () => {
  const p = polarPoint(100, 100, 50, 0, 4);
  assert.deepEqual(p, { x: 100, y: 50 });
  const r = radarChart([{ label: "A", value: 4 }, { label: "B", value: 2 }, { label: "C", value: null }], { size: 200, labelPad: 40 });
  assert.equal(r.points.length, 3);
  assert.deepEqual({ x: r.points[0]!.x, y: r.points[0]!.y }, { x: 100, y: 40 });
  assert.deepEqual({ x: r.points[2]!.x, y: r.points[2]!.y }, { x: 100, y: 100 });
  assert.equal(r.rings.length, 4);
  assert.equal(r.axes[0]!.anchor, "middle");
});

test("chuyên cần hồ sơ và xếp 2 phiếu / trang", () => {
  const t = tallyAttendance(["present", "late", "makeup", "absent_excused", "absent_unexcused", null]);
  assert.deepEqual(t, { present: 1, late: 1, makeup: 1, excused: 1, absent: 1, total: 5, rate: 0.6 });
  assert.equal(sumAttendance([t, t]).total, 10);
  assert.equal(sumAttendance([]).rate, null);
  assert.deepEqual(pairSheets([1, 2, 3]), [[1, 2], [3]]);
});
