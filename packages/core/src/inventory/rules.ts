/**
 * Kho & học cụ: mặt hàng, bộ học cụ (BOM), nhập / xuất / chuyển kho, cho thuê, kiểm kê — quy tắc thuần.
 * Tồn kho không bao giờ âm; mọi thay đổi tồn đi qua phiếu (movement) bất biến.
 */
import { addDays } from "../dates.js";

export class InventoryRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryRuleError";
  }
}
const fail = (m: string): never => { throw new InventoryRuleError(m); };

export const ITEM_TYPES = ["kit", "component", "product", "material"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];
export const ITEM_TYPE_VI: Record<ItemType, string> = { kit: "Bộ học cụ", component: "Linh kiện", product: "Sản phẩm bán / thuê", material: "Vật tư lớp học" };

export const MOVEMENT_TYPES = ["receipt", "issue", "return", "sale", "sale_return", "rent_out", "rent_return", "transfer_out", "transfer_in", "assemble_in", "assemble_out", "adjust", "damage"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];
export const MOVEMENT_TYPE_VI: Record<MovementType, string> = {
  receipt: "Nhập kho", issue: "Xuất cho học viên / lớp", return: "Học viên trả lại", sale: "Bán", sale_return: "Hoàn hàng bán",
  rent_out: "Cho thuê", rent_return: "Nhận lại hàng thuê", transfer_out: "Chuyển đi", transfer_in: "Nhận chuyển kho",
  assemble_in: "Đóng bộ (thành phẩm)", assemble_out: "Đóng bộ (tiêu hao linh kiện)", adjust: "Điều chỉnh kiểm kê", damage: "Hỏng / mất",
};
/** Chiều tác động tồn: +1 tăng, -1 giảm, 0 = theo dấu số lượng (kiểm kê) */
export const MOVEMENT_SIGN: Record<MovementType, 1 | -1 | 0> = {
  receipt: 1, issue: -1, return: 1, sale: -1, sale_return: 1, rent_out: -1, rent_return: 1, transfer_out: -1, transfer_in: 1,
  assemble_in: 1, assemble_out: -1, adjust: 0, damage: -1,
};
/** Loại phiếu người dùng được lập tay (còn lại sinh từ nghiệp vụ) */
export const MANUAL_MOVEMENTS: readonly MovementType[] = ["receipt", "issue", "return", "damage"];
/** Loại cần ghi chú lý do */
export const MOVEMENT_NEEDS_NOTE: readonly MovementType[] = ["damage", "adjust", "return"];

export const MAX_QTY = 100_000;

/** Số lượng có dấu sẽ ghi vào sổ; ném lỗi nếu làm tồn âm */
export function signedQty(type: MovementType, qty: number, onHand: number): number {
  if (!Number.isInteger(qty) || qty === 0) fail("Số lượng phải là số nguyên khác 0");
  if (Math.abs(qty) > MAX_QTY) fail(`Số lượng tối đa ${MAX_QTY}`);
  const sign = MOVEMENT_SIGN[type];
  if (sign !== 0 && qty < 0) fail("Số lượng phải > 0");
  const delta = sign === 0 ? qty : sign * qty;
  if (onHand + delta < 0) fail(`Không đủ tồn: hiện có ${onHand}, cần ${-delta}`);
  return delta;
}

export function validateMovement(x: { type: MovementType; qty: number; unitCost?: number | null; note?: string | null; studentId?: string | null; classId?: string | null }): string[] {
  const e: string[] = [];
  if (!Number.isInteger(x.qty) || x.qty <= 0) e.push("Số lượng phải là số nguyên > 0");
  if (x.qty > MAX_QTY) e.push(`Số lượng tối đa ${MAX_QTY}`);
  if (x.type === "receipt" && (x.unitCost == null || x.unitCost < 0 || !Number.isInteger(x.unitCost))) e.push("Phiếu nhập cần đơn giá nhập (số nguyên ≥ 0)");
  if ((x.type === "issue" || x.type === "return") && !x.studentId && !x.classId) e.push("Chọn học viên hoặc lớp nhận / trả");
  if (MOVEMENT_NEEDS_NOTE.includes(x.type) && (x.note ?? "").trim().length < 5) e.push("Cần ghi lý do (tối thiểu 5 ký tự)");
  return e;
}

