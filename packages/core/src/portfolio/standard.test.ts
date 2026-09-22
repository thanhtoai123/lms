import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PORTFOLIO_STANDARD, standardFromOps, describeStandard, vnDateTime, sheetDeadline, milestoneDeadline, vnDateOf, fmtDeadlineVi,
  deadlineState, deadlineLabel, evaluateSheetCompliance, hasEvidence, sessionEvidenceViolation, portfolioComplianceScore,
  normalizeLevelDescriptors, validateLevelDescriptors, validateCriterion, orderCriteriaWithFocus, CRITERIA_TEMPLATE_ROBOTICS,
  sessionTodoList, SHEET_VIOLATION_CODES, SHEET_VIOLATION_VI, type PortfolioStandard, type SheetForCompliance, type TodoStudent,
} from "./standard.js";
import {
  rubricLevelsFor, buildSessionSnapshot, validateSessionEvaluation, sessionEvaluationReadiness, RUBRIC_LEVELS, type SessionEvalContext,
} from "./rubric.js";
import { OPS_DEFAULTS, OPS_GROUPS, resolveOps, validateOps } from "../system/ops.js";

const std: PortfolioStandard = { ...DEFAULT_PORTFOLIO_STANDARD };
const ctx: SessionEvalContext = {
  date: "2026-09-20", startTime: "09:45:00", sequenceNo: 3, label: "Buổi 3", makeup: false, lessonTitle: "Xe dò line", lessonObjectives: null,
  teacherName: null, className: null, classCode: null, courseName: null, courseCode: null, centerName: null, studentName: "Bé A", studentCode: null,
};

/* --------------------------- Cấu hình chuẩn --------------------------- */

test("chuẩn mặc định giữ đúng hành vi cũ và đọc được từ cấu hình vận hành", () => {
  assert.equal(DEFAULT_PORTFOLIO_STANDARD.remarkMinLength, 30);
  assert.equal(DEFAULT_PORTFOLIO_STANDARD.requireProductNote, false);
  assert.equal(DEFAULT_PORTFOLIO_STANDARD.minEvidenceRatePct, 0);
  assert.equal(DEFAULT_PORTFOLIO_STANDARD.sheetDeadlineHours, 24);
  assert.equal(DEFAULT_PORTFOLIO_STANDARD.requireObjectiveResult, true);
  assert.equal(DEFAULT_PORTFOLIO_STANDARD.milestoneDeadlineDays, 7);
  assert.equal(DEFAULT_PORTFOLIO_STANDARD.blockCompleteWhenMissing, true);
  // Mặc định của cấu hình vận hành trùng mặc định của chuẩn
  assert.deepEqual(standardFromOps(OPS_DEFAULTS), DEFAULT_PORTFOLIO_STANDARD);
  // Khoá cũ sessionRequireEvaluations vẫn là công tắc chặn hoàn tất (giá trị đã lưu còn hiệu lực)
  const eff = resolveOps({ sessionRequireEvaluations: false, remarkMinLength: 50 }, { sheetDeadlineHours: 48, profileMinSheetPct: 80 });
  const s = standardFromOps(eff);
  assert.equal(s.blockCompleteWhenMissing, false);
  assert.equal(s.remarkMinLength, 50);
  assert.equal(s.sheetDeadlineHours, 48, "cơ sở ghi đè được");
  assert.equal(s.profileMinSheetPct, 80);
  assert.ok(OPS_GROUPS["ho-so-hoc-tap"].some((f) => f.key === "sessionRequireEvaluations"));
  assert.ok(!OPS_GROUPS.lop.some((f) => (f.key as string) === "sessionRequireEvaluations"), "khoá cũ chỉ nằm ở một nhóm");
  assert.deepEqual(validateOps("ho-so-hoc-tap", { minEvidenceRatePct: 120 }, "center").length, 1);
  assert.deepEqual(validateOps("ho-so-hoc-tap", { minEvidenceRatePct: 0, remarkMinLength: 0 }, "center"), []);
  assert.ok(describeStandard(std).some((x) => x.includes("30 ký tự")));
});

/* --------------------------- Hạn (Asia/Ho_Chi_Minh) --------------------------- */

