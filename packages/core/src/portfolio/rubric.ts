/**
 * PHIẾU NHẬN XÉT BUỔI HỌC — quy tắc thuần (không chạm CSDL, không dùng kiểu DOM).
 *
 * Sau mỗi buổi, giáo viên chấm nhanh từng học viên có mặt theo RUBRIC 3 MỨC của TH STEAM
 * (Cần cố gắng · Đạt · Tốt — cùng thang đánh giá năng lực, phẩm chất của Thông tư 27/2020/TT-BGDĐT,
 * phụ huynh dễ đối chiếu với học bạ ở trường), chọn kết quả mục tiêu bài, thẻ nổi bật, ghi sản phẩm + nhận xét.
 * Khi hoàn tất buổi, mọi phiếu nháp đủ điều kiện được phát hành cùng lúc và trở thành BẤT BIẾN.
 *
 * Phiếu lưu một BẢN CHỤP (`SessionEvalSnapshot`) gồm tiêu chí + mô tả mức + điểm + bối cảnh buổi
 * (bài, mục tiêu, ngày, số buổi, GV) và THANG của lúc chấm (`scale`) — đổi tiêu chí / giáo trình / thang sau này
 * không làm đổi phiếu cũ. Phiếu cũ chấm thang 4 vẫn hiện đúng 4 mức đã chụp; khi TỔNG HỢP (trung bình, biểu đồ,
 * học bạ mốc) mọi điểm được quy về thang hiện hành bằng `convertScore`. Xem docs/HO-SO-HOC-TAP.md.
 */

export const SESSION_EVAL_STATUSES = ["draft", "published"] as const;
export type SessionEvalStatus = (typeof SESSION_EVAL_STATUSES)[number];
export const SESSION_EVAL_STATUS_VI: Record<SessionEvalStatus, string> = {
  draft: "Bản nháp",
  published: "Đã phát hành",
};

/** Phiên bản thang chấm — đổi mô tả mức thì tăng, phiếu cũ vẫn giữ bản chụp cũ */
export const RUBRIC_VERSION = "2026.10-thsteam";
/** Thang hiện hành của phiếu buổi và học bạ mốc: 3 mức Cần cố gắng / Đạt / Tốt */
export const RUBRIC_SCALE = 3;
/** Thang 4 mức dùng trước 10/2026 (phiếu và học bạ cũ còn lưu thang này) */
export const PREVIOUS_RUBRIC_SCALE = 4;
/** Thang của học bạ cũ (trước khi có phiếu buổi) */
export const LEGACY_SCORE_SCALE = 5;

export interface RubricLevel {
  /** 1 = thấp nhất … RUBRIC_SCALE = cao nhất */
  value: number;
  label: string;
  /** Mô tả ngắn — hiện dưới dạng gợi ý khi GV chấm và in trên phiếu */
  hint: string;
}

/** 3 mức có thứ tự, ngôn từ tích cực (không có "kém" / "yếu") */
export const RUBRIC_LEVELS: readonly RubricLevel[] = [
  { value: 1, label: "Cần cố gắng", hint: "Con đang làm quen, cần thầy cô hướng dẫn và nhắc thêm." },
  { value: 2, label: "Đạt", hint: "Con tự làm được theo yêu cầu của bài." },
  { value: 3, label: "Tốt", hint: "Con làm tốt, chủ động sáng tạo thêm hoặc hỗ trợ được bạn." },
];

/** 4 mức cũ — chỉ để HIỂN THỊ phiếu / học bạ đã chấm thang 4 */
export const PREVIOUS_RUBRIC_LEVELS: readonly RubricLevel[] = [
  { value: 1, label: "Đang làm quen", hint: "" },
  { value: 2, label: "Cần hỗ trợ", hint: "" },
  { value: 3, label: "Đạt", hint: "" },
  { value: 4, label: "Vượt mong đợi", hint: "" },
];

export const RUBRIC_LABEL: Record<number, string> = Object.fromEntries(RUBRIC_LEVELS.map((l) => [l.value, l.label]));

