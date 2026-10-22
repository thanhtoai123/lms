/**
 * HIỂN THỊ LANDING → HTML (thuần, không React, không DOM).
 *
 * MỘT nguồn dùng cho cả hai nơi: trang công khai `/lp/<đường-dẫn>` (mode "page") và tệp HTML tĩnh để đưa lên
 * host khác (mode "export"). Mọi chữ do người dùng nhập đều qua `escHtml()`; ảnh / liên kết đã qua `validImage` / `validUrl`;
 * không có <script> nào trong HTML sinh ra (trang công khai có CSP theo nonce) — tương tác (form, gắn UTM) do
 * thành phần React của apps/web lo. Xem docs/LANDING-PAGE.md.
 */
import { renderMarkdown } from "../growth/rules.js";
import { rowsOf, sectionVisible, validImage, validUrl, type LandingDoc, type LandingSection, type LandingVariant } from "./model.js";
import { mediaSize } from "./media.js";

export interface RenderBrand {
  name: string;
  logoUrl: string;
  /** Logo ngang chính thức (nền sáng / nền Midnight Navy). Có thì đầu trang hiện logo này thay cho biểu tượng + tên; chân trang dùng bản chữ trắng */
  lockupUrl?: string | null;
  lockupOnDarkUrl?: string | null;
  /** Biến màu từ `buildPalette()` — gắn thẳng vào phần tử gốc nên trang xuất ra host khác vẫn đúng màu */
  palette: Record<string, string>;
}
export interface RenderCtx {
  slug: string;
  brand: RenderBrand;
  variant: LandingVariant;
  /** "page" = trang công khai trên hệ thống; "export" = tệp HTML độc lập */
  mode: "page" | "export";
  /** Chỉ cho export: địa chỉ hệ thống (https://…, không dấu / cuối) để liên kết / ảnh nội bộ và form trỏ về đúng */
  baseUrl?: string;
  /** Liên kết của logo / tên thương hiệu ở đầu trang. Mặc định "#top" (cuộn lên đầu trang); trang con của website dùng "/" */
  homeHref?: string;
  /**
   * Biến thể theo chuyên ngành (`?nganh=<mã>` trên trang chính, dùng cho quảng cáo): mở sẵn tab của khối "Chuyên ngành",
   * đổi tiêu đề lớn sang `headline` và chọn sẵn chuyên ngành trong form. Mã không khớp tab nào → bỏ qua.
   */
  focus?: string;
}

/**
 * Phần "form" do thành phần React dựng khung (<section class="lp-sec lp-form" id="dang-ky"><div class="lp-wrap lp-form-in">…)
 * vì form tương tác không nằm trong chuỗi HTML; `head` là phần tiêu đề đã escape.
 */
export type LandingPart =
  | { kind: "html"; html: string }
  /** `compact`: form gọn 4 ô (trang có khối "Mở đầu + form"); `interest`: chuyên ngành chọn sẵn */
  | { kind: "form"; sectionId: string; thankYou: string; head: string; alt: boolean; compact: boolean; interest: string }
  /** Khối "Mở đầu + form": `left` = cột chữ (đã escape), `pic` = ảnh, `formHead` = tiêu đề form */
  | { kind: "leadHero"; sectionId: string; left: string; pic: string; formHead: string; thankYou: string; interest: string };

export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const text = (s: string) => escHtml(s).replace(/\n/g, "<br />");
/** Tiêu đề: *cụm từ* → chữ nhấn màu (DESIGN.md: một cụm mỗi tiêu đề); dấu sao không bao giờ hiện ra */
const hl = (s: string) => escHtml(s).replace(/\*([^*]{1,80})\*/, '<em class="lp-hl">$1</em>').replace(/\*/g, "");

/** Liên kết an toàn để đưa vào href; không hợp lệ → "#" */
function href(ctx: RenderCtx, v: string): string {
  if (!v || !validUrl(v)) return "#";
  if (ctx.mode === "export" && v.startsWith("/") && ctx.baseUrl) return ctx.baseUrl + v;
  return v;
}
function src(ctx: RenderCtx, v: string): string {
  if (!v || !validImage(v)) return "";
  if (ctx.mode === "export" && v.startsWith("/") && ctx.baseUrl) return ctx.baseUrl + v;
  return v;
}
/**
 * Thẻ ảnh: có width/height (ảnh đi kèm ứng dụng) để không nhảy bố cục; ảnh đầu trang tải ngay + ưu tiên cao (LCP),
 * ảnh còn lại tải lười.
 */
function imgTag(ctx: RenderCtx, v: string, alt: string, o: { eager?: boolean; cls?: string; sizes?: string } = {}): string {
  const u = src(ctx, v);
  if (!u) return "";
  const dim = mediaSize(v);
  // Ảnh có bản nhỏ "<tên>-800.webp" đi kèm → srcset để điện thoại tải bản nhẹ
  const small = /\.webp$/.test(v) ? v.replace(/\.webp$/, "-800.webp") : "";
  const sdim = small ? mediaSize(small) : null;
  const srcset = dim && sdim && o.sizes ? ` srcset="${escHtml(src(ctx, small))} ${sdim[0]}w, ${escHtml(u)} ${dim[0]}w"` : "";
  return `<img${o.cls ? ` class="${o.cls}"` : ""} src="${escHtml(u)}"${srcset} alt="${escHtml(alt)}"`
    + (dim ? ` width="${dim[0]}" height="${dim[1]}"` : "")
    + (o.eager ? ` fetchpriority="high"` : ` loading="lazy"`) + ` decoding="async"`
    + (o.sizes ? ` sizes="${o.sizes}"` : "") + ` />`;
}
function external(h: string): string { return /^https:\/\//.test(h) ? ' target="_blank" rel="noopener"' : ""; }

function btn(ctx: RenderCtx, label: string, url: string, kind: "primary" | "ghost" | "light" | "outline", cls = ""): string {
  if (!label || !url) return "";
  const h = href(ctx, url);
  return `<a class="lp-btn lp-btn-${kind} ${cls}" href="${escHtml(h)}" data-cta="1"${external(h)}>${escHtml(label)}</a>`;
}


/* ---------------------------- biểu tượng nét (24×24, cùng một kiểu) ---------------------------- */
const ICONS: Record<string, string> = {
  "man-hinh": '<rect x="3" y="4" width="18" height="12" rx="2"/><circle cx="12" cy="9" r="2.2"/><path d="M8.5 14c.6-1.6 2-2.4 3.5-2.4s2.9.8 3.5 2.4M8 20l4-4 4 4"/>',
  nhom: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2c3 .2 5.5 2.6 5.5 5.8"/>',
  mat: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  chuan: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  nha: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  "ho-so": '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M8 13h8M8 16h5"/>',
  "tia-sang": '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3"/>',
  "la-ban": '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12"/>',
  cup: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M9 20h6"/>',
  "chia-se": '<path d="M4 5h16v10H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  "ten-lua": '<path d="M12 3c3 2 4.5 5 4.5 9l-2 4h-5l-2-4C7.5 8 9 5 12 3z"/><circle cx="12" cy="10" r="1.8"/><path d="M9.5 16l-2.5 3M14.5 16l2.5 3M12 17v4"/>',
  robot: '<rect x="4.5" y="8" width="15" height="11" rx="3"/><path d="M12 4.5V8M9 13h.01M15 13h.01M9.5 16h5M2.5 12.5v2.5M21.5 12.5v2.5"/><circle cx="12" cy="3.6" r="1.1"/>',
  ai: '<rect x="6" y="6" width="12" height="12" rx="2.5"/><path d="M9.5 9.5h5v5h-5zM9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/>',
  "co-ve": '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.9 0-1.3-1-1.6-1-2.8 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.2 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7" r="1.2"/>',
};
/** Biểu tượng mặc định của thẻ chuyên ngành theo mã tab */
const TRACK_ICON: Record<string, string> = { robotics: "robot", ai: "ai", "do-hoa": "co-ve", "lap-trinh": "code" };
const svgIcon = (name: string, size = 26) => ICONS[name] ? `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>` : "";
/** Ô biểu tượng (màu xoay vòng xanh dương / xanh ngọc / vàng); mã lạ → số thứ tự như cũ */
function iconTile(name: string | undefined, i: number): string {
  const p = ICONS[(name ?? "").trim()];
  if (!p) return `<span class="lp-num">${i + 1}</span>`;
  return `<span class="lp-ico lp-ico-${i % 3}" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg></span>`;
}
export const LANDING_ICON_NAMES: readonly string[] = Object.keys(ICONS);

const d = (s: LandingSection, k: string) => s.data[k] ?? "";
function head(s: LandingSection, ctx: RenderCtx, extra = ""): string {
  const title = d(s, "title");
  const intro = d(s, "intro");
  if (!title && !intro) return "";
  void ctx;
  return `<header class="lp-head${extra}">${title ? `<h2>${hl(title)}</h2>` : ""}${intro ? `<p>${text(intro)}</p>` : ""}</header>`;
}
const wrap = (s: LandingSection, cls: string, inner: string, id?: string) =>
  `<section class="lp-sec ${cls}" id="${escHtml(id ?? s.type)}"><div class="lp-wrap">${inner}</div></section>`;

/** Đầu trang dựng từ một khối header (dùng cho trang không phải trang dựng khối) */
export function renderHeaderHtml(s: LandingSection, ctx: RenderCtx): string { return renderHeader(s, ctx); }
export function renderFooterHtml(s: LandingSection, ctx: RenderCtx): string { return renderFooter(s, ctx); }
/** Tiêu đề khối form (nhãn, tiêu đề, ✓, gọi hotline) — dùng cho trang đăng ký riêng; `asH1` khi form là nội dung chính của trang */
export function renderFormHeadHtml(s: LandingSection, asH1 = false): string { const h = formHead(s); return asH1 ? h.replace("<h2>", "<h1>").replace("</h2>", "</h1>") : h; }

/** Ảnh nội bộ ("/…") trong tệp xuất cho host khác → địa chỉ tuyệt đối của hệ thống */
const abs = (ctx: RenderCtx, u: string) => (ctx.mode === "export" && u.startsWith("/") && ctx.baseUrl ? ctx.baseUrl + u : u);

function renderHeader(s: LandingSection, ctx: RenderCtx): string {
  const nav = rowsOf(s, "nav").map((r) => `<a href="${escHtml(href(ctx, r.href ?? ""))}">${escHtml(r.label ?? "")}</a>`).join("");
  const phone = d(s, "phone");
  const lockup = ctx.brand.lockupUrl ? `<img class="lp-lockup" src="${escHtml(abs(ctx, ctx.brand.lockupUrl))}" alt="${escHtml(ctx.brand.name)}" width="240" height="44" />` : "";
  const logo = lockup || (ctx.brand.logoUrl ? `<img src="${escHtml(abs(ctx, ctx.brand.logoUrl))}" alt="" width="36" height="36" />` : "");
  const tel = phone ? `<a class="lp-tel" href="tel:${escHtml(phone.replace(/[^\d+]/g, ""))}">${escHtml(phone)}</a>` : "";
  const cta = btn(ctx, d(s, "ctaLabel"), d(s, "ctaUrl"), "primary", "lp-btn-sm");
  return `<header class="lp-top"><div class="lp-wrap lp-top-in">`
    + `<a class="lp-brand" href="${escHtml(ctx.homeHref ?? "#top")}"${lockup ? ` aria-label="${escHtml(ctx.brand.name)}"` : ""}>${logo}${lockup ? "" : `<span>${escHtml(ctx.brand.name)}</span>`}</a>`
    + (nav ? `<nav class="lp-nav" aria-label="Menu">${nav}</nav>` : "")
    + `<div class="lp-top-r">${tel}${cta}</div>`
    + (nav ? `<details class="lp-menu"><summary aria-label="Mở menu">☰</summary><nav>${nav}</nav></details>` : "")
    + `</div></header>`;
}

function renderHero(s: LandingSection, ctx: RenderCtx): string {
  const badges = rowsOf(s, "badges").map((r) => `<li>${escHtml(r.text ?? "")}</li>`).join("");
  const im = src(ctx, d(s, "image"));
  const text1 = `<div class="lp-hero-text">`
    + (d(s, "eyebrow") ? `<p class="lp-eyebrow">${escHtml(d(s, "eyebrow"))}</p>` : "")
    + `<h1>${escHtml(d(s, "title"))}</h1>`
    + (d(s, "subtitle") ? `<p class="lp-lead">${text(d(s, "subtitle"))}</p>` : "")
    + `<div class="lp-actions">${btn(ctx, d(s, "primaryLabel"), d(s, "primaryUrl"), "primary")}${btn(ctx, d(s, "secondaryLabel"), d(s, "secondaryUrl"), "ghost")}</div>`
    + (badges ? `<ul class="lp-badges">${badges}</ul>` : "")
    + `</div>`;
  const pic = im ? `<div class="lp-hero-pic">${imgTag(ctx, d(s, "image"), d(s, "title"), { eager: true })}</div>` : "";
  return wrap(s, `lp-hero${im ? " has-pic" : ""}`, text1 + pic, "top");
}

function renderStats(s: LandingSection, ctx: RenderCtx): string {
  const items = rowsOf(s, "items").map((r) => `<li><strong>${escHtml(r.value ?? "")}</strong><span>${escHtml(r.label ?? "")}</span></li>`).join("");
  return wrap(s, "lp-stats", head(s, ctx) + `<ul class="lp-stat-list">${items}</ul>`);
}

function renderFeatures(s: LandingSection, ctx: RenderCtx): string {
  const items = rowsOf(s, "items").map((r, i) => `<li class="lp-card">${iconTile(r.icon, i)}<h3>${escHtml(r.title ?? "")}</h3>${r.text ? `<p>${text(r.text)}</p>` : ""}</li>`).join("");
  // Có ảnh lớn → lưới "bento": ô ảnh chiếm 2 hàng đầu, các thẻ xếp quanh (không phải 6 thẻ giống hệt nhau)
  const pic = d(s, "image") ? `<li class="lp-bento-pic">${imgTag(ctx, d(s, "image"), d(s, "imageAlt") || d(s, "title"), { sizes: "(max-width: 860px) 100vw, 580px" })}</li>` : "";
  return wrap(s, `lp-features${pic ? " lp-bento" : ""}`, head(s, ctx) + `<ol class="lp-grid">${pic}${items}</ol>`, "cam-ket");
}

function renderPrograms(s: LandingSection, ctx: RenderCtx): string {
  const items = rowsOf(s, "items").map((r) => {
    const im = src(ctx, r.image ?? "");
    const link = r.url ? `<a class="lp-link" href="${escHtml(href(ctx, r.url))}" data-cta="1"${external(href(ctx, r.url))}>${escHtml(r.linkLabel || "Xem chi tiết")} →</a>` : "";
    return `<li class="lp-card lp-prog">${im ? imgTag(ctx, r.image ?? "", r.name ?? "") : ""}`
      + (r.badge ? `<span class="lp-tag">${escHtml(r.badge)}</span>` : "")
      + `<h3>${escHtml(r.name ?? "")}</h3>`
      + (r.meta ? `<p class="lp-meta">${escHtml(r.meta)}</p>` : "")
      + (r.text ? `<p>${text(r.text)}</p>` : "")
      + (r.price ? `<p class="lp-price">${escHtml(r.price)}</p>` : "")
      + link + `</li>`;
  }).join("");
  return wrap(s, "lp-programs", head(s, ctx) + `<ul class="lp-grid lp-grid-2">${items}</ul>`, "khoa-hoc");
}

function renderTestimonials(s: LandingSection, ctx: RenderCtx): string {
  const items = rowsOf(s, "items").map((r) => `<li class="lp-card lp-quote"><p>“${text(r.quote ?? "")}”</p><footer><strong>${escHtml(r.name ?? "")}</strong>${r.meta ? `<span>${escHtml(r.meta)}</span>` : ""}</footer></li>`).join("");
  return wrap(s, "lp-testimonials", head(s, ctx) + `<ul class="lp-grid">${items}</ul>`, "phan-hoi");
}

function renderCta(s: LandingSection, ctx: RenderCtx): string {
  const pts = rowsOf(s, "points").map((r) => `<li>${escHtml(r.text ?? "")}</li>`).join("");
  const inner = `<h2>${escHtml(d(s, "title"))}</h2>${d(s, "text") ? `<p>${text(d(s, "text"))}</p>` : ""}`
    + `<div class="lp-actions">${btn(ctx, d(s, "primaryLabel"), d(s, "primaryUrl"), "light")}${btn(ctx, d(s, "secondaryLabel"), d(s, "secondaryUrl"), "outline")}</div>`
    + (pts ? `<ul class="lp-checks">${pts}</ul>` : "");
  return wrap(s, "lp-cta", inner, s.id);
}

function renderSteps(s: LandingSection, ctx: RenderCtx): string {
  const items = rowsOf(s, "items").map((r, i) => `<li>${iconTile(r.icon, i)}<div><h3>${escHtml(r.title ?? "")}</h3>${r.text ? `<p>${text(r.text)}</p>` : ""}</div></li>`).join("");
  return wrap(s, "lp-steps", head(s, ctx) + `<ol class="lp-steps-list">${items}</ol>`, "quy-trinh");
}

function renderTimeline(s: LandingSection, ctx: RenderCtx): string {
  const items = rowsOf(s, "items").map((r) => `<li><time>${escHtml(r.when ?? "")}</time><div><strong>${escHtml(r.what ?? "")}</strong>${r.where ? `<span>${escHtml(r.where)}</span>` : ""}</div></li>`).join("");
  return wrap(s, "lp-timeline", head(s, ctx) + `<ul class="lp-tl">${items}</ul>`, "lich");
}

function renderGallery(s: LandingSection, ctx: RenderCtx): string {
  const items = rowsOf(s, "items").map((r) => {
    const im = src(ctx, r.image ?? "");
    const cu = r.creditUrl && validUrl(r.creditUrl) ? href(ctx, r.creditUrl) : "";
    const credit = r.credit ? `<small class="lp-credit">${cu ? `<a href="${escHtml(cu)}"${external(cu)} rel="noopener nofollow">${escHtml(r.credit)}</a>` : escHtml(r.credit)}</small>` : "";
    const tag = r.tag ? `<span class="lp-ph-tag">${escHtml(r.tag)}</span>` : "";
    return im ? `<li><figure>${imgTag(ctx, r.image ?? "", [r.tag, r.caption].filter(Boolean).join(": "), { sizes: "(max-width: 600px) 80vw, (max-width: 1100px) 33vw, 290px" })}${r.caption || credit || tag ? `<figcaption>${tag}${escHtml(r.caption ?? "")}${credit}</figcaption>` : ""}</figure></li>` : "";
  }).join("");
  return wrap(s, "lp-gallery", head(s, ctx) + `<ul class="lp-photos">${items}</ul>`, "hinh-anh");
}

function renderFaq(s: LandingSection, ctx: RenderCtx): string {
  const items = rowsOf(s, "items").map((r) => `<details class="lp-faq"><summary>${escHtml(r.q ?? "")}</summary><div>${text(r.a ?? "")}</div></details>`).join("");
  return wrap(s, "lp-faqs", head(s, ctx) + `<div class="lp-faq-list">${items}</div>`, "hoi-dap");
}

function renderText(s: LandingSection, ctx: RenderCtx): string {
  const im = src(ctx, d(s, "image"));
  return wrap(s, "lp-text", head(s, ctx) + `<div class="lp-prose">${renderMarkdown(d(s, "body"))}</div>` + (im ? imgTag(ctx, d(s, "image"), d(s, "title"), { cls: "lp-text-img" }) : ""), s.id);
}


/* ---------------------------- khối kể chuyện của trang chính ---------------------------- */

/** Đầu khối có dòng nhỏ phía trên (eyebrow) */
function headK(s: LandingSection, extra = ""): string {
  const k = d(s, "eyebrow"), title = d(s, "title"), intro = d(s, "intro");
  if (!k && !title && !intro) return "";
  return `<header class="lp-head${extra}">${k ? `<p class="lp-kicker">${escHtml(k)}</p>` : ""}${title ? `<h2>${hl(title)}</h2>` : ""}${intro ? `<p>${text(intro)}</p>` : ""}</header>`;
}

/** Số liệu có nguồn — nguồn luôn hiện cạnh con số, có liên kết khi có */
function renderInsights(s: LandingSection, ctx: RenderCtx): string {
  const dark = /^(toi|tối|dark)$/i.test(d(s, "tone").trim());
  const items = rowsOf(s, "items").map((r) => {
    const u = r.sourceUrl && validUrl(r.sourceUrl) ? href(ctx, r.sourceUrl) : "";
    const src1 = u ? `<a href="${escHtml(u)}"${external(u)}>${escHtml(r.source ?? "")}</a>` : escHtml(r.source ?? "");
    return `<li class="lp-ins"><strong class="lp-ins-val">${escHtml(r.value ?? "")}</strong><p class="lp-ins-lbl">${escHtml(r.label ?? "")}</p>`
      + (r.text ? `<p class="lp-ins-txt">${text(r.text)}</p>` : "")
      + `<p class="lp-src">Nguồn: ${src1}</p></li>`;
  }).join("");
  const closing = d(s, "closing") ? `<p class="lp-ins-close">${text(d(s, "closing"))}</p>` : "";
  return wrap(s, `lp-insights${dark ? " lp-dark" : ""}`, headK(s) + `<ul class="lp-ins-list">${items}</ul>` + closing, s.id);
}

function renderContrast(s: LandingSection, ctx: RenderCtx): string {
  void ctx;
  const col = (key: string, title: string, cls: string) => {
    const rows = rowsOf(s, key).map((r) => `<li>${escHtml(r.text ?? "")}</li>`).join("");
    return rows ? `<div class="lp-vs-col ${cls}"><h3>${escHtml(title)}</h3><ul>${rows}</ul></div>` : "";
  };
  const left = col("left", d(s, "leftTitle"), "lp-vs-l"), right = col("right", d(s, "rightTitle"), "lp-vs-r");
  const pic = d(s, "image") ? `<figure class="lp-vs-pic">${imgTag(ctx, d(s, "image"), d(s, "imageAlt") || d(s, "title"), { sizes: "(max-width: 1120px) 100vw, 1080px" })}</figure>` : "";
  return wrap(s, "lp-contrast", headK(s) + pic + `<div class="lp-vs${left ? "" : " lp-vs-one"}">${left}${left ? `<span class="lp-vs-arrow" aria-hidden="true">→</span>` : ""}${right}</div>`
    + (d(s, "note") ? `<p class="lp-note">${text(d(s, "note"))}</p>` : ""), s.id);
}

/** Mã tab an toàn cho id / thuộc tính */
const tabKey = (v: string) => v.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20);

