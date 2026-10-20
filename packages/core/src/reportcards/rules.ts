/**
 * Học bạ theo chuẩn TH STEAM: mỗi HỌC PHẦN 15 buổi kết thúc bằng buổi báo cáo (buổi 15) — đó là mốc học bạ.
 * Một năm học 45 buổi = 3 học phần → 3 mốc (buổi 15, 30, 45); khoá luyện thi 30 buổi → 2 mốc.
 * GV viết → gửi duyệt → giáo vụ duyệt hoặc trả lại (kèm lý do) → gửi PH.
 */
export const REPORT_CARD_STATUSES = ["draft", "submitted", "returned", "approved", "published"] as const;
export type ReportCardStatus = (typeof REPORT_CARD_STATUSES)[number];
export type ReportCardEvent = "save" | "submit" | "approve" | "return" | "publish";

export const REPORT_CARD_STATUS_VI: Record<ReportCardStatus, string> = {
  draft: "Nháp",
  submitted: "Chờ duyệt",
  returned: "Trả lại sửa",
  approved: "Đã duyệt",
  published: "Đã gửi PH",
};

const T: Record<ReportCardStatus, Partial<Record<ReportCardEvent, ReportCardStatus>>> = {
  draft: { save: "draft", submit: "submitted" },
  returned: { save: "returned", submit: "submitted" },
  submitted: { approve: "approved", return: "returned" },
  approved: { publish: "published", return: "returned" },
  published: {},
};

export class ReportCardTransitionError extends Error {
  constructor(public readonly from: ReportCardStatus, public readonly event: ReportCardEvent) {
    super(`Học bạ đang "${REPORT_CARD_STATUS_VI[from]}" — không thể thực hiện thao tác này`);
    this.name = "ReportCardTransitionError";
  }
}

export function reportCardTransition(from: ReportCardStatus, event: ReportCardEvent): ReportCardStatus {
  const to = T[from]?.[event];
  if (!to) throw new ReportCardTransitionError(from, event);
  return to;
}

export interface MilestonePolicy {
  termLength: number;
  checkpoints: number[]; // vị trí trong kỳ
}
/** Một học phần = 15 buổi; mốc học bạ là buổi báo cáo cuối học phần */
export const MODULE_LENGTH = 15;
export const DEFAULT_MILESTONES: MilestonePolicy = { termLength: MODULE_LENGTH, checkpoints: [MODULE_LENGTH] };

/** Các buổi mốc học bạ của một khoá (vd 45 buổi → 15, 30, 45). Khoá không chia hết 15 có thêm mốc ở buổi cuối */
export function reportCardMilestones(totalSessions: number, p: MilestonePolicy = DEFAULT_MILESTONES): number[] {
  const out: number[] = [];
  for (let start = 0; start < totalSessions; start += p.termLength) {
    for (const c of p.checkpoints) {
      const seq = start + c;
      if (seq <= totalSessions) out.push(seq);
    }
  }
  if (totalSessions > 0 && !out.includes(totalSessions)) out.push(totalSessions);
  return out;
}

/** Kỳ và loại mốc của một buổi: { term: 1, kind: "mid" | "end" } */
export function milestoneInfo(seq: number, p: MilestonePolicy = DEFAULT_MILESTONES): { term: number; kind: "mid" | "end" } {
  const term = Math.floor((seq - 1) / p.termLength) + 1;
  const pos = seq - (term - 1) * p.termLength;
  return { term, kind: pos >= Math.max(...p.checkpoints) ? "end" : "mid" };
}

export function milestoneLabel(seq: number, p: MilestonePolicy = DEFAULT_MILESTONES): string {
  const m = milestoneInfo(seq, p);
  if (p.checkpoints.length === 1) return `HP${m.term} · Báo cáo cuối khoá (buổi ${seq})`;
  return `Kỳ ${m.term} · ${m.kind === "mid" ? "giữa kỳ" : "cuối kỳ"} (buổi ${seq})`;
}

export const SCORE_MIN = 1;
export const SCORE_MAX = 5;
export const SCORE_VI: Record<number, string> = { 1: "Cần cố gắng", 2: "Đang tiến bộ", 3: "Đạt", 4: "Tốt", 5: "Xuất sắc" };

export interface ScoreInput { criterionId: string; score: number | null }

/** Kiểm tra trước khi gửi duyệt: đủ điểm mọi tiêu chí đang dùng + nhận xét tối thiểu */
/**
 * `scale`: thang điểm của học bạ — 3 với học bạ hiện hành (Cần cố gắng / Đạt / Tốt), 4 hoặc 5 với học bạ cũ.
 */
