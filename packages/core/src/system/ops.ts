/**
 * Cấu hình vận hành (các tab trên /cau-hinh-van-hanh). Chỉ gồm tham số hệ thống thực sự dùng khi chạy.
 * Phạm vi "center": cơ sở ghi đè được, không ghi đè thì kế thừa mặc định toàn hệ thống.
 */
import { DEFAULT_QR_TTL_HOURS, DEFAULT_ORDER_CODE_FORMAT, ORDER_CODE_FORMATS, ORDER_CODE_FORMAT_VI, type OrderCodeFormat } from "../finance/rules.js";
import { DEFAULT_COMMISSION_TOTAL_CAP_PCT } from "../finance/commission.js";

const QR_TTL_DEF = DEFAULT_QR_TTL_HOURS;
const ORDER_CODE_DEF: string = DEFAULT_ORDER_CODE_FORMAT;
const COMMISSION_CAP_DEF = DEFAULT_COMMISSION_TOTAL_CAP_PCT;
const ORDER_CODE_CHOICES = ORDER_CODE_FORMATS.map((v) => ({ value: v as string, label: ORDER_CODE_FORMAT_VI[v] }));

export interface OpsChoice { value: string; label: string }

export interface OpsField {
  key: string;
  label: string;
  type: "int" | "bool" | "enum";
  min?: number;
  max?: number;
  unit?: string;
  /** Chỉ cho type "enum": danh sách lựa chọn */
  choices?: readonly OpsChoice[];
  def: number | boolean | string;
  scope: "global" | "center";
  usedBy: string;
}

