/**
 * Nhận diện thương hiệu: màu chủ đạo + màu nhấn + logo.
 *
 * Quản trị tối cao chọn MỘT màu chủ đạo (thường lấy từ logo) và một màu nhấn; hệ thống tự dựng cả bảng
 * màu (đậm hơn, nhạt hơn, nền mờ, màu chữ đủ tương phản) rồi ghi đè các biến CSS ở globals.css. Toàn bộ
 * giao diện (quản trị, giáo viên, phụ huynh, đăng nhập) dùng các biến này nên đổi một nơi là đổi cả hệ.
 *
 * Mọi hàm ở đây thuần tuý (không đụng DOM / CSDL) để kiểm thử và dùng được cả ở máy chủ lẫn trình duyệt.
 */

export interface BrandColors { primary: string; accent: string }

/** Tím + cam của Sata Robo — màu mặc định khi chưa cấu hình (khớp globals.css) */
export const BRAND_DEFAULT_COLORS: BrandColors = { primary: "#610b8a", accent: "#ff8f2d" };

export const BRAND_LOGO_MAX = 1024 * 1024;
export const BRAND_LOGO_MIME: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };

const HEX = /^#[0-9a-f]{6}$/i;

export const isHexColor = (s: unknown): s is string => typeof s === "string" && HEX.test(s.trim());

/** #abc / abc / #aabbcc → #aabbcc (chữ thường); không hợp lệ → null */
export function normalizeHex(s: string | null | undefined): string | null {
  if (!s) return null;
  let v = s.trim().toLowerCase();
  if (v.startsWith("#")) v = v.slice(1);
  if (/^[0-9a-f]{3}$/.test(v)) v = v.split("").map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/.test(v) ? `#${v}` : null;
}

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = normalizeHex(hex) ?? "#000000";
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

