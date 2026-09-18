/**
 * Kết thúc hợp đồng nhượng quyền — luật thuần cho việc **bàn giao và khoá dữ liệu**.
 *
 * Ba bước, không bước nào xoá dữ liệu:
 *  1. **Bảng kê** (`previewOffboard`): sẽ khoá những gì, bao nhiêu bản ghi, ai mất quyền truy cập;
 *  2. **Bàn giao** (`exportTenantData`): xuất toàn bộ dữ liệu của trung tâm ra một tệp nén;
 *  3. **Tạm ngừng → Đã đóng**: đổi trạng thái, khoá mọi tài khoản của trung tâm, chặn đăng nhập.
 *
 * Dữ liệu vẫn nằm nguyên trong hệ thống tới hết `dataRetentionYears` rồi mới xoá / ẩn danh
 * theo quy trình bảo vệ dữ liệu cá nhân.
 *
 * Toàn bộ file là hàm thuần — không chạm CSDL.
 */

import type { TenantStatus } from "./tenant.js";

export class TenantOffboardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantOffboardError";
  }
}

export const OFFBOARD_ACTIONS = ["suspend", "close", "reopen"] as const;
export type OffboardAction = (typeof OFFBOARD_ACTIONS)[number];

export const OFFBOARD_ACTION_VI: Record<OffboardAction, string> = {
  suspend: "Tạm ngừng",
  close: "Đóng trung tâm",
  reopen: "Mở lại",
};

/** Mô tả hậu quả của từng hành động — dùng chung cho giao diện và tài liệu */
export const OFFBOARD_EFFECT_VI: Record<OffboardAction, string> = {
  suspend: "Khoá mọi tài khoản của trung tâm, chặn đăng nhập. Dữ liệu giữ nguyên, mở lại được bất cứ lúc nào.",
  close: "Kết thúc hợp đồng: khoá toàn bộ tài khoản, trung tâm không còn trong phạm vi dữ liệu. Dữ liệu giữ theo số năm đã cam kết rồi mới xoá / ẩn danh.",
  reopen: "Mở lại trung tâm đang tạm ngừng: tài khoản phải được mở khoá lại bằng tay ở màn Tài khoản.",
};

/** Trạng thái đích của mỗi hành động */
const TARGET: Record<OffboardAction, TenantStatus> = { suspend: "suspended", close: "closed", reopen: "active" };

/**
 * Chuyển trạng thái hợp lệ. Trả về trạng thái mới, hoặc ném lỗi tiếng Việt.
 *
 * - Không đụng được vào trung tâm gốc của chuỗi (`isDefault`);
 * - Đã đóng thì không tạm ngừng / đóng lại được (mở lại được, coi như huỷ đóng nhầm);
 * - Đang tạm ngừng thì không tạm ngừng lại.
 */
export function nextOffboardStatus(
  current: TenantStatus,
  action: OffboardAction,
  opts: { isDefault?: boolean } = {},
): TenantStatus {
  if (opts.isDefault) throw new TenantOffboardError("Không tạm ngừng / đóng được trung tâm gốc của chuỗi");
  if (action === "suspend" && current === "suspended") throw new TenantOffboardError("Trung tâm đang ở trạng thái Tạm ngừng");
  if (action === "suspend" && current === "closed") throw new TenantOffboardError("Trung tâm đã đóng — muốn tạm ngừng thì Mở lại trước");
  if (action === "close" && current === "closed") throw new TenantOffboardError("Trung tâm đã đóng");
  if (action === "reopen" && current !== "suspended" && current !== "closed") throw new TenantOffboardError("Chỉ mở lại được trung tâm đang Tạm ngừng hoặc Đã đóng");
  return TARGET[action];
}

/** Hành động này có khoá tài khoản của trung tâm không */
export function locksAccounts(action: OffboardAction): boolean {
  return action === "suspend" || action === "close";
}