test("tính hạn theo giờ Việt Nam (UTC+7), qua nửa đêm và qua tháng", () => {
  assert.equal(vnDateTime("2026-09-20", "17:30:00").toISOString(), "2026-09-20T10:30:00.000Z");
  assert.equal(vnDateTime("2026-09-20", null).toISOString(), "2026-09-20T16:59:00.000Z", "không có giờ → 23:59");
  // Buổi kết thúc 19:30 ngày 30/09, hạn 24 giờ → 19:30 ngày 01/10 giờ VN
  const d = sheetDeadline("2026-09-30", "19:30:00", 24);
  assert.equal(d.toISOString(), "2026-10-01T12:30:00.000Z");
  assert.equal(vnDateOf(d), "2026-10-01");
  assert.equal(fmtDeadlineVi(d), "19:30 01/10");
  // 23:00 giờ VN là 16:00Z — ngày VN vẫn là ngày buổi học dù UTC còn cùng ngày; 01:00 VN là hôm trước ở UTC
  assert.equal(vnDateOf(new Date("2026-09-20T18:00:00Z")), "2026-09-21");
  assert.equal(milestoneDeadline("2026-09-20", 7).toISOString(), "2026-09-27T16:59:00.000Z");
  assert.throws(() => vnDateTime("20/09/2026", "10:00"));
});

test("trạng thái hạn và nhãn còn / quá hạn", () => {
  const dl = new Date("2026-09-21T10:00:00Z");
  assert.equal(deadlineState(dl, new Date("2026-09-21T09:00:00Z")), "pending");
  assert.equal(deadlineState(dl, new Date("2026-09-21T11:00:00Z")), "overdue");
  assert.equal(deadlineState(dl, new Date("2026-09-25T00:00:00Z"), new Date("2026-09-21T10:00:00Z")), "done_on_time", "đúng mốc hạn vẫn là đúng hạn");
  assert.equal(deadlineState(dl, new Date("2026-09-25T00:00:00Z"), new Date("2026-09-21T10:00:01Z")), "done_late");
  assert.equal(deadlineLabel(dl, new Date("2026-09-21T05:00:00Z")), "còn 5 giờ");
  assert.equal(deadlineLabel(dl, new Date("2026-09-24T10:00:00Z")), "quá hạn 3 ngày");
});

/* --------------------------- Tuân thủ một phiếu --------------------------- */

const good: SheetForCompliance = {
  status: "published", missingCriteria: [], objectiveResult: "achieved",
  remark: "Hôm nay con tự sửa được lỗi chương trình và giới thiệu robot rất tự tin.", productNote: "Xe dò line",
  publishedAt: new Date("2026-09-20T12:00:00Z"), deadline: new Date("2026-09-21T10:30:00Z"),
};
const now = new Date("2026-09-25T00:00:00Z");

test("phiếu đủ chuẩn, đúng hạn → không vi phạm", () => {
  const r = evaluateSheetCompliance(good, std, now);
  assert.deepEqual(r.violations, []);
  assert.equal(r.compliant, true);
  assert.equal(r.due, true);
});

test("vi phạm có mã + câu tiếng Việt: chưa có phiếu, nhận xét ngắn, thiếu sản phẩm, trễ hạn", () => {
  const none = evaluateSheetCompliance({ ...good, status: null, publishedAt: null }, std, now);
  assert.deepEqual(none.violations.map((v) => v.code), ["no_sheet", "overdue"]);
  assert.equal(none.contentOk, false);
  assert.equal(none.due, true, "quá hạn thì tính vào tỷ lệ");

  const short = evaluateSheetCompliance({ ...good, remark: "Con ngoan" }, std, now);
  assert.deepEqual(short.violations.map((v) => v.code), ["remark_short"]);
  assert.match(short.violations[0]!.message, /9\/30 ký tự/);
  assert.equal(short.onTime, true);
  assert.equal(short.compliant, false);

  const strict = { ...std, requireProductNote: true, remarkMinLength: 0 };
  const noProduct = evaluateSheetCompliance({ ...good, productNote: "  " }, strict, now);
  assert.deepEqual(noProduct.violations.map((v) => v.code), ["product_missing"]);

  const late = evaluateSheetCompliance({ ...good, publishedAt: new Date("2026-09-22T00:00:00Z") }, std, now);
  assert.deepEqual(late.violations.map((v) => v.code), ["late"]);
  assert.equal(late.contentOk, true);
  assert.equal(late.onTime, false);
  assert.match(late.violations[0]!.message, /hạn 17:30 21\/09/);

  const draft = evaluateSheetCompliance({ ...good, status: "draft", missingCriteria: ["Lắp ráp"], objectiveResult: null, publishedAt: null }, std, new Date("2026-09-20T12:00:00Z"));
  assert.deepEqual(draft.violations.map((v) => v.code), ["criteria_missing", "objective_missing", "not_published"]);
  assert.equal(draft.due, false, "chưa tới hạn → chưa tính vào tỷ lệ");
  assert.match(draft.violations[0]!.message, /Chưa chấm Lắp ráp/);

  const noObjOk = evaluateSheetCompliance({ ...good, objectiveResult: null }, { ...std, requireObjectiveResult: false }, now);
  assert.deepEqual(noObjOk.violations, [], "tắt bắt buộc mục tiêu bài");
  for (const c of SHEET_VIOLATION_CODES) assert.ok(SHEET_VIOLATION_VI[c].length > 0);
});