/** Giá vốn bình quân gia quyền sau khi nhập */
export function movingAverageCost(onHand: number, avgCost: number, inQty: number, inCost: number): number {
  const total = Math.max(0, onHand) + inQty;
  if (total <= 0) return avgCost;
  return Math.round((Math.max(0, onHand) * avgCost + inQty * inCost) / total);
}

export type StockTone = "out" | "low" | "ok";
export function stockTone(onHand: number, reorderLevel: number): StockTone {
  if (onHand <= 0) return "out";
  if (reorderLevel > 0 && onHand <= reorderLevel) return "low";
  return "ok";
}

/** Số bộ đóng được tối đa từ tồn linh kiện */
export function maxAssemblable(bom: { componentId: string; qty: number }[], stock: Record<string, number>): number {
  if (!bom.length) return 0;
  return Math.min(...bom.map((b) => (b.qty > 0 ? Math.floor((stock[b.componentId] ?? 0) / b.qty) : 0)));
}

export function validateBom(kitId: string, lines: { componentId: string; qty: number }[]): string[] {
  const e: string[] = [];
  if (!lines.length) e.push("Bộ học cụ cần ít nhất 1 linh kiện");
  const seen = new Set<string>();
  for (const l of lines) {
    if (l.componentId === kitId) e.push("Bộ học cụ không thể chứa chính nó");
    if (seen.has(l.componentId)) e.push("Linh kiện bị lặp");
    seen.add(l.componentId);
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > 1000) e.push("Số lượng linh kiện 1–1000");
  }
  return [...new Set(e)];
}

export function validateItem(x: { sku: string; name: string; type: ItemType; unit: string; salePrice?: number | null; rentPrice?: number | null; deposit?: number | null; reorderLevel?: number }): string[] {
  const e: string[] = [];
  if (!/^[A-Z0-9][A-Z0-9._-]{1,39}$/.test(x.sku)) e.push("Mã hàng (SKU) 2–40 ký tự IN HOA, số, . _ -");
  if (x.name.trim().length < 2) e.push("Tên hàng tối thiểu 2 ký tự");
  if (!x.unit.trim()) e.push("Cần đơn vị tính");
  for (const [k, v] of [["Giá bán", x.salePrice], ["Giá thuê", x.rentPrice], ["Tiền cọc", x.deposit]] as const) {
    if (v != null && (!Number.isInteger(v) || v < 0)) e.push(`${k} phải là số nguyên ≥ 0`);
  }
  if (x.rentPrice && x.type !== "product" && x.type !== "kit") e.push("Chỉ sản phẩm / bộ học cụ mới cho thuê");
  if (x.reorderLevel != null && (!Number.isInteger(x.reorderLevel) || x.reorderLevel < 0)) e.push("Mức tồn tối thiểu ≥ 0");
  return e;
}

/* ------------------------------------------------------------------ */
/* Cho thuê                                                            */
/* ------------------------------------------------------------------ */

export const RENTAL_STATUSES = ["out", "returned", "lost"] as const;
export type RentalStatus = (typeof RENTAL_STATUSES)[number];
export const RENTAL_STATUS_VI: Record<RentalStatus, string> = { out: "Đang thuê", returned: "Đã trả", lost: "Mất / không trả" };
export const MAX_RENT_DAYS = 365;

