/**
 * CHUẨN THÔNG TIN HỒ SƠ HỌC TẬP — quy tắc thuần (không chạm CSDL, không dùng kiểu DOM).
 *
 * Quản trị không đọc từng phiếu: hồ sơ được quản lý bằng một tập QUY TẮC ĐO ĐƯỢC
 *  - phiếu nào cũng đủ trường bắt buộc (tiêu chí, mục tiêu bài, nhận xét đủ dài, sản phẩm nếu bắt buộc);
 *  - phiếu hoàn thiện đúng hạn (`sheetDeadlineHours` sau giờ kết thúc buổi);
 *  - học bạ mốc viết đúng lịch (`milestoneDeadlineDays` sau buổi mốc);
 *  - bằng chứng (ảnh / sản phẩm) đạt tỷ lệ tối thiểu mỗi buổi (`minEvidenceRatePct`).
 * rồi theo dõi bằng TỶ LỆ ĐẠT CHUẨN (xem docs/HO-SO-HOC-TAP.md, mục "Chuẩn thông tin hồ sơ học tập").
 *
 * Kèm theo: rubric có MÔ TẢ HÀNH VI cho từng mức (bộ mẫu robotics / lập trình), tiêu chí trọng tâm theo bài,
 * danh mục việc cần xong của một buổi (màn giáo viên).
 */
import { RUBRIC_SCALE, OBJECTIVE_RESULT_VI, isEvaluableAttendance, type ObjectiveResult, type SessionEvalStatus } from "./rubric.js";

/* ------------------------------------------------------------------ */
/* 1. Cấu hình chuẩn                                                   */
/* ------------------------------------------------------------------ */

export interface PortfolioStandard {
  /** Nhận xét cho phụ huynh tối thiểu … ký tự (0 = không kiểm) */
  remarkMinLength: number;
  /** Bắt buộc ghi ô "Sản phẩm" mới phát hành được phiếu */
  requireProductNote: boolean;
  /** Tỷ lệ học viên có ảnh / sản phẩm mỗi buổi tối thiểu (%) — 0 = không bắt */
  minEvidenceRatePct: number;
  /** Hạn hoàn thiện phiếu: … giờ sau giờ kết thúc buổi */
  sheetDeadlineHours: number;
  /** Bắt buộc chọn kết quả mục tiêu bài mới phát hành được phiếu */
  requireObjectiveResult: boolean;
  /** Hạn học bạ mốc: … ngày sau buổi mốc */
  milestoneDeadlineDays: number;
  /** Chặn "Hoàn tất buổi" khi còn học viên có mặt thiếu phiếu đủ điều kiện (khoá cũ `sessionRequireEvaluations`) */
  blockCompleteWhenMissing: boolean;
  /** Hồ sơ một học viên "đạt chuẩn" khi ≥ …% phiếu (đã đến hạn) đủ chuẩn */
  profileMinSheetPct: number;
}

/** Mặc định = đúng hành vi trước khi có cấu hình chuẩn */
export const DEFAULT_PORTFOLIO_STANDARD: PortfolioStandard = {
  remarkMinLength: 30,
  requireProductNote: false,
  minEvidenceRatePct: 0,
  sheetDeadlineHours: 24,
  requireObjectiveResult: true,
  milestoneDeadlineDays: 7,
  blockCompleteWhenMissing: true,
  profileMinSheetPct: 90,
};

/** Các khoá cấu hình vận hành (nhóm "Hồ sơ học tập") đọc được thành chuẩn */
export interface PortfolioStandardOps {
  remarkMinLength: number;
  requireProductNote: boolean;
  minEvidenceRatePct: number;
  sheetDeadlineHours: number;
  requireObjectiveResult: boolean;
  milestoneDeadlineDays: number;
  sessionRequireEvaluations: boolean;
  profileMinSheetPct: number;
}

/** Tham số vận hành hiệu lực (đã gộp mặc định ← toàn hệ thống ← cơ sở) → chuẩn hồ sơ */
export function standardFromOps(o: PortfolioStandardOps): PortfolioStandard {
  return {
    remarkMinLength: o.remarkMinLength,
    requireProductNote: o.requireProductNote,
    minEvidenceRatePct: o.minEvidenceRatePct,
    sheetDeadlineHours: o.sheetDeadlineHours,
    requireObjectiveResult: o.requireObjectiveResult,
    milestoneDeadlineDays: o.milestoneDeadlineDays,
    blockCompleteWhenMissing: o.sessionRequireEvaluations,
    profileMinSheetPct: o.profileMinSheetPct,
  };
}

