/**
 * Vòng đời lead (tuyển sinh). Tương thích 9 trạng thái của hệ cũ nhưng có luật chuyển rõ ràng
 * và SLA gắn với từng trạng thái, để "Lead cần xử lý" là truy vấn thay vì danh sách 180 dòng.
 */
export const LEAD_STATUSES = [
  "new", // Mới
  "contacted", // Đã liên hệ
  "nurturing", // Đang nuôi dưỡng
  "trial_scheduled", // Đã hẹn học thử
  "trial_in_progress", // Đang học thử (gói học thử nhiều buổi / lớp trial)
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
  trial_in_progress: "Đang học thử",
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
  | "start_trial" // học viên bắt đầu buổi thử đầu tiên (còn buổi thử tiếp)
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
  trial_scheduled: { start_trial: "trial_in_progress", trial_attended: "trial_done", trial_no_show: "nurturing", schedule_trial: "trial_scheduled", lose: "lost" },
  trial_in_progress: { trial_attended: "trial_done", trial_no_show: "nurturing", enroll: "enrolled", lose: "lost" },
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
export const OPEN_LEAD_STATUSES: readonly LeadStatus[] = ["new", "contacted", "nurturing", "trial_scheduled", "trial_in_progress", "trial_done", "consulting", "deciding"];

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
    trial_in_progress: 3 * 24 * 60, // đang học thử: hỏi thăm sau mỗi buổi
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

/* ------------------------------------------------------------------ */
/* Chia lead — 3 chế độ như hệ cũ: luân phiên đều lượt / theo tỷ lệ chốt / quản lý giao tay */
/* ------------------------------------------------------------------ */
export const DISTRIBUTION_MODES = ["round_robin", "by_conversion", "manual"] as const;
export type DistributionMode = (typeof DISTRIBUTION_MODES)[number];
export const DISTRIBUTION_MODE_VI: Record<DistributionMode, string> = {
  round_robin: "Luân phiên đều lượt",
  by_conversion: "Theo tỷ lệ chốt",
  manual: "Quản lý giao tay",
};

export interface AssigneeCandidate {
  id: string;
  isAvailable: boolean;
  /** Lượt đã nhận trong chu kỳ hiện tại (reset khi "Đặt lại lượt") */
  roundsReceived: number;
  /** Lead đang giữ (trạng thái mở) */
  openLeads: number;
  /** Thống kê chốt: lead đã được giao / đã chốt (enrolled) — dùng cho chế độ theo tỷ lệ */
  totalAssigned: number;
  converted: number;
  lastAssignedAt: string | null;
  weight?: number;
}

/** Tỷ lệ chốt làm trơn (Laplace) để sale mới chưa có số liệu vẫn được nhận lead */
export function conversionScore(c: { totalAssigned: number; converted: number }) {
  return (c.converted + 1) / (c.totalAssigned + 2);
}

/**
 * Chọn sale nhận lead theo chế độ. Trả về null nếu không có ai khả dụng hoặc chế độ giao tay.
 * - round_robin: ít lượt nhất → tie: lần nhận cũ nhất (chưa từng nhận trước).
 * - by_conversion: điểm = tỷ lệ chốt × trọng số; tie: ít lead mở hơn.
 */
export function pickAssigneeByMode(mode: DistributionMode, candidates: AssigneeCandidate[]): string | null {
  if (mode === "manual") return null;
  const avail = candidates.filter((c) => c.isAvailable);
  if (avail.length === 0) return null;
  const ts = (c: AssigneeCandidate) => (c.lastAssignedAt ? new Date(c.lastAssignedAt).getTime() : 0);
  if (mode === "round_robin") {
    return avail.reduce((best, c) => {
      const w = (x: AssigneeCandidate) => x.roundsReceived / Math.max(1, x.weight ?? 1);
      if (w(c) < w(best)) return c;
      if (w(c) === w(best) && ts(c) < ts(best)) return c;
      return best;
    }, avail[0]!).id;
  }
  return avail.reduce((best, c) => {
    const sc = (x: AssigneeCandidate) => conversionScore(x) * Math.max(1, x.weight ?? 1);
    if (sc(c) > sc(best)) return c;
    if (sc(c) === sc(best) && c.openLeads < best.openLeads) return c;
    return best;
  }, avail[0]!).id;
}

/** Bộ tham số SLA/tuyển sinh có thể cấu hình theo cơ sở (đối chiếu ADMIN-SPEC §13.1) */
export interface AdmissionsPolicy {
  distributionMode: DistributionMode;
  /** Trùng SĐT trong N ngày → gộp vào lead cũ thay vì tạo mới */
  dedupeDays: number;
  /** Số buổi học thử tối đa cho một khách */
  maxTrialsPerLead: number;
  /** Lead im lặng bao lâu (ngày) thì vào danh sách "lâu ngày chưa chăm" */
  staleAfterDays: number;
  sla: SlaPolicy;
}

export const DEFAULT_ADMISSIONS_POLICY: AdmissionsPolicy = {
  distributionMode: "round_robin",
  dedupeDays: 30,
  maxTrialsPerLead: 2,
  staleAfterDays: 7,
  sla: DEFAULT_SLA,
};