/** Nhãn điểm theo thang (3 = hiện hành, 4 = thang cũ 10/2026, 5 = học bạ cũ) */
export function scoreLabel(score: number | null | undefined, scale: number = RUBRIC_SCALE): string {
  if (score == null) return "Chưa chấm";
  if (scale === LEGACY_SCORE_SCALE) return ({ 1: "Cần cố gắng", 2: "Đang tiến bộ", 3: "Đạt", 4: "Tốt", 5: "Xuất sắc" } as Record<number, string>)[score] ?? String(score);
  if (scale === PREVIOUS_RUBRIC_SCALE) return PREVIOUS_RUBRIC_LEVELS[score - 1]?.label ?? String(score);
  return RUBRIC_LABEL[score] ?? String(score);
}

/** Nhãn mức của một ĐIỂM TRUNG BÌNH trên thang hiện hành (vd 2,6 → "Tốt"): làm tròn tới mức gần nhất */
export function levelOfAverage(avg: number | null | undefined, scale: number = RUBRIC_SCALE): string {
  if (avg == null || !Number.isFinite(avg)) return "Chưa chấm";
  const v = Math.min(scale, Math.max(1, Math.round(avg)));
  return scoreLabel(v, scale);
}

/**
 * Quy một điểm từ thang `from` sang thang `to` theo tỷ lệ tuyến tính (1 ↦ 1, from ↦ to), 1 chữ số thập phân.
 * Dùng khi trộn phiếu cũ thang 4 với phiếu mới thang 3. Điểm ngoài thang gốc → null.
 */
export function convertScore(v: number | null | undefined, from: number, to: number = RUBRIC_SCALE): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 1 || v > from || from < 2) return null;
  if (from === to) return v;
  return Math.round((1 + ((v - 1) * (to - 1)) / (from - 1)) * 10) / 10;
}

/**
 * Mô tả 3 mức mặc định cho 6 năng lực + 3 phẩm chất của khung TH STEAM, khớp theo từ khoá trong tên tiêu chí
 * (khi khoá chưa khai mô tả riêng). Lấy từ bảng "Con thay đổi gì sau mỗi năm học" của bộ chương trình chuẩn:
 * mức 1 ≈ trước khi học, mức 2 ≈ sau năm 1, mức 3 ≈ sau năm 2. Không khớp thì dùng mô tả chung ở `RUBRIC_LEVELS`.
 */
const DESCRIPTOR_SETS: readonly { match: RegExp; hints: readonly [string, string, string] }[] = [
  { match: /tư duy công nghệ|lập trình|thuật toán|tu duy cong nghe/i, hints: ["Còn làm theo hướng dẫn từng bước.", "Tự chia bài toán thành các bước nhỏ.", "Tự lập chiến lược, tối ưu cách làm và thời gian."] },
  { match: /phản biện|gỡ lỗi|giải quyết|phan bien/i, hints: ["Thường chấp nhận một đáp án, cần gợi ý khi gặp lỗi.", "Tự tìm lỗi khi sản phẩm chạy chưa đúng.", "So sánh nhiều cách giải và giải thích được lựa chọn."] },
  { match: /vi tính|máy tính|thao tác|vi tinh/i, hints: ["Thao tác máy tính còn lúng túng.", "Dùng thành thạo phần mềm của bài và học online.", "Tự cài đặt, quản lý tệp, làm chủ phần mềm."] },
  { match: /tiếng anh|thuật ngữ|tieng anh/i, hints: ["Chưa quen thuật ngữ tiếng Anh của phần mềm.", "Nhận biết các thuật ngữ chính của bài.", "Dùng giao diện tiếng Anh, đọc hiểu đề bài."] },
  { match: /trình bày|tự tin|thuyết trình|trinh bay/i, hints: ["Còn ngại nói, ngại sai trước lớp.", "Tự giới thiệu sản phẩm của mình trước lớp.", "Báo cáo dự án mạch lạc trước phụ huynh, trả lời được câu hỏi."] },
  { match: /tự chủ|hành vi số|kiên trì|tap trung|tự chu/i, hints: ["Dùng máy tính chủ yếu để giải trí, dễ mất tập trung.", "Tập trung, kiên trì sửa lỗi đến khi xong bài.", "Chủ động dùng máy tính an toàn để sáng tạo."] },
  { match: /chăm chỉ|cham chi/i, hints: ["Học khi được nhắc.", "Đúng giờ, làm bài tập đầy đủ.", "Tự giác học và luyện thêm."] },
  { match: /trách nhiệm|trach nhiem/i, hints: ["Còn bỏ dở khi gặp khó.", "Hoàn thành dự án đúng hạn.", "Chủ động hỗ trợ bạn trong nhóm."] },
  { match: /trung thực|trung thuc/i, hints: ["Còn ngại thừa nhận lỗi.", "Tự làm sản phẩm của mình.", "Dám nhận lỗi, tôn trọng bài của bạn."] },
  { match: /hợp tác|nhóm|hop tac/i, hints: ["Đang làm quen làm việc cùng bạn.", "Hợp tác, chia việc với bạn khi được phân công.", "Chủ động điều phối và hỗ trợ bạn trong nhóm."] },
];

