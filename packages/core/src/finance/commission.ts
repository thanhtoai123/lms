/**
 * Hoa hồng sale / người giới thiệu — quy tắc thuần.
 * Ghi nhận khi đơn đã thu đủ; hoàn tiền sau đó → giảm (chưa chi) hoặc thu hồi (đã chi).
 */
import { FinanceRuleError, formatVnd } from "./rules.js";

export const COMMISSION_KINDS = ["sale", "referrer"] as const;
export type CommissionKind = (typeof COMMISSION_KINDS)[number];
export const COMMISSION_KIND_VI: Record<CommissionKind, string> = { sale: "Sale chốt đơn", referrer: "Người giới thiệu" };

export const COMMISSION_STATUSES = ["accrued", "approved", "paid", "cancelled"] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];
export const COMMISSION_STATUS_VI: Record<CommissionStatus, string> = { accrued: "Tạm tính", approved: "Đã duyệt", paid: "Đã chi", cancelled: "Huỷ" };

export const RATE_TYPES = ["percent", "fixed"] as const;
export type RateType = (typeof RATE_TYPES)[number];

export interface CommissionRule {
  id: string;
  kind: CommissionKind;
  centerId: string | null;
  orderType: string | null;
  rateType: RateType;
  /** percent: điểm cơ bản (500 = 5%); fixed: VND */
  value: number;
  maxAmount: number | null;
  minOrderTotal: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
}

export function validateRule(r: Omit<CommissionRule, "id">): string[] {
  const e: string[] = [];
  if (!Number.isInteger(r.value) || r.value <= 0) e.push("Mức hoa hồng phải > 0");
  if (r.rateType === "percent" && r.value > 5000) e.push("Tỷ lệ tối đa 50%");
  if (r.maxAmount != null && r.maxAmount <= 0) e.push("Mức trần phải > 0");
  if (r.minOrderTotal < 0) e.push("Giá trị đơn tối thiểu không âm");
  if (r.effectiveTo && r.effectiveTo < r.effectiveFrom) e.push("Ngày kết thúc phải sau ngày bắt đầu");
  return e;
}

/** Chọn quy tắc áp dụng: riêng cơ sở > dùng chung; riêng loại đơn > mọi loại; hiệu lực mới nhất */
export function pickRule<R extends CommissionRule>(rules: readonly R[], q: { kind: CommissionKind; centerId: string; orderType: string; date: string; total: number }): R | null {
  const ok = rules.filter((r) =>
    r.isActive && r.kind === q.kind && (r.centerId === null || r.centerId === q.centerId) && (r.orderType === null || r.orderType === q.orderType)
    && r.effectiveFrom <= q.date && (!r.effectiveTo || r.effectiveTo >= q.date) && q.total >= r.minOrderTotal);
  ok.sort((a, b) => Number(b.centerId !== null) - Number(a.centerId !== null) || Number(b.orderType !== null) - Number(a.orderType !== null) || b.effectiveFrom.localeCompare(a.effectiveFrom));
  return ok[0] ?? null;
}

/** Tiền hoa hồng, làm tròn xuống nghìn đồng, có trần */
export function computeCommission(rule: Pick<CommissionRule, "rateType" | "value" | "maxAmount">, base: number): number {
  if (base <= 0) return 0;
  const raw = rule.rateType === "percent" ? (base * rule.value) / 10000 : rule.value;
  const capped = rule.maxAmount != null ? Math.min(raw, rule.maxAmount) : raw;
  return Math.floor(capped / 1000) * 1000;
}

export function describeRule(r: Pick<CommissionRule, "rateType" | "value" | "maxAmount">): string {
  const main = r.rateType === "percent" ? `${(r.value / 100).toLocaleString("vi-VN")}%` : formatVnd(r.value);
  return r.maxAmount != null ? `${main} (tối đa ${formatVnd(r.maxAmount)})` : main;
}

const T: Record<CommissionStatus, Partial<Record<"approve" | "pay" | "cancel", CommissionStatus>>> = {
  accrued: { approve: "approved", cancel: "cancelled" },
  approved: { pay: "paid", cancel: "cancelled" },
  paid: {},
  cancelled: {},
};

