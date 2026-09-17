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

/**
 * Số thứ tự mã lớp kế tiếp theo (cơ sở, khoá, năm) = max(seq) + 1 trong các mã đã có
 * — không đếm số lớp (mã nhập từ hệ cũ / lớp đã xoá làm lệch phép đếm và gây trùng mã).
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

/** Mã học viên dạng "CS1-26-000123" */
export function buildStudentCode(centerCode: string, year: number, seq: number): string {
  return `${centerCode.toUpperCase()}-${String(year).slice(-2)}-${String(seq).padStart(6, "0")}`;
}
