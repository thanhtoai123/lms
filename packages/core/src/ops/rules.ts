/**
 * Sẵn sàng vận hành: kiểm tra biến môi trường, độ tươi bản sao lưu, nhịp worker.
 * Không bao giờ trả về giá trị bí mật — chỉ trạng thái.
 */
export type EnvLevel = "required" | "recommended" | "optional";
export type EnvStatus = "ok" | "missing" | "weak" | "danger";
export interface EnvCheck { key: string; level: EnvLevel; status: EnvStatus; note: string; group: string }

const DEFS: { key: string; level: EnvLevel | ((prod: boolean) => EnvLevel); group: string; note: string; minLen?: number }[] = [
  { key: "DATABASE_URL", level: "required", group: "Lõi", note: "Kết nối Postgres" },
  { key: "NEXT_PUBLIC_SUPABASE_URL", level: (p) => (p ? "required" : "optional"), group: "Đăng nhập", note: "Supabase Auth — bắt buộc khi chạy thật" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", level: (p) => (p ? "required" : "optional"), group: "Đăng nhập", note: "Supabase Auth" },
  { key: "MEDIA_SIGNING_SECRET", level: (p) => (p ? "required" : "recommended"), group: "Bảo mật", note: "Khoá ký URL tệp / ảnh (≥ 32 ký tự)", minLen: 32 },
  { key: "OTP_PEPPER", level: (p) => (p ? "required" : "recommended"), group: "Bảo mật", note: "Khoá băm OTP (≥ 16 ký tự)", minLen: 16 },
  { key: "CRON_SECRET", level: (p) => (p ? "required" : "recommended"), group: "Bảo mật", note: "Bảo vệ /api/cron/outbox (≥ 24 ký tự)", minLen: 24 },
  { key: "STORAGE_DIR", level: (p) => (p ? "required" : "optional"), group: "Lưu trữ", note: "Thư mục tệp tải lên (đưa vào sao lưu)" },
  { key: "BACKUP_DIR", level: "recommended", group: "Lưu trữ", note: "Thư mục bản sao lưu để trang Vận hành kiểm tra độ tươi" },
  { key: "PUBLIC_FORM_ORIGINS", level: "recommended", group: "Website", note: "Domain được gửi form đăng ký / tracking" },
  { key: "RESEND_API_KEY", level: "recommended", group: "Thông báo", note: "Gửi email phiếu thu / nhắc học phí" },
  { key: "EMAIL_FROM", level: "optional", group: "Thông báo", note: "Người gửi email" },
  { key: "SEPAY_API_KEY", level: "recommended", group: "Tài chính", note: "Webhook biến động số dư (≥ 24 ký tự)", minLen: 24 },
  { key: "META_VERIFY_TOKEN", level: "optional", group: "Messenger", note: "Xác minh webhook" },
  { key: "META_APP_SECRET", level: "optional", group: "Messenger", note: "Kiểm tra chữ ký webhook" },
  { key: "META_PAGE_TOKEN", level: "optional", group: "Messenger", note: "Gửi trả lời" },
  { key: "ZALO_APP_ID", level: "optional", group: "Zalo OA", note: "Kiểm tra chữ ký webhook" },
  { key: "ZALO_OA_SECRET", level: "optional", group: "Zalo OA", note: "Kiểm tra chữ ký webhook" },
  { key: "ZALO_OA_ACCESS_TOKEN", level: "optional", group: "Zalo OA", note: "Gửi tin tư vấn" },
  { key: "ZALO_ZNS_TOKEN", level: "optional", group: "Zalo OA", note: "Gửi ZNS theo mẫu (OTP, thông báo)" },
  { key: "EINVOICE_API_URL", level: "optional", group: "Hoá đơn điện tử", note: "Cổng kết nối nhà cung cấp hoá đơn điện tử" },
  { key: "EINVOICE_API_KEY", level: "optional", group: "Hoá đơn điện tử", note: "Khoá kết nối nhà cung cấp" },
];

export function envChecks(env: Record<string, string | undefined>, production: boolean): EnvCheck[] {
  const out: EnvCheck[] = DEFS.map((d) => {
    const level = typeof d.level === "function" ? d.level(production) : d.level;
    const v = env[d.key];
    let status: EnvStatus = v ? "ok" : "missing";
    let note = d.note;
    if (v && d.minLen && v.length < d.minLen) { status = "weak"; note = `${d.note} — đang quá ngắn`; }
    if (v && /^(dev|test|changeme|secret|123)/i.test(v) && d.minLen) { status = "weak"; note = `${d.note} — giá trị mẫu, cần thay`; }
    if (d.key === "STORAGE_DIR" && v && !/^([a-zA-Z]:[\\/]|\/)/.test(v)) { status = "weak"; note = "Nên dùng đường dẫn tuyệt đối"; }
    return { key: d.key, level, status, note, group: d.group };
  });
  const dev = env.ALLOW_DEV_ACTOR === "1";
  out.push({ key: "ALLOW_DEV_ACTOR", level: production ? "required" : "recommended", group: "Bảo mật", status: dev ? (production ? "danger" : "weak") : "ok", note: dev ? "Đăng nhập tài khoản mẫu đang BẬT — phải tắt khi chạy thật" : "Đã tắt đăng nhập tài khoản mẫu" });
  const db = env.DATABASE_URL ?? "";
  if (production && /postgres:postgres@/.test(db)) out.push({ key: "DATABASE_URL (mật khẩu)", level: "required", group: "Bảo mật", status: "danger", note: "Đang dùng mật khẩu mặc định postgres/postgres" });
  if (production && db && !/sslmode=require|localhost|127\.0\.0\.1/.test(db)) out.push({ key: "DATABASE_URL (SSL)", level: "recommended", group: "Bảo mật", status: "weak", note: "Nên bật sslmode=require khi DB ở máy khác" });
  return out;
}

export function envSummary(checks: EnvCheck[]) {
  const blocking = checks.filter((c) => c.status === "danger" || (c.level === "required" && c.status !== "ok"));
  const warnings = checks.filter((c) => !blocking.includes(c) && c.level === "recommended" && c.status !== "ok");
  return { blocking: blocking.length, warnings: warnings.length, ready: blocking.length === 0 };
}

export type Freshness = "ok" | "stale" | "missing";
/** Bản sao lưu: ≤ 26 giờ là đạt (chạy hằng đêm) */
export function backupFreshness(latestAt: Date | null, now: Date, maxHours = 26): Freshness {
  if (!latestAt) return "missing";
  return now.getTime() - latestAt.getTime() <= maxHours * 3_600_000 ? "ok" : "stale";
}
/** Worker: nhịp ≤ 5 phút là đang chạy */
export function heartbeatState(at: Date | null, now: Date, maxMin = 5): Freshness {
  if (!at) return "missing";
  return now.getTime() - at.getTime() <= maxMin * 60_000 ? "ok" : "stale";
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${u[i]}`;
}
