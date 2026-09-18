/**
 * Danh mục loại thông báo nội bộ (bản gốc /cau-hinh-van-hanh → "Danh mục thông báo 38 loại").
 * Mỗi loại: `{prefix, label, groupKey, groupLabel, priority, recipients}` + có được đẩy (push) hay không.
 *
 * Danh mục dưới đây rà từ chính các lời gọi `notify(` / `notifyUsers(` / `announceToGroup(` trong packages/api.
 * Bảng `notification_types` trong CSDL ghi đè được `pushEnabled` / `isActive` (đổi phải ghi lý do);
 * loại chưa khai báo thì mặc định **vẫn gửi trong app, không đẩy push**.
 */

import type { Role } from "../policy/policy.js";

export const NOTIFICATION_PRIORITIES = ["urgent", "normal", "info"] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const NOTIFICATION_PRIORITY_VI: Record<NotificationPriority, string> = {
  urgent: "Khẩn",
  normal: "Thường",
  info: "Tham khảo",
};

/** Mức ưu tiên ↔ cột `priority` (số) của bảng user_notifications: 1 cao nhất */
export const NOTIFICATION_PRIORITY_RANK: Record<NotificationPriority, number> = { urgent: 1, normal: 2, info: 3 };
export function priorityFromRank(rank: number): NotificationPriority {
  return rank <= 1 ? "urgent" : rank >= 3 ? "info" : "normal";
}

export const NOTIFICATION_GROUPS = {
  lead: "Khách hàng (lead)",
  trial: "Học thử",
  class: "Lớp & buổi học",
  finance: "Tài chính",
  hr: "Nhân sự & chấm công",
  care: "Chăm sóc & phụ huynh",
  content: "Học liệu & giáo án",
  system: "Hệ thống & vận hành",
} as const;
export type NotificationGroupKey = keyof typeof NOTIFICATION_GROUPS;

export interface NotificationTypeDef {
  /** Mã loại, dạng `phanhe.su_kien` — khớp với bản gốc (vd `lead.moi`, `class.session_changed`) */
  prefix: string;
  label: string;
  groupKey: NotificationGroupKey;
  priority: NotificationPriority;
  /** Vai trò nhận mặc định (rỗng = tính theo nghiệp vụ: người tạo, người phụ trách…) */
  recipients: readonly Role[];
  /** Mặc định có đẩy tới thiết bị không ("Không loại nào được đẩy" là hợp lệ) */
  pushEnabled: boolean;
}

const CENTER_OPS: readonly Role[] = ["CENTER_MANAGER", "CENTER_CLASS_MANAGER"];
const ACCOUNTANTS: readonly Role[] = ["CENTER_ACCOUNTANT", "HO_ACCOUNTANT"];
const SALES: readonly Role[] = ["CENTER_SALES_CSM", "HO_SALE"];
const HRS: readonly Role[] = ["CENTER_HR", "HO_HR"];
const TEACHERS: readonly Role[] = ["TEACHER", "ASSISTANT_TEACHER"];

