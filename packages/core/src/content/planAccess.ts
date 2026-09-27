/**
 * QUYỀN XEM GIÁO ÁN THEO CA DẠY — luật thuần (docs/GIAO-AN-BUOI-HOC.md mục "Xem ngoài ca dạy").
 *
 * Giáo viên (chỉ có quyền `document:read_own`) xem giáo án của một bài khi và chỉ khi:
 *   1. ĐANG TRONG CA DẠY bài đó: có buổi hôm nay của lớp mình dạy / dạy thay gắn đúng bài, và giờ hiện tại
 *      nằm trong [giờ vào lớp − 30 phút, giờ tan + 15 phút]; hoặc
 *   2. CÓ YÊU CẦU ĐÃ ĐƯỢC QUẢN LÝ DUYỆT còn hiệu lực: 2 giờ kể từ lúc duyệt, gắn đúng người + đúng bài.
 * Người đọc toàn kho (Đào tạo, quản lý, giáo vụ, kiểm soát) không bị giới hạn.
 *
 * Tầng service kiểm ở MỌI đường phát nội dung (siêu dữ liệu giáo án, luồng slide, khởi chạy SCORM,
 * mở tài liệu); giao diện chỉ phản ánh lại kết quả.
 */

/** Mở trước giờ vào lớp (phút) — để giáo viên chuẩn bị máy chiếu */
export const PLAN_WINDOW_BEFORE_MIN = 30;
/** Còn mở sau giờ tan (phút) — để chốt buổi, xem lại phần vừa dạy */
export const PLAN_WINDOW_AFTER_MIN = 15;
/** Thời gian xem khi được duyệt (phút) */
export const PLAN_GRANT_MIN = 120;
/** Yêu cầu chờ duyệt quá lâu thì tự hết hiệu lực (giờ) */
export const PLAN_REQUEST_TTL_HOURS = 24;
/** Số yêu cầu đang chờ tối đa của một giáo viên */
export const PLAN_PENDING_MAX = 3;
export const PLAN_REASON_MIN = 10;
export const PLAN_REASON_MAX = 300;

export const PLAN_REQUEST_STATUSES = ["pending", "approved", "rejected", "cancelled", "revoked"] as const;
export type PlanRequestStatus = (typeof PLAN_REQUEST_STATUSES)[number];

export const PLAN_REQUEST_STATUS_VI: Record<PlanRequestStatus | "expired", string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  cancelled: "Đã huỷ",
  revoked: "Đã thu hồi",
  expired: "Hết hiệu lực",
};

export type PlanAccessVia = "all" | "ca-day" | "duyet";

export interface CaGon { id: string; date: string; startTime: string; endTime: string; status: string }

const phut = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const BO_QUA = new Set(["cancelled", "rescheduled"]);

/** Khung mở giáo án của một buổi, tính theo phút trong ngày */
export function khungCa(s: { startTime: string; endTime: string }): { from: number; to: number } {
  return { from: phut(s.startTime) - PLAN_WINDOW_BEFORE_MIN, to: phut(s.endTime) + PLAN_WINDOW_AFTER_MIN };
}