test("bằng chứng: ảnh hoặc sản phẩm; tỷ lệ buổi theo ngưỡng", () => {
  assert.equal(hasEvidence({ mediaCount: 0, productNote: "" }), false);
  assert.equal(hasEvidence({ mediaCount: 1, productNote: null }), true);
  assert.equal(hasEvidence({ mediaCount: 0, productNote: "Robot gắp bóng" }), true);
  assert.equal(sessionEvidenceViolation({ present: 10, withEvidence: 0 }, std), null, "ngưỡng 0 = không bắt");
  const s = { ...std, minEvidenceRatePct: 60 };
  assert.equal(sessionEvidenceViolation({ present: 10, withEvidence: 6 }, s), null);
  assert.match(sessionEvidenceViolation({ present: 10, withEvidence: 5 }, s) ?? "", /5\/10.*60%/);
});

/* --------------------------- Điểm đạt chuẩn hồ sơ --------------------------- */

test("điểm đạt chuẩn hồ sơ: trọng số, ngưỡng, bỏ phần không có dữ liệu", () => {
  const full = portfolioComplianceScore({ sheetsDue: 20, sheetsContentOk: 19, sheetsOnTime: 18, sessions: 10, sessionsEvidenceOk: 10, milestonesDue: 1, milestonesOnTime: 1 }, std);
  assert.equal(full.sheetPct, 95);
  assert.equal(full.onTimePct, 90);
  assert.equal(full.evidencePct, null, "không bắt bằng chứng thì không tính");
  assert.equal(full.milestonePct, 100);
  assert.equal(full.score, Math.round((95 * 50 + 90 * 20 + 100 * 15) / 85));
  assert.equal(full.meetsStandard, true);
  const low = portfolioComplianceScore({ sheetsDue: 10, sheetsContentOk: 8, sheetsOnTime: 10, sessions: 5, sessionsEvidenceOk: 5, milestonesDue: 0, milestonesOnTime: 0 }, std);
  assert.equal(low.meetsStandard, false, "80% < ngưỡng 90%");
  const lateMs = portfolioComplianceScore({ sheetsDue: 10, sheetsContentOk: 10, sheetsOnTime: 10, sessions: 0, sessionsEvidenceOk: 0, milestonesDue: 2, milestonesOnTime: 1 }, std);
  assert.equal(lateMs.meetsStandard, true, "đạt chuẩn tính theo phiếu buổi");
  assert.equal(lateMs.milestoneLate, true, "còn học bạ mốc chưa viết đúng hạn");
  assert.equal(lateMs.milestonePct, 50);
  assert.equal(full.milestoneLate, false);
  const empty = portfolioComplianceScore({ sheetsDue: 0, sheetsContentOk: 0, sheetsOnTime: 0, sessions: 0, sessionsEvidenceOk: 0, milestonesDue: 0, milestonesOnTime: 0 }, std);
  assert.equal(empty.score, null);
  assert.equal(empty.meetsStandard, false);
  const withEv = portfolioComplianceScore({ sheetsDue: 4, sheetsContentOk: 4, sheetsOnTime: 4, sessions: 4, sessionsEvidenceOk: 2, milestonesDue: 0, milestonesOnTime: 0 }, { ...std, minEvidenceRatePct: 50 });
  assert.equal(withEv.evidencePct, 50);
});

/* --------------------------- Mô tả 4 mức, trọng tâm --------------------------- */