/** Câu mô tả chuẩn cho giáo viên / quản trị */
export function describeStandard(s: PortfolioStandard): string[] {
  const out = ["Chấm đủ mọi tiêu chí của buổi"];
  if (s.requireObjectiveResult) out.push("Chọn kết quả mục tiêu bài");
  if (s.remarkMinLength > 0) out.push(`Nhận xét cho phụ huynh từ ${s.remarkMinLength} ký tự`);
  if (s.requireProductNote) out.push("Ghi sản phẩm của buổi");
  if (s.minEvidenceRatePct > 0) out.push(`Ít nhất ${s.minEvidenceRatePct}% học viên có ảnh / sản phẩm`);
  out.push(`Hoàn thiện trong ${s.sheetDeadlineHours} giờ sau buổi học`);
  return out;
}

/* ------------------------------------------------------------------ */
/* 2. Hạn hoàn thiện (giờ Việt Nam, Asia/Ho_Chi_Minh = UTC+7, không đổi giờ) */
/* ------------------------------------------------------------------ */

const VN_OFFSET_MS = 7 * 3600e3;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Mốc thời gian của (ngày, giờ) theo giờ Việt Nam. Giờ bỏ trống = 23:59 */
export function vnDateTime(date: string, time?: string | null): Date {
  if (!DATE_RE.test(date)) throw new Error(`Ngày không hợp lệ: ${date}`);
  const t = time && /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : "23:59";
  return new Date(`${date}T${t}:00+07:00`);
}

/** Hạn hoàn thiện phiếu nhận xét = giờ kết thúc buổi + `hours` giờ */
export function sheetDeadline(date: string, endTime: string | null | undefined, hours: number): Date {
  return new Date(vnDateTime(date, endTime).getTime() + Math.max(0, hours) * 3600e3);
}

/** Hạn học bạ mốc = cuối ngày buổi mốc + `days` ngày (theo giờ Việt Nam) */
export function milestoneDeadline(date: string, days: number): Date {
  return new Date(vnDateTime(date, "23:59").getTime() + Math.max(0, days) * 86400e3);
}

/** Ngày (YYYY-MM-DD, giờ Việt Nam) của một mốc */
export function vnDateOf(d: Date): string {
  return new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** "18:30 23/09" theo giờ Việt Nam */
export function fmtDeadlineVi(d: Date): string {
  const v = new Date(d.getTime() + VN_OFFSET_MS).toISOString();
  return `${v.slice(11, 16)} ${v.slice(8, 10)}/${v.slice(5, 7)}`;
}

export type DeadlineState = "done_on_time" | "done_late" | "pending" | "overdue";

/** Trạng thái hạn: đã xong đúng hạn / xong trễ / còn hạn / quá hạn */
export function deadlineState(deadline: Date, now: Date, doneAt?: Date | null): DeadlineState {
  if (doneAt) return doneAt.getTime() <= deadline.getTime() ? "done_on_time" : "done_late";
  return now.getTime() > deadline.getTime() ? "overdue" : "pending";
}

/** "còn 5 giờ" / "quá hạn 2 ngày" */
export function deadlineLabel(deadline: Date, now: Date): string {
  const diff = deadline.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3600e3);
  const txt = h < 1 ? `${Math.max(1, Math.round(abs / 60e3))} phút` : h < 48 ? `${h} giờ` : `${Math.floor(h / 24)} ngày`;
  return diff >= 0 ? `còn ${txt}` : `quá hạn ${txt}`;
}

/* ------------------------------------------------------------------ */
/* 3. Tuân thủ một phiếu                                               */
/* ------------------------------------------------------------------ */

export const SHEET_VIOLATION_CODES = [
  "no_sheet", "criteria_missing", "objective_missing", "remark_short", "product_missing", "not_published", "late", "overdue",
] as const;
export type SheetViolationCode = (typeof SHEET_VIOLATION_CODES)[number];

export const SHEET_VIOLATION_VI: Record<SheetViolationCode, string> = {
  no_sheet: "Chưa có phiếu",
  criteria_missing: "Thiếu tiêu chí",
  objective_missing: "Thiếu mục tiêu bài",
  remark_short: "Nhận xét quá ngắn",
  product_missing: "Thiếu sản phẩm",
  not_published: "Chưa phát hành",
  late: "Trễ hạn",
  overdue: "Quá hạn",
};

