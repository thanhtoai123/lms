/**
 * SataCoin: sổ điểm thưởng bất biến (chỉ thêm), giới hạn theo vai trò, đổi quà — quy tắc thuần.
 */
export class RewardRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RewardRuleError";
  }
}
const fail = (m: string): never => { throw new RewardRuleError(m); };

export const COIN_REASONS = ["attendance", "homework", "project", "competition", "behavior", "birthday", "referral", "redeem", "redeem_refund", "adjust", "revoke"] as const;
export type CoinReason = (typeof COIN_REASONS)[number];
export const COIN_REASON_VI: Record<CoinReason, string> = {
  attendance: "Chuyên cần", homework: "Bài tập", project: "Sản phẩm / dự án", competition: "Thi đấu", behavior: "Thái độ tốt",
  birthday: "Sinh nhật", referral: "Giới thiệu bạn", redeem: "Đổi quà", redeem_refund: "Hoàn xu đổi quà", adjust: "Điều chỉnh", revoke: "Thu hồi",
};
/** Lý do người dùng được chọn khi thưởng */
export const AWARD_REASONS: readonly CoinReason[] = ["attendance", "homework", "project", "competition", "behavior", "birthday", "referral"];

export type CoinLevel = "teacher" | "center" | "head";
/** Mức tối đa mỗi lần thưởng / tổng mỗi HV mỗi ngày theo cấp */
export const COIN_LIMITS: Record<CoinLevel, { perAward: number; perStudentDay: number }> = {
  teacher: { perAward: 20, perStudentDay: 50 },
  center: { perAward: 200, perStudentDay: 500 },
  head: { perAward: 1000, perStudentDay: 5000 },
};

export function validateAward(x: { amount: number; reason: CoinReason; note?: string | null; level: CoinLevel; givenToday: number }): string[] {
  const e: string[] = [];
  const lim = COIN_LIMITS[x.level];
  if (!AWARD_REASONS.includes(x.reason)) e.push("Lý do thưởng không hợp lệ");
  if (!Number.isInteger(x.amount) || x.amount < 1) e.push("Số xu phải là số nguyên ≥ 1");
  else if (x.amount > lim.perAward) e.push(`Mỗi lần thưởng tối đa ${lim.perAward} xu`);
  else if (x.givenToday + x.amount > lim.perStudentDay) e.push(`Vượt hạn mức ${lim.perStudentDay} xu/học viên/ngày (đã thưởng ${x.givenToday})`);
  if ((x.reason === "competition" || x.reason === "project") && (x.note ?? "").trim().length < 3) e.push("Thi đấu / dự án cần ghi chú");
  return e;
}

/** Điều chỉnh tay (+/-): chỉ cấp cơ sở trở lên, bắt buộc lý do, không làm số dư âm */
export function validateAdjust(x: { amount: number; note: string; balance: number; level: CoinLevel }): string[] {
  const e: string[] = [];
  if (x.level === "teacher") e.push("Giáo viên không được điều chỉnh xu");
  if (!Number.isInteger(x.amount) || x.amount === 0) e.push("Số xu điều chỉnh phải là số nguyên khác 0");
  if (Math.abs(x.amount) > COIN_LIMITS[x.level].perAward) e.push(`Mỗi lần điều chỉnh tối đa ${COIN_LIMITS[x.level].perAward} xu`);
  if (x.note.trim().length < 10) e.push("Điều chỉnh cần lý do ≥ 10 ký tự");
  if (x.balance + x.amount < 0) e.push(`Số dư không đủ (hiện ${x.balance})`);
  return e;
}

/** Thu hồi một lần thưởng: chỉ giao dịch thưởng dương, chưa bị thu hồi, trong 30 ngày, đủ số dư */
export function revokeBlock(x: { reason: CoinReason; amount: number; revoked: boolean; ageDays: number; balance: number }): string | null {
  if (!AWARD_REASONS.includes(x.reason) && x.reason !== "adjust") return "Chỉ thu hồi được giao dịch thưởng / điều chỉnh";
  if (x.amount <= 0) return "Chỉ thu hồi giao dịch cộng xu";
  if (x.revoked) return "Giao dịch đã bị thu hồi";
  if (x.ageDays > 30) return "Quá 30 ngày — dùng điều chỉnh có lý do";
  if (x.balance < x.amount) return `Số dư hiện tại (${x.balance}) nhỏ hơn số xu cần thu hồi`;
  return null;
}

export function balanceAfter(balance: number, delta: number): number {
  const b = balance + delta;
  if (b < 0) fail(`Số dư không đủ (hiện ${balance}, cần ${-delta})`);
  return b;
}

/* ------------------------------------------------------------------ */
/* Đổi quà                                                             */
/* ------------------------------------------------------------------ */

export const REDEMPTION_STATUSES = ["requested", "approved", "delivered", "rejected", "cancelled"] as const;
export type RedemptionStatus = (typeof REDEMPTION_STATUSES)[number];
export const REDEMPTION_STATUS_VI: Record<RedemptionStatus, string> = { requested: "Chờ duyệt", approved: "Đã duyệt – chờ trao", delivered: "Đã trao quà", rejected: "Từ chối", cancelled: "Đã huỷ" };
export type RedemptionAction = "approve" | "reject" | "deliver" | "cancel";

