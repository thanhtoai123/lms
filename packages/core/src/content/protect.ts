/**
 * BẢO VỆ HỌC LIỆU khi chiếu trên màn hình.
 *
 * NÓI THẲNG GIỚI HẠN (để không ai tin nhầm vào một lời hứa không có thật):
 * KHÔNG trình duyệt nào chặn được việc quay màn hình hay chụp bằng điện thoại. Mọi DRM web
 * (kể cả Widevine của Netflix) chỉ nâng chi phí sao chép, không triệt tiêu. Vì vậy chiến lược ở đây là:
 *
 *  1) KHÔNG giao tệp gốc: slide phát theo từng yêu cầu qua đường dẫn gắn phiên đăng nhập,
 *     không có link tải, không lưu đệm — ai gửi link cho người ngoài thì người ngoài không mở được;
 *  2) DỰNG RÀO cho thao tác sao chép dễ dãi: chuột phải, kéo–thả, chọn–chép, Ctrl+P / Ctrl+S,
 *     in giấy, PrintScreen — và che màn ~1,5 giây ngay lúc có dấu hiệu chụp (KHÔNG che liên tục:
 *     màn hình phải luôn rõ để còn chiếu bài cho lớp);
 *  3) TRUY NGUỒN: chữ mờ mang TÊN + SỐ ĐIỆN THOẠI/EMAIL + GIỜ của chính người đang xem, đổi vị trí
 *     liên tục; ảnh lọt ra ngoài là biết ngay của ai;
 *  4) GHI NHẬN: mỗi lần mở và mỗi thao tác nghi vấn (in, PrintScreen, mở DevTools…) đều vào nhật ký
 *     để quản trị xem "ai đang cố sao chép", xử lý bằng quy định nội bộ — đó mới là lớp bảo vệ thật.
 */

/** Các loại thao tác nghi vấn sao chép mà trình duyệt CÓ THỂ nhận biết */
export const CAPTURE_KINDS = [
  "print", "screenshot_key", "copy", "context_menu", "devtools", "download",
  // Hai loại dưới đây do ỨNG DỤNG trình chiếu phát hiện được (trình duyệt thì không):
  "recorder_running", "remote_session",
] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];

export const CAPTURE_KIND_VI: Record<CaptureKind, string> = {
  print: "Bấm In (Ctrl+P)",
  screenshot_key: "Bấm phím chụp màn hình",
  copy: "Chép nội dung",
  context_menu: "Mở menu chuột phải",
  devtools: "Mở công cụ nhà phát triển",
  download: "Cố tải tệp về",
  recorder_running: "Có phần mềm quay/chụp màn hình đang chạy",
  remote_session: "Đang chiếu qua phiên điều khiển từ xa",
};

/** Ghi vào `document_access_logs.action` — giữ tiền tố để lọc nhanh */
export function captureAction(kind: CaptureKind): string {
  return `capture:${kind}`;
}

export function parseCaptureAction(action: string): CaptureKind | null {
  const k = action.startsWith("capture:") ? action.slice("capture:".length) : "";
  return (CAPTURE_KINDS as readonly string[]).includes(k) ? (k as CaptureKind) : null;
}

/** Mức cảnh báo theo số lần nghi vấn của một người trong 30 ngày */
export function captureRisk(count: number): { level: "ok" | "watch" | "alert"; label: string } {
  if (count >= 10) return { level: "alert", label: "Bất thường — cần hỏi lại người dùng" };
  if (count >= 3) return { level: "watch", label: "Nên để ý" };
  return { level: "ok", label: "Bình thường" };
}

export interface WatermarkWho {
  name: string;
  /** Số điện thoại / email rút gọn — đủ để truy người, không lộ cả danh bạ */
  contact?: string | null;
}

/**
 * Chuỗi chữ mờ: tên + liên hệ + giờ phút. Giờ đổi mỗi phút nên ảnh chụp lộ luôn thời điểm,
 * ghép với nhật ký mở là ra đúng phiên xem.
 */
export function watermarkText(who: WatermarkWho, at: Date = new Date()): string {
  const hh = String(at.getHours()).padStart(2, "0");
  const mm = String(at.getMinutes()).padStart(2, "0");
  const d = String(at.getDate()).padStart(2, "0");
  const M = String(at.getMonth() + 1).padStart(2, "0");
  const who2 = who.contact ? `${who.name} · ${maskContact(who.contact)}` : who.name;
  return `${who2} · ${d}/${M} ${hh}:${mm}`;
}

/** Che giữa số điện thoại / email: đủ nhận ra người quen, không thành nguồn rò danh bạ */
export function maskContact(raw: string): string {
  const s = raw.trim();
  if (s.includes("@")) {
    const [u, d] = s.split("@");
    const head = (u ?? "").slice(0, 2);
    return `${head}***@${d ?? ""}`;
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length < 6) return s;
  return `${digits.slice(0, 3)}***${digits.slice(-3)}`;
}

/** Cấu hình bảo vệ (đặt ở một chỗ để trang xem và tài liệu vận hành nói cùng một điều) */
export interface ProtectOptions {
  /** Chữ mờ mang danh tính người xem */
  watermark: boolean;
  /** Không phát link tải tệp gốc, chỉ phát theo phiên */
  noDownload: boolean;
  /**
   * Che màn TRONG KHOẢNH KHẮC có dấu hiệu chụp (PrintScreen, Win+Shift+S, Ctrl+P/S, DevTools).
   * KHÔNG che khi chỉ mất tiêu điểm: giáo viên đang chiếu bài cho cả lớp, màn hình phải luôn rõ.
   */
  shieldOnCapture: boolean;
  /** Ghi nhật ký thao tác nghi vấn */
  logCapture: boolean;
}

export const PROTECT_DEFAULTS: ProtectOptions = { watermark: true, noDownload: true, shieldOnCapture: true, logCapture: true };

/** Câu giải thích hiện dưới khung xem — nói đúng điều hệ thống làm được và không làm được */
/**
 * Câu hiện khi trang chạy TRONG ứng dụng "Trình chiếu an toàn" (Electron, đã bật
 * setContentProtection → Windows WDA_EXCLUDEFROMCAPTURE): lúc này chặn là chặn thật.
 */
export const PROTECT_APP_NOTICE =
  "Đang chiếu trong Ứng dụng trình chiếu an toàn: phần mềm quay/chụp màn hình và chia sẻ màn hình "
  + "(Teams, Zoom, OBS…) chỉ thu được màn đen. Máy chiếu nối dây vẫn hiện bài bình thường.";

/**
 * Câu hiện khi chạy trên TRÌNH DUYỆT thường — nói thật: không chặn được quay/chụp.
 * Giấu điều này đi thì giáo viên tưởng mình được bảo vệ, đó mới là rủi ro.
 */
export const PROTECT_BROWSER_NOTICE =
  "Đang xem trên trình duyệt: phần mềm quay màn hình và công cụ chụp của hệ điều hành KHÔNG bị chặn "
  + "(trình duyệt không có cách nào chặn). Muốn chặn thật, mở bài bằng Ứng dụng trình chiếu an toàn.";

export const PROTECT_NOTICE =
  "Học liệu có bản quyền của trung tâm. Màn hình mang chữ mờ tên bạn, mọi lượt mở đều được ghi nhật ký, "
  + "và thao tác in / tải / chụp màn hình sẽ bị ghi lại (màn hình chỉ bị che khoảng 1,5 giây ngay lúc đó, "
  + "không làm gián đoạn buổi dạy). Không chia sẻ nội dung ra ngoài.";