/** Mô tả mức khai riêng cho tiêu chí: đúng RUBRIC_SCALE chuỗi, không rỗng — sai hình dạng thì coi như chưa khai */
function ownDescriptors(x: readonly unknown[] | null | undefined): string[] | null {
  if (!Array.isArray(x) || x.length !== RUBRIC_SCALE) return null;
  const out = x.map((v) => (typeof v === "string" ? v.trim() : ""));
  return out.every((v) => v.length > 0) ? out : null;
}

/**
 * Mô tả các mức cho một tiêu chí — luôn đủ RUBRIC_SCALE mức, tăng dần.
 * Ưu tiên mô tả mức quản trị khai cho tiêu chí (`competency_criteria.level_descriptors`);
 * chưa khai thì khớp theo từ khoá trong tên; không khớp thì dùng mô tả chung.
 */
export function rubricLevelsFor(criterionName: string, descriptors?: readonly unknown[] | null): RubricLevel[] {
  const own = ownDescriptors(descriptors);
  const set = own ? null : DESCRIPTOR_SETS.find((d) => d.match.test(criterionName));
  return RUBRIC_LEVELS.map((l, i) => ({ value: l.value, label: l.label, hint: own ? own[i]! : set ? set.hints[i]! : l.hint }));
}

/** Tiêu chí mặc định khi khoá chưa cấu hình tiêu chí: 6 năng lực + 3 phẩm chất của khung TH STEAM */
export const DEFAULT_SESSION_CRITERIA: readonly { key: string; label: string }[] = [
  { key: "mac-dinh:tu-duy-cong-nghe", label: "Tư duy công nghệ" },
  { key: "mac-dinh:tu-duy-phan-bien", label: "Tư duy phản biện" },
  { key: "mac-dinh:ky-nang-vi-tinh", label: "Kỹ năng vi tính" },
  { key: "mac-dinh:tieng-anh", label: "Tiếng Anh chuyên ngành" },
  { key: "mac-dinh:tu-tin", label: "Tự tin, trình bày" },
  { key: "mac-dinh:tu-chu", label: "Tự chủ, hành vi số" },
  { key: "mac-dinh:cham-chi", label: "Chăm chỉ" },
  { key: "mac-dinh:trach-nhiem", label: "Trách nhiệm" },
  { key: "mac-dinh:trung-thuc", label: "Trung thực" },
];

/* ------------------------------------------------------------------ */
/* Mục tiêu bài, thẻ nổi bật                                           */
/* ------------------------------------------------------------------ */