export interface SheetViolation {
  code: SheetViolationCode;
  /** Câu tiếng Việt cụ thể */
  message: string;
  /** Vi phạm về NỘI DUNG (tính vào "phiếu đủ chuẩn") hay về THỜI HẠN (tính vào "đúng hạn") */
  kind: "content" | "timing";
}

export interface SheetForCompliance {
  /** null = học viên có mặt nhưng chưa có phiếu */
  status: SessionEvalStatus | null;
  /** Nhãn tiêu chí chưa chấm */
  missingCriteria: readonly string[];
  objectiveResult: ObjectiveResult | null;
  remark: string | null;
  productNote: string | null;
  publishedAt?: Date | null;
  /** Hạn hoàn thiện (bỏ trống = không xét hạn) */
  deadline?: Date | null;
}

export interface SheetCompliance {
  violations: SheetViolation[];
  /** Đủ nội dung theo chuẩn VÀ đã phát hành */
  contentOk: boolean;
  /** Phát hành trong hạn */
  onTime: boolean;
  /** Đã tới hạn (đã phát hành hoặc quá hạn) — chỉ phiếu đã tới hạn mới tính vào tỷ lệ */
  due: boolean;
  /** Đủ chuẩn và đúng hạn */
  compliant: boolean;
}

const tlen = (s: string | null | undefined) => (s ?? "").trim().length;

/**
 * Đánh giá một phiếu theo chuẩn: danh sách vi phạm có mã + câu tiếng Việt.
 * Cùng quy tắc với truy vấn tổng hợp ở `packages/api/src/services/portfolioStandard.ts` (SQL).
 */
export function evaluateSheetCompliance(sheet: SheetForCompliance, standard: PortfolioStandard, now: Date = new Date()): SheetCompliance {
  const v: SheetViolation[] = [];
  const dl = sheet.deadline ?? null;
  const published = sheet.status === "published";
  if (!sheet.status) {
    v.push({ code: "no_sheet", message: "Chưa có phiếu nhận xét", kind: "content" });
  } else {
    if (sheet.missingCriteria.length && !published) v.push({ code: "criteria_missing", message: `Chưa chấm ${sheet.missingCriteria.join(", ")}`, kind: "content" });
    if (standard.requireObjectiveResult && !sheet.objectiveResult) v.push({ code: "objective_missing", message: "Chưa chọn kết quả mục tiêu bài", kind: "content" });
    const rl = tlen(sheet.remark);
    if (standard.remarkMinLength > 0 && rl < standard.remarkMinLength) {
      v.push({ code: "remark_short", message: rl ? `Nhận xét mới ${rl}/${standard.remarkMinLength} ký tự` : "Chưa có nhận xét cho phụ huynh", kind: "content" });
    }
    if (standard.requireProductNote && !tlen(sheet.productNote)) v.push({ code: "product_missing", message: "Chưa ghi sản phẩm của buổi", kind: "content" });
    if (!published) v.push({ code: "not_published", message: "Phiếu chưa phát hành (buổi chưa hoàn tất)", kind: "content" });
  }
  let onTime = published;
  let due = published;
  if (dl) {
    const st = deadlineState(dl, now, published ? sheet.publishedAt ?? null : null);
    if (st === "done_late") { onTime = false; v.push({ code: "late", message: `Phát hành trễ hạn (hạn ${fmtDeadlineVi(dl)})`, kind: "timing" }); }
    if (st === "overdue") { due = true; v.push({ code: "overdue", message: `Quá hạn hoàn thiện phiếu (hạn ${fmtDeadlineVi(dl)})`, kind: "timing" }); }
  }
  const contentOk = !v.some((x) => x.kind === "content");
  return { violations: v, contentOk, onTime, due, compliant: contentOk && onTime };
}

/** Học viên có bằng chứng của buổi: có ảnh đã chọn hoặc có ghi sản phẩm */
export function hasEvidence(x: { mediaCount: number; productNote: string | null | undefined }): boolean {
  return x.mediaCount > 0 || tlen(x.productNote) > 0;
}