/** Dòng chuyên ngành được mở sẵn theo `ctx.focus` (null nếu không khớp) */
export function focusedTrack(doc: LandingDoc, focus?: string): Record<string, string> | null {
  const k = tabKey(focus ?? "");
  if (!k) return null;
  for (const s of doc.sections) {
    if (s.type !== "tracks" || !sectionVisible(s)) continue;
    const r = rowsOf(s, "items").find((x) => tabKey(x.key ?? "") === k);
    if (r) return r;
  }
  return null;
}

/**
 * Tab chuyên ngành KHÔNG cần JavaScript: nhóm radio ẩn + nhãn + bảng nội dung; CSS hiện bảng của radio đang chọn.
 * Bàn phím: Tab vào nhóm, mũi tên để đổi tab (hành vi gốc của radio). Không có CSS (tệp xuất, trình đọc) → hiện đủ mọi bảng.
 */
function renderTracks(s: LandingSection, ctx: RenderCtx): string {
  const rows = rowsOf(s, "items");
  const want = tabKey(ctx.focus ?? "");
  let on = rows.findIndex((r) => want && tabKey(r.key ?? "") === want);
  if (on < 0) on = 0;
  const gid = `lp-t-${tabKey(s.id) || "nganh"}`;
  const inputs = rows.map((r, i) => `<input class="lp-tab-in" type="radio" name="${gid}" id="${gid}-${i}" aria-label="${escHtml(r.tab ?? "")}"${i === on ? " checked" : ""} />`).join("");
  const bar = rows.map((r, i) => {
    const ic = svgIcon((r.icon ?? "").trim() || TRACK_ICON[tabKey(r.key ?? "")] || "", 28);
    return `<label for="${gid}-${i}" class="lp-tab-l lp-tab-l${i % 4}">${ic ? `<span class="lp-tab-ic">${ic}</span>` : ""}<span class="lp-tab-tx"><b>${escHtml(r.tab ?? "")}</b>${r.ages ? `<small>${escHtml(r.ages)}</small>` : ""}</span></label>`;
  }).join("");
  const panels = rows.map((r) => {
    const outs = (r.outcomes ?? "").split("\n").map((x) => x.replace(/^[-•\s]+/, "").trim()).filter(Boolean).map((x) => `<li>${escHtml(x)}</li>`).join("");
    const pic = r.image ? `<figure class="lp-tab-pic"><div class="lp-frame"><span aria-hidden="true"></span>${imgTag(ctx, r.image, r.imageAlt || r.name || "", { sizes: "(max-width: 860px) 100vw, 560px" })}</div>${r.credit ? `<figcaption>${r.creditUrl && validUrl(r.creditUrl) ? `<a href="${escHtml(href(ctx, r.creditUrl))}"${external(href(ctx, r.creditUrl))} rel="noopener nofollow">${escHtml(r.credit)}</a>` : escHtml(r.credit)}</figcaption>` : ""}</figure>` : "";
    return `<article class="lp-tab-panel" id="nganh-${escHtml(tabKey(r.key ?? ""))}">${pic}<div class="lp-tab-body">`
      + (r.ages ? `<span class="lp-tag">${escHtml(r.ages)}</span>` : "")
      + `<h3>${escHtml(r.name ?? "")}</h3>`
      + (r.hook ? `<p class="lp-tab-hook">${escHtml(r.hook)}</p>` : "")
      + (r.text ? `<p>${text(r.text)}</p>` : "")
      + (outs ? `<p class="lp-tab-sub">Con làm được</p><ul class="lp-ticks">${outs}</ul>` : "")
      + (r.tools ? `<p class="lp-tab-tools">${escHtml(r.tools)}</p>` : "")
      + `</div></article>`;
  }).join("");
  const more = d(s, "ctaLabel") && d(s, "ctaUrl") ? `<p class="lp-tab-more"><a class="lp-link" href="${escHtml(href(ctx, d(s, "ctaUrl")))}" data-cta="1">${escHtml(d(s, "ctaLabel"))} →</a></p>` : "";
  return wrap(s, "lp-tracks", headK(s) + `<div class="lp-tabs">${inputs}<div class="lp-tab-bar">${bar}</div><div class="lp-tab-panels">${panels}</div></div>` + more, s.id);
}

function renderChange(s: LandingSection, ctx: RenderCtx): string {
  const b = d(s, "beforeLabel") || "Trước", a = d(s, "afterLabel") || "Sau";
  const items = rowsOf(s, "items").map((r) => `<li><strong class="lp-chg-area">${escHtml(r.area ?? "")}</strong>`
    + `<span class="lp-chg-b"><em>${escHtml(b)}</em>${escHtml(r.before ?? "")}</span>`
    + `<span class="lp-chg-a"><em>${escHtml(a)}</em>${escHtml(r.after ?? "")}</span></li>`).join("");
  const pic = d(s, "image") ? `<div class="lp-chg-pic">${imgTag(ctx, d(s, "image"), d(s, "imageAlt") || d(s, "title"), { sizes: "(max-width: 860px) 100vw, 420px" })}</div>` : "";
  return wrap(s, `lp-change${pic ? " has-pic" : ""}`, headK(s) + `<div class="lp-chg-in"><ul class="lp-chg">${items}</ul>${pic}</div>`
    + (d(s, "note") ? `<p class="lp-note">${text(d(s, "note"))}</p>` : ""), s.id);
}

/** Giá trị buổi học trải nghiệm: hành trình 4 bước + những gì gia đình nhận được + nút đặt lịch */
function renderTrial(s: LandingSection, ctx: RenderCtx): string {
  const steps = rowsOf(s, "steps").map((r, i) => `<li class="lp-trial-step"><span class="lp-trial-no" aria-hidden="true">${i + 1}</span><div>`
    + (r.who ? `<p class="lp-trial-who">${escHtml(r.who)}</p>` : "")
    + `<h3>${escHtml(r.title ?? "")}</h3>${r.text ? `<p>${text(r.text)}</p>` : ""}</div></li>`).join("");
  const gains = rowsOf(s, "gains").map((r, i) => `<li>${iconTile(r.icon, i)}<div><h4>${escHtml(r.title ?? "")}</h4>${r.text ? `<p>${text(r.text)}</p>` : ""}</div></li>`).join("");
  const card = `<div class="lp-trial-card">`
    + `<div class="lp-trial-left">` + (d(s, "gainsTitle") ? `<h3 class="lp-trial-gt">${hl(d(s, "gainsTitle"))}</h3>` : "")
    + (gains ? `<ul class="lp-trial-gains">${gains}</ul>` : "") + `</div>`
    + `<div class="lp-trial-act">`
    + (d(s, "photo") ? `<div class="lp-trial-who-card">${imgTag(ctx, d(s, "photo"), d(s, "photoName") || "Giảng viên", { cls: "lp-trial-av" })}<p><b>${escHtml(d(s, "photoName"))}</b>${d(s, "photoRole") ? `<span>${escHtml(d(s, "photoRole"))}</span>` : ""}</p></div>` : "")
    + (d(s, "badge") ? `<p class="lp-trial-badge">${escHtml(d(s, "badge"))}</p>` : "")
    + `<div class="lp-actions">${btn(ctx, d(s, "primaryLabel"), d(s, "primaryUrl"), "primary")}${btn(ctx, d(s, "secondaryLabel"), d(s, "secondaryUrl"), "ghost")}</div>`
    + (d(s, "note") ? `<p class="lp-trial-note">${text(d(s, "note"))}</p>` : "") + `</div></div>`;
  return wrap(s, "lp-trial", headK(s) + `<ol class="lp-trial-steps">${steps}</ol>` + card, s.id);
}

/* ---------------------------- khối cho landing quảng cáo ---------------------------- */

function leadHeroLeft(s: LandingSection, ctx: RenderCtx, headline = ""): string {
  const pts = rowsOf(s, "points").map((r) => `<li>${escHtml(r.text ?? "")}</li>`).join("");
  const badges = rowsOf(s, "badges").map((r) => `<li>${escHtml(r.text ?? "")}</li>`).join("");
  void ctx;
  return `<div class="lp-hero-text">`
    + (d(s, "eyebrow") ? `<p class="lp-eyebrow">${escHtml(d(s, "eyebrow"))}</p>` : "")
    + `<h1>${hl(headline || d(s, "title"))}</h1>`
    + (d(s, "subtitle") ? `<p class="lp-lead">${text(d(s, "subtitle"))}</p>` : "")
    + (pts ? `<ul class="lp-ticks">${pts}</ul>` : "")
    + (badges ? `<ul class="lp-badges">${badges}</ul>` : "")
    + `</div>`;
}
/** Dải ảnh sản phẩm thật dưới tiêu đề (mỗi ảnh một nhãn + phần mềm); nguồn gom thành một dòng bên dưới */
function heroShowcase(s: LandingSection, ctx: RenderCtx): string {
  const rows = rowsOf(s, "showcase").filter((r) => src(ctx, r.image ?? ""));
  if (!rows.length) return "";
  const items = rows.map((r, i) => {
    const pos = /^\d{1,3}% \d{1,3}%$/.test((r.pos ?? "").trim()) ? (r.pos ?? "").trim() : "";
    const img = imgTag(ctx, r.image ?? "", r.imageAlt || r.title || "", { eager: i === 0, sizes: i === 0 && rows.length >= 5 ? "(max-width: 860px) 76vw, 620px" : "(max-width: 860px) 76vw, 340px" });
    return `<li class="lp-show-i lp-show-${i}${/^(vua|vừa|contain)$/i.test((r.fit ?? "").trim()) ? " lp-show-fit" : ""}"${pos ? ` style="--pos:${pos}"` : ""}><figure>${img}`
      + `<figcaption><b>${escHtml(r.title ?? "")}</b>${r.tool ? `<span>${escHtml(r.tool)}</span>` : ""}</figcaption></figure></li>`;
  }).join("");
  const seen = new Set<string>();
  const credits = rows.filter((r) => r.credit && !seen.has(r.credit) && !!seen.add(r.credit)).map((r) => {
    const cu = r.creditUrl && validUrl(r.creditUrl) ? href(ctx, r.creditUrl) : "";
    return cu ? `<a href="${escHtml(cu)}"${external(cu)} rel="noopener nofollow">${escHtml(r.credit ?? "")}</a>` : escHtml(r.credit ?? "");
  }).join(" · ");
  return `<div class="lp-hero-pic lp-show"><ul class="lp-show-list">${items}</ul>${credits ? `<small class="lp-credit">Ảnh: ${credits}</small>` : ""}</div>`;
}
function leadHeroPic(s: LandingSection, ctx: RenderCtx): string {
  const show = heroShowcase(s, ctx);
  if (show) return show;
  if (!d(s, "image")) return "";
  const cu = d(s, "creditUrl") && validUrl(d(s, "creditUrl")) ? href(ctx, d(s, "creditUrl")) : "";
  const credit = d(s, "credit") ? `<small class="lp-credit">${cu ? `<a href="${escHtml(cu)}"${external(cu)} rel="noopener nofollow">${escHtml(d(s, "credit"))}</a>` : escHtml(d(s, "credit"))}</small>` : "";
  return `<div class="lp-hero-pic">${imgTag(ctx, d(s, "image"), d(s, "imageAlt") || d(s, "title"), { eager: true, sizes: "(max-width: 860px) 100vw, 1200px" })}${credit}</div>`;
}
function leadFormHead(s: LandingSection): string {
  return `<p class="lp-form-title">${escHtml(d(s, "formTitle"))}</p>${d(s, "formNote") ? `<p class="lp-form-note">${escHtml(d(s, "formNote"))}</p>` : ""}`;
}
/** Bản HTML tĩnh (xuất / kiểm thử): cột chữ + thẻ form dẫn về trang đăng ký của hệ thống */
function renderLeadHeroStatic(s: LandingSection, ctx: RenderCtx, formInner: string, headline = ""): string {
  return `<section class="lp-sec lp-hero lp-lead-hero" id="top"><div class="lp-wrap">${leadHeroLeft(s, ctx, headline)}`
    + `<div class="lp-hero-form" id="dang-ky-nhanh"><div class="lp-form-card">${leadFormHead(s)}${formInner}</div></div>${leadHeroPic(s, ctx)}</div></section>`;
}

function renderRoadmap(s: LandingSection, ctx: RenderCtx): string {
  const items = rowsOf(s, "items").map((r, i) => `<li class="lp-road-step lp-road-${i % 3}">`
    + `<span class="lp-road-no">${escHtml(r.step ?? "")}</span>`
    + (r.tag ? `<span class="lp-tag">${escHtml(r.tag)}</span>` : "")
    + `<h3>${escHtml(r.name ?? "")}</h3>`
    + (r.meta ? `<p class="lp-meta">${escHtml(r.meta)}</p>` : "")
    + (r.text ? `<p>${text(r.text)}</p>` : "") + `</li>`).join("");
  return wrap(s, "lp-roadmap", head(s, ctx) + `<ol class="lp-road">${items}</ol>` + (d(s, "note") ? `<p class="lp-note">${escHtml(d(s, "note"))}</p>` : ""), "lo-trinh");
}

