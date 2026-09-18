/**
 * Đánh giá & Khảo sát v2 (bản gốc `/evaluations`) — quy tắc thuần.
 *
 * Ba loại phiếu: Đánh giá GV · Khảo sát cơ sở · Đánh giá buổi học.
 * Năm loại câu hỏi: chấm sao 1–5 · một lựa chọn · nhiều lựa chọn · nhập văn bản · tải ảnh.
 * Mỗi câu hỏi có thể gắn **nhóm tiêu chí** (vd "Kiến thức") — để trống nếu không nhóm.
 * Đợt khảo sát: Nháp → Mở đợt → Đóng đợt → Lưu trữ.
 */

export class EvaluationRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationRuleError";
  }
}

/* ------------------------------------------------------------------ */
/* Loại phiếu                                                          */
/* ------------------------------------------------------------------ */

export const EVAL_FORM_TYPES = ["teacher_eval", "center_survey", "session_eval"] as const;
export type EvalFormType = (typeof EVAL_FORM_TYPES)[number];
export const EVAL_FORM_TYPE_VI: Record<EvalFormType, string> = {
  teacher_eval: "Đánh giá GV",
  center_survey: "Khảo sát cơ sở",
  session_eval: "Đánh giá buổi học",
};
/** Mã hiển thị kiểu bản gốc (viết hoa) — dùng trong thông báo lỗi */
export const EVAL_FORM_TYPE_CODE: Record<EvalFormType, string> = {
  teacher_eval: "TEACHER_EVAL",
  center_survey: "CENTER_SURVEY",
  session_eval: "SESSION_EVAL",
};

/* ------------------------------------------------------------------ */
/* Loại câu hỏi                                                        */
/* ------------------------------------------------------------------ */

export const EVAL_QUESTION_TYPES = ["rating", "radio", "checkbox", "text", "image"] as const;
export type EvalQuestionType = (typeof EVAL_QUESTION_TYPES)[number];
export const EVAL_QUESTION_TYPE_VI: Record<EvalQuestionType, string> = {
  rating: "Chấm sao (1–5)",
  radio: "Một lựa chọn",
  checkbox: "Nhiều lựa chọn",
  text: "Nhập văn bản",
  image: "Tải ảnh",
};
/** Loại câu hỏi có danh sách lựa chọn dựng sẵn */
export const EVAL_TYPES_WITH_OPTIONS: readonly EvalQuestionType[] = ["radio", "checkbox"];
/** Câu "Tải ảnh" chỉ dùng cho phiếu Đánh giá buổi học */
export const EVAL_IMAGE_ONLY_FORM: EvalFormType = "session_eval";
export const EVAL_RATING_MIN = 1;
export const EVAL_RATING_MAX = 5;
export const EVAL_MAX_QUESTIONS = 40;
export const EVAL_MAX_OPTIONS = 12;

export interface EvalQuestionDraft {
  type: EvalQuestionType;
  /** Nội dung câu hỏi */
  label: string;
  /** Lựa chọn dựng sẵn — chỉ radio / checkbox */
  options?: readonly string[] | null;
  /** Nhóm tiêu chí (vd "Kiến thức") — để trống nếu không nhóm */
  criteriaGroup?: string | null;
  required?: boolean;
}

export interface EvalFormDraft {
  title: string;
  type: EvalFormType;
  description?: string | null;
  questions: readonly EvalQuestionDraft[];
}

/** Câu chữ báo lỗi — giữ nguyên văn bản bản gốc */
export const EVAL_ERR = {
  titleEmpty: "Tiêu đề không được trống",
  noQuestion: "Form cần ít nhất 1 câu hỏi",
  labelEmpty: "Nội dung câu hỏi không được trống",
  needTwoOptions: "RADIO/CHECKBOX cần tối thiểu 2 lựa chọn",
  optionsNotAllowed: "Loại câu hỏi này không có lựa chọn dựng sẵn",
  imageOnlySession: "Câu hỏi 'Tải ảnh' chỉ dùng cho phiếu Đánh giá buổi học (SESSION_EVAL)",
  tooManyQuestions: `Tối đa ${EVAL_MAX_QUESTIONS} câu hỏi`,
  tooManyOptions: `Tối đa ${EVAL_MAX_OPTIONS} lựa chọn mỗi câu`,
  duplicateOption: "Lựa chọn bị trùng",
} as const;

/** Bỏ khoảng trắng thừa, loại lựa chọn rỗng, xoá lựa chọn ở loại câu không dùng */
export function normalizeEvalQuestion(q: EvalQuestionDraft): EvalQuestionDraft & { options: string[] | null; criteriaGroup: string | null; required: boolean } {
  const opts = (q.options ?? []).map((o) => String(o).trim()).filter(Boolean);
  return {
    type: q.type,
    label: q.label.trim(),
    options: EVAL_TYPES_WITH_OPTIONS.includes(q.type) ? opts : opts.length ? opts : null,
    criteriaGroup: (q.criteriaGroup ?? "").trim() || null,
    required: q.required ?? false,
  };
}

/** Lỗi của MỘT câu hỏi (dùng để tô đỏ ngay dòng đó trên trình dựng phiếu) */
export function evalQuestionIssues(q: EvalQuestionDraft, formType: EvalFormType): string[] {
  const e: string[] = [];
  const n = normalizeEvalQuestion(q);
  if (!n.label) e.push(EVAL_ERR.labelEmpty);
  const hasOptions = EVAL_TYPES_WITH_OPTIONS.includes(n.type);
  const opts = n.options ?? [];
  if (hasOptions) {
    if (opts.length < 2) e.push(EVAL_ERR.needTwoOptions);
    if (opts.length > EVAL_MAX_OPTIONS) e.push(EVAL_ERR.tooManyOptions);
    if (new Set(opts).size !== opts.length) e.push(EVAL_ERR.duplicateOption);
  } else if (opts.length) {
    e.push(EVAL_ERR.optionsNotAllowed);
  }
  if (n.type === "image" && formType !== EVAL_IMAGE_ONLY_FORM) e.push(EVAL_ERR.imageOnlySession);
  return e;
}