/** Tỷ lệ bằng chứng của một buổi đạt ngưỡng chưa; null = đạt (hoặc không bắt) */
export function sessionEvidenceViolation(x: { present: number; withEvidence: number }, standard: PortfolioStandard): string | null {
  if (standard.minEvidenceRatePct <= 0 || x.present <= 0) return null;
  if (x.withEvidence * 100 >= standard.minEvidenceRatePct * x.present) return null;
  return `Mới ${x.withEvidence}/${x.present} học viên có ảnh / sản phẩm (cần ≥ ${standard.minEvidenceRatePct}%)`;
}

/* ------------------------------------------------------------------ */
/* 4. Điểm đạt chuẩn hồ sơ                                             */
/* ------------------------------------------------------------------ */

export interface ComplianceCounts {
  /** Phiếu đã tới hạn (đã phát hành hoặc quá hạn) */
  sheetsDue: number;
  /** …trong đó đủ nội dung theo chuẩn */
  sheetsContentOk: number;
  /** …trong đó phát hành đúng hạn */
  sheetsOnTime: number;
  /** Buổi có học viên có mặt / buổi đạt tỷ lệ bằng chứng */
  sessions: number;
  sessionsEvidenceOk: number;
  /** Học bạ mốc đã tới hạn / đã viết đúng hạn */
  milestonesDue: number;
  milestonesOnTime: number;
}

