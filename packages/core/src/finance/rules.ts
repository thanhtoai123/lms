/**
 * Tài chính học phí: đơn hàng, kế hoạch trả góp, thanh toán (sale ghi nhận → kế toán xác nhận),
 * công nợ, tuổi nợ, hoàn tiền theo buổi. Tiền là số nguyên VND.
 */
import { addDays, parseISODate } from "../dates.js";

export const ORDER_TYPES = ["course", "product", "exam", "other"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];
export const ORDER_TYPE_VI: Record<OrderType, string> = { course: "Khoá học", product: "Sản phẩm", exam: "Kỳ thi", other: "Khác" };

export const ORDER_STATUSES = ["pending_payment", "partially_paid", "paid", "cancelled", "refunded"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_STATUS_VI: Record<OrderStatus, string> = {
  pending_payment: "Chờ thanh toán",
  partially_paid: "Đã thu một phần",
  paid: "Đã thanh toán đủ",
  cancelled: "Đã huỷ",
  refunded: "Đã hoàn tiền",
};

export const PAYMENT_STATUSES = ["recorded", "confirmed", "rejected", "voided"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_STATUS_VI: Record<PaymentStatus, string> = { recorded: "Chờ kế toán xác nhận", confirmed: "Đã xác nhận", rejected: "Bị từ chối", voided: "Đã huỷ (gỡ gắn)" };

export const PAYMENT_METHOD_KINDS = ["cash", "bank_transfer", "gateway"] as const;
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number];
export const PAYMENT_METHOD_KIND_VI: Record<PaymentMethodKind, string> = { cash: "Tiền mặt", bank_transfer: "Chuyển khoản", gateway: "Cổng thanh toán" };

export const REFUND_STATUSES = ["pending", "approved", "rejected", "paid"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];
export const REFUND_STATUS_VI: Record<RefundStatus, string> = { pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối", paid: "Đã chi hoàn" };

export const LEDGER_TYPES = ["charge", "payment", "refund", "cancel", "adjustment"] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

export class FinanceRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinanceRuleError";
  }
}

export function formatVnd(n: number): string {
  return `${Math.round(n).toLocaleString("vi-VN")}đ`;
}

/* ------------------------------------------------------------------ */
/* Định giá                                                            */
/* ------------------------------------------------------------------ */

export interface PriceItem { quantity: number; unitPrice: number }
export interface Discount { type: "amount" | "percent"; value: number }

export function priceOrder(items: readonly PriceItem[], discount?: Discount | null) {
  const errors: string[] = [];
  if (!items.length) errors.push("Đơn cần ít nhất một dòng sản phẩm");
  for (const i of items) {
    if (!Number.isInteger(i.quantity) || i.quantity < 1) errors.push("Số lượng phải là số nguyên ≥ 1");
    if (!Number.isFinite(i.unitPrice) || i.unitPrice < 0) errors.push("Đơn giá không hợp lệ");
  }
  const subtotal = items.reduce((s, i) => s + Math.round(i.quantity * i.unitPrice), 0);
  let discountAmount = 0;
  if (discount && discount.value > 0) {
    if (discount.type === "percent") {
      if (discount.value > 100) errors.push("Giảm giá tối đa 100%");
      discountAmount = Math.round((subtotal * Math.min(100, discount.value)) / 100);
    } else {
      discountAmount = Math.round(discount.value);
      if (discountAmount > subtotal) errors.push("Số tiền giảm lớn hơn tổng đơn");
    }
  }
  discountAmount = Math.min(discountAmount, subtotal);
  return { subtotal, discountAmount, total: subtotal - discountAmount, errors: [...new Set(errors)] };
}

/** Giá gói theo số buổi (tỉ lệ theo học phí niêm yết của khoá), làm tròn nghìn */
export function packagePrice(listPrice: number, courseSessions: number, packageSessions: number): number {
  if (courseSessions <= 0) return 0;
  return Math.round((listPrice * packageSessions) / courseSessions / 1000) * 1000;
}

/* ------------------------------------------------------------------ */
/* Hình thức lớp (coach) + giảm giá theo dòng                          */
/* ------------------------------------------------------------------ */