export const OBJECTIVE_RESULTS = ["achieved", "partial", "not_yet"] as const;
export type ObjectiveResult = (typeof OBJECTIVE_RESULTS)[number];
export const OBJECTIVE_RESULT_VI: Record<ObjectiveResult, string> = {
  achieved: "Đạt mục tiêu bài",
  partial: "Đạt một phần",
  not_yet: "Chưa đạt — luyện thêm",
};
/** Nhãn ngắn cho nút một chạm */
export const OBJECTIVE_RESULT_SHORT: Record<ObjectiveResult, string> = {
  achieved: "Đạt",
  partial: "Một phần",
  not_yet: "Chưa đạt",
};

/** Thẻ nổi bật mặc định — cấu hình được (app_settings "ho_so_hoc_tap".highlights) */
export const DEFAULT_HIGHLIGHTS: readonly string[] = ["Sáng tạo", "Kiên trì", "Giúp đỡ bạn", "Hoàn thành sớm", "Đặt câu hỏi hay", "Trình bày tự tin"];
export const HIGHLIGHT_MAX = 6;
export const HIGHLIGHT_LABEL_MAX = 40;

/** Danh sách thẻ cấu hình: bỏ rỗng, bỏ trùng, cắt độ dài; rỗng thì dùng mặc định */
export function highlightOptions(configured: readonly unknown[] | null | undefined): string[] {
  const out: string[] = [];
  for (const x of configured ?? []) {
    if (typeof x !== "string") continue;
    const t = x.trim().slice(0, HIGHLIGHT_LABEL_MAX);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= 12) break;
  }
  return out.length ? out : [...DEFAULT_HIGHLIGHTS];
}

