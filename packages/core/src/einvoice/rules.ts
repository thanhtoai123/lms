/**
 * Hoá đơn điện tử (NĐ 123/2020, sửa đổi NĐ 70/2025):
 * - Dịch vụ thu tiền trước / trong khi cung cấp: lập hoá đơn tại thời điểm thu tiền.
 * - Sai sót sau khi đã lập: không huỷ — lập hoá đơn điều chỉnh hoặc thay thế, kèm thoả thuận với người mua.
 * - Dạy học theo pháp luật giáo dục: không chịu thuế GTGT (ghi "KCT"); hàng hoá (học cụ, sản phẩm) tính thuế theo suất cấu hình.
 */
export class InvoiceRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceRuleError";
  }
}
const fail = (m: string): never => {
  throw new InvoiceRuleError(m);
};

export const TAX_RATES = ["KCT", "0", "5", "8", "10"] as const;
export type TaxRate = (typeof TAX_RATES)[number];
export const TAX_RATE_VI: Record<TaxRate, string> = { KCT: "Không chịu thuế", "0": "0%", "5": "5%", "8": "8%", "10": "10%" };

export const INVOICE_STATUSES = ["draft", "issuing", "issued", "failed", "adjusted", "replaced", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const INVOICE_STATUS_VI: Record<InvoiceStatus, string> = {
  draft: "Nháp", issuing: "Đang phát hành", issued: "Đã phát hành", failed: "Lỗi phát hành", adjusted: "Đã bị điều chỉnh", replaced: "Đã bị thay thế", cancelled: "Huỷ nháp",
};
export const INVOICE_KINDS = ["original", "adjustment", "replacement"] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];
export const INVOICE_KIND_VI: Record<InvoiceKind, string> = { original: "Hoá đơn gốc", adjustment: "Hoá đơn điều chỉnh", replacement: "Hoá đơn thay thế" };

export interface InvoiceLine { name: string; unit: string; quantity: number; unitPrice: number; amount: number; taxRate: TaxRate }

/** Tiền trước thuế theo dòng; giá bán đã gồm thuế (giá niêm yết cho phụ huynh) → tách thuế */
export function computeInvoiceTotals(lines: InvoiceLine[], pricesIncludeTax = true) {
  let subtotal = 0;
  let vat = 0;
  const byRate: Record<string, { base: number; vat: number }> = {};
  for (const l of lines) {
    const pct = l.taxRate === "KCT" ? 0 : Number(l.taxRate);
    const gross = l.amount;
    const base = pricesIncludeTax && pct ? Math.round(gross / (1 + pct / 100)) : gross;
    const tax = pricesIncludeTax ? gross - base : Math.round((base * pct) / 100);
    subtotal += base;
    vat += tax;
    const k = l.taxRate;
    byRate[k] = { base: (byRate[k]?.base ?? 0) + base, vat: (byRate[k]?.vat ?? 0) + tax };
  }
  return { subtotal, vat, total: subtotal + vat, byRate };
}

/**
 * Dòng hoá đơn cho một khoản thu:
 * - Thu đủ đơn một lần → liệt kê từng dòng (giảm giá phân bổ theo tỉ lệ).
 * - Thu một phần (trả góp / đặt cọc) → một dòng "Thu học phí đợt …" đúng số tiền thu.
 */
