/**
 * BỘ TIÊU CHÍ HỌC BẠ THEO CHƯƠNG TRÌNH — chuẩn TH STEAM: 6 năng lực (Tư duy · Kỹ năng số · Bản lĩnh) + 3 phẩm chất,
 * chấm 3 mức Cần cố gắng / Đạt / Tốt. Mỗi chương trình (cấp học) một bộ; mô tả mức lấy từ bảng
 * "Con thay đổi gì sau mỗi năm học" của chính chương trình (packages/core/src/curriculum/thsteam.ts).
 *
 * Khi nạp danh mục chuẩn, mỗi khoá học đã có sẵn bộ của chương trình mình. Bộ mẫu ở đây dùng để thêm lại tiêu chí còn thiếu
 * hoặc áp cho khoá tự tạo; sau khi áp, mỗi khoá sửa độc lập. Phiếu đã phát hành giữ bản chụp cũ.
 * Xem docs/HO-SO-HOC-TAP.md, mục "Tiêu chí theo chương trình".
 */
import type { CriterionTemplate } from "./standard.js";
import { TH_PROGRAMS, TH_LEVEL_VI, programCriteria, thTrack, ageRange } from "../curriculum/thsteam.js";

export interface CriteriaTemplateSet {
  id: string;
  name: string;
  /** Dùng cho chương trình nào / độ tuổi nào */
  audience: string;
  criteria: readonly CriterionTemplate[];
}

/** Các bộ mẫu — mỗi chương trình chuẩn một bộ, theo thứ tự danh mục */
export const CRITERIA_TEMPLATE_SETS: readonly CriteriaTemplateSet[] = TH_PROGRAMS.map((p) => ({
  id: p.code.toLowerCase(),
  name: `${thTrack(p.track)?.name ?? p.track} · ${p.name}`,
  audience: `${TH_LEVEL_VI[p.level]} · ${ageRange(p.ageFrom, p.ageTo)}`,
  criteria: programCriteria(p),
}));

/** Bộ mặc định (khi không chọn): chương trình đầu tiên của danh mục */
export function criteriaTemplateById(id: string | null | undefined): CriteriaTemplateSet | null {
  if (!id) return CRITERIA_TEMPLATE_SETS[0] ?? null;
  return CRITERIA_TEMPLATE_SETS.find((t) => t.id === id) ?? null;
}

/**
 * Chọn các tiêu chí cần thêm vào khoá đang có: bỏ tiêu chí đã có cùng tên (không phân biệt hoa thường, dấu cách thừa)
 * để áp bộ mẫu / sao chép từ khoá khác nhiều lần không nhân đôi.
 */
export function newCriteriaOnly<T extends { name: string }>(existingNames: readonly string[], incoming: readonly T[]): T[] {
  const key = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const have = new Set(existingNames.map(key));
  const out: T[] = [];
  for (const c of incoming) {
    const k = key(c.name);
    if (have.has(k)) continue;
    have.add(k);
    out.push(c);
  }
  return out;
}
