/**
 * Lõi cách ly nhiều trung tâm (multi-tenant) cho mô hình nhượng quyền.
 *
 * Một **tenant** là một bên vận hành độc lập:
 *  - `OWNED`     — do chuỗi tự vận hành (Hội sở nhìn xuyên suốt);
 *  - `FRANCHISE` — bên nhận nhượng quyền, dữ liệu RIÊNG TƯ: Hội sở KHÔNG tự động
 *    thấy dữ liệu cá nhân và chi tiết tài chính, trừ khi tenant bật công tắc cho phép.
 *
 * Quy tắc (nguồn sự thật cho cả API lẫn giao diện):
 *  1. Actor **Hội sở** (có vai trò không gắn cơ sở) thuộc tenant OWNED → thấy MỌI tenant OWNED.
 *  2. Actor thuộc tenant FRANCHISE → CHỈ thấy tenant của mình, kể cả khi là SUPER_ADMIN của tenant đó.
 *  3. SUPER_ADMIN của chuỗi (thuộc tenant OWNED) → thấy danh sách tenant và số liệu TỔNG HỢP
 *     của tenant nhượng quyền, nhưng PII bị che trừ khi `tenantSettings.hoSeesPii = true`.
 *  4. Actor gắn cơ sở (không phải Hội sở) → chỉ tenant của mình.
 *
 * Toàn bộ file là hàm thuần — không chạm CSDL, không phụ thuộc Drizzle.
 */

import type { Actor } from "../policy/policy.js";
import { maskOutsideTenant } from "../system/pii.js";

export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantIsolationError";
  }
}

/* ------------------------------------------------------------------ */
/* Danh mục                                                            */
/* ------------------------------------------------------------------ */

export const TENANT_TYPES = ["OWNED", "FRANCHISE"] as const;
export type TenantType = (typeof TENANT_TYPES)[number];
export const TENANT_TYPE_VI: Record<TenantType, string> = {
  OWNED: "Chuỗi tự vận hành",
  FRANCHISE: "Nhượng quyền",
};

export const TENANT_STATUSES = ["onboarding", "active", "suspended", "closed"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];
export const TENANT_STATUS_VI: Record<TenantStatus, string> = {
  onboarding: "Đang thiết lập",
  active: "Đang hoạt động",
  suspended: "Tạm ngừng",
  closed: "Đã đóng",
};

export interface TenantRef {
  id: string;
  code?: string;
  name?: string;
  type: TenantType;
  status?: TenantStatus;
}

/** Bản ghi / actor có gắn tenant. Chuỗi = chính tenantId. */
export type TenantHolder = string | null | undefined | { tenantId?: string | null };

/** Actor đã biết mình thuộc tenant nào (ngữ cảnh đăng nhập gắn thêm `tenantId`) */
export type TenantActor = Pick<Actor, "assignments"> & { tenantId?: string | null; userId?: string };

/* ------------------------------------------------------------------ */
/* Tuỳ chọn quyền riêng tư của tenant                                  */
/* ------------------------------------------------------------------ */

export interface TenantSettings {
  /** Hội sở chuỗi có thấy dữ liệu cá nhân (tên, SĐT, email, địa chỉ) của tenant này không */
  hoSeesPii: boolean;
  /** Hội sở chuỗi có thấy CHI TIẾT tài chính (từng phiếu thu, từng công nợ) không */
  hoSeesFinanceDetail: boolean;
  /** Số năm giữ dữ liệu trước khi xoá / ẩn danh */
  dataRetentionYears: number;
  /** Cho phép chuyển học viên / lead sang cơ sở thuộc tenant khác */
  allowCrossCenterTransfer: boolean;
}

export const DATA_RETENTION_YEARS_MIN = 1;
export const DATA_RETENTION_YEARS_MAX = 20;