function renderTools(s: LandingSection, ctx: RenderCtx): string {
  const items = rowsOf(s, "items").map((r) => `<li class="lp-card lp-tool"><figure>${imgTag(ctx, r.image ?? "", `${r.name ?? ""}${r.text ? ` — ${r.text}` : ""}`)}`
    + (r.credit ? `<figcaption>${escHtml(r.credit)}</figcaption>` : "") + `</figure>`
    + (r.tag ? `<span class="lp-tag">${escHtml(r.tag)}</span>` : "")
    + `<h3>${escHtml(r.name ?? "")}</h3>` + (r.text ? `<p>${text(r.text)}</p>` : "") + `</li>`).join("");
  return wrap(s, "lp-tools", head(s, ctx) + `<ul class="lp-grid lp-grid-tools">${items}</ul>`, s.id);
}

function renderSplit(s: LandingSection, ctx: RenderCtx, flip: boolean): string {
  const pts = rowsOf(s, "points").map((r) => `<li>${escHtml(r.text ?? "")}</li>`).join("");
  const body = `<div class="lp-split-text">`
    + (d(s, "eyebrow") ? `<p class="lp-kicker">${escHtml(d(s, "eyebrow"))}</p>` : "")
    + `<h2>${escHtml(d(s, "title"))}</h2>`
    + (d(s, "body") ? `<p class="lp-split-body">${text(d(s, "body"))}</p>` : "")
    + (pts ? `<ul class="lp-ticks">${pts}</ul>` : "")
    + (d(s, "ctaLabel") && d(s, "ctaUrl") ? `<div class="lp-actions">${btn(ctx, d(s, "ctaLabel"), d(s, "ctaUrl"), "primary")}</div>` : "")
    + `</div>`;
  const pic = `<div class="lp-split-pic">${imgTag(ctx, d(s, "image"), d(s, "imageAlt") || d(s, "title"), { sizes: "(max-width: 860px) 100vw, 540px" })}</div>`;
  return wrap(s, `lp-split${flip ? " lp-flip" : ""}`, `<div class="lp-split-in">${body}${pic}</div>`, s.id);
}

function renderTeacher(s: LandingSection, ctx: RenderCtx): string {
  const pts = rowsOf(s, "points").map((r) => `<li><strong>${escHtml(r.title ?? "")}</strong>${r.text ? `<span>${escHtml(r.text)}</span>` : ""}</li>`).join("");
  const tags = rowsOf(s, "tags").map((r) => `<li>${escHtml(r.text ?? "")}</li>`).join("");
  const photo = d(s, "photo") ? `<figure class="lp-teacher-photo">${imgTag(ctx, d(s, "photo"), `${d(s, "name")}${d(s, "role") ? ` — ${d(s, "role")}` : ""}`)}<figcaption><strong>${escHtml(d(s, "name"))}</strong>${d(s, "role") ? `<span>${escHtml(d(s, "role"))}</span>` : ""}</figcaption></figure>` : "";
  const cert = d(s, "certImage") ? `<figure class="lp-teacher-cert">${imgTag(ctx, d(s, "certImage"), d(s, "certCaption") || "Chứng chỉ giảng viên")}${d(s, "certCaption") ? `<figcaption>${escHtml(d(s, "certCaption"))}</figcaption>` : ""}</figure>` : "";
  const mid = `<div class="lp-teacher-info">`
    + (photo ? "" : `<h3>${escHtml(d(s, "name"))}</h3>`)
    + (d(s, "bio") ? `<p>${text(d(s, "bio"))}</p>` : "")
    + (pts ? `<ul class="lp-teacher-pts">${pts}</ul>` : "")
    + (tags ? `<ul class="lp-badges">${tags}</ul>` : "")
    + (d(s, "quote") ? `<blockquote>${text(d(s, "quote"))}</blockquote>` : "")
    + `</div>`;
  return wrap(s, "lp-teacher", head(s, ctx) + `<div class="lp-teacher-in">${photo}${mid}${cert}</div>`, "giang-vien");
}

/** Thanh gọi / đăng ký cố định ở cuối màn hình điện thoại (landing quảng cáo) */
function renderStickyBar(doc: LandingDoc, ctx: RenderCtx): string {
  const header = doc.sections.find((x) => x.type === "header" && x.enabled);
  const phone = header ? d(header, "phone") : "";
  void ctx;
  return `<div class="lp-sticky" role="region" aria-label="Đăng ký nhanh">`
    + (phone ? `<a class="lp-btn lp-btn-ghost" href="tel:${escHtml(phone.replace(/[^\d+]/g, ""))}" data-cta="1">Gọi ${escHtml(phone)}</a>` : "")
    + `<a class="lp-btn lp-btn-primary" href="#dang-ky-nhanh" data-cta="1">Học trải nghiệm 1:1</a></div>`;
}

/** Liên kết chính sách / đo lường → hàng dưới cùng của chân trang; liên kết đăng ký → nút trong cột thương hiệu */
const FOOT_LEGAL = /chinh-sach|#do-luong/;
const FOOT_CTA = /^\/?#dang-ky/;
function renderFooter(s: LandingSection, ctx: RenderCtx): string {
  const a = (r: Record<string, string>, cls = "") => `<a${cls ? ` class="${cls}"` : ""} href="${escHtml(href(ctx, r.href ?? ""))}"${external(href(ctx, r.href ?? ""))}>${escHtml(r.label ?? "")}</a>`;
  const rows = rowsOf(s, "links");
  const cta = rows.find((r) => FOOT_CTA.test(r.href ?? ""));
  const legalLinks = rows.filter((r) => FOOT_LEGAL.test(r.href ?? "")).map((r) => a(r)).join("");
  const links = rows.filter((r) => r !== cta && !FOOT_LEGAL.test(r.href ?? "")).map((r) => `<li>${a(r)}</li>`).join("");
  const addr = rowsOf(s, "addresses").map((r) => `<li><strong>${escHtml(r.label ?? "")}</strong><span>${escHtml(r.text ?? "")}</span></li>`).join("");
  const phone = d(s, "phone");
  const contact = [phone ? `<a class="lp-foot-tel" href="tel:${escHtml(phone.replace(/[^\d+]/g, ""))}"><span>Hotline</span>${escHtml(phone)}</a>` : "", d(s, "email") ? `<a href="mailto:${escHtml(d(s, "email"))}">${escHtml(d(s, "email"))}</a>` : ""].filter(Boolean).join("");
  return `<footer class="lp-foot"><div class="lp-wrap">`
    + `<div class="lp-foot-grid"><div class="lp-foot-brandcol">${ctx.brand.lockupOnDarkUrl ? `<img class="lp-foot-lockup" src="${escHtml(abs(ctx, ctx.brand.lockupOnDarkUrl))}" alt="${escHtml(ctx.brand.name)}" width="300" height="55" loading="lazy" />` : `<strong class="lp-foot-brand">${escHtml(ctx.brand.name)}</strong>`}`
    + (d(s, "tagline") ? `<p>${text(d(s, "tagline"))}</p>` : "")
    + (contact ? `<div class="lp-foot-contact">${contact}</div>` : "")
    + (cta ? a(cta, "lp-btn lp-btn-primary lp-btn-sm lp-foot-cta") : "") + `</div>`
    + (addr ? `<div><p class="lp-foot-h">Thông tin</p><ul class="lp-addr">${addr}</ul></div>` : "")
    + (links ? `<nav aria-label="Khám phá"><p class="lp-foot-h">Khám phá</p><ul class="lp-foot-links">${links}</ul></nav>` : "")
    + `</div>`
    + `<div class="lp-foot-bottom"><div><p class="lp-copy">${escHtml(d(s, "copyright") || `© ${ctx.brand.name}`)}</p>${d(s, "legal") ? `<p class="lp-legal">${text(d(s, "legal"))}</p>` : ""}</div>`
    + (legalLinks ? `<nav class="lp-foot-legal" aria-label="Chính sách">${legalLinks}</nav>` : "") + `</div>`
    + `</div></footer>`;
}

function formHead(s: LandingSection): string {
  const pts = rowsOf(s, "points").map((r) => `<li>${escHtml(r.text ?? "")}</li>`).join("");
  const call = d(s, "callLabel") && d(s, "callUrl") && validUrl(d(s, "callUrl")) ? `<a class="lp-form-call" href="${escHtml(d(s, "callUrl"))}" data-cta="1">${escHtml(d(s, "callLabel"))}</a>` : "";
  return `<header class="lp-head${pts || call ? " lp-form-side" : ""}">`
    + (d(s, "badge") ? `<p class="lp-form-badge">${escHtml(d(s, "badge"))}</p>` : "")
    + `<h2>${hl(d(s, "title"))}</h2>${d(s, "subtitle") ? `<p>${text(d(s, "subtitle"))}</p>` : ""}`
    + (pts ? `<ul class="lp-ticks">${pts}</ul>` : "") + call + `</header>`;
}
function formOpen(s: LandingSection): string {
  return `<section class="lp-sec lp-form" id="dang-ky"><div class="lp-wrap lp-form-in">${formHead(s)}`;
}
function formExport(s: LandingSection, ctx: RenderCtx): string {
  // HTML độc lập không gửi form được sang hệ thống khác miền → dẫn về trang đăng ký của hệ thống
  const to = (ctx.baseUrl ?? "") + TRIAL_PATH + "?lp=" + encodeURIComponent(ctx.slug);
  return `<div class="lp-form-card"><p>Để lại thông tin, trung tâm sẽ liên hệ lại trong giờ làm việc.</p>${btn(ctx, "Đăng ký học trải nghiệm 1:1", to, "primary")}</div>`;
}

/** Đường dẫn trang đăng ký học trải nghiệm (form riêng, cùng form trang chính); /dang-ky chuyển hướng về đây */
export const TRIAL_PATH = "/hoc-thu-mien-phi";

/** Từng phần của trang theo thứ tự. Trang công khai ghép phần "form" bằng thành phần React; export thì dùng nút dẫn về hệ thống */
export function renderParts(doc: LandingDoc, ctx: RenderCtx): LandingPart[] {
  const parts: LandingPart[] = [];
  const push = (html: string) => {
    if (!html) return;
    const last = parts[parts.length - 1];
    if (last && last.kind === "html") last.html += html;
    else parts.push({ kind: "html", html });
  };
  // Nền xen kẽ giữa các khối nội dung (tính bằng thứ tự hiển thị, không dựa vào CSS nth-of-type vì các phần nằm ở nhiều thẻ cha)
  let n = 0;
  const CONTENT: ReadonlySet<string> = new Set(["stats", "features", "programs", "roadmap", "tools", "split", "teacher", "testimonials", "steps", "timeline", "gallery", "faq", "text", "form", "contrast", "tracks", "change"]);
  const lead = doc.sections.find((x) => x.type === "leadHero" && sectionVisible(x));
  // ?nganh=<mã>: tiêu đề lớn + chuyên ngành chọn sẵn trong form theo tab đang mở
  const ft = focusedTrack(doc, ctx.focus);
  const headline = ft?.headline ?? "";
  const leadInterest = (l: LandingSection) => ft?.interest || d(l, "interest");
  let flip = false;
  const alt = (html: string, on: boolean) => (on ? html.replace('class="lp-sec ', 'class="lp-sec lp-alt ') : html);
  for (const s of doc.sections) {
    if (!sectionVisible(s)) continue;
    const isAlt = CONTENT.has(s.type) && n++ % 2 === 1;
    switch (s.type) {
      case "header": push(renderHeader(s, ctx)); break;
      case "hero": push(renderHero(s, ctx)); break;
      case "leadHero":
        if (ctx.mode === "page") parts.push({ kind: "leadHero", sectionId: s.id, left: leadHeroLeft(s, ctx, headline), pic: leadHeroPic(s, ctx), formHead: leadFormHead(s), thankYou: d(s, "thankYou"), interest: leadInterest(s) });
        else push(renderLeadHeroStatic(s, ctx, formExport(s, ctx), headline));
        break;
      case "roadmap": push(alt(renderRoadmap(s, ctx), isAlt)); break;
      case "tools": push(alt(renderTools(s, ctx), isAlt)); break;
      case "split": push(alt(renderSplit(s, ctx, flip), isAlt)); flip = !flip; break;
      case "teacher": push(alt(renderTeacher(s, ctx), isAlt)); break;
      case "stats": push(alt(renderStats(s, ctx), isAlt)); break;
      case "features": push(alt(renderFeatures(s, ctx), isAlt)); break;
      case "programs": push(alt(renderPrograms(s, ctx), isAlt)); break;
      case "testimonials": push(alt(renderTestimonials(s, ctx), isAlt)); break;
      case "cta": push(renderCta(s, ctx)); break;
      case "steps": push(alt(renderSteps(s, ctx), isAlt)); break;
      case "timeline": push(alt(renderTimeline(s, ctx), isAlt)); break;
      case "gallery": push(alt(renderGallery(s, ctx), isAlt)); break;
      case "faq": push(alt(renderFaq(s, ctx), isAlt)); break;
      case "text": push(alt(renderText(s, ctx), isAlt)); break;
      case "insights": push(renderInsights(s, ctx)); break;
      case "contrast": push(alt(renderContrast(s, ctx), isAlt)); break;
      case "tracks": push(alt(renderTracks(s, ctx), isAlt)); break;
      case "change": push(alt(renderChange(s, ctx), isAlt)); break;
      case "trial": push(renderTrial(s, ctx)); break;
      case "footer": push((lead ? renderStickyBar(doc, ctx) : "") + renderFooter(s, ctx)); break;
      case "form":
        if (ctx.mode === "page") parts.push({ kind: "form", sectionId: s.id, thankYou: d(s, "thankYou"), head: formHead(s), alt: isAlt, compact: !!lead, interest: lead ? leadInterest(lead) : "" });
        else push(alt(formOpen(s), isAlt) + formExport(s, ctx) + `</div></section>`);
        break;
    }
  }
  return parts;
}

/** Toàn bộ nội dung trang (không gồm <html>); dùng cho export và kiểm thử */
export function renderBody(doc: LandingDoc, ctx: RenderCtx): string {
  return renderParts(doc, ctx).map((p) => {
    if (p.kind === "html") return p.html;
    if (p.kind === "leadHero") return `<section class="lp-sec lp-hero lp-lead-hero" id="top"><div class="lp-wrap">${p.left}<div class="lp-hero-form" id="dang-ky-nhanh"><div class="lp-form-card">${p.formHead}<div data-lp-form></div></div></div>${p.pic}</div></section>`;
    return `<section class="lp-sec${p.alt ? " lp-alt" : ""} lp-form" id="dang-ky"><div class="lp-wrap lp-form-in">${p.head}<div class="lp-form-card" data-lp-form></div></div></section>`;
  }).join("");
}

export function paletteStyle(palette: Record<string, string>): string {
  return Object.entries(palette).filter(([k]) => /^--[a-z0-9-]+$/.test(k)).map(([k, v]) => `${k}:${String(v).replace(/[^#a-zA-Z0-9(),.%\s-]/g, "")}`).join(";");
}

/** CSS của landing, phạm vi trong `.lp` — không ảnh hưởng phần còn lại của ứng dụng */
/**
 * CSS của landing. Truyền `variant` để chỉ nhúng phần chung + đúng kiểu giao diện đang dùng (trang công khai nhẹ hơn);
 * để trống = mọi kiểu (khung xem trước trong quản trị, tệp xuất). Bỏ chú thích, dồn dòng.
 */