/** 54 loại — phủ hết các thông báo hệ đang gửi (bản gốc có 38 loại) */
export const NOTIFICATION_TYPES: readonly NotificationTypeDef[] = [
  // — Khách hàng (lead)
  { prefix: "lead.moi", label: "Lead mới được phân công", groupKey: "lead", priority: "normal", recipients: SALES, pushEnabled: true },
  { prefix: "lead.qua-han", label: "Lead quá hạn liên hệ (SLA)", groupKey: "lead", priority: "urgent", recipients: [...SALES, "CENTER_MANAGER"], pushEnabled: true },
  { prefix: "lead.ban-giao", label: "Lead được bàn giao / chia lại", groupKey: "lead", priority: "normal", recipients: SALES, pushEnabled: false },
  { prefix: "affiliate.thuong", label: "Thưởng giới thiệu chờ duyệt", groupKey: "lead", priority: "info", recipients: [...ACCOUNTANTS, "CENTER_MANAGER"], pushEnabled: false },

  // — Học thử
  { prefix: "trial.assigned", label: "Buổi học thử được xếp vào lớp", groupKey: "trial", priority: "normal", recipients: TEACHERS, pushEnabled: true },
  { prefix: "trial.cho-phan-cong-gap", label: "Học thử chờ phân công gấp", groupKey: "trial", priority: "urgent", recipients: CENTER_OPS, pushEnabled: true },
  { prefix: "trial.cancelled", label: "Buổi học thử bị huỷ", groupKey: "trial", priority: "urgent", recipients: SALES, pushEnabled: true },
  { prefix: "trial.rescheduled", label: "Buổi học thử đổi lịch", groupKey: "trial", priority: "urgent", recipients: SALES, pushEnabled: true },
  { prefix: "trial.evaluated", label: "Đã có kết quả buổi học thử", groupKey: "trial", priority: "info", recipients: SALES, pushEnabled: false },

  // — Lớp & buổi học
  { prefix: "class.pending_approval", label: "Lớp mới chờ duyệt", groupKey: "class", priority: "normal", recipients: CENTER_OPS, pushEnabled: false },
  { prefix: "class.approved", label: "Lớp đã được duyệt mở", groupKey: "class", priority: "normal", recipients: TEACHERS, pushEnabled: false },
  { prefix: "class.rejected", label: "Lớp bị trả về nháp", groupKey: "class", priority: "urgent", recipients: CENTER_OPS, pushEnabled: false },
  { prefix: "class.cancelled", label: "Lớp đã huỷ", groupKey: "class", priority: "urgent", recipients: [...TEACHERS, ...CENTER_OPS], pushEnabled: true },
  { prefix: "class.session_changed", label: "Điều chỉnh buổi học", groupKey: "class", priority: "urgent", recipients: TEACHERS, pushEnabled: true },
  { prefix: "class.session_cancelled", label: "Huỷ buổi học", groupKey: "class", priority: "urgent", recipients: TEACHERS, pushEnabled: true },
  { prefix: "class.schedule_changed", label: "Lịch lớp thay đổi / xếp lại buổi", groupKey: "class", priority: "urgent", recipients: TEACHERS, pushEnabled: true },
  { prefix: "class.holiday_shift", label: "Lịch lớp dời do ngày nghỉ", groupKey: "class", priority: "urgent", recipients: TEACHERS, pushEnabled: true },
  { prefix: "session.substitute", label: "Được phân dạy lớp / buổi dạy mới", groupKey: "class", priority: "normal", recipients: TEACHERS, pushEnabled: true },
  { prefix: "class.transfer_submitted", label: "Yêu cầu chuyển lớp chờ duyệt", groupKey: "class", priority: "normal", recipients: CENTER_OPS, pushEnabled: false },
  { prefix: "class.transfer_decided", label: "Kết quả yêu cầu chuyển lớp", groupKey: "class", priority: "normal", recipients: [...CENTER_OPS, ...SALES], pushEnabled: false },
  { prefix: "class.waitlist", label: "Lớp có chỗ trống — danh sách chờ", groupKey: "class", priority: "normal", recipients: CENTER_OPS, pushEnabled: false },

  // — Tài chính
  { prefix: "payment.pending", label: "Khoản thu chờ xác nhận", groupKey: "finance", priority: "normal", recipients: ACCOUNTANTS, pushEnabled: false },
  { prefix: "payment.decided", label: "Khoản thu được điều chỉnh / bị từ chối", groupKey: "finance", priority: "urgent", recipients: [...SALES, ...CENTER_OPS], pushEnabled: false },
  { prefix: "bank.received", label: "Tiền đã về tài khoản", groupKey: "finance", priority: "info", recipients: [...ACCOUNTANTS, ...SALES], pushEnabled: false },
  { prefix: "bank.needs_review", label: "Biến động số dư cần kiểm tra", groupKey: "finance", priority: "urgent", recipients: ACCOUNTANTS, pushEnabled: true },
  { prefix: "bank.surplus", label: "Tiền thừa chưa xử lý", groupKey: "finance", priority: "urgent", recipients: ACCOUNTANTS, pushEnabled: false },
  { prefix: "bank.unlinked", label: "Đã gỡ gắn giao dịch khỏi phiếu thu", groupKey: "finance", priority: "urgent", recipients: [...ACCOUNTANTS, "CENTER_MANAGER"], pushEnabled: false },
  { prefix: "refund.pending", label: "Đề xuất / yêu cầu hoàn tiền chờ duyệt", groupKey: "finance", priority: "normal", recipients: ["CENTER_MANAGER", "HO_ACCOUNTANT"], pushEnabled: false },
  { prefix: "refund.decided", label: "Kết quả hoàn tiền (duyệt / từ chối / đã chi)", groupKey: "finance", priority: "normal", recipients: [...ACCOUNTANTS, ...SALES], pushEnabled: false },
  { prefix: "commission.estimated", label: "Hoa hồng tạm tính", groupKey: "finance", priority: "info", recipients: SALES, pushEnabled: false },
  { prefix: "commission.adjusted", label: "Hoa hồng bị thu hồi / giảm / huỷ", groupKey: "finance", priority: "normal", recipients: SALES, pushEnabled: false },
  { prefix: "einvoice.failed", label: "Hoá đơn điện tử phát hành lỗi", groupKey: "finance", priority: "urgent", recipients: ACCOUNTANTS, pushEnabled: true },

  // — Nhân sự & chấm công
  { prefix: "request.submitted", label: "Đơn từ chờ duyệt", groupKey: "hr", priority: "normal", recipients: [...HRS, "CENTER_MANAGER"], pushEnabled: true },
  { prefix: "request.decided", label: "Kết quả duyệt đơn từ", groupKey: "hr", priority: "normal", recipients: [], pushEnabled: true },
  { prefix: "shift.brief", label: "Lịch ca thay đổi / nhận ca", groupKey: "hr", priority: "info", recipients: [], pushEnabled: false },
  { prefix: "timesheet.override", label: "Công ngày được ghi đè", groupKey: "hr", priority: "info", recipients: [], pushEnabled: false },
  { prefix: "hr.position_changed", label: "Cập nhật vị trí công việc / điều động", groupKey: "hr", priority: "info", recipients: [], pushEnabled: false },
  { prefix: "recruit.candidate", label: "Ứng viên mới / lịch phỏng vấn", groupKey: "hr", priority: "info", recipients: HRS, pushEnabled: false },

  // — Chăm sóc & phụ huynh
  { prefix: "parent_request.new", label: "Yêu cầu mới của phụ huynh", groupKey: "care", priority: "urgent", recipients: [...CENTER_OPS, ...SALES], pushEnabled: true },
  { prefix: "parent_request.assigned", label: "Bạn được giao yêu cầu của phụ huynh", groupKey: "care", priority: "urgent", recipients: [], pushEnabled: true },
  { prefix: "feedback.low", label: "Đánh giá / NPS thấp từ phụ huynh", groupKey: "care", priority: "urgent", recipients: [...CENTER_OPS, ...SALES], pushEnabled: true },
  { prefix: "message.new", label: "Tin nhắn mới từ phụ huynh / kênh ngoài", groupKey: "care", priority: "normal", recipients: [...CENTER_OPS, ...SALES], pushEnabled: true },
  { prefix: "message.assigned", label: "Bạn được giao hội thoại", groupKey: "care", priority: "normal", recipients: [], pushEnabled: false },
  { prefix: "coin.redeem", label: "Yêu cầu đổi quà SataCoin", groupKey: "care", priority: "info", recipients: CENTER_OPS, pushEnabled: false },
  { prefix: "coin.revoked", label: "Xu thưởng bị thu hồi", groupKey: "care", priority: "info", recipients: [], pushEnabled: false },
  { prefix: "care.rui-ro", label: "Học viên cần chăm sóc (cảnh báo rủi ro)", groupKey: "care", priority: "normal", recipients: [...SALES, "CENTER_MANAGER"], pushEnabled: false },
  { prefix: "care.tai-tuc", label: "Học viên hoàn thành khoá — tư vấn tái tục", groupKey: "care", priority: "normal", recipients: SALES, pushEnabled: false },
  { prefix: "report_card.due", label: "Đến hạn viết học bạ năng lực", groupKey: "content", priority: "normal", recipients: TEACHERS, pushEnabled: false },

  // — Học liệu & giáo án
  { prefix: "lesson_proposal.submitted", label: "Đề xuất sửa giáo án chờ xem xét", groupKey: "content", priority: "info", recipients: ["TRAINING"], pushEnabled: false },
  { prefix: "lesson_proposal.decided", label: "Kết quả đề xuất sửa giáo án", groupKey: "content", priority: "info", recipients: TEACHERS, pushEnabled: false },

  // — Hệ thống & vận hành
  { prefix: "action_required", label: "Việc cần thực hiện (rà soát tự động)", groupKey: "system", priority: "urgent", recipients: [...ACCOUNTANTS, "HO_MARKETING", "CENTER_MANAGER"], pushEnabled: true },
  { prefix: "announcement", label: "Thông báo gửi theo nhóm người dùng", groupKey: "system", priority: "normal", recipients: [], pushEnabled: false },
  { prefix: "pilot.blocker", label: "Pilot: sự cố chặn công việc", groupKey: "system", priority: "urgent", recipients: ["SUPER_ADMIN", "HO_HR"], pushEnabled: true },
  { prefix: "pilot.feedback", label: "Phản hồi pilot đã được xử lý", groupKey: "system", priority: "normal", recipients: [], pushEnabled: false },
];