export const CLASS_FORMATS = ["group", "coach_1_1", "coach_1_2", "coach_1_4"] as const;
export type ClassFormat = (typeof CLASS_FORMATS)[number];
export const CLASS_FORMAT_VI: Record<ClassFormat, string> = {
  group: "Lớp nhóm",
  coach_1_1: "Coach 1-1 (kèm riêng)",
  coach_1_2: "Coach 1-2",
  coach_1_4: "Coach 1-4",
};
/** Hệ số nhân giá/buổi theo hình thức lớp (bản gốc: 1 / 2 / 1,8 / 1,5) */
export const COACH_MULTIPLIER: Record<ClassFormat, number> = { group: 1, coach_1_1: 2, coach_1_2: 1.8, coach_1_4: 1.5 };

/** Đơn giá sau hệ số coach — luôn trả số nguyên VND (không để số thực chạm vào tiền lưu) */
export function formatUnitPrice(basePrice: number, format: ClassFormat): number {
  return Math.round(basePrice * (COACH_MULTIPLIER[format] ?? 1));
}

export const DEFAULT_MAX_LINE_DISCOUNT_PCT = 50;

export interface LineDiscount {
  kind: "amount" | "percent";
  /** amount: VND; percent: 1..maxPercent */
  value: number;
  reason?: string | null;
}

export interface PriceLineInput {
  unitPrice: number;
  quantity: number;
  discounts?: readonly LineDiscount[];
  /** Trần % giảm theo cấu hình vận hành (mặc định 50) */
  maxPercent?: number;
  /** Gói cam kết giá cố định (SR.QD.219 Điều 3/5): cấm coach và cấm bán lẻ buổi */
  fixedPackage?: boolean;
  format?: ClassFormat;
  /** Số buổi mua của dòng */
  sessions?: number | null;
  /** Tổng số buổi của khoá (để biết có mua lẻ không) */
  courseSessions?: number | null;
}

export interface PricedLine {
  gross: number;
  discount: number;
  net: number;
  errors: string[];
}

/** Định giá một dòng đơn: hệ số coach đã nằm trong đơn giá, giảm giá cộng dồn, không vượt thành tiền */
export function priceLine(i: PriceLineInput): PricedLine {
  const errors: string[] = [];
  const maxPercent = i.maxPercent ?? DEFAULT_MAX_LINE_DISCOUNT_PCT;
  const quantity = i.quantity;
  if (!Number.isInteger(quantity) || quantity < 1) errors.push("Số lượng phải là số nguyên ≥ 1");
  if (!Number.isFinite(i.unitPrice) || i.unitPrice < 0) errors.push("Đơn giá không hợp lệ");
  if (i.sessions != null && (!Number.isInteger(i.sessions) || i.sessions < 1 || i.sessions > 500)) errors.push("Số buổi mua từ 1 đến 500");
  const gross = Math.max(0, Math.round((Number.isFinite(i.unitPrice) ? i.unitPrice : 0) * Math.max(1, Number.isInteger(quantity) ? quantity : 1)));
  const format = i.format ?? "group";
  if (i.fixedPackage) {
    if (format !== "group") errors.push("Gói cam kết giá cố định — không bán dạng coach");
    if (i.sessions != null && i.courseSessions != null && i.sessions !== i.courseSessions) errors.push("Gói cam kết giá cố định — không bán lẻ buổi");
  }
  let discount = 0;
  for (const d of i.discounts ?? []) {
    if (!(d.reason ?? "").trim() || (d.reason ?? "").trim().length < 3) errors.push("Khoản giảm cần lý do (tối thiểu 3 ký tự)");
    if (d.kind === "percent") {
      if (!Number.isFinite(d.value) || d.value < 1 || d.value > maxPercent) errors.push(`Giảm theo % phải trong khoảng 1–${maxPercent}%`);
      else discount += Math.round((gross * d.value) / 100);
    } else {
      if (!Number.isInteger(d.value) || d.value <= 0) errors.push("Số tiền giảm phải là số nguyên > 0");
      else discount += d.value;
    }
  }
  if (discount > gross) {
    errors.push(`Tổng giảm (${formatVnd(discount)}) vượt thành tiền của dòng (${formatVnd(gross)})`);
    discount = gross;
  }
  return { gross, discount, net: gross - discount, errors: [...new Set(errors)] };
}

