/**
 * Lớp trải nghiệm nhiều buổi (bản gốc: "Lớp Trial").
 * Luồng: tạo lớp → thêm buổi → xếp học viên → điểm danh.
 *
 * Khác với `trialBookings` (xếp một lead vào MỘT buổi của lớp chính quy), lớp trải nghiệm là
 * một lớp riêng: tên lớp do hệ thống đặt từ cơ sở + khoá trải nghiệm, ngày/giờ/phòng/giáo viên
 * chọn theo TỪNG BUỔI, và mỗi học viên được xếp vào lớp là học TOÀN BỘ buổi của lớp
 * (kể cả buổi tạo sau). Đổi lịch / huỷ buổi bắt buộc ghi lý do (lý do gửi thẳng cho giáo viên).
 */
import type { ISODate } from "../types.js";

export const TRIAL_CLASS_STATUSES = ["open", "closed", "cancelled"] as const;
export type TrialClassStatus = (typeof TRIAL_CLASS_STATUSES)[number];
export const TRIAL_CLASS_STATUS_VI: Record<TrialClassStatus, string> = {
  open: "Đang mở",
  closed: "Đã đóng",
  cancelled: "Đã huỷ",
};

export const TRIAL_SESSION_STATUSES = ["scheduled", "done", "cancelled"] as const;
export type TrialSessionStatus = (typeof TRIAL_SESSION_STATUSES)[number];
export const TRIAL_SESSION_STATUS_VI: Record<TrialSessionStatus, string> = {
  scheduled: "Đã xếp",
  done: "Đã dạy",
  cancelled: "Đã huỷ",
};

export const TRIAL_ENROLLMENT_STATUSES = ["enrolled", "withdrawn"] as const;
export type TrialEnrollmentStatus = (typeof TRIAL_ENROLLMENT_STATUSES)[number];
export const TRIAL_ENROLLMENT_STATUS_VI: Record<TrialEnrollmentStatus, string> = {
  enrolled: "Đang học",
  withdrawn: "Đã rút",
};

export const TRIAL_ATTENDANCE_STATUSES = ["present", "absent", "late"] as const;
export type TrialAttendanceStatus = (typeof TRIAL_ATTENDANCE_STATUSES)[number];
export const TRIAL_ATTENDANCE_STATUS_VI: Record<TrialAttendanceStatus, string> = {
  present: "Có mặt",
  absent: "Vắng",
  late: "Đi muộn",
};

/** Trần số buổi một lớp trải nghiệm (chặn nhập nhầm; bản gốc thường 1–4 buổi) */
export const TRIAL_CLASS_MAX_SESSIONS = 20;
/** Sĩ số mặc định khi tạo lớp trải nghiệm */
export const TRIAL_CLASS_DEFAULT_CAPACITY = 12;

const DAU = "àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ";
const KHONG_DAU = "aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd";

/** Bỏ dấu tiếng Việt (tên lớp trải nghiệm trong bản gốc không dấu) */
export function stripDiacritics(s: string): string {
  let out = "";
  for (const ch of s) {
    const i = DAU.indexOf(ch.toLowerCase());
    if (i < 0) {
      out += ch;
      continue;
    }
    const plain = KHONG_DAU[i] ?? ch;
    out += ch === ch.toLowerCase() ? plain : plain.toUpperCase();
  }
  return out;
}

/**
 * Mã lớp trải nghiệm — quy ước bản gốc `TRIAL-CS2-26-008`
 * = TRIAL-<mã cơ sở>-<yy>-<số thứ tự 3 chữ số>.
 */
export function trialClassCode(centerCode: string, year: number, seq: number): string {
  return `TRIAL-${centerCode.trim().toUpperCase()}-${String(year).slice(-2)}-${String(seq).padStart(3, "0")}`;
}