export const NOTIFICATION_PREFIXES = NOTIFICATION_TYPES.map((t) => t.prefix);
export type NotificationPrefix = (typeof NOTIFICATION_TYPES)[number]["prefix"];

const BY_PREFIX = new Map(NOTIFICATION_TYPES.map((t) => [t.prefix, t]));

export function notificationTypeDef(prefix: string | null | undefined): NotificationTypeDef | null {
  return prefix ? BY_PREFIX.get(prefix) ?? null : null;
}

export function notificationGroupLabel(key: string): string {
  return NOTIFICATION_GROUPS[key as NotificationGroupKey] ?? key;
}

/** Nhãn hiển thị của một loại; chưa khai báo thì trả về chính mã loại */
export function notificationLabel(prefix: string | null | undefined): string {
  return notificationTypeDef(prefix)?.label ?? (prefix || "Thông báo");
}

export interface NotificationTypeRow {
  prefix: string;
  pushEnabled: boolean;
  isActive: boolean;
}

export interface DeliveryDecision {
  /** Luôn có thông báo trong app — kể cả loại chưa khai báo */
  inApp: true;
  push: boolean;
  priority: number;
  reason: string;
}

/**
 * Quyết định gửi cho một loại thông báo.
 * - Loại **chưa khai báo** (không có trong danh mục và không có dòng cấu hình): vẫn gửi in-app, KHÔNG đẩy push.
 * - Loại bị tắt (`isActive = false`): vẫn gửi in-app (không mất việc), nhưng không đẩy.
 */