/** Tổng đơn theo dòng (Σ net). Giảm giá cấp đơn chỉ còn cho dữ liệu cũ. */
export function priceLines(lines: readonly PriceLineInput[]) {
  const errors: string[] = [];
  if (!lines.length) errors.push("Đơn cần ít nhất một dòng sản phẩm");
  const priced = lines.map((l) => priceLine(l));
  priced.forEach((p, idx) => p.errors.forEach((e) => errors.push(`Dòng ${idx + 1}: ${e}`)));
  return {
    lines: priced,
    subtotal: priced.reduce((s, p) => s + p.gross, 0),
    discountAmount: priced.reduce((s, p) => s + p.discount, 0),
    total: priced.reduce((s, p) => s + p.net, 0),
    errors,
  };
}

/* ------------------------------------------------------------------ */
/* Kế hoạch thanh toán                                                 */
/* ------------------------------------------------------------------ */

export const INSTALLMENT_KINDS = ["deposit", "installment"] as const;
export type InstallmentKind = (typeof INSTALLMENT_KINDS)[number];
export const INSTALLMENT_KIND_VI: Record<InstallmentKind, string> = { deposit: "Cọc", installment: "Đợt" };
/** SR.QD.219 Điều 2: chia đều tối đa 12 kỳ theo tháng */
export const MAX_INSTALLMENTS = 12;
/** SR.QD.223: các mốc cách nhau 30 ngày */
export const DEFAULT_INSTALLMENT_INTERVAL_DAYS = 30;

export interface Installment { seq: number; amount: number; dueDate: string; kind?: InstallmentKind }

/** Cộng n tháng theo lịch, kẹp về ngày cuối tháng khi tràn (31/01 + 1 tháng = 28/02) */
export function addMonthsISO(d: string, n: number): string {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${String(ny).padStart(4, "0")}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

/** Chia đều số tiền thành n phần, làm tròn nghìn, phần dư dồn phần cuối */
function splitEven(total: number, count: number): number[] {
  if (count <= 1) return [total];
  const base = Math.floor(total / count / 1000) * 1000;
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? total - base * (count - 1) : base));
}

export interface PlanOptions {
  intervalDays?: number;
  /** true = mốc theo tháng (SR.QD.219 Điều 2) thay vì cách nhau intervalDays */
  monthly?: boolean;
  /** Thu cọc trước: số tiền cọc, trừ khỏi phần chia đều */
  deposit?: number | null;
  /** Hạn đóng cọc (mặc định = hạn đợt đầu) */
  depositDueDate?: string | null;
}

/**
 * Kế hoạch thanh toán: cọc (tuỳ chọn, đứng đầu) + n đợt chia đều.
 * Tổng luôn khớp tổng đơn; mọi số tiền là số nguyên VND.
 */
export function buildPlan(total: number, count: number, firstDueDate: string, opts: PlanOptions = {}): Installment[] {
  if (!Number.isInteger(count) || count < 1 || count > MAX_INSTALLMENTS) throw new FinanceRuleError(`Kế hoạch thanh toán từ 1 đến ${MAX_INSTALLMENTS} đợt`);
  const deposit = Math.max(0, Math.round(opts.deposit ?? 0));
  if (deposit > total) throw new FinanceRuleError(`Tiền cọc (${formatVnd(deposit)}) lớn hơn tổng đơn (${formatVnd(total)})`);
  const rest = total - deposit;
  const out: Installment[] = [];
  let seq = 1;
  const depositDue = opts.depositDueDate ?? firstDueDate;
  if (deposit > 0) {
    if (depositDue > firstDueDate) throw new FinanceRuleError("Hạn đóng cọc phải trước hạn đợt 1");
    out.push({ seq: seq++, amount: deposit, dueDate: depositDue, kind: "deposit" });
  }
  const startDue = deposit > 0 && depositDue === firstDueDate ? (opts.monthly ? addMonthsISO(firstDueDate, 1) : addDays(firstDueDate, opts.intervalDays ?? DEFAULT_INSTALLMENT_INTERVAL_DAYS)) : firstDueDate;
  if (rest <= 0) {
    if (!out.length) out.push({ seq: 1, amount: Math.max(0, total), dueDate: firstDueDate, kind: "installment" });
    return out;
  }
  const amounts = splitEven(rest, count);
  amounts.forEach((amount, i) => {
    out.push({
      seq: seq++,
      amount,
      dueDate: opts.monthly ? addMonthsISO(startDue, i) : addDays(startDue, i * (opts.intervalDays ?? DEFAULT_INSTALLMENT_INTERVAL_DAYS)),
      kind: "installment",
    });
  });
  return out;
}

