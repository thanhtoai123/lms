/**
 * Cấu hình vận hành (các tab trên /cau-hinh-van-hanh). Chỉ gồm tham số hệ thống thực sự dùng khi chạy.
 * Phạm vi "center": cơ sở ghi đè được, không ghi đè thì kế thừa mặc định toàn hệ thống.
 */
export interface OpsField {
  key: string;
  label: string;
  type: "int" | "bool";
  min?: number;
  max?: number;
  unit?: string;
  def: number | boolean;
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
  "cham-cong": [
    { key: "timesheetGraceMin", label: "Cho phép đến muộn / về sớm không tính", type: "int", min: 0, max: 30, unit: "phút", def: 5, scope: "center", usedBy: "Bảng công" },
  ],
  "thanh-toan": [
    { key: "orderRemindDays", label: "Nhắc đợt thanh toán trước hạn (mặc định cho đơn mới)", type: "int", min: 0, max: 30, unit: "ngày", def: 3, scope: "center", usedBy: "Đơn hàng, công nợ sắp đến hạn" },
  ],
  nhac: [
    { key: "homeworkReminderHours", label: "Nhắc phụ huynh khi bài tập còn", type: "int", min: 2, max: 72, unit: "giờ", def: 24, scope: "global", usedBy: "Nhắc hạn bài tập" },
  ],
} as const satisfies Record<string, readonly OpsField[]>;

export type OpsGroup = keyof typeof OPS_GROUPS;
type Fields = (typeof OPS_GROUPS)[OpsGroup][number];
export type OpsKey = Fields["key"];
export type OpsSettings = { [K in OpsKey]: Extract<Fields, { key: K }>["def"] extends boolean ? boolean : number };

export const OPS_DEFAULTS = Object.fromEntries(Object.values(OPS_GROUPS).flat().map((f) => [f.key, f.def])) as OpsSettings;
const FIELD = new Map<string, OpsField>(Object.values(OPS_GROUPS).flat().map((f) => [f.key, f as OpsField]));

/** Gộp: mặc định ← toàn hệ thống ← cơ sở (chỉ trường phạm vi cơ sở) */
export function resolveOps(global: Partial<Record<string, unknown>> | null, center: Partial<Record<string, unknown>> | null): OpsSettings {
  const out: Record<string, number | boolean> = { ...OPS_DEFAULTS };
  for (const [src, isCenter] of [[global, false], [center, true]] as const) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src)) {
      const f = FIELD.get(k);
      if (!f || (isCenter && f.scope !== "center")) continue;
      if (f.type === "int" && typeof v === "number" && Number.isInteger(v)) out[k] = v;
      if (f.type === "bool" && typeof v === "boolean") out[k] = v;
    }
  }
  return out as OpsSettings;
}

/** Kiểm tra một nhóm giá trị; null = xoá ghi đè (kế thừa) */
export function validateOps(group: OpsGroup, values: Record<string, number | boolean | null>, level: "global" | "center"): string[] {
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
    } else if (typeof v !== "boolean") e.push(`"${f.label}" phải là bật / tắt`);
  }
  if (group === "otp") {
    const w = values.otpPerPhoneWindowMin;
    const c = values.otpCooldownSec;
    if (typeof w === "number" && typeof c === "number" && c > w * 60) e.push("Thời gian chờ giữa hai lần gửi không được dài hơn khoảng đếm theo SĐT");
  }
  return e;
}

export function otpPolicyFrom(o: OpsSettings) {
  return { ttlMinutes: o.otpTtlMinutes, maxAttempts: o.otpMaxAttempts, perPhoneWindowMin: o.otpPerPhoneWindowMin, perPhoneMax: o.otpPerPhoneMax, perIpWindowMin: 60, perIpMax: o.otpPerIpMax, cooldownSec: o.otpCooldownSec };
}
export function riskFrom(o: OpsSettings) {
  return { consecutiveAbsences: o.riskConsecutiveAbsences, minRate: o.riskMinRatePct / 100, maxPendingMakeup: 2 };
}
