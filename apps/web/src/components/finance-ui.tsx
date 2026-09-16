import { ORDER_STATUS_VI, PAYMENT_STATUS_VI, REFUND_STATUS_VI, type OrderStatus, type PaymentStatus, type RefundStatus } from "@satarobo/core";

export function vnd(n: number | null | undefined) {
  return `${Math.round(n ?? 0).toLocaleString("vi-VN")}đ`;
}

export function fmtD(d: string | Date | null | undefined) {
  if (!d) return "—";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d.split("-").reverse().join("/");
  return new Date(d).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

const ORDER_CHIP: Record<OrderStatus, string> = {
  pending_payment: "bg-amber-100 text-amber-800",
  partially_paid: "bg-sky-100 text-sky-800",
  paid: "bg-green-100 text-green-800",
  cancelled: "bg-slate-100 text-slate-600",
  refunded: "bg-violet-100 text-violet-800",
};
export function OrderChip({ status }: { status: OrderStatus }) {
  return <span className={`chip ${ORDER_CHIP[status]}`}>{ORDER_STATUS_VI[status]}</span>;
}

const PAY_CHIP: Record<PaymentStatus, string> = { recorded: "bg-amber-100 text-amber-800", confirmed: "bg-green-100 text-green-800", rejected: "bg-red-100 text-red-700" };
export function PaymentChip({ status }: { status: PaymentStatus }) {
  return <span className={`chip ${PAY_CHIP[status]}`}>{PAYMENT_STATUS_VI[status]}</span>;
}

const REF_CHIP: Record<RefundStatus, string> = { pending: "bg-amber-100 text-amber-800", approved: "bg-sky-100 text-sky-800", rejected: "bg-red-100 text-red-700", paid: "bg-green-100 text-green-800" };
export function RefundChip({ status }: { status: RefundStatus }) {
  return <span className={`chip ${REF_CHIP[status]}`}>{REFUND_STATUS_VI[status]}</span>;
}

export function Money({ value, tone }: { value: number; tone?: "good" | "bad" | "warn" | "muted" }) {
  const cls = tone === "good" ? "text-green-700" : tone === "bad" ? "text-red-700" : tone === "warn" ? "text-amber-700" : tone === "muted" ? "text-ink-400" : "";
  return <span className={`tabular-nums ${cls}`}>{vnd(value)}</span>;
}
