import type { AttendanceRecord, AttendanceStatus } from "../types.js";

/** Trạng thái được tính là "có tham gia" khi tính chuyên cần */
export const ATTENDED: readonly AttendanceStatus[] = ["present", "late", "makeup"];

export interface AttendanceSummary {
  total: number;
  attended: number;
  present: number;
  late: number;
  excused: number;
  unexcused: number;
  makeup: number;
  /** 0..1, = attended / total (0 nếu total = 0) */
  rate: number;
  /** Số buổi vắng chưa được học bù (excused + unexcused − makeup, không âm) */
  pendingMakeup: number;
}

export function summarize(records: AttendanceRecord[]): AttendanceSummary {
  const s: AttendanceSummary = {
    total: records.length,
    attended: 0,
    present: 0,
    late: 0,
    excused: 0,
    unexcused: 0,
    makeup: 0,
    rate: 0,
    pendingMakeup: 0,
  };
  for (const r of records) {
    if (ATTENDED.includes(r.status)) s.attended++;
    switch (r.status) {
      case "present":
        s.present++;
        break;
      case "late":
        s.late++;
        break;
      case "absent_excused":
        s.excused++;
        break;
      case "absent_unexcused":
        s.unexcused++;
        break;
      case "makeup":
        s.makeup++;
        break;
    }
  }
  s.rate = s.total === 0 ? 0 : s.attended / s.total;
  s.pendingMakeup = Math.max(0, s.excused + s.unexcused - s.makeup);
  return s;
}

/**
 * Số buổi đã "tiêu thụ" khỏi gói học (dùng cho công nợ/hoàn tiền/sắp hết khoá).
 * Quy ước Sata Robo: vắng không phép vẫn tính buổi; vắng có phép được bảo lưu
 * nếu chưa quá hạn học bù — ở đây tham số hoá để cấu hình được.
 */
export function sessionsConsumed(
  records: AttendanceRecord[],
  opts: { countExcusedAbsence: boolean } = { countExcusedAbsence: false },
): number {
  let n = 0;
  for (const r of records) {
    if (r.status === "present" || r.status === "late" || r.status === "absent_unexcused") n++;
    else if (r.status === "absent_excused" && opts.countExcusedAbsence) n++;
    // makeup không tính thêm: nó bù cho một buổi vắng đã/sẽ tính
  }
  return n;
}

export interface RiskSignal {
  code: "CONSECUTIVE_ABSENCE" | "LOW_ATTENDANCE" | "PENDING_MAKEUP";
  severity: 1 | 2 | 3; // 1 = cao nhất
  detail: string;
}

export interface RiskThresholds {
  consecutiveAbsences: number; // mặc định 2
  minRate: number; // mặc định 0.8
  maxPendingMakeup: number; // mặc định 2
}

export const DEFAULT_RISK: RiskThresholds = { consecutiveAbsences: 2, minRate: 0.8, maxPendingMakeup: 2 };

/**
 * Rule engine tối giản cho "Cảnh báo rủi ro HV" — thay cho logic cứng trong UI cũ.
 * records phải được sắp theo sequenceNo tăng dần.
 */
export function detectRisks(records: AttendanceRecord[], t: RiskThresholds = DEFAULT_RISK): RiskSignal[] {
  const sorted = [...records].sort((a, b) => a.sequenceNo - b.sequenceNo);
  const out: RiskSignal[] = [];

  // Vắng liên tiếp tính từ buổi gần nhất về trước
  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const st = sorted[i]!.status;
    if (st === "absent_excused" || st === "absent_unexcused") streak++;
    else break;
  }
  if (streak >= t.consecutiveAbsences) {
    out.push({ code: "CONSECUTIVE_ABSENCE", severity: 1, detail: `Nghỉ ${streak} buổi liên tiếp` });
  }

  const s = summarize(sorted);
  if (s.total >= 4 && s.rate < t.minRate) {
    out.push({ code: "LOW_ATTENDANCE", severity: 2, detail: `Chuyên cần ${Math.round(s.rate * 100)}%` });
  }
  if (s.pendingMakeup > t.maxPendingMakeup) {
    out.push({ code: "PENDING_MAKEUP", severity: 3, detail: `${s.pendingMakeup} buổi chưa học bù` });
  }
  return out;
}