/** Chỉ giữ thẻ thuộc danh sách cho phép, không trùng, tối đa `HIGHLIGHT_MAX` */
export function sanitizeHighlights(input: readonly string[] | null | undefined, allowed: readonly string[] = DEFAULT_HIGHLIGHTS): string[] {
  const out: string[] = [];
  for (const h of input ?? []) {
    const t = h.trim();
    if (allowed.includes(t) && !out.includes(t)) out.push(t);
    if (out.length >= HIGHLIGHT_MAX) break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Bản chụp                                                            */
/* ------------------------------------------------------------------ */

export const SESSION_EVAL_TEXT_MAX = 1000;

export interface SessionEvalCriterion {
  /** Khoá ổn định: id tiêu chí trong `competency_criteria` hoặc "mac-dinh:*" */
  key: string;
  criterionId: string | null;
  label: string;
  description: string | null;
  levels: RubricLevel[];
  /** Mức đã chấm (1 → thang của bản chụp); null = chưa chấm */
  value: number | null;
  /** Nhóm tiêu chí (vd "Thiết kế & lắp ráp") — phiếu cũ không có */
  group?: string | null;
  /** Tiêu chí trọng tâm của bài (xếp lên đầu phiếu) — phiếu cũ không có */
  focus?: boolean;
}

export interface SessionEvalContext {
  /** YYYY-MM-DD */
  date: string;
  startTime: string | null;
  sequenceNo: number;
  /** "Buổi 7" / "Học bù #2" … */
  label: string;
  /** Buổi học bù (buổi loại makeup, hoặc học viên học bù ở buổi này) */
  makeup: boolean;
  lessonTitle: string | null;
  lessonObjectives: string | null;
  teacherName: string | null;
  className: string | null;
  classCode: string | null;
  courseName: string | null;
  courseCode: string | null;
  centerName: string | null;
  studentName: string;
  studentCode: string | null;
}

/** Nội dung cột `session_evaluations.snapshot` */
export interface SessionEvalSnapshot {
  version: string;
  scale: number;
  criteria: SessionEvalCriterion[];
  context: SessionEvalContext;
  /** Mốc chụp — ISO */
  takenAt: string;
}

export interface CriterionSource {
  id: string | null;
  key?: string;
  name: string;
  description?: string | null;
  /** Mô tả hành vi quan sát được cho từng mức (mức 1 → RUBRIC_SCALE) — `competency_criteria.level_descriptors` */
  levelDescriptors?: readonly unknown[] | null;
  group?: string | null;
  /** Tiêu chí trọng tâm của bài đang dạy */
  focus?: boolean;
}

export type SessionScores = Record<string, number | null | undefined>;

const validLevel = (v: unknown, scale: number = RUBRIC_SCALE): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= scale;

/** Thang của một bản chụp (bản chụp rất cũ không ghi thang → thang 4) */
export function snapshotScale(snapshot: { scale?: unknown } | null | undefined): number {
  const v = snapshot?.scale;
  return typeof v === "number" && Number.isInteger(v) && v >= 2 && v <= 10 ? v : PREVIOUS_RUBRIC_SCALE;
}

/** Tiêu chí đưa vào phiếu: tiêu chí đang dùng của khoá; khoá chưa có tiêu chí thì dùng bộ mặc định */
export function sessionCriteriaFrom(courseCriteria: readonly CriterionSource[]): CriterionSource[] {
  if (courseCriteria.length) return courseCriteria.map((c) => ({ ...c }));
  return DEFAULT_SESSION_CRITERIA.map((c) => ({ id: null, key: c.key, name: c.label, description: null }));
}

/** Chụp tiêu chí + mô tả mức + điểm + bối cảnh buổi; điểm ngoài thang bị bỏ (về null) */
export function buildSessionSnapshot(input: { criteria: readonly CriterionSource[]; scores?: SessionScores; context: SessionEvalContext; now?: Date }): SessionEvalSnapshot {
  const crits = sessionCriteriaFrom(input.criteria);
  return {
    version: RUBRIC_VERSION,
    scale: RUBRIC_SCALE,
    criteria: crits.map((c) => {
      const key = c.key ?? c.id ?? c.name;
      const raw = input.scores?.[key];
      return {
        key,
        criterionId: c.id,
        label: c.name,
        description: c.description?.trim() || null,
        levels: rubricLevelsFor(c.name, c.levelDescriptors),
        value: validLevel(raw) ? raw : null,
        ...(c.group?.trim() ? { group: c.group.trim() } : {}),
        ...(c.focus ? { focus: true } : {}),
      };
    }),
    context: { ...input.context },
    takenAt: (input.now ?? new Date()).toISOString(),
  };
}

/** Cập nhật điểm trên bản chụp (giữ nguyên tiêu chí đã chụp); khoá không có trong `scores` giữ nguyên */
export function applySessionScores(snapshot: SessionEvalSnapshot, scores: SessionScores): SessionEvalSnapshot {
  return {
    ...snapshot,
    criteria: snapshot.criteria.map((c) => {
      if (!(c.key in scores)) return { ...c, levels: c.levels.map((l) => ({ ...l })) };
      const raw = scores[c.key];
      return { ...c, levels: c.levels.map((l) => ({ ...l })), value: validLevel(raw, snapshotScale(snapshot)) ? raw : null };
    }),
    context: { ...snapshot.context },
  };
}

/**
 * Chụp LẠI lúc phát hành: lấy tiêu chí + bối cảnh mới nhất (bài đã xác nhận, GV đứng buổi…)
 * và mang điểm đã chấm sang theo khoá tiêu chí. Sau khi phát hành không bao giờ gọi lại hàm này.
 */
export function rebaseSnapshot(old: SessionEvalSnapshot | null | undefined, fresh: SessionEvalSnapshot): SessionEvalSnapshot {
  if (!old) return fresh;
  const from = snapshotScale(old);
  if (from === fresh.scale) return applySessionScores(fresh, snapshotScores(old));
  // Nháp chấm theo thang cũ: quy điểm sang thang mới rồi làm tròn tới mức gần nhất
  const converted: SessionScores = {};
  for (const [k, v] of Object.entries(snapshotScores(old))) {
    const c = convertScore(v, from, fresh.scale);
    converted[k] = c == null ? null : Math.min(fresh.scale, Math.max(1, Math.round(c)));
  }
  return applySessionScores(fresh, converted);
}

/** Đọc điểm từ bản chụp (đúng thang của bản chụp) */
export function snapshotScores(snapshot: SessionEvalSnapshot | null | undefined): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const c of snapshot?.criteria ?? []) out[c.key] = c.value ?? null;
  return out;
}

