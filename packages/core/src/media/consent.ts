/**
 * Ảnh lớp đi theo hai tầng như bản gốc:
 *   1. Kho của lớp ("library") — GV tải lên, phụ huynh CHƯA nhìn thấy.
 *   2. GV chọn ảnh trong kho, gắn thẻ học viên (hoặc đánh dấu "ảnh chung cả lớp") rồi Gửi duyệt ("pending").
 * Giáo vụ duyệt ("approved") thì PH mới thấy; loại ("rejected") thì còn khôi phục trong 7 ngày.
 */
export const MEDIA_STATUSES = ["library", "pending", "approved", "rejected"] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const MEDIA_STATUS_VI: Record<MediaStatus, string> = {
  library: "Trong kho (GV chưa gửi)",
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
};

/**
 * Ảnh lớp chỉ được duyệt gửi PH khi mọi học viên xuất hiện trong ảnh đều có PH đồng ý đăng ảnh (NĐ13).
 * Học viên có nhiều PH: chỉ cần một PH (người giám hộ chính) đồng ý là đủ; không PH nào đồng ý → chặn.
 */
export function consentCheck(taggedStudentIds: string[], consentByStudent: Map<string, boolean>): { ok: boolean; blocked: string[] } {
  const blocked = taggedStudentIds.filter((id) => consentByStudent.get(id) !== true);
  return { ok: blocked.length === 0, blocked };
}

/**
 * Tập học viên "xuất hiện" trong một ảnh — dùng để soi đồng ý đăng ảnh và để phát cho PH.
 * Ảnh chung cả lớp coi như có mặt mọi học viên đang học của lớp (mọi PH trong lớp đều xem được).
 */
export function mediaAudience(
  media: { isClassWide: boolean; taggedStudentIds: string[] },
  classStudentIds: string[] = [],
): string[] {
  return [...new Set(media.isClassWide ? classStudentIds : media.taggedStudentIds)];
}

/** Tối đa 40 ảnh mỗi lô tải lên (bản gốc) */
export const MEDIA_UPLOAD_MAX_FILES = 40;
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const MEDIA_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type MediaMime = (typeof MEDIA_MIME)[number];

/** Ảnh chờ duyệt quá N giờ bị coi là quá hạn */
export const MEDIA_REVIEW_SLA_HOURS = 24;

export function isMediaOverdue(uploadedAt: Date, now: Date = new Date(), slaHours = MEDIA_REVIEW_SLA_HOURS): boolean {
  return now.getTime() - uploadedAt.getTime() > slaHours * 3600_000;
}

/** Ảnh bị loại còn khôi phục được trong 7 ngày */
export const MEDIA_RESTORE_DAYS = 7;

export function restoreDeadline(rejectedAt: Date, days = MEDIA_RESTORE_DAYS): Date {
  return new Date(rejectedAt.getTime() + days * 86_400_000);
}

export function canRestoreRejected(rejectedAt: Date | null, now: Date = new Date(), days = MEDIA_RESTORE_DAYS): boolean {
  if (!rejectedAt) return false;
  return now.getTime() <= restoreDeadline(rejectedAt, days).getTime();
}

/**
 * Điều kiện để GV gửi một ảnh trong kho đi duyệt: ảnh phải đang ở kho và
 * phải nói rõ ảnh của ai — gắn ít nhất một học viên hoặc đánh dấu ảnh chung cả lớp.
 */
export function canSubmitMedia(m: { status: MediaStatus; isClassWide: boolean; taggedStudentIds: string[] }): { ok: boolean; error: string | null } {
  if (m.status !== "library") {
    return { ok: false, error: m.status === "pending" ? "Ảnh đã gửi duyệt" : `Ảnh đang ở trạng thái "${MEDIA_STATUS_VI[m.status]}" — không gửi duyệt được` };
  }
  if (!m.isClassWide && m.taggedStudentIds.length === 0) {
    return { ok: false, error: "Gắn thẻ học viên trong ảnh hoặc đánh dấu ảnh chung cả lớp trước khi gửi duyệt" };
  }
  return { ok: true, error: null };
}

/** Buổi đã qua mà chưa có ảnh nào và chưa ghi nhận "không có ảnh" thì bị coi là quá hạn xử lý ảnh */
export function isSessionMediaMissing(
  s: { date: string; photos: number; noMediaAt: Date | null },
  today: string,
): boolean {
  return s.photos === 0 && !s.noMediaAt && s.date < today;
}

/** Khoá lưu trữ: media/<classId>/<sessionId>/<uuid>.<ext> */
export function mediaObjectKey(classId: string, sessionId: string, id: string, mime: MediaMime): string {
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  return `media/${classId}/${sessionId}/${id}.${ext}`;
}
