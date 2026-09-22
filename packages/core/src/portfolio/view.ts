/**
 * Dữ liệu hiển thị của HỒ SƠ HỌC TẬP — dùng chung cho trang quản trị, cổng phụ huynh,
 * trang chia sẻ công khai `/hs/<token>` và bản in PDF.
 *
 * CHỈ gồm những gì in trên hồ sơ: KHÔNG có SĐT / email / địa chỉ phụ huynh, KHÔNG ghi chú nội bộ
 * (private_note), KHÔNG lý do vắng. Ngày giờ là chuỗi ISO để truyền an toàn máy chủ ↔ trình duyệt.
 */
import type { ObjectiveResult, SessionEvalSnapshot, SessionEvalStatus } from "./rubric.js";
import type { MilestoneAggregate } from "./aggregate.js";
import type { ProgressPoint } from "./chart.js";

export interface PortfolioMedia {
  id: string;
  url: string;
  caption: string | null;
  date: string | null;
}

export interface SessionSheetView {
  id: string;
  status: SessionEvalStatus;
  revision: number;
  publishedAt: string | null;
  snapshot: SessionEvalSnapshot;
  objectiveResult: ObjectiveResult | null;
  highlights: string[];
  productNote: string | null;
  remark: string | null;
  media: PortfolioMedia[];
  average: number | null;
  center: { name: string; address: string | null; phone: string | null } | null;
}

export interface MilestoneCardView {
  id: string;
  milestoneSeq: number;
  label: string;
  publishedAt: string | null;
  scale: number;
  scores: { label: string; score: number | null; comment: string | null; average: number | null; trend: "up" | "flat" | "down" | null }[];
  average: number | null;
  teacherComment: string | null;
  strengths: string | null;
  improvements: string | null;
  aggregate: MilestoneAggregate | null;
  className: string | null;
  courseName: string | null;
  studentName: string;
  authorName: string | null;
}

export interface PortfolioCertificate {
  certificateNo: string;
  grade: string;
  issuedAt: string | null;
  courseName: string;
}

export interface PortfolioAttendance {
  present: number;
  late: number;
  makeup: number;
  excused: number;
  absent: number;
  total: number;
  /** Tỷ lệ có mặt (có mặt + muộn + bù) / tổng, 0–1; null khi chưa có buổi */
  rate: number | null;
}

export interface PortfolioCourseView {
  enrollmentId: string;
  courseCode: string;
  courseName: string;
  courseLevel: string | null;
  className: string;
  classCode: string;
  centerName: string;
  status: string;
  statusLabel: string;
  from: string | null;
  to: string | null;
  attendance: PortfolioAttendance;
  sheets: SessionSheetView[];
  milestones: MilestoneCardView[];
  certificate: PortfolioCertificate | null;
  /** Năng lực trung bình của khoá (mạng nhện) */
  radar: { label: string; value: number | null }[];
  average: number | null;
}

export interface PortfolioView {
  student: { fullName: string; code: string | null; grade: number | null };
  center: { name: string; address: string | null; phone: string | null } | null;
  scopeLabel: string;
  period: { from: string | null; to: string | null };
  generatedAt: string;
  courses: PortfolioCourseView[];
  progress: ProgressPoint[];
  attendance: PortfolioAttendance;
  certificates: PortfolioCertificate[];
  gallery: (PortfolioMedia & { courseName: string })[];
  totals: { sheets: number; milestones: number; courses: number; average: number | null };
}

/** Tổng hợp chuyên cần từ danh sách trạng thái điểm danh */
export function tallyAttendance(statuses: readonly (string | null | undefined)[]): PortfolioAttendance {
  const t: PortfolioAttendance = { present: 0, late: 0, makeup: 0, excused: 0, absent: 0, total: 0, rate: null };
  for (const s of statuses) {
    if (!s) continue;
    t.total += 1;
    if (s === "present") t.present += 1;
    else if (s === "late") t.late += 1;
    else if (s === "makeup") t.makeup += 1;
    else if (s === "absent_excused") t.excused += 1;
    else if (s === "absent_unexcused") t.absent += 1;
  }
  t.rate = t.total ? Math.round(((t.present + t.late + t.makeup) / t.total) * 100) / 100 : null;
  return t;
}

export function sumAttendance(list: readonly PortfolioAttendance[]): PortfolioAttendance {
  const t: PortfolioAttendance = { present: 0, late: 0, makeup: 0, excused: 0, absent: 0, total: 0, rate: null };
  for (const a of list) {
    t.present += a.present; t.late += a.late; t.makeup += a.makeup; t.excused += a.excused; t.absent += a.absent; t.total += a.total;
  }
  t.rate = t.total ? Math.round(((t.present + t.late + t.makeup) / t.total) * 100) / 100 : null;
  return t;
}

/** Chia danh sách phiếu buổi thành từng cặp — bản in xếp 2 phiếu / trang A4 */
export function pairSheets<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}
