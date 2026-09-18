import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EVAL_ERR, EVAL_FORM_TYPES, EVAL_QUESTION_TYPES, EVAL_UNGROUPED_VI,
  averageByCriteria, evalQuestionIssues, evalRoundAcceptsResponse, evalRoundTransition,
  groupByCriteria, normalizeEvalQuestion, validateEvalForm, validateEvalRound,
  type EvalFormDraft, type EvalQuestionDraft,
} from "./rules.js";

const q = (o: Partial<EvalQuestionDraft> = {}): EvalQuestionDraft => ({ type: "rating", label: "Thầy cô giảng dễ hiểu", ...o });
const form = (o: Partial<EvalFormDraft> = {}): EvalFormDraft => ({ title: "Phiếu đánh giá giáo viên", type: "teacher_eval", questions: [q()], ...o });

test("phiếu hợp lệ thì không lỗi", () => {
  assert.deepEqual(validateEvalForm(form()), []);
});

test("tiêu đề trống và phiếu không câu hỏi", () => {
  const e = validateEvalForm(form({ title: "   ", questions: [] }));
  assert.ok(e.includes(EVAL_ERR.titleEmpty), "Tiêu đề không được trống");
  assert.ok(e.includes(EVAL_ERR.noQuestion), "Form cần ít nhất 1 câu hỏi");
});

test("nội dung câu hỏi không được trống", () => {
  assert.ok(validateEvalForm(form({ questions: [q({ label: "  " })] })).includes(EVAL_ERR.labelEmpty));
});

test("RADIO/CHECKBOX cần tối thiểu 2 lựa chọn", () => {
  for (const type of ["radio", "checkbox"] as const) {
    assert.ok(validateEvalForm(form({ questions: [q({ type, options: ["Có"] })] })).includes(EVAL_ERR.needTwoOptions), type);
    assert.ok(validateEvalForm(form({ questions: [q({ type, options: [] })] })).includes(EVAL_ERR.needTwoOptions), `${type} rỗng`);
    assert.deepEqual(validateEvalForm(form({ questions: [q({ type, options: ["Có", "Không"] })] })), []);
  }
  // lựa chọn toàn khoảng trắng bị loại trước khi đếm
  assert.ok(validateEvalForm(form({ questions: [q({ type: "radio", options: ["Có", "   "] })] })).includes(EVAL_ERR.needTwoOptions));
});

test("loại câu hỏi này không có lựa chọn dựng sẵn", () => {
  for (const type of ["rating", "text"] as const) {
    assert.ok(validateEvalForm(form({ questions: [q({ type, options: ["A", "B"] })] })).includes(EVAL_ERR.optionsNotAllowed), type);
  }
});

test("câu 'Tải ảnh' chỉ dùng cho phiếu Đánh giá buổi học", () => {
  for (const type of ["teacher_eval", "center_survey"] as const) {
    assert.ok(validateEvalForm(form({ type, questions: [q({ type: "image", label: "Ảnh sản phẩm của con" })] })).includes(EVAL_ERR.imageOnlySession), type);
  }
  assert.deepEqual(validateEvalForm(form({ type: "session_eval", questions: [q({ type: "image", label: "Ảnh sản phẩm của con" })] })), []);
});

test("lựa chọn trùng nhau bị bắt", () => {
  assert.ok(validateEvalForm(form({ questions: [q({ type: "radio", options: ["Tốt", "Tốt", "Khá"] })] })).includes(EVAL_ERR.duplicateOption));
});

test("lỗi không lặp lại khi nhiều câu cùng sai", () => {
  const e = validateEvalForm(form({ questions: [q({ label: "" }), q({ label: "" }), q({ label: "" })] }));
  assert.equal(e.filter((x) => x === EVAL_ERR.labelEmpty).length, 1);
});

test("evalQuestionIssues soi từng câu", () => {
  assert.deepEqual(evalQuestionIssues(q(), "teacher_eval"), []);
  assert.deepEqual(evalQuestionIssues(q({ type: "checkbox", label: "", options: ["A"] }), "teacher_eval"), [EVAL_ERR.labelEmpty, EVAL_ERR.needTwoOptions]);
});