/**
 * Điểm của bản chụp QUY VỀ một thang (mặc định thang hiện hành) — dùng cho mọi phép tổng hợp
 * (trung bình, biểu đồ, học bạ mốc) để trộn được phiếu cũ thang 4 với phiếu mới thang 3.
 */
export function snapshotScoresOnScale(snapshot: SessionEvalSnapshot | null | undefined, scale: number = RUBRIC_SCALE): Record<string, number | null> {
  const from = snapshotScale(snapshot);
  const out: Record<string, number | null> = {};
  for (const c of snapshot?.criteria ?? []) out[c.key] = validLevel(c.value, from) ? convertScore(c.value, from, scale) : null;
  return out;
}

/** Tiêu chí chưa chấm (nhãn) */
export function missingSessionCriteria(snapshot: SessionEvalSnapshot | null | undefined): string[] {
  return (snapshot?.criteria ?? []).filter((c) => c.value == null).map((c) => c.label);
}

/** Điểm trung bình các tiêu chí đã chấm của một phiếu, QUY VỀ thang hiện hành (1 chữ số thập phân) */
export function sessionAverage(snapshot: SessionEvalSnapshot | null | undefined): number | null {
  const v = Object.values(snapshotScoresOnScale(snapshot)).filter((x): x is number => typeof x === "number");
  if (!v.length) return null;
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10;
}

/** Kiểm tra JSONB đọc từ CSDL có đúng hình dạng (phòng dữ liệu hỏng) */
export function isSessionEvalSnapshot(x: unknown): x is SessionEvalSnapshot {
  if (!x || typeof x !== "object") return false;
  const s = x as { version?: unknown; criteria?: unknown; context?: unknown };
  if (typeof s.version !== "string" || !Array.isArray(s.criteria) || !s.context || typeof s.context !== "object") return false;
  return s.criteria.every((c: unknown) => {
    const cc = c as { key?: unknown; label?: unknown; levels?: unknown; value?: unknown };
    return typeof cc?.key === "string" && typeof cc.label === "string" && Array.isArray(cc.levels) && (cc.value === null || typeof cc.value === "number");
  });
}

/* ------------------------------------------------------------------ */
/* Kiểm tra trước khi lưu / phát hành                                   */
/* ------------------------------------------------------------------ */

/**
 * Điều kiện bắt buộc để phát hành phiếu — đọc từ "Chuẩn hồ sơ công nghệ" (cấu hình vận hành).
 * Bỏ trống = mặc định như trước: bắt buộc kết quả mục tiêu bài, không bắt buộc ô "Sản phẩm".
 */
export interface EvalRequirement {
  requireObjectiveResult?: boolean;
  requireProductNote?: boolean;
}

export interface SessionEvalValidateInput {
  mode: "draft" | "publish";
  snapshot: SessionEvalSnapshot;
  objectiveResult?: ObjectiveResult | null;
  productNote?: string | null;
  remark?: string | null;
  highlights?: readonly string[] | null;
  /** Chuẩn hồ sơ đang áp dụng (theo cơ sở) */
  requirement?: EvalRequirement | null;
}

const tlen = (s: string | null | undefined) => (s ?? "").trim().length;

