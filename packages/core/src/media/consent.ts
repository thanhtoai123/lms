/**
 * Ảnh lớp chỉ được duyệt gửi PH khi mọi học viên xuất hiện trong ảnh đều có PH đồng ý đăng ảnh (NĐ13).
 * Học viên có nhiều PH: chỉ cần một PH (người giám hộ chính) đồng ý là đủ; không PH nào đồng ý → chặn.
 */
export function consentCheck(taggedStudentIds: string[], consentByStudent: Map<string, boolean>): { ok: boolean; blocked: string[] } {
  const blocked = taggedStudentIds.filter((id) => consentByStudent.get(id) !== true);
  return { ok: blocked.length === 0, blocked };
}

export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const MEDIA_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type MediaMime = (typeof MEDIA_MIME)[number];

/** Ảnh chờ duyệt quá N giờ bị coi là quá hạn */
export const MEDIA_REVIEW_SLA_HOURS = 24;

export function isMediaOverdue(uploadedAt: Date, now: Date = new Date(), slaHours = MEDIA_REVIEW_SLA_HOURS): boolean {
  return now.getTime() - uploadedAt.getTime() > slaHours * 3600_000;
}

/** Khoá lưu trữ: media/<classId>/<sessionId>/<uuid>.<ext> */
export function mediaObjectKey(classId: string, sessionId: string, id: string, mime: MediaMime): string {
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  return `media/${classId}/${sessionId}/${id}.${ext}`;
}