/** Chia đều n đợt cách nhau intervalDays (giữ chữ ký cũ; nay tối đa 12 đợt) */
export function buildInstallmentPlan(total: number, count: number, firstDueDate: string, intervalDays = DEFAULT_INSTALLMENT_INTERVAL_DAYS): Installment[] {
  return buildPlan(total, count, firstDueDate, { intervalDays });
}

/** Chia theo học phần: 48 buổi = 4 học phần × 12 buổi (1–4 học phần, mốc cách 30 ngày) */
export function buildModulePlan(total: number, modules: 1 | 2 | 3 | 4, firstDueDate: string, intervalDays = DEFAULT_INSTALLMENT_INTERVAL_DAYS, opts: Omit<PlanOptions, "monthly" | "intervalDays"> = {}): Installment[] {
  if (!Number.isInteger(modules) || modules < 1 || modules > 4) throw new FinanceRuleError("Số học phần từ 1 đến 4");
  return buildPlan(total, modules, firstDueDate, { ...opts, intervalDays });
}

/** Chia đều theo tháng, tối đa 12 kỳ (SR.QD.219 Điều 2) */
export function buildMonthlyPlan(total: number, months: number, firstDueDate: string, opts: Omit<PlanOptions, "monthly" | "intervalDays"> = {}): Installment[] {
  if (!Number.isInteger(months) || months < 1 || months > MAX_INSTALLMENTS) throw new FinanceRuleError(`Chia theo tháng tối đa ${MAX_INSTALLMENTS} kỳ`);
  return buildPlan(total, months, firstDueDate, { ...opts, monthly: true });
}

export interface PlanEntry { amount: number; dueDate: string; kind?: InstallmentKind | null }

export function validateInstallmentPlan(total: number, plan: readonly PlanEntry[], opts: { maxInstallments?: number } = {}): string[] {
  const max = opts.maxInstallments ?? MAX_INSTALLMENTS;
  const errs: string[] = [];
  const deposits = plan.filter((p) => p.kind === "deposit");
  const installments = plan.filter((p) => p.kind !== "deposit");
  if (plan.length < 1) errs.push("Kế hoạch thanh toán cần ít nhất 1 đợt");
  if (installments.length > max) errs.push(`Kế hoạch thanh toán từ 1 đến ${max} đợt (chưa kể cọc)`);
  if (deposits.length > 1) errs.push("Chỉ được một khoản cọc");
  if (deposits.length === 1 && plan[0]?.kind !== "deposit") errs.push("Khoản cọc phải là phiếu đầu tiên");
  if (plan.some((p) => !Number.isInteger(p.amount) || p.amount <= 0)) errs.push("Mỗi đợt phải có số tiền > 0");
  if (plan.some((p) => !/^\d{4}-\d{2}-\d{2}$/.test(p.dueDate))) errs.push("Đợt chưa thu — chọn ngày hẹn đóng");
  const sum = plan.reduce((s, p) => s + p.amount, 0);
  if (plan.length && sum !== total) errs.push(`Tổng các phiếu phải bằng ${formatVnd(total)} — đang lệch ${formatVnd(Math.abs(sum - total))}`);
  for (let i = 1; i < plan.length; i++) if (plan[i]!.dueDate < plan[i - 1]!.dueDate) errs.push("Hạn các đợt phải tăng dần");
  return [...new Set(errs)];
}

export interface ReplanEntry extends PlanEntry {
  /** Số thứ tự đợt đang có (giữ lại); bỏ trống = đợt mới */
  seq?: number | null;
}
export interface ReplanCurrent { seq: number; amount: number; paid: number; kind?: InstallmentKind | null }

