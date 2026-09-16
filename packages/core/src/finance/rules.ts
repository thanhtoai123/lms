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

export const PAYMENT_STATUSES = ["recorded", "confirmed", "rejected"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_STATUS_VI: Record<PaymentStatus, string> = { recorded: "Chờ kế toán xác nhận", confirmed: "Đã xác nhận", rejected: "Bị từ chối" };

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
/* Kế hoạch thanh toán                                                 */
/* ------------------------------------------------------------------ */

export interface Installment { seq: number; amount: number; dueDate: string }

/** Chia đều n đợt, làm tròn nghìn, phần dư dồn đợt cuối; mỗi đợt cách nhau intervalDays */
export function buildInstallmentPlan(total: number, count: number, firstDueDate: string, intervalDays = 30): Installment[] {
  if (!Number.isInteger(count) || count < 1 || count > 4) throw new FinanceRuleError("Kế hoạch thanh toán từ 1 đến 4 đợt");
  if (total <= 0) return [{ seq: 1, amount: Math.max(0, total), dueDate: firstDueDate }];
  const base = Math.floor(total / count / 1000) * 1000;
  return Array.from({ length: count }, (_, i) => ({
    seq: i + 1,
    amount: i === count - 1 ? total - base * (count - 1) : base,
    dueDate: addDays(firstDueDate, i * intervalDays),
  }));
}

export function validateInstallmentPlan(total: number, plan: readonly { amount: number; dueDate: string }[]): string[] {
  const errs: string[] = [];
  if (plan.length < 1 || plan.length > 4) errs.push("Kế hoạch thanh toán từ 1 đến 4 đợt");
  if (plan.some((p) => !Number.isInteger(p.amount) || p.amount <= 0)) errs.push("Mỗi đợt phải có số tiền > 0");
  const sum = plan.reduce((s, p) => s + p.amount, 0);
  if (plan.length && sum !== total) errs.push(`Tổng các đợt (${formatVnd(sum)}) phải bằng tổng đơn (${formatVnd(total)})`);
  for (let i = 1; i < plan.length; i++) if (plan[i]!.dueDate <= plan[i - 1]!.dueDate) errs.push("Hạn các đợt phải tăng dần");
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