/**
 * Mặc định theo loại tenant: tenant của chuỗi mở hết (giữ nguyên hành vi cũ),
 * tenant nhượng quyền đóng hết — muốn mở thì chính tenant đó bật.
 */
export function defaultTenantSettings(type: TenantType): TenantSettings {
  return type === "OWNED"
    ? { hoSeesPii: true, hoSeesFinanceDetail: true, dataRetentionYears: 10, allowCrossCenterTransfer: true }
    : { hoSeesPii: false, hoSeesFinanceDetail: false, dataRetentionYears: 5, allowCrossCenterTransfer: false };
}

/** Điền khuyết cấu hình thiếu (bản ghi cũ, tenant chưa có dòng cấu hình) */
export function withSettingsDefaults(type: TenantType, partial?: Partial<TenantSettings> | null): TenantSettings {
  return { ...defaultTenantSettings(type), ...(partial ?? {}) };
}

export function validateTenantSettings(s: Partial<TenantSettings>): string | null {
  const y = s.dataRetentionYears;
  if (y !== undefined && (!Number.isInteger(y) || y < DATA_RETENTION_YEARS_MIN || y > DATA_RETENTION_YEARS_MAX)) {
    return `Thời gian giữ dữ liệu phải là số năm từ ${DATA_RETENTION_YEARS_MIN} đến ${DATA_RETENTION_YEARS_MAX}`;
  }
  return null;
}

/** Nhãn tiếng Việt của từng công tắc — giao diện và tài liệu dùng chung một chỗ */
export const TENANT_SETTING_VI: Record<keyof TenantSettings, { label: string; desc: string }> = {
  hoSeesPii: {
    label: "Hội sở chuỗi được xem dữ liệu cá nhân",
    desc: "Tắt: Hội sở vẫn thấy số liệu tổng hợp nhưng tên, số điện thoại, email và địa chỉ của phụ huynh / học viên bị che (0912****78).",
  },
  hoSeesFinanceDetail: {
    label: "Hội sở chuỗi được xem chi tiết tài chính",
    desc: "Tắt: Hội sở chỉ thấy tổng doanh thu và tổng công nợ, không thấy từng phiếu thu kèm tên học viên.",
  },
  dataRetentionYears: {
    label: "Thời gian giữ dữ liệu (năm)",
    desc: "Hết thời hạn này, dữ liệu cá nhân của trung tâm sẽ được xoá hoặc ẩn danh theo quy trình bảo vệ dữ liệu.",
  },
  allowCrossCenterTransfer: {
    label: "Cho phép chuyển học viên / lead sang trung tâm khác",
    desc: "Tắt: học viên và lead của trung tâm này không thể bị chuyển sang cơ sở thuộc trung tâm khác.",
  },
};

/* ------------------------------------------------------------------ */
/* Nhận diện tenant                                                    */
/* ------------------------------------------------------------------ */

/** tenantId của một actor / bản ghi / chuỗi id; null nếu chưa gắn tenant */
export function tenantOf(x: TenantHolder | TenantActor): string | null {
  if (x === null || x === undefined) return null;
  if (typeof x === "string") return x.trim() || null;
  const t = (x as { tenantId?: string | null }).tenantId;
  return t ?? null;
}

/** Hai bên có cùng tenant không? Bên chưa gắn tenant (null) KHÔNG cùng tenant với ai. */
export function sameTenant(a: TenantHolder | TenantActor, b: TenantHolder | TenantActor): boolean {
  const x = tenantOf(a);
  const y = tenantOf(b);
  return x !== null && y !== null && x === y;
}

/** Actor Hội sở = có ít nhất một vai trò không gắn cơ sở (centerId null = toàn hệ thống) */
export function isHeadOfficeActor(actor: TenantActor): boolean {
  return (actor.assignments ?? []).some((a) => a.centerId === null);
}

/** SUPER_ADMIN (ở bất kỳ phạm vi nào) */
export function isSuperAdminActor(actor: TenantActor): boolean {
  return (actor.assignments ?? []).some((a) => a.role === "SUPER_ADMIN");
}

