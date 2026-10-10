/**
 * LANDING PAGE THEO KHỐI — mô hình dữ liệu + kiểm tra (thuần, không DOM / React).
 *
 * Một landing = danh sách KHỐI (section) theo thứ tự. Mỗi khối có kiểu (hero, stats, faq…), bật / tắt,
 * các trường chữ / ảnh / liên kết và các danh sách con (thẻ, dòng, câu hỏi…). Định nghĩa trường nằm ở
 * `SECTION_DEFS` — màn quản trị dựng form từ đây, bộ kiểm tra và bộ hiển thị (`render.ts`) cũng đọc từ đây
 * nên thêm một trường chỉ sửa một chỗ.
 *
 * Nguyên tắc an toàn: nội dung chỉ là CHỮ + ẢNH + LIÊN KẾT; không có HTML / script do người dùng nhập.
 * Mọi chuỗi được cắt theo giới hạn, mọi liên kết / ảnh phải qua `validUrl` / `validImage`, hiển thị luôn escape.
 * Xem docs/LANDING-PAGE.md.
 */

export type LFieldType = "text" | "textarea" | "url" | "image";
export interface LField { key: string; label: string; type: LFieldType; max: number; required?: boolean; hint?: string }
export interface LList { key: string; label: string; addLabel: string; max: number; min?: number; fields: LField[]; hint?: string }