/**
 * Kiểm tra kế hoạch mới so với kế hoạch đang chạy: đợt đã thu (paid > 0) phải được giữ lại
 * và số tiền không nhỏ hơn phần đã thu.
 */
export function replanInstallments(total: number, current: readonly ReplanCurrent[], next: readonly ReplanEntry[], opts: { maxInstallments?: number } = {}): string[] {
  const errs = validateInstallmentPlan(total, next, opts);
  const keptSeqs = next.map((n) => n.seq).filter((s): s is number => typeof s === "number");
  if (new Set(keptSeqs).size !== keptSeqs.length) errs.push("Một đợt cũ chỉ được giữ lại một lần");
  for (const s of keptSeqs) if (!current.some((c) => c.seq === s)) errs.push(`Đợt ${s} không có trong kế hoạch hiện tại`);
  for (const c of current) {
    if (c.paid <= 0) continue;
    const keep = next.find((n) => n.seq === c.seq);
    if (!keep) errs.push(`Đợt ${c.seq} đã thu ${formatVnd(c.paid)} — không được xoá`);
    else if (keep.amount < c.paid) errs.push(`Đợt ${c.seq} đã thu ${formatVnd(c.paid)} — số tiền mới không được nhỏ hơn`);
  }
  return [...new Set(errs)];
}

/* ------------------------------------------------------------------ */
/* Công nợ                                                             */
/* ------------------------------------------------------------------ */

export interface PaymentLite { amount: number; status: PaymentStatus }

/** Công nợ đơn = tổng − khoản ĐÃ xác nhận + đã hoàn; khoản chờ xác nhận không trừ nợ */
export function orderBalance(total: number, payments: readonly PaymentLite[], refundedPaid = 0) {
  const confirmed = payments.filter((p) => p.status === "confirmed").reduce((s, p) => s + p.amount, 0);
  const pending = payments.filter((p) => p.status === "recorded").reduce((s, p) => s + p.amount, 0);
  const netPaid = confirmed - refundedPaid;
  const outstanding = Math.max(0, total - confirmed);
  const overpaid = Math.max(0, confirmed - total);
  return { total, confirmed, pending, refunded: refundedPaid, netPaid, outstanding, overpaid };
}

/** Trạng thái đơn suy từ số đã xác nhận (trừ khi đã huỷ / đã hoàn) */
export function deriveOrderStatus(current: OrderStatus, total: number, confirmed: number): OrderStatus {
  if (current === "cancelled" || current === "refunded") return current;
  if (confirmed <= 0) return total === 0 ? "paid" : "pending_payment";
  return confirmed >= total ? "paid" : "partially_paid";
}

export function canCancelOrder(status: OrderStatus, confirmed: number, pending: number): string | null {
  if (status === "cancelled" || status === "refunded") return "Đơn đã đóng";
  if (confirmed > 0) return "Đơn đã có khoản thu được xác nhận — dùng hoàn tiền thay vì huỷ";
  if (pending > 0) return "Đơn còn khoản thu chờ xác nhận — kế toán xử lý trước";
  return null;
}

export interface InstallmentState extends Installment { paid: number; remaining: number; state: "paid" | "partial" | "unpaid"; overdueDays: number }

/** Phân bổ số đã xác nhận vào các đợt theo thứ tự; tính số ngày quá hạn của từng đợt còn nợ */
export function allocateInstallments(plan: readonly Installment[], confirmed: number, today: string): InstallmentState[] {
  let left = confirmed;
  return [...plan].sort((a, b) => a.seq - b.seq).map((p) => {
    const paid = Math.min(p.amount, Math.max(0, left));
    left -= paid;
    const remaining = p.amount - paid;
    const overdueDays = remaining > 0 && p.dueDate < today ? Math.round((parseISODate(today).getTime() - parseISODate(p.dueDate).getTime()) / 86400000) : 0;
    return { ...p, paid, remaining, state: remaining === 0 ? "paid" : paid > 0 ? "partial" : "unpaid", overdueDays };
  });
}

/* ------------------------------------------------------------------ */
/* Trạng thái đơn hiển thị (suy từ tiền)                                */
/* ------------------------------------------------------------------ */