/**
 * Danh sách tenantId mà actor được thấy dữ liệu.
 * `tenants` là toàn bộ tenant đang có (bảng `tenants`).
 */
export function tenantScope(actor: TenantActor, tenants: readonly TenantRef[] = []): string[] {
  const home = tenantOf(actor);
  if (!home) return [];
  const mine = tenants.find((t) => t.id === home);
  // Không tra được tenant của actor → khoá chặt về đúng tenant của actor
  if (!mine) return [home];
  if (mine.type === "FRANCHISE") return [home];
  if (!isHeadOfficeActor(actor)) return [home];

  const open = tenants.filter((t) => t.status !== "closed");
  // SUPER_ADMIN của chuỗi: thấy cả tenant nhượng quyền (số liệu tổng hợp, PII bị che theo cấu hình)
  const visible = isSuperAdminActor(actor) ? open : open.filter((t) => t.type === "OWNED");
  const ids = new Set(visible.map((t) => t.id));
  ids.add(home);
  return [...ids];
}

/** Actor có được chạm vào dữ liệu của tenant này không (theo `tenantScope`) */
export function canAccessTenant(actor: TenantActor, tenantId: string | null, tenants: readonly TenantRef[] = []): boolean {
  if (!tenantId) return true; // dữ liệu chưa gắn tenant (di sản) — không chặn
  return tenantScope(actor, tenants).includes(tenantId);
}

/**
 * Chặn truy cập chéo tenant: ném lỗi tiếng Việt rõ ràng.
 * Dùng ngay sau khi nạp một bản ghi theo id, TRƯỚC khi trả về hoặc ghi đè.
 */
export function assertSameTenant(a: TenantHolder | TenantActor, b: TenantHolder | TenantActor, what = "Bản ghi"): void {
  const x = tenantOf(a);
  const y = tenantOf(b);
  if (y === null || x === null) return; // dữ liệu di sản chưa gắn tenant — không chặn
  if (x !== y) throw new TenantIsolationError(`${what} thuộc một trung tâm khác — dữ liệu giữa các trung tâm được cách ly, không truy cập chéo được`);
}

/** Chặn truy cập ngoài phạm vi tenant của actor (dùng khi đã tính sẵn `ctx.tenantIds`) */
export function assertTenantScope(scope: readonly string[], record: TenantHolder, what = "Bản ghi"): void {
  const t = tenantOf(record);
  if (t === null) return;
  if (!scope.includes(t)) throw new TenantIsolationError(`${what} thuộc một trung tâm khác — dữ liệu giữa các trung tâm được cách ly, không truy cập chéo được`);
}

/* ------------------------------------------------------------------ */
/* Quyền riêng tư: PII và chi tiết tài chính                            */
/* ------------------------------------------------------------------ */

/** Actor có được xem PII của tenant này không */
export function canSeePii(actor: TenantActor, tenant: TenantRef, settings: TenantSettings): boolean {
  if (sameTenant(actor, tenant.id)) return true;
  return settings.hoSeesPii === true;
}

/** Actor có được xem CHI TIẾT tài chính (từng phiếu thu) của tenant này không */
export function canSeeFinanceDetail(actor: TenantActor, tenant: TenantRef, settings: TenantSettings): boolean {
  if (sameTenant(actor, tenant.id)) return true;
  return settings.hoSeesFinanceDetail === true;
}

/**
 * Che dữ liệu của tenant trước khi trả cho actor — không được xem PII thì che,
 * cùng tenant thì trả nguyên vẹn.
 */
export function redactForActor<T>(row: T, actor: TenantActor, tenant: TenantRef, settings: TenantSettings): T {
  return canSeePii(actor, tenant, settings) ? row : maskOutsideTenant(row);
}