/** Kiểm tra cả phiếu khi lưu. Trả danh sách lỗi (rỗng = hợp lệ), không trùng lặp. */
export function validateEvalForm(f: EvalFormDraft): string[] {
  const e: string[] = [];
  if (!f.title.trim()) e.push(EVAL_ERR.titleEmpty);
  if (!f.questions.length) e.push(EVAL_ERR.noQuestion);
  if (f.questions.length > EVAL_MAX_QUESTIONS) e.push(EVAL_ERR.tooManyQuestions);
  for (const q of f.questions) e.push(...evalQuestionIssues(q, f.type));
  return [...new Set(e)];
}

export function assertEvalForm(f: EvalFormDraft): void {
  const e = validateEvalForm(f);
  if (e.length) throw new EvaluationRuleError(e.join("; "));
}

/** Gom câu hỏi theo nhóm tiêu chí, giữ thứ tự xuất hiện; nhóm trống gom vào "Chung". */
export const EVAL_UNGROUPED_VI = "Chung";
export function groupByCriteria<T extends { criteriaGroup?: string | null }>(questions: readonly T[]): { group: string; items: T[] }[] {
  const out: { group: string; items: T[] }[] = [];
  for (const q of questions) {
    const g = (q.criteriaGroup ?? "").trim() || EVAL_UNGROUPED_VI;
    const cur = out.find((x) => x.group === g);
    if (cur) cur.items.push(q);
    else out.push({ group: g, items: [q] });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Đợt khảo sát                                                        */
/* ------------------------------------------------------------------ */

export const EVAL_ROUND_STATUSES = ["draft", "open", "closed", "archived"] as const;
export type EvalRoundStatus = (typeof EVAL_ROUND_STATUSES)[number];
export const EVAL_ROUND_STATUS_VI: Record<EvalRoundStatus, string> = {
  draft: "Nháp",
  open: "Đang mở",
  closed: "Đã đóng",
  archived: "Đã lưu trữ",
};
export type EvalRoundAction = "open" | "close" | "archive";
export const EVAL_ROUND_ACTION_VI: Record<EvalRoundAction, string> = { open: "Mở đợt", close: "Đóng đợt", archive: "Lưu trữ" };

/** Chuyển trạng thái đợt. Đã lưu trữ là trạng thái cuối. */
export function evalRoundTransition(from: EvalRoundStatus, action: EvalRoundAction): EvalRoundStatus {
  const fail = (m: string): never => { throw new EvaluationRuleError(m); };
  if (from === "archived") return fail("Đợt đã lưu trữ — không thao tác được nữa");
  switch (action) {
    case "open":
      return from === "draft" || from === "closed" ? "open" : fail("Đợt đang mở rồi");
    case "close":
      return from === "open" ? "closed" : fail(`Đợt đang "${EVAL_ROUND_STATUS_VI[from]}" — chỉ đóng được đợt đang mở`);
    case "archive":
      return from === "closed" || from === "draft" ? "archived" : fail("Đóng đợt trước khi lưu trữ");
  }
}

export interface EvalRoundDraft {
  title: string;
  formId: string | null;
  /** Phạm vi cơ sở — null = toàn hệ thống */
  centerId?: string | null;
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
}

export function validateEvalRound(r: EvalRoundDraft): string[] {
  const e: string[] = [];
  if (!r.title.trim()) e.push(EVAL_ERR.titleEmpty);
  if (!r.formId) e.push("Chọn phiếu đánh giá cho đợt");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.startDate)) e.push("Nhập ngày bắt đầu đợt");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.endDate)) e.push("Nhập ngày kết thúc đợt");
  if (/^\d{4}-\d{2}-\d{2}$/.test(r.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(r.endDate) && r.endDate < r.startDate) e.push("Ngày kết thúc phải từ ngày bắt đầu trở đi");
  return e;
}

/** Đợt có đang nhận phản hồi không (trạng thái mở VÀ hôm nay nằm trong khoảng thời gian) */
export function evalRoundAcceptsResponse(r: { status: EvalRoundStatus; startDate: string; endDate: string }, today: string): boolean {
  return r.status === "open" && today >= r.startDate && today <= r.endDate;
}

/* ------------------------------------------------------------------ */
/* Tổng hợp điểm                                                       */
/* ------------------------------------------------------------------ */

export interface EvalAnswerValue {
  questionType: EvalQuestionType;
  criteriaGroup?: string | null;
  /** rating: 1–5; radio: một lựa chọn; checkbox: nhiều lựa chọn; text: văn bản; image: đường dẫn ảnh */
  rating?: number | null;
}

/** Điểm trung bình theo nhóm tiêu chí (chỉ tính câu chấm sao đã trả lời) */
export function averageByCriteria(answers: readonly EvalAnswerValue[]): { group: string; avg: number; count: number }[] {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const a of answers) {
    if (a.questionType !== "rating" || a.rating == null) continue;
    const g = (a.criteriaGroup ?? "").trim() || EVAL_UNGROUPED_VI;
    const cur = acc.get(g) ?? { sum: 0, n: 0 };
    acc.set(g, { sum: cur.sum + a.rating, n: cur.n + 1 });
  }
  return [...acc.entries()].map(([group, v]) => ({ group, avg: Math.round((v.sum / v.n) * 100) / 100, count: v.n }));
}
