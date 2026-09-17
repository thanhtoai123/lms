/**
 * Hồ sơ học viên: nhóm máu, dị ứng, quan hệ phụ huynh, CCCD phụ huynh.
 */

export const BLOOD_TYPES = ["A_POS", "A_NEG", "B_POS", "B_NEG", "O_POS", "O_NEG", "AB_POS", "AB_NEG", "UNKNOWN"] as const;
export type BloodType = (typeof BLOOD_TYPES)[number];
export const BLOOD_TYPE_VI: Record<BloodType, string> = {
  A_POS: "A+", A_NEG: "A−", B_POS: "B+", B_NEG: "B−", O_POS: "O+", O_NEG: "O−", AB_POS: "AB+", AB_NEG: "AB−", UNKNOWN: "Chưa biết",
};

export const GUARDIAN_RELATIONS = ["mother", "father", "grandmother", "grandfather", "guardian", "parent"] as const;
export type GuardianRelation = (typeof GUARDIAN_RELATIONS)[number];
export const GUARDIAN_RELATION_VI: Record<GuardianRelation, string> = {
  mother: "Mẹ", father: "Bố", grandmother: "Bà", grandfather: "Ông", guardian: "Người giám hộ", parent: "Phụ huynh",
};

/** Danh sách dị ứng: bỏ trống, gộp khoảng trắng, bỏ trùng (không phân biệt hoa thường), tối đa 20 mục × 100 ký tự */
export function normalizeAllergies(list: readonly (string | null | undefined)[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list ?? []) {
    const s = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
    if (!s) continue;
    const k = s.toLocaleLowerCase("vi");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= 20) break;
  }
  return out;
}

/** CCCD / CMND: 9 hoặc 12 chữ số. Trả về chuỗi số hoặc null nếu sai */
export function normalizeNationalId(v: string | null | undefined): string | null {
  const s = (v ?? "").replace(/[\s.-]/g, "");
  return /^(\d{9}|\d{12})$/.test(s) ? s : null;
}
