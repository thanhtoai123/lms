/**
 * Khoá đơn giá theo bảng giá: dòng đơn có khoá học chỉ nhận đơn giá đúng một mức trong bảng giá
 * (giá khoá theo số buổi × hệ số hình thức, giá gói đang bán, hoặc giá combo 2 năm học).
 * Muốn bán thấp hơn → thêm khoản giảm giá ở dòng, để quy trình duyệt giảm giá áp dụng.
 */
import { packagePrice, formatUnitPrice, classFormatOfPackage, formatVnd, type ClassFormat } from "./rules.js";
import { thComboOffers } from "../curriculum/thsteam.js";

export interface CoursePriceBook {
  code: string;
  listPrice: number;
  totalSessions: number;
  /** Gói đang bán của khoá: giá = giá ưu đãi nếu có, không thì giá niêm yết */
  packages: { code: string; sessions: number; price: number }[];
}

export interface LockedLine {
  /** null = dòng không gắn khoá học (sản phẩm, lệ phí…): không khoá giá */
  courseCode: string | null;
  unitPrice: number;
  sessions: number | null;
  format: ClassFormat;
  /** Con / học viên của dòng — combo phải đủ 2 năm học cho cùng một người */
  owner: string;
}

type Option = { price: number; combo?: { key: string; part: 1 | 2 } };

function optionsOf(b: CoursePriceBook, sessions: number | null, format: ClassFormat): Option[] {
  const s = sessions ?? b.totalSessions;
  const out: Option[] = [];
  if (b.listPrice > 0 && b.totalSessions > 0) {
    const bases = [packagePrice(b.listPrice, b.totalSessions, s)];
    if (s === b.totalSessions) bases.push(b.listPrice);
    for (const base of bases) out.push({ price: formatUnitPrice(base, format) });
  }
  for (const p of b.packages) if (p.sessions === s && p.price > 0 && classFormatOfPackage(p.code) === format) out.push({ price: p.price });
  // Khoá miễn phí trong bảng giá (giá 0, không có gói): chỉ nhận đơn giá 0
  if (!out.length && b.listPrice === 0 && !b.packages.length) out.push({ price: 0 });
  for (const o of thComboOffers()) {
    if (o.format !== format) continue;
    for (const l of o.lines) if (l.courseCode === b.code && l.sessions === s) out.push({ price: l.unitPrice, combo: { key: o.key, part: l.part } });
  }
  return out;
}

/** Các mức đơn giá hợp lệ của một dòng (không trùng, tăng dần) */
export function lockedPriceOptions(b: CoursePriceBook, sessions: number | null, format: ClassFormat): number[] {
  return [...new Set(optionsOf(b, sessions, format).map((o) => o.price))].sort((a, b) => a - b);
}

/** Lỗi theo dòng (index → thông báo); rỗng = mọi dòng đúng bảng giá */
export function checkLockedPrices(lines: readonly LockedLine[], books: Readonly<Record<string, CoursePriceBook>>): string[] {
  const errors: string[] = [];
  const comboParts = new Map<string, Set<number>>();
  const comboLines: { idx: number; group: string }[] = [];
  lines.forEach((l, idx) => {
    if (l.courseCode === null) return;
    const b = books[l.courseCode];
    if (!b) { errors.push(`Dòng ${idx + 1}: khoá học không có trong bảng giá`); return; }
    const opts = optionsOf(b, l.sessions, l.format);
    if (!opts.length) { errors.push(`Dòng ${idx + 1}: khoá ${b.code} chưa có giá cho số buổi và hình thức này — cập nhật bảng giá trước khi lập đơn`); return; }
    const hit = opts.filter((o) => o.price === Math.round(l.unitPrice));
    if (!hit.length) {
      const list = [...new Set(opts.map((o) => o.price))].sort((a, c) => a - c).map(formatVnd).join(" / ");
      errors.push(`Dòng ${idx + 1}: đơn giá phải theo bảng giá (${list}). Muốn giảm, thêm khoản giảm giá ở dòng.`);
      return;
    }
    // Chỉ khớp giá combo → phải có đủ Năm 1 + Năm 2 cho cùng người trong đơn
    if (hit.every((o) => o.combo)) {
      for (const o of hit) {
        const g = `${o.combo!.key}|${l.owner}`;
        if (!comboParts.has(g)) comboParts.set(g, new Set());
        comboParts.get(g)!.add(o.combo!.part);
      }
      comboLines.push({ idx, group: hit.map((o) => `${o.combo!.key}|${l.owner}`).join(",") });
    }
  });
  for (const c of comboLines) {
    const ok = c.group.split(",").some((g) => (comboParts.get(g)?.size ?? 0) >= 2);
    if (!ok) errors.push(`Dòng ${c.idx + 1}: giá combo 2 năm học chỉ áp dụng khi đơn có đủ Năm 1 và Năm 2 cho cùng một học viên`);
  }
  return errors;
}