export const OPS_GROUPS = {
  otp: [
    { key: "otpTtlMinutes", label: "Hiệu lực mã OTP", type: "int", min: 2, max: 15, unit: "phút", def: 5, scope: "global", usedBy: "Đăng nhập cổng phụ huynh, kích hoạt tài khoản" },
    { key: "otpMaxAttempts", label: "Số lần nhập sai tối đa", type: "int", min: 3, max: 10, unit: "lần", def: 5, scope: "global", usedBy: "Khoá mã khi nhập sai quá số lần" },
    { key: "otpCooldownSec", label: "Chờ giữa hai lần gửi mã", type: "int", min: 30, max: 600, unit: "giây", def: 60, scope: "global", usedBy: "Gửi lại mã" },
    { key: "otpPerPhoneMax", label: "Số mã tối đa mỗi SĐT", type: "int", min: 1, max: 10, unit: "mã", def: 3, scope: "global", usedBy: "Chống spam theo SĐT" },
    { key: "otpPerPhoneWindowMin", label: "…trong khoảng", type: "int", min: 5, max: 1440, unit: "phút", def: 15, scope: "global", usedBy: "Chống spam theo SĐT" },
    { key: "otpPerIpMax", label: "Số mã tối đa mỗi thiết bị / IP mỗi giờ", type: "int", min: 3, max: 100, unit: "mã", def: 10, scope: "global", usedBy: "Chống spam theo IP" },
    { key: "staffIdleMinutes", label: "Nhân sự tự đăng xuất khi không thao tác", type: "int", min: 5, max: 480, unit: "phút", def: 60, scope: "global", usedBy: "Đăng nhập nhân sự (áp dụng từ lần đăng nhập kế tiếp)" },
    { key: "staffLoginMaxFails", label: "Tạm khoá đăng nhập nhân sự sau số lần sai mật khẩu", type: "int", min: 3, max: 20, unit: "lần", def: 5, scope: "global", usedBy: "Chống dò mật khẩu" },
    { key: "staffLoginLockMinutes", label: "Thời gian tạm khoá đăng nhập", type: "int", min: 5, max: 120, unit: "phút", def: 15, scope: "global", usedBy: "Chống dò mật khẩu" },
    { key: "znsUnitCostVnd", label: "Đơn giá một tin ZNS (để ước chi phí)", type: "int", min: 0, max: 10_000, unit: "đ/tin", def: 0, scope: "global", usedBy: "Nhật ký OTP — thẻ \"Chi phí ZNS hôm nay (ước)\"" },
  ],
  "hoc-vien": [
    { key: "nearingEndSessions", label: "Báo \"sắp hết khoá\" khi còn", type: "int", min: 1, max: 12, unit: "buổi", def: 4, scope: "center", usedBy: "Học viên → Sắp hết khoá, thông báo tái tục" },
    { key: "maxPauseMonths", label: "Bảo lưu tối đa", type: "int", min: 1, max: 12, unit: "tháng", def: 3, scope: "center", usedBy: "Bảo lưu ghi danh" },
    { key: "makeupWindowDays", label: "Hạn đăng ký học bù sau buổi vắng", type: "int", min: 7, max: 120, unit: "ngày", def: 30, scope: "center", usedBy: "Học bù" },
    { key: "riskConsecutiveAbsences", label: "Cảnh báo khi vắng liên tiếp", type: "int", min: 1, max: 6, unit: "buổi", def: 2, scope: "center", usedBy: "Cảnh báo rủi ro, buổi học, lịch" },
    { key: "riskMinRatePct", label: "Cảnh báo khi tỉ lệ chuyên cần dưới", type: "int", min: 50, max: 100, unit: "%", def: 80, scope: "center", usedBy: "Cảnh báo rủi ro" },
  ],
  lop: [
    { key: "scanLateGraceMin", label: "Quét thẻ sau giờ bắt đầu quá … thì ghi Đi muộn", type: "int", min: 0, max: 60, unit: "phút", def: 15, scope: "center", usedBy: "Điểm danh thẻ QR" },
    { key: "sessionRequireStudentRemarks", label: "Hoàn tất buổi phải có nhận xét từng học viên có mặt", type: "bool", def: true, scope: "center", usedBy: "Hoàn tất buổi học (app giáo viên)" },
    { key: "sessionRequireMedia", label: "Hoàn tất buổi phải có ảnh / video trong kho", type: "bool", def: false, scope: "center", usedBy: "Hoàn tất buổi học (app giáo viên)" },
  ],
  /**
   * Chuẩn thông tin hồ sơ học tập (docs/HO-SO-HOC-TAP.md). `sessionRequireEvaluations` giữ nguyên khoá cũ
   * (trước ở nhóm "Lớp & GV") để giá trị đã lưu vẫn còn hiệu lực — nay là "chặn hoàn tất khi thiếu phiếu".
   */
  "ho-so-hoc-tap": [
    { key: "sessionRequireEvaluations", label: "Chặn hoàn tất buổi khi còn học viên có mặt thiếu phiếu nhận xét đủ điều kiện", type: "bool", def: true, scope: "center", usedBy: "Hoàn tất buổi học — phát hành phiếu nhận xét buổi (hồ sơ học tập)" },
    { key: "requireObjectiveResult", label: "Phiếu phải có kết quả mục tiêu bài", type: "bool", def: true, scope: "center", usedBy: "Phát hành phiếu, chặn hoàn tất buổi, tỷ lệ phiếu đủ chuẩn" },
    { key: "requireProductNote", label: "Phiếu phải ghi \"Sản phẩm\" của buổi", type: "bool", def: false, scope: "center", usedBy: "Phát hành phiếu, chặn hoàn tất buổi, tỷ lệ phiếu đủ chuẩn" },
    { key: "remarkMinLength", label: "Nhận xét cho phụ huynh tối thiểu", type: "int", min: 0, max: 500, unit: "ký tự", def: 30, scope: "center", usedBy: "Tỷ lệ phiếu đủ chuẩn, danh mục \"Buổi này cần hoàn thiện\" (không chặn hoàn tất)" },
    { key: "minEvidenceRatePct", label: "Tỷ lệ học viên có ảnh / sản phẩm mỗi buổi tối thiểu (0 = không bắt)", type: "int", min: 0, max: 100, unit: "%", def: 0, scope: "center", usedBy: "Quản lý hồ sơ học tập — vi phạm bằng chứng của buổi" },
    { key: "sheetDeadlineHours", label: "Hạn hoàn thiện phiếu sau giờ kết thúc buổi", type: "int", min: 1, max: 168, unit: "giờ", def: 24, scope: "center", usedBy: "Tỷ lệ phiếu đúng hạn, Việc hôm nay, thẻ \"Phiếu cần hoàn thiện\" của GV" },
    { key: "milestoneDeadlineDays", label: "Hạn viết học bạ mốc sau buổi mốc", type: "int", min: 1, max: 60, unit: "ngày", def: 7, scope: "center", usedBy: "Học bạ mốc quá hạn (Việc hôm nay, Quản lý hồ sơ học tập)" },
    { key: "profileMinSheetPct", label: "Hồ sơ học viên đạt chuẩn khi phiếu đủ chuẩn từ", type: "int", min: 50, max: 100, unit: "%", def: 90, scope: "center", usedBy: "Quản lý hồ sơ học tập — thẻ \"Hồ sơ đạt chuẩn\", dải mức đạt chuẩn trên hồ sơ" },
  ],
  "cham-cong": [
    { key: "timesheetGraceMin", label: "Cho phép đến muộn / về sớm không tính", type: "int", min: 0, max: 30, unit: "phút", def: 5, scope: "center", usedBy: "Bảng công" },
  ],
  "thanh-toan": [
    { key: "orderRemindDays", label: "Nhắc đợt thanh toán trước hạn (mặc định cho đơn mới)", type: "int", min: 0, max: 30, unit: "ngày", def: 3, scope: "center", usedBy: "Đơn hàng, công nợ sắp đến hạn" },
    { key: "maxLineDiscountPercent", label: "Trần giảm giá theo dòng đơn", type: "int", min: 1, max: 100, unit: "%", def: 50, scope: "center", usedBy: "Tạo đơn, sửa dòng đơn (mỗi khoản giảm cần lý do)" },
    { key: "debtAgingWarnDays", label: "Tuổi nợ — mốc nhóm 1", type: "int", min: 1, max: 60, unit: "ngày", def: 7, scope: "center", usedBy: "Công nợ theo ghi danh (Quá hạn 1–N ngày)" },
    { key: "debtAgingBadDays", label: "Tuổi nợ — mốc nhóm 2", type: "int", min: 2, max: 180, unit: "ngày", def: 30, scope: "center", usedBy: "Công nợ theo ghi danh (Quá hạn N+1–M, rồi > M)" },
    { key: "qrTtlHours", label: "Hạn dùng mã QR chuyển khoản", type: "int", min: 1, max: 720, unit: "giờ", def: QR_TTL_DEF, scope: "center", usedBy: "Xuất QR trên trang đơn — hết hạn thì phải xuất mã mới" },
    { key: "orderCodeFormat", label: "Dạng mã đơn hàng", type: "enum", choices: ORDER_CODE_CHOICES, def: ORDER_CODE_DEF, scope: "global", usedBy: "Sinh mã đơn mới (đơn cũ giữ nguyên mã)" },
  ],
  "hoa-hong": [
    { key: "commissionTotalCapPercent", label: "Trần tổng tỉ lệ hoa hồng mỗi sự kiện + loại đơn", type: "int", min: 1, max: 100, unit: "%", def: COMMISSION_CAP_DEF, scope: "global", usedBy: "Chính sách hoa hồng — tổng % của mọi vai không vượt trần" },
  ],
  nhac: [
    { key: "homeworkReminderHours", label: "Nhắc phụ huynh khi bài tập còn", type: "int", min: 2, max: 72, unit: "giờ", def: 24, scope: "global", usedBy: "Nhắc hạn bài tập" },
  ],
} as const satisfies Record<string, readonly OpsField[]>;