/** Lý do khoá ghi vào hồ sơ tài khoản (hiện ở màn Tài khoản và ở màn đăng nhập) */
export function lockReasonFor(action: OffboardAction, tenantCode: string): string {
  return action === "close"
    ? `Hợp đồng nhượng quyền của trung tâm ${tenantCode} đã kết thúc — tài khoản bị khoá`
    : `Trung tâm ${tenantCode} đang tạm ngừng hoạt động — tài khoản bị khoá`;
}

/**
 * Xác nhận nguy hiểm: người dùng phải gõ lại ĐÚNG mã trung tâm (IN HOA, không dấu cách).
 * Trả về lỗi tiếng Việt nếu chưa đúng, `null` nếu hợp lệ.
 */
export function validateOffboardConfirm(tenantCode: string, typed: string | null | undefined): string | null {
  const want = tenantCode.trim().toUpperCase();
  const got = (typed ?? "").trim().toUpperCase();
  if (!got) return `Gõ lại mã trung tâm ${want} để xác nhận`;
  if (got !== want) return `Mã xác nhận không khớp — gõ đúng ${want}`;
  return null;
}

/** Ngày hết hạn giữ dữ liệu = ngày đóng + số năm cam kết (ISO yyyy-mm-dd) */
export function retentionUntil(closedAtISO: string, dataRetentionYears: number): string {
  const d = new Date(`${closedAtISO.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new TenantOffboardError("Ngày đóng không hợp lệ");
  const y = d.getUTCFullYear() + Math.max(0, Math.trunc(dataRetentionYears));
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  // 29/02 + n năm rơi vào năm không nhuận → lùi về 28/02
  const end = new Date(Date.UTC(y, m, day));
  if (end.getUTCMonth() !== m) end.setUTCDate(0);
  return end.toISOString().slice(0, 10);
}

/** Tên tệp bàn giao: SATA-FR_HUE-ban-giao-2026-09-18.zip */
export function offboardExportName(tenantCode: string, dateISO: string): string {
  const code = tenantCode.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "") || "TENANT";
  return `${code}-ban-giao-${dateISO.slice(0, 10)}.zip`;
}

/** Một dòng trong bảng kê "sẽ khoá những gì" */
export interface OffboardLine {
  key: string;
  label: string;
  count: number;
  /** `lock` = khoá lại, `keep` = giữ nguyên theo thời hạn, `export` = nằm trong gói bàn giao */
  kind: "lock" | "keep" | "export";
  note?: string;
}

/** Cảnh báo trước khi đóng: còn công nợ, còn lớp đang chạy… (không chặn, chỉ nhắc) */
export function offboardWarnings(x: { openClasses: number; activeStudents: number; debt: number; openOrders: number }): string[] {
  const out: string[] = [];
  if (x.openClasses > 0) out.push(`Còn ${x.openClasses} lớp đang tuyển sinh / đang học — nên kết thúc hoặc bàn giao trước`);
  if (x.activeStudents > 0) out.push(`Còn ${x.activeStudents} học viên đang học — thống nhất phương án chuyển giao với phụ huynh trước khi đóng`);
  if (x.debt > 0) out.push(`Còn công nợ ${x.debt.toLocaleString("vi-VN")}đ chưa thu ở ${x.openOrders} đơn hàng`);
  return out;
}

/** Việc phải làm sau khi đóng — hiện ngay trên màn hình để không ai quên */
export function offboardNextSteps(tenantCode: string, retentionEnd: string): string[] {
  return [
    `Gửi gói bàn giao cho bên nhận nhượng quyền ${tenantCode} và lưu biên bản bàn giao`,
    "Thu hồi quyền dùng thương hiệu, giáo trình, tài liệu theo hợp đồng",
    "Đóng / chuyển số tài khoản ngân hàng và cổng thanh toán của trung tâm",
    `Hẹn lịch xoá hoặc ẩn danh dữ liệu cá nhân sau ngày ${retentionEnd.split("-").reverse().join("/")}`,
  ];
}