export function decideDelivery(prefix: string | null | undefined, row: NotificationTypeRow | null | undefined, fallbackPriority = 2): DeliveryDecision {
  const def = notificationTypeDef(prefix);
  const priority = def ? NOTIFICATION_PRIORITY_RANK[def.priority] : fallbackPriority;
  if (!prefix) return { inApp: true, push: false, priority: fallbackPriority, reason: "Không khai loại — chỉ gửi trong app" };
  if (row) {
    if (!row.isActive) return { inApp: true, push: false, priority, reason: "Loại đang tắt — chỉ gửi trong app" };
    return { inApp: true, push: row.pushEnabled, priority, reason: row.pushEnabled ? "Cấu hình cho phép đẩy" : "Cấu hình không đẩy" };
  }
  if (!def) return { inApp: true, push: false, priority: fallbackPriority, reason: "Loại chưa khai báo — chỉ gửi trong app" };
  return { inApp: true, push: def.pushEnabled, priority, reason: def.pushEnabled ? "Mặc định danh mục: có đẩy" : "Mặc định danh mục: không đẩy" };
}

/** Lý do bắt buộc khi đổi danh mục thông báo (giống mọi tab Cấu hình vận hành) */
export function validateNotificationTypeReason(reason: string | null | undefined): string | null {
  const r = (reason ?? "").trim();
  if (r.length < 5) return "Đổi danh mục thông báo phải ghi lý do (tối thiểu 5 ký tự)";
  if (r.length > 300) return "Lý do tối đa 300 ký tự";
  return null;
}

