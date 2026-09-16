/**
 * Học bạ: mỗi kỳ (mặc định 12 buổi) có mốc nhận xét giữa kỳ (buổi 5) và cuối kỳ (buổi 12).
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
export const DEFAULT_MILESTONES: MilestonePolicy = { termLength: 12, checkpoints: [5, 12] };

/** Các buổi mốc học bạ của một khoá (vd 48 buổi → 5,12,17,24,29,36,41,48) */
export function reportCardMilestones(totalSessions: number, p: MilestonePolicy = DEFAULT_MILESTONES): number[] {
  const out: number[] = [];
  for (let start = 0; start < totalSessions; start += p.termLength) {
    for (const c of p.checkpoints) {
      const seq = start + c;
      if (seq <= totalSessions) out.push(seq);
    }
  }
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
  return `Kỳ ${m.term} · ${m.kind === "mid" ? "giữa kỳ" : "cuối kỳ"} (buổi ${seq})`;
}

export const SCORE_MIN = 1;
export const SCORE_MAX = 5;
export const SCORE_VI: Record<number, string> = { 1: "Cần cố gắng", 2: "Đang tiến bộ", 3: "Đạt", 4: "Tốt", 5: "Xuất sắc" };

export interface ScoreInput { criterionId: string; score: number | null }

/** Kiểm tra trước khi gửi duyệt: đủ điểm mọi tiêu chí đang dùng + nhận xét tối thiểu */
export function validateReportCard(input: { scores: ScoreInput[]; activeCriteria: string[]; comment: string | null }, minComment = 20): string[] {
  const errs: string[] = [];
  const given = new Map(input.scores.map((s) => [s.criterionId, s.score]));
  const missing = input.activeCriteria.filter((c) => {
    const v = given.get(c);
    return v === null || v === undefined;
  });
  if (missing.length) errs.push(`Còn ${missing.length} tiêu chí chưa chấm`);
  if (input.scores.some((s) => s.score !== null && (s.score < SCORE_MIN || s.score > SCORE_MAX || !Number.isInteger(s.score)))) errs.push("Điểm phải là số nguyên từ 1 đến 5");
  if ((input.comment ?? "").trim().length < minComment) errs.push(`Nhận xét tối thiểu ${minComment} ký tự`);
  return errs;
}

export function averageScore(scores: (number | null)[]): number | null {
  const v = scores.filter((s): s is number => typeof s === "number");
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}

/** Xếp loại cuối khoá từ điểm trung bình tiêu chí */
export function gradeFromAverage(avg: number | null): string {
  if (avg === null) return "Hoàn thành";
  if (avg >= 4.5) return "Xuất sắc";
  if (avg >= 3.5) return "Giỏi";
  if (avg >= 2.5) return "Khá";
  return "Hoàn thành";
}

/** Số chứng chỉ: SR-SATA4-26-000123 */
export function certificateNumber(courseCode: string, year: number, seq: number): string {
  return `SR-${courseCode.toUpperCase()}-${String(year).slice(-2)}-${String(seq).padStart(6, "0")}`;
}

/** Điều kiện hoàn thành khoá: còn đang học/học thử; cảnh báo nếu học chưa đủ gói */
export function completionCheck(e: { status: string; consumed: number; packageSessions: number }): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (e.status !== "active") errors.push(e.status === "completed" ? "Đã hoàn thành khoá trước đó" : "Chỉ hoàn thành khoá cho học viên đang học");
  if (e.consumed < e.packageSessions) warnings.push(`Mới học ${e.consumed}/${e.packageSessions} buổi`);
  return { ok: errors.length === 0, errors, warnings };
}