export const ORDER_DISPLAY_KEYS = ["zero", "unpaid", "paying", "paid_pending", "paid_confirmed", "overpaid", "cancelled", "refunded"] as const;
export type OrderDisplayKey = (typeof ORDER_DISPLAY_KEYS)[number];
export const ORDER_DISPLAY_VI: Record<OrderDisplayKey, string> = {
  zero: "Đơn 0đ — chưa có học phí",
  unpaid: "Chưa đóng",
  paying: "Đang đóng",
  paid_pending: "Đã đóng đủ — chờ kế toán đối soát",
  paid_confirmed: "Đã đóng đủ — kế toán đã đối soát",
  overpaid: "Thu vượt",
  cancelled: "Đã huỷ",
  refunded: "Đã hoàn tiền",
};
export const ORDER_DISPLAY_TOOLTIP = "Trạng thái suy từ tiền đã thu, không phải từ cột trạng thái đơn";

export interface OrderDisplayState {
  key: OrderDisplayKey;
  label: string;
  /** Có khoản sale đã thu mà kế toán chưa đối soát */
  pendingNote: boolean;
  note: string | null;
  /** "Trả góp 3 đợt · Đã đóng đợt 1" */
  installmentsLabel: string | null;
  /** Tiền đã về (đã xác nhận + chờ xác nhận) — "tiền đã về là đã về" */
  received: number;
  /** Công nợ phụ huynh đang thấy (chỉ trừ khoản đã xác nhận) */
  outstanding: number;
}

/**
 * Bản gốc: badge chính suy từ tiền, "đã thu" tính cả khoản kế toán chưa đối soát;
 * còn công nợ phụ huynh vẫn chỉ trừ khoản đã xác nhận.
 */
export function orderDisplayState(p: {
  status: OrderStatus;
  total: number;
  confirmed: number;
  pending: number;
  installments?: number;
  paidInstallments?: number;
}): OrderDisplayState {
  const received = p.confirmed + p.pending;
  const outstanding = Math.max(0, p.total - p.confirmed);
  const n = p.installments ?? 0;
  const paidN = p.paidInstallments ?? 0;
  const installmentsLabel = n > 1 ? `Trả góp ${n} đợt${paidN > 0 ? ` · Đã đóng đợt ${Math.min(paidN, n)}` : ""}` : null;
  const base = { pendingNote: p.pending > 0, note: p.pending > 0 ? "Có khoản chờ kế toán đối soát" : null, installmentsLabel, received, outstanding };
  const mk = (key: OrderDisplayKey): OrderDisplayState => ({ key, label: ORDER_DISPLAY_VI[key], ...base });
  if (p.status === "cancelled") return { ...mk("cancelled"), pendingNote: false, note: null };
  if (p.status === "refunded") return { ...mk("refunded"), pendingNote: false, note: null };
  if (p.total <= 0) return { ...mk("zero"), pendingNote: false, note: null };
  if (p.confirmed > p.total) return { ...mk("overpaid"), note: "Khách chuyển nhiều hơn tổng đơn" };
  if (received <= 0) return mk("unpaid");
  if (received >= p.total) return mk(p.confirmed >= p.total ? "paid_confirmed" : "paid_pending");
  return mk("paying");
}

/* ------------------------------------------------------------------ */
/* Công nợ theo ghi danh                                               */
/* ------------------------------------------------------------------ */

export const DEBT_CHIPS = ["no_fee", "zero", "short", "paid_pending", "paid", "overpaid"] as const;
export type DebtChip = (typeof DEBT_CHIPS)[number];
export const DEBT_CHIP_VI: Record<DebtChip, string> = {
  no_fee: "Chưa chốt học phí",
  zero: "Chưa đóng đồng nào",
  short: "Còn thiếu",
  paid_pending: "Đủ tiền — chờ kế toán xác nhận",
  paid: "Đã đóng đủ",
  overpaid: "Thu vượt",
};

