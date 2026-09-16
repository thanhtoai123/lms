/**
 * Hoa hồng sale / người giới thiệu — quy tắc thuần.
 * Ghi nhận khi đơn đã thu đủ; hoàn tiền sau đó → giảm (chưa chi) hoặc thu hồi (đã chi).
 */
import { FinanceRuleError, formatVnd } from "./rules.js";

export const COMMISSION_KINDS = ["sale", "referrer"] as const;
export type CommissionKind = (typeof COMMISSION_KINDS)[number];
export const COMMISSION_KIND_VI: Record<CommissionKind, string> = { sale: "Sale chốt đơn", referrer: "Người giới thiệu" };

export const COMMISSION_STATUSES = ["accrued", "approved", "paid", "cancelled"] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];
export const COMMISSION_STATUS_VI: Record<CommissionStatus, string> = { accrued: "Tạm tính", approved: "Đã duyệt", paid: "Đã chi", cancelled: "Huỷ" };

export const RATE_TYPES = ["percent", "fixed"] as const;
export type RateType = (typeof RATE_TYPES)[number];

export interface CommissionRule {
  id: string;
  kind: CommissionKind;
  centerId: string | null;
  orderType: string | null;
  rateType: RateType;
  /** percent: điểm cơ bản (500 = 5%); fixed: VND */
  value: number;
  maxAmount: number | null;
  minOrderTotal: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
}

export function validateRule(r: Omit<CommissionRule, "id">): string[] {
  const e: string[] = [];
  if (!Number.isInteger(r.value) || r.value <= 0) e.push("Mức hoa hồng phải > 0");
  if (r.rateType === "percent" && r.value > 5000) e.push("Tỷ lệ tối đa 50%");
  if (r.maxAmount != null && r.maxAmount <= 0) e.push("Mức trần phải > 0");
  if (r.minOrderTotal < 0) e.push("Giá trị đơn tối thiểu không âm");
  if (r.effectiveTo && r.effectiveTo < r.effectiveFrom) e.push("Ngày kết thúc phải sau ngày bắt đầu");
  return e;
}

/** Chọn quy tắc áp dụng: riêng cơ sở > dùng chung; riêng loại đơn > mọi loại; hiệu lực mới nhất */
export function pickRule<R extends CommissionRule>(rules: readonly R[], q: { kind: CommissionKind; centerId: string; orderType: string; date: string; total: number }): R | null {
  const ok = rules.filter((r) =>
    r.isActive && r.kind === q.kind && (r.centerId === null || r.centerId === q.centerId) && (r.orderType === null || r.orderType === q.orderType)
    && r.effectiveFrom <= q.date && (!r.effectiveTo || r.effectiveTo >= q.date) && q.total >= r.minOrderTotal);
  ok.sort((a, b) => Number(b.centerId !== null) - Number(a.centerId !== null) || Number(b.orderType !== null) - Number(a.orderType !== null) || b.effectiveFrom.localeCompare(a.effectiveFrom));
  return ok[0] ?? null;
}

/** Tiền hoa hồng, làm tròn xuống nghìn đồng, có trần */
export function computeCommission(rule: Pick<CommissionRule, "rateType" | "value" | "maxAmount">, base: number): number {
  if (base <= 0) return 0;
  const raw = rule.rateType === "percent" ? (base * rule.value) / 10000 : rule.value;
  const capped = rule.maxAmount != null ? Math.min(raw, rule.maxAmount) : raw;
  return Math.floor(capped / 1000) * 1000;
}

export function describeRule(r: Pick<CommissionRule, "rateType" | "value" | "maxAmount">): string {
  const main = r.rateType === "percent" ? `${(r.value / 100).toLocaleString("vi-VN")}%` : formatVnd(r.value);
  return r.maxAmount != null ? `${main} (tối đa ${formatVnd(r.maxAmount)})` : main;
}

const T: Record<CommissionStatus, Partial<Record<"approve" | "pay" | "cancel", CommissionStatus>>> = {
  accrued: { approve: "approved", cancel: "cancelled" },
  approved: { pay: "paid", cancel: "cancelled" },
  paid: {},
  cancelled: {},
};

export function commissionTransition(from: CommissionStatus, action: "approve" | "pay" | "cancel"): CommissionStatus {
  const to = T[from][action];
  if (!to) throw new FinanceRuleError(`Không thể ${action === "approve" ? "duyệt" : action === "pay" ? "chi" : "huỷ"} hoa hồng đang "${COMMISSION_STATUS_VI[from]}"`);
  return to;
}

/**
 * Điều chỉnh khi hoàn tiền: phần hoa hồng theo tỷ lệ tiền hoàn / giá trị tính hoa hồng.
 * - chưa chi (accrued/approved): giảm thẳng số tiền (còn 0 → huỷ)
 * - đã chi: tạo dòng thu hồi âm
 * net = số hoa hồng còn hiệu lực (đã trừ các lần giảm / thu hồi trước).
 */
export function refundAdjustment(c: { status: CommissionStatus; originalAmount: number; net: number; baseAmount: number }, refundAmount: number): { mode: "reduce" | "clawback" | "none"; delta: number } {
  if (c.status === "cancelled" || c.net <= 0 || c.baseAmount <= 0 || refundAmount <= 0) return { mode: "none", delta: 0 };
  const share = Math.min(1, refundAmount / c.baseAmount);
  const delta = Math.min(c.net, Math.ceil((c.originalAmount * share) / 1000) * 1000);
  if (delta <= 0) return { mode: "none", delta: 0 };
  return { mode: c.status === "paid" ? "clawback" : "reduce", delta };
}

export const periodOf = (dateISO: string) => dateISO.slice(0, 7);
