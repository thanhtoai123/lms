/**
 * Lead dùng chung (bản gốc: "Dùng chung cho CSKH cùng cơ sở") — quy tắc thuần.
 *
 * Người chỉ có `lead:read_own` (vd HO_SALE, sale cơ sở giới hạn) chỉ thấy lead của mình.
 * Khi lead được **bật dùng chung**, mọi CSKH **cùng cơ sở** với lead cũng thấy được lead đó
 * — để người trực hôm nay trả lời khách mà không phải chờ sale chủ quản.
 * Người có `lead:read` đầy đủ (không chỉ _own) vẫn thấy theo phạm vi cơ sở như trước.
 */

/** Nhãn nút / trạng thái — giữ nguyên văn bản bản gốc */
export const LEAD_SHARE_LABEL = {
  toggle: "Dùng chung cho CSKH cùng cơ sở",
  on: "Đang dùng chung",
  off: "Đã tắt dùng chung",
  chip: "Dùng chung",
  mineShared: "Bạn đang chia sẻ lead này",
} as const;

export interface LeadShareRow {
  /** Sale đang giữ lead */
  assignedToId: string | null;
  /** Cơ sở của lead; null = chưa gắn cơ sở (pool Hội sở) */
  centerId: string | null;
  sharedWithCenter: boolean;
}

export interface LeadReaderView {
  userId: string;
  /** true = có `lead:read` đầy đủ ở phạm vi đang xét (không phải chỉ `lead:read_own`) */
  fullRead: boolean;
  /** Cơ sở người này thuộc về; null = toàn hệ thống (Hội sở) */
  centerIds: string[] | null;
}

/** Lead không gắn cơ sở coi như "cùng cơ sở" với mọi người (pool chung). */
export function sameCenter(reader: LeadReaderView, lead: LeadShareRow): boolean {
  if (reader.centerIds === null) return true;
  if (lead.centerId === null) return true;
  return reader.centerIds.includes(lead.centerId);
}

/**
 * Người đọc có thấy lead này không.
 * - `fullRead` → thấy mọi lead trong phạm vi cơ sở của mình.
 * - chỉ `lead:read_own` → thấy lead mình đang giữ, **và** lead đã bật dùng chung trong cơ sở của mình.
 */
export function canSeeLead(reader: LeadReaderView, lead: LeadShareRow): boolean {
  if (!sameCenter(reader, lead)) return false;
  if (reader.fullRead) return true;
  if (lead.assignedToId && lead.assignedToId === reader.userId) return true;
  return lead.sharedWithCenter;
}

/** Lý do thấy được lead — để hiển thị nhãn "Dùng chung" trên danh sách */
export type LeadVisibilityReason = "full" | "owner" | "shared" | "hidden";
export function leadVisibilityReason(reader: LeadReaderView, lead: LeadShareRow): LeadVisibilityReason {
  if (!sameCenter(reader, lead)) return "hidden";
  if (lead.assignedToId && lead.assignedToId === reader.userId) return "owner";
  if (reader.fullRead) return "full";
  return lead.sharedWithCenter ? "shared" : "hidden";
}

/** Lọc danh sách lead theo quyền đọc (dùng cho kiểm thử và cho các đường không đi qua SQL). */
export function filterVisibleLeads<T extends LeadShareRow>(reader: LeadReaderView, leads: readonly T[]): T[] {
  return leads.filter((l) => canSeeLead(reader, l));
}

/** Ai được bật/tắt dùng chung: sale đang giữ lead, hoặc người có quyền sửa lead của cơ sở. */
export function canToggleLeadShare(reader: LeadReaderView & { canUpdateCenter: boolean }, lead: LeadShareRow): boolean {
  if (!sameCenter(reader, lead)) return false;
  return reader.canUpdateCenter || (!!lead.assignedToId && lead.assignedToId === reader.userId);
}

/** Câu thông báo sau khi bật/tắt */
export function leadShareNotice(on: boolean): string {
  return on ? LEAD_SHARE_LABEL.on : LEAD_SHARE_LABEL.off;
}
