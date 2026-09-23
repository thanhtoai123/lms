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
 *     in giấy, PrintScreen;
 *  3) TRUY NGUỒN: chữ mờ mang TÊN + SỐ ĐIỆN THOẠI/EMAIL + GIỜ của chính người đang xem, đổi vị trí
 *     liên tục; ảnh lọt ra ngoài là biết ngay của ai;
 *  4) GHI NHẬN: mỗi lần mở và mỗi thao tác nghi vấn (in, PrintScreen, mở DevTools…) đều vào nhật ký
 *     để quản trị xem "ai đang cố sao chép", xử lý bằng quy định nội bộ — đó mới là lớp bảo vệ thật.
 */

/** Các loại thao tác nghi vấn sao chép mà trình duyệt CÓ THỂ nhận biết */
export const CAPTURE_KINDS = ["print", "screenshot_key", "copy", "context_menu", "devtools", "download"] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];

export const CAPTURE_KIND_VI: Record<CaptureKind, string> = {
  print: "Bấm In (Ctrl+P)",
  screenshot_key: "Bấm phím chụp màn hình",
  copy: "Chép nội dung",
  context_menu: "Mở menu chuột phải",
  devtools: "Mở công cụ nhà phát triển",
  download: "Cố tải tệp về",
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
  /** Làm mờ nội dung khi cửa sổ mất tiêu điểm (chống công cụ chụp nền) */
  blurOnBlur: boolean;
  /** Ghi nhật ký thao tác nghi vấn */
  logCapture: boolean;
}

export const PROTECT_DEFAULTS: ProtectOptions = { watermark: true, noDownload: true, blurOnBlur: true, logCapture: true };

/** Câu giải thích hiện dưới khung xem — nói đúng điều hệ thống làm được và không làm được */
export const PROTECT_NOTICE =
  "Học liệu có bản quyền của trung tâm. Màn hình mang chữ mờ tên bạn và mọi lượt mở đều được ghi nhật ký; "
  + "thao tác in, tải hoặc chụp màn hình sẽ bị ghi lại. Không chia sẻ nội dung ra ngoài.";