export const SECTION_TYPES = ["header", "hero", "stats", "features", "programs", "testimonials", "cta", "steps", "timeline", "gallery", "faq", "form", "text", "footer"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export interface SectionDef {
  type: SectionType;
  label: string;
  desc: string;
  fields: LField[];
  lists: LList[];
  /** Chỉ một khối loại này trong trang */
  single?: boolean;
  /** Cố định vị trí: đầu trang / cuối trang (không kéo đi chỗ khác, không xoá) */
  fixed?: "top" | "bottom";
  /** Nếu danh sách chính (list này) trống thì khối không hiển thị */
  needs?: string;
}

const t = (key: string, label: string, max: number, extra: Partial<LField> = {}): LField => ({ key, label, type: "text", max, ...extra });
const ta = (key: string, label: string, max: number, extra: Partial<LField> = {}): LField => ({ key, label, type: "textarea", max, ...extra });
const u = (key: string, label: string, extra: Partial<LField> = {}): LField => ({ key, label, type: "url", max: 400, ...extra });
const img = (key: string, label: string, extra: Partial<LField> = {}): LField => ({ key, label, type: "image", max: 500, ...extra });

export const SECTION_DEFS: Record<SectionType, SectionDef> = {
  header: {
    type: "header", label: "Đầu trang & menu", single: true, fixed: "top",
    desc: "Logo (lấy từ Nhận diện thương hiệu), menu, số điện thoại và nút kêu gọi.",
    fields: [t("phone", "Số điện thoại", 24, { hint: "Hiện trên đầu trang, bấm để gọi" }), t("ctaLabel", "Chữ nút kêu gọi", 40, { required: true }), u("ctaUrl", "Liên kết nút", { required: true })],
    lists: [{ key: "nav", label: "Menu", addLabel: "Thêm mục menu", max: 6, fields: [t("label", "Tên mục", 30, { required: true }), u("href", "Liên kết (vd #hoi-dap)", { required: true })] }],
  },
  hero: {
    type: "hero", label: "Mở đầu (Hero)", single: true,
    desc: "Tiêu đề lớn, mô tả, hai nút và ảnh. Khối đầu tiên phụ huynh nhìn thấy.",
    fields: [t("eyebrow", "Dòng nhỏ phía trên", 80), t("title", "Tiêu đề lớn", 140, { required: true }), ta("subtitle", "Mô tả ngắn", 400), t("primaryLabel", "Nút chính", 40, { required: true }), u("primaryUrl", "Liên kết nút chính", { required: true }), t("secondaryLabel", "Nút phụ", 40), u("secondaryUrl", "Liên kết nút phụ"), img("image", "Ảnh")],
    lists: [{ key: "badges", label: "Điểm tin cậy (chip)", addLabel: "Thêm điểm", max: 4, fields: [t("text", "Nội dung", 70, { required: true })], hint: "Ví dụ: Lớp tối đa 12 bé · Học thử miễn phí" }],
  },
  stats: {
    type: "stats", label: "Số liệu nổi bật", desc: "Dải 3–6 con số. Chỉ nhập số THẬT; để trống thì khối tự ẩn.",
    fields: [t("title", "Tiêu đề (tuỳ chọn)", 120)],
    lists: [{ key: "items", label: "Số liệu", addLabel: "Thêm số liệu", max: 6, fields: [t("value", "Con số", 20, { required: true, hint: "vd 1.200+, 4,9/5" }), t("label", "Nhãn", 60, { required: true })] }],
    needs: "items",
  },
  features: {
    type: "features", label: "Cam kết / lợi ích", desc: "Thẻ đánh số: vì sao phụ huynh chọn trung tâm.",
    fields: [t("title", "Tiêu đề", 120, { required: true }), ta("intro", "Giới thiệu", 300)],
    lists: [{ key: "items", label: "Thẻ", addLabel: "Thêm thẻ", max: 8, fields: [t("title", "Tiêu đề thẻ", 100, { required: true }), ta("text", "Mô tả", 300)] }],
    needs: "items",
  },
  programs: {
    type: "programs", label: "Chương trình học", desc: "Thẻ chương trình / khoá học với mô tả, mức học phí và liên kết.",
    fields: [t("title", "Tiêu đề", 120, { required: true }), ta("intro", "Giới thiệu", 300)],
    lists: [{ key: "items", label: "Chương trình", addLabel: "Thêm chương trình", max: 6, fields: [t("name", "Tên", 100, { required: true }), t("badge", "Nhãn nhỏ (vd Offline)", 30), ta("text", "Mô tả", 400), t("meta", "Thông tin (độ tuổi, số buổi…)", 120), t("price", "Học phí", 60, { hint: "Chỉ ghi khi đã chốt giá" }), u("url", "Liên kết xem thêm"), t("linkLabel", "Chữ liên kết", 40), img("image", "Ảnh")] }],
    needs: "items",
  },
  testimonials: {
    type: "testimonials", label: "Phản hồi phụ huynh", desc: "Chỉ dùng phản hồi THẬT, đã được phụ huynh đồng ý đăng. Mỗi phản hồi một lần.",
    fields: [t("title", "Tiêu đề", 120, { required: true })],
    lists: [{ key: "items", label: "Phản hồi", addLabel: "Thêm phản hồi", max: 6, fields: [ta("quote", "Nội dung", 400, { required: true }), t("name", "Tên người nói (vd Chị Lan)", 80, { required: true }), t("meta", "Thêm (con học lớp, khu vực)", 80)] }],
    needs: "items",
  },
  cta: {
    type: "cta", label: "Dải kêu gọi", desc: "Băng màu giữa trang: lời mời + nút + vài ý tin cậy.",
    fields: [t("title", "Tiêu đề", 140, { required: true }), ta("text", "Mô tả", 300), t("primaryLabel", "Nút chính", 40, { required: true }), u("primaryUrl", "Liên kết nút chính", { required: true }), t("secondaryLabel", "Nút phụ", 40), u("secondaryUrl", "Liên kết nút phụ", { hint: "vd tel:0900000000 hoặc link Zalo" })],
    lists: [{ key: "points", label: "Ý tin cậy (có dấu ✓)", addLabel: "Thêm ý", max: 6, fields: [t("text", "Nội dung", 80, { required: true })] }],
  },
  steps: {
    type: "steps", label: "Các bước / quy trình", desc: "Ví dụ: Đăng ký → Học thử → Xếp lớp.",
    fields: [t("title", "Tiêu đề", 120, { required: true }), ta("intro", "Giới thiệu", 300)],
    lists: [{ key: "items", label: "Bước", addLabel: "Thêm bước", max: 6, fields: [t("title", "Tên bước", 80, { required: true }), ta("text", "Mô tả", 240)] }],
    needs: "items",
  },
  timeline: {
    type: "timeline", label: "Lịch / mốc thời gian", desc: "Lịch khai giảng, vòng thi, sự kiện.",
    fields: [t("title", "Tiêu đề", 120, { required: true }), ta("intro", "Giới thiệu", 300)],
    lists: [{ key: "items", label: "Mốc", addLabel: "Thêm mốc", max: 10, fields: [t("when", "Thời gian", 60, { required: true }), t("what", "Nội dung", 160, { required: true }), t("where", "Địa điểm", 100)] }],
    needs: "items",
  },
  gallery: {
    type: "gallery", label: "Thư viện ảnh", desc: "Ảnh lớp học, sản phẩm của bé (chỉ ảnh đã được phụ huynh đồng ý).",
    fields: [t("title", "Tiêu đề", 120, { required: true })],
    lists: [{ key: "items", label: "Ảnh", addLabel: "Thêm ảnh", max: 8, fields: [img("image", "Ảnh", { required: true }), t("caption", "Chú thích", 120)] }],
    needs: "items",
  },
  faq: {
    type: "faq", label: "Câu hỏi thường gặp", desc: "Trả lời trước những băn khoăn của phụ huynh.",
    fields: [t("title", "Tiêu đề", 120, { required: true })],
    lists: [{ key: "items", label: "Câu hỏi", addLabel: "Thêm câu hỏi", max: 12, fields: [t("q", "Câu hỏi", 200, { required: true }), ta("a", "Trả lời", 800, { required: true })] }],
    needs: "items",
  },
  form: {
    type: "form", label: "Form đăng ký học thử", desc: "Form gửi thẳng vào CRM (lead), tự gắn nguồn UTM của chiến dịch.",
    fields: [t("title", "Tiêu đề", 120, { required: true }), ta("subtitle", "Mô tả", 300), t("thankYou", "Lời cảm ơn sau khi gửi", 300)],
    lists: [],
  },
  text: {
    type: "text", label: "Đoạn chữ tự do", desc: "Tiêu đề + nội dung (hỗ trợ **đậm**, danh sách “- ”, tiêu đề “## ”) + ảnh.",
    fields: [t("title", "Tiêu đề", 120), ta("body", "Nội dung", 5000, { required: true }), img("image", "Ảnh")],
    lists: [],
  },
  footer: {
    type: "footer", label: "Chân trang", single: true, fixed: "bottom",
    desc: "Địa chỉ cơ sở, liên hệ, liên kết chính sách, thông tin pháp lý.",
    fields: [ta("tagline", "Câu giới thiệu ngắn", 200), t("email", "Email", 120), t("phone", "Điện thoại", 24), ta("legal", "Thông tin pháp lý", 400), t("copyright", "Dòng bản quyền", 120)],
    lists: [
      { key: "addresses", label: "Cơ sở", addLabel: "Thêm cơ sở", max: 4, fields: [t("label", "Tên cơ sở", 60, { required: true }), t("text", "Địa chỉ", 200, { required: true })] },
      { key: "links", label: "Liên kết", addLabel: "Thêm liên kết", max: 12, fields: [t("label", "Tên", 40, { required: true }), u("href", "Liên kết", { required: true })] },
    ],
  },
};

/* ------------------------------------------------------------------ */

export interface LandingSection {
  id: string;
  type: SectionType;
  enabled: boolean;
  data: Record<string, string>;
  lists: Record<string, Record<string, string>[]>;
}
export interface LandingDoc { sections: LandingSection[] }

export const LANDING_VARIANTS = ["classic", "soft", "bold"] as const;
export type LandingVariant = (typeof LANDING_VARIANTS)[number];
export const VARIANT_LABEL: Record<LandingVariant, string> = { classic: "Cổ điển — nền sáng, thẻ bo tròn", soft: "Dịu — nền kem, nhiều khoảng trắng", bold: "Nổi bật — băng màu đậm, chữ lớn" };

export const MAX_SECTIONS = 40;
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const HOME_SLUG = "trang-chu";

export function validSlug(slug: string): string | null {
  if (slug.length < 2 || slug.length > 60) return "Đường dẫn dài 2–60 ký tự";
  if (!SLUG_RE.test(slug)) return "Đường dẫn chỉ gồm chữ thường không dấu, số và dấu gạch ngang";
  return null;
}

/** Liên kết được phép: https, đường dẫn nội bộ, #mốc, tel:, mailto: — không javascript:, data: … */
export function validUrl(v: string): boolean {
  return /^(https:\/\/|\/|#|tel:|mailto:)[^\s"'<>\\]*$/.test(v) && !/^\/\//.test(v);
}
export function validImage(v: string): boolean {
  return /^(\/api\/public\/site-media\/[A-Za-z0-9._-]+|https:\/\/[^\s"'<>\\]+)$/.test(v);
}

export function fieldsOf(def: SectionDef, listKey: string): LField[] {
  return def.lists.find((l) => l.key === listKey)?.fields ?? [];
}

export const cleanText = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "");

function newId(type: string, n: number): string { return `${type}-${n}`; }

/**
 * Đọc dữ liệu lưu (hoặc do người dùng gửi) thành LandingDoc hợp lệ về hình dạng:
 * bỏ khối lạ, cắt chuỗi / danh sách theo giới hạn, mỗi khối `single` chỉ giữ cái đầu,
 * đầu trang luôn ở đầu, chân trang luôn ở cuối. KHÔNG kiểm đủ nội dung — việc đó của `validateLanding`.
 */
export function normalizeLanding(raw: unknown): LandingDoc {
  const arr = raw && typeof raw === "object" && Array.isArray((raw as { sections?: unknown }).sections) ? ((raw as { sections: unknown[] }).sections) : [];
  const seenSingle = new Set<string>();
  const seenId = new Set<string>();
  const out: LandingSection[] = [];
  let n = 0;
  for (const r of arr) {
    if (out.length >= MAX_SECTIONS) break;
    if (!r || typeof r !== "object") continue;
    const s = r as Record<string, unknown>;
    const type = s.type as SectionType;
    const def = SECTION_DEFS[type];
    if (!def) continue;
    if (def.single) { if (seenSingle.has(type)) continue; seenSingle.add(type); }
    n += 1;
    let id = typeof s.id === "string" && /^[a-z0-9-]{1,40}$/.test(s.id) ? s.id : newId(type, n);
    while (seenId.has(id)) { n += 1; id = newId(type, n); }
    seenId.add(id);
    const dataIn = s.data && typeof s.data === "object" ? (s.data as Record<string, unknown>) : {};
    const data: Record<string, string> = {};
    for (const f of def.fields) data[f.key] = cleanText(dataIn[f.key], f.max);
    const listsIn = s.lists && typeof s.lists === "object" ? (s.lists as Record<string, unknown>) : {};
    const lists: Record<string, Record<string, string>[]> = {};
    for (const l of def.lists) {
      const rows = Array.isArray(listsIn[l.key]) ? (listsIn[l.key] as unknown[]) : [];
      lists[l.key] = rows.slice(0, l.max).filter((x) => x && typeof x === "object").map((x) => {
        const row: Record<string, string> = {};
        for (const f of l.fields) row[f.key] = cleanText((x as Record<string, unknown>)[f.key], f.max);
        return row;
      });
    }
    out.push({ id, type, enabled: s.enabled !== false, data, lists });
  }
  const top = out.filter((s) => SECTION_DEFS[s.type].fixed === "top");
  const bottom = out.filter((s) => SECTION_DEFS[s.type].fixed === "bottom");
  const mid = out.filter((s) => !SECTION_DEFS[s.type].fixed);
  return { sections: [...top, ...mid, ...bottom] };
}

/** Khối có được hiển thị không: đang bật và (nếu cần danh sách) danh sách có ít nhất một dòng đủ trường bắt buộc */
export function sectionVisible(s: LandingSection): boolean {
  if (!s.enabled) return false;
  const def = SECTION_DEFS[s.type];
  if (def.needs) return rowsOf(s, def.needs).length > 0;
  return true;
}

/** Các dòng của một danh sách đã đủ trường bắt buộc (dòng thiếu trường bắt buộc bị bỏ khi hiển thị) */
export function rowsOf(s: LandingSection, listKey: string): Record<string, string>[] {
  const def = SECTION_DEFS[s.type];
  const l = def.lists.find((x) => x.key === listKey);
  if (!l) return [];
  return (s.lists[listKey] ?? []).filter((row) => l.fields.every((f) => !f.required || (row[f.key] ?? "").trim() !== ""));
}

const PLACEHOLDER_RE = /(^|[^\d.,])0(\.0{3})+(?!\d)|lorem ipsum|\bxxx+\b|\btodo\b|\bđang cập nhật\b|\[demo\]/i;
const ZERO_STAT_RE = /^\s*0\s*[+%]?\s*$/;

export interface LandingCheck { errors: string[]; warnings: string[] }

/**
 * Kiểm đủ để XUẤT BẢN. `errors` chặn xuất bản; `warnings` chỉ nhắc (vd số liệu còn là 0, chữ giữ chỗ).
 * Lưu nháp thì không cần qua kiểm tra này.
 */
export function validateLanding(doc: LandingDoc, meta: { title: string; slug: string }): LandingCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const slugErr = validSlug(meta.slug);
  if (slugErr) errors.push(slugErr);
  if (meta.title.trim().length < 3) errors.push("Tên trang tối thiểu 3 ký tự");
  const visible = doc.sections.filter(sectionVisible);
  if (!visible.some((s) => s.type === "hero")) errors.push("Cần bật khối Mở đầu (Hero)");
  if (!visible.some((s) => s.type === "form" || s.type === "hero" || s.type === "cta")) errors.push("Trang cần có form hoặc nút kêu gọi để phụ huynh đăng ký");

  for (const s of doc.sections) {
    if (!s.enabled) continue;
    const def = SECTION_DEFS[s.type];
    const where = def.label;
    for (const f of def.fields) checkField(f, s.data[f.key] ?? "", where, errors);
    for (const l of def.lists) {
      const rows = s.lists[l.key] ?? [];
      rows.forEach((row, i) => {
        const filled = l.fields.some((f) => (row[f.key] ?? "") !== "");
        if (!filled) return;
        for (const f of l.fields) checkField(f, row[f.key] ?? "", `${where} › ${l.label} #${i + 1}`, errors);
      });
    }
    if (def.needs && rowsOf(s, def.needs).length === 0) warnings.push(`${where}: chưa có dòng nào đủ nội dung — khối sẽ tự ẩn khi hiển thị`);

    // Cảnh báo chữ giữ chỗ / số liệu 0
    const texts: string[] = [...Object.values(s.data), ...Object.values(s.lists).flatMap((rows) => rows.flatMap((r) => Object.values(r)))];
    if (texts.some((x) => PLACEHOLDER_RE.test(x))) warnings.push(`${where}: còn chữ giữ chỗ (vd [DEMO], 0.000.000đ, “đang cập nhật”, lorem) — nên thay bằng nội dung thật`);
    if (s.type === "stats" && rowsOf(s, "items").some((r) => ZERO_STAT_RE.test(r.value ?? ""))) warnings.push(`${where}: có con số là 0 — hãy nhập số thật hoặc xoá dòng đó`);
  }
  return { errors, warnings };
}

function checkField(f: LField, v: string, where: string, errors: string[]) {
  if (f.required && !v) { errors.push(`${where}: “${f.label}” bắt buộc`); return; }
  if (!v) return;
  if (f.type === "url" && !validUrl(v)) errors.push(`${where}: “${f.label}” phải là https://, đường dẫn /…, #mốc, tel: hoặc mailto:`);
  if (f.type === "image" && !validImage(v)) errors.push(`${where}: “${f.label}” — ảnh phải tải lên từ thư viện ảnh website hoặc là https://`);
}

/** Tạo khối mới rỗng theo định nghĩa (dùng ở màn quản trị) */
export function emptySection(type: SectionType, id: string): LandingSection {
  const def = SECTION_DEFS[type];
  return {
    id, type, enabled: true,
    data: Object.fromEntries(def.fields.map((f) => [f.key, ""])),
    lists: Object.fromEntries(def.lists.map((l) => [l.key, [] as Record<string, string>[]])),
  };
}