test("kiểm tra 4 mô tả mức: đủ 4, không trùng, đủ dài, ngôn từ tích cực; bỏ trống cả 4 là hợp lệ", () => {
  assert.deepEqual(validateLevelDescriptors(null), []);
  assert.deepEqual(validateLevelDescriptors(["", " ", "", ""]), []);
  assert.deepEqual(validateLevelDescriptors(CRITERIA_TEMPLATE_ROBOTICS[0]!.levelDescriptors), []);
  assert.match(validateLevelDescriptors(["Mức một rõ ràng", "Mức hai rõ ràng", "Mức ba rõ ràng"])[0]!, /đúng 4/);
  assert.ok(validateLevelDescriptors(["Mức một rõ ràng", "", "Mức ba rõ ràng", "Mức bốn rõ ràng"]).some((e) => /mức 2/.test(e)));
  assert.ok(validateLevelDescriptors(["Giống nhau", "Giống nhau", "Mức ba rõ ràng", "Mức bốn rõ ràng"]).some((e) => /khác nhau/.test(e)));
  assert.ok(validateLevelDescriptors(["abc", "Mức hai rõ ràng", "Mức ba rõ ràng", "Mức bốn rõ ràng"]).some((e) => /quá ngắn/.test(e)));
  assert.ok(validateLevelDescriptors(["Bé còn kém phần này", "Mức hai rõ ràng", "Mức ba rõ ràng", "Mức bốn rõ ràng"]).some((e) => /tích cực/.test(e)));
  assert.deepEqual(normalizeLevelDescriptors([" a ", "b", "c", "d"]), ["a", "b", "c", "d"]);
  assert.equal(normalizeLevelDescriptors(["a", "b", "c"]), null);
  assert.equal(normalizeLevelDescriptors(["a", "b", "c", 4]), null);
  assert.equal(normalizeLevelDescriptors({}), null);
  assert.ok(validateCriterion({ name: "ab" }).length > 0);
  assert.deepEqual(validateCriterion({ name: "Lắp ráp", groupName: "Thiết kế & lắp ráp", levelDescriptors: null }), []);
});

test("bộ mẫu robotics: 6–8 tiêu chí, 3 nhóm, mỗi tiêu chí đủ 4 mô tả mức hợp lệ", () => {
  assert.ok(CRITERIA_TEMPLATE_ROBOTICS.length >= 6 && CRITERIA_TEMPLATE_ROBOTICS.length <= 8);
  assert.equal(new Set(CRITERIA_TEMPLATE_ROBOTICS.map((c) => c.groupName)).size, 3);
  assert.equal(new Set(CRITERIA_TEMPLATE_ROBOTICS.map((c) => c.name)).size, CRITERIA_TEMPLATE_ROBOTICS.length);
  for (const c of CRITERIA_TEMPLATE_ROBOTICS) assert.deepEqual(validateCriterion(c), [], c.name);
});

test("mô tả mức khai riêng thắng mô tả theo từ khoá; bản chụp giữ nhóm + trọng tâm", () => {
  const own = ["Một một một", "Hai hai hai", "Ba ba ba", "Bốn bốn bốn"];
  assert.deepEqual(rubricLevelsFor("Tư duy lập trình", own).map((l) => l.hint), own);
  assert.match(rubricLevelsFor("Tư duy lập trình", ["x"])[3]!.hint, /vòng lặp/, "sai hình dạng → dùng mô tả theo từ khoá");
  assert.equal(rubricLevelsFor("Lạ", null)[0]!.hint, RUBRIC_LEVELS[0]!.hint);
  const snap = buildSessionSnapshot({
    criteria: orderCriteriaWithFocus([
      { id: "a", name: "Lắp ráp", group: "Thiết kế & lắp ráp" },
      { id: "b", name: "Lập trình", levelDescriptors: own },
    ], ["b"]),
    context: ctx,
  });
  assert.deepEqual(snap.criteria.map((c) => c.key), ["b", "a"]);
  assert.equal(snap.criteria[0]!.focus, true);
  assert.equal(snap.criteria[0]!.levels[2]!.hint, "Ba ba ba");
  assert.equal(snap.criteria[1]!.group, "Thiết kế & lắp ráp");
  assert.equal("focus" in snap.criteria[1]!, false, "không trọng tâm thì không ghi cờ");
});

test("sắp xếp tiêu chí trọng tâm: lên đầu, giữ thứ tự gốc; bài không khai trọng tâm giữ nguyên", () => {
  const c = [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }, { id: null }];
  assert.deepEqual(orderCriteriaWithFocus(c, ["4", "2"]).map((x) => x.id), ["2", "4", "1", "3", null]);
  assert.deepEqual(orderCriteriaWithFocus(c, []).map((x) => [x.id, x.focus]), [["1", false], ["2", false], ["3", false], ["4", false], [null, false]]);
  assert.deepEqual(orderCriteriaWithFocus(c, ["khong-co"]).map((x) => x.id), ["1", "2", "3", "4", null]);
});