export function commissionTransition(from: CommissionStatus, action: "approve" | "pay" | "cancel"): CommissionStatus {
  const to = T[from][action];
  if (!to) throw new FinanceRuleError(`Không thể ${action === "approve" ? "duyệt" : action === "pay" ? "chi" : "huỷ"} hoa hồng đang "${COMMISSION_STATUS_VI[from]}"`);
  return to;
}

/**
 * Điều chỉnh khi hoàn tiền: phần hoa hồng theo tỷ lệ tiền hoàn / giá trị tính hoa hồng.
 * - chưa chi (accrued/approved): giảm thẳng số tiền (còn 0 → huỷ)
 * - đã chi: tạo dòng thu hồi âm
 * net = số hoa hồng còn hiệu lực (đã trừ các lần giảm / thu hồi trước).
 */
export function refundAdjustment(c: { status: CommissionStatus; originalAmount: number; net: number; baseAmount: number }, refundAmount: number): { mode: "reduce" | "clawback" | "none"; delta: number } {
  if (c.status === "cancelled" || c.net <= 0 || c.baseAmount <= 0 || refundAmount <= 0) return { mode: "none", delta: 0 };
  const share = Math.min(1, refundAmount / c.baseAmount);
  const delta = Math.min(c.net, Math.ceil((c.originalAmount * share) / 1000) * 1000);
  if (delta <= 0) return { mode: "none", delta: 0 };
  return { mode: c.status === "paid" ? "clawback" : "reduce", delta };
}

export const periodOf = (dateISO: string) => dateISO.slice(0, 7);

/* ================================================================== */
/* Máy chính sách hoa hồng 4 trục (bản gốc: SR.QD.208 · PL04)          */
/* ================================================================== */

/* --- Trục 1: chi khi nào ------------------------------------------ */

export const COMMISSION_EVENTS = [
  "hoc_vien_moi",
  "tai_tuc",
  "chuyen_trung_tam",
  "ban_thiet_bi",
  "moi_nhan_su",
  "thuong_danh_hieu_tvv",
  "thuong_danh_hieu_quan_ly",
] as const;
export type CommissionEvent = (typeof COMMISSION_EVENTS)[number];
export const COMMISSION_EVENT_VI: Record<CommissionEvent, string> = {
  hoc_vien_moi: "Học viên mới",
  tai_tuc: "Tái tục",
  chuyen_trung_tam: "Chuyển trung tâm",
  ban_thiet_bi: "Bán thiết bị",
  moi_nhan_su: "Mời nhân sự",
  thuong_danh_hieu_tvv: "Thưởng danh hiệu TVV",
  thuong_danh_hieu_quan_ly: "Thưởng danh hiệu quản lý",
};
export const COMMISSION_EVENT_HINT: Record<CommissionEvent, string> = {
  hoc_vien_moi: "Học viên lần đầu đóng đủ học phí",
  tai_tuc: "Học viên cũ đăng ký khoá tiếp theo",
  chuyen_trung_tam: "Chi MỘT LẦN cho nhân sự trung tâm cũ khi học viên chuyển sang trung tâm khác",
  ban_thiet_bi: "Đơn bán sản phẩm / học cụ",
  moi_nhan_su: "Giới thiệu ứng viên vào làm và qua thử việc",
  thuong_danh_hieu_tvv: "Thưởng danh hiệu cho tư vấn viên theo kỳ",
  thuong_danh_hieu_quan_ly: "Thưởng danh hiệu cho quản lý theo kỳ",
};
/** Sự kiện chỉ chi một lần cho mỗi học viên / đối tượng (không chi lại ở kỳ sau) */
export const ONE_TIME_EVENTS: readonly CommissionEvent[] = ["chuyen_trung_tam", "moi_nhan_su"];

/* --- Trục 2: loại đơn --------------------------------------------- */

export const COMMISSION_SCOPES = ["all", "course", "product"] as const;
export type CommissionScope = (typeof COMMISSION_SCOPES)[number];
export const COMMISSION_SCOPE_VI: Record<CommissionScope, string> = { all: "Tất cả", course: "Khoá học", product: "Sản phẩm" };