export function rentalDueDate(start: string, days: number): string {
  if (!Number.isInteger(days) || days < 1 || days > MAX_RENT_DAYS) fail(`Thời hạn thuê 1–${MAX_RENT_DAYS} ngày`);
  return addDays(start, days);
}
export function rentalOverdueDays(due: string, today: string): number {
  if (today <= due) return 0;
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86_400_000);
}
/** Tiền thuê: làm tròn theo tháng (30 ngày), tối thiểu 1 tháng */
export function rentalFee(monthlyPrice: number, days: number): number {
  return monthlyPrice * Math.max(1, Math.ceil(days / 30));
}
/** Khấu trừ cọc khi trả: hỏng trừ tối đa cọc */
export function depositRefund(deposit: number, damageCharge: number, lateDays: number, lateFeePerDay: number): { refund: number; charged: number } {
  const charged = Math.min(deposit, Math.max(0, damageCharge) + Math.max(0, lateDays) * Math.max(0, lateFeePerDay));
  return { refund: deposit - charged, charged };
}

/* ------------------------------------------------------------------ */
/* Kiểm kê                                                             */
/* ------------------------------------------------------------------ */

export const AUDIT_STATUSES = ["draft", "submitted", "approved", "cancelled"] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];
export const AUDIT_STATUS_VI: Record<AuditStatus, string> = { draft: "Đang đếm", submitted: "Chờ duyệt", approved: "Đã chốt", cancelled: "Đã huỷ" };
export type AuditAction = "submit" | "approve" | "reopen" | "cancel";

export function auditTransition(from: AuditStatus, action: AuditAction): AuditStatus {
  const map: Record<AuditStatus, Partial<Record<AuditAction, AuditStatus>>> = {
    draft: { submit: "submitted", cancel: "cancelled" },
    submitted: { approve: "approved", reopen: "draft", cancel: "cancelled" },
    approved: {},
    cancelled: {},
  };
  return map[from][action] ?? fail(`Phiếu kiểm kê "${AUDIT_STATUS_VI[from]}" không thể ${action}`);
}

/** Chênh lệch lớn: ≥ 5 đơn vị hoặc ≥ 10% tồn sổ */
export function isLargeVariance(systemQty: number, counted: number): boolean {
  const v = Math.abs(counted - systemQty);
  if (v === 0) return false;
  return v >= 5 || (systemQty > 0 && v / systemQty >= 0.1) || systemQty === 0;
}

export function validateAuditSubmit(lines: { systemQty: number; countedQty: number | null; note?: string | null }[]): string[] {
  const e: string[] = [];
  if (!lines.length) e.push("Phiếu kiểm kê chưa có mặt hàng");
  const missing = lines.filter((l) => l.countedQty === null).length;
  if (missing) e.push(`Còn ${missing} mặt hàng chưa nhập số đếm`);
  if (lines.some((l) => l.countedQty !== null && (!Number.isInteger(l.countedQty) || l.countedQty < 0))) e.push("Số đếm phải là số nguyên ≥ 0");
  const noNote = lines.filter((l) => l.countedQty !== null && isLargeVariance(l.systemQty, l.countedQty) && (l.note ?? "").trim().length < 5).length;
  if (noNote) e.push(`${noNote} dòng chênh lệch lớn cần ghi chú nguyên nhân`);
  return e;
}

export function auditSummary(lines: { systemQty: number; countedQty: number | null; avgCost?: number }[]) {
  let over = 0, short = 0, value = 0, diffLines = 0;
  for (const l of lines) {
    if (l.countedQty === null) continue;
    const v = l.countedQty - l.systemQty;
    if (v) diffLines++;
    if (v > 0) over += v; else short += -v;
    value += v * (l.avgCost ?? 0);
  }
  return { over, short, value, diffLines, counted: lines.filter((l) => l.countedQty !== null).length, total: lines.length };
}

export type StockCodePrefix = "PN" | "PX" | "KK" | "TH" | "CK" | "DB" | "BH" | "DQ";
export function stockCode(prefix: StockCodePrefix, centerCode: string, year: number, seq: number): string {
  return `${prefix}-${centerCode}-${String(year).slice(-2)}-${String(seq).padStart(5, "0")}`;
}
