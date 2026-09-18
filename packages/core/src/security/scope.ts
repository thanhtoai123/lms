/**
 * Kiểm tra phạm vi cơ sở cho một bản ghi đã nạp (chống IDOR).
 *
 * Quy ước: `allowed` là kết quả của `visibleCenterIds(actor)` hoặc `centersWith(actor, perm)`
 * — `null` nghĩa là toàn hệ thống (Hội sở), mảng rỗng nghĩa là không thấy cơ sở nào.
 */

export class ScopeError extends Error {
  constructor(message = "Bản ghi không thuộc phạm vi cơ sở của bạn") {
    super(message);
    this.name = "ScopeError";
  }
}

/** Bản ghi có thuộc phạm vi không. Bản ghi không gắn cơ sở (null) chỉ Hội sở được thấy. */
export function inScope(allowed: readonly string[] | null, centerId: string | null | undefined): boolean {
  if (allowed === null) return true;
  if (!allowed.length) return false;
  if (centerId === null || centerId === undefined) return false;
  return allowed.includes(centerId);
}

/** Ném ScopeError khi ngoài phạm vi — dùng ngay sau khi nạp bản ghi theo id. */
export function assertInScope(allowed: readonly string[] | null, centerId: string | null | undefined, what = "Bản ghi"): void {
  if (!inScope(allowed, centerId)) throw new ScopeError(`${what} không thuộc phạm vi cơ sở của bạn`);
}

/**
 * Lọc danh sách bản ghi theo phạm vi — dùng cho các truy vấn gom nhiều id
 * (ví dụ nhận `ids[]` từ client rồi thao tác hàng loạt).
 */
export function filterInScope<T extends { centerId?: string | null }>(allowed: readonly string[] | null, rows: readonly T[]): T[] {
  if (allowed === null) return [...rows];
  return rows.filter((r) => inScope(allowed, r.centerId ?? null));
}
