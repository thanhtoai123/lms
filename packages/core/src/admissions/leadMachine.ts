/**
 * Vòng đời lead (tuyển sinh). Tương thích 9 trạng thái của hệ cũ nhưng có luật chuyển rõ ràng
 * và SLA gắn với từng trạng thái, để "Lead cần xử lý" là truy vấn thay vì danh sách 180 dòng.
 */
export const LEAD_STATUSES = [
  "new", // Mới
  "contacted", // Đã liên hệ
  "nurturing", // Đang nuôi dưỡng
  "trial_scheduled", // Đã hẹn học thử
  "trial_done", // Đã học thử
  "consulting", // Đang tư vấn
  "deciding", // Chờ quyết định
  "enrolled", // Đã đăng ký
  "lost", // Đã mất
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_VI: Record<LeadStatus, string> = {
  new: "Mới",
  contacted: "Đã liên hệ",
  nurturing: "Đang nuôi dưỡng",
  trial_scheduled: "Đã hẹn học thử",
  trial_done: "Đã học thử",
  consulting: "Đang tư vấn",
  deciding: "Chờ quyết định",
  enrolled: "Đã đăng ký",
  lost: "Đã mất",
};

export type LeadEvent =
  | "contact" // gọi/nhắn lần đầu thành công
  | "nurture" // chưa sẵn sàng, đưa vào nuôi dưỡng
  | "schedule_trial"
  | "trial_attended"
  | "trial_no_show"
  | "consult"
  | "await_decision"
  | "enroll"
  | "lose"
  | "reopen";

const T: Record<LeadStatus, Partial<Record<LeadEvent, LeadStatus>>> = {
  new: { contact: "contacted", nurture: "nurturing", schedule_trial: "trial_scheduled", lose: "lost" },
  contacted: { nurture: "nurturing", schedule_trial: "trial_scheduled", consult: "consulting", lose: "lost" },
  nurturing: { contact: "contacted", schedule_trial: "trial_scheduled", consult: "consulting", lose: "lost" },
  trial_scheduled: { trial_attended: "trial_done", trial_no_show: "nurturing", schedule_trial: "trial_scheduled", lose: "lost" },
  trial_done: { consult: "consulting", await_decision: "deciding", enroll: "enrolled", lose: "lost" },
  consulting: { await_decision: "deciding", enroll: "enrolled", schedule_trial: "trial_scheduled", lose: "lost" },
  deciding: { enroll: "enrolled", consult: "consulting", nurture: "nurturing", lose: "lost" },
  enrolled: {},
  lost: { reopen: "new" },
};

export class LeadTransitionError extends Error {
  constructor(public readonly from: LeadStatus, public readonly event: LeadEvent) {
    super(`Không thể ${event} từ trạng thái ${from}`);
    this.name = "LeadTransitionError";
  }
}

export function leadTransition(from: LeadStatus, event: LeadEvent): LeadStatus {
  const to = T[from]?.[event];
  if (!to) throw new LeadTransitionError(from, event);
  return to;
}

export function leadEventsFor(status: LeadStatus): LeadEvent[] {
  return Object.keys(T[status] ?? {}) as LeadEvent[];
}

/** Trạng thái còn "mở" — cần chăm sóc */
export const OPEN_LEAD_STATUSES: readonly LeadStatus[] = ["new", "contacted", "nurturing", "trial_scheduled", "trial_done", "consulting", "deciding"];

/**
 * SLA: sau bao nhiêu phút kể từ lần chạm gần nhất (hoặc từ lúc vào trạng thái) thì lead bị coi là quá hạn.
 * Cấu hình được theo cơ sở (giai đoạn sau); đây là mặc định vận hành.
 */
export interface SlaPolicy {
  minutesByStatus: Record<LeadStatus, number | null>; // null = không áp SLA
}

export const DEFAULT_SLA: SlaPolicy = {
  minutesByStatus: {
    new: 15, // lead mới phải được gọi trong 15 phút
    contacted: 24 * 60,
    nurturing: 7 * 24 * 60,
    trial_scheduled: 24 * 60, // nhắc xác nhận trước buổi thử
    trial_done: 24 * 60, // gọi ngay sau học thử
    consulting: 2 * 24 * 60,
    deciding: 3 * 24 * 60,
    enrolled: null,
    lost: null,
  },
};

export interface SlaResult {
  dueAt: string | null; // ISO datetime
  overdueMinutes: number; // >0 nếu quá hạn
  level: "ok" | "warning" | "overdue";
}

export function computeSla(status: LeadStatus, lastTouchAt: string, now: string, policy: SlaPolicy = DEFAULT_SLA): SlaResult {
  const minutes = policy.minutesByStatus[status];
  if (minutes === null || minutes === undefined) return { dueAt: null, overdueMinutes: 0, level: "ok" };
  const due = new Date(lastTouchAt).getTime() + minutes * 60_000;
  const diff = (new Date(now).getTime() - due) / 60_000;
  const dueAt = new Date(due).toISOString();
  if (diff > 0) return { dueAt, overdueMinutes: Math.round(diff), level: "overdue" };
  if (-diff <= minutes * 0.25) return { dueAt, overdueMinutes: 0, level: "warning" };
  return { dueAt, overdueMinutes: 0, level: "ok" };
}

/**
 * Phân bổ lead round-robin theo tải hiện tại: chọn sale có ít lead mở nhất (tie → theo thứ tự).
 * Trả về null nếu không có sale khả dụng.
 */
export function pickAssignee(candidates: { id: string; openLeads: number; isAvailable: boolean }[]): string | null {
  const avail = candidates.filter((c) => c.isAvailable);
  if (avail.length === 0) return null;
  return avail.reduce((best, c) => (c.openLeads < best.openLeads ? c : best), avail[0]!).id;
}

/** Chuẩn hoá SĐT Việt Nam về dạng 84xxxxxxxxx để khớp trùng */
export function normalizeVnPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.startsWith("84") && digits.length === 11) return digits;
  if (digits.startsWith("0") && digits.length === 10) return "84" + digits.slice(1);
  if (digits.length === 9) return "84" + digits;
  return null;
}

/** Che SĐT khi hiển thị cho vai trò không có quyền xem đầy đủ: 84 90xxx0293 */
export function maskPhone(phone: string): string {
  if (phone.length < 7) return "***";
  return phone.slice(0, 4) + "xxx" + phone.slice(-4);
}