/** Lý do tiếng Việt khi chặn xem chi tiết tài chính */
export function assertFinanceDetail(actor: TenantActor, tenant: TenantRef, settings: TenantSettings): void {
  if (canSeeFinanceDetail(actor, tenant, settings)) return;
  throw new TenantIsolationError(
    `Trung tâm ${tenant.code ?? tenant.name ?? ""} chỉ chia sẻ số liệu tài chính tổng hợp. Muốn xem chi tiết từng phiếu thu, trung tâm phải bật "Hội sở chuỗi được xem chi tiết tài chính"`.trim(),
  );
}

/* ------------------------------------------------------------------ */
/* Chuyển học viên / lead giữa các cơ sở                               */
/* ------------------------------------------------------------------ */

/**
 * Kiểm tra chuyển một học viên / lead từ cơ sở nguồn sang cơ sở đích.
 * Trả về lý do tiếng Việt nếu KHÔNG được phép, null nếu được.
 *
 * Cùng tenant: luôn được (hành vi cũ của chuỗi giữ nguyên).
 * Khác tenant: cả HAI bên đều phải bật `allowCrossCenterTransfer`.
 */
export function canTransferAcrossTenant(input: {
  from: TenantHolder;
  to: TenantHolder;
  fromSettings: TenantSettings;
  toSettings?: TenantSettings;
  what?: string;
}): string | null {
  const what = input.what ?? "học viên";
  const f = tenantOf(input.from);
  const t = tenantOf(input.to);
  if (f === null || t === null || f === t) return null;
  if (!input.fromSettings.allowCrossCenterTransfer) return `Trung tâm nguồn không cho phép chuyển ${what} sang trung tâm khác`;
  if (input.toSettings && !input.toSettings.allowCrossCenterTransfer) return `Trung tâm nhận không cho phép nhận ${what} từ trung tâm khác`;
  return null;
}

export function assertTransferAllowed(input: Parameters<typeof canTransferAcrossTenant>[0]): void {
  const reason = canTransferAcrossTenant(input);
  if (reason) throw new TenantIsolationError(reason);
}

/* ------------------------------------------------------------------ */
/* Cấu hình dùng chung: chọn bản của đúng trung tâm                    */
/* ------------------------------------------------------------------ */

/**
 * Chọn cấu hình (mẫu email, loại thông báo…) cho một trung tâm theo thứ tự ưu tiên:
 *  1. dòng của CHÍNH trung tâm đó;
 *  2. dòng của trung tâm mặc định (chuỗi gốc) — dự phòng;
 *  3. dòng dùng chung (chưa gắn tenant) — dữ liệu di sản;
 *  4. dòng đầu tiên còn lại.
 *
 * Nhờ bước 2 và 3, hệ thống một-tenant chạy y như trước khi có nhượng quyền.
 */
export function pickForTenant<T extends { tenantId?: string | null }>(
  rows: readonly T[],
  tenantId: string | null | undefined,
  defaultTenantId?: string | null,
): T | null {
  if (!rows.length) return null;
  const of = (r: T) => r.tenantId ?? null;
  const mine = tenantId ? rows.find((r) => of(r) === tenantId) : undefined;
  if (mine) return mine;
  const def = defaultTenantId ? rows.find((r) => of(r) === defaultTenantId) : undefined;
  if (def) return def;
  return rows.find((r) => of(r) === null) ?? rows[0] ?? null;
}

/**
 * Danh mục cấu hình theo mã, lấy đúng bản của một trung tâm.
 * Dùng cho bộ đệm loại thông báo: bộ đệm khoá theo **(tenantId, mã)**, nên cấu hình
 * của bên nhượng quyền không bao giờ đè lên cấu hình của chuỗi và ngược lại.
 */