export function redemptionTransition(from: RedemptionStatus, action: RedemptionAction): RedemptionStatus {
  const map: Record<RedemptionStatus, Partial<Record<RedemptionAction, RedemptionStatus>>> = {
    requested: { approve: "approved", reject: "rejected", cancel: "cancelled" },
    approved: { deliver: "delivered", cancel: "cancelled" },
    delivered: {},
    rejected: {},
    cancelled: {},
  };
  return map[from][action] ?? fail(`Yêu cầu "${REDEMPTION_STATUS_VI[from]}" không thể ${action}`);
}

/** Số dư khả dụng = số dư − xu đang giữ cho yêu cầu chờ duyệt */
export function availableBalance(balance: number, held: number): number {
  return Math.max(0, balance - held);
}

export function validateReward(x: { name: string; cost: number; stockLimited: boolean }): string[] {
  const e: string[] = [];
  if (x.name.trim().length < 2) e.push("Tên quà tối thiểu 2 ký tự");
  if (!Number.isInteger(x.cost) || x.cost < 1 || x.cost > 100_000) e.push("Giá quà 1–100.000 xu");
  return e;
}

/* ------------------------------------------------------------------ */
/* Luật thưởng xu (coin_rules) — cấu hình ở /satacoin                   */
/* ------------------------------------------------------------------ */

/** Sự kiện đã có chỗ cộng xu trong hệ thống — luật chỉ bật/tắt và đặt số xu mặc định */
export const COIN_RULE_CODES = ["ATTENDANCE_SESSION", "HOMEWORK_DONE", "BIRTHDAY"] as const;
export type CoinRuleCode = (typeof COIN_RULE_CODES)[number];

export interface CoinRuleDef {
  label: string;
  /** Lý do ghi vào sổ xu khi luật áp dụng */
  reason: CoinReason;
  /** Điều kiện áp dụng (mô tả mặc định, sửa được ở trang cấu hình) */
  condition: string;
  coins: number;
}

export const COIN_RULE_DEFS: Record<CoinRuleCode, CoinRuleDef> = {
  ATTENDANCE_SESSION: { label: "Chuyên cần mỗi buổi", reason: "attendance", condition: "Học viên có mặt / đi muộn / học bù ở buổi đã điểm danh; mỗi buổi thưởng một lần", coins: 5 },
  HOMEWORK_DONE: { label: "Hoàn thành bài tập", reason: "homework", condition: "Bài tập được chấm đạt từ 80% điểm tối đa trở lên", coins: 10 },
  BIRTHDAY: { label: "Sinh nhật học viên", reason: "birthday", condition: "Khi gửi lời chúc sinh nhật (mỗi năm một lần)", coins: 20 },
};

export interface CoinRuleInput {
  code: string;
  description: string;
  coins: number;
  condition?: string | null;
  isActive?: boolean;
}

export function validateCoinRule(r: CoinRuleInput): string[] {
  const e: string[] = [];
  if (!(COIN_RULE_CODES as readonly string[]).includes(r.code)) e.push(`Mã luật không hợp lệ (chỉ nhận: ${COIN_RULE_CODES.join(", ")})`);
  if (r.description.trim().length < 3) e.push("Mô tả luật tối thiểu 3 ký tự");
  if (!Number.isInteger(r.coins) || r.coins < 1) e.push("Số xu phải là số nguyên ≥ 1");
  else if (r.coins > COIN_LIMITS.center.perAward) e.push(`Số xu mỗi lần tối đa ${COIN_LIMITS.center.perAward}`);
  if ((r.condition ?? "").length > 500) e.push("Điều kiện tối đa 500 ký tự");
  return e;
}

/**
 * Số xu áp dụng cho một sự kiện. Luật tắt → `null` (không cộng xu);
 * chưa khai luật → dùng `fallback` (giữ nguyên hành vi cũ khi chưa cấu hình).
 */
export function coinsFor(rules: readonly { code: string; coins: number; isActive: boolean }[], code: CoinRuleCode, fallback: number | null = null): number | null {
  const r = rules.find((x) => x.code === code);
  if (!r) return fallback;
  return r.isActive ? r.coins : null;
}

/** Hạng theo tổng xu tích luỹ (chỉ tính cộng) */
export const COIN_TIERS = [
  { key: "bronze", label: "Đồng", min: 0 },
  { key: "silver", label: "Bạc", min: 200 },
  { key: "gold", label: "Vàng", min: 500 },
  { key: "diamond", label: "Kim cương", min: 1000 },
] as const;
export function coinTier(earned: number) {
  let t: (typeof COIN_TIERS)[number] = COIN_TIERS[0];
  for (const x of COIN_TIERS) if (earned >= x.min) t = x;
  const next = COIN_TIERS.find((x) => x.min > earned) ?? null;
  return { ...t, next: next ? { label: next.label, need: next.min - earned } : null };
}