/** Chip công nợ của một ghi danh (recorded = sale đã thu, kế toán chưa xác nhận) */
export function enrollmentDebtChip(p: { hasFee: boolean; total: number; confirmed: number; recorded: number }): DebtChip {
  if (!p.hasFee) return "no_fee";
  if (p.confirmed > p.total) return "overpaid";
  if (p.confirmed >= p.total) return "paid";
  if (p.confirmed + p.recorded >= p.total) return "paid_pending";
  if (p.confirmed + p.recorded <= 0) return "zero";
  return "short";
}

export const DEBT_AGE_BUCKETS = ["current", "b1", "b2", "b3"] as const;
export type DebtAgeBucket = (typeof DEBT_AGE_BUCKETS)[number];
export const DEFAULT_DEBT_AGING_EDGES: readonly [number, number] = [7, 30];

/** Tuổi nợ theo hai mốc cấu hình (mặc định 1–7 / 8–30 / > 30 ngày) */
export function agingBucketBy(overdueDays: number, edges: readonly [number, number] = DEFAULT_DEBT_AGING_EDGES): DebtAgeBucket {
  if (overdueDays <= 0) return "current";
  if (overdueDays <= edges[0]) return "b1";
  if (overdueDays <= edges[1]) return "b2";
  return "b3";
}

export function agingBucketLabels(edges: readonly [number, number] = DEFAULT_DEBT_AGING_EDGES): Record<DebtAgeBucket, string> {
  return {
    current: "Chưa quá hạn",
    b1: `Quá hạn 1–${edges[0]} ngày`,
    b2: `Quá hạn ${edges[0] + 1}–${edges[1]} ngày`,
    b3: `Quá hạn > ${edges[1]} ngày`,
  };
}

export const AGING_BUCKETS = ["current", "d1_30", "d31_60", "d61_90", "d90_plus"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];
export const AGING_BUCKET_VI: Record<AgingBucket, string> = { current: "Chưa đến hạn", d1_30: "Quá hạn 1–30 ngày", d31_60: "31–60 ngày", d61_90: "61–90 ngày", d90_plus: "Trên 90 ngày" };

export function agingBucket(overdueDays: number): AgingBucket {
  if (overdueDays <= 0) return "current";
  if (overdueDays <= 30) return "d1_30";
  if (overdueDays <= 60) return "d31_60";
  if (overdueDays <= 90) return "d61_90";
  return "d90_plus";
}

/** Đợt sắp đến hạn trong N ngày (nhắc công nợ) */
export function dueSoon(plan: readonly InstallmentState[], today: string, withinDays: number): InstallmentState[] {
  const limit = addDays(today, withinDays);
  return plan.filter((p) => p.remaining > 0 && p.dueDate >= today && p.dueDate <= limit);
}

/* ------------------------------------------------------------------ */
/* Xác nhận thanh toán                                                 */
/* ------------------------------------------------------------------ */

export type PaymentDecision = "confirm" | "reject" | "adjust";

export function validatePaymentDecision(input: { status: PaymentStatus; decision: PaymentDecision; recordedBy: string | null; actorId: string; isSuperAdmin: boolean; amount: number; adjustedAmount?: number | null; reason?: string | null }): string[] {
  const errs: string[] = [];
  if (input.status !== "recorded") errs.push("Khoản thu đã được xử lý");
  if (input.recordedBy === input.actorId && !input.isSuperAdmin) errs.push("Người ghi nhận không tự xác nhận khoản thu của mình");
  const reason = (input.reason ?? "").trim();
  if (input.decision === "reject" && reason.length < 5) errs.push("Từ chối cần lý do (tối thiểu 5 ký tự)");
  if (input.decision === "adjust") {
    if (!input.adjustedAmount || input.adjustedAmount <= 0) errs.push("Số tiền điều chỉnh phải > 0");
    if (input.adjustedAmount === input.amount) errs.push("Số tiền điều chỉnh trùng số ghi nhận — dùng Xác nhận");
    if (reason.length < 5) errs.push("Điều chỉnh cần lý do (tối thiểu 5 ký tự)");
  }
  return errs;
}

/** Số phiếu thu: PT-CS1-26-000123 */
export function receiptNumber(centerCode: string, year: number, seq: number): string {
  return `PT-${centerCode}-${String(year % 100).padStart(2, "0")}-${String(seq).padStart(6, "0")}`;
}