/** Chính sách phạm vi `scope` có áp cho đơn loại `orderType` không */
export function scopeMatches(scope: CommissionScope, orderType: string): boolean {
  return scope === "all" || scope === orderType;
}

/* --- Trục 3: cách tính -------------------------------------------- */

export const COMMISSION_CALC_METHODS = ["percent", "fixed", "tier"] as const;
export type CommissionCalcMethod = (typeof COMMISSION_CALC_METHODS)[number];
export const COMMISSION_CALC_METHOD_VI: Record<CommissionCalcMethod, string> = {
  percent: "% trên số tiền thực thu",
  fixed: "Số tiền cố định mỗi đơn vị",
  tier: "Thưởng theo bậc doanh thu",
};

/** Một bậc doanh thu: [from, to] — `to` bỏ trống = bậc cuối (không giới hạn trên) */
export interface CommissionTier {
  from: number;
  to: number | null;
  /** Thưởng số tiền cố định của bậc (VND) — dùng một trong hai */
  amount?: number | null;
  /** Thưởng theo % doanh thu, điểm cơ bản (500 = 5%) — dùng một trong hai */
  percent?: number | null;
}

/* --- Trục 4: ai nhận bao nhiêu ------------------------------------ */

export interface CommissionShare {
  /** Mã vai nhận (vai trò / vị trí công việc) */
  role: string;
  /** percent: điểm cơ bản (500 = 5%); fixed: VND mỗi đơn vị; tier: không dùng (đọc bảng bậc) */
  value: number;
  maxAmount?: number | null;
  tiers?: readonly CommissionTier[];
}

export interface CommissionPolicy {
  id?: string;
  name: string;
  event: CommissionEvent;
  orderScope: CommissionScope;
  centerId?: string | null;
  calcMethod: CommissionCalcMethod;
  shares: readonly CommissionShare[];
  /** Nguồn văn bản, vd "SR.QD.208 · PL04 Điều 1" */
  sourceRef?: string | null;
  note?: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive: boolean;
}

/* --- Trần tổng tỉ lệ ---------------------------------------------- */

/** Trần tổng % hoa hồng của mọi vai trong cùng một sự kiện + loại đơn (cấu hình được) */
export const DEFAULT_COMMISSION_TOTAL_CAP_PCT = 9;

const bpsToPct = (bps: number) => bps / 100;

/**
 * Phần % mà một vai chiếm vào trần tổng (điểm cơ bản).
 * Bậc doanh thu tính theo bậc % cao nhất — trần phải đúng cả ở bậc xấu nhất.
 */
export function sharePercentBps(calc: CommissionCalcMethod, s: CommissionShare): number {
  if (calc === "percent") return Math.max(0, s.value);
  if (calc === "tier") return Math.max(0, ...(s.tiers ?? []).map((t) => t.percent ?? 0));
  return 0;
}

/** Tổng % của mọi vai trong một chính sách (điểm cơ bản) */
export function policyPercentBps(p: Pick<CommissionPolicy, "calcMethod" | "shares">): number {
  return p.shares.reduce((s, x) => s + sharePercentBps(p.calcMethod, x), 0);
}

/** Bậc chồng lấn hay không liền mạch → chặn (một mức doanh thu chỉ được rơi vào một bậc) */
export function validateTiers(tiers: readonly CommissionTier[]): string[] {
  const e: string[] = [];
  if (!tiers.length) return ["Cách tính theo bậc cần ít nhất một bậc doanh thu"];
  const sorted = [...tiers].sort((a, b) => a.from - b.from);
  sorted.forEach((t, idx) => {
    const n = idx + 1;
    if (!Number.isInteger(t.from) || t.from < 0) e.push(`Bậc ${n}: mốc đầu phải là số nguyên ≥ 0`);
    if (t.to != null && (!Number.isInteger(t.to) || t.to <= t.from)) e.push(`Bậc ${n}: mốc cuối phải lớn hơn mốc đầu`);
    const hasAmount = t.amount != null && t.amount !== 0;
    const hasPercent = t.percent != null && t.percent !== 0;
    if (hasAmount && hasPercent) e.push(`Bậc ${n}: chỉ chọn một — thưởng số tiền hoặc thưởng theo %`);
    if (!hasAmount && !hasPercent) e.push(`Bậc ${n}: cần mức thưởng (số tiền hoặc %)`);
    if (hasAmount && (!Number.isInteger(t.amount!) || t.amount! < 0)) e.push(`Bậc ${n}: tiền thưởng phải là số nguyên ≥ 0`);
    if (hasPercent && (!Number.isInteger(t.percent!) || t.percent! <= 0)) e.push(`Bậc ${n}: tỉ lệ thưởng phải > 0`);
  });
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (prev.to == null) { e.push(`Bậc ${i}: đã là bậc cuối (không giới hạn trên) nên không được có bậc sau`); continue; }
    if (cur.from <= prev.to) e.push(`Bậc ${i} và bậc ${i + 1} chồng lấn nhau (${prev.from}–${prev.to} và ${cur.from}–${cur.to ?? "∞"}) — mỗi mức doanh thu chỉ được rơi vào một bậc`);
  }
  return [...new Set(e)];
}