/* ------------------------------------------------------------------ */
/* "Cần thực hiện" (action_required) — bản gốc /thong-bao              */
/* ------------------------------------------------------------------ */

export const ACTION_ALERT_CODES = ["bank_unallocated", "marketing_report_missing", "marketing_spend_open"] as const;
export type ActionAlertCode = (typeof ACTION_ALERT_CODES)[number];
export const ACTION_ALERT_CODE_VI: Record<ActionAlertCode, string> = {
  bank_unallocated: "Giao dịch chưa rót vào phiếu thu",
  marketing_report_missing: "Thiếu báo cáo marketing tháng",
  marketing_spend_open: "Chi phí marketing chưa chốt",
};

export interface ActionAlert {
  code: ActionAlertCode;
  title: string;
  body: string;
  link: string;
  /** Chống tạo trùng trong cùng một ngày: cùng khoá thì không sinh lại */
  dedupeKey: string;
}

export interface ActionAlertInput {
  /** Ngày hiện tại theo giờ Việt Nam (YYYY-MM-DD) */
  today: string;
  /** Giao dịch tiền vào chưa gắn được phiếu thu nào */
  bankUnallocated: { count: number; amount: number };
  /** Kỳ (YYYY-MM) chưa có báo cáo marketing — chỉ truyền vào khi đã quá ngày chốt */
  missingMarketingPeriods: readonly string[];
  /** Kỳ (YYYY-MM) còn chi phí marketing chưa chốt */
  openMarketingSpendPeriods: readonly string[];
}

/** Ngày trong tháng mà bản gốc coi là hạn nộp báo cáo marketing của kỳ trước */
export const MARKETING_REPORT_DUE_DAY = 5;

const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")} đ`;

/** Kỳ ngay trước kỳ của `today` (YYYY-MM) */
export function previousPeriod(today: string): string {
  const [y, m] = today.slice(0, 7).split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Đã quá ngày chốt (mặc định 05) của tháng hiện tại chưa */
export function marketingReportOverdue(today: string, dueDay = MARKETING_REPORT_DUE_DAY): boolean {
  return Number(today.slice(8, 10)) > dueDay;
}

/**
 * Sinh danh sách cảnh báo "Cần thực hiện" như bản gốc.
 * Hàm thuần: service chỉ đếm dữ liệu rồi gọi vào đây, và bỏ qua alert có `dedupeKey` đã tồn tại trong ngày.
 */
export function buildActionAlerts(x: ActionAlertInput): ActionAlert[] {
  const day = x.today.slice(0, 10);
  const out: ActionAlert[] = [];

  if (x.bankUnallocated.count > 0) {
    out.push({
      code: "bank_unallocated",
      title: "Cần đối soát tay giao dịch ngân hàng",
      body: `${x.bankUnallocated.count} giao dịch (${vnd(x.bankUnallocated.amount)}) chưa rót được vào phiếu thu nào — cần đối soát tay`,
      link: "/bien-dong-so-du?status=unmatched",
      dedupeKey: `action:bank_unallocated:${day}`,
    });
  }

  for (const period of [...new Set(x.missingMarketingPeriods)].sort()) {
    out.push({
      code: "marketing_report_missing",
      title: "Thiếu báo cáo marketing",
      body: `Thiếu báo cáo marketing tháng ${period} — đã quá ngày ${String(MARKETING_REPORT_DUE_DAY).padStart(2, "0")}`,
      link: `/marketing?period=${period}`,
      dedupeKey: `action:marketing_report_missing:${period}:${day}`,
    });
  }

  for (const period of [...new Set(x.openMarketingSpendPeriods)].sort()) {
    out.push({
      code: "marketing_spend_open",
      title: "Chi phí marketing chưa chốt",
      body: `Chi phí marketing kỳ ${period} chưa chốt`,
      link: `/marketing?tab=chi-phi&period=${period}`,
      dedupeKey: `action:marketing_spend_open:${period}:${day}`,
    });
  }

  return out;
}