export function linesForPayment(x: {
  orderCode: string; orderType: "course" | "product" | "exam" | "other"; orderTotal: number; paymentAmount: number; installmentLabel?: string | null;
  items: { description: string; quantity: number; unitPrice: number; amount: number; isCourse: boolean }[];
  courseRate: TaxRate; goodsRate: TaxRate;
}): InvoiceLine[] {
  if (x.paymentAmount <= 0) fail("Số tiền thu phải lớn hơn 0");
  if (x.paymentAmount > x.orderTotal) fail("Số tiền thu vượt tổng đơn");
  const rateOf = (isCourse: boolean) => (isCourse ? x.courseRate : x.goodsRate);
  const itemsTotal = x.items.reduce((a, i) => a + i.amount, 0);
  if (x.paymentAmount === x.orderTotal && x.items.length && itemsTotal > 0) {
    const ratio = x.orderTotal / itemsTotal;
    const lines = x.items.map((i) => {
      const amount = Math.round(i.amount * ratio);
      return { name: i.description, unit: i.isCourse ? "Khoá" : "Cái", quantity: i.quantity, unitPrice: Math.round(amount / Math.max(1, i.quantity)), amount, taxRate: rateOf(i.isCourse) };
    });
    const diff = x.orderTotal - lines.reduce((a, l) => a + l.amount, 0);
    if (diff !== 0) { lines[lines.length - 1]!.amount += diff; lines[lines.length - 1]!.unitPrice = Math.round(lines[lines.length - 1]!.amount / Math.max(1, lines[lines.length - 1]!.quantity)); }
    return lines;
  }
  const anyGoods = x.items.some((i) => !i.isCourse);
  const allGoods = x.items.length > 0 && x.items.every((i) => !i.isCourse);
  if (anyGoods && !allGoods) fail("Đơn gồm cả học phí và hàng hoá thu từng phần — tách đơn hoặc thu đủ một lần để lập hoá đơn đúng thuế suất");
  const label = x.orderType === "course" ? "Học phí" : "Tiền hàng";
  return [{ name: `${label}${x.installmentLabel ? ` ${x.installmentLabel}` : ""} — đơn ${x.orderCode}`, unit: "Lần", quantity: 1, unitPrice: x.paymentAmount, amount: x.paymentAmount, taxRate: rateOf(!allGoods) }];
}

export function validateTaxCode(v: string): boolean {
  return /^\d{10}(-\d{3})?$/.test(v) || /^\d{12}$/.test(v);
}

export interface Buyer { name: string | null; company: string | null; taxCode: string | null; address: string | null; email: string | null; phone: string | null; noInvoiceRequested: boolean }
export function validateBuyer(b: Buyer): string[] {
  const e: string[] = [];
  if (!b.noInvoiceRequested && !(b.name ?? "").trim() && !(b.company ?? "").trim()) e.push("Cần tên người mua hoặc tên đơn vị");
  if (b.taxCode && !validateTaxCode(b.taxCode)) e.push("Mã số thuế gồm 10 số, 10-3 số hoặc số định danh 12 số");
  if (b.taxCode && !(b.company ?? "").trim()) e.push("Có mã số thuế thì cần tên đơn vị");
  if (b.company && b.taxCode && !(b.address ?? "").trim()) e.push("Hoá đơn cho đơn vị cần địa chỉ");
  if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) e.push("Email không hợp lệ");
  return e;
}

/** Ký hiệu hoá đơn: 1 (GTGT) / 2 (bán hàng) + C (có mã) / K (không mã) + 2 số năm + loại + 2 ký tự */
export function validateSerial(serial: string, year: number): string[] {
  const e: string[] = [];
  if (!/^[1-2][CK]\d{2}[TDLMNBGHXY][A-Z0-9]{2}$/.test(serial)) e.push("Ký hiệu hoá đơn dạng 1C26TSR (loại · có mã · năm · loại hình · 2 ký tự)");
  else if (Number(serial.slice(2, 4)) !== year % 100) e.push(`Ký hiệu phải mang năm ${year % 100} — đổi ký hiệu khi sang năm mới`);
  return e;
}

export type InvoiceAction = "issue" | "issued" | "fail" | "retry" | "cancel" | "mark_adjusted" | "mark_replaced";
export function invoiceTransition(from: InvoiceStatus, action: InvoiceAction): InvoiceStatus {
  const map: Record<InvoiceStatus, Partial<Record<InvoiceAction, InvoiceStatus>>> = {
    draft: { issue: "issuing", cancel: "cancelled" },
    issuing: { issued: "issued", fail: "failed" },
    failed: { retry: "issuing", cancel: "cancelled" },
    issued: { mark_adjusted: "adjusted", mark_replaced: "replaced" },
    adjusted: { mark_adjusted: "adjusted", mark_replaced: "replaced" },
    replaced: {},
    cancelled: {},
  };
  const to = map[from][action];
  if (!to) fail(from === "issued" && action === "cancel" ? "Hoá đơn đã phát hành không được huỷ — lập hoá đơn điều chỉnh hoặc thay thế" : `Hoá đơn "${INVOICE_STATUS_VI[from]}" không thể thực hiện thao tác này`);
  return to!;
}