/** Lỗi tiếng Việt; rỗng = hợp lệ. Nháp cho thiếu; phát hành cần đủ mọi tiêu chí + kết quả mục tiêu bài */
export function validateSessionEvaluation(input: SessionEvalValidateInput): string[] {
  const errs: string[] = [];
  if (tlen(input.productNote) > SESSION_EVAL_TEXT_MAX) errs.push(`Ô "Sản phẩm" tối đa ${SESSION_EVAL_TEXT_MAX} ký tự`);
  if (tlen(input.remark) > SESSION_EVAL_TEXT_MAX) errs.push(`Nhận xét tối đa ${SESSION_EVAL_TEXT_MAX} ký tự`);
  if ((input.highlights?.length ?? 0) > HIGHLIGHT_MAX) errs.push(`Chọn tối đa ${HIGHLIGHT_MAX} thẻ nổi bật`);
  if (input.objectiveResult != null && !(OBJECTIVE_RESULTS as readonly string[]).includes(input.objectiveResult)) errs.push("Kết quả mục tiêu bài không hợp lệ");
  if (input.mode === "draft") return errs;
  const missing = missingSessionCriteria(input.snapshot);
  if (missing.length) errs.push(`chưa chấm ${missing.join(", ")}`);
  if (!input.objectiveResult && input.requirement?.requireObjectiveResult !== false) errs.push("chưa chọn kết quả mục tiêu bài");
  if (input.requirement?.requireProductNote && !tlen(input.productNote)) errs.push("chưa ghi sản phẩm của buổi");
  return errs;
}

/** Học viên được lập phiếu: có mặt / đi muộn / học bù. Vắng thì KHÔNG có phiếu */
export function isEvaluableAttendance(status: string | null | undefined): boolean {
  return status === "present" || status === "late" || status === "makeup";
}

export interface EvalReadinessRow {
  name: string;
  attendanceStatus: string | null | undefined;
  evaluation: { status: SessionEvalStatus; snapshot: SessionEvalSnapshot | null; objectiveResult: ObjectiveResult | null; productNote?: string | null } | null;
}

export interface EvalReadiness {
  /** Số HV phải có phiếu (có mặt) */
  required: number;
  /** Số phiếu đủ điều kiện phát hành (hoặc đã phát hành) */
  ready: number;
  /** HV còn thiếu, kèm lý do ngắn */
  missing: { name: string; reason: string }[];
}

/** Điều kiện phát hành phiếu của cả buổi — dùng để chặn "Hoàn tất buổi" */
export function sessionEvaluationReadiness(rows: readonly EvalReadinessRow[], requirement?: EvalRequirement | null): EvalReadiness {
  const missing: { name: string; reason: string }[] = [];
  let required = 0;
  let ready = 0;
  for (const r of rows) {
    if (!isEvaluableAttendance(r.attendanceStatus)) continue;
    required += 1;
    const e = r.evaluation;
    if (e?.status === "published") { ready += 1; continue; }
    if (!e || !e.snapshot) { missing.push({ name: r.name, reason: "chưa có phiếu" }); continue; }
    const errs = validateSessionEvaluation({ mode: "publish", snapshot: e.snapshot, objectiveResult: e.objectiveResult, productNote: e.productNote, requirement });
    if (errs.length) missing.push({ name: r.name, reason: errs.join(", ") });
    else ready += 1;
  }
  return { required, ready, missing };
}

/** Câu chặn hoàn tất buổi — nêu tên HV thiếu phiếu */
export function evaluationBlockerMessage(r: EvalReadiness, maxNames = 6): string | null {
  if (!r.missing.length) return null;
  const names = r.missing.slice(0, maxNames).map((m) => `${m.name} (${m.reason})`);
  const more = r.missing.length > maxNames ? ` và ${r.missing.length - maxNames} học viên khác` : "";
  return `Chưa đủ phiếu nhận xét cho ${r.missing.length} học viên có mặt: ${names.join("; ")}${more}`;
}

/** "Chép mức cho cả lớp": áp điểm + mục tiêu bài của một em cho các em khác (không đụng nhận xét riêng) */
export function copyScoresToAll<T extends { scores: Record<string, number | null>; objectiveResult: ObjectiveResult | null }>(
  source: Pick<T, "scores" | "objectiveResult">,
  targets: Record<string, T>,
  onlyIds?: readonly string[],
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, t] of Object.entries(targets)) {
    out[id] = !onlyIds || onlyIds.includes(id) ? { ...t, scores: { ...source.scores }, objectiveResult: source.objectiveResult } : t;
  }
  return out;
}