/** Mã đơn: DH26-000012 (đánh số theo năm, toàn hệ thống — không lẫn với mã cơ sở khi đối khớp chuyển khoản) */
export function orderCode(year: number, seq: number): string {
  return `DH${String(year % 100).padStart(2, "0")}-${String(seq).padStart(6, "0")}`;
}

/** Nội dung chuyển khoản: bỏ ký tự đặc biệt để ngân hàng không cắt (SATA DH26000012) */
export function transferMemo(code: string): string {
  return `SATA ${code.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}`;
}

/** Tìm mã đơn trong nội dung chuyển khoản (đối khớp biến động số dư) */
export function extractOrderRef(content: string): string | null {
  const m = /DH(\d{2})(\d{6})(?!\d)/.exec(content.replace(/[^A-Za-z0-9]/g, "").toUpperCase());
  return m ? `DH${m[1]}-${m[2]}` : null;
}

/** Che CCCD / số giấy tờ: chỉ giữ 3 số đầu, 2 số cuối */
export function maskIdNumber(id: string | null | undefined): string | null {
  if (!id) return null;
  const s = id.replace(/\s/g, "");
  if (s.length <= 5) return "*".repeat(s.length);
  return `${s.slice(0, 3)}${"*".repeat(s.length - 5)}${s.slice(-2)}`;
}

/* ------------------------------------------------------------------ */
/* Hoàn tiền theo buổi                                                 */
/* ------------------------------------------------------------------ */

export interface RefundInput {
  /** Số đã thu (đã xác nhận) cho gói */
  paid: number;
  /** Giá trị gói (tổng đơn phân bổ cho gói) */
  packageValue: number;
  packageSessions: number;
  consumedSessions: number;
  alreadyRefunded: number;
}

/** Đề xuất hoàn = đã thu − buổi đã học × đơn giá buổi − đã hoàn, làm tròn xuống nghìn */
export function refundProposal(r: RefundInput) {
  const perSession = r.packageSessions > 0 ? r.packageValue / r.packageSessions : 0;
  const used = Math.min(r.consumedSessions, r.packageSessions);
  const usedValue = Math.round(used * perSession);
  const raw = r.paid - usedValue - r.alreadyRefunded;
  const refundable = Math.max(0, Math.floor(raw / 1000) * 1000);
  return { perSession: Math.round(perSession), usedSessions: used, remainingSessions: r.packageSessions - used, usedValue, refundable };
}

export function validateRefundRequest(amount: number, refundable: number, reason: string): string[] {
  const errs: string[] = [];
  if (!Number.isInteger(amount) || amount <= 0) errs.push("Số tiền hoàn phải > 0");
  if (amount > refundable) errs.push(`Số tiền hoàn vượt mức đề xuất theo buổi (${formatVnd(refundable)})`);
  if (reason.trim().length < 5) errs.push("Cần lý do hoàn tiền (tối thiểu 5 ký tự)");
  return errs;
}

const REFUND_T: Record<RefundStatus, Partial<Record<"approve" | "reject" | "pay", RefundStatus>>> = {
  pending: { approve: "approved", reject: "rejected" },
  approved: { pay: "paid", reject: "rejected" },
  rejected: {},
  paid: {},
};

export function refundTransition(from: RefundStatus, event: "approve" | "reject" | "pay"): RefundStatus {
  const to = REFUND_T[from]?.[event];
  if (!to) throw new FinanceRuleError(`Không thể ${event === "approve" ? "duyệt" : event === "reject" ? "từ chối" : "chi hoàn"} yêu cầu đang "${REFUND_STATUS_VI[from]}"`);
  return to;
}

/** Link ảnh QR VietQR (chuẩn NAPAS) cho chuyển khoản */
export function vietQrImageUrl(p: { bankBin: string; accountNo: string; accountName?: string | null; amount: number; memo: string }): string {
  const q = new URLSearchParams({ amount: String(Math.max(0, Math.round(p.amount))), addInfo: p.memo });
  if (p.accountName) q.set("accountName", p.accountName);
  return `https://img.vietqr.io/image/${encodeURIComponent(p.bankBin)}-${encodeURIComponent(p.accountNo)}-compact2.png?${q.toString()}`;
}
