/**
 * GIÁO ÁN CỦA TỪNG BUỔI HỌC — quy tắc thuần (không chạm CSDL).
 *
 * Mỗi buổi học giữ ĐÚNG MỘT giáo án đang dùng: hoặc slide .pdf, hoặc gói SCORM .zip.
 * Cả hai trình chiếu trong cùng một khung xem, nên người dạy không phải nhớ "buổi này loại gì".
 *
 * Vì sao có trạng thái xử lý: gói SCORM 200MB phải giải nén hàng trăm tệp. Nếu tiến trình chết
 * giữa chừng (máy chủ khởi động lại, hết bộ nhớ) thì bản đó treo ở "đang xử lý" mãi mãi và người
 * dùng không hiểu vì sao giáo án không đổi. Ở đây quy định: quá PLAN_STUCK_MINUTES phút thì coi là
 * KẸT — màn hình hiện một nút "Dọn bản lỗi" để xoá và đẩy lại, không cần gọi kỹ thuật.
 */

export const PLAN_VERSION_STATUSES = ["processing", "ready", "failed"] as const;
export type PlanVersionStatus = (typeof PLAN_VERSION_STATUSES)[number];

/** Bản đang xử lý quá số phút này thì coi như kẹt (giống bản gốc admin.satarobo.vn) */
export const PLAN_STUCK_MINUTES = 15;

/** Slide PDF: đủ cho một buổi dạy có nhiều ảnh; gói SCORM dùng hạn mức SCORM_MAX_BYTES */
export const PLAN_MAX_PDF_BYTES = 100 * 1024 * 1024;
export const PLAN_MAX_ZIP_BYTES = 200 * 1024 * 1024;

export type PlanFileKind = "pdf" | "scorm";
export const PLAN_FILE_KIND_VI: Record<PlanFileKind, string> = { pdf: "Slide PDF", scorm: "SCORM" };

/** Loại giáo án suy ra từ tên tệp; null = không nhận */
export function planFileKind(name: string): PlanFileKind | null {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(name.trim());
  const ext = m ? m[1]!.toLowerCase() : "";
  if (ext === "pdf") return "pdf";
  if (ext === "zip") return "scorm";
  return null;
}

/** Thông báo lỗi tiếng Việt nếu tệp không dùng được; null = hợp lệ */
export function validatePlanFile(name: string, size: number): string | null {
  const kind = planFileKind(name);
  if (!kind) return "Chỉ nhận .pdf (slide) hoặc .zip (gói SCORM)";
  if (size <= 0) return "Tệp rỗng";
  const max = kind === "pdf" ? PLAN_MAX_PDF_BYTES : PLAN_MAX_ZIP_BYTES;
  if (size > max) return `${PLAN_FILE_KIND_VI[kind]} tối đa ${Math.round(max / 1024 / 1024)}MB`;
  return null;
}

export type PlanVersionUiState = "ready" | "processing" | "stuck" | "failed";

export interface PlanVersionInput {
  status: PlanVersionStatus;
  /** Lúc bắt đầu tải lên */
  createdAt: Date | string;
  errorText?: string | null;
}

export interface PlanVersionState {
  state: PlanVersionUiState;
  label: string;
  /** Câu giải thích cho người vận hành (rỗng khi bản chạy tốt) */
  message: string;
  /** Có nên hiện nút "Dọn bản lỗi" không */
  cleanable: boolean;
}

const toDate = (d: Date | string): Date => (d instanceof Date ? d : new Date(d));

/** Trạng thái hiển thị của một bản tải lên, tính cả trường hợp kẹt quá lâu */
export function planVersionState(v: PlanVersionInput, now: Date = new Date()): PlanVersionState {
  if (v.status === "ready") return { state: "ready", label: "Đang dùng", message: "", cleanable: false };
  if (v.status === "failed") {
    return { state: "failed", label: "Lỗi", message: v.errorText?.trim() || "Xử lý lỗi — dọn bản này rồi đẩy lại tệp.", cleanable: true };
  }
  const minutes = (now.getTime() - toDate(v.createdAt).getTime()) / 60_000;
  if (minutes >= PLAN_STUCK_MINUTES) {
    return {
      state: "stuck",
      label: "Kẹt xử lý",
      message: `Kẹt xử lý (quá ${PLAN_STUCK_MINUTES} phút) — dọn bản này rồi đẩy lại tệp.`,
      cleanable: true,
    };
  }
  return { state: "processing", label: "Đang xử lý", message: "Đang xử lý tệp — mở lại trang sau ít phút.", cleanable: false };
}

/** Gọn cho giao diện: "37.8 MB", "912 KB" */
export function humanSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Tỷ lệ buổi đã có giáo án — để màn hình nói ngay "còn thiếu bao nhiêu buổi" */
export function planCoverage(lessons: { hasPlan: boolean }[]): { done: number; total: number; percent: number } {
  const total = lessons.length;
  const done = lessons.filter((l) => l.hasPlan).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}