export type OpsGroup = keyof typeof OPS_GROUPS;
type Fields = (typeof OPS_GROUPS)[OpsGroup][number];
export type OpsKey = Fields["key"];
type DefOf<K extends OpsKey> = Extract<Fields, { key: K }>["def"];
export type OpsSettings = {
  [K in OpsKey]: DefOf<K> extends boolean ? boolean : DefOf<K> extends string ? (K extends "orderCodeFormat" ? OrderCodeFormat : string) : number
};

export const OPS_DEFAULTS = Object.fromEntries(Object.values(OPS_GROUPS).flat().map((f) => [f.key, f.def])) as OpsSettings;
const FIELD = new Map<string, OpsField>(Object.values(OPS_GROUPS).flat().map((f) => [f.key, f as OpsField]));

/** Gộp: mặc định ← toàn hệ thống ← cơ sở (chỉ trường phạm vi cơ sở) */
export function resolveOps(global: Partial<Record<string, unknown>> | null, center: Partial<Record<string, unknown>> | null): OpsSettings {
  const out: Record<string, number | boolean | string> = { ...OPS_DEFAULTS };
  for (const [src, isCenter] of [[global, false], [center, true]] as const) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src)) {
      const f = FIELD.get(k);
      if (!f || (isCenter && f.scope !== "center")) continue;
      if (f.type === "int" && typeof v === "number" && Number.isInteger(v)) out[k] = v;
      if (f.type === "bool" && typeof v === "boolean") out[k] = v;
      if (f.type === "enum" && typeof v === "string" && (f.choices ?? []).some((c) => c.value === v)) out[k] = v;
    }
  }
  return out as OpsSettings;
}