export interface ComplianceScore {
  /** % phiếu đủ chuẩn (null = chưa có phiếu tới hạn) */
  sheetPct: number | null;
  onTimePct: number | null;
  evidencePct: number | null;
  milestonePct: number | null;
  /** Điểm tổng 0–100: trung bình có trọng số các phần có dữ liệu (phiếu 50 · đúng hạn 20 · bằng chứng 15 · học bạ 15) */
  score: number | null;
  /** Hồ sơ đạt chuẩn: % phiếu đủ chuẩn (đã tới hạn) ≥ ngưỡng `profileMinSheetPct` */
  meetsStandard: boolean;
  /** Còn học bạ mốc chưa viết đúng hạn */
  milestoneLate: boolean;
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

export function portfolioComplianceScore(c: ComplianceCounts, standard: PortfolioStandard): ComplianceScore {
  const sheetPct = pct(c.sheetsContentOk, c.sheetsDue);
  const onTimePct = pct(c.sheetsOnTime, c.sheetsDue);
  const evidencePct = standard.minEvidenceRatePct > 0 ? pct(c.sessionsEvidenceOk, c.sessions) : null;
  const milestonePct = pct(c.milestonesOnTime, c.milestonesDue);
  const parts: [number | null, number][] = [[sheetPct, 50], [onTimePct, 20], [evidencePct, 15], [milestonePct, 15]];
  const used = parts.filter((p): p is [number, number] => p[0] != null);
  const w = used.reduce((a, p) => a + p[1], 0);
  const score = w ? Math.round(used.reduce((a, p) => a + p[0] * p[1], 0) / w) : null;
  const meetsStandard = sheetPct != null && sheetPct >= standard.profileMinSheetPct;
  return { sheetPct, onTimePct, evidencePct, milestonePct, score, meetsStandard, milestoneLate: c.milestonesOnTime < c.milestonesDue };
}

/** Ngưỡng cảnh báo trên bảng quản lý (dòng dưới 90% tô cảnh báo) */
export const COMPLIANCE_WARN_PCT = 90;

/* ------------------------------------------------------------------ */
/* 5. Rubric có mô tả mức, nhóm tiêu chí, tiêu chí trọng tâm           */
/* ------------------------------------------------------------------ */

export const LEVEL_DESCRIPTOR_MIN = 5;
export const LEVEL_DESCRIPTOR_MAX = 300;
export const CRITERION_NAME_MAX = 120;
export const CRITERION_GROUP_MAX = 60;

/** Gợi ý nhóm tiêu chí */
export const CRITERION_GROUP_SUGGESTIONS: readonly string[] = ["Thiết kế & lắp ráp", "Lập trình & tư duy", "Kiến thức & kỹ năng", "Thái độ & kỹ năng mềm"];

/** Đọc JSONB `level_descriptors`: đúng 4 chuỗi (cắt khoảng trắng); sai hình dạng → null */
export function normalizeLevelDescriptors(x: unknown): string[] | null {
  if (!Array.isArray(x) || x.length !== RUBRIC_SCALE) return null;
  if (!x.every((v) => typeof v === "string")) return null;
  const out = (x as string[]).map((v) => v.trim());
  return out.every((v) => v.length > 0) ? out : null;
}

/** Kiểm tra 4 mô tả mức khi quản trị lưu tiêu chí; rỗng = hợp lệ. Cho phép bỏ trống cả 4 (dùng mô tả mặc định) */
export function validateLevelDescriptors(x: readonly string[] | null | undefined): string[] {
  if (x == null) return [];
  const t = x.map((v) => (v ?? "").trim());
  if (t.every((v) => !v)) return [];
  const errs: string[] = [];
  if (t.length !== RUBRIC_SCALE) return [`Cần đúng ${RUBRIC_SCALE} mô tả mức (mức 1 → ${RUBRIC_SCALE})`];
  t.forEach((v, i) => {
    if (!v) errs.push(`Chưa có mô tả mức ${i + 1}`);
    else if (v.length < LEVEL_DESCRIPTOR_MIN) errs.push(`Mô tả mức ${i + 1} quá ngắn (tối thiểu ${LEVEL_DESCRIPTOR_MIN} ký tự)`);
    else if (v.length > LEVEL_DESCRIPTOR_MAX) errs.push(`Mô tả mức ${i + 1} tối đa ${LEVEL_DESCRIPTOR_MAX} ký tự`);
  });
  const filled = t.filter(Boolean).map((v) => v.toLowerCase());
  if (new Set(filled).size !== filled.length) errs.push("Mỗi mức cần một mô tả khác nhau (mô tả hành vi quan sát được ở mức đó)");
  if (t.some((v) => /\b(kém|dốt|yếu kém|lười)\b/i.test(v))) errs.push("Dùng ngôn từ tích cực, không dùng từ \"kém\", \"lười\"…");
  return errs;
}

/** Kiểm tra một tiêu chí khi lưu */
export function validateCriterion(c: { name: string; groupName?: string | null; description?: string | null; levelDescriptors?: readonly string[] | null }): string[] {
  const errs: string[] = [];
  const n = c.name.trim();
  if (n.length < 3) errs.push("Tên tiêu chí tối thiểu 3 ký tự");
  if (n.length > CRITERION_NAME_MAX) errs.push(`Tên tiêu chí tối đa ${CRITERION_NAME_MAX} ký tự`);
  if ((c.groupName ?? "").trim().length > CRITERION_GROUP_MAX) errs.push(`Tên nhóm tối đa ${CRITERION_GROUP_MAX} ký tự`);
  if ((c.description ?? "").trim().length > 500) errs.push("Mô tả tiêu chí tối đa 500 ký tự");
  return [...errs, ...validateLevelDescriptors(c.levelDescriptors)];
}

/**
 * Xếp tiêu chí của phiếu: tiêu chí TRỌNG TÂM của bài lên đầu (giữ thứ tự gốc trong từng phần),
 * đánh dấu `focus`. Bài không khai trọng tâm → giữ nguyên, không đánh dấu.
 */
export function orderCriteriaWithFocus<T extends { id: string | null }>(criteria: readonly T[], focusIds: readonly string[]): (T & { focus: boolean })[] {
  const f = new Set(focusIds);
  const marked = criteria.map((c) => ({ ...c, focus: !!c.id && f.has(c.id) }));
  return [...marked.filter((c) => c.focus), ...marked.filter((c) => !c.focus)];
}

/** Một tiêu chí trong bộ mẫu */
export interface CriterionTemplate {
  name: string;
  groupName: string;
  description: string;
  levelDescriptors: [string, string, string, string];
}

/**
 * BỘ MẪU GỢI Ý cho robotics / lập trình (8 tiêu chí, 3 nhóm): mô tả HÀNH VI QUAN SÁT ĐƯỢC cho từng mức,
 * ngôn từ tích cực — theo hai nhóm Thiết kế / Lắp ráp và Lập trình / Tư duy của nghiên cứu rubric robotics
 * (Frontiers in Education, 2024) + nhóm Thái độ & kỹ năng mềm.
 */
export const CRITERIA_TEMPLATE_ROBOTICS: readonly CriterionTemplate[] = [
  {
    name: "Lắp ráp mô hình", groupName: "Thiết kế & lắp ráp", description: "Đọc hình hướng dẫn, chọn đúng chi tiết, lắp chắc chắn",
    levelDescriptors: [
      "Nhận biết được các chi tiết chính; lắp từng bước khi thầy cô làm mẫu bên cạnh.",
      "Lắp được theo hình hướng dẫn khi được chỉ bước khó; mô hình còn lỏng một vài chỗ.",
      "Tự đọc hình, lắp đúng và chắc chắn mô hình của bài trong thời gian buổi học.",
      "Lắp nhanh, gọn, chắc chắn; tự kiểm tra và giúp bạn tìm chi tiết lắp sai.",
    ],
  },
  {
    name: "Thiết kế & cải tiến", groupName: "Thiết kế & lắp ráp", description: "Đề xuất, thử và cải tiến thiết kế cho mô hình",
    levelDescriptors: [
      "Làm theo mẫu có sẵn; bắt đầu nói được mô hình dùng để làm gì.",
      "Đề xuất được một thay đổi nhỏ cho mô hình khi thầy cô gợi ý.",
      "Tự đề xuất và thử một thay đổi giúp mô hình chạy tốt hơn.",
      "Thử nhiều phương án, so sánh kết quả và giải thích vì sao chọn thiết kế cuối.",
    ],
  },
  {
    name: "Tư duy lập trình", groupName: "Lập trình & tư duy", description: "Ghép khối lệnh / viết chương trình theo yêu cầu bài",
    levelDescriptors: [
      "Kéo thả được khối lệnh đơn giản khi thầy cô làm mẫu từng bước.",
      "Ghép được chương trình theo mẫu khi có gợi ý thứ tự lệnh.",
      "Tự viết chương trình chạy đúng yêu cầu của bài.",
      "Tự dùng vòng lặp / điều kiện để chương trình gọn hơn và làm thêm yêu cầu mở rộng.",
    ],
  },
  {
    name: "Gỡ lỗi & giải quyết vấn đề", groupName: "Lập trình & tư duy", description: "Tìm nguyên nhân khi robot chạy chưa đúng và sửa",
    levelDescriptors: [
      "Nhận ra robot chạy chưa đúng; cần thầy cô chỉ chỗ lỗi.",
      "Tìm được lỗi khi thầy cô gợi ý nên kiểm tra phần nào.",
      "Tự thử – sai để tìm và sửa lỗi của chương trình hoặc mô hình.",
      "Giải thích được nguyên nhân lỗi, sửa gọn và chia sẻ cách sửa cho bạn.",
    ],
  },
  {
    name: "Cảm biến & điều khiển", groupName: "Lập trình & tư duy", description: "Hiểu và dùng cảm biến, động cơ trong bài",
    levelDescriptors: [
      "Gọi đúng tên cảm biến / động cơ của bài khi được hỏi.",
      "Dùng được cảm biến theo chương trình mẫu có sẵn.",
      "Tự dùng giá trị cảm biến để điều khiển robot theo yêu cầu bài.",
      "Tự chỉnh ngưỡng cảm biến cho phù hợp sa bàn và giải thích cách robot phản ứng.",
    ],
  },
  {
    name: "Hợp tác nhóm", groupName: "Thái độ & kỹ năng mềm", description: "Chia việc, lắng nghe và hỗ trợ bạn",
    levelDescriptors: [
      "Đang làm quen làm việc cùng bạn; thường làm riêng phần của mình.",
      "Tham gia việc chung khi được thầy cô nhắc và phân công.",
      "Chủ động chia việc, lắng nghe ý kiến và cùng bạn hoàn thành sản phẩm.",
      "Điều phối nhóm, động viên và hướng dẫn được bạn còn chậm.",
    ],
  },
  {
    name: "Trình bày sản phẩm", groupName: "Thái độ & kỹ năng mềm", description: "Giới thiệu sản phẩm, cách hoạt động trước lớp",
    levelDescriptors: [
      "Giới thiệu được tên sản phẩm khi thầy cô hỏi.",
      "Kể được sản phẩm làm gì khi có câu hỏi gợi ý.",
      "Tự tin giới thiệu sản phẩm và cách robot hoạt động trước lớp.",
      "Trình bày mạch lạc, trả lời được câu hỏi của bạn và nêu ý tưởng cải tiến.",
    ],
  },
  {
    name: "Tập trung & kiên trì", groupName: "Thái độ & kỹ năng mềm", description: "Theo dõi bài, bền bỉ khi gặp khó",
    levelDescriptors: [
      "Tập trung trong thời gian ngắn; cần thầy cô nhắc quay lại bài.",
      "Theo được phần lớn buổi học khi được nhắc; dễ nản khi gặp khó.",
      "Tập trung suốt buổi và cố gắng hoàn thành bài dù gặp khó.",
      "Bền bỉ thử nhiều cách tới khi xong, còn tự đặt thêm thử thách cho mình.",
    ],
  },
];

/* ------------------------------------------------------------------ */
/* 6. Danh mục "Buổi này cần hoàn thiện" (màn giáo viên)               */
/* ------------------------------------------------------------------ */

export interface TodoStudent {
  id: string;
  name: string;
  /** Trạng thái điểm danh đang hiển thị (kể cả chưa lưu); null = chưa điểm danh */
  attendance: string | null;
  /** Điểm danh đã LƯU chưa (bỏ trống = suy từ `attendance`) — mục "Điểm danh xong" chỉ tính bản đã lưu */
  attendanceSaved?: boolean;
  published: boolean;
  scores: Record<string, number | null | undefined>;
  objectiveResult: ObjectiveResult | null;
  remark: string;
  productNote: string;
  mediaCount: number;
}

export type TodoKey = "attendance" | "criteria" | "objective" | "remark" | "product" | "evidence" | "note";

export interface TodoItem {
  key: TodoKey;
  label: string;
  done: number;
  total: number;
  ok: boolean;
  /** Bắt buộc để phát hành / hoàn tất (theo chuẩn) hay chỉ tính vào tỷ lệ đạt chuẩn */
  required: boolean;
  /** Học viên còn thiếu (bấm để cuộn tới) */
  missing: { id: string; name: string }[];
  /** Nơi cuộn tới: dòng điểm danh, phiếu học viên hay ô nhận xét chung */
  target: "attendance" | "sheet" | "note";
  hint?: string;
}

/**
 * Danh mục việc cần xong của một buổi — tự tính, cập nhật trực tiếp khi GV chấm.
 * Phiếu đã phát hành tính là xong các mục nội dung đã khoá (tiêu chí, mục tiêu bài).
 */
export function sessionTodoList(input: {
  students: readonly TodoStudent[];
  criteriaKeys: readonly string[];
  hasSessionNote: boolean;
  standard: PortfolioStandard;
}): TodoItem[] {
  const st = input.standard;
  const all = input.students;
  const present = all.filter((s) => s.attendance == null || isEvaluableAttendance(s.attendance));
  const item = (key: TodoKey, label: string, pool: readonly TodoStudent[], pass: (s: TodoStudent) => boolean, required: boolean, target: TodoItem["target"], hint?: string): TodoItem => {
    const miss = pool.filter((s) => !pass(s));
    return { key, label, done: pool.length - miss.length, total: pool.length, ok: miss.length === 0, required, missing: miss.map((s) => ({ id: s.id, name: s.name })), target, hint };
  };
  const out: TodoItem[] = [
    item("attendance", "Điểm danh xong", all, (s) => s.attendanceSaved ?? s.attendance != null, true, "attendance"),
    item("criteria", "Đủ tiêu chí cho mỗi học viên có mặt", present, (s) => s.published || input.criteriaKeys.every((k) => s.scores[k] != null), true, "sheet"),
  ];
  if (st.requireObjectiveResult) {
    out.push(item("objective", "Đã chọn kết quả mục tiêu bài", present, (s) => s.published || !!s.objectiveResult, true, "sheet", Object.values(OBJECTIVE_RESULT_VI).join(" · ")));
  }
  if (st.remarkMinLength > 0) {
    out.push(item("remark", `Nhận xét cho phụ huynh ≥ ${st.remarkMinLength} ký tự`, present, (s) => tlen(s.remark) >= st.remarkMinLength, false, "sheet"));
  }
  if (st.requireProductNote) out.push(item("product", "Đã ghi sản phẩm của buổi", present, (s) => tlen(s.productNote) > 0, true, "sheet"));
  {
    const ev = item("evidence", "Học viên có ảnh / sản phẩm", present, (s) => hasEvidence({ mediaCount: s.mediaCount, productNote: s.productNote }), false, "sheet");
    const need = st.minEvidenceRatePct;
    const ok = need <= 0 || ev.total === 0 || ev.done * 100 >= need * ev.total;
    out.push({ ...ev, ok, hint: need > 0 ? `cần ≥ ${need}%` : "không bắt buộc" });
  }
  out.push({ key: "note", label: "Nhận xét chung của buổi", done: input.hasSessionNote ? 1 : 0, total: 1, ok: input.hasSessionNote, required: true, missing: [], target: "note" });
  return out;
}
