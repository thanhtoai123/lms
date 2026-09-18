/**
 * NƠI DUY NHẤT định nghĩa header bảo mật của ứng dụng web.
 *
 * Trước đây CSP nằm trong `apps/web/next.config.ts` với `script-src 'self' 'unsafe-inline'`.
 * `'unsafe-inline'` vô hiệu hoá gần hết giá trị của CSP trước XSS: chỉ cần chèn được một thẻ
 * `<script>` vào trang quản trị là đọc được cookie phiên nhân sự. Nay mỗi yêu cầu sinh một
 * **nonce** riêng; chỉ script mang đúng nonce đó mới chạy.
 *
 * Toàn bộ hàm ở đây là hàm thuần (không đụng `process`, không đụng mạng) để kiểm thử được;
 * nơi gọi (proxy của Next) tự sinh nonce và tự đọc biến môi trường.
 */

/* ------------------------------------------------------------------ */
/* Nonce                                                               */
/* ------------------------------------------------------------------ */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 chuẩn, không phụ thuộc `Buffer` hay `btoa` (chạy được cả ở Edge runtime) */
export function base64Encode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 0b11) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? "=" : B64[((b1 & 0b1111) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? "=" : B64[b2 & 0b111111];
  }
  return out;
}

/** Số byte ngẫu nhiên cho một nonce — 16 byte = 128 bit, thừa sức chống đoán */
export const NONCE_BYTES = 16;

/** Dựng nonce từ chuỗi byte ngẫu nhiên (tách riêng để kiểm thử được bằng byte cố định) */
export function nonceFromBytes(bytes: Uint8Array): string {
  return base64Encode(bytes);
}

/**
 * Sinh nonce mới cho MỘT yêu cầu. Dùng `crypto.getRandomValues` (có ở Node 22 và Edge).
 * Không có nguồn ngẫu nhiên an toàn thì ném lỗi — thà hỏng rõ ràng còn hơn phát nonce đoán được.
 */
export function generateNonce(random?: (b: Uint8Array) => void): string {
  const bytes = new Uint8Array(NONCE_BYTES);
  if (random) random(bytes);
  else {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (!c?.getRandomValues) throw new Error("Không có crypto.getRandomValues để sinh nonce CSP");
    c.getRandomValues(bytes);
  }
  return nonceFromBytes(bytes);
}

/** Nonce hợp lệ theo ngữ pháp CSP (base64-value) và đủ dài để không đoán được */
export function isValidNonce(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9+/_-]{16,}={0,2}$/.test(value);
}

/* ------------------------------------------------------------------ */
/* Content-Security-Policy                                             */
/* ------------------------------------------------------------------ */

export interface CspOptions {
  /** Nonce của yêu cầu này; thiếu nonce thì `script-src` chỉ còn `'self'` */
  nonce?: string | null;
  /** Môi trường phát triển: React refresh cần `'unsafe-eval'` */
  dev?: boolean;
  /** Miền Supabase (REST + realtime) cho `connect-src` */
  supabaseUrl?: string | null;
  /**
   * `'strict-dynamic'`: script đã được tin (mang nonce) được phép nạp tiếp script con.
   * Next.js nạp các mảnh JS (chunk) bằng cách tự tạo thẻ `<script>` lúc chạy — không có
   * `'strict-dynamic'` thì những mảnh đó bị chặn và **trang trắng**. Mặc định BẬT.
   */
  strictDynamic?: boolean;
  /**
   * ĐƯỜNG THOÁT: bật lại `'unsafe-inline'` cho `script-src`. Chỉ dùng khi bản vá nonce
   * làm hỏng giao diện ở môi trường thật và cần mở gấp trong lúc điều tra.
   */
  allowUnsafeInlineScripts?: boolean;
  /** Ai được nhúng trang này vào iframe — mặc định `'self'` */
  frameAncestors?: string;
  /** Nguồn thêm (phân tách bằng khoảng trắng) khi gắn công cụ bên thứ ba */
  extraScriptSrc?: string;
  extraConnectSrc?: string;
  extraImgSrc?: string;
  extraFrameSrc?: string;
  extraStyleSrc?: string;
  /** Điểm nhận báo cáo vi phạm (`report-uri`), nếu có */
  reportUri?: string | null;
}