/** "HH:MM" từ số phút trong ngày (kẹp 00:00–23:59) */
export function gioPhut(min: number): string {
  const m = Math.min(Math.max(Math.round(min), 0), 23 * 60 + 59);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Buổi đang mở giáo án ngay lúc này (nếu có) — `untilMin` là phút trong ngày lúc khung đóng.
 * Buổi huỷ / dời không mở. Buổi đã hoàn tất vẫn mở tới hết khung (xem lại để chốt nhận xét).
 */
export function caDangMo<T extends CaGon>(list: readonly T[], today: string, nowMin: number): { session: T; untilMin: number } | null {
  for (const s of list) {
    if (s.date !== today || BO_QUA.has(s.status)) continue;
    const k = khungCa(s);
    if (k.from <= nowMin && nowMin < k.to) return { session: s, untilMin: k.to };
  }
  return null;
}

/** Ca sắp tới gần nhất sẽ mở giáo án (để nói "mở lúc 17:30 thứ 4") */
export function caSapMo<T extends CaGon>(list: readonly T[], today: string, nowMin: number): { session: T; fromMin: number } | null {
  const sorted = [...list].filter((s) => !BO_QUA.has(s.status)).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  for (const s of sorted) {
    const k = khungCa(s);
    if (s.date > today || (s.date === today && k.from > nowMin)) return { session: s, fromMin: k.from };
  }
  return null;
}

export interface GrantGon { status: string; expiresAt: Date | string | null }

/** Yêu cầu đã duyệt còn hiệu lực lúc `now` */
export function grantConHan(g: GrantGon | null | undefined, now: Date): boolean {
  return !!g && g.status === "approved" && !!g.expiresAt && new Date(g.expiresAt).getTime() > now.getTime();
}

/** Yêu cầu chờ duyệt còn được tính (chưa quá hạn chờ) */
export function choDuyetConHan(r: { status: string; createdAt: Date | string }, now: Date): boolean {
  return r.status === "pending" && now.getTime() - new Date(r.createdAt).getTime() < PLAN_REQUEST_TTL_HOURS * 3600_000;
}

/** Trạng thái hiển thị của một yêu cầu (đã duyệt nhưng quá 2 giờ → "Hết hiệu lực") */
export function trangThaiYeuCau(r: { status: string; expiresAt: Date | string | null; createdAt: Date | string }, now: Date): PlanRequestStatus | "expired" {
  if (r.status === "approved" && !grantConHan(r, now)) return "expired";
  if (r.status === "pending" && !choDuyetConHan(r, now)) return "expired";
  return r.status as PlanRequestStatus;
}

/** Hạn xem khi duyệt lúc `at` */
export function hanXem(at: Date): Date {
  return new Date(at.getTime() + PLAN_GRANT_MIN * 60_000);
}

/** Kiểm lý do xin xem: bắt buộc, 10–300 ký tự sau khi cắt khoảng trắng */
export function loiLyDoXem(reason: string | null | undefined): string | null {
  const r = (reason ?? "").trim();
  if (r.length < PLAN_REASON_MIN) return `Ghi lý do cần xem (ít nhất ${PLAN_REASON_MIN} ký tự) — ví dụ: dạy thay lớp khác, soạn bài trước buổi`;
  if (r.length > PLAN_REASON_MAX) return `Lý do tối đa ${PLAN_REASON_MAX} ký tự`;
  return null;
}

export type PlanDecision = "approve" | "reject" | "revoke";

/**
 * Kiểm một thao tác duyệt trên yêu cầu. Trả lỗi (chuỗi) hoặc null nếu được làm.
 * - Không ai tự duyệt yêu cầu của chính mình (quản lý kiêm dạy phải nhờ người khác duyệt).
 * - Duyệt / từ chối chỉ khi đang chờ và chưa quá hạn chờ; từ chối phải có lý do.
 * - Thu hồi chỉ khi đã duyệt và còn hạn.
 */
export function loiDuyetXem(
  r: { status: string; requestedBy: string; createdAt: Date | string; expiresAt: Date | string | null },
  action: PlanDecision,
  approverId: string,
  note: string | null | undefined,
  now: Date,
): string | null {
  if (r.requestedBy === approverId) return "Không thể tự duyệt yêu cầu của chính mình";
  if (action === "revoke") return grantConHan(r, now) ? null : "Chỉ thu hồi được quyền xem đang còn hạn";
  if (r.status !== "pending") return "Yêu cầu không còn ở trạng thái chờ duyệt";
  if (!choDuyetConHan(r, now)) return `Yêu cầu đã chờ quá ${PLAN_REQUEST_TTL_HOURS} giờ — giáo viên cần gửi lại`;
  if (action === "reject" && (note ?? "").trim().length < 5) return "Ghi lý do từ chối (ít nhất 5 ký tự)";
  return null;
}
