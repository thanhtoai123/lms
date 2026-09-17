/**
 * Sổ lượt chia lead: chỉ lead do máy chia luân phiên mới tiêu lượt; bật lại người nhận / đặt lại lượt
 * đưa về mức thấp nhất (không về 0); chuyển lead phải có ghi chú bàn giao.
 */
import type { DistributionMode } from "./leadMachine.js";

export const ASSIGNMENT_SOURCES = ["auto", "self", "manager", "import", "affiliate", "duplicate"] as const;
export type AssignmentSource = (typeof ASSIGNMENT_SOURCES)[number];
export const ASSIGNMENT_SOURCE_VI: Record<AssignmentSource, string> = {
  auto: "Máy chia",
  self: "Sale tự nhập",
  manager: "Quản lý giao",
  import: "Nhập Excel",
  affiliate: "Mã giới thiệu",
  duplicate: "Nhập lại (trùng)",
};

/** Chỉ lead chia tự động theo chế độ luân phiên mới tiêu lượt */
export function consumesRound(source: AssignmentSource, mode: DistributionMode): boolean {
  return source === "auto" && mode === "round_robin";
}

/** Chế độ có tiêu lượt không (cảnh báo trên màn quản lý chia) */
export function modeConsumesRounds(mode: DistributionMode): boolean {
  return mode === "round_robin";
}

/** Nguồn phân lead khi tạo lead từ phiếu nhập */
export function intakeAssignmentSource(p: { actorId: string | null; assignedToId: string | null; referral?: boolean }): AssignmentSource {
  if (p.assignedToId) return p.actorId && p.actorId === p.assignedToId ? "self" : "manager";
  return p.referral ? "affiliate" : "auto";
}

export const POOL_ACTIONS = ["enable", "disable", "adjust", "reset", "add", "remove"] as const;
export type PoolAction = (typeof POOL_ACTIONS)[number];
export const POOL_ACTION_VI: Record<PoolAction, string> = {
  enable: "Bật nhận lead",
  disable: "Tắt nhận lead",
  adjust: "Chỉnh lượt thủ công",
  reset: "Đặt lại lượt",
  add: "Thêm vào pool",
  remove: "Gỡ khỏi pool",
};

/** Mức lượt thấp nhất của những người đang nhận; null nếu không ai */
export function roundsFloor(values: readonly number[]): number | null {
  return values.length ? Math.min(...values) : null;
}

/**
 * Bật lại một người: lượt = mức thấp nhất của những người đang nhận (không bị dồn lead bù).
 * Không còn ai đang nhận → giữ nguyên.
 */
export function reenableRounds(current: number, othersAvailable: readonly number[]): number {
  return roundsFloor(othersAvailable) ?? current;
}

export function validateRoundAdjust(current: number, next: number, reason: string | null | undefined): string[] {
  const errs: string[] = [];
  if (!Number.isInteger(next) || next < 0 || next > 100_000) errs.push("Lượt phải là số nguyên từ 0");
  if (next === current) errs.push("Bằng số hiện tại — không có gì để điều chỉnh");
  if ((reason ?? "").trim().length < 3) errs.push("Nhập lý do chỉnh lượt (tối thiểu 3 ký tự)");
  return errs;
}

export const HANDOVER_NOTE_MIN = 10;

/**
 * Chuyển lead (bàn giao nội cơ sở hoặc sang cơ sở khác). Lỗi theo bản gốc:
 * thiếu ghi chú bàn giao, bàn giao cho chính sale đang phụ trách, cơ sở + sale đích trùng nguồn.
 */
export function validateLeadTransfer(p: {
  fromCenterId: string | null;
  fromUserId: string | null;
  toCenterId?: string | null;
  toUserId?: string | null;
  handoverNote: string | null | undefined;
}): string[] {
  const errs: string[] = [];
  if ((p.handoverNote ?? "").trim().length < HANDOVER_NOTE_MIN) errs.push(`Bắt buộc ghi đã tư vấn gì cho khách (tối thiểu ${HANDOVER_NOTE_MIN} ký tự)`);
  if (p.toUserId && p.fromUserId && p.toUserId === p.fromUserId) {
    errs.push("Sale nhận phải khác sale đang phụ trách — không thể bàn giao cho chính mình.");
  } else {
    const targetCenter = p.toCenterId ?? p.fromCenterId;
    if (targetCenter === p.fromCenterId && !p.toUserId) errs.push("Cơ sở và sale đích trùng nguồn — chọn cơ sở khác hoặc sale khác để bàn giao.");
  }
  return errs;
}

/** Lead không còn chia lại / phân bổ lại được (đã chốt) */
export function isConvertedLead(p: { status: string; convertedAt?: Date | string | null }): boolean {
  return p.status === "enrolled" || !!p.convertedAt;
}
