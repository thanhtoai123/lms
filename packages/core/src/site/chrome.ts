/**
 * KHUNG CHUNG CỦA WEBSITE — đầu trang (logo, menu, điện thoại, nút) và chân trang (địa chỉ, liên hệ, chính sách).
 * Lưu MỘT lần ở `app_settings` khoá "site_chrome"; mọi trang của website (trang dựng khối, Tin tức, Tuyển dụng, Học thử…)
 * đều hiển thị cùng khung này, nên sửa menu / địa chỉ chỉ cần sửa một chỗ.
 * Landing quảng cáo (/lp/…) giữ đầu / chân trang riêng.
 */
import { emptySection, cleanText, validUrl, type LandingDoc, type LandingSection } from "../landing/model.js";

export interface ChromeLink { label: string; href: string }
export interface ChromeAddress { label: string; text: string }
export interface SiteChrome {
  phone: string;
  ctaLabel: string;
  ctaUrl: string;
  nav: ChromeLink[];
  tagline: string;
  email: string;
  legal: string;
  copyright: string;
  addresses: ChromeAddress[];
  links: ChromeLink[];
}

export const CHROME_LIMITS = { nav: 6, addresses: 4, links: 12 } as const;

/** Khung mặc định: thông tin liên hệ lấy từ trang hiện tại của trung tâm, menu trỏ tới các trang của website */
export const DEFAULT_CHROME: SiteChrome = {
  phone: "0837 312 860",
  ctaLabel: "Học thử miễn phí",
  ctaUrl: "/dang-ky",
  nav: [
    { label: "Giới thiệu", href: "/gioi-thieu" },
    { label: "Khoá học", href: "/khoa-hoc" },
    { label: "Tin tức", href: "/tin-tuc" },
    { label: "Tuyển dụng", href: "/tuyen-dung" },
    { label: "Liên hệ", href: "/lien-he" },
  ],
  tagline: "Học lập trình robot vui, hiểu bài, tự tin sáng tạo.",
  email: "thongtin@satarobo.vn",
  legal: "Công ty Cổ phần Công nghệ Giáo dục Sata Robo · Mã số doanh nghiệp 0402301783",
  copyright: "© 2026 Sata Robo",
  addresses: [{ label: "Cơ sở 1", text: "211 Nguyễn Hữu Thọ, Đà Nẵng" }, { label: "Cơ sở 2", text: "114 Hoàng Diệu, Đà Nẵng" }],
  links: [
    { label: "Chính sách bảo mật", href: "/chinh-sach/bao-mat" },
    { label: "Điều khoản sử dụng", href: "/chinh-sach/dieu-khoan" },
  ],
};

const rows = <T,>(raw: unknown, max: number, pick: (r: Record<string, unknown>) => T, keep: (v: T) => boolean): T[] =>
  (Array.isArray(raw) ? raw : []).filter((r): r is Record<string, unknown> => !!r && typeof r === "object").map(pick).filter(keep).slice(0, max);

/** Đọc dữ liệu lưu / người dùng gửi thành SiteChrome đúng hình dạng (cắt chuỗi, bỏ dòng rỗng). Không kiểm liên kết. */
export function normalizeChrome(raw: unknown): SiteChrome {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!r) return structuredClone(DEFAULT_CHROME);
  const link = (x: Record<string, unknown>): ChromeLink => ({ label: cleanText(x.label, 30), href: cleanText(x.href, 400) });
  return {
    phone: cleanText(r.phone, 24),
    ctaLabel: cleanText(r.ctaLabel, 40),
    ctaUrl: cleanText(r.ctaUrl, 400),
    nav: rows(r.nav, CHROME_LIMITS.nav, link, (l) => !!l.label || !!l.href),
    tagline: cleanText(r.tagline, 200),
    email: cleanText(r.email, 120),
    legal: cleanText(r.legal, 400),
    copyright: cleanText(r.copyright, 120),
    addresses: rows(r.addresses, CHROME_LIMITS.addresses, (x) => ({ label: cleanText(x.label, 60), text: cleanText(x.text, 200) }), (a) => !!a.label || !!a.text),
    links: rows(r.links, CHROME_LIMITS.links, (x) => ({ label: cleanText(x.label, 40), href: cleanText(x.href, 400) }), (l) => !!l.label || !!l.href),
  };
}

/** Lỗi chặn lưu (tiếng Việt, nói rõ ô nào) */
export function validateChrome(c: SiteChrome): string[] {
  const e: string[] = [];
  if (!c.ctaLabel) e.push("Nút đầu trang: cần chữ trên nút");
  if (!c.ctaUrl) e.push("Nút đầu trang: cần liên kết");
  else if (!validUrl(c.ctaUrl)) e.push("Nút đầu trang: liên kết phải là https://, đường dẫn /…, #mốc, tel: hoặc mailto:");
  if (c.email && !/^[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+$/.test(c.email)) e.push("Email chân trang không đúng dạng");
  c.nav.forEach((l, i) => {
    if (!l.label || !l.href) e.push(`Menu #${i + 1}: cần cả tên và liên kết`);
    else if (!validUrl(l.href)) e.push(`Menu #${i + 1}: liên kết không hợp lệ`);
  });
  c.addresses.forEach((a, i) => { if (!a.label || !a.text) e.push(`Cơ sở #${i + 1}: cần cả tên và địa chỉ`); });
  c.links.forEach((l, i) => {
    if (!l.label || !l.href) e.push(`Liên kết chân trang #${i + 1}: cần cả tên và liên kết`);
    else if (!validUrl(l.href)) e.push(`Liên kết chân trang #${i + 1}: liên kết không hợp lệ`);
  });
  return e;
}

function headerOf(c: SiteChrome): LandingSection {
  const s = emptySection("header", "header");
  s.data = { phone: c.phone, ctaLabel: c.ctaLabel, ctaUrl: c.ctaUrl };
  s.lists = { nav: c.nav.map((l) => ({ ...l })) };
  return s;
}
function footerOf(c: SiteChrome): LandingSection {
  const s = emptySection("footer", "footer");
  s.data = { tagline: c.tagline, email: c.email, phone: c.phone, legal: c.legal, copyright: c.copyright };
  s.lists = { addresses: c.addresses.map((a) => ({ ...a })), links: c.links.map((l) => ({ ...l })) };
  return s;
}

/** Hai khối đầu / chân trang dựng từ khung chung (dùng cho trang không phải trang dựng khối) */
export function chromeSections(c: SiteChrome): { header: LandingSection; footer: LandingSection } {
  return { header: headerOf(c), footer: footerOf(c) };
}

/** Thay đầu / chân trang của một trang bằng khung chung (giữ nguyên các khối ở giữa) */
export function applyChrome(doc: LandingDoc, c: SiteChrome): LandingDoc {
  const { header, footer } = chromeSections(c);
  const middle = doc.sections.filter((s) => s.type !== "header" && s.type !== "footer");
  const oldHeader = doc.sections.find((s) => s.type === "header");
  const oldFooter = doc.sections.find((s) => s.type === "footer");
  return { sections: [{ ...header, id: oldHeader?.id ?? header.id }, ...middle, { ...footer, id: oldFooter?.id ?? footer.id }] };
}