test("normalize cắt khoảng trắng, bỏ lựa chọn rỗng, nhóm tiêu chí trống thành null", () => {
  const n = normalizeEvalQuestion({ type: "radio", label: "  Hỏi  ", options: [" A ", "", "B"], criteriaGroup: "   " });
  assert.equal(n.label, "Hỏi");
  assert.deepEqual(n.options, ["A", "B"]);
  assert.equal(n.criteriaGroup, null);
  assert.equal(n.required, false);
  assert.equal(normalizeEvalQuestion({ type: "text", label: "x" }).options, null);
});

test("gom câu hỏi theo nhóm tiêu chí, giữ thứ tự, nhóm trống là Chung", () => {
  const g = groupByCriteria([
    { criteriaGroup: "Kiến thức", n: 1 },
    { criteriaGroup: null, n: 2 },
    { criteriaGroup: "Kiến thức", n: 3 },
    { criteriaGroup: "  Thái độ ", n: 4 },
  ]);
  assert.deepEqual(g.map((x) => x.group), ["Kiến thức", EVAL_UNGROUPED_VI, "Thái độ"]);
  assert.deepEqual(g[0]!.items.map((x) => x.n), [1, 3]);
});

test("enum đủ 3 loại phiếu và 5 loại câu hỏi", () => {
  assert.deepEqual([...EVAL_FORM_TYPES], ["teacher_eval", "center_survey", "session_eval"]);
  assert.deepEqual([...EVAL_QUESTION_TYPES], ["rating", "radio", "checkbox", "text", "image"]);
});

/* ---------------- Đợt khảo sát ---------------- */

test("đợt: Mở → Đóng → Lưu trữ", () => {
  assert.equal(evalRoundTransition("draft", "open"), "open");
  assert.equal(evalRoundTransition("open", "close"), "closed");
  assert.equal(evalRoundTransition("closed", "archive"), "archived");
  assert.equal(evalRoundTransition("closed", "open"), "open", "mở lại đợt đã đóng");
  assert.equal(evalRoundTransition("draft", "archive"), "archived", "bỏ đợt nháp");
});

test("đợt: các bước không hợp lệ", () => {
  assert.throws(() => evalRoundTransition("open", "open"), /đang mở rồi/i);
  assert.throws(() => evalRoundTransition("draft", "close"), /chỉ đóng được đợt đang mở/i);
  assert.throws(() => evalRoundTransition("open", "archive"), /Đóng đợt trước khi lưu trữ/i);
  for (const a of ["open", "close", "archive"] as const) assert.throws(() => evalRoundTransition("archived", a), /đã lưu trữ/i);
});

test("kiểm tra đợt khi lưu", () => {
  assert.deepEqual(validateEvalRound({ title: "Đợt tháng 9", formId: "f1", startDate: "2026-09-01", endDate: "2026-09-30" }), []);
  const e = validateEvalRound({ title: " ", formId: null, startDate: "2026-09-30", endDate: "2026-09-01" });
  assert.ok(e.includes(EVAL_ERR.titleEmpty));
  assert.ok(e.some((x) => /Chọn phiếu/.test(x)));
  assert.ok(e.some((x) => /Ngày kết thúc/.test(x)));
});

test("đợt chỉ nhận phản hồi khi đang mở và trong thời gian", () => {
  const r = { status: "open", startDate: "2026-09-01", endDate: "2026-09-30" } as const;
  assert.equal(evalRoundAcceptsResponse(r, "2026-09-18"), true);
  assert.equal(evalRoundAcceptsResponse(r, "2026-09-01"), true);
  assert.equal(evalRoundAcceptsResponse(r, "2026-09-30"), true);
  assert.equal(evalRoundAcceptsResponse(r, "2026-10-01"), false);
  assert.equal(evalRoundAcceptsResponse({ ...r, status: "closed" }, "2026-09-18"), false);
});

test("điểm trung bình theo nhóm tiêu chí — chỉ tính câu chấm sao đã trả lời", () => {
  const avg = averageByCriteria([
    { questionType: "rating", criteriaGroup: "Kiến thức", rating: 5 },
    { questionType: "rating", criteriaGroup: "Kiến thức", rating: 4 },
    { questionType: "rating", criteriaGroup: "Kiến thức", rating: null },
    { questionType: "text", criteriaGroup: "Kiến thức" },
    { questionType: "rating", criteriaGroup: null, rating: 3 },
  ]);
  assert.deepEqual(avg, [{ group: "Kiến thức", avg: 4.5, count: 2 }, { group: EVAL_UNGROUPED_VI, avg: 3, count: 1 }]);
});