/** Kiểm tra một nhóm giá trị; null = xoá ghi đè (kế thừa) */
export function validateOps(group: OpsGroup, values: Record<string, number | boolean | string | null>, level: "global" | "center"): string[] {
  const e: string[] = [];
  const fields = OPS_GROUPS[group] as readonly OpsField[];
  for (const [k, v] of Object.entries(values)) {
    const f = fields.find((x) => x.key === k);
    if (!f) { e.push(`Tham số không thuộc nhóm: ${k}`); continue; }
    if (level === "center" && f.scope !== "center") { e.push(`"${f.label}" chỉ đặt ở mức toàn hệ thống`); continue; }
    if (v === null) { if (level === "global") e.push(`"${f.label}" cần giá trị`); continue; }
    if (f.type === "int") {
      if (typeof v !== "number" || !Number.isInteger(v)) e.push(`"${f.label}" phải là số nguyên`);
      else if ((f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max)) e.push(`"${f.label}" trong khoảng ${f.min}–${f.max}${f.unit ? ` ${f.unit}` : ""}`);
    } else if (f.type === "enum") {
      if (typeof v !== "string" || !(f.choices ?? []).some((c) => c.value === v)) e.push(`"${f.label}" chỉ nhận: ${(f.choices ?? []).map((c) => c.label).join(" · ")}`);
    } else if (typeof v !== "boolean") e.push(`"${f.label}" phải là bật / tắt`);
  }
  if (group === "otp") {
    const w = values.otpPerPhoneWindowMin;
    const c = values.otpCooldownSec;
    if (typeof w === "number" && typeof c === "number" && c > w * 60) e.push("Thời gian chờ giữa hai lần gửi không được dài hơn khoảng đếm theo SĐT");
  }
  if (group === "thanh-toan") {
    const a = values.debtAgingWarnDays;
    const b = values.debtAgingBadDays;
    if (typeof a === "number" && typeof b === "number" && b <= a) e.push("Mốc tuổi nợ thứ hai phải lớn hơn mốc thứ nhất");
  }
  return e;
}

export function otpPolicyFrom(o: OpsSettings) {
  return { ttlMinutes: o.otpTtlMinutes, maxAttempts: o.otpMaxAttempts, perPhoneWindowMin: o.otpPerPhoneWindowMin, perPhoneMax: o.otpPerPhoneMax, perIpWindowMin: 60, perIpMax: o.otpPerIpMax, cooldownSec: o.otpCooldownSec };
}
export function riskFrom(o: OpsSettings) {
  return { consecutiveAbsences: o.riskConsecutiveAbsences, minRate: o.riskMinRatePct / 100, maxPendingMakeup: 2 };
}

/* ------------------------------------------------------------------ */
/* OTP / ZNS: ngưỡng tự ngắt & ước chi phí (thẻ số ở /otp-logs)        */
/* ------------------------------------------------------------------ */

/**
 * Ngưỡng tự ngắt trong NGÀY — suy từ chính sách hiện có, không thêm tham số mới:
 * trần theo IP mỗi cửa sổ (`perIpMax` / `perIpWindowMin`) chiếu ra cả ngày.
 */
export function otpDailyCutoff(p: { perIpMax: number; perIpWindowMin: number }): number {
  const windows = Math.max(1, Math.round(1440 / Math.max(1, p.perIpWindowMin)));
  return p.perIpMax * windows;
}

/** Chi phí ZNS ước tính (đơn giá 0 = chưa khai báo → 0đ) */
export function znsCostEstimate(sentCount: number, unitCostVnd: number): number {
  return Math.max(0, Math.round(sentCount)) * Math.max(0, Math.round(unitCostVnd));
}

/** Đã chạm ngưỡng tự ngắt chưa */
export function otpCutoffState(sentToday: number, cutoff: number): { hit: boolean; pct: number } {
  const pct = cutoff > 0 ? Math.min(999, Math.round((sentToday / cutoff) * 100)) : 0;
  return { hit: cutoff > 0 && sentToday >= cutoff, pct };
}