/** Số thứ tự kế tiếp theo (cơ sở, năm) = max(seq) + 1 trong các mã đã có (mã nhập tay / lớp đã huỷ không gây trùng) */
export function nextTrialClassSeq(codes: readonly (string | null | undefined)[], centerCode: string, year: number): number {
  const prefix = trialClassCode(centerCode, year, 0).slice(0, -3);
  let max = 0;
  for (const c of codes) {
    const t = (c ?? "").trim().toUpperCase();
    if (!t.startsWith(prefix)) continue;
    const rest = t.slice(prefix.length);
    if (/^\d{1,6}$/.test(rest)) max = Math.max(max, Number(rest));
  }
  return max + 1;
}

/**
 * Tên lớp hệ thống tự đặt: `<CS>-<khoá>-Lop trial <số>` (bỏ dấu tiếng Việt).
 * Chưa chọn khoá trải nghiệm thì bỏ phần khoá.
 */
export function trialClassName(i: { centerCode: string; courseCode?: string | null; seq: number }): string {
  const center = stripDiacritics(i.centerCode.trim()).toUpperCase();
  const course = stripDiacritics((i.courseCode ?? "").trim()).toUpperCase();
  return [center, course, `Lop trial ${i.seq}`].filter(Boolean).join("-");
}

export interface RuleResult {
  ok: boolean;
  /** Lý do bị chặn (tiếng Việt) — rỗng khi ok */
  reason: string;
}

const OK: RuleResult = { ok: true, reason: "" };

/** Chỉ lớp đang mở mới thêm được buổi; có trần số buổi để chặn nhập nhầm. */
export function canAddTrialSession(c: { status: TrialClassStatus; sessionCount: number; maxSessions?: number }): RuleResult {
  const max = c.maxSessions ?? TRIAL_CLASS_MAX_SESSIONS;
  if (c.status === "cancelled") return { ok: false, reason: "Lớp trải nghiệm đã huỷ — không thêm buổi được" };
  if (c.status === "closed") return { ok: false, reason: "Lớp trải nghiệm đã đóng — mở lại lớp trước khi thêm buổi" };
  if (c.sessionCount >= max) return { ok: false, reason: `Lớp trải nghiệm tối đa ${max} buổi` };
  return OK;
}

/** Số chỗ còn lại của lớp trải nghiệm */
export function trialSeatsLeft(c: { capacity: number; enrolled: number }): number {
  return Math.max(0, c.capacity - c.enrolled);
}

/**
 * Xếp học viên vào lớp trải nghiệm: hết chỗ thì chặn, trừ khi `override`
 * (người dùng có quyền `trials:override-capacity`).
 */
export function canEnrollTrial(c: { capacity: number; enrolled: number; override?: boolean; status?: TrialClassStatus; sessionCount?: number }): RuleResult & { overridden: boolean } {
  const no = (reason: string) => ({ ok: false, reason, overridden: false });
  if (c.status && c.status !== "open") return no(`Lớp trải nghiệm đang ở trạng thái "${TRIAL_CLASS_STATUS_VI[c.status]}" — không xếp thêm học viên`);
  if (c.sessionCount !== undefined && c.sessionCount <= 0) return no("Lớp chưa có buổi nào — thêm buổi trước khi xếp học viên");
  if (trialSeatsLeft(c) <= 0) {
    if (!c.override) return no("Lớp đã đủ sĩ số — thêm nữa cần quyền vượt sĩ số");
    return { ok: true, reason: "", overridden: true };
  }
  return { ok: true, reason: "", overridden: false };
}

/**
 * Sửa / huỷ một buổi trải nghiệm: chặn buổi đã huỷ, đã dạy và buổi đã qua.
 * Trả về danh sách lỗi (rỗng = hợp lệ).
 */
export function validateTrialSessionChange(c: { date: ISODate; now: ISODate; status: TrialSessionStatus; newDate?: ISODate | null }): string[] {
  const errs: string[] = [];
  const today = c.now.slice(0, 10);
  if (c.status === "cancelled") errs.push("Buổi đã huỷ — không sửa được");
  else if (c.status === "done") errs.push("Buổi đã dạy xong — không sửa được");
  if (c.date < today) errs.push("Buổi đã qua — không sửa được");
  if (c.newDate && c.newDate < today) errs.push("Ngày mới không được lùi về quá khứ");
  return errs;
}