/** Bậc áp cho một mức doanh thu (null = ngoài mọi bậc → không thưởng) */
export function tierFor(tiers: readonly CommissionTier[], revenue: number): CommissionTier | null {
  return [...tiers].sort((a, b) => a.from - b.from).find((t) => revenue >= t.from && (t.to == null || revenue <= t.to)) ?? null;
}

export interface PolicyValidationContext {
  /** Trần tổng % (mặc định 9) */
  capPercent?: number;
  /** Các chính sách khác đang hiệu lực — để cộng dồn trần theo sự kiện + loại đơn */
  others?: readonly CommissionPolicy[];
}

/**
 * Kiểm tra một chính sách hoa hồng. Trả lỗi tiếng Việt rõ ràng, không ném.
 * Trần tổng: Σ% của MỌI vai trong cùng sự kiện + loại đơn (kể cả các chính sách khác
 * đang hiệu lực cùng phạm vi cơ sở) không vượt trần cấu hình.
 */
export function validateCommissionPolicy(p: CommissionPolicy, ctx: PolicyValidationContext = {}): string[] {
  const e: string[] = [];
  const cap = ctx.capPercent ?? DEFAULT_COMMISSION_TOTAL_CAP_PCT;
  if (p.name.trim().length < 3) e.push("Tên chính sách tối thiểu 3 ký tự");
  if (!COMMISSION_EVENTS.includes(p.event)) e.push("Sự kiện chi hoa hồng không hợp lệ");
  if (!COMMISSION_SCOPES.includes(p.orderScope)) e.push("Loại đơn áp dụng không hợp lệ");
  if (!COMMISSION_CALC_METHODS.includes(p.calcMethod)) e.push("Cách tính không hợp lệ");
  if (p.effectiveTo && p.effectiveTo < p.effectiveFrom) e.push("Ngày kết thúc phải sau ngày bắt đầu");
  if (!p.shares.length) e.push("Chính sách cần ít nhất một vai nhận hoa hồng");

  const seen = new Set<string>();
  for (const s of p.shares) {
    const role = s.role.trim();
    if (!role) { e.push("Vai nhận hoa hồng chưa chọn"); continue; }
    if (seen.has(role)) e.push(`Vai "${role}" khai hai lần trong cùng một chính sách — gộp lại thành một mức`);
    seen.add(role);
    if (p.calcMethod === "tier") {
      for (const t of validateTiers(s.tiers ?? [])) e.push(`Vai "${role}": ${t}`);
    } else if (!Number.isInteger(s.value) || s.value <= 0) {
      e.push(`Vai "${role}": mức hoa hồng phải là số nguyên > 0`);
    } else if (p.isActive && p.calcMethod === "percent" && s.value > cap * 100) {
      e.push(`Vai "${role}": tỉ lệ ${bpsToPct(s.value)}% đã vượt trần tổng ${cap}%`);
    }
    if (s.maxAmount != null && (!Number.isInteger(s.maxAmount) || s.maxAmount <= 0)) e.push(`Vai "${role}": mức trần phải là số nguyên > 0`);
  }

  // Trần tổng theo (sự kiện + loại đơn), cộng cả các chính sách khác cùng phạm vi cơ sở
  const sameBucket = (o: CommissionPolicy) =>
    o.isActive && o.id !== p.id && o.event === p.event && o.orderScope === p.orderScope
    && (o.centerId ?? null) === (p.centerId ?? null)
    && (!p.effectiveTo || o.effectiveFrom <= p.effectiveTo) && (!o.effectiveTo || o.effectiveTo >= p.effectiveFrom);
  const othersBps = (ctx.others ?? []).filter(sameBucket).reduce((s, o) => s + policyPercentBps(o), 0);
  const ownBps = policyPercentBps(p);
  const totalBps = ownBps + othersBps;
  if (p.isActive && totalBps > cap * 100) {
    const detail = othersBps > 0 ? ` (chính sách này ${bpsToPct(ownBps)}% + đang có ${bpsToPct(othersBps)}%)` : "";
    e.push(`Tổng tỉ lệ hoa hồng của "${COMMISSION_EVENT_VI[p.event]}" · ${COMMISSION_SCOPE_VI[p.orderScope]} là ${bpsToPct(totalBps)}%, vượt trần ${cap}%${detail} — giảm mức của một vai hoặc tắt chính sách cũ`);
  }
  return [...new Set(e)];
}

