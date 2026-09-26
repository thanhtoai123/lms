/**
 * BẢO MẬT CỔNG PHỤ HUYNH — phần logic thuần, để kiểm thử được và chỉ sửa ở một nơi.
 *
 * Cổng `/ph` khác trang quản trị ở chỗ người dùng là phụ huynh: đăng nhập bằng mã một lần,
 * mở trên điện thoại, thường dùng chung máy trong nhà, và thứ họ xem là dữ liệu của trẻ em.
 * Ba việc dưới đây là ba lỗ hổng hay gặp nhất của một cổng như vậy:
 *
 * 1. **Giả mạo yêu cầu từ trang khác (CSRF)** — trang lạ tự gửi POST kèm cookie của phụ huynh.
 *    `nguonHopLe` siết chặt: KHÔNG có `Origin` mà cũng KHÔNG có `Sec-Fetch-Site` thì từ chối,
 *    thay vì tin tưởng như trước.
 * 2. **Phiên sống quá lâu** — máy tính bảng ở nhà mở một lần rồi để đó hàng tháng.
 *    `phienNgungHan` cắt phiên sau 14 ngày không dùng, dù hạn tuyệt đối 30 ngày chưa tới.
 * 3. **Lộ thông tin ở màn "Thiết bị đang đăng nhập"** — dán nguyên chuỗi User-Agent thì
 *    phụ huynh không đọc được, mà lại in ra phiên bản hệ điều hành. `tenThietBi` rút gọn
 *    thành "Chrome trên Android" để người dùng nhận ra máy của mình rồi thu hồi.
 */

/* ------------------------------------------------------------------ */
/* 1. Nguồn gửi yêu cầu                                                */
/* ------------------------------------------------------------------ */

export interface NguonYeuCau {
  /** Header `Origin` (trình duyệt gắn cho mọi POST) */
  origin?: string | null;
  /** Header `Sec-Fetch-Site`: same-origin | same-site | cross-site | none */
  secFetchSite?: string | null;
  /** Host của chính yêu cầu (lấy từ URL) */
  host: string;
  /** Địa chỉ công khai của ứng dụng, nếu chạy sau proxy đổi host */
  appUrl?: string | null;
}

/**
 * Yêu cầu ghi (POST) có đến từ chính cổng này không.
 *
 * Trình duyệt hiện đại luôn gắn `Origin` cho POST và luôn gắn `Sec-Fetch-Site`. Vì vậy:
 * - có `Origin` → phải khớp host của cổng (hoặc khớp `appUrl` khi chạy sau proxy);
 * - không có `Origin` → chỉ chấp nhận khi `Sec-Fetch-Site` là `same-origin` hoặc `none`
 *   (`none` = người dùng tự gõ địa chỉ / mở từ dấu trang);
 * - không có cả hai → từ chối. Đây là điểm khác bản cũ: bản cũ trả `true`, nên một biểu mẫu
 *   ở trang lạ hoặc một máy khách cố tình gỡ header là qua được.
 */
export function nguonHopLe(n: NguonYeuCau): boolean {
  const site = (n.secFetchSite ?? "").toLowerCase();
  if (site === "cross-site" || site === "same-site") return false;
  const origin = (n.origin ?? "").trim();
  if (origin) {
    if (origin === "null") return false;
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      return false;
    }
    if (host === n.host) return true;
    const app = (n.appUrl ?? "").trim();
    if (!app) return false;
    try {
      return new URL(app).host === host;
    } catch {
      return false;
    }
  }
  return site === "same-origin" || site === "none";
}

/* ------------------------------------------------------------------ */
/* 2. Hạn phiên                                                        */
/* ------------------------------------------------------------------ */

/** Hạn tuyệt đối của một phiên phụ huynh (ngày) — đếm từ lúc đăng nhập */
export const PH_PHIEN_NGAY = 30;
/** Không thao tác bao nhiêu ngày thì phiên tự hết, dù hạn tuyệt đối chưa tới */
export const PH_NGUNG_NGAY = 14;

/** Phiên đã ngưng vì lâu không dùng (tính theo lần cuối mở cổng) */
export function phienNgungHan(lastSeenAt: Date | null | undefined, now: Date, ngay = PH_NGUNG_NGAY): boolean {
  if (!lastSeenAt) return false;
  return now.getTime() - lastSeenAt.getTime() > ngay * 86_400_000;
}

/** Số ngày còn lại trước khi phiên tự ngưng (để hiện ở màn Tài khoản) */
export function conLaiTruocNgung(lastSeenAt: Date | null | undefined, now: Date, ngay = PH_NGUNG_NGAY): number {
  if (!lastSeenAt) return ngay;
  const het = lastSeenAt.getTime() + ngay * 86_400_000;
  return Math.max(0, Math.ceil((het - now.getTime()) / 86_400_000));
}

/* ------------------------------------------------------------------ */
/* 3. Tên thiết bị dễ đọc                                              */
/* ------------------------------------------------------------------ */

const TRINH_DUYET: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\b(?:OPR|Opera)\//, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bCocCoc\//, "Cốc Cốc"],
  [/\bFBAV\/|\bFBAN\//, "Facebook"],
  [/\bZalo/i, "Zalo"],
  [/\bCriOS\/|\bChrome\//, "Chrome"],
  [/\bFxiOS\/|\bFirefox\//, "Firefox"],
  [/\bSafari\//, "Safari"],
];

const HE_DIEU_HANH: [RegExp, string][] = [
  [/\biPhone\b/, "iPhone"],
  [/\biPad\b/, "iPad"],
  [/\bAndroid\b/, "Android"],
  [/\bWindows\b/, "Windows"],
  [/\bMac OS X\b|\bMacintosh\b/, "máy Mac"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bLinux\b/, "Linux"],
];

/**
 * Rút chuỗi User-Agent thành tên người đọc được: "Chrome trên Android", "Safari trên iPhone".
 * Cố ý KHÔNG giữ số phiên bản hệ điều hành — phụ huynh không cần, mà in ra thì thừa thông tin.
 */
export function tenThietBi(ua: string | null | undefined): string {
  const s = (ua ?? "").trim();
  if (!s) return "Thiết bị không rõ";
  const tr = TRINH_DUYET.find(([r]) => r.test(s))?.[1] ?? null;
  const os = HE_DIEU_HANH.find(([r]) => r.test(s))?.[1] ?? null;
  if (tr && os) return `${tr} trên ${os}`;
  if (tr) return tr;
  if (os) return `Trình duyệt trên ${os}`;
  return "Thiết bị không rõ";
}

/** Cách đăng nhập, hiện ở màn Tài khoản */
export const PH_CACH_DANG_NHAP_VI: Record<string, string> = {
  otp: "mã qua Zalo",
  code: "mã kích hoạt",
};