export function validateCorrection(x: { kind: "adjustment" | "replacement"; originalStatus: InvoiceStatus; agreementNote: string; reason: string; lines: InvoiceLine[] }): string[] {
  const e: string[] = [];
  if (!["issued", "adjusted"].includes(x.originalStatus)) e.push("Chỉ điều chỉnh / thay thế hoá đơn đã phát hành");
  if (x.agreementNote.trim().length < 10) e.push("Ghi số / nội dung văn bản thoả thuận với người mua (≥ 10 ký tự)");
  if (x.reason.trim().length < 10) e.push("Ghi lý do (≥ 10 ký tự)");
  if (!x.lines.length) e.push("Cần ít nhất một dòng");
  for (const l of x.lines) {
    if (!l.name.trim()) e.push("Dòng hàng thiếu tên");
    if (!TAX_RATES.includes(l.taxRate)) e.push("Thuế suất không hợp lệ");
    if (x.kind === "replacement" && l.amount < 0) e.push("Hoá đơn thay thế không có dòng âm");
    if (x.kind === "adjustment" && l.amount === 0) e.push("Dòng điều chỉnh phải khác 0 (âm = giảm, dương = tăng)");
  }
  if (x.kind === "replacement" && x.lines.reduce((a, l) => a + l.amount, 0) <= 0) e.push("Tổng hoá đơn thay thế phải lớn hơn 0");
  return e;
}

/** Hạn lập: trong ngày thu tiền (giờ VN). Quá ngày → trễ hạn */
export function issueDeadlineState(paidAt: string, issued: boolean, today: string): "ok" | "due_today" | "late" {
  if (issued) return "ok";
  if (paidAt < today) return "late";
  return "due_today";
}

/* ------------------------------------------------------------------ */
/* Đọc số tiền bằng chữ                                                 */
/* ------------------------------------------------------------------ */

const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
function readTriple(n: number, full: boolean): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  const out: string[] = [];
  if (full || h > 0) out.push(`${DIGITS[h]} trăm`);
  if (t > 1) {
    out.push(`${DIGITS[t]} mươi`);
    if (u === 1) out.push("mốt");
    else if (u === 4) out.push("tư");
    else if (u === 5) out.push("lăm");
    else if (u > 0) out.push(DIGITS[u]!);
  } else if (t === 1) {
    out.push("mười");
    if (u === 5) out.push("lăm");
    else if (u > 0) out.push(DIGITS[u]!);
  } else if (u > 0) {
    if (full || h > 0) out.push("lẻ");
    out.push(DIGITS[u]!);
  }
  return out.join(" ");
}
function belowBillion(n: number, full: boolean): string {
  const g = [Math.floor(n / 1_000_000), Math.floor(n / 1000) % 1000, n % 1000];
  const unit = ["triệu", "nghìn", ""];
  const out: string[] = [];
  let started = full;
  g.forEach((v, k) => {
    if (v === 0) return;
    out.push(`${readTriple(v, started)}${unit[k] ? ` ${unit[k]}` : ""}`);
    started = true;
  });
  return out.join(" ");
}
function words(n: number, full: boolean): string {
  if (n >= 1_000_000_000) {
    const high = Math.floor(n / 1_000_000_000);
    const low = n % 1_000_000_000;
    return `${words(high, full)} tỷ${low ? ` ${belowBillion(low, true)}` : ""}`;
  }
  return belowBillion(n, full);
}
export function vndInWords(amount: number): string {
  if (!Number.isFinite(amount)) return "";
  const n = Math.round(Math.abs(amount));
  if (n === 0) return "Không đồng";
  const s = words(n, false).replace(/\s+/g, " ").trim();
  return `${amount < 0 ? "Âm " : ""}${amount < 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)} đồng`;
}

export function invoiceLookupUrl(base: string, code: string) {
  return `${base.replace(/\/$/, "")}?ma=${encodeURIComponent(code)}`;
}