export function catalogForTenant<T extends { tenantId?: string | null }>(
  rows: readonly T[],
  keyOf: (row: T) => string,
  tenantId: string | null | undefined,
  defaultTenantId?: string | null,
): Map<string, T> {
  const byKey = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyOf(r);
    byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  const out = new Map<string, T>();
  for (const [k, list] of byKey) {
    const picked = pickForTenant(list, tenantId, defaultTenantId);
    if (picked) out.set(k, picked);
  }
  return out;
}

/** Danh mục có cấu hình riêng của từng trung tâm không (quyết định có phải tra tenant người nhận) */
export function hasPerTenantConfig<T extends { tenantId?: string | null }>(rows: readonly T[], defaultTenantId?: string | null): boolean {
  return rows.some((r) => !!r.tenantId && r.tenantId !== (defaultTenantId ?? null));
}

/* ------------------------------------------------------------------ */
/* RLS: biến phiên `app.tenant_ids` / `app.bypass_rls`                 */
/* ------------------------------------------------------------------ */

/**
 * Lớp phòng thủ cuối ở Postgres (xem `packages/db/sql/0009_rls_tenant.sql`).
 * Ứng dụng đặt hai biến phiên ở đầu mỗi giao dịch; chính sách RLS đọc lại đúng luật dưới đây.
 * Các hàm ở đây là BẢN SAO THUẦN của luật SQL để kiểm thử được mà không cần CSDL.
 */
export interface RlsSession {
  /** Danh sách tenantId người dùng được thấy */
  ids: string[];
  /** Bỏ qua RLS (lệnh quản trị: migrate, seed, nhân bản tenant, worker) */
  bypass: boolean;
}

/** Ghép danh sách tenantId thành giá trị của `app.tenant_ids` (uuid phân tách bằng dấu phẩy) */
export function tenantSessionValue(ids: readonly (string | null | undefined)[]): string {
  return [...new Set(ids.map((i) => (i ?? "").trim()).filter(Boolean))].join(",");
}

/** Đọc ngược giá trị biến phiên (bỏ khoảng trắng và phần tử rỗng) */
export function parseTenantSession(raw: string | null | undefined): string[] {
  return (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export function rlsSessionFrom(rawIds: string | null | undefined, rawBypass?: string | null): RlsSession {
  const b = (rawBypass ?? "").trim().toLowerCase();
  return { ids: parseTenantSession(rawIds), bypass: b === "on" || b === "true" || b === "1" || b === "yes" };
}

/**
 * Một dòng có qua được chính sách RLS không:
 *  - đang bật cờ bỏ qua → cho;
 *  - dòng chưa gắn tenant (dữ liệu di sản) → cho, giống `tenantCond` ở tầng service;
 *  - còn lại: tenant của dòng phải nằm trong `app.tenant_ids`.
 *
 * Chưa đặt biến phiên (danh sách rỗng) → CHẶN. Đây là mặc định an toàn và cũng là lý do
 * RLS phải bật có chủ đích: kết nối nào quên đặt biến phiên sẽ không đọc được gì.
 */
export function rlsAllowsRow(rowTenantId: string | null | undefined, s: RlsSession): boolean {
  if (s.bypass) return true;
  if (rowTenantId === null || rowTenantId === undefined || rowTenantId === "") return true;
  return s.ids.includes(rowTenantId);
}

/* ------------------------------------------------------------------ */
/* Mã tenant                                                           */
/* ------------------------------------------------------------------ */

/** Mã tenant: 2–12 ký tự HOA / số / gạch dưới, bắt đầu bằng chữ */
export function validateTenantCode(code: string): string | null {
  const c = code.trim();
  if (!/^[A-Z][A-Z0-9_]{1,11}$/.test(c)) return "Mã trung tâm gồm 2–12 ký tự IN HOA, bắt đầu bằng chữ, chỉ dùng chữ / số / gạch dưới";
  return null;
}

/** Mã tenant mặc định của chuỗi gốc — mọi dữ liệu cũ được gán về đây */
export const DEFAULT_TENANT_CODE = "SATA";