export function rgbToHex([r, g, b]: RGB): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Trộn `a` với `b` theo tỉ lệ t (0 = giữ nguyên a, 1 = hoàn toàn b) */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** Độ sáng tương đối theo WCAG 2.x */
export function luminance(hex: string): number {
  const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Tỉ lệ tương phản WCAG (1–21) */
export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Chữ trắng hay chữ tối đọc rõ hơn trên nền `bg` */
export function readableOn(bg: string, dark = "#171717"): string {
  return contrast(bg, "#ffffff") >= contrast(bg, dark) ? "#ffffff" : dark;
}

/** Tối dần `hex` (trộn với đen) cho tới khi đủ tương phản `min` trên nền `on` — dùng cho chữ / liên kết màu thương hiệu */
export function inkFor(hex: string, on = "#ffffff", min = 4.5): string {
  let c = hex;
  for (let i = 0; i < 24 && contrast(c, on) < min; i++) c = mix(c, "#000000", 0.08);
  return c;
}

const alpha = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`;

/** Tên biến CSS → giá trị, dựng từ màu chủ đạo và màu nhấn */
export function buildPalette(colors: BrandColors): Record<string, string> {
  const p = normalizeHex(colors.primary) ?? BRAND_DEFAULT_COLORS.primary;
  const a = normalizeHex(colors.accent) ?? BRAND_DEFAULT_COLORS.accent;
  const ink = inkFor(p);
  const accentInk = inkFor(a);
  return {
    "--primary": p,
    "--primary-foreground": readableOn(p),
    "--primary-dark": mix(p, "#000000", 0.2),
    "--primary-darker": mix(p, "#000000", 0.4),
    "--primary-soft": alpha(p, 0.1),
    "--primary-soft-hover": alpha(p, 0.18),
    "--primary-ink": ink,
    "--primary-ink-hover": mix(ink, "#000000", 0.2),
    "--ring": p,
    "--brand-50": mix(p, "#ffffff", 0.94),
    "--brand-100": mix(p, "#ffffff", 0.86),
    "--brand-200": mix(p, "#ffffff", 0.72),
    "--brand-300": mix(p, "#ffffff", 0.5),
    "--brand-400": mix(p, "#ffffff", 0.22),
    "--brand-500": mix(p, "#ffffff", 0.08),
    "--brand-900": mix(p, "#000000", 0.72),
    "--parent": p,
    "--accent": a,
    "--accent-dark": mix(a, "#000000", 0.1),
    "--accent-soft": alpha(a, 0.12),
    "--accent-ink": accentInk,
    "--accent-foreground": readableOn(a, "#241a2e"),
    "--accent-50": mix(a, "#ffffff", 0.94),
    "--accent-100": mix(a, "#ffffff", 0.86),
    "--accent-200": mix(a, "#ffffff", 0.7),
    "--accent-500": a,
    "--accent-600": mix(a, "#000000", 0.06),
    "--accent-700": accentInk,
    "--student": a,
  };
}

/** Khối CSS ghi đè — áp cho cả :root và .admin-scope (khu quản trị khai lại một số biến). Độ ưu tiên cao hơn globals.css để thắng bất kể thứ tự nạp. */
export function brandCss(colors: BrandColors): string {
  const body = Object.entries(buildPalette(colors)).map(([k, v]) => `${k}:${v}`).join(";");
  return `html:root,.admin-scope.admin-scope{${body}}`;
}

/** Lỗi nhập màu (rỗng = hợp lệ). Cảnh báo tương phản KHÔNG chặn lưu vì hệ thống tự làm đậm chữ cho đọc được. */
export function validateBrandColors(c: BrandColors): string[] {
  const e: string[] = [];
  if (!normalizeHex(c.primary)) e.push("Màu chủ đạo phải dạng #RRGGBB");
  if (!normalizeHex(c.accent)) e.push("Màu nhấn phải dạng #RRGGBB");
  return e;
}

/** Cảnh báo (không chặn): màu quá nhạt làm nút khó đọc / quá giống nền */
export function brandColorWarnings(c: BrandColors): string[] {
  const w: string[] = [];
  const p = normalizeHex(c.primary);
  if (p) {
    if (contrast(p, "#ffffff") < 3 && contrast(p, "#171717") < 3) w.push("Màu chủ đạo ở vùng khó đọc cả chữ trắng lẫn chữ tối — nên chọn màu đậm hơn hoặc nhạt hơn");
    else if (luminance(p) > 0.75) w.push("Màu chủ đạo rất nhạt: nút dùng chữ tối, đường viền và liên kết sẽ được làm đậm tự động");
  }
  const a = normalizeHex(c.accent);
  if (p && a && contrast(p, a) < 1.3) w.push("Màu nhấn quá gần màu chủ đạo, khó phân biệt");
  return w;
}

/** Lấy màu nổi bật nhất từ điểm ảnh RGBA của logo: bỏ điểm trong suốt, gần trắng, gần đen và xám nhạt */
export function dominantColor(pixels: ArrayLike<number>): string | null {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i]!, g = pixels[i + 1]!, b = pixels[i + 2]!, al = pixels[i + 3]!;
    if (al < 200) continue;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 238 && mn > 238) continue; // trắng
    if (mx < 28) continue; // đen
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    if (sat < 0.22) continue; // xám
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bk = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bk.n += 1; bk.r += r; bk.g += g; bk.b += b;
    buckets.set(key, bk);
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const b of buckets.values()) if (!best || b.n > best.n) best = b;
  return best ? rgbToHex([best.r / best.n, best.g / best.n, best.b / best.n]) : null;
}

/** Gợi ý màu nhấn: đối màu (xoay 180° sắc độ) của màu chủ đạo, giữ độ bão hoà vừa phải */
export function suggestAccent(primary: string): string {
  const [r, g, b] = hexToRgb(primary).map((v) => v / 255) as RGB;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const hh = (h + 180) % 360, s = 0.9, l = 0.56;
  const k = (n: number) => (n + hh / 30) % 12;
  const aa = s * Math.min(l, 1 - l);
  const f = (n: number) => l - aa * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

/** SVG tải lên: chỉ cho hình tĩnh. Chặn script, sự kiện, tài liệu nhúng và tham chiếu ra ngoài. Trả lý do từ chối hoặc null nếu hợp lệ. */
export function svgUnsafeReason(text: string): string | null {
  if (!/<svg[\s>]/i.test(text)) return "Tệp không phải SVG hợp lệ";
  if (/<script/i.test(text)) return "SVG chứa mã script";
  if (/<(foreignObject|iframe|embed|object|audio|video|animate|set)\b/i.test(text)) return "SVG chứa thành phần nhúng / động không được phép";
  if (/\son[a-z]+\s*=/i.test(text)) return "SVG chứa thuộc tính sự kiện";
  if (/javascript:|data:text\/html|<!ENTITY|<!DOCTYPE[^>]*\[/i.test(text)) return "SVG chứa liên kết / khai báo không an toàn";
  if (/(?:xlink:)?href\s*=\s*["'](?!#)/i.test(text)) return "SVG tham chiếu tới tài nguyên bên ngoài";
  if (/url\(\s*["']?(?!#)/i.test(text)) return "SVG tham chiếu tới tài nguyên bên ngoài";
  return null;
}