const clean = (s?: string | null) =>
  (s ?? "")
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * `style-src` VẪN GIỮ `'unsafe-inline'`.
 *
 * Lý do: Next.js + Tailwind v4 + `next/font` chèn `<style>` nội tuyến và thuộc tính `style=`
 * ở rất nhiều chỗ (biến CSS của font, style tính theo dữ liệu trong bảng/biểu đồ). React
 * KHÔNG gắn nonce cho thuộc tính `style=`, nên bỏ `'unsafe-inline'` ở `style-src` sẽ vỡ
 * giao diện mà **không** đổi được gì về rủi ro chính: chiếm phiên đăng nhập cần chạy được
 * *script*, mà đường đó đã bị nonce chặn. Rủi ro còn lại của CSS nội tuyến là giả mạo giao diện
 * (UI redressing) — đã chặn bằng `frame-ancestors` và `X-Frame-Options`.
 */
const STYLE_UNSAFE_INLINE = "'unsafe-inline'";

/** Dựng chuỗi CSP cho một yêu cầu */
export function buildCsp(o: CspOptions = {}): string {
  const nonce = isValidNonce(o.nonce) ? o.nonce : null;
  const strictDynamic = o.strictDynamic ?? true;

  const script = ["'self'"];
  if (nonce) script.push(`'nonce-${nonce}'`);
  // `'strict-dynamic'` chỉ có nghĩa khi đã có nonce
  if (nonce && strictDynamic) script.push("'strict-dynamic'");
  if (o.allowUnsafeInlineScripts) script.push("'unsafe-inline'");
  if (o.dev) script.push("'unsafe-eval'");
  script.push(...clean(o.extraScriptSrc));

  const supabase = (o.supabaseUrl ?? "").trim();
  const connect = ["'self'"];
  if (supabase) connect.push(supabase, supabase.replace(/^https:/, "wss:"));
  connect.push(...clean(o.extraConnectSrc));

  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["base-uri", ["'self'"]],
    ["object-src", ["'none'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", clean(o.frameAncestors).length ? clean(o.frameAncestors) : ["'self'"]],
    ["script-src", script],
    // `script-src-attr 'none'`: chặn hẳn `onclick="…"` — nonce không bảo vệ được thuộc tính sự kiện
    ["script-src-attr", ["'none'"]],
    ["style-src", ["'self'", STYLE_UNSAFE_INLINE, ...clean(o.extraStyleSrc)]],
    ["img-src", ["'self'", "data:", "blob:", "https:", ...clean(o.extraImgSrc)]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", connect],
    ["worker-src", ["'self'", "blob:"]],
    ["frame-src", ["'self'", "https://www.youtube-nocookie.com", "https://drive.google.com", ...clean(o.extraFrameSrc)]],
    ["media-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["upgrade-insecure-requests", []],
  ];
  const parts = directives.map(([k, v]) => (v.length ? `${k} ${v.join(" ")}` : k));
  if (o.reportUri) parts.push(`report-uri ${o.reportUri}`);
  return parts.join("; ");
}

/** CSP cho các phản hồi KHÔNG phải trang HTML (route handler trả JSON / tệp) */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/* ------------------------------------------------------------------ */
/* Bộ header bảo mật đầy đủ                                            */
/* ------------------------------------------------------------------ */

export interface SecurityHeaderOptions extends CspOptions {
  /** `Strict-Transport-Security` tính bằng giây — mặc định 2 năm */
  hstsMaxAge?: number;
  /** Có gửi `preload` trong HSTS không (chỉ bật khi đã đăng ký danh sách preload) */
  hstsPreload?: boolean;
  /** Gửi CSP ở chế độ chỉ báo cáo (không cưỡng chế) — dùng khi chạy thử bản vá nonce */
  reportOnly?: boolean;
  /** `Cross-Origin-Embedder-Policy` — mặc định KHÔNG đặt (dễ vỡ ảnh/iframe bên thứ ba) */
  coep?: string | null;
}

/** Tên header CSP theo chế độ cưỡng chế / chỉ báo cáo */
export const cspHeaderName = (reportOnly?: boolean) =>
  reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";

/**
 * Những header BẮT BUỘC phải có trên mọi phản hồi trang.
 * Có bài kiểm thử ghim danh sách này — thêm/bớt phải sửa test một cách có ý thức.
 */
export const REQUIRED_SECURITY_HEADERS = [
  "Content-Security-Policy",
  "Strict-Transport-Security",
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Referrer-Policy",
  "Permissions-Policy",
  "Cross-Origin-Opener-Policy",
  "Cross-Origin-Resource-Policy",
] as const;

/** Chính sách quyền thiết bị: chỉ mở camera (quét mã QR điểm danh) và định vị (chấm công) cho chính trang */
export const PERMISSIONS_POLICY =
  "accelerometer=(), autoplay=(), camera=(self), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(self), gyroscope=(), interest-cohort=(), magnetometer=(), microphone=(), midi=(), payment=(), publickey-credentials-get=(self), screen-wake-lock=(), usb=(), xr-spatial-tracking=()";

/**
 * Bộ header bảo mật cho một phản hồi TRANG. Trả về mảng cặp `[tên, giá trị]`
 * để nơi gọi tự đưa vào `Headers` / cấu hình Next.
 */
export function securityHeaders(o: SecurityHeaderOptions = {}): [string, string][] {
  const maxAge = Math.max(0, Math.floor(o.hstsMaxAge ?? 63_072_000));
  const out: [string, string][] = [
    [cspHeaderName(o.reportOnly), buildCsp(o)],
    ["Strict-Transport-Security", `max-age=${maxAge}; includeSubDomains${o.hstsPreload ? "; preload" : ""}`],
    ["X-Content-Type-Options", "nosniff"],
    // Giữ cả X-Frame-Options cho trình duyệt cũ chưa hiểu frame-ancestors
    ["X-Frame-Options", clean(o.frameAncestors).includes("'none'") ? "DENY" : "SAMEORIGIN"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["Permissions-Policy", PERMISSIONS_POLICY],
    ["Cross-Origin-Opener-Policy", "same-origin"],
    // same-site (không same-origin): ảnh lớp / tài liệu vẫn nhúng được giữa các miền con của hệ thống
    ["Cross-Origin-Resource-Policy", "same-site"],
    ["X-DNS-Prefetch-Control", "off"],
  ];
  if (o.coep) out.push(["Cross-Origin-Embedder-Policy", o.coep]);
  return out;
}

/* ------------------------------------------------------------------ */
/* Đọc cấu hình từ biến môi trường                                     */
/* ------------------------------------------------------------------ */

export interface CspEnv {
  NODE_ENV?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  /** `1` → chỉ báo cáo, không cưỡng chế (chạy thử bản vá nonce trước khi siết thật) */
  CSP_REPORT_ONLY?: string;
  /** ĐƯỜNG THOÁT: `1` → bật lại `'unsafe-inline'` cho script (mở gấp khi trang trắng) */
  CSP_ALLOW_UNSAFE_INLINE?: string;
  /** `0` → tắt `'strict-dynamic'` (chỉ khi chắc chắn Next đã gắn nonce cho mọi thẻ script) */
  CSP_STRICT_DYNAMIC?: string;
  CSP_SCRIPT_SRC_EXTRA?: string;
  CSP_CONNECT_SRC_EXTRA?: string;
  CSP_IMG_SRC_EXTRA?: string;
  CSP_FRAME_SRC_EXTRA?: string;
  CSP_STYLE_SRC_EXTRA?: string;
  CSP_FRAME_ANCESTORS?: string;
  CSP_REPORT_URI?: string;
  HSTS_MAX_AGE?: string;
  HSTS_PRELOAD?: string;
}

const on = (v?: string) => v === "1" || v === "true";
const off = (v?: string) => v === "0" || v === "false";

/** Gom cấu hình header từ biến môi trường (nơi duy nhất đọc `process.env` cho phần header) */
export function securityHeaderOptions(env: CspEnv, nonce?: string | null): SecurityHeaderOptions {
  const maxAge = Number(env.HSTS_MAX_AGE);
  return {
    nonce: nonce ?? null,
    dev: env.NODE_ENV === "development",
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    strictDynamic: !off(env.CSP_STRICT_DYNAMIC),
    allowUnsafeInlineScripts: on(env.CSP_ALLOW_UNSAFE_INLINE),
    reportOnly: on(env.CSP_REPORT_ONLY),
    frameAncestors: env.CSP_FRAME_ANCESTORS,
    extraScriptSrc: env.CSP_SCRIPT_SRC_EXTRA,
    extraConnectSrc: env.CSP_CONNECT_SRC_EXTRA,
    extraImgSrc: env.CSP_IMG_SRC_EXTRA,
    extraFrameSrc: env.CSP_FRAME_SRC_EXTRA,
    extraStyleSrc: env.CSP_STYLE_SRC_EXTRA,
    reportUri: env.CSP_REPORT_URI ?? null,
    hstsMaxAge: Number.isFinite(maxAge) && maxAge > 0 ? maxAge : undefined,
    hstsPreload: on(env.HSTS_PRELOAD),
  };
}

/**
 * Tên header mà Next.js đọc trên **YÊU CẦU** để lấy nonce rồi gắn vào các thẻ `<script>`
 * do chính nó sinh ra (bootstrap, dữ liệu RSC, các mảnh JS).
 * Proxy phải đặt header này lên request, không chỉ lên response.
 */
export const NEXT_NONCE_REQUEST_HEADER = "content-security-policy";
/** Header phụ để React Server Component đọc lại nonce khi cần render `<script>` của riêng mình */
export const NONCE_REQUEST_HEADER = "x-nonce";