export interface PolicyBase {
  /** Số tiền thực thu dùng làm gốc tính % */
  base: number;
  /** Số đơn vị cho cách tính "số tiền cố định mỗi đơn vị" (mặc định 1) */
  units?: number;
  /** Doanh thu luỹ kế của kỳ để tra bậc (mặc định = base) */
  revenue?: number;
}

/** Tiền hoa hồng của một vai theo chính sách, làm tròn xuống nghìn đồng, có trần của vai */
export function computePolicyShare(p: Pick<CommissionPolicy, "calcMethod">, s: CommissionShare, i: PolicyBase): number {
  const base = Math.max(0, i.base);
  let raw = 0;
  if (p.calcMethod === "percent") {
    if (base <= 0) return 0;
    raw = (base * s.value) / 10000;
  } else if (p.calcMethod === "fixed") {
    raw = s.value * Math.max(0, Math.round(i.units ?? 1));
  } else {
    const t = tierFor(s.tiers ?? [], i.revenue ?? base);
    if (!t) return 0;
    raw = t.percent ? (base * t.percent) / 10000 : (t.amount ?? 0);
  }
  const capped = s.maxAmount != null ? Math.min(raw, s.maxAmount) : raw;
  return Math.max(0, Math.floor(capped / 1000) * 1000);
}

/** Tiền hoa hồng của mọi vai trong một chính sách */
export function computePolicy(p: Pick<CommissionPolicy, "calcMethod" | "shares">, i: PolicyBase): { role: string; amount: number }[] {
  return p.shares.map((s) => ({ role: s.role, amount: computePolicyShare(p, s, i) }));
}

/** Mô tả mức của một vai để hiển thị / lưu vào `rate_label` */
export function describeShare(calc: CommissionCalcMethod, s: CommissionShare): string {
  if (calc === "percent") return `${bpsToPct(s.value).toLocaleString("vi-VN")}%`;
  if (calc === "fixed") return `${formatVnd(s.value)}/đơn vị`;
  const n = (s.tiers ?? []).length;
  return `Theo bậc doanh thu (${n} bậc)`;
}

/** Chọn chính sách áp dụng: riêng cơ sở > dùng chung; hiệu lực mới nhất */
export function pickPolicy<P extends CommissionPolicy>(policies: readonly P[], q: { event: CommissionEvent; centerId: string; orderType: string; date: string }): P | null {
  const ok = policies.filter((p) =>
    p.isActive && p.event === q.event && ((p.centerId ?? null) === null || p.centerId === q.centerId)
    && scopeMatches(p.orderScope, q.orderType) && p.effectiveFrom <= q.date && (!p.effectiveTo || p.effectiveTo >= q.date));
  ok.sort((a, b) =>
    Number((b.centerId ?? null) !== null) - Number((a.centerId ?? null) !== null)
    || Number(b.orderScope !== "all") - Number(a.orderScope !== "all")
    || b.effectiveFrom.localeCompare(a.effectiveFrom));
  return ok[0] ?? null;
}