/* --------------------------- Điều kiện phát hành theo chuẩn --------------------------- */

test("điều kiện phát hành đọc theo chuẩn: mặc định như cũ; tắt mục tiêu bài; bắt sản phẩm", () => {
  const snap = buildSessionSnapshot({ criteria: [{ id: "a", name: "Lắp ráp" }], scores: { a: 3 }, context: ctx });
  assert.deepEqual(validateSessionEvaluation({ mode: "publish", snapshot: snap }), ["chưa chọn kết quả mục tiêu bài"], "mặc định như trước");
  assert.deepEqual(validateSessionEvaluation({ mode: "publish", snapshot: snap, requirement: { requireObjectiveResult: false } }), []);
  assert.deepEqual(validateSessionEvaluation({ mode: "publish", snapshot: snap, objectiveResult: "achieved", requirement: { requireProductNote: true } }), ["chưa ghi sản phẩm của buổi"]);
  assert.deepEqual(validateSessionEvaluation({ mode: "draft", snapshot: snap, requirement: { requireProductNote: true } }), [], "nháp không bắt");
  const r = sessionEvaluationReadiness([
    { name: "Bé A", attendanceStatus: "present", evaluation: { status: "draft", snapshot: snap, objectiveResult: "achieved", productNote: "" } },
  ], { requireProductNote: true });
  assert.equal(r.ready, 0);
  assert.match(r.missing[0]!.reason, /sản phẩm/);
  assert.equal(sessionEvaluationReadiness([
    { name: "Bé A", attendanceStatus: "present", evaluation: { status: "draft", snapshot: snap, objectiveResult: "achieved" } },
  ]).ready, 1, "không truyền chuẩn → hành vi cũ");
});

/* --------------------------- Danh mục "Buổi này cần hoàn thiện" --------------------------- */

test("danh mục việc cần xong: x/y, tên học viên còn thiếu, vắng không tính", () => {
  const base: Omit<TodoStudent, "id" | "name"> = { attendance: "present", published: false, scores: { a: 3, b: 4 }, objectiveResult: "achieved", remark: "x".repeat(40), productNote: "", mediaCount: 1 };
  const students: TodoStudent[] = [
    { id: "1", name: "An", ...base },
    { id: "2", name: "Bình", ...base, scores: { a: 3 }, remark: "ngắn", mediaCount: 0 },
    { id: "3", name: "Chi", ...base, attendance: "absent_excused", scores: {} },
    { id: "4", name: "Dũng", ...base, attendance: null, objectiveResult: null },
    { id: "5", name: "Én", ...base, published: true, scores: {}, objectiveResult: null },
  ];
  const t = sessionTodoList({ students, criteriaKeys: ["a", "b"], hasSessionNote: false, standard: { ...std, minEvidenceRatePct: 80 } });
  const by = Object.fromEntries(t.map((x) => [x.key, x]));
  assert.deepEqual([by.attendance!.done, by.attendance!.total], [4, 5]);
  assert.deepEqual(by.attendance!.missing.map((m) => m.name), ["Dũng"]);
  assert.deepEqual([by.criteria!.done, by.criteria!.total], [3, 4], "HV vắng không tính; phiếu đã phát hành tính là xong");
  assert.deepEqual(by.criteria!.missing.map((m) => m.name), ["Bình"]);
  assert.deepEqual(by.objective!.missing.map((m) => m.name), ["Dũng"]);
  assert.deepEqual(by.remark!.missing.map((m) => m.name), ["Bình"]);
  assert.equal(by.remark!.required, false, "độ dài nhận xét chỉ tính vào tỷ lệ, không chặn");
  assert.deepEqual([by.evidence!.done, by.evidence!.total, by.evidence!.ok], [3, 4, false], "75% < 80%");
  assert.equal(by.product, undefined, "không bắt sản phẩm thì không hiện mục");
  assert.equal(by.note!.ok, false);
  assert.equal(by.note!.target, "note");
  const t2 = sessionTodoList({ students, criteriaKeys: ["a"], hasSessionNote: true, standard: { ...std, requireObjectiveResult: false, remarkMinLength: 0, requireProductNote: true } });
  assert.equal(t2.find((x) => x.key === "objective"), undefined);
  assert.equal(t2.find((x) => x.key === "remark"), undefined);
  assert.equal(t2.find((x) => x.key === "product")!.done, 0);
  assert.equal(t2.find((x) => x.key === "evidence")!.ok, true, "ngưỡng 0 → luôn đạt");
});
