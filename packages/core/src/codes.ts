/**
 * Mã lớp tương thích với quy ước hiện có "CS2.SATA6.26.003"
 * = <centerCode>.<courseCode>.<yy>.<seq 3 số>
 * Mã chỉ là NHÃN hiển thị; mọi quan hệ dùng UUID.
 */
export function buildClassCode(centerCode: string, courseCode: string, year: number, seq: number): string {
  const yy = String(year).slice(-2);
  return `${centerCode.toUpperCase()}.${courseCode.toUpperCase()}.${yy}.${String(seq).padStart(3, "0")}`;
}

export interface ParsedClassCode {
  centerCode: string;
  courseCode: string;
  year: number;
  seq: number;
}

export function parseClassCode(code: string): ParsedClassCode | null {
  const m = /^([A-Z0-9]+)\.([A-Z0-9]+)\.(\d{2})\.(\d{3})$/.exec(code.trim().toUpperCase());
  if (!m) return null;
  return { centerCode: m[1]!, courseCode: m[2]!, year: 2000 + Number(m[3]), seq: Number(m[4]) };
}

/** Mã học viên dạng "CS1-26-000123" */
export function buildStudentCode(centerCode: string, year: number, seq: number): string {
  return `${centerCode.toUpperCase()}-${String(year).slice(-2)}-${String(seq).padStart(6, "0")}`;
}

/**
 * Số thứ tự mã lớp kế tiếp theo (cơ sở, khoá, năm) = max(seq) + 1 trong các mã đã có.
 * Dùng max thay vì đếm số lớp: mã nhập từ hệ cũ, mã nhập tay hay lớp đã xoá đều không gây trùng.
 */
export function nextClassSeq(codes: readonly (string | null | undefined)[], centerCode: string, courseCode: string, year: number): number {
  const prefix = buildClassCode(centerCode, courseCode, year, 0).slice(0, -3);
  let max = 0;
  for (const c of codes) {
    const t = (c ?? "").trim().toUpperCase();
    if (!t.startsWith(prefix)) continue;
    const rest = t.slice(prefix.length);
    if (/^\d{1,6}$/.test(rest)) max = Math.max(max, Number(rest));
  }
  return max + 1;
}

/** Mã lớp nhập tay: chữ in hoa, số, dấu chấm / gạch; 3–40 ký tự. Trả về mã chuẩn hoá hoặc null nếu sai */
export function normalizeClassCode(code: string | null | undefined): string | null {
  const s = (code ?? "").trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9._-]{2,39}$/.test(s) ? s : null;
}

/** Mã học viên nhập tay: ^[A-Z0-9.-]{3,30}$ (sau khi viết hoa). Trả về mã chuẩn hoá hoặc null */
export function normalizeStudentCode(code: string | null | undefined): string | null {
  const s = (code ?? "").trim().toUpperCase();
  return /^[A-Z0-9.-]{3,30}$/.test(s) ? s : null;
}

const WD_SHORT = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;

/** "14:00" → "14h", "15:30" → "15h30" */
export function shortHour(t: string): string {
  const [h, m] = t.slice(0, 5).split(":");
  return `${Number(h)}h${m && m !== "00" ? m : ""}`;
}

/**
 * Gợi ý tên lớp theo quy ước "tênkhoá.giờ-thứ.phòng": `sata3.14h-CN.CS2-P302`,
 * nhiều ca nối bằng "&": `combo.10h-T2&10h-T4&15h30-T7.CS2-P302`.
 */
export function suggestClassName(i: { courseCode: string; slots: readonly { weekday: number; startTime: string }[]; roomCode?: string | null; centerCode?: string | null }): string {
  const slots = [...i.slots].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
  const when = slots.map((s) => `${shortHour(s.startTime)}-${WD_SHORT[s.weekday] ?? `T${s.weekday + 1}`}`).join("&");
  const center = (i.centerCode ?? "").trim().toUpperCase();
  const room = (i.roomCode ?? "").trim().toUpperCase();
  const place = center && room ? (room.startsWith(center) ? room : `${center}-${room}`) : center || room;
  return [i.courseCode.trim().toLowerCase(), when, place].filter(Boolean).join(".");
}
