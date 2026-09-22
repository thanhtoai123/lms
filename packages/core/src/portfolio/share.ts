/**
 * CHIA SẺ HỒ SƠ HỌC TẬP qua link riêng `/hs/<token>` (khuôn giống phiếu đánh giá học thử):
 * token ≥ 32 byte base64url, có hạn (mặc định 180 ngày), thu hồi có lý do, đếm lượt xem.
 * Phạm vi: toàn bộ hồ sơ | một khoá (một ghi danh) | một khoảng ngày.
 */

export const PORTFOLIO_SHARE_SCOPES = ["all", "course", "range"] as const;
export type PortfolioShareScope = (typeof PORTFOLIO_SHARE_SCOPES)[number];
export const PORTFOLIO_SHARE_SCOPE_VI: Record<PortfolioShareScope, string> = {
  all: "Toàn bộ lộ trình",
  course: "Một khoá học",
  range: "Một khoảng thời gian",
};

export const PORTFOLIO_SHARE_DAYS_DEFAULT = 180;
export const PORTFOLIO_SHARE_DAYS_MIN = 1;
export const PORTFOLIO_SHARE_DAYS_MAX = 365;
/** Token chia sẻ: base64url ≥ 32 byte (43 ký tự); nhận 32–80 để còn dùng token mẫu dễ nhớ */
export const PORTFOLIO_TOKEN_RE = /^[A-Za-z0-9_-]{32,80}$/;

export interface PortfolioScope {
  scope: PortfolioShareScope;
  /** scope = course */
  enrollmentId?: string | null;
  /** scope = range — YYYY-MM-DD, tính cả hai đầu */
  from?: string | null;
  to?: string | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Kiểm tra phạm vi chia sẻ; trả lỗi tiếng Việt */
export function validatePortfolioScope(s: PortfolioScope): string[] {
  const errs: string[] = [];
  if (!(PORTFOLIO_SHARE_SCOPES as readonly string[]).includes(s.scope)) return ["Phạm vi chia sẻ không hợp lệ"];
  if (s.scope === "course" && !s.enrollmentId) errs.push("Chọn khoá học cần chia sẻ");
  if (s.scope === "range") {
    if (!s.from || !ISO.test(s.from)) errs.push("Chọn ngày bắt đầu");
    if (!s.to || !ISO.test(s.to)) errs.push("Chọn ngày kết thúc");
    if (s.from && s.to && ISO.test(s.from) && ISO.test(s.to) && s.from > s.to) errs.push("Ngày bắt đầu phải trước ngày kết thúc");
  }
  return errs;
}

/** Chuẩn hoá: bỏ trường không thuộc phạm vi đã chọn */
export function normalizePortfolioScope(s: PortfolioScope): PortfolioScope {
  if (s.scope === "course") return { scope: "course", enrollmentId: s.enrollmentId ?? null, from: null, to: null };
  if (s.scope === "range") return { scope: "range", enrollmentId: null, from: s.from ?? null, to: s.to ?? null };
  return { scope: "all", enrollmentId: null, from: null, to: null };
}

/** Một mục (phiếu buổi / học bạ / ảnh / chứng chỉ) có nằm trong phạm vi không */
export function inPortfolioScope(item: { enrollmentId: string; date: string | null }, s: PortfolioScope): boolean {
  if (s.scope === "course") return item.enrollmentId === s.enrollmentId;
  if (s.scope === "range") {
    if (!item.date) return false;
    const d = item.date.slice(0, 10);
    return (!s.from || d >= s.from) && (!s.to || d <= s.to);
  }
  return true;
}

/** Nhãn phạm vi in trên trang bìa */
export function portfolioScopeLabel(s: PortfolioScope, courseName?: string | null): string {
  const dmy = (d: string) => d.split("-").reverse().join("/");
  if (s.scope === "course") return courseName ? `Khoá ${courseName}` : PORTFOLIO_SHARE_SCOPE_VI.course;
  if (s.scope === "range" && s.from && s.to) return `Từ ${dmy(s.from)} đến ${dmy(s.to)}`;
  return PORTFOLIO_SHARE_SCOPE_VI.all;
}

export function clampPortfolioShareDays(days: number | null | undefined): number {
  if (typeof days !== "number" || !Number.isFinite(days)) return PORTFOLIO_SHARE_DAYS_DEFAULT;
  return Math.min(PORTFOLIO_SHARE_DAYS_MAX, Math.max(PORTFOLIO_SHARE_DAYS_MIN, Math.floor(days)));
}

export function portfolioShareExpiresAt(from: Date, days?: number | null): Date {
  return new Date(from.getTime() + clampPortfolioShareDays(days) * 86_400_000);
}

export type PortfolioShareState = "ok" | "expired" | "revoked";
export const PORTFOLIO_SHARE_STATE_VI: Record<PortfolioShareState, string> = { ok: "Đang hiệu lực", expired: "Hết hạn", revoked: "Đã thu hồi" };

export function portfolioShareState(row: { revokedAt?: Date | string | null; expiresAt: Date | string }, now: Date): PortfolioShareState {
  if (row.revokedAt) return "revoked";
  const exp = row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt);
  if (Number.isNaN(exp.getTime()) || exp.getTime() <= now.getTime()) return "expired";
  return "ok";
}

export function portfolioPath(token: string): string {
  return `/hs/${token}`;
}

export function portfolioShareMessage(studentName: string | null | undefined, link: string): string {
  const name = (studentName ?? "").trim();
  return `Sata Robo gửi anh/chị hồ sơ học tập của ${name ? `bé ${name}` : "bé"} — xem và lưu PDF tại: ${link}`;
}