export function validateReportCard(input: { scores: ScoreInput[]; activeCriteria: string[]; comment: string | null; scale?: number }, minComment = 20): string[] {
  const max = input.scale ?? SCORE_MAX;
  const errs: string[] = [];
  const given = new Map(input.scores.map((s) => [s.criterionId, s.score]));
  const missing = input.activeCriteria.filter((c) => {
    const v = given.get(c);
    return v === null || v === undefined;
  });
  if (missing.length) errs.push(`Còn ${missing.length} tiêu chí chưa chấm`);
  if (input.scores.some((s) => s.score !== null && (s.score < SCORE_MIN || s.score > max || !Number.isInteger(s.score)))) errs.push(`Điểm phải là số nguyên từ 1 đến ${max}`);
  if ((input.comment ?? "").trim().length < minComment) errs.push(`Nhận xét tối thiểu ${minComment} ký tự`);
  return errs;
}

export function averageScore(scores: (number | null)[]): number | null {
  const v = scores.filter((s): s is number => typeof s === "number");
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}

/**
 * Mức hoàn thành khoá (năm học / khoá luyện thi), cùng cách gọi với Thông tư 27/2020/TT-BGDĐT:
 * "Hoàn thành tốt" hoặc "Hoàn thành". Không xếp hạng "Xuất sắc / Giỏi / Khá".
 */
export const COMPLETION_GRADES = ["Hoàn thành tốt", "Hoàn thành"] as const;
export type CompletionGrade = (typeof COMPLETION_GRADES)[number];

/**
 * Mức hoàn thành từ điểm trung bình tiêu chí ĐÃ QUY VỀ THANG 5 (`normalizeTo5`):
 * ≥ 4,0 (≈ trung bình thang 3 từ 2,5 — đa số tiêu chí ở mức Tốt) → "Hoàn thành tốt"; còn lại "Hoàn thành".
 */
export function gradeFromAverage(avg: number | null): CompletionGrade {
  if (avg === null || !Number.isFinite(avg)) return "Hoàn thành";
  return avg >= 4 ? "Hoàn thành tốt" : "Hoàn thành";
}

/** Số chứng nhận: TH-ROBO-TH-N1-26-000123 */
export function certificateNumber(courseCode: string, year: number, seq: number): string {
  return `TH-${courseCode.toUpperCase()}-${String(year).slice(-2)}-${String(seq).padStart(6, "0")}`;
}

/** Điều kiện hoàn thành khoá: còn đang học/học thử; cảnh báo nếu học chưa đủ gói */
export function completionCheck(e: { status: string; consumed: number; packageSessions: number }): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (e.status !== "active") errors.push(e.status === "completed" ? "Đã hoàn thành khoá trước đó" : "Chỉ hoàn thành khoá cho học viên đang học");
  if (e.consumed < e.packageSessions) warnings.push(`Mới học ${e.consumed}/${e.packageSessions} buổi`);
  return { ok: errors.length === 0, errors, warnings };
}

/* ------------------------------------------------------------------ */
/* Hoàn thành khoá theo luồng đề xuất (GV đề xuất → quản lý duyệt)      */
/* ------------------------------------------------------------------ */

export const COMPLETION_STATUSES = ["proposed", "approved", "rejected"] as const;
export type CompletionStatus = (typeof COMPLETION_STATUSES)[number];
export type CompletionEvent = "approve" | "reject";

export const COMPLETION_STATUS_VI: Record<CompletionStatus, string> = {
  proposed: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
};

export class CompletionTransitionError extends Error {
  constructor(public readonly from: CompletionStatus, public readonly event: CompletionEvent) {
    super(`Đề xuất hoàn thành khoá đang "${COMPLETION_STATUS_VI[from]}" — không thể ${event === "approve" ? "duyệt" : "từ chối"}`);
    this.name = "CompletionTransitionError";
  }
}

/** Chỉ đề xuất đang chờ mới duyệt / từ chối được; từ chối bắt buộc lý do */
export function completionTransition(from: CompletionStatus, event: CompletionEvent): CompletionStatus {
  if (from !== "proposed") throw new CompletionTransitionError(from, event);
  return event === "approve" ? "approved" : "rejected";
}

/** Chứng nhận chỉ sinh khi bản ghi hoàn thành khoá được duyệt */
export function certificateIssuable(status: CompletionStatus): boolean {
  return status === "approved";
}

/** Kiểm tra nội dung đề xuất trước khi ghi (dùng chung cho đề xuất và hoàn thành trực tiếp) */
export function validateCompletionInput(input: { grade: string; teacherEvaluation: string }, minEvaluation = 20): string[] {
  const errs: string[] = [];
  if (input.grade.trim().length < 2) errs.push("Chọn xếp loại cuối khoá");
  if (input.teacherEvaluation.trim().length < minEvaluation) errs.push(`Đánh giá cuối khoá tối thiểu ${minEvaluation} ký tự`);
  return errs;
}