export function landingCss(variant?: LandingVariant): string {
  return LANDING_CSS
    .replace(/\/\*@v:(\w+)\*\/([\s\S]*?)\/\*@\/v\*\//g, (_m, v: string, body: string) => (!variant || v === variant ? body : ""))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\n\s*/g, "\n").replace(/([{};,])\n/g, "$1").replace(/\n/g, " ").trim();
}
const LANDING_CSS = `
.lp{--lp-ink:#0f172a;--lp-mut:#475569;--lp-line:#e2e8f0;--lp-bg:#fff;--lp-alt:var(--brand-50,#f8fafc);--lp-r:18px;color:var(--lp-ink);background:var(--lp-bg);font-family:var(--font-brand,var(--font-be-vietnam)),"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.6;font-size:16px;-webkit-text-size-adjust:100%}
.lp *,.lp *::before,.lp *::after{box-sizing:border-box}
.lp img{max-width:100%;height:auto;display:block}
:where(.lp) :where(h1,h2,h3){line-height:1.2;margin:0;letter-spacing:-.01em;text-wrap:balance}
:where(.lp) p{margin:0}
:where(.lp) a{color:inherit}
:where(.lp) :where(ul,ol){list-style:none;margin:0;padding:0}
.lp-wrap{width:100%;max-width:1120px;margin:0 auto;padding:0 20px}
.lp-sec{padding:64px 0}
.lp-alt{background:var(--lp-alt)}
.lp-head{max-width:720px;margin:0 0 32px}
.lp-head :is(h1,h2){font-size:clamp(1.55rem,3.2vw,2.2rem)}
.lp-head p{margin-top:10px;color:var(--lp-mut);font-size:1.05rem}
.lp-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:12px 22px;border-radius:999px;font-weight:700;font-size:1rem;text-decoration:none;text-align:center;max-width:100%;transition:transform .15s,box-shadow .15s,background .15s;border:2px solid transparent}
.lp-btn:focus-visible,.lp a:focus-visible,.lp summary:focus-visible{outline:3px solid var(--accent,#f59e0b);outline-offset:2px}
.lp-btn-sm{min-height:40px;padding:8px 16px;font-size:.92rem;white-space:nowrap}
/* Bộ nhận diện TH STEAM: nút kêu gọi chính màu Cosmic Gold, chữ navy */
.lp-btn-primary{background:var(--accent,#f59e0b);color:var(--accent-foreground,#0f172a);box-shadow:0 6px 18px -8px var(--accent-dark,#d97706)}
.lp-btn-primary:hover{background:var(--accent-dark,#d97706);transform:translateY(-1px)}
.lp-btn-ghost{background:transparent;color:var(--primary-ink,var(--primary,#1d4ed8));border-color:currentColor}
.lp-btn-ghost:hover{background:var(--primary-soft,rgba(29,78,216,.1))}
.lp-btn-light{background:#fff;color:var(--primary-ink,#1e40af)}
.lp-btn-light:hover{transform:translateY(-1px)}
.lp-btn-outline{background:transparent;color:var(--primary-foreground,#fff);border-color:currentColor}
.lp-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}
.lp-top{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--lp-line)}
.lp-top-in{display:flex;align-items:center;gap:16px;min-height:64px}
.lp-brand{display:flex;align-items:center;gap:10px;font-weight:800;text-decoration:none;color:var(--primary-ink,var(--primary,#1d4ed8));margin-right:auto}
.lp-brand img{border-radius:10px;object-fit:contain}
.lp-brand img.lp-lockup{border-radius:0;width:240px;height:auto;max-width:52vw}
.lp-foot-lockup{display:block;width:300px;height:auto;max-width:100%}
.lp-nav{display:flex;gap:20px;font-size:.95rem;font-weight:600}
.lp-nav a{text-decoration:none;color:var(--lp-mut)}
.lp-nav a:hover{color:var(--primary-ink,var(--primary))}
.lp-top-r{display:flex;align-items:center;gap:14px}
.lp-tel{font-weight:700;text-decoration:none;white-space:nowrap}
.lp-menu{display:none;position:relative}
.lp-menu summary{list-style:none;cursor:pointer;font-size:1.4rem;line-height:1;padding:8px 10px;border-radius:10px;border:1px solid var(--lp-line)}
.lp-menu summary::-webkit-details-marker{display:none}
.lp-menu nav{position:absolute;right:0;top:calc(100% + 8px);background:#fff;border:1px solid var(--lp-line);border-radius:14px;box-shadow:0 14px 40px -12px rgba(0,0,0,.25);padding:8px;display:grid;min-width:200px}
.lp-menu nav a{padding:12px 14px;text-decoration:none;font-weight:600;border-radius:10px}
.lp-menu nav a:hover{background:var(--lp-alt)}
.lp-hero{padding:56px 0 64px;background:linear-gradient(180deg,var(--brand-50,#f8fafc),#fff)}
.lp-hero .lp-wrap{display:grid;gap:36px;align-items:center}
.lp-hero.has-pic .lp-wrap{grid-template-columns:1.1fr .9fr}
.lp-eyebrow{display:inline-block;padding:6px 14px;border-radius:999px;background:var(--accent-soft,rgba(245,158,11,.14));color:var(--accent-ink,#b45309);font-weight:700;font-size:.88rem;margin-bottom:16px}
.lp-hero h1{font-size:clamp(2rem,5vw,3.4rem);font-weight:800}
.lp-lead{margin-top:16px;font-size:1.15rem;color:var(--lp-mut);max-width:560px}
.lp-badges{display:flex;flex-wrap:wrap;gap:8px 10px;margin-top:22px}
.lp-badges li{padding:7px 14px;border-radius:999px;background:#fff;border:1px solid var(--lp-line);font-size:.9rem;font-weight:600}
.lp-badges li::before{content:"✓ ";color:var(--primary-ink,var(--primary))}
.lp-hero-pic img{width:100%;border-radius:calc(var(--lp-r) + 8px);box-shadow:0 30px 60px -28px rgba(15,23,42,.35);aspect-ratio:4/3;object-fit:cover}
.lp-stat-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px}
.lp-stat-list li{background:#fff;border:1px solid var(--lp-line);border-radius:var(--lp-r);padding:22px 16px;text-align:center}
.lp-stat-list strong{display:block;font-size:clamp(1.7rem,3.6vw,2.4rem);font-weight:800;color:var(--primary-ink,var(--primary))}
.lp-stat-list span{color:var(--lp-mut);font-size:.95rem}
.lp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px}
.lp-grid-2{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
.lp-card{background:#fff;border:1px solid var(--lp-line);border-radius:var(--lp-r);padding:24px;display:flex;flex-direction:column;gap:10px;position:relative}
.lp-card h3{font-size:1.15rem}
.lp-card p{color:var(--lp-mut)}
.lp-num{display:inline-grid;place-items:center;width:38px;height:38px;border-radius:12px;background:var(--primary,#1d4ed8);color:var(--primary-foreground,#fff);font-weight:800;flex:none}
.lp-prog img{width:calc(100% + 48px);margin:-24px -24px 6px;max-width:none;border-radius:var(--lp-r) var(--lp-r) 0 0;aspect-ratio:16/9;object-fit:cover}
.lp-tag{align-self:flex-start;padding:4px 12px;border-radius:999px;background:var(--accent-soft,rgba(245,158,11,.14));color:var(--accent-ink,#b45309);font-size:.8rem;font-weight:700}
.lp-meta{font-size:.92rem}
.lp-price{font-weight:800;color:var(--primary-ink,var(--primary))!important;font-size:1.1rem}
.lp-link{margin-top:auto;font-weight:700;text-decoration:none;color:var(--primary-ink,var(--primary))}
.lp-link:hover{text-decoration:underline}
.lp-quote p{color:var(--lp-ink);font-size:1.02rem}
.lp-quote footer{margin-top:auto;display:flex;flex-direction:column;font-size:.9rem}
.lp-quote footer span{color:var(--lp-mut)}
.lp-cta{background:linear-gradient(135deg,var(--primary,#1d4ed8),var(--primary-dark,#1e40af));color:var(--primary-foreground,#fff);text-align:center}
.lp-cta h2{font-size:clamp(1.6rem,3.6vw,2.4rem)}
.lp-cta p{margin:12px auto 0;max-width:620px;opacity:.92;font-size:1.08rem}
.lp-cta .lp-actions{justify-content:center}
.lp-checks{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 22px;margin-top:22px;font-size:.95rem}
.lp-checks li::before{content:"✓ ";font-weight:800}
.lp-steps-list{display:grid;gap:14px;counter-reset:s}
.lp-steps-list li{display:flex;gap:16px;align-items:flex-start;background:#fff;border:1px solid var(--lp-line);border-radius:var(--lp-r);padding:18px 20px}
.lp-steps-list h3{font-size:1.08rem}
.lp-steps-list p{color:var(--lp-mut);margin-top:4px}
.lp-tl li{display:grid;grid-template-columns:170px 1fr;gap:16px;padding:16px 0;border-bottom:1px solid var(--lp-line)}
.lp-tl time{font-weight:800;color:var(--primary-ink,var(--primary))}
.lp-tl strong{display:block}
.lp-tl span{color:var(--lp-mut);font-size:.94rem}
.lp-photos{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
.lp-photos img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--lp-r)}
.lp-photos figure{margin:0}
.lp-photos figcaption{margin-top:8px;color:var(--lp-mut);font-size:.92rem}
.lp-faq-list{display:grid;gap:10px;max-width:820px}
.lp-faq{background:#fff;border:1px solid var(--lp-line);border-radius:14px;padding:0}
.lp-faq summary{cursor:pointer;list-style:none;padding:16px 48px 16px 18px;font-weight:700;position:relative}
.lp-faq summary::-webkit-details-marker{display:none}
.lp-faq summary::after{content:"+";position:absolute;right:18px;top:50%;transform:translateY(-50%);font-size:1.4rem;color:var(--primary-ink,var(--primary))}
.lp-faq[open] summary::after{content:"–"}
.lp-faq>div{padding:0 18px 18px;color:var(--lp-mut)}
.lp-form-in{max-width:560px}
.lp-form-in .lp-head{margin-bottom:20px}
.lp-form-card{background:#fff;border:1px solid var(--lp-line);border-radius:calc(var(--lp-r) + 4px);padding:6px;box-shadow:0 20px 50px -28px rgba(29,23,48,.4)}
.lp-form-card>p{padding:16px 16px 0;color:var(--lp-mut)}
.lp-form-card>.lp-btn{margin:16px;max-width:calc(100% - 32px)}
.lp-prose{max-width:760px;color:var(--lp-ink)}
.lp-prose p,.lp-prose ul,.lp-prose ol{margin:0 0 14px}
.lp-prose ul{list-style:disc;padding-left:22px}
.lp-prose ol{list-style:decimal;padding-left:22px}
.lp-prose h2,.lp-prose h3{margin:22px 0 10px}
.lp-prose a{color:var(--primary-ink,var(--primary))}
.lp-text-img{margin-top:20px;border-radius:var(--lp-r);max-width:760px;width:100%}
.lp-foot{background:#0f172a;color:#f8fafc;padding:56px 0 28px}
.lp-foot a{color:#f8fafc}
.lp-foot-grid{display:grid;grid-template-columns:1.5fr 1fr .8fr;gap:40px}
.lp-foot-brand{font-size:1.2rem}
.lp-foot p{margin-top:10px;color:rgba(248,250,252,.72);font-size:.95rem;max-width:420px}
.lp-foot-h{margin:0 0 14px!important;color:#fff!important;font-weight:800;font-size:1rem!important}
.lp-foot-contact{display:flex;flex-direction:column;gap:4px;margin-top:16px}
.lp-foot-tel{text-decoration:none;font-weight:800;font-size:1.15rem}
.lp-foot-tel span{display:block;font-size:.8rem;font-weight:600;color:rgba(248,250,252,.6)}
.lp-foot a.lp-foot-cta{margin-top:18px;width:auto!important;color:#0f172a;background:#f59e0b;text-decoration:none}
.lp-foot a.lp-foot-cta:hover{background:#d97706}
.lp-addr{display:grid;gap:14px}
.lp-addr li{display:flex;flex-direction:column;font-size:.95rem}
.lp-addr strong{font-size:.85rem;color:rgba(248,250,252,.6);font-weight:600}
.lp-addr span{color:#f8fafc}
.lp-foot-links{display:grid;gap:10px;font-size:.95rem}
.lp-foot-links a,.lp-foot-legal a{text-decoration:none}
.lp-foot-links a:hover,.lp-foot-legal a:hover{text-decoration:underline}
.lp-foot-bottom{margin-top:36px;padding-top:18px;border-top:1px solid rgba(255,255,255,.12);display:flex;justify-content:space-between;gap:12px 32px;flex-wrap:wrap;align-items:flex-start}
.lp-foot-bottom p{margin:0!important;max-width:none}
.lp-legal{font-size:.85rem!important;margin-top:4px!important}
.lp-copy{font-size:.85rem!important;color:rgba(248,250,252,.85)!important}
.lp-foot-legal{display:flex;flex-wrap:wrap;gap:8px 20px;font-size:.85rem}
.lp-foot-legal a{color:rgba(248,250,252,.8)}
/* ---- Landing quảng cáo: mở đầu + form, lộ trình, công cụ, ảnh + nội dung, giảng viên, thanh đăng ký nhanh ---- */
.lp-lead-hero{padding:40px 0 56px}
/* Máy tính: ảnh phía trên cột phải, form đè lên mép dưới ảnh — hai cột cân nhau, form vẫn nằm trong màn hình đầu */
.lp-lead-hero .lp-wrap{display:grid;grid-template-columns:1.08fr .92fr;grid-template-areas:"text pic" "text form";grid-template-rows:auto 1fr;gap:0 44px;align-items:start}
.lp-lead-hero .lp-hero-text{grid-area:text;padding-top:8px}
.lp-lead-hero .lp-hero-form{grid-area:form;position:relative;z-index:1;margin:-96px 12px 0}
.lp-lead-hero .lp-hero-pic{grid-area:pic}
.lp-lead-hero .lp-hero-pic img{aspect-ratio:4/3;box-shadow:0 24px 50px -30px rgba(15,23,42,.35)}
.lp-lead-hero h1{font-size:clamp(1.9rem,4.4vw,3rem)}
.lp-lead-hero .lp-form-card{padding:22px 20px 18px;border:2px solid var(--accent,#f59e0b);box-shadow:0 26px 60px -30px rgba(15,23,42,.45)}
.lp-form-card>.lp-form-title,.lp-form-card>.lp-form-note{padding:0}
.lp-form-title{font-size:1.3rem;font-weight:800;line-height:1.25;color:var(--lp-ink);text-wrap:balance}
.lp-form-card>.lp-form-title{color:var(--lp-ink)}
.lp-form-note{margin-top:6px!important;color:var(--lp-mut);font-size:.92rem}
.lp-ticks{display:grid;gap:10px;margin-top:20px}
.lp-ticks li{position:relative;padding-left:32px;font-weight:600}
.lp-ticks li::before{content:"✓";position:absolute;left:0;top:1px;width:22px;height:22px;border-radius:50%;background:var(--success,#10b981);color:#fff;font-size:.8rem;display:grid;place-items:center;font-weight:800}
.lp-kicker{font-size:.8rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#047857;margin-bottom:10px!important}
.lp-note{margin-top:18px!important;color:var(--lp-mut);font-size:.95rem}
.lp-road{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:18px;counter-reset:r}
.lp-road-step{position:relative;background:#fff;border:1px solid var(--lp-line);border-top:6px solid var(--primary,#1d4ed8);border-radius:var(--lp-r);padding:20px;display:flex;flex-direction:column;gap:8px}
.lp-road-1{border-top-color:var(--success,#10b981)}
.lp-road-2{border-top-color:var(--accent,#f59e0b)}
.lp-road-step:not(:last-child)::after{content:"→";position:absolute;right:-17px;top:42%;width:26px;height:26px;border-radius:50%;background:var(--primary,#1d4ed8);color:#fff;display:grid;place-items:center;font-weight:800;z-index:1}
.lp-road-no{font-size:.8rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--primary-ink,var(--primary,#1d4ed8))}
.lp-road-step h3{font-size:1.15rem}
.lp-road-step p{color:var(--lp-mut)}
.lp-grid-tools{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.lp-tool figure{margin:-24px -24px 6px}
.lp-tool img{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:var(--lp-r) var(--lp-r) 0 0;border-bottom:1px solid var(--lp-line)}
.lp-tool figcaption{font-size:.72rem;color:#64748b;padding:6px 24px 0}
.lp-split-in{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}
.lp-flip .lp-split-pic{order:-1}
.lp-split-text h2{font-size:clamp(1.55rem,3.2vw,2.2rem)}
.lp-split-body{margin-top:12px!important;color:var(--lp-mut);font-size:1.05rem}
.lp-split-pic img{width:100%;border-radius:calc(var(--lp-r) + 6px);aspect-ratio:4/3;object-fit:cover;box-shadow:0 24px 50px -32px rgba(15,23,42,.4)}
.lp-teacher-in{display:grid;grid-template-columns:280px 1fr 300px;gap:32px;align-items:center}
.lp-teacher-photo{margin:0;border-radius:calc(var(--lp-r) + 4px);overflow:hidden;background:#0f172a}
.lp-teacher-photo img{width:100%;aspect-ratio:4/5;object-fit:cover}
.lp-teacher-photo figcaption{padding:14px 18px;color:#fff;display:flex;flex-direction:column}
.lp-teacher-photo figcaption span{color:#fcd34d;font-size:.9rem;font-weight:600}
.lp-teacher-info>p{color:var(--lp-mut)}
.lp-teacher-pts{display:grid;gap:12px;margin:16px 0}
.lp-teacher-pts li{display:flex;flex-direction:column;padding-left:16px;border-left:4px solid var(--success,#10b981)}
.lp-teacher-pts span{color:var(--lp-mut);font-size:.95rem}
.lp-teacher-info blockquote{margin:18px 0 0;padding:16px 18px;background:#ecfdf5;border-left:6px solid var(--success,#10b981);border-radius:12px;font-weight:700}
.lp-teacher-cert{margin:0}
.lp-teacher-cert img{width:100%;border:1px solid var(--lp-line);border-radius:12px;background:#fff}
.lp-teacher-cert figcaption{margin-top:8px;text-align:center;color:var(--lp-mut);font-size:.88rem}
.lp-sticky{display:none}
.lp-lead-form{display:grid;gap:12px;margin-top:14px;position:relative}
.lp-f label{display:block;font-weight:700;font-size:.9rem;margin-bottom:4px;color:var(--lp-ink)}
.lp-f input,.lp-f select{width:100%;min-height:48px;padding:10px 14px;border:1.5px solid #cbd5e1;border-radius:12px;font:inherit;font-size:1rem;background:#fff;color:var(--lp-ink)}
.lp-f input:focus,.lp-f select:focus{outline:none;border-color:var(--primary,#1d4ed8);box-shadow:0 0 0 3px rgba(29,78,216,.18)}
.lp-f input[aria-invalid="true"]{border-color:#b91c1c}
.lp-f-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.lp-f-err{color:#b91c1c;font-size:.86rem;margin-top:4px!important}
.lp-consent{display:flex;gap:8px;align-items:flex-start;font-size:.82rem;color:var(--lp-mut);line-height:1.45}
.lp-consent input{margin-top:3px;width:18px;height:18px;flex:none;accent-color:var(--primary,#1d4ed8)}
.lp-consent a{color:var(--primary-ink,var(--primary,#1d4ed8))}
.lp-submit{width:100%;min-height:54px;font-size:1.05rem;cursor:pointer}
.lp-submit:disabled{opacity:.7;cursor:progress}
.lp-privacy{text-align:center;font-size:.78rem;color:#64748b}
.lp-hp{position:absolute!important;left:-9999px;width:1px;height:1px;opacity:0}
.lp-lead-done{padding:18px 6px 6px;display:grid;gap:8px}
.lp-lead-done-title{font-size:1.25rem;font-weight:800;color:#047857}
.lp-lead-done ul{list-style:disc;padding-left:20px;color:var(--lp-mut);display:grid;gap:4px}
.lp-form .lp-form-card .lp-lead-form{padding:6px 16px 16px;margin-top:4px}
/* ---- Trang chính: khối kể chuyện (số liệu có nguồn, so sánh, tab chuyên ngành, trước → sau) ---- */
.lp-sec{scroll-margin-top:72px}
.lp-head .lp-kicker+h2{margin-top:2px}
.lp-src{font-size:.78rem;color:#64748b;margin-top:auto!important;padding-top:10px}
.lp-src a{color:inherit;text-decoration:underline;text-underline-offset:2px}
.lp-ins-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}
.lp-ins{display:flex;flex-direction:column;gap:6px;background:#fff;border:1px solid var(--lp-line);border-radius:var(--lp-r);padding:22px 20px;position:relative;overflow:hidden}
.lp-ins::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--primary,#1d4ed8)}
.lp-ins:nth-child(3n+2)::before{background:var(--success,#10b981)}
.lp-ins:nth-child(3n)::before{background:var(--accent,#f59e0b)}
.lp-ins-val{font-size:clamp(2.1rem,4.4vw,2.9rem);font-weight:800;line-height:1.05;letter-spacing:-.02em;color:var(--primary-ink,var(--primary,#1d4ed8))}
.lp-ins-lbl{font-weight:700;font-size:1.02rem;line-height:1.4}
.lp-ins-txt{color:var(--lp-mut);font-size:.94rem}
.lp-ins-close{margin-top:28px!important;max-width:760px;font-size:clamp(1.1rem,2.2vw,1.35rem);font-weight:700;line-height:1.45;padding-left:18px;border-left:4px solid var(--accent,#f59e0b)}
.lp-dark{background:radial-gradient(900px 420px at 85% -10%,rgba(29,78,216,.45),transparent 60%),radial-gradient(700px 380px at -10% 110%,rgba(16,185,129,.22),transparent 60%),#0f172a;color:#f8fafc}
.lp-dark .lp-head p{color:rgba(248,250,252,.78)}
.lp-dark .lp-kicker{color:#fcd34d}
.lp-dark .lp-ins{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.12);backdrop-filter:blur(2px)}
.lp-dark .lp-ins-val{color:#fbbf24}
.lp-dark .lp-ins-txt,.lp-dark .lp-src{color:rgba(248,250,252,.7)}
.lp-dark .lp-ins-close{color:#fff}
.lp-vs-pic{margin:0 0 26px}
.lp-vs-pic img{width:100%;border-radius:calc(var(--lp-r) + 6px)}
.lp-ico{display:inline-grid;place-items:center;width:48px;height:48px;border-radius:14px;flex:none;background:#dbeafe;color:#1e40af}
.lp-ico-1{background:#d1fae5;color:#047857}
.lp-ico-2{background:#fef3c7;color:#b45309}
.lp-credit{display:block;margin-top:2px;font-size:.78rem;color:#64748b}
.lp-credit a,.lp-tab-pic figcaption a{color:inherit;text-decoration:underline;text-underline-offset:2px}
.lp-vs{display:grid;grid-template-columns:1fr auto 1fr;gap:18px;align-items:stretch}
.lp-vs-one{grid-template-columns:1fr}
.lp-vs-col{border-radius:calc(var(--lp-r) + 4px);padding:26px 24px;border:1px solid var(--lp-line);background:#fff}
.lp-vs-col h3{font-size:1.15rem;margin-bottom:14px}
.lp-vs-col ul{display:grid;gap:10px}
.lp-vs-col li{position:relative;padding-left:32px}
.lp-vs-l{background:#f1f5f9;color:#475569}
.lp-vs-l h3{color:#475569}
.lp-vs-l li::before{content:"";position:absolute;left:4px;top:11px;width:14px;height:2px;background:#94a3b8;border-radius:2px}
.lp-vs-r{border:2px solid var(--success,#10b981);box-shadow:0 24px 50px -32px rgba(5,150,105,.55)}
.lp-vs-r h3{color:#047857}
.lp-vs-r li{font-weight:600}
.lp-vs-r li::before{content:"✓";position:absolute;left:0;top:2px;width:22px;height:22px;border-radius:50%;background:var(--success,#10b981);color:#fff;font-size:.78rem;display:grid;place-items:center;font-weight:800}
.lp-vs-arrow{align-self:center;display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:var(--accent,#f59e0b);color:#0f172a;font-weight:800;font-size:1.3rem}
.lp-tabs{position:relative}
.lp-tab-in{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
.lp-tab-bar{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:22px}
.lp-tab-bar label{cursor:pointer;padding:10px 18px;border-radius:999px;border:1.5px solid var(--lp-line);background:#fff;font-weight:700;font-size:.95rem;transition:background .2s,color .2s,box-shadow .2s;user-select:none;white-space:nowrap}
.lp-tab-bar label:hover{border-color:var(--primary,#1d4ed8)}
.lp-tab-panel{display:none;grid-template-columns:1.05fr 1fr;gap:36px;align-items:center;background:#fff;border:1px solid var(--lp-line);border-radius:calc(var(--lp-r) + 6px);padding:28px;animation:lp-fade .35s ease both}
.lp-tab-pic{margin:0}
.lp-tab-pic figcaption{font-size:.78rem;color:#64748b;margin-top:6px}
.lp-frame{border-radius:14px;overflow:hidden;border:1px solid var(--lp-line);background:#fff;box-shadow:0 30px 60px -36px rgba(15,23,42,.45)}
.lp-frame>span{display:block;height:26px;background:#f1f5f9;border-bottom:1px solid var(--lp-line);position:relative}
.lp-frame>span::before{content:"";position:absolute;left:12px;top:9px;width:8px;height:8px;border-radius:50%;background:#f87171;box-shadow:13px 0 0 #fbbf24,26px 0 0 #34d399}
.lp-frame img{width:100%;aspect-ratio:16/10;object-fit:cover}
.lp-tab-body{display:flex;flex-direction:column;gap:10px}
.lp-tab-body h3{font-size:clamp(1.3rem,2.6vw,1.65rem)}
.lp-tab-body>p{color:var(--lp-mut)}
.lp-tab-hook{color:var(--primary-ink,#1e40af)!important;font-weight:700}
.lp-tab-sub{margin-top:6px!important;font-size:.78rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#047857!important}
.lp-tab-body .lp-ticks{margin-top:0}
.lp-tab-tools{font-size:.88rem;border-top:1px dashed var(--lp-line);padding-top:10px;margin-top:4px!important}
.lp-tab-more{margin-top:18px!important}
.lp-tab-in:nth-of-type(1):checked~.lp-tab-panels>.lp-tab-panel:nth-child(1){display:grid}
.lp-tab-in:nth-of-type(1):checked~.lp-tab-bar>label:nth-child(1){background:var(--primary,#1d4ed8);color:#fff;border-color:var(--primary,#1d4ed8);box-shadow:0 10px 24px -14px var(--primary,#1d4ed8)}
.lp-tab-in:nth-of-type(1):focus-visible~.lp-tab-bar>label:nth-child(1){outline:3px solid var(--accent,#f59e0b);outline-offset:2px}
.lp-tab-in:nth-of-type(2):checked~.lp-tab-panels>.lp-tab-panel:nth-child(2){display:grid}
.lp-tab-in:nth-of-type(2):checked~.lp-tab-bar>label:nth-child(2){background:var(--primary,#1d4ed8);color:#fff;border-color:var(--primary,#1d4ed8);box-shadow:0 10px 24px -14px var(--primary,#1d4ed8)}
.lp-tab-in:nth-of-type(2):focus-visible~.lp-tab-bar>label:nth-child(2){outline:3px solid var(--accent,#f59e0b);outline-offset:2px}
.lp-tab-in:nth-of-type(3):checked~.lp-tab-panels>.lp-tab-panel:nth-child(3){display:grid}
.lp-tab-in:nth-of-type(3):checked~.lp-tab-bar>label:nth-child(3){background:var(--primary,#1d4ed8);color:#fff;border-color:var(--primary,#1d4ed8);box-shadow:0 10px 24px -14px var(--primary,#1d4ed8)}
.lp-tab-in:nth-of-type(3):focus-visible~.lp-tab-bar>label:nth-child(3){outline:3px solid var(--accent,#f59e0b);outline-offset:2px}
.lp-tab-in:nth-of-type(4):checked~.lp-tab-panels>.lp-tab-panel:nth-child(4){display:grid}
.lp-tab-in:nth-of-type(4):checked~.lp-tab-bar>label:nth-child(4){background:var(--primary,#1d4ed8);color:#fff;border-color:var(--primary,#1d4ed8);box-shadow:0 10px 24px -14px var(--primary,#1d4ed8)}
.lp-tab-in:nth-of-type(4):focus-visible~.lp-tab-bar>label:nth-child(4){outline:3px solid var(--accent,#f59e0b);outline-offset:2px}
.lp-tab-in:nth-of-type(5):checked~.lp-tab-panels>.lp-tab-panel:nth-child(5){display:grid}
.lp-tab-in:nth-of-type(5):checked~.lp-tab-bar>label:nth-child(5){background:var(--primary,#1d4ed8);color:#fff;border-color:var(--primary,#1d4ed8);box-shadow:0 10px 24px -14px var(--primary,#1d4ed8)}
.lp-tab-in:nth-of-type(5):focus-visible~.lp-tab-bar>label:nth-child(5){outline:3px solid var(--accent,#f59e0b);outline-offset:2px}
.lp-tab-in:nth-of-type(6):checked~.lp-tab-panels>.lp-tab-panel:nth-child(6){display:grid}
.lp-tab-in:nth-of-type(6):checked~.lp-tab-bar>label:nth-child(6){background:var(--primary,#1d4ed8);color:#fff;border-color:var(--primary,#1d4ed8);box-shadow:0 10px 24px -14px var(--primary,#1d4ed8)}
.lp-tab-in:nth-of-type(6):focus-visible~.lp-tab-bar>label:nth-child(6){outline:3px solid var(--accent,#f59e0b);outline-offset:2px}
.lp-chg-in{display:grid;gap:28px}
.lp-change.has-pic .lp-chg-in{grid-template-columns:1.5fr 1fr;align-items:center}
.lp-chg{display:grid;gap:10px}
.lp-chg li{display:grid;grid-template-columns:minmax(130px,.8fr) 1fr 1.25fr;gap:14px;align-items:center;background:#fff;border:1px solid var(--lp-line);border-radius:14px;padding:14px 18px}
.lp-chg-area{font-size:.98rem}
.lp-chg em{display:none;font-style:normal;font-size:.7rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
.lp-chg-b{color:#64748b;font-size:.95rem}
.lp-chg-a{color:#065f46;font-weight:600;font-size:.95rem;position:relative;padding-left:28px}
.lp-chg-a::before{content:"→";position:absolute;left:0;top:-1px;color:var(--success,#10b981);font-weight:800}
.lp-chg-pic img{width:100%;border-radius:calc(var(--lp-r) + 6px)}
.lp-steps-list{grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}
@media (min-width:861px){.lp-features .lp-grid:has(>li:nth-child(5)),.lp-photos:has(>li:nth-child(5)){grid-template-columns:repeat(3,1fr)}.lp-photos:has(>li:nth-child(7)){grid-template-columns:repeat(4,1fr)}}
.lp-nav a{white-space:nowrap}
.lp-consent-bar{position:fixed;left:16px;bottom:16px;z-index:40;max-width:440px;background:#fff;border:1px solid var(--lp-line);border-radius:16px;box-shadow:0 20px 50px -20px rgba(15,23,42,.45);padding:14px 16px;display:grid;gap:10px;font-size:.88rem;color:var(--lp-mut)}
.lp-consent-bar a{color:var(--primary-ink,#1d4ed8)}
.lp-consent-bar>div{display:flex;gap:8px;justify-content:flex-end}
.lp-consent-bar .lp-btn{width:auto;cursor:pointer;font:inherit;font-weight:700}
@media (max-width:860px){.lp-consent-bar{left:10px;right:10px;bottom:84px;max-width:none}}
@media (max-width:1320px){.lp-top .lp-tel{display:none}.lp-nav{gap:18px}}
@media (min-width:561px) and (max-width:1024px){.lp-ins-list{grid-template-columns:1fr 1fr}}
@media (max-width:600px){.lp-photos{grid-template-columns:1fr 1fr;gap:12px}.lp-photos figcaption{font-size:.8rem;line-height:1.4}}
@media (max-width:1100px){.lp-top .lp-nav,.lp-top .lp-tel{display:none}.lp-top .lp-menu{display:block}}
.lp-steps-list li{flex-direction:column;gap:12px}
@keyframes lp-fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes lp-rise{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:no-preference){@supports (animation-timeline:view()){
 .lp-sec:not(.lp-hero) .lp-head,.lp-ins-list>li,.lp-grid>li,.lp-chg>li,.lp-vs-col,.lp-steps-list>li,.lp-photos>li,.lp-faq-list>details,.lp-teacher-in>*,.lp-road>li,.lp-ins-close{animation:lp-rise linear both;animation-timeline:view();animation-range:entry 0% entry 55%}
}}
@media (prefers-reduced-motion:reduce){.lp-tab-panel{animation:none}}
@media (max-width:860px){
 .lp-vs{grid-template-columns:1fr}
 .lp-vs-arrow{justify-self:center;transform:rotate(90deg)}
 .lp-tab-bar{flex-wrap:nowrap;overflow-x:auto;margin:0 -20px 18px;padding:2px 20px 6px;scrollbar-width:none}
 .lp-tab-bar::-webkit-scrollbar{display:none}
 .lp-tab-panel{grid-template-columns:1fr;padding:18px;gap:20px}
 .lp-change.has-pic .lp-chg-in{grid-template-columns:1fr}
 .lp-chg-pic{order:-1;max-width:420px}
 .lp-chg li{grid-template-columns:1fr;gap:6px}
 .lp-chg em{display:block;color:#94a3b8}
 .lp-chg-a em{color:#047857}
 .lp-chg-a{padding-left:0}
 .lp-chg-a::before{content:none}
}
@media (max-width:380px){.lp-f-row{grid-template-columns:1fr}.lp-submit,.lp-trial-act .lp-btn{font-size:.95rem;padding-left:12px;padding-right:12px}}
/* ---- Giá trị buổi học trải nghiệm ---- */
.lp-trial-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;counter-reset:none}
.lp-trial-step{display:flex;gap:14px;align-items:flex-start;background:#fff;border:1px solid var(--lp-line);border-radius:var(--lp-r);padding:20px}
.lp-trial-no{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:var(--accent,#f59e0b);color:#0f172a;font-weight:800;font-size:1.1rem}
.lp-trial-who{font-size:.8rem;font-weight:800;color:var(--primary-ink,#1e40af);margin-bottom:2px!important}
.lp-trial-step h3{font-size:1.08rem}
.lp-trial-step p:not(.lp-trial-who){color:var(--lp-mut);font-size:.95rem;margin-top:4px}
.lp-trial-card{margin-top:24px;background:#fff;border:1px solid var(--lp-line);border-radius:calc(var(--lp-r) + 6px);padding:28px;display:grid;grid-template-columns:1.4fr 1fr;gap:28px;align-items:center}
.lp-trial-left{display:flex;flex-direction:column;gap:22px;justify-content:center}
.lp-trial-gt{font-size:clamp(1.25rem,2.4vw,1.6rem)}
.lp-trial-gains{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.lp-trial-gains li{display:flex;gap:12px;align-items:flex-start}
.lp-trial-gains h4{margin:0;font-size:1.02rem;line-height:1.3}
.lp-trial-gains p{color:var(--lp-mut);font-size:.93rem;margin-top:3px}
.lp-trial-act{display:flex;flex-direction:column;gap:6px}
.lp-trial-act .lp-actions{margin-top:10px;flex-direction:column}
.lp-trial-act .lp-btn{width:100%}
.lp-trial-badge{align-self:flex-start;background:#d1fae5;color:#047857;font-weight:800;border-radius:999px;padding:8px 16px;font-size:.95rem}
.lp-trial-note{font-size:.85rem;color:#64748b;margin-top:6px!important}
@media (max-width:860px){.lp-trial-card{grid-template-columns:1fr;padding:22px}.lp-trial-gains{grid-template-columns:1fr}}
/* chữ: không để một từ lẻ rơi xuống dòng cuối, không tràn khung */
:where(.lp) :where(p,li,figcaption,summary){text-wrap:pretty;overflow-wrap:break-word}
:where(.lp) :where(h1,h2,h3,h4){overflow-wrap:break-word;hyphens:none}
/*@v:soft*/
.lp--soft{--lp-bg:#f8fafc;--lp-alt:#ffffff;--lp-r:24px}
.lp--soft .lp-hero{background:linear-gradient(180deg,#fef3c7,#f8fafc)}
.lp--soft .lp-sec{padding:76px 0}
/*@/v*//*@v:bold*/
.lp--bold{--lp-r:12px}
.lp--bold .lp-hero{background:linear-gradient(135deg,var(--primary,#1d4ed8),var(--primary-dark,#1e40af));color:var(--primary-foreground,#fff)}
.lp--bold .lp-hero .lp-lead{color:inherit;opacity:.92}
.lp--bold .lp-eyebrow{background:rgba(255,255,255,.16);color:inherit}
.lp--bold .lp-btn-ghost{color:inherit}
.lp--bold .lp-btn-primary{background:var(--accent,#f59e0b);color:var(--accent-foreground,#0f172a);box-shadow:none}
.lp--bold .lp-hero h1{font-size:clamp(2.2rem,5.6vw,3.9rem)}
/*@/v*/
@media (max-width:860px){
 .lp-hero.has-pic .lp-wrap{grid-template-columns:1fr}
 .lp-lead-hero{padding:24px 0 40px}
 .lp-lead-hero .lp-wrap{grid-template-columns:1fr;grid-template-areas:"text" "form" "pic";grid-template-rows:none;gap:20px}
 .lp-lead-hero .lp-hero-form{margin:0}
 .lp-lead-hero .lp-ticks{display:none}
 .lp-lead-hero .lp-badges{margin-top:14px}
 .lp-split-in,.lp-teacher-in{grid-template-columns:1fr;gap:24px}
 .lp-flip .lp-split-pic{order:0}
 .lp-teacher-photo{max-width:320px}
 .lp-road-step:not(:last-child)::after{content:"↓";right:auto;left:50%;top:auto;bottom:-17px;transform:translateX(-50%)}
 .lp-sticky{display:flex;gap:10px;position:fixed;left:0;right:0;bottom:0;z-index:30;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:rgba(255,255,255,.96);border-top:1px solid var(--lp-line);box-shadow:0 -8px 24px -12px rgba(15,23,42,.25)}
 .lp-sticky .lp-btn{flex:1;min-height:46px;padding:10px 12px;font-size:.95rem;width:auto}
 .lp:has(.lp-sticky){padding-bottom:72px}
 .lp:has(.lp-sticky) .lp-top-r .lp-btn{display:none}
 .lp-nav,.lp-tel{display:none}
 .lp-menu{display:block}
 .lp-foot-grid{grid-template-columns:1fr 1fr;gap:32px 24px}
 .lp-foot-brandcol{grid-column:1/-1}
 .lp-tl li{grid-template-columns:1fr;gap:4px}
 .lp-sec{padding:48px 0}
}
@media (max-width:560px){.lp-top .lp-btn-sm{padding:8px 12px;font-size:.85rem;min-height:40px}.lp-brand img.lp-lockup{max-width:48vw}.lp-top-in{gap:10px}}
@media (max-width:480px){.lp-brand img.lp-lockup{max-width:46vw}.lp-btn{width:100%}.lp-actions{flex-direction:column}.lp-top .lp-btn{width:auto}}
@media (max-width:440px){.lp .lp-top .lp-top-in{padding:0 12px;gap:8px}.lp .lp-top .lp-btn-sm{padding:8px 10px;font-size:.8rem}.lp .lp-brand{min-width:0}.lp .lp-brand img.lp-lockup{max-width:calc(100vw - 240px)}}
@media (prefers-reduced-motion:reduce){.lp *{transition:none!important}}
@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}
.lp-hl{font-style:normal;color:var(--primary,#1d4ed8)}
/* ảnh minh hoạ của lưới "Vì sao yên tâm": hiện TRỌN ảnh (không cắt mép), căn giữa trên nền trắng như một thẻ */
.lp-bento-pic{grid-row:span 3;align-self:center;border-radius:28px;overflow:hidden}
.lp-bento-pic img{width:100%;height:auto}
@media (max-width:1000px){.lp-bento-pic{grid-row:auto;grid-column:1/-1;max-width:640px;justify-self:center}}
/*@v:studio*/
/* ================= KIỂU "STUDIO" — trang chính (DESIGN.md ở gốc repo) ================= */
.lp--studio{--lp-ink:#0f172a;--lp-mut:#475569;--lp-line:#e2e8f0;--lp-alt:#f8fafc;--lp-r:20px;font-size:17px;line-height:1.65;background:#fff}
.lp--studio .lp-wrap{max-width:1248px;padding:0 24px}
.lp--studio .lp-sec{padding:120px 0}
.lp--studio .lp-alt{background:#f8fafc}
.lp--studio .lp-head{max-width:760px;margin:0 0 48px}
.lp--studio .lp-head :is(h1,h2){font-size:clamp(1.75rem,3.6vw,2.75rem);font-weight:800;line-height:1.12;letter-spacing:-.02em}
.lp--studio .lp-head p{margin-top:16px;font-size:1.15rem;line-height:1.6;color:#475569}
.lp--studio .lp-kicker{font-size:.8rem;color:#1e40af;letter-spacing:.14em;margin-bottom:14px!important}
.lp--studio .lp-btn{min-height:52px;padding:14px 26px;font-weight:700}
.lp--studio .lp-btn-sm{min-height:44px;padding:10px 20px}
.lp--studio .lp-btn-primary{box-shadow:none}
.lp--studio .lp-btn-primary:hover{transform:none}
.lp--studio .lp-btn-ghost{color:#0f172a;border-width:1.5px}
/* thanh menu nổi dạng viên thuốc */
.lp--studio .lp-top{top:12px;width:calc(100% - 32px);max-width:1216px;margin:12px auto 0;border:1px solid var(--lp-line);border-radius:999px;background:rgba(255,255,255,.9);backdrop-filter:blur(10px);box-shadow:0 24px 60px -24px rgba(15,23,42,.28)}
.lp--studio .lp-top-in{min-height:64px;padding:0 10px 0 22px}
.lp--studio .lp-nav a{color:#334155;font-weight:600}
.lp--studio .lp-brand img.lp-lockup{width:210px}
/* mở đầu */
.lp--studio .lp-lead-hero{padding:64px 0 104px;background:radial-gradient(900px 420px at 88% 8%,#dbeafe 0,rgba(219,234,254,0) 70%),#fff}
.lp--studio .lp-lead-hero .lp-wrap{gap:0 56px}
.lp--studio .lp-lead-hero h1{font-size:clamp(2.25rem,5.2vw,3.75rem);line-height:1.05;letter-spacing:-.03em;font-weight:800}
.lp--studio .lp-eyebrow{background:#fef3c7;color:#b45309;font-size:.85rem;padding:7px 14px}
.lp--studio .lp-lead{font-size:1.2rem;line-height:1.6;color:#475569;margin-top:20px;max-width:580px}
.lp--studio .lp-ticks{gap:12px;margin-top:28px}
.lp--studio .lp-ticks li{font-weight:600;color:#0f172a}
.lp--studio .lp-badges{gap:10px 22px;margin-top:28px}
.lp--studio .lp-badges li{background:transparent;border:0;padding:0;color:#475569;font-weight:600}
.lp--studio .lp-badges li::before{content:"✓ ";color:#047857;font-weight:800}
.lp--studio .lp-lead-hero .lp-hero-pic img{border-radius:28px;aspect-ratio:4/3;box-shadow:none}
.lp--studio .lp-lead-hero .lp-hero-form{margin:-150px 24px 0}
.lp--studio .lp-lead-hero .lp-form-card{border:1px solid var(--lp-line);border-radius:24px;padding:28px 26px 22px;box-shadow:0 24px 60px -24px rgba(15,23,42,.28)}
.lp--studio .lp-f input,.lp--studio .lp-f select{min-height:52px;border-radius:12px}
.lp--studio .lp-f input:focus,.lp--studio .lp-f select:focus{box-shadow:0 0 0 3px #dbeafe}
/* số liệu: hàng số lớn kiểu biên tập, không thẻ */
.lp--studio .lp-ins-list{gap:40px 32px}
.lp--studio .lp-ins{background:transparent;border:0;border-top:2px solid #e2e8f0;border-radius:0;padding:24px 0 0}
.lp--studio .lp-ins::before{display:none}
.lp--studio .lp-ins-val{font-size:clamp(2.6rem,5vw,3.6rem);letter-spacing:-.03em}
.lp--studio .lp-dark .lp-ins{background:transparent;border-top-color:rgba(255,255,255,.18);backdrop-filter:none}
.lp--studio .lp-dark{background:#0f172a}
.lp--studio .lp-dark .lp-kicker{color:#fcd34d}
.lp--studio .lp-dark .lp-head p{color:rgba(248,250,252,.78)}
.lp--studio .lp-dark .lp-hl{color:#fbbf24}
.lp--studio .lp-ins-close{margin-top:56px!important;font-size:clamp(1.2rem,2.4vw,1.5rem);max-width:820px}
/* so sánh */
.lp--studio .lp-vs-col{border-radius:24px;padding:32px}
.lp--studio .lp-vs-l{background:#f8fafc;border:1px solid var(--lp-line)}
.lp--studio .lp-vs-r{box-shadow:none;border:1.5px solid #10b981;background:#fff}
/* tab chuyên ngành: thanh trượt */
.lp--studio .lp-tab-bar{display:inline-flex;flex-wrap:nowrap;gap:4px;padding:6px;border-radius:999px;background:#f1f5f9;margin-bottom:40px;max-width:100%;overflow-x:auto;scrollbar-width:none}
.lp--studio .lp-tab-bar::-webkit-scrollbar{display:none}
.lp--studio .lp-tab-bar label{border:0;background:transparent;color:#475569;padding:10px 22px}
.lp--studio .lp-tab-bar label:hover{color:#0f172a}
.lp--studio .lp-tab-in:nth-of-type(1):checked~.lp-tab-bar>label:nth-child(1){background:#fff;color:#0f172a;border-color:transparent;box-shadow:0 1px 3px rgba(15,23,42,.14)}
.lp--studio .lp-tab-in:nth-of-type(2):checked~.lp-tab-bar>label:nth-child(2){background:#fff;color:#0f172a;border-color:transparent;box-shadow:0 1px 3px rgba(15,23,42,.14)}
.lp--studio .lp-tab-in:nth-of-type(3):checked~.lp-tab-bar>label:nth-child(3){background:#fff;color:#0f172a;border-color:transparent;box-shadow:0 1px 3px rgba(15,23,42,.14)}
.lp--studio .lp-tab-in:nth-of-type(4):checked~.lp-tab-bar>label:nth-child(4){background:#fff;color:#0f172a;border-color:transparent;box-shadow:0 1px 3px rgba(15,23,42,.14)}
.lp--studio .lp-tab-in:nth-of-type(5):checked~.lp-tab-bar>label:nth-child(5){background:#fff;color:#0f172a;border-color:transparent;box-shadow:0 1px 3px rgba(15,23,42,.14)}
.lp--studio .lp-tab-in:nth-of-type(6):checked~.lp-tab-bar>label:nth-child(6){background:#fff;color:#0f172a;border-color:transparent;box-shadow:0 1px 3px rgba(15,23,42,.14)}
.lp--studio .lp-tab-panel{border:0;background:transparent;padding:0;gap:64px;grid-template-columns:1.1fr 1fr}
.lp--studio .lp-frame{border-radius:20px;box-shadow:0 24px 60px -32px rgba(15,23,42,.35)}
.lp--studio .lp-tab-body h3{font-size:clamp(1.5rem,2.8vw,2rem);letter-spacing:-.02em}
.lp--studio .lp-tab-hook{font-size:1.1rem}
/* trước → sau: dòng kẻ, không thẻ */
.lp--studio .lp-chg{gap:0}
.lp--studio .lp-chg li{background:transparent;border:0;border-bottom:1px solid var(--lp-line);border-radius:0;padding:18px 0}
.lp--studio .lp-chg li:first-child{border-top:1px solid var(--lp-line)}
/* lưới bento cho "Vì sao yên tâm" */
.lp--studio .lp-card{border-radius:20px;padding:28px;gap:12px;box-shadow:0 1px 2px rgba(15,23,42,.06)}
.lp--studio .lp-card h3{font-size:1.18rem;letter-spacing:-.01em}
.lp--studio .lp-bento.lp-features .lp-grid.lp-grid{grid-template-columns:1.15fr 1fr 1fr;gap:20px}
/* một buổi học: dòng thời gian nối liền */
.lp--studio .lp-steps-list{grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:0}
.lp--studio .lp-steps-list li{background:transparent;border:0;border-radius:0;padding:0 24px 0 0;position:relative}
.lp--studio .lp-steps-list li::before{content:"";position:absolute;left:60px;right:12px;top:24px;height:2px;background:#e2e8f0}
.lp--studio .lp-steps-list li:last-child::before{display:none}
.lp--studio .lp-steps-list h3{font-size:1.15rem}
/* sản phẩm, giảng viên */
.lp--studio .lp-photos{gap:24px}
.lp--studio .lp-photos img{border-radius:20px;aspect-ratio:16/10;border:1px solid var(--lp-line)}
.lp--studio .lp-teacher-photo{border-radius:28px}
/* dải kêu gọi: khối navy bo tròn */
.lp--studio .lp-cta{background:transparent;color:#fff;padding:40px 0}
.lp--studio .lp-cta .lp-wrap{background:#0f172a;border-radius:32px;padding:80px 32px;max-width:1200px}
.lp--studio .lp-cta h2{font-size:clamp(1.75rem,3.6vw,2.75rem);letter-spacing:-.02em}
.lp--studio .lp-cta .lp-btn-light{background:#f59e0b;color:#0f172a}
.lp--studio .lp-cta .lp-btn-light:hover{background:#d97706}
.lp--studio .lp-cta .lp-btn-outline{color:#fff}
/* hỏi đáp: tiêu đề trái, câu hỏi phải */
.lp--studio .lp-faq{border:0;border-bottom:1px solid var(--lp-line);border-radius:0;background:transparent}
.lp--studio .lp-faq summary{padding:20px 44px 20px 0;font-size:1.05rem}
.lp--studio .lp-faq summary::after{right:4px}
.lp--studio .lp-faq>div{padding:0 0 20px}
.lp--studio .lp-faq-list{gap:0;max-width:none;border-top:1px solid var(--lp-line)}
.lp--studio .lp-form-card{border-radius:24px}
@media (min-width:1001px){.lp--studio .lp-faqs .lp-wrap{display:grid;grid-template-columns:1fr 1.7fr;gap:64px;align-items:start}.lp--studio .lp-faqs .lp-head{position:sticky;top:110px}}
@media (max-width:1000px){
 .lp--studio .lp-bento.lp-features .lp-grid.lp-grid{grid-template-columns:1fr 1fr}
}
@media (max-width:860px){
 .lp--studio .lp-sec{padding:72px 0}
 .lp--studio .lp-wrap{padding:0 20px}
 .lp--studio .lp-top{width:calc(100% - 20px);top:8px;margin-top:8px}
 .lp--studio .lp-top-in{padding:0 8px 0 16px;min-height:58px}
 .lp--studio .lp-brand img.lp-lockup{width:170px}
 .lp--studio .lp-lead-hero{padding:32px 0 56px}
 .lp--studio .lp-lead-hero .lp-hero-form{margin:0}
 .lp--studio .lp-lead-hero .lp-form-card{padding:22px 18px 18px}
 .lp--studio .lp-tab-bar{display:flex;margin:0 -20px 28px;padding:6px;border-radius:0 999px 999px 0}
 .lp--studio .lp-tab-panel{gap:24px;grid-template-columns:1fr}
 .lp--studio .lp-steps-list{grid-template-columns:1fr;gap:24px}
 .lp--studio .lp-steps-list li{flex-direction:row;padding:0}
 .lp--studio .lp-steps-list li::before{left:23px;right:auto;top:56px;bottom:-20px;width:2px;height:auto}
 .lp--studio .lp-cta{padding:24px 0}
 .lp--studio .lp-cta .lp-wrap{border-radius:24px;padding:48px 20px;margin:0 12px;width:auto}
 .lp--studio .lp-vs-col{padding:24px}
 .lp--studio .lp-sticky .lp-btn{min-height:48px;padding:8px 10px;font-size:.92rem;white-space:nowrap}
}
@media (max-width:600px){.lp--studio .lp-bento.lp-features .lp-grid.lp-grid{grid-template-columns:1fr}}
/*@/v*/
/* nhãn tab giàu thông tin: chỉ kiểu "sắc màu" hiện biểu tượng + độ tuổi */
.lp-tab-ic,.lp-tab-l small{display:none}
.lp-tab-tx b{font-weight:inherit}
/*@v:vivid*/
/* ================= KIỂU "SẮC MÀU" (vivid) — trang chính, DESIGN.md =================
   Tham khảo cách trường công nghệ Việt trình bày (màu thương hiệu phủ mảng lớn, thẻ chuyên ngành, tiêu đề khối căn giữa),
   giữ bộ nhận diện TH STEAM. Điểm nhớ duy nhất: quỹ đạo vàng của logo (nền đầu trang, gạch dưới cụm từ nhấn, dải kêu gọi). */
.lp--vivid{--v-star:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 0Q13.8 10.2 24 12Q13.8 13.8 12 24Q10.2 13.8 0 12Q10.2 10.2 12 0Z' fill='%23F59E0B'/%3E%3C/svg%3E");--v-line:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 12' preserveAspectRatio='none'%3E%3Cpath d='M3 8.5C50 2.5 130 1.5 197 6' fill='none' stroke='%23F59E0B' stroke-width='5' stroke-linecap='round'/%3E%3C/svg%3E");--v-orb:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 640' preserveAspectRatio='none'%3E%3Cpath d='M-60 560C320 700 980 640 1520 90' fill='none' stroke='%23F59E0B' stroke-width='3' stroke-linecap='round' opacity='.7'/%3E%3Cpath d='M-60 600C380 720 1040 660 1520 170' fill='none' stroke='%23ffffff' stroke-width='1.5' opacity='.18'/%3E%3C/svg%3E");--lp-ink:#0f172a;--lp-mut:#475569;--lp-line:#e2e8f0;--lp-alt:#f8fafc;--lp-r:24px;--v-blue:#1d4ed8;--v-blue-d:#1e40af;--v-navy:#0f172a;--v-green:#10b981;--v-green-d:#047857;--v-gold:#f59e0b;font-size:17px;line-height:1.65;background:#fff}
.lp--vivid .lp-wrap{max-width:1200px;padding:0 24px}
.lp--vivid .lp-sec{padding:96px 0}
.lp--vivid .lp-alt{background:#f8fafc}
.lp--vivid .lp-head{max-width:800px;margin:0 auto 52px;text-align:center}
.lp--vivid .lp-head :is(h1,h2){font-size:clamp(1.8rem,3.8vw,2.7rem);font-weight:800;line-height:1.16;letter-spacing:-.02em}
.lp--vivid .lp-head p{margin:16px auto 0;font-size:1.12rem;line-height:1.6;color:#475569;max-width:680px}
.lp--vivid .lp-kicker{display:inline-block;text-transform:none;letter-spacing:0;font-size:.92rem;font-weight:700;color:#1e40af;background:#dbeafe;border-radius:999px;padding:6px 16px;margin-bottom:16px!important}
.lp--vivid .lp-hl{color:var(--v-blue);background:var(--v-line) no-repeat 0 100%/100% .3em;padding-bottom:.1em}
.lp--vivid .lp-btn{min-height:52px;padding:14px 28px;font-weight:800}
.lp--vivid .lp-btn-sm{min-height:44px;padding:10px 20px}
.lp--vivid .lp-btn-primary{box-shadow:0 10px 24px -12px rgba(180,83,9,.7)}
.lp--vivid .lp-btn-primary:hover{transform:translateY(-1px)}
/* đầu trang */
.lp--vivid .lp-top{background:#fff;border-bottom:1px solid var(--lp-line)}
.lp--vivid .lp-top-in{min-height:72px}
.lp--vivid .lp-brand img.lp-lockup{width:220px}
.lp--vivid .lp-nav a{color:#0f172a;font-weight:600}
.lp--vivid .lp-nav a:hover{color:var(--v-blue)}
.lp--vivid .lp-tel{color:var(--v-blue)}
/* mở đầu: mảng xanh Deep Ocean + quỹ đạo vàng, form trắng bên phải, dải ảnh sản phẩm vắt xuống nền trắng */
.lp--vivid .lp-lead-hero{color:#fff;padding:64px 0 0;background:var(--v-star) no-repeat 93% 64px/30px,var(--v-star) no-repeat 4% 420px/18px,var(--v-orb) no-repeat 0 0/100% 640px,linear-gradient(var(--v-blue),var(--v-blue)) no-repeat 0 0/100% calc(100% - 210px),#fff}
.lp--vivid .lp-lead-hero .lp-wrap{grid-template-columns:1.15fr .85fr;grid-template-areas:"text form" "pic pic";grid-template-rows:auto auto;gap:0 56px;align-items:start}
.lp--vivid .lp-lead-hero .lp-hero-text{padding-top:20px}
.lp--vivid .lp-lead-hero h1{font-size:clamp(2.2rem,4.8vw,3.6rem);line-height:1.1;letter-spacing:-.025em;font-weight:800;color:#fff}
.lp--vivid .lp-lead-hero .lp-hl{color:#fff;padding-bottom:.12em}
.lp--vivid .lp-eyebrow{background:rgba(255,255,255,.14);color:#fff;font-weight:700;font-size:.92rem;padding:7px 16px;border:1px solid rgba(255,255,255,.25)}
.lp--vivid .lp-lead{color:rgba(255,255,255,.88);font-size:1.18rem;line-height:1.6;margin-top:20px;max-width:600px}
.lp--vivid .lp-lead-hero .lp-ticks{margin-top:26px;gap:12px}
.lp--vivid .lp-lead-hero .lp-ticks li{color:#fff;font-weight:600}
.lp--vivid .lp-lead-hero .lp-ticks li::before{background:var(--v-gold);color:#0f172a}
.lp--vivid .lp-lead-hero .lp-badges{margin-top:24px;gap:10px}
.lp--vivid .lp-lead-hero .lp-badges li{background:rgba(15,23,42,.22);border:1px solid rgba(255,255,255,.2);color:#fff;font-weight:600}
.lp--vivid .lp-lead-hero .lp-badges li::before{color:#fcd34d}
.lp--vivid .lp-lead-hero .lp-hero-form{grid-area:form;margin:0;position:relative;z-index:2}
.lp--vivid .lp-lead-hero .lp-form-card{border:0;border-top:6px solid var(--v-gold);border-radius:24px;padding:28px 26px 22px;color:#0f172a;box-shadow:0 30px 70px -30px rgba(2,6,23,.6)}
.lp--vivid .lp-lead-hero .lp-hero-pic{grid-area:pic;margin-top:40px;position:relative}
.lp--vivid .lp-lead-hero .lp-hero-pic img{width:100%;aspect-ratio:2/1;object-fit:contain;border-radius:0;box-shadow:none}
.lp--vivid .lp-lead-hero .lp-hero-pic .lp-credit{text-align:center;padding:6px 0 0;color:#64748b}
.lp--vivid .lp-f input,.lp--vivid .lp-f select{min-height:52px;border-radius:12px}
.lp--vivid .lp-f input:focus,.lp--vivid .lp-f select:focus{box-shadow:0 0 0 3px #dbeafe}
/* số liệu nền tối: tấm navy bo tròn trong khung, số vàng */
.lp--vivid .lp-insights.lp-dark{background:#fff;color:#f8fafc;padding-top:56px}
.lp--vivid .lp-insights.lp-dark .lp-wrap{background:radial-gradient(700px 360px at 100% 0,rgba(29,78,216,.55),transparent 70%),#0f172a;border-radius:32px;padding:72px 56px 64px;max-width:1200px}
.lp--vivid .lp-dark .lp-head :is(h1,h2){color:#fff}
.lp--vivid .lp-dark .lp-hl{color:#fcd34d}
.lp--vivid .lp-dark .lp-kicker{background:rgba(245,158,11,.16);color:#fcd34d}
.lp--vivid .lp-dark .lp-head p{color:rgba(248,250,252,.8)}
.lp--vivid .lp-ins-list{gap:20px}
.lp--vivid .lp-ins{border-radius:20px;padding:26px 24px;border:1px solid var(--lp-line)}
.lp--vivid .lp-ins::before{left:24px;right:auto;top:0;bottom:auto;width:44px;height:5px;border-radius:0 0 6px 6px}
.lp--vivid .lp-ins-val{font-size:clamp(2.4rem,4.6vw,3.2rem);letter-spacing:-.03em}
.lp--vivid .lp-dark .lp-ins{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.12);backdrop-filter:none}
.lp--vivid .lp-dark .lp-ins-val{color:#fbbf24}
.lp--vivid .lp-ins-close{margin:48px auto 0!important;text-align:center;border:0;padding:0;max-width:760px}
/* so sánh */
.lp--vivid .lp-vs{gap:24px}
.lp--vivid .lp-vs-col{border-radius:28px;padding:36px 32px}
.lp--vivid .lp-vs-col h3{font-size:1.3rem}
.lp--vivid .lp-vs-l{background:#f1f5f9;border:0}
.lp--vivid .lp-vs-r{background:#d1fae5;border:0;box-shadow:none;color:#064e3b}
.lp--vivid .lp-vs-r h3{color:#047857}
.lp--vivid .lp-vs-arrow{width:56px;height:56px;font-size:1.5rem;box-shadow:0 10px 24px -10px rgba(180,83,9,.6)}
/* chuyên ngành: 4 thẻ màu để chọn, bảng chi tiết trắng nổi bên dưới */
.lp--vivid .lp-tab-bar{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px}
.lp--vivid .lp-tab-bar label.lp-tab-l{display:flex;align-items:center;gap:14px;padding:20px;border-radius:22px;border:0;white-space:normal;color:#fff;background:var(--v-blue);font-size:1.08rem;position:relative;transition:transform .2s,box-shadow .2s;min-height:96px}
.lp--vivid .lp-tab-bar label.lp-tab-l1{background:var(--v-green-d)}
.lp--vivid .lp-tab-bar label.lp-tab-l2{background:#fef3c7;color:#0f172a}
.lp--vivid .lp-tab-bar label.lp-tab-l3{background:var(--v-navy)}
.lp--vivid .lp-tab-bar label.lp-tab-l:hover{transform:translateY(-2px)}
.lp--vivid .lp-tab-ic{display:grid;place-items:center;width:52px;height:52px;border-radius:16px;background:rgba(255,255,255,.16);flex:none}
.lp--vivid .lp-tab-l2 .lp-tab-ic{background:#f59e0b;color:#0f172a}
.lp--vivid .lp-tab-tx{display:flex;flex-direction:column;line-height:1.3}
.lp--vivid .lp-tab-tx b{font-weight:800}
.lp--vivid .lp-tab-l small{display:block;font-size:.85rem;font-weight:600;opacity:.85;margin-top:2px}
.lp--vivid .lp-tabs .lp-tab-bar label.lp-tab-l.lp-tab-l0{background:var(--v-blue);color:#fff;border-color:transparent}
.lp--vivid .lp-tabs .lp-tab-bar label.lp-tab-l.lp-tab-l1{background:var(--v-green-d);color:#fff;border-color:transparent}
.lp--vivid .lp-tabs .lp-tab-bar label.lp-tab-l.lp-tab-l2{background:#fef3c7;color:#0f172a;border-color:transparent}
.lp--vivid .lp-tabs .lp-tab-bar label.lp-tab-l.lp-tab-l3{background:var(--v-navy);color:#fff;border-color:transparent}
.lp--vivid .lp-tab-in:nth-of-type(1):checked~.lp-tab-bar>label:nth-child(1){box-shadow:0 0 0 4px #fff,0 0 0 7px var(--v-gold),0 18px 30px -16px rgba(15,23,42,.5);transform:translateY(-2px)}
.lp--vivid .lp-tab-in:nth-of-type(1):checked~.lp-tab-bar>label:nth-child(1)::after{content:"";position:absolute;left:50%;bottom:-22px;margin-left:-10px;border:10px solid transparent;border-top-color:var(--v-gold)}
.lp--vivid .lp-tab-in:nth-of-type(2):checked~.lp-tab-bar>label:nth-child(2){box-shadow:0 0 0 4px #fff,0 0 0 7px var(--v-gold),0 18px 30px -16px rgba(15,23,42,.5);transform:translateY(-2px)}
.lp--vivid .lp-tab-in:nth-of-type(2):checked~.lp-tab-bar>label:nth-child(2)::after{content:"";position:absolute;left:50%;bottom:-22px;margin-left:-10px;border:10px solid transparent;border-top-color:var(--v-gold)}
.lp--vivid .lp-tab-in:nth-of-type(3):checked~.lp-tab-bar>label:nth-child(3){box-shadow:0 0 0 4px #fff,0 0 0 7px var(--v-gold),0 18px 30px -16px rgba(15,23,42,.5);transform:translateY(-2px)}
.lp--vivid .lp-tab-in:nth-of-type(3):checked~.lp-tab-bar>label:nth-child(3)::after{content:"";position:absolute;left:50%;bottom:-22px;margin-left:-10px;border:10px solid transparent;border-top-color:var(--v-gold)}
.lp--vivid .lp-tab-in:nth-of-type(4):checked~.lp-tab-bar>label:nth-child(4){box-shadow:0 0 0 4px #fff,0 0 0 7px var(--v-gold),0 18px 30px -16px rgba(15,23,42,.5);transform:translateY(-2px)}
.lp--vivid .lp-tab-in:nth-of-type(4):checked~.lp-tab-bar>label:nth-child(4)::after{content:"";position:absolute;left:50%;bottom:-22px;margin-left:-10px;border:10px solid transparent;border-top-color:var(--v-gold)}
.lp--vivid .lp-tab-in:nth-of-type(5):checked~.lp-tab-bar>label:nth-child(5){box-shadow:0 0 0 4px #fff,0 0 0 7px var(--v-gold),0 18px 30px -16px rgba(15,23,42,.5);transform:translateY(-2px)}
.lp--vivid .lp-tab-in:nth-of-type(5):checked~.lp-tab-bar>label:nth-child(5)::after{content:"";position:absolute;left:50%;bottom:-22px;margin-left:-10px;border:10px solid transparent;border-top-color:var(--v-gold)}
.lp--vivid .lp-tab-in:nth-of-type(6):checked~.lp-tab-bar>label:nth-child(6){box-shadow:0 0 0 4px #fff,0 0 0 7px var(--v-gold),0 18px 30px -16px rgba(15,23,42,.5);transform:translateY(-2px)}
.lp--vivid .lp-tab-in:nth-of-type(6):checked~.lp-tab-bar>label:nth-child(6)::after{content:"";position:absolute;left:50%;bottom:-22px;margin-left:-10px;border:10px solid transparent;border-top-color:var(--v-gold)}
.lp--vivid .lp-tab-panel{background:#fff;border:1px solid var(--lp-line);border-radius:28px;padding:40px;gap:48px;grid-template-columns:1.1fr 1fr;box-shadow:0 30px 70px -40px rgba(15,23,42,.35)}
.lp--vivid .lp-frame{border-radius:18px}
.lp--vivid .lp-tab-body h3{font-size:clamp(1.5rem,2.8vw,2rem);letter-spacing:-.02em}
.lp--vivid .lp-tab-hook{font-size:1.08rem}
.lp--vivid .lp-tab-sub{text-transform:none;letter-spacing:0;font-size:1rem}
.lp--vivid .lp-tab-more{text-align:center}
/* trước → sau */
.lp--vivid .lp-chg{gap:12px}
.lp--vivid .lp-chg li{border-radius:18px;padding:18px 22px;border:1px solid var(--lp-line)}
.lp--vivid .lp-chg-a{color:#047857}
.lp--vivid .lp-chg em{text-transform:none;letter-spacing:0;font-size:.8rem;font-weight:700}
/* vì sao yên tâm: lưới bento */
.lp--vivid .lp-card{border-radius:22px;padding:28px;gap:12px}
.lp--vivid .lp-card h3{font-size:1.15rem}
.lp--vivid .lp-bento.lp-features .lp-grid.lp-grid{grid-template-columns:1.2fr 1fr 1fr;gap:20px}
/* một buổi học: chuỗi bước (nội dung có thứ tự thật nên đánh số) */
.lp--vivid .lp-steps-list{grid-template-columns:repeat(5,1fr);gap:16px;counter-reset:st}
.lp--vivid .lp-steps-list li{background:#fff;border:1px solid var(--lp-line);border-radius:22px;padding:24px 20px;position:relative;counter-increment:st}
.lp--vivid .lp-steps-list li::after{content:counter(st);position:absolute;top:18px;right:20px;font-weight:800;font-size:1.6rem;color:#e2e8f0;line-height:1}
.lp--vivid .lp-steps-list h3{font-size:1.1rem}
/* sản phẩm: thẻ ảnh + chú thích */
.lp--vivid .lp-photos{gap:20px}
.lp--vivid .lp-photos figure{background:#fff;border:1px solid var(--lp-line);border-radius:20px;overflow:hidden;height:100%}
.lp--vivid .lp-photos img{border-radius:0;aspect-ratio:16/10}
.lp--vivid .lp-photos figcaption{margin:0;padding:12px 14px 14px;color:#0f172a;font-weight:600;font-size:.95rem}
.lp-ph-tag{display:block;font-size:.78rem;font-weight:800;color:#1e40af;margin-bottom:2px}
.lp--vivid .lp-photos li:nth-child(n+3):nth-child(-n+4) .lp-ph-tag{color:#047857}
.lp--vivid .lp-photos li:nth-child(n+5):nth-child(-n+6) .lp-ph-tag{color:#b45309}
.lp--vivid .lp-photos li:nth-child(n+7) .lp-ph-tag{color:#0f172a}
@media (max-width:600px){
 .lp--vivid .lp-photos{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;margin:0 -20px;padding:4px 20px 12px;scrollbar-width:none;overscroll-behavior-x:contain}
 .lp--vivid .lp-photos::-webkit-scrollbar{display:none}
 .lp--vivid .lp-photos>li{flex:0 0 78%;scroll-snap-align:center}
}
.lp--vivid .lp-teacher-photo{border-radius:28px}
.lp--vivid .lp-teacher .lp-head{text-align:center}
/* dải kêu gọi: mảng xanh + quỹ đạo vàng (lặp lại mô-típ đầu trang) */
.lp--vivid .lp-cta{background:var(--v-star) no-repeat 8% 30%/22px,var(--v-star) no-repeat 92% 70%/30px,var(--v-orb) no-repeat 0 0/100% 100%,var(--v-blue);padding:96px 0}
.lp--vivid .lp-cta h2{font-size:clamp(1.8rem,3.8vw,2.7rem);letter-spacing:-.02em}
.lp--vivid .lp-cta .lp-btn-light{background:var(--v-gold);color:#0f172a}
.lp--vivid .lp-cta .lp-btn-light:hover{background:#d97706}
.lp--vivid .lp-cta .lp-checks li::before{color:#fcd34d}
/* hỏi đáp */
.lp--vivid .lp-faq-list{margin:0 auto;max-width:860px;gap:12px}
.lp--vivid .lp-faq{border-radius:16px}
.lp--vivid .lp-faq[open]{border-color:#93c5fd;box-shadow:0 0 0 3px #dbeafe}
/* form cuối trang: nền xanh nhạt, thẻ trắng */
.lp--vivid .lp-bento-pic{grid-row:span 2}
/* dải ảnh sản phẩm thật dưới tiêu đề: thẻ khung trắng, nhãn trắng góc dưới (sản phẩm + phần mềm) */
.lp-show-list{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.lp-show-i figure{margin:0;position:relative;border-radius:20px;overflow:hidden;background:#fff;height:100%}
.lp-show-i img{display:block;width:100%;height:220px;object-fit:cover}
.lp-show-fit img{object-fit:contain;background:#d1fae5;padding:12px 12px 64px}
.lp-show-i figcaption{position:absolute;left:12px;bottom:12px;background:rgba(255,255,255,.96);color:#0f172a;border-radius:12px;padding:6px 12px;line-height:1.3}
.lp-show-i figcaption b{display:block;font-size:.92rem}
.lp-show-i figcaption span{font-size:.78rem;color:#475569;font-weight:600}
.lp--vivid .lp-lead-hero .lp-show{margin-top:48px}
.lp--vivid .lp-show-list{gap:18px}
.lp--vivid .lp-show-i figure{padding:7px;border-radius:24px;box-shadow:0 30px 60px -30px rgba(2,6,23,.55);transition:transform .35s cubic-bezier(.2,.7,.2,1),box-shadow .35s}
.lp--vivid .lp-show-i figure:hover{transform:translateY(-5px);box-shadow:0 40px 70px -30px rgba(2,6,23,.6)}
.lp--vivid .lp-lead-hero .lp-show img{width:100%;aspect-ratio:auto;object-fit:cover;object-position:var(--pos,50% 50%);box-shadow:none;border-radius:18px;height:260px}
.lp--vivid .lp-lead-hero .lp-show .lp-show-fit img{object-fit:contain;object-position:86% 50%;padding:12px 20px;filter:drop-shadow(0 12px 16px rgba(4,120,87,.28))}
.lp--vivid .lp-show-i figcaption{left:18px;bottom:18px;border-left:4px solid var(--v-blue);border-radius:9px 12px 12px 9px;box-shadow:0 8px 20px -10px rgba(15,23,42,.45)}
.lp--vivid .lp-show-i:nth-child(5n+2) figcaption{border-left-color:var(--v-gold)}
.lp--vivid .lp-show-i:nth-child(5n+3) figcaption{border-left-color:var(--v-green)}
.lp--vivid .lp-show-i:nth-child(5n+4) figcaption{border-left-color:var(--v-navy)}
.lp--vivid .lp-show-i:nth-child(5n+5) figcaption{border-left-color:var(--v-green-d)}
/* 5 ảnh: lưới "bento" — ảnh đầu to ở giữa, 4 ảnh nhỏ hai bên */
.lp--vivid .lp-show-list:has(>li:nth-child(5)){grid-template-columns:1fr 1.75fr 1fr;grid-template-rows:200px 200px;grid-template-areas:"a big c" "b big d"}
.lp--vivid .lp-show-list:has(>li:nth-child(5))>li:nth-child(1){grid-area:big}
.lp--vivid .lp-show-list:has(>li:nth-child(5))>li:nth-child(2){grid-area:a}
.lp--vivid .lp-show-list:has(>li:nth-child(5))>li:nth-child(3){grid-area:b}
.lp--vivid .lp-show-list:has(>li:nth-child(5))>li:nth-child(4){grid-area:c}
.lp--vivid .lp-show-list:has(>li:nth-child(5))>li:nth-child(5){grid-area:d}
.lp--vivid .lp-lead-hero .lp-show-list:has(>li:nth-child(5)) img{height:100%}
.lp--vivid .lp-show-list:has(>li:nth-child(5))>li:nth-child(1) figure{padding:9px;border-radius:30px}
.lp--vivid .lp-lead-hero .lp-show-list:has(>li:nth-child(5))>li:nth-child(1) img{border-radius:22px}
.lp--vivid .lp-show-list:has(>li:nth-child(5))>li:nth-child(1) figcaption{left:24px;bottom:24px;padding:9px 16px}
.lp--vivid .lp-show-list:has(>li:nth-child(5))>li:nth-child(1) figcaption b{font-size:1.08rem}
.lp--vivid .lp-show .lp-credit{text-align:center;padding:14px 0 0;color:#64748b}
@media (prefers-reduced-motion:no-preference){.lp--vivid .lp-show-i{animation:lp-rise .8s cubic-bezier(.2,.7,.2,1) both}.lp--vivid .lp-show-i:nth-child(2){animation-delay:.06s}.lp--vivid .lp-show-i:nth-child(3){animation-delay:.12s}.lp--vivid .lp-show-i:nth-child(4){animation-delay:.18s}.lp--vivid .lp-show-i:nth-child(5){animation-delay:.24s}}
@media (max-width:1100px){
 .lp--vivid .lp-show-list{grid-template-columns:1fr 1fr}
 .lp--vivid .lp-show-list:has(>li:nth-child(5)){grid-template-columns:1fr 1fr;grid-template-rows:280px 180px 180px;grid-template-areas:"big big" "a c" "b d"}
 .lp--vivid .lp-lead-hero .lp-show-list:not(:has(>li:nth-child(5))) img{height:230px}
}
@media (max-width:860px){
 .lp--vivid .lp-lead-hero .lp-show{margin:8px -20px 0}
 .lp--vivid .lp-show-list,.lp--vivid .lp-show-list:has(>li:nth-child(5)){display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 20px 14px;scrollbar-width:none;overscroll-behavior-x:contain}
 .lp--vivid .lp-show-list::-webkit-scrollbar{display:none}
 .lp--vivid .lp-show-i{flex:0 0 76%;scroll-snap-align:center}
 .lp--vivid .lp-show-i figure,.lp--vivid .lp-show-list:has(>li:nth-child(5))>li:nth-child(1) figure{padding:6px;border-radius:22px}
 .lp--vivid .lp-lead-hero .lp-show .lp-show-i img,.lp--vivid .lp-lead-hero .lp-show-list:has(>li:nth-child(5)) img{height:210px;border-radius:16px}
 .lp--vivid .lp-show-i figcaption,.lp--vivid .lp-show-list:has(>li:nth-child(5))>li:nth-child(1) figcaption{left:14px;bottom:14px;padding:6px 12px}
 .lp--vivid .lp-show-list:has(>li:nth-child(5))>li:nth-child(1) figcaption b{font-size:.92rem}
 .lp--vivid .lp-show .lp-credit{padding:4px 20px 0}
}
/* buổi học trải nghiệm: nền xanh + quỹ đạo vàng; hành trình 4 bước nối đường vàng; thẻ giá trị trắng, cột đặt lịch navy nổi bật */
.lp--vivid .lp-trial{background:var(--v-star) no-repeat 94% 60px/26px,var(--v-orb) no-repeat 0 0/100% 100%,var(--v-blue);color:#fff}
.lp--vivid .lp-trial .lp-head{max-width:860px}
.lp--vivid .lp-trial .lp-head :is(h1,h2){color:#fff;font-size:clamp(1.9rem,4.2vw,3rem)}
.lp--vivid .lp-trial .lp-hl{color:#fff}
.lp--vivid .lp-trial .lp-head p{color:rgba(255,255,255,.9);font-size:1.15rem;max-width:760px}
.lp--vivid .lp-trial .lp-kicker{background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.25)}
.lp--vivid .lp-trial-steps{grid-template-columns:repeat(4,1fr);gap:20px;position:relative}
.lp--vivid .lp-trial-steps::before{content:"";position:absolute;left:8%;right:8%;top:50px;border-top:3px dashed rgba(245,158,11,.9)}
.lp--vivid .lp-trial-step{flex-direction:column;gap:14px;border:0;border-radius:24px;padding:28px 26px;position:relative;color:#0f172a;box-shadow:0 24px 50px -30px rgba(2,6,23,.6)}
.lp--vivid .lp-trial-no{width:52px;height:52px;font-size:1.3rem;box-shadow:0 0 0 6px #fff}
.lp--vivid .lp-trial-who{display:inline-block;font-size:.82rem;background:#dbeafe;border-radius:999px;padding:3px 10px;margin-bottom:8px!important}
.lp--vivid .lp-trial-step h3{font-size:1.22rem;line-height:1.3}
.lp--vivid .lp-trial-step p:not(.lp-trial-who){font-size:1rem;line-height:1.55}
.lp--vivid .lp-trial-step:nth-child(4){background:#fef3c7;box-shadow:0 0 0 3px var(--v-gold),0 30px 60px -30px rgba(2,6,23,.7)}
.lp--vivid .lp-trial-step:nth-child(4) .lp-trial-who{color:#b45309;background:#fff}
.lp--vivid .lp-trial-card{margin-top:32px;border:0;border-radius:32px;padding:44px;color:#0f172a;box-shadow:0 40px 80px -40px rgba(2,6,23,.7);grid-template-columns:1.35fr 1fr;gap:40px;align-items:stretch}
.lp--vivid .lp-trial-gt{font-size:clamp(1.5rem,2.8vw,2.1rem);letter-spacing:-.02em}
.lp--vivid .lp-trial-gt .lp-hl{color:var(--v-blue)}
.lp--vivid .lp-trial-gains{gap:26px 28px;align-content:center}
.lp--vivid .lp-trial-gains h4{font-size:1.12rem}
.lp--vivid .lp-trial-gains p{font-size:.98rem;line-height:1.55}
.lp--vivid .lp-trial-act{background:var(--v-orb) no-repeat 0 0/220% 100%,#0f172a;color:#fff;border-radius:24px;padding:30px 28px;gap:10px;justify-content:center}
.lp--vivid .lp-trial-who-card{display:flex;gap:14px;align-items:center;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.14);margin-bottom:6px}
.lp--vivid .lp-trial-av{width:64px;height:64px;border-radius:50%;object-fit:cover;object-position:50% 20%;border:3px solid var(--v-gold);flex:none}
.lp--vivid .lp-trial-who-card p{display:flex;flex-direction:column;line-height:1.35}
.lp--vivid .lp-trial-who-card b{font-size:1.05rem}
.lp--vivid .lp-trial-who-card span{font-size:.9rem;color:rgba(255,255,255,.75)}
.lp--vivid .lp-trial-badge{background:rgba(16,185,129,.18);color:#6ee7b7;font-size:1rem;padding:8px 16px}
.lp--vivid .lp-trial-act .lp-btn-primary{min-height:58px;font-size:1.08rem}
@media (max-width:400px){.lp--vivid .lp-trial-act .lp-btn-primary{font-size:.98rem;padding-left:12px;padding-right:12px}}
.lp--vivid .lp-trial-act .lp-btn-ghost{color:#fff;border-color:rgba(255,255,255,.55)}
.lp--vivid .lp-trial-act .lp-btn-ghost:hover{background:rgba(255,255,255,.1)}
.lp--vivid .lp-trial-note{color:rgba(255,255,255,.7);font-size:.88rem}
@media (max-width:1100px){.lp--vivid .lp-trial-steps{grid-template-columns:1fr 1fr}.lp--vivid .lp-trial-steps::before{display:none}.lp--vivid .lp-trial-card{grid-template-columns:1fr;padding:32px}}
@media (max-width:600px){.lp--vivid .lp-trial-steps{grid-template-columns:1fr;gap:12px}.lp--vivid .lp-trial-step{flex-direction:row;padding:20px 18px;gap:14px}.lp--vivid .lp-trial-no{width:44px;height:44px;font-size:1.1rem}.lp--vivid .lp-trial-card{padding:24px 18px;border-radius:24px;gap:24px}.lp--vivid .lp-trial-act{padding:22px 18px}}
/* form cuối trang: tấm navy bo tròn hai cột — bên trái nhắc lại giá trị, bên phải form trắng */
.lp--vivid .lp-form{background:#fff}
.lp--vivid .lp-form .lp-form-in{max-width:1200px;width:calc(100% - 40px);margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;background:var(--v-star) no-repeat 6% 14%/24px,var(--v-orb) no-repeat 0 0/100% 100%,#0f172a;border-radius:32px;padding:56px;color:#fff;background-position:95% 10%,0 0,0 0}
.lp--vivid .lp-form .lp-head.lp-form-side{margin:0;text-align:left;max-width:none}
.lp--vivid .lp-form .lp-head :is(h1,h2){color:#fff;font-size:clamp(1.8rem,3.6vw,2.6rem)}
.lp--vivid .lp-form .lp-hl{color:#fff}
.lp--vivid .lp-form .lp-head p{margin:14px 0 0;color:rgba(255,255,255,.85);max-width:none}
.lp--vivid .lp-form-badge{display:inline-block;background:rgba(245,158,11,.18);color:#fcd34d;font-weight:800;border-radius:999px;padding:7px 16px;font-size:.95rem;margin-bottom:16px!important}
.lp--vivid .lp-form .lp-head p.lp-form-badge{font-size:.95rem;color:#fcd34d;margin-top:0}
@media (max-width:420px){.lp--vivid .lp-form .lp-head p.lp-form-badge{font-size:.82rem;padding:6px 12px}}
.lp--vivid .lp-form .lp-ticks{margin-top:24px;gap:12px}
.lp--vivid .lp-form .lp-ticks li{color:#fff}
.lp--vivid .lp-form .lp-ticks li::before{background:var(--v-gold);color:#0f172a}
.lp-form-call{display:inline-block;margin-top:24px;font-weight:800;color:#fcd34d;text-decoration:none;border-bottom:2px solid rgba(252,211,77,.5)}
.lp-form-call:hover{border-bottom-color:#fcd34d}
.lp--vivid .lp-form .lp-form-card{border:0;border-top:6px solid var(--v-gold);border-radius:24px;color:#0f172a;box-shadow:0 30px 60px -30px rgba(0,0,0,.6)}
@media (max-width:960px){.lp--vivid .lp-form .lp-form-in{grid-template-columns:1fr;padding:36px 28px;gap:28px}}
@media (max-width:600px){.lp--vivid .lp-form .lp-form-in{padding:28px 18px;border-radius:24px;width:calc(100% - 24px);background:var(--v-orb) no-repeat 0 0/100% 100%,#0f172a}}
/* một chuyển động duy nhất: thẻ ảnh đầu trang nổi lên khi tải trang */
.lp--vivid .lp-sec .lp-head,.lp--vivid .lp-ins-list>li,.lp--vivid .lp-grid>li,.lp--vivid .lp-chg>li,.lp--vivid .lp-vs-col,.lp--vivid .lp-steps-list>li,.lp--vivid .lp-photos>li,.lp--vivid .lp-faq-list>details,.lp--vivid .lp-teacher-in>*,.lp--vivid .lp-ins-close{animation:none}
@media (prefers-reduced-motion:no-preference){.lp--vivid .lp-lead-hero .lp-hero-pic:not(.lp-show) img{animation:lp-rise .9s cubic-bezier(.2,.7,.2,1) .15s both}}
@media (max-width:1100px){
 .lp--vivid .lp-tab-bar{grid-template-columns:1fr 1fr}
 .lp--vivid .lp-tabs .lp-tab-bar>label.lp-tab-l::after{content:none!important}
 .lp--vivid .lp-steps-list{grid-template-columns:repeat(3,1fr)}
}
@media (max-width:1000px){.lp--vivid .lp-bento.lp-features .lp-grid.lp-grid{grid-template-columns:1fr 1fr}}
@media (max-width:860px){
 .lp--vivid .lp-sec{padding:64px 0}
 .lp--vivid .lp-wrap{padding:0 20px}
 .lp--vivid .lp-top-in{min-height:62px}
 .lp--vivid .lp-brand img.lp-lockup{width:176px}
 .lp--vivid .lp-head{margin-bottom:36px}
 .lp--vivid .lp-lead-hero{padding:28px 0 0;background:linear-gradient(var(--v-blue),var(--v-blue)) no-repeat 0 0/100% calc(100% - 190px),#fff}
 .lp--vivid .lp-lead-hero .lp-wrap{grid-template-columns:1fr;grid-template-areas:"text" "form" "pic";gap:24px}
 .lp--vivid .lp-lead-hero .lp-hero-text{padding-top:0}
 .lp--vivid .lp-lead-hero .lp-hero-pic{margin:0 -12px}
 .lp--vivid .lp-lead-hero .lp-form-card{padding:22px 18px 18px}
 .lp--vivid .lp-insights.lp-dark{padding-top:40px}
 .lp--vivid .lp-insights.lp-dark .lp-wrap{border-radius:0;padding:56px 20px;margin:0}
 .lp--vivid .lp-tab-bar{gap:10px}
 .lp--vivid .lp-tab-bar label.lp-tab-l{padding:14px;gap:10px;min-height:0;font-size:1rem;border-radius:18px}
 .lp--vivid .lp-tab-ic{width:40px;height:40px;border-radius:12px}
 .lp--vivid .lp-tab-panel{padding:20px;gap:20px;grid-template-columns:1fr;border-radius:22px}
 .lp--vivid .lp-steps-list{grid-template-columns:1fr 1fr}
 .lp--vivid .lp-vs-col{padding:26px 22px}
 .lp--vivid .lp-cta{padding:64px 0}
 .lp--vivid .lp-sticky .lp-btn{min-height:48px;padding:8px 10px;font-size:.92rem;white-space:nowrap}
}
@media (max-width:600px){.lp--vivid .lp-bento.lp-features .lp-grid.lp-grid{grid-template-columns:1fr}.lp--vivid .lp-tab-bar label.lp-tab-l{flex-direction:column;align-items:flex-start;gap:8px}.lp--vivid .lp-tab-ic{width:36px;height:36px;border-radius:10px}.lp--vivid .lp-tab-ic svg{width:22px;height:22px}.lp--vivid .lp-tab-l small{font-size:.8rem}}
@media (max-width:420px){.lp--vivid .lp-steps-list{grid-template-columns:1fr}}
/*@/v*/
`;

export interface StandaloneMeta { title: string; description?: string; image?: string; lang?: string }

/** Tệp HTML độc lập (CSS nhúng sẵn, không script) để đưa lên host khác */
export function renderStandalone(doc: LandingDoc, ctx: RenderCtx, meta: StandaloneMeta): string {
  const body = renderBody(doc, { ...ctx, mode: "export" });
  const og = meta.image && validImage(meta.image) ? (meta.image.startsWith("/") && ctx.baseUrl ? ctx.baseUrl + meta.image : meta.image) : "";
  return `<!doctype html>
<html lang="${escHtml(meta.lang ?? "vi")}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escHtml(meta.title)}</title>
${meta.description ? `<meta name="description" content="${escHtml(meta.description)}" />` : ""}
<meta property="og:title" content="${escHtml(meta.title)}" />
${meta.description ? `<meta property="og:description" content="${escHtml(meta.description)}" />` : ""}
${og ? `<meta property="og:image" content="${escHtml(og)}" />` : ""}
<style>${landingCss(ctx.variant)}body{margin:0}</style>
</head>
<body>
<div class="lp lp--${escHtml(ctx.variant)}" style="${escHtml(paletteStyle(ctx.brand.palette))}">
${body}
</div>
</body>
</html>
`;
}

export function rootClass(variant: LandingVariant): string { return `lp lp--${variant}`; }
